---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-01-PLAN.md
last_updated: "2026-10-20T15:41:21.015Z"
last_activity: 2026-10-20 -- 01-01 complete (repo scaffold, shared contract, Astro shell)
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 6
  completed_plans: 1
  percent: 17
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-20, after research synthesis — 25 corrections applied)
Architecture of record: `.planning/research/SUMMARY.md` (authoritative) and `.planning/research/ARCHITECTURE.md`

**Core value:** Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.
**Current focus:** Phase 01 — Foundation, Free-Tier Contract & Architecture Decisions (plan 01-01 of 01-06 complete)
**Success target:** 1,000+ daily visitors and 10,000+ indexed pages within six months of launch.

## Current Position

Phase: 01 (foundation-free-tier-contract-architecture-decisions) — EXECUTING
Plan: 2 of 6
Status: Executing Phase 01 — plan 01-01 complete
Last activity: 2026-10-20 -- 01-01 complete (repo scaffold, shared contract, Astro shell)

Progress: [██░░░░░░░░] 17%

## Phase Sequence

| # | Phase | Depends on | Req count |
|---|-------|-----------|-----------|
| 1 | Foundation, Free-Tier Contract & Architecture Decisions | — | 4 |
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

- Total plans completed: 1 · Average duration: 21min · Total execution time: 21min
- By phase: Phase 01 — 1 plan, 21min
- Recent trend: — (last 5 plans: 01-01, 21min)

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
- **D1:** one database (`meridian.db`) behind a single repository module, database id as a config value. No edition sharding.
- **Canonical model:** self-referential canonicals only, never cross-domain. One canonical story page per cluster at `/story/{slug}/`, edition-agnostic. Publisher URLs are normal followed links with `rel="noopener"`.
- **hreflang:** only between India English and India Hindi. All seven editions use locale path prefixes on **one hostname** — never subdomains.
- **Excerpt budget:** ≤50 words / ≤320 chars / ≤2 sentences / ≤30% of source visible text; quoted verbatim or omitted, never paraphrased; sources under 160 words publish no excerpt. **Coded as a contract in Phase 1** (`shared/contract/excerpt-budget.ts`); the normaliser and its full unit test land in Phase 2.
- **No human editor:** the daily digest defaults to a deterministic template; every automated surface carries a visible disclosure. The original-articles programme is deferred to v2 (V2-EDT-01) rather than faked.
- [Phase 01]: The GitHub repository is britsync07-prog/the-meridian - public, under a personal account, named for the locked site name (D-02, D-03, D-12).
- [Phase 01]: The shared contract is a plain directory imported by RELATIVE path only. The @shared/* TypeScript alias exists for tsc and the editor, never for a bundler - edge alias resolution is the least predictable part of the Workers build.
- [Phase 01]: DSN-12 is proven, not merely configured: the built HTML keeps the space between two inline elements, and a second Astro build ran in 1.7s against 10.6s, proving build.concurrency 1 and experimental.incrementalBuild are both in force.

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

- **Phase 01, remaining 5 plans** (01-02 → 01-06). Plan 01-01 delivered the repository scaffold, the shared contract layer and the Astro 7 shell configuration; the D1 schema, the free-tier ceiling registry, the R2 lifecycle rules and the eight-project shard, the excerpt budget and the five spikes are still outstanding.
- **`shared/` is the contract for every later phase.** `shared/types.ts` holds the story schema, `shared/config/site.ts` the publication name, `shared/config/editions.ts` the eight editions and sections. Neither may be redefined downstream.

### Phase 01 Progress

| Plan | Scope | Status | Summary |
|------|-------|--------|---------|
| 01-01 | Repo scaffold, shared contract layer, Astro 7 shell | ✅ Complete | `01-01-SUMMARY.md` |
| 01-02 | D1 schema, seed, single repository module | Pending | — |
| 01-03 | Free-tier ceiling registry and the no-spend rule | Pending | — |
| 01-04 | R2 lifecycle, eight-project shard, delivery-model ADR | Pending | — |
| 01-05 | Excerpt budget, shared templates, image and domain ADRs | Pending | — |
| 01-06 | Spikes S-1 through S-5 | Pending | — |

**Note on SEO-13 and DSN-12 (marked complete by plan 01-01).** DSN-12 is fully delivered: `compressHTML: true` is set and a built-HTML assertion proves the spacing survives. SEO-13 is complete on the *configuration* half — the site name now exists in exactly one place, `shared/config/site.ts`, and a repository-wide scan fails if a second copy appears. The `<news:name>` **emission** remains Phase 6's work and must read from that same value so the two cannot diverge.

### Blockers/Concerns

- **[Phase 3]** The merge thresholds (Jaccard 0.55 / Hamming 12 / stop list / aspect markers) are reasoned from literature, not from this corpus. Unvalidated until S-7 lands a measured precision/recall number. Bias toward not merging.
- **[Phase 1]** The domain is not yet acquired, and that is now a decision rather than a gap: D-10 defers the purchase until the site earns revenue and D-11 accepts the consequence. It is still launch-blocking for Search Console verification, Publisher Center URL verification and meaningful ranking — but Phase 1's job is to record that constraint, not to resolve it.
- **[Phase 6]** Hindi digest quality on the free tier is unverified (S-6). The deterministic template stays the default until a model passes.
- **[Phase 6]** `news:name` is the single highest-impact string in the project — it must exactly match the name on news.google.com. Fix it once in one config value before configuring Publisher Center.
- **[Phase 7]** Brevo's free allowance (300/day vs 5,000/month) must be re-verified at Phase 7 planning, and the overflow policy decided before 250 subscribers.

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

Last session: 2026-10-20T15:40:28.629Z
Stopped at: Completed 01-01-PLAN.md
Resume file: None
