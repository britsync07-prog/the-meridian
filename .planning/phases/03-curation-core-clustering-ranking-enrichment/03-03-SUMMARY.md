---
phase: 03-curation-core-clustering-ranking-enrichment
plan: "03"
status: complete
completed_at: 2026-10-21T14:20:00Z
commit_hashes:
  - 2cfd684 # feat(curation): implement broadsheet trending score and Editor's Picks gate (CUR-07, CUR-10)
  - 7abaf06 # feat(db): implement batchUpdateTrendingScores in repository (D-12, OPS-14)
files_modified:
  - src/curation/ranking.ts
  - tests/curation/ranking.test.ts
  - apps/worker/src/db/repository.ts
  - apps/worker/src/db/__tests__/repository.test.ts
---

# Phase 3 Plan 03 Summary: Broadsheet Trending Score, Recency Decay & D1 Persistence

Implemented the canonical broadsheet trending score algorithm with 18-hour half-life exponential recency decay, multi-outlet weighting, Editor's Picks qualification gating, and batch D1 persistence encapsulated in `repository.ts`.

## Deliverables & Key Changes

### 1. Broadsheet Trending Score & Recency Decay (`src/curation/ranking.ts`)
- **Canonical Formula (D-09):**
  $$\text{trending\_score} = 3.0 \cdot \log_2(1 + \text{outlets}) + 1.0 \cdot \log_2(1 + \text{mentions}) + 5.0 \cdot 0.5^{(\text{age\_hours} / 18.0)} + 0.8 \cdot \min(1, \max(0, \text{sections} - 1))$$
- **18-Hour Half-Life Decay (CUR-07):** Evaluates exact exponential decay: $5.0$ at 0h, $2.5$ at 18h, $1.25$ at 36h, and $0.3125$ at 72h.
- **Multi-Outlet Weighting (CUR-07):** Outlets weighted $3\times$ higher than duplicate mentions ($3.0 \cdot \log_2(1 + \text{outlets})$ vs $1.0 \cdot \log_2(1 + \text{mentions})$), heavily prioritizing cross-outlet consensus over single-outlet feed flooding.
- **Section Diversity Bonus:** Awards $0.8$ points for stories that span 2 or more news desks.
- **Editor's Picks Gate (CUR-10, D-10):** `evaluateEditorialRank` unconditionally returns `null` for single-outlet clusters (`distinctOutlets < 2`), strictly reserving broadsheet lead slots and editor picks for stories confirmed across $\ge 2$ distinct publishers.

### 2. D1 Batch Score Persistence (`apps/worker/src/db/repository.ts`)
- Added `ClusterScoreUpdate` interface and `batchUpdateTrendingScores(scoreUpdates: readonly ClusterScoreUpdate[]): Promise<void>`.
- Chunks updates into batches of 50 statements per transaction to stay within D1 execution thresholds and avoid query timeouts (T-03-09).
- Fully parameter-bound statements updating `trending_score`, `editorial_rank`, and `score_updated_at` where `id = ?`.
- Preserved zero-SQL purity: zero SQL leaks outside `apps/worker/src/db/repository.ts`.

### 3. Unit & Integration Testing
- `tests/curation/ranking.test.ts`: 10/10 tests passing covering exact decay half-lives, multi-outlet vs single-outlet score comparisons, section bonuses, and editorial rank filtering.
- `apps/worker/src/db/__tests__/repository.test.ts`: 17/17 tests passing including chunked execution (55 updates split into 50 + 5 batches), empty array edge case, and architectural SQL purity checks.
- Full workspace test suite: 29 test files, 287 tests passing.
- Full TypeScript check: 0 errors with `npm run typecheck`.

## Verification Commands & Output

- `npm test -- --run tests/curation/ranking.test.ts`:
  ```
  ✓ tests/curation/ranking.test.ts (10 tests) 53ms
  Test Files  1 passed (1)
  Tests  10 passed (10)
  ```
- `npm test -- --run apps/worker/src/db/__tests__/repository.test.ts`:
  ```
  ✓ apps/worker/src/db/__tests__/repository.test.ts (17 tests) 43ms
  Test Files  1 passed (1)
  Tests  17 passed (17)
  ```
- `npm run typecheck`:
  ```
  tsc --noEmit (Exit code 0)
  ```
- `npm test -- --run`:
  ```
  Test Files  29 passed (29)
  Tests  287 passed (287)
  ```

## Threat Mitigations Applied
- **T-03-07 (Publisher feed spam gaming score):** Mitigated via $1.0 \cdot \log_2(1 + \text{mentions})$ sub-linear scaling against $3.0 \cdot \log_2(1 + \text{outlets})$ multiplier.
- **T-03-08 (Single-outlet unverified claim promoted):** Mitigated by strict gate `distinct_outlets >= 2` returning `editorial_rank = null`.
- **T-03-09 (D1 query timeout during recalculation):** Mitigated by 50-item chunked statement batching via `db.batch()`.
