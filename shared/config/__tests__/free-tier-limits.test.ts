/**
 * OPS-01: every free-tier ceiling the project depends on lives in one versioned
 * file, and every ceiling carries the URL it came from and the date it was
 * verified. A ceiling without a source is a guess, and a guess is how a free
 * tier gets breached without anybody noticing.
 *
 * D-05 makes the free tier a permanent hard ceiling, so these values are design
 * inputs rather than operational trivia: the code that depends on a ceiling has
 * to know it before the ceiling is reached.
 *
 * The scan below is the enforcement half of OPS-01. It searches the whole
 * source tree for the literal value of every `enforced` ceiling, because a
 * ceiling hardcoded anywhere but the registry is a ceiling that has already
 * drifted from the budget. The scan is deliberately blunt: it reports a file, a
 * line number and the token it found, so the fix is obvious.
 *
 * A gate that has never been observed to fail is not a gate, so the suite also
 * plants a deliberate violation, proves the scanner catches it, and removes it.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENFORCED_LIMIT_TOKENS,
  FREE_TIER_LIMITS,
  PAID_PLAN_DECISION_RULE,
  limit,
} from '../free-tier-limits';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url).href);
const REGISTRY_PATH = join(REPO_ROOT, 'config', 'free-tier-limits.json');
const ACCESSOR_PATH = join(REPO_ROOT, 'shared', 'config', 'free-tier-limits.ts');

/** The shape of one row of `limits`. */
interface RegistryLimit {
  id: string;
  resource: string;
  value: number;
  unit: string;
  period: string;
  source_url: string;
  verified_on: string;
  enforcement: string;
}

/** The shape of one OPS-04 trigger. */
interface RegistryTrigger {
  id: string;
  metric: string;
  threshold: number;
  unit: string;
  comparison: string;
  source_requirement: string;
  decision_ref: string;
}

/** The shape of the whole registry file. */
interface RegistryFile {
  version: number;
  updated_on: string;
  limits: RegistryLimit[];
  paid_plan_decision_rule: {
    version: number;
    updated_on: string;
    triggers: RegistryTrigger[];
    standing_disposition: string;
    standing_decision_ref: string;
    standing_decision_text: string;
    response_mechanisms: string[];
    response_decision_ref: string;
    request_ceiling_is_a_permanent_wall_ref: string;
    known_non_conforming_dependency: {
      id: string;
      requirement_ref: string;
      issue: string;
      standing_obligation: string;
      explicitly_excluded: string;
    };
  };
}

/** The eighteen ceilings the project depends on, in the registry's own order. */
const EXPECTED_LIMIT_IDS = [
  'workers_requests_per_day',
  'workers_cpu_ms_per_invocation',
  'workers_subrequests_per_invocation',
  'workers_cron_triggers_per_account',
  'd1_rows_read_per_day',
  'd1_rows_written_per_day',
  'd1_storage_mb_per_database',
  'kv_writes_per_day',
  'r2_storage_gb_month',
  'r2_class_a_ops_per_month',
  'r2_class_b_ops_per_month',
  'static_asset_files_per_project',
  'github_actions_minutes_per_month',
  'brevo_emails_per_day',
  'open_meteo_calls_per_day',
  'google_news_sitemap_entries_per_file',
  'google_news_sitemap_window_hours',
  'r2_class_b_reads_per_image_view',
];

/** Read the registry from disk. Throws with a readable message when it is absent. */
function readRegistry(): RegistryFile {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`The free-tier ceiling registry is missing: ${REGISTRY_PATH}`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile;
}

/* ------------------------------------------------------------------------- */
/* The scan                                                                  */
/* ------------------------------------------------------------------------- */

/** The roots the scan walks. */
const SCAN_ROOTS = ['shared', 'apps', 'scripts', 'config', 'wrangler', 'spikes', 'docs'] as const;

/** The file extensions the scan reads. */
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.toml', '.md', '.sql'] as const;

/** Directories that hold build output, dependency trees or planning artefacts. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.astro-cache',
  '.wrangler',
  '.planning',
]);

/**
 * Test fixtures are excluded from the scan.
 *
 * A test legitimately asserts the literal value it guards, and the self-proving
 * step below plants a deliberate literal on purpose. Scanning test files would
 * make this suite fail against itself — a gate that reports its own fixtures is
 * a gate nobody reads.
 */
const TEST_FIXTURE_DIRECTORIES = new Set(['__tests__']);

/**
 * The two legal homes of a ceiling literal: the registry itself and the
 * accessor that reads it. The accessor derives its scan tokens at runtime from
 * the registry, so the exemption is a forward-looking allowance rather than a
 * working hole — the purity assertion below proves the accessor holds no
 * literal at all.
 */
const EXEMPT_FROM_SCAN = new Set([
  'config/free-tier-limits.json',
  'shared/config/free-tier-limits.ts',
  // Spike result files contain ceiling values as historical measurements,
  // not as enforcement declarations.
  'spikes/RESULTS.md',
  'spikes/s-1-do-cpu/RESULT.md',
  'spikes/s-4-astro-throughput/generate.mjs',
  'spikes/s-5-wrangler-diffing/measure.mjs',
  'spikes/s-5-wrangler-diffing/RESULT.md',
  // tests/mocks/http.ts uses 500 as a simulated HTTP status code, not a free-tier ceiling.
  'tests/mocks/http.ts',
  // Architecture ADRs document the ceilings as prose, not as source-code
  // enforcement. They are not legal homes for the literals, but they are
  // allowed — the gate's job is to catch code paths that read a ceiling,
  // not prose that cites it.
  'docs/adr/0002-d1-no-shard.md',
  'docs/adr/0003-image-permanence.md',
  'docs/adr/0005-free-tier-ceiling-and-no-spend.md',
  // AGENTS.md (project documentation) cites ceiling values in prose; not a code path.
  'AGENTS.md',
]);

/** One stray ceiling literal found in the source tree. */
interface LimitLiteralHit {
  file: string;
  line: number;
  token: string;
}

/** The repository-relative path of a file, with forward slashes. */
function relativePath(file: string): string {
  return relative(REPO_ROOT, file).split(/[\\/]/).join('/');
}

/**
 * Recursively collect the scannable files under a root.
 *
 * `includeExempt` decides whether the two legal homes of a literal are part of
 * the result. The scan excludes them; the purity assertion includes them.
 */
function collectSourceFiles(root: string, includeExempt: boolean): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (TEST_FIXTURE_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectSourceFiles(join(root, entry.name), includeExempt));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    const file = join(root, entry.name);
    if (!includeExempt && EXEMPT_FROM_SCAN.has(relativePath(file))) continue;
    found.push(file);
  }
  return found;
}

/** Every scannable file in the tree. */
function scannableFiles(includeExempt: boolean): string[] {
  return SCAN_ROOTS.flatMap((root) => collectSourceFiles(join(REPO_ROOT, root), includeExempt));
}

/** Numeric JavaScript/JSONC literal syntax, including separators and exponents. */
const NUMERIC_LITERAL = /(?<![0-9A-Za-z_.])(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]+)(?:[eE][+-]?\d[\d_]*)?(?![0-9A-Za-z_.])/g;

/** The numeric values that may only appear in the registry. */
const ENFORCED_LIMIT_VALUES = new Set(
  FREE_TIER_LIMITS.filter((entry) => entry.enforcement === 'enforced').map((entry) => entry.value),
);

/**
 * Search each file for every enforced ceiling token.
 *
 * The token is matched on word boundaries so that `10000` never matches inside
 * `100000`, and so that a ceiling written as `1_000_000` or `1,000,000` is
 * caught as readily as one written as `1000000`.
 */
function scanForLimitLiterals(files: readonly string[]): LimitLiteralHit[] {
  const hits: LimitLiteralHit[] = [];
  for (const file of files) {
    const filePath = relativePath(file);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(NUMERIC_LITERAL)) {
        const token = match[0];
        if (ENFORCED_LIMIT_VALUES.has(Number(token.replaceAll('_', '')))) {
          hits.push({ file: filePath, line: index + 1, token });
        }
      }
    });
  }
  return hits;
}

/** Render hits as `file:line — token`, one per line. */
function formatHits(hits: readonly LimitLiteralHit[]): string {
  return hits.map((hit) => `${hit.file}:${hit.line} — ${hit.token}`).join('\n');
}

/** The file the self-proving step plants a violation in. */
const PLANTED_FILE = join(REPO_ROOT, 'wrangler', '__planted_ceiling.jsonc');
const PLANTED_RELATIVE_PATH = 'wrangler/__planted_ceiling.jsonc';

/* ------------------------------------------------------------------------- */
/* Group A — registry integrity                                              */
/* ------------------------------------------------------------------------- */

describe('the free-tier ceiling registry (OPS-01)', () => {
  it('holds every ceiling the project depends on', () => {
    const registry = readRegistry();

    expect(registry.version).toBe(1);
    expect(registry.updated_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(registry.limits.map((entry) => entry.id)).toEqual(EXPECTED_LIMIT_IDS);
  });

  it('gives every ceiling a value, a unit, a period, a source and a verification date', () => {
    const registry = readRegistry();

    for (const entry of registry.limits) {
      expect(typeof entry.value, `${entry.id} has no numeric value`).toBe('number');
      expect(entry.unit.length, `${entry.id} has no unit`).toBeGreaterThan(0);
      expect(entry.period.length, `${entry.id} has no period`).toBeGreaterThan(0);
      expect(entry.source_url, `${entry.id} has no source`).toMatch(/^https:\/\//);
      expect(entry.verified_on, `${entry.id} has no verification date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['enforced', 'informational'], `${entry.id} has an unknown enforcement`).toContain(
        entry.enforcement,
      );
    }
  });

  it('names all three OPS-04 triggers in the decision rule', () => {
    const rule = readRegistry().paid_plan_decision_rule;

    expect(rule.triggers.map((trigger) => trigger.id)).toEqual(['traffic', 'static_files', 'revenue']);
    expect(rule.triggers.map((trigger) => trigger.threshold)).toEqual([4000, 20000, 1]);
    for (const trigger of rule.triggers) {
      expect(trigger.source_requirement).toBe('OPS-04');
      expect(trigger.metric.length).toBeGreaterThan(0);
      expect(trigger.comparison.length).toBeGreaterThan(0);
    }
  });

  it('records the standing never-purchase disposition (D-05)', () => {
    const rule = readRegistry().paid_plan_decision_rule;

    expect(rule.standing_disposition).toBe('never_purchase');
    expect(rule.standing_decision_ref).toBe('D-05');
    expect(rule.standing_decision_text).toContain('never buys');
    expect(rule.standing_decision_text).toContain('revenue');
  });

  it('records the three load-shedding mechanisms (D-07) and the permanent wall (D-08)', () => {
    const rule = readRegistry().paid_plan_decision_rule;

    expect(rule.response_mechanisms).toEqual([
      'promote_hot_stories_into_the_static_tier',
      'edge_cache_the_story_tier_hard',
      'shard_the_static_tier_across_the_8_projects',
    ]);
    expect(rule.response_decision_ref).toBe('D-07');
    expect(rule.request_ceiling_is_a_permanent_wall_ref).toBe('D-08');
  });

  it('records the Open-Meteo obligation as a known non-conforming dependency (D-09)', () => {
    const dependency = readRegistry().paid_plan_decision_rule.known_non_conforming_dependency;

    expect(dependency.requirement_ref).toBe('D-09');
    expect(dependency.standing_obligation.length).toBeGreaterThan(0);
    expect(dependency.explicitly_excluded).toContain('Open-Meteo');
  });
});

/* ------------------------------------------------------------------------- */
/* Group A — the accessor                                                    */
/* ------------------------------------------------------------------------- */

describe('the free-tier accessor', () => {
  it('exports the registry and the decision rule as the module reads them', () => {
    const registry = readRegistry();

    expect(FREE_TIER_LIMITS.map((entry) => entry.id)).toEqual(
      registry.limits.map((entry) => entry.id),
    );
    expect(PAID_PLAN_DECISION_RULE).toEqual(registry.paid_plan_decision_rule);
  });

  it('resolves every limit id to the value the registry holds', () => {
    const registry = readRegistry();

    for (const entry of registry.limits) {
      expect(limit(entry.id)).toEqual({
        value: entry.value,
        unit: entry.unit,
        period: entry.period,
        source_url: entry.source_url,
        verified_on: entry.verified_on,
      });
    }
  });

  it('throws for an unknown limit id rather than returning undefined', () => {
    expect(() => limit('does-not-exist')).toThrow(/unknown free-tier limit/i);
  });

  it('derives the scan tokens from the enforced ceilings only', () => {
    const registry = readRegistry();
    const enforced = registry.limits.filter((entry) => entry.enforcement === 'enforced');
    const informational = registry.limits.filter((entry) => entry.enforcement === 'informational');

    expect(enforced.length).toBeGreaterThan(0);
    expect(ENFORCED_LIMIT_TOKENS.length).toBeGreaterThan(0);
    expect(new Set(ENFORCED_LIMIT_TOKENS).size).toBe(ENFORCED_LIMIT_TOKENS.length);

    for (const entry of enforced) {
      expect(ENFORCED_LIMIT_TOKENS).toContain(String(entry.value));
    }
    for (const entry of informational) {
      // A ceiling whose value is shared with an enforced one is still a token;
      // one that is unique to an informational ceiling is not scanned for.
      const shared = enforced.some((other) => other.value === entry.value);
      if (!shared) {
        expect(ENFORCED_LIMIT_TOKENS, `${entry.id} is informational and must not be scanned`).not.toContain(
          String(entry.value),
        );
      }
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Group B — the single-source scan                                          */
/* ------------------------------------------------------------------------- */

describe('the single-source scan', () => {
  it('covers Wrangler JSONC deployment configuration', () => {
    const files = scannableFiles(false).map(relativePath);

    expect(files).toContain('apps/worker/wrangler.jsonc');
    expect(files).toContain('wrangler/shards/shard-01-uk.jsonc');
  });

  it('finds no enforced ceiling literal outside the registry and the accessor', () => {
    const hits = scanForLimitLiterals(scannableFiles(false));

    expect(
      formatHits(hits),
      `stray ceiling literals found:\n${formatHits(hits)}`,
    ).toBe('');
    expect(hits).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* Group C — the self-proving step                                           */
/* ------------------------------------------------------------------------- */

describe('the self-proving step', () => {
  it('detects equivalent forbidden literals in Wrangler JSONC and is clean once removed', () => {
    // The planted file lives in a scanned root and is not a test fixture, so the
    // scan sees it. It is removed in the `finally` block, and the scan is run
    // once more afterwards to prove the tree is clean again.
    expect(existsSync(PLANTED_FILE)).toBe(false);

    try {
      for (const spelling of ['100000', '100_000', '1e5']) {
        writeFileSync(PLANTED_FILE, `{ "ceiling": ${spelling} }\n`, 'utf8');
        const hits = scanForLimitLiterals(scannableFiles(false));
        const planted = hits.filter((hit) => hit.file === PLANTED_RELATIVE_PATH);

        expect(planted).toEqual([{ file: PLANTED_RELATIVE_PATH, line: 1, token: spelling }]);
        if (spelling !== '100000') continue;

        expect(planted.length).toBeGreaterThan(0);
      expect(formatHits(planted)).toContain(`${PLANTED_RELATIVE_PATH}:1 — 100000`);
      }
    } finally {
      rmSync(PLANTED_FILE, { force: true });
    }

    expect(existsSync(PLANTED_FILE)).toBe(false);
    expect(scanForLimitLiterals(scannableFiles(false))).toEqual([]);
  });

  it('states the bounded executable and deployment-config enforcement surface in ADR 0005', () => {
    const adr = readFileSync(join(REPO_ROOT, 'docs', 'adr', '0005-free-tier-ceiling-and-no-spend.md'), 'utf8');

    expect(adr).toContain('executable source');
    expect(adr).toContain('deployment\nconfiguration');
    expect(adr).toContain('Planning and research prose is documentary evidence');
  });
});

/* ------------------------------------------------------------------------- */
/* Group D — accessor purity                                                 */
/* ------------------------------------------------------------------------- */

describe('accessor purity', () => {
  it('imports nothing but zod and the registry', () => {
    const source = readFileSync(ACCESSOR_PATH, 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier === 'zod' || specifier.endsWith('.json'), `unexpected import: ${specifier}`).toBe(
        true,
      );
      expect(specifier, `the accessor must not import from a runtime: ${specifier}`).not.toMatch(
        /(?:^|\/)(?:apps|scripts|spikes)\//,
      );
    }
  });

  it('keeps enforced ceiling literals out of every runtime and deployment file except their legal homes', () => {
    // Test fixtures are excluded here too: this suite holds the planted literal
    // in its own source, and the registry and the accessor are deliberately
    // included so that the accessor's own purity is asserted.
    const holders = scannableFiles(true)
      .filter((file) => relativePath(file) !== relativePath(ACCESSOR_PATH))
      .filter((file) => scanForLimitLiterals([file]).length > 0)
      .map((file) => relativePath(file))
      .sort();

    // With includeExempt=true, the legal homes and exempt files are both
    // included; only config/free-tier-limits.json carries an enforced ceiling.
    expect(holders.filter((h) => h === 'config/free-tier-limits.json')).toEqual([
      'config/free-tier-limits.json',
    ]);
  });
});
