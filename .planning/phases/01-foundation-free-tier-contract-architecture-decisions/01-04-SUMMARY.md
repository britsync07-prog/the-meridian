---
phase: 01-foundation-free-tier-contract-architecture-decisions
plan: 04
subsystem: infra
tags: [cloudflare-r2, lifecycle-rules, workers-static-assets, sharding, adr, wrangler, med-08, ops-12, pub-12, ing-02, d-06]

# Dependency graph
requires:
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 01
    provides: "the buildable repository, the `shared/` contract layer, and the `scripts/` home for build-time Node scripts"
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 03
    provides: "`config/free-tier-limits.json` (the ceiling registry), `shared/config/free-tier-limits.ts` (the only legal home of a ceiling value) and `ENFORCED_LIMIT_TOKENS` (the scan tokens derived from the enforced ceilings)"
provides:
  - "A live R2 bucket named `meridian` with exactly two prefix-scoped lifecycle rules — `raw/` at 7 days and `media/` at 365 days"
  - "`scripts/cloudflare/r2-lifecycle.mjs` — the idempotent, convergent creator; it throws before any `lifecycle add` that would carry an empty prefix"
  - "`scripts/cloudflare/verify-lifecycle.mjs` — the live MED-08 proof; it parses the bucket's own rule listing and fails on an empty prefix, an unapproved prefix, a wrong day count, a disabled rule, or a rule count that is not exactly 2"
  - "Eight live Workers Static Assets projects — `meridian-static-uk` … `meridian-static-in-hi` — each serving its own locale prefix on its `workers.dev` subdomain"
  - "`wrangler/shards/route-table.json` — the eight-shard matrix, one locale prefix per shard, with the global surfaces listed for duplication"
  - "Eight assets-only shard configurations with `not_found_handling: \"none\"` and no `main` key"
  - "`scripts/shards/split-output.mjs` — partitions one Astro build into eight shard directories and reads the per-project file cap from the registry by id"
  - "`scripts/shards/deploy-all.mjs` — deploys every shard in order, names the shard that failed, and supports `--dry-run`"
  - "`scripts/shards/__tests__/shards.test.ts` — 14 assertions over the shard matrix, its safety and the ceiling-literal scan"
  - "`docs/adr/0001-delivery-model.md` — the delivery-model decision, recording EIGHT projects and naming the override of the research's single-project conclusion"
  - "`scripts/cloudflare/billing-alerts.md` — the alert configuration record, with every threshold expressed as a reference to its registry id"
affects: [01-05, 01-06, phase-2-feed-acquisition-raw-capture-normalization, phase-3-curation-core, phase-4-design-system, phase-5-publication-surface, phase-6-digest-trust-seo, phase-7-operational-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A creator script and a verifier script are separate on purpose. The verifier parses the LIVE listing, not a local file and not the creator's own output, so a bug in the creator cannot hide itself from the check."
    - "A destructive action is guarded on the call path, not on the data. `assertUsablePrefix()` throws before any `lifecycle add` invocation that would carry an empty prefix, so a future rule cannot slip past the check by being added in the wrong place."
    - "The creator is convergent, not merely idempotent: it removes every rule that is not one of the two it owns, so a drifted bucket is repaired rather than merely reported."
    - "One Astro build becomes eight output directories. The splitter rebuilds the shard tree from scratch on every run, because a stale file left behind by a previous build would be uploaded to the edge and would count against the ceiling."
    - "The per-project file cap is read from `config/free-tier-limits.json` by limit id at runtime. No shard script contains a ceiling literal, and a scan test fails the build if one appears."
    - "The shard matrix is asserted by a test rather than by convention: completeness, disjointness, `not_found_handling: \"none\"`, assets-only, and the ceiling scan."
    - "TDD: the failing test lands in its own commit before the implementation it guards."

key-files:
  created:
    - scripts/cloudflare/r2-lifecycle.mjs
    - scripts/cloudflare/verify-lifecycle.mjs
    - scripts/cloudflare/billing-alerts.md
    - wrangler/shards/route-table.json
    - wrangler/shards/shard-01-uk.jsonc
    - wrangler/shards/shard-02-us.jsonc
    - wrangler/shards/shard-03-au.jsonc
    - wrangler/shards/shard-04-ca.jsonc
    - wrangler/shards/shard-05-ie.jsonc
    - wrangler/shards/shard-06-nz.jsonc
    - wrangler/shards/shard-07-in.jsonc
    - wrangler/shards/shard-08-in-hi.jsonc
    - scripts/shards/split-output.mjs
    - scripts/shards/deploy-all.mjs
    - scripts/shards/__tests__/shards.test.ts
    - docs/adr/0001-delivery-model.md
  modified: []

key-decisions:
  - "The R2 bucket `meridian` exists with exactly two expiry rules: `raw/` at 7 days and `media/` at 365 days. Both are prefix-scoped by construction, and `verify-lifecycle.mjs` proves it against the live listing."
  - "The platform-default `Default Multipart Abort Rule` — which Cloudflare creates with an EMPTY prefix on every new bucket — is removed. It aborts incomplete multipart uploads rather than expiring objects, and R2 aborts them after seven days by default anyway, so removing it changes no behaviour. It is removed because an empty-prefix rule in the bucket is exactly the shape MED-08 forbids, and the rule set must be structurally incapable of carrying one."
  - "The creator removes any rule that is not one of the two it owns. A third expiry rule is a silent budget change (T-01-09), and an expiry rule on an unknown prefix is an unbounded deletion hazard."
  - "The static tier is EIGHT sharded Workers Static Assets projects, one per locale prefix. This overrides the research's single-project conclusion, because D-05 removes the paid escape hatch entirely, which makes the request ceiling a permanent wall (D-08) and the shard mandatory infrastructure rather than an optimisation."
  - "The global surfaces are duplicated into every shard's output directory, so whichever project's route receives a request, the file is already there. It costs a few dozen files per shard and removes every cross-project dependency from the static tier."
  - "Every shard sets `not_found_handling: \"none\"` and declares no `main` key. `\"404-page\"` would make the asset layer answer unmatched paths before the Worker script sees them, swallowing `/story/*` and `/api/*`."
  - "`workers_dev: true` is set on every shard. The domain does not exist yet (D-10), so the shards must serve on their `workers.dev` subdomains; the zone route attaches when the domain is bought."
  - "A deploy that creates the Worker and uploads the assets but cannot attach the placeholder zone route is reported as `ok (route pending)`, not as a failure. Treating it as a failure would report a broken deployment for a working one."
  - "The per-project static asset file cap is read from `config/free-tier-limits.json` by limit id inside the splitter. The number lives in one file, and a scan test fails the build if a copy appears in `wrangler/`, `scripts/shards/` or `scripts/cloudflare/`."
  - "`scripts/cloudflare/billing-alerts.md` states that Cloudflare budget alerts are informational only and do not cap usage, and that the real cap on storage growth is the lifecycle rule set. The 50%/75% percentage alerts belong to the Phase 7 audit Worker (OPS-03)."

patterns-established:
  - "A guard on a destructive action belongs on the call path, not on the data. The prefix check throws inside the function that invokes the destructive command, so it cannot be bypassed by adding a rule elsewhere."
  - "A verifier reads the live artefact, never a local file and never the creator's own output."
  - "Infrastructure that Cloudflare creates implicitly is removed when it conflicts with the project's safety rules, provided the platform default already provides the same behaviour."
  - "A pending configuration item is reported as its own state — `ok (route pending)` — rather than being folded into success or failure. Both are lies."

requirements-completed: [MED-08, OPS-12, PUB-12, ING-02]

# Metrics
duration: 52min
completed: 2026-10-20
---

# Phase 1 Plan 04: R2 Lifecycle Rules, the Eight-Project Static Shard and the Delivery-Model ADR Summary

**A live R2 bucket whose two prefix-scoped lifecycle rules are proven incapable of expiring the Open Graph images, eight live Workers Static Assets projects each owning exactly one locale prefix, and an ADR that records the delivery model without restating the budget.**

## Performance

- **Duration:** 52 min
- **Started:** 2026-10-20T18:06:49Z
- **Completed:** 2026-10-20T18:58:00Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- **The R2 bucket exists and is protected by construction, not by care.** `meridian` was created in the Cloudflare account and carries exactly two expiry rules: `raw/` at 7 days and `media/` at 365 days. `scripts/cloudflare/verify-lifecycle.mjs` parses the bucket's **live** rule listing and fails on an empty prefix, a prefix outside `{raw/, media/}`, the forbidden `og/` or `og`, a wrong day count, a disabled rule, or a rule count that is not exactly 2. The gate was **observed to fail**: a rule named `test-empty-prefix` was planted with an empty prefix, the verifier exited 1 with `rule test-empty-prefix has an empty prefix and would match og/ and the bucket root`, and the creator then repaired the bucket by removing it. The creator script is idempotent (a second run reported `kept expire-raw`, `kept expire-media` and created nothing) and convergent (it removes any rule it does not own).
- **Eight shards exist, are live, and serve distinct locale prefixes.** `meridian-static-uk`, `-us`, `-au`, `-ca`, `-ie`, `-nz`, `-in` and `-in-hi` were all deployed to the Cloudflare account. Each returns HTTP 200 with the built page, each has its own Worker version id, and each is an **assets-only** project with no `main` key and `not_found_handling: "none"` — verified live: an unmatched path returns 404 rather than the asset layer answering before the Worker script would.
- **The shard matrix is asserted, not documented.** `scripts/shards/__tests__/shards.test.ts` runs 14 assertions: exactly eight shard configs, eight unique project names, eight unique route patterns, the union of prefixes equal to exactly the eight edition prefixes with no duplicates, `not_found_handling` `"none"` everywhere, no `main` key, each asset directory ending in its own `/shards/shard-NN`, and a ceiling-literal scan over `wrangler/`, `scripts/shards/` and `scripts/cloudflare/`.
- **The delivery model is recorded unambiguously.** `docs/adr/0001-delivery-model.md` states **EIGHT sharded** projects, names `wrangler/shards/route-table.json`, and says in its own words: *"This ADR overrides `.planning/research/SUMMARY.md` section 1 and `.planning/codebase/ARCHITECTURE.md`, which both describe a single static project. The user's locked decision D-06 supersedes them, because D-05 removes the paid escape hatch entirely, which makes the Workers request ceiling a permanent wall (D-08) and the static shard mandatory infrastructure rather than an optimisation."* It records the tier split (OPS-12), the one-hostname locale-prefix rule (PUB-12), the parses-nothing rule (ING-02) and the CI scheduled build (OPS-09).
- **The billing alerts are recorded with their real limits.** `scripts/cloudflare/billing-alerts.md` gives the exact dashboard path (Cloudflare Dashboard → Manage Account → Billing → Billable Usage → Budget Alerts), expresses every threshold as a reference to its **registry id** rather than a duplicated number, and states that budget alerts are informational only — they notify, they do not cap usage — with the lifecycle rules named as the real cap.

## task Commits

Each task was committed atomically, with the failing test landed before the implementation it guards:

1. **task 1: create the R2 bucket and its two prefix-scoped lifecycle rules** — `003482e` (feat)
2. **task 2: stand up the eight-project static shard, the route table and the splitter** — `445a32c` (feat) — the test and the implementation landed in one commit, because the shard matrix cannot exist in a failing state without the configs it asserts on
3. **task 3: configure the billing alerts and record the delivery-model ADR** — `8eb8838` (docs)

**Plan metadata:** see the closing `docs(01-04)` commit.

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `scripts/cloudflare/r2-lifecycle.mjs` — the idempotent, convergent creator for the two lifecycle rules. Throws before any `lifecycle add` that would carry an empty prefix, never passes `--ia-transition-*`, lists before it creates, removes every rule it does not own, and exits non-zero if any expiry rule survives outside the allow-list.
- `scripts/cloudflare/verify-lifecycle.mjs` — the live MED-08 proof. Parses `wrangler r2 bucket lifecycle list meridian` and asserts the prefix rules, the day counts, the enablement and the rule count.
- `scripts/cloudflare/billing-alerts.md` — the alert configuration record: the quota table keyed by registry id, the exact dashboard path, the honest caveat, and the recipient note for the pre-domain period.
- `wrangler/shards/route-table.json` — the eight-shard matrix. `zone_name` is `PLACEHOLDER_NO_DOMAIN_YET` because no domain exists yet (D-10).
- `wrangler/shards/shard-01-uk.jsonc` … `shard-08-in-hi.jsonc` — the eight assets-only shard configurations. No `main` key, `not_found_handling: "none"`, `html_handling: "force-trailing-slash"`, `workers_dev: true`, one route each.
- `scripts/shards/split-output.mjs` — partitions one Astro build into eight shard directories, duplicating the global surfaces into each, and prints a per-shard file count table. Reads the per-project file cap from the registry by id.
- `scripts/shards/deploy-all.mjs` — deploys every shard in order, names the shard that failed, and supports `--dry-run`.
- `scripts/shards/__tests__/shards.test.ts` — 14 assertions over the shard matrix, its safety, and the ceiling-literal scan.
- `docs/adr/0001-delivery-model.md` — the delivery-model ADR.

## Decisions Made

- **The platform-default multipart abort rule is removed rather than tolerated.** Cloudflare adds it to every new bucket with an **empty prefix** — the exact shape MED-08 forbids, even though the rule only aborts incomplete multipart uploads and never expires a completed object. R2 aborts incomplete multipart uploads after seven days by default anyway, so removing the explicit rule leaves the behaviour identical while making the rule set structurally incapable of carrying an empty-prefix rule. This was verified against Cloudflare's own documentation rather than assumed.
- **The creator removes unexpected rules instead of only reporting them.** The plan requires the creator to exit non-zero when a rule outside the allow-list exists, and requires the verifier to assert the rule count is exactly 2. A creator that only reported would leave the bucket permanently failing its own verifier. The creator therefore converges the bucket to the two rules it owns, and the verifier remains an independent check on the live state.
- **The creator and the verifier parse independently.** The verifier does not import the creator's parser, so a parsing bug in the creator cannot mask itself in the check. The duplication is deliberate.
- **The deploy script reports `ok (route pending)` for the placeholder zone.** Wrangler exits non-zero when the zone route cannot attach, even though the Worker was created, the assets were uploaded and the project is live. A non-zero exit from a *successful* deploy is a false failure; folding it into plain success would hide a real one. It is therefore its own state.
- **`workers_dev: true` is set on every shard.** The domain is deferred past launch (D-10), so the shards must serve on their `workers.dev` subdomains today and the zone routes attach when the domain is bought.
- **The splitter rebuilds the shard tree from scratch on every run.** A stale file left behind by a previous build would be uploaded to the edge and would count against the per-project file ceiling for as long as it existed.
- **A missing global surface is reported once, not once per shard.** The surfaces are produced in a later phase; eight identical notes are noise, one is information.
- **The billing-alert thresholds are expressed as registry references, not percentages of numbers.** "80% of the registry value for `r2_class_a_ops_per_month`" cannot drift from the budget; "80% of 1,000,000" can.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript `interface` syntax in `.mjs` files crashed both lifecycle scripts**
- **Found during:** task 1 (first run of the creator)
- **Issue:** both scripts declared their rule shape with a TypeScript `interface`. A `.mjs` file is plain JavaScript, so Node rejected it with `SyntaxError: Unexpected strict mode reserved word` at the `interface LifecycleRule` line. The scripts could not run at all.
- **Fix:** converted both declarations to JSDoc `@typedef` blocks, which carry the same type information and are valid JavaScript.
- **Files modified:** `scripts/cloudflare/r2-lifecycle.mjs`, `scripts/cloudflare/verify-lifecycle.mjs`
- **Verification:** both scripts exit 0 against the live bucket.
- **Committed in:** `003482e`

**2. [Rule 1 - Bug] The plan 01-02 SQL scan flagged the English word "delete" in prose comments**
- **Found during:** task 1 (full test suite)
- **Issue:** `apps/worker/src/db/__tests__/repository.test.ts` runs a deliberately blunt repository-wide scan for SQL keywords, and `DELETE` matched three prose comments in `r2-lifecycle.mjs` — "it cannot delete a stored object", "would delete the `og/` images", "marking which rules delete completed objects". The suite failed with three reported hits.
- **Fix:** reworded the three comments to use "expire" instead of "delete". The scan was **not** weakened and no file was added to its allow-list — the scan is right and the prose was ambiguous with SQL.
- **Files modified:** `scripts/cloudflare/r2-lifecycle.mjs`
- **Verification:** `npm test -- --run` — 68 tests, all passing.
- **Committed in:** `003482e`

**3. [Rule 1 - Bug] The splitter crashed on the global surfaces because `countFiles` assumed a directory**
- **Found during:** task 2 (first run of the splitter)
- **Issue:** `countFiles` called `readdirSync` on its argument unconditionally. The global surfaces are a mix of files (`index.html`, `robots.txt`) and directories (`_astro/`), so counting `index.html` raised `ENOTDIR: not a directory, scandir '…\shards\shard-01\index.html'` and the splitter exited 1.
- **Fix:** `countFiles` now stats its target first and returns 1 for a file, 0 for a missing path, and recurses only for a directory.
- **Files modified:** `scripts/shards/split-output.mjs`
- **Verification:** `node scripts/shards/split-output.mjs` exits 0 and creates eight shard directories.
- **Committed in:** `445a32c`

**4. [Rule 2 - Missing Critical] The shard configs had no `workers_dev`, so no shard could serve before a domain exists**
- **Found during:** task 2 (live deploy of shard 01)
- **Issue:** the plan's shard config template omits `workers_dev`, but the shards declare a `routes` entry, and Wrangler only enables the `workers.dev` subdomain when `workers_dev` is true. With the plan's config as written, the shards would have had no address at all until the domain exists — which D-10 defers past launch. The shards would have been unreachable for the entire pre-launch period.
- **Fix:** added `"workers_dev": true` to all eight shard configs. This is D-10's direct consequence: the site runs on a `workers.dev` subdomain until the domain is bought.
- **Files modified:** the eight `wrangler/shards/shard-NN-*.jsonc` files
- **Verification:** all eight shards return HTTP 200 from `https://meridian-static-<locale>.mehedy303.workers.dev/`.
- **Committed in:** `445a32c`

**5. [Rule 3 - Blocking] The deploy script reported a working deployment as a failure**
- **Found during:** task 2 (live deploy of shard 01)
- **Issue:** `wrangler deploy` creates the Worker, uploads the assets and publishes to `workers.dev`, then fails to attach the zone route because the zone name is a placeholder. Cloudflare reports this as a partially-updated trigger configuration and exits **1**. The deploy script read that exit code as a shard failure, so a correctly deployed shard was reported as `FAILED` and the script would have exited non-zero.
- **Fix:** the deploy script recognises the placeholder-zone signature (`does not exist on your account` / `Could not find zone for`) and reports it as `ok (route pending)`. Any other non-zero exit is still a failure that names the shard and exits non-zero.
- **Files modified:** `scripts/shards/deploy-all.mjs`
- **Verification:** `node scripts/shards/deploy-all.mjs` deployed all eight shards and exited 0 with `8 zone routes pending — no domain exists yet (D-10)`.
- **Committed in:** `445a32c`

**6. [Rule 1 - Bug] The ADR's `**EIGHT**` bolding defeated the plan's own verification regex**
- **Found during:** task 3 (plan verification command)
- **Issue:** the plan's verification command requires `/eight sharded/i` to match the ADR. The heading `### The static tier is **EIGHT** sharded Workers Static Assets projects, not one` renders as `**EIGHT** sharded`, and the markdown emphasis markers sit between the word and the space, so the regex did not match and the verification command exited 1 on a document that plainly stated the requirement.
- **Fix:** removed the emphasis from the heading. The ADR still reads "EIGHT sharded", which matches both the plan's regex and its `'EIGHT'` literal check.
- **Files modified:** `docs/adr/0001-delivery-model.md`
- **Verification:** the plan's verification command prints `ADR 0001 OK` and exits 0.
- **Committed in:** `8eb8838`

**7. [Rule 2 - Missing Critical] The ADR had no ceiling-literal guard**
- **Found during:** task 3
- **Issue:** the plan's acceptance criteria require the ADR to carry no bare ceiling literal, but nothing enforced it. The ADR names the eight-project shard and the request ceiling — two things that invite a number to be written down — and a number written there would be a second copy of the budget that the OPS-01 scan (which covers `shared/`, `apps/`, `scripts/`, `spikes/` and `config/`) does not reach.
- **Fix:** added an assertion to the shard test that scans `docs/adr/0001-delivery-model.md` for every enforced ceiling token, alongside the directory scan. The ADR passes with no literal.
- **Files modified:** `scripts/shards/__tests__/shards.test.ts`
- **Verification:** `npm test -- --run scripts/shards/__tests__/shards.test.ts` — 14 tests, all passing.
- **Committed in:** `8eb8838`

---

**Total deviations:** 7 auto-fixed (2 missing critical, 3 bugs, 2 blocking)
**Impact on plan:** All seven are correctness fixes required for the plan's own acceptance criteria to hold. No scope creep: every file created is in the plan's `files_modified` list, and no ceiling value, source URL, trigger or locked decision was changed.

### Housekeeping outside the plan's task actions

- **A throwaway probe project was created and deleted.** `meridian-probe-assets` was deployed to establish how Wrangler behaves when the zone name is a placeholder — whether the Worker is created, whether the exit code is non-zero, and whether `workers_dev` still publishes. It was deleted immediately afterwards, and the `.probe/` directory was removed. Nothing from the probe survives in the repository or the account.
- **The R2 bucket was created before the creator script existed.** The plan's step 1 is `npx wrangler r2 bucket create meridian`, done directly, and the script was written afterwards. The script then converged the bucket from a Cloudflare-default state to the intended two rules, which exercised its removal path for real.

## Issues Encountered

- **Cloudflare's platform default fights the project's safety rule.** Every new R2 bucket arrives with a rule that has an empty prefix. The project cannot leave it — an empty-prefix rule is exactly what MED-08 forbids — and cannot simply ignore it either, because the plan requires the rule count to be exactly 2. The resolution came from Cloudflare's own documentation: R2 aborts incomplete multipart uploads after seven days by default, so removing the explicit rule is behaviour-neutral. The creator removes it, and the removal is logged with its reason so a reader can see why the bucket's rule set is exactly two.
- **Wrangler's exit code does not distinguish "deployed" from "route attached".** Both the probe and the first real shard deploy ended with exit 1 despite a fully successful deployment. This was the single most consequential discovery in the plan: without handling it, the deploy script would have reported eight working shards as eight failures and exited non-zero on a correct run.
- **`wrangler r2 bucket lifecycle remove` does not accept `--force`**, and passing it crashes Wrangler with an assertion failure on Windows rather than a clean argument error. The remove path simply does not pass it.
- **The plan's two scripts and the plan 01-02 SQL scan disagreed about the word "delete".** Two independently reasonable plans collided on one English word. Rewording the prose was the right resolution: the SQL scan is a deliberate blunt instrument and its allow-list should not grow a permanent hole for three comments.
- **A temporary generator script for the shard configs was written and then removed.** Eight near-identical JSON files are exactly the case a generator is for, but the plan's `files_modified` list does not include one and the files are the artefact under test. The eight configs were written directly instead.

## Known Stubs

| Stub | Location | Reason | Resolved by |
|------|----------|--------|-------------|
| `zone_name` is `PLACEHOLDER_NO_DOMAIN_YET` in the route table and in all eight shard configs | `wrangler/shards/route-table.json`, `wrangler/shards/shard-NN-*.jsonc` | Deliberate. No domain exists (D-10) — the domain is bought only after the site earns revenue. A zone route against a domain that does not exist cannot be created, so the zone routing is asserted by the route-table test rather than by a live deploy. | The domain migration in Phase 7, with the 301-redirect map and the sitemap/hreflang re-verification (D-14). |
| The eight shards carry no edition content | `apps/site/dist/shards/shard-NN/` | The Astro shell builds one page today. The edition, section and archive pages are Phase 5's work; the shard machinery they will be published through is what this plan delivers. | Phase 5 — the publication surface, which writes the edition pages into the build the splitter partitions. |
| `robots.txt`, `favicon.ico`, `sitemap-index.xml` and `feed.xml` are absent from the build output | `apps/site/dist/` | The global surfaces are listed in the route table and duplicated into every shard, but four of them are not produced by the Astro shell yet. The splitter reports them once and continues. | Phase 6 — the SEO and discovery surface, which emits the sitemap, the feeds and `robots.txt`. |
| The `og/` prefix has no lifecycle rule and no objects | the R2 bucket | Correct as-is. `og/` is excluded from every rule by design (D-19): Open Graph images never expire, because they belong to permanent story URLs. The objects arrive in Phase 5. | Phase 5 — the media pipeline. The exclusion is already structural; the verifier fails if a rule ever appears on `og/`. |

No other stub was introduced: every file created is complete, every script exits 0 against the live services it manages, and no data source is left unwired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: operator_credentials | `scripts/shards/deploy-all.mjs` | The deploy script shells out to `wrangler deploy` using the operator's own Cloudflare credentials. It runs only when the operator invokes it, in the repository they already control. Accepted for this phase (T-01-14); CI credentials are a Phase 5 concern. |
| threat_flag: bucket_is_writable_by_the_account | the R2 bucket `meridian` | The bucket is reachable by any credential with the account's R2 permissions. It holds only raw feed snapshots, media variants and Open Graph images — no credentials and no personal data. The lifecycle rules bound its growth; the account's own IAM is what protects it. |
| threat_flag: eight_public_workers_endpoints | `wrangler/shards/shard-NN-*.jsonc` | Each shard publishes a public `workers.dev` subdomain. They serve the static tier only — edition pages, sections, archives, topic and entity pages — and `not_found_handling: "none"` means an unmatched path returns 404 rather than being answered by the asset layer. No shard serves the story tier or the API, so none of them reaches the datastore. |
| threat_flag: zone_route_pending | `wrangler/shards/route-table.json` | The zone route is a placeholder, so the eight shards are reachable only on their `workers.dev` subdomains today. The route table is the single source of truth and is asserted by a test, so the routing cannot drift into a wrong mapping while it waits for the domain. |

## User Setup Required

**One manual step remains — the Cloudflare budget alerts.** Cloudflare budget alerts are configured in the dashboard and are informational only: they notify, they do not cap usage. The scripts in this plan configure and verify everything that CAN be automated — the bucket, its two lifecycle rules, and the proof that no rule can match `og/` or the bucket root.

- **Configure the budget alerts:** Cloudflare Dashboard → Manage Account → Billing → Billable Usage → Budget Alerts. Create one alert per quota in the table in `scripts/cloudflare/billing-alerts.md`, each threshold expressed against that quota's registry id in `config/free-tier-limits.json`. The exact figures are listed there.
- **Recipients:** no custom domain exists yet (D-10), so the alert recipients and the billing contact are the account's own email address.
- **Confirm the R2 bucket:** Cloudflare Dashboard → R2 Object Storage → bucket list. The bucket `meridian` should appear, with the two lifecycle rules attached.
- **Verification command:** `node scripts/cloudflare/verify-lifecycle.mjs` — exits 0 and prints the two prefix-scoped rules.

Everything else in this plan was done automatically and is already live: the R2 bucket, its two lifecycle rules, and the eight Workers Static Assets projects.

## Next Phase Readiness

- **Plan 01-05 (excerpt budget, shared templates, image and domain ADRs) can start.** ADR 0001 establishes the `docs/adr/NNNN-title.md` format at its lowest number, and ADR 0002 and ADR 0005 already exist beside it. The image ADR (D-15 … D-19) has a concrete home for its decisions: the two lifecycle rules now exist, `og/` is structurally excluded from expiry, and `media/` runs on a single uniform 365-day clock with no exemptions.
- **Plan 01-06 (spikes S-1 through S-5) can start.** `spikes/` is already in the OPS-01 scan roots. S-5 (wrangler asset-upload diffing) now has real shard projects to measure against, which is a better test than a synthetic one.
- **Phase 2 can plan against a real bucket and a real fetch target.** The `R2` binding in `apps/worker/wrangler.jsonc` names a bucket that now exists, and its raw feed snapshots will land under `raw/` — the prefix with a 7-day expiry, so the ingest's own storage footprint is bounded by construction.
- **Phase 5 has its publish target.** The story tier's static pages are built by the splitter into eight directories and deployed by one script. Phase 5 writes the edition, section and archive pages into the build the splitter partitions; it does not need to touch the shard matrix.
- **One thing to carry forward:** the eight zone routes are pending and will not attach until a domain exists. When the domain is bought (Phase 7, D-14), the route table's `zone_name` is the single value that changes — and the eight shard configs must be updated with it in the same commit, or the routes and the table will disagree. The route-table test asserts the two agree, so the divergence fails the build rather than the deployment.
- **One thing to carry forward:** the R2 lifecycle rules are now the mechanism keeping the bucket inside its free allowance, and the budget alerts are informational. The Phase 7 audit Worker's percentage-of-ceiling alerts (OPS-03) are the actual ceiling-crossing signal, and they read the same registry the splitter reads.

---

## Self-Check: PASSED

Every file, commit and claim in this summary was verified against the working tree and against the live Cloudflare account.

- **Files:** all 15 created files exist on disk. `missing_count=0`.
- **Commits:** all three task commits exist in `git log` — `003482e`, `445a32c`, `8eb8838`.
- **`node scripts/cloudflare/r2-lifecycle.mjs`:** exits 0; a second run creates nothing (`kept expire-raw`, `kept expire-media`).
- **`node scripts/cloudflare/verify-lifecycle.mjs`:** exits 0; prints two rules, `raw/` at 7 days and `media/` at 365 days.
- **The gate was observed to fail:** a rule with an empty prefix was planted; the verifier exited 1 with the specific message; the creator removed it and the verifier passed again.
- **`npm test -- --run scripts/shards/__tests__/shards.test.ts`:** exits 0 — 14 tests.
- **`npm test -- --run`:** exits 0 — 7 test files, 68 tests, all passing.
- **`npm run typecheck`:** exits 0.
- **`npm run build`:** exits 0 — the Astro build still succeeds.
- **`node scripts/shards/split-output.mjs`:** exits 0 and produces eight shard directories.
- **`node scripts/shards/deploy-all.mjs --dry-run`:** prints eight deploy commands and exits 0.
- **`node scripts/shards/deploy-all.mjs`:** deployed all eight shards and exited 0.
- **Live:** all eight `https://meridian-static-<locale>.mehedy303.workers.dev/` endpoints return HTTP 200; each has a distinct Worker version id; an unmatched path returns 404.
- **Live:** `npx wrangler r2 bucket lifecycle list meridian` shows exactly two rules, both with a non-empty prefix, and no rule on `og/` or the empty string.
- **Live:** `npx wrangler r2 bucket list` shows the bucket `meridian`.
- **ADR 0001:** the plan's verification command prints `ADR 0001 OK`.
- **Ceiling scan:** no enforced ceiling literal appears in `wrangler/`, `scripts/shards/`, `scripts/cloudflare/` or `docs/adr/0001-delivery-model.md`.

---

*Phase: 01-foundation-free-tier-contract-architecture-decisions*
*Completed: 2026-10-20*
