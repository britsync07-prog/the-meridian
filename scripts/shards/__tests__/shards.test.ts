/**
 * D-06: the static tier is EIGHT sharded Workers Static Assets projects, one
 * per locale prefix, and the shard matrix is asserted by a test rather than by
 * convention.
 *
 * The matrix is the part of the delivery model that is easiest to get subtly
 * wrong and hardest to notice. A route that points at the wrong project serves
 * the wrong content; a prefix no shard claims 404s; two shards claiming one
 * prefix makes the routing order decide which edition a reader sees. None of
 * that is visible in a review of a JSON file — it is visible in an assertion.
 *
 * Four things are asserted here:
 *
 *   1. The matrix is COMPLETE — eight shards, eight locale prefixes, and the
 *      union of the prefixes is exactly the eight edition prefixes.
 *   2. The matrix is DISJOINT — no two shards claim the same prefix, and no
 *      two projects share a name or a route pattern.
 *   3. The matrix is SAFE — every shard sets `not_found_handling: "none"`,
 *      because `"404-page"` would make the asset layer answer unmatched paths
 *      before the Worker script sees them, swallowing `/story/*` and `/api/*`.
 *      And no shard is a Worker project: none of them has a `main` key.
 *   4. The matrix does not BYPASS the budget — no shard config or shard
 *      script contains a free-tier ceiling literal. The ceilings live in
 *      `config/free-tier-limits.json` and are read by id; a hardcoded file cap
 *      in a shard config would let the static tier silently exceed the ceiling
 *      (OPS-01).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ENFORCED_LIMIT_TOKENS } from '../../../shared/config/free-tier-limits';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url).href);
const SHARDS_DIR = join(REPO_ROOT, 'wrangler', 'shards');
const ROUTE_TABLE_PATH = join(SHARDS_DIR, 'route-table.json');

/** The eight shards, in order. The order is the deploy order. */
const EXPECTED_SHARDS = [
  { shard: '01', project: 'meridian-static-uk', prefix: '/uk/', route: '/uk/*' },
  { shard: '02', project: 'meridian-static-us', prefix: '/us/', route: '/us/*' },
  { shard: '03', project: 'meridian-static-au', prefix: '/au/', route: '/au/*' },
  { shard: '04', project: 'meridian-static-ca', prefix: '/ca/', route: '/ca/*' },
  { shard: '05', project: 'meridian-static-ie', prefix: '/ie/', route: '/ie/*' },
  { shard: '06', project: 'meridian-static-nz', prefix: '/nz/', route: '/nz/*' },
  { shard: '07', project: 'meridian-static-in', prefix: '/in/', route: '/in/*' },
  { shard: '08', project: 'meridian-static-in-hi', prefix: '/in-hi/', route: '/in-hi/*' },
];

/** The eight edition prefixes. The union of the shards must equal this set. */
const EXPECTED_PREFIXES = EXPECTED_SHARDS.map((entry) => entry.prefix);

/**
 * The zone name is a placeholder until a domain exists (D-10).
 *
 * The shards still deploy to `workers.dev` subdomains; the zone routing is
 * asserted by this test rather than by a live deploy, because a zone route
 * against a domain that does not exist cannot be created.
 */
const PLACEHOLDER_ZONE = 'PLACEHOLDER_NO_DOMAIN_YET';

/* ------------------------------------------------------------------------- */
/* Reading the matrix                                                         */
/* ------------------------------------------------------------------------- */

/**
 * Strip a JSONC comment so the route table and the shard configs can be read
 * with `JSON.parse`.
 *
 * The shard configs are `.jsonc` because a `$schema` reference and explanatory
 * comments belong in them, but the comment syntax must not leak into the
 * values the assertions read.
 */
function parseJsonc(source: string): Record<string, unknown> {
  const withoutComments = source
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (match, comment) =>
      comment ? '' : match,
    )
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(withoutComments) as Record<string, unknown>;
}

/** One row of the route table. */
interface RouteTableShard {
  shard: string;
  project: string;
  prefix: string;
  route: string;
}

/** The route table as it is on disk. */
interface RouteTable {
  zone_name: string;
  shards: RouteTableShard[];
  reserved_prefixes: string[];
}

/** Read the route table. */
function readRouteTable(): RouteTable {
  if (!existsSync(ROUTE_TABLE_PATH)) {
    throw new Error(`The route table is missing: ${ROUTE_TABLE_PATH}`);
  }
  return parseJsonc(readFileSync(ROUTE_TABLE_PATH, 'utf8')) as unknown as RouteTable;
}

/** One shard's configuration. */
interface ShardConfig {
  name: string;
  compatibility_date: string;
  assets: {
    directory: string;
    not_found_handling: string;
    html_handling: string;
  };
  routes: { pattern: string; zone_name: string }[];
  main?: string;
  compatibility_flags?: string[];
}

/** The shard config filenames, in deploy order. */
function shardConfigFiles(): string[] {
  if (!existsSync(SHARDS_DIR)) return [];
  return readdirSync(SHARDS_DIR)
    .filter((file) => /^shard-\d{2}-[a-z-]+\.jsonc$/.test(file))
    .sort();
}

/** Read one shard config. */
function readShardConfig(file: string): ShardConfig {
  return parseJsonc(readFileSync(join(SHARDS_DIR, file), 'utf8')) as unknown as ShardConfig;
}

/* ------------------------------------------------------------------------- */
/* The ceiling scan                                                           */
/* ------------------------------------------------------------------------- */

/**
 * The roots the ceiling scan walks.
 *
 * `wrangler/` holds the shard configs, `scripts/shards/` holds the splitter and
 * the deploy script, and `scripts/cloudflare/` holds the R2 lifecycle scripts
 * — the three places where a free-tier ceiling could plausibly be hardcoded.
 */
const SCAN_ROOTS = [
  join(REPO_ROOT, 'wrangler'),
  join(REPO_ROOT, 'scripts', 'shards'),
  join(REPO_ROOT, 'scripts', 'cloudflare'),
] as const;

/**
 * The prose ADRs, checked on their own.
 *
 * ADR 0001 names the eight-project shard and the request ceiling, ADR 0003
 * names the R2 Class B ceiling that D-18's serve-time read is charged
 * against, and ADR 0004 names the free-tier ceiling the permanent no-spend
 * rule lives under. All three are prose that invites a ceiling to be written
 * down. The ceilings live in `config/free-tier-limits.json` and are
 * referenced by id, so a second copy of the number in an ADR would be a
 * second place for the budget to drift.
 */
const PROSE_ADRS = [
  join(REPO_ROOT, 'docs', 'adr', '0001-delivery-model.md'),
  join(REPO_ROOT, 'docs', 'adr', '0003-image-permanence.md'),
  join(REPO_ROOT, 'docs', 'adr', '0004-domain-and-name.md'),
];

/** The file extensions the scan reads. */
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc'] as const;

/** Directories that hold build output, dependency trees or test fixtures. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.astro-cache',
  '.astro',
  '.wrangler',
  '.git',
  '__tests__',
]);

/** The repository-relative path of a file, with forward slashes. */
function relativePath(file: string): string {
  return relative(REPO_ROOT, file).split(/[\\/]/).join('/');
}

/** Recursively collect the scannable files under a root. */
function collectSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectSourceFiles(join(root, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    found.push(join(root, entry.name));
  }
  return found;
}

/**
 * Search each file for every enforced ceiling token.
 *
 * The token is matched on word boundaries so that `10000` never matches inside
 * `100000`, and so that a ceiling written as `1_000_000` or `1,000,000` is
 * caught as readily as one written as `1000000`.
 */
function scanForLimitLiterals(files: readonly string[]): { file: string; line: number; token: string }[] {
  const hits: { file: string; line: number; token: string }[] = [];
  for (const file of files) {
    const filePath = relativePath(file);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const token of ENFORCED_LIMIT_TOKENS) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?<![0-9A-Za-z_])${escaped}(?![0-9A-Za-z_])`);
        if (pattern.test(line)) {
          hits.push({ file: filePath, line: index + 1, token });
        }
      }
    });
  }
  return hits;
}

/** Render hits as `file:line — token`, one per line. */
function formatHits(hits: readonly { file: string; line: number; token: string }[]): string {
  return hits.map((hit) => `${hit.file}:${hit.line} — ${hit.token}`).join('\n');
}

/* ------------------------------------------------------------------------- */
/* Group A — the matrix is complete and disjoint                               */
/* ------------------------------------------------------------------------- */

describe('the eight-project static shard (D-06)', () => {
  it('declares exactly eight shard configurations', () => {
    expect(shardConfigFiles()).toHaveLength(8);
  });

  it('names the eight expected projects, uniquely', () => {
    const names = shardConfigFiles().map((file) => readShardConfig(file).name);

    expect(names).toEqual(EXPECTED_SHARDS.map((entry) => entry.project));
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares the eight expected route patterns, uniquely', () => {
    const patterns = shardConfigFiles().map((file) => {
      const config = readShardConfig(file);
      expect(config.routes, 'a shard must declare exactly one route').toHaveLength(1);
      return config.routes[0].pattern;
    });

    expect(patterns).toEqual(
      EXPECTED_SHARDS.map((entry) => `${PLACEHOLDER_ZONE}${entry.route}`),
    );
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('covers the eight edition prefixes exactly, with no shard claiming the same prefix twice', () => {
    const table = readRouteTable();
    const prefixes = table.shards.map((entry) => entry.prefix);

    expect(prefixes.sort()).toEqual([...EXPECTED_PREFIXES].sort());
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('keeps the route table and the shard configs in agreement', () => {
    const table = readRouteTable();
    const files = shardConfigFiles();

    expect(table.shards).toHaveLength(files.length);
    expect(table.zone_name).toBe(PLACEHOLDER_ZONE);

    for (const [index, entry] of table.shards.entries()) {
      const config = readShardConfig(files[index]);

      expect(config.name, `${files[index]} must be the project the table names`).toBe(entry.project);
      expect(config.routes[0].pattern, `${files[index]} must carry the table's route`).toBe(
        `${table.zone_name}${entry.route}`,
      );
      expect(config.routes[0].zone_name).toBe(table.zone_name);
    }
  });

  it('reserves the R2 story tier and leaves all other top-level output global', () => {
    const table = readRouteTable();

    expect(table.reserved_prefixes).toEqual(['story']);
    expect(table.shards.map((shard) => shard.prefix.replace(/^\//, '').replace(/\/$/, ''))).not.toContain('story');
  });
});

/* ------------------------------------------------------------------------- */
/* Group B — the matrix is safe                                              */
/* ------------------------------------------------------------------------- */

describe('the shard configurations are safe', () => {
  it('sets not_found_handling to none on every shard', () => {
    // "404-page" would make the asset layer answer unmatched paths before the
    // Worker script sees them, swallowing /story/* and /api/*.
    for (const file of shardConfigFiles()) {
      expect(readShardConfig(file).assets.not_found_handling, file).toBe('none');
    }
  });

  it('is assets-only — no shard declares a main entry point', () => {
    for (const file of shardConfigFiles()) {
      const config = readShardConfig(file);
      expect(config.main, `${file} must not have a main key`).toBeUndefined();
    }
  });

  it('points each shard at its own split output directory', () => {
    const files = shardConfigFiles();

    for (const [index, file] of files.entries()) {
      const config = readShardConfig(file);
      const expectedShard = EXPECTED_SHARDS[index].shard;

      expect(config.assets.directory.replace(/\\/g, '/'), file).toMatch(
        new RegExp(`/shards/shard-${expectedShard}$`),
      );
    }
  });

  it('declares no compatibility flags beyond the table allows', () => {
    // The shards are assets-only projects with no Worker code, so they need no
    // compatibility flags. A flag here is an undeclared behaviour change.
    for (const file of shardConfigFiles()) {
      const config = readShardConfig(file);
      expect(config.compatibility_flags ?? [], file).toEqual([]);
    }
  });

  it('uses the same compatibility date on every shard', () => {
    const dates = shardConfigFiles().map((file) => readShardConfig(file).compatibility_date);

    expect(new Set(dates).size).toBe(1);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ------------------------------------------------------------------------- */
/* Group C — the matrix does not bypass the budget registry                   */
/* ------------------------------------------------------------------------- */

describe('no shard config or shard script hardcodes a free-tier ceiling', () => {
  it('finds no enforced ceiling literal in wrangler/, scripts/shards/ or scripts/cloudflare/', () => {
    const files = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root));
    const hits = scanForLimitLiterals(files);

    expect(formatHits(hits), `stray ceiling literals found:\n${formatHits(hits)}`).toBe('');
    expect(hits).toEqual([]);
  });

  it('has tokens to scan for — the gate is not vacuous', () => {
    expect(ENFORCED_LIMIT_TOKENS.length).toBeGreaterThan(0);
  });

  it('keeps every ceiling literal out of the prose ADRs', () => {
    for (const adr of PROSE_ADRS) {
      expect(existsSync(adr)).toBe(true);

      const hits = scanForLimitLiterals([adr]);

      expect(formatHits(hits), `stray ceiling literals in ${relativePath(adr)}:\n${formatHits(hits)}`).toBe(
        '',
      );
    }
  });
});
