#!/usr/bin/env node
/**
 * verify-lifecycle.mjs — the live proof that no R2 lifecycle rule can match
 * the Open Graph prefix or the bucket root.
 *
 * MED-08 is a requirement about the *live* bucket, not about a configuration
 * file: "a lifecycle rule that can never match `og/` or the bucket root". The
 * only honest way to prove it is to read the bucket's own rule listing back
 * and assert on it, so this script parses
 * `wrangler r2 bucket lifecycle list meridian` output and fails loudly on any
 * violation.
 *
 * The failure mode this guards against is concrete and irreversible. A rule
 * created with an **empty prefix** means "all prefixes" — it would expire the
 * `og/` images and the bucket root, permanently breaking the image on a story
 * URL that must resolve forever (D-19). The assertions below are therefore:
 *
 *   1. Every rule carries a NON-EMPTY prefix.
 *   2. Every rule's prefix is a member of the allow-list `['raw/', 'media/']`.
 *   3. Neither `og/`, nor `og`, nor the empty string is any rule's prefix.
 *   4. The `media/` rule expires at 365 days and the `raw/` rule at 7 days.
 *   5. The rule count is exactly 2 — a third rule is a silent budget change.
 *
 * The script reads the live listing. It never reads a local config file, and
 * it never repairs anything: it is a verifier, and a verifier that fixes the
 * thing it verifies proves nothing.
 *
 * Usage:  node scripts/cloudflare/verify-lifecycle.mjs
 * Exit:   0 when the bucket's rule set satisfies every assertion, 1 otherwise.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { R2_EXPIRY_PREFIXES, R2_LIFECYCLE_RULES } from '../../shared/config/r2-lifecycle.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRANGLER_BIN = path.join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** The bucket this project owns. */
const BUCKET = 'meridian';

/** The only prefixes a rule in this project may carry. */
const ALLOWED_PREFIXES = R2_EXPIRY_PREFIXES;

/** The prefixes that must never appear on any rule. */
const FORBIDDEN_PREFIXES = ['og/', 'og', ''];

/** The exact rule set the bucket must carry. */
const EXPECTED_RULES = R2_LIFECYCLE_RULES;

/** The rule count the bucket must carry. A third rule is a silent budget change. */
const EXPECTED_RULE_COUNT = EXPECTED_RULES.length;

/* ------------------------------------------------------------------------- */
/* Wrangler                                                                  */
/* ------------------------------------------------------------------------- */

/** Run wrangler without a shell, so no argument is re-interpreted. */
function runWrangler(args) {
  const useLocalBin = existsSync(WRANGLER_BIN);
  const command = useLocalBin ? process.execPath : 'npx';
  const commandArgs = useLocalBin ? [WRANGLER_BIN, ...args] : ['wrangler', ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/* ------------------------------------------------------------------------- */
/* Parsing                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * One rule as this script understands it.
 *
 * @typedef {object} LifecycleRule
 * @property {string} name
 * @property {boolean} enabled
 * @property {string} prefix The prefix condition. An empty string means "all prefixes".
 * @property {string} action
 * @property {number|null} days
 * @property {boolean} isExpiry
 */

/**
 * Parse `wrangler r2 bucket lifecycle list` output.
 *
 * The listing is a flat block per rule:
 *
 *   name:     expire-raw
 *   enabled:  Yes
 *   prefix:   raw/
 *   action:   Expire objects after 7 days
 *
 * `(all prefixes)` is normalised to the empty string so "no prefix condition"
 * has exactly one representation, and so the empty-prefix guard has a single
 * thing to look for.
 */
function parseRules(stdout) {
  const rules = [];
  let current = null;

  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(name|enabled|prefix|action):\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, field, value] = match;

    if (field === 'name') {
      current = { name: value, enabled: true, prefix: '', action: '', days: null, isExpiry: false };
      rules.push(current);
      continue;
    }
    if (!current) continue;

    if (field === 'enabled') {
      current.enabled = value.toLowerCase() === 'yes';
    } else if (field === 'prefix') {
      current.prefix = value === '(all prefixes)' ? '' : value;
    } else if (field === 'action') {
      current.action = value;
      const days = /after (\d+) days?/i.exec(value);
      current.days = days ? Number(days[1]) : null;
      current.isExpiry = /expire/i.test(value);
    }
  }

  return rules;
}

/* ------------------------------------------------------------------------- */
/* The assertions                                                            */
/* ------------------------------------------------------------------------- */

/** Every failed assertion, collected so one run reports all of them. */
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

/** Print the rule table. */
function printTable(rules) {
  const header = ['id', 'prefix', 'expireDays'];
  const rows = rules.map((rule) => [
    rule.name,
    rule.prefix === '' ? '(all prefixes)' : rule.prefix,
    rule.days === null ? '-' : String(rule.days),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  console.log(line(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
}

/* ------------------------------------------------------------------------- */
/* Run                                                                       */
/* ------------------------------------------------------------------------- */

const result = runWrangler(['r2', 'bucket', 'lifecycle', 'list', BUCKET]);
if (result.status !== 0) {
  console.error(`FAIL: \`wrangler r2 bucket lifecycle list ${BUCKET}\` failed.`);
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const rules = parseRules(result.stdout);

console.log(`live lifecycle rules on "${BUCKET}":`);
printTable(rules);
console.log('');

/* Assertion 5 — the rule count is exactly 2. */
if (rules.length !== EXPECTED_RULE_COUNT) {
  fail(
    `expected exactly ${EXPECTED_RULE_COUNT} rules on "${BUCKET}", found ${rules.length}. ` +
      'A third rule is a silent budget change and must be removed.',
  );
}

/* Assertions 1, 2 and 3 — the prefix rules, applied to every rule. */
for (const rule of rules) {
  if (rule.prefix === '') {
    fail(
      `rule ${rule.name} has an empty prefix and would match og/ and the bucket root. ` +
        'An empty prefix means "all prefixes".',
    );
    continue;
  }

  if (!ALLOWED_PREFIXES.includes(rule.prefix)) {
    fail(
      `rule ${rule.name} has prefix "${rule.prefix}", which is outside the allow-list ` +
        `(${ALLOWED_PREFIXES.join(', ')}).`,
    );
  }

  for (const forbidden of FORBIDDEN_PREFIXES) {
    if (rule.prefix === forbidden) {
      fail(`rule ${rule.name} has the forbidden prefix "${forbidden}".`);
    }
  }
}

/* Assertion 4 — the exact day count on each rule. */
for (const expected of EXPECTED_RULES) {
  const rule = rules.find((candidate) => candidate.name === expected.id);
  if (!rule) {
    fail(`expected rule ${expected.id} is missing from "${BUCKET}".`);
    continue;
  }
  if (!rule.isExpiry) {
    fail(`rule ${expected.id} does not expire objects (action: "${rule.action}").`);
  }
  if (rule.prefix !== expected.prefix) {
    fail(`rule ${expected.id} has prefix "${rule.prefix}", expected "${expected.prefix}".`);
  }
  if (rule.days !== expected.expireDays) {
    fail(
      `rule ${expected.id} expires after ${rule.days ?? 'an unknown number of'} days, ` +
        `expected ${expected.expireDays}.`,
    );
  }
  if (!rule.enabled) {
    fail(`rule ${expected.id} is disabled.`);
  }
}

if (failures.length > 0) {
  console.error('');
  console.error(`${failures.length} lifecycle assertion(s) failed.`);
  process.exit(1);
}

console.log(
  `OK: ${rules.length} rules, each prefix-scoped to ${ALLOWED_PREFIXES.join(' or ')}. ` +
    'No rule can match og/ or the bucket root.',
);
