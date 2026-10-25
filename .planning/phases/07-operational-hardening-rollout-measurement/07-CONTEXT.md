# Phase 7 Context: Operational Hardening, Rollout & Measurement

**Date:** 2026-10-25
**Goal:** The daily paper survives feed deaths, build failures and its own growth; health is measured rather than assumed.

## Current State

Phase 6 complete:
- 171 pages built
- 415 tests passing
- Typecheck clean
- Digest engine with deterministic template
- Trust layer (8 MDX pages)
- SEO infrastructure (sitemaps, robots, hreflang, schema.org)
- pageMeta() single source of truth

## Phase 7 Requirements (from REQUIREMENTS.md)

### Build Assertions (OPS-05, OPS-06, OPS-08, OPS-11, OPS-13)
- [ ] **OPS-05**: Build fails when any edition has <8 stories, any section has <3 stories, or one outlet supplies >35% of a front page
- [ ] **OPS-06**: Build fails when story count falls outside 60-140% of trailing 7-day mean
- [ ] **OPS-08**: A failed build leaves previously published edition live
- [ ] **OPS-11**: Story pages pre-rendered to HTML, stored in R2, served by edge Worker with cache headers and validator
- [ ] **OPS-13**: Build reads dataset from single compressed snapshot, never opens datastore binding

### Operational Workers (OPS-02, OPS-03, OPS-15, OPS-16, OPS-17, OPS-18)
- [ ] **OPS-02**: Daily audit Worker reads datastore usage log, reports metrics as percentage of ceiling
- [ ] **OPS-03**: Alerts fire at 50% and 75% of each budgeted resource
- [ ] **OPS-15**: Raw item rows pruned 30 days after merge window closes; cluster outlet list/headline/URL retained permanently
- [ ] **OPS-16**: Build-in-progress guard prevents overlapping builds
- [ ] **OPS-17**: Edge routing fails open — quota exhaustion degrades site rather than serving error
- [ ] **OPS-18**: Site never returns 5xx or 429 to Googlebot

### Measurement & Growth (OPS-19, OPS-20, OPS-21, GRO-01 to GRO-09, GRO-10)
- [ ] **OPS-19**: New pages published at 50-500/day rate, tracked daily
- [ ] **OPS-20**: Index rate tracked weekly, target 60% indexed by week 8
- [ ] **OPS-21**: Search Console manual actions report reviewed weekly
- [ ] **GRO-01**: Reader can subscribe to daily digest for one edition
- [ ] **GRO-02**: Subscriber receives one email per day for their edition
- [ ] **GRO-03**: Newsletter send volume monitored against provider daily cap; overflow policy before 250 subscribers
- [ ] **GRO-04**: Newsletter signup form submits server-side; API key never reaches browser
- [ ] **GRO-05**: Newsletter signup form sits outside critical rendering path
- [ ] **GRO-06**: Each edition shows live weather for country centroid + major cities; visible "as of" timestamp and provider attribution
- [ ] **GRO-07**: Weather fetch failure never fails build; last cached forecast served or panel omitted
- [ ] **GRO-08**: Traffic measured with Cloudflare Web Analytics and Google Search Console
- [ ] **GRO-09**: Custom domain reachable via 301 redirects from build subdomain; sitemap and hreflang re-verified after migration
- [ ] **GRO-10**: Domain name and homepage title contain no language they are not written in

### User Affordances (OPS-22, OPS-23)
- [ ] **OPS-22**: Reader can flag a source from any story page; flagged content enters review queue without publishing
- [ ] **OPS-23**: Reader can report factual error on story; report enters corrections queue producing dated correction note

## Grey Area Decisions

| Area | Proposal | Rationale |
|------|----------|-----------|
| **Build assertions** | Hard-fail in CI, not warn | Per OPS-05 spec; build must fail |
| **Audit Worker** | Cloudflare Worker cron trigger | Uses existing free-tier ceiling registry |
| **Newsletter** | Brevo API, server-side submission | No client-side API key exposure |
| **Weather** | Open-Meteo API, cached per build | Never fails build, shows "as of" timestamp |
| **Build-in-progress guard** | R2 lock file or D1 row | Prevents overlapping builds |

## Open Questions

None — spec is clear from ROADMAP.md requirements.

## References

- `.planning/ROADMAP.md` — Phase 7 success criteria
- `.planning/REQUIREMENTS.md` — OPS-02–23, GRO-01–10
- `apps/site/src/lib/page-data.ts` — existing page data layer
- `apps/site/src/pages/story/[slug]/index.astro` — existing story router
