---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 1 planned — ready to execute
last_updated: "2026-10-20T14:37:50.316Z"
last_activity: 2026-10-20 -- Phase 1 planning complete
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 6
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-20, after research synthesis — 25 corrections applied)
Architecture of record: `.planning/research/SUMMARY.md` (authoritative) and `.planning/research/ARCHITECTURE.md`

**Core value:** Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.
**Current focus:** Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
**Success target:** 1,000+ daily visitors and 10,000+ indexed pages within six months of launch.

## Current Position

Phase: 1 of 7 (Foundation, Free-Tier Contract & Architecture Decisions)
Plan: 0 of TBD in current phase
Status: Ready to execute
Last activity: 2026-10-20 -- Phase 1 planning complete

Progress: [░░░░░░░░░░] 0%

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

- Total plans completed: 0 · Average duration: — · Total execution time: —
- By phase: — (no plans executed yet)
- Recent trend: — (last 5 plans: none)

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

None yet.

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

Last session: 2026-10-20T13:04:48.130Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md
