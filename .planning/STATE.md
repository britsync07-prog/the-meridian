---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Phase 3 executed; verification found 8 blockers; gap closure required
last_updated: "2026-10-22T06:55:49.765Z"
last_activity: 2026-10-22 -- 03-05 complete (reversible cluster split with dated corrections, and the end-to-end curation pipeline)
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 16
  completed_plans: 16
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-20, after research synthesis — 25 corrections applied)
Architecture of record: `.planning/research/SUMMARY.md` (authoritative) and `.planning/research/ARCHITECTURE.md`

**Core value:** Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.
**Current focus:** Phase 03 — curation-core-clustering-ranking-enrichment
**Success target:** 1,000+ daily visitors and 10,000+ indexed pages within six months of launch.

## Current Position

Phase: 03 (curation-core-clustering-ranking-enrichment) — COMPLETE, ready for verification
Plan: 5 of 5
Status: Phase 3 executed (5/5 plans) - verification FAILED, 8 blockers, gap closure required
Last activity: 2026-10-22 -- 03-05 complete (reversible cluster split with dated corrections, and the end-to-end curation pipeline)

Progress: [██████████] 100%

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
| Phase 01 P05 | 34min | 3 tasks | 11 files |
| Phase 01 P06 | 8h 37m | 3 tasks | 27 files |

- Total plans completed: 6 · Average duration: 119min · Total execution time: 712min
- By phase: Phase 01 — 6 plans, 712min
- Recent trend: 01-06, 8h 37m; 01-05, 34min; 01-04, 52min; 01-03, 15min; 01-02, 73min; 01-01, 21min
- **Note on 01-06's duration:** 8h 37m is wall clock from the plan's first commit to its last, and it includes a server restart that interrupted task 3 and the idle time around it. It is an upper bound on the work, not a measure of it.

*Updated after each plan completion*
| Phase 03 P05 | 32min | 3 tasks | 11 files |

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
- **Excerpt budget:** ≤50 words / ≤320 chars / ≤2 sentences / ≤30% of source visible text; quoted verbatim or omitted, never paraphrased; sources under 160 words publish no excerpt. **Coded as a contract in Phase 1 and LANDED** (`shared/contract/excerpt-budget.ts`, 22 assertions, 2026-10-21): the contract only ever TRUNCATES — no rewrite path, no per-source override, no config lookup — and it verifies its own output is a verbatim prefix of the candidate. The word cap and the source-share cap are both ceilings and the tighter one binds. Phase 2 inherits the contract and calls `applyExcerptBudget()` then `assertExcerptWithinBudget()`; it does NOT write its own excerpt logic.
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
- [Phase 01]: The excerpt budget is truncation-only with no override path - CONTEXT.md left the choice open and it is exercised in the negative: an override is a paraphrase-shaped loophole, so applyExcerptBudget takes exactly one argument and the contract verifies its own output is a verbatim prefix of the candidate. — CON-04 is structural rather than procedural. Google names synonymizing and translating as a scaled-content-abuse example, so paraphrasing to dodge duplicate detection is a policy violation. The API shape makes it impossible rather than merely discouraged.
- [Phase 01]: The word cap and the source-share cap are both ceilings and the tighter one binds - a 200-word source would allow 60 words at 30 percent, but 60 breaches the 50-word cap, so the excerpt is 50 words and a quarter of the source. — CON-01 states every limit as a ceiling. The plan's own test 6 asked for 60 words, which would have breached the 50-word cap; the plan's algorithm (min of both caps) is the correct reading. Both caps are now proven independently - the share cap at a 160-word source, the word cap at 200.
- [Phase 01]: A canonical is CONSTRUCTED, not sanitised - pageMeta builds it as SITE_ORIGIN plus a path and refuses a full URL as a path outright. — CON-09. A cross-domain canonical tells Google the Meridian page is not canonical, so the page leaves the index and the publication becomes referral-only. There is now no code path by which a canonical could come to point at a publisher.
- [Phase 01]: The shared layer is pure string builders returning HTML, not components - head.ts carries both pageMeta (what the metadata IS) and renderHead (how it is WRITTEN). — A dynamically served story page must render identically to a statically served section page, and an Astro component cannot render inside an edge Function. Keeping both halves in one module means the two runtimes emit the same bytes and the halves cannot drift.
- [Phase 01]: The image-permanence resolution rule is split into shared/contract/image-permanence.ts, and the media lifetime is one named constant read by both the serve-time resolution and the sweep's predicate. — The rule (present or expired) and the rendering (what an expired object looks like) are different concerns, and Phase 5's edge Worker needs the rule without the rendering. One constant means the two apply mechanisms cannot use different clocks.
- [Phase 01]: A decision that names a budget references the registry id, never the number - ADR 0003 charges D-18's cost against r2_class_b_ops_per_month. — The prose-ADR ceiling scan was widened from ADR 0001 to cover ADR 0003 and ADR 0004, and the gate was observed to fail on a planted literal. A ceiling written into prose is a second copy of the budget that can drift from the registry.
- [Phase 01]: The Durable Object is an option, not a decision - S-1 measured that a Durable Object on the Workers Free plan has its own CPU allowance and does not inherit workers_cpu_ms_per_invocation — It completed 28.4 s of CPU where the plain Worker was killed between 0.72 s and 1.44 s, against a threshold of 2 s. The option of hosting the ingest pipeline in a SQLite-backed Durable Object without the R2 raw-staging hop is recorded in docs/adr/0001-delivery-model.md, but Phase 2 owns the choice because it owns the ingest and must weigh it against every publisher in seven countries rather than a sample of ten. If Phase 2 adopts it, the platform's per-object CPU allowance becomes a ceiling the project depends on and must be added to config/free-tier-limits.json under OPS-01 at that point.
- [Phase 01]: The static tier stays as designed - S-4's build-throughput threshold was not met, so topic and entity pages do not move to the R2 tier before year 2 — At a shard's whole file allowance (20,001 pages) the build ran at 84.6 pages/second on a realistic story page and 157.3 on a minimal one, both above the 60 pages/second the threshold was set at. The heavier page cost 1.9x the wall time rather than several times it, because at this scale the build is bound by filesystem traffic rather than by rendering.
- [Phase 01]: The build-duration budget is written against the FULL build, not the incremental one - the incremental build is not a time saver at scale — S-4's incremental build restored all 20,000 pages and rendered none, which is what OPS-10 asks for, but it was 1.1x faster on the minimal page set and 0.8x - slower - on the realistic one. A third build on the same cache came back between the other two, so the finding is a range and the conclusion drawn from it is the conservative one.
- [Phase 01]: The deploy-step budget is a formula, not a number - S-5 measured that wrangler diffs the asset manifest — Three deploys with no content change between them uploaded 0 of 506 assets and 0 of 5,006 at the larger scale. One shard's deploy is roughly a fixed cost of six to seven seconds plus that shard's file count times roughly five milliseconds for the manifest pass, plus roughly four milliseconds per changed file. A single number would have been wrong, because the file count is the input that varies between shards and over time.
- [Phase 01]: A 200 with a full body is the normal conditional-GET outcome - the mechanism is the publishers' cache state, not the egress path — S-3 corrected S-2's original reading that publishers ignore the conditional header. The ETags had gone stale between the passes, and a publisher whose CDN copy is fresh serves that copy directly with a 200 without ever consulting the client's If-None-Match. The conditional GET is implemented because it is the correct way to identify unchanged content, and a bandwidth budget cannot be built on 304s.
- [Phase 01]: Four of the ten registry candidates are a registry problem, not an egress problem - no publisher blocked the Cloudflare egress — S-2's four failures reproduce identically from an ordinary client on an ordinary network, and S-3's runner reached the same six feeds and failed on the same four. Phase 2 inherits a task of replacing four dead candidates rather than a task of choosing between two fetch paths. Feed availability and terms of use remain Phase 2's legal gate.
- [Phase 03]: The four 16-bit LSH bands cannot find paraphrased headlines, so the pipeline draws its candidates from the band probe and a merge-window scan together — Measured on the labelled fixture: 0 of the 92 same-event pairs collide on any of the four bands, with a median Hamming distance of 26 bits, and random fixture pairs collide at 1 in 1209. A band is 16 bits wide, so two paraphrases must agree on 16 specific bits. A pipeline built on the band probe alone would never have merged anything and the product would have been a single-outlet feed. The windowed scan is index-driven and bounded by the merge window, costing about 0.3 percent of the daily D1 row-read budget. The band definition itself is a Phase 3 design question that plan 03-05 did not reopen.
- [Phase 03]: A cluster split never removes a stories row, and the dated correction note names the outlet — The split moves the row's cluster_id and migrates its story_sources row, so it can be undone and it does not depend on the 30-day raw-mention prune that Phase 1's open foreign-key blocker breaks. The note is published to a reader on a permanent URL, so it names the outlet rather than a source id. Plan 03-05 also found a second schema-level conflict for the same gap-closure pass: stories.cluster_id references clusters(id) while the project's convention is cluster_id = 0 for not-yet-clustered.

### Research Spikes (all seven assigned)

| ID | Spike | Executed in | Gates | Outcome |
|----|-------|-------------|-------|---------|
| S-1 | Durable Object CPU on Workers Free (30 min) | Phase 1 | Phase 2 | **Executed 2026-10-21.** Threshold MET — a Durable Object has its own CPU allowance and does not inherit `workers_cpu_ms_per_invocation`. Not adopted; the option is recorded in ADR 0001 and Phase 2 decides. |
| S-2 | Worker egress vs publisher blocking (30 min) | Phase 1 | Phase 2 | **Executed 2026-10-21.** Six of ten feeds at 200; the four failures reproduce with no Worker in the path. A registry problem, not an egress problem. The conditional-GET reading was later corrected by S-3. |
| S-3 | CI egress comparison (15 min) | Phase 1 | Phase 2 | **Executed 2026-10-21.** One of ten publishers blocks the CI range, against a thirty-per-cent threshold. The runner reaches the same six feeds. Corrected S-2's conditional-GET reading. |
| S-4 | Astro build throughput, synthetic 20,000-page build (60 min) | Phase 1 | Phase 5 | **Executed 2026-10-21.** 84.6 pages/second on a realistic story page and 157.3 on a minimal one, both above the sixty-per-second threshold. The static tier stays as designed. The incremental build restores every page and renders none, but is not reliably faster. |
| S-5 | wrangler asset-upload diffing (30 min) | Phase 1 | Phase 5 | **Executed 2026-10-21.** The second and third deploys uploaded 0 of 506 assets and 0 of 5,006 at the larger scale. Deploys are cheap; the budget is a formula. |
| S-6 | Hindi digest bake-off (90 min) | Phase 6 | Phase 6 (digest + Hindi edition) | Not started |
| S-7 | Merge-gate calibration vs labelled fixture (2–3 days) | Phase 3 | Phase 3 curation release | Not started |

**The rollup is `spikes/RESULTS.md`**, and it is a gate rather than a document: `spikes/__tests__/results.test.ts` fails the build if a spike is missing, if a result has no Decision heading, if the rollup has no row for a spike, if an INCOMPLETE spike does not name the command that finishes it, or if any file under `spikes/` carries a bare free-tier ceiling literal. Each spike's own `RESULT.md` carries the method, the raw tables and what it did NOT settle.

### Parallel Workstreams (not phases)

- **Domain acquisition** — starts in Phase 1, launch-blocking, no code dependency. Migration via 301 redirects lands in Phase 7 (GRO-09).
- **Track B** — Phase 4 design system and Astro shell; fully independent of ingest. **Do not sequence it after Phase 3.**
- **Track E** — taxonomy curation (source registry, section lexicons, gazetteers) from Phase 1, continuous. Must never block the pipeline.
- **Track C** — MDX trust layer; startable as soon as the Phase 4 shell exists.

### Pending Todos

- **Phase 01 is complete — all six plans delivered.** Plan 01-01 delivered the repository scaffold, the shared contract layer and the Astro 7 shell configuration; plan 01-02 delivered the D1 schema, the seed, the single repository module and the D1 topology ADR; plan 01-03 delivered the versioned free-tier ceiling registry, the single accessor, the single-source scan test and the standing no-spend ADR; plan 01-04 delivered the live R2 bucket with its two prefix-scoped lifecycle rules, the eight live Workers Static Assets projects with the route table and the build-time splitter, and the delivery-model ADR; plan 01-05 delivered the coded excerpt budget contract, the shared metadata and typographic fallback templates, the image-permanence contract and the two remaining ADRs; plan 01-06 executed and recorded the five spikes. **Phase 2 may start.** The next work is Phase 2 (Feed Acquisition, Raw Capture & Normalization), and Track B (Phase 4) may run in parallel with it.
- **`spikes/RESULTS.md` is the Phase 2 and Phase 5 entry gate.** Five architecture-changing questions were answered with measured numbers rather than assumptions, and each result is recorded with the threshold it was measured against and what it did NOT settle. **The delivery model survived all five tests.** Three things changed: the Durable Object is now a measured option rather than a hypothesis, a conclusion drawn in S-2 was corrected by S-3 in the same repository, and the OPS-07 build-duration and deploy budgets are now formulas with measured coefficients instead of guesses. **And one thing did not change at all: no spike cleared the legal gate on the feeds.** S-2 and S-3 measured blocking. Availability and terms of use remain Phase 2's gate, and no spike is permission to fetch any feed in production.
- **The spike projects are deleted.** `meridian-spike-s1`, `meridian-spike-s2` and `meridian-spike-s5` were created to be measured and then removed, so the shared account's project count is not spent on a measurement. The eight real shards, the `meridian` R2 bucket and the `meridian` D1 database were verified present and untouched afterwards.
- **Two budgets were measured on a Windows workstation and must be re-measured on the CI runner before they are fixed as gates.** S-4's build timings and S-5's deploy timings are both I/O-bound, and both spikes say so in their RESULT files. The direction of the error is probably favourable — a Linux runner with a different filesystem is likely faster — but the project should not budget against the slower of the two without saying so.
- **`shared/` is the contract for every later phase.** `shared/types.ts` holds the story schema, `shared/config/site.ts` the publication name, `shared/config/editions.ts` the eight editions and sections, `shared/config/free-tier-limits.ts` the only legal home of a ceiling value, `shared/contract/excerpt-budget.ts` the coded excerpt budget, `shared/contract/image-permanence.ts` the media lifetime and resolution rule, and `shared/templates/` the pure string builders (`head.ts` with `pageMeta()` and `renderHead()`, `typographic-fallback.ts` with the silent panel). None may be redefined downstream. **`shared/` is a directory, not a package — it holds no `package.json`, and `shared/__tests__/purity.test.ts` fails the build if it ever does, or if any shared module imports a runtime-specific module.**
- **`wrangler/shards/route-table.json` is the single source of truth for the shard matrix.** The eight shard configs and the route table must change together — the route-table test asserts they agree. When a domain is bought (Phase 7, D-14), `zone_name` is the one value that changes, and it must change in the same commit as the eight configs, or the routes and the table disagree and the build fails.

### Phase 03 Progress

| Plan | Scope | Status | Summary |
|------|-------|--------|---------|
| 03-01 | Stoplist, SimHash-64 fingerprinting, LSH bands, anti-merge guards | ✅ Complete | `03-01-SUMMARY.md` |
| 03-02 | Labelled 200-pair benchmark, D1 candidate query, two-gate clustering engine | ✅ Complete | `03-02-SUMMARY.md` |
| 03-03 | Broadsheet trending score, 18-hour recency decay, Editor's Picks gate | ✅ Complete | `03-03-SUMMARY.md` |
| 03-04 | Four-stage section resolver, bilingual gazetteer, cross-country edition flagging | ✅ Complete | `03-04-SUMMARY.md` |
| 03-05 | Reversible cluster split with dated corrections, end-to-end curation pipeline | ✅ Complete | `03-05-SUMMARY.md` |

**Note on CUR-11 (the one requirement Phase 3 does not fully deliver).** CUR-11 asks for every cluster to carry **topics** and named entities, each decision recording its method and confidence. The entity half is delivered and tested — the pipeline resolves gazetteer slugs to row ids and writes `story_entities` rows for the member stories. **The topic half is not implemented: there is no topic matcher in `config/lexicon.ts`, only `SECTION_KEYWORDS`, so the pipeline passes an empty topic list.** This is a phase-level gap, not a 03-05 gap: no plan in Phase 3 specified topic tagging, and the roadmap's Phase 3 exit criteria do list topics. It is recorded here and in `03-05-SUMMARY.md` so the phase verifier sees it rather than inferring it.

**Note on the LSH bands (measured in plan 03-05).** The four 16-bit bands that the schema indexes cannot match paraphrased headlines: **0 of the 92 labelled same-event pairs** collide on any band, with a median Hamming distance of 26 bits, and random fixture pairs collide at 1 in 1,209. A band is 16 bits wide, so two paraphrases must agree on 16 specific bits — which a distance of 26 makes vanishingly unlikely. The band indexes remain in the schema and the band probe remains the first query the pipeline issues, but **the pipeline also scans the merge window**, which is what gives it recall. The window is driven by `idx_stories_published` and holds a day's worth of rows, so it costs about 0.3% of the daily D1 row-read budget. **If the recall is ever to be restored without the window, the fix belongs in the band definition — more, narrower bands — and therefore in the schema that carries them.**

**Note on the cluster split and Phase 1's open foreign-key blocker.** The split **never removes a `stories` row**: it moves the row's `cluster_id` and migrates its `story_sources` row, so a split can be undone and it does not depend on the 30-day raw-mention prune that the four `NO ACTION` foreign keys to `stories(id)` break. Plan 03-05 also surfaced a **second** schema-level conflict for the same gap-closure pass: `stories.cluster_id` references `clusters(id)`, while the project's convention is `cluster_id = 0` for "not yet clustered" — a cluster that does not exist. The local ingest runner works around it with `PRAGMA foreign_keys = OFF`; on D1 the same insert would be refused if foreign keys are enforced.

### Phase 01 Progress

| Plan | Scope | Status | Summary |
|------|-------|--------|---------|
| 01-01 | Repo scaffold, shared contract layer, Astro 7 shell | ✅ Complete | `01-01-SUMMARY.md` |
| 01-02 | D1 schema, seed, single repository module | ✅ Complete | `01-02-SUMMARY.md` |
| 01-03 | Free-tier ceiling registry and the no-spend rule | ✅ Complete | `01-03-SUMMARY.md` |
| 01-04 | R2 lifecycle, eight-project shard, delivery-model ADR | ✅ Complete | `01-04-SUMMARY.md` |
| 01-05 | Excerpt budget, shared templates, image and domain ADRs | ✅ Complete | `01-05-SUMMARY.md` |
| 01-06 | Spikes S-1 through S-5 | ✅ Complete | `01-06-SUMMARY.md` |

**Note on ING-01, ING-02, ING-10, OPS-07, OPS-09 and OPS-10 (marked complete by plan 01-06).** These are the requirements the spikes bear on, and the honest description of each is what the spike *measured*, not what a later phase must *implement*. **ING-01**: the conditional-GET path was exercised from both the edge and a CI runner, and the corrected reading is that it must be implemented because it is the correct way to identify unchanged content — while a 200 with a full body is the normal outcome, because whether a 304 happens depends on the publisher's cache state and not on the client's request. **ING-10**: the descriptive User-Agent with a contact URL was sent by both sides of the comparison, byte-identically, read from `shared/config/site.ts`; the rate limit and the `Retry-After` handling remain Phase 2's, and no feed returned a 429 in the measurement, so that path is unexercised. **ING-02** was already complete from plan 01-04 and the spikes confirm it in practice: the S-2 and S-3 harnesses count bytes and discard them. **OPS-07**: the *budget* the assertion enforces is now measured rather than guessed — S-4 supplies the build-duration figures and S-5 supplies the deploy-budget formula, a fixed cost plus a per-file manifest cost, because the file count is the input that varies. **OPS-09**: the choice of a scheduled CI build over a deploy hook is recorded in ADR 0001, and S-4 measured a build under the project's own configuration so the budget is a number. **OPS-10**: S-4 proved the mechanism — the incremental build restored every page and rendered none — and also showed that it is not a wall-clock saver at scale, so the budget must be written against the full build. **None of this replaces the implementation, which lands in Phase 2, Phase 5 and Phase 7.**

**Note on MED-08, OPS-12, PUB-12 and ING-02 (marked complete by plan 01-04).** MED-08 is fully delivered: the R2 bucket `meridian` exists with exactly two prefix-scoped lifecycle rules — `raw/` at 7 days and `media/` at 365 days — and `scripts/cloudflare/verify-lifecycle.mjs` proves against the **live** rule listing that no rule can match `og/` or the bucket root. The gate was observed to fail: an empty-prefix rule was planted, the verifier exited 1 with a specific message, and the creator repaired the bucket. **OPS-12** records the tier split in `docs/adr/0001-delivery-model.md`: the static tier holds only editions, sections, archives, Most Covered, topic and entity pages; story pages are pre-rendered to R2 and served at `/story/*`; the build reads one gzipped snapshot object and never opens a datastore binding. **PUB-12** records the one-hostname rule: seven editions and the Hindi edition under locale path prefixes, never subdomains. **ING-02** records that the fetch Worker performs no parsing, no normalization and no scoring — all transformation happens in CI, because the Free plan's per-cron CPU ceiling is a measured 9.45 ms against a 9.45 ms realistic feed parse. The **eight static shards are live** (`meridian-static-uk` … `meridian-static-in-hi`), each serving its own locale prefix on its `workers.dev` subdomain; the zone routes attach when a domain exists (D-10). The delivery-model ADR explicitly overrides the research's single-project conclusion and names why.

**Note on the D1 schema (marked complete by plan 01-02).** OPS-14 is fully delivered: `apps/worker/src/db/repository.ts` is the only module in the repository that contains SQL, and a test scans the whole tree for SQL keywords outside it. The schema applies to an empty database — 19 tables, 32 named indexes — and `scripts/db/verify-local.mjs` asserts every count by name. **The four LSH band indexes on `stories` are load-bearing, not optional:** the Phase 3 clusterer must issue four index lookups, because a scan of `stories` is ~44,000 rows read per incoming item and breaches the 5M rows/day budget on its first busy day. The database identifier is a configuration value, proven by `scripts/db/verify-swap.mjs`, which repoints the binding, rebuilds the schema and the seed from nothing, and hashes `apps/worker/src` and `shared` before and after to prove nothing else moved.

**Note on OPS-01 and OPS-04 (marked complete by plan 01-03).** Both are delivered. `config/free-tier-limits.json` holds eighteen ceilings, each with its value, unit, period, source URL and verification date, plus the `paid_plan_decision_rule` in the same file — so the rule and the budget cannot drift apart. `shared/config/free-tier-limits.ts` is the only module permitted to read a ceiling; it validates the registry with Zod at import time and throws on any shape violation. **The scan is a gate, not a convention:** `shared/config/__tests__/free-tier-limits.test.ts` walks the whole source tree for every enforced ceiling literal and reports `file:line — token`, and it proves itself by planting a deliberate violation, asserting the scanner catches it, and removing it in a `finally` block. One ceiling — `r2_storage_gb_month`, whose value is `10` — is marked `informational` rather than `enforced`, because the bare token `10` collides with identifiers like `D-10` in unrelated source; it is still recorded, still sourced and still measured by the Phase 7 audit Worker.

**Note on SEO-13 and DSN-12 (marked complete by plan 01-01).** DSN-12 is fully delivered: `compressHTML: true` is set and a built-HTML assertion proves the spacing survives. SEO-13 is complete on the *configuration* half — the site name now exists in exactly one place, `shared/config/site.ts`, and a repository-wide scan fails if a second copy appears. The `<news:name>` **emission** remains Phase 6's work and must read from that same value so the two cannot diverge.

**Note on CON-01 to CON-05, CON-09 and CON-10 (marked complete by plan 01-05).** The excerpt budget is **coded, not described** — `shared/contract/excerpt-budget.ts` enforces all five limits and its only operation on the candidate is cutting it. There is no rewrite path, no per-source override parameter and no configuration lookup, and the contract verifies its own output is a verbatim prefix of the candidate, so a future edit that paraphrased would fail at the contract rather than in a stored row. **Phase 2 must call `applyExcerptBudget()` and then `assertExcerptWithinBudget()` — it must not write its own excerpt logic.** CON-09 is enforced by construction rather than by inspection: `pageMeta()` builds the canonical as the site's own origin plus a path and **refuses a full URL as a path outright**, so there is no code path by which a canonical could come to point at a publisher. `shared/__tests__/purity.test.ts` is the gate that keeps `shared/` framework-free and package-free, because a shared module that imported `astro/` could not be used by the Worker and the two tiers would drift into looking like different products.

### Blockers/Concerns

- **[Phase 2]** Four of the ten registry candidates S-2 and S-3 probed are dead or refusing **for every client on earth**, not just for the Cloudflare egress: `washingtonpost` (502), `cnn` (TLS), `aol` (DNS) and `ap` (403). Phase 2 inherits a task of replacing four dead candidates, and no amount of engineering on the fetch path will fix them. **The other seven countries' publishers and the Hindi-language publishers for the India edition are entirely unmeasured.**
- **[Phase 2]** The Durable Object ingest engine is now a measured option rather than a hypothesis, and the choice is Phase 2's. S-1 proved a Durable Object on the Free plan has its own CPU allowance and does not inherit the Workers per-invocation ceiling, but a Durable Object is single-threaded per object and the concurrency profile of deduplication over fifty publishers was not measured. If Phase 2 adopts it, the platform's per-object CPU allowance becomes a ceiling the project depends on and must be added to `config/free-tier-limits.json` under OPS-01 at that point.
- **[Phase 5]** Both of the phase's budgets were measured on a Windows workstation and are I/O-bound, so both must be re-measured on the CI runner before they are fixed as gates: the build duration (S-4) and the deploy step (S-5). The measured cost of a heavier story page was **sub-linear** in the page's complexity — the build is bound by filesystem traffic — so a real template costing more than the synthetic one does not proportionally slow the build, but the real template has not been measured at all.
- **[Phase 7]** The build-duration budget for OPS-07 must be written against the **full** build, not the incremental one. S-4 showed the incremental build restoring every page and rendering none — which is what OPS-10 asks for — but not being reliably faster: 1.1× faster on the minimal page set and 0.8×, that is slower, on the realistic one.
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

Last session: 2026-10-22T06:55:49.726Z
Stopped at: Phase 3 executed; verification found 8 blockers; gap closure required
Resume file: .planning/phases/03-curation-core-clustering-ranking-enrichment/03-VERIFICATION.md
