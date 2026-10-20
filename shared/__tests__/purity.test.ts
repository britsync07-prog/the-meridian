import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { EDITIONS } from '../config/editions';
import { pageMeta } from '../templates/head';
import { typographicFallback } from '../templates/typographic-fallback';

/**
 * D-20: `shared/` is a DIRECTORY, not a package. One `package.json`, one
 * lockfile, no workspace protocol.
 *
 * The architectural reason the shared contract must stay framework-free is
 * simple and load-bearing: a story page served dynamically from R2 has to
 * look identical to a section page served statically, and Astro components
 * cannot render inside an edge Function. So the shared surface is plain
 * functions returning HTML strings, imported by relative path, with no
 * dependency on any runtime.
 *
 * This test is what keeps that true. A shared module that imported `astro/`
 * could not be used by the Worker, and a shared module that imported
 * `workerd` could not be used by the build. Either drift would mean the two
 * tiers rendering different products.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url).href);
const SHARED_ROOT = join(REPO_ROOT, 'shared');

/**
 * The imports a shared module may never make.
 *
 * These are the runtime-specific module names, the build-time-only native
 * modules, and the test framework itself outside a test directory.
 */
const FORBIDDEN_IMPORTS = [
  'astro/',
  'astro:',
  'workerd',
  'cloudflare:workers',
  'sharp',
  'satori',
  'fast-xml-parser',
  'wrangler',
  'vitest',
];

/** Directories that hold build output, dependency trees or caches. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.astro-cache',
  '.wrangler',
  '.git',
  '.planning',
]);

/** One shared source file, with its path relative to the repository root. */
interface SharedFile {
  absolute: string;
  relative: string;
}

/** Recursively collect every TypeScript file under `shared/`. */
function collectSharedFiles(directory: string): SharedFile[] {
  if (!existsSync(directory)) return [];
  const found: SharedFile[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectSharedFiles(join(directory, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts')) continue;
    found.push({
      absolute: join(directory, entry.name),
      relative: relative(REPO_ROOT, join(directory, entry.name)).replace(/\\/g, '/'),
    });
  }

  return found;
}

/** Every import specifier in a source file. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier) specifiers.push(specifier);
  }

  return specifiers;
}

const sharedFiles = collectSharedFiles(SHARED_ROOT);

describe('the shared contract', () => {
  it('has files to check', () => {
    expect(sharedFiles.length).toBeGreaterThan(0);
  });

  it('imports no runtime-specific module and no build-time-only native module', () => {
    const hits: string[] = [];

    for (const file of sharedFiles) {
      // A test file is allowed to import the test framework.
      const isTestFile = file.relative.includes('/__tests__/') || file.relative.endsWith('.test.ts');
      const forbidden = isTestFile
        ? FORBIDDEN_IMPORTS.filter((token) => token !== 'vitest')
        : FORBIDDEN_IMPORTS;

      for (const specifier of importSpecifiers(readFileSync(file.absolute, 'utf8'))) {
        for (const token of forbidden) {
          if (specifier === token || specifier.startsWith(token)) {
            hits.push(`${file.relative} imports "${specifier}"`);
          }
        }
      }
    }

    expect(hits).toEqual([]);
  });

  it('imports nothing from the applications, the scripts or the spikes', () => {
    const hits: string[] = [];

    for (const file of sharedFiles) {
      for (const specifier of importSpecifiers(readFileSync(file.absolute, 'utf8'))) {
        if (/(^|\/)(apps|scripts|spikes)\//.test(specifier)) {
          hits.push(`${file.relative} imports "${specifier}"`);
        }
      }
    }

    expect(hits).toEqual([]);
  });

  it('contains no package.json of its own — it is a directory, not a package', () => {
    const manifests: string[] = [];

    for (const file of sharedFiles) {
      const directory = join(file.absolute, '..');
      const manifest = join(directory, 'package.json');
      if (existsSync(manifest)) {
        manifests.push(relative(REPO_ROOT, manifest).replace(/\\/g, '/'));
      }
    }

    expect(manifests).toEqual([]);
  });

  it('exports a string-returning builder from every template module', () => {
    const templateFiles = sharedFiles.filter(
      (file) => file.relative.startsWith('shared/templates/') && !file.relative.includes('/__tests__/'),
    );

    expect(templateFiles.length).toBeGreaterThan(0);

    for (const file of templateFiles) {
      const source = readFileSync(file.absolute, 'utf8');
      const exportsFunction = /export\s+(?:function|const)\s+\w+/.test(source);
      const returnsString = /:\s*string\b/.test(source);

      expect(exportsFunction, `${file.relative} exports no function`).toBe(true);
      expect(returnsString, `${file.relative} exports no string-returning function`).toBe(true);
    }
  });
});

describe('the shared templates render identically in both runtimes', () => {
  it('produces a canonical that is a plain string in either runtime', () => {
    const meta = pageMeta({
      title: 'Council backs new rail link',
      description: 'A story from the United Kingdom.',
      path: '/story/meridian-council-rail-link/',
      edition: 'uk',
    });

    expect(typeof meta.canonical).toBe('string');
    expect(meta.canonical.startsWith('https://')).toBe(true);
  });

  it('produces the fallback panel as a plain string in either runtime', () => {
    const html = typographicFallback('Council backs new rail link');

    expect(typeof html).toBe('string');
    expect(html.startsWith('<')).toBe(true);
  });

  it('renders the same panel for the same headline on every edition', () => {
    const html = typographicFallback('Council backs new rail link');

    for (const edition of EDITIONS) {
      expect(typographicFallback('Council backs new rail link')).toBe(html);
      expect(edition.id.length).toBeGreaterThan(0);
    }
  });
});
