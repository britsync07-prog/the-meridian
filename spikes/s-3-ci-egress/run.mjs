#!/usr/bin/env node
/**
 * S-3 — does a GitHub Actions runner get blocked where the Worker does not?
 *
 * The script issues the same ten conditional GETs as S-2, from a GitHub
 * Actions runner, with the SAME User-Agent, and prints the results as a
 * markdown table. It is the other half of the comparison S-2 started, and the
 * comparison is only meaningful if both halves are alike in every respect
 * except the one under test:
 *
 * - the same feed list, read from the same module the Worker reads
 * - the same User-Agent, read from the same module the Worker reads
 * - the same request shape, and the same refusal to parse a body
 *
 * The User-Agent is read with a dynamic import of the project's TypeScript
 * config module. Node's static analysis cannot see the exports of a
 * type-stripped module, so a static import of it fails; a dynamic import
 * resolves it, and the value that comes back is the same constant the Worker
 * bundles. That is the point of the exercise — if the two sides sent
 * different identifiers, the comparison would measure the difference between
 * two identifiers rather than the difference between two egress paths.
 *
 * Usage:
 *   node spikes/s-3-ci-egress/run.mjs [--etags <file.json>] [--out <file.json>] [--md <file.md>]
 *
 * Exit: 0 when every feed was attempted, 1 otherwise.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { FEEDS } from '../s-2-worker-egress/src/feeds.mjs';

/** The project's shared fetch identity, read from the same module the Worker reads. */
const { USER_AGENT } = await import('../../shared/config/site.ts');

/** Read a named flag's value. */
function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

/** Read the ETags the caller wants replayed, if any. */
async function readSuppliedEtags(path) {
  if (!path) return {};

  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const etags = {};
  for (const [id, value] of Object.entries(parsed.etags ?? parsed)) {
    if (typeof value === 'string' && value !== '') etags[id] = value;
  }
  return etags;
}

/**
 * Fetch one feed and record what came back.
 *
 * The body is counted in bytes and discarded. Nothing is parsed: no XML, no
 * items, no titles. The spike asks whether the request is served.
 */
async function fetchFeed(feed, suppliedEtag) {
  const headers = { 'User-Agent': USER_AGENT };
  if (suppliedEtag) headers['If-None-Match'] = suppliedEtag;

  const startedAt = Date.now();
  let status = null;
  let retryAfter = null;
  let etag = null;
  let bytes = null;
  let error = null;

  try {
    const response = await fetch(feed.url, { headers, redirect: 'follow' });
    status = response.status;
    retryAfter = response.headers.get('retry-after');
    etag = response.headers.get('etag');
    const body = await response.arrayBuffer();
    bytes = body.byteLength;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return {
    id: feed.id,
    url: feed.url,
    status,
    ms: Date.now() - startedAt,
    blocked: status === 403 || status === 429,
    retryAfter,
    etag,
    conditional: Boolean(suppliedEtag),
    bytes,
    error,
  };
}

/** Render the results as a markdown table. */
function toMarkdown(results) {
  const header = ['Feed', 'URL', 'Status', 'ms', 'Blocked', 'Retry-After', 'ETag'];
  const rows = results.map((result) => [
    result.id,
    result.url,
    result.status === null ? 'error' : String(result.status),
    String(result.ms),
    result.blocked ? 'yes' : 'no',
    result.retryAfter ?? '—',
    result.etag ? 'yes' : 'no',
  ]);

  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((cells) => cells[index].length)),
  );
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ');

  return [
    line(header),
    widths.map((width) => '-'.repeat(width)).join(' | '),
    ...rows.map((cells) => line(cells)),
  ].join('\n');
}

const supplied = await readSuppliedEtags(flag('etags'));
const results = [];

for (const feed of FEEDS) {
  results.push(await fetchFeed(feed, supplied[feed.id]));
}

const served = results.filter((result) => result.status === 200).length;
const notModified = results.filter((result) => result.status === 304).length;
const blocked = results.filter((result) => result.blocked).length;
const servedShare = Math.round((served / FEEDS.length) * 100);

const summary = {
  userAgent: USER_AGENT,
  runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
  feedCount: FEEDS.length,
  served,
  notModified,
  blocked,
  servedSharePercent: servedShare,
  results,
};

const markdown = toMarkdown(results);

console.log(markdown);
console.log('');
console.log(
  `served=${served} notModified=${notModified} blocked=${blocked} ` +
    `of ${FEEDS.length} (${servedShare}%) — runner=${summary.runner}`,
);

const etags = {};
for (const result of results) {
  if (result.etag) etags[result.id] = result.etag;
}

const outPath = flag('out');
if (outPath) {
  await writeFile(outPath, `${JSON.stringify({ etags, summary }, null, 2)}\n`, 'utf8');
}

const mdPath = flag('md');
if (mdPath) {
  await writeFile(mdPath, `${markdown}\n`, 'utf8');
}
