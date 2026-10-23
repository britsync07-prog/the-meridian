-- 0002_story-retention.sql -- forward-only retention contract repair.
--
-- `stories` are disposable raw mentions after the merge window.  The public
-- outlet attribution belongs to the permanent `(cluster_id, source_id)` row.
-- SQLite rebuilds tables to alter primary and foreign keys. D1 runs each
-- migration atomically; explicit BEGIN/COMMIT is rejected by its SQL API.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE stories_next (
  id            INTEGER PRIMARY KEY,
  cluster_id    INTEGER NOT NULL REFERENCES clusters(id),
  source_id     INTEGER NOT NULL REFERENCES sources(id),
  external_guid TEXT NOT NULL,
  headline      TEXT NOT NULL,
  excerpt       TEXT,
  url           TEXT NOT NULL,
  slug          TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'en',
  published_at  TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  simhash_hi    INTEGER NOT NULL,
  simhash_lo    INTEGER NOT NULL,
  band0 INTEGER NOT NULL, band1 INTEGER NOT NULL,
  band2 INTEGER NOT NULL, band3 INTEGER NOT NULL,
  country_code  TEXT NOT NULL,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_id, external_guid)
);

-- SQLite bitwise operations stay in signed int64 space.  Masking after the
-- sign-preserving shift yields the exact unsigned 32-bit words without JS.
INSERT INTO stories_next (
  id, cluster_id, source_id, external_guid, headline, excerpt, url, slug,
  language, published_at, fetched_at, simhash_hi, simhash_lo,
  band0, band1, band2, band3, country_code, is_primary
)
SELECT
  id, cluster_id, source_id, external_guid, headline, excerpt, url, slug,
  language, published_at, fetched_at,
  (simhash >> 32) & 4294967295,
  simhash & 4294967295,
  band0, band1, band2, band3, country_code, is_primary
FROM stories;

CREATE TABLE story_sources_next (
  cluster_id   INTEGER NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  source_id    INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  rank         INTEGER NOT NULL DEFAULT 0,
  headline     TEXT NOT NULL,
  url          TEXT NOT NULL,
  published_at TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cluster_id, source_id)
) WITHOUT ROWID;

-- A source can have more than one raw mention in a cluster.  Preserve one
-- permanent attribution deterministically: lowest display rank, then oldest.
INSERT INTO story_sources_next (
  cluster_id, source_id, rank, headline, url, published_at, created_at
)
SELECT cluster_id, source_id, rank, headline, url, published_at, created_at
FROM (
  SELECT
    cluster_id, source_id, rank, headline, url, published_at, created_at,
    ROW_NUMBER() OVER (
      PARTITION BY cluster_id, source_id
      ORDER BY rank ASC, published_at ASC, story_id ASC
    ) AS attribution_order
  FROM story_sources
)
WHERE attribution_order = 1;

CREATE TABLE story_topics_next (
  story_id INTEGER NOT NULL REFERENCES stories_next(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  weight   REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (story_id, topic_id)
) WITHOUT ROWID;
INSERT INTO story_topics_next (story_id, topic_id, weight)
SELECT story_id, topic_id, weight FROM story_topics;

CREATE TABLE story_entities_next (
  story_id   INTEGER NOT NULL REFERENCES stories_next(id) ON DELETE CASCADE,
  entity_id  INTEGER NOT NULL REFERENCES entities(id),
  weight     REAL NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, entity_id)
) WITHOUT ROWID;
INSERT INTO story_entities_next (story_id, entity_id, weight, is_primary)
SELECT story_id, entity_id, weight, is_primary FROM story_entities;

CREATE TABLE images_next (
  id           INTEGER PRIMARY KEY,
  story_id     INTEGER REFERENCES stories_next(id) ON DELETE CASCADE,
  cluster_id   INTEGER REFERENCES clusters(id),
  source_url   TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  r2_key       TEXT,
  r2_key_thumb TEXT,
  width        INTEGER, height INTEGER, bytes INTEGER,
  alt_text     TEXT,
  credit       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO images_next (
  id, story_id, cluster_id, source_url, content_hash, r2_key, r2_key_thumb,
  width, height, bytes, alt_text, credit, status, error, created_at, updated_at
)
SELECT
  id, story_id, cluster_id, source_url, content_hash, r2_key, r2_key_thumb,
  width, height, bytes, alt_text, credit, status, error, created_at, updated_at
FROM images;

DROP TABLE story_sources;
DROP TABLE story_topics;
DROP TABLE story_entities;
DROP TABLE images;
DROP TABLE stories;

ALTER TABLE stories_next RENAME TO stories;
ALTER TABLE story_sources_next RENAME TO story_sources;
ALTER TABLE story_topics_next RENAME TO story_topics;
ALTER TABLE story_entities_next RENAME TO story_entities;
ALTER TABLE images_next RENAME TO images;

CREATE INDEX idx_stories_cluster ON stories(cluster_id);
CREATE INDEX idx_stories_band0 ON stories(band0);
CREATE INDEX idx_stories_band1 ON stories(band1);
CREATE INDEX idx_stories_band2 ON stories(band2);
CREATE INDEX idx_stories_band3 ON stories(band3);
CREATE INDEX idx_stories_source_pub ON stories(source_id, published_at DESC);
CREATE INDEX idx_stories_published ON stories(published_at DESC);
CREATE INDEX idx_story_sources_source ON story_sources(source_id, published_at DESC);
CREATE INDEX idx_story_sources_rank ON story_sources(cluster_id, rank);
CREATE INDEX idx_story_topics_topic ON story_topics(topic_id, story_id);
CREATE INDEX idx_story_entities_entity ON story_entities(entity_id, story_id);
CREATE INDEX idx_images_story ON images(story_id);
CREATE INDEX idx_images_status ON images(status);
