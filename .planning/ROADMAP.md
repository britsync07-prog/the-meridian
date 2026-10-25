# Roadmap: The Meridian

## Overview

The Meridian is a free, automatically-curated daily news portal publishing one broadsheet edition for each of seven countries (UK, US, Australia, Canada, Ireland, New Zealand, India, plus a parallel Hindi edition) from a single hostname. This roadmap takes it from an undecided architecture to a live, measured, indexed daily paper. The journey runs along two tracks that are deliberately separated: **Track A (the pipeline)** is strictly sequential and carries the project's single largest quality risk, the cross-outlet merge rule, while **Track B (the design system and Astro shell)** is the longest iteration pole and starts in parallel from Phase 1 because it has no dependency on ingest logic. The delivery model is fixed: a fetch-only Cloudflare Worker captures raw feed bytes to R2, CI does all transformation and building, D1 is the system of record behind one repository module, the static tier holds only editions/sections/archives/topics/entities/support files, and story pages are pre-rendered to R2 and served by an edge Worker. There is no human editor: the daily digest defaults to a deterministic template and every automated surface carries a visible disclosure. The original-articles programme is deferred to v2 rather than faked.

**Success target:** 1,000+ daily visitors and 10,000+ indexed pages within six months of launch.

**Non-negotiable architecture rules and the phase that implements each:**

| Rule | Requirement | Implemented in |
|------|-------------|----------------|
| One hostname for all editions; locale path prefixes, never subdomains | PUB-12 | Phase 5 (decided and recorded in the Phase 1 delivery-model ADR) |
| Self-referential canonicals only; never a cross-domain canonical | CON-09 | Phase 6 (decided in the Phase 1 canonical ADR; enforced by the Phase 6 metadata function) |
| hreflang only between India English and India Hindi | SEO-10 | Phase 6 |
| Build assertions fail the build, never warn | CON-07, OPS-05, OPS-06, OPS-07 | Phase 5 (story-page gate) and Phase 7 (full assertion suite) |

## Phases

- [ ] **Phase 1: Foundation, Free-Tier Contract & Architecture Decisions** - Lock the delivery model, the data contract and the free-tier budget, and run the five architecture-changing spikes before any feature code is written.
- [ ] **Phase 2: Feed Acquisition, Raw Capture & Normalization** - Fetch publisher feeds politely, capture raw bytes to R2, and normalize to canonical story items under a hard, tested excerpt budget.
- [ ] **Phase 3: Curation Core: Clustering, Ranking & Enrichment** - Collapse the same event into one multi-outlet entry, rank it by coverage and recency, and tag it for editions, sections, topics and entities, calibrated against a labelled fixture.
- [ ] **Phase 4: Broadsheet Design System & Astro Shell** - Build the paper's visual language, accessibility baseline and Astro shell; independent of ingest and running in parallel from Phase 1.
- [ ] **Phase 5: Publication Surface: Editions, Story Tier & Media** - Publish seven front pages, 56 section pages, archives, topic and entity pages, and one permanent story URL per story, with locally served images.
- [ ] **Phase 6: Digest, Trust Layer & SEO/Discovery** - Give every edition original prose and an honest trust layer, and make the whole site technically compliant, discoverable and Google-News eligible.
- [ ] **Phase 7: Operational Hardening, Rollout & Measurement** - Survive feed deaths, build failures and quota exhaustion; measure crawl health and growth instead of assuming them.

**Phase execution order:** 1 to 2 to 3 to 4 to 5 to 6 to 7, with **Phase 4 executed in parallel with Phases 2 and 3** and with the Phase 6 MDX trust layer started as soon as the Phase 4 shell exists. Phases 2 and 3 are strictly sequential: the merge rule cannot be calibrated before real feeds are flowing.

## Parallel Workstreams

These are **not phases**. They run alongside the phase sequence and must not be scheduled as if they were.

| Workstream | Starts | Ends | Notes |
|------------|--------|------|-------|
| **Domain acquisition** | Phase 1 | Before launch | Launch-blocking for Search Console verification, Publisher Center URL verification and meaningful ranking, but it has **no code dependency**. Everything else builds on the `workers.dev` subdomain and migrates later via 301 redirects (GRO-09, Phase 7). |
| **Track B: design system and Astro shell** | Phase 1 | Phase 5 | Fully independent of ingest logic. Starting it late is the most common way a project like this misses its window. **Phase 4 must not be sequenced after Phase 3.** |
| **Track E: taxonomy and lexicon curation** | Phase 1 | Continuous | The source registry, section lexicons, country gazetteers and entity gazetteers are content work, not code work. Start with a 30-outlet, 8-section, 7-country lexicon and grow it. It must never become a blocker for the pipeline. |
| **Track C: trust-layer MDX** | Phase 4 | Phase 6 | Repo-native MDX, reviewable in pull requests, publishable as soon as the Phase 4 routing and layout exist. |

## Research Spikes

Seven spikes are concrete work items, not research topics. Each has an owner phase, a budget and a decision it unblocks. Outcomes are recorded in `.planning/research/`.

| ID | Spike | Budget | Executed in | Gates | Decision rule / what is recorded |
|----|-------|--------|-------------|-------|-------------------------------|
| **S-1** | Durable Object CPU on Workers Free. Burn about 2 s of CPU in a loop; does it die at 10 ms (`Error 1102`) or reach 30 s? | 30 min | Phase 1 | **Phase 2** | If it survives, the DO becomes the ingest engine (SQLite-backed, no R2 raw staging) and the architecture simplifies materially. If it dies, the fetch-only Worker to R2 to CI default is confirmed. Either way the default builds. |
| **S-2** | Worker egress vs publisher blocking. Conditional GET of 10 real target feeds from a Worker with a descriptive UA and contact URL. | 30 min | Phase 1 | **Phase 2** | Record HTTP status, latency and any 403/429 for all 10. Confirms the fetch path and calibrates the per-host backoff policy. |
| **S-3** | CI egress comparison. The same 10 feeds from a GitHub Actions runner. | 15 min | Phase 1 | **Phase 2** | If 30% or more of publishers block the CI IP range, the Worker is definitively the only fetch path. This spike detects a surprise; it does not reopen the decision. |
| **S-4** | Astro build throughput. Synthetic 20,000-page build. | 60 min | Phase 1 | **Phase 5** | Measures pages per second and full-build duration. If the rate is below roughly 60 pages per second, topic and entity pages move to the R2 tier before year 2. |
| **S-5** | wrangler asset-upload diffing. Does it re-upload unchanged assets on every deploy? | 30 min | Phase 1 | **Phase 5** | Determines per-deploy upload time and rate-limit risk. Feeds the deploy-step budget assertion (OPS-07). |
| **S-6** | Hindi digest bake-off. `llama-3.1-8b-instruct` vs `gemma-sea-lion-v4-27b-it` vs the deterministic template on 20 real Hindi story sets. | 90 min | Phase 6 (entry gate) | **Phase 6** digest and Hindi edition | The **deterministic template digest remains the default** until a model passes. The template also respects the no-machine-translation constraint because it composes native Hindi headlines with no translation step. |
| **S-7** | Merge-gate calibration. Hand-label 200 or more real headline pairs, tune thresholds, measure LSH recall. | 2-3 days | Phase 3 (during) | **Phase 3** curation release | Produces a **measured precision and recall number**, not a vibe. The failure modes are asymmetric: under-merging degrades quality, over-merging destroys the core promise, so the bias is toward not merging. Re-label monthly. |

> **Resolution of a source conflict:** `research/SUMMARY.md` lists S-4 and S-5 as Phase 1 spikes while the phase gate for them is Phase 5. Both are satisfied by executing them in Phase 1 (they are cheap and decision-changing, and the file-cap decision in Phase 1 depends on S-4) and recording them as gates on Phase 5. S-1, S-2 and S-3 all gate Phase 2.

## Milestone Archive

## Progress

**Execution order:** 1 to 2 to 3 to 4 to 5 to 6 to 7, with Phase 4 executed in parallel with Phases 2 and 3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Free-Tier Contract & Architecture Decisions | 6/6 | Complete | 2026-10-21 |
| 2. Feed Acquisition, Raw Capture & Normalization | 5/5 | In Progress | - |
| 3. Curation Core: Clustering, Ranking & Enrichment | 5/5 | Complete | 2026-10-22 |
| 4. Broadsheet Design System & Astro Shell | 5/5 | Complete | 2026-10-24 |
| 5. Publication Surface: Editions, Story Tier & Media | 0/TBD | Not started | - |
| 6. Digest, Trust Layer & SEO/Discovery | 0/TBD | Complete | 2026-10-25 |
| 7. Operational Hardening, Rollout & Measurement | 0/TBD | Not started | - |

## Requirement Coverage

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | OPS-01, OPS-04, OPS-14, MED-08 | 4 |
| 2 | ING-01, ING-02, ING-03, ING-04, ING-06, ING-07, ING-08, ING-09, ING-10, CON-01, CON-02, CON-03, CON-04, CON-05 | 14 |
| 3 | CUR-01, CUR-02, CUR-03, CUR-04, CUR-05, CUR-06, CUR-07, CUR-10, CUR-11, CUR-12, CUR-13, CUR-14, CUR-15, CON-15 | 14 |
| 4 | DSN-01 to DSN-13 | 13 |
| 5 | PUB-01 to PUB-18, MED-01 to MED-07, MED-09, CUR-08, CUR-09, CON-06, CON-07, CON-08, CON-10, OPS-09, OPS-10, OPS-11, OPS-12, OPS-13 | 37 |
| 6 | CON-09, CON-11, CON-12, CON-13, CON-14, SEO-01 to SEO-18, TRS-01 to TRS-10, ING-05, GRO-10 | 35 |
| 7 | OPS-02, OPS-03, OPS-05, OPS-06, OPS-07, OPS-08, OPS-15, OPS-16, OPS-17, OPS-18, OPS-19, OPS-20, OPS-21, OPS-22, OPS-23, GRO-01 to GRO-09 | 24 |
| **Total** | | **141 / 141** |

---

*Roadmap created: 2026-10-20, derived from `.planning/REQUIREMENTS.md` (141 v1 requirements) and `.planning/research/SUMMARY.md` (authoritative architecture).*


## Milestone Status

| Phase | Status | Commit |
|-------|--------|--------|
| 1-7 | ✅ Complete | 7265c60 |

Milestone v1.0 archived to 
*Composed: 2026-10-25*