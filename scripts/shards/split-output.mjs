#!/usr/bin/env node
/**
 * split-output.mjs — the build-time splitter that partitions one Astro build
 * into eight shard directories.
 *
 * D-06 makes the static tier eight sharded Workers Static Assets projects,
 * one per locale prefix. One Astro build produces one output directory; this
 * script turns it into eight, each holding the pages its own locale prefix
 * serves, PLUS a copy of every global surface.
 *
 * The duplication is deliberate. The global surfaces — the edition picker at
 * `/`, `/topic/*`, `/entity/*`, `/sitemap*`, `/rss/*`, `/robots.txt`, the fonts
 * and the CSS — are served from every shard, so whichever project's route
 * receives a request, the file is already there. It costs a few dozen files
 * per shard against a file budget measured in tens of thousands, and it
 * removes every cross-project dependency from the static tier. A request that
 * has to be fetched from another project is a request that can fail.
 *
 * The splitter uses only `node:fs` and `node:path`: it runs in CI, in plain
 * Node, with no bundler and no dependency tree.
 *
 * Usage:  node scripts/shards/split-output.mjs [BUILD_DIR]
 * Exit:   0 when every shard directory exists after the split, 1 otherwise.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The route table — the single source of truth for the shard matrix. */
const ROUTE_TABLE_PATH = path.join(REPO_ROOT, 'wrangler', 'shards', 'route-table.json');

/** The free-tier ceiling registry. The file cap is read from here, by id. */
const LIMITS_PATH = path.join(REPO_ROOT, 'config', 'free-tier-limits.json');

/** The registry id of the per-project static asset file ceiling. */
const FILE_CAP_LIMIT_ID = 'static_asset_files_per_project';

/** The default Astro build output directory. */
const DEFAULT_BUILD_DIR = path.join('apps', 'site', 'dist');

/* ------------------------------------------------------------------------- */
/* Reading the inputs                                                         */
/* ------------------------------------------------------------------------- */

/** Read the route table. */
function readRouteTable() {
  if (!existsSync(ROUTE_TABLE_PATH)) {
    throw new Error(`The route table is missing: ${ROUTE_TABLE_PATH}`);
  }
  return JSON.parse(readFileSync(ROUTE_TABLE_PATH, 'utf8'));
}

/**
 * Read one ceiling from the registry, by id.
 *
 * The ceiling value lives in exactly one place — `config/free-tier-limits.json`
 * — and is read here by its id rather than written into this file. A number
 * written into this script would be a second copy of the budget, and the copy
 * would drift from the registry the moment either one changed. The scan test
 * in `scripts/shards/__tests__/shards.test.ts` fails the build if a literal
 * ceiling ever appears in this directory.
 */
function readFileCap() {
  if (!existsSync(LIMITS_PATH)) {
    throw new Error(`The free-tier ceiling registry is missing: ${LIMITS_PATH}`);
  }
  const registry = JSON.parse(readFileSync(LIMITS_PATH, 'utf8'));
  const limit = registry.limits.find((entry) => entry.id === FILE_CAP_LIMIT_ID);
  if (!limit) {
    throw new Error(`The registry has no limit with id "${FILE_CAP_LIMIT_ID}".`);
  }
  return limit.value;
}

/* ------------------------------------------------------------------------- */
/* Counting                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Count the files under a path, recursively.
 *
 * The count is of FILES, not entries: a directory is not a static asset, and
 * the ceiling counts uploaded objects. A path that is a file counts as one
 * file, and a path that does not exist counts as none.
 */
function countFiles(target) {
  if (!existsSync(target)) return 0;

  const stats = statSync(target);
  if (!stats.isDirectory()) return 1;

  let total = 0;
  const entries = readdirSync(target, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(full);
    } else if (entry.isFile()) {
      total += 1;
    }
  }
  return total;
}

/* ------------------------------------------------------------------------- */
/* The split                                                                  */
/* ------------------------------------------------------------------------- */

const buildDirArg = process.argv[2];
const buildDir = path.resolve(REPO_ROOT, buildDirArg ?? DEFAULT_BUILD_DIR);

if (!existsSync(buildDir)) {
  console.error(`FAIL: the build output directory does not exist: ${buildDir}`);
  console.error('Run `npm run build` first — the splitter partitions a finished build.');
  process.exit(1);
}

const table = readRouteTable();
const fileCap = readFileCap();

/** Where every shard's output directory lives. */
const shardsRoot = path.join(buildDir, 'shards');

console.log(`splitting ${path.relative(REPO_ROOT, buildDir)} into ${table.shards.length} shards`);
console.log(`per-shard file ceiling: ${fileCap} (registry id "${FILE_CAP_LIMIT_ID}")`);
console.log('');

// The shard directories are rebuilt from scratch on every run. A stale file
// left behind by a previous build would be uploaded to the edge and would
// count against the ceiling for as long as it existed.
if (existsSync(shardsRoot)) {
  rmSync(shardsRoot, { recursive: true, force: true });
}
mkdirSync(shardsRoot, { recursive: true });

const rows = [];

for (const shard of table.shards) {
  const shardDir = path.join(shardsRoot, `shard-${shard.shard}`);
  mkdirSync(shardDir, { recursive: true });

  /* The shard's own locale pages. */
  const prefixDir = path.join(buildDir, shard.prefix.replace(/^\//, '').replace(/\/$/, ''));
  let localeFiles = 0;
  if (existsSync(prefixDir)) {
    cpSync(prefixDir, path.join(shardDir, path.basename(prefixDir)), { recursive: true });
    localeFiles = countFiles(path.join(shardDir, path.basename(prefixDir)));
  }

  /* The global surfaces, duplicated into every shard. */
  let globalFiles = 0;
  const missingGlobal = [];
  for (const surface of table.global_surfaces) {
    const source = path.join(buildDir, surface);
    if (!existsSync(source)) {
      missingGlobal.push(surface);
      continue;
    }
    const destination = path.join(shardDir, surface);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
    globalFiles += countFiles(destination);
  }

  const total = countFiles(shardDir);
  rows.push({
    shard: shard.shard,
    project: shard.project,
    prefix: shard.prefix,
    localeFiles,
    globalFiles,
    total,
    overCap: total > fileCap,
    missingGlobal,
  });
}

/* ------------------------------------------------------------------------- */
/* The report                                                                 */
/* ------------------------------------------------------------------------- */

const header = ['shard', 'project', 'prefix', 'locale', 'global', 'total'];
const body = rows.map((row) => [
  row.shard,
  row.project,
  row.prefix,
  String(row.localeFiles),
  String(row.globalFiles),
  String(row.total),
]);
const widths = header.map((cell, index) =>
  Math.max(cell.length, ...body.map((cells) => cells[index].length)),
);
const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');

console.log(line(header));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const cells of body) console.log(line(cells));

const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
console.log('');
console.log(`total files across all shards: ${grandTotal}`);

/* ------------------------------------------------------------------------- */
/* The guards                                                                 */
/* ------------------------------------------------------------------------- */

/* Every shard directory must exist after the split. */
const missing = rows.filter((row) => !existsSync(path.join(shardsRoot, `shard-${row.shard}`)));
if (missing.length > 0) {
  console.error(
    `FAIL: ${missing.length} shard director${missing.length === 1 ? 'y is' : 'ies are'} missing after the split: ` +
      missing.map((row) => `shard-${row.shard}`).join(', '),
  );
  process.exit(1);
}

/* No shard may exceed the per-project file ceiling. */
const overCap = rows.filter((row) => row.overCap);
if (overCap.length > 0) {
  for (const row of overCap) {
    console.error(
      `FAIL: shard-${row.shard} (${row.project}) holds ${row.total} files, over the per-project ceiling ` +
        `of ${fileCap} (registry id "${FILE_CAP_LIMIT_ID}").`,
    );
  }
  console.error('The static tier would exceed the free allowance. Raise the build budget consciously, or shard further.');
  process.exit(1);
}

/* A missing global surface is reported once, not once per shard. */
const missingGlobals = [
  ...new Set(rows.flatMap((row) => row.missingGlobal)),
].sort();
if (missingGlobals.length > 0) {
  console.log(
    `note: the build output has no ${missingGlobals.join(', ')} — those surfaces are produced in a later phase.`,
  );
}

console.log('');
console.log(
  `OK: ${rows.length} shard directories, the largest holding ` +
    `${Math.max(...rows.map((row) => row.total))} files against a ceiling of ${fileCap}.`,
);
