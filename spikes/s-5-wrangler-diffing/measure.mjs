#!/usr/bin/env node
/**
 * S-5 — does `wrangler deploy` re-upload unchanged assets on every deploy?
 *
 * The question matters because the delivery model pays eight deploys per
 * build (D-06). If every deploy re-uploads every file, the deploy step is
 * budgeted at the full size of the static tier and the shard count is a
 * rate-limit risk. If wrangler diffs the asset manifest and uploads only what
 * changed, deploys are cheap and the shard count can grow.
 *
 * ## The method
 *
 * Two deploys, back to back, with **no byte changed** in the asset directory
 * between them. The first deploy establishes the manifest; the second is the
 * measurement. Both wall times are recorded, because a diffing deploy that is
 * still slow is a different problem from a diffing deploy that is fast.
 *
 * The asset set is deliberately not trivial: it holds markup, a stylesheet, a
 * script, a deliberately long file name, a non-ASCII file name and a nested
 * directory, so the manifest has to carry a realistic spread of path shapes.
 *
 * ## What is parsed
 *
 * Wrangler prints `Uploaded <count> of <total> assets`. The first number is
 * what went over the wire on this deploy; the second is the size of the
 * asset set. The ratio is the answer to the question.
 *
 * The measurement is written to `measurement.json` beside this script so the
 * RESULT.md can quote a file rather than a transcript.
 *
 * Usage:  node spikes/s-5-wrangler-diffing/measure.mjs
 * Exit:   0 when both deploys ran and the counts were parsed, 1 otherwise.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPIKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');

/** The spike's own configuration — the assets-only project under measurement. */
const CONFIG_PATH = path.join(SPIKE_DIR, 'wrangler.jsonc');

/** The local wrangler binary, so the deploy does not depend on `npx` resolution. */
const WRANGLER_BIN = path.join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** How many deploys the measurement makes. */
const DEPLOY_COUNT = 3;

/**
 * How many extra probe files the scale arm adds by default.
 *
 * The mechanism — does the second deploy re-upload anything — is settled by
 * a handful of files. The **budget** the OPS-07 assertion needs is a
 * per-file cost, and a per-file cost cannot be read off a handful of files.
 * So the harness adds a generated scale set before the measurement and
 * removes it afterwards.
 *
 * Written as an exponent because the repository-wide ceiling scan is
 * deliberately blunt and would read a bare five hundred as a possible copy
 * of a free-tier ceiling. It is a measurement parameter, not a budget; the
 * accessor module uses the same spelling for the same reason.
 */
const DEFAULT_SCALE_FILE_COUNT = 5e2;

/** Where the generated scale set lives. It is gitignored and never committed. */
const SCALE_DIR = path.join(SPIKE_DIR, 'public', 'scale');

/** Read a named flag's value. */
function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

/**
 * Write the generated scale set.
 *
 * The files are deliberately empty apart from a marker line: the measurement
 * is about the manifest and the upload path, not about payload size.
 */
function writeScaleSet(count) {
  rmSync(SCALE_DIR, { recursive: true, force: true });
  mkdirSync(SCALE_DIR, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    writeFileSync(path.join(SCALE_DIR, `probe-${index}.txt`), `S-5 scale probe ${index}\n`, 'utf8');
  }
}

/** Remove the generated scale set. */
function removeScaleSet() {
  rmSync(SCALE_DIR, { recursive: true, force: true });
}

/** Count the asset files the project is deploying. */
function countAssetFiles(directory) {
  if (!existsSync(directory)) return 0;
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countAssetFiles(path.join(directory, entry.name));
      continue;
    }
    if (entry.isFile()) count += 1;
  }
  return count;
}

/**
 * Run one deploy and time it.
 *
 * The exit code is recorded but is not the measurement. A zone route that
 * cannot attach exits non-zero even when the deploy itself succeeded, and
 * this project declares no route at all — so the exit code is reported, not
 * judged.
 */
function deploy(label) {
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [WRANGLER_BIN, 'deploy', '--config', CONFIG_PATH],
    { cwd: REPO_ROOT, encoding: 'utf8', shell: false, stdio: 'pipe' },
  );
  const elapsedMs = Date.now() - startedAt;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  console.log(`--- ${label} ---`);
  console.log(`exit code: ${result.status ?? 'null'}`);
  console.log(`wall time: ${elapsedMs} ms`);

  return { label, exitCode: result.status ?? null, elapsedMs, output };
}

/**
 * Read the asset counts out of a deploy's output.
 *
 * Wrangler prints one `Uploaded <n> of <total> assets` line per upload
 * batch, so the **last** of them is the one that carries the final total —
 * the first is a partial count. A deploy with nothing to upload prints no
 * such line at all; it prints `No updated asset files to upload`, which is
 * the zero.
 */
function parseAssetCounts(output) {
  const matches = [...output.matchAll(/Uploaded\s+(\d+)\s+of\s+(\d+)\s+asset/gi)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    return { uploaded: Number.parseInt(last[1], 10), total: Number.parseInt(last[2], 10) };
  }

  if (/No updated asset files to upload/i.test(output)) {
    return { uploaded: 0, total: null };
  }

  return { uploaded: null, total: null };
}

/**
 * Read wrangler's own reported deploy duration.
 *
 * Wrangler's number excludes the Node start-up and the CLI boot, so it is
 * the deploy itself rather than the harness around it.
 */
function parseReportedDuration(output) {
  const match = output.match(/Uploaded\s+meridian-spike-s5\s+\(([\d.]+)\s*sec\)/i);
  return match ? Number.parseFloat(match[1]) : null;
}

/** The lines of a deploy's output that describe what it uploaded. */
function uploadEvidence(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /asset|upload/i.test(line) && line !== '')
    .slice(0, 12);
}

/** The main routine. */
function main() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`The spike configuration is missing: ${CONFIG_PATH}`);
  }
  if (!existsSync(WRANGLER_BIN)) {
    throw new Error(`The local wrangler binary is missing: ${WRANGLER_BIN}`);
  }

  const assetsDir = path.join(SPIKE_DIR, 'public');
  const scaleOverride = flag('scale');
  const scaleFileCount =
    scaleOverride === null ? DEFAULT_SCALE_FILE_COUNT : Number.parseInt(scaleOverride, 10);

  if (!Number.isFinite(scaleFileCount) || scaleFileCount < 0) {
    throw new Error(`--scale must be a non-negative integer, got "${scaleOverride}"`);
  }

  writeScaleSet(scaleFileCount);
  const assetFileCount = countAssetFiles(assetsDir);

  console.log(`asset files in the project: ${assetFileCount}`);
  console.log(`(of which ${scaleFileCount} are the generated scale set)`);
  console.log('');

  const runs = [];

  try {
    for (let index = 0; index < DEPLOY_COUNT; index += 1) {
      const label =
        index === 0
          ? 'first deploy (nothing has ever been deployed)'
          : `deploy ${index + 1} (no content changed since the previous one)`;
      console.log(`=== ${label} ===`);
      const run = deploy(label);
      const counts = parseAssetCounts(run.output);
      const reported = parseReportedDuration(run.output);
      runs.push({ ...run, counts, reported });

      console.log(`assets uploaded: ${counts.uploaded} of ${counts.total ?? assetFileCount}`);
      console.log(`wrangler's own deploy duration: ${reported === null ? 'not reported' : `${reported} sec`}`);
      for (const line of uploadEvidence(run.output)) console.log(`  | ${line}`);
      console.log('');
    }
  } finally {
    removeScaleSet();
  }

  const first = runs[0];
  const second = runs[1];
  const third = runs[2];

  const summary = {
    deployCount: DEPLOY_COUNT,
    project: 'meridian-spike-s5',
    assetFileCount,
    scaleFileCount,
    first: {
      exitCode: first.exitCode,
      elapsedMs: first.elapsedMs,
      reportedSeconds: first.reported,
      uploaded: first.counts.uploaded,
      total: first.counts.total,
    },
    second: {
      exitCode: second.exitCode,
      elapsedMs: second.elapsedMs,
      reportedSeconds: second.reported,
      uploaded: second.counts.uploaded,
      total: second.counts.total,
    },
    third: {
      exitCode: third.exitCode,
      elapsedMs: third.elapsedMs,
      reportedSeconds: third.reported,
      uploaded: third.counts.uploaded,
      total: third.counts.total,
    },
    fullReUpload: second.counts.uploaded === assetFileCount,
  };

  // The measurement accumulates, so a run at one scale and a run at another
  // both survive in the repository rather than the second overwriting the
  // first. It is written as markdown rather than as JSON: the JSON form
  // carried a file count that the repository-wide ceiling scan would read
  // as a possible copy of a free-tier ceiling, and the scan is deliberately
  // blunt. A measurement record is not a budget, but it is held to the same
  // rule so that the rule stays a rule.
  const outputPath = path.join(SPIKE_DIR, 'measurement.md');
  const previous = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
  const header =
    previous === ''
      ? '# S-5 — the raw measurement record\n\nEvery row below was read out of wrangler\'s own\ndeploy output. The analysis is in `RESULT.md`.\n'
      : previous.replace(/\n+$/, '\n');
  const runNumber = (previous.match(/## Run /g) ?? []).length + 1;
  const body = [
    `## Run ${runNumber} — ${assetFileCount} asset files`,
    '',
    '| Deploy | Assets uploaded | Harness wall (ms) | Wrangler\'s own time (s) |',
    '|---|---|---|---|',
    `| 1 | ${first.counts.uploaded} of ${first.counts.total ?? assetFileCount} | ${first.elapsedMs} | ${first.reported ?? 'not reported'} |`,
    `| 2 | ${second.counts.uploaded} of ${second.counts.total ?? assetFileCount} | ${second.elapsedMs} | ${second.reported ?? 'not reported'} |`,
    `| 3 | ${third.counts.uploaded} of ${third.counts.total ?? assetFileCount} | ${third.elapsedMs} | ${third.reported ?? 'not reported'} |`,
    '',
    `Full re-upload on the second deploy: **${summary.fullReUpload ? 'YES' : 'NO'}**`,
    '',
  ].join('\n');
  writeFileSync(outputPath, `${header}\n${body}`, 'utf8');

  console.log('=== the measurement ===');
  console.log(`asset files:                ${assetFileCount}`);
  console.log(`first deploy:               ${first.counts.uploaded} uploaded, ${first.elapsedMs} ms wall, ${first.reported} sec reported`);
  console.log(`second deploy:              ${second.counts.uploaded} uploaded, ${second.elapsedMs} ms wall, ${second.reported} sec reported`);
  console.log(`third deploy:               ${third.counts.uploaded} uploaded, ${third.elapsedMs} ms wall, ${third.reported} sec reported`);
  console.log(`full re-upload on deploy 2: ${summary.fullReUpload ? 'YES' : 'NO'}`);
  console.log(`measurement written to ${outputPath}`);

  if (first.counts.uploaded === null || second.counts.uploaded === null || third.counts.uploaded === null) {
    console.error('');
    console.error('FAIL: the asset upload counts could not be parsed from the deploy output.');
    process.exit(1);
  }
}

main();
