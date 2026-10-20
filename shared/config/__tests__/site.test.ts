import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_LOCALE, SITE_NAME, SITE_ORIGIN, USER_AGENT } from '../site';
import { EDITIONS, SECTIONS } from '../editions';

/**
 * D-12: the site name is the single highest-impact string in the project. A second
 * copy anywhere in the source tree can drift from the first and silently break
 * Google News inclusion, so the literal is asserted to live in exactly one file.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url).href);

/** Repository roots whose source files are scanned for the site-name literal. */
const SCAN_ROOTS = ['shared', 'apps', 'scripts', 'spikes', 'config'] as const;

/** Directories that hold build output, dependencies or planning artefacts. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.planning',
  '.astro-cache',
  '.wrangler',
  '__tests__',
]);

const SCANNED_EXTENSIONS = ['.ts', '.mjs', '.astro', '.json'] as const;

function collectScannableFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectScannableFiles(join(directory, entry.name)));
    } else if (entry.isFile()) {
      // A test legitimately asserts the literal it guards; including test files
      // would make the scan fail against itself.
      if (entry.name.endsWith('.test.ts')) continue;
      if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

const scannableFiles = SCAN_ROOTS.flatMap((root) => {
  const absolute = join(REPO_ROOT, root);
  return existsSync(absolute) ? collectScannableFiles(absolute) : [];
});

describe('the single site-name value (D-12)', () => {
  it('exports SITE_NAME as the locked publication name', () => {
    expect(SITE_NAME).toBe('The Meridian');
  });

  it('contains the site-name literal in exactly one source file', () => {
    const holders = scannableFiles
      .filter((file) => readFileSync(file, 'utf8').includes('The Meridian'))
      .map((file) => relative(REPO_ROOT, file).replace(/\\/g, '/'));

    expect(holders).toEqual(['shared/config/site.ts']);
  });

  it('exposes a single origin and locale beside the name', () => {
    expect(SITE_ORIGIN).toBe('https://meridian.workers.dev');
    expect(SITE_LOCALE).toBe('en');
  });
});

describe('the fetch user agent', () => {
  it('identifies the aggregator with a contact URL and a monitored address', () => {
    expect(USER_AGENT).toContain('https://');
    expect(USER_AGENT).toContain('+');
    expect(USER_AGENT).toMatch(/[^\s;()]+@[^\s;()]+/);
  });
});

describe('the eight editions (D-13)', () => {
  it('lists exactly eight editions in a fixed order', () => {
    expect(EDITIONS).toHaveLength(8);
    expect(EDITIONS.map((edition) => edition.id)).toEqual([
      'uk',
      'us',
      'au',
      'ca',
      'ie',
      'nz',
      'in',
      'in-hi',
    ]);
  });

  it('gives every edition a unique, slash-bounded locale path', () => {
    for (const edition of EDITIONS) {
      expect(edition.path.startsWith('/')).toBe(true);
      expect(edition.path.endsWith('/')).toBe(true);
    }
    expect(new Set(EDITIONS.map((edition) => edition.path)).size).toBe(8);
  });

  it('serves the India Hindi edition from a native Hindi language tag', () => {
    const hindi = EDITIONS.find((edition) => edition.id === 'in-hi');
    expect(hindi).toBeDefined();
    expect(hindi?.language).toBe('hi');
    expect(hindi?.htmlLang).toBe('hi-IN');
  });
});

describe('the eight sections', () => {
  it('lists exactly eight sections in a fixed order', () => {
    expect(SECTIONS).toHaveLength(8);
    expect(SECTIONS.map((section) => section.id)).toEqual([
      'politics',
      'business',
      'technology',
      'sport',
      'health',
      'world',
      'weather',
      'entertainment',
    ]);
  });

  it('orders the sections from 1 to 8', () => {
    expect(SECTIONS.map((section) => section.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
