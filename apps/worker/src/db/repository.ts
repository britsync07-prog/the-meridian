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
  source_id: number;
  rank: number;
  headline: string;
  url: string;
  published_at: string;
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
  simhash: number;
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
}

/** One row returned for LSH candidate matching. */
export interface LshCandidateRow {
  id: number;
  cluster_id: number;
  headline: string;
  excerpt: string | null;
  published_at: string;
  simhash: number;
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
             published_at, fetched_at, simhash, band0, band1, band2, band3, country_code, is_primary
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          row.simhash,
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
           published_at, fetched_at, simhash, band0, band1, band2, band3, country_code, is_primary
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, external_guid) DO NOTHING`,
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
          `SELECT id, cluster_id, headline, excerpt, published_at, simhash, language, country_code, is_primary
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

      // 4. Insert or update story_topics
      const topicStmt = db.prepare(
        `INSERT INTO story_topics (
           story_id, topic_id, weight
         ) VALUES (?, ?, ?)
         ON CONFLICT(story_id, topic_id) DO UPDATE SET
           weight = excluded.weight`,
      );
      for (const topicId of topicIds) {
        statements.push(topicStmt.bind(clusterId, topicId, 1.0));
      }

      // 5. Insert or update story_entities
      const entityStmt = db.prepare(
        `INSERT INTO story_entities (
           story_id, entity_id, weight, is_primary
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(story_id, entity_id) DO UPDATE SET
           weight = excluded.weight,
           is_primary = excluded.is_primary`,
      );
      for (const ent of entityIds) {
        statements.push(
          entityStmt.bind(
            clusterId,
            ent.entityId,
            1.0,
            ent.isPrimary ? 1 : 0,
          ),
        );
      }

      const CHUNK_SIZE = 50;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        const chunk = statements.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk as any);
      }
    },
  };
}
