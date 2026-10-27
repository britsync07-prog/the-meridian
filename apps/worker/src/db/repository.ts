/**
 * THE ONLY MODULE IN THIS REPOSITORY THAT CONTAINS SQL.
 *
 * OPS-14: "All datastore access goes through one repository module with the
 * database identifier held as a configuration value."
 *
 * Two rules make that true rather than aspirational:
 *
 *   * Every statement names its columns explicitly. D1 bills the rows a query
 *     *scans*, not the rows it returns, so a star projection over `stories`
 *     is a 44,000-row read on a table that will hold 44,000 rows a year.
 *   * Every value is bound with `?`. There is no string interpolation into a
 *     statement anywhere, with exactly one deliberate exception: the table
 *     name in `countRows`, which is checked against an allow-list first.
 *
 * The row shapes below mirror the D1 columns exactly. They are the storage
 * shape, not the domain shape: `shared/types.ts` holds the domain contract,
 * and the mapping between the two belongs to the caller (Phase 3's
 * normaliser), not to this module.
 */

import type { MeridianEnv } from './config';
import type { FeedFetchLog, SourceRegistryEntry } from '../../../../shared/types';

/* ───────────────────────────── Row shapes ────────────────────────────────── */

/** One row of `sources` — the feed registry. */
export interface SourceRow {
  id: number;
  slug: string;
  name: string;
  feed_url: string;
  country_code: string;
  language: string;
  etag: string | null;
  last_modified: string | null;
  disabled_until: string | null;
  terms_status: string;
}

/** One row of `clusters` — a published story. */
export interface ClusterRow {
  id: number;
  slug: string;
  canonical_headline: string;
  canonical_excerpt: string | null;
  published_at: string;
  is_prominent: number;
  trending_score: number;
  outlet_count: number;
  editorial_rank: number | null;
}

/** The values needed to update a cluster's trending score and editorial rank (D-12, CUR-07, CUR-10). */
export interface ClusterScoreUpdate {
  clusterId: number;
  trendingScore: number;
  editorialRank: number | null;
  scoreUpdatedAt: string;
}

/** One row of `story_sources` — one outlet's coverage of a cluster. */
export interface StorySourceRow {
  story_id: number;
  source_id: number;
  rank: number;
  headline: string;
  url: string;
  published_at: string;
}

/**
 * One row of `stories` — a raw story mention awaiting clustering (CUR-01).
 *
 * The field names mirror the D1 columns exactly. `external_guid` is the
 * feed's own item identity; `slug` is the original item's slug and is never
 * published. `cluster_id = 0` is the "not yet clustered" sentinel.
 */
export interface StoryRow {
  id: number;
  cluster_id: number;
  source_id: number;
  external_guid: string;
  url: string;
  slug: string;
  headline: string;
  excerpt: string | null;
  published_at: string;
  fetched_at: string;
  simhash_hi: number;
  simhash_lo: number;
  band0: number;
  band1: number;
  band2: number;
  band3: number;
  language: string;
  country_code: string;
  is_primary: number;
}

/** One row of `sections` — the eight broadsheet desks. */
export interface SectionRow {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

/** One row of `editions` — one country's front page. */
export interface EditionRow {
  id: number;
  slug: string;
  name: string;
  country_code: string;
  language: string;
}

/**
 * The LSH fingerprint written onto a story row so a later story can find it.
 *
 * The four 16-bit bands together carry all 64 bits of the SimHash, so the
 * fingerprint is fully recoverable from them. The `simhash` column itself is
 * deliberately left alone: a 64-bit integer cannot round-trip through a JSON
 * number without precision loss (D1 hands back a lossy double, and a strict
 * SQLite binding refuses the value outright), and a fingerprint that is
 * silently truncated is worse than one that is stored in four lossless
 * quarters.
 */
export interface StoryFingerprint {
  band0: number;
  band1: number;
  band2: number;
  band3: number;
}

/** The values a new raw mention needs. */
export interface StoryInsert {
  clusterId: number;
  sourceId: number;
  externalGuid: string;
  headline: string;
  excerpt: string | null;
  url: string;
  slug: string;
  language: string;
  publishedAt: string;
  fetchedAt: string;
  simhash_hi: number;
  simhash_lo: number;
  band0: number;
  band1: number;
  band2: number;
  band3: number;
  countryCode: string;
  isPrimary: boolean;
}

/** The values a normalized raw story needs for bulk insertion (Phase 2 ingest). */
export interface RawStoryInsert {
  sourceId: number;
  externalGuid: string;
  headline: string;
  excerpt: string | null;
  url: string;
  slug: string;
  language: string;
  publishedAt: string;
  fetchedAt: string;
  countryCode: string;
  imageUrl?: string | null;
  imageCredit?: string | null;
  imageContentHash?: string | null;
}

/** One row returned for LSH candidate matching. */
export interface LshCandidateRow {
  id: number;
  cluster_id: number;
  headline: string;
  excerpt: string | null;
  published_at: string;
  simhash_hi: number;
  simhash_lo: number;
  language: string;
  country_code: string;
  is_primary: number;
}

/* ──────────────────────────── The public surface ─────────────────────────── */

export interface Repository {
  /** The enabled sources that are not in a backoff window. */
  listActiveSources(): Promise<SourceRow[]>;
  /** Record one raw mention. */
  insertStory(row: StoryInsert): Promise<void>;
  /** Bulk insert normalized raw stories, ignoring duplicate external GUIDs. */
  batchInsertStories(stories: readonly RawStoryInsert[]): Promise<number>;
  /** The cluster with this slug, or null. */
  findClusterBySlug(slug: string): Promise<ClusterRow | null>;
  /** The outlets that covered a cluster, in display order. */
  listStoriesForCluster(clusterId: number): Promise<StorySourceRow[]>;
  /** The prominent clusters of one edition, newest first. */
  listProminentClusters(editionId: number, limit: number): Promise<ClusterRow[]>;
  /** How many tables the database holds. Used by the verification scripts. */
  countTables(): Promise<number>;
  /** How many rows a named table holds. Used by the verification scripts. */
  countRows(table: string): Promise<number>;
  /** Synchronize the canonical source registry with the database. */
  syncSources(sources: readonly SourceRegistryEntry[]): Promise<void>;
  /** Record a feed fetch operation in the log. */
  recordFeedFetch(log: FeedFetchLog): Promise<void>;
  /** Update health metrics and backoff state for a source. */
  updateSourceHealth(
    sourceId: number,
    update: {
      status?: number;
      error?: string | null;
      consecutiveFailures: number;
      disabledUntil?: string | null;
      lastFetchedAt?: string;
    },
  ): Promise<void>;
  /** Candidate stories matching any of the 4 LSH bands within the publication window. */
  findLshCandidates(
    band0: number,
    band1: number,
    band2: number,
    band3: number,
    sinceIso: string,
    language: string,
  ): Promise<LshCandidateRow[]>;
  /** Update trending scores, editorial ranks, and score timestamps in batches (D-12, CUR-07, CUR-10). */
  batchUpdateTrendingScores(scoreUpdates: readonly ClusterScoreUpdate[]): Promise<void>;
  /** Synchronize taxonomy topics and gazetteer entities into D1 (CUR-11, CUR-15). */
  syncTaxonomyAndEntities(
    topics: readonly { slug: string; name: string }[],
    entities: readonly { slug: string; name: string; entityType: string; countryCode: string | null }[],
  ): Promise<void>;
  /** Assign section, cross-country editions, topics, and entities to a cluster (CUR-11, CUR-13, CUR-14). */
  assignClusterTaxonomy(
    clusterId: number,
    sectionAssignment: { sectionId: number; confidence: number; method: string },
    editionFlags: readonly { editionId: number; publishedAt: string; reason: string; confidence: number }[],
    topicIds: readonly number[],
    entityIds: readonly { entityId: number; isPrimary: boolean }[],
  ): Promise<void>;
  /** Retrieve unclustered stories ordered by published_at ASC (CUR-01). */
  listUnclusteredStories(limit: number): Promise<StoryRow[]>;
  /** Retrieve one raw story by its id, or null. */
  findStoryById(storyId: number): Promise<StoryRow | null>;
  findStoryBySourceAndCluster(sourceId: number, clusterId: number): Promise<StoryRow | null>;
  /** Retrieve one source by its id, or null. */
  findSourceById(sourceId: number): Promise<SourceRow | null>;
  /** The eight broadsheet desks, in display order. */
  listSections(): Promise<SectionRow[]>;
  /** The editions, in display order. */
  listEditions(): Promise<EditionRow[]>;
  /**
   * Candidate stories published inside the merge window, regardless of LSH band.
   *
   * The band lookup (`findLshCandidates`) is an index probe whose recall on
   * paraphrased headlines is near zero — measured in plan 03-05, 0 of 92
   * labelled same-event pairs collide on any of the four 16-bit bands. This
   * query is the time-windowed path that guarantees recall inside the merge
   * window; it is driven by `idx_stories_published` and bounded by the window.
   */
  findRecentCandidateStories(
    sinceIso: string,
    language: string,
    limit: number,
  ): Promise<LshCandidateRow[]>;
  /** Write the LSH fingerprint onto a story row so a later story can find it. */
  updateStoryFingerprint(storyId: number, fingerprint: StoryFingerprint): Promise<void>;
  /** Resolve gazetteer entity slugs to their D1 row ids (CUR-12). */
  findEntityIdsBySlugs(slugs: readonly string[]): Promise<Map<string, number>>;
  /** Resolve topic slugs to their D1 row ids. */
  findTopicIdsBySlugs(slugs: readonly string[]): Promise<Map<string, number>>;
  /** Create a new cluster and link the initial story (CUR-01, CON-15). */
  createClusterWithStory(
    cluster: {
      slug: string;
      canonicalHeadline: string;
      canonicalExcerpt: string | null;
      primarySectionId: number;
      sectionConfidence: number;
      sectionMethod: string;
      publishedAt: string;
      outletCount: number;
      mentionCount: number;
      trendingScore: number;
    },
    storyId: number,
    sourceId: number,
    headline: string,
    url: string,
    publishedAt: string,
  ): Promise<number>;
  /** Add a story to an existing cluster, bumping member counts and updating earliest published_at (CUR-01, CON-15). */
  addStoryToCluster(
    clusterId: number,
    storyId: number,
    sourceId: number,
    headline: string,
    url: string,
    publishedAt: string,
    isPrimary: boolean,
  ): Promise<void>;
  /** Update cluster metadata, canonical text, member counts, score and editorial rank (CUR-01, CON-15, CUR-10). */
  updateClusterCuration(
    clusterId: number,
    updates: {
      canonicalHeadline?: string;
      canonicalExcerpt?: string | null;
      publishedAt: string;
      outletCount: number;
      mentionCount: number;
      trendingScore: number;
      editorialRank: number | null;
      updatedAt?: string;
    },
  ): Promise<void>;
  /** Record an administrative split of a story from an existing cluster into a new cluster with a dated correction (CUR-02, CUR-03, D-18, D-19). */
  recordClusterSplit(
    oldClusterId: number,
    newCluster: {
      slug: string;
      canonicalHeadline: string;
      canonicalExcerpt: string | null;
      publishedAt: string;
      outletCount: number;
      mentionCount: number;
      trendingScore: number;
    },
    storyId: number,
    outletName: string,
    correctionNote: string,
    todayIso: string,
    oldClusterUpdates: {
      promotedStoryId: number;
      canonicalHeadline: string;
      canonicalExcerpt: string | null;
      publishedAt: string;
      outletCount: number;
      mentionCount: number;
      trendingScore: number;
    },
  ): Promise<{ newClusterId: number; correctionId: number }>;
}

/**
 * The tables `countRows` is allowed to count.
 *
 * The table name is the one identifier that cannot be bound as a parameter,
 * so it is checked against this list rather than trusted. The list is the
 * schema's own table set; it cannot be widened at runtime.
 */
export const COUNTABLE_TABLES = [
  'editions',
  'sections',
  'edition_sections',
  'sources',
  'topics',
  'entities',
  'clusters',
  'stories',
  'story_sources',
  'cluster_sections',
  'edition_clusters',
  'story_topics',
  'story_entities',
  'daily_digests',
  'images',
  'feed_fetches',
  'pipeline_runs',
  'usage_log',
  'corrections',
] as const;

/** The names `countRows` accepts. */
export type CountableTable = (typeof COUNTABLE_TABLES)[number];

/**
 * Build a repository bound to one D1 database.
 *
 * The repository holds the binding, not a connection: D1 has no connection to
 * hold, and every statement is a request against the binding.
 */
export function createRepository(env: MeridianEnv): Repository {
  const db = env.DB;
  if (!db) {
    throw new Error('createRepository: the DB binding is missing from the environment.');
  }

  return {
    async listActiveSources(): Promise<SourceRow[]> {
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          `SELECT id, slug, name, feed_url, country_code, language, etag, last_modified, disabled_until, terms_status
             FROM sources
            WHERE is_active = 1
              AND (disabled_until IS NULL OR disabled_until <= ?)`,
        )
        .bind(now)
        .all<SourceRow>();
      return result.results ?? [];
    },

    async insertStory(row: StoryInsert): Promise<void> {
      await db
        .prepare(
          `INSERT INTO stories (
             cluster_id, source_id, external_guid, headline, excerpt, url, slug, language,
             published_at, fetched_at, simhash_hi, simhash_lo, band0, band1, band2, band3, country_code, is_primary
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.clusterId,
          row.sourceId,
          row.externalGuid,
          row.headline,
          row.excerpt,
          row.url,
          row.slug,
          row.language,
          row.publishedAt,
          row.fetchedAt,
          row.simhash_hi,
          row.simhash_lo,
          row.band0,
          row.band1,
          row.band2,
          row.band3,
          row.countryCode,
          row.isPrimary ? 1 : 0,
        )
        .run();
    },

    async batchInsertStories(stories: readonly RawStoryInsert[]): Promise<number> {
      if (stories.length === 0) return 0;

      const statement = db.prepare(
        `INSERT INTO stories (
           cluster_id, source_id, external_guid, headline, excerpt, url, slug, language,
           published_at, fetched_at, simhash_hi, simhash_lo, band0, band1, band2, band3, country_code, is_primary
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      );

      const CHUNK_SIZE = 50;
      let totalInserted = 0;

      for (let i = 0; i < stories.length; i += CHUNK_SIZE) {
        const chunk = stories.slice(i, i + CHUNK_SIZE);
        const batch = chunk.map((story) =>
          statement.bind(
            0,
            story.sourceId,
            story.externalGuid,
            story.headline,
            story.excerpt,
            story.url,
            story.slug,
            story.language,
            story.publishedAt,
            story.fetchedAt,
            0,
            0,
            0,
            0,
            0,
            0,
            story.countryCode,
            0,
          ),
        );

        const results = await db.batch(batch);
        for (const res of results) {
          const changes = (res as any)?.meta?.changes ?? (res as any)?.changes;
          if (typeof changes === 'number') {
            totalInserted += changes;
          } else {
            totalInserted += 1;
          }
        }
      }

      for (const story of stories) {
        if (!story.imageUrl || !story.imageContentHash) continue;
        const inserted = await db
          .prepare('SELECT id FROM stories WHERE source_id = ? AND external_guid = ?')
          .bind(story.sourceId, story.externalGuid)
          .first<{ id: number }>();
        if (!inserted) continue;
        await db
          .prepare(
            `INSERT INTO images (story_id, source_url, content_hash, credit, status)
             VALUES (?, ?, ?, ?, 'pending')
             ON CONFLICT(source_url) DO NOTHING`,
          )
          .bind(inserted.id, story.imageUrl, story.imageContentHash, story.imageCredit ?? null)
          .run();
      }

      return totalInserted;
    },

    async findClusterBySlug(slug: string): Promise<ClusterRow | null> {
      const row = await db
        .prepare(
          `SELECT id, slug, canonical_headline, canonical_excerpt, published_at, is_prominent, trending_score, outlet_count, editorial_rank
             FROM clusters
            WHERE slug = ?`,
        )
        .bind(slug)
        .first<ClusterRow>();
      return row ?? null;
    },

    async listStoriesForCluster(clusterId: number): Promise<StorySourceRow[]> {
      const result = await db
        .prepare(
          `SELECT source_id, rank, headline, url, published_at
             FROM story_sources
            WHERE cluster_id = ?
            ORDER BY rank ASC`,
        )
        .bind(clusterId)
        .all<StorySourceRow>();
      return result.results ?? [];
    },

    async listProminentClusters(editionId: number, limit: number): Promise<ClusterRow[]> {
      // Driven by `idx_clusters_prominent` (is_prominent, published_at DESC):
      // the outer query is an index scan of the prominent set in date order,
      // and the subquery is served by `idx_edition_clusters_edition`.
      const result = await db
        .prepare(
          `SELECT id, slug, canonical_headline, canonical_excerpt, published_at, is_prominent, trending_score, outlet_count, editorial_rank
             FROM clusters
            WHERE is_prominent = 1
              AND id IN (SELECT cluster_id FROM edition_clusters WHERE edition_id = ?)
            ORDER BY published_at DESC
            LIMIT ?`,
        )
        .bind(editionId, limit)
        .all<ClusterRow>();
      return result.results ?? [];
    },

    async countTables(): Promise<number> {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS n
             FROM sqlite_master
            WHERE type = 'table'
              AND name NOT GLOB 'sqlite_*'
              AND name NOT GLOB '_cf_*'
              AND name <> 'd1_migrations'`,
        )
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async countRows(table: string): Promise<number> {
      if (!COUNTABLE_TABLES.includes(table as CountableTable)) {
        throw new Error(
          `countRows: "${table}" is not on the allow-list of countable tables. ` +
            `Allowed: ${COUNTABLE_TABLES.join(', ')}.`,
        );
      }
      const row = await db
        .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async syncSources(sources: readonly SourceRegistryEntry[]): Promise<void> {
      // The registry is authoritative; retired feeds must never be polled.
      await db.prepare('UPDATE sources SET is_active = 0').run();

      const statement = db.prepare(
        `INSERT INTO sources (
           slug, name, homepage_url, feed_url, country_code, language,
           default_section, section_prior, freshness_sla_hours, is_active,
           terms_status, terms_verified_at, terms_url
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           homepage_url = excluded.homepage_url,
           feed_url = excluded.feed_url,
           country_code = excluded.country_code,
           language = excluded.language,
           default_section = excluded.default_section,
           section_prior = excluded.section_prior,
           freshness_sla_hours = excluded.freshness_sla_hours,
           is_active = excluded.is_active,
           terms_status = excluded.terms_status,
           terms_verified_at = excluded.terms_verified_at,
           terms_url = excluded.terms_url`,
      );

      const batch = sources.map((s) =>
        statement.bind(
          s.slug,
          s.name,
          s.homepageUrl,
          s.feedUrl,
          s.countryCode,
          s.language,
          s.defaultSection ?? null,
          JSON.stringify(s.sectionPrior ?? {}),
          s.freshnessSlaHours,
          s.isActive ? 1 : 0,
          s.termsStatus,
          s.termsVerifiedAt,
          s.termsUrl,
        ),
      );

      if (batch.length > 0) {
        await db.batch(batch);
      }
    },

    async recordFeedFetch(log: FeedFetchLog): Promise<void> {
      await db
        .prepare(
          `INSERT INTO feed_fetches (
             source_id, fetched_at, http_status, bytes, item_count, new_items, duration_ms, error
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          log.sourceId,
          log.fetchedAt,
          log.httpStatus,
          log.bytes,
          log.itemCount,
          log.newItems,
          log.durationMs,
          log.error,
        )
        .run();
    },

    async updateSourceHealth(
      sourceId: number,
      update: {
        status?: number;
        error?: string | null;
        consecutiveFailures: number;
        disabledUntil?: string | null;
        lastFetchedAt?: string;
      },
    ): Promise<void> {
      await db
        .prepare(
          `UPDATE sources
              SET last_status = ?,
                  last_fetched_at = ?,
                  consecutive_failures = ?,
                  disabled_until = ?
            WHERE id = ?`,
        )
        .bind(
          update.status !== undefined ? String(update.status) : null,
          update.lastFetchedAt ?? new Date().toISOString(),
          update.consecutiveFailures,
          update.disabledUntil ?? null,
          sourceId,
        )
        .run();
    },

    async findLshCandidates(
      band0: number,
      band1: number,
      band2: number,
      band3: number,
      sinceIso: string,
      language: string,
    ): Promise<LshCandidateRow[]> {
      const result = await db
        .prepare(
          `SELECT id, cluster_id, headline, excerpt, published_at, simhash_hi, simhash_lo, language, country_code, is_primary
             FROM stories
            WHERE published_at >= ?
              AND language = ?
              AND (band0 = ? OR band1 = ? OR band2 = ? OR band3 = ?)
            ORDER BY published_at DESC
            LIMIT 50`,
        )
        .bind(sinceIso, language, band0, band1, band2, band3)
        .all<LshCandidateRow>();
      return result.results ?? [];
    },

    async batchUpdateTrendingScores(
      scoreUpdates: readonly ClusterScoreUpdate[],
    ): Promise<void> {
      if (scoreUpdates.length === 0) return;

      const statement = db.prepare(
        `UPDATE clusters
            SET trending_score = ?,
                editorial_rank = ?,
                score_updated_at = ?
          WHERE id = ?`,
      );

      const CHUNK_SIZE = 50;
      for (let i = 0; i < scoreUpdates.length; i += CHUNK_SIZE) {
        const chunk = scoreUpdates.slice(i, i + CHUNK_SIZE);
        const batch = chunk.map((update) =>
          statement.bind(
            update.trendingScore,
            update.editorialRank,
            update.scoreUpdatedAt,
            update.clusterId,
          ),
        );
        await db.batch(batch);
      }
    },

    async syncTaxonomyAndEntities(
      topics: readonly { slug: string; name: string }[],
      entities: readonly { slug: string; name: string; entityType: string; countryCode: string | null }[],
    ): Promise<void> {
      const statements: unknown[] = [];

      const topicStmt = db.prepare(
        `INSERT INTO topics (
           slug, name, kind
         ) VALUES (?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name`,
      );
      for (const topic of topics) {
        statements.push(topicStmt.bind(topic.slug, topic.name, 'topic'));
      }

      const entityStmt = db.prepare(
        `INSERT INTO entities (
           slug, name, type, country_code
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           country_code = excluded.country_code`,
      );
      for (const entity of entities) {
        statements.push(
          entityStmt.bind(
            entity.slug,
            entity.name,
            entity.entityType,
            entity.countryCode,
          ),
        );
      }

      const CHUNK_SIZE = 50;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        const chunk = statements.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk as any);
      }
    },

    async assignClusterTaxonomy(
      clusterId: number,
      sectionAssignment: { sectionId: number; confidence: number; method: string },
      editionFlags: readonly { editionId: number; publishedAt: string; reason: string; confidence: number }[],
      topicIds: readonly number[],
      entityIds: readonly { entityId: number; isPrimary: boolean }[],
    ): Promise<void> {
      const statements: unknown[] = [];

      // 1. Update cluster desk assignment & audit logging
      statements.push(
        db
          .prepare(
            `UPDATE clusters
                SET primary_section_id = ?,
                    section_confidence = ?,
                    section_method = ?
              WHERE id = ?`,
          )
          .bind(
            sectionAssignment.sectionId,
            sectionAssignment.confidence,
            sectionAssignment.method,
            clusterId,
          ),
      );

      // 2. Insert or update cluster_sections
      statements.push(
        db
          .prepare(
            `INSERT INTO cluster_sections (
               cluster_id, section_id, confidence, method
             ) VALUES (?, ?, ?, ?)
             ON CONFLICT(cluster_id, section_id) DO UPDATE SET
               confidence = excluded.confidence,
               method = excluded.method`,
          )
          .bind(
            clusterId,
            sectionAssignment.sectionId,
            sectionAssignment.confidence,
            sectionAssignment.method,
          ),
      );

      // 3. Insert or update edition_clusters
      const editionStmt = db.prepare(
        `INSERT INTO edition_clusters (
           edition_id, cluster_id, published_at, reason, confidence
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(edition_id, cluster_id) DO UPDATE SET
           published_at = excluded.published_at,
           reason = excluded.reason,
           confidence = excluded.confidence`,
      );
      for (const flag of editionFlags) {
        statements.push(
          editionStmt.bind(
            flag.editionId,
            clusterId,
            flag.publishedAt,
            flag.reason,
            flag.confidence,
          ),
        );
      }

      // 4. Insert or update story_topics.
      //    `story_topics.story_id` references `stories(id)`, so the join rows
      //    are written for every member story of the cluster — a cluster id is
      //    not a story id. The `WHERE true` keeps SQLite's parser from
      //    reading the trailing ON CONFLICT as part of the SELECT.
      const topicStmt = db.prepare(
        `INSERT INTO story_topics (
           story_id, topic_id, weight
         )
         SELECT id, ?, ? FROM stories WHERE true AND cluster_id = ?
         ON CONFLICT(story_id, topic_id) DO UPDATE SET
           weight = excluded.weight`,
      );
      for (const topicId of topicIds) {
        statements.push(topicStmt.bind(topicId, 1.0, clusterId));
      }

      // 5. Insert or update story_entities
      const entityStmt = db.prepare(
        `INSERT INTO story_entities (
           story_id, entity_id, weight, is_primary
         )
         SELECT id, ?, ?, ? FROM stories WHERE true AND cluster_id = ?
         ON CONFLICT(story_id, entity_id) DO UPDATE SET
           weight = excluded.weight,
           is_primary = excluded.is_primary`,
      );
      for (const ent of entityIds) {
        statements.push(
          entityStmt.bind(
            ent.entityId,
            1.0,
            ent.isPrimary ? 1 : 0,
            clusterId,
          ),
        );
      }

      const CHUNK_SIZE = 50;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        const chunk = statements.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk as any);
      }
    },

    async listUnclusteredStories(limit: number): Promise<StoryRow[]> {
      const rows = await db
        .prepare(
          `SELECT id, cluster_id, source_id, external_guid, url, slug,
                  headline, excerpt, published_at, fetched_at,
                  simhash_hi, simhash_lo, band0, band1, band2, band3,
                  language, country_code, is_primary
             FROM stories
            WHERE cluster_id = 0
            ORDER BY published_at ASC
            LIMIT ?`,
        )
        .bind(limit)
        .all<StoryRow>();
      return rows.results ?? [];
    },

    async findStoryById(storyId: number): Promise<StoryRow | null> {
      const row = await db
        .prepare(
          `SELECT id, cluster_id, source_id, external_guid, url, slug,
                  headline, excerpt, published_at, fetched_at,
                  simhash_hi, simhash_lo, band0, band1, band2, band3,
                  language, country_code, is_primary
             FROM stories
            WHERE id = ?`,
        )
        .bind(storyId)
        .first<StoryRow>();
      return row ?? null;
    },

    async findStoryBySourceAndCluster(sourceId: number, clusterId: number): Promise<StoryRow | null> {
      const row = await db
        .prepare(
          `SELECT id, cluster_id, source_id, external_guid, url, slug,
                  headline, excerpt, published_at, fetched_at,
                  simhash_hi, simhash_lo, band0, band1, band2, band3,
                  language, country_code, is_primary
             FROM stories
            WHERE source_id = ? AND cluster_id = ?
            LIMIT 1`,
        )
        .bind(sourceId, clusterId)
        .first<StoryRow>();
      return row ?? null;
    },

    async findSourceById(sourceId: number): Promise<SourceRow | null> {
      const row = await db
        .prepare(
          `SELECT id, slug, name, feed_url, country_code, language,
                  etag, last_modified, disabled_until, terms_status
             FROM sources
            WHERE id = ?`,
        )
        .bind(sourceId)
        .first<SourceRow>();
      return row ?? null;
    },

    async listSections(): Promise<SectionRow[]> {
      const result = await db
        .prepare(
          `SELECT id, slug, name, sort_order
             FROM sections
            ORDER BY sort_order ASC`,
        )
        .all<SectionRow>();
      return result.results ?? [];
    },

    async listEditions(): Promise<EditionRow[]> {
      const result = await db
        .prepare(
          `SELECT id, slug, name, country_code, language
             FROM editions
            ORDER BY sort_order ASC`,
        )
        .all<EditionRow>();
      return result.results ?? [];
    },

    async findRecentCandidateStories(
      sinceIso: string,
      language: string,
      limit: number,
    ): Promise<LshCandidateRow[]> {
      // Driven by `idx_stories_published` (published_at DESC): the window
      // bounds the scan to the merge window's worth of rows, not the table.
      const result = await db
        .prepare(
          `SELECT id, cluster_id, headline, excerpt, published_at, simhash_hi, simhash_lo, language, country_code, is_primary
             FROM stories
            WHERE published_at >= ?
              AND language = ?
            ORDER BY published_at DESC
            LIMIT ?`,
        )
        .bind(sinceIso, language, limit)
        .all<LshCandidateRow>();
      return result.results ?? [];
    },

    async updateStoryFingerprint(
      storyId: number,
      fingerprint: StoryFingerprint,
    ): Promise<void> {
      await db
        .prepare(
          `UPDATE stories
              SET band0 = ?,
                  band1 = ?,
                  band2 = ?,
                  band3 = ?
            WHERE id = ?`,
        )
        .bind(
          fingerprint.band0,
          fingerprint.band1,
          fingerprint.band2,
          fingerprint.band3,
          storyId,
        )
        .run();
    },

    async findEntityIdsBySlugs(slugs: readonly string[]): Promise<Map<string, number>> {
      const resolved = new Map<string, number>();
      if (slugs.length === 0) return resolved;

      // The IN list is built from placeholders only; no value is interpolated.
      const placeholders = slugs.map(() => '?').join(', ');
      const rows = await db
        .prepare(
          `SELECT id, slug
             FROM entities
            WHERE slug IN (${placeholders})`,
        )
        .bind(...slugs)
        .all<{ id: number; slug: string }>();

      for (const row of rows.results ?? []) {
        resolved.set(row.slug, row.id);
      }
      return resolved;
    },

    async findTopicIdsBySlugs(slugs: readonly string[]): Promise<Map<string, number>> {
      const resolved = new Map<string, number>();
      if (slugs.length === 0) return resolved;
      const placeholders = slugs.map(() => '?').join(', ');
      const rows = await db
        .prepare(`SELECT id, slug FROM topics WHERE slug IN (${placeholders})`)
        .bind(...slugs)
        .all<{ id: number; slug: string }>();
      for (const row of rows.results ?? []) resolved.set(row.slug, row.id);
      return resolved;
    },

    async createClusterWithStory(
      cluster: {
        slug: string;
        canonicalHeadline: string;
        canonicalExcerpt: string | null;
        primarySectionId: number;
        sectionConfidence: number;
        sectionMethod: string;
        publishedAt: string;
        outletCount: number;
        mentionCount: number;
        trendingScore: number;
      },
      storyId: number,
      sourceId: number,
      headline: string,
      url: string,
      publishedAt: string,
    ): Promise<number> {
      // 1. Insert cluster
      const clusterResult = await db
        .prepare(
          `INSERT INTO clusters (
             slug, canonical_headline, canonical_excerpt, primary_section_id,
             section_confidence, section_method, published_at, first_seen_at, last_seen_at,
             outlet_count, mention_count, trending_score
           ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)`,
        )
        .bind(
          cluster.slug,
          cluster.canonicalHeadline,
          cluster.canonicalExcerpt,
          cluster.primarySectionId,
          cluster.sectionConfidence,
          cluster.sectionMethod,
          cluster.publishedAt,
          cluster.outletCount,
          cluster.mentionCount,
          cluster.trendingScore,
        )
        .run();

      const newClusterId = Number(clusterResult.meta.last_row_id);

      // 2. Link story and insert story_sources
      await db.batch([
        db
          .prepare(
            `UPDATE stories
                SET cluster_id = ?,
                    is_primary = 1
              WHERE id = ?`,
          )
          .bind(newClusterId, storyId),
        db
          .prepare(
            `INSERT INTO story_sources (
               cluster_id, source_id, rank, headline, url, published_at
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(cluster_id, source_id) DO UPDATE SET
               rank = excluded.rank,
               headline = excluded.headline,
               url = excluded.url`,
          )
          .bind(newClusterId, sourceId, 0, headline, url, publishedAt),
      ]);

      return newClusterId;
    },

    async addStoryToCluster(
      clusterId: number,
      storyId: number,
      sourceId: number,
      headline: string,
      url: string,
      publishedAt: string,
      isPrimary: boolean,
    ): Promise<void> {
      await db.batch([
        db
          .prepare(
            `UPDATE stories
                SET cluster_id = ?,
                    is_primary = ?
              WHERE id = ?`,
          )
          .bind(clusterId, isPrimary ? 1 : 0, storyId),
        db
          .prepare(
            `INSERT INTO story_sources (
               cluster_id, source_id, rank, headline, url, published_at
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(cluster_id, source_id) DO UPDATE SET
               headline = excluded.headline,
               url = excluded.url,
               published_at = excluded.published_at`,
          )
          .bind(clusterId, sourceId, 0, headline, url, publishedAt),
        // CON-15: the cluster's publication time is the EARLIEST member's, so
        // adding a member can only ever pull it backwards. The counts are
        // recomputed from `story_sources`, which is the member list of record.
        db
          .prepare(
            `UPDATE clusters
                SET outlet_count = (
                      SELECT COUNT(DISTINCT source_id) FROM story_sources WHERE cluster_id = ?
                    ),
                    mention_count = (
                      SELECT COUNT(*) FROM story_sources WHERE cluster_id = ?
                    ),
                    published_at = MIN(published_at, ?),
                    last_seen_at = datetime('now'),
                    updated_at = datetime('now')
              WHERE id = ?`,
          )
          .bind(clusterId, clusterId, publishedAt, clusterId),
      ]);
    },

    async updateClusterCuration(
      clusterId: number,
      updates: {
        canonicalHeadline?: string;
        canonicalExcerpt?: string | null;
        publishedAt: string;
        outletCount: number;
        mentionCount: number;
        trendingScore: number;
        editorialRank: number | null;
        updatedAt?: string;
      },
    ): Promise<void> {
      await db
        .prepare(
          `UPDATE clusters
              SET canonical_headline = COALESCE(?, canonical_headline),
                  canonical_excerpt = COALESCE(?, canonical_excerpt),
                  published_at = MIN(published_at, ?),
                  outlet_count = ?,
                  mention_count = ?,
                  trending_score = ?,
                  editorial_rank = ?,
                  last_seen_at = datetime('now'),
                  updated_at = COALESCE(?, datetime('now'))
            WHERE id = ?`,
        )
        .bind(
          updates.canonicalHeadline ?? null,
          updates.canonicalExcerpt ?? null,
          updates.publishedAt,
          updates.outletCount,
          updates.mentionCount,
          updates.trendingScore,
          updates.editorialRank,
          updates.updatedAt ?? null,
          clusterId,
        )
        .run();
    },

    async recordClusterSplit(
      oldClusterId: number,
      newCluster: {
        slug: string;
        canonicalHeadline: string;
        canonicalExcerpt: string | null;
        publishedAt: string;
        outletCount: number;
        mentionCount: number;
        trendingScore: number;
      },
      storyId: number,
      outletName: string,
      correctionNote: string,
      todayIso: string,
      oldClusterUpdates: {
        promotedStoryId: number;
        canonicalHeadline: string;
        canonicalExcerpt: string | null;
        publishedAt: string;
        outletCount: number;
        mentionCount: number;
        trendingScore: number;
      },
    ): Promise<{ newClusterId: number; correctionId: number }> {
      // 1. Fetch old cluster (slug + desk assignment) and the detached story
      const oldCluster = await db
        .prepare(
          `SELECT slug, primary_section_id, section_confidence, section_method
             FROM clusters
            WHERE id = ?`,
        )
        .bind(oldClusterId)
        .first<{
          slug: string;
          primary_section_id: number | null;
          section_confidence: number;
          section_method: string;
        }>();

      const story = await db
        .prepare(
          `SELECT id, source_id, headline, url, published_at, excerpt
             FROM stories
            WHERE id = ?`,
        )
        .bind(storyId)
        .first<{
          id: number;
          source_id: number;
          headline: string;
          url: string;
          published_at: string;
          excerpt: string | null;
        }>();

      if (!oldCluster || !story) {
        throw new Error(`Cluster ${oldClusterId} or Story ${storyId} not found`);
      }

      // 2. Insert the new cluster. The desk assignment is inherited from the
      //    cluster the story came out of: a split never re-classifies a story,
      //    it only separates it from the wrong neighbours.
      const newClusterRes = await db
        .prepare(
          `INSERT INTO clusters (
             slug, canonical_headline, canonical_excerpt, primary_section_id,
             section_confidence, section_method, published_at, first_seen_at, last_seen_at,
             outlet_count, mention_count, trending_score
           ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)`,
        )
        .bind(
          newCluster.slug,
          newCluster.canonicalHeadline,
          newCluster.canonicalExcerpt,
          oldCluster.primary_section_id,
          oldCluster.section_confidence,
          oldCluster.section_method,
          newCluster.publishedAt,
          newCluster.outletCount,
          newCluster.mentionCount,
          newCluster.trendingScore,
        )
        .run();

      const newClusterId = Number(newClusterRes.meta.last_row_id);

      // 3. Move the story, migrate its attribution row, and promote a new
      //    primary on the old cluster so the published headline still has an
      //    owner. `story_sources` is the member list of record: the detached
      //    story's row moves across, nothing is lost (CUR-02).
      await db.batch([
        db
          .prepare(
            `UPDATE stories
                SET cluster_id = ?,
                    is_primary = 1
              WHERE id = ?`,
          )
          .bind(newClusterId, storyId),
        db
          .prepare(
            `DELETE FROM story_sources
              WHERE cluster_id = ? AND source_id = ?`,
          )
          .bind(oldClusterId, story.source_id),
        db
          .prepare(
            `INSERT INTO story_sources (
               cluster_id, source_id, rank, headline, url, published_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newClusterId,
            story.source_id,
            0,
            story.headline,
            story.url,
            story.published_at,
          ),
        db
          .prepare(
            `UPDATE stories
                SET is_primary = 0
              WHERE cluster_id = ?`,
          )
          .bind(oldClusterId),
        db
          .prepare(
            `UPDATE stories
                SET is_primary = 1
              WHERE id = ?`,
          )
          .bind(oldClusterUpdates.promotedStoryId),
        // Re-rank the remaining members: rank 0 is the primary source, and the
        // rest follow in publication order.
        db
          .prepare(
            `UPDATE story_sources
                SET rank = (
                      SELECT COUNT(*) - 1
                        FROM story_sources AS earlier
                       WHERE earlier.cluster_id = story_sources.cluster_id
                         AND (
                              earlier.published_at < story_sources.published_at
                              OR (
                                   earlier.published_at = story_sources.published_at
                                   AND earlier.source_id <= story_sources.source_id
                                 )
                            )
                    )
              WHERE cluster_id = ?`,
          )
          .bind(oldClusterId),
      ]);

      // 4. Recalculate the old cluster's metrics from what is left of it.
      //    The counts and the publication time come from the surviving member
      //    rows; the canonical text and the score come from the caller, which
      //    owns the ranking rules. A cluster that drops below two distinct
      //    outlets loses its Editor's Picks rank (CUR-10).
      await db
        .prepare(
          `UPDATE clusters
              SET canonical_headline = COALESCE(?, canonical_headline),
                  canonical_excerpt = COALESCE(?, canonical_excerpt),
                  outlet_count = ?,
                  mention_count = ?,
                  published_at = COALESCE(
                      (SELECT MIN(published_at) FROM story_sources WHERE cluster_id = ?),
                      published_at
                    ),
                  trending_score = ?,
                  editorial_rank = CASE WHEN ? < 2 THEN NULL ELSE editorial_rank END,
                  last_seen_at = datetime('now'),
                  updated_at = datetime('now')
            WHERE id = ?`,
        )
        .bind(
          oldClusterUpdates.canonicalHeadline,
          oldClusterUpdates.canonicalExcerpt,
          oldClusterUpdates.outletCount,
          oldClusterUpdates.mentionCount,
          oldClusterId,
          oldClusterUpdates.trendingScore,
          oldClusterUpdates.outletCount,
          oldClusterId,
        )
        .run();

      // 5. Insert the correction record. The note is published on the OLD
      //    cluster's permanent URL: that is the page that was wrong.
      const corrRes = await db
        .prepare(
          `INSERT INTO corrections (
             story_slug, reported_at, report_detail, status, resolution,
             correction_note, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          oldCluster.slug,
          todayIso,
          `Administrative split of story ${storyId} from cluster ${oldClusterId}`,
          'resolved',
          `Detached coverage from ${outletName} into independent story cluster ${newCluster.slug}`,
          correctionNote,
          todayIso,
        )
        .run();

      const correctionId = Number(corrRes.meta.last_row_id);

      return { newClusterId, correctionId };
    },
  };
}

/** Daily D1 usage totals used by the operational audit. */
export async function readUsageTotals(env: MeridianEnv): Promise<{
  rowsRead: number;
  rowsWritten: number;
  storageBytes: number;
}> {
  const [reads, writes, storage] = await Promise.all([
    env.DB.prepare('SELECT SUM(d1_rows_read) AS total FROM usage_log WHERE usage_date >= date("now", "-1 day")').all<{ total: number | null }>(),
    env.DB.prepare('SELECT SUM(d1_rows_written) AS total FROM usage_log WHERE usage_date >= date("now", "-1 day")').all<{ total: number | null }>(),
    env.DB.prepare('SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()').all<{ bytes: number | null }>(),
  ]);

  return {
    rowsRead: reads.results?.[0]?.total ?? 0,
    rowsWritten: writes.results?.[0]?.total ?? 0,
    storageBytes: storage.results?.[0]?.bytes ?? 0,
  };
}

export async function pruneRawItemsBefore(env: MeridianEnv, cutoff: string): Promise<{
  deleted: number;
  referenced: number;
  clusters: number;
}> {
  const referenced = await env.DB.prepare('SELECT COUNT(DISTINCT raw_item_id) AS count FROM story_sources WHERE raw_item_id IS NOT NULL').all<{ count: number }>();
  const deleted = await env.DB.prepare('DELETE FROM raw_items WHERE published_at < ? AND id NOT IN (SELECT raw_item_id FROM story_sources WHERE raw_item_id IS NOT NULL)').bind(cutoff).run();
  const clusters = await env.DB.prepare('SELECT COUNT(*) AS count FROM clusters').all<{ count: number }>();
  return {
    deleted: deleted.meta.changes ?? 0,
    referenced: referenced.results?.[0]?.count ?? 0,
    clusters: clusters.results?.[0]?.count ?? 0,
  };
}

export async function countRawItemsBefore(env: MeridianEnv, cutoff: string): Promise<number> {
  const result = await env.DB.prepare('SELECT COUNT(*) AS count FROM raw_items WHERE published_at < ?').bind(cutoff).all<{ count: number }>();
  return result.results?.[0]?.count ?? 0;
}

export async function createReaderReport(
  env: MeridianEnv,
  report: { type: string; story_slug: string },
  data: string,
): Promise<{ id: number; type: string; story_slug: string; status: 'pending'; data: Record<string, unknown>; created_at: string } | null> {
  return env.DB.prepare("INSERT INTO reports (type, story_slug, status, data, created_at) VALUES (?, ?, 'pending', ?, datetime('now')) RETURNING id, type, story_slug, status, data, created_at")
    .bind(report.type, report.story_slug, data)
    .first();
}

export async function listPendingReaderReports(env: MeridianEnv): Promise<Array<{ id: number; type: string; story_slug: string; status: 'pending'; data: Record<string, unknown>; created_at: string }>> {
  const result = await env.DB.prepare("SELECT id, type, story_slug, status, data, created_at FROM reports WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100").all<{ id: number; type: string; story_slug: string; status: 'pending'; data: Record<string, unknown>; created_at: string }>();
  return result.results ?? [];
}

export async function setReaderReportStatus(env: MeridianEnv, id: number, status: 'reviewed' | 'approved' | 'rejected'): Promise<void> {
  await env.DB.prepare("UPDATE reports SET status = ?, reviewed_at = datetime('now') WHERE id = ?").bind(status, id).run();
}
