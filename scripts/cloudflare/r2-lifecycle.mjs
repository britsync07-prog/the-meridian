#!/usr/bin/env node
/**
 * r2-lifecycle.mjs — the idempotent creator for the R2 bucket's lifecycle rules.
 *
 * D-04 protects the bucket from ever billing by putting lifecycle rules on the
 * two prefixes that grow — `raw/` and `media/`. The rules are the *real* cap:
 * Cloudflare's own budget alerts are informational only and do not cap usage
 * (see `docs/adr/0005-free-tier-ceiling-and-no-spend.md`), so the only thing
 * keeping R2 inside its free allowance is that objects stop accumulating.
 *
 * MED-08 is the failure mode this script exists to make impossible.
 * `wrangler r2 bucket lifecycle add <BUCKET> <NAME> <PREFIX>` is prefix-scoped
 * by construction, and **an empty prefix means "all prefixes"** — a rule created
 * that way would expire the `og/` images and the bucket root, permanently
 * breaking the image on a story URL that must resolve forever (D-19).
 *
 * Therefore, structurally:
 *
 *   1. Every rule this script creates carries an explicit, non-empty prefix.
 *   2. `assertUsablePrefix()` throws before any `lifecycle add` invocation
 *      that would pass an empty prefix. The check is on the call path, not on
 *      the data, so a future rule cannot slip past it by being added to the
 *      wrong place.   3. `--ia-transition-days` / `--ia-transition-date` are never used:
 *      Infrequent Access storage is not covered by the R2 free tier.
 *   4. The script lists first and creates only what is missing, so re-running
 *      it is safe and is the normal way to repair a drifted bucket.
 *   5. The bucket's platform-default "Default Multipart Abort Rule" — which
 *      Cloudflare creates with an **empty prefix** on every new bucket — is
 *      removed. It is an *abort incomplete multipart uploads* rule, not an
 *      expiry rule, so it cannot expire a stored object; but an empty-prefix
 *      rule in the bucket is exactly the shape MED-08 forbids, and leaving it
 *      there would mean the rule set is not structurally incapable of matching
 *      `og/`. Removing it changes nothing: R2 aborts incomplete multipart
 *      uploads after seven days by default, so the platform default applies
 *      unchanged once the explicit rule is gone.
 *
 * Usage:  node scripts/cloudflare/r2-lifecycle.mjs
 * Exit:   0 when the bucket carries exactly the two intended expiry rules,
 *         1 otherwise.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRANGLER_BIN = path.join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** The bucket this project owns. */
const BUCKET = 'meridian';

/**
 * The only prefixes an expiry rule in this project may carry.
 *
 * An empty string is deliberately absent: an empty prefix means "all prefixes"
 * and would match `og/` and the bucket root.
 */
const ALLOWED_PREFIXES = ['raw/', 'media/'];

/**
 * The rules this project owns, and only these two.
 *
 * - `raw/` at 7 days: raw feed snapshots are the largest storage producer and
 *   are useless once the build has consumed them (D-04).
 * - `media/` at 365 days: one uniform 12-month clock for every media object,
 *   with no exemptions and no second rule to reason about (D-15).
 */
const DESIRED_RULES = [
  { id: 'expire-raw', prefix: 'raw/', expireDays: 7 },
  { id: 'expire-media', prefix: 'media/', expireDays: 365 },
];

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
 * @property {string} action The raw action text, e.g. "Expire objects after 7 days".
 * @property {number|null} days The day count, when the action states one.
 * @property {boolean} isExpiry True when the rule's action deletes completed objects.
 */

/**
 * Parse `wrangler r2 bucket lifecycle list` output into rules.
 *
 * The listing is a flat, human-readable block per rule:
 *
 *   name:     expire-raw
 *   enabled:  Yes
 *   prefix:   raw/
 *   action:   Expire objects after 7 days
 *
 * `(all prefixes)` is normalised to the empty string so that "no prefix
 * condition" has exactly one representation in this file — and so that the
 * empty-prefix guard has a single thing to look for.
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
/* The guards                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Refuse to create a rule without an explicit prefix.
 *
 * This is the MED-08 guarantee, enforced on the call path rather than by
 * care: an empty prefix is "all prefixes", and an all-prefixes expiry rule
 * would expire the `og/` images and the bucket root.
 */
function assertUsablePrefix(prefix, ruleId) {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new Error(
      `Refusing to create lifecycle rule "${ruleId}": its prefix is empty. ` +
        'An empty prefix means "all prefixes" and would expire the og/ images and the bucket root.',
    );
  }
  if (!prefix.endsWith('/')) {
    throw new Error(
      `Refusing to create lifecycle rule "${ruleId}": prefix "${prefix}" does not end with "/". ` +
        'A prefix condition must name a key prefix, not a single key.',
    );
  }
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    throw new Error(
      `Refusing to create lifecycle rule "${ruleId}": prefix "${prefix}" is outside the allow-list ` +
        `(${ALLOWED_PREFIXES.join(', ')}).`,
    );
  }
}

/** Refuse to pass an Infrequent Access flag: the R2 free tier does not cover it. */
function assertNoInfrequentAccessFlags(args) {
  for (const flag of ['--ia-transition-days', '--ia-transition-date']) {
    if (args.includes(flag)) {
      throw new Error(
        `Refusing to pass ${flag}: Infrequent Access storage is not covered by the R2 free tier.`,
      );
    }
  }
}

/* ------------------------------------------------------------------------- */
/* The work                                                                  */
/* ------------------------------------------------------------------------- */

function listRules() {
  const result = runWrangler(['r2', 'bucket', 'lifecycle', 'list', BUCKET]);
  if (result.status !== 0) {
    console.error(`FAIL: \`wrangler r2 bucket lifecycle list ${BUCKET}\` failed.`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  return parseRules(result.stdout);
}

function createRule(rule) {
  assertUsablePrefix(rule.prefix, rule.id);
  const args = [
    'r2',
    'bucket',
    'lifecycle',
    'add',
    BUCKET,
    rule.id,
    rule.prefix,
    '--expire-days',
    String(rule.expireDays),
    '--force',
  ];
  assertNoInfrequentAccessFlags(args);

  const result = runWrangler(args);
  if (result.status !== 0) {
    console.error(`FAIL: could not create lifecycle rule "${rule.id}".`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`created  ${rule.id}  prefix=${rule.prefix}  expireDays=${rule.expireDays}`);
}

function removeRule(name) {
  const result = runWrangler(['r2', 'bucket', 'lifecycle', 'remove', BUCKET, '--name', name]);
  if (result.status !== 0) {
    console.error(`FAIL: could not remove lifecycle rule "${name}".`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`removed  ${name}`);
}

/** Print the rule table, marking which rules expire completed objects. */
function printTable(rules) {
  const header = ['name', 'prefix', 'expireDays', 'kind'];
  const rows = rules.map((rule) => [
    rule.name,
    rule.prefix === '' ? '(all prefixes)' : rule.prefix,
    rule.days === null ? '-' : String(rule.days),
    rule.isExpiry ? 'expiry' : 'multipart-abort',
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  console.log(line(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
}

const before = listRules();
console.log(`lifecycle rules on "${BUCKET}" before:`);
printTable(before);
console.log('');

/*
 * Reconcile: remove every rule that is not one of the two this project owns.
 *
 * Two kinds of rule get removed:
 *
 *   1. The platform-default "Default Multipart Abort Rule", which Cloudflare
 *      creates with an **empty prefix** on every new bucket. It aborts
 *      *incomplete multipart uploads* and never deletes a completed object, so
 *      it is not the MED-08 hazard on its own — but an empty-prefix rule in
 *      the bucket is exactly the shape MED-08 forbids. Removing it changes
 *      nothing: R2 aborts incomplete multipart uploads after seven days by
 *      default, so the platform default applies unchanged once the explicit
 *      rule is gone.
 *
 *   2. Any other rule that is not one of ours. A third expiry rule is a
 *      silent budget change (MED-08, T-01-09), and an expiry rule on an
 *      unknown prefix is an unbounded deletion hazard. Neither is allowed to
 *      survive the reconciliation.
 *
 * The removal is what makes the script convergent rather than merely
 * idempotent: running it twice leaves the same two rules, and running it
 * against a drifted bucket repairs the drift.
 */
for (const rule of before) {
  const isOurs = DESIRED_RULES.some((desired) => desired.id === rule.name);
  if (isOurs) continue;

  const reason = /abort incomplete multipart uploads/i.test(rule.action)
    ? 'platform-default multipart abort with an empty prefix'
    : `unexpected rule with prefix "${rule.prefix || '(all prefixes)'}"`;

  console.log(`removing  ${rule.name}  (${reason})`);
  removeRule(rule.name);
}

for (const desired of DESIRED_RULES) {
  const existing = before.find((rule) => rule.name === desired.id);

  if (!existing) {
    createRule(desired);
    continue;
  }

  const matches =
    existing.isExpiry &&
    existing.prefix === desired.prefix &&
    existing.days === desired.expireDays &&
    existing.enabled;

  if (matches) {
    console.log(`kept     ${desired.id}  prefix=${desired.prefix}  expireDays=${desired.expireDays}`);
    continue;
  }

  // The rule exists under our name but does not match the contract. Repair it
  // rather than leaving a rule that would expire the wrong objects or on the
  // wrong clock.
  console.log(
    `drifted  ${desired.id}  was prefix=${existing.prefix || '(all prefixes)'} ` +
      `expireDays=${existing.days ?? '-'}; repairing`,
  );
  removeRule(desired.id);
  createRule(desired);
}

console.log('');
const after = listRules();
console.log(`lifecycle rules on "${BUCKET}" after:`);
printTable(after);
console.log('');

/* The final guard: every expiry rule must carry an allowed, non-empty prefix. */
const offenders = after.filter(
  (rule) => rule.isExpiry && (rule.prefix === '' || !ALLOWED_PREFIXES.includes(rule.prefix)),
);

if (offenders.length > 0) {
  for (const rule of offenders) {
    console.error(
      `FAIL: rule ${rule.name} has prefix "${rule.prefix || '(all prefixes)'}" and would expire objects ` +
        'outside the allow-list. An empty prefix matches og/ and the bucket root.',
    );
  }
  process.exit(1);
}

const expiryRules = after.filter((rule) => rule.isExpiry);
if (after.length !== DESIRED_RULES.length) {
  console.error(
    `FAIL: expected exactly ${DESIRED_RULES.length} rules on "${BUCKET}", found ${after.length}. ` +
      'A third rule is a silent budget change.',
  );
  process.exit(1);
}
if (expiryRules.length !== DESIRED_RULES.length) {
  console.error(
    `FAIL: expected exactly ${DESIRED_RULES.length} expiry rules, found ${expiryRules.length}. ` +
      'A third expiry rule is a silent budget change.',
  );
  process.exit(1);
}

console.log(`OK: ${expiryRules.length} prefix-scoped expiry rules, none able to match og/ or the bucket root.`);
