---
phase: "03"
slug: "curation-core-clustering-ranking-enrichment"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.5 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && npm run db:verify:local && npm run r2:lifecycle:verify` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run && npm run db:verify:local && npm run r2:lifecycle:verify`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CUR-01, CUR-15 | — | Computes deterministic SimHash-64 with 4x16-bit bands | unit | `npm test -- --run tests/curation/simhash.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CUR-04, CUR-05 | T-03-01 | Blocks disjoint entities, ordinal/round conflicts, and >24h differences | unit | `npm test -- --run tests/curation/guards.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | CUR-06 | T-03-02 | Precision >= 98% and Recall >= 85% on 200-pair benchmark | benchmark | `npm test -- --run tests/curation/merge-benchmark.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | CUR-01, OPS-14 | — | LSH candidate lookup uses D1 indexes without full table scan | unit | `npm test -- --run apps/worker/src/db/__tests__/repository.test.ts` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | CUR-07, CUR-10 | — | 18h half-life recency decay and multi-outlet weighting | unit | `npm test -- --run tests/curation/ranking.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | CUR-10 | — | Single-outlet cluster excluded from Editor's Picks (rank is null) | unit | `npm test -- --run tests/curation/ranking.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | CUR-14 | — | 4-stage cascade section resolver maps to 8 broadsheet desks | unit | `npm test -- --run tests/curation/sections.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | CUR-12, CUR-15 | T-03-03 | Model entities never create landing-page eligible rows | unit | `npm test -- --run tests/curation/tagging.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-03 | 04 | 2 | CUR-13 | — | Correctly tags cross-country edition flags | unit | `npm test -- --run tests/curation/tagging.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 3 | CUR-02, CUR-03 | T-03-04 | Detaches story, writes D1 correction, and preserves outlet sources | integration | `npm test -- --run tests/curation/split.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 3 | CUR-01..15, CON-15 | — | Full pipeline: raw unclustered stories -> clustered, enriched, scored | integration | `npm test -- --run tests/curation/curation-pipeline.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/curation/headline-pairs.json` — 200–300 hand-labelled pairs (same-event, different-event, related-but-distinct)
- [ ] `tests/fixtures/curation/headline-embeddings.json` — Pre-computed mock vectors for BGE-M3 test execution
- [ ] `config/gazetteer.ts` — Curated bilingual entity gazetteer
- [ ] `config/lexicon.ts` — Section scoring keywords across English and Hindi
- [ ] `config/stoplist.ts` — Generic breaking news tokens and stop words

---

## Manual-Only Verifications

| Requirement | Behavior | Verification Procedure | Why Not Automated |
|-------------|----------|------------------------|-------------------|
| CUR-01 | Live Workers AI @cf/baai/bge-m3 latency | Run live staging embedding batch against Cloudflare Workers AI | Requires live Cloudflare network and credentials |
