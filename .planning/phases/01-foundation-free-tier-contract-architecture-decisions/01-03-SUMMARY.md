---
phase: 01-foundation-free-tier-contract-architecture-decisions
plan: 03
subsystem: infra
tags: [cloudflare, free-tier, budget, zod, vitest, adr, ops-01, ops-04, d-05, no-spend]

# Dependency graph
requires:
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 01
    provides: "the buildable repository, the `shared/config/` home for a single-source config module, and a whole-tree literal scan already excluding test fixtures"
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 02
    provides: "the D1 schema whose `usage_log` table carries one column per measured ceiling — the consumer this registry exists for"
provides:
  - "`config/free-tier-limits.json` — eighteen ceilings, each with value, unit, period, source_url and verified_on, plus the `paid_plan_decision_rule` in the same file"
  - "`shared/config/free-tier-limits.ts` — the only module permitted to read a ceiling; validates the registry with Zod at import time and throws on any shape violation"
  - "`ENFORCED_LIMIT_TOKENS` — the scan tokens derived from the enforced ceilings at runtime, so the token list cannot drift from the registry"
  - "A whole-tree scan test that fails when any code path reads a ceiling from anywhere else, and that plants a deliberate violation to prove the gate can fail"
  - "`docs/adr/0005-free-tier-ceiling-and-no-spend.md` — the standing no-spend decision, the three OPS-04 triggers, and the honest limits of Cloudflare's budget alerts"
  - "The `never_purchase` disposition, machine-readable, in the same file as the budget it governs"
affects: [01-04, 01-05, 01-06, phase-2-feed-acquisition, phase-3-curation-core, phase-5-publication-surface, phase-6-digest-trust-seo, phase-7-operational-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One versioned budget file. A ceiling is a design input (D-05), so it is recorded with its source URL and its verification date before the code that depends on it exists."
    - "One accessor module. `shared/config/free-tier-limits.ts` is the only place a ceiling may be read, and it validates the whole registry at import time so a malformed registry throws rather than serving a wrong number."
    - "Scan tokens are derived from the data, never hand-written. A newly recorded enforced ceiling is scanned for as soon as it is written down, with no second edit anywhere."
    - "A gate is proven by making it fail. The scan plants a deliberate violation, asserts the scanner catches it, and removes it in a `finally` block."
    - "Test fixtures are excluded from repository-wide literal scans — a test legitimately asserts the literal it guards, and a scan that reports its own fixtures is a gate nobody reads."

key-files:
  created:
    - config/free-tier-limits.json
    - shared/config/free-tier-limits.ts
    - shared/config/__tests__/free-tier-limits.test.ts
    - docs/adr/0005-free-tier-ceiling-and-no-spend.md
  modified:
    - .gitignore

key-decisions:
  - "The free tier is a permanent hard ceiling, recorded as `standing_disposition: never_purchase` inside the budget file itself, so the rule and the budget cannot drift apart (D-05)."
  - "`r2_storage_gb_month` is `informational`, not `enforced`: the bare token `10` collides with `D-10`, `ING-10` and a column-width argument in unrelated source, so scanning for it would fail on the current tree and could never pass. The ceiling is still recorded, sourced, dated and measured by the Phase 7 audit Worker."
  - "The self-proving fixture is planted at `scripts/__planted_ceiling.ts`, outside any `__tests__` directory, because the scan excludes test fixtures and would otherwise skip the very file it is meant to catch."
  - "The plan's task 1 behaviour bullets (registry holds the ceilings, the rule names the three triggers, the disposition is recorded) were implemented as a committed test in the same test file task 2 extends, rather than as an inline check — the plan gives task 1 no test file of its own."
  - "`ENFORCED_LIMIT_TOKENS` is exported from the accessor, not computed in the test, so the token derivation lives with the data it derives from."
  - "The ADR states that Cloudflare's budget alerts are informational only and explicitly refuses to claim they prevent billing; the lifecycle rules are named as the real cap and the 50%/75% percentage alerts are assigned to the Phase 7 audit Worker."

patterns-established:
  - "A ceiling is a value, a unit, a period, a source URL and a verification date — never a bare number."
  - "An enforcement flag on a ceiling means 'this value is distinctive enough to be literal-scanned'. It is a property of the number, not of the policy."
  - "The failure message of a source scan names the file, the line number and the token, because a scan that only says 'failed' gets ignored."

requirements-completed: [OPS-01, OPS-04]

# Metrics
duration: 15min
completed: 2026-10-20
---

# Phase 1 Plan 03: The Free-Tier Ceiling Registry and the Standing No-Spend Decision Summary

**Eighteen sourced ceilings in one versioned file, a Zod-validated accessor that is the only legal home for a ceiling value, a whole-tree scan that fails the build when a ceiling is hardcoded anywhere else — and a scan that plants a deliberate violation to prove it can fail.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-20T23:35:07Z
- **Completed:** 2026-10-20T23:49:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- **Every ceiling the project depends on is in one file, with its source and its date.** `config/free-tier-limits.json` holds eighteen rows — the seventeen named in the plan plus the D-18 row for the serve-time image check's one extra R2 Class B read per image view — each carrying `value`, `unit`, `period`, `source_url`, `verified_on` and an `enforcement` flag. The plan's own verification command reads `registry OK: 18 limits, 3 triggers`.
- **The decision rule lives in the budget file, so it cannot drift from the budget.** `paid_plan_decision_rule` names all three OPS-04 triggers verbatim — traffic at 4,000 daily visitors, a static project exceeding 20,000 files, and any revenue — and records the standing disposition `never_purchase` beside them, with the three D-07 load-shedding mechanisms and the D-08 permanent-wall framing.
- **There is exactly one place a ceiling can be read from, and a test proves both that the tree is clean and that the check would fail if it were not.** `shared/config/free-tier-limits.ts` validates the whole registry with Zod at import time and throws on any shape violation; `limit(id)` throws a descriptive error for an unknown id. The scan walks every `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` and `.json` file under `shared/`, `apps/`, `scripts/`, `spikes/` and `config/`, and reports any stray enforced literal as `file:line — token`.
- **The gate was observed to fail, twice.** The self-proving step plants `const FREE_TIER_WORKERS_REQUESTS = 100000;` in a scanned file, asserts the scanner reports it, and removes it in a `finally` block. Independently of the suite, planting `export const CAP = 5000000;` into a real source file was confirmed to fail the scan with the exact `shared/__tmp_stray.ts:1 — 5000000` message.
- **The ADR records the decision honestly.** ADR 0005 states that Cloudflare's budget alerts are informational only — quoting Cloudflare's own wording that the alert "does not cap your usage or impact your account in any way" — names the lifecycle rules as the real cap on storage growth, assigns the 50%/75% percentage alerts to the Phase 7 audit Worker (OPS-03), and explicitly refuses to claim that alerts prevent billing.

## task Commits

Each task was committed atomically, with the failing test landed before the implementation it guards:

1. **task 1: write the versioned free-tier ceiling registry** — `6c52aa9` (test) → `8606b70` (feat)
2. **task 2: build the single accessor and prove no other code path reads a ceiling** — `6dc984d` (test) → `73b44dd` (feat)
3. **task 3: record the standing no-spend decision honestly** — `1145cf7` (docs)

**Plan metadata:** see the closing `docs(01-03)` commit.

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `config/free-tier-limits.json` — the versioned budget: eighteen ceilings with their sources and verification dates, plus the `paid_plan_decision_rule` (three triggers, `never_purchase`, three load-shedding mechanisms, the D-09 non-conforming dependency).
- `shared/config/free-tier-limits.ts` — the only module permitted to read a ceiling. Zod-validates the registry at import time; exports `FREE_TIER_LIMITS`, `limit(id)`, `PAID_PLAN_DECISION_RULE` and `ENFORCED_LIMIT_TOKENS`.
- `shared/config/__tests__/free-tier-limits.test.ts` — fourteen tests in four groups: registry integrity, accessor behaviour, the whole-tree scan, the self-proving step, and accessor purity.
- `docs/adr/0005-free-tier-ceiling-and-no-spend.md` — the standing no-spend decision, the three triggers and their responses, the honest limits of Cloudflare's alerting, and the D-09 and D-18 obligations.
- `.gitignore` — one added line, so the scan's planted fixture can never be committed if a test run is interrupted.

## Decisions Made

- **`r2_storage_gb_month` is `informational`, not `enforced`.** The plan's interfaces table marks it `enforced`, but the bare token `10` collides with `D-10` and `ING-10` in `shared/config/site.ts` and with a column-width argument in `scripts/db/verify-local.mjs`. Scanning for it would fail on the current tree and could never pass. The plan's own rule — an enforced value must be "distinctive enough to be searched for as a stray literal in source without colliding with unrelated code" — and the research's P6 note, which names `10` GB explicitly as a value that must be `informational`, both point the same way. The ceiling keeps its value, its source and its date, and stays readable through the accessor and measurable by the Phase 7 audit Worker; only the literal scan skips it.
- **The self-proving fixture is planted outside `__tests__`.** The plan names `scripts/__tests__/__planted_ceiling.ts`, but the scan excludes `__tests__` directories as test fixtures — so the scanner would skip the very file it is meant to catch and the self-proving step would fail against itself. The fixture is planted at `scripts/__planted_ceiling.ts`, a scanned root that is not a test fixture. The `finally`-block deletion is unchanged.
- **The plan's task 1 behaviour bullets were committed as a test.** Task 1 lists three registry-shaped behaviours but no test file of its own, so they live in the same test file task 2 extends. The registry is therefore covered by a committed regression test from its first commit, not only by an inline command.
- **The ADR's References section points at `docs/adr/0001-delivery-model.md`, which plan 01-04 writes.** The forward reference is deliberate: the eight-project shard is the mechanism D-05 makes mandatory, and ADR 0005 has to name it.
- **The `enforcement` flag is documented as a property of the number, not of the policy.** The ADR states that an informational ceiling is still recorded, still readable and still measured — only the literal scan skips it. That is what makes the deviation above safe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `r2_storage_gb_month` cannot be `enforced` — the token `10` collides with unrelated source**
- **Found during:** task 1 (registry design)
- **Issue:** the plan's `<interfaces>` table marks the R2 storage ceiling (`10` GB-month) as `enforced` and its prose lists `10` among the enforced values. The scan token for that value is the bare string `10`, which matches `D-10` and `ING-10` in `shared/config/site.ts` and the `pad('EXPECTED', 10)` argument in `scripts/db/verify-local.mjs`. The scan would therefore fail against the existing tree on four unrelated lines, and the test could never pass. The plan's own rationale for the flag — that an enforced value must be "distinctive enough to be searched for as a stray literal in source without colliding with unrelated code" — is violated by `10`, and the research's P6 section names `10` GB explicitly as a value that must be `informational`.
- **Fix:** marked the row `informational`. The ceiling keeps its value, unit, period, `source_url` and `verified_on`, stays readable through `limit('r2_storage_gb_month')` and stays measured by the Phase 7 audit Worker; only the literal-scan coverage is skipped.
- **Files modified:** `config/free-tier-limits.json`
- **Verification:** the scan test passes against the whole tree, and the token derivation test proves `10` is not among `ENFORCED_LIMIT_TOKENS`.
- **Committed in:** `8606b70`

**2. [Rule 1 - Bug] The self-proving fixture was planted inside the directory the scan excludes**
- **Found during:** task 2 (RED phase)
- **Issue:** the plan writes the temporary file as `scripts/__tests__/__planted_ceiling.ts` and then requires the scan to report it. The scan skips any `__tests__` directory, because test fixtures legitimately assert the literal they guard and the self-proving step plants one on purpose. A file placed in `scripts/__tests__/` would have been skipped by the scanner, so the assertion "the scan REPORTS that file" would have failed against the plan's own fixture.
- **Fix:** the fixture is planted at `scripts/__planted_ceiling.ts` — a scanned root, not a test fixture, not a `*.test.ts` file — and the deletion in the `finally` block is unchanged. The reason for excluding test fixtures is stated in the code at the exclusion, in the scan's own comment and in the self-proving group's comment.
- **Files modified:** `shared/config/__tests__/free-tier-limits.test.ts`
- **Verification:** the self-proving test passes and reports `scripts/__planted_ceiling.ts:1 — 100000`; the tree is clean again after deletion.
- **Committed in:** `6dc984d`

**3. [Rule 3 - Blocking] The planted fixture is now gitignored**
- **Found during:** task 2
- **Issue:** the fixture is a generated file that exists only while the test runs. If a run were interrupted between the write and the `finally` block, the file would survive as an untracked file containing a ceiling literal — invisible to the commit protocol's "add to `.gitignore` if generated/runtime output" rule, and a stray literal that fails the next run's scan.
- **Fix:** added `scripts/__planted_ceiling.ts` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` is empty after a full test run.
- **Committed in:** `73b44dd`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All three are correctness fixes required for the plan's own test to be able to pass at all. No scope creep: no file outside the plan's `files_modified` list was created, and no ceiling value, source URL, trigger or decision was changed.

## Issues Encountered

- **The plan's enforcement flags and its own scan rule disagree for the value `10`.** Resolved in favour of the rule and the research rather than the copied flag, because the alternative is a gate that cannot close. The reasoning is recorded in the ADR itself, not only here, so a later reader of the registry sees why one ceiling is not literal-scanned.
- **The plan's `<interfaces>` prose and the research's P6 rule also disagree on which values are distinctive.** The research names `50` subrequests, `5` cron triggers and `10` GB as the examples that must be `informational`; the plan's table agrees on the first two and not the third. The table was followed everywhere except on that one row.
- **Two of the plan's ceiling ids carry the value `10` — the CPU ceiling and the R2 storage ceiling — and only one of them was marked `enforced`.** That is why the flag column looked inconsistent in the first place: the flag was distinguishing the two rows, not the two values.
- **ADR 0005 forward-references ADR 0001**, which plan 01-04 writes. The reference is left in place because the shard is the mechanism D-05 makes mandatory, and the file is named rather than merely alluded to so the link is checkable.

## Known Stubs

| Stub | Location | Reason | Resolved by |
|------|----------|--------|-------------|
| `standing_decision_text` names "Workers Paid" and the other paid tiers as a category rather than pricing each one | `config/free-tier-limits.json` | The disposition is a policy, not a price list, and pricing would create a number that reads as a quote | Never — the point is that no price is ever paid |
| `github_actions_minutes_per_month` records the 2,000/month private-repo figure | `config/free-tier-limits.json` | The repository is public (D-02), so the real allowance is unlimited; the conservative private figure is recorded because it is the number a fork or a private mirror would hit | Phase 7's audit Worker, if the repository ever changes visibility |

No other stub was introduced: every ceiling carries a live source URL and a verification date, the accessor resolves every id, and no value flows to a UI.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: public_budget_figures | `config/free-tier-limits.json` | The registry is public because the repository is public (D-02). It contains ceilings, source URLs, decision thresholds and the standing no-spend disposition — no credentials, no account identifiers, and nothing that grants access to any service. The file records what the project will not spend rather than what it holds. |
| threat_flag: registry_is_the_single_gate | `shared/config/free-tier-limits.ts` | The whole OPS-01 guarantee rests on one module and one scan. If the scan is ever weakened, deleted or excluded from CI, ceilings can drift back into the code silently. The self-proving step is what keeps the scan honest: a scanner that has stopped catching a planted violation fails the build rather than passing quietly. |

## User Setup Required

None — no external service configuration was required. The Cloudflare budget alerts, the R2 lifecycle rules and the eight shard projects belong to plan 01-04 and were not touched here.

## Next Phase Readiness

- **Plan 01-04 (R2 lifecycle, the eight-project shard, the delivery-model ADR) can start.** The registry's `r2_storage_gb_month` ceiling is the number the lifecycle rule has to keep inside, and the `static_asset_files_per_project` ceiling of 20,000 is the per-shard file budget the shard matrix divides. ADR 0001 now has a named predecessor in ADR 0005, and ADR 0005 forward-references it by filename.
- **Plan 01-05 can start.** `shared/config/` is now the established home for a single-source config module with a typed accessor, which is the shape the image and domain contracts need.
- **Plan 01-06 (spikes S-1 to S-5) can start.** The spikes live in `spikes/`, which is already in the scan roots, so a spike that hardcodes a ceiling fails the build.
- **Phase 7's audit Worker now has its data source.** `config/free-tier-limits.json` is the file the Worker reads for the 50% and 75% percentage alerts, exactly as OPS-03 requires, and the `usage_log` table from plan 01-02 already has one column per measured ceiling. The registry's ids and the table's columns should be kept in step.
- **Phase 2 can plan against a known wall.** The Workers request ceiling of 100,000/day is the number the ingest design has to fit inside, and it is now a value with a source rather than a remembered figure.
- **One thing to carry forward:** a ceiling marked `informational` is not literal-scanned, so a stray copy of it in source will not be caught. `r2_storage_gb_month` (10 GB-month) is the one such ceiling that a future developer might plausibly hardcode; the Phase 7 audit Worker measures it against the registry, which is where the coverage lives.

---

## Self-Check: PASSED

Every file, commit and claim in this summary was verified against the working tree.

- **Files:** all four created files plus the modified `.gitignore` exist on disk. `missing_count=0`.
- **Commits:** all five task commits exist in `git log` — `6c52aa9`, `8606b70`, `6dc984d`, `73b44dd`, `1145cf7`.
- **`npm test -- --run shared/config/__tests__/free-tier-limits.test.ts`:** exits 0 — 14 tests, including the self-proving step.
- **`npm test -- --run`:** exits 0 — 6 test files, 54 tests, all passing.
- **`npm run typecheck`:** exits 0.
- **`npm run build`:** exits 0 — the Astro build still succeeds.
- **Registry:** `node -e` verification reads `registry OK: 18 limits, 3 triggers`; `never_purchase` occurs exactly once in `config/free-tier-limits.json`.
- **ADR 0005:** the plan's verification command reads `ADR 0005 OK`; the file contains D-05, D-07, D-08, D-09 and D-18, the thresholds 4,000 and 20,000 and the revenue trigger, the phrase "informational only", and the three load-shedding mechanisms. A naive scan for "prevent billing" matches one line, and that line is the negation — "does **not** claim that alerts prevent billing".
- **The gate is live:** planting `export const CAP = 5000000;` into a scanned source file was confirmed to fail the suite with `shared/__tmp_stray.ts:1 — 5000000`. The temporary file was removed.
- **Working tree:** `git status --short` is empty after a full test run — the planted fixture is cleaned up and gitignored.

---

*Phase: 01-foundation-free-tier-contract-architecture-decisions*
*Completed: 2026-10-20*
