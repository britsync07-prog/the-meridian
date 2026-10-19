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
Status: Ready to plan
Last activity: 2026-10-20 — Roadmap created; 141/141 v1 requirements mapped to exactly one phase; 7 research spikes assigned.

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
- **D1:** one database (`meridian.db`) behind a single repository module, database id as a config value. No edition sharding.
- **Canonical model:** self-referential canonicals only, never cross-domain. One canonical story page per cluster at `/story/{slug}/`, edition-agnostic. Publisher URLs are normal followed links with `rel="noopener"`.
- **hreflang:** only between India English and India Hindi. All seven editions use locale path prefixes on **one hostname** — never subdomains.
- **Excerpt budget:** ≤50 words / ≤320 chars / ≤2 sentences / ≤30% of source visible text; quoted verbatim or omitted, never paraphrased; sources under 160 words publish no excerpt.
- **Free tier is the design constraint.** Workers Paid ($5/mo) is a pre-agreed decision point (traffic ≈4,000/day, >20,000 static files, or revenue), not an open question.
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
- **[Phase 1]** The domain is not yet acquired. Launch-blocking for Search Console verification, Publisher Center URL verification and meaningful ranking.
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

Last session: 2026-10-20
Stopped at: Roadmap created — `.planning/ROADMAP.md`, `.planning/STATE.md` and the REQUIREMENTS.md traceability table written. Next action: `/gsd-plan-phase 1`.
Resume file: None
