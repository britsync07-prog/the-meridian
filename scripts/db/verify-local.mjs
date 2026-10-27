#!/usr/bin/env node
/**
 * verify-local.mjs — the empty-database proof for the D1 schema and the seed.
 *
 * OPS-14 is a claim about a *module*; this script is the claim about a
 * *database*. It proves:
 *
 *   1. Every numbered migration applies to a genuinely empty database with no manual repair step.
 *   2. The schema carries the exact table and index set the free-tier budget
 *      was calculated against — the four LSH band indexes and the partial
 *      editorial-rank index included.
 *   3. The seed produces the 8 editions, the 8 sections, the 64-row
 *      edition-sections join and the 30-outlet source registry, with every
 *      seeded source at `terms_status = 'unverified'` so Phase 2 cannot fetch a
 *      feed whose terms have not been checked.
 *
 * The script is idempotent: it deletes the local D1 state first, so every run
 * asserts against a database built from nothing.
 *
 * Usage:  node scripts/db/verify-local.mjs
 * Exit:   0 when every assertion passes, 1 otherwise.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRANGLER_CONFIG = 'apps/worker/wrangler.jsonc';
const DATABASE_NAME = 'meridian';

/**
 * The schema contract. These are the numbers the free-tier budget was
 * calculated against: a dropped index or table fails this script loudly.
 *
 * `INDEX_COUNT` is 36, not the research's 31: later reports and audit migrations add indexes.
 * `CREATE INDEX` statements and this plan additionally mandates
 * `idx_edition_clusters_edition`, which the research schema did not have
 * because `edition_clusters` had no `published_at` column to sort by.
 */
const TABLE_COUNT = 20;
const INDEX_COUNT = 36;

/** The indexes whose absence would breach the D1 read budget. */
const REQUIRED_INDEXES = [
  'idx_stories_band0',
  'idx_stories_band1',
  'idx_stories_band2',
  'idx_stories_band3',
  'idx_stories_cluster',
  'idx_stories_source_pub',
  'idx_story_sources_source',
  'idx_clusters_prominent',
  'idx_clusters_score',
  'idx_clusters_editorial',
  'idx_sources_active',
  'idx_sources_country',
  'idx_edition_clusters_edition',
];

/** The table names the seed is allowed to write to. */
const KNOWN_TABLES = [
  'editions',
  'sections',
  'edition_sections',
  'sources',
  'clusters',
  'stories',
  'story_sources',
];

const WRANGLER_BIN = path.join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/**
 * Run wrangler without a shell. Going through `node <wrangler.js>` keeps the
 * SQL argument intact on every platform — a shell would re-interpret the
 * quotes inside `--command`.
 */
function runWrangler(args) {
  const useLocalBin = existsSync(WRANGLER_BIN);
  const command = useLocalBin ? process.execPath : 'npx';
  const commandArgs = useLocalBin ? [WRANGLER_BIN, ...args] : ['wrangler', ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Parse wrangler's JSON output, tolerating a banner printed on stdout. */
function parseWranglerJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`wrangler produced no JSON array:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

/** Run one read-only query and return its rows. */
function query(sql) {
  const result = runWrangler([
    'd1',
    'execute',
    DATABASE_NAME,
    '--local',
    '--config',
    WRANGLER_CONFIG,
    '--command',
    sql,
    '--json',
  ]);
  if (result.status !== 0) {
    throw new Error(`query failed (${result.status}): ${sql}\n${result.stderr || result.stdout}`);
  }
  const payload = parseWranglerJson(result.stdout);
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || first.success !== true) {
    throw new Error(`query did not succeed: ${sql}\n${result.stdout}`);
  }
  return first.results ?? [];
}

/** Run one scalar query and return its single value. */
function scalar(sql) {
  const rows = query(sql);
  if (rows.length !== 1) {
    throw new Error(`expected exactly one row from: ${sql}`);
  }
  const row = rows[0];
  const keys = Object.keys(row);
  if (keys.length !== 1) {
    throw new Error(`expected exactly one column from: ${sql}`);
  }
  return row[keys[0]];
}

const results = [];

function check(name, expected, actual) {
  const ok = expected === actual;
  results.push({ name, expected: String(expected), actual: String(actual), ok });
  return ok;
}

function checkTrue(name, ok, detail) {
  results.push({ name, expected: 'true', actual: ok ? 'true' : `false (${detail ?? 'assertion failed'})`, ok });
  return ok;
}

// ---------------------------------------------------------------------------
// 1. Reset the local database so the assertion runs against nothing.
// ---------------------------------------------------------------------------
for (const stateDir of [
  path.join(REPO_ROOT, '.wrangler', 'state'),
  path.join(REPO_ROOT, 'apps', 'worker', '.wrangler', 'state'),
]) {
  if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 2. Apply the migrations to the empty database.
// ---------------------------------------------------------------------------
const listResult = runWrangler([
  'd1',
  'migrations',
  'list',
  DATABASE_NAME,
  '--local',
  '--config',
  WRANGLER_CONFIG,
]);
if (listResult.status !== 0) {
  console.error('FAIL: `wrangler d1 migrations list` failed.');
  console.error(listResult.stderr || listResult.stdout);
  process.exit(1);
}

// `wrangler d1 migrations apply` succeeds when there is nothing to apply, so
// the migration list itself must be checked. Otherwise a mis-pointed
// migrations_dir would produce an empty database and a misleading PASS.
if (!/0001_init\.sql/.test(listResult.stdout) || !/0002_story-retention\.sql/.test(listResult.stdout)) {
  console.error('FAIL: the complete shared/db migration chain was not found in the migrations directory.');
  console.error(listResult.stdout);
  process.exit(1);
}

const applyResult = runWrangler([
  'd1',
  'migrations',
  'apply',
  DATABASE_NAME,
  '--local',
  '--config',
  WRANGLER_CONFIG,
]);
if (applyResult.status !== 0) {
  console.error('FAIL: `wrangler d1 migrations apply` failed on an empty database.');
  console.error(applyResult.stderr || applyResult.stdout);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Apply the seed.
// ---------------------------------------------------------------------------
const seedResult = runWrangler([
  'd1',
  'execute',
  DATABASE_NAME,
  '--local',
  '--config',
  WRANGLER_CONFIG,
  '--file',
  path.join('shared', 'db', 'seed.sql'),
]);
if (seedResult.status !== 0) {
  console.error('FAIL: `wrangler d1 execute --file shared/db/seed.sql` failed.');
  console.error(seedResult.stderr || seedResult.stdout);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Assert the schema and the seed.
// ---------------------------------------------------------------------------
// `GLOB` is used rather than `LIKE` because GLOB has no implicit single-
// character wildcard: `sqlite_*` matches exactly the SQLite-internal objects
// and `_cf_*` matches exactly Cloudflare's own `_cf_METADATA` table, which
// D1 creates by itself and which is not part of this schema.
const tableCount = scalar(
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name <> 'd1_migrations'",
);
check('tables (excluding sqlite_*, _cf_* and d1_migrations)', TABLE_COUNT, tableCount);

const indexCount = scalar(
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name NOT GLOB 'sqlite_*'",
);
check('named indexes', INDEX_COUNT, indexCount);

const indexNames = new Set(
  query("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT GLOB 'sqlite_*'").map(
    (row) => row.name,
  ),
);
for (const required of REQUIRED_INDEXES) {
  checkTrue(`index exists: ${required}`, indexNames.has(required), 'missing from sqlite_master');
}

const editorialSql = query(
  "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_clusters_editorial'",
).map((row) => row.sql ?? '');
checkTrue(
  'idx_clusters_editorial is a PARTIAL index',
  editorialSql.length === 1 && /\bwhere\b/i.test(editorialSql[0]),
  `sql was ${JSON.stringify(editorialSql)}`,
);

check('editions', 8, scalar('SELECT COUNT(*) AS n FROM editions'));
check('sections', 8, scalar('SELECT COUNT(*) AS n FROM sections'));
check('edition_sections', 64, scalar('SELECT COUNT(*) AS n FROM edition_sections'));
check('sources', 30, scalar('SELECT COUNT(*) AS n FROM sources'));
check(
  'sources with terms_status <> unverified',
  0,
  scalar("SELECT COUNT(*) AS n FROM sources WHERE terms_status <> 'unverified'"),
);
check('sources with a NULL terms_status', 0, scalar('SELECT COUNT(*) AS n FROM sources WHERE terms_status IS NULL'));

// Every seeded source must sit in the allow-listed country set, so a typo in
// the registry cannot silently create a country the site does not publish.
const distinctCountries = query('SELECT DISTINCT country_code FROM sources ORDER BY country_code').map(
  (row) => row.country_code,
);
check('distinct source countries', 7, distinctCountries.length);
checkTrue(
  'source countries are GB, US, AU, CA, IE, NZ, IN',
  ['GB', 'US', 'AU', 'CA', 'IE', 'NZ', 'IN'].every((code) => distinctCountries.includes(code)),
  `found ${distinctCountries.join(', ')}`,
);

// ---------------------------------------------------------------------------
// 5. Prove the locked 30-day prune contract on the effective migration shape.
// ---------------------------------------------------------------------------
query("INSERT INTO clusters (id, slug, canonical_headline, published_at, first_seen_at, last_seen_at) VALUES (9001, 'verify-retention', 'Retention proof', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')");
query("INSERT INTO topics (id, slug, name) VALUES (9001, 'verify-retention', 'Retention proof')");
query("INSERT INTO entities (id, slug, name, type) VALUES (9001, 'verify-retention', 'Retention proof', 'event')");
query("INSERT INTO stories (id, cluster_id, source_id, external_guid, headline, url, slug, published_at, fetched_at, simhash_hi, simhash_lo, band0, band1, band2, band3, country_code) VALUES (9001, 9001, 1, 'verify-retention', 'Retention proof', 'https://example.test/retention', 'retention-proof', '2026-09-01T00:00:00Z', '2026-09-01T00:01:00Z', 2147483648, 1, 0, 0, 0, 0, 'GB')");
query("INSERT INTO story_sources (cluster_id, source_id, rank, headline, url, published_at) VALUES (9001, 1, 0, 'Retention proof', 'https://example.test/retention', '2026-09-01T00:00:00Z')");
query('INSERT INTO story_topics (story_id, topic_id) VALUES (9001, 9001)');
query('INSERT INTO story_entities (story_id, entity_id) VALUES (9001, 9001)');
query("INSERT INTO images (id, story_id, source_url, content_hash) VALUES (9001, 9001, 'https://example.test/retention.jpg', 'retention-proof')");
query('DELETE FROM stories WHERE id = 9001');

check('pruned raw story', 0, scalar('SELECT COUNT(*) AS n FROM stories WHERE id = 9001'));
check('pruned story topics', 0, scalar('SELECT COUNT(*) AS n FROM story_topics WHERE story_id = 9001'));
check('pruned story entities', 0, scalar('SELECT COUNT(*) AS n FROM story_entities WHERE story_id = 9001'));
check('pruned story images', 0, scalar('SELECT COUNT(*) AS n FROM images WHERE story_id = 9001'));
check('permanent attribution survives prune', 1, scalar('SELECT COUNT(*) AS n FROM story_sources WHERE cluster_id = 9001 AND source_id = 1'));
check('foreign-key violations', 0, query('PRAGMA foreign_key_check').length);

// ---------------------------------------------------------------------------
// 6. Report.
// ---------------------------------------------------------------------------
const pad = (value, width) => String(value).padEnd(width);
const failures = results.filter((result) => !result.ok);

console.log('');
console.log('D1 local verification — meridian');
console.log('='.repeat(78));
console.log(`${pad('ASSERTION', 52)}${pad('EXPECTED', 10)}${pad('ACTUAL', 16)}RESULT`);
console.log('-'.repeat(78));
for (const result of results) {
  console.log(
    `${pad(result.name, 52)}${pad(result.expected, 10)}${pad(result.actual, 16)}${result.ok ? 'PASS' : 'FAIL'}`,
  );
}
console.log('-'.repeat(78));
console.log(
  `${results.length - failures.length}/${results.length} assertions passed.`,
);
console.log('');

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} assertion(s) failed.`);
  process.exit(1);
}

console.log('PASS: the D1 schema applies to an empty database and the seed is complete.');
process.exit(0);
