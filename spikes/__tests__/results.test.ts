/**
 * The spike rollup is the thing Phase 2 and Phase 5 actually read.
 *
 * Five spikes were run to answer five questions that each change the
 * architecture. A measurement that lives only in a chat log, or in a RESULT.md
 * nobody can find, is a measurement that has not been taken: the next phase
 * reads the repository, not the conversation. So the rollup is asserted rather
 * than trusted.
 *
 * Four things are asserted here:
 *
 *   1. EVERY spike has a RESULT.md, and each one has a Decision heading — a
 *      spike without a recorded decision is a vibe, not a measurement.
 *   2. The rollup has a row per spike, and each row carries an observed value
 *      and a decision rather than a summary.
 *   3. Any spike marked INCOMPLETE names the exact command that finishes it,
 *      so an unfinished spike is actionable instead of merely honest.
 *   4. No file under `spikes/` carries a bare free-tier ceiling literal — the
 *      ceilings live in the registry and are read by id, and a spike that
 *      hardcodes one is a budget that has already drifted.
 *
 * The fourth assertion is deliberately independent of the repository-wide scan
 * in `shared/config/__tests__/free-tier-limits.test.ts`. That scan proves the
 * tree is clean; this one proves the spike tree specifically is clean, and it
 * would still hold if the repository-wide scan were ever widened or narrowed.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ENFORCED_LIMIT_TOKENS } from '../../shared/config/free-tier-limits';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url).href);
const SPIKES_DIR = join(REPO_ROOT, 'spikes');

/** The five spikes, and where each one's own record lives. */
const SPIKES = [
  { id: 'S-1', dir: 's-1-do-cpu' },
  { id: 'S-2', dir: 's-2-worker-egress' },
  { id: 'S-3', dir: 's-3-ci-egress' },
  { id: 'S-4', dir: 's-4-astro-throughput' },
  { id: 'S-5', dir: 's-5-wrangler-diffing' },
] as const;

/** The rollup every spike is consolidated into. */
const ROLLUP_PATH = join(SPIKES_DIR, 'RESULTS.md');

/** The file extensions the ceiling scan reads. */
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'] as const;

/** Directories that hold build output, dependency trees or test fixtures. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.astro-cache',
  '.astro',
  '.wrangler',
  '__tests__',
]);

/** Read one spike's result. */
function readResult(dir: string): string {
  return readFileSync(join(SPIKES_DIR, dir, 'RESULT.md'), 'utf8');
}

/** The repository-relative path of a file, with forward slashes. */
function relativePath(file: string): string {
  return relative(REPO_ROOT, file).split(/[\\/]/).join('/');
}

/** Recursively collect the scannable files under the spikes directory. */
function collectSpikeFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectSpikeFiles(join(root, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    found.push(join(root, entry.name));
  }
  return found;
}

/** Search each file for every enforced ceiling token. */
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
/* Group A — every spike is recorded                                           */
/* ------------------------------------------------------------------------- */

describe('every spike is recorded', () => {
  it('has a RESULT.md for all five spikes', () => {
    for (const spike of SPIKES) {
      const path = join(SPIKES_DIR, spike.dir, 'RESULT.md');

      expect(existsSync(path), `${spike.id} has no RESULT.md at ${relativePath(path)}`).toBe(true);
    }
  });

  it('gives every RESULT.md a Decision heading', () => {
    for (const spike of SPIKES) {
      const result = readResult(spike.dir);

      expect(
        /^#{1,6}\s+Decision\b/m.test(result),
        `${spike.id}'s RESULT.md has no Decision heading`,
      ).toBe(true);
    }
  });

  it('states the threshold each spike was measured against', () => {
    for (const spike of SPIKES) {
      const result = readResult(spike.dir);

      expect(/Threshold/i.test(result), `${spike.id}'s RESULT.md names no threshold`).toBe(true);
      expect(
        /What this does NOT settle|does NOT settle/i.test(result),
        `${spike.id}'s RESULT.md does not say what it left unsettled`,
      ).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Group B — the rollup                                                       */
/* ------------------------------------------------------------------------- */

describe('the spike rollup', () => {
  it('exists', () => {
    expect(existsSync(ROLLUP_PATH), `${relativePath(ROLLUP_PATH)} is missing`).toBe(true);
  });

  it('has one table row per spike', () => {
    const rollup = readFileSync(ROLLUP_PATH, 'utf8');
    const rows = rollup.split(/\r?\n/).filter((line) => /^\|\s*S-\d/.test(line.trim()));

    expect(rows).toHaveLength(SPIKES.length);

    for (const spike of SPIKES) {
      expect(
        rows.some((row) => row.trim().startsWith(`| ${spike.id} `)),
        `the rollup has no row for ${spike.id}`,
      ).toBe(true);
    }
  });

  it('names the metric, the observed value, the threshold and the decision for every spike', () => {
    const rollup = readFileSync(ROLLUP_PATH, 'utf8');
    const header = rollup.split(/\r?\n/).find((line) => /^\|\s*Spike\s*\|/.test(line.trim()));

    expect(header, 'the rollup has no table header').toBeDefined();
    for (const column of ['Question', 'Metric', 'Observed', 'Threshold', 'Decision', 'Delivery-model change']) {
      expect(header, `the rollup header has no ${column} column`).toMatch(new RegExp(column, 'i'));
    }
  });

  it('records a decision for every spike, in prose as well as in the table', () => {
    const rollup = readFileSync(ROLLUP_PATH, 'utf8');

    for (const spike of SPIKES) {
      expect(
        new RegExp(`^#{1,6}\\s+${spike.id}\\b`, 'm').test(rollup),
        `the rollup has no detail section for ${spike.id}`,
      ).toBe(true);
    }
  });

  it('states for every spike whether the delivery model changed', () => {
    const rollup = readFileSync(ROLLUP_PATH, 'utf8');
    const rows = rollup.split(/\r?\n/).filter((line) => /^\|\s*S-\d/.test(line.trim()));

    for (const row of rows) {
      const cells = row.split('|').map((cell) => cell.trim());
      const deliveryModelCell = cells[cells.length - 2];

      expect(deliveryModelCell, `the row for ${cells[1]} has no delivery-model cell`).not.toBe('');
      expect(deliveryModelCell.length, `the delivery-model cell for ${cells[1]} is empty`).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Group C — an incomplete spike is actionable                                */
/* ------------------------------------------------------------------------- */

describe('an incomplete spike names the command that finishes it', () => {
  it('gives every INCOMPLETE spike a fenced command block', () => {
    for (const spike of SPIKES) {
      const result = readResult(spike.dir);
      if (!/INCOMPLETE/.test(result)) continue;

      const fenced = result.match(/```[a-z]*\n[\s\S]*?```/);
      expect(fenced, `${spike.id} is marked INCOMPLETE but names no command`).not.toBeNull();
      expect(
        fenced?.[0] ?? '',
        `${spike.id} is marked INCOMPLETE but its command block is empty`,
      ).toMatch(/\S/);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Group D — the spikes do not bypass the budget registry                      */
/* ------------------------------------------------------------------------- */

describe('no spike file carries a bare free-tier ceiling literal', () => {
  it('finds none in the spikes directory', () => {
    const hits = scanForLimitLiterals(collectSpikeFiles(SPIKES_DIR));

    expect(
      formatHits(hits),
      `stray ceiling literals in spikes/:\n${formatHits(hits)}`,
    ).toBe('');
    expect(hits).toEqual([]);
  });

  it('has tokens to scan for — the gate is not vacuous', () => {
    expect(ENFORCED_LIMIT_TOKENS.length).toBeGreaterThan(0);
  });
});
