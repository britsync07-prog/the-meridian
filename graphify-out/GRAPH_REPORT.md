# Graph Report - newsportal  (2026-10-23)

## Corpus Check
- 196 files · ~389,204 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 27 file(s) not represented in the graph (top: .jsonc 13, .xml 7, .css 4)

## Summary
- 1685 nodes · 2785 edges · 122 communities (104 shown, 18 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 467 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d66dfe45`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Roadmap Phase Sequence
- Delivery Model and Ingest
- pipeline.ts
- Cloudflare Storage Services
- Astro Publishing Layer
- D1 Data Model
- Frontend Framework Stack
- International SEO Rules
- OG Image Rendering
- Image Processing
- AI Inference Layer
- Digest and SEO Phase
- Operational Hardening Phase
- fetcher/index.ts
- split-output.mjs
- package.json
- site.test.ts
- d1-harness.ts
- excerpt-budget.ts
- Phase 1 Research: Foundation, Free-Tier Contract & Architecture Decisions
- Phase 02 Research: Feed Acquisition, Raw Capture & Normalization
- 03-VERIFICATION.md
- measure.mjs
- vitest
- Phase 1 Plan 02: D1 Schema, Seed and the Single Repository Module Summary
- ADR 0001 — The delivery model: eight static shards, one edge Worker, R2 story tier
- Phase 1: Foundation, Free-Tier Contract & Architecture Decisions - Discussion Log
- verify-swap.mjs
- shards.test.ts
- run-local.ts
- Phase 4: Broadsheet Design System & Astro Shell - Discussion Log
- pageMeta
- normalizer.ts
- verify-local.mjs
- free-tier-limits.test.ts
- Implementation Decisions
- Implementation Decisions
- Auto-fixed issues
- Phase 03: Curation Core: Clustering, Ranking & Enrichment - Research
- Warnings
- editions.ts
- compilerOptions
- r2-lifecycle.mjs
- RawItem
- MeridianEnv
- Phase 1: Foundation, Free-Tier Contract & Architecture Decisions — Verification Report
- Repository
- schema.test.ts
- free-tier-limits.ts
- repository.ts
- Phase 1 Plan 01: Repo Scaffold, Shared Contract and Astro Shell Summary
- Info
- deploy-all.mjs
- ADR 0002 — One D1 database, no edition sharding
- Consequences
- Phase 1 Plan 03: The Free-Tier Ceiling Registry and the Standing No-Spend Decision Summary
- Phase 1 Plan 06: The Five Architecture-Changing Spikes Summary
- Implementation Decisions
- image-permanence.ts
- Decision
- Architecture: The Meridian
- Warnings
- do.ts
- shared/__tests__/purity.test.ts
- repository.test.ts
- Decision
- types.ts
- excerpt-budget.test.ts
- parser.ts
- excerpt-pipeline.test.ts
- Plan 03-05: Reversible Cluster Split, Dated Corrections & End-to-End Curation Pipeline — Summary
- Phase 3: Curation Core — Verification Report
- results.test.ts
- calculateTrendingScore
- splitCluster
- Implementation Decisions
- verify-lifecycle.mjs
- Observed
- S-5 — does `wrangler deploy` re-upload unchanged assets?
- worker/__tests__/purity.test.ts
- split-cluster.ts
- S-3 — CI egress comparison
- tagging.ts
- Info
- Cloudflare billing alerts — configuration record
- generate-benchmark-fixtures.ts
- RESULTS.md
- S-4 — Astro build throughput
- processCurationPipeline
- Phase 1 — Validation Strategy
- Deliverables & Key Changes
- Spike results — the five architecture-changing measurements
- Phase 1 — Post-Planning Gap Analysis
- Phase 02 — Validation Strategy
- Phase 03 — Validation Strategy
- taxonomy.ts
- Phase 1 Plan 04: R2 Lifecycle Rules, the Eight-Project Static Shard and the Delivery-Model ADR Summary
- ref_node_url
- Observed
- site/tsconfig.json
- gsd_init.sh
- Phase 01: Code Review Report
- Plan 02-04: Hard Excerpt Budget Integration & Language Segmentation — Summary
- Observed
- 01-03-PLAN.md
- 01-04-PLAN.md
- 01-06-PLAN.md
- 02-05-PLAN.md
- S-5 — the raw measurement record
- gsd_initplan.sh
- gsd_report.sh
- gsd_report2.sh
- 01-01-PLAN.md
- 01-07-PLAN.md
- 01-09-PLAN.md
- Auto-fixed Issues
- 01-12-PLAN.md
- 01-13-PLAN.md
- 01-15-PLAN.md
- generate.mjs
- countFiles

## God Nodes (most connected - your core abstractions)
1. `Repository` - 43 edges
2. `vitest` - 37 edges
3. `processCurationPipeline()` - 33 edges
4. `pageMeta()` - 32 edges
5. `Warnings` - 24 edges
6. `assertExcerptWithinBudget()` - 23 edges
7. `RawItem` - 22 edges
8. `applyExcerptBudget()` - 21 edges
9. `splitCluster()` - 19 edges
10. `Warnings` - 18 edges

## Surprising Connections (you probably didn't know these)
- `WR-14: `resolveDatabaseId()` returns an empty string in a real deployment` --references--> `resolveDatabaseId()`  [INFERRED]
  .planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-REVIEW.md → apps/worker/src/db/config.ts
- `6.1 Single Repository Module Rule` --references--> `Repository`  [INFERRED]
  .planning/phases/02-feed-acquisition-raw-capture-normalization/02-RESEARCH.md → apps/worker/src/db/repository.ts
- `Observable Truths — Roadmap Success Criteria` --references--> `createRule()`  [INFERRED]
  .planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-VERIFICATION.md → scripts/cloudflare/r2-lifecycle.mjs
- `Issues Encountered` --references--> `EditionId`  [INFERRED]
  .planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-01-SUMMARY.md → shared/config/editions.ts
- `Critical Architectural Finding: Section Nomenclature Alignment` --references--> `SectionId`  [INFERRED]
  .planning/phases/03-curation-core-clustering-ranking-enrichment/03-RESEARCH.md → shared/config/editions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Core Pipeline Flow** — planning_research_architecture_ingest_pipeline, planning_research_stack_cloudflare_r2, planning_research_stack_cloudflare_d1, planning_research_stack_astro [EXTRACTED 1.00]
- **Core Data Flow** — ingest_pipeline, curation_core, publication_surface [EXTRACTED 1.00]
- **Cloudflare Free Tier Stack** — cloudflare_workers, cloudflare_d1, cloudflare_r2 [EXTRACTED 1.00]
- **Parallel Development Tracks** — planning_roadmap_phase_2, planning_roadmap_phase_3, planning_roadmap_phase_4 [EXTRACTED 1.00]
- **SEO Compliance Strategy** — architecture_canonical_rules, architecture_hreflang_rules, architecture_delivery_model [EXTRACTED 1.00]
- **Originality & Compliance Layer** — deduplication_engine, daily_digest_generator, google_news_compliance [INFERRED 0.90]

## Communities (122 total, 18 thin omitted)

### Community 0 - "Roadmap Phase Sequence"
Cohesion: 0.29
Nodes (7): Phase 1: Foundation, Phase 2: Feed Acquisition, Phase 3: Curation Core, Phase 4: Design System, Phase 5: Publication Surface, Spike S-1: DO CPU, Spike S-7: Merge Calibration

### Community 1 - "Delivery Model and Ingest"
Cohesion: 0.20
Nodes (11): Canonical Rules, Delivery Model, Curation Core, Daily Digest Generator, Deduplication Engine, Google News Compliance, Ingest Pipeline, Cloudflare R2 (+3 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.05
Nodes (60): GENERIC_NOISE_TOKENS_EN, GENERIC_NOISE_TOKENS_HI, isNoiseToken(), isStopWord(), STOP_WORDS_EN, STOP_WORDS_HI, STOPLIST, STRIDE Threat Register (+52 more)

### Community 3 - "Cloudflare Storage Services"
Cohesion: 0.50
Nodes (4): Cloudflare D1, Cloudflare R2, Cloudflare Workers, Ingest Pipeline

### Community 4 - "Astro Publishing Layer"
Cohesion: 0.67
Nodes (3): Astro Shell, Publication Surface, SEO Strategy

### Community 13 - "fetcher/index.ts"
Cohesion: 0.05
Nodes (45): getPartitionIndex(), pollFeed(), pollFeedPartition(), defaultHostRateLimiter, executeFetchWithTimeout(), HostRateLimiter, HostRateLimiterOptions, parseRetryAfter() (+37 more)

### Community 14 - "split-output.mjs"
Cohesion: 0.08
Nodes (22): body, buildDir, DEFAULT_BUILD_DIR, fileCap, globalEntries, grandTotal, header, LIMITS_PATH (+14 more)

### Community 15 - "package.json"
Cohesion: 0.05
Nodes (42): dependencies, astro, fast-xml-parser, tailwindcss, @tailwindcss/vite, zod, description, devDependencies (+34 more)

### Community 16 - "site.test.ts"
Cohesion: 0.07
Nodes (24): Props, astro, @tailwindcss/vite, EDITIONS, SITE_LOCALE, SITE_NAME, SITE_ORIGIN, collectScannableFiles() (+16 more)

### Community 17 - "d1-harness.ts"
Cohesion: 0.08
Nodes (25): Known Stubs, SplitClusterResult, BATCH, EMBEDDINGS, EXTRA_SOURCES, HERE, PipelineFixture, REPO_ROOT (+17 more)

### Community 18 - "excerpt-budget.ts"
Cohesion: 0.16
Nodes (24): Open Questions and Required Decisions, WR-16: `assertExcerptWithinBudget()` — the gate Phase 2 runs over every stored excerpt — does not assert CON-04, STRIDE Threat Register, Tasks, Trust Boundaries, Task 2: Unicode-Aware Language Segmentation with `Intl.Segmenter` for English and Hindi, 7. Phase 02 Plan Decomposition (Recommended Execution Waves), allowedWordCount() (+16 more)

### Community 19 - "Phase 1 Research: Foundation, Free-Tier Contract & Architecture Decisions"
Cohesion: 0.07
Nodes (29): Architecture Decision Inputs (what the ADRs must record), Automatically verifiable in Phase 1 (no network, no account), Consolidated results, Executive Summary, Key Patterns, Measured only (no pass/fail on a value, a decision on a threshold), P1 — Astro 7 configuration (verified against the Astro v7 upgrade guide and the incremental-build reference), P2 — Wrangler command surface (verified against the current Wrangler command reference) (+21 more)

### Community 20 - "Phase 02 Research: Feed Acquisition, Raw Capture & Normalization"
Cohesion: 0.07
Nodes (29): 1. System Architecture & Component Design, 2.1 Partitioned Cron Triggers (D-01), 2.2 KV Polling State (D-02), 2.3 Rate Limiting & User-Agent (D-03, D-04, ING-10), 2.4 Streaming Body Limit & Quarantine Sniffing (D-07, D-08, D-09, ING-07), 2. Ingest Worker Fetch & Scheduling (Cloudflare Edge), 3.1 Registry Structure (`config/sources.ts`), 3.2 Launch-Blocking Legal Gate (ING-04, D-17) (+21 more)

### Community 21 - "03-VERIFICATION.md"
Cohesion: 0.10
Nodes (22): STRIDE Threat Register, Trust Boundaries, Commits, Deliverables Summary, Phase 3 Plan 04 Summary: Curation Enrichment & Broadsheet Organization, Verification, CR-02: The precision/recall gate measures a configuration the pipeline never runs; under the production configuration the gate fails and disjoint-entity pairs merge, CR-04: `"WHO"` in the gazetteer matches the English word "who" — every such headline is tagged as the World Health Organization and pushed onto all seven front pages (+14 more)

### Community 22 - "measure.mjs"
Cohesion: 0.19
Nodes (15): WR-20: The S-5 measurement writes a "Full re-upload: NO" conclusion before the check that detects unparsable counts, CONFIG_PATH, countAssetFiles(), deploy(), flag(), main(), parseAssetCounts(), parseReportedDuration() (+7 more)

### Community 23 - "vitest"
Cohesion: 0.12
Nodes (13): AstroConfigUnderTest, BUILT_INDEX_PATH, config, CONFIG_PATH, SITE_ROOT, vitest, collectFiles(), LOCKFILE_NAMES (+5 more)

### Community 24 - "Phase 1 Plan 02: D1 Schema, Seed and the Single Repository Module Summary"
Cohesion: 0.14
Nodes (12): STRIDE Threat Register, Trust Boundaries, Accomplishments, Decisions Made, Issues Encountered, Known Stubs, Performance, Phase 1 Plan 02: D1 Schema, Seed and the Single Repository Module Summary (+4 more)

### Community 25 - "ADR 0001 — The delivery model: eight static shards, one edge Worker, R2 story tier"
Cohesion: 0.08
Nodes (24): ADR 0001 — The delivery model: eight static shards, one edge Worker, R2 story tier, CI builds (OPS-09), Consequences, Context, Decision, Negative — accepted, Neutral, No Cloudflare adapter (+16 more)

### Community 26 - "Phase 1: Foundation, Free-Tier Contract & Architecture Decisions - Discussion Log"
Cohesion: 0.08
Nodes (24): Accounts & access, Budget ceiling, Buying the paid plan when revenue exists, Cloudflare account state, Deferred Ideas, Domain & name, Domain purchase timing, Edition identity under a single site name (+16 more)

### Community 27 - "verify-swap.mjs"
Cohesion: 0.09
Nodes (21): checks, CONFIG_PATH, diffLines, failures, finalHash, hashTrees(), listFiles(), originalConfig (+13 more)

### Community 28 - "shards.test.ts"
Cohesion: 0.09
Nodes (21): ADR-0001, ADR-0003, ADR-0004, collectSourceFiles(), EXPECTED_PREFIXES, EXPECTED_SHARDS, parseJsonc(), PROSE_ADRS (+13 more)

### Community 29 - "run-local.ts"
Cohesion: 0.12
Nodes (17): RawStoryInsert, SOURCES, Task 3: Build Local CLI Ingest Runner and Verify Dual-Run Parity, createSqliteD1Binding(), __dirname, EDITION_COUNTRY_MAP, __filename, findLocalSqlitePath() (+9 more)

### Community 30 - "Phase 4: Broadsheet Design System & Astro Shell - Discussion Log"
Cohesion: 0.09
Nodes (22): Above-the-Fold Lead Story, Agent's Discretion, Base Palette Values, Body/Chrome Typeface, Column Count, Dark Theme Strategy, Deferred Ideas, Devanagari Serif (+14 more)

### Community 31 - "pageMeta"
Cohesion: 0.12
Nodes (21): STRIDE Threat Register, Trust Boundaries, Accomplishments, Auto-fixed Issues, Decisions Made, Deviations from Plan, Issues Encountered, Known Stubs (+13 more)

### Community 32 - "normalizer.ts"
Cohesion: 0.21
Nodes (12): ResolveIdentityOptions, resolveItemIdentity(), ExtractedMedia, extractMediaEnclosure(), extractText(), ImageCandidate, isTrackingPixel(), sanitizeUrl() (+4 more)

### Community 33 - "verify-local.mjs"
Cohesion: 0.10
Nodes (18): applyResult, distinctCountries, editorialSql, failures, indexCount, indexNames, KNOWN_TABLES, listResult (+10 more)

### Community 34 - "free-tier-limits.test.ts"
Cohesion: 0.10
Nodes (19): ACCESSOR_PATH, collectSourceFiles(), ENFORCED_LIMIT_VALUES, EXEMPT_FROM_SCAN, EXPECTED_LIMIT_IDS, LimitLiteralHit, PLANTED_FILE, REGISTRY_PATH (+11 more)

### Community 35 - "Implementation Decisions"
Cohesion: 0.10
Nodes (20): Accounts & access, Architecture of record — read these first, Budget ceiling — the free tier is a permanent design constraint, Canonical References, Deferred Ideas, Domain and masthead name, Established Patterns, Existing Code Insights (+12 more)

### Community 36 - "Implementation Decisions"
Cohesion: 0.10
Nodes (20): Agent's Discretion, Architecture and Prior Decisions, Astro Configuration (already live), Canonical References, CI Verification Gates, Colour Palette & Theming, Deferred Ideas, Design System Governance (+12 more)

### Community 37 - "Auto-fixed issues"
Cohesion: 0.21
Nodes (10): StoryRow, STRIDE Threat Register, Trust Boundaries, Auto-fixed issues, Key Artifacts, Task 2: End-to-end curation pipeline orchestrator, IN-06: A brand-new cluster receives a second `updated_at` stamp immediately after creation, Notes on checks that passed (+2 more)

### Community 38 - "Phase 03: Curation Core: Clustering, Ranking & Enrichment - Research"
Cohesion: 0.10
Nodes (19): 1. Requirements & Scope Traceability, 2. Two-Gate Merge Pipeline & Anti-Merge Guards, 3. Broadsheet Trending Scoring & Recency Decay, 4. Hierarchical 4-Stage Section Resolver (D-13, D-14, CUR-14), 5. Curated Gazetteers & Taxonomy (D-15, D-16, CUR-12, CUR-15), 6. Administrative Cluster Split Workflow (D-18, D-19, CUR-02, CUR-03), 7. D1 Repository Purity & Schema Integration (OPS-14), 8. Validation Architecture (+11 more)

### Community 39 - "Warnings"
Cohesion: 0.12
Nodes (15): Warnings, WR-02: `pageMeta()` silently ignores `PageMetaInput.title`, WR-04: The OPS-01 ceiling scan does not cover `.jsonc`, the repository root, or `docs/` — and ADR 0005 claims it does, WR-06: The shard splitter and deploy script build destination paths from route-table strings with no containment check, WR-07: The splitter reports OK for a shard that contains no edition pages at all, WR-08: The route table's `global_surfaces` omits the global surfaces ADR 0001 names, WR-10: `billing-alerts.md` states that the R2 bucket is created by the lifecycle script — it is not, and nothing creates it, WR-11: The 365-day media clock lives in three places, contradicting ADR 0003's "one rule, one value, one place" (+7 more)

### Community 40 - "editions.ts"
Cohesion: 0.23
Nodes (13): SECTION_KEYWORDS, EditionLanguage, Section, SectionId, SECTIONS, SECTION_LEXICON_PRIORS, GENERATES_ENTITY_PAGE, AiSectionClassifier (+5 more)

### Community 41 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+10 more)

### Community 42 - "r2-lifecycle.mjs"
Cohesion: 0.17
Nodes (16): What I checked and found correct, WR-09: The R2 lifecycle reconcile is destructive-before-creative with no rollback, and a failed create skips the post-verification, Required Artifacts, after, assertNoInfrequentAccessFlags(), assertUsablePrefix(), before, createRule() (+8 more)

### Community 43 - "RawItem"
Cohesion: 0.13
Nodes (16): Artifacts Produced, Completed Tasks, Executive Overview, Plan 02-03: Feed Parsing, URL Canonicalization, Dual Identity & Normalization — Summary, Task 1: Multi-Dialect XML Feed Parser, Task 2: URL Canonicalization, Dual Identity & Media Enclosure Cascade, Task 3: Item Normalization with Backlog Capping & Timestamp Sanitization, Verification Results (+8 more)

### Community 44 - "MeridianEnv"
Cohesion: 0.19
Nodes (12): D1Binding, MeridianEnv, resolveDatabaseId(), createRepository(), REPO_ROOT, WRANGLER_PATH, fetch(), json() (+4 more)

### Community 45 - "Phase 1: Foundation, Free-Tier Contract & Architecture Decisions — Verification Report"
Cohesion: 0.13
Nodes (14): 1. The broadsheet shell on a live shard, 2. The R2 lifecycle rules in the dashboard, Anti-Patterns Found, Behavioral Spot-Checks, Every requirement ID claimed by a Phase 1 plan frontmatter, Gaps Summary, Goal Achievement, Human Verification Required (+6 more)

### Community 46 - "Repository"
Cohesion: 0.18
Nodes (11): Repository, STRIDE Threat Register, Tasks, Trust Boundaries, Deliverables & Status, Plan 02-01 Summary: Canonical Source Registry, Legal Gate, & Repository Synchronization, Verification Results, IngestRunOptions (+3 more)

### Community 47 - "schema.test.ts"
Cohesion: 0.20
Nodes (16): WR-03: `scripts/db/verify-swap.mjs` contains a literal NUL byte — git treats it as binary, and its guard can never fire, countInsertedTuples(), createdObjects(), DDL(), DDL_PATH, HERE, INDEXES(), migratedDatabase() (+8 more)

### Community 48 - "free-tier-limits.ts"
Cohesion: 0.12
Nodes (16): WR-05: The ceiling scan has an exponent-shaped blind spot that the repository already uses, decisionRuleSchema, DecisionTrigger, deriveEnforcedTokens(), FREE_TIER_LIMITS, FreeTierLimit, groupThousands(), limit() (+8 more)

### Community 49 - "repository.ts"
Cohesion: 0.17
Nodes (12): ClusterRow, ClusterScoreUpdate, COUNTABLE_TABLES, CountableTable, EditionRow, LshCandidateRow, SectionRow, StoryFingerprint (+4 more)

### Community 50 - "Phase 1 Plan 01: Repo Scaffold, Shared Contract and Astro Shell Summary"
Cohesion: 0.12
Nodes (15): Accomplishments, Auto-fixed Issues, Decisions Made, Deviations from Plan, Housekeeping outside the plan's task actions, Issues Encountered, Known Stubs, Next Phase Readiness (+7 more)

### Community 51 - "Info"
Cohesion: 0.12
Nodes (16): IN-01: `countSentences()` treats abbreviation periods as sentence boundaries, over-truncating excerpts, IN-03: `r2-lifecycle.mjs` is not wired to an npm script and has no dry-run mode, IN-04: `ALLOWED_PREFIXES` and the 7/365 constants are duplicated across both lifecycle scripts, IN-05: Two spike wrangler configs have a `$schema` path relative to the wrong directory, IN-06: `shared/templates/head.ts:53` — the `pageMeta` signature and its first statement share a line, IN-07: `shared/templates/__tests__/head.test.ts:199` — a doc comment is jammed onto the `describe(` line, IN-08: `package.json` pins `wrangler@4.151.3`; `research/STACK.md` records `4.151.2`, IN-09: The site-name scan misses `.sql` files and the repository root — ADR 0004's "exactly one source file in the whole repository" is false (+8 more)

### Community 52 - "deploy-all.mjs"
Cohesion: 0.12
Nodes (11): body, dryRun, failed, header, REPO_ROOT, results, ROUTE_TABLE_PATH, table (+3 more)

### Community 53 - "ADR 0002 — One D1 database, no edition sharding"
Cohesion: 0.13
Nodes (14): ADR 0002 — One D1 database, no edition sharding, Consequences, Context, Decision, Growth controls, Index amplification, Negative — accepted, Neutral (+6 more)

### Community 54 - "Consequences"
Cohesion: 0.13
Nodes (14): Accepted negative consequences, ADR 0004 — The domain, the name, and the canonical policy, Consequences, Context, Decision, Neutral, Phase 6 must plan Publisher Center as configuration, not as a gate, References (+6 more)

### Community 55 - "Phase 1 Plan 03: The Free-Tier Ceiling Registry and the Standing No-Spend Decision Summary"
Cohesion: 0.13
Nodes (14): Accomplishments, Auto-fixed Issues, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Known Stubs, Next Phase Readiness (+6 more)

### Community 56 - "Phase 1 Plan 06: The Five Architecture-Changing Spikes Summary"
Cohesion: 0.13
Nodes (14): Accomplishments, Auto-fixed Issues, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Known Stubs, Next Phase Readiness (+6 more)

### Community 57 - "Implementation Decisions"
Cohesion: 0.13
Nodes (14): Agent's Discretion, Architecture and Decisions, Canonical References, Excerpt Budget & Normalization Rules, Implementation Decisions, Ingest Worker Fetch & Scheduling, Local Development & Offline Fixtures, Media & Image Enclosure Extraction (+6 more)

### Community 58 - "image-permanence.ts"
Cohesion: 0.22
Nodes (13): Phase 1 owns the contract, Files Created/Modified, Next Phase Readiness, MEDIA_LIFETIME_DAYS, toStoredExcerpt(), hasMediaExpired(), MEDIA_LIFETIME_DAYS, MediaResolution (+5 more)

### Community 59 - "Decision"
Cohesion: 0.14
Nodes (13): Accepted negative consequences, ADR 0005 — The free tier is a permanent ceiling, and the project never spends, Consequences, Context, D-07 and D-08 — how the load is shed, D-09 — the one dependency that does not conform, D-18 — the accepted cost of the serve-time image check, Decision (+5 more)

### Community 60 - "Architecture: The Meridian"
Cohesion: 0.14
Nodes (13): Architecture: The Meridian, Build Order and Dependency Graph, Component Boundaries, D1 Model, Data Flow, Failure Modes and Handling, Free-Tier Budget, Routing Table (+5 more)

### Community 61 - "Warnings"
Cohesion: 0.14
Nodes (14): Warnings, WR-03: The CLI silently ignores unknown flags and accepts malformed ids, WR-04: The shared-anchor gate accepts ordinary news words, which is the main over-merge exposure, WR-05: The production merge path never supplies `outletAuthority`, so D-07's "prioritise by outlet authority" is dead code, WR-07: The LSH band probe is executed on every story despite a measured recall of zero, WR-09: `FixtureEmbeddingProvider` calls `require()` inside an ESM module, so it silently falls back to pseudo-embeddings everywhere except vitest, WR-10: `engines.node` says `>=20`, but `node:sqlite` requires Node >= 22.5, WR-11: The "SQL lives only in the repository" scan does not cover `src/` or `config/` (+6 more)

### Community 62 - "do.ts"
Cohesion: 0.30
Nodes (10): burnBlocks(), burnCpu(), BurnOutcome, BurnRequest, CpuBurner, elapsedAcrossYield(), readBurnRequest(), Env (+2 more)

### Community 63 - "shared/__tests__/purity.test.ts"
Cohesion: 0.22
Nodes (7): collectSharedFiles(), FORBIDDEN_IMPORTS, REPO_ROOT, SHARED_ROOT, SharedFile, sharedFiles, SKIPPED_DIRECTORIES

### Community 64 - "repository.test.ts"
Cohesion: 0.15
Nodes (7): ALLOWED_FILES, collectSourceFiles(), HERE, IGNORED_DIRECTORIES, REPO_ROOT, SCAN_EXTENSIONS, SCAN_ROOTS

### Community 65 - "Decision"
Cohesion: 0.14
Nodes (13): Accepted negative consequences, ADR 0003 — Image permanence: one 12-month clock and a silent typographic panel, Consequences, Context, D-15 — one clock, for everything, with no exemptions, D-16 — an expired image renders a silent typographic panel, D-17 — both mechanisms, not one, D-18 — the serve-time check costs one extra R2 Class B read per image view (+5 more)

### Community 66 - "types.ts"
Cohesion: 0.42
Nodes (11): Tasks, Files Created/Modified, EditionId, Cluster, EditionCluster, HreflangAlternate, PageMeta, PageMetaInput (+3 more)

### Community 67 - "excerpt-budget.test.ts"
Cohesion: 0.19
Nodes (10): Tasks, EXCERPT_BUDGET, EXCERPT_RESULT_SCHEMA, ExcerptBudgetError, ExcerptRejection, ExcerptResult, phrase(), sourceText() (+2 more)

### Community 68 - "parser.ts"
Cohesion: 0.24
Nodes (11): STRIDE Threat Register, Tasks, Trust Boundaries, fast-xml-parser, createXmlParser(), extractAtomLink(), extractAuthor(), extractText() (+3 more)

### Community 69 - "excerpt-pipeline.test.ts"
Cohesion: 0.17
Nodes (15): STRIDE Threat Register, Trust Boundaries, Task 1: HTML Tag Stripping, Script Removal, and Entity Decoding, Task 3: Excerpt Budget Integration into Normalizer & Ceiling Unit Assertions, BuildExcerptOptions, buildSanitizedExcerpt(), extractExcerptCandidate(), normalizeFeed() (+7 more)

### Community 70 - "Plan 03-05: Reversible Cluster Split, Dated Corrections & End-to-End Curation Pipeline — Summary"
Cohesion: 0.15
Nodes (12): Commits, Completed Tasks, Deviations from the Plan, Executive Overview, Findings Carried Forward, Plan 03-05: Reversible Cluster Split, Dated Corrections & End-to-End Curation Pipeline — Summary, Self-Check: PASSED, Structural decisions (+4 more)

### Community 71 - "Phase 3: Curation Core — Verification Report"
Cohesion: 0.15
Nodes (13): 1. Edition front pages with live feeds, 2. Story-page coverage line and byline, 3. Cross-outlet coverage in practice, Anti-Patterns Found, Behavioral Spot-Checks, Gaps Summary, Goal Achievement, Human Verification Required (+5 more)

### Community 72 - "results.test.ts"
Cohesion: 0.17
Nodes (10): ENFORCED_LIMIT_TOKENS, collectSpikeFiles(), relativePath(), REPO_ROOT, ROLLUP_PATH, scanForLimitLiterals(), SCANNED_EXTENSIONS, SKIPPED_DIRECTORIES (+2 more)

### Community 73 - "calculateTrendingScore"
Cohesion: 0.24
Nodes (8): STRIDE Threat Register, Trust Boundaries, WR-12: `clusters.score_updated_at` is never written by the curation pipeline, calculateAgeHours(), calculateTrendingScore(), ClusterScoreUpdate, evaluateEditorialRank(), TrendingScoreInput

### Community 74 - "splitCluster"
Cohesion: 0.23
Nodes (8): STRIDE Threat Register, Trust Boundaries, CR-03: The remote split is not transactional and can destroy the attribution row it exists to protect, CR-06: The split depends on `stories` rows that the design prunes after 30 days, so long-lag mis-merges can never be corrected, Critical Issues, WR-01: The split's new cluster gets no `edition_clusters` and no `cluster_sections` rows, so the separated report appears on no page, WR-02: The CLI's header claims a post-condition verification that does not exist, splitCluster()

### Community 75 - "Implementation Decisions"
Cohesion: 0.17
Nodes (11): Agent's Discretion, Architecture and Design, Canonical References, Implementation Decisions, Phase 3: Curation Core: Clustering, Ranking & Enrichment - Context, Phase Boundary, Requirements and Constraints, Section Classifier & Gazetteers (+3 more)

### Community 76 - "verify-lifecycle.mjs"
Cohesion: 0.14
Nodes (9): failures, FORBIDDEN_PREFIXES, REPO_ROOT, result, rules, WRANGLER_BIN, R2_EXPIRY_PREFIXES, R2_LIFECYCLE_RULES (+1 more)

### Community 77 - "Observed"
Cohesion: 0.17
Nodes (11): Decision, Method, Notes, Observed, Run 1 — from the Cloudflare edge, Run 2 — conditional GET, ETags replayed, Run 3 — repeat of run 1, S-2 — Worker egress vs publisher blocking (+3 more)

### Community 78 - "S-5 — does `wrangler deploy` re-upload unchanged assets?"
Cohesion: 0.17
Nodes (12): Decision, Method, Notes, Observed, Run A — 506 asset files, Run B — 5,006 asset files, S-5 — does `wrangler deploy` re-upload unchanged assets?, The deploy-step budget that feeds OPS-07 (+4 more)

### Community 79 - "worker/__tests__/purity.test.ts"
Cohesion: 0.18
Nodes (9): collectTsFiles(), CONFIG_TS, FORBIDDEN_PARSER_IMPORTS, REPO_ROOT, SKIPPED_DIRECTORIES, SourceFile, WORKER_ROOT, WORKER_SRC (+1 more)

### Community 80 - "split-cluster.ts"
Cohesion: 0.24
Nodes (10): buildBinding(), CliOptions, createLocalBinding(), createRemoteBinding(), findLocalDatabasePath(), HERE, invokedDirectly, main() (+2 more)

### Community 81 - "S-3 — CI egress comparison"
Cohesion: 0.20
Nodes (10): Decision, Method, Notes, Observed, Pass 1 — from the GitHub Actions runner, Pass 2 — conditional GET, ETags replayed, S-3 — CI egress comparison, Surprise 1 — the two egress paths reach exactly the same publishers (+2 more)

### Community 82 - "tagging.ts"
Cohesion: 0.36
Nodes (7): GAZETTEER_ENTITIES, GazetteerEntity, CountryCode, COUNTRY_TO_EDITION, ENGLISH_EDITIONS, MatchedGazetteerEntity, ModelEntityResult

### Community 83 - "Info"
Cohesion: 0.22
Nodes (8): IN-01: Multi-word entries in the noise-token sets can never match, IN-02: The aspect-marker guard has no Hindi counterpart for "tomorrow", IN-03: The cluster slug has a narrow collision space against a UNIQUE column, IN-04: `matchGazetteerEntities` ignores its language argument, IN-05: The CLI decides it was invoked directly with a substring match on `argv[1]`, Info, Phase 3: Code Review Report, Summary

### Community 84 - "Cloudflare billing alerts — configuration record"
Cohesion: 0.22
Nodes (8): Cloudflare billing alerts — configuration record, Confirm the R2 bucket, Recipients, until a domain exists, References, The exact dashboard path, The honest caveat, first, The metered quotas to alert on, What to check, and when

### Community 85 - "generate-benchmark-fixtures.ts"
Cohesion: 0.39
Nodes (8): BenchmarkHeadlinePair, combineVectors(), createBenchmarkPairs(), generateEmbeddings(), generateRandomUnitVector(), main(), sfc32(), stringToSeed()

### Community 86 - "RESULTS.md"
Cohesion: 0.22
Nodes (5): Decision, Method, Notes, S-1 — Durable Object CPU on Workers Free, The instrument had to be rebuilt once

### Community 87 - "S-4 — Astro build throughput"
Cohesion: 0.22
Nodes (8): Decision, How the incremental arm is proven, Method, Notes, S-4 — Astro build throughput, The instrument had to be repaired once, What this calibrates for Phase 5 and Phase 7, What this does NOT settle

### Community 88 - "processCurationPipeline"
Cohesion: 0.61
Nodes (5): CR-01: The merge candidate scan truncates before the "already clustered" filter, so the merge path collapses to zero past 200 rows in the window, CR-01 — The merge path collapses to zero past 200 rows in the window · **REPRODUCED**, Data-Flow Trace (Level 4), Key Link Verification, processCurationPipeline()

### Community 89 - "Phase 1 — Validation Strategy"
Cohesion: 0.25
Nodes (7): Manual-Only Verifications, Per-task Verification Map, Phase 1 — Validation Strategy, Sampling Rate, Test Infrastructure, Validation Sign-Off, Wave 0 Requirements

### Community 90 - "Deliverables & Key Changes"
Cohesion: 0.25
Nodes (7): 1. Broadsheet Trending Score & Recency Decay (`src/curation/ranking.ts`), 2. D1 Batch Score Persistence (`apps/worker/src/db/repository.ts`), 3. Unit & Integration Testing, Deliverables & Key Changes, Phase 3 Plan 03 Summary: Broadsheet Trending Score, Recency Decay & D1 Persistence, Threat Mitigations Applied, Verification Commands & Output

### Community 91 - "Spike results — the five architecture-changing measurements"
Cohesion: 0.25
Nodes (8): S-1 — Durable Object CPU on Workers Free, S-2 — Worker egress vs publisher blocking, S-3 — CI egress comparison, S-4 — Astro build throughput, S-5 — wrangler asset-upload diffing, Spike results — the five architecture-changing measurements, The rollup, What all five spikes say together

### Community 92 - "Phase 1 — Post-Planning Gap Analysis"
Cohesion: 0.29
Nodes (6): CONTEXT.md, Deferred items (excluded, not gaps), Phase 1 — Post-Planning Gap Analysis, Requirements also advanced by Phase 1 outside the phase's own four, REQUIREMENTS.md, Result

### Community 93 - "Phase 02 — Validation Strategy"
Cohesion: 0.29
Nodes (6): Manual-Only Verifications, Per-Task Verification Map, Phase 02 — Validation Strategy, Sampling Rate, Test Infrastructure, Wave 0 Requirements

### Community 94 - "Phase 03 — Validation Strategy"
Cohesion: 0.29
Nodes (6): Manual-Only Verifications, Per-Task Verification Map, Phase 03 — Validation Strategy, Sampling Rate, Test Infrastructure, Wave 0 Requirements

### Community 95 - "taxonomy.ts"
Cohesion: 0.43
Nodes (6): CountryTag, Entity, TaxonomyKind, TaxonomyMethod, TaxonomyTag, Topic

### Community 96 - "Phase 1 Plan 04: R2 Lifecycle Rules, the Eight-Project Static Shard and the Delivery-Model ADR Summary"
Cohesion: 0.15
Nodes (12): Accomplishments, Decisions Made, Files Created/Modified, Issues Encountered, Known Stubs, Next Phase Readiness, Performance, Phase 1 Plan 04: R2 Lifecycle Rules, the Eight-Project Static Shard and the Delivery-Model ADR Summary (+4 more)

### Community 97 - "ref_node_url"
Cohesion: 0.33
Nodes (4): __dirname, __filename, FIXTURES_DIR, MockRouteConfig

### Community 98 - "Observed"
Cohesion: 0.33
Nodes (6): Observed, The heavy page set — 20,001 pages, The incremental build was measured three times because it surprised us, The incremental cache works, and it does not buy time, The light page set — 20,001 pages, What the two arms say together

### Community 99 - "site/tsconfig.json"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ../../tsconfig.json

### Community 100 - "gsd_init.sh"
Cohesion: 0.80
Nodes (4): _gsd_at(), _gsd_homes(), gsd_run(), gsd_init.sh script

### Community 101 - "Phase 01: Code Review Report"
Cohesion: 0.40
Nodes (4): CR-01: The 30-day `stories` prune is structurally impossible — four `NO ACTION` foreign keys block every delete, Critical Issues, Phase 01: Code Review Report, Summary

### Community 102 - "Plan 02-04: Hard Excerpt Budget Integration & Language Segmentation — Summary"
Cohesion: 0.33
Nodes (5): Artifacts Produced & Modified, Completed Tasks, Executive Overview, Plan 02-04: Hard Excerpt Budget Integration & Language Segmentation — Summary, Verification Results

### Community 103 - "Observed"
Cohesion: 0.40
Nodes (5): Observed, The account is on the Workers Free plan, The Durable Object's CPU allowance, The plain Worker's CPU allowance (control arm), Which documented number reality matches

### Community 104 - "01-03-PLAN.md"
Cohesion: 0.50
Nodes (3): STRIDE Threat Register, Tasks, Trust Boundaries

### Community 105 - "01-04-PLAN.md"
Cohesion: 0.50
Nodes (3): STRIDE Threat Register, Tasks, Trust Boundaries

### Community 106 - "01-06-PLAN.md"
Cohesion: 0.50
Nodes (3): STRIDE Threat Register, Tasks, Trust Boundaries

### Community 107 - "02-05-PLAN.md"
Cohesion: 0.50
Nodes (3): STRIDE Threat Register, Tasks, Trust Boundaries

### Community 108 - "S-5 — the raw measurement record"
Cohesion: 0.50
Nodes (3): Run 1 — 506 asset files, Run 2 — 5006 asset files, S-5 — the raw measurement record

### Community 115 - "Auto-fixed Issues"
Cohesion: 0.18
Nodes (8): SourceRow, Auto-fixed Issues, Deviations from Plan, Housekeeping outside the plan's task actions, Next Phase Readiness, WR-12: `listActiveSources()` does not enforce `terms_status = 'verified'` — the documented hard legal gate has no enforcement, WR-13: `listActiveSources()` omits `last_fetched_at` and `freshness_sla_hours`, so the "which sources are due?" hot path cannot be computed, WR-15: `/api/db/tables` is an unauthenticated, unrate-limited D1-querying endpoint on a project permanently committed to a hard free-tier ceiling

### Community 120 - "generate.mjs"
Cohesion: 0.29
Nodes (10): buildScratch(), cacheEvidence(), defaultPageCount(), flag(), main(), REGISTRY_PATH, renderEvidence(), REPO_ROOT (+2 more)

### Community 121 - "countFiles"
Cohesion: 0.40
Nodes (5): Auto-fixed Issues, Deviations from Plan, Housekeeping outside the plan's task actions, IN-02: `countFiles()` ignores symlinks, so the per-shard ceiling can be undercounted, countFiles()

## Knowledge Gaps
- **32 isolated node(s):** `../../tsconfig.json`, `tailwindcss`, `@cloudflare/workers-types`, `@types/node`, `tsx` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 911 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `pipeline.ts`, `fetcher/index.ts`, `package.json`, `site.test.ts`, `d1-harness.ts`, `excerpt-budget.ts`, `shards.test.ts`, `run-local.ts`, `normalizer.ts`, `free-tier-limits.test.ts`, `editions.ts`, `MeridianEnv`, `schema.test.ts`, `image-permanence.ts`, `shared/__tests__/purity.test.ts`, `repository.test.ts`, `excerpt-budget.test.ts`, `excerpt-pipeline.test.ts`, `results.test.ts`, `calculateTrendingScore`, `worker/__tests__/purity.test.ts`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Repository` (e.g. with `Tasks` and `Deliverables & Status`) actually correct?**
  _`Repository` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../../tsconfig.json`, `tailwindcss`, `@cloudflare/workers-types` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05328005328005328 - nodes in this community are weakly interconnected._
- **Why does `RawItem` connect `RawItem` to `types.ts`, `parser.ts`, `excerpt-pipeline.test.ts`, `Plan 02-04: Hard Excerpt Budget Integration & Language Segmentation — Summary`, `editions.ts`, `Implementation Decisions`, `Phase 02 Research: Feed Acquisition, Raw Capture & Normalization`, `Implementation Decisions`, `Architecture: The Meridian`, `run-local.ts`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `processCurationPipeline()` (e.g. with `03-05-PLAN.md` and `Executive Overview`) actually correct?**
  _`processCurationPipeline()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Should `fetcher/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05369369369369369 - nodes in this community are weakly interconnected._