# Plan 03-01: SimHash-64 Fingerprinting, LSH Bands & Anti-Merge Guards — Summary

**Execution Status:** Complete  
**Phase:** 03 (Curation Core: Clustering, Ranking & Enrichment)  
**Plan:** 01  
**Requirements Addressed:** CUR-01, CUR-04, CUR-05, CUR-15, D-02, D-03, D-05, D-06  

---

## Executive Overview

Plan 03-01 delivered the algorithmic foundation of The Meridian's deduplication and clustering pipeline:
1. **Headline Tokenization & Noise Filtering:** Unicode-aware segmentation stripping generic breaking-news noise tokens ("breaking", "update", "latest", "live", "watch", "video", "news", "exclusive", "report") and stop words across English and native Hindi Devanagari (CUR-01, CUR-15, D-06).
2. **Deterministic SimHash-64 Fingerprinting:** 64-bit BigInt generation using 64-bit FNV-1a token hashing and 64 accumulator weights (CUR-01).
3. **4x16-bit LSH Band Partitioning:** Splits the 64-bit SimHash into 4 unsigned 16-bit integers (`band0` bits 48..63, `band1` bits 32..47, `band2` bits 16..31, `band3` bits 0..15) aligning directly with D1 database indexes `idx_stories_band0..3` (CUR-01).
4. **Exact Bitwise Hamming Distance:** Popcount distance evaluator using XOR and bit-clearing logic.
5. **Comprehensive Anti-Merge Guards:** Five strict defensive gates enforcing "when in doubt, do not merge":
   - Time window guard (diff ≤ 24h, CUR-04, D-05)
   - Disjoint-entity guard (unconditional block if recognized entity sets are disjoint, CUR-05, D-02)
   - Shared entity / distinctive token guard (shared entity or shared token > 5 chars, CUR-04)
   - Round / ordinal conflict guard (blocks "Day 1" vs "Day 2", "Part 1" vs "Part 2", "Round 1" vs "Quarter-final", D-03)
   - Temporal aspect-marker conflict guard (blocks "morning" vs "evening", "Friday" vs "Saturday", "today" vs "yesterday", D-03)

---

## Completed Tasks

### Task 1: Generic Stoplist, SimHash-64 Fingerprinting, and 4x16-bit LSH Bands
- **Created `config/stoplist.ts`:**
  - Exported `GENERIC_NOISE_TOKENS_EN` and `GENERIC_NOISE_TOKENS_HI` containing generic breaking-news prefixes and common journalistic noise words.
  - Exported `STOP_WORDS_EN` and `STOP_WORDS_HI` for token normalization.
  - Exported composite `STOPLIST` mapping both languages with helper functions `isNoiseToken` and `isStopWord`.
- **Created `src/curation/simhash.ts`:**
  - Implemented `tokenizeHeadline`: Strips generic prefixes, segments words via `Intl.Segmenter` for English and Hindi, strips boundary punctuation while preserving Unicode combining marks (Devanagari matras, halants), and filters noise/stop tokens.
  - Implemented `fnv1a64`: Deterministic 64-bit FNV-1a hash primitive operating over UTF-8 bytes.
  - Implemented `computeSimHash`: Constructs 64-bit BigInt from 64-bit accumulator weights and extracts `band0..3` as unsigned 16-bit integers (0..65535).
  - Implemented `computeHammingDistance`: Evaluates bitwise distance via XOR and popcount.
- **Created `tests/curation/simhash.test.ts`:**
  - 13 comprehensive unit tests validating tokenization, noise stripping in English and Hindi, deterministic 64-bit hashing, 4-band reconstruction, and Hamming distances.
- **Git Commit:** `2c98ec8` - `feat(curation): implement stoplist, SimHash-64 fingerprinting, and 4x16-bit LSH bands (CUR-01, CUR-15)`

### Task 2: Comprehensive Anti-Merge Guards
- **Created `src/curation/guards.ts`:**
  - `checkTimeWindow`: Validates publication timestamps do not exceed 24 hours.
  - `checkDisjointEntities`: Unconditionally rejects merges if both candidate stories have recognized entities and their intersection is empty (CUR-05).
  - `checkSharedEntityOrStrongToken`: Verifies stories share either a recognized entity or at least one distinctive token (> 5 characters, non-stoplist) before similarity evaluation (CUR-04).
  - `checkOrdinalAndRoundConflict`: Regex and semantic categorization detecting conflicting days ("Day 1" vs "Day 2"), parts ("Part 1" vs "Part 2"), stages, games, legs, tests, and tournament rounds ("Round 1" vs "Quarter-final").
  - `checkAspectMarkerConflict`: Validates mutual exclusivity across temporal dimensions: times of day ("morning" vs "evening"), days of week ("Friday" vs "Saturday"), and relative days ("today" vs "yesterday").
  - `evaluateAntiMergeGuards`: Orchestrates defensive checks in sequence, returning typed `{ allowed, reason, details }`.
- **Created `tests/curation/guards.test.ts`:**
  - 25 unit tests exercising each guard in isolation and in orchestrated candidate evaluation across English and Hindi events.
- **Git Commit:** `f857f03` - `feat(curation): implement anti-merge guards for entities, ordinals, and time windows (CUR-04, CUR-05)`

---

## Verification & Test Results

- Automated test run:
  - `npm test -- --run tests/curation/simhash.test.ts`: 13 / 13 passed (100%).
  - `npm test -- --run tests/curation/guards.test.ts`: 25 / 25 passed (100%).
  - `npm test -- --run`: All 26 test suites passed (261 tests total).
  - `npm run typecheck`: TypeScript compilation passed with zero errors.

---

## Key Artifacts & Interfaces

- `config/stoplist.ts`
- `src/curation/simhash.ts`
- `src/curation/guards.ts`
- `tests/curation/simhash.test.ts`
- `tests/curation/guards.test.ts`
