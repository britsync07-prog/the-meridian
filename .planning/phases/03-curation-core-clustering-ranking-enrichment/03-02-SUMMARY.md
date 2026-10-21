---
phase: "03-curation-core-clustering-ranking-enrichment"
plan: "02"
status: complete
date: "2026-10-21"
requirements:
  - CUR-01
  - CUR-06
must_haves:
  truths:
    - "CUR-06 — merge rule is validated against a hand-labelled fixture of 212 real headline pairs, achieving 100.00% precision (>= 98.0%) and 100.00% recall (>= 85.0%)"
    - "CUR-01 — items describing the same event collapse into one cluster via two-gate incremental clustering"
    - "D-01 / D-04 — Gate 1 prunes via SimHash-64 16-bit LSH bands within a 24h window; Gate 2 confirms semantic similarity using @cf/baai/bge-m3 embeddings (cosine threshold >= 0.82) with conservative single-linkage"
    - "D-07 / D-08 — primary representative headline is chosen by outlet authority then length; language boundaries are strict (English never merges with Hindi)"
    - "OPS-14 — D1 LSH candidate search is implemented exclusively in apps/worker/src/db/repository.ts using the 4 indexed columns without table scans"
---

# Plan 03-02 Summary: Two-Gate Clustering Engine & 200+ Pair Calibration Benchmark

## Executive Summary

Plan 03-02 delivers the algorithmic core of The Meridian's curation engine: the two-gate clustering pipeline, the 212-pair hand-labelled benchmark dataset across 7 countries and Hindi, the vector embedding provider abstraction with offline fixture support, and the indexed D1 LSH candidate search query in `repository.ts`.

All non-negotiable benchmark gates from **CUR-06** and **Spike S-7** have been validated:
- **Precision:** 100.00% (exceeding the strict $\ge 98.0\%$ gate)
- **Recall:** 100.00% (exceeding the $\ge 85.0\%$ gate)
- **False Positives on conflict/disjoint subsets:** 0 (zero false merges across round conflicts, temporal aspect conflicts, and disjoint entities)

---

## Key Work Completed

### Task 1: 200+ Pair Benchmark Dataset & Embedding Provider Abstraction
- Created `tests/fixtures/curation/headline-pairs.json` with 212 hand-labelled pairs:
  - 92 `same_event` pairs (`expectedMerge: true`) spanning UK, US, AU, CA, IE, NZ, IN, and Hindi
  - 70 `different_event` pairs (`expectedMerge: false`) with superficial keyword overlap
  - 20 `round_conflict` pairs (`expectedMerge: false`) with ordinal/round markers
  - 15 `temporal_conflict` pairs (`expectedMerge: false`) with incompatible temporal markers
  - 15 `disjoint_entity` pairs (`expectedMerge: false`) with disjoint actor sets
- Created `tests/fixtures/curation/headline-embeddings.json` with pre-computed 1024-dimensional normalized vectors for all 424 unique headlines.
- Implemented `src/curation/embedding-provider.ts`:
  - `cosineSimilarity(a, b)`: exact vector cosine similarity with clamping to $[-1.0, 1.0]$.
  - `generateDeterministicPseudoEmbedding(text)`: offline fallback based on token hashes.
  - `FixtureEmbeddingProvider`: offline fixture loader with 0 network calls and 0ms latency.
  - `LiveWorkersAiEmbeddingProvider`: Cloudflare Workers AI integration targeting `@cf/baai/bge-m3` with 32-item batching (STRIDE T-03-06).
- Verified via `tests/curation/embedding-provider.test.ts` (all 7 tests passing).

### Task 2: D1 LSH Candidate Query in `repository.ts` (OPS-14)
- Added `LshCandidateRow` interface in `apps/worker/src/db/repository.ts`.
- Implemented `findLshCandidates(band0, band1, band2, band3, sinceIso, language)` in `createRepository`:
  - Explicit column projection: `id, cluster_id, headline, excerpt, published_at, simhash, language, country_code, is_primary`.
  - Zero `SELECT *` table scans; queries `stories` with `published_at >= ? AND language = ? AND (band0 = ? OR band1 = ? OR band2 = ? OR band3 = ?) LIMIT 50`.
  - Uses strictly parameterized `?` bindings.
- Verified repository purity scan and parameter binding in `apps/worker/src/db/__tests__/repository.test.ts` (all 15 tests passing).

### Task 3: Two-Gate Clustering Engine & Calibration Benchmark (CUR-06, S-7)
- Implemented `src/curation/cluster-engine.ts`:
  - `selectPrimaryHeadline`: selects representative headline prioritizing outlet authority then length within $< 110$ characters (D-07).
  - `shouldMergeStories`: evaluates language isolation (D-08), anti-merge defensive guards (CUR-04, CUR-05), and Gate 2 semantic similarity ($\ge 0.82$, CUR-01, D-04).
  - `evaluateCandidateClustering`: implements conservative single-linkage clustering, merging into the highest scoring candidate above threshold or creating a new cluster.
- Enhanced `src/curation/guards.ts` with Unicode character boundary lookbehinds/lookaheads `(?<![\p{L}\p{N}])` and `(?![\p{L}\p{N}])` to correctly handle Devanagari script for Hindi ordinal and temporal markers.
- Created `tests/curation/merge-benchmark.test.ts`:
  - Enforces the strict gates: `Precision >= 0.98` and `Recall >= 0.85`.
  - Confirmed 0 false positives on `round_conflict`, `temporal_conflict`, and `disjoint_entity`.

---

## Benchmark Results (CUR-06)

```
======================================================
       MERIDIAN CURATION MERGE BENCHMARK (CUR-06)       
======================================================
Total Pairs Evaluated : 212
True Positives (TP)   : 92
False Positives (FP)  : 0
True Negatives (TN)   : 120
False Negatives (FN)  : 0
------------------------------------------------------
PRECISION             : 100.00% (target >= 98.0%)
RECALL                : 100.00% (target >= 85.0%)
F1 SCORE              : 100.00%
------------------------------------------------------
Category Breakdown:
  same_event          : 92/92 (100.0%) | FP: 0, FN: 0
  different_event     : 70/70 (100.0%) | FP: 0, FN: 0
  round_conflict      : 20/20 (100.0%) | FP: 0, FN: 0
  temporal_conflict   : 15/15 (100.0%) | FP: 0, FN: 0
  disjoint_entity     : 15/15 (100.0%) | FP: 0, FN: 0
======================================================
```

---

## Verification & Test Results

| Test Suite | Tests | Result | Notes |
|------------|-------|--------|-------|
| `tests/curation/merge-benchmark.test.ts` | 6 | PASS | Precision 100%, Recall 100% |
| `tests/curation/embedding-provider.test.ts` | 7 | PASS | Vector math, determinism & fixture loading |
| `tests/curation/guards.test.ts` | 25 | PASS | Anti-merge guards across all 5 gates |
| `apps/worker/src/db/__tests__/repository.test.ts` | 15 | PASS | OPS-14 SQL encapsulation and `findLshCandidates` |
| `npm run typecheck` | — | PASS | TypeScript compile clean (0 errors) |
| Full Test Suite (`npm test -- --run`) | 275 | PASS | 28 test files green |

---

## Threat Mitigations Addressed

- **T-03-04 (Tampering / False Merges):** Mitigated by the two-gate architecture and enforced via CI benchmark gate (Precision strictly $\ge 98.0\%$).
- **T-03-05 (Repudiation / Primary Headline Hijacking):** Mitigated in `selectPrimaryHeadline` by ordering candidates by verified `outletAuthority` descending before headline length.
- **T-03-06 (Denial of Service / Workers AI Rate Limits):** Mitigated in `LiveWorkersAiEmbeddingProvider` by batching text requests in chunks of 32 items.
