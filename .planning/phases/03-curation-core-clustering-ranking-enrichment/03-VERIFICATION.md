---
phase: 03-curation-core-clustering-ranking-enrichment
verified: 2026-10-22T06:48:21Z
status: gaps_found
score: 5/14 requirement IDs verified (1/5 roadmap success criteria verified)
roadmap_success_criteria: 1/5 verified
blockers: 6
warnings: 9
info: 4
overrides_applied: 0
gaps:
  - truth: "CUR-01 / SC-2 — Items describing the same event collapse into one cluster listing every outlet that covered it"
    status: failed
    severity: BLOCKER
    reason: "The merge candidate scan truncates to the NEWEST 200 raw `stories` rows while the pipeline processes the OLDEST unclustered rows, and the `cluster_id > 0` filter is applied in JS AFTER the SQL LIMIT. Reproduced with a controlled A/B: identical fixture and outlets, only the filler-row count differs. Window=60 rows -> 19 two-outlet clusters. Window=540 rows -> 0 two-outlet clusters, 0 merges. The project's own ingest cap (25 items x 30 seeded sources = 750 raw rows/day) breaks the merge path on day one."
    artifacts:
      - path: "apps/worker/src/db/repository.ts"
        issue: "L921-940 `findRecentCandidateStories` — `ORDER BY published_at DESC LIMIT ?` with no `cluster_id` predicate; L646-667 `findLshCandidates` has the identical newest-first shape."
      - path: "src/curation/pipeline.ts"
        issue: "L116 `listUnclusteredStories` returns the OLDEST rows; L158-162 scans the NEWEST 200; L168 filters `cluster_id <= 0` in JS after the LIMIT."
    missing:
      - "Move `cluster_id > 0` into the SQL predicate and order the candidate scan ASC (rows nearest the incoming story first) in both `findRecentCandidateStories` and `findLshCandidates`."
      - "A regression test that seeds more than 200 rows in the merge window and asserts same-event pairs still merge. The current fixtures are all under 20 rows, so the suite cannot catch this."

  - truth: "CUR-06 / SC-1 — The merge rule is validated against a hand-labelled fixture with Precision >= 98% and Recall >= 85%, and the measured numbers are recorded"
    status: failed
    severity: BLOCKER
    reason: "The benchmark injects the fixture's hand-authored `entitiesA`/`entitiesB`; the pipeline derives entities from `config/gazetteer.ts`. Re-running the identical benchmark with gazetteer-derived entities gives precision 97.40% and recall 81.52% — BOTH gates fail — and 2 `disjoint_entity` pairs merge. Gazetteer coverage measured independently: 101/424 headline occurrences (23.8%) and 62/496 declared entity mentions (12.5%). No recorded precision/recall floor artifact exists in the repository."
    artifacts:
      - path: "tests/curation/merge-benchmark.test.ts"
        issue: "L181/L187 — `entities: pair.entitiesA` / `pair.entitiesB` (hand-authored), never `matchGazetteerEntities`. Reports a vacuous 100%/100%."
      - path: "src/curation/pipeline.ts"
        issue: "L127-134/L183 — `entitiesFor()` uses `matchGazetteerEntities`, i.e. a different input than the benchmark measures."
      - path: "config/gazetteer.ts"
        issue: "59 entries; matches 23.8% of the fixture's headline occurrences and knows 12.5% of its declared entity mentions."
    missing:
      - "Derive the entity sets inside the benchmark with `matchGazetteerEntities` (or add a second parallel gate on the gazetteer configuration) and re-baseline the thresholds against the shipped configuration."
      - "Fix the precision and recall failures that re-baselining exposes (gazetteer coverage, shared-anchor weakness, acronym false positives)."
      - "Record the measured precision/recall as a checked-in floor artifact so a threshold change below the floor is rejected."

  - truth: "CUR-05 / CUR-04 / SC-3 — Two items whose entity sets are disjoint are never merged"
    status: failed
    severity: BLOCKER
    reason: "Under the production (gazetteer) entity configuration, two `disjoint_entity` pairs merge — the one thing the phase says must never happen. The shared-anchor gate accepts any shared token longer than five characters that is not in the stoplist, and the English stoplist contains no generic news nouns, so `premier`, `minister`, `police`, `government` all qualify as a 'distinctive token'."
    artifacts:
      - path: "src/curation/guards.ts"
        issue: "L89-98 — a shared token > 5 characters that survives the stoplist satisfies the shared-anchor gate."
      - path: "config/stoplist.ts"
        issue: "No nationality / office / common-noun list in the English stoplist."
    missing:
      - "Add a generic news noun list to `config/stoplist.ts`, or raise the shared-anchor bar to a real gazetteer entity match when the gazetteer recognises one."
      - "Re-baseline the merge benchmark after the change."

  - truth: "CUR-02 / SC-2 — Cluster membership is stored per contributing item so any merge can be split without losing the outlet list"
    status: failed
    severity: BLOCKER
    reason: "Membership IS stored per contributing item (`stories.cluster_id` + `story_sources`), but the split that consumes it is unsafe in production. `recordClusterSplit` moves the attribution row with DELETE + INSERT; the remote D1 binding executes each statement as its own transaction (D1's query API rejects explicit BEGIN/COMMIT — verified against the live database), so a failure between them permanently destroys the outlet's headline and attribution URL. Reproduced: after an injected failure on the INSERT, the target story's attribution row is on neither the old nor the new cluster, and an orphan empty cluster is left behind."
    artifacts:
      - path: "apps/worker/src/db/repository.ts"
        issue: "L1238-1302 — `DELETE FROM story_sources` then `INSERT INTO story_sources` inside `db.batch`; L1210-1230 the new-cluster INSERT is outside the batch entirely."
      - path: "scripts/curation/split-cluster.ts"
        issue: "L221-230 — the remote `batch` is a sequence of transactions, each its own commit."
    missing:
      - "Replace the destructive DELETE+INSERT with `UPDATE story_sources SET cluster_id = ? WHERE cluster_id = ? AND story_id = ?` so no state exists in which the attribution row is absent, and make the split idempotent under re-run."
      - "Execute the split as one transaction on the remote path (D1's query API cannot; the split needs a different execution route)."

  - truth: "CUR-02 / SC-2 — A wrongly merged cluster can be split at all (reversibility)"
    status: failed
    severity: BLOCKER
    reason: "The split requires the `stories` row, but the design prunes raw mention rows 30 days after the merge window closes. Reproduced: after the prune, `splitCluster` throws 'Story 1 not found.' — the long-lag mis-merge that most needs correcting can never be separated. The prune is also impossible as designed: with foreign keys ON (production D1 enforces them — verified against the live database) `DELETE FROM stories` is refused with 'FOREIGN KEY constraint failed', because `story_sources.story_id` is `NOT NULL REFERENCES stories(id)` with NO ACTION. This is the same Phase 1 foreign-key blocker, still open."
    artifacts:
      - path: "src/curation/split.ts"
        issue: "L42-44 states the design intent ('the attribution list is what survives') and then L63-66 requires the `stories` row, throwing 'Story N not found.' when it is gone."
      - path: "shared/db/0001_init.sql"
        issue: "L192-193 — `story_sources.story_id INTEGER NOT NULL REFERENCES stories(id)` with NO ACTION, so the 30-day prune cannot run against 100% of rows."
    missing:
      - "Drive the split from `story_sources` alone (`INSERT ... SELECT` from the old attribution row) and make the `stories` update conditional on the row still existing."
      - "Reconcile `story_sources.story_id` with the 30-day prune (nullable `story_id`, or NO ACTION -> SET NULL with the attribution kept in `source_id`/`headline`/`url`). This is the open Phase 1 foreign-key blocker and it gates the split."

  - truth: "CUR-13 / PUB-18 — The `in-hi` edition can receive a cluster"
    status: failed
    severity: BLOCKER
    reason: "The edition-flagging mechanism cannot emit `in-hi` at all. `COUNTRY_TO_EDITION` maps `IN -> 'in'` and `ENGLISH_EDITIONS` omits `'in-hi'`; nothing else constructs an `EditionFlag`. Reproduced: a Hindi story from a Hindi publisher yields exactly one flag — `{editionId: 'in', reason: 'source'}` — and the pipeline writes 0 `edition_clusters` rows for `in-hi`. The Hindi edition's front page is empty forever and its Devanagari stories are pushed onto the ENGLISH India front page. `in-hi` IS seeded and `amar-ujala` IS seeded with language 'hi', so the product promise is live but unreachable."
    artifacts:
      - path: "src/curation/tagging.ts"
        issue: "L34-52 — `COUNTRY_TO_EDITION` and `ENGLISH_EDITIONS` contain no `in-hi`; the routing is by outlet country only, never by the story's language."
      - path: "src/curation/pipeline.ts"
        issue: "L230-234 — `outletCountries: [story.country_code]` with no language dimension."
      - path: "shared/db/seed.sql"
        issue: "L46 seeds `('in-hi', 'India (Hindi)', 'IN', 'hi', ...)`; L150 seeds `amar-ujala` with language 'hi'."
    missing:
      - "Route by the story's language: a Hindi-language story belongs in `in-hi` and in no English edition; an English-language story from an Indian outlet belongs in `in`."
      - "A test asserting a Hindi story lands in `in-hi` and in no English edition."

  - truth: "CUR-11 / SC-5 — Every cluster carries topics and named entities, and each tagging decision records the method and confidence used"
    status: failed
    severity: BLOCKER
    reason: "The topic half is not implemented at all. Reproduced: after a full pipeline run, `story_entities` = 1 row, `story_topics` = 0 rows, `topics` table = 0 rows. `config/lexicon.ts` exports only `SECTION_KEYWORDS` — there is no topic matcher anywhere in `src/curation/` or `config/`, and the pipeline passes an empty topic-id array with the comment 'topic ids: the topic taxonomy lands in a later tagging pass'. No later phase covers it. Separately, `story_entities` and `story_topics` have no method/confidence columns (only `weight`), so the audit trail the requirement names exists for sections and editions but not for entity or topic tagging."
    artifacts:
      - path: "src/curation/pipeline.ts"
        issue: "L365 — `[]` for topic ids; L104-112 — `syncTaxonomyAndEntities([], GAZETTEER_ENTITIES...)` seeds zero topics."
      - path: "config/lexicon.ts"
        issue: "Header claims 'Weighted section and topic lexicons'; only `SECTION_KEYWORDS` is exported."
      - path: "shared/db/0001_init.sql"
        issue: "L233-248 — `story_topics` and `story_entities` carry `weight` but no `method` / `confidence` columns."
    missing:
      - "A topic matcher and a topic lexicon, wired through `syncTaxonomyAndEntities` and `assignClusterTaxonomy`."
      - "`method` and `confidence` columns on `story_topics` / `story_entities` (or a per-decision audit table) so CUR-11's audit clause is satisfied for tagging, not only for sections."

  - truth: "CUR-15 — The system ships a topic lexicon, an entity gazetteer, and a generic-token stop list per country, in English and Devanagari"
    status: failed
    severity: BLOCKER
    reason: "Two of the three artefacts exist and are bilingual; the topic lexicon does not exist. `config/gazetteer.ts` covers GB/US/AU/CA/IE/NZ/IN plus supranational bodies with English canonical names, Devanagari `hindiName`s and Devanagari aliases. `config/stoplist.ts` ships English and Hindi noise-token and stop-word sets. `config/lexicon.ts` ships SECTION_KEYWORDS only — no topic lexicon at all. The stop list is global, not per-country."
    artifacts:
      - path: "config/lexicon.ts"
        issue: "No topic lexicon export."
    missing:
      - "A bilingual (English + Devanagari) topic lexicon, and a per-country dimension on the stop list if 'per country' is read literally."

  - truth: "CR-04 — The gazetteer matches the World Health Organization only when the text actually says 'WHO'"
    status: failed
    severity: BLOCKER
    reason: "`buildEntityRegex` applies the case-sensitive acronym rule only to names of two characters or fewer, so the three-character alias 'WHO' falls through to the case-insensitive branch and becomes /\\bWHO\\b/i. Reproduced: `matchGazetteerEntities('Who will win the election?')` -> ['world-health-organization']; same for 'Man who led the charge tells his story'. Because the entity is `isSupranational: true`, `determineEditionFlags` then flags that headline onto all SEVEN English editions at confidence 0.85 — reproduced flags: [uk, us, au, ca, ie, nz, in]. The same defect applies to the other multi-character all-caps aliases (NATO, NASA, NHS, IMF, ECB, ISRO)."
    artifacts:
      - path: "src/curation/tagging.ts"
        issue: "L71-76 — `if (name.length <= 2 && name === name.toUpperCase())`."
      - path: "config/gazetteer.ts"
        issue: "The `world-health-organization` entry's aliases include 'WHO'."
    missing:
      - "Make the acronym rule depend on the shape of the name (an all-caps token of any length), and apply the same rule to aliases."
      - "A regression test asserting 'who', 'Who', 'whom' and 'insurance' do not match, and 'WHO' / 'World Health Organization' do."

  - truth: "WR-01 — The split's new cluster is reachable from the edition and section pages"
    status: failed
    severity: WARNING
    reason: "Reproduced: after a split, the old cluster has 1 `edition_clusters` row and 1 `cluster_sections` row; the new cluster has 0 and 0. The correction note tells the reader 'The coverage has been separated into its own report', but that report is on no front page and no section page — it is reachable only by URL."
    artifacts:
      - path: "apps/worker/src/db/repository.ts"
        issue: "L1210-1302 — the new cluster is inserted and the attribution moved, but no `edition_clusters` or `cluster_sections` rows are written for it."
    missing:
      - "Copy the old cluster's `edition_clusters` and `cluster_sections` rows onto the new cluster in the same transaction."

  - truth: "WR-04 — The shared-anchor gate requires a non-generic entity, not an ordinary news word"
    status: failed
    severity: WARNING
    reason: "This is the mechanism behind the two `disjoint_entity` false positives: the two provincial-premier stories share only the token `premier`, and their embeddings are close enough at 0.82. The requirement's own wording is 'a shared non-generic entity'; a shared common noun is not that."
    artifacts:
      - path: "src/curation/guards.ts"
        issue: "L89-98."
      - path: "config/stoplist.ts"
        issue: "No generic news noun list."
    missing:
      - "A generic news noun list, or a requirement that the shared anchor be a recognised entity."

  - truth: "WR-05 / D-07 — The primary representative headline is chosen by outlet authority, then length"
    status: failed
    severity: WARNING
    reason: "`selectPrimaryHeadline` sorts by `outletAuthority ?? 0` first, but both production call sites pass `{ headline }` only, so every authority is 0 and the selection degenerates to 'the longest headline under 110 characters' — the opposite of the crisp broadsheet headline the function's own comment describes. The source registry carries no authority column, so there is no source for the value."
    artifacts:
      - path: "src/curation/cluster-engine.ts"
        issue: "L52-80 — `outletAuthority ?? 0`."
      - path: "src/curation/pipeline.ts"
        issue: "L268-270 — `selectPrimaryHeadline(members.map((m) => ({ headline: m.headline })))`."
      - path: "src/curation/split.ts"
        issue: "L107-109 — same."
    missing:
      - "An authority value in the source registry, joined through `story_sources`, or removal of the parameter and a matching change to the documented rule."

  - truth: "WR-08 — Embedding cost is proportional to the candidates that survive the guards"
    status: failed
    severity: WARNING
    reason: "`evaluateCandidateClustering` computes `getBatchEmbeddings(candidateHeadlines)` for the ENTIRE candidate list before `shouldMergeStories` applies the cheap in-process guards. With up to 200 candidates per story and 100 stories per batch that is up to 20,000 Workers AI calls per build, the overwhelming majority for candidates a string comparison would have rejected. The zero-cost budget and the 20-minute CI job cap are both load-bearing constraints."
    artifacts:
      - path: "src/curation/cluster-engine.ts"
        issue: "L148-163 — embeddings computed before the guard loop."
    missing:
      - "Run the guards first and embed only the survivors."

  - truth: "WR-09 — The fixture embedding provider loads its fixture outside vitest"
    status: failed
    severity: WARNING
    reason: "Reproduced under the project's own `tsx` runtime: `new FixtureEmbeddingProvider()` loads NO fixture file and silently serves deterministic pseudo-embeddings (the provider's vector differs from the fixture's for the same headline). `package.json` declares `\"type\": \"module\"`, so the `require('node:fs')` call throws a ReferenceError that the surrounding `catch` swallows. The benchmark's 100%/100% is therefore only reproducible under vitest's CJS-interop shim."
    artifacts:
      - path: "src/curation/embedding-provider.ts"
        issue: "L110-130 — `require('node:fs')` inside an ESM module, failure swallowed."
    missing:
      - "`createRequire(import.meta.url)` or a top-level `import fs from 'node:fs'`, and a loud warning/throw when the fixture is expected but missing."

  - truth: "WR-12 — `clusters.score_updated_at` records when the score was computed"
    status: failed
    severity: WARNING
    reason: "`updateClusterCuration` writes `trending_score` but not `score_updated_at`; `batchUpdateTrendingScores` is the only writer and the pipeline never calls it (only the repository tests do). Every pipeline-created cluster therefore has `score_updated_at = NULL`, so any later rescore-window query that filters on that column finds nothing."
    artifacts:
      - path: "apps/worker/src/db/repository.ts"
        issue: "L1106-1145 — `score_updated_at` absent; L669-690 — `batchUpdateTrendingScores` is the only writer."
    missing:
      - "Write `score_updated_at` in `updateClusterCuration`, or delete the column."

  - truth: "WR-14 — The pipeline reaches the current day's stories"
    status: failed
    severity: WARNING
    reason: "`listUnclusteredStories` always returns the OLDEST unclustered rows, but the merge window is a rolling 24 hours. Once a backlog of unclusterable old rows reaches the batch size, the pipeline works the backlog forever and never reaches the current day. There is also no `(cluster_id, published_at)` index, so `WHERE cluster_id = 0 ORDER BY published_at ASC` sorts the whole unclustered set."
    artifacts:
      - path: "apps/worker/src/db/repository.ts"
        issue: "L854-869 — `WHERE cluster_id = 0 ORDER BY published_at ASC LIMIT ?` with no composite index."
    missing:
      - "Bound the batch to the merge window, and `CREATE INDEX idx_stories_unclustered ON stories(cluster_id, published_at)`."

  - truth: "WR-16 — Editor's Picks has a meaningful ordering"
    status: failed
    severity: WARNING
    reason: "`evaluateEditorialRank(distinctOutlets)` returns `rawRankCandidate ?? 1` and the pipeline passes no candidate, so every multi-outlet cluster is written with `editorial_rank = 1`. `idx_clusters_editorial` is a partial index on exactly this column, so the ordering over it is degenerate — every pick ties. (CUR-10's literal rule — a single-outlet cluster is excluded — does hold.)"
    artifacts:
      - path: "src/curation/ranking.ts"
        issue: "L75-83 — `rawRankCandidate ?? 1`."
      - path: "src/curation/pipeline.ts"
        issue: "L285 / L326 — no candidate rank supplied."
    missing:
      - "Assign real ranks in a scoring pass ordered by `trending_score`."

  - truth: "WR-17 — The trending score's section-diversity term reflects the cluster's real desk spread"
    status: failed
    severity: WARNING
    reason: "`distinctSections: 1` is passed on every call to `calculateTrendingScore`, so the `0.8 * min(1, max(0, distinct_sections - 1))` term of the canonical D-09 formula is always zero. The published formula and the published score disagree."
    artifacts:
      - path: "src/curation/pipeline.ts"
        issue: "L275-276, L293-295 — `distinctSections: 1`."
      - path: "src/curation/split.ts"
        issue: "L83-84, L116-118 — `distinctSections: 1`."
    missing:
      - "Compute the distinct section count from the cluster's `cluster_sections` rows and pass it through."

  - truth: "WR-10 — The declared minimum Node version can load the curation code"
    status: failed
    severity: INFO
    reason: "`package.json` declares `engines.node >= 20`, but `node:sqlite`'s `DatabaseSync` was added in Node 22.5.0 and is imported by the split CLI and the whole curation test harness. On the declared minimum Node the operator tool and every curation test fail to load. The repository currently runs on Node 24, so the gap is invisible locally."
    artifacts:
      - path: "package.json"
        issue: "L8-10 — `\"node\": \">=20\"`."
    missing:
      - "Set `\"node\": \">=22.5\"` and pin the CI runner to Node 22 or 24."

  - truth: "WR-02 / WR-03 — The split CLI verifies its own post-conditions and rejects malformed input"
    status: failed
    severity: INFO
    reason: "The CLI header claims the tool 're-reads the cluster afterwards and refuses to report success unless the attribution rows and the correction note are all where they should be'. There is no such code: `main()` calls `splitCluster`, prints the result and exits. Given CR-03, that verification is the only thing standing between a partial split and a silent success message. Separately, `argv.filter((arg) => !arg.startsWith('--'))` silently discards unknown flags (so `--remtoe` runs against the LOCAL mirror and says nothing), and `Number.parseInt('42abc', 10)` accepts a typo'd id as valid."
    artifacts:
      - path: "scripts/curation/split-cluster.ts"
        issue: "L14-23 (the claim) vs L269-304 (no re-read); L48-60 (flag and id parsing)."
    missing:
      - "Implement the re-read and exit non-zero when it fails; parse flags explicitly against a known set and require `Number(arg)` to be a finite integer."

  - truth: "WR-11 — The 'SQL lives only in the repository' scan covers the code this phase writes"
    status: failed
    severity: INFO
    reason: "`SCAN_ROOTS = ['apps', 'shared', 'scripts', 'spikes']`. Phase 3's new code lives in `src/curation/` and `config/`, neither of which is scanned, so a stray query in the pipeline would not be caught by the OPS-14 enforcement mechanism. (Verified latent, not active: there is no SQL in `src/` or `config/` today.)"
    artifacts:
      - path: "apps/worker/src/db/__tests__/repository.test.ts"
        issue: "L30 — `SCAN_ROOTS` omits `src` and `config`."
    missing:
      - "Add `'src'` and `'config'` to `SCAN_ROOTS`."

  - truth: "S-7 — The merge-gate calibration spike is rolled up as complete"
    status: failed
    severity: INFO
    reason: "`.planning/STATE.md` L130 still records spike S-7 (merge-gate calibration) as 'Not started', and L195 still lists the merge thresholds as 'unvalidated until S-7 lands a measured precision/recall number'. Plan 03-05 explicitly deferred the rollup to the phase gate. The substance exists (the fixture and the benchmark), but the spike record is not closed."
    artifacts:
      - path: ".planning/STATE.md"
        issue: "L130, L195."
    missing:
      - "Close S-7 in STATE.md and in `spikes/RESULTS.md` — with the measured numbers, once the benchmark measures the shipped configuration."

human_verification:
  - test: "Open the seven edition front pages and the Hindi edition front page after a real build with live feeds."
    expected: "Each edition shows its own stories; /in-hi/ shows Devanagari stories from native Hindi publishers and no English edition shows them."
    why_human: "Edition routing is a data and layout property; the automation cannot confirm the reader-visible front page composition."
  - test: "Read a story page's coverage line and byline."
    expected: "Every contributing outlet is named with a working outbound link; a split story carries a dated correction note naming the real outlet."
    why_human: "Link correctness and note placement are reader-visible render properties."
---

# Phase 3: Curation Core — Verification Report

**Phase Goal:** Stories about the same event collapse into one entry listing every outlet that covered it, ranked by coverage and recency, and tagged well enough to place them in editions, sections, topics and entity pages.

**Verified:** 2026-10-22T06:48:21Z
**Status:** `gaps_found`
**Re-verification:** No — initial verification (continuation of an interrupted run; the code review was already complete and committed at `e07e7b2`)

**Score:** 5/14 requirement IDs verified · 1/5 roadmap success criteria verified

> This report verifies the phase goal against the **codebase**, not against `03-REVIEW.md`. The
> review is a claim; every blocker below was **independently reproduced** with a harness built on
> the project's own `shared/db/0001_init.sql` schema and seed, the project's own
> `tests/curation/d1-harness.ts` D1 binding adapter, and the project's own real fixture files.
> Where a review claim reproduced, it is recorded as a confirmed gap with the reproduction. Where
> a claim did not reproduce, that is stated explicitly.

---

## Goal Achievement

### Verdict

**The phase goal is NOT achieved.** The curation *machinery* is largely present, well-shaped and
correctly guarded, and six of the fourteen requirement IDs hold under test. But the two halves of
the goal that matter most in production — *collapse the same event into one entry* and *place the
result in the right edition, section and topic* — both fail against the shipped configuration:

1. At production volume the merge path produces **zero** merges (CR-01).
2. The 98%/85% quality gate measures a configuration the pipeline never runs, and under the
   configuration the pipeline *does* run, both floors **fail** and two disjoint-entity pairs
   merge (CR-02).
3. The Hindi edition can **never** receive a cluster (CR-05), and topics are **never** attached
   (CUR-11), so two of the four placement targets named in the phase goal do not exist.

The code review's framing is accurate and I reproduce its central claim: the suite is green
(349/349 across 34 files) because it asserts the implementation's own behaviour rather than the
production configuration, and the harness disables the foreign keys and the transactionality that
production D1 has.

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The merge rule is validated against a hand-labelled fixture of ≥200 real headline pairs, and the measured precision and recall are **recorded in the repository**; a threshold change below the recorded floor is rejected | ✗ FAILED | Fixture has 212 pairs across 5 categories ✓. But `tests/curation/merge-benchmark.test.ts:181,187` injects the fixture's hand-authored `entitiesA`/`entitiesB`, while `src/curation/pipeline.ts:127-134` derives entities from the gazetteer. Re-running the identical benchmark with gazetteer-derived entities: **precision 97.40%, recall 81.52%** (both floors fail) with **2 `disjoint_entity` merges**. No recorded floor artefact exists anywhere in the repo. |
| 2 | Two items describing the same event collapse into one entry listing every outlet; every contributing item stays individually addressable so a wrong merge can be split without losing the outlet list; the split publishes a dated correction note on the affected story URL | ✗ FAILED | Collapse: **0 merges at production volume** (A/B reproduction below). Membership per item ✓. Note on the old slug ✓ — but the remote split **destroys the attribution row** on a mid-batch failure, and **cannot run at all** after the 30-day prune. |
| 3 | Two items whose entity sets are disjoint are never merged, and headline similarity is never considered without a shared non-generic entity and a close time window | ✗ FAILED | The 24-hour window guard holds. The "shared non-generic entity" clause does **not**: the shared-anchor gate accepts any non-stoplist token >5 chars, so `premier` qualifies. Two `disjoint_entity` pairs merge under the production configuration. |
| 4 | The trending score decays with an 18-hour half-life and weights five distinct outlets above one outlet mentioned five times; the same score yields the same ordering for every reader of a build; a coverage count of 1 is excluded from Editor's Picks | ✓ VERIFIED | 5 distinct outlets = **15.340**; 1 outlet mentioned 5 times = **10.585**. Recency term falls by exactly **2.500** at +18h (5.0 → 2.5), i.e. an exact 18-hour half-life. `nowIso` is fixed per build → deterministic. Single-outlet cluster → `editorial_rank = NULL` (measured). |
| 5 | Every cluster carries topics, named entities and exactly one of the eight sections; every tagging and section decision records the method and confidence used; model-extracted entities never generate entity pages | ✗ FAILED | Exactly one section ✓ with method + confidence ✓. Named entities ✓ but **no topics**: measured `story_entities = 1`, `story_topics = 0`, `topics = 0`. `story_entities`/`story_topics` have **no method/confidence columns at all**. The model-entity invariant holds (`enrichModelEntities` → `generatesPage: false`). |

**Score:** 1/5 roadmap success criteria verified

---

## Independent Reproduction of the Six Blockers

Each was reproduced from the code, not restated from the review. The reproduction harnesses were
temporary files (`tests/curation/_verify-cr01.test.ts`, `tests/curation/_verify-repro.test.ts`),
used the project's own schema, seed, D1 binding adapter and fixture files, and have been **deleted**
as their own headers required.

### CR-01 — The merge path collapses to zero past 200 rows in the window · **REPRODUCED**

Controlled A/B. Identical fixture (20 real `same_event` pairs from
`tests/fixtures/curation/headline-pairs.json`), identical outlets, identical real fixture
embeddings. **The only variable is the number of rows in the merge window.** The 20 pair stories
are the OLDEST rows (processed first); the filler rows are NEWER.

```
A: windowRows=60  (limit 200) -> clustersCreated=41  storiesMerged=19  twoOutletClusters=19
B: windowRows=540 (limit 200) -> clustersCreated=500 storiesMerged=0   twoOutletClusters=0
```

19 of the 20 real same-event pairs merged in case A. **In case B, none merged** — and the 500
"clusters" are 500 unrelated stories. In case B the batch processed was the 40 pair stories plus
460 filler (oldest 500 of 540), so the pair stories *were* processed; they simply found no
candidates.

Mechanism, confirmed in the source: `findRecentCandidateStories` (`repository.ts:921-940`) selects
`WHERE published_at >= ? AND language = ? ORDER BY published_at DESC LIMIT ?` — the **newest** 200
rows, with **no** `cluster_id` predicate. `listUnclusteredStories` (`repository.ts:854-869`)
selects the **oldest** unclustered rows. The `cluster_id <= 0` filter is applied in JavaScript at
`pipeline.ts:168`, **after** the SQL `LIMIT`. So once the window holds more than 200 raw rows, the
rows the pipeline is working on are excluded from the candidate set — including rows it clustered
moments earlier in the same batch. `findLshCandidates` (`repository.ts:646-667`) has the identical
newest-first `LIMIT 50` shape.

Volume is not hypothetical: `src/ingest/normalizer.ts:121` caps each feed at 25 items,
`shared/db/seed.sql` registers 30 sources, and the roadmap plans ~50 feeds — **750+ raw `stories`
rows per day**, of which the English share alone is several times the limit of 200. The
`stories` table holds raw mentions, one row per (outlet, item), not published clusters. **The
merge path fails on day one in production.**

### CR-02 — The 98%/85% gate measures a configuration the pipeline never runs · **REPRODUCED**

```
GATEZ mode=gazetteer  TP=75 FP=2 TN=118 FN=17  precision=97.40%  recall=81.52%
GATE  precision>=0.98 ? false     recall>=0.85 ? false
disjoint_entity FPs = 2

  FP: DE-DISJ-208 [disjoint_entity] Premier Danielle Smith announces energy deregulation measures in Edmonton
                           || Premier Doug Ford outlines infrastructure expansion priorities in Ontario
  FP: DE-DISJ-212 [disjoint_entity] उत्तर प्रदेश के मुख्यमंत्री योगी आदित्यनाथ ने विकास परियोजनाओं का लोकार्पण किया
                           || दिल्ली के मुख्यमंत्री अरविंद केजरीवाल ने शिक्षा सुधारों पर प्रेस वार्ता की
```

The shipped benchmark (`tests/curation/merge-benchmark.test.ts:181,187`) uses
`entities: pair.entitiesA` / `pair.entitiesB` — the fixture's hand-authored lists — and reports a
vacuous **100.00% / 100.00%**. The pipeline (`src/curation/pipeline.ts:127-134`) uses
`matchGazetteerEntities`. Two different input configurations; only one of them is production.

Gazetteer coverage measured independently, against the same fixture:

```
gazetteer entries: 59
headline occurrences: 424, with >=1 gazetteer match: 101 (23.8%)
declared entity mentions (with duplicates): 496; known to gazetteer: 62 (12.5%)
distinct declared slugs: 311; known to gazetteer: 26
```

The fixture declares entities such as `andrew-bailey`, `rachel-reeves`, `gatwick-airport`,
`met-police`, `ons`, `tata-steel`, `jerome-powell`, `supreme-court`, `boeing`, `spacex` — none of
which the gazetteer knows. The 17 false negatives are the mirror failure: *"Department of Justice
files antitrust suit"* vs *"DOJ sues to block hospital network acquisition"* share no token longer
than five characters and no gazetteer entity, so the merge is missed.

**This directly violates the locked decision for CUR-05:** *"two items with disjoint entity sets
are NEVER merged."* Two do.

### CR-03 — The remote split is not transactional and can destroy the attribution row · **REPRODUCED**

The D1 query API **rejects explicit transactions** — verified against the live database:

```
$ npx wrangler d1 execute meridian --remote --command "BEGIN; ... ROLLBACK;"
ERROR: To execute a transaction, please use the state.storage.transaction() ...
```

and the CLI's remote binding (`scripts/curation/split-cluster.ts:221-230`) runs each statement of
`db.batch` as its own transaction. `recordClusterSplit` moves the attribution with
`DELETE FROM story_sources` then `INSERT INTO story_sources` (`repository.ts:1247-1267`).

Reproduction: a real two-outlet cluster, bound through a remote-shaped binding, with a simulated
network failure on the `INSERT`:

```
attribution rows BEFORE split: [{story_id:1, source_id:1, headline:"Bank of England cuts interest rate to 4.75 percent", url:"https://e.com/x1"},
                                {story_id:2, source_id:2, headline:"BoE reduces benchmark interest rate by 25 basis points to 4.75%", url:"https://e.com/x2"}]
split outcome: SIMULATED REMOTE FAILURE (network blip / rate limit)
attribution rows on OLD cluster AFTER split: [{story_id:2, ...}]
attribution rows on NEW cluster AFTER split: []
orphan clusters created by the failed split: [{"id":2}]
attribution for story 1 survived on the old cluster? false
attribution for story 1 present on the new cluster? false
```

Story 1's outlet headline and attribution URL are **gone from both clusters**, and an empty orphan
cluster is left behind. The local rehearsal path *is* transactional (`split-cluster.ts:122-135`),
so it cannot reproduce this — exactly as the review said.

### CR-04 — `"WHO"` matches the English word "who" · **REPRODUCED**

```
matches("Who will win the election?")      = [ 'world-health-organization' ]
matches("Man who led the charge...")         = [ 'world-health-organization' ]
matches("WHO issues new guidance...")        = [ 'world-health-organization' ]
edition flags for a "who" headline = ["uk","us","au","ca","ie","nz","in"]
```

`buildEntityRegex` (`tagging.ts:71-76`) applies the case-sensitive acronym rule only to names of
**two characters or fewer**; `"WHO"` is three, so it becomes `/\bWHO\b/i`. Because
`world-health-organization` is `isSupranational: true`, `determineEditionFlags` then flags the
story onto **all seven English editions** at confidence 0.85 (measured: 7 flags). An unrelated
local story is tagged with a health organisation, which also generates an entity landing page —
poisoning the entity index CUR-12 exists to protect. The same defect applies to `NATO`, `NASA`,
`NHS`, `IMF`, `ECB`, `ISRO`.

### CR-05 — The `in-hi` edition can never receive a cluster · **REPRODUCED**

```
COUNTRY_TO_EDITION = {"GB":"uk","US":"us","AU":"au","CA":"ca","IE":"ie","NZ":"nz","IN":"in"}
ENGLISH_EDITIONS  = ["uk","us","au","ca","ie","nz","in"]

Hindi story from an Indian outlet -> flags = [{"editionId":"in","reason":"source","confidence":1}]
edition_clusters rows after a Hindi story = [{"edition":"in","cluster_id":1}]
rows for in-hi = 0
```

`in-hi` **is** seeded (`shared/db/seed.sql:46`) and `amar-ujala` **is** seeded with language `hi`
(`seed.sql:150`) — so the Hindi edition is a live product promise with a live publisher, and the
pipeline can never route to it. A Hindi story lands on the **English** India front page in
Devanagari, and `/in-hi/` is empty forever. This contradicts PUB-18.

### CR-06 — The split depends on `stories` rows that are pruned after 30 days · **REPRODUCED**

Two halves, both confirmed.

**(a) The documented prune is blocked by the foreign key, in production.** Production D1 enforces
foreign keys — verified against the live database:

```
$ npx wrangler d1 execute meridian --remote --command "INSERT INTO _vfy_child(id,pid) VALUES (1,999);"
ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY) [code: 7500]
```

`shared/db/0001_init.sql:192-193` declares `story_sources.story_id INTEGER NOT NULL REFERENCES
stories(id)` with `NO ACTION`. Measured against the project schema:

```
prune of stories with FKs ON -> FOREIGN KEY constraint failed
```

This is the **open Phase 1 foreign-key blocker**, still unfixed, and it now also blocks the
documented 30-day prune of raw mention rows.

**(b) Once the prune has happened, the split cannot run.** With the prune applied (FKs off, as a
Phase 1 fix would require):

```
stories rows after the prune: 0
story_sources rows retained (the member list of record): 2
split outcome on a pruned cluster: Story 1 not found.
```

`split.ts:63-66` requires the `stories` row and throws `Story N not found.` when it is gone.
`split.ts:42-44` states the design intent — *"the attribution list is what survives"* — and then
does the opposite. The long-lag mis-merge, the case that takes weeks of reader feedback to
surface and is the whole reason the split exists, can never be corrected. CUR-02's "reversible"
claim fails for exactly the cases that need it.

---

## Requirements Coverage

All 14 requirement IDs assigned to this phase are accounted for below. **5 verified, 2 partial,
7 failed.**

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| CUR-01 | Items describing the same event collapse into one cluster that lists every outlet that covered it | ✗ FAILED | **0 merges at production volume** (CR-01 A/B: 19 two-outlet clusters → 0). Under the production entity configuration it also produces *wrong* merges (2 `disjoint_entity`). |
| CUR-02 | Cluster membership is stored per contributing item, so any merge can be split without losing the original outlet list | ✗ FAILED | Storage ✓ (measured: `story_sources` 2 rows + `stories.cluster_id` 2 rows, one per item). But the split **destroys the attribution row** on a remote mid-batch failure (CR-03) and **cannot run** after the 30-day prune (CR-06). |
| CUR-03 | A split of a wrongly merged cluster publishes a dated correction note on the affected story URL | ✓ VERIFIED | Measured: correction row `story_slug = story-mvj6ely9-2u67` (the **old** cluster's permanent slug), `reported_at = 2026-10-21T18:00:00.000Z`, note = *"Correction (2026-10-21): An earlier version of this story incorrectly grouped coverage from BBC News. The coverage has been separated into its own report."* The real outlet is named — the earlier "source 10" defect is genuinely fixed. |
| CUR-04 | The merge rule requires agreement on a shared non-generic entity and a close time window before it will consider headline similarity | ⚠ PARTIAL | The 24-hour window guard holds and blocks. The "shared **non-generic** entity" clause does **not**: the shared-anchor gate accepts any non-stoplist token >5 chars, so ordinary news words (`premier`, `minister`, `police`) satisfy it (WR-04), producing the two false merges. |
| CUR-05 | Two items whose entity sets are disjoint are never merged | ✗ FAILED | **2 `disjoint_entity` pairs merge** under the production (gazetteer) entity configuration. The locked decision — *"two items with disjoint entity sets are NEVER merged"* — is violated. |
| CUR-06 | The merge rule is validated against a hand-labelled fixture of at least 200 real headline pairs, with precision and recall measured and recorded | ✗ FAILED | Fixture = 212 pairs across 5 categories ✓. But the gate measures hand-authored entities, not the shipped configuration: **97.40% / 81.52%** under gazetteer entities — both floors fail. No measured floor is recorded as a repository artefact. |
| CUR-07 | Every cluster carries a trending score that decays with an 18-hour half-life and weights distinct outlets three times more heavily than repeat mentions from one outlet | ✓ VERIFIED | 5 outlets **15.340** > 1 outlet × 5 mentions **10.585**. Recency term falls by exactly **2.500** at +18h (5.0 → 2.5). Formula matches D-09. |
| CUR-10 | A cluster with a coverage count of 1 is excluded from Editor's Picks | ✓ VERIFIED | Measured: single-outlet cluster → `editorial_rank = null`. Also holds on the split path (`editorial_rank = CASE WHEN ? < 2 THEN NULL ELSE editorial_rank END`). Caveat: every multi-outlet cluster gets rank 1 (WR-16). |
| CUR-11 | Every cluster is tagged with topics and named entities, and each tagging decision records the method and confidence used | ✗ FAILED | Measured: `story_entities = 1`, `story_topics = 0`, `topics = 0`. No topic matcher or topic lexicon exists anywhere. `story_entities`/`story_topics` have **no method/confidence columns**. |
| CUR-12 | Named entities are matched against a curated per-country gazetteer before any model-based extraction runs, and model-extracted entities are not used to generate entity pages | ✓ VERIFIED | Gazetteer sync runs first (`pipeline.ts:103-113`) and only gazetteer entities are ever written to `entities`. `enrichModelEntities` returns `generatesPage: false` for every model-extracted name. Caveat: the gazetteer's *matching* is unsound (CR-04), which pollutes the index this requirement protects. |
| CUR-13 | A cluster is flagged for additional editions when its outlet country, entity country or gazetteer match indicates relevance beyond its primary edition | ⚠ PARTIAL | Mechanism works for the seven English editions: outlet country → `reason: 'source', confidence: 1.0`; entity country → `'entity', 0.90`; supranational → `'gazetteer', 0.85`; all recorded with reason + confidence. **But** `in-hi` is unreachable (CR-05), the wire path is hardcoded off (`isWireBreaking: false`), and only the *incoming* story's country is considered — not the cluster's member countries. |
| CUR-14 | A cluster is assigned to one of the eight sections, and every assignment records whether it came from the feed source, a section lexicon, or a model tie-break, along with a confidence value | ⚠ PARTIAL | Exactly one section per cluster ✓; `cluster_sections` records `method` + `confidence` (measured: `lexicon`, 0.95) ✓; the eight desks are seeded ✓. **But** `resolveSection` has exactly one production caller (`pipeline.ts:219`) and it passes neither `feedPriorSection` nor `aiClassifier`, so `'source'` and `'ai_tiebreak'` are **unreachable** — only `lexicon` and `fallback` can ever be recorded. The source registry's per-outlet `sectionPrior` is dead code in the curation path. |
| CUR-15 | The system ships a topic lexicon, an entity gazetteer, and a generic-token stop list per country, in English and Devanagari | ✗ FAILED | Gazetteer ✓ (59 entries, 7 countries + supranational, English + Devanagari names and aliases). Stop list ✓ (English + Hindi noise-token and stop-word sets). **Topic lexicon ✗ — it does not exist** (`config/lexicon.ts` exports only `SECTION_KEYWORDS`). The stop list is global, not per-country. |
| CON-15 | A cluster's publication date is the earliest publication time among its members, and its modified date reflects a real change to the cluster | ✓ VERIFIED | Structurally enforced: `published_at = MIN(published_at, ?)` in both `addStoryToCluster` and `updateClusterCuration`; the split uses `COALESCE((SELECT MIN(published_at) FROM story_sources WHERE cluster_id = ?), published_at)`. Measured: members at 12:00 and 09:00 → cluster `published_at = 2026-10-21T09:00:00.000Z`. |

**No orphaned requirements.** Every ID mapped to Phase 3 in `.planning/REQUIREMENTS.md` appears
above, and every ID declared in a plan's `requirements:` frontmatter appears above. `CUR-08` and
`CUR-09` are Phase 5 and are correctly out of scope here.

**Note on CUR-11's pre-existing annotation.** `.planning/REQUIREMENTS.md` already carries a note
that the topic half of CUR-11 is not delivered. That note is **confirmed** by this verification
and the requirement remains marked incomplete (`[ ]`) with tracking status `Pending`. The note
attributes the gap to "no plan in Phase 3 specified topic tagging" — but the **roadmap's Phase 3
exit criteria do list topics** (SC 5), so this is a phase-level gap, correctly carried by the
phase verifier.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `config/stoplist.ts` | Bilingual generic-token stop list | ✓ VERIFIED | `GENERIC_NOISE_TOKENS_EN/HI`, `STOP_WORDS_EN/HI`, `isNoiseToken`, `isStopWord`. No generic news-noun list (WR-04). |
| `config/gazetteer.ts` | Curated bilingual per-country entity gazetteer | ⚠ PARTIAL | 59 entries, English + Devanagari. Matches only 23.8% of the labelled fixture's headlines. Acronym matching is unsound (CR-04); `Apple`/`Amazon`/`Meta` match common nouns (WR-06). |
| `config/lexicon.ts` | Weighted section **and topic** lexicons | ✗ STUB (partial) | Only `SECTION_KEYWORDS` is exported. **No topic lexicon** — CUR-11/CUR-15 gap. |
| `src/curation/simhash.ts` | SimHash-64 + 4×16-bit LSH bands | ✓ VERIFIED | `computeSimHash`, `computeHammingDistance`, `fnv1a64`, `tokenizeHeadline` (en + hi). |
| `src/curation/guards.ts` | Anti-merge guards | ⚠ PARTIAL | Ordering correct (language → window → disjoint entity → shared anchor → ordinal/round → aspect, embedding last). Disjoint-entity guard ✓, time window ✓. Shared-anchor guard accepts ordinary nouns (WR-04). |
| `src/curation/embedding-provider.ts` | Embedding abstraction + fixture + live providers | ⚠ PARTIAL | `FixtureEmbeddingProvider` loads no fixture outside vitest (WR-09, reproduced under `tsx`). |
| `src/curation/cluster-engine.ts` | Two-gate clustering engine | ⚠ PARTIAL | Gate order and `confidence: 0` on every guard rejection ✓. Embeddings computed before the guards (WR-08). `selectPrimaryHeadline` has no authority source (WR-05). |
| `src/curation/ranking.ts` | Trending score + Editor's Picks gate | ✓ VERIFIED | Exact 18-hour half-life, 3× outlet weighting, `editorial_rank = null` under 2 outlets. `distinct_sections` term always 0 (WR-17); rank always 1 (WR-16). |
| `src/curation/sections.ts` | 4-stage section resolver | ⚠ PARTIAL | Cascade implemented ✓, method + confidence returned ✓. Stages 1 and 3 unreachable from the only production caller. |
| `src/curation/tagging.ts` | Gazetteer matcher + edition flagger | ⚠ PARTIAL | Gazetteer tier ✓, model-entity gate ✓, edition flags with reason + confidence ✓. `"who"` false match (CR-04); `in-hi` unreachable (CR-05); language argument ignored (IN-04). |
| `src/curation/split.ts` | Reversible split with dated correction | ⚠ PARTIAL | Correction note ✓, re-measure ✓, new-cluster metrics ✓. Requires the `stories` row (CR-06). |
| `src/curation/pipeline.ts` | End-to-end orchestrator | ✗ PARTIAL | Runs end to end against real D1 ✓. Candidate generation collapses past 200 rows (CR-01); topics never attached (CUR-11); `distinctSections: 1` hardcoded (WR-17). |
| `apps/worker/src/db/repository.ts` | All datastore access | ⚠ PARTIAL | Every value bound; the one interpolation is allow-listed; no `SELECT *`; index coverage correct except `(cluster_id, published_at)` (WR-14). `recordClusterSplit` is destructive and non-atomic on the remote path (CR-03); `score_updated_at` never written by the pipeline (WR-12). |
| `scripts/curation/split-cluster.ts` | Administrative CLI | ⚠ PARTIAL | Works locally. Header claims a post-condition re-read that does not exist (WR-02); unknown flags and malformed ids are silently accepted (WR-03); remote path is non-transactional (CR-03). |
| `tests/fixtures/curation/headline-pairs.json` | ≥200 hand-labelled pairs | ✓ VERIFIED | 212 pairs; 92 `same_event`, 70 `different_event`, 20 `round_conflict`, 15 `temporal_conflict`, 15 `disjoint_entity`. |
| `tests/fixtures/curation/headline-embeddings.json` | Pre-computed 1024-d vectors | ✓ VERIFIED | Loaded and used under vitest; **not** loaded under `tsx` (WR-09). |
| `tests/curation/merge-benchmark.test.ts` | The 98%/85% gate | ✗ STUB (as a gate) | Asserts the floors, but against a configuration the pipeline never runs (CR-02). Reports a vacuous 100%/100%. |
| `tests/curation/d1-harness.ts` | Real D1-shaped test database | ⚠ PARTIAL | Real schema + seed + `node:sqlite` ✓. `PRAGMA foreign_keys = OFF` (WR-15) hides every FK violation; `cluster_id = 0` violates `stories.cluster_id REFERENCES clusters(id)` in production. |
| `tests/curation/*.test.ts` (7 files) | Unit + integration coverage | ⚠ PARTIAL | 349/349 green. All fixtures are under 20 rows, so the suite structurally cannot detect CR-01; the benchmark cannot detect CR-02. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/curation/simhash.ts` | `config/stoplist.ts` | `STOPLIST` import | ✓ WIRED | Noise stripped before hashing. |
| `src/curation/guards.ts` | `src/curation/simhash.ts` | `evaluateAntiMergeGuards` | ✓ WIRED | Guards run before the embedding. |
| `src/curation/cluster-engine.ts` | `src/curation/guards.ts` | `evaluateAntiMergeGuards` | ✓ WIRED | Guard ordering correct. |
| `src/curation/cluster-engine.ts` | `apps/worker/src/db/repository.ts` | `findLshCandidates` | ⚠ PARTIAL | Wired, but the band probe has **zero measured recall** on the 92 labelled same-event pairs (per `STATE.md`), so the window scan carries recall — and the window scan is the one that truncates (CR-01). |
| `src/curation/pipeline.ts` | `apps/worker/src/db/repository.ts` | `listUnclusteredStories`, `findRecentCandidateStories` | ✗ NOT WIRED (correctly) | The two queries use **opposite orderings** (oldest vs newest) with the `cluster_id` filter applied after the LIMIT. This is the CR-01 defect. |
| `src/curation/pipeline.ts` | `src/curation/tagging.ts` | `matchGazetteerEntities` | ✓ WIRED | The pipeline uses gazetteer entities — which is precisely why the benchmark's hand-authored entities do not represent production. |
| `src/curation/pipeline.ts` | `config/gazetteer.ts` | `GAZETTEER_ENTITIES` | ✓ WIRED | Synced to `entities` every run; only gazetteer entities are ever written. |
| `src/curation/sections.ts` | `shared/config/editions.ts` | `SectionId` | ✓ WIRED | Strictly typed. |
| `src/curation/tagging.ts` | `config/gazetteer.ts` | `GAZETTEER_ENTITIES` | ✓ WIRED | But the regex construction is unsound (CR-04). |
| `src/curation/split.ts` | `apps/worker/src/db/repository.ts` | `recordClusterSplit` | ⚠ PARTIAL | Wired; the destructive window (CR-03) and the `stories` dependency (CR-06) live inside it. |
| `scripts/curation/split-cluster.ts` | `src/curation/split.ts` | `splitCluster` | ✓ WIRED | — |
| `tests/curation/curation-pipeline.test.ts` | `src/curation/pipeline.ts` | `processCurationPipeline` | ✓ WIRED | Runs the real pipeline against the real schema. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|----------|---------------|--------|--------------------|--------|
| `processCurationPipeline` | `stories` | `listUnclusteredStories` → `stories` table | Yes | ✓ FLOWING |
| `processCurationPipeline` | merge candidates | `findRecentCandidateStories` → `stories` table | **Empty in practice** — the newest-200 slice excludes the rows being processed once the window exceeds 200 | ✗ **DISCONNECTED** (CR-01) |
| `processCurationPipeline` | `entities` | `matchGazetteerEntities` → `config/gazetteer.ts` | Yes, but thin (23.8% coverage) and unsound (`"who"`) | ⚠ PARTIAL |
| `processCurationPipeline` | `editionFlags` | `determineEditionFlags` | Yes for the 7 English editions; `in-hi` unreachable | ⚠ PARTIAL |
| `processCurationPipeline` | `topicIds` | **nothing** — the pipeline passes `[]` | **No** | ✗ **DISCONNECTED** (CUR-11) |
| `processCurationPipeline` | `distinctSections` | **nothing** — hardcoded `1` | **No** | ✗ **DISCONNECTED** (WR-17) |
| `processCurationPipeline` | `outletAuthority` | **nothing** — the source registry has no authority column | **No** | ✗ **DISCONNECTED** (WR-05) |
| `processCurationPipeline` | `trendingScore` | `calculateTrendingScore` over real member rows | Yes | ✓ FLOWING |
| `splitCluster` | correction note | `findSourceById` → `sources` | Yes — names the real outlet | ✓ FLOWING |
| `recordClusterSplit` | attribution row | `stories` row (prunable) | Yes today, **gone after 30 days** | ⚠ PARTIAL (CR-06) |

---

## Behavioral Spot-Checks

Executed against the project's own D1-shaped harness (real schema, real seed, real fixtures).
All checks are read-only apart from in-memory databases; nothing was written to the live D1
beyond two scratch tables that were created and dropped as part of the foreign-key probe.

| Behaviour | Command / Method | Result | Status |
|-----------|------------------|--------|--------|
| Same-event pairs merge when the window fits under 200 rows | `processCurationPipeline`, 60 rows | 19 two-outlet clusters | ✓ PASS |
| Same-event pairs merge when the window exceeds 200 rows | `processCurationPipeline`, 540 rows | **0 two-outlet clusters, 0 merges** | ✗ **FAIL** (CR-01) |
| Merge benchmark under the shipped (gazetteer) configuration | re-run of `merge-benchmark.test.ts` with `matchGazetteerEntities` | precision 97.40%, recall 81.52%, 2 disjoint-entity FPs | ✗ **FAIL** (CR-02) |
| Gazetteer coverage of the labelled fixture | `matchGazetteerEntities` over 424 headline occurrences | 101 matched (23.8%); 62/496 entity mentions known | ⚠ FAIL (CR-02 root cause) |
| `"who"` does not match the World Health Organization | `matchGazetteerEntities` | matches | ✗ **FAIL** (CR-04) |
| A `"who"` headline is not pushed to all editions | `determineEditionFlags` | 7 flags | ✗ **FAIL** (CR-04) |
| A Hindi story reaches `in-hi` | `processCurationPipeline` → `edition_clusters` | 0 rows for `in-hi`; 1 row for `in` | ✗ **FAIL** (CR-05) |
| The remote split preserves the attribution row on a mid-batch failure | remote-shaped binding, failure injected on the INSERT | attribution row on neither cluster; orphan cluster left | ✗ **FAIL** (CR-03) |
| The documented 30-day prune of `stories` runs in production | `DELETE FROM stories` with FKs ON | `FOREIGN KEY constraint failed` | ✗ **FAIL** (CR-06a; open Phase 1 blocker) |
| The split runs on a cluster whose `stories` rows were pruned | `splitCluster` after prune | `Story 1 not found.` | ✗ **FAIL** (CR-06b) |
| Production D1 enforces foreign keys | `wrangler d1 execute meridian --remote` | `SQLITE_CONSTRAINT_FOREIGNKEY` | ✓ PASS (constraint confirmed live) |
| Cluster `published_at` is the earliest member time | merged cluster, members at 12:00 / 09:00 | `2026-10-21T09:00:00.000Z` | ✓ PASS |
| Single-outlet cluster excluded from Editor's Picks | pipeline → `clusters.editorial_rank` | `null` | ✓ PASS |
| Five distinct outlets outrank one outlet mentioned five times | `calculateTrendingScore` | 15.340 > 10.585 | ✓ PASS |
| 18-hour half-life | `calculateTrendingScore` at t0 and t+18h | recency term falls by exactly 2.500 | ✓ PASS |
| Cluster carries topics | pipeline → `story_topics` / `topics` | 0 rows | ✗ **FAIL** (CUR-11) |
| Split's new cluster is reachable | pipeline → `edition_clusters` / `cluster_sections` | old 1/1, new 0/0 | ✗ **FAIL** (WR-01) |
| Correction note lands on the affected (old) story URL | `splitCluster` → `corrections` | `story_slug` = old cluster's slug; note names "BBC News" | ✓ PASS |
| Section decision records method + confidence | pipeline → `cluster_sections` | `lexicon`, 0.95 | ✓ PASS |
| Edition flag records reason + confidence | pipeline → `edition_clusters` | `source`, 1.0 | ✓ PASS |
| Fixture embedding provider loads its fixture outside vitest | `tsx` probe | provider vector ≠ fixture vector | ✗ **FAIL** (WR-09) |
| Typecheck | `npm run typecheck` | clean | ✓ PASS |
| Existing suite | `npm test -- --run` | **349/349 green, 34 files** | ✓ PASS (and is itself the finding) |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/worker/src/db/repository.ts` | 921-940 | `ORDER BY published_at DESC LIMIT ?` with the `cluster_id` predicate applied in JS afterwards | 🛑 Blocker | Merge path collapses to zero past 200 rows in the window |
| `apps/worker/src/db/repository.ts` | 646-667 | Same newest-first `LIMIT 50` shape in the band probe | ⚠ Warning | Probe inherits the same truncation |
| `apps/worker/src/db/repository.ts` | 1238-1302 | `DELETE` + `INSERT` to move an attribution row, in a non-atomic remote batch | 🛑 Blocker | A mid-batch failure permanently destroys the outlet headline and URL |
| `apps/worker/src/db/repository.ts` | 1106-1145 | `score_updated_at` never written by the pipeline | ⚠ Warning | Every pipeline cluster has `score_updated_at = NULL` |
| `apps/worker/src/db/repository.ts` | 854-869 | `WHERE cluster_id = 0 ORDER BY published_at ASC` with no composite index | ⚠ Warning | Full sort of the unclustered set; oldest-first starvation |
| `src/curation/guards.ts` | 89-98 | "Distinctive token" = any token >5 chars not in the stoplist | ⚠ Warning | Ordinary news words satisfy the shared-anchor gate |
| `src/curation/cluster-engine.ts` | 148-163 | Embeddings computed for the whole candidate list before the guards | ⚠ Warning | Up to 20,000 Workers AI calls per build |
| `src/curation/cluster-engine.ts` | 52-80 | `outletAuthority ?? 0` with no production caller supplying it | ⚠ Warning | Headline selection degenerates to "longest under 110 chars" |
| `src/curation/tagging.ts` | 71-76 | Case-sensitive acronym rule limited to names ≤2 chars | 🛑 Blocker | `"who"` matches the World Health Organization; story pushed to 7 editions |
| `src/curation/tagging.ts` | 34-52 | `COUNTRY_TO_EDITION` / `ENGLISH_EDITIONS` contain no `in-hi` | 🛑 Blocker | The Hindi edition can never receive a cluster |
| `src/curation/split.ts` | 63-66 | Requires the `stories` row, which the design prunes after 30 days | 🛑 Blocker | Long-lag mis-merges can never be split |
| `src/curation/pipeline.ts` | 365 | `[]` for topic ids, with the comment "lands in a later tagging pass" | 🛑 Blocker | CUR-11's topic half never delivered; no later phase owns it |
| `src/curation/pipeline.ts` | 275-276, 293-295 | `distinctSections: 1` hardcoded | ⚠ Warning | The D-09 section-diversity term is always zero |
| `src/curation/pipeline.ts` | 224 | `?? 6` magic-number section fallback | ℹ Info | A seed reorder silently files stories under the wrong desk |
| `src/curation/pipeline.ts` | 285, 326 | `evaluateEditorialRank(n)` with no rank candidate | ⚠ Warning | Every Editor's Pick ties at rank 1 |
| `src/curation/pipeline.ts` | 55-57 | `story-${Date.now()}-${Math.random().slice(2,6)}` slug | ℹ Info | ~1.6M suffixes/ms against a UNIQUE column; a collision aborts the build |
| `src/curation/embedding-provider.ts` | 110-130 | `require('node:fs')` inside an ESM module, failure swallowed | ⚠ Warning | Fixture silently not loaded outside vitest |
| `src/curation/sections.ts` | 103, 141 | `aiClassifier` never supplied by any production caller | ⚠ Warning | The AI tiebreak stage is unreachable |
| `config/lexicon.ts` | 11 | Header claims "section and topic lexicons"; only `SECTION_KEYWORDS` exported | 🛑 Blocker | No topic lexicon — CUR-15 gap |
| `config/gazetteer.ts` | — | 59 entries; `Apple`/`Amazon`/`Meta` match common nouns; `WHO` matches `"who"` | ⚠ Warning | False entity tags, spurious entity pages, spurious edition flags |
| `scripts/curation/split-cluster.ts` | 14-23 vs 269-304 | Header claims a post-condition re-read that does not exist | ℹ Info | A partial split reports success |
| `scripts/curation/split-cluster.ts` | 48-60 | Unknown flags discarded; `parseInt('42abc')` accepted | ℹ Info | `--remtoe` silently targets the local mirror |
| `tests/curation/d1-harness.ts` | 138 | `PRAGMA foreign_keys = OFF` | ⚠ Warning | No curation test can detect an FK violation |
| `tests/curation/merge-benchmark.test.ts` | 181, 187 | Benchmark uses hand-authored entities, not the pipeline's | 🛑 Blocker | The gate passes vacuously; the shipped configuration fails both floors |
| `package.json` | 8-10 | `engines.node >= 20` but `node:sqlite` needs ≥22.5 | ℹ Info | The operator tool and curation tests fail to load on the declared minimum |
| `apps/worker/src/db/__tests__/repository.test.ts` | 30 | `SCAN_ROOTS` omits `src` and `config` | ℹ Info | The OPS-14 SQL scan has a hole exactly where this phase writes code |

---

## Human Verification Required

### 1. Edition front pages with live feeds

**Test:** Run a build against real feeds and open `/uk/`, `/us/`, `/in/` and `/in-hi/`.
**Expected:** Each edition shows its own stories; `/in-hi/` shows Devanagari stories from native
Hindi publishers (Amar Ujala, Zee News, etc.) and no English edition shows them.
**Why human:** Edition composition is a reader-visible layout property. The automation can confirm
that `edition_clusters` contains no `in-hi` row (it does not), but not what the front page looks
like once the gap is fixed.

### 2. Story-page coverage line and byline

**Test:** Open a multi-outlet story page and a split story's page.
**Expected:** Every contributing outlet is named with a working outbound link; the split story
carries a dated correction note naming the real outlet, and the separated report is reachable
from a front page or section page (today it is reachable only by URL — WR-01).
**Why human:** Link correctness and correction-note placement are reader-visible render
properties that no repository-level check can confirm.

### 3. Cross-outlet coverage in practice

**Test:** Once CR-01 is fixed, compare a story's outlet count against the number of publishers
that ran it that morning.
**Expected:** A story covered by five publishers appears once with five outlets, not as five
one-outlet entries.
**Why human:** Requires live feeds and a judgement about what "the same event" means across
publishers — the very thing the labelled fixture only approximates.

---

## Gaps Summary

Six **BLOCKER** defects, all independently reproduced, stand between this phase and its goal.

**The pattern across the blockers is one thing: the code was validated against a configuration
that does not ship.** The merge candidate query is ordered for a table that holds 20 rows, not
750. The quality gate measures hand-authored entities, not the gazetteer. The split is rehearsed
against a transactional SQLite mirror, not against D1's statement-at-a-time query API. The
gazetteer is exercised on names that are already capitalised, not on the English word "who". The
edition map is exercised on English stories, not on the Hindi edition it is supposed to serve.
Each defect is individually invisible to a green 349-test suite; together they mean the product's
central promise — *one entry, every outlet, right edition* — does not yet hold.

Two further **BLOCKER** gaps are not in the review's list and were found by this verification:
**CUR-11's topic half is not implemented at all** (no topic lexicon, no topic matcher, zero
`story_topics` rows, and no method/confidence columns on the tagging tables), and **CUR-15's topic
lexicon does not exist**. The phase goal names topics as one of four placement targets; two of
the four (editions for Hindi, topics) are unreachable.

None of these gaps are deferred to a later phase. Phase 5 *renders* topic pages and the `/in-hi/`
front page, but it consumes the Phase 3 topic taxonomy and edition flags — it cannot create
them. Phase 7 schedules "the 30-day pruning of raw item rows", which is precisely what CR-06
depends on and the Phase 1 foreign-key blocker that blocks it.

### Recommended order of closure

1. **CR-01** — move `cluster_id > 0` into the candidate query and order it ASC. Without this
   nothing else about the merge path matters at production volume. Add a >200-row regression test.
2. **CR-02 + CR-04 + WR-04 + WR-06** — as one piece of work: make the benchmark measure the
   shipped configuration, fix the acronym rule, add a generic news-noun list, expand the
   gazetteer, then re-baseline the floors against a configuration that actually runs. The two
   `disjoint_entity` merges are the acceptance test.
3. **CR-03 + CR-06** — make the attribution move an `UPDATE` rather than `DELETE` + `INSERT`, and
   drive the split from `story_sources` alone. This requires the Phase 1 foreign-key decision
   (nullable `story_id` or `SET NULL`) to land first.
4. **CR-05** — route by the story's language so a Hindi story lands in `in-hi` and in no English
   edition.
5. **CUR-11 + CUR-15** — build the topic lexicon and matcher, wire them through
   `syncTaxonomyAndEntities` and `assignClusterTaxonomy`, and add the method/confidence audit
   columns the requirement names.

The nine warnings (WR-01, WR-04, WR-05, WR-08, WR-09, WR-12, WR-14, WR-16, WR-17) and four info
items (WR-02, WR-03, WR-10, WR-11) are recorded above with the evidence for each.

### Two environment facts recorded for the orchestrator

- **The live D1 database `meridian` has no schema applied.** `sqlite_master` on the remote
  instance contains only D1's internal `_cf_KV` table — no `stories`, `clusters`, `editions` or
  `corrections`. The Phase 3 code has therefore never run against the live database. The
  migrations (`shared/db/0001_init.sql`, `shared/db/seed.sql`) have only ever been applied to the
  local mirror.
- **The production foreign-key constraint was confirmed live**, by creating two scratch tables on
  the remote instance and attempting a violating insert (rejected with
  `SQLITE_CONSTRAINT_FOREIGNKEY`); both tables were dropped immediately afterwards. This is the
  constraint CR-06 and the Phase 1 blocker depend on.

---

_Verified: 2026-10-22T06:48:21Z_
_Verifier: OpenCode (gsd-verifier) — continuation run after an interrupted first attempt_
