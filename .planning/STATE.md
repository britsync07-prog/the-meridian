---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-04-PLAN.md
last_updated: "2026-10-20T19:06:37.919Z"
last_activity: 2026-10-20
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 6
  completed_plans: 4
  percent: 67
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-20, after research synthesis — 25 corrections applied)
Architecture of record: `.planning/research/SUMMARY.md` (authoritative) and `.planning/research/ARCHITECTURE.md`

**Core value:** Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.
**Current focus:** Phase 01 — Foundation, Free-Tier Contract & Architecture Decisions (plans 01-01 through 01-04 of 01-06 complete)
**Success target:** 1,000+ daily visitors and 10,000+ indexed pages within six months of launch.

## Current Position

Phase: 01 (foundation-free-tier-contract-architecture-decisions) — EXECUTING
Plan: 5 of 6
Status: Executing Phase 01 — plans 01-01, 01-02, 01-03 and 01-04 complete
Last activity: 2026-10-20 -- 01-04 complete (R2 lifecycle rules, eight-project static shard, delivery-model ADR)

Progress: [███████░░░] 67%

## Phase Sequence

| # | Phase | Depends on | Req count |
|---|-------|-----------|-----------|
| 1 | Foundation, Free-Tier Contract & Architecture Decisions | — | 8 |
| 2 | Feed Acquisition, Raw Capture & Normalization | 1 | 14 |
| 3 | Curation Core: Clustering, Ranking & Enrichment | 2 | 14 |
| 4 | Broadsheet Design System & Astro Shell | 1 — **runs in parallel with 2 and 3** | 13 |
| 5 | Publication Surface: Editions, Story Tier & Media | 2, 3, 4 | 37 |
| 6 | Digest, Trust Layer & SEO/Discovery | 5 (MDX trust layer may start after 4) | 35 |
| 7 | Operational Hardening, Rollout & Measurement | 5, 6 | 24 |

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 21min | 3 tasks | 18 files |
| Phase 01 P02 | 73min | 3 tasks | 12 files |
| Phase 01 P03 | 15min | 3 tasks | 5 files |
| Phase 01 P04 | 52min | 3 tasks | 15 files |

- Total plans completed: 4 · Average duration: 40min · Total execution time: 161min
- By phase: Phase 01 — 4 plans, 161min
- Recent trend: 01-04, 52min; 01-03, 15min; 01-02, 73min; 01-01, 21min

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- **Delivery model (SET, not to be re-litigated):** Cloudflare Workers Static Assets, one project (assets + minimal Worker script for the story tier); Astro static output with **no** Cloudflare adapter; CI builds via GitHub Actions; story pages pre-rendered to R2; static tier = editions/sections/archives/topics/entities/support only; fetch-only Worker → R2 raw → CI transforms.
  - **SUPERSEDED by Phase 1 decision D-06 (2026-10-20):** the static tier is **8 sharded Workers Static Assets projects**, one per locale prefix, with the global surfaces duplicated into every shard. The single-project conclusion above is the research's; D-06 governs because D-05 removes the paid escape hatch, which makes the request ceiling a permanent wall. See `docs/adr/0001-delivery-model.md` (written in Phase 1).
- **Budget ceiling (SET, not to be re-litigated):** the free tier is a **permanent hard ceiling**. The project never buys Workers Paid or any other paid tier — **not even after the site earns revenue** (D-05). Revenue is not a licence to spend on infrastructure.
  - **SUPERSEDED by Phase 1 decision D-05:** the older "Workers Paid ($5/mo) is a pre-agreed decision point at traffic ≈4,000/day, >20,000 static files, or revenue" rule no longer applies as a purchase. The three triggers are still recorded in `config/free-tier-limits.json` as the standing OPS-04 rule, but the disposition for each is load shedding (D-07), not spending.
- **D-01:** a Cloudflare account exists with a card on file. R2 is a metered service with a free allowance, so card-on-file is accepted; the R2 bucket is created in Phase 1.
- **D-02 / D-03:** the GitHub repository is **public** (unlimited Actions minutes) and lives under a **personal account**, not an organisation.
- **D-04 / D-15 / D-19:** R2 is protected by Cloudflare budget alerts at 80% of each metered quota **plus** lifecycle rules on the two growing prefixes only — `raw/` at 7 days and `media/` at 12 months. No rule may match `og/` or the bucket root. Cloudflare budget alerts are informational only; the lifecycle rules are the real cap.
- **D-09:** Open-Meteo's free tier is non-commercial only. The project serves it unchanged in v1 and carries a standing obligation to source a free commercially-usable replacement **before any revenue exists**. It will not buy the paid tier.
- **D-10 / D-11:** the domain is bought **only after the site earns revenue**. Accepted consequence: Google News enrolment, Publisher Center URL verification, the News Showcase panel and the AdSense path stay closed until a domain exists — a `workers.dev` subdomain cannot provide the DNS TXT record Publisher Center requires. **Phase 6 must not plan those as completable on the subdomain.**
- **D-12 / D-13:** the site name is **"The Meridian"**, locked now, in one config value (`shared/config/site.ts`) that feeds `<news:name>`, the masthead, the OG template and the repo name. All seven editions share **one** site name; edition identity lives in the `<title>`, the meta description, the `<h1>` and the visible masthead.
- **D-14:** the domain migration uses **301 redirects, never canonicals**, with the redirect map generated from the same source as the sitemap.
- **D-16 / D-17 / D-18:** an expired image renders a **silent typographic panel** carrying the headline's opening words — no error, no caption. Both mechanisms apply: serve-time resolution **and** a periodic sweep. The serve-time check costs one extra R2 Class B read per image view, and that cost is accepted.
- **D-20:** the repo is **one `package.json`, one lockfile, no workspace protocol**. `shared/` is a directory, not a package.
- **D1:** one database (`meridian`) behind a single repository module, database id as a config value. No edition sharding. **Recorded in `docs/adr/0002-d1-no-shard.md` (Phase 1, plan 01-02), which overrides `research/PITFALLS.md`'s "shard from day one".** The schema is 19 tables and 32 named indexes; `usage_log` and `corrections` were added on top of the research DDL's 17, and `story_sources` carries `headline` and `url` so the outlet list survives the 30-day prune of the raw mention rows.
- **Canonical model:** self-referential canonicals only, never cross-domain. One canonical story page per cluster at `/story/{slug}/`, edition-agnostic. Publisher URLs are normal followed links with `rel="noopener"`.
- **hreflang:** only between India English and India Hindi. All seven editions use locale path prefixes on **one hostname** — never subdomains.
- **Excerpt budget:** ≤50 words / ≤320 chars / ≤2 sentences / ≤30% of source visible text; quoted verbatim or omitted, never paraphrased; sources under 160 words publish no excerpt. **Coded as a contract in Phase 1** (`shared/contract/excerpt-budget.ts`); the normaliser and its full unit test land in Phase 2.
- **No human editor:** the daily digest defaults to a deterministic template; every automated surface carries a visible disclosure. The original-articles programme is deferred to v2 (V2-EDT-01) rather than faked.
- [Phase 01]: The GitHub repository is britsync07-prog/the-meridian - public, under a personal account, named for the locked site name (D-02, D-03, D-12).
- [Phase 01]: The shared contract is a plain directory imported by RELATIVE path only. The @shared/* TypeScript alias exists for tsc and the editor, never for a bundler - edge alias resolution is the least predictable part of the Workers build.
- [Phase 01]: DSN-12 is proven, not merely configured: the built HTML keeps the space between two inline elements, and a second Astro build ran in 1.7s against 10.6s, proving build.concurrency 1 and experimental.incrementalBuild are both in force.
- [Phase 01]: D1 topology: ONE database named 'meridian', no edition sharding. The repository module (OPS-14) makes a future sharding a routing change, not a rewrite. Recorded in docs/adr/0002-d1-no-shard.md. — ~70 MB/year against a 500 MB per-database cap; sharding would destroy cross-country flagging, the one-story-many-editions model and Most Covered.
- [Phase 01]: The D1 schema carries 19 tables and 32 named indexes (the research DDL has 17 and 31). usage_log and corrections were added because the architecture and OPS-23 require them; story_sources gained headline and url because the raw mention rows are pruned after 30 days. — Phase 1 owns the schema, and a table added later is a migration.
- [Phase 01]: The free tier is a permanent hard ceiling, recorded as standing_disposition never_purchase inside config/free-tier-limits.json — D-05. The rule and the budget it governs live in one file, so they cannot drift apart. Revenue is not a licence to spend on infrastructure.
- [Phase 01]: shared/config/free-tier-limits.ts is the only module permitted to read a free-tier ceiling, and it validates the registry with Zod at import time — OPS-01. A ceiling read from anywhere else has already drifted from the budget. The scan tokens are derived from the enforced ceilings at runtime, so the token list cannot drift from the registry either.
- [Phase 01]: r2_storage_gb_month is informational, not enforced — The bare token 10 collides with D-10 and ING-10 in shared/config/site.ts and with a column-width argument in scripts/db/verify-local.mjs, so scanning for it could never pass. The ceiling keeps its source, its date and its measurement by the Phase 7 audit Worker; only the literal scan skips it.
- [Phase 01]: The scan's self-proving fixture is planted outside any __tests__ directory — The scan excludes test fixtures - a test legitimately asserts the literal it guards - so a fixture inside scripts/__tests__/ would be skipped by the very scanner meant to catch it. It is planted at scripts/__planted_ceiling.ts, removed in a finally block, and gitignored.
- [Phase 01]: Cloudflare budget alerts are informational only; the R2 lifecycle rules are the real cap on storage growth — D-04. Cloudflare states the alert does not cap usage or impact the account, and usage is processed once per day. The 50%/75% percentage-of-ceiling alerts belong to the Phase 7 audit Worker (OPS-03), which reads this same registry. ADR 0005 explicitly refuses to claim alerts prevent billing.
- [Phase 01]: The static tier is EIGHT sharded Workers Static Assets projects, one per locale prefix, with the global surfaces duplicated into every shard — This overrides the research's single-project conclusion - D-05 removes the paid escape hatch entirely, making the request ceiling a permanent wall (D-08) and the shard mandatory infrastructure rather than an optimisation. Recorded in docs/adr/0001-delivery-model.md.
- [Phase 01]: The R2 bucket 'meridian' carries exactly two prefix-scoped lifecycle rules: raw/ at 7 days and media/ at 365 days — The platform-default 'Default Multipart Abort Rule' that Cloudflare creates with an EMPTY prefix is removed - it aborts incomplete multipart uploads rather than expiring objects, and R2 aborts them after 7 days by default anyway, so the behaviour is unchanged. An empty-prefix rule is exactly the shape MED-08 forbids.
- [Phase 01]: The lifecycle creator converges the bucket rather than only reporting, and the verifier is independent of it — The creator removes every rule it does not own, so a drifted bucket is repaired; the verifier parses the LIVE listing, so a parsing bug in the creator cannot hide itself from the check. A gate that was never observed to fail is not a gate - an empty-prefix rule was planted and the verifier was confirmed to exit 1.

### Research Spikes (all seven assigned)

| ID | Spike | Executed in | Gates |
|----|-------|-------------|-------|
| S-1 | Durable Object CPU on Workers Free (30 min) | Phase 1 | Phase 2 |
| S-2 | Worker egress vs publisher blocking (30 min) | Phase 1 | Phase 2 |
| S-3 | CI egress comparison (15 min) | Phase 1 | Phase 2 |
| S-4 | Astro build throughput, synthetic 20,000-page build (60 min) | Phase 1 | Phase 5 |
| S-5 | wrangler asset-upload diffing (30 min) | Phase 1 | Phase 5 |
| S-6 | Hindi digest bake-off (90 min) | Phase 6 | Phase 6 (digest + Hindi edition) |
| S-7 | Merge-gate calibration vs labelled fixture (2–3 days) | Phase 3 | Phase 3 curation release |

### Parallel Workstreams (not phases)

- **Domain acquisition** — starts in Phase 1, launch-blocking, no code dependency. Migration via 301 redirects lands in Phase 7 (GRO-09).
- **Track B** — Phase 4 design system and Astro shell; fully independent of ingest. **Do not sequence it after Phase 3.**
- **Track E** — taxonomy curation (source registry, section lexicons, gazetteers) from Phase 1, continuous. Must never block the pipeline.
- **Track C** — MDX trust layer; startable as soon as the Phase 4 shell exists.

### Pending Todos

- **Phase 01, remaining 2 plans** (01-05 → 01-06). Plan 01-01 delivered the repository scaffold, the shared contract layer and the Astro 7 shell configuration; plan 01-02 delivered the D1 schema, the seed, the single repository module and the D1 topology ADR; plan 01-03 delivered the versioned free-tier ceiling registry, the single accessor, the single-source scan test and the standing no-spend ADR; plan 01-04 delivered the live R2 bucket with its two prefix-scoped lifecycle rules, the eight live Workers Static Assets projects with the route table and the build-time splitter, and the delivery-model ADR. The excerpt budget, the shared templates, the image and domain ADRs and the five spikes are still outstanding.
- **`shared/` is the contract for every later phase.** `shared/types.ts` holds the story schema, `shared/config/site.ts` the publication name, `shared/config/editions.ts` the eight editions and sections, `shared/config/free-tier-limits.ts` the only legal home of a ceiling value. None may be redefined downstream.
- **`wrangler/shards/route-table.json` is the single source of truth for the shard matrix.** The eight shard configs and the route table must change together — the route-table test asserts they agree. When a domain is bought (Phase 7, D-14), `zone_name` is the one value that changes, and it must change in the same commit as the eight configs, or the routes and the table disagree and the build fails.

### Phase 01 Progress

| Plan | Scope | Status | Summary |
|------|-------|--------|---------|
| 01-01 | Repo scaffold, shared contract layer, Astro 7 shell | ✅ Complete | `01-01-SUMMARY.md` |
| 01-02 | D1 schema, seed, single repository module | ✅ Complete | `01-02-SUMMARY.md` |
| 01-03 | Free-tier ceiling registry and the no-spend rule | ✅ Complete | `01-03-SUMMARY.md` |
| 01-04 | R2 lifecycle, eight-project shard, delivery-model ADR | ✅ Complete | `01-04-SUMMARY.md` |
| 01-05 | Excerpt budget, shared templates, image and domain ADRs | Pending | — |
| 01-06 | Spikes S-1 through S-5 | Pending | — |

**Note on MED-08, OPS-12, PUB-12 and ING-02 (marked complete by plan 01-04).** MED-08 is fully delivered: the R2 bucket `meridian` exists with exactly two prefix-scoped lifecycle rules — `raw/` at 7 days and `media/` at 365 days — and `scripts/cloudflare/verify-lifecycle.mjs` proves against the **live** rule listing that no rule can match `og/` or the bucket root. The gate was observed to fail: an empty-prefix rule was planted, the verifier exited 1 with a specific message, and the creator repaired the bucket. **OPS-12** records the tier split in `docs/adr/0001-delivery-model.md`: the static tier holds only editions, sections, archives, Most Covered, topic and entity pages; story pages are pre-rendered to R2 and served at `/story/*`; the build reads one gzipped snapshot object and never opens a datastore binding. **PUB-12** records the one-hostname rule: seven editions and the Hindi edition under locale path prefixes, never subdomains. **ING-02** records that the fetch Worker performs no parsing, no normalization and no scoring — all transformation happens in CI, because the Free plan's per-cron CPU ceiling is a measured 9.45 ms against a 9.45 ms realistic feed parse. The **eight static shards are live** (`meridian-static-uk` … `meridian-static-in-hi`), each serving its own locale prefix on its `workers.dev` subdomain; the zone routes attach when a domain exists (D-10). The delivery-model ADR explicitly overrides the research's single-project conclusion and names why.

**Note on the D1 schema (marked complete by plan 01-02).** OPS-14 is fully delivered: `apps/worker/src/db/repository.ts` is the only module in the repository that contains SQL, and a test scans the whole tree for SQL keywords outside it. The schema applies to an empty database — 19 tables, 32 named indexes — and `scripts/db/verify-local.mjs` asserts every count by name. **The four LSH band indexes on `stories` are load-bearing, not optional:** the Phase 3 clusterer must issue four index lookups, because a scan of `stories` is ~44,000 rows read per incoming item and breaches the 5M rows/day budget on its first busy day. The database identifier is a configuration value, proven by `scripts/db/verify-swap.mjs`, which repoints the binding, rebuilds the schema and the seed from nothing, and hashes `apps/worker/src` and `shared` before and after to prove nothing else moved.

**Note on OPS-01 and OPS-04 (marked complete by plan 01-03).** Both are delivered. `config/free-tier-limits.json` holds eighteen ceilings, each with its value, unit, period, source URL and verification date, plus the `paid_plan_decision_rule` in the same file — so the rule and the budget cannot drift apart. `shared/config/free-tier-limits.ts` is the only module permitted to read a ceiling; it validates the registry with Zod at import time and throws on any shape violation. **The scan is a gate, not a convention:** `shared/config/__tests__/free-tier-limits.test.ts` walks the whole source tree for every enforced ceiling literal and reports `file:line — token`, and it proves itself by planting a deliberate violation, asserting the scanner catches it, and removing it in a `finally` block. One ceiling — `r2_storage_gb_month`, whose value is `10` — is marked `informational` rather than `enforced`, because the bare token `10` collides with identifiers like `D-10` in unrelated source; it is still recorded, still sourced and still measured by the Phase 7 audit Worker.

**Note on SEO-13 and DSN-12 (marked complete by plan 01-01).** DSN-12 is fully delivered: `compressHTML: true` is set and a built-HTML assertion proves the spacing survives. SEO-13 is complete on the *configuration* half — the site name now exists in exactly one place, `shared/config/site.ts`, and a repository-wide scan fails if a second copy appears. The `<news:name>` **emission** remains Phase 6's work and must read from that same value so the two cannot diverge.

### Blockers/Concerns

- **[Phase 3]** The merge thresholds (Jaccard 0.55 / Hamming 12 / stop list / aspect markers) are reasoned from literature, not from this corpus. Unvalidated until S-7 lands a measured precision/recall number. Bias toward not merging.
- **[Phase 1]** The domain is not yet acquired, and that is now a decision rather than a gap: D-10 defers the purchase until the site earns revenue and D-11 accepts the consequence. It is still launch-blocking for Search Console verification, Publisher Center URL verification and meaningful ranking — but Phase 1's job is to record that constraint, not to resolve it.
- **[Phase 6]** Hindi digest quality on the free tier is unverified (S-6). The deterministic template stays the default until a model passes.
- **[Phase 6]** `news:name` is the single highest-impact string in the project — it must exactly match the name on news.google.com. Fix it once in one config value before configuring Publisher Center.
- **[Phase 7]** Brevo's free allowance (300/day vs 5,000/month) must be re-verified at Phase 7 planning, and the overflow policy decided before 250 subscribers.
- **[Phase 7]** The single-source scan only covers ceilings marked `enforced`. A stray copy of an `informational` ceiling in source code will not be caught by the scan — the one to watch is `r2_storage_gb_month` (10 GB-month), because `10` is too common a number to scan for. The audit Worker's measurement against the registry is where that coverage lives.
- **[Phase 7]** The eight zone routes are pending because no domain exists (D-10). Each shard is live on its `workers.dev` subdomain and the route table's `zone_name` is `PLACEHOLDER_NO_DOMAIN_YET`. When the domain is bought, `zone_name` and the eight shard configs must change in the same commit — the route-table test asserts they agree, so a divergence fails the build rather than the deployment.
- **[Phase 1]** The Cloudflare budget alerts still need a manual dashboard configuration (D-04). Everything that can be automated was done: the bucket, its two lifecycle rules, and the live proof that no rule can match `og/` or the bucket root. The alerts themselves notify but do not cap usage, so the lifecycle rules are the real budget protection. The exact steps are in `scripts/cloudflare/billing-alerts.md`.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Editorial | V2-EDT-01 original articles by a named human editor | Deferred to v2 | Roadmap creation 2026-10-20 |
| Editorial | V2-EDT-02 human review gate on the digest | Deferred to v2 | Roadmap creation 2026-10-20 |
| Product | V2-PRD-01 site-wide search | Deferred to v2 | Roadmap creation 2026-10-20 |
| Monetization | V2-MON-01 advertising and monetization | Deferred to v2 | Roadmap creation 2026-10-20 |
| Monetization | V2-MON-02 re-evaluate the Open-Meteo non-commercial limit | Deferred to v2 | Roadmap creation 2026-10-20 |

## Session Continuity

Last session: 2026-10-20T19:06:37.874Z
Stopped at: Completed 01-04-PLAN.md
Resume file: None
