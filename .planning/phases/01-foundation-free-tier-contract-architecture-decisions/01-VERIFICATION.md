---
phase: 01-foundation-free-tier-contract-architecture-decisions
verified: 2026-10-21T07:49:08Z
status: gaps_found
score: 4/5 roadmap success criteria verified
re_verification: false
gaps:
  - truth: "The shared data contract is decided, recorded and testable before any feature code is written (phase goal clause 2)"
    status: failed
    severity: BLOCKER
    reason: "The Phase 1 D1 schema makes the project's own documented 30-day raw-mention prune structurally impossible. Four child tables hold NO ACTION foreign keys to stories(id) — story_sources (L193), story_topics (L234), story_entities (L242) and images (L272) — and story_sources is retained permanently by design, so every published story holds a row that permanently blocks the delete of its stories parent. Reproduced independently against local D1 in an isolated scratch database: DELETE FROM stories WHERE id = 900 fails with 'FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)' and the row survives. This contradicts ADR 0002 ('The raw mention rows are pruned; story_sources retains the outlet list, the headline and the URL permanently'), PROJECT.md's locked constraint ('the stories raw-mention rows are pruned after 30 days once their merge window has closed'), and the ~70 MB/year seven-year-headroom growth projection ADR 0002 publishes."
    artifacts:
      - path: "shared/db/0001_init.sql"
        issue: "Lines 193, 234, 242 and 272 declare REFERENCES stories(id) with no ON DELETE clause, so the default NO ACTION applies."
      - path: "shared/db/__tests__/schema.test.ts"
        issue: "No test asserts that a raw mention can actually be pruned. The only delete-related assertion (L183 'never deletes: the 90-day window is a flag, not a deletion') checks that the DDL itself contains no DELETE FROM — which is about the DDL not deleting, not about the prune being executable. The contradiction is invisible to CI."
      - path: "scripts/db/verify-local.mjs"
        issue: "Owns the claim 'the schema applies to an empty database and the seed is complete' (24/24 PASS) but contains no prune-executability assertion."
      - path: "docs/adr/0002-d1-no-shard.md"
        issue: "Records the prune as growth control #2 and the ~70 MB/year storage projection that depends on it; both are invalid while the delete is impossible."
    missing:
      - "Re-key story_sources on (cluster_id, source_id) so it no longer depends on a pruned table, and make story_topics, story_entities and images cascade (ON DELETE CASCADE)."
      - "Add a regression test that a raw mention can be pruned while its outlet list survives, and a live prune assertion in scripts/db/verify-local.mjs."
      - "Correct ADR 0002's growth projection and PROJECT.md's prune constraint if the retention model changes."
      - "Land this before Phase 2 writes stories rows — altering an existing SQLite table with live rows requires a full table rebuild, which is materially harder than changing the schema now."
  - truth: "A test fails if any code path reads a ceiling from anywhere else (roadmap Success Criterion 1, second half)"
    status: partial
    severity: WARNING
    reason: "The registry itself is complete and correct, and the scan test is real, self-proving and green. But it is a spelling check over a subset of the tree, and ADR 0005 escalates it to a guarantee it does not provide. SCAN_ROOTS = ['shared','apps','scripts','spikes','config'] omits the repository root, docs/ and wrangler/; SCANNED_EXTENSIONS omits .jsonc, .md and .sql. Proven empirically: a 100000 literal planted in apps/worker/__ceiling_probe.jsonc, in docs/__ceiling_probe.md and in a repository-root __ceiling_probe.json all passed both ceiling-scan suites (28/28 green). A second blind spot: the tokens are spellings, not values, so 5e2 and 1e5 (the 500 MB and 100,000 ceilings written in exponent form) also pass. ADR 0005 lines 22-23 state the test 'proves that no code path reads one from anywhere else' — provably false, and it names the Worker's own wrangler.jsonc, which no suite scans."
    artifacts:
      - path: "shared/config/__tests__/free-tier-limits.test.ts"
        issue: "SCAN_ROOTS and SCANNED_EXTENSIONS (L120, L123) leave .jsonc, the repository root, docs/ and Markdown unscanned; ENFORCED_LIMIT_TOKENS is a string-token list with no numeric-literal comparison."
      - path: "docs/adr/0005-free-tier-ceiling-and-no-spend.md"
        issue: "L22-23 overclaim the scan's scope. The claim must be narrowed to what the gate does."
      - path: "apps/worker/wrangler.jsonc"
        issue: "The Worker's own config is covered by neither scan suite (the shards test scans wrangler/, scripts/shards/ and scripts/cloudflare/ only)."
    missing:
      - "Extend the scan to .jsonc and .md and add the repository root, or narrow ADR 0005's wording to the scope the gate actually covers."
      - "Either compare numeric literal VALUES against the enforced ceilings, or state plainly that alternative numeric spellings are not detected."
  - truth: "CON-09 — the canonical emitted by the shared metadata function is always self-referential and never points at a publisher's domain"
    status: partial
    severity: WARNING
    reason: "The canonical itself is correct: pageMeta constructs it from a module-level SITE_ORIGIN constant and throws on a full URL, so no parameter can point it at a publisher. But the contract silently discards PageMetaInput.title, a REQUIRED field, and returns a fixed edition-level title for every call. Every story page rendered through this contract would carry an identical <title> of 'The Meridian — United Kingdom'. The Phase 1 plan specified this shape, so it is an inherited design defect rather than an execution failure, but the contract type is a Phase 1 artefact and Phase 5 will render story pages through it."
    artifacts:
      - path: "shared/templates/head.ts"
        issue: "L72: const title = `${SITE_NAME} — ${edition.countryName}`; — input.title is never read. shared/types.ts declares PageMetaInput.title as required."
    missing:
      - "Consume input.title in the page title (headline first, site name once), or remove the field from the contract, before Phase 5 renders story pages."
  - truth: "CON-04 — an excerpt is a verbatim prefix of the publisher's own text or it is omitted; it is never paraphrased, synonymized or translated"
    status: partial
    severity: WARNING
    reason: "applyExcerptBudget enforces verbatim-ness structurally (it only truncates, and it checks the result is a prefix of the candidate before returning). But assertExcerptWithinBudget — the gate Phase 2 is instructed to run over every stored excerpt — checks word count, character count, sentence count, source share and source length, and never checks that the text is a verbatim prefix. The length caps are trivially satisfied by a paraphrase, so the one check that distinguishes quoting from rewriting is absent from the gate. The budget itself cannot be weakened by the code as written; the gate is what is incomplete."
    artifacts:
      - path: "shared/contract/excerpt-budget.ts"
        issue: "assertExcerptWithinBudget(text, sourceVisibleText) has no candidate parameter and no verbatim check. STATE.md instructs Phase 2 to call exactly this function."
    missing:
      - "Add a candidate parameter to assertExcerptWithinBudget and a CON-04 violation, plus a test that a paraphrased excerpt is rejected."
  - truth: "D-06 — every locale path prefix resolves to exactly one shard, and the global surfaces are present in every shard so no request depends on another project"
    status: partial
    severity: WARNING
    reason: "The eight-shard matrix itself is correct and live: eight configs, unique names, unique routes, the union of prefixes exactly the eight edition prefixes, not_found_handling 'none' everywhere, no 'main' key, and eight deployed Workers Static Assets projects serving HTTP 200. But the route table's global_surfaces list omits the global surfaces ADR 0001 names in its own words: /topic/*, /entity/*, the sitemap-*.xml chunks, news-sitemap-*.xml, /rss/* and the per-edition feeds. The splitter reports a missing global surface once, as an informational note, and exits 0. When Phase 5 produces topic and entity pages and Phase 6 produces the news sitemaps, those URLs will 404 from every shard and CI will report success."
    artifacts:
      - path: "wrangler/shards/route-table.json"
        issue: "global_surfaces lists only index.html, robots.txt, favicon.ico, _astro/, sitemap-index.xml and feed.xml."
      - path: "docs/adr/0001-delivery-model.md"
        issue: "L69-75 names a broader set than the route table implements; no test asserts the two agree."
      - path: "scripts/shards/split-output.mjs"
        issue: "L239-241 prints a note for missing globals and continues; it does not fail."
    missing:
      - "Make the route table's global_surfaces match ADR 0001 and assert the match in the shards test, or copy every non-locale top-level entry of the build output into every shard."
  - truth: "D-15 — every media object expires on the same 12-month clock, with no exemptions and no second rule to reason about"
    status: partial
    severity: WARNING
    reason: "ADR 0003 claims 'the value lives in one place, shared/contract/image-permanence.ts, as MEDIA_LIFETIME_DAYS. One rule, one value, one place to check.' The value lives in three: shared/contract/image-permanence.ts:43, scripts/cloudflare/r2-lifecycle.mjs:71 and scripts/cloudflare/verify-lifecycle.mjs:52. ALLOWED_PREFIXES and the raw/ 7-day clock are duplicated between the two scripts. Nothing detects a divergence: 365 is not an enforced ceiling, so the OPS-01 scan never looks for it. The live bucket is correct today — media/ at 365 days, raw/ at 7 days — but the guarantee is documentation, not structure."
    artifacts:
      - path: "shared/contract/image-permanence.ts"
        issue: "MEDIA_LIFETIME_DAYS = 365 (L43) is one of three copies."
      - path: "scripts/cloudflare/r2-lifecycle.mjs"
        issue: "L71: { id: 'expire-media', prefix: 'media/', expireDays: 365 }."
      - path: "scripts/cloudflare/verify-lifecycle.mjs"
        issue: "L52: { id: 'expire-media', prefix: 'media/', expireDays: 365 }."
      - path: "docs/adr/0003-image-permanence.md"
        issue: "L72-75 asserts the 'one place' property the code does not have."
    missing:
      - "Have both lifecycle scripts read MEDIA_LIFETIME_DAYS (and the raw/ clock) from shared/contract/image-permanence.ts, or move the constants into a single config file."
  - truth: "OPS-14 — the database identifier is a configuration value, so pointing the project at a different database is a config change and not a code change"
    status: partial
    severity: WARNING
    reason: "The requirement is met at the configuration level: apps/worker/wrangler.jsonc carries the real id (af7ca858-b8ce-432a-8e80-a05c39e3c1be), and npm run db:verify:swap exits 0 with the masked diff proving only database_id changed, the config was restored byte-for-byte, no other file was modified, the schema applied under the new id, and the seed produced 8 editions and 30 sources. But resolveDatabaseId() returns '' in a real deployment: MERIDIAN_DB_ID is set only in .dev.vars, wrangler.jsonc has no vars block, and the module's own docstring concedes the Workers runtime surfaces the D1 binding 'with alwaysPrimarySession and fetcher on it, and no identifier'. The value the module exists to report is blank in production, and the swap proof is weaker than claimed — the endpoint would report the same empty string either way."
    artifacts:
      - path: "apps/worker/src/db/config.ts"
        issue: "L66-74: both sources are empty in a deployment, so the function returns ''."
      - path: "apps/worker/wrangler.jsonc"
        issue: "No vars block, so the MERIDIAN_DB_ID override never reaches a deployed Worker."
    missing:
      - "Add the non-secret id to the Worker's vars block, or read the binding's id from the config file rather than from a runtime property that does not exist."
  - truth: "The schema carries the full index set, including the four 16-bit LSH band indexes and the partial editorial-rank index"
    status: partial
    severity: WARNING
    reason: "The index set is complete and correct — 19 tables, 32 named indexes, all four single-column LSH band indexes, the partial idx_clusters_editorial with WHERE editorial_rank IS NOT NULL, and idx_edition_clusters_edition (edition_id, published_at), with the repository's prominent-cluster query verified as an index scan with no temporary B-tree. But stories.simhash is a single INTEGER column whose own comment names a comparison method ('compare with unsigned semantics on the two 32-bit halves') for which no columns exist, and the TypeScript shape is StoryInsert.simhash: number — a double with a 53-bit mantissa, which cannot carry a 64-bit fingerprint without loss. The four band indexes are derived from this value, so a corrupted simhash corrupts the bands too. Phase 3's clusterer is built on it."
    artifacts:
      - path: "shared/db/0001_init.sql"
        issue: "L168-169: simhash INTEGER NOT NULL with a two-halves comment and no simhash_hi/simhash_lo columns; INTEGER is signed, so an unsigned value above 2^63-1 cannot be stored at all."
      - path: "apps/worker/src/db/repository.ts"
        issue: "L74: simhash: number; bound directly at L180."
    missing:
      - "Store the fingerprint as two 32-bit halves (simhash_hi, simhash_lo) and make the TypeScript shape match, or narrow the schema comment to what the representation can do."
  - truth: "OPS-14 — the executable proof that repointing the database identifier needs no code change"
    status: partial
    severity: WARNING
    reason: "The proof works and passes, but scripts/db/verify-swap.mjs contains a literal NUL byte (one 0x00, at line 162). Git records it as a binary blob (git ls-files --eol reports 'i/-text w/-text'), so every future diff of the OPS-14 proof artefact renders as 'Binary files differ' with no line-level output. The NUL is also a sentinel that makes its own guard vacuous: the fallback is a string containing one NUL character, and a JSON config never contains one, so the check 'the replacement did not change the database_id value' can never fire. The adjacent check at L158 (rewrittenConfig === originalConfig) is the effective guard, so the practical loss is the binary treatment — but the review workflow cannot show changes to the file that proves the requirement."
    artifacts:
      - path: "scripts/db/verify-swap.mjs"
        issue: "One 0x00 byte at line 162; git treats the file as binary and one assertion is unreachable."
    missing:
      - "Replace the NUL sentinel with a real check on the extracted identifier, re-save as UTF-8 text, and confirm git diff --numstat reports line counts."
  - truth: "D-12 — the site name 'The Meridian' exists in exactly one place in the codebase, as a single config value"
    status: partial
    severity: WARNING
    reason: "The VALUE is single-sourced: shared/config/site.ts is the only module exporting SITE_NAME, and the site-name scan test enforces one occurrence across .ts/.mjs/.astro/.json under shared/, apps/, scripts/, spikes/ and config/. But ADR 0004 claims the literal 'appears in exactly one source file in the whole repository' and that a second copy 'in a component, a config, a comment — is a failure the build reports'. The scan's scope excludes .sql and the repository root, and the literal also appears in shared/db/0001_init.sql:2, package.json:6 and docs/adr/0001-delivery-model.md:14 — precisely the 'a comment' and 'a config' the ADR says the build reports. A copy in package.json's description is a config, and a news:name divergence is the failure ADR 0004 calls the single highest-impact string in the project."
    artifacts:
      - path: "docs/adr/0004-domain-and-name.md"
        issue: "L53-54 states the 'whole repository' claim the scan does not cover."
      - path: "shared/config/__tests__/site.test.ts"
        issue: "SCAN_ROOTS and SCANNED_EXTENSIONS exclude .sql and the repository root."
    missing:
      - "Extend the site-name scan to .sql and the repository root, or narrow ADR 0004's claim to what the scan covers."
deferred:
  - truth: "renderHead() has zero production callers — the shipped layout emits no canonical, no hreflang and no RSS autodiscovery"
    addressed_in: "Phase 4 / Phase 5 / Phase 6"
    evidence: "REQUIREMENTS.md traceability assigns CON-09 to Phase 6 (Complete) and the Cross-References table records it as 'recorded in the Phase 1 ADR and emitted by the Phase 5 story renderer; Phase 6 centralizes it in pageMeta() and asserts it'. ROADMAP Phase 1 Success Criteria 1-5 say nothing about the layout, and plan 01-01's own scope is the Astro shell configuration. The wiring is therefore later-phase work. CARRY THE RISK: Base.astro is the template every Phase 4/5 page will inherit, and the failure mode is a later phase shipping a site with no canonical with no test failing. The fix belongs with the first real layout."
  - truth: "listActiveSources() selects terms_status but never filters on it, so the terms-of-use legal gate has no enforcement at the only data-access point"
    addressed_in: "Phase 2"
    evidence: "REQUIREMENTS.md assigns ING-04 ('A feed is fetched only after its terms of use have been verified') to Phase 2, and the Cross-References table records ING-05 as 'the registry and the per-feed verification date land in Phase 2'. Plan 01-02's own must-have — 'Every seeded source carries a terms-of-use status so Phase 2 can refuse to fetch a feed whose terms are unverified' — is met: the schema carries terms_status/terms_verified_at/terms_url and all 30 seeded rows are 'unverified', which scripts/db/verify-local.mjs asserts. The FILTER is Phase 2's fetcher gate, and Phase 2 is the phase that adds it. CARRY THE RISK: the repository is the only place the gate can be applied, so Phase 2 will be editing a Phase 1 artefact."
  - truth: "clusters.outlet_count and clusters.mention_count have no writer — the repository exposes no method that updates either counter and none that writes story_sources at all"
    addressed_in: "Phase 2 / Phase 3"
    evidence: "The counters are written by the ingest (Phase 2) and cluster (Phase 3) stages, which own the code paths that create stories rows and story_sources rows. Phase 1 owns the schema, and the schema is correct: outlet_count INTEGER NOT NULL DEFAULT 0 and mention_count INTEGER NOT NULL DEFAULT 0 are well-formed columns. The repository's read path (listProminentClusters) is wired and index-driven. CARRY THE RISK: outlet_count is value element #1 of the six every story page must carry, so the writer must exist before Phase 5 renders the coverage line."
  - truth: "/api/db/tables is an unauthenticated, unrate-limited D1-querying endpoint on a public hostname"
    addressed_in: "Phase 7"
    evidence: "The Worker project 'meridian-worker' is not deployed — verified absent from the Cloudflare account — so the endpoint is not live and costs no budget today. OPS-02 (the daily audit Worker reading the usage log) and OPS-03 (the 50%/75% alerts) are Phase 7 requirements, and Phase 7 is where the datastore-reading runtime surface belongs."
human_verification:
  - test: "Open https://meridian-static-uk.mehedy303.workers.dev/ and confirm the broadsheet shell renders with the space between the inline elements in the headline intact, and that an unmatched path (for example /uk/nonexistent/) returns a real 404 rather than the asset layer answering."
    expected: "The page renders as a broadsheet shell; the headline shows 'The Meridian' with a single space (DSN-12 fixture); a missing path returns HTTP 404."
    why_human: "This is a visual and HTTP-behaviour check on a live deployment. The build output was verified byte-wise and three of the eight shards were spot-checked for HTTP 200 programmatically, but the rendered appearance and the not-found behaviour were not assessed."
  - test: "In the Cloudflare dashboard, open R2 Object Storage -> bucket 'meridian' -> Lifecycle and confirm the two rules and their prefixes visually, then confirm no third rule (including any platform default) is present."
    expected: "Exactly two rules: expire-raw on raw/ at 7 days and expire-media on media/ at 365 days."
    why_human: "The live rule listing was verified programmatically and shows exactly two prefix-scoped rules, but the dashboard view is where an operator would see a rule the CLI might not surface."
---

# Phase 1: Foundation, Free-Tier Contract & Architecture Decisions — Verification Report

**Phase Goal:** The delivery model, the shared data contract and the free-tier budget are decided, recorded and testable before any feature code is written, and the five architecture-changing spikes have been run.

**Verified:** 2026-10-21T07:49:08Z
**Status:** `gaps_found` — 1 BLOCKER, 9 WARNINGs, 4 deferred
**Re-verification:** No — initial verification (no prior `01-VERIFICATION.md` existed)

---

## Goal Achievement

### Observable Truths — Roadmap Success Criteria

The ROADMAP's five Success Criteria are the phase contract. They are scored here.

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | `config/free-tier-limits.json` holds every ceiling the project depends on, each with its source and verification date, and a test fails if any code path reads a ceiling from anywhere else | ⚠️ **PARTIAL** | **Registry: VERIFIED.** 18 limits, all 16 named ceilings present, every entry carries an `https://` `source_url` and an ISO `verified_on`. **Enforcement: PARTIAL.** The scan test is real, green and self-proving (Group C plants a literal, proves it is caught, removes it). But it covers `.ts/.tsx/.js/.mjs/.cjs/.json` under `shared/ apps/ scripts/ spikes/ config/` only. Proven empirically: `100000` planted in `apps/worker/__ceiling_probe.jsonc`, in `docs/__ceiling_probe.md` and in a repo-root `__ceiling_probe.json` all passed both scan suites (28/28 green). `5e2` and `1e5` also pass (spelling check, not a value check). ADR 0005 L22-23 claims the test "proves that no code path reads one from anywhere else" — false. |
| 2 | All datastore access goes through one repository module and the database identifier is read from configuration; pointing that identifier at an empty database and running the migration succeeds with no code change | ✅ **VERIFIED** | `apps/worker/src/db/repository.ts` is the only module with SQL (enforced by a repository-wide scan test), no `SELECT *`, every value bound, the one interpolated identifier allow-listed against 19 table names. The id is a config value in `apps/worker/wrangler.jsonc` (`af7ca858-b8ce-432a-8e80-a05c39e3c1be`). `npm run db:verify:swap` **exits 0**: masked diff shows only `database_id` changed, config restored byte-for-byte, no other file modified, schema applied under the new id, seed produced 8 editions and 30 sources. |
| 3 | The R2 lifecycle rules are scoped to the two growing prefixes only — `raw/` and `media/` — and the live rule listing shows no rule that can match the `og/` prefix or the bucket root | ✅ **VERIFIED** | **Live:** `wrangler r2 bucket lifecycle list meridian` returns exactly two rules — `expire-media` on `media/` at 365 days, `expire-raw` on `raw/` at 7 days, both with non-empty explicit prefixes, no `og/`, no empty prefix, no third rule. `npm run r2:lifecycle:verify` exits 0: "2 rules, each prefix-scoped to raw/ or media/. No rule can match og/ or the bucket root." The guard sits on the call path inside `createRule()` before the wrangler invocation, not on the data. |
| 4 | The written paid-plan decision rule names all three triggers and lives in the same versioned file the audit Worker reads | ✅ **VERIFIED** | `config/free-tier-limits.json` → `paid_plan_decision_rule.triggers` = `traffic`/4000/`approaching`, `static_files`/20000/`exceeding`, `revenue`/1/`any`, each with `source_requirement: OPS-04`. `standing_disposition: "never_purchase"` (D-05) with the three load-shedding mechanisms (D-07) and `request_ceiling_is_a_permanent_wall_ref: D-08`. ADR 0005 records the standing no-spend decision and states honestly that Cloudflare budget alerts are informational only and do not cap usage. |
| 5 | Spikes S-1, S-2, S-3, S-4 and S-5 have each been executed and their outcomes recorded, with the decision each one drove and the resulting change, if any, to the delivery model | ✅ **VERIFIED** | All five `RESULT.md` exist with a Decision section. `spikes/RESULTS.md` carries one row per spike with Observed / Threshold / Decision / Delivery-model change, each decision measured rather than assumed: S-1 the Durable Object completed **28.4 s** of CPU while a plain-Worker control arm was killed between 0.72 s and 1.44 s (a control arm, so "the DO survived" cannot be confused with "this account is not on the assumed plan"); S-2 **6/10** feeds at 200 with all four failures reproduced from an ordinary client; S-3 **6/10** from a real GitHub Actions runner (run 39505614934, `workflow_dispatch`, `ubuntu-latest`) with three of four ETag-bearing feeds answering 304; S-4 **84.6 pages/second** at 20,001 pages, incremental restored 20,000 and rendered none; S-5 **0 of 506** assets re-uploaded on the second and third deploy. ADR 0001 records all five outcomes. |

**Score: 4 / 5 roadmap success criteria verified** (1 partial).

### Phase Goal Clauses

| # | Clause | Status | Evidence |
|---|--------|--------|----------|
| 1 | "the delivery model … decided, recorded and testable" | ✅ VERIFIED | ADR 0001 records the delivery model explicitly as **EIGHT** sharded Workers Static Assets projects, names the override of `research/SUMMARY.md` §1 and `codebase/ARCHITECTURE.md` with the D-05/D-06/D-08 reasoning, and carries the tier split (OPS-12), the one-hostname locale-prefix rule (PUB-12), the parses-nothing rule (ING-02) and the CI scheduled build (OPS-09). Eight live shard projects confirmed in the account; three spot-checked live at HTTP 200. |
| 2 | "the shared data contract … decided, recorded and testable" | ✗ **FAILED** | **BLOCKER.** The contract is decided and recorded (19 tables, 32 indexes, ADR 0002) and is partly testable (24/24 local assertions). But it cannot express the project's own documented retention model: the 30-day raw-mention prune is **structurally impossible** because four `NO ACTION` foreign keys to `stories(id)` block every delete, while `story_sources` is retained permanently by design. Reproduced independently. See Gap 1. |
| 3 | "the free-tier budget … decided, recorded and testable" | ⚠️ PARTIAL | The budget is decided and recorded completely (18 sourced, dated ceilings; the decision rule in the same file). The *gate* is a spelling check over a subset, and an Accepted ADR overstates it. See Gap 2. |
| 4 | "the five architecture-changing spikes have been run" | ✅ VERIFIED | All five executed, measured, recorded with thresholds and decisions, and folded back into ADR 0001. None was substituted by an assumption; S-3 was genuinely run on a GitHub Actions runner rather than locally. |

### Deferred Items

Items not met here but explicitly addressed in later milestone phases. Informational only.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `renderHead()` has zero production callers; the shipped layout emits no canonical, no hreflang, no RSS autodiscovery | Phase 4 / 5 / 6 | REQUIREMENTS.md assigns CON-09 to Phase 6; the Cross-References table records it as "emitted by the Phase 5 story renderer; Phase 6 centralizes it in `pageMeta()` and asserts it". Risk carried: `Base.astro` is the template every later layout inherits. |
| 2 | `listActiveSources()` selects `terms_status` but never filters on it | Phase 2 | REQUIREMENTS.md assigns ING-04 to Phase 2; plan 01-02's must-have (the schema carries the status; all 30 rows `unverified`) is met and asserted by `verify-local.mjs`. |
| 3 | `clusters.outlet_count` / `mention_count` have no writer | Phase 2 / 3 | The counters are written by the ingest and cluster stages that own the code paths creating `stories` and `story_sources` rows. The schema columns are well-formed and the read path is index-driven. |
| 4 | `/api/db/tables` is an unauthenticated D1-querying endpoint | Phase 7 | `meridian-worker` is not deployed (verified absent), so it is not live and costs no budget. OPS-02/OPS-03 (the audit Worker) are Phase 7. |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `config/free-tier-limits.json` | Every ceiling with value, unit, period, source_url, verified_on, plus the paid-plan decision rule | ✅ VERIFIED | 18 limits; all 16 named ceilings present; every entry carries an `https://` source and an ISO date; 3 OPS-04 triggers with thresholds 4000/20000/1; `standing_disposition: never_purchase`; 3 response mechanisms; D-09 non-conforming dependency recorded. |
| `shared/config/free-tier-limits.ts` | The only module allowed to read a ceiling; a validated typed accessor | ✅ VERIFIED | Zod-validated at import time (throws on a malformed registry), exports `FREE_TIER_LIMITS`, `limit()` (throws on an unknown id), `PAID_PLAN_DECISION_RULE`, `ENFORCED_LIMIT_TOKENS`. Purity asserted: imports nothing but `zod` and the JSON. |
| `shared/config/__tests__/free-tier-limits.test.ts` | The single-source scan test and its self-proving step | ⚠️ PARTIAL | 14 tests, green. Group C genuinely plants a violation, proves the scanner catches it and cleans up. Scope gap: `.jsonc`, the repo root, `docs/`, `.md`, `.sql` unscanned; exponent spellings pass. |
| `docs/adr/0005-free-tier-ceiling-and-no-spend.md` | The standing no-spend decision and the honest limits of Cloudflare's alerting | ⚠️ PARTIAL | Records D-05, D-07, D-08, D-09, D-18, all three triggers, and states honestly that budget alerts are informational only and do not cap usage. L22-23 overclaim the scan's scope. |
| `shared/db/0001_init.sql` | The full D1 DDL — 19 tables and 32 indexes, four LSH band indexes, partial editorial-rank index | ⚠️ PARTIAL | All 19 tables, 32 indexes, the four band indexes, the partial `idx_clusters_editorial … WHERE editorial_rank IS NOT NULL` and `idx_edition_clusters_edition (edition_id, published_at)` are present and index-driven. The `simhash` column cannot hold the 64-bit fingerprint its own comment describes, and four `NO ACTION` FKs to `stories(id)` make the documented prune impossible. |
| `shared/db/seed.sql` | 8 editions, 8 sections, the 64-row join, a 30-outlet starter registry | ✅ VERIFIED | All 30 sources carry `terms_status = 'unverified'`; 7 distinct country codes; asserted by `verify-local.mjs` (24/24 PASS against a genuinely empty database). |
| `apps/worker/src/db/repository.ts` | The single module through which all D1 access happens | ⚠️ PARTIAL | Only module with SQL; no `SELECT *`; every value bound; the one interpolated identifier allow-listed. But `listActiveSources()` does not filter `terms_status` (deferred to Phase 2), and no method writes `clusters.outlet_count` or `story_sources` (deferred to Phase 2/3). |
| `apps/worker/src/db/config.ts` | Resolution of the database identifier from configuration | ⚠️ PARTIAL | The requirement (id held as a configuration value) is met. The runtime resolution returns `''` in a deployment — see Gap 7. |
| `apps/worker/wrangler.jsonc` | The Worker project config carrying the D1 and R2 bindings | ✅ VERIFIED | Real `database_id` (not the zero placeholder), `migrations_dir: ../../shared/db`, R2 binding on bucket `meridian` (which exists live). Not covered by either ceiling scan. |
| `scripts/db/verify-local.mjs` | The proof that the schema applies to an empty database and the seed is complete | ✅ VERIFIED | 24/24 assertions PASS after deleting `.wrangler/state`. Contains no prune-executability assertion. |
| `scripts/db/verify-swap.mjs` | The proof that repointing the database id needs no code change | ⚠️ PARTIAL | Exits 0 with all six assertions passing. The file is a git binary blob and one of its guards is unreachable — see Gap 9. |
| `docs/adr/0002-d1-no-shard.md` | The D1 topology decision and its rationale | ⚠️ PARTIAL | Records the one-database decision, the rationale, the schema deviation (terms_status/terms_verified_at/terms_url) and the index-amplification note, and overrides the research's sharding recommendation with a reason. Its growth projection is invalid while the prune is impossible. |
| `scripts/cloudflare/r2-lifecycle.mjs` | The idempotent creator for the two lifecycle rules | ✅ VERIFIED | `assertUsablePrefix()` is on the call path inside `createRule()`, before the wrangler invocation, enforcing non-empty, trailing-slash and allow-list membership. Never passes `--ia-transition-*`. Convergent: removes rules it does not own. |
| `scripts/cloudflare/verify-lifecycle.mjs` | The live assertion that no rule can match `og/` or the bucket root | ✅ VERIFIED | Parses the live listing independently of the creator's parser. Asserts non-empty prefix, allow-list membership, absence of `og/`/`og`/empty, exact day counts, enablement, and rule count exactly 2. Exits 0 against the live bucket. |
| `wrangler/shards/route-table.json` | The eight-shard route table | ⚠️ PARTIAL | Eight shards, one locale prefix each, prefixes unique and complete. `global_surfaces` omits the surfaces ADR 0001 names — see Gap 5. |
| `wrangler/shards/shard-01..08-*.jsonc` | Eight assets-only shard configurations | ✅ VERIFIED | All eight: distinct project name, `not_found_handling: "none"`, no `main` key, `workers_dev: true`, one route each, asset directory ending in its own `/shards/shard-NN`. |
| `scripts/shards/split-output.mjs` | The build-time splitter | ✅ VERIFIED | Partitions one Astro build into eight shard directories and reads the per-project file cap from the registry by id, so no shard script holds a ceiling literal. |
| `scripts/shards/deploy-all.mjs` | The deploy script | ✅ VERIFIED | Deploys each shard in order, names the shard that failed, supports `--dry-run`, and reports `ok (route pending)` for the placeholder zone rather than folding a working deploy into success or failure. |
| `docs/adr/0001-delivery-model.md` | The delivery-model decision, recording EIGHT projects | ✅ VERIFIED | States EIGHT sharded projects, names the route table, states the override of the research's single-project conclusion with the D-05/D-06/D-08 reason, and records all five spike outcomes. |
| `shared/contract/excerpt-budget.ts` | The coded excerpt budget as a pure contract | ⚠️ PARTIAL | `EXCERPT_BUDGET` holds exactly the six specified values. The budget cannot be weakened by the code as written — the function only truncates, verifies its own output is a verbatim prefix, has no override parameter, no config lookup, and no rewrite path. The *gate* does not check CON-04 — see Gap 4. |
| `shared/templates/head.ts` | `pageMeta()` — the single source of truth for title, description, canonical, hreflang set, sitemap entry | ⚠️ PARTIAL | The canonical is **constructed, not sanitised**: `${SITE_ORIGIN}${path}` from a module-level constant, throwing on a full URL — no parameter can point it at a publisher. But `input.title` is discarded — see Gap 3. |
| `shared/templates/typographic-fallback.ts` | The pure string builder that renders the silent typographic panel | ✅ VERIFIED | Escapes every interpolated value, contains none of the forbidden error strings, reads no clock or global state. |
| `shared/__tests__/purity.test.ts` | The test proving the shared contract carries no runtime dependency | ✅ VERIFIED | No `astro/`, `workerd`, `cloudflare:workers`, `sharp`, `satori`, `fast-xml-parser` or `wrangler` import; no import from `apps/`, `scripts/` or `spikes/`; no `package.json` inside `shared/`. |
| `docs/adr/0003-image-permanence.md` | The image lifetime and fallback decision | ⚠️ PARTIAL | Records D-15 through D-19 including the accepted one-extra-R2-Class-B-read cost. Its "one rule, one value, one place" claim is false — see Gap 6. |
| `docs/adr/0004-domain-and-name.md` | The domain deferral, the accepted consequences and the site-name contract | ⚠️ PARTIAL | Records D-10 through D-14, the four accepted consequences (Google News enrolment, Publisher Center, News Showcase, AdSense stay closed until a domain exists), the 301-not-canonical migration rule, CON-09 and CON-10. Its "exactly one source file in the whole repository" claim is false — see Gap 10. |
| `spikes/RESULTS.md` + five `RESULT.md` | The consolidated spike table and each spike's measured outcome | ✅ VERIFIED | All five RESULT.md present with a Decision section; the rollup has one row per spike with metric, observed, threshold, decision and delivery-model change. |

---

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | -------|
| `apps/worker/src/db/repository.ts` | `shared/db/0001_init.sql` | the schema the statements are written against | ✅ WIRED | Every statement names columns that exist; the prominent-cluster query is an index scan (no temporary B-tree). |
| `apps/worker/src/db/config.ts` | `apps/worker/wrangler.jsonc` | the `d1_databases` binding the id is read from | ⚠️ PARTIAL | The binding carries the real id, but the runtime resolution path yields `''` in a deployment (Gap 7). |
| `scripts/db/verify-swap.mjs` | `apps/worker/wrangler.jsonc` | rewriting `database_id` and re-applying the migrations | ✅ WIRED | Passes end to end; one internal guard is unreachable (Gap 9). |
| `shared/config/free-tier-limits.ts` | `config/free-tier-limits.json` | import of the versioned budget | ✅ WIRED | Validated at import time; tokens derived from the data, not hardcoded. |
| `shared/config/__tests__/free-tier-limits.test.ts` | `config/free-tier-limits.json` | the enforced limit tokens scanned across the source tree | ⚠️ PARTIAL | Wired for its scope; the scope is narrower than the ADR claims (Gap 2). |
| `docs/adr/0005-free-tier-ceiling-and-no-spend.md` | `config/free-tier-limits.json` | `paid_plan_decision_rule` in the same file | ✅ WIRED | The rule and the budget cannot drift apart. |
| `scripts/cloudflare/verify-lifecycle.mjs` | `wrangler r2 bucket lifecycle list` | parsing the live rule listing | ✅ WIRED | Parses the live listing independently of the creator's parser; exits 0 on the real bucket. |
| `wrangler/shards/route-table.json` | `wrangler/shards/shard-01-uk.jsonc` | each shard's route taken from the table | ✅ WIRED | All eight agree; the route-table test asserts it. |
| `scripts/shards/split-output.mjs` | `wrangler/shards/route-table.json` | one output directory per shard in the table | ✅ WIRED | Eight directories produced; the file cap is read by limit id. |
| `shared/contract/excerpt-budget.ts` | `shared/types.ts` | the `StoryExcerpt` result type | ✅ WIRED | `toStoredExcerpt()` is the single bridge; a stored excerpt cannot carry a field the budget did not produce. |
| `shared/templates/head.ts` | `shared/config/site.ts` | `SITE_NAME` and `SITE_ORIGIN` for the canonical | ✅ WIRED | The canonical is built from a constant origin. |
| `spikes/s-2-worker-egress/src/index.ts` | `shared/config/site.ts` | the shared `USER_AGENT` constant | ✅ WIRED | S-2 and S-3 read the same module, so the comparison is like for like. |
| `spikes/RESULTS.md` | `docs/adr/0001-delivery-model.md` | a spike that changes the delivery model produces an ADR update | ✅ WIRED | All five outcomes are recorded in ADR 0001; each states explicitly that the model did not change. |
| `spikes/s-3-ci-egress/run.mjs` | `.github/workflows/spike-s3-egress.yml` | `workflow_dispatch` only, `contents: read`, no secrets | ✅ WIRED | The spike cannot fire spontaneously; the run genuinely executed on a GitHub Actions runner. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `config/free-tier-limits.json` | 18 ceiling values | Cloudflare's published limit pages, each with a `source_url` and a `verified_on` date | Yes — 18 real, sourced, dated values | ✓ FLOWING |
| `shared/db/0001_init.sql` → local D1 | 19 tables / 32 indexes | applied by `verify-local.mjs` to a genuinely empty database | Yes — 24/24 assertions pass against real rows | ✓ FLOWING |
| `shared/db/seed.sql` → local D1 | 8 editions, 8 sections, 64 joins, 30 sources | `INSERT OR IGNORE` cross-join form so counts cannot drift | Yes — counts asserted, 7 country codes, 0 rows off `unverified` | ✓ FLOWING |
| `apps/worker/src/db/repository.ts` | `SourceRow`, `ClusterRow`, `StorySourceRow` | D1 through the one repository module | Yes — every statement bound, index-driven | ✓ FLOWING |
| R2 lifecycle rules | two rules | created and verified against the **live** bucket | Yes — `media/` 365 d, `raw/` 7 d, both prefix-scoped | ✓ FLOWING |
| Eight static shard projects | the served shell | deployed to the Cloudflare account | Yes — spot-checked HTTP 200, correct asset content | ✓ FLOWING |
| `spikes/RESULTS.md` | five measured outcomes | real executions, including a live GitHub Actions run | Yes — measured values, not estimates | ✓ FLOWING |
| `shared/templates/head.ts` → `Base.astro` | `canonical`, `title` | `pageMeta()` — **never called by any production path** | No — the shipped layout emits no canonical at all | ✗ DISCONNECTED (deferred, see Deferred #1) |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| The whole Phase 1 test suite is green | `npm test -- --run` | 12 files, **134/134 passed** | ✓ PASS |
| TypeScript compiles with no errors | `npm run typecheck` | exit 0 | ✓ PASS |
| The Astro shell builds | `npm run build` | exit 0, 1 page built in 4.56 s | ✓ PASS |
| DSN-12: inter-word spacing survives compression | inspect `apps/site/dist/index.html` | `<p class="headline"><span>The</span> <em>Meridian</em></p>` — space intact; `TheMeridian` absent | ✓ PASS |
| The schema applies to a genuinely empty database and the seed is complete | `npm run db:verify:local` | **24/24 assertions PASS** | ✓ PASS |
| Repointing the database id needs no code change | `npm run db:verify:swap` | exit 0 — 6/6 PASS: masked diff shows only `database_id` changed, config restored byte-for-byte, no other file modified, schema applied, 8 editions, 30 sources | ✓ PASS |
| No lifecycle rule can match `og/` or the bucket root | `npm run r2:lifecycle:verify` | exit 0 — 2 rules, `media/` 365 d, `raw/` 7 d | ✓ PASS |
| The live R2 bucket matches the contract | `npx wrangler r2 bucket lifecycle list meridian` | exactly 2 rules, both with explicit non-empty prefixes | ✓ PASS |
| The live D1 database exists with the configured id | `npx wrangler d1 list` | `meridian` = `af7ca858-b8ce-432a-8e80-a05c39e3c1be` | ✓ PASS |
| The eight static shard projects exist and the spike projects are deleted | `npx wrangler versions list --name <project>` × 11 | 8/8 `meridian-static-*` EXIST; `meridian-spike-s1/s2/s5` absent | ✓ PASS |
| The shards serve | `Invoke-WebRequest https://meridian-static-{uk,in-hi,nz}.mehedy303.workers.dev/` | HTTP 200 on all three spot-checks | ✓ PASS |
| **The 30-day raw-mention prune is executable** | `DELETE FROM stories WHERE id = 900` against an isolated scratch D1 carrying a `story_sources` row | **FAILS** — `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)`; the row survives (`stories_left: 1`) | ✗ **FAIL — BLOCKER** |
| A stray ceiling literal outside the registry fails the build | plant `100000` in a `.jsonc` under `apps/`, a `.md` under `docs/`, and a root `.json`; run both scan suites | **FAILS to detect** — 28/28 green with all three plants present | ✗ **FAIL** (Gap 2) |
| A ceiling written in an alternative numeric spelling fails the build | plant `5e2` and `1e5`; run the scan suite | **FAILS to detect** — 14/14 green | ✗ **FAIL** (Gap 2) |

All probe files were removed; `git status` shows only the pre-existing untracked `graphify-out/.review-scope.txt`.

---

## Requirements Coverage

### Phase 1's own requirement IDs (per REQUIREMENTS.md traceability)

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| **OPS-01** | 01-03 | A single versioned configuration file holds every free-tier ceiling the project depends on | ⚠️ **PARTIAL** | The file is complete: 18 ceilings, every one with a source URL and a verification date, all 16 named ceilings present, no ceiling read from anywhere else in the scanned scope. The *enforcement half* of Success Criterion 1 is a spelling check over a subset (`.jsonc`, the repo root, `docs/`, `.md`, `.sql` unscanned; exponent spellings pass — all three proven empirically), and ADR 0005 overclaims the guarantee. **Gap 2.** |
| **OPS-04** | 01-03 | A written decision rule states that the paid Workers plan is bought when daily visitors approach 4,000, when a static project would exceed 20,000 files, or when the project earns revenue | ✅ **SATISFIED** | All three triggers are named in `config/free-tier-limits.json` with metrics and thresholds 4000 / 20000 / 1, in the same versioned file the Phase 7 audit Worker reads. The standing disposition `never_purchase` (D-05) is recorded alongside, satisfying the locked decision that the free tier is a permanent ceiling. |
| **OPS-14** | 01-02 | All datastore access goes through one repository module with the database identifier held as a configuration value | ✅ **SATISFIED** (with warnings) | One repository module holds every statement; a repository-wide test proves no SQL exists elsewhere; no `SELECT *`; every value bound. The identifier is a configuration value and `db:verify:swap` proves the swap is a config change with no code change. Two warnings attach to the artefacts the requirement names: `resolveDatabaseId()` returns `''` in a deployment (**Gap 7**) and the proof script is a git binary blob (**Gap 9**). Neither breaks the requirement. |
| **MED-08** | 01-04 | An R2 lifecycle rule expires objects under the media prefix after 12 months, and is scoped so that it can never apply to Open Graph images or the site root | ✅ **SATISFIED** | **Live:** bucket `meridian` carries exactly two rules — `expire-media` on `media/` at 365 days and `expire-raw` on `raw/` at 7 days — both with explicit non-empty prefixes. No rule on `og/`, no rule on the empty prefix, no third rule. The guard is structural: `assertUsablePrefix()` throws on the call path before any `lifecycle add`, and the verifier parses the live listing independently. |

### Every requirement ID claimed by a Phase 1 plan frontmatter

All 21 IDs claimed across the six plans are accounted for in REQUIREMENTS.md. **No orphaned requirement.**

| ID | Plan | Authoritative phase (REQUIREMENTS.md) | Status | Evidence |
|----|------|------------------------------------|--------|----------|
| OPS-14 | 01-02 | **Phase 1** | ✅ SATISFIED | as above |
| OPS-01 | 01-03 | **Phase 1** | ⚠️ PARTIAL | Gap 2 |
| OPS-04 | 01-03 | **Phase 1** | ✅ SATISFIED | as above |
| MED-08 | 01-04 | **Phase 1** | ✅ SATISFIED | as above |
| OPS-12 | 01-04 | Phase 5 (Complete) | ✅ TOUCHED | The tier split is decided in ADR 0001 (static tier = editions/sections/archives/topics/entities/support; story pages pre-rendered to R2 and served by the edge Worker at `/story/*`; the build never opens a datastore binding). Cross-reference row present. |
| PUB-12 | 01-04 | Phase 5 (Complete) | ✅ TOUCHED | One hostname, locale path prefixes, never subdomains, with the reason recorded. Cross-reference row present. |
| ING-02 | 01-04, 01-06 | Phase 2 (Complete) | ✅ TOUCHED | "The fetch Worker parses nothing" decided in ADR 0001 and exercised by S-2/S-3, which parse no body. Cross-reference row present. |
| CON-01 … CON-05 | 01-05 | Phase 2 (Complete) | ✅ TOUCHED | The excerpt budget is a coded contract (`EXCERPT_BUDGET` with exactly the six specified values), tested, with no override path and no config lookup. The *gate* has one missing check (**Gap 4**). Cross-reference row present. |
| CON-09 | 01-05 | Phase 6 (Complete) | ✅ TOUCHED | The canonical policy is decided in ADR 0004 and constructed (never sanitised) in `pageMeta()`, which throws on a full URL. The contract has two defects (**Gaps 3** and the deferred wiring). Cross-reference row present. |
| CON-10 | 01-05 | Phase 5 (Complete) | ✅ TOUCHED | The attribution-link policy (`rel="noopener"`, never `nofollow`/`sponsored`) is decided in ADR 0004 with the reasoning that a cross-domain canonical drops the page from the index. Cross-reference row present. |
| DSN-12 | 01-01 | Phase 4 (Complete) | ✅ TOUCHED (traceability gap) | `astro.config.mjs` sets `compressHTML: true`, `build.concurrency: 1`, `experimental.incrementalBuild: true`, `output: 'static'`, no Cloudflare adapter, `vite.server.fs.allow` includes `'../..'`. The built HTML proves the inter-word space survives. **No cross-reference row exists in REQUIREMENTS.md for Phase 1** — a documentation gap. |
| SEO-13 | 01-01 | Phase 6 (Complete) | ✅ TOUCHED (traceability gap) | `SITE_NAME` is a single config value in `shared/config/site.ts`; all eight editions read one shared edition list. **No cross-reference row exists in REQUIREMENTS.md for Phase 1** — a documentation gap. |
| ING-01 | 01-06 | Phase 2 (Complete) | ✅ TOUCHED | The conditional-GET path was exercised in S-2 and S-3 with the shared User-Agent; the corrected reading (a 200 with a full body is the normal outcome) is recorded in both the RESULT files and the rollup. Cross-reference row present. |
| ING-10 | 01-06 | Phase 2 (Complete) | ✅ TOUCHED | Both egress spikes send the byte-identical `USER_AGENT` read from `shared/config/site.ts`. Cross-reference row present. **Carry-forward:** the address in that User-Agent is `newsroom@example.invalid` — RFC 2606 reserved, can never receive mail. It must be replaced with a deliverable mailbox before Phase 2 fetches any feed in production. |
| OPS-07 | 01-06 | Phase 7 (Complete) | ✅ TOUCHED | S-4 supplies the build-duration figures and S-5 supplies the deploy-budget formula (a fixed cost plus a per-file manifest cost). Cross-reference row present. |
| OPS-09 | 01-06 | Phase 5 (Complete) | ✅ TOUCHED | The choice of a scheduled CI build over a deploy hook is recorded in ADR 0001 (the hook URL is itself the credential), and S-4 measured under the project's own configuration. Cross-reference row present. |
| OPS-10 | 01-06 | Phase 5 (Complete) | ✅ TOUCHED | S-4 proved the mechanism: the incremental build restored 20,000 pages and rendered none, and the incremental build is **not** a wall-clock saver at scale — so the budget must be written against the full build. Cross-reference row present. |

**Traceability summary:** Phase 1's four own requirement IDs (OPS-01, OPS-04, OPS-14, MED-08) map to Phase 1 in REQUIREMENTS.md and are marked Complete. Seventeen further IDs are claimed by Phase 1 plan frontmatter; every one of them maps to a later phase as the authoritative verifier and each has a Cross-References row recording Phase 1's contribution — **except DSN-12 and SEO-13, which have no such row.** This is a documentation gap, not an orphan: both requirements exist in REQUIREMENTS.md and are assigned to Phase 4 and Phase 6 respectively.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `shared/db/0001_init.sql` | 193, 234, 242, 272 | `REFERENCES stories(id)` with no `ON DELETE` clause | 🛑 **BLOCKER** | The documented 30-day prune fails for 100% of rows, not 0%. The D1 growth projection, ADR 0002's seven-year-headroom claim and PROJECT.md's retention constraint are all invalid. Reproduced. |
| `docs/adr/0005-free-tier-ceiling-and-no-spend.md` | 22-23 | An Accepted ADR states a guarantee stronger than the code provides | ⚠️ WARNING | "proves that no code path reads one from anywhere else" is false — the scan covers a subset and cannot see a code path at all. An ADR is the project's record of what it has actually guaranteed. |
| `docs/adr/0004-domain-and-name.md` | 53-54 | "the literal appears in exactly one source file in the whole repository" | ⚠️ WARNING | False: the literal also appears in `shared/db/0001_init.sql:2` and `package.json:6` — a comment and a config, exactly the two cases the ADR says the build reports. |
| `docs/adr/0003-image-permanence.md` | 72-75 | "One rule, one value, one place to check" | ⚠️ WARNING | The 365-day value lives in three files. A divergence would be invisible to every test. |
| `shared/config/__tests__/free-tier-limits.test.ts` | 120, 123 | Scan roots and extensions omit `.jsonc`, the repo root, `docs/`, `.md` and `.sql` | ⚠️ WARNING | The Worker's own `wrangler.jsonc` is covered by neither suite. Proven with three planted ceilings that all passed. |
| `shared/config/free-tier-limits.ts` | 195-208 | Tokens are spellings, not values | ⚠️ WARNING | `5e2` and `1e5` pass the gate; the OPS-01 gate is a spelling check, not a value check. |
| `scripts/db/verify-swap.mjs` | 162 | A literal NUL byte in a source file | ⚠️ WARNING | Git records the OPS-14 proof artefact as a binary blob — no line-level diffs ever again — and the guard it belongs to can never fire. |
| `shared/templates/head.ts` | 72 | A required input field is accepted and discarded | ⚠️ WARNING | Every story page rendered through this contract would carry an identical `<title>`. |
| `shared/contract/excerpt-budget.ts` | 389-430 | The gate does not check the requirement it is documented to enforce | ⚠️ WARNING | `assertExcerptWithinBudget()` never checks CON-04, so a paraphrase passes the gate Phase 2 runs over every stored excerpt. |
| `apps/worker/src/db/repository.ts` | 151-156 | A selected column is never filtered on | ⚠️ WARNING | `terms_status` is selected but not filtered, so the terms-of-use legal gate has no enforcement at the only data-access point. (Deferred to Phase 2 — see Deferred #2.) |
| `apps/worker/src/db/config.ts` | 66-74 | Both resolution sources are empty in a deployment | ⚠️ WARNING | The module that answers "which database am I talking to" returns `''` in production. |
| `shared/db/0001_init.sql` | 168-169 | A column's own comment names a representation the column cannot hold | ⚠️ WARNING | `simhash` is a single signed INTEGER with a two-halves comparison method and no halves columns; the TS type is a 53-bit double. Phase 3's clusterer is built on it. |
| `wrangler/shards/route-table.json` | 13-20 | The route table's global surfaces are narrower than ADR 0001's | ⚠️ WARNING | When Phase 5 produces topic/entity pages and Phase 6 the news sitemaps, those URLs 404 from every shard and CI reports success. |
| `spikes/s-2-worker-egress/src/index.ts` | — | A hardcoded personal `workers.dev` hostname in a probe | ℹ️ Info | The S-1 plan probe targets `meridian-spike-s1.mehedy303.workers.dev`; on another account it measures a different deployment. |
| `shared/config/site.ts` | 30 | `USER_AGENT` carries an RFC 2606 reserved address | ℹ️ Info | `newsroom@example.invalid` can never receive mail, although the comment claims a monitored address. Must be a real mailbox before the first production fetch. |
| `.gitignore` | 17 | `.dev.vars` is ignored but `.dev.vars.*` is not | ℹ️ Info | A per-environment secrets file would be committed. |

---

## Human Verification Required

### 1. The broadsheet shell on a live shard

**Test:** Open `https://meridian-static-uk.mehedy303.workers.dev/` and confirm the broadsheet shell renders with the space between the inline elements in the headline intact. Then request an unmatched path such as `https://meridian-static-uk.mehedy303.workers.dev/uk/nonexistent/` and confirm it returns a real 404.

**Expected:** The page renders as a broadsheet shell; the headline reads "The Meridian" with a single space (the DSN-12 regression fixture); a missing path returns HTTP 404 rather than the asset layer answering.

**Why human:** This is a visual and HTTP-behaviour check on a live deployment. The build output was verified byte-wise (`<p class="headline"><span>The</span> <em>Meridian</em></p>`) and three of the eight shards were spot-checked for HTTP 200 programmatically, but the rendered appearance and the not-found behaviour were not assessed.

### 2. The R2 lifecycle rules in the dashboard

**Test:** In the Cloudflare dashboard, open R2 Object Storage → bucket `meridian` → Lifecycle and confirm the two rules and their prefixes visually, and confirm no third rule (including any platform default) is present.

**Expected:** Exactly two rules: `expire-raw` on `raw/` at 7 days and `expire-media` on `media/` at 365 days.

**Why human:** The live rule listing was verified programmatically and shows exactly two prefix-scoped rules, but the dashboard view is where an operator would see a rule the CLI might not surface.

---

## Gaps Summary

Phase 1 delivers more than it claims in most dimensions. The delivery model is genuinely decided, recorded and unambiguous about the eight-shard override. The free-tier budget is complete, sourced and dated, and the decision rule lives in the same file so it cannot drift from the budget. All five spikes were genuinely executed and measured — S-3 on a real GitHub Actions runner, S-1 with a control arm, S-4 at 20,001 pages — and the numbers are recorded rather than estimated. The R2 lifecycle rules are correct against the live bucket. The D1 schema applies cleanly to an empty database with the full index set, and the database-identifier swap is proven to be a configuration change with no code change. The live infrastructure matches the contract: eight shard projects deployed and serving, the three spike projects deleted, the D1 database and R2 bucket present and correct.

**One must-have fails, and it is the phase's own data contract.** The Phase 1 D1 schema makes the project's documented 30-day raw-mention prune structurally impossible. Four child tables hold `NO ACTION` foreign keys to `stories(id)`, and `story_sources` is retained permanently by design, so every published story holds a row that permanently blocks the delete of its `stories` parent. I reproduced this independently against local D1 in an isolated scratch database: the delete fails with `SQLITE_CONSTRAINT_FOREIGNKEY` and the row survives. This is not an edge case a careful Phase 2 prune would avoid — it fails for 100% of rows.

The consequence is that ADR 0002's recorded growth model ("~70 MB/year… roughly seven years of headroom") and PROJECT.md's locked constraint ("the `stories` raw-mention rows are pruned after 30 days") are both invalid as written, and D-05 makes the free tier a permanent wall with no escape hatch. The fix belongs in Phase 1 because Phase 1 owns the schema, and because Phase 2 — the very next phase — starts writing `stories` rows: altering an existing SQLite table with live rows requires a full table rebuild, which is materially harder and riskier than changing the DDL now. Nothing else in the phase depends on the prune, and no roadmap success criterion and none of the four requirement IDs are broken by it, so this is a gap in the *data-contract* clause of the goal rather than a collapse of the phase.

**Nine warnings accompany it**, and they share one shape: a claim in an ADR or a test comment is stronger than the code behind it. The OPS-01 enforcement scan does not cover `.jsonc`, the repository root, `docs/` or exponent spellings — I proved all three gaps with planted ceilings that passed — and ADR 0005 nonetheless states the scan "proves that no code path reads one from anywhere else". ADR 0004 claims the site name appears in "exactly one source file in the whole repository" while it also appears in `shared/db/0001_init.sql` and `package.json`. ADR 0003 claims the 365-day clock lives "in one place" while it lives in three. `pageMeta()` silently discards the required `input.title`, so every story page would render an identical `<title>`. `assertExcerptWithinBudget()` — the gate Phase 2 is told to run over every stored excerpt — does not check CON-04, the one limit that distinguishes quoting from rewriting. `resolveDatabaseId()` returns an empty string in a real deployment. The route table's global surfaces are narrower than ADR 0001's, so topic, entity and news-sitemap URLs would 404 from every shard when later phases produce them, with CI reporting success. The `simhash` column cannot hold the 64-bit fingerprint its own comment describes. And the OPS-14 proof script carries a NUL byte that makes git treat it as a binary blob.

None of these are stubs and none are hidden — they are defects in artefacts that exist, are wired, and mostly work. But they should be closed before Phase 2 builds on them, because the phase goal is explicitly *"decided, recorded and testable **before any feature code is written**"*, and Phase 2 is about to write feature code against this schema and this contract layer.

---

_Verified: 2026-10-21T07:49:08Z_
_Verifier: OpenCode (gsd-verifier) — initial verification, no prior `01-VERIFICATION.md`_
_Method: read-only inspection of the working tree, 11 test/build/verify commands, live Cloudflare state, and four temporary probe files that were removed immediately (tree confirmed clean)_
