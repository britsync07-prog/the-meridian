/**
 * scripts/curation/split-cluster.ts — Administrative CLI for cluster splitting.
 *
 * Usage:
 *   npm run cluster:split -- <clusterId> <storyId>            (local D1 mirror)
 *   npm run cluster:split -- <clusterId> <storyId> --remote   (the live database)
 *
 * Detaches a wrongly merged story from a cluster, creates a new cluster for the
 * detached story, and publishes an immutable dated correction note (CUR-02,
 * CUR-03, D-18, D-19).
 *
 * Two databases are reachable:
 *
 *   local   the SQLite file wrangler keeps for the local D1 mirror. This is
 *           the default because it needs no credentials and it is the copy a
 *           curator rehearses against.
 *   remote  the live database, reached through the Cloudflare API. Every
 *           statement is a separate transaction there — the Cloudflare query
 *           endpoint runs one statement at a time — so the tool re-reads the
 *           cluster afterwards and refuses to report success unless the
 *           attribution rows and the correction note are all where they
 *           should be.
 *
 * The repository is the only module that holds a query. This file holds none:
 * it builds a binding, hands it to the repository, and reports what the
 * repository did.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { splitCluster } from '../../src/curation/split.js';
import { createRepository } from '../../apps/worker/src/db/repository.js';
import type { MeridianEnv } from '../../apps/worker/src/db/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

interface CliOptions {
  clusterId: number;
  storyId: number;
  remote: boolean;
}

/** Parse the command line. */
export function parseArgs(argv: readonly string[]): CliOptions | null {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const remote = argv.includes('--remote');

  if (positional.length < 2) return null;

  const clusterId = Number.parseInt(positional[0], 10);
  const storyId = Number.parseInt(positional[1], 10);
  if (!Number.isInteger(clusterId) || clusterId <= 0) return null;
  if (!Number.isInteger(storyId) || storyId <= 0) return null;

  return { clusterId, storyId, remote };
}

/** Where the local D1 mirror's database file lives. */
export function findLocalDatabasePath(): string | null {
  const override = process.env.MERIDIAN_D1_LOCAL_PATH;
  if (override && existsSync(override)) return override;

  const candidates = [
    path.join(REPO_ROOT, 'apps', 'worker', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject'),
    path.join(REPO_ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject'),
  ];

  for (const directory of candidates) {
    if (!existsSync(directory)) continue;
    const files = readdirSync(directory);
    const file = files.find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
    if (file) return path.join(directory, file);
  }

  return null;
}

/**
 * A binding over the local SQLite file, shaped like the D1 binding the
 * Worker receives.
 */
function createLocalBinding(sqliteDb: DatabaseSync) {
  const makeStatement = (sql: string, params: unknown[]) => {
    const statement = {
      bind(...values: unknown[]) {
        return makeStatement(sql, values);
      },
      async all<T = unknown>() {
        const rows = sqliteDb.prepare(sql).all(...(params as never[])) as T[];
        return { results: rows, success: true, meta: { changes: 0 } };
      },
      async first<T = unknown>(column?: string) {
        const row = sqliteDb.prepare(sql).get(...(params as never[])) as
          | Record<string, unknown>
          | undefined;
        if (!row) return null;
        if (column) return (row[column] ?? null) as T;
        return row as T;
      },
      async run() {
        const info = sqliteDb.prepare(sql).run(...(params as never[]));
        return {
          success: true,
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
    };
    return statement;
  };

  return {
    prepare(sql: string) {
      return makeStatement(sql, []);
    },
    async batch(statements: unknown[]) {
      const results: unknown[] = [];
      sqliteDb.exec('BEGIN');
      try {
        for (const statement of statements as Array<{ run(): Promise<unknown> }>) {
          results.push(await statement.run());
        }
        sqliteDb.exec('COMMIT');
      } catch (error) {
        sqliteDb.exec('ROLLBACK');
        throw error;
      }
      return results;
    },
    async exec(sql: string) {
      sqliteDb.exec(sql);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };
}

/**
 * A binding over the Cloudflare API. The repository's statements are handed
 * to the API unchanged; this module holds none of its own.
 */
function createRemoteBinding(accountId: string, databaseId: string, token: string) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const run = async (sql: string, params: unknown[]) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cloudflare API refused the request (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as {
      success: boolean;
      result?: Array<{
        results?: unknown[];
        meta?: { changes?: number; last_row_id?: number };
      }>;
      errors?: Array<{ message?: string }>;
    };

    if (!payload.success) {
      const message = (payload.errors ?? []).map((e) => e.message ?? '').join('; ');
      throw new Error(`Cloudflare API reported a failure: ${message}`);
    }

    const first = payload.result?.[0];
    return {
      results: first?.results ?? [],
      changes: first?.meta?.changes ?? 0,
      lastRowId: first?.meta?.last_row_id ?? 0,
    };
  };

  const makeStatement = (sql: string, params: unknown[]) => {
    const statement = {
      bind(...values: unknown[]) {
        return makeStatement(sql, values);
      },
      async all<T = unknown>() {
        const outcome = await run(sql, params);
        return { results: outcome.results as T[], success: true, meta: { changes: outcome.changes } };
      },
      async first<T = unknown>(column?: string) {
        const outcome = await run(sql, params);
        const row = outcome.results[0] as Record<string, unknown> | undefined;
        if (!row) return null;
        if (column) return (row[column] ?? null) as T;
        return row as T;
      },
      async run() {
        const outcome = await run(sql, params);
        return {
          success: true,
          meta: { changes: outcome.changes, last_row_id: outcome.lastRowId },
        };
      },
    };
    return statement;
  };

  return {
    prepare(sql: string) {
      return makeStatement(sql, []);
    },
    async batch(statements: unknown[]) {
      // The Cloudflare query endpoint runs one statement at a time, so a
      // batch here is a sequence of transactions rather than one. The caller
      // re-reads the cluster afterwards to confirm the outcome.
      const results: unknown[] = [];
      for (const statement of statements as Array<{ run(): Promise<unknown> }>) {
        results.push(await statement.run());
      }
      return results;
    },
    async exec(sql: string) {
      throw new Error('The remote binding cannot run a raw script.');
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };
}

/** Build the binding the tool will run against. */
function buildBinding(options: CliOptions) {
  if (options.remote) {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.MERIDIAN_DB_ID;

    if (!token || !accountId || !databaseId) {
      throw new Error(
        'The remote path needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and MERIDIAN_DB_ID in the environment.',
      );
    }

    return createRemoteBinding(accountId, databaseId, token);
  }

  const databasePath = findLocalDatabasePath();
  if (!databasePath) {
    throw new Error(
      'No local D1 database found. Run `npm run db:verify:local` first, or point MERIDIAN_D1_LOCAL_PATH at a database file.',
    );
  }

  console.log(`Local database: ${databasePath}`);
  const sqliteDb = new DatabaseSync(databasePath);
  sqliteDb.exec('PRAGMA foreign_keys = OFF;');
  return createLocalBinding(sqliteDb);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options) {
    console.error('Usage: npm run cluster:split -- <clusterId> <storyId> [--remote]');
    console.error('');
    console.error('Example: npm run cluster:split -- 42 17');
    process.exit(1);
  }

  console.log('\nCluster Split Tool');
  console.log('==================');
  console.log(`Splitting story ${options.storyId} from cluster ${options.clusterId}...`);
  if (options.remote) {
    console.log('Target: the live database.');
  }
  console.log('');

  const binding = buildBinding(options);
  const env: MeridianEnv = {
    DB: binding as unknown as MeridianEnv['DB'],
    R2: {} as MeridianEnv['R2'],
    KV: {} as MeridianEnv['KV'],
  };

  const repository = createRepository(env);
  const result = await splitCluster(options.clusterId, options.storyId, repository);

  console.log('Split complete.');
  console.log(`  Original cluster: ${result.originalClusterId}`);
  console.log(`  New cluster:      ${result.newClusterId} (slug: ${result.newClusterSlug})`);
  console.log(`  Correction ID:    ${result.correctionId}`);
  console.log('');
  console.log('Correction note published:');
  console.log(`  "${result.correctionNote}"`);
}

// Only run when invoked as a command, so the module can be imported by tests.
const invokedDirectly = process.argv[1]?.includes('split-cluster');
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`\nSplit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
