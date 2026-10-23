/**
 * The D1 schema and seed contract.
 *
 * These assertions exist because the free-tier budget was calculated against a
 * specific schema. A dropped index does not fail a build — it fails silently,
 * at 3 a.m., as a D1 read-budget breach. The counts below are therefore hard
 * numbers, not a smoke test.
 *
 * The table and index counts are asserted by NAME as well as by number, so the
 * failure message says which object disappeared.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const DDL_PATH = path.join(REPO_ROOT, 'shared', 'db', '0001_init.sql');
const RETENTION_MIGRATION_PATH = path.join(REPO_ROOT, 'shared', 'db', '0002_story-retention.sql');
const SEED_PATH = path.join(REPO_ROOT, 'shared', 'db', 'seed.sql');

/**
 * Read a file inside the test, so a missing file fails the assertion that
 * needs it rather than the whole module at load time. The failure message
 * then names the missing artefact.
 */
function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

const DDL = (): string => read(DDL_PATH);
const RETENTION_MIGRATION = (): string => read(RETENTION_MIGRATION_PATH);
const SEED = (): string => read(SEED_PATH);

/** The names of the objects the DDL creates, in creation order. */
function createdObjects(ddl: string, kind: string): string[] {
  const pattern = new RegExp(`CREATE\\s+${kind}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["'\`]?(\\w+)`, 'gi');
  return [...ddl.matchAll(pattern)].map((match) => match[1]);
}

const TABLES = (): string[] => createdObjects(DDL(), 'TABLE');
const INDEXES = (): string[] => createdObjects(DDL(), 'INDEX');

/**
 * Strip `--` line comments. The DDL and the seed both explain themselves in
 * prose, and prose about SQL trips naive pattern matching — the seed's own
 * header explains that a curator must set `terms_status = 'verified'`, which
 * is exactly the string the "nothing is pre-verified" assertion forbids.
 */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Count the value tuples in one `INSERT ... VALUES` statement. */
function countInsertedTuples(sql: string, table: string): number {
  const statement = new RegExp(
    `INSERT\\s+OR\\s+IGNORE\\s+INTO\\s+${table}\\b[\\s\\S]*?;`,
    'i',
  ).exec(stripComments(sql));
  if (!statement) return 0;
  const text = statement[0];
  const valuesAt = text.toUpperCase().indexOf('VALUES');
  if (valuesAt === -1) return 0;
  const body = text.slice(valuesAt);
  let depth = 0;
  let tuples = 0;
  let inString = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (inString) {
      if (char === "'") inString = false;
      continue;
    }
    if (char === "'") {
      inString = true;
      continue;
    }
    if (char === '(') {
      if (depth === 0) tuples += 1;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    }
  }
  return tuples;
}

describe('shared/db/0001_init.sql', () => {
  it('creates the 19 tables the content model needs', () => {
    expect(TABLES()).toHaveLength(19);
    expect(TABLES()).toEqual([
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
    ]);
  });

  it('creates the full index set, including the four LSH bands and the partial editorial index', () => {
    expect(INDEXES()).toHaveLength(32);

    for (const band of ['idx_stories_band0', 'idx_stories_band1', 'idx_stories_band2', 'idx_stories_band3']) {
      expect(INDEXES()).toContain(band);
    }

    for (const required of [
      'idx_stories_cluster',
      'idx_stories_source_pub',
      'idx_story_sources_source',
      'idx_clusters_prominent',
      'idx_clusters_score',
      'idx_clusters_editorial',
      'idx_sources_active',
      'idx_sources_country',
      'idx_edition_clusters_edition',
    ]) {
      expect(INDEXES()).toContain(required);
    }

    const editorial = /CREATE\s+INDEX\s+idx_clusters_editorial[\s\S]*?;/i.exec(DDL());
    expect(editorial).not.toBeNull();
    expect(editorial![0]).toMatch(/where\s+editorial_rank\s+is\s+not\s+null/i);

    // The four LSH bands are four separate indexes, each on its own column.
    for (const band of ['band0', 'band1', 'band2', 'band3']) {
      expect(DDL()).toMatch(new RegExp(`CREATE\\s+INDEX\\s+idx_stories_${band}\\s+ON\\s+stories\\(${band}\\)`, 'i'));
    }

    // The prominence index must cover the predicate AND the sort key.
    expect(DDL()).toMatch(
      /CREATE\s+INDEX\s+idx_clusters_prominent\s+ON\s+clusters\(is_prominent,\s*published_at\s+DESC\)/i,
    );

    // The edition index must carry the sort key the edition front page needs.
    expect(DDL()).toMatch(
      /CREATE\s+INDEX\s+idx_edition_clusters_edition\s+ON\s+edition_clusters\(edition_id,\s*published_at\)/i,
    );

    // The outbox index must carry the sort key the "latest from this outlet" query needs.
    expect(DDL()).toMatch(
      /CREATE\s+INDEX\s+idx_stories_source_pub\s+ON\s+stories\(source_id,\s*published_at\s+DESC\)/i,
    );
  });

  it('never selects every column implicitly', () => {
    expect(stripComments(DDL())).not.toMatch(/\bselect\s+\*/i);
    expect(stripComments(SEED())).not.toMatch(/\bselect\s+\*/i);
  });

  it('enables foreign keys and defers them for the stories/clusters cycle', () => {
    const statements = DDL()
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    expect(statements[0].toUpperCase()).toBe('PRAGMA FOREIGN_KEYS = ON');
    expect(statements[1].toUpperCase()).toBe('PRAGMA DEFER_FOREIGN_KEYS = TRUE');
  });

  it('carries the terms-of-use ledger on the source registry', () => {
    const sources = /CREATE\s+TABLE\s+sources\s*\([\s\S]*?\n\);/i.exec(DDL());
    expect(sources).not.toBeNull();
    expect(sources![0]).toMatch(/terms_status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'unverified'/i);
    expect(sources![0]).toMatch(/terms_verified_at\s+TEXT/i);
    expect(sources![0]).toMatch(/terms_url\s+TEXT/i);
  });

  it('never deletes: the 90-day window is a flag, not a deletion', () => {
    expect(DDL()).not.toMatch(/\bdrop\s+table\b/i);
    expect(DDL()).not.toMatch(/\bdelete\s+from\b/i);
    expect(DDL()).toMatch(/is_prominent\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1/i);
  });
});

describe('shared/db/seed.sql', () => {
  it('seeds 8 editions, 8 sections, the 64-row join and a 30-outlet registry', () => {
    expect(countInsertedTuples(SEED(), 'editions')).toBe(8);
    expect(countInsertedTuples(SEED(), 'sections')).toBe(8);
    expect(countInsertedTuples(SEED(), 'sources')).toBe(30);
    // The join is generated, not written out, so the count cannot drift.
    expect(SEED()).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+edition_sections[\s\S]*?SELECT[\s\S]*?CROSS\s+JOIN/i);
  });

  it('marks every seeded source unverified so Phase 2 cannot fetch an unchecked feed', () => {
    const sql = stripComments(SEED());
    expect(sql).not.toMatch(/terms_status\s+VALUES\s*\(\s*'verified'/i);
    expect(sql).not.toMatch(/terms_status\s*=\s*'verified'/i);
    // Every source row states the three ledger columns explicitly.
    const sourceRows = SEED().split('\n').filter((line) => /^\s*\('/.test(line) && line.includes("'http"));
    expect(sourceRows.length).toBeGreaterThanOrEqual(30);
  });

  it('covers all seven countries', () => {
    for (const country of ['GB', 'US', 'AU', 'CA', 'IE', 'NZ', 'IN']) {
      expect(SEED()).toContain(`'${country}'`);
    }
  });
});

describe('shared/db/0002_story-retention.sql', () => {
  function migratedDatabase(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(DDL());
    db.exec(SEED());
    db.exec(`
      INSERT INTO clusters (id, slug, canonical_headline, published_at, first_seen_at, last_seen_at)
      VALUES (1, 'retention-proof', 'Retention proof', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
      INSERT INTO topics (id, slug, name) VALUES (1, 'proof-topic', 'Proof topic');
      INSERT INTO entities (id, slug, name, type) VALUES (1, 'proof-entity', 'Proof entity', 'event');
      INSERT INTO stories (
        id, cluster_id, source_id, external_guid, headline, excerpt, url, slug, language,
        published_at, fetched_at, simhash, band0, band1, band2, band3, country_code
      ) VALUES
        (1, 1, 1, 'positive', 'Positive', NULL, 'https://example.test/positive', 'positive', 'en', '2026-10-01T00:00:00Z', '2026-10-01T00:01:00Z', 4294967298, 0, 0, 0, 0, 'GB'),
        (2, 1, 1, 'sign-bit', 'Sign bit', NULL, 'https://example.test/sign-bit', 'sign-bit', 'en', '2026-10-02T00:00:00Z', '2026-10-02T00:01:00Z', -9223372036854775808, 0, 0, 0, 0, 'GB'),
        (3, 1, 2, 'max-signed', 'Max signed', NULL, 'https://example.test/max', 'max-signed', 'en', '2026-10-03T00:00:00Z', '2026-10-03T00:01:00Z', 9223372036854775807, 0, 0, 0, 0, 'GB');
      INSERT INTO story_sources (cluster_id, story_id, source_id, rank, headline, url, published_at) VALUES
        (1, 1, 1, 2, 'Later duplicate', 'https://example.test/later', '2026-10-02T00:00:00Z'),
        (1, 2, 1, 1, 'Winning duplicate', 'https://example.test/winner', '2026-10-03T00:00:00Z'),
        (1, 3, 2, 0, 'Second source', 'https://example.test/second', '2026-10-03T00:00:00Z');
      INSERT INTO story_topics (story_id, topic_id) VALUES (1, 1);
      INSERT INTO story_entities (story_id, entity_id) VALUES (1, 1);
      INSERT INTO images (id, story_id, source_url, content_hash) VALUES (1, 1, 'https://example.test/image', 'hash');
    `);
    db.exec(RETENTION_MIGRATION());
    return db;
  }

  it('keeps permanent attribution while raw-story dependents cascade on prune', () => {
    const db = migratedDatabase();
    const winningAttribution = db.prepare(
      'SELECT rank, headline, url, published_at FROM story_sources WHERE cluster_id = 1 AND source_id = 1',
    ).get() as Record<string, unknown>;

    expect(winningAttribution).toEqual({
      rank: 1,
      headline: 'Winning duplicate',
      url: 'https://example.test/winner',
      published_at: '2026-10-03T00:00:00Z',
    });

    db.exec('DELETE FROM stories WHERE id = 1');
    expect(db.prepare('SELECT COUNT(*) AS n FROM story_topics WHERE story_id = 1').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM story_entities WHERE story_id = 1').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM images WHERE story_id = 1').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM story_sources WHERE cluster_id = 1 AND source_id = 1').get()).toEqual({ n: 1 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('splits legacy signed int64 simhash values into exact unsigned words', () => {
    const db = migratedDatabase();
    const words = db.prepare(
      'SELECT id, simhash_hi, simhash_lo FROM stories ORDER BY id',
    ).all() as Array<{ id: number; simhash_hi: number; simhash_lo: number }>;

    expect(words).toEqual([
      { id: 1, simhash_hi: 1, simhash_lo: 2 },
      { id: 2, simhash_hi: 2147483648, simhash_lo: 0 },
      { id: 3, simhash_hi: 2147483647, simhash_lo: 4294967295 },
    ]);
  });
});
