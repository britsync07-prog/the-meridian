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
        'batchInsertStories',
        'countRows',
        'countTables',
        'findClusterBySlug',
        'insertStory',
        'listActiveSources',
        'listProminentClusters',
        'listStoriesForCluster',
        'recordFeedFetch',
        'syncSources',
        'updateSourceHealth',
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

  it('refuses to count a table that is not on the allow-list', async () => {
    const repository = createRepository(stubEnv());
    await expect(repository.countRows('sources; DROP TABLE sources')).rejects.toThrow(/allow-list/i);
    await expect(repository.countRows('sqlite_master')).rejects.toThrow(/allow-list/i);
  });
});
