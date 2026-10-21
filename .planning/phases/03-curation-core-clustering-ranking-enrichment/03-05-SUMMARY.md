# Plan 03-05: Reversible Cluster Split, Dated Corrections & End-to-End Curation Pipeline — Summary

**Execution Status:** Complete
**Phase:** 03 (Curation Core: Clustering, Ranking & Enrichment)
**Plan:** 05
**Requirements Addressed:** CUR-01, CUR-02, CUR-03, CUR-04, CUR-05, CUR-06, CUR-07, CUR-10, CUR-11 (entities only), CUR-12, CUR-13, CUR-14, CUR-15, CON-15, OPS-14
**Commits:** `475e747`, `4558ec6`

---

## Executive Overview

Plan 03-05 made the curation pipeline **reversible** and **complete**.

1. **The split workflow (CUR-02, CUR-03, D-18, D-19):** a wrongly merged story is detached into a cluster of its own. The attribution row *moves* rather than being copied or removed, the surviving cluster is re-measured from what is left of it, and the URL that was wrong carries a dated correction note that names the outlet that was mis-grouped. Nothing is deleted, so the split can be undone.
2. **The pipeline orchestrator (CUR-01…CUR-15, CON-15):** `processCurationPipeline` walks unclustered stories through candidate lookup, the five anti-merge guards, the BGE-M3 embedding confirmation, four-stage section resolution, bilingual gazetteer tagging, cross-country edition flagging and the 18-hour decaying trending score — and re-measures a cluster every time its membership changes.
3. **The proof:** both behaviours are tested against a **real database built from the project's own schema** (`shared/db/0001_init.sql` + `shared/db/seed.sql`), not against a mock. Fifteen real stories go in and ten curated clusters come out, with every invariant asserted against the rows that were actually written.

**The single most important finding of this plan is a measurement, not a feature.** The four 16-bit LSH bands that the architecture relies on to find merge candidates have **zero recall on paraphrased headlines**: of the 92 labelled same-event pairs in `tests/fixtures/curation/headline-pairs.json`, **none** collide on any of the four bands (median Hamming distance 26 bits; random fixture pairs collide at 1 in 1,209). A pipeline built on the band probe alone would never have merged anything, and the product would have been a single-outlet feed. The pipeline therefore draws its candidates from the union of the band probe and a **time-windowed scan bounded by the merge window**, which is index-driven and reads a day's worth of rows rather than the table. This is recorded in full below because it changes what the four band indexes are for.

---

## Completed Tasks

### Task 1: Reversible cluster split workflow and dated correction note

**`src/curation/split.ts`** — `splitCluster(oldClusterId, storyId, repository, nowIso?)`:
- Validates that the cluster has at least two member stories and that the story is one of them; refuses both cases with an explicit message.
- Resolves the **real outlet name** through the repository and writes the standard dated note: `Correction (YYYY-MM-DD): An earlier version of this story incorrectly grouped coverage from [Outlet]. The coverage has been separated into its own report.`
- Generates an immutable, unique slug for the new cluster.
- **Re-measures the surviving cluster** from the members that remain: distinct outlets, mention count, earliest publication time, canonical headline (via the shared `selectPrimaryHeadline` rule), canonical excerpt (of the promoted primary) and the trending score.
- Returns `{ originalClusterId, newClusterId, newClusterSlug, correctionId, correctionNote }`.

**`apps/worker/src/db/repository.ts`** — `recordClusterSplit` performs the whole split in one transaction:
1. Reads the old cluster's slug **and its desk assignment**.
2. Inserts the new cluster, **inheriting the desk** — a split never re-classifies a story.
3. Moves the story's `cluster_id`, deletes its old `story_sources` row and inserts the new one, so the attribution list is carried across rather than duplicated.
4. Promotes a new primary on the surviving cluster and re-ranks its member rows (rank 0 is the primary source).
5. Recalculates the surviving cluster's counts from `story_sources` (the member list of record), its publication time as `MIN(published_at)` over the survivors, its canonical text and its score, and **drops its Editor's Picks rank when it falls below two distinct outlets** (CUR-10).
6. Inserts the dated correction row into `corrections`, attached to the **old** cluster's permanent URL — that is the page that was wrong.

**`scripts/curation/split-cluster.ts`** — the administrative CLI, `npm run cluster:split -- <clusterId> <storyId>`. It builds a binding (the local D1 mirror by default, the live database with `--remote`) and hands it to the repository. **The CLI holds no query of its own** — the repository remains the only module that does (OPS-14).

**`tests/curation/split.test.ts`** — 11 tests: the guard cases, the exact note template, the outlet-name fallback, and five database-backed integration tests (attribution survives, both clusters are re-measured, the correction row exists with the exact note, no story row is ever deleted, and the two refusal cases).

**`tests/curation/split-cli.test.ts`** — 2 tests: the tool runs as a command against a real database file and leaves the right rows behind; and it refuses to run without both arguments.

### Task 2: End-to-end curation pipeline orchestrator

**`src/curation/pipeline.ts`** — `processCurationPipeline(repository, embeddingProvider, options)`:
1. Reads unclustered stories ordered by `published_at ASC`.
2. Computes the SimHash-64 and its four LSH bands and **writes the bands onto the story row**, so a later story can find it.
3. Collects merge candidates from the **union** of the band probe and the time-windowed scan, dropping rows that are not clustered and the story itself.
4. Resolves each candidate's gazetteer entities, so the disjoint-entity guard (CUR-05) can fire on real entity sets rather than on empty lists.
5. Evaluates the candidates through the five anti-merge guards and the BGE-M3 cosine confirmation.
6. Merges into an existing cluster or opens a new one, and **re-measures the cluster from its member list** — counts, earliest publication time (CON-15), canonical headline, trending score and editorial rank.
7. Resolves the desk through the four-stage cascade, tags gazetteer entities, determines the edition flags and persists the taxonomy.

**Repository methods added for the pipeline:** `listUnclusteredStories`, `findStoryById`, `findSourceById`, `listSections`, `listEditions`, `findRecentCandidateStories`, `updateStoryFingerprint`, `findEntityIdsBySlugs`, `createClusterWithStory`, `addStoryToCluster`, `updateClusterCuration`.

### Task 3: Comprehensive pipeline integration test

**`tests/curation/curation-pipeline.test.ts`** — 11 tests over a fifteen-story batch (five same-event pairs and five singletons, in English and Hindi, across five outlets in four countries):
- fifteen stories become ten clusters: five two-outlet and five single-outlet;
- every outlet attribution row survives, and no row points at a story outside its cluster;
- every cluster has a canonical headline, a section in 1–8 and a valid section method;
- **CON-15** — every cluster's publication time equals the earliest member's;
- **CUR-10** — multi-outlet clusters carry an editorial rank, single-outlet clusters carry none;
- **CUR-13** — a cross-country cluster is flagged into more than one edition;
- **CUR-12** — gazetteer entities are attached to the story rows, and every join row points at a real story;
- the LSH bands are written onto every processed row;
- **CUR-05** — two stories with disjoint entity sets stay in two clusters even when the embedding model says they are near-identical;
- a merged cluster can be split back apart, with the correction note recorded.

**`tests/curation/d1-harness.ts`** — the shared test harness: an in-memory (or file-backed) SQLite database built from the project's own schema and seed, behind a binding adapter that speaks the D1 shape. The adapter's `bind` returns a **new** statement, exactly as the D1 binding does, because a repository that prepares once and binds many times depends on that.

---

## Verification

| Command | Result |
|---|---|
| `npm test -- --run tests/curation/split.test.ts` | 11 / 11 passed |
| `npm test -- --run tests/curation/split-cli.test.ts` | 2 / 2 passed |
| `npm test -- --run tests/curation/curation-pipeline.test.ts` | 11 / 11 passed |
| `npm test -- --run apps/worker/src/db/__tests__/repository.test.ts` | 29 / 29 passed |
| `npm test -- --run` (whole repository) | **349 / 349 passed across 34 files** (was 325 / 32) |
| `npm run typecheck` | clean, zero errors |
| `npm run build` | clean, 1 page built |

The repository purity scan (OPS-14) passes: `apps/worker/src/db/repository.ts` remains the only module in the tree that contains a query, and the split CLI is scanned and clean.

---

## Deviations from the Plan

The plan was written against an unverified implementation. Sixteen defects were found and fixed while verifying it against the real schema. The rules below are the executor's deviation rules.

### Auto-fixed issues

**1. [Rule 1 — Bug] `listUnclusteredStories` selected five columns the schema does not have**
- **Found during:** task 2 verification against the real database.
- **Issue:** the projection asked for `external_id`, `canonical_url`, `word_count`, `char_count` and `sentence_count`. The `stories` table has `external_guid`, `slug` and `fetched_at`, and none of the other three. The query would have failed on every call.
- **Fix:** the projection and the `StoryRow` type now mirror the table exactly.
- **Files modified:** `apps/worker/src/db/repository.ts`

**2. [Rule 1 — Bug] Cluster inserts omitted `first_seen_at` and `last_seen_at`**
- **Issue:** the schema declares both `TEXT NOT NULL` with no default, and neither `createClusterWithStory` nor `recordClusterSplit` supplied them. Every cluster insert would have failed.
- **Fix:** both inserts now stamp them.
- **Files modified:** `apps/worker/src/db/repository.ts`

**3. [Rule 1 — Bug] The split re-classified the story it detached**
- **Issue:** `recordClusterSplit` hard-coded the new cluster's desk to section 1 with `section_method = 'split'` — a value the schema does not allow, and a story whose desk was changed by being separated from its wrong neighbours.
- **Fix:** the desk, its confidence and its method are inherited from the cluster the story came out of.
- **Files modified:** `apps/worker/src/db/repository.ts`

**4. [Rule 1 — Bug] The split did not re-measure the surviving cluster**
- **Issue:** the plan's behaviour test 4 requires the canonical headline, canonical excerpt, outlet count and trending score to be recalculated for **both** clusters. The implementation recalculated only the old cluster's counts.
- **Fix:** the surviving cluster's canonical headline, excerpt, counts, publication time, score and editorial rank are all recalculated, and a cluster that drops below two outlets loses its Editor's Picks rank (CUR-10).
- **Files modified:** `apps/worker/src/db/repository.ts`, `src/curation/split.ts`

**5. [Rule 1 — Bug] `addStoryToCluster` never bumped the member counts**
- **Issue:** the method attached the story and inserted its attribution row, but left `outlet_count`, `mention_count` and `published_at` untouched — so a merged cluster still claimed one outlet and a publication time that was not the earliest member's. CON-15 and CUR-10 were both violated by every merge.
- **Fix:** the counts are recomputed from `story_sources` and the publication time only ever moves backwards.
- **Files modified:** `apps/worker/src/db/repository.ts`

**6. [Rule 1 — Bug] The taxonomy join rows were keyed by the cluster id**
- **Issue:** `assignClusterTaxonomy` wrote the cluster id into `story_topics.story_id` and `story_entities.story_id`, which reference `stories(id)`. A cluster id is not a story id, so every write was a foreign-key violation and attached a cluster's taxonomy to an unrelated story.
- **Fix:** the join rows are written for every member story of the cluster. The 03-04 test's binding assertions were updated to match.
- **Files modified:** `apps/worker/src/db/repository.ts`, `apps/worker/src/db/__tests__/repository.test.ts`

**7. [Rule 1 — Bug] The pipeline fabricated entity ids**
- **Issue:** entities were attached with `entityId: i + 1` — whatever entity happened to hold that row id.
- **Fix:** `findEntityIdsBySlugs` resolves the gazetteer slugs to their real row ids, and only entities that exist are attached.
- **Files modified:** `apps/worker/src/db/repository.ts`, `src/curation/pipeline.ts`

**8. [Rule 1 — Bug] The pipeline never wrote the LSH bands**
- **Issue:** the pipeline computed the fingerprint and threw it away. Every row kept its zeroed bands, so the band index could never match anything and **no story could ever have been merged**. Phase 2's ingest also writes zeros.
- **Fix:** `updateStoryFingerprint` writes the four bands onto the row.
- **Files modified:** `apps/worker/src/db/repository.ts`, `src/curation/pipeline.ts`

**9. [Rule 1 — Bug] The candidate evaluation ran with empty entity lists**
- **Issue:** LSH candidates were passed to the engine with `entities: []`, so the disjoint-entity guard could never fire and CUR-05 was unenforceable in the pipeline.
- **Fix:** each candidate's gazetteer entities are resolved (and cached) before evaluation.
- **Files modified:** `src/curation/pipeline.ts`

**10. [Rule 2 — Missing critical functionality] The correction note named a source id, not an outlet**
- **Issue:** the note read "coverage from outlet (source 10)". The note is published to a reader on a permanent URL; it must name the outlet.
- **Fix:** `findSourceById` resolves the real name, with `source <id>` as the fallback when the outlet cannot be resolved.
- **Files modified:** `src/curation/split.ts`, `apps/worker/src/db/repository.ts`

**11. [Rule 2 — Missing critical functionality] The split could not set the detached story's excerpt**
- **Issue:** the excerpt lives on the `stories` row, not on `story_sources`, so the new cluster could only ever carry a null excerpt.
- **Fix:** `findStoryById` gives the split the story's headline, excerpt and publication time.
- **Files modified:** `apps/worker/src/db/repository.ts`, `src/curation/split.ts`

**12. [Rule 2 — Missing critical functionality] Section and edition ids were hard-coded**
- **Issue:** the pipeline carried a literal `politics → 1 … entertainment → 8` map and a literal `uk → 1 … in → 7` map. A section added to the seed would have been unaddressable.
- **Fix:** `listSections` and `listEditions` read the ids from the database.
- **Files modified:** `apps/worker/src/db/repository.ts`, `src/curation/pipeline.ts`

**13. [Rule 2 — Missing critical functionality] The administrative CLI could never run**
- **Issue:** the inherited CLI bound a stub whose `prepare` always threw, so `npm run cluster:split` always failed with "No D1 database binding".
- **Fix:** the CLI now builds a real binding — the local D1 mirror through `node:sqlite`, or the live database through the Cloudflare API — and the repository does the work.
- **Files modified:** `scripts/curation/split-cluster.ts`

**14. [Rule 3 — Blocking issue] The band probe has no recall on paraphrased headlines**
- **Issue:** measured on the labelled fixture — **0 of 92 same-event pairs** collide on any of the four 16-bit bands; the median Hamming distance is 26 bits and random fixture pairs collide at 1 in 1,209. A band is 16 bits wide, so two paraphrases must agree on 16 specific bits, which a distance of 26 makes vanishingly unlikely. The pipeline built on the band probe alone would have produced fifteen clusters from fifteen stories: the product would have been a single-outlet feed, which is the one thing this project exists not to be.
- **Fix:** the pipeline unions the band probe with `findRecentCandidateStories`, a time-windowed scan bounded by the merge window and driven by `idx_stories_published`. The band indexes are retained and still serve the band path; the window is what guarantees recall. **The D1 cost is bounded:** at 120 stories a day the window holds ~120 rows, so one scan per incoming story reads ~14,400 rows a day against a 5,000,000-row budget — 0.3%.
- **Files modified:** `apps/worker/src/db/repository.ts`, `src/curation/pipeline.ts`
- **Carried forward:** the band definition itself is a Phase 3 design question this plan did not reopen. A band width that cannot be matched by a paraphrase is a poor index; if the recall is to be restored without the window, the fix belongs in the band definition (more, narrower bands) and in the schema that carries them.

**15. [Rule 3 — Blocking issue] `tsx` was invoked by two package scripts but was not a dependency**
- **Issue:** `npm run ingest:local` (Phase 2) and `npm run cluster:split` both invoke `tsx`, which was in neither `package.json` nor the lockfile. Both scripts depended on npx fetching it at run time.
- **Fix:** `tsx@4.22.4` is now a pinned devDependency and the lockfile is updated.
- **Files modified:** `package.json`, `package-lock.json`

**16. [Rule 1 — Bug] The 64-bit SimHash could not round-trip through the datastore**
- **Issue:** a 64-bit fingerprint exceeds the 53-bit exact range of a JSON number. D1 returns it as a lossy double; a strict SQLite binding refuses the value outright (`RangeError: Value is too large to be represented as a JavaScript number`). Writing the column would have stored a number that is not the fingerprint.
- **Fix:** the pipeline writes the **four 16-bit bands**, which together carry all 64 bits of the fingerprint, and leaves `stories.simhash` alone. Nothing is lost: the fingerprint is fully recoverable from the bands.

### Structural decisions

- **The curation modules live at the repository root** (`src/curation/`, `tests/curation/`, `config/stoplist.ts`, `config/gazetteer.ts`, `config/lexicon.ts`) rather than under `shared/`, which differs from the Phase 1 architecture of record. **This is deliberate and must not be "fixed" by accident:** the reconciliation places all transformation in CI (Node), not in the edge runtime, and the edge runtime has no use for any of these modules. **No curation module needs to be reachable from the edge runtime today** — the repository is the only thing the Worker touches, and it does not import any of them.
- **The repository file carries both tasks' changes into one commit.** `apps/worker/src/db/repository.ts` is a single file that grew a split contract and a pipeline contract at the same time; splitting it across two commits would have left the first commit uncompilable. The task boundary is preserved in every other file.
- **The split is committed with the pipeline's repository methods** for the same reason; the commit message says so.

---

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| Topic ids are always empty | `src/curation/pipeline.ts` | The pipeline passes `[]` for topic ids. There is no topic matcher in `config/lexicon.ts` — only `SECTION_KEYWORDS` — so **CUR-11's topic half is not implemented**. Entities, methods and confidences are implemented and tested. **A phase-level gap, not a 03-05 gap:** the plan did not specify topic tagging, and the roadmap's Phase 3 exit criteria do list topics. |
| The editorial rank value is the qualifying rank, not an ordering | `src/curation/pipeline.ts` | `evaluateEditorialRank(outletCount)` returns `1` for a cluster with two or more outlets and `null` below that, which is the committed ranking module's own contract. The **absolute** ordering across clusters belongs to the scoring/finalise pass that renumbers the front page; this plan assigns the qualification. |
| `stories.simhash` is not written | `apps/worker/src/db/repository.ts` | See deviation 16. The four band columns carry the same 64 bits losslessly. |
| The CLI's `--remote` path is untested in CI | `scripts/curation/split-cluster.ts` | No Cloudflare API token exists in the build environment. The local path is tested end to end as a command. **The remote path must be rehearsed against a staging database before it is pointed at production.** |
| The remote path's `batch` is not transactional | `scripts/curation/split-cluster.ts` | The Cloudflare query endpoint runs one statement at a time. On the live database the split's statements are therefore a sequence of transactions, not one. The split is written so that a failure leaves the story attached to the old cluster with its attribution row intact (the move is the last irreversible step) — but this is a weaker guarantee than the local path's, and it is stated here rather than assumed. |

---

## Threat Surface

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privileged-admin | `scripts/curation/split-cluster.ts` | The CLI executes privileged statements against the live database. Mitigation: the repository remains the only module holding a query, the tool refuses to run without explicit arguments, and every split writes a dated correction row that is independently auditable (T-03-14). |
| threat_flag: non-transactional-remote-batch | `scripts/curation/split-cluster.ts` | The remote path executes the split's statements as separate transactions. Mitigation: the ordering keeps the irreversible move last, and the correction row is written last of all, so a partial run is visible rather than silent. |
| threat_flag: candidate-window-scan | `apps/worker/src/db/repository.ts` | `findRecentCandidateStories` reads the merge window rather than an index probe. Mitigation: the window bounds the scan, `idx_stories_published` drives it, and the projected cost is 0.3% of the daily D1 read budget. |

**No threat-flagged surface was added beyond the plan's own.** The three are the plan's administrative CLI and the candidate query the plan's own acceptance criteria required.

---

## Findings Carried Forward

- **Phase 1's open blocker is untouched and does not affect this plan.** The four `NO ACTION` foreign keys to `stories(id)` still break the 30-day raw-mention prune. **The split does not depend on that prune:** it never removes a `stories` row, it moves the row's `cluster_id` and migrates its `story_sources` row, so a split can be undone. Verified by a test that asserts the story count is unchanged after a split.
- **A second schema-level conflict, found in this plan:** `stories.cluster_id` references `clusters(id)`, and the project's convention is `cluster_id = 0` for "not yet clustered" — a cluster that does not exist. The convention therefore violates its own foreign key. The local ingest runner works around it with `PRAGMA foreign_keys = OFF`, and the test harness does the same; on D1 the same insert would be refused if foreign keys are enforced. **This is a Phase 1 schema question, not a 03-05 one**, and it is recorded here so the gap-closure pass sees it alongside the prune blocker.
- **S-7 is still marked "Not started" in `STATE.md`.** Plan 03-02 delivered the labelled fixture and the measured precision/recall benchmark against it, which is the substance of S-7; the rollup in `spikes/RESULTS.md` has not been updated to say so. Left alone here because the rollup is the phase gate and belongs to the phase.
- **The `newsroom@example.invalid` contact address in `shared/config/site.ts`** was not touched and was not copied into any new file.

---

## Key Artifacts

- `src/curation/split.ts` — the reversible split and the dated correction note
- `src/curation/pipeline.ts` — the end-to-end curation orchestrator
- `scripts/curation/split-cluster.ts` — the administrative CLI (`npm run cluster:split`)
- `apps/worker/src/db/repository.ts` — the datastore contract: `recordClusterSplit`, `listUnclusteredStories`, `createClusterWithStory`, `addStoryToCluster`, `updateClusterCuration`, `findRecentCandidateStories`, `findStoryById`, `findSourceById`, `listSections`, `listEditions`, `findEntityIdsBySlugs`, `updateStoryFingerprint`
- `tests/curation/split.test.ts`, `tests/curation/split-cli.test.ts`, `tests/curation/curation-pipeline.test.ts` — 24 tests over a real schema
- `tests/curation/d1-harness.ts` — the shared database harness

## Commits

- `475e747` — `feat(curation): reversible cluster split with dated correction notes (CUR-02, CUR-03)`
- `4558ec6` — `feat(curation): end-to-end curation pipeline orchestrator (CUR-01..CUR-15, CON-15)`
- `9295d63` — `docs(curation): add 03-05-SUMMARY.md`

## Self-Check: PASSED

Every file this plan claims to have created exists, and every commit it claims to have made is in the history:

| Claim | Check | Result |
|---|---|---|
| `src/curation/split.ts` | file present | ✅ |
| `src/curation/pipeline.ts` | file present | ✅ |
| `scripts/curation/split-cluster.ts` | file present | ✅ |
| `apps/worker/src/db/repository.ts` | file present, purity scan green | ✅ |
| `tests/curation/split.test.ts` | file present, 11 tests green | ✅ |
| `tests/curation/split-cli.test.ts` | file present, 2 tests green | ✅ |
| `tests/curation/curation-pipeline.test.ts` | file present, 11 tests green | ✅ |
| `tests/curation/d1-harness.ts` | file present | ✅ |
| `475e747`, `4558ec6`, `9295d63` | in `git log --all` | ✅ |
| `package.json` `cluster:split` script | present and executable | ✅ |

**Nothing is missing.** The working tree is clean and the whole repository is green: 349 tests across 34 files, `npm run typecheck` clean, `npm run build` clean.
