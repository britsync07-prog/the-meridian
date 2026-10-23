# Phase 3 Gap Closure — Session Handoff

**Generated:** 2026-10-23T15:20Z
**Phase:** 03 — Curation Core: Clustering, Ranking & Enrichment
**Status:** Gap plans 03-06, 03-07, 03-08 exist; none executed yet. Execution in progress.
**Next command:** `/gsd-autonomous --from 3`

## Current State

Phase 3 verification shows **6 blockers + CUR-11 topic gap**. Three gap-closure plans were written:

| Plan | Wave | Blockers Addressed | Status |
|------|------|--------------------|--------|
| 03-06 | 4 | CR-01 (candidate query ordering), CR-04 (acronym matching), CR-02/CUR-05 (shared-anchor/gazetteer), CUR-06 (benchmark baseline), CUR-12 (case-sensitive acronyms), CUR-15 (generic news noun stop list) | **Not executed** |
| 03-07 | 5 | CR-03 (split transactionality), CR-06 (prune-safe split), CUR-11 (audit columns method+confidence) | Not executed |
| 03-08 | 6 | CUR-11 (topic lexicon + matcher), CUR-13 (language-aware in-hi routing) | Not executed |

## What Was Read Before Pause

For plan 03-06 execution, these files were read to understand current code:

- `apps/worker/src/db/repository.ts` — findLshCandidates (L652-668), findRecentCandidateStories (L943-957)
- `src/curation/guards.ts` — shared-anchor guard (L89-98)
- `src/curation/tagging.ts` — buildEntityRegex (L62-76), matchGazetteerEntities (L83-118)
- `config/stoplist.ts` — current GENERIC_NOISE_TOKENS (does not include generic news nouns)

## Key Defects to Fix (from VERIFICATION.md)

### CR-01: Merge path collapses past 200 rows
- **Root:** `findRecentCandidateStories` (L956) and `findLshCandidates` (L667) use `ORDER BY published_at DESC LIMIT ?` — newest-first, no `cluster_id > 0` predicate in SQL. The `cluster_id` filter is applied in JS AFTER the LIMIT.
- **Fix:** Move `cluster_id > 0` into SQL predicate, order ASC (oldest-first, nearest incoming story first).

### CR-04: "WHO" matches lowercase "who"
- **Root:** `buildEntityRegex` in `tagging.ts` L71-76 checks `name.length <= 2 && name === name.toUpperCase()` — only 2-char acronyms get case-sensitive matching. "WHO" is 3 chars, falls through to case-insensitive.
- **Fix:** Change acronym detection to test token shape (all letters uppercase, any length) instead of string length.

### CR-05: `in-hi` edition unreachable
- **Root:** `COUNTRY_TO_EDITION` maps `IN -> 'in'`; `ENGLISH_EDITIONS` omits `'in-hi'`. No language dimension in routing.
- **Fix:** Route by story language — Hindi stories go to `in-hi`, English stories from India go to `in`.

### CR-02: Benchmark measures wrong configuration
- **Root:** `merge-benchmark.test.ts` injects hand-authored `entitiesA`/`entitiesB`; pipeline uses `matchGazetteerEntities`.
- **Fix:** Benchmark must derive entities via `matchGazetteerEntities`, record measured precision/recall floor in `merge-baseline.json`.

### CR-03: Split destroys attribution on remote failure
- **Root:** `recordClusterSplit` uses DELETE+INSERT (non-atomic on D1). Must use UPDATE.

### CR-06: Split fails after 30-day prune
- **Root:** Split requires `stories` row; design prunes those after 30 days. Split must drive from `story_sources` alone.

### CUR-11: Topics never attached
- **Root:** No topic lexicon exists; pipeline passes `[]` for topic ids. Need topic matcher + lexicon.

### CUR-15: No topic lexicon
- **Root:** `config/lexicon.ts` exports only `SECTION_KEYWORDS`. Need bilingual topic lexicon.

## Execution Order

Plans must execute sequentially due to dependencies:
1. **03-06** (Wave 4) — candidate queries + guards + benchmark
2. **03-07** (Wave 5) — split fixes + schema migration (depends on 03-06)
3. **03-08** (Wave 6) — topic lexicon + routing (depends on 03-07 for audit columns)

## Files to Read Before Resuming

Before continuing, read these to re-establish context:
1. `apps/worker/src/db/repository.ts` lines 646-670 and 943-960
2. `src/curation/guards.ts` lines 85-100
3. `src/curation/tagging.ts` lines 60-120
4. `config/stoplist.ts` full file
5. `tests/curation/merge-benchmark.test.ts` full file
6. `.planning/phases/03-curation-core-clustering-ranking-enrichment/03-06-PLAN.md`

## Test Commands

```bash
# Run curation tests
npm test -- --run tests/curation/

# Run all tests
npm test -- --run

# Typecheck
npm run typecheck

# Run specific test file
npx vitest run tests/curation/curation-pipeline.test.ts
```

## Resume Command

```
/gsd-autonomous --from 3
```

Or execute plans directly:
```
/gsd-execute-phase 3 --wave 4
/gsd-execute-phase 3 --wave 5
/gsd-execute-phase 3 --wave 6
```
