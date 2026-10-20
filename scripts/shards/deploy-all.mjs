#!/usr/bin/env node
/**
 * deploy-all.mjs — deploys the eight static shards, in order.
 *
 * D-06 makes the static tier eight projects rather than one, so a build is
 * followed by eight deploys. Doing that by hand is how one shard gets missed,
 * and a missed shard is a 404 on a whole edition. This script reads the route
 * table, deploys every shard, and fails loudly — naming the shard — if any of
 * them fails.
 *
 * The order is the table's order, which is the shard number order. The order
 * does not matter to Cloudflare's routing (the routes are disjoint by
 * construction), but a deterministic order makes a failed deploy resumable:
 * the shard that failed is the one to re-run.
 *
 * `--dry-run` prints the commands without running them, which is how the
 * deploy sequence is reviewed before it touches the account.
 *
 * Usage:  node scripts/shards/deploy-all.mjs [--dry-run]
 * Exit:   0 when every shard deployed, 1 when any shard failed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The route table — the single source of truth for the shard matrix. */
const ROUTE_TABLE_PATH = path.join(REPO_ROOT, 'wrangler', 'shards', 'route-table.json');

/** The local wrangler binary, so the deploy does not depend on `npx` resolution. */
const WRANGLER_BIN = path.join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const dryRun = process.argv.includes('--dry-run');

/* ------------------------------------------------------------------------- */
/* Reading the route table                                                    */
/* ------------------------------------------------------------------------- */

/** Read the route table. */
function readRouteTable() {
  if (!existsSync(ROUTE_TABLE_PATH)) {
    throw new Error(`The route table is missing: ${ROUTE_TABLE_PATH}`);
  }
  return JSON.parse(readFileSync(ROUTE_TABLE_PATH, 'utf8'));
}

/**
 * The config file for one shard.
 *
 * The naming convention is `shard-NN-<locale>.jsonc`, and the locale is the
 * prefix without its slashes — `/in-hi/` becomes `in-hi`.
 */
function configPathFor(shard) {
  const locale = shard.prefix.replace(/^\//, '').replace(/\/$/, '');
  return path.join('wrangler', 'shards', `shard-${shard.shard}-${locale}.jsonc`);
}

/* ------------------------------------------------------------------------- */
/* Running                                                                    */
/* ------------------------------------------------------------------------- */

/** Run one command without a shell, so no argument is re-interpreted. */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/* ------------------------------------------------------------------------- */
/* The deploys                                                                */
/* ------------------------------------------------------------------------- */

const table = readRouteTable();
const useLocalBin = existsSync(WRANGLER_BIN);
const wranglerCommand = useLocalBin ? process.execPath : 'npx';
const wranglerPrefix = useLocalBin ? [WRANGLER_BIN] : ['wrangler'];

console.log(
  `deploying ${table.shards.length} static shards` +
    (dryRun ? ' (dry run — nothing is uploaded)' : ''),
);
console.log('');

const results = [];

for (const shard of table.shards) {
  const configPath = configPathFor(shard);
  const args = [...wranglerPrefix, 'deploy', '--config', configPath];

  if (dryRun) {
    console.log(`[dry-run] ${shard.project}  npx wrangler deploy --config ${configPath}`);
    results.push({ shard, ok: true, status: 0 });
    continue;
  }

  if (!existsSync(path.join(REPO_ROOT, configPath))) {
    console.error(`FAIL: shard-${shard.shard} (${shard.project}) has no config at ${configPath}`);
    results.push({ shard, ok: false, status: 1 });
    continue;
  }

  process.stdout.write(`deploying shard-${shard.shard} (${shard.project}) ... `);
  const result = run(wranglerCommand, args);
  const output = `${result.stdout}\n${result.stderr}`;

  if (result.status === 0) {
    console.log('ok');
    results.push({ shard, ok: true, status: result.status });
    continue;
  }

  /*
   * The zone route cannot attach while no domain exists (D-10).
   *
   * The shard itself deploys correctly: the Worker is created, the assets are
   * uploaded, and the project is live on its `workers.dev` subdomain. What
   * fails is the zone-route attachment, because the zone name in the config
   * is a placeholder. Cloudflare reports this as a partially-updated trigger
   * configuration and exits non-zero, even though the deploy itself
   * succeeded.
   *
   * That is not a shard failure, and treating it as one would make the script
   * report a broken deployment for a working one. It is recognised by its
   * signature and reported as "deployed, route pending" — the shard is live on
   * `workers.dev`, and the zone route attaches when the domain exists.
   */
  const isPlaceholderZoneRouteFailure =
    /does not exist on your account/i.test(output) ||
    /Could not find zone for/i.test(output);

  if (isPlaceholderZoneRouteFailure) {
    console.log('ok (route pending — no domain yet)');
    results.push({ shard, ok: true, status: result.status, routePending: true });
    continue;
  }

  console.log('FAILED');
  console.error('');
  console.error(`FAIL: shard-${shard.shard} (${shard.project}) did not deploy.`);
  console.error(result.stderr || result.stdout);
  results.push({ shard, ok: false, status: result.status });
}

/* ------------------------------------------------------------------------- */
/* The report                                                                 */
/* ------------------------------------------------------------------------- */

console.log('');
const header = ['shard', 'project', 'prefix', 'result'];
const body = results.map((entry) => [
  entry.shard.shard,
  entry.shard.project,
  entry.shard.prefix,
  entry.ok ? (entry.routePending ? 'ok (route pending)' : 'ok') : 'FAILED',
]);
const widths = header.map((cell, index) =>
  Math.max(cell.length, ...body.map((cells) => cells[index].length)),
);
const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');

console.log(line(header));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const cells of body) console.log(line(cells));

const failed = results.filter((entry) => !entry.ok);
if (failed.length > 0) {
  console.error('');
  console.error(
    `${failed.length} of ${results.length} shards failed to deploy: ` +
      failed.map((entry) => `shard-${entry.shard.shard} (${entry.shard.project})`).join(', '),
  );
  console.error('The previously deployed edition stays live — a failed deploy does not blank the site.');
  process.exit(1);
}

console.log('');
const routePending = results.filter((entry) => entry.routePending).length;
if (dryRun) {
  console.log(`OK: ${results.length} deploy commands printed, nothing uploaded.`);
} else {
  console.log(
    `OK: ${results.length} shards deployed.` +
      (routePending > 0
        ? ` ${routePending} zone route${routePending === 1 ? '' : 's'} pending — no domain exists yet (D-10).`
        : ''),
  );
}
