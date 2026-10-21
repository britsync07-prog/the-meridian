---
phase: 01-foundation-free-tier-contract-architecture-decisions
reviewed: 2026-10-21T13:30:00Z
depth: standard
files_reviewed: 78
files_reviewed_list:
  - .dev.vars.example
  - .github/workflows/spike-s3-egress.yml
  - .gitignore
  - apps/site/__tests__/astro-config.test.ts
  - apps/site/astro.config.mjs
  - apps/site/src/layouts/Base.astro
  - apps/site/src/pages/index.astro
  - apps/site/src/styles/global.css
  - apps/site/tsconfig.json
  - apps/worker/src/db/__tests__/repository.test.ts
  - apps/worker/src/db/config.ts
  - apps/worker/src/db/repository.ts
  - apps/worker/src/index.ts
  - apps/worker/wrangler.jsonc
  - config/free-tier-limits.json
  - docs/adr/0001-delivery-model.md
  - docs/adr/0002-d1-no-shard.md
  - docs/adr/0003-image-permanence.md
  - docs/adr/0004-domain-and-name.md
  - docs/adr/0005-free-tier-ceiling-and-no-spend.md
  - package.json
  - scripts/__tests__/layout.test.ts
  - scripts/cloudflare/billing-alerts.md
  - scripts/cloudflare/r2-lifecycle.mjs
  - scripts/cloudflare/verify-lifecycle.mjs
  - scripts/db/verify-local.mjs
  - scripts/db/verify-swap.mjs
  - scripts/shards/__tests__/shards.test.ts
  - scripts/shards/deploy-all.mjs
  - scripts/shards/split-output.mjs
  - shared/__tests__/purity.test.ts
  - shared/config/__tests__/free-tier-limits.test.ts
  - shared/config/__tests__/site.test.ts
  - shared/config/editions.ts
  - shared/config/free-tier-limits.ts
  - shared/config/site.ts
  - shared/contract/__tests__/excerpt-budget.test.ts
  - shared/contract/__tests__/image-permanence.test.ts
  - shared/contract/excerpt-budget.ts
  - shared/contract/image-permanence.ts
  - shared/db/0001_init.sql
  - shared/db/__tests__/schema.test.ts
  - shared/db/seed.sql
  - shared/sections.ts
  - shared/taxonomy.ts
  - shared/templates/__tests__/head.test.ts
  - shared/templates/head.ts
  - shared/templates/typographic-fallback.ts
  - shared/types.ts
  - spikes/RESULTS.md
  - spikes/__tests__/results.test.ts
  - spikes/s-1-do-cpu/RESULT.md
  - spikes/s-1-do-cpu/src/do.ts
  - spikes/s-1-do-cpu/src/index.ts
  - spikes/s-1-do-cpu/wrangler.jsonc
  - spikes/s-2-worker-egress/RESULT.md
  - spikes/s-2-worker-egress/src/feeds.mjs
  - spikes/s-2-worker-egress/src/index.ts
  - spikes/s-2-worker-egress/wrangler.jsonc
  - spikes/s-3-ci-egress/RESULT.md
  - spikes/s-3-ci-egress/run.mjs
  - spikes/s-4-astro-throughput/RESULT.md
  - spikes/s-4-astro-throughput/generate.mjs
  - spikes/s-5-wrangler-diffing/RESULT.md
  - spikes/s-5-wrangler-diffing/measure.mjs
  - spikes/s-5-wrangler-diffing/measurement.md
  - spikes/s-5-wrangler-diffing/wrangler.jsonc
  - tsconfig.json
  - vitest.config.ts
  - wrangler/shards/route-table.json
  - wrangler/shards/shard-01-uk.jsonc
  - wrangler/shards/shard-02-us.jsonc
  - wrangler/shards/shard-03-au.jsonc
  - wrangler/shards/shard-04-ca.jsonc
  - wrangler/shards/shard-05-ie.jsonc
  - wrangler/shards/shard-06-nz.jsonc
  - wrangler/shards/shard-07-in.jsonc
  - wrangler/shards/shard-08-in-hi.jsonc
findings:
  critical: 1
  warning: 23
  info: 16
  total: 40
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-10-21T13:30:00Z
**Depth:** standard
**Files Reviewed:** 78
**Status:** issues_found

## Summary

Phase 1 is, on the whole, a well-constructed foundation. The architecture is genuinely
well-documented, the contracts are real code rather than prose, and several of the
risk areas named in the review brief turned out to be *correct* when traced to their
call path — I checked each of them against the installed `wrangler@4.151.3` binary
rather than assuming, and I will say so explicitly below.

What I found is one genuine blocker and a set of warnings, most of which share a
single shape: **a claim made in an ADR or a test comment is stronger than the code
that backs it.** Phase 1 writes a lot of load-bearing claims into
`docs/adr/*.md`, and in several places the code does not deliver what the ADR says
it delivers.

Specifically:

- **The 30-day `stories` prune is structurally impossible** (CR-01). Four child
  tables hold `NO ACTION` foreign keys to `stories(id)`, and `story_sources` is
  retained permanently by design, so the prune *always* fails. Reproduced against
  local D1. This is the mechanism the entire D1 growth-control model rests on.
- **The canonical policy exists but is not wired to anything that ships**
  (WR-01). `renderHead()` has zero production callers; the Astro layout that every
  page will use emits no canonical, no hreflang and no RSS autodiscovery.
- **The OPS-01 ceiling scan does not scan what it says it scans** (WR-04). I
  proved this empirically: a `100000` literal planted at the repository root, in a
  `.jsonc` file under `apps/`, and in a Markdown file under `docs/` all passed both
  ceiling-scan suites.
- **Four ADRs make claims that are provably false** about what the tests
  guarantee (WR-04, WR-11, and the site-name claim in WR-13).

The R2 lifecycle guard, the excerpt budget, the canonical construction, and the
shared-layer purity gate are all sound. Details in the "What I checked and found
correct" section below.

---

## Critical Issues

### CR-01: The 30-day `stories` prune is structurally impossible — four `NO ACTION` foreign keys block every delete

**File:** `shared/db/0001_init.sql:193` (also `:234`, `:242`, `:271`)
**Severity:** BLOCKER — invalid behaviour, data-retention risk, breaks a budget-critical mechanism

**Issue**

ADR 0002 names the prune as growth control #2 and states plainly:

> "Pruning the LSH band columns on `stories` older than 30 days. The merge window is
> 48 hours, so band data is dead weight after that. **The raw mention rows are
> pruned**; `story_sources` retains the outlet list, the headline and the URL
> permanently."

PROJECT.md repeats it: *"the `stories` raw-mention rows are pruned after 30 days once
their merge window has closed"*, and it is the reason `stories` does not grow
without bound against the 500 MB / 5 M-rows-per-day ceilings.

The schema cannot execute that prune. Four tables reference `stories(id)` with the
**default `NO ACTION`** action, and D1 enforces foreign keys by default:

```
shared/db/0001_init.sql
193:  story_id     INTEGER NOT NULL REFERENCES stories(id),   -- story_sources
234:  story_id INTEGER NOT NULL REFERENCES stories(id),       -- story_topics
242:  story_id   INTEGER NOT NULL REFERENCES stories(id),     -- story_entities
271:  story_id     INTEGER REFERENCES stories(id),             -- images
```

Per Cloudflare's D1 foreign-key documentation: *"By default, D1 enforces that
foreign key constraints are valid within all queries and migrations… You cannot
delete a row from the `users` table that would violate the foreign key
constraint."* (`NO ACTION` is the default when no `ON DELETE` clause is given.)

I reproduced this against local D1. With a cluster, a story and one
`story_sources` row inserted:

```
> DELETE FROM stories WHERE id = 1;
ERROR  FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)
```

This is not an edge case that a careful Phase 2 prune would avoid. `story_sources`
is **retained permanently by design** — it carries the outlet list, the headline
and the attribution URL for a story whose URL must resolve forever. So for every
single published story, `story_sources` holds a row that permanently blocks the
delete of its `stories` parent. The prune fails for 100% of rows, not 0%.

The delete also cannot be rescued by `PRAGMA defer_foreign_keys`, because the
violation is permanent rather than ordering-related: deferring only postpones the
check to COMMIT, and the child row is never going away.

Two secondary consequences:

1. **The growth model is invalid.** The D1 storage projection in ADR 0002
   ("~70 MB/year… roughly seven years of headroom") assumes `stories` rows stop
   accumulating after 30 days. Without the prune, `stories` grows monotonically
   at the full ingest rate forever, and the free-tier ceiling this project is
   permanently committed to (D-05) is breached far earlier than modelled.
2. **The DDL test asserts the wrong thing.** `shared/db/__tests__/schema.test.ts:165`
   asserts that the migration *starts* with `PRAGMA FOREIGN_KEYS = ON` and calls it
   *"enables foreign keys and defers them for the stories/clusters cycle"*. Two
   problems: (a) per the D1 docs, *"Because D1 runs every query inside an implicit
   transaction, user queries cannot change this during a query or migration"* —
   the pragma is a **no-op** in D1; FK enforcement comes from D1's own default, not
   from this line. (b) Nothing in the schema test asserts that a row can actually
   be pruned, which is why the contradiction is invisible to CI.

**Fix**

Give the join tables the delete behaviour the documented retention model requires.
For the tables that are pure children of a pruned row, cascade:

```sql
-- shared/db/0001_init.sql
CREATE TABLE story_topics (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  ...
);
CREATE TABLE story_entities (
  story_id   INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  ...
);
CREATE TABLE images (
  story_id     INTEGER REFERENCES stories(id) ON DELETE CASCADE,
  cluster_id   INTEGER REFERENCES clusters(id),
  ...
);
```

For `story_sources`, the row must **survive** its parent, so it cannot hold a
`NO ACTION` FK to a pruned table. The cleanest fix is to drop the `story_id` FK
and key the join on what is retained permanently:

```sql
CREATE TABLE story_sources (
  cluster_id   INTEGER NOT NULL REFERENCES clusters(id),
  source_id    INTEGER NOT NULL REFERENCES sources(id),
  rank         INTEGER NOT NULL DEFAULT 0,
  headline     TEXT NOT NULL,
  url          TEXT NOT NULL,
  published_at TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cluster_id, source_id)
) WITHOUT ROWID;
```

(`cluster_id, source_id` is the correct grain anyway — it is *one row per (cluster,
outlet mention)* — and it removes the duplicate-outlet row permitted today. If
`story_id` must be retained for provenance, make it nullable with
`ON DELETE SET NULL` and keep it out of the primary key.)

Then add a regression test that proves the prune works, so this cannot regress:

```ts
// shared/db/__tests__/schema.test.ts
it('allows a raw mention to be pruned while its outlet list survives', () => {
  const ddl = stripComments(DDL());
  // Every child of `stories` must either cascade or set null — never NO ACTION.
  expect(ddl).not.toMatch(/story_id\s+INTEGER[^\n]*REFERENCES\s+stories\(id\)\s*,/);
  // `story_sources` is retained permanently, so it must not depend on `stories`.
  expect(ddl).toMatch(/CREATE TABLE story_sources \([\s\S]*?PRIMARY KEY \(cluster_id, source_id\)/);
});
```

And add a live prune assertion to `scripts/db/verify-local.mjs`, which already
owns the "the schema applies to an empty database and the seed is complete"
claim:

```js
// After the seed, prove the 30-day prune is executable.
query('INSERT INTO clusters (id, slug, canonical_headline, published_at, first_seen_at, last_seen_at) VALUES (900, \'prune-probe\', \'x\', \'2026-10-20\', \'2026-10-20\', \'2026-10-20\')');
query('INSERT INTO stories (id, cluster_id, source_id, external_guid, headline, url, slug, published_at, fetched_at, simhash, band0, band1, band2, band3, country_code) VALUES (900, 900, 1, \'g\', \'h\', \'https://example.invalid/a\', \'s\', \'2026-10-20\', \'2026-10-20\', 1, 1, 1, 1, 1, \'GB\')');
query('INSERT INTO story_sources (cluster_id, source_id, rank, headline, url, published_at) VALUES (900, 1, 0, \'h\', \'https://example.invalid/a\', \'2026-10-20\')');
query('DELETE FROM stories WHERE id = 900');   // must succeed
check('the 30-day prune of stories is executable', 0, scalar('SELECT COUNT(*) AS n FROM stories WHERE id = 900'));
check('the outlet list survives the prune', 1, scalar('SELECT COUNT(*) AS n FROM story_sources WHERE cluster_id = 900'));
```

---

## Warnings

### WR-01: `renderHead()` has no production caller — the shipped pages carry no canonical at all

**File:** `apps/site/src/layouts/Base.astro:18-29` (and `shared/templates/head.ts:122-136`)
**Issue**

`Base.astro` is the only layout in the repository, and its `<head>` is:

```astro
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <meta name="description" content={description} />
</head>
```

No `<link rel="canonical">`. No hreflang alternates. No RSS autodiscovery
`<link rel="alternate" type="application/rss+xml">` (a stated v1 requirement in
`research/STACK.md`). No Open Graph tags. No `x-default`.

A repository-wide grep for `renderHead` returns exactly two hits: its definition
in `shared/templates/head.ts` and one call inside
`shared/templates/__tests__/head.test.ts`. **No production code path calls it.**

The built output confirms it:

```html
<head><meta charset="utf-8"><meta name="viewport" ...><title>The Meridian</title>
<meta name="description" content="A free, automatically-curated daily paper for seven countries.">
<link rel="stylesheet" href="/_astro/index.BS_0NoAK.css"></head>
```

The CON-09 guarantee is therefore enforced *only in the data layer* — in a module
that nothing renders. The architecture's canonical rule ("Both generated from the
same `pageMeta()` function", `AGENTS.md` §Three Canonical Rules) cannot hold while
the layout bypasses `pageMeta()` entirely, and the risk named in ADR 0004 — "the
page leaves the index, the traffic never arrives" — becomes a *missing* canonical
rather than a *wrong* one, which is equally fatal and equally invisible.

Phase 1's brief is the contract, and the placeholder page is defensible in
isolation. But `Base.astro` is the template every Phase 4/5 page will inherit, and
the failure mode is that a later phase builds on the scaffold and ships a site
with no canonical without any test failing.

**Fix**

Make the layout the consumer of the shared contract:

```astro
---
import { SITE_NAME } from '../../../../shared/config/site.ts';
import { pageMeta, renderHead } from '../../../../shared/templates/head.ts';
import '../styles/global.css';

interface Props {
  title?: string;
  description?: string;
  htmlLang?: string;
  edition?: 'uk' | 'us' | 'au' | 'ca' | 'ie' | 'nz' | 'in' | 'in-hi';
  path?: string;
}

const {
  title = SITE_NAME,
  description = 'A free, automatically-curated daily paper for seven countries.',
  htmlLang = 'en',
  edition = 'uk',
  path = '/uk/',
} = Astro.props;

const meta = pageMeta({ title, description, path, edition });
---
<!doctype html>
<html lang={meta.htmlLang ?? htmlLang}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Fragment set:html={renderHead(meta)} />
  </head>
  <body>
    <slot />
  </body>
</html>
```

Add a build-time assertion that every emitted page carries a self-referential
canonical, so the wiring cannot regress:

```ts
// apps/site/__tests__/astro-config.test.ts
it('every built page carries a self-referential canonical', () => {
  const html = readFileSync(BUILT_INDEX_PATH, 'utf8');
  expect(html).toMatch(/<link rel="canonical" href="https:\/\/meridian\.workers\.dev\/[^"]*" \/>/);
  expect(html).not.toMatch(/rel="canonical" href="https?:\/\/(?!meridian)/);
});
```

---

### WR-02: `pageMeta()` silently ignores `PageMetaInput.title`

**File:** `shared/templates/head.ts:53-72`, `shared/types.ts:78-84`
**Issue**

`PageMetaInput` declares `title: string` as a **required** field, but
`pageMeta()` never reads it:

```ts
// shared/templates/head.ts:72
const title = `${SITE_NAME} — ${edition.countryName}`;
```

`input.title` is accepted, type-checked, and thrown away. A caller who passes a
story headline gets the same edition-level title back, with no error and no
warning.

This matters because the story tier is the site's core surface and its title must
be the headline. The type signature actively invites the wrong call: TypeScript
accepts `pageMeta({ title: headline, ... })` and the headline disappears. Every
story page would then render `<title>The Meridian — United Kingdom</title>` —
identical across the entire archive, which is a silent, total SEO failure of
exactly the kind ADR 0004 warns about ("the traffic never arrives").

The existing test suite cannot catch it because every call in
`shared/templates/__tests__/head.test.ts` passes `title: 'x'` and then asserts on
`SITE_NAME`/`countryName` instead — the input is never exercised.

**Fix**

Either consume the input or remove it from the contract. The former is what the
architecture wants:

```ts
// shared/templates/head.ts
const title = input.title.trim().length > 0
  ? `${input.title} — ${SITE_NAME}`
  : `${SITE_NAME} — ${edition.countryName}`;
```

and add a test that a supplied title survives:

```ts
it('uses a supplied title when one is given', () => {
  const meta = pageMeta({
    title: 'Council backs new rail link',
    description: 'y',
    path: '/story/x/',
    edition: 'uk',
  });
  expect(meta.title).toContain('Council backs new rail link');
  expect(meta.title.split(SITE_NAME).length - 1).toBe(1);
});
```

---

### WR-03: `scripts/db/verify-swap.mjs` contains a literal NUL byte — git treats it as binary, and its guard can never fire

**File:** `scripts/db/verify-swap.mjs` (byte offset 5731, line 162)
**Issue**

The file contains a literal `0x00` byte inside a string literal:

```js
if (rewrittenConfig.includes(originalConfig.match(/[0-9a-f]{8}-.../i)?.[0] ?? '<NUL>')) {
```

Two consequences, both confirmed:

**1. Git treats the file as binary.** `git diff --numstat` against a one-line
change returns `-  -  scripts/db/verify-swap.mjs` — git's marker for a binary
blob. Every future diff of this file renders as `Binary files a/... and b/... differ`
with no line-level output. The file is the executable proof of OPS-14 ("the
identifier is a configuration value"), and the repository's review workflow cannot
show changes to it. A tool reading it as text also refuses outright — my own
`read` tool returned *"Cannot read binary file"*.

**2. The guard it belongs to is vacuous.** `rewrittenConfig.includes('\0')` is
always `false`, because a JSON config never contains a NUL byte. The sentinel was
meant to be a space (or any character that could not appear in the original
config); a NUL guarantees the branch is never taken. The check labelled *"the
replacement did not change the database_id value"* therefore never fires — it is a
guard against a failure mode it cannot detect.

**Fix**

Replace the NUL byte with a real space and make the guard meaningful by comparing
the extracted identifier rather than searching for a character:

```js
const ORIGINAL_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const originalId = originalConfig.match(ORIGINAL_ID_PATTERN)?.[0];
if (!originalId) {
  console.error('FAIL: no database_id value was found in apps/worker/wrangler.jsonc.');
  process.exit(1);
}
if (rewrittenConfig.includes(originalId)) {
  console.error('FAIL: the replacement did not change the database_id value.');
  process.exit(1);
}
```

Then re-save the file as UTF-8 text and confirm with
`git diff --numstat -- scripts/db/verify-swap.mjs` that it reports line counts.

---

### WR-04: The OPS-01 ceiling scan does not cover `.jsonc`, the repository root, or `docs/` — and ADR 0005 claims it does

**File:** `shared/config/__tests__/free-tier-limits.test.ts:120-154`, `docs/adr/0005-free-tier-ceiling-and-no-spend.md:22-25`
**Issue**

The scan's own docstring says:

> *"The scan below is the enforcement half of OPS-01. It searches **the whole
> source tree** for the literal value of every `enforced` ceiling."*

Its actual scope is `SCAN_ROOTS = ['shared', 'apps', 'scripts', 'spikes', 'config']`
with `SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']`.
`.jsonc` is absent, and the repository root is not a scan root.

I proved the gap empirically. I planted three files and ran both ceiling-scan
suites:

| Planted file | Contains | Caught? |
|---|---|---|
| `ceiling-probe-root.json` (repo root) | `100000` | **No** |
| `apps/worker/ceiling-probe.jsonc` | `100000` | **No** |
| `docs/ceiling-probe.md` | `100000` | **No** |

Both suites passed (28/28). All three probe files were removed afterwards and the
working tree is clean.

The gap is not theoretical. `apps/worker/wrangler.jsonc` is a **config file that is
not covered by either scan** — the main scan misses it because `.jsonc` is not in
`SCANNED_EXTENSIONS`, and `scripts/shards/__tests__/shards.test.ts` scans
`wrangler/`, `scripts/shards/` and `scripts/cloudflare/` only. A ceiling literal
written into the Worker's own wrangler config would go completely undetected.

ADR 0005 then escalates the claim:

> *"`shared/config/__tests__/free-tier-limits.test.ts` proves that **no code path
> reads one from anywhere else**."*

That is false. The scan proves that no *literal* appears in a *subset* of text
files. It cannot prove anything about a code path reading a ceiling, and it does
not scan a third of the tree. An Accepted ADR is the project's record of what it
has actually guaranteed, and this one overstates it.

**Fix**

Close the scope gap and soften the claim:

```ts
// shared/config/__tests__/free-tier-limits.test.ts
const SCAN_ROOTS = ['shared', 'apps', 'scripts', 'spikes', 'config', 'wrangler', 'docs'] as const;
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.md'] as const;
```

If Markdown must stay excluded (ADRs legitimately discuss ceilings in prose), say
so explicitly and scan the prose separately — `scripts/shards/__tests__/shards.test.ts`
already does this for three ADRs; extend `PROSE_ADRS` to all five, and add
`docs/adr/0002-d1-no-shard.md` and `docs/adr/0005-free-tier-ceiling-and-no-spend.md`,
which are currently unchecked.

Then correct ADR 0005's wording to what the gate actually does:

> *"…and `shared/config/__tests__/free-tier-limits.test.ts` scans the source tree
> for a stray literal of every `enforced` ceiling, so a ceiling duplicated outside
> the registry fails the build."*

---

### WR-05: The ceiling scan has an exponent-shaped blind spot that the repository already uses

**File:** `shared/config/free-tier-limits.ts:195-208`, `spikes/s-5-wrangler-diffing/measure.mjs:73`, `spikes/s-4-astro-throughput/generate.mjs:74`
**Issue**

`deriveEnforcedTokens()` builds the token list from `String(entry.value)` and
`groupThousands(...)`. For the enforced ceiling `d1_storage_mb_per_database = 500`
the tokens are `"500"` and `"500"` — there is no `"5e2"`.

Both spike harnesses therefore write the number as an exponent, and both files
say so in a comment:

```js
// spikes/s-5-wrangler-diffing/measure.mjs:73
const DEFAULT_SCALE_FILE_COUNT = 5e2;

// spikes/s-4-astro-throughput/generate.mjs:74
const MS_PER_SECOND = 1e3;
```

The comments are candid that the reason is *"the repository-wide ceiling scan is
deliberately blunt"*. But the effect is that the scan's guarantee — "a ceiling
hardcoded anywhere but the registry is a ceiling that has already drifted" — has
a trivial, already-exercised bypass. Any enforced ceiling can be written as
`5e2`, `1e3`, `2e6`, `1e7` and pass the gate. Nothing in the scan or in
`deriveEnforcedTokens` looks for numeric literals at all; it does a
string-token search for a specific set of spellings.

This is not, on its own, a policy breach — neither `5e2` nor `1e3` is a ceiling.
But it means the OPS-01 gate is a spelling check, not a value check, and it should
be described as such.

**Fix**

Either narrow the claim, or make the scan value-based. The narrow claim:

> *"The scan searches for the canonical spellings of every enforced ceiling —
> `100000`, `100_000`, `100,000`. A ceiling written in an alternative numeric
> spelling (`5e2`) is not detected."*

The real fix is to parse numeric literals and compare their value:

```ts
/** Every numeric literal in a file, as numbers. */
function numericLiterals(source: string): number[] {
  const found: number[] = [];
  for (const match of source.matchAll(/(?<![A-Za-z0-9_$])(\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)/gi)) {
    const value = Number(match[1].replace(/_/g, ''));
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}
```

then compare against the enforced ceiling *values* rather than their spellings.
That closes the hole permanently and lets the exponent workaround be deleted from
both spike files.

---

### WR-06: The shard splitter and deploy script build destination paths from route-table strings with no containment check

**File:** `scripts/shards/split-output.mjs:146`, `:162`; `scripts/shards/deploy-all.mjs:56-59`
**Issue**

`path.join()` normalises `..` segments, so a route-table value containing them
escapes the intended directory:

```js
// scripts/shards/split-output.mjs:146
const prefixDir = path.join(buildDir, shard.prefix.replace(/^\//, '').replace(/\/$/, ''));
// scripts/shards/split-output.mjs:162
const destination = path.join(shardDir, surface);
```

A `shard.prefix` of `../../elsewhere` resolves outside `buildDir`; a
`global_surfaces` entry of `../../../../etc` resolves outside `shardDir`. The
script then `cpSync`s into that location and `rmSync`s `shardsRoot` without any
containment check.

The same pattern appears in the deploy script:

```js
// scripts/shards/deploy-all.mjs:56-59
function configPathFor(shard) {
  const locale = shard.prefix.replace(/^\//, '').replace(/\/$/, '');
  return path.join('wrangler', 'shards', `shard-${shard.shard}-${locale}.jsonc`);
}
```

A crafted `prefix` yields a config path outside `wrangler/shards/`, which is then
handed to `wrangler deploy --config <path>` — deploying an arbitrary wrangler
config file.

The route table is a committed, reviewed file, so the exposure today is low. But
the prompt asks specifically whether a crafted prefix can escape its shard
directory, and the answer is: **it can, and nothing prevents it.** The blast
radius is a recursive `rmSync` plus a recursive copy into an attacker-chosen path.

**Fix**

Assert containment at the point of use, in both scripts:

```js
/** Resolve `child` under `parent`, refusing anything that escapes it. */
function resolveWithin(parent, child) {
  const base = path.resolve(parent);
  const target = path.resolve(base, child);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to use "${child}" — it resolves outside ${base}.`);
  }
  return target;
}

// scripts/shards/split-output.mjs
const prefixDir = resolveWithin(buildDir, shard.prefix.replace(/^\//, '').replace(/\/$/, ''));
const destination = resolveWithin(shardDir, surface);

// scripts/shards/deploy-all.mjs
const configPath = resolveWithin(path.join(REPO_ROOT, 'wrangler', 'shards'),
  `shard-${shard.shard}-${locale}.jsonc`);
```

---

### WR-07: The splitter reports OK for a shard that contains no edition pages at all

**File:** `scripts/shards/split-output.mjs:147-151`, `:211-232`
**Issue**

When the build output has no directory for a shard's locale prefix, the splitter
silently produces an empty shard:

```js
let localeFiles = 0;
if (existsSync(prefixDir)) {
  cpSync(prefixDir, path.join(shardDir, path.basename(prefixDir)), { recursive: true });
  localeFiles = countFiles(path.join(shardDir, path.basename(prefixDir)));
}
```

`localeFiles` is reported in the table but **never asserted on**. The two exit
guards are "every shard directory exists" (trivially true — the script creates
them) and "no shard exceeds the file ceiling". A shard whose build output is
missing entirely yields `localeFiles = 0`, `total = <globals only>`, and the
script prints `OK: 8 shard directories, the largest holding N files…` and exits
0.

That shard then deploys an edition with **no front page, no section pages and no
archives** — every `/uk/…` URL 404s — while CI reports success. The one thing
this script exists to prevent (a published shard that is not a working edition)
is exactly what it fails to prevent.

**Fix**

Fail loudly when a shard has no edition pages:

```js
const emptyShards = rows.filter((row) => row.localeFiles === 0);
if (emptyShards.length > 0) {
  for (const row of emptyShards) {
    console.error(
      `FAIL: shard-${row.shard} (${row.project}) has no edition pages. ` +
        `Expected a build output directory for prefix "${row.prefix}".`,
    );
  }
  console.error('A shard with no edition pages would publish an edition that 404s on every URL.');
  process.exit(1);
}
```

---

### WR-08: The route table's `global_surfaces` omits the global surfaces ADR 0001 names

**File:** `wrangler/shards/route-table.json:13-20`, `docs/adr/0001-delivery-model.md:69-75`
**Issue**

ADR 0001 defines the global surfaces as:

> *"the edition picker at `/`, `/topic/*`, `/entity/*`, `/sitemap*`, `/rss/*`,
> `/robots.txt`, the fonts and the CSS"*

The route table lists:

```json
"global_surfaces": [
  "index.html", "robots.txt", "favicon.ico", "_astro/",
  "sitemap-index.xml", "feed.xml"
]
```

Missing: `/topic/*`, `/entity/*`, the `sitemap-*.xml` chunks (only the index is
listed), `news-sitemap-*.xml`, `/rss/*`, and the per-edition `/{edition}/feed.xml`
files. The shard configs also declare only one route pattern each
(`<zone>/<locale>/*`), so there is no other route that could serve them.

When Phase 4/5 produce topic pages, entity pages, sitemap chunks and the news
sitemaps, the splitter will not copy them into the shards — and the only signal is
an informational `note:` line, not a failure:

```js
// scripts/shards/split-output.mjs:239-241
console.log(
  `note: the build output has no ${missingGlobals.join(', ')} — those surfaces are produced in a later phase.`,
);
```

The shards test only asserts that `global_surfaces` contains `index.html` and
`robots.txt`, so the divergence from the ADR is invisible to CI. The result would
be a site whose `/topic/*`, `/entity/*` and `news-sitemap-*.xml` URLs 404 from
every shard — i.e. no topic/entity pages in the index and no Google News
inclusion, on a project whose primary acquisition channel is Google News.

**Fix**

Make the route table's global surface list match the ADR, and assert the match in
the shards test so it cannot drift:

```ts
// scripts/shards/__tests__/shards.test.ts
it('duplicates every global surface ADR 0001 names into every shard', () => {
  const table = readRouteTable();
  for (const surface of [
    'index.html',
    'robots.txt',
    'topic/',
    'entity/',
    'rss/',
    '_astro/',
  ]) {
    expect(table.global_surfaces, `global_surfaces must include ${surface}`).toContain(surface);
  }
});
```

Note that `global_surfaces` entries ending in `/` are directories; `split-output.mjs`
already handles that (`path.join` drops the trailing slash, `cpSync` copies
recursively). Also add the sitemap chunks to the list — or, better, make the
splitter copy every top-level entry of the build output that is not a locale
prefix, so the list cannot fall behind the build.

---

### WR-09: The R2 lifecycle reconcile is destructive-before-creative with no rollback, and a failed create skips the post-verification

**File:** `scripts/cloudflare/r2-lifecycle.mjs:294-334`, `:230-234`
**Issue**

The reconcile order is: **remove** every rule the project does not own, then
**create** the two desired rules.

```js
// scripts/cloudflare/r2-lifecycle.mjs:294-304
for (const rule of before) {
  const isOurs = DESIRED_RULES.some((desired) => desired.id === rule.name);
  if (isOurs) continue;
  ...
  removeRule(rule.name);
}
```

`removeRule` calls `wrangler r2 bucket lifecycle remove`, which is a
read-modify-write of the **entire** rule set. If the subsequent `createRule`
fails — auth failure, API error, network — the script calls `process.exit(1)`
from inside `createRule`:

```js
// scripts/cloudflare/r2-lifecycle.mjs:230-234
if (result.status !== 0) {
  console.error(`FAIL: could not create lifecycle rule "${rule.id}".`);
  ...
  process.exit(1);
}
```

At that moment the bucket has **zero expiry rules** (the platform default was
already removed), and the post-verification block at lines 337-371 — which would
have caught the empty rule set — **never runs**, because `process.exit(1)` has
already fired.

This matters more than a normal script failure. As `scripts/cloudflare/billing-alerts.md`
states, and as ADR 0005 repeats: *"the lifecycle rules are the real cap on storage
growth… they delete objects, so GB-months and Class A/B operations stay inside
the free allowance **by construction**."* A bucket with no expiry rules has no
cap, and the project is permanently committed to the free tier (D-05). The
operator sees "FAIL: could not create lifecycle rule" and reasonably assumes
nothing was changed.

**Fix**

Create before you remove, so a failure leaves the bucket with at least the rules
it had, and make the post-verification run on every exit path:

```js
// Create or repair the two owned rules FIRST.
for (const desired of DESIRED_RULES) {
  const existing = before.find((rule) => rule.name === desired.id);
  if (!existing) { createRule(desired); continue; }
  const matches = existing.isExpiry && existing.prefix === desired.prefix &&
    existing.days === desired.expireDays && existing.enabled;
  if (!matches) {
    removeRule(desired.id);
    createRule(desired);
  }
}

// Only then remove what we do not own.
for (const rule of before) {
  if (DESIRED_RULES.some((d) => d.id === rule.name)) continue;
  removeRule(rule.name);
}
```

And convert the `process.exit(1)` calls inside `createRule`/`removeRule` into
thrown errors caught by a top-level handler that still performs the "after"
verification before exiting:

```js
let failed = false;
try {
  reconcile();
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  failed = true;
}

// Always verify the live state, even after a failure.
const after = listRules();
printTable(after);
verifyFinalState(after);   // reports an empty or wrong rule set
process.exit(failed || !finalStateOk ? 1 : 0);
```

---

### WR-10: `billing-alerts.md` states that the R2 bucket is created by the lifecycle script — it is not, and nothing creates it

**File:** `scripts/cloudflare/billing-alerts.md:86-90`
**Issue**

> *"**Cloudflare Dashboard → R2 Object Storage → bucket list**
> The bucket named `meridian` must appear. It was created by
> `scripts/cloudflare/r2-lifecycle.mjs`, and its two lifecycle rules are proven by
> `scripts/cloudflare/verify-lifecycle.mjs`."*

`scripts/cloudflare/r2-lifecycle.mjs` never creates a bucket. It hardcodes
`const BUCKET = 'meridian';` and immediately calls
`wrangler r2 bucket lifecycle list meridian`, which fails if the bucket does not
exist:

```js
// scripts/cloudflare/r2-lifecycle.mjs:203-211
function listRules() {
  const result = runWrangler(['r2', 'bucket', 'lifecycle', 'list', BUCKET]);
  if (result.status !== 0) {
    console.error(`FAIL: \`wrangler r2 bucket lifecycle list ${BUCKET}\` failed.`);
    ...
    process.exit(1);
  }
```

There is no `wrangler r2 bucket create` anywhere in the repository. The
operational runbook therefore points an engineer at the wrong script for the one
step that is not automated, and the script it does point at will fail with a
confusing "bucket not found" error.

**Fix**

Either add the missing step to the script and to the runbook, or correct the
runbook. The smallest correct change is to state the real order and add the
missing command:

```md
**Cloudflare Dashboard → R2 Object Storage → bucket list**

The bucket named `meridian` must appear. It is created once, by hand:

```sh
npx wrangler r2 bucket create meridian
```

`scripts/cloudflare/r2-lifecycle.mjs` does **not** create the bucket — it manages
the lifecycle rules on an existing one, and it exits non-zero if the bucket is
absent. Create the bucket first, then run the script.
```

---

### WR-11: The 365-day media clock lives in three places, contradicting ADR 0003's "one rule, one value, one place"

**File:** `shared/contract/image-permanence.ts:43`, `scripts/cloudflare/r2-lifecycle.mjs:70-71`, `scripts/cloudflare/verify-lifecycle.mjs:51-53`, `docs/adr/0003-image-permanence.md:66-77`
**Issue**

ADR 0003 is explicit:

> *"Every media object expires after 12 months. Every one… the value lives in one
> place, `shared/contract/image-permanence.ts`, as `MEDIA_LIFETIME_DAYS`.
> **One rule, one value, one place to check.**"*

There are three copies:

| Location | Value |
|---|---|
| `shared/contract/image-permanence.ts:43` | `MEDIA_LIFETIME_DAYS = 365` |
| `scripts/cloudflare/r2-lifecycle.mjs:70` | `{ id: 'expire-media', prefix: 'media/', expireDays: 365 }` |
| `scripts/cloudflare/verify-lifecycle.mjs:52` | `{ id: 'expire-media', prefix: 'media/', expireDays: 365 }` |

`ALLOWED_PREFIXES = ['raw/', 'media/']` is likewise duplicated between the two
scripts, and `raw/`'s 7-day clock is duplicated as well.

Nothing detects a divergence: `365` is not an *enforced* ceiling, so the OPS-01
scan does not look for it. If someone changes `MEDIA_LIFETIME_DAYS` to 730 because
the storage model was revised, the R2 rule still expires media at 365 days and
the "silent typographic panel" renders on live pages that still have images —
or, in the other direction, a rule set at 730 days breaks the month-14 storage
projection that D-05 makes load-bearing.

**Fix**

Make the contract module the single source and have both scripts read it:

```js
// scripts/cloudflare/r2-lifecycle.mjs
import { MEDIA_LIFETIME_DAYS } from '../../shared/contract/image-permanence.ts';

const DESIRED_RULES = [
  { id: 'expire-raw', prefix: 'raw/', expireDays: RAW_LIFETIME_DAYS },
  { id: 'expire-media', prefix: 'media/', expireDays: MEDIA_LIFETIME_DAYS },
];
```

(The same `node --experimental-strip-types` dynamic-import technique the S-3
spike already uses at `spikes/s-3-ci-egress/run.mjs:34` works here, because
these scripts run under Node, not workerd.)

Alternatively, move the lifecycle constants into a small JSON file under
`config/` alongside `config/free-tier-limits.json`, which both the scripts and the
contract module read. Either way, one value.

---

### WR-12: `listActiveSources()` does not enforce `terms_status = 'verified'` — the documented hard legal gate has no enforcement

**File:** `apps/worker/src/db/repository.ts:147-159`, `shared/db/seed.sql:18-23`
**Issue**

The seed file is emphatic:

> *"**TERMS OF USE — READ THIS BEFORE FETCHING ANYTHING**
> Every seeded source carries `terms_status = 'unverified'`. That is a **hard
> gate**, not a default to be tidied up later: Phase 2 must check a publisher's
> terms and set `terms_status = 'verified'` with a `terms_verified_at` date before
> its feed is fetched for the first time."*

ADR 0002 repeats it: *"Phase 2 must be able to refuse to fetch a feed whose terms
are unverified."*

The repository's only source-listing method does not filter on it:

```sql
SELECT id, slug, name, feed_url, country_code, language, etag, last_modified, disabled_until, terms_status
  FROM sources
 WHERE is_active = 1
   AND (disabled_until IS NULL OR disabled_until <= ?)
```

`terms_status` is *selected* but not *filtered*. Every one of the 30 seeded
sources — all `unverified` — is returned as an active source. The repository is
the single module through which all D1 access happens (OPS-14), so there is no
other place where the gate could be applied. A Phase 2 fetcher that calls
`listActiveSources()` and iterates will fetch from publishers whose terms have
never been checked, which is precisely the launch-blocking legal gate the phase
was told to establish.

**Fix**

Apply the gate in the repository, and make the refusal loud rather than silent:

```ts
async listActiveSources(): Promise<SourceRow[]> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `SELECT id, slug, name, feed_url, country_code, language, etag, last_modified, disabled_until, terms_status
         FROM sources
        WHERE is_active = 1
          AND terms_status = 'verified'
          AND (disabled_until IS NULL OR disabled_until <= ?)`,
    )
    .bind(now)
    .all<SourceRow>();
  return result.results ?? [];
}
```

Because a filtered query silently drops sources, add a companion method so the
audit trail can still see what was withheld:

```ts
/** Sources that are active but whose terms have not been verified. */
listSourcesPendingTermsCheck(): Promise<SourceRow[]>;
```

and assert the gate in `apps/worker/src/db/__tests__/repository.test.ts` by
asserting that the SQL text contains `terms_status = 'verified'`.

---

### WR-13: `listActiveSources()` omits `last_fetched_at` and `freshness_sla_hours`, so the "which sources are due?" hot path cannot be computed

**File:** `apps/worker/src/db/repository.ts:147-159`, `shared/db/0001_init.sql:79`, `:85`
**Issue**

The schema comment above `idx_sources_active` states the intent:

```sql
-- The fetcher's hot path: "which enabled sources are due?"
CREATE INDEX idx_sources_active ON sources(is_active, disabled_until);
```

`listActiveSources()` selects neither `last_fetched_at` nor
`freshness_sla_hours`, so a caller cannot answer "is this feed stale?" — the
only inputs to that question are absent from the returned row shape. The
`SourceRow` interface (`repository.ts:27-38`) does not carry them either.

The query also has no staleness predicate, so the method as written returns
*every* active source on *every* call, and the caller's only lever is
`disabled_until` (a backoff window, not a freshness SLA). The `freshness_sla_hours`
column added in Phase 1 specifically for this purpose (`shared/db/0001_init.sql:85`,
ADR 0002's deviation table) is written to by nothing and read by nothing.

**Fix**

Return the fields the hot path needs and let the caller decide, or make the
method express the policy directly. The former is the smaller change and keeps
the policy in the caller:

```ts
export interface SourceRow {
  id: number;
  slug: string;
  name: string;
  feed_url: string;
  country_code: string;
  language: string;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: string | null;      // added
  freshness_sla_hours: number;         // added
  disabled_until: string | null;
  terms_status: string;
}
```

```sql
SELECT id, slug, name, feed_url, country_code, language, etag, last_modified,
       last_fetched_at, freshness_sla_hours, disabled_until, terms_status
  FROM sources
 WHERE is_active = 1
   AND (disabled_until IS NULL OR disabled_until <= ?)
```

---

### WR-14: `resolveDatabaseId()` returns an empty string in a real deployment

**File:** `apps/worker/src/db/config.ts:66-74`, `apps/worker/wrangler.jsonc`
**Issue**

`resolveDatabaseId()` has two sources and one fallback:

```ts
export function resolveDatabaseId(env: MeridianEnv): string {
  const override = env.MERIDIAN_DB_ID?.trim();
  if (override && override.length > 0) return override;

  const fromBinding = env.DB?.__dbId?.trim();
  if (fromBinding && fromBinding.length > 0) return fromBinding;

  return '';
}
```

Neither source is populated in a deployment:

1. `MERIDIAN_DB_ID` is set only in `.dev.vars` (the local copy of
   `.dev.vars.example`). `apps/worker/wrangler.jsonc` has **no `vars` block**,
   and no secret is configured. A deployed Worker therefore has
   `env.MERIDIAN_DB_ID === undefined`.
2. `DB.__dbId` is documented in the file's own header as not existing: *"the
   Workers runtime exposes the D1 binding as an object with `alwaysPrimarySession`
   and `fetcher` on it, and **no identifier**."*

So the deployed Worker always reaches `return ''`, and the health endpoint
reports an empty database id:

```ts
// apps/worker/src/index.ts:31
return json({ ok: true, service: 'meridian-worker', databaseId, tables });
```

ADR 0002 states that *"Two places hold it — the `d1_databases` binding and the
`MERIDIAN_DB_ID` override"*. In practice only one place holds it, and the
"which database am I talking to" value the whole configuration module exists to
report is blank in production. This also makes the `verify-swap` proof weaker
than claimed: the swap rewrites the binding and the endpoint would report the
same empty string either way.

**Fix**

Add the non-secret id to the Worker's `vars` so the override is real in a
deployment:

```jsonc
// apps/worker/wrangler.jsonc
"vars": {
  "MERIDIAN_DB_ID": "af7ca858-b8ce-432a-8e80-a05c39e3c1be"
}
```

(The database id is explicitly not a secret — `docs/adr/0002-d1-no-shard.md:176-179`
says so, and `.dev.vars.example` already commits it.) If a `vars` block is
considered redundant with the binding, then `resolveDatabaseId()` should read the
binding's id from the config file rather than from a runtime property that does
not exist — and the `.dev.vars.example` file should not describe the variable as
the operative source.

---

### WR-15: `/api/db/tables` is an unauthenticated, unrate-limited D1-querying endpoint on a project permanently committed to a hard free-tier ceiling

**File:** `apps/worker/src/index.ts:29-32`
**Issue**

```ts
if (url.pathname === '/api/db/tables') {
  const tables = await repository.countTables();
  return json({ ok: true, service: 'meridian-worker', databaseId, tables });
}
```

Every request to this path costs one D1 query (one row read on `sqlite_master`)
and there is no authentication, no rate limit and no cache. The Worker is
deployed on a `workers.dev` subdomain, so the path is publicly reachable.

Against the project's own numbers: the D1 daily read ceiling is 5,000,000 rows
and the projected steady-state usage is ~250,000 (5%). But `countTables()` reads
one row per hit, and the Workers request ceiling is 100,000/day. 100,000 hits
against this one endpoint would consume 100,000 D1 rows — 2% of the daily read
allowance — from a single unauthenticated URL, for no product benefit. The
endpoint's own comment describes it as *"a deliberate, explicit probe"*, i.e. it
exists to be called, by anyone.

D-05 and D-08 make the free tier a **permanent wall** and the request ceiling a
permanent traffic wall; the project has committed to never buying its way out.
An open, unrate-limited endpoint that spends the budget on every call is a
budget-hazard the project has explicitly decided not to be able to buy its way
out of.

Secondary: the response leaks the database id and the service name. The id is not
a secret, so that part is acceptable.

**Fix**

Either remove the endpoint from the public surface or make it cheap and
rate-limited. The simplest correct answer is to not expose a datastore-touching
route on a public hostname at all — the D1 probe belongs in a build-time script
(`scripts/db/verify-local.mjs` already does exactly this job), not in the
runtime:

```ts
// apps/worker/src/index.ts
const url = new URL(request.url);

// The health endpoint reads nothing. A datastore probe belongs in
// `scripts/db/verify-local.mjs`, not on a public hostname: an open endpoint
// that spends a D1 row per call is a budget hazard on a project that is
// permanently committed to the free tier (D-05, D-08).
if (url.pathname === '/api/health') {
  return json({ ok: true, service: 'meridian-worker' });
}
```

If the probe must stay, gate it behind a token and cache the result for the
lifetime of the isolate:

```ts
if (url.pathname === '/api/db/tables') {
  if (request.headers.get('x-meridian-token') !== env.PROBE_TOKEN) {
    return json({ ok: false }, 401);
  }
  return json({ ok: true, service: 'meridian-worker', databaseId, tables: await repository.countTables() });
}
```

---

### WR-16: `assertExcerptWithinBudget()` — the gate Phase 2 runs over every stored excerpt — does not assert CON-04

**File:** `shared/contract/excerpt-budget.ts:389-430`
**Issue**

The module's own docstring positions this function as the enforcement point:

> *"The assertion Phase 2 runs over every stored excerpt… It throws with the FULL
> list of broken limits rather than the first one."*

`.planning/STATE.md` records the same instruction: *"Phase 2 must call
`applyExcerptBudget()` and then `assertExcerptWithinBudget()` — it must not write
its own excerpt logic."*

`assertExcerptWithinBudget(text, sourceVisibleText)` checks exactly five things:
word count, character count, sentence count, source share, and that the source is
long enough to carry an excerpt. It **never checks that `text` is a verbatim
prefix of the source** — CON-04, the guarantee that makes the excerpt a quote
rather than a rewrite.

That matters because CON-04 is the *policy* limit, not a formatting limit. The
length caps are trivially satisfied by a paraphrase; the verbatim requirement is
what distinguishes quoting from rewriting, and Google names "synonymizing,
translating, or other obfuscation techniques" as scaled-content abuse. A Phase 2
normaliser that computes the excerpt by any route other than
`applyExcerptBudget()` — for example from `content:encoded` body text, or from a
publisher-supplied summary that has been lightly normalised — would pass this
gate with a rewritten excerpt, and the violation would be stored.

`applyExcerptBudget()` does enforce the property structurally (line 346-349
checks `candidate.startsWith(published)`), but only for text that went through
that function. The gate that is supposed to protect the *stored* row does not.

**Fix**

Add the verbatim check to the gate, comparing against the candidate the excerpt
was cut from:

```ts
export function assertExcerptWithinBudget(
  text: string,
  sourceVisibleText: string,
  candidate?: string,
): void {
  const violations: string[] = [];
  ...
  // CON-04: the published excerpt must be a verbatim prefix of the publisher's
  // own text. A rewrite is a policy violation, not a formatting nit, so the
  // gate that protects the stored row checks it.
  if (candidate !== undefined) {
    const body = text.endsWith(EXCERPT_BUDGET.ellipsis)
      ? text.slice(0, -EXCERPT_BUDGET.ellipsis.length)
      : text;
    if (!candidate.startsWith(body)) {
      violations.push('the excerpt is not a verbatim prefix of the publisher text');
    }
  }
  ...
}
```

and add a test that a paraphrased excerpt is rejected:

```ts
it('rejects an excerpt that is not a verbatim prefix of the publisher text', () => {
  expect(() =>
    assertExcerptWithinBudget('The council backed the new rail link.', sourceText(200), 'The council backed the new rail link.'),
  ).not.toThrow();

  expect(() =>
    assertExcerptWithinBudget('The council gave the new rail link its blessing.', sourceText(200), 'The council backed the new rail link.'),
  ).toThrow(ExcerptBudgetError);
});
```

---

### WR-17: `stories.simhash` cannot hold a 64-bit fingerprint, and the schema's documented comparison method has no columns to work with

**File:** `shared/db/0001_init.sql:168-169`, `apps/worker/src/db/repository.ts:74`, `:181`
**Issue**

The schema column and its comment:

```sql
simhash       INTEGER NOT NULL,   -- 64-bit headline fingerprint (signed int64; compare
                                  -- with unsigned semantics on the two 32-bit halves)
```

Two problems:

1. **A JavaScript `number` cannot carry the value.** `StoryInsert.simhash` is
   typed `number` (`repository.ts:74`) and bound directly (`:181`). A double has a
   53-bit mantissa, so any 64-bit fingerprint above 2^53 loses precision the
   moment it becomes a `number` — distinct fingerprints collapse onto each other,
   and the clusterer merges two unrelated stories. Nothing in the type or the
   repository guards against this.

2. **The documented comparison method is not implementable.** SQLite's bitwise
   operators (`&`, `|`, `<<`) operate on 64-bit two's-complement integers, so
   "compare with unsigned semantics on the two 32-bit halves" — the mitigation the
   schema itself names — has no columns to work with. There is no `simhash_hi` /
   `simhash_lo` pair, and `INTEGER` is signed, so an unsigned 64-bit value above
   2^63-1 cannot be stored at all.

The LSH band indexes (`band0..band3`) are unaffected — those are small integers —
but the `simhash` column is the fingerprint the four band indexes are derived
from, so a corrupted `simhash` corrupts the band values too.

**Fix**

Store the fingerprint as two 32-bit halves, which is both representable and
comparable, and make the TypeScript shape match:

```sql
-- shared/db/0001_init.sql
simhash_hi   INTEGER NOT NULL,   -- upper 32 bits of the 64-bit fingerprint
simhash_lo   INTEGER NOT NULL,   -- lower 32 bits
```

```ts
// apps/worker/src/db/repository.ts
export interface StoryInsert {
  ...
  /** The 64-bit headline fingerprint, split into two 32-bit halves. */
  simhashHi: number;
  simhashLo: number;
  ...
}
```

If the unsigned 64-bit value is computed with `BigInt`, derive the halves with
`BigInt.asUintN(32, h >> 32n)` and `BigInt.asUintN(32, h)` so each half fits a
JS `number` exactly, and compare candidates with
`(a.simhashHi ^ b.simhashHi) | (a.simhashLo ^ b.simhashLo)` — each half is an
exact 32-bit integer, so the XOR and popcount are lossless.

---

### WR-18: `clusters.outlet_count` and `mention_count` have no maintenance path — and the coverage count is the product's headline differentiator

**File:** `shared/db/0001_init.sql:136-137`, `apps/worker/src/db/repository.ts:85-100`
**Issue**

```sql
outlet_count   INTEGER NOT NULL DEFAULT 0,       -- DISTINCT outlets
mention_count  INTEGER NOT NULL DEFAULT 0,       -- total mentions
```

These are denormalised counters with no trigger, no generated column and no
code that writes them. The repository's public surface is seven methods
(`repository.ts:85-100`) and **none of them updates either counter** — there is
no `insertCluster`, no `updateClusterCounts`, and no method that writes
`story_sources` at all.

`listProminentClusters()` returns `outlet_count` (`repository.ts:222`), and that
column is what the front page and the story page will render as *"covered by N
outlets"* — the multi-outlet coverage line and count, which is **value element #1**
of the six the architecture requires of every story page:

> *"The multi-outlet coverage line and count — the aggregation exists on no single
> publisher's page."*

A counter that is never written renders as `0` on every story on the site. The
failure is silent: nothing errors, nothing fails a test, and the site looks
merely wrong.

**Fix**

Either compute the count at read time rather than storing it, or add the
maintenance path. Given that `listProminentClusters()` already exists and the
count is needed on every front page, the cheapest correct fix is to compute it
from `story_sources` and drop the denormalised columns:

```sql
SELECT c.id, c.slug, c.canonical_headline, c.canonical_excerpt, c.published_at,
       c.is_prominent, c.trending_score, c.editorial_rank,
       (SELECT COUNT(*) FROM story_sources ss WHERE ss.cluster_id = c.id) AS outlet_count
  FROM clusters c
 WHERE c.is_prominent = 1
   AND c.id IN (SELECT cluster_id FROM edition_clusters WHERE edition_id = ?)
 ORDER BY c.published_at DESC
 LIMIT ?
```

`idx_story_sources_rank ON story_sources(cluster_id, rank)` makes that correlated
subquery an index lookup per row, so it does not reintroduce a read-budget
problem at front-page scale.

If the denormalised column is kept for performance, it must have a writer. Add
`upsertClusterCounts(clusterId)` to the repository and assert in
`apps/worker/src/db/__tests__/repository.test.ts` that some method writes
`outlet_count`.

---

### WR-19: `spikes/s-4-astro-throughput/generate.mjs` recursively deletes an unvalidated `--scratch` path

**File:** `spikes/s-4-astro-throughput/generate.mjs:349-356`
**Issue**

```js
const scratchDir = path.resolve(
  REPO_ROOT,
  flag('scratch') ?? path.join('spikes', 's-4-astro-throughput', 'dist', 'scratch'),
);

// A clean scratch tree, so a second measurement cannot inherit the first
// one's cache or output and quietly measure the wrong thing.
rmSync(scratchDir, { recursive: true, force: true });
mkdirSync(scratchDir, { recursive: true });
```

`--scratch` is an arbitrary path, and `rmSync(..., { recursive: true, force: true })`
is unconditional and unvalidated. `--scratch apps/site/src` deletes the site's
source tree. `--scratch .` deletes the repository.

The file's own header states the invariant that is not enforced: *"The scratch
project lives under a `dist/` directory, which the repository's `.gitignore`
already excludes… It is written well away from `apps/site/src/pages`, so the real
site is never polluted by a synthetic page set."* Nothing checks that the resolved
path is under a `dist/` directory.

The default is safe and `npm run build:spike:s4` passes no `--scratch`, so this is
not an active hazard — it is an unguarded footgun in a script whose whole purpose
is to delete and regenerate a directory tree.

**Fix**

```js
const scratchDir = path.resolve(
  REPO_ROOT,
  flag('scratch') ?? path.join('spikes', 's-4-astro-throughput', 'dist', 'scratch'),
);

// The scratch tree is deleted and regenerated on every run, so it must be
// inside a `dist/` directory. Without this guard `--scratch apps/site/src`
// deletes the site's source tree.
const relativeScratch = path.relative(REPO_ROOT, scratchDir);
if (!relativeScratch.split(path.sep).includes('dist')) {
  throw new Error(
    `Refusing to use "${scratchDir}" as the scratch directory — it must live under a dist/ directory.`,
  );
}
```

---

### WR-20: The S-5 measurement writes a "Full re-upload: NO" conclusion before the check that detects unparsable counts

**File:** `spikes/s-5-wrangler-diffing/measure.mjs:274-307`
**Issue**

The order of operations is wrong. The script writes the committed measurement
record at line 293 and only checks for unparsable counts at line 303:

```js
// line 274-293
const outputPath = path.join(SPIKE_DIR, 'measurement.md');
...
writeFileSync(outputPath, `${header}\n${body}`, 'utf8');

// line 303
if (first.counts.uploaded === null || second.counts.uploaded === null || third.counts.uploaded === null) {
  console.error('FAIL: the asset upload counts could not be parsed from the deploy output.');
  process.exit(1);
}
```

`parseAssetCounts()` returns `{ uploaded: null }` when wrangler's output format
does not match either pattern (`:152-164`). When that happens:

- `fullReUpload` is computed as `second.counts.uploaded === assetFileCount` →
  `null === 506` → `false` → the record says **"Full re-upload on the second
  deploy: NO"**.
- That record is **written to the committed `measurement.md`**.
- Only then does the script print `FAIL` and exit 1.

`measurement.md` is a committed artefact that `spikes/RESULTS.md` and
`docs/adr/0001-delivery-model.md` both quote. A run in which wrangler's output
format changed would leave a **false negative conclusion in the committed record**
— "no full re-upload" — attributed to a measurement that never happened. The
CI failure is the only signal, and the artefact it left behind says the opposite.

**Fix**

Move the null-check before the write, and refuse to write a record at all when
the measurement is incomplete:

```js
// scripts/spikes/s-5-wrangler-diffing/measure.mjs
const parsed = [first, second, third].map((run) => run.counts.uploaded);
if (parsed.some((uploaded) => uploaded === null)) {
  console.error('FAIL: the asset upload counts could not be parsed from the deploy output.');
  console.error('The measurement record was NOT written — an unparsed run must not become a committed conclusion.');
  process.exit(1);
}

// ... build the summary and write the record ...
```

---

### WR-21: `.gitignore` ignores `.dev.vars` but not `.dev.vars.*` — a per-environment secrets file would be committed

**File:** `.gitignore:17`
**Issue**

```gitignore
.dev.vars
```

Wrangler reads `.dev.vars` **and** `.dev.vars.<environment>` (`.dev.vars.production`,
`.dev.vars.staging`, …) from the directory holding `wrangler.jsonc`. Only the exact
filename `.dev.vars` is ignored.

A developer who creates `apps/worker/.dev.vars.production` with a real secret
gets a file that `git add .` will happily stage and commit. `.dev.vars.example`
shows exactly how this file family is used in this repository, so the pattern is
clearly part of the project's vocabulary.

The `.env` family is handled correctly a few lines below (`.env`, `.env.*`, with
`!.env.example` as the exception); the `.dev.vars` family is not.

**Fix**

```gitignore
# Cloudflare
.wrangler/
wrangler.local.toml
.dev.vars
.dev.vars.*
!.dev.vars.example
```

---

### WR-22: `USER_AGENT` advertises an address that can never receive mail

**File:** `shared/config/site.ts:30`
**Issue**

```ts
export const USER_AGENT = `TheMeridianBot/1.0 (+${SITE_ORIGIN}/about#contact; newsroom@example.invalid)`;
```

The comment above it claims:

> *"It names the aggregator, carries a contact URL and a **monitored address**
> (ING-10), and is the one string used by both the edge fetcher and the CI runner
> so the two are never distinguishable."*

`example.invalid` uses the `.invalid` TLD, which RFC 2606 reserves precisely so
that it **can never** resolve or receive mail. The address is not monitored; it
cannot be. Every publisher that receives this User-Agent and tries to reach the
operator — over a complaint, a takedown request, or a terms-of-use enquiry — has
no route to a human.

This matters more than a cosmetic detail because the same User-Agent is what
identifies the project during the Phase 2 legal gate: ADR 0002 calls the
terms-of-use ledger *"a launch-blocking legal gate"*, and ING-10 requires a
contactable identity. A publisher evaluating the terms of a bot that gives an
undeliverable address is a publisher that refuses.

**Fix**

Point the User-Agent at a mailbox that exists, and note in the comment that it
must be kept monitored. A single, real, project-addressed mailbox is enough:

```ts
/**
 * The fetch identity sent to every publisher.
 *
 * The contact address MUST be deliverable: publishers send terms-of-use
 * enquiries and complaints to it, and the Phase 2 legal gate depends on
 * publishers being able to reach a human. `example.invalid` is reserved by
 * RFC 2606 and can never receive mail, so it must not be used here.
 */
export const USER_AGENT = `TheMeridianBot/1.0 (+${SITE_ORIGIN}/about#contact; newsroom@<real-domain>)`;
```

The `+https://meridian.workers.dev/about#contact` half points at a page that does
not exist yet either — that is acceptable until the site launches, but the mail
address must be real before the first feed is fetched.

---

### WR-23: The S-3 CI script never exits non-zero, so a total failure reports as a green run

**File:** `spikes/s-3-ci-egress/run.mjs:26`, `:122-167`
**Issue**

The header promises:

> *"**Exit:** 0 when every feed was attempted, 1 otherwise."*

The implementation ends at line 167 with the last `writeFile` and never sets a
non-zero exit code. Every failure mode — a DNS failure, a TLS failure, a 403, a
total network outage — leaves the exit code at 0.

The GitHub Actions workflow that runs it therefore always goes green:

```yaml
# .github/workflows/spike-s3-egress.yml:43-44
- name: Fetch the ten feeds again (conditional, with the ETags from pass 1)
  run: node spikes/s-3-ci-egress/run.mjs --etags etags.json --out results.json --md pass-2.md
```

If every feed fails, the job is green and the summary shows the failure table.
The operator has to read the summary to notice; a red job would say it
immediately. For a spike whose entire value is the honesty of its measurement, a
green tick over a table of errors is the wrong signal.

**Fix**

```js
// spikes/s-3-ci-egress/run.mjs
const failedFeeds = results.filter((result) => result.status === null || result.status >= 400);

console.log('');
console.log(
  `served=${served} notModified=${notModified} blocked=${blocked} ` +
    `of ${FEEDS.length} (${servedShare}%) — runner=${summary.runner}`,
);

if (failedFeeds.length > 0) {
  console.error(
    `FAIL: ${failedFeeds.length} of ${FEEDS.length} feeds did not return a usable response: ` +
      failedFeeds.map((result) => `${result.id} (${result.status ?? 'network error'})`).join(', '),
  );
  process.exitCode = 1;
}
```

---

## Info

### IN-01: `countSentences()` treats abbreviation periods as sentence boundaries, over-truncating excerpts

**File:** `shared/contract/excerpt-budget.ts:135-143`
**Issue**

The boundary regex `/[.!?](?=\s|$)/g` matches the period in an abbreviation
followed by a space. Measured:

| Input | `countSentences()` | Actual |
|---|---|---|
| `Mr. Smith said he would resign.` | 2 | 1 |
| `The U.S. economy grew.` | 2 | 1 |
| `Dr. No arrived. He left. Then more.` | 4 | 3 |

The consequence is over-truncation, never a cap violation — the failure is in the
safe direction, so no policy limit is breached. But excerpts are cut shorter than
the contract intends, and the first sentence of an excerpt starting with "Mr.",
"Dr.", "Prof." or a dotted initial is cut at the abbreviation.

**Fix**

Treat a period preceded by a short token or a single capital as an abbreviation:

```ts
const boundaries = [...text.matchAll(/(?<!\b[A-Z])(?<!\bMr|Dr|Mrs|Ms|Prof|St|Jr|Sr|vs|etc)\.[.!?](?=\s|$)/g)];
```

Or accept the over-truncation and document it in the `EXCERPT_BUDGET` contract as
a deliberate conservatism, so a future reader does not "fix" it and accidentally
introduce a cap that can be exceeded.

---

### IN-02: `countFiles()` ignores symlinks, so the per-shard ceiling can be undercounted

**File:** `scripts/shards/split-output.mjs:89-106`
**Issue**

```js
for (const entry of readdirSync(target, { withFileTypes: true })) {
  const full = path.join(target, entry.name);
  if (entry.isDirectory()) { total += countFiles(full); }
  else if (entry.isFile()) { total += 1; }
}
```

With `withFileTypes: true`, a symlink entry reports `isSymbolicLink() === true` and
both `isDirectory()` and `isFile()` are `false`. Symlinked assets are therefore
counted as **zero files**, while `cpSync` copies them and they are uploaded. A
build output containing symlinks would under-report against the 20,000-file
ceiling — the exact budget this function exists to enforce.

Astro's static output does not normally contain symlinks, so this is latent
rather than active.

**Fix**

```js
} else if (entry.isFile() || entry.isSymbolicLink()) {
  total += 1;
}
```

---

### IN-03: `r2-lifecycle.mjs` is not wired to an npm script and has no dry-run mode

**File:** `package.json:11-23`, `scripts/cloudflare/r2-lifecycle.mjs`
**Issue**

`package.json` registers `r2:lifecycle:verify` but not the creator. The script
that mutates a production bucket is invoked only by remembering its path, while
its read-only sibling has a convenient name. A script that deletes and recreates
lifecycle rules on a live bucket should be at least as easy to reach as the one
that inspects them.

It also has no `--dry-run`, unlike `scripts/shards/deploy-all.mjs`, which does
(`deploy-all.mjs:36`, `:101-105`). The two scripts that mutate Cloudflare
resources therefore have inconsistent safety affordances.

**Fix**

```json
{
  "scripts": {
    "r2:lifecycle:apply": "node scripts/cloudflare/r2-lifecycle.mjs",
    "r2:lifecycle:verify": "node scripts/cloudflare/verify-lifecycle.mjs"
  }
}
```

and add a `--dry-run` flag to `r2-lifecycle.mjs` that prints the intended
create/remove operations without invoking wrangler.

---

### IN-04: `ALLOWED_PREFIXES` and the 7/365 constants are duplicated across both lifecycle scripts

**File:** `scripts/cloudflare/r2-lifecycle.mjs:59`, `:69-72`; `scripts/cloudflare/verify-lifecycle.mjs:44`, `:50-53`
**Issue**

`ALLOWED_PREFIXES = ['raw/', 'media/']` appears verbatim in both scripts, and the
`{ id, prefix, expireDays }` triples are duplicated. The two scripts can disagree:
if one is edited and the other is not, the verifier asserts a rule set the
creator does not produce, and the failure surfaces as a confusing live-bucket
mismatch rather than a code mismatch.

This is the same class of problem as WR-11, at smaller scale.

**Fix**

Extract both into one module under `shared/contract/` (which already owns
`MEDIA_LIFETIME_DAYS`) and import it from both scripts.

---

### IN-05: Two spike wrangler configs have a `$schema` path relative to the wrong directory

**File:** `spikes/s-2-worker-egress/wrangler.jsonc:2`, `spikes/s-5-wrangler-diffing/wrangler.jsonc:2`
**Issue**

Both use `"$schema": "node_modules/wrangler/config-schema.json"`, which resolves
relative to the config file's own directory
(`spikes/s-2-worker-egress/node_modules/…` — which does not exist). The eight
shard configs and the Worker config correctly use `"../../node_modules/…"`.

Harmless at runtime; it means editor autocomplete and schema validation are
silently off for those two files.

**Fix**

```jsonc
"$schema": "../../node_modules/wrangler/config-schema.json",
```

---

### IN-06: `shared/templates/head.ts:53` — the `pageMeta` signature and its first statement share a line

**File:** `shared/templates/head.ts:53`
**Issue**

```ts
export function pageMeta(input: PageMetaInput): PageMeta {  const edition = EDITIONS.find((candidate) => candidate.id === input.edition);
```

The opening brace and the first statement are on the same line. This is the file
that encodes CON-09, and the formatting makes the function's first real statement
harder to find at a glance.

**Fix**

```ts
export function pageMeta(input: PageMetaInput): PageMeta {
  const edition = EDITIONS.find((candidate) => candidate.id === input.edition);
```

---

### IN-07: `shared/templates/__tests__/head.test.ts:199` — a doc comment is jammed onto the `describe(` line

**File:** `shared/templates/__tests__/head.test.ts:199`
**Issue**

```ts
describe('typographicFallback', () => {  /** The wording a silent panel must never contain. */
```

The comment is on the same line as the `describe` call, which inlines it into the
function body and hides it from the reader.

**Fix**

```ts
describe('typographicFallback', () => {
  /** The wording a silent panel must never contain. */
```

---

### IN-08: `package.json` pins `wrangler@4.151.3`; `research/STACK.md` records `4.151.2`

**File:** `package.json:35`
**Issue**

The stack research records `wrangler 4.151.2`; the manifest pins `4.151.3`. The
two manifests disagree about the pinned toolchain version. The ADR 0001 spike
measurements (S-5) were taken with the installed version, so the drift is
immaterial in practice, but the stack record should match the manifest.

**Fix**

Update `research/STACK.md` (and the AGENTS.md copy) to `4.151.3`, or pin the
manifest back to `4.151.2`.

---

### IN-09: The site-name scan misses `.sql` files and the repository root — ADR 0004's "exactly one source file in the whole repository" is false

**File:** `shared/config/__tests__/site.test.ts:18-51`, `docs/adr/0004-domain-and-name.md:45-57`
**Issue**

ADR 0004 states:

> *"A test enforces the single-copy rule: **the literal appears in exactly one
> source file in the whole repository.** A second copy — in a component, a config,
> **a comment**, a template — is a failure the build reports."*

The scan's scope is `SCAN_ROOTS = ['shared', 'apps', 'scripts', 'spikes', 'config']`
with `SCANNED_EXTENSIONS = ['.ts', '.mjs', '.astro', '.json']`, skipping
`__tests__` and `*.test.ts`. Three copies of the literal sit outside that scope:

| File | Line | Context |
|---|---|---|
| `shared/db/0001_init.sql` | 2 | `-- 0001_init.sql — The Meridian content model` |
| `package.json` | 6 | `"description": "The Meridian — a free, …"` |
| `docs/adr/0001-delivery-model.md` | 1 | `# ADR 0001 — …` (title) |

The SQL comment and the `package.json` description are precisely the "a comment"
and "a config" the ADR says the build reports. They are not reported, because
`.sql` is not in `SCANNED_EXTENSIONS` and the repository root is not a scan root.

A second copy inside a comment is harmless; a second copy inside a **config** is
not — a `news:name` mismatch is the failure ADR 0004 calls *"the single
highest-impact string in the project"*, and it has no error message of its own.

**Fix**

Either extend the scan to `.sql`, `.jsonc` and the repository root, or narrow
ADR 0004's claim to what the scan covers. The narrow claim is the safer one if
the root `package.json` description is to stay:

> *"The literal appears in exactly one **scanned source file** — the scan covers
> `.ts`, `.mjs`, `.astro` and `.json` under `shared/`, `apps/`, `scripts/`,
> `spikes/` and `config/`. Comments and prose (ADRs, SQL headers) may quote the
> name; only a **value** that feeds `<news:name>` may not."*

---

### IN-10: `shared/db/__tests__/schema.test.ts` asserts a pragma that is a no-op in D1

**File:** `shared/db/__tests__/schema.test.ts:165-173`
**Issue**

```ts
it('enables foreign keys and defers them for the stories/clusters cycle', () => {
  ...
  expect(statements[0].toUpperCase()).toBe('PRAGMA FOREIGN_KEYS = ON');
  expect(statements[1].toUpperCase()).toBe('PRAGMA DEFER_FOREIGN_KEYS = TRUE');
});
```

Per Cloudflare's D1 foreign-key documentation: *"Because D1 runs every query
inside an implicit transaction, user queries cannot change this during a query or
migration."* The `PRAGMA foreign_keys = ON` statement is therefore inert in D1 —
foreign keys are enforced because D1 enables them by default, not because this
line says so. `PRAGMA defer_foreign_keys = true` *is* supported and meaningful.

The assertion is harmless but it documents a mechanism that does not exist, and
the test name implies the pragma is doing the work.

**Fix**

Rename the test and correct the comment in the DDL:

```ts
it('defers foreign keys for the stories/clusters cycle', () => {
  // D1 enforces foreign keys by default and refuses to let a migration change
  // that; `PRAGMA defer_foreign_keys` is the supported way to defer.
  expect(statements[0].toUpperCase()).toBe('PRAGMA FOREIGN_KEYS = ON');  // inert in D1, kept for local sqlite
  expect(statements[1].toUpperCase()).toBe('PRAGMA DEFER_FOREIGN_KEYS = TRUE');
});
```

and in `shared/db/0001_init.sql:35`:

```sql
-- D1 enforces foreign keys by default and cannot change that inside its
-- implicit transaction, so this pragma is inert on D1 and kept only so a
-- local SQLite run behaves identically. `defer_foreign_keys` below IS honoured.
PRAGMA foreign_keys = ON;
```

---

### IN-11: `EXCERPT_RESULT_SCHEMA` is a non-strict `z.object`

**File:** `shared/contract/excerpt-budget.ts:109-117`
**Issue**

```ts
export const EXCERPT_RESULT_SCHEMA = z.object({ ... });
```

Every other schema in the repository uses `z.strictObject` (see
`shared/config/free-tier-limits.ts:22`, `:33`, `:43`, `:51`, `:64`). A non-strict
object silently accepts and strips unknown keys, so a typo in a field name —
`wordCounts` instead of `wordCount` — would be dropped rather than rejected,
turning a contract violation into a silently missing measurement.

**Fix**

```ts
export const EXCERPT_RESULT_SCHEMA = z.strictObject({ ... });
```

---

### IN-12: `story_sources` permits the same outlet twice for one cluster

**File:** `shared/db/0001_init.sql:191-201`
**Issue**

The primary key is `(cluster_id, story_id)`, and `source_id` is a free column.
Nothing prevents two rows with the same `(cluster_id, source_id)` but different
`story_id` — i.e. the same outlet listed twice in one cluster's outlet list.
`clusters.outlet_count` is documented as *"DISTINCT outlets"*, so the denormalised
count and the join table can disagree.

Resolved as a side effect of the CR-01 fix (keying on `(cluster_id, source_id)`),
so it is recorded here for completeness rather than as a separate change.

---

### IN-13: The S-1 plan probe hardcodes a personal `workers.dev` hostname

**File:** `spikes/s-1-do-cpu/src/index.ts:60`
**Issue**

```ts
const target = 'https://meridian-spike-s1.mehedy303.workers.dev/?ms=none';
```

The probe fires up to 200 parallel subrequests at a hardcoded hostname that
belongs to a specific account. On any other account the probe measures a
different deployment, or a host that does not exist, and the "which plan is this
account on" conclusion becomes meaningless. The hostname should be derived from
the request's own URL so the probe always hits the spike Worker itself.

**Fix**

```ts
const target = new URL('/', url).toString();
```

---

### IN-14: `.github/workflows/spike-s3-egress.yml` pins actions by tag rather than by commit SHA

**File:** `.github/workflows/spike-s3-egress.yml:31`, `:34`, `:67`
**Issue**

`actions/checkout@v4`, `actions/setup-node@v4` and `actions/upload-artifact@v4`
are pinned to a mutable tag. A moved tag would execute unreviewed code in a
workflow that has `contents: read` and network egress. The permissions block is
correctly minimal (`contents: read`), and `workflow_dispatch`-only is correct, so
the exposure is small — but this repository is public and its workflows run on
the maintainers' accounts.

**Fix**

Pin to full commit SHAs with a version comment, e.g.
`uses: actions/checkout@<sha> # v4.2.2`.

---

### IN-15: `apps/worker/wrangler.jsonc` declares a `migrations_pattern` that duplicates `migrations_dir`

**File:** `apps/worker/wrangler.jsonc:12-14`
**Issue**

```jsonc
"migrations_dir": "../../shared/db",
"migrations_table": "d1_migrations",
"migrations_pattern": "../../shared/db/[0-9]*.sql"
```

`migrations_pattern` is relative to `migrations_dir` in wrangler's semantics, so
this value resolves to `shared/db/../../shared/db/[0-9]*.sql`. It happens to work
(the local verification script confirms `0001_init.sql` is found), but the pattern
is written as though it were relative to the config file, which is the opposite
of how wrangler resolves it.

**Fix**

Either drop `migrations_pattern` (the default `*.sql` matches) or write it
relative to `migrations_dir`:

```jsonc
"migrations_dir": "../../shared/db",
"migrations_pattern": "[0-9]*.sql",
```

---

### IN-16: `spikes/s-3-ci-egress/run.mjs` divides by `FEEDS.length` without a zero guard

**File:** `spikes/s-3-ci-egress/run.mjs:132`
**Issue**

```js
const servedShare = Math.round((served / FEEDS.length) * 100);
```

The S-2 sibling guards this (`spikes/s-2-worker-egress/src/index.ts:136`:
`FEEDS.length === 0 ? 0 : …`). The two halves of the comparison should not
diverge in their defensive coding — the whole point of sharing the feed list is
that the two sides measure the same thing.

**Fix**

```js
const servedShare = FEEDS.length === 0 ? 0 : Math.round((served / FEEDS.length) * 100);
```

---

## What I checked and found correct

Recording these so the next reviewer does not have to re-derive them.

**The R2 lifecycle empty-prefix guard (the risk named in the brief).**
`assertUsablePrefix()` is called inside `createRule()` **before** the wrangler
invocation — it is on the call path, not merely on the data — and it enforces
three independent conditions: non-empty, trailing `/`, and membership in
`ALLOWED_PREFIXES`. Since `DESIRED_RULES` is a hardcoded constant, an empty
prefix is structurally impossible. I confirmed against the installed
`wrangler@4.151.3` that `wrangler r2 bucket lifecycle add <bucket> <name>
<prefix>` documents the prefix as *"leave empty for all prefixes"*, so the hazard
is real and the guard is correctly placed.

**The `wrangler` CLI invocations are syntactically correct.** I read
`node_modules/wrangler/wrangler-dist/cli.js` and confirmed:
`r2 bucket lifecycle remove` accepts `--name` (aliased `id`), `r2 bucket
lifecycle add` accepts `--expire-days` and `--force`/`-y`, and the list command
emits `name:` / `enabled:` / `prefix:` / `action:` label-value lines that the
scripts' parser matches exactly (the CLI renders `"Expire objects after 7 days"`,
which the `/after (\d+) days?/` parser reads correctly). The `--ia-transition-days`
guard targets flags that genuinely exist.

**The excerpt budget cannot be weakened by the code as written.** There is no
rewrite path, no synonym table, no translation step, no per-source override and
no configuration lookup. `applyExcerptBudget()` takes exactly one argument
(asserted by `expect(applyExcerptBudget.length).toBe(1)`), and it verifies its own
output is a verbatim prefix of the candidate before returning it. The word cap
and the source-share cap are both ceilings and the tighter one binds; the
character cap holds after the ellipsis is fitted; the ellipsis never adds a word.
The 30% share can never be exceeded because the allowance is computed as
`floor(sourceWords * 30 / 100)` in integer arithmetic (the `Math.round` on
`maxSourceShare * 100` exists precisely to avoid `0.3 * 30 = 8.999999999999998`).
The only weakness I found is WR-16, which is about the *gate* rather than the
budget.

**The canonical is constructed, not sanitised.** `pageMeta()` builds
`${SITE_ORIGIN}${path}` from a constant origin, and refuses a path matching
`/^https?:\/\//i`. Because the origin is a module-level constant there is no
parameter through which a canonical could point at a publisher. `renderHead()`
escapes `&`, `<`, `>`, `"` and `'` on every interpolated value including the
title, the description, the canonical and each hreflang alternate.

**The shared templates escape their inputs.** `typographicFallback()` escapes the
headline before interpolating it into both the `aria-label` attribute and the
`<p>` body; a headline of `<script>alert("x")</script>` renders as
`&lt;script&gt;…`. The shared layer has no runtime-specific imports, which the
purity test enforces across every `.ts` file under `shared/`.

**The D1 schema's index set is load-bearing and complete.** All 19 tables and 32
named indexes exist, including the four single-column LSH band indexes, the
partial `idx_clusters_editorial … WHERE editorial_rank IS NOT NULL`, and
`idx_edition_clusters_edition (edition_id, published_at)`. I verified the query
plans with `EXPLAIN QUERY PLAN` against local D1:

```
SEARCH clusters USING INDEX idx_clusters_prominent (is_prominent=?)
LIST SUBQUERY 1
SEARCH edition_clusters USING COVERING INDEX idx_edition_clusters_edition (edition_id=?)
SEARCH stories USING COVERING INDEX idx_stories_band0 (band0=?)
SEARCH story_sources USING INDEX idx_story_sources_rank (cluster_id=?)
```

The repository's claim that `listProminentClusters()` is an index scan of the
prominent set in date order is accurate — there is no temporary B-tree for the
`ORDER BY`.

**The seed is complete and constraint-clean.** `scripts/db/verify-local.mjs`
passes 24/24 assertions against an empty database: 8 editions, 8 sections, 64
edition-sections rows, 30 sources, 7 distinct country codes, and zero sources
with a `terms_status` other than `unverified`.

**The SQL scan and the repository are sound.** All D1 access goes through
`apps/worker/src/db/repository.ts`; every value is bound with `?`; the one
identifier that cannot be bound (the table name in `countRows`) is checked
against a 19-entry allow-list; there is no `SELECT *`; the scan finds no SQL
keyword anywhere outside the repository module.

**No credentials are committed.** `.dev.vars.example` holds only the D1
database id, which `docs/adr/0002-d1-no-shard.md` explicitly records as a
non-secret. `apps/worker/wrangler.jsonc` holds the same id in the binding.
`.github/workflows/spike-s3-egress.yml` reads no secrets, requests only
`contents: read`, and is `workflow_dispatch`-only — the correct shape for a
workflow that makes real requests to ten publishers.

**`compressHTML: true`, `build.concurrency: 1` and `experimental.incrementalBuild:
true` are all set and asserted.** The built output confirms the whitespace
survival the DSN-12 fixture is for: `<p class="headline"><span>The</span> <em>Meridian</em></p>`
renders with the space intact.

---

_Reviewed: 2026-10-21T13:30:00Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
