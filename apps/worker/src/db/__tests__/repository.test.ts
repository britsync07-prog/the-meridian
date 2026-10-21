/**
 * OPS-14: one repository module, and a database identifier that is a
 * configuration value rather than a constant in the code.
 *
 * The first assertion is the one that matters. SQL scattered across the
 * codebase cannot be audited, cannot be counted against the D1 read budget,
 * and cannot be reviewed as a single surface. If every statement lives in one
 * file, the query surface can be read in one sitting — and a test can prove
 * it.
 *
 * The scan is deliberately blunt: any occurrence of a SQL keyword outside the
 * repository module is a failure, reported with the file and the line. A blunt
 * scan that occasionally cries wolf is still better than a precise one that
 * misses a statement.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { resolveDatabaseId, type MeridianEnv } from '../config';
import { createRepository } from '../repository';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..');
const REPOSITORY_MODULE = 'apps/worker/src/db/repository.ts';

/** The roots the scan walks. */
const SCAN_ROOTS = ['apps', 'shared', 'scripts', 'spikes'];

/** The file extensions the scan reads. */
const SCAN_EXTENSIONS = ['.ts', '.mjs', '.js'];

/** Directories that are build output or dependency trees, never source. */
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.astro-cache',
  '.astro',
  '.wrangler',
  '.git',
  'coverage',
]);

/**
 * Files that are allowed to contain SQL. The repository module is the home
 * of the query surface; the verification scripts drive the wrangler CLI and
 * never touch the D1 binding; test files assert on SQL text by nature.
 */
const ALLOWED_FILES = new Set([
  REPOSITORY_MODULE,
  'scripts/db/verify-local.mjs',
  'scripts/db/verify-swap.mjs',
]);

const SQL_KEYWORD = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|CREATE INDEX|ALTER TABLE)\b/i;

/** Recursively collect the source files under a directory. */
function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectSourceFiles(path.join(directory, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    found.push(path.join(directory, entry.name));
  }
  return found;
}

/** The repository-relative path of a file, with forward slashes. */
function relativePath(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

/** A file the scan is allowed to find SQL in. */
function isAllowed(relative: string): boolean {
  if (ALLOWED_FILES.has(relative)) return true;
  if (relative.includes('/__tests__/')) return true;
  if (relative.endsWith('.test.ts')) return true;
  if (relative.endsWith('.d.ts')) return true;
  return false;
}

/** A stub environment: the repository never touches the database in these tests. */
function stubEnv(overrides: Partial<MeridianEnv> = {}): MeridianEnv {
  return {
    DB: { __dbId: '11111111-2222-3333-4444-555555555555' } as MeridianEnv['DB'],
    R2: {} as MeridianEnv['R2'],
    KV: {} as MeridianEnv['KV'],
    ...overrides,
  };
}

describe('the repository is the only place SQL exists', () => {
  it('finds no SQL statement anywhere outside the repository module', () => {
    const hits: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(path.join(REPO_ROOT, root))) {
        const relative = relativePath(file);
        if (isAllowed(relative)) continue;
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
          if (SQL_KEYWORD.test(line)) {
            hits.push(`${relative}:${index + 1} — ${line.trim()}`);
          }
        });
      }
    }

    expect(hits).toEqual([]);
  });

  it('contains no SELECT * — D1 bills the rows a query scans, not the rows it returns', () => {
    const source = readFileSync(path.join(REPO_ROOT, REPOSITORY_MODULE), 'utf8');
    expect(source).not.toMatch(/\bSELECT\s+\*/i);
  });

  it('contains no hardcoded database identifier', () => {
    const source = readFileSync(path.join(REPO_ROOT, REPOSITORY_MODULE), 'utf8');
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('names its columns explicitly in every statement', () => {
    const source = readFileSync(path.join(REPO_ROOT, REPOSITORY_MODULE), 'utf8');
    // The statements live in template literals. Comments are stripped first
    // because the prose around them uses backticks too.
    const sqlChunks = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .split('`')
      .filter((_, index) => index % 2 === 1)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);

    const selects = sqlChunks.filter((statement) => /^select\b/i.test(statement));
    const inserts = sqlChunks.filter((statement) => /^insert\b/i.test(statement));
    expect(selects.length).toBeGreaterThan(0);
    expect(inserts.length).toBeGreaterThan(0);

    for (const statement of selects) {
      // A projection is either an explicit column list or a named aggregate.
      // It is never a star.
      const isColumnList = /\bselect\s+[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)*\s+from\b/i.test(statement);
      const isAggregate = /\bselect\s+count\(\s*\*\s*\)\s+as\s+[a-z_][a-z0-9_]*\s+from\b/i.test(
        statement,
      );
      expect(isColumnList || isAggregate).toBe(true);
      expect(statement).not.toMatch(/\bselect\s+\*/i);
    }

    for (const statement of inserts) {
      // An insert names its target columns; it never relies on table order.
      expect(statement).toMatch(/\binsert\s+into\s+[a-z_][a-z0-9_]*\s*\(/i);
      expect(statement).not.toMatch(/\binsert\s+into\s+[a-z_][a-z0-9_]*\s+values\b/i);
    }
  });
});

describe('resolveDatabaseId', () => {
  it('prefers the MERIDIAN_DB_ID override so the id can change without touching the config', () => {
    const env = stubEnv({ MERIDIAN_DB_ID: '  override-id  ' });
    expect(resolveDatabaseId(env)).toBe('override-id');
  });

  it("falls back to the binding's configured id", () => {
    expect(resolveDatabaseId(stubEnv())).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('returns an empty string when neither source carries an id', () => {
    const env = stubEnv();
    delete (env.DB as { __dbId?: string }).__dbId;
    expect(resolveDatabaseId(env)).toBe('');
  });

  it('treats a blank override as absent', () => {
    const env = stubEnv({ MERIDIAN_DB_ID: '   ' });
    expect(resolveDatabaseId(env)).toBe('11111111-2222-3333-4444-555555555555');
  });
});

describe('createRepository', () => {
  it('exposes exactly the documented repository methods', () => {
    const repository = createRepository(stubEnv());
    expect(Object.keys(repository).sort()).toEqual(
      [
        'addStoryToCluster',
        'assignClusterTaxonomy',
        'batchInsertStories',
        'batchUpdateTrendingScores',
        'countRows',
        'countTables',
        'createClusterWithStory',
        'findClusterBySlug',
        'findEntityIdsBySlugs',
        'findLshCandidates',
        'findRecentCandidateStories',
        'findSourceById',
        'findStoryById',
        'insertStory',
        'listActiveSources',
        'listEditions',
        'listProminentClusters',
        'listSections',
        'listStoriesForCluster',
        'listUnclusteredStories',
        'recordClusterSplit',
        'recordFeedFetch',
        'syncSources',
        'syncTaxonomyAndEntities',
        'updateClusterCuration',
        'updateSourceHealth',
        'updateStoryFingerprint',
      ].sort(),
    );
  });

  it('batchInsertStories executes chunked parameterized batch insertion for raw stories', async () => {
    const executedBatches: { sql: string; bindings: unknown[] }[][] = [];
    const batchMock = async (statements: unknown[]) => {
      executedBatches.push(statements as { sql: string; bindings: unknown[] }[]);
      return statements.map(() => ({ meta: { changes: 1 } }));
    };

    const mockDb = {
      prepare(sql: string) {
        return {
          sql,
          bind(...bindings: unknown[]) {
            return { sql, bindings };
          },
        };
      },
      batch: batchMock,
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] })
    );

    const testStories = Array.from({ length: 55 }, (_, i) => ({
      sourceId: 10,
      externalGuid: `guid-${i}`,
      headline: `Headline ${i}`,
      excerpt: `Excerpt ${i}`,
      url: `https://example.com/story-${i}`,
      slug: `story-${i}`,
      language: 'en',
      publishedAt: '2026-10-21T10:00:00.000Z',
      fetchedAt: '2026-10-21T10:05:00.000Z',
      countryCode: 'GB',
    }));

    const insertedCount = await repository.batchInsertStories(testStories);
    expect(insertedCount).toBe(55);
    // Chunk size is 50 -> 55 items chunked into 2 batches (50 + 5)
    expect(executedBatches.length).toBe(2);
    expect(executedBatches[0].length).toBe(50);
    expect(executedBatches[1].length).toBe(5);
    expect(executedBatches[0][0].sql).toMatch(/INSERT INTO stories/i);
    expect(executedBatches[0][0].sql).toMatch(/ON CONFLICT\(source_id, external_guid\) DO NOTHING/i);
    expect(executedBatches[0][0].bindings[1]).toBe(10);
    expect(executedBatches[0][0].bindings[2]).toBe('guid-0');
    expect(executedBatches[0][0].bindings[3]).toBe('Headline 0');
  });

  it('syncSources prepares and executes batch upsert for sources', async () => {
    const executedStatements: { sql: string; bindings: unknown[] }[] = [];
    const batchMock = async (statements: unknown[]) => {
      for (const s of statements as { sql: string; bindings: unknown[] }[]) {
        executedStatements.push(s);
      }
      return [];
    };

    const mockDb = {
      prepare(sql: string) {
        return {
          sql,
          bind(...bindings: unknown[]) {
            return { sql, bindings };
          },
        };
      },
      batch: batchMock,
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] })
    );

    await repository.syncSources([
      {
        slug: 'test-source',
        name: 'Test Source',
        homepageUrl: 'https://example.com',
        feedUrl: 'https://example.com/feed.xml',
        countryCode: 'GB',
        language: 'en',
        defaultSection: 'politics',
        sectionPrior: { politics: 0.8 },
        freshnessSlaHours: 24,
        isActive: true,
        termsStatus: 'verified',
        termsVerifiedAt: '2026-10-21',
        verifiedBy: 'auditor',
        termsUrl: 'https://example.com/terms',
      },
    ]);

    expect(executedStatements.length).toBe(1);
    expect(executedStatements[0].sql).toMatch(/INSERT INTO sources/i);
    expect(executedStatements[0].sql).toMatch(/ON CONFLICT\(slug\) DO UPDATE SET/i);
    expect(executedStatements[0].bindings[0]).toBe('test-source');
    expect(executedStatements[0].bindings[1]).toBe('Test Source');
    expect(executedStatements[0].bindings[7]).toBe(JSON.stringify({ politics: 0.8 }));
  });

  it('recordFeedFetch executes parameterized INSERT into feed_fetches', async () => {
    let captured: { sql: string; bindings: unknown[] } | null = null;
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            captured = { sql, bindings };
            return {
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] })
    );

    await repository.recordFeedFetch({
      sourceId: 42,
      fetchedAt: '2026-10-21T12:00:00.000Z',
      httpStatus: 200,
      bytes: 12345,
      itemCount: 20,
      newItems: 5,
      durationMs: 150,
      error: null,
    });

    expect(captured).not.toBeNull();
    expect(captured!.sql).toMatch(/INSERT INTO feed_fetches/i);
    expect(captured!.bindings).toEqual([
      42,
      '2026-10-21T12:00:00.000Z',
      200,
      12345,
      20,
      5,
      150,
      null,
    ]);
  });

  it('updateSourceHealth executes parameterized UPDATE on sources table', async () => {
    let captured: { sql: string; bindings: unknown[] } | null = null;
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            captured = { sql, bindings };
            return {
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] })
    );

    await repository.updateSourceHealth(99, {
      status: 503,
      consecutiveFailures: 3,
      disabledUntil: '2026-10-21T13:00:00.000Z',
      lastFetchedAt: '2026-10-21T12:30:00.000Z',
    });

    expect(captured).not.toBeNull();
    expect(captured!.sql).toMatch(/UPDATE sources/i);
    expect(captured!.bindings).toEqual([
      '503',
      '2026-10-21T12:30:00.000Z',
      3,
      '2026-10-21T13:00:00.000Z',
      99,
    ]);
  });

  it('findLshCandidates executes parameterized query on 4 LSH bands with explicit column projection', async () => {
    let captured: { sql: string; bindings: unknown[] } | null = null;
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            captured = { sql, bindings };
            return {
              async all() {
                return {
                  results: [
                    {
                      id: 101,
                      cluster_id: 5,
                      headline: 'Bank of England cuts rates',
                      excerpt: 'Rate cut to 4.75%',
                      published_at: '2026-10-21T11:00:00.000Z',
                      simhash: 12345678,
                      language: 'en',
                      country_code: 'GB',
                      is_primary: 1,
                    },
                  ],
                };
              },
            };
          },
        };
      },
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] })
    );

    const candidates = await repository.findLshCandidates(
      1000,
      2000,
      3000,
      4000,
      '2026-10-20T12:00:00.000Z',
      'en',
    );

    expect(candidates.length).toBe(1);
    expect(candidates[0].id).toBe(101);
    expect(captured).not.toBeNull();
    expect(captured!.sql).toMatch(/SELECT id, cluster_id, headline, excerpt, published_at, simhash, language, country_code, is_primary/i);
    expect(captured!.sql).toMatch(/FROM stories/i);
    expect(captured!.sql).toMatch(/WHERE published_at >= \?/i);
    expect(captured!.sql).toMatch(/AND language = \?/i);
    expect(captured!.sql).toMatch(/AND \(band0 = \? OR band1 = \? OR band2 = \? OR band3 = \?\)/i);
    expect(captured!.sql).toMatch(/ORDER BY published_at DESC/i);
    expect(captured!.sql).toMatch(/LIMIT 50/i);
    expect(captured!.bindings).toEqual([
      '2026-10-20T12:00:00.000Z',
      'en',
      1000,
      2000,
      3000,
      4000,
    ]);
  });

  it('batchUpdateTrendingScores updates clusters in chunks of 50 with explicit parameter binding', async () => {
    const executedBatches: { sql: string; bindings: unknown[] }[][] = [];
    const batchMock = async (statements: unknown[]) => {
      executedBatches.push(statements as { sql: string; bindings: unknown[] }[]);
      return [];
    };

    const mockDb = {
      prepare(sql: string) {
        return {
          sql,
          bind(...bindings: unknown[]) {
            return { sql, bindings };
          },
        };
      },
      batch: batchMock,
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    // Create 55 score updates to test chunking (50 + 5)
    const updates = Array.from({ length: 55 }, (_, i) => ({
      clusterId: 100 + i,
      trendingScore: 12.5 + i * 0.1,
      editorialRank: i === 0 ? 1 : null,
      scoreUpdatedAt: '2026-10-21T14:00:00.000Z',
    }));

    await repository.batchUpdateTrendingScores(updates);

    expect(executedBatches.length).toBe(2);
    expect(executedBatches[0].length).toBe(50);
    expect(executedBatches[1].length).toBe(5);

    // Verify first update statement in first batch
    const firstStatement = executedBatches[0][0];
    expect(firstStatement.sql).toMatch(/UPDATE clusters/i);
    expect(firstStatement.sql).toMatch(/SET\s+trending_score = \?,\s+editorial_rank = \?,\s+score_updated_at = \?/i);
    expect(firstStatement.sql).toMatch(/WHERE id = \?/i);
    expect(firstStatement.bindings).toEqual([
      12.5,
      1,
      '2026-10-21T14:00:00.000Z',
      100,
    ]);

    // Verify last statement in second batch
    const lastStatement = executedBatches[1][4];
    expect(lastStatement.bindings).toEqual([
      12.5 + 54 * 0.1,
      null,
      '2026-10-21T14:00:00.000Z',
      154,
    ]);
  });

  it('batchUpdateTrendingScores handles empty array safely without executing queries', async () => {
    let batchCalled = false;
    const mockDb = {
      prepare() {
        throw new Error('should not prepare for empty array');
      },
      batch: async () => {
        batchCalled = true;
        return [];
      },
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.batchUpdateTrendingScores([]);
    expect(batchCalled).toBe(false);
  });

  it('syncTaxonomyAndEntities prepares batch upserts for topics and entities', async () => {
    const executedStatements: { sql: string; bindings: unknown[] }[] = [];
    const batchMock = async (statements: unknown[]) => {
      for (const s of statements as { sql: string; bindings: unknown[] }[]) {
        executedStatements.push(s);
      }
      return [];
    };

    const mockDb = {
      prepare(sql: string) {
        return {
          sql,
          bind(...bindings: unknown[]) {
            return { sql, bindings };
          },
        };
      },
      batch: batchMock,
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.syncTaxonomyAndEntities(
      [
        { slug: 'uk-general-election', name: 'UK General Election' },
      ],
      [
        {
          slug: 'keir-starmer',
          name: 'Keir Starmer',
          entityType: 'person',
          countryCode: 'GB',
        },
      ],
    );

    expect(executedStatements.length).toBe(2);

    // Topic statement check
    expect(executedStatements[0].sql).toMatch(/INSERT INTO topics/i);
    expect(executedStatements[0].sql).toMatch(/ON CONFLICT\(slug\) DO UPDATE SET/i);
    expect(executedStatements[0].bindings).toEqual([
      'uk-general-election',
      'UK General Election',
      'topic',
    ]);

    // Entity statement check
    expect(executedStatements[1].sql).toMatch(/INSERT INTO entities/i);
    expect(executedStatements[1].sql).toMatch(/ON CONFLICT\(slug\) DO UPDATE SET/i);
    expect(executedStatements[1].bindings).toEqual([
      'keir-starmer',
      'Keir Starmer',
      'person',
      'GB',
    ]);
  });

  it('assignClusterTaxonomy batches updates across cluster, sections, editions, topics, and entities', async () => {
    const executedStatements: { sql: string; bindings: unknown[] }[] = [];
    const batchMock = async (statements: unknown[]) => {
      for (const s of statements as { sql: string; bindings: unknown[] }[]) {
        executedStatements.push(s);
      }
      return [];
    };

    const mockDb = {
      prepare(sql: string) {
        return {
          sql,
          bind(...bindings: unknown[]) {
            return { sql, bindings };
          },
        };
      },
      batch: batchMock,
    };

    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.assignClusterTaxonomy(
      101,
      { sectionId: 1, confidence: 0.95, method: 'lexicon' },
      [
        {
          editionId: 2,
          publishedAt: '2026-10-21T10:00:00.000Z',
          reason: 'source',
          confidence: 1.0,
        },
        {
          editionId: 3,
          publishedAt: '2026-10-21T10:00:00.000Z',
          reason: 'entity',
          confidence: 0.9,
        },
      ],
      [10, 11],
      [
        { entityId: 201, isPrimary: true },
        { entityId: 202, isPrimary: false },
      ],
    );

    // Total statements: 1 (update clusters) + 1 (cluster_sections) + 2 (edition_clusters) + 2 (story_topics) + 2 (story_entities) = 8
    expect(executedStatements.length).toBe(8);

    // Statement 0: UPDATE clusters
    expect(executedStatements[0].sql).toMatch(/UPDATE clusters/i);
    expect(executedStatements[0].bindings).toEqual([1, 0.95, 'lexicon', 101]);

    // Statement 1: INSERT INTO cluster_sections
    expect(executedStatements[1].sql).toMatch(/INSERT INTO cluster_sections/i);
    expect(executedStatements[1].bindings).toEqual([101, 1, 0.95, 'lexicon']);

    // Statement 2 & 3: INSERT INTO edition_clusters
    expect(executedStatements[2].sql).toMatch(/INSERT INTO edition_clusters/i);
    expect(executedStatements[2].bindings).toEqual([
      2,
      101,
      '2026-10-21T10:00:00.000Z',
      'source',
      1.0,
    ]);
    expect(executedStatements[3].bindings).toEqual([
      3,
      101,
      '2026-10-21T10:00:00.000Z',
      'entity',
      0.9,
    ]);

    // Statement 4 & 5: INSERT INTO story_topics.
    // The join rows are keyed by the member STORIES of the cluster, because
    // `story_topics.story_id` references `stories(id)`.
    expect(executedStatements[4].sql).toMatch(/INSERT INTO story_topics/i);
    expect(executedStatements[4].bindings).toEqual([10, 1.0, 101]);
    expect(executedStatements[5].bindings).toEqual([11, 1.0, 101]);

    // Statement 6 & 7: INSERT INTO story_entities
    expect(executedStatements[6].sql).toMatch(/INSERT INTO story_entities/i);
    expect(executedStatements[6].bindings).toEqual([201, 1.0, 1, 101]);
    expect(executedStatements[7].bindings).toEqual([202, 1.0, 0, 101]);
  });

  it('refuses to count a table that is not on the allow-list', async () => {
    const repository = createRepository(stubEnv());
    await expect(repository.countRows('sources; DROP TABLE sources')).rejects.toThrow(/allow-list/i);
    await expect(repository.countRows('sqlite_master')).rejects.toThrow(/allow-list/i);
  });
});

describe('the curation repository methods (03-05)', () => {
  /** A mock binding that captures the statement that was prepared. */
  function captureDb(results: unknown[] = []) {
    const captured: { sql: string; bindings: unknown[] }[] = [];
    const mockDb = {
      prepare(sql: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async all<T = unknown>() {
            captured.push({ sql, bindings });
            return { results, success: true, meta: { changes: 0 } };
          },
          async first<T = unknown>() {
            captured.push({ sql, bindings });
            return (results[0] as T) ?? null;
          },
          async run() {
            captured.push({ sql, bindings });
            return { success: true, meta: { changes: 1, last_row_id: 7 } };
          },
        };
        return statement;
      },
      batch: async (statements: unknown[]) => {
        for (const statement of statements as Array<{ run(): Promise<unknown> }>) {
          await statement.run();
        }
        return [];
      },
    };
    return { mockDb, captured };
  }

  it('listUnclusteredStories selects only real columns and orders by publication time', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.listUnclusteredStories(50);

    expect(captured[0].sql).toMatch(/FROM stories/i);
    expect(captured[0].sql).toMatch(/WHERE cluster_id = 0/i);
    expect(captured[0].sql).toMatch(/ORDER BY published_at ASC/i);
    expect(captured[0].sql).toMatch(/LIMIT \?/i);
    expect(captured[0].bindings).toEqual([50]);
    // The projection must name columns the schema actually has.
    for (const column of [
      'external_guid',
      'slug',
      'fetched_at',
      'band0',
      'band1',
      'band2',
      'band3',
      'is_primary',
    ]) {
      expect(captured[0].sql).toMatch(new RegExp(column, 'i'));
    }
    for (const column of ['external_id', 'canonical_url', 'word_count', 'char_count']) {
      expect(captured[0].sql).not.toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    }
  });

  it('findStoryById and findSourceById read one row each', async () => {
    const { mockDb, captured } = captureDb([{ id: 42, slug: 'bbc-news' }]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.findStoryById(42);
    await repository.findSourceById(7);

    expect(captured[0].sql).toMatch(/FROM stories/i);
    expect(captured[0].sql).toMatch(/WHERE id = \?/i);
    expect(captured[0].bindings).toEqual([42]);
    expect(captured[1].sql).toMatch(/FROM sources/i);
    expect(captured[1].bindings).toEqual([7]);
  });

  it('listSections and listEditions read the reference tables in display order', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.listSections();
    await repository.listEditions();

    expect(captured[0].sql).toMatch(/FROM sections/i);
    expect(captured[0].sql).toMatch(/ORDER BY sort_order ASC/i);
    expect(captured[1].sql).toMatch(/FROM editions/i);
  });

  it('findRecentCandidateStories reads the merge window, not the table', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.findRecentCandidateStories('2026-10-20T18:00:00.000Z', 'en', 200);

    expect(captured[0].sql).toMatch(/FROM stories/i);
    expect(captured[0].sql).toMatch(/WHERE published_at >= \?/i);
    expect(captured[0].sql).toMatch(/AND language = \?/i);
    expect(captured[0].sql).toMatch(/LIMIT \?/i);
    expect(captured[0].bindings).toEqual(['2026-10-20T18:00:00.000Z', 'en', 200]);
  });

  it('updateStoryFingerprint writes the four LSH bands', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.updateStoryFingerprint(9, {
      band0: 11,
      band1: 22,
      band2: 33,
      band3: 44,
    });

    expect(captured[0].sql).toMatch(/UPDATE stories/i);
    expect(captured[0].sql).toMatch(/band0 = \?/i);
    expect(captured[0].sql).not.toMatch(/simhash/i);
    expect(captured[0].bindings).toEqual([11, 22, 33, 44, 9]);
  });

  it('findEntityIdsBySlugs binds one placeholder per slug', async () => {
    const { mockDb, captured } = captureDb([
      { id: 3, slug: 'keir-starmer' },
      { id: 9, slug: 'isro' },
    ]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    const resolved = await repository.findEntityIdsBySlugs(['keir-starmer', 'isro']);

    expect(captured[0].sql).toMatch(/FROM entities/i);
    expect(captured[0].sql).toMatch(/WHERE slug IN \(\?, \?\)/i);
    expect(captured[0].bindings).toEqual(['keir-starmer', 'isro']);
    expect(resolved.get('keir-starmer')).toBe(3);
    expect(resolved.get('isro')).toBe(9);
  });

  it('createClusterWithStory stamps the first-seen and last-seen times', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    const clusterId = await repository.createClusterWithStory(
      {
        slug: 'story-abc-def',
        canonicalHeadline: 'A headline',
        canonicalExcerpt: null,
        primarySectionId: 3,
        sectionConfidence: 0.8,
        sectionMethod: 'lexicon',
        publishedAt: '2026-10-21T09:00:00.000Z',
        outletCount: 1,
        mentionCount: 1,
        trendingScore: 4.2,
      },
      12,
      5,
      'A headline',
      'https://example.com/a',
      '2026-10-21T09:00:00.000Z',
    );

    expect(clusterId).toBe(7);
    expect(captured[0].sql).toMatch(/INSERT INTO clusters/i);
    expect(captured[0].sql).toMatch(/first_seen_at/i);
    expect(captured[0].sql).toMatch(/last_seen_at/i);
    expect(captured[0].bindings).toContain('story-abc-def');
    expect(captured[0].bindings).toContain('2026-10-21T09:00:00.000Z');
  });

  it('addStoryToCluster recomputes the member counts and keeps the earliest publication time', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.addStoryToCluster(
      3,
      12,
      5,
      'A headline',
      'https://example.com/a',
      '2026-10-21T09:00:00.000Z',
      false,
    );

    const clusterUpdate = captured.find((c) => /UPDATE clusters/i.test(c.sql));
    expect(clusterUpdate).toBeDefined();
    expect(clusterUpdate!.sql).toMatch(/COUNT\(DISTINCT source_id\)/i);
    expect(clusterUpdate!.sql).toMatch(/published_at = MIN\(published_at, \?\)/i);
    expect(clusterUpdate!.bindings).toEqual([3, 3, '2026-10-21T09:00:00.000Z', 3]);
  });

  it('updateClusterCuration writes the editorial rank as well as the score', async () => {
    const { mockDb, captured } = captureDb([]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    await repository.updateClusterCuration(3, {
      canonicalHeadline: 'A headline',
      publishedAt: '2026-10-21T09:00:00.000Z',
      outletCount: 2,
      mentionCount: 2,
      trendingScore: 6.5,
      editorialRank: 1,
    });

    expect(captured[0].sql).toMatch(/editorial_rank = \?/i);
    expect(captured[0].sql).toMatch(/published_at = MIN\(published_at, \?\)/i);
    expect(captured[0].bindings).toEqual([
      'A headline',
      null,
      '2026-10-21T09:00:00.000Z',
      2,
      2,
      6.5,
      1,
      null,
      3,
    ]);
  });

  it('recordClusterSplit moves the attribution row, re-measures the old cluster and writes the correction', async () => {
    const { mockDb, captured } = captureDb([
      {
        slug: 'story-original',
        primary_section_id: 4,
        section_confidence: 0.7,
        section_method: 'lexicon',
      },
    ]);
    const repository = createRepository(
      stubEnv({ DB: mockDb as unknown as MeridianEnv['DB'] }),
    );

    const result = await repository.recordClusterSplit(
      3,
      {
        slug: 'story-new-one',
        canonicalHeadline: 'The detached headline',
        canonicalExcerpt: null,
        publishedAt: '2026-10-21T10:00:00.000Z',
        outletCount: 1,
        mentionCount: 1,
        trendingScore: 4.1,
      },
      12,
      'The Guardian',
      'Correction (2026-10-21): An earlier version of this story incorrectly grouped coverage from The Guardian.',
      '2026-10-21T12:00:00.000Z',
      {
        promotedStoryId: 13,
        canonicalHeadline: 'The surviving headline',
        canonicalExcerpt: null,
        publishedAt: '2026-10-21T09:00:00.000Z',
        outletCount: 1,
        mentionCount: 1,
        trendingScore: 4.0,
      },
    );

    expect(result.newClusterId).toBe(7);
    expect(result.correctionId).toBe(7);

    // The desk is inherited, never re-classified.
    const insert = captured.find((c) => /INSERT INTO clusters/i.test(c.sql));
    expect(insert!.bindings).toContain(4);
    expect(insert!.bindings).toContain('lexicon');

    // The attribution row moves rather than being copied.
    expect(captured.some((c) => /DELETE FROM story_sources/i.test(c.sql))).toBe(true);
    expect(captured.some((c) => /INSERT INTO story_sources/i.test(c.sql))).toBe(true);

    // The old cluster is re-measured, and drops its Editor's Pick below two outlets.
    const update = captured.find((c) => /UPDATE clusters/i.test(c.sql));
    expect(update!.sql).toMatch(/CASE WHEN \? < 2 THEN NULL ELSE editorial_rank END/i);
    expect(update!.sql).toMatch(/MIN\(published_at\)/i);
    expect(update!.bindings).toContain('The surviving headline');

    // The correction note is published on the old cluster's URL.
    const correction = captured.find((c) => /INSERT INTO corrections/i.test(c.sql));
    expect(correction).toBeDefined();
    expect(correction!.bindings).toContain('story-original');
    expect(correction!.bindings).toContain('resolved');
  });
});
