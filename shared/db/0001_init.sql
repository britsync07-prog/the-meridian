-- ============================================================================
-- 0001_init.sql — The Meridian content model
--
-- Design rules:
--   * `clusters` are the published units ("BBC · Guardian · Sky"). They are
--     permanent and their `slug` never changes.
--   * `stories` are raw mentions — one row per (outlet, item). They are the
--     dedup evidence and the attribution record. Never rendered directly.
--   * `story_sources` is the many-to-many between a cluster and its outlets,
--     carrying display rank so the primary (earliest/best) source is first.
--   * 90-day prominence is a *flag*, not a deletion. Rows are never deleted.
--   * D1 bills the rows a query *scans*, not the rows it returns. Every
--     filtered column below has an index, and no statement anywhere in the
--     project may use `SELECT *`.
--   * The index set is load-bearing for the free tier: without the four LSH
--     band indexes the clusterer scans the whole `stories` table on every
--     incoming item and breaches the 5M rows/day read budget immediately.
--
-- Transcribed from `.planning/research/ARCHITECTURE.md` §5 with the Phase 1
-- schema deviations recorded in `docs/adr/0002-d1-no-shard.md`:
--   1. `sources` gains the terms-of-use ledger (`terms_status`,
--      `terms_verified_at`, `terms_url`) — Phase 2 owns the fetch, Phase 1
--      owns the schema, and the terms of use are a launch-blocking legal gate.
--   2. `sources` gains `freshness_sla_hours` — the per-outlet freshness SLA.
--   3. `story_sources` gains `headline` and `url` — `stories` rows are pruned
--      after 30 days, so the outlet list, the headline and the URL must be
--      retained permanently on the join table.
--   4. `edition_clusters` gains `published_at` — the edition index sorts on it.
--   5. `usage_log` and `corrections` are added — the daily free-tier
--      accounting table the audit Worker reads, and the corrections queue.
--   6. `idx_edition_clusters_edition` is added on `(edition_id, published_at)`
--      so the edition front page is an index scan rather than a sort.
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = true;

-- ─────────────────────────────── Reference ──────────────────────────────────

CREATE TABLE editions (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,          -- 'uk' | 'us' | 'au' | 'ca' | 'ie' | 'nz' | 'in' | 'in-hi'
  name         TEXT NOT NULL,                 -- the edition's display label ('United Kingdom')
  country_code TEXT NOT NULL,                 -- ISO-3166-1 alpha-2
  language     TEXT NOT NULL,                 -- 'en' | 'hi'
  timezone     TEXT NOT NULL,                 -- IANA zone
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sections (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,            -- 'politics' | 'business' | ... | 'weather'
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE edition_sections (
  edition_id INTEGER NOT NULL REFERENCES editions(id),
  section_id INTEGER NOT NULL REFERENCES sections(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (edition_id, section_id)
) WITHOUT ROWID;

-- The feed catalogue. `section_prior` is the per-outlet prior used by the
-- section resolver; it is JSON so adding a section does not need a migration.
CREATE TABLE sources (
  id                   INTEGER PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,  -- 'bbc-news'
  name                 TEXT NOT NULL,         -- 'BBC News'
  homepage_url         TEXT NOT NULL,
  feed_url             TEXT NOT NULL,
  country_code         TEXT NOT NULL,         -- outlet's home country
  language             TEXT NOT NULL DEFAULT 'en',
  default_section      TEXT,                  -- prior section slug, if the feed is section-specific
  section_prior        TEXT NOT NULL DEFAULT '{}',  -- JSON: {"politics":0.6,"world":0.3}
  etag                 TEXT,
  last_modified        TEXT,
  last_fetched_at      TEXT,
  last_status          TEXT,                  -- http status of the last real fetch
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  disabled_until       TEXT,                  -- backoff window
  is_active            INTEGER NOT NULL DEFAULT 1,
  freshness_sla_hours  INTEGER NOT NULL DEFAULT 12,  -- how old a feed may get before it is stale
  terms_status         TEXT NOT NULL DEFAULT 'unverified',  -- 'unverified' | 'verified' | 'refused'
  terms_verified_at    TEXT,                  -- ISO-8601 date the publisher's terms were checked
  terms_url            TEXT,                  -- where the publisher publishes its terms
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
-- The fetcher's hot path: "which enabled sources are due?"
CREATE INDEX idx_sources_active ON sources(is_active, disabled_until);
CREATE INDEX idx_sources_country ON sources(country_code);

-- ─────────────────────────────── Taxonomy ───────────────────────────────────

CREATE TABLE topics (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,            -- 'uk-election-2026'
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'topic',   -- 'topic' | 'beat'
  story_count INTEGER NOT NULL DEFAULT 0,     -- denormalised for the thin-page gate
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_topics_kind_count ON topics(kind, story_count);
CREATE INDEX idx_topics_name ON topics(name);

CREATE TABLE entities (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,         -- 'keir-starmer'
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,                -- 'person' | 'org' | 'place' | 'event'
  country_code  TEXT,
  mention_count INTEGER NOT NULL DEFAULT 0,
  story_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entities_count ON entities(story_count);
CREATE INDEX idx_entities_name  ON entities(name);
CREATE INDEX idx_entities_country ON entities(country_code);

-- ────────────────────────────── Content core ────────────────────────────────

-- A published story = one event, however many outlets covered it.
CREATE TABLE clusters (
  id                 INTEGER PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,    -- IMMUTABLE. Derived from id at creation.
  canonical_headline TEXT NOT NULL,           -- the headline we publish (the best member's)
  canonical_excerpt  TEXT,
  primary_section_id INTEGER REFERENCES sections(id),
  section_confidence REAL NOT NULL DEFAULT 0,
  section_method     TEXT NOT NULL DEFAULT 'rules',   -- 'rules' | 'source' | 'ai'
  published_at       TEXT NOT NULL,           -- earliest member's pubDate (ISO-8601 UTC)
  first_seen_at      TEXT NOT NULL,
  last_seen_at       TEXT NOT NULL,
  outlet_count       INTEGER NOT NULL DEFAULT 0,       -- DISTINCT outlets
  mention_count      INTEGER NOT NULL DEFAULT 0,      -- total mentions
  trending_score     REAL NOT NULL DEFAULT 0,
  score_updated_at   TEXT,
  editorial_rank     INTEGER,                 -- editor's picks; NULL = not picked
  is_prominent       INTEGER NOT NULL DEFAULT 1,       -- inside the 90-day window
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Front page / section listing: prominent + newest.
CREATE INDEX idx_clusters_prominent ON clusters(is_prominent, published_at DESC);
-- Section page: one section, newest first.
CREATE INDEX idx_clusters_section ON clusters(primary_section_id, published_at DESC);
-- "Most Covered" ranking.
CREATE INDEX idx_clusters_score ON clusters(trending_score DESC);
-- Editor's picks (partial index: only picked rows are indexed).
CREATE INDEX idx_clusters_editorial ON clusters(editorial_rank) WHERE editorial_rank IS NOT NULL;
-- Daily rescore window.
CREATE INDEX idx_clusters_recent ON clusters(published_at DESC);

-- One row per (outlet, item). The raw evidence of the aggregation.
CREATE TABLE stories (
  id            INTEGER PRIMARY KEY,
  cluster_id    INTEGER NOT NULL REFERENCES clusters(id),
  source_id     INTEGER NOT NULL REFERENCES sources(id),
  external_guid TEXT NOT NULL,               -- the feed's <guid> / <id>
  headline      TEXT NOT NULL,
  excerpt       TEXT,
  url           TEXT NOT NULL,               -- publisher URL (the attribution link)
  slug          TEXT NOT NULL,               -- slug of the ORIGINAL item (never published)
  language      TEXT NOT NULL DEFAULT 'en',
  published_at  TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  simhash       INTEGER NOT NULL,            -- 64-bit headline fingerprint (signed int64; compare
                                            -- with unsigned semantics on the two 32-bit halves)
  band0 INTEGER NOT NULL, band1 INTEGER NOT NULL,
  band2 INTEGER NOT NULL, band3 INTEGER NOT NULL,
  country_code  TEXT NOT NULL,
  is_primary    INTEGER NOT NULL DEFAULT 0,  -- the member whose headline we publish
  UNIQUE (source_id, external_guid)
);
-- The cluster's member list, in display order.
CREATE INDEX idx_stories_cluster ON stories(cluster_id);
-- LSH candidate generation (4 bands -> 4 index lookups).
CREATE INDEX idx_stories_band0 ON stories(band0);
CREATE INDEX idx_stories_band1 ON stories(band1);
CREATE INDEX idx_stories_band2 ON stories(band2);
CREATE INDEX idx_stories_band3 ON stories(band3);
-- "Latest from this outlet", dedupe of re-ingested items.
CREATE INDEX idx_stories_source_pub ON stories(source_id, published_at DESC);
CREATE INDEX idx_stories_published ON stories(published_at DESC);

-- THE MANY-TO-MANY. One row per (cluster, outlet mention).
-- `headline` and `url` live here, not only on `stories`: the raw mention rows
-- are pruned 30 days after the merge window closes, and the outlet list, the
-- headline and the attribution URL are retained permanently.
CREATE TABLE story_sources (
  cluster_id   INTEGER NOT NULL REFERENCES clusters(id),
  story_id     INTEGER NOT NULL REFERENCES stories(id),
  source_id    INTEGER NOT NULL REFERENCES sources(id),
  rank         INTEGER NOT NULL DEFAULT 0,   -- 0 = primary/headline source
  headline     TEXT NOT NULL,                -- the outlet's own headline, retained permanently
  url          TEXT NOT NULL,                -- the attribution link, retained permanently
  published_at TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cluster_id, story_id)
) WITHOUT ROWID;
-- "Which clusters did this outlet cover?" + the member list ordered for display.
-- (The PK already covers cluster_id lookups; this index serves source_id.)
CREATE INDEX idx_story_sources_source ON story_sources(source_id, published_at DESC);
CREATE INDEX idx_story_sources_rank ON story_sources(cluster_id, rank);

-- Which sections a cluster belongs to (usually one; two when it genuinely spans).
CREATE TABLE cluster_sections (
  cluster_id INTEGER NOT NULL REFERENCES clusters(id),
  section_id INTEGER NOT NULL REFERENCES sections(id),
  confidence REAL NOT NULL,
  method     TEXT NOT NULL,                  -- 'rules' | 'source' | 'ai'
  PRIMARY KEY (cluster_id, section_id)
) WITHOUT ROWID;
CREATE INDEX idx_cluster_sections_section ON cluster_sections(section_id, cluster_id);

-- Cross-country flagging: a cluster may appear in several editions.
CREATE TABLE edition_clusters (
  edition_id   INTEGER NOT NULL REFERENCES editions(id),
  cluster_id   INTEGER NOT NULL REFERENCES clusters(id),
  published_at TEXT NOT NULL,                -- mirrors clusters.published_at so the edition index sorts
  reason       TEXT NOT NULL,                -- 'source' | 'entity' | 'gazetteer' | 'wire'
  confidence   REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (edition_id, cluster_id)
) WITHOUT ROWID;
-- The PK (edition_id, cluster_id) already serves "all clusters for an edition".
-- This index serves the reverse direction: "which editions carry this cluster?"
CREATE INDEX idx_edition_clusters_cluster ON edition_clusters(cluster_id);
-- The edition front page: one edition, newest first. Without this the
-- listing sorts every row the edition carries.
CREATE INDEX idx_edition_clusters_edition ON edition_clusters(edition_id, published_at);

CREATE TABLE story_topics (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  weight   REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (story_id, topic_id)
) WITHOUT ROWID;
CREATE INDEX idx_story_topics_topic ON story_topics(topic_id, story_id);

CREATE TABLE story_entities (
  story_id   INTEGER NOT NULL REFERENCES stories(id),
  entity_id  INTEGER NOT NULL REFERENCES entities(id),
  weight     REAL NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, entity_id)
) WITHOUT ROWID;
CREATE INDEX idx_story_entities_entity ON story_entities(entity_id, story_id);

-- ───────────────────────── Digests, media, ops ──────────────────────────────

CREATE TABLE daily_digests (
  id          INTEGER PRIMARY KEY,
  edition_id  INTEGER NOT NULL REFERENCES editions(id),
  digest_date TEXT NOT NULL,                 -- '2026-10-20'
  language    TEXT NOT NULL DEFAULT 'en',
  title       TEXT NOT NULL,
  lead        TEXT,
  body        TEXT NOT NULL,                 -- ORIGINAL generated prose (not headlines)
  headline_ids TEXT NOT NULL,                -- JSON array of cluster ids
  model       TEXT,
  token_count INTEGER,
  status      TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'failed'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (edition_id, digest_date, language)
);
CREATE INDEX idx_digests_date ON daily_digests(digest_date DESC);
CREATE INDEX idx_digests_edition ON daily_digests(edition_id, digest_date DESC);

CREATE TABLE images (
  id           INTEGER PRIMARY KEY,
  story_id     INTEGER REFERENCES stories(id),
  cluster_id   INTEGER REFERENCES clusters(id),
  source_url   TEXT NOT NULL UNIQUE,         -- publisher URL = the dedupe key
  content_hash TEXT NOT NULL,                -- sha256 of the fetched bytes
  r2_key       TEXT,                         -- 'media/2026/10/20/{hash}/hero.webp'
  r2_key_thumb TEXT,                         -- 'media/2026/10/20/{hash}/thumb.webp'
  width        INTEGER, height INTEGER, bytes INTEGER,
  alt_text     TEXT,
  credit       TEXT,                         -- 'Photo: <publisher>' / photographer
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'ready'|'failed'|'skipped'
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_images_story ON images(story_id);
CREATE INDEX idx_images_status ON images(status);

-- Operational log. IMPORTANT: only append on CHANGE, never per poll.
CREATE TABLE feed_fetches (
  id          INTEGER PRIMARY KEY,
  source_id   INTEGER NOT NULL REFERENCES sources(id),
  fetched_at  TEXT NOT NULL,
  http_status INTEGER,
  bytes       INTEGER,
  item_count  INTEGER,
  new_items   INTEGER,
  duration_ms INTEGER,
  error       TEXT
);
CREATE INDEX idx_feed_fetches_source ON feed_fetches(source_id, fetched_at DESC);

CREATE TABLE pipeline_runs (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,                -- 'ingest' | 'finalize'
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT NOT NULL,                -- 'ok' | 'degraded' | 'error'
  items_seen   INTEGER NOT NULL DEFAULT 0,
  items_new    INTEGER NOT NULL DEFAULT 0,
  clusters_new INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);
CREATE INDEX idx_pipeline_runs_started ON pipeline_runs(started_at DESC);

-- Daily free-tier accounting. One row per day, written by the audit Worker
-- (Phase 7). The Worker reads `config/free-tier-limits.json`, so the observed
-- values and the ceilings they are measured against can never drift apart.
CREATE TABLE usage_log (
  id               INTEGER PRIMARY KEY,
  usage_date       TEXT NOT NULL UNIQUE,     -- '2026-10-20'
  workers_requests INTEGER NOT NULL DEFAULT 0,
  workers_cpu_ms   INTEGER NOT NULL DEFAULT 0,
  d1_rows_read     INTEGER NOT NULL DEFAULT 0,
  d1_rows_written  INTEGER NOT NULL DEFAULT 0,
  d1_storage_bytes INTEGER NOT NULL DEFAULT 0,
  kv_reads         INTEGER NOT NULL DEFAULT 0,
  kv_writes        INTEGER NOT NULL DEFAULT 0,
  r2_class_a_ops   INTEGER NOT NULL DEFAULT 0,
  r2_class_b_ops   INTEGER NOT NULL DEFAULT 0,
  r2_storage_bytes INTEGER NOT NULL DEFAULT 0,
  static_files     INTEGER NOT NULL DEFAULT 0,  -- the largest single shard's file count
  ai_neurons       INTEGER NOT NULL DEFAULT 0,
  recorded_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reader error reports and the dated correction notes they produce. A wrongly
-- merged cluster is split, a dated note is published on the affected URL and
-- the corrections log is appended to; this table is the queue and the record.
CREATE TABLE corrections (
  id              INTEGER PRIMARY KEY,
  story_slug      TEXT NOT NULL,             -- the affected story's permanent slug
  reported_at     TEXT NOT NULL,
  report_detail   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'resolved' | 'rejected'
  resolution      TEXT,                      -- what was changed, or why nothing was
  correction_note TEXT,                      -- the dated note published on the URL
  resolved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
