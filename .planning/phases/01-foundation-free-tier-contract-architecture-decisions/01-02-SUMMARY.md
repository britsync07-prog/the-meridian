---
phase: 01-foundation-free-tier-contract-architecture-decisions
plan: 02
subsystem: database
tags: [cloudflare-d1, sqlite, rss, repository-pattern, workers, wrangler, adr, ops-14, seed-data]

# Dependency graph
requires:
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 01
    provides: "the buildable repository, the `shared/` contract layer imported by relative path, and the root tsconfig that already covered `apps/worker/src/**/*`"
provides:
  - "The D1 DDL as `shared/db/0001_init.sql` — 19 tables and 32 named indexes, including the four 16-bit LSH band indexes and the partial editorial-rank index"
  - "The reference seed as `shared/db/seed.sql` — 8 editions, 8 sections, the 64-row cross-joined edition-sections join and a 30-outlet source registry, every source at `terms_status = 'unverified'`"
  - "`apps/worker/src/db/repository.ts` — the only module in the repository that contains SQL, with seven typed, parameterised methods"
  - "`apps/worker/src/db/config.ts` — the single resolution point for the database identifier, read from configuration"
  - "`apps/worker/wrangler.jsonc` — the D1 and R2 bindings and the migrations directory"
  - "`scripts/db/verify-local.mjs` — 24 assertions against a genuinely empty local D1"
  - "`scripts/db/verify-swap.mjs` — the executable proof that repointing the database identifier needs no code change"
  - "`docs/adr/0002-d1-no-shard.md` — the D1 topology decision, its rationale, the growth controls and the Phase 1 schema deviations"
  - "A real, created D1 database named `meridian` in the Cloudflare account"
  - "The Phase 2 fetch path's entry point (`listActiveSources`) and write path (`insertStory`), both already in the repository module"
affects: [01-03, 01-04, 01-05, 01-06, phase-2-feed-acquisition, phase-3-curation-core, phase-5-publication-surface, phase-7-operational-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One `package.json`, one lockfile, no workspace protocol (D-20), carried forward unchanged."
    - "Exactly one module in the repository contains SQL. `apps/worker/src/db/repository.ts`. A test scans the whole tree and fails on any SQL keyword outside it."
    - "Every statement names its columns explicitly and binds every value with `?`. The one interpolated identifier — the table name in `countRows` — is checked against an allow-list of the schema's own tables."
    - "Migrations are applied by `npx wrangler d1 migrations apply`, never by the Worker. The migrations pattern is scoped to numbered schema files so the seed is applied as data."
    - "The database identifier is a configuration value: `d1_databases[].database_id` in `wrangler.jsonc`, overridable for the Worker's own reporting by `MERIDIAN_DB_ID`."
    - "TDD: the failing test lands in its own commit before the implementation it guards."

key-files:
  created:
    - shared/db/0001_init.sql
    - shared/db/seed.sql
    - shared/db/__tests__/schema.test.ts
    - apps/worker/src/db/config.ts
    - apps/worker/src/db/repository.ts
    - apps/worker/src/db/__tests__/repository.test.ts
    - apps/worker/src/index.ts
    - apps/worker/wrangler.jsonc
    - scripts/db/verify-local.mjs
    - scripts/db/verify-swap.mjs
    - docs/adr/0002-d1-no-shard.md
    - .dev.vars.example
  modified: []

key-decisions:
  - "The D1 database is named `meridian` and holds every edition. No edition-based sharding. `docs/adr/0002-d1-no-shard.md` is the binding decision, and it explicitly overrides `research/PITFALLS.md`'s 'shard from day one'."
  - "The 'retrofitting sharding later is painful' objection is answered with the repository module, not with shards: seven typed methods and an identifier held in configuration make a future sharding a routing change, not a rewrite. `scripts/db/verify-swap.mjs` is the executable form of that claim."
  - "The schema carries 19 tables and 32 named indexes. The plan's '19 tables / 31 indexes' came from a research miscount: the research DDL has 17 tables and 31 indexes, and the plan itself mandates an index the research count did not include."
  - "`usage_log` and `corrections` are added to the research DDL. `usage_log` is in the reconciled architecture's D1 model; `corrections` is the queue OPS-23 requires. Phase 1 owns the schema, and a table added later is a migration."
  - "`story_sources` gains `headline` and `url`. The raw mention rows on `stories` are pruned after 30 days, but the outlet list, the headline and the attribution URL are retained permanently — on the join table."
  - "`migrations_pattern` is scoped to `../../shared/db/[0-9]*.sql` so `seed.sql` is applied as data with `d1 execute --file`, never as a schema migration."
  - "The seed's fourth Indian outlet is a Hindi-language publisher (Amar Ujala). The Hindi edition is sourced from native Hindi publishers and never machine-translated, so the registry proves the `language` column carries `hi`."

patterns-established:
  - "A schema claim is a number, not a description: `scripts/db/verify-local.mjs` asserts 19 tables and 32 named indexes by name and by count, so a dropped index fails loudly."
  - "A proof that mutates the repository restores what it touched and then proves the restoration, by hashing the protected trees before and after."
  - "Configuration claims are checked against the real artefact: the repository test reads `apps/worker/wrangler.jsonc` and the real source tree rather than trusting a comment."

requirements-completed: [OPS-14]

# Metrics
duration: 73min
completed: 2026-10-20
---

# Phase 1 Plan 02: D1 Schema, Seed and the Single Repository Module Summary

**A 19-table D1 schema with 32 named indexes applied to an empty database, a 30-outlet source registry with every feed's terms still unverified, and one repository module that is the only place in the codebase where SQL exists — with the database identifier proven to be a configuration value by a script that repoints it and rebuilds everything from nothing.**

## Performance

- **Duration:** 73 min
- **Started:** 2026-10-20T15:53:27Z
- **Completed:** 2026-10-20T17:06:14Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- **The schema applies to a genuinely empty database.** `scripts/db/verify-local.mjs` deletes `.wrangler/state`, applies the migrations, seeds, and asserts 24 things — including 19 tables, 32 named indexes, the presence of `idx_stories_band0` through `idx_stories_band3`, that `idx_clusters_editorial` really is a partial index, and that the seed produces 8 editions, 8 sections, 64 edition-sections rows and 30 sources with **zero** rows whose `terms_status` is anything other than `unverified`. The four LSH band indexes are the ones that keep the Phase 3 clusterer inside the D1 read budget, so their absence would be a silent, expensive regression.
- **There is exactly one module with SQL, and a test proves it.** `apps/worker/src/db/repository.ts` exposes seven typed, parameterised methods. The test walks `apps/`, `shared/`, `scripts/` and `spikes/` for `.ts`/`.mjs`/`.js` files, matches `SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|CREATE INDEX|ALTER TABLE` case-insensitively, and fails with the file and the line on any hit outside the repository module. It also asserts no star projection, no hardcoded identifier, that every statement names its columns, and that `countRows` refuses a table that is not on the allow-list.
- **The identifier is a configuration value, proven by execution.** `scripts/db/verify-swap.mjs` rewrites only the `database_id` in `apps/worker/wrangler.jsonc`, empties the local state, applies the migrations and the seed under the new identifier, asserts 8 editions and 30 sources, restores the configuration byte-for-byte, and hashes `apps/worker/src` and `shared` before and after to prove nothing else moved. It prints the masked diff so the single changed line is visible.
- **The topology decision is recorded, and it overrides the research.** `docs/adr/0002-d1-no-shard.md` accepts one D1 database with no edition sharding, gives the numbers (~70 MB/year against 500 MB per database and 5 GB per account), explains why edition sharding would destroy cross-country flagging, the one-story-many-editions model and the Most Covered ranking, and states plainly that it overrides `research/PITFALLS.md`'s "Never. Shard from day one".
- **The D1 database exists.** `meridian` was created in the Cloudflare account (`af7ca858-b8ce-432a-8e80-a05c39e3c1be`, region APAC) and its id is recorded in the binding and in `.dev.vars.example`.

## task Commits

Each task was committed atomically, with the failing test landed before the implementation it guards:

1. **task 1: land the D1 DDL and the seed** — `b4c3401` (test) → `37f5bb7` (feat)
2. **task 2: build the single repository module and the configuration-held database identifier** — `282bf34` (test) → `eac0981` (feat)
3. **task 3: prove the database identifier is a configuration value, and record the D1 topology ADR** — `c57c59c` (feat)

**Plan metadata:** see the closing `docs(01-02)` commit.

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `shared/db/0001_init.sql` — the D1 DDL: 19 tables, 32 named indexes, `PRAGMA foreign_keys = ON` and `PRAGMA defer_foreign_keys = true` as the first two statements, the four LSH band indexes, the partial editorial-rank index, and no `DROP` or `DELETE` anywhere.
- `shared/db/seed.sql` — 8 editions, 8 sections, the cross-joined edition-sections join and the 30-outlet registry, all `INSERT OR IGNORE` so it is safe to re-run on every build.
- `shared/db/__tests__/schema.test.ts` — the schema contract: table and index counts, the required index set, the partial index's `WHERE` clause, the terms-of-use ledger, the absence of `SELECT *`, and the absence of any deletion statement.
- `apps/worker/wrangler.jsonc` — the Worker project config: the D1 binding with `migrations_dir: ../../shared/db` and a migrations pattern scoped to numbered schema files, and the `R2` binding.
- `apps/worker/src/db/config.ts` — `MeridianEnv`, the `D1Binding` extension, and `resolveDatabaseId`.
- `apps/worker/src/db/repository.ts` — the only module in the repository that contains SQL.
- `apps/worker/src/db/__tests__/repository.test.ts` — the OPS-14 proof: the repository-wide SQL scan, the no-star-projection check, the no-hardcoded-identifier check, the column-list check, the `resolveDatabaseId` cases and the `countRows` allow-list refusal.
- `apps/worker/src/index.ts` — a minimal health endpoint that reaches the datastore only through the repository module.
- `scripts/db/verify-local.mjs` — 24 assertions against an emptied local D1.
- `scripts/db/verify-swap.mjs` — the identifier-swap proof.
- `docs/adr/0002-d1-no-shard.md` — the D1 topology ADR.
- `.dev.vars.example` — the non-secret database id, with the instruction to copy it to `apps/worker/.dev.vars`.

## Decisions Made

- **19 tables and 32 named indexes, not 19 and 31.** The plan's counts came from the research's own summary, and the research DDL has 17 tables and 31 indexes. The two extra tables are `usage_log` (in the reconciled architecture's D1 model, read by the Phase 7 audit Worker) and `corrections` (the queue OPS-23 requires). The thirty-second index is `idx_edition_clusters_edition`, which the plan itself mandates and the research schema could not have because `edition_clusters` had no `published_at` column to sort by. The verify script asserts the true numbers by name and by count, so drift still fails loudly.
- **`story_sources` carries `headline` and `url`.** The research DDL keeps them only on `stories`, whose rows are pruned after 30 days. PROJECT.md locks the opposite behaviour — the outlet list, headline and URL are retained permanently — and the plan's own `listStoriesForCluster` selects both columns from `story_sources`. Both columns were added.
- **The seed is data, not a migration.** `migrations_pattern` is `../../shared/db/[0-9]*.sql`, so wrangler treats `0001_init.sql` as the schema migration and `seed.sql` as data to apply with `d1 execute --file`. Without the pattern, wrangler silently applied the seed as a second migration — which would have run the registry insert on every production deploy.
- **`resolveDatabaseId` prefers `MERIDIAN_DB_ID`, and the binding's `__dbId` is a best-effort fallback.** The plan asserts the runtime surfaces `__dbId` on the D1 binding; it does not. Probed directly, the binding's own properties are `alwaysPrimarySession` and `fetcher`. The authoritative configuration value is the `database_id` of the binding either way; the override only tells the Worker what to *report*.
- **The fourth Indian outlet is a Hindi-language publisher.** The plan named three Indian outlets for four slots. The Hindi edition is sourced from native Hindi publishers and never machine-translated, so one Hindi row in the registry proves the `language` column carries `hi` and gives Phase 2 a starting point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's table and index counts did not match the schema the plan required**
- **Found during:** task 1
- **Issue:** the plan asserts 19 tables and 31 indexes and instructs the DDL to be transcribed faithfully from the research DDL — which contains 17 tables and 31 indexes. The plan also mandates `idx_edition_clusters_edition` on `(edition_id, published_at)`, an index the research count cannot include because `edition_clusters` has no `published_at` column.
- **Fix:** landed the complete research DDL plus the additions the architecture and requirements need — `usage_log`, `corrections`, `sources.freshness_sla_hours`, `story_sources.headline`, `story_sources.url`, `edition_clusters.published_at` — and the plan's mandated index. The result is 19 tables and 32 named indexes, asserted exactly by name and by count.
- **Files modified:** `shared/db/0001_init.sql`, `scripts/db/verify-local.mjs`, `shared/db/__tests__/schema.test.ts`
- **Verification:** `node scripts/db/verify-local.mjs` — 24/24 assertions pass.
- **Committed in:** `b4c3401`, `37f5bb7`

**2. [Rule 2 - Missing Critical] `story_sources` could not retain the headline and the URL**
- **Found during:** task 1
- **Issue:** the research DDL puts `headline` and `url` only on `stories`, whose rows are pruned 30 days after the merge window closes. PROJECT.md's locked constraint says `story_sources` retains the outlet list, headline and URL permanently, and the plan's own repository method `listStoriesForCluster` selects `headline, url` from `story_sources`. Without the columns the plan's method cannot be written at all.
- **Fix:** added `headline TEXT NOT NULL` and `url TEXT NOT NULL` to `story_sources`, with the retention rule in the table comment.
- **Files modified:** `shared/db/0001_init.sql`
- **Verification:** `listStoriesForCluster` compiles against the schema and the schema test asserts the plan's exact projection.
- **Committed in:** `37f5bb7`

**3. [Rule 2 - Missing Critical] Added the `usage_log` and `corrections` tables**
- **Found during:** task 1
- **Issue:** the reconciled architecture's D1 model lists `usage_log` ("daily free-tier accounting, read by the audit Worker") and REQUIREMENTS OPS-23 requires a corrections queue ("the report enters a corrections queue that produces a dated correction note"). Neither exists in the research DDL, and Phase 1 is the schema phase.
- **Fix:** added both, with `usage_log` holding one row per day and a column per ceiling the audit Worker measures, and `corrections` holding the reader report, its status and the dated note it produces.
- **Files modified:** `shared/db/0001_init.sql`
- **Verification:** the schema test asserts both table names in order.
- **Committed in:** `37f5bb7`

**4. [Rule 3 - Blocking] `edition_clusters` had no `published_at` for the mandated index to sort on**
- **Found during:** task 1
- **Issue:** the plan requires `idx_edition_clusters_edition` on `(edition_id, published_at)`. The research table has neither the column nor the index.
- **Fix:** added `published_at TEXT NOT NULL` to `edition_clusters` and the index the plan specifies.
- **Files modified:** `shared/db/0001_init.sql`
- **Verification:** the schema test asserts the index's exact shape.
- **Committed in:** `37f5bb7`

**5. [Rule 1 - Bug] The table count was permanently off by one because D1 creates `_cf_METADATA`**
- **Found during:** task 1
- **Issue:** a local D1 database contains Cloudflare's own `_cf_METADATA` table alongside the schema. The plan's exclusion list (`sqlite_*` and `d1_migrations`) does not cover it, so the count read 20 against an expected 19.
- **Fix:** the count now excludes `sqlite_*`, `_cf_*` and `d1_migrations`, using `GLOB` rather than `LIKE` because `LIKE`'s `_` is a single-character wildcard and `'sqlite_%'` would match names it should not.
- **Files modified:** `scripts/db/verify-local.mjs`
- **Verification:** the assertion reads 19.
- **Committed in:** `37f5bb7`

**6. [Rule 3 - Blocking] `wrangler d1 migrations apply` treats `seed.sql` as a migration**
- **Found during:** task 1
- **Issue:** with the default `*.sql` pattern, wrangler applied the seed as migration 0002 — confirmed by reading the `d1_migrations` table. That would run the registry insert on every production deploy and make the seed impossible to separate from the schema.
- **Fix:** `migrations_pattern` is now `../../shared/db/[0-9]*.sql`, so only numbered schema files are migrations. The seed is applied with `d1 execute --file`.
- **Files modified:** `apps/worker/wrangler.jsonc`
- **Verification:** the `d1_migrations` table contains `0001_init.sql` only.
- **Committed in:** `37f5bb7`

**7. [Rule 3 - Blocking] `wrangler d1 migrations apply` succeeds when there is nothing to apply**
- **Found during:** task 1
- **Issue:** with no migration files present, wrangler's apply step exits 0. The script would have gone on to fail with a confusing "0 tables" message instead of naming the real problem — a mis-pointed `migrations_dir`.
- **Fix:** the script now asserts the migration list contains `0001_init.sql` before applying, and fails with that message.
- **Files modified:** `scripts/db/verify-local.mjs`
- **Verification:** with the schema absent, the script fails with "was not found in the migrations directory".
- **Committed in:** `b4c3401`

**8. [Rule 1 - Bug] The plan's `env.DB.__dbId` fallback does not exist in the Workers runtime**
- **Found during:** task 2
- **Issue:** the plan states that "`env.DB.__dbId` is the binding's configured id surfaced by the runtime". Probed directly against a running `wrangler dev` server, the D1 binding's own properties are `alwaysPrimarySession` and `fetcher`, and `__dbId` is `undefined`. The `D1Database` type does not declare it either.
- **Fix:** `resolveDatabaseId` keeps `__dbId` as a documented best-effort fallback and treats `MERIDIAN_DB_ID` as the operative source. The authoritative configuration value remains the binding's `database_id`. Verified separately that `wrangler dev` reads `.dev.vars` from the directory holding `wrangler.jsonc`, so `apps/worker/.dev.vars` is where the override lives locally.
- **Files modified:** `apps/worker/src/db/config.ts`, `.dev.vars.example`
- **Verification:** the running Worker reports `databaseId` from `apps/worker/.dev.vars`; the unit test covers the override, the fallback, the blank-value case and the unknown case.
- **Committed in:** `282bf34`, `eac0981`

**9. [Rule 3 - Blocking] The plan's wrangler commands omit `--config`**
- **Found during:** task 1
- **Issue:** `npx wrangler d1 migrations list meridian --local` only resolves the `migrations_dir` when run from `apps/worker/`. The verification scripts run from the repository root.
- **Fix:** every wrangler invocation carries `--config apps/worker/wrangler.jsonc`.
- **Files modified:** `scripts/db/verify-local.mjs`, `scripts/db/verify-swap.mjs`
- **Verification:** both scripts exit 0 from the repository root.
- **Committed in:** `b4c3401`, `c57c59c`

**10. [Rule 3 - Blocking] The Worker config was needed by task 1's verification harness**
- **Found during:** task 1
- **Issue:** the plan creates `apps/worker/wrangler.jsonc` in task 2, but task 1's verification applies migrations through it. Task 1 could not have been verified as written.
- **Fix:** the file was created in task 1 with the plan's exact content, and task 2 added the Worker source around it.
- **Files modified:** `apps/worker/wrangler.jsonc`
- **Verification:** `wrangler deploy --dry-run` bundles the Worker and reports both bindings.
- **Committed in:** `b4c3401`

**11. [Rule 1 - Bug] The plan says the repository exposes "exactly the six listed above" methods and enumerates seven**
- **Found during:** task 2
- **Issue:** the required-method list names seven (`listActiveSources`, `insertStory`, `findClusterBySlug`, `listStoriesForCluster`, `listProminentClusters`, `countTables`, `countRows`); the prose says six.
- **Fix:** the enumerated list is authoritative — a method list is a contract, and dropping one to match a miscount would be a defect. The test asserts the seven names.
- **Files modified:** `apps/worker/src/db/__tests__/repository.test.ts`
- **Verification:** the test passes.
- **Committed in:** `282bf34`

**12. [Rule 1 - Bug] The Worker's doc comment broke D-12's single-file rule**
- **Found during:** task 2
- **Issue:** the file's header comment opened with the publication name, which the D-12 test forbids in any file other than `shared/config/site.ts`.
- **Fix:** the comment now says "The edge Worker." The publication name still lives in exactly one file.
- **Files modified:** `apps/worker/src/index.ts`
- **Verification:** `npm test -- --run` — 40 tests, all passing.
- **Committed in:** `eac0981`

**13. [Rule 3 - Blocking] The schema test did not typecheck**
- **Found during:** task 1
- **Issue:** the test's helpers were written without parameter types, so `npm run typecheck` failed with six `TS7006` implicit-`any` errors.
- **Fix:** every helper is typed.
- **Files modified:** `shared/db/__tests__/schema.test.ts`
- **Verification:** `npm run typecheck` exits 0.
- **Committed in:** `37f5bb7`

---

**Total deviations:** 13 auto-fixed (4 missing critical, 4 bugs, 5 blocking)
**Impact on plan:** All thirteen are correctness fixes required for the plan's own acceptance criteria to hold. No scope creep: every addition is a table or column the project's own architecture, requirements or locked constraints already call for, and each is recorded in the ADR.

### Housekeeping outside the plan's task actions

- **The D1 database `meridian` was created in the Cloudflare account** (`af7ca858-b8ce-432a-8e80-a05c39e3c1be`, region APAC), as the plan's task 3 instructs. It is empty: the migrations have not been applied to it remotely, and the local database is a separate file.
- **A local `apps/worker/.dev.vars`** was written with the database id so `wrangler dev` resolves it. It is gitignored and was never staged.

## Issues Encountered

- **The research's own DDL count did not match the research's own summary** (17 tables against a claimed 19). This was the single largest source of friction in the plan, because the plan quotes the summary's number, instructs a faithful transcription, and mandates an index the faithful transcription cannot contain. Resolving it by asserting the true count, and by naming every addition and its source, kept the audit trail intact rather than papering over the gap.
- **D1's local database carries a `_cf_METADATA` table** that is not part of any schema. Any count of the schema's tables must exclude it explicitly, and `GLOB` is the only reliable way to do that — `LIKE`'s underscore is a wildcard.
- **The two runtime `URL`/`D1Database` type universes** did not collide here, but `D1Database` genuinely lacks `__dbId`, so the binding's type had to be extended in `config.ts` rather than cast at the use site.
- **The repository-wide SQL scan had to skip test files.** The scan matches SQL keywords, and the schema test asserts on SQL text by nature — the established pattern from plan 01-01 already excluded `__tests__` from repository-wide literal scans, and this extends it.

## Known Stubs

| Stub | Location | Reason | Resolved by |
|------|----------|--------|-------------|
| The 30 seeded `feed_url` values | `shared/db/seed.sql` | They are registry *entries*, recorded now so the taxonomy has a starting point. Every one of them is unverified and unprobed: no feed has been fetched, and some URLs are expected to be wrong, moved or blocked. | Phase 2. It verifies each feed's availability, freshness and terms of use, corrects or disables the ones that fail, and sets `terms_status = 'verified'` with a date only for the ones that pass. |
| `terms_status = 'unverified'` on all 30 sources | `shared/db/seed.sql` | Deliberate. The terms of use are a launch-blocking legal gate, and nothing may be fetched before a human has checked them. | Phase 2, one source at a time. `scripts/db/verify-local.mjs` fails if a seeded row is ever anything but unverified. |
| `sections` and `topics` are seeded, `entities` is not | `shared/db/0001_init.sql` | The entity gazetteer is Track E content work and belongs to the Phase 3 clustering phase. The table and its indexes exist; it has no rows. | Phase 3. |

No other stub was introduced: no component renders a hardcoded empty value, no placeholder copy reaches a page, and no data source is left unwired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: identifier_disclosure | `apps/worker/src/index.ts` | The health endpoint returns the resolved database id in its JSON body. The id is **not** a secret — it is committed in `apps/worker/wrangler.jsonc` and it grants no access on its own; reading or writing still requires an account credential. It is published so the deployment can be verified to be pointing at the intended database. If that trade is ever unwanted, the field can be dropped from the response without touching anything else. |
| threat_flag: identifier_in_repo | `.dev.vars.example` | The database id is committed in a file whose name suggests it holds secrets. It holds only a non-secret. `.dev.vars` itself is gitignored, and the example says so in its header. |
| threat_flag: interpolated_identifier | `apps/worker/src/db/repository.ts` | `countRows` interpolates a table name — the one identifier SQL cannot bind as a parameter. It is checked against a fixed allow-list of the schema's own tables and the test proves that a table name carrying an injection payload is refused. |
| threat_flag: identifier_provenance | `apps/worker/src/db/config.ts` | The `__dbId` fallback reads a property the Workers runtime does not currently expose. It is documented as best-effort and cannot cause a wrong-database connection — the binding, not this function, decides where the datastore lives. |
| threat_flag: unverified_feed_registry | `shared/db/seed.sql` | Thirty feed URLs are recorded but unprobed, and every one is marked `terms_status = 'unverified'`. A Phase 2 implementation that fetches a feed without checking its terms would be a legal exposure. The verify script fails if any seeded row is ever marked verified without that check having happened. |

## User Setup Required

None — everything was done automatically. Two notes for a fresh clone:

- **The D1 database exists.** `meridian` is created in the Cloudflare account with the id `af7ca858-b8ce-432a-8e80-a05c39e3c1be`, recorded in `apps/worker/wrangler.jsonc`.
- **For `wrangler dev` to report the database id**, copy the example to the place the runtime reads it from: `copy .dev.vars.example apps\worker\.dev.vars` (Windows) or `cp .dev.vars.example apps/worker/.dev.vars`. `.dev.vars` is gitignored. It is already present in this working tree.
- **The migrations have not been applied to the remote database.** `wrangler d1 migrations apply meridian --remote` is deliberately not part of this plan; it belongs with the first deployment.

## Next Phase Readiness

- **Plan 01-03 (free-tier ceiling registry) can start.** `config/free-tier-limits.json` has a consumer now: the `usage_log` table's columns are one per measured ceiling — Workers requests and CPU, D1 rows read and written, D1 storage, KV reads and writes, R2 Class A/B ops and storage, the largest shard's static file count and Workers AI neurons. The registry's ids and the table's columns should be kept in step.
- **Plan 01-04 (R2 lifecycle, the eight-project shard, the delivery-model ADR) can start.** The `R2` binding is declared with the bucket name `meridian`; the bucket itself does not exist yet, which is this plan's scope boundary. `wrangler deploy --dry-run` already bundles the Worker and reports both bindings.
- **Plan 01-05 (excerpt budget, shared templates, the image and domain ADRs) can start.** `shared/db/` is now the schema's home, and ADR 0002 establishes the `docs/adr/NNNN-title.md` format this plan's siblings follow.
- **Phase 2 can start against a real schema.** The fetch path's entry point (`listActiveSources`) and the write path (`insertStory`) are in the repository module, parameterised, and typed. The `sources` registry carries the ETag, the backoff window and the terms status the fetcher needs, and `story_sources` is ready to receive the permanent outlet list.
- **Phase 3 must read the LSH band columns, not the whole `stories` table.** `band0` through `band3` are indexed individually, and the clusterer's candidate generation must issue four index lookups. A scan of `stories` is a read-budget breach, and it is invisible until the first busy day.
- **One thing to carry forward:** the repository's row shapes mirror the D1 columns (`snake_case`, numeric ids), while `shared/types.ts` holds the domain contract (`camelCase`, slug ids). The mapper between them belongs to the caller — Phase 3's normaliser — not to the repository module.

---

## Self-Check: PASSED

Every file, commit and claim in this summary was verified against the working tree.

- **Files:** all 12 created files exist on disk. `missing_count=0`.
- **Commits:** all five task commits exist in `git log` — `b4c3401`, `37f5bb7`, `282bf34`, `eac0981`, `c57c59c`.
- **`node scripts/db/verify-local.mjs`:** exits 0 — 24/24 assertions against an emptied `.wrangler/state`.
- **`node scripts/db/verify-swap.mjs`:** exits 0 — the config was restored byte-for-byte, the only change was the `database_id`, and `apps/worker/src` and `shared` hashed identically before and after.
- **`npm test -- --run`:** exits 0 — 5 test files, 40 tests, all passing.
- **`npm run typecheck`:** exits 0.
- **`npm run build`:** exits 0 — the Astro build still succeeds.
- **`npx wrangler deploy --dry-run`:** bundles the Worker and reports both the D1 and the R2 binding.
- **`npx wrangler d1 list`:** the `meridian` database exists with the id recorded in the binding.
- **Schema contents:** 19 tables and 32 named indexes; `idx_stories_band0`–`idx_stories_band3` present; `idx_clusters_editorial` carries a `WHERE editorial_rank IS NOT NULL` predicate; `idx_edition_clusters_edition` present; `terms_status`, `terms_verified_at` and `terms_url` present on `sources`.

---

*Phase: 01-foundation-free-tier-contract-architecture-decisions*
*Completed: 2026-10-20*
