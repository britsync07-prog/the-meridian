#!/usr/bin/env node
/**
 * S-4 — how fast does the Astro build run, and does `incrementalBuild` work?
 *
 * The generator writes a synthetic Astro project to a scratch directory, and
 * — with `--build` — times a full build and an incremental build of it.
 *
 * ## The page count comes from the registry
 *
 * The default target is the value of the `static_asset_files_per_project`
 * limit in `config/free-tier-limits.json`: exactly one shard's worth of
 * pages. It is read by id rather than written here, because a number written
 * into this file would be a second copy of a free-tier ceiling, and the
 * OPS-01 scan would (correctly) fail it. A `--pages` override exists for a
 * smaller trial run, but the default is always the registry's value.
 *
 * ## The scratch project is not the real site
 *
 * The scratch project lives under a `dist/` directory, which the repository's
 * `.gitignore` already excludes, so the generated pages are never committed.
 * It is written well away from `apps/site/src/pages`, so the real site is
 * never polluted by a synthetic page set.
 *
 * ## The build configuration is the real build's configuration
 *
 * A build measured under a different configuration is not the build the
 * project will run, so the scratch project's `astro.config.mjs` carries the
 * same three load-bearing settings as the real one:
 *
 * - `compressHTML: true` — the real site's setting, and the one whose v7
 *   default would otherwise change the shape of the output.
 * - `build: { concurrency: 1 }` — anything higher silently disables the
 *   incremental cache.
 * - `experimental: { incrementalBuild: true }` — the flag under test.
 *
 * The real project also mounts the Tailwind plugin. That is deliberately not
 * reproduced here: Tailwind's cost is a per-build cost over the set of classes
 * used, not a per-page cost, and the measurement here is of page rendering
 * throughput. The omission is recorded in the RESULT.
 *
 * ## The incremental arm
 *
 * The route returns a `cacheKey` per page, so the second build has something
 * to skip pages on. The cache lives in the scratch project's `cacheDir` and is
 * preserved between the two runs — without it, the second build renders every
 * page again and the incremental number means nothing.
 *
 * Usage:
 *   node spikes/s-4-astro-throughput/generate.mjs [--pages <N>] [--build] [--scratch <dir>]
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPIKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'config', 'free-tier-limits.json');

/** The limit id whose value is one shard's worth of pages. */
const PAGE_LIMIT_ID = 'static_asset_files_per_project';

/** Read a named flag's value. */
function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

/**
 * The default page count: the per-project static file ceiling, by id.
 *
 * Reading it from the registry is the whole point — the generator must not
 * carry its own copy of a free-tier number.
 */
function defaultPageCount() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const entry = registry.limits.find((limit) => limit.id === PAGE_LIMIT_ID);
  if (!entry) {
    throw new Error(`The registry has no limit with id "${PAGE_LIMIT_ID}"`);
  }
  return entry.value;
}

/** Write a file, creating its parent directory first. */
function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, 'utf8');
}

/** The Astro configuration for the scratch project. */
const SCRATCH_ASTRO_CONFIG = `import { defineConfig } from 'astro/config';

/**
 * The scratch project's Astro configuration.
 *
 * These are the same three load-bearing settings as the real project's
 * configuration, and they are here for the same reason: a build measured
 * under a different configuration is not the build the project will run.
 */
export default defineConfig({
  output: 'static',
  compressHTML: true,
  build: { concurrency: 1 },
  experimental: { incrementalBuild: true },
  cacheDir: './.astro-cache',
});
`;

/** The page template the synthetic pages are rendered through. */
const SCRATCH_LAYOUT = `---
interface Props {
  index: number;
}

const { index } = Astro.props;
const headline = \`Synthetic story number \${index}\`;
const standfirst = 'Synthetic standfirst copy for the build-throughput measurement.';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{headline}</title>
    <meta name="description" content={standfirst} />
  </head>
  <body>
    <article>
      <h1>{headline}</h1>
      <p>{standfirst}</p>
      <ul>
        <li>Topic tag</li>
        <li>Entity tag</li>
      </ul>
    </article>
  </body>
</html>
`;

/** The route that carries the cache key. */
const SCRATCH_ROUTE = `---
import Story from '../../layouts/Story.astro';
import pages from '../../data/pages.json';

/**
 * One synthetic page per entry, each with a cache key.
 *
 * The cache key is what the incremental build skips on: a page whose key and
 * whose module dependency hash are both unchanged is not re-rendered.
 */
export async function getStaticPaths() {
  return pages.map((index) => ({
    params: { slug: \`story-\${index}\` },
    props: { index },
    cacheKey: \`story-\${index}\`,
  }));
}

const { index } = Astro.props;
---

<Story index={index} />
`;

/** The scratch site's front page. */
const SCRATCH_INDEX = `---
const title = 'Synthetic front page';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{title}</title>
  </head>
  <body>
    <h1>{title}</h1>
  </body>
</html>
`;

/**
 * The lines of a build's output that say how many pages it rendered.
 *
 * They are the evidence that the incremental build genuinely skipped pages
 * rather than merely being faster for some other reason, so they are printed
 * rather than swallowed.
 */
function renderEvidence(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => /generat|render|page|cache|skip/i.test(line))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(-12);
}

/**
 * The output buffer for the build.
 *
 * Astro prints one line per generated page, so a build of a shard's worth of
 * pages produces more output than the default one-megabyte buffer can hold.
 * When the buffer fills, the child process is killed and the run looks like a
 * build failure when nothing was wrong with the build at all.
 */
const BUILD_OUTPUT_BUFFER_BYTES = 64 * 1024 * 1024;

/** Run the Astro build against the scratch project and time it. */
function buildScratch(scratchDir) {
  const startedAt = Date.now();

  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'),
      'build',
      '--root',
      scratchDir,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', shell: false, stdio: 'pipe', maxBuffer: BUILD_OUTPUT_BUFFER_BYTES },
  );

  const elapsedMs = Date.now() - startedAt;

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const tail = output.split(/\r?\n/).slice(-40).join('\n');
    throw new Error(
      `The scratch build failed with exit code ${result.status}:\n${tail}`,
    );
  }

  return { elapsedMs, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

/** The main routine. */
function main() {
  const pagesOverride = flag('pages');
  const pageCount = pagesOverride === null ? defaultPageCount() : Number.parseInt(pagesOverride, 10);

  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    throw new Error(`--pages must be a positive integer, got "${pagesOverride}"`);
  }

  const scratchDir = path.resolve(
    REPO_ROOT,
    flag('scratch') ?? path.join('spikes', 's-4-astro-throughput', 'dist', 'scratch'),
  );

  // A clean scratch tree, so a second measurement cannot inherit the first
  // one's cache or output and quietly measure the wrong thing.
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });

  const generationStartedAt = Date.now();
  write(path.join(scratchDir, 'astro.config.mjs'), SCRATCH_ASTRO_CONFIG);
  write(path.join(scratchDir, 'src', 'layouts', 'Story.astro'), SCRATCH_LAYOUT);
  write(path.join(scratchDir, 'src', 'pages', 'index.astro'), SCRATCH_INDEX);
  write(path.join(scratchDir, 'src', 'pages', 'story', '[slug].astro'), SCRATCH_ROUTE);

  const indices = new Array(pageCount);
  for (let index = 0; index < pageCount; index += 1) indices[index] = index;
  write(path.join(scratchDir, 'src', 'data', 'pages.json'), JSON.stringify(indices));

  const generationMs = Date.now() - generationStartedAt;
  const generationRate = generationMs === 0 ? Infinity : (pageCount / generationMs) * 1000;

  console.log(`scratch project: ${path.relative(REPO_ROOT, scratchDir)}`);
  console.log(`pages: ${pageCount} (from ${pagesOverride === null ? 'the registry' : '--pages'})`);
  console.log(`generation: ${generationMs} ms -> ${generationRate.toFixed(1)} pages/second`);

  if (!process.argv.includes('--build')) return;

  console.log('');
  console.log('running the full build ...');
  const full = buildScratch(scratchDir);
  const fullRate = (pageCount / full.elapsedMs) * 1000;
  console.log(`full build: ${full.elapsedMs} ms -> ${fullRate.toFixed(1)} pages/second`);
  for (const line of renderEvidence(full.output)) console.log(`  | ${line}`);

  console.log('');
  console.log('running the incremental build (cache preserved) ...');
  const incremental = buildScratch(scratchDir);
  const incrementalRate = (pageCount / incremental.elapsedMs) * 1000;
  console.log(`incremental build: ${incremental.elapsedMs} ms -> ${incrementalRate.toFixed(1)} pages/second`);
  for (const line of renderEvidence(incremental.output)) console.log(`  | ${line}`);

  console.log('');
  console.log(`ratio: ${(incremental.elapsedMs === 0 ? 0 : full.elapsedMs / incremental.elapsedMs).toFixed(1)}x`);

  const summary = {
    pages: pageCount,
    source: pagesOverride === null ? 'registry' : 'override',
    generationMs,
    fullBuildMs: full.elapsedMs,
    fullPagesPerSecond: Number(fullRate.toFixed(2)),
    incrementalBuildMs: incremental.elapsedMs,
    incrementalPagesPerSecond: Number(incrementalRate.toFixed(2)),
    ratio: Number((incremental.elapsedMs === 0 ? 0 : full.elapsedMs / incremental.elapsedMs).toFixed(2)),
  };
  write(path.join(scratchDir, 'measurement.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`measurement written to ${path.join(scratchDir, 'measurement.json')}`);
}

main();
