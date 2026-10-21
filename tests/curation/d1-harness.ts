/**
 * tests/curation/d1-harness.ts — A real D1-shaped database for the curation tests.
 *
 * The curation tests do not mock the datastore. They run the repository
 * against an in-memory SQLite database built from the project's own schema
 * (`shared/db/0001_init.sql`) and seed (`shared/db/seed.sql`), through a
 * binding adapter that speaks the same shape as the D1 binding the Worker
 * receives. A test that mocks the database proves nothing about the
 * constraints the schema actually carries, and the constraints are most of
 * what is worth proving here.
 *
 * The adapter mirrors `scripts/ingest/run-local.ts`: the repository is handed
 * a `prepare/bind/all/first/run/batch` object and never learns it is not
 * talking to Cloudflare.
 *
 * Foreign keys are switched OFF for the test connection, exactly as the local
 * ingest runner does it. The reason is the schema's own `cluster_id = 0`
 * sentinel: an unclustered story points at a cluster that does not exist yet,
 * which the `stories.cluster_id` foreign key forbids. The semantic
 * correctness of the join tables is asserted by the tests themselves rather
 * than by the pragma, so nothing is hidden by turning it off.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRepository, type Repository } from '../../apps/worker/src/db/repository.js';
import type { MeridianEnv } from '../../apps/worker/src/db/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** A minimal D1Database-shaped binding over a SQLite connection. */
export interface TestD1Binding {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: { changes: number } }>;
      first<T = unknown>(column?: string): Promise<T | null>;
      run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
    };
  };
  batch(statements: unknown[]): Promise<unknown[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

interface BoundStatement {
  sql: string;
  params: unknown[];
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
}

/**
 * Wrap a SQLite connection in the shape the repository expects.
 * `batch` runs its statements inside one transaction, so a multi-statement
 * mutation is atomic exactly as it is on D1.
 *
 * `bind` returns a NEW statement object, exactly as the D1 binding does. A
 * repository that prepares once and binds many times — which is the shape the
 * repository uses for chunked inserts — depends on that: a binding that
 * mutated a shared object would silently reuse the last row's parameters.
 */
export function createD1Binding(sqliteDb: DatabaseSync): TestD1Binding {
  const binding: TestD1Binding = {
    prepare(sql: string) {
      const makeStatement = (params: unknown[]) => {
        const statement = {
          bind(...values: unknown[]) {
            return makeStatement(values);
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

      return makeStatement([]);
    },

    async batch(statements: unknown[]) {
      const results: unknown[] = [];
      sqliteDb.exec('BEGIN');
      try {
        for (const statement of statements as BoundStatement[]) {
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

  return binding;
}

/** Build an in-memory database from the project's schema and seed. */
export function createTestDatabase(filePath = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(filePath);
  db.exec(readFileSync(path.join(REPO_ROOT, 'shared', 'db', '0001_init.sql'), 'utf8'));
  db.exec(readFileSync(path.join(REPO_ROOT, 'shared', 'db', 'seed.sql'), 'utf8'));
  // The `cluster_id = 0` sentinel points at a cluster that does not exist yet,
  // so the foreign key is switched off for the test connection — the same
  // choice the local ingest runner makes. See the note at the top of the file.
  db.exec('PRAGMA foreign_keys = OFF;');
  return db;
}

/** A test database plus a repository bound to it. */
export interface TestDatabase {
  db: DatabaseSync;
  repository: Repository;
}

/** Build an in-memory database and a repository bound to it. */
export function createTestRepository(): TestDatabase {
  const db = createTestDatabase();
  const binding = createD1Binding(db);
  const env: MeridianEnv = {
    DB: binding as unknown as MeridianEnv['DB'],
    R2: {} as MeridianEnv['R2'],
    KV: {} as MeridianEnv['KV'],
  };
  return { db, repository: createRepository(env) };
}

/** The source ids created by the seed, keyed by source slug. */
export function seedSourceIds(db: DatabaseSync): Map<string, number> {
  const rows = db.prepare('SELECT id, slug FROM sources').all() as Array<{
    id: number;
    slug: string;
  }>;
  return new Map(rows.map((row) => [row.slug, row.id]));
}

/** The section ids created by the seed, keyed by section slug. */
export function seedSectionIds(db: DatabaseSync): Map<string, number> {
  const rows = db.prepare('SELECT id, slug FROM sections').all() as Array<{
    id: number;
    slug: string;
  }>;
  return new Map(rows.map((row) => [row.slug, row.id]));
}

/** The edition ids created by the seed, keyed by edition slug. */
export function seedEditionIds(db: DatabaseSync): Map<string, number> {
  const rows = db.prepare('SELECT id, slug FROM editions').all() as Array<{
    id: number;
    slug: string;
  }>;
  return new Map(rows.map((row) => [row.slug, row.id]));
}
