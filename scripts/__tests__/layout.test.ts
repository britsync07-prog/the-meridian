import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D-20: the repository has exactly one package.json, exactly one lockfile and no
 * workspace protocol. A second manifest or a second lockfile would let the shared
 * contract (`shared/`) be resolved two different ways, so the invariant is asserted
 * against the real tree rather than documented.
 *
 * P1.6: Astro 7 reserves `src/fetch.ts` for advanced routing. A file with that
 * name under any `src/` root is auto-imported by the framework and breaks the
 * build, so no file anywhere in the repository may carry that name.
 */

// `new URL(...)` resolves to the global URL declared by @cloudflare/workers-types, while
// `fileURLToPath` expects Node's URL class. Passing the serialised href keeps the two
// runtime type universes apart without a cast.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url).href);

/** Directories that are never part of the repository's own source tree. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.planning']);

const LOCKFILE_NAMES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];

/** Recursively collect every file under `directory`, skipping build/dependency trees. */
function collectFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectFiles(join(directory, entry.name)));
    } else if (entry.isFile()) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

const repoFiles = collectFiles(REPO_ROOT);

describe('repository layout contract (D-20)', () => {
  it('contains exactly one package.json', () => {
    const manifests = repoFiles.filter((file) => basename(file) === 'package.json');
    expect(manifests.map((file) => relative(REPO_ROOT, file).replace(/\\/g, '/'))).toEqual([
      'package.json',
    ]);
  });

  it('contains exactly one lockfile, and it is package-lock.json', () => {
    const lockfiles = repoFiles.filter((file) => LOCKFILE_NAMES.includes(basename(file)));
    expect(lockfiles.map((file) => basename(file))).toEqual(['package-lock.json']);
  });

  it('has no workspaces key in the root package.json', () => {
    const manifestPath = join(REPO_ROOT, 'package.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(manifest, 'workspaces')).toBe(false);
  });

  it('exposes the test, typecheck and build scripts', () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    expect(Object.keys(manifest.scripts ?? {})).toEqual(
      expect.arrayContaining(['test', 'typecheck', 'build']),
    );
  });
});

describe('reserved Astro filenames (P1.6)', () => {
  it('contains no file named fetch.ts anywhere in the repository', () => {
    const reserved = repoFiles.filter((file) => basename(file) === 'fetch.ts');
    expect(reserved).toEqual([]);
  });
});
