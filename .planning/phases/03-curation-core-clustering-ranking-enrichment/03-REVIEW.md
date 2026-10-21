---
phase: 03-curation-core-clustering-ranking-enrichment
reviewed: 2026-10-22T03:19:42Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - apps/worker/src/db/__tests__/repository.test.ts
  - apps/worker/src/db/repository.ts
  - config/gazetteer.ts
  - config/lexicon.ts
  - config/stoplist.ts
  - package.json
  - scripts/curation/split-cluster.ts
  - src/curation/cluster-engine.ts
  - src/curation/embedding-provider.ts
  - src/curation/guards.ts
  - src/curation/pipeline.ts
  - src/curation/ranking.ts
  - src/curation/sections.ts
  - src/curation/simhash.ts
  - src/curation/split.ts
  - src/curation/tagging.ts
  - tests/curation/curation-pipeline.test.ts
  - tests/curation/guards.test.ts
  - tests/curation/merge-benchmark.test.ts
  - tests/curation/ranking.test.ts
  - tests/curation/sections.test.ts
  - tests/curation/simhash.test.ts
  - tests/curation/split.test.ts
  - tests/curation/tagging.test.ts
  - tests/fixtures/curation/headline-embeddings.json
  - tests/fixtures/curation/headline-pairs.json
findings:
  critical: 6
  warning: 17
  info: 6
  total: 29
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-22T03:19:42Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 3 is the product's differentiator, and the shape of the code is right: the merge rule is
gated by a time window, a disjoint-entity block and a shared-anchor requirement before the
embedding is ever consulted; the language boundary is absolute; the split does not delete a
`stories` row; every value in the repository is bound; the only string interpolation into SQL
is the `countRows` table name, which is checked against an allow-list first. I found **no SQL
injection**, **no `SELECT *`**, and **no bare free-tier ceiling numbers** in `config/` — the
ceiling-literal scan scope is clean.

The defects are structural, and they are concentrated in the two places the phase is judged on:
**candidate generation** and **the precision/recall gate**.

1. The merge-window candidate scan truncates to the **newest 200 raw rows** while the pipeline
   processes the **oldest** unclustered rows. Once a 24-hour window holds more than 200 raw
   `stories` rows for a language — which the project's own ingest cap makes certain (~750
   rows/day from 30 seeded sources) — the merge path produces **zero merges**. I reproduced it:
   20 same-event pairs merged when the window fit under the limit, **0 merged** when it did not.
   The product's core function silently disappears and the site degrades into a thin restatement
   of one source, which is exactly the scaled-content-abuse outcome the project decided to
   avoid.
2. The 98%/85% gate is measured against a configuration the pipeline never runs. The benchmark
   injects hand-authored `entitiesA`/`entitiesB`; the pipeline derives entities from a 50-entry
   gazetteer that covers only **23.8%** of the fixture's headlines and knows **62 of the 496**
   declared entity mentions. Re-running the identical benchmark with gazetteer-derived entities
   gives **precision 97.40%** and **recall 81.52%** — the gate fails — and two `disjoint_entity`
   pairs **merge**, which is the one thing the phase says must never happen.
3. The remote (production) split runs its statements as **separate transactions** and moves the
   attribution row with `DELETE` + `INSERT`. A failure between them **permanently destroys the
   outlet attribution** the split exists to protect.
4. `"WHO"` in the gazetteer matches the English word **"who"** (the case-sensitive acronym rule
   only applies to names of length ≤ 2), so any headline containing "who" is tagged as the World
   Health Organization and, because that entity is supranational, is pushed onto **all seven
   front pages**.
5. The `in-hi` edition can **never** receive a cluster: `COUNTRY_TO_EDITION` maps `IN → 'in'`
   and `ENGLISH_EDITIONS` omits `'in-hi'`. Hindi stories are pushed onto the English UK and
   India front pages instead, and the Hindi edition is permanently empty.
6. The split depends on `stories` rows that the documented design **prunes after 30 days**, so
   the long-lag mis-merges that most need correcting can never be split, and the
   `story_sources` re-insert would violate the `stories(id)` foreign key that production D1
   enforces but the test harness disables.

None of the 111 tests fail — that is itself the finding: the suite asserts the implementation's
own behaviour rather than the production configuration, and the harness turns off the very
foreign keys and the transactionality that production has.

### What I verified and found correct

- `evaluateAntiMergeGuards` ordering is right: language → time window → disjoint entities →
  shared anchor → ordinal/round → aspect markers, with the embedding consulted last.
- `shouldMergeStories` returns `confidence: 0` on every guard rejection and `different_languages`
  short-circuits before any guard runs.
- `updateClusterCuration` and `addStoryToCluster` both enforce CON-15 structurally with
  `published_at = MIN(published_at, ?)`, so a cluster's publication time can only move
  backwards to the earliest member.
- The split's `editorial_rank = CASE WHEN ? < 2 THEN NULL ELSE editorial_rank END` correctly
  drops an Editor's Pick when the surviving cluster falls below two outlets (CUR-10 on split).
- The correction note names the real outlet via `findSourceById` (the previous "source 10"
  defect is genuinely fixed) and is attached to the **old** cluster's permanent slug, which is
  the page that was wrong.
- The union of the band probe and the window scan is deduped correctly through a `Map` keyed on
  candidate id — the two paths cannot double-count.
- Every filter in the new repository methods is index-covered: `idx_stories_published`,
  `idx_stories_band0..3`, `idx_stories_cluster`, the `story_sources` PK and
  `idx_edition_clusters_edition`.
- `findEntityIdsBySlugs` builds an `IN` list from placeholders only.

---

## Critical Issues

### CR-01: The merge candidate scan truncates before the "already clustered" filter, so the merge path collapses to zero past 200 rows in the window

**File:** `src/curation/pipeline.ts:150-170`, `apps/worker/src/db/repository.ts:921-940`
**Issue:**

`findRecentCandidateStories` returns the **newest** rows in the merge window:

```sql
WHERE published_at >= ? AND language = ?
ORDER BY published_at DESC
LIMIT ?
```

`listUnclusteredStories` returns the **oldest** unclustered rows:

```sql
WHERE cluster_id = 0 ORDER BY published_at ASC LIMIT ?
```

and the pipeline filters `cluster_id <= 0` in JavaScript, *after* the SQL `LIMIT` has already
been applied. So once the window contains more than `LIMIT` rows, the rows the pipeline is
currently working on are excluded from the candidate set — including the rows it clustered
moments earlier in the same batch. The candidate set collapses to whatever is newest, which is
exactly what has not been processed yet.

Reproduction (20 real same-event pairs from the labelled fixture, plus filler rows, run
through `processCurationPipeline` against the project's own schema):

```
A) window fits inside the LIMIT (200)
   stories=60  filler=20  -> clustersCreated=41  storiesMerged=19  twoOutletClusters=19
B) window exceeds the LIMIT (200)
   stories=290 filler=250 -> clustersCreated=100 storiesMerged=190 twoOutletClusters=0
```

In case B **none** of the 20 same-event pairs merged. The 190 "merges" are the filler rows
merging with each other.

This is not a hypothetical volume. `src/ingest/normalizer.ts:121` caps each feed at 25 items,
the seed registers 30 sources, and the roadmap plans ~50 feeds — that is **750+ raw
`stories` rows per day**, of which the English share alone is several times the limit of 200.
The `stories` table holds *raw mentions*, one row per (outlet, item), not published clusters,
so the window is measured in raw rows. The merge path fails on day one in production.

**Fix:** move the filter into the query and stop ordering by recency away from the work
front. The candidate set should be the *clustered* rows near the incoming story, not the newest
rows in the window:

```ts
async findRecentCandidateStories(
  sinceIso: string,
  language: string,
  limit: number,
): Promise<LshCandidateRow[]> {
  const result = await db
    .prepare(
      `SELECT id, cluster_id, headline, excerpt, published_at, simhash, language, country_code, is_primary
         FROM stories
        WHERE cluster_id > 0
          AND published_at >= ?
          AND language = ?
        ORDER BY published_at ASC
        LIMIT ?`,
    )
    .bind(sinceIso, language, limit)
    .all<LshCandidateRow>();
  return result.results ?? [];
}
```

`ORDER BY published_at ASC` puts the rows closest to the incoming story first; with
`cluster_id > 0` in the predicate the `LIMIT` now truncates *usable* candidates rather than
unprocessed ones. `findLshCandidates` (`repository.ts:646-667`) has the identical
`ORDER BY published_at DESC LIMIT 50` shape and needs the same treatment. Add a regression
test that seeds more than the limit of rows in the window and asserts that same-event pairs
still merge — the current suite cannot catch this because its fixtures are all under 20 rows.

---

### CR-02: The precision/recall gate measures a configuration the pipeline never runs; under the production configuration the gate fails and disjoint-entity pairs merge

**File:** `tests/curation/merge-benchmark.test.ts:153-251`, `src/curation/pipeline.ts:127-134, 176-195`
**Issue:**

The benchmark builds its inputs from the fixture's hand-authored entity lists:

```ts
const storyA: CandidateStoryInput = {
  headline: pair.headlineA,
  publishedAt: pair.pubDateA,
  entities: pair.entitiesA,   // <-- hand-authored
  language: pair.language,
};
```

The pipeline builds its entity lists from the gazetteer:

```ts
const entitiesFor = (headline: string, language: 'en' | 'hi'): string[] => {
  const slugs = matchGazetteerEntities(headline, language).map((m) => m.entity.slug);
  ...
};
```

These are not the same input. Measured against `config/gazetteer.ts`:

- The gazetteer matches **101 of 424** fixture headline occurrences (**23.8%**).
- Of the **496** entity mentions the fixture declares, only **62** exist in the gazetteer;
  **285** distinct slugs (`andrew-bailey`, `rachel-reeves`, `gatwick-airport`, `met-police`,
  `ons`, `tata-steel`, `jerome-powell`, `supreme-court`, `boeing`, `spacex`, …) are unknown to it.

So the benchmark measures a configuration the pipeline can never reproduce, and it reports a
flattering 100% / 100%. Re-running the identical benchmark with gazetteer-derived entity sets
(exactly what the pipeline computes):

```
mode=declared   TP=92 FP=0  TN=120 FN=0   precision=100.00%  recall=100.00%
mode=gazetteer  TP=75 FP=2  TN=118 FN=17  precision= 97.40%  recall= 81.52%
```

Both gate thresholds fail (`precision >= 0.98`, `recall >= 0.85`), and the benchmark's own
defensive assertion `expect(categoryStats['disjoint_entity'].falsePositives).toBe(0)` fails with
2. The two false positives are precisely the case the phase says must never happen — two
stories with disjoint entity sets that merged:

```
FP DE-DISJ-208  "Premier Danielle Smith announces energy deregulation measures in Edmonton"
             ||  "Premier Doug Ford outlines infrastructure expansion priorities in Ontario"
FP DE-DISJ-212  "उत्तर प्रदेश के मुख्यमंत्री योगी आदित्यनाथ ने विकास परियोजनाओं का लोकार्पण किया"
             ||  "दिल्ली के मुख्यमंत्री अरविंद केजरीवाल ने शिक्षा सुधारों पर प्रेस वार्ता की"
```

The 17 false negatives are the mirror failure — "Department of Justice files antitrust suit"
vs "DOJ sues to block hospital network acquisition" share no token longer than five characters
and no gazetteer entity, so the merge is missed.

**Fix:** the benchmark must exercise the entity resolution the pipeline uses. Either
(a) derive the entity sets inside the benchmark with `matchGazetteerEntities` so the gate
measures the shipped configuration, or (b) add a second, parallel gate that measures the
gazetteer configuration and re-baseline the thresholds against it. Then fix the precision and
recall failures the re-baselined gate exposes (see WR-04 for the shared-anchor weakness that
produces the false positives, and CR-04/WR-06 for the gazetteer coverage and acronym
problems that cause the false negatives). A gate that cannot fail is not a gate.

---

### CR-03: The remote split is not transactional and can destroy the attribution row it exists to protect

**File:** `apps/worker/src/db/repository.ts:1238-1302`, `scripts/curation/split-cluster.ts:221-230`
**Issue:**

`recordClusterSplit` moves the attribution row with a `DELETE` followed by an `INSERT`:

```sql
DELETE FROM story_sources WHERE cluster_id = ? AND story_id = ?
...
INSERT INTO story_sources (cluster_id, story_id, source_id, rank, headline, url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)
```

The local binding wraps `db.batch` in `BEGIN`/`COMMIT`/`ROLLBACK`
(`split-cluster.ts:122-135`). The **remote** binding does not:

```ts
async batch(statements: unknown[]) {
  // The Cloudflare query endpoint runs one statement at a time, so a
  // batch here is a sequence of transactions rather than one.
  const results: unknown[] = [];
  for (const statement of statements as Array<{ run(): Promise<unknown> }>) {
    results.push(await statement.run());
  }
  return results;
}
```

Every statement in the split — the new cluster insert, the story move, the attribution
delete, the attribution insert, the primary re-rank, the old cluster re-measure and the
correction insert — is its own transaction against the live database. A network blip, an API
rate limit or a process kill between the `DELETE` and the `INSERT` **permanently destroys the
outlet's headline and attribution URL** for that story — the one piece of data the split
exists to preserve, and the one the architecture calls "retained permanently". A failure
earlier in the sequence leaves a half-split cluster: a new cluster with no members, the story
pointing at it, and the old cluster's attribution row gone.

The operator rehearses against the local mirror, which *is* transactional. The rehearsal
therefore cannot reproduce the production failure mode, which is the only mode that matters
here.

**Fix:** (a) make the remote path transactional — route the split through a form of the D1
API that executes a statement list as one transaction, or through `wrangler d1 execute` with a
multi-statement file; and (b) remove the destructive window entirely by making the attribution
move an `UPDATE` of `cluster_id` rather than a `DELETE` + `INSERT`, so no state exists in which
the row is absent:

```sql
UPDATE story_sources
   SET cluster_id = ?
 WHERE cluster_id = ? AND story_id = ?
```

The re-rank statement then only has to fix `rank` on the old cluster, and the new row's rank
is already 0. With an `UPDATE` there is no statement whose failure loses data, and the whole
split becomes idempotent under re-run.

---

### CR-04: `"WHO"` in the gazetteer matches the English word "who" — every such headline is tagged as the World Health Organization and pushed onto all seven front pages

**File:** `config/gazetteer.ts:224-230`, `src/curation/tagging.ts:62-77, 182-196`
**Issue:**

`buildEntityRegex` only applies the case-sensitive acronym rule to names of **two characters or
fewer**:

```ts
if (name.length <= 2 && name === name.toUpperCase()) {
  return new RegExp(`\\b${escaped}\\b`);
}
return new RegExp(`\\b${escaped}\\b`, 'i');
```

`"WHO"` is three characters, so it falls through to the **case-insensitive** branch and becomes
`/\bWHO\b/i` — which matches `"who"`. The World Health Organization is also marked
`isSupranational: true`, so `determineEditionFlags` adds **all seven English editions** at
confidence 0.85 for any headline that contains the word.

Reproduced:

```
matchGazetteerEntities('Who will win the election?', 'en')              -> world-health-organization
matchGazetteerEntities('Man who led the charge tells his story', 'en')   -> world-health-organization
```

An unrelated local story is therefore tagged with a health organisation (which generates an
entity landing page), and is pushed onto every edition's front page. That is reader-visible
incorrect behaviour and it poisons the entity index that CUR-12 exists to protect.

**Fix:** make the acronym rule depend on the *shape* of the name, not its length, and require
the match to be genuinely upper-case:

```ts
// An all-caps token of any length is an acronym: match it case-sensitively so
// "WHO" never matches the English word "who".
const isAcronym = /^[A-Z][A-Z0-9.]{0,4}$/.test(name);
if (isAcronym) {
  return new RegExp(`\\b${escaped}\\b`);
}
```

Apply the same rule to aliases (`AP`, `UN`, `EU`, `IMF`, `ECB`, `NATO`, `RBI`, `ISRO`, `NASA`,
`NHS`, `WHO`). `AP` and `UN` and `EU` are already safe by virtue of being two characters; the
rest are not. Add a regression test asserting that `"who"`, `"Who"`, `"whom"` and
`"insurance"` do not match `world-health-organization`, and that `"WHO"` and
`"World Health Organization"` do.

---

### CR-05: The `in-hi` edition can never receive a cluster; Hindi stories are pushed onto the English front pages

**File:** `src/curation/tagging.ts:34-52, 158-205`, `src/curation/pipeline.ts:230-234, 348-355`
**Issue:**

```ts
export const COUNTRY_TO_EDITION: Record<CountryCode, EditionId> = {
  GB: 'uk', US: 'us', AU: 'au', CA: 'ca', IE: 'ie', NZ: 'nz', IN: 'in',
};

export const ENGLISH_EDITIONS: readonly EditionId[] = [
  'uk','us','au','ca','ie','nz','in',
];
```

`'in-hi'` is a valid `EditionId` (it is in `shared/config/editions.ts`) and it is seeded
(`shared/db/seed.sql` inserts `('in-hi', 'India (Hindi)', 'IN', 'hi', ...)`), but **no code path
can emit it**: the country map has one entry per country, the supranational and wire lists
enumerate only the English editions, and nothing else constructs an `EditionFlag`. The pipeline
filters the flags through `editionIdBySlug.has(flag.editionId)`, so `'in-hi'` is permanently
empty.

Reproduced by running the pipeline over a Hindi pair (BBC Hindi + Amar Ujala) and reading
`edition_clusters`:

```
1 | uk | Bank of England cuts interest rate to 4.75 percent
2 | in | इसरो ने गगनयान मानव अंतरिक्ष मिशन के लिए महत्वपूर्ण रॉकेट परीक्षण सफलतापूर्वक पूरा किया
2 | uk | इसरो ने गगनयान मानव अंतरिक्ष मिशन के लिए महत्वपूर्ण रॉकेट परीक्षण सफलतापूर्वक पूरा किया

edition rows for in-hi: 0
```

The Hindi story appears on the **UK English** and **India English** front pages in Devanagari,
and the Hindi edition's front page is empty forever. PROJECT.md makes the Hindi edition a core
product promise ("The India edition runs in both English and Hindi, with the Hindi edition
sourced from native Hindi-language publishers").

**Fix:** route by the story's language, not only by the outlet's country. A Hindi-language
story belongs in `in-hi`; an English-language story from an Indian outlet belongs in `in`:

```ts
export const COUNTRY_TO_EDITION: Record<CountryCode, EditionId[]> = {
  GB: ['uk'], US: ['us'], AU: ['au'], CA: ['ca'], IE: ['ie'], NZ: ['nz'],
  IN: ['in', 'in-hi'],
};
```

and in `determineEditionFlags`, pick the edition set from the story's language:

```ts
function editionsForLanguage(language: 'en' | 'hi', countries: string[]): EditionId[] {
  const base = countries.flatMap((c) => COUNTRY_TO_EDITION[c.toUpperCase()] ?? []);
  return language === 'hi' ? base.filter((e) => e === 'in-hi') : base.filter((e) => e !== 'in-hi');
}
```

A Hindi story must **not** be flagged into `uk` either — the `outletCountries: [story.country_code]`
call in `pipeline.ts:231` must use the language-appropriate edition set. Add a test asserting
that a Hindi story lands in `in-hi` and in no English edition.

---

### CR-06: The split depends on `stories` rows that the design prunes after 30 days, so long-lag mis-merges can never be corrected

**File:** `src/curation/split.ts:42-68`, `apps/worker/src/db/repository.ts:1187-1267`
**Issue:**

`split.ts` states the design intent correctly:

> `story_sources` is the member list of record — the raw `stories` rows are pruned 30 days
> after the merge window closes, so the attribution list is what survives.

and then does the opposite. It requires the `stories` row:

```ts
const story = await repository.findStoryById(storyId);
if (!story) {
  throw new Error(`Story ${storyId} not found.`);
}
```

and `recordClusterSplit` writes `UPDATE stories SET cluster_id = ?, is_primary = 1 WHERE id = ?`
plus `INSERT INTO story_sources (cluster_id, story_id, ...)`. After the documented 30-day
prune the `stories` row is gone, so:

- `splitCluster` throws `"Story N not found."` and the mis-merge can never be separated —
  exactly the long-lag case (a wrong merge that takes weeks of reader feedback to surface)
  that the split exists to fix. CUR-02's "reversible" claim fails for the cases that need it.
- The `INSERT INTO story_sources` carries a `story_id` that no longer exists in `stories`, and
  `story_sources.story_id` is `NOT NULL REFERENCES stories(id)` with `NO ACTION` — a foreign
  key violation in production, where D1 enforces foreign keys. The curation test harness
  disables them (`tests/curation/d1-harness.ts:138`: `PRAGMA foreign_keys = OFF`), so the
  suite cannot see it.

The `story_sources` row already carries everything the split needs: `source_id`, `headline`,
`url` and `published_at` are all retained permanently on that table by design.

**Fix:** drive the split from `story_sources` alone. The new attribution row should be built
from the old one:

```sql
INSERT INTO story_sources (cluster_id, story_id, source_id, rank, headline, url, published_at)
SELECT ?, story_id, source_id, 0, headline, url, published_at
  FROM story_sources
 WHERE cluster_id = ? AND story_id = ?
```

and the `stories` update must be conditional so a pruned row is not an error:

```sql
UPDATE stories SET cluster_id = ?, is_primary = 1
 WHERE id = ? AND EXISTS (SELECT 1 FROM stories WHERE id = ?)
```

The `story_id` foreign key on `story_sources` also has to be reconciled with the 30-day prune
plan (nullable `story_id`, or a `NO ACTION` → `SET NULL` with the attribution kept in
`source_id`/`headline`/`url`) — that reconciliation is required whichever way the split is
written. Add a test that seeds a cluster whose `stories` row is absent and asserts the split
still succeeds and the attribution survives.

---

## Warnings

### WR-01: The split's new cluster gets no `edition_clusters` and no `cluster_sections` rows, so the separated report appears on no page

**File:** `apps/worker/src/db/repository.ts:1210-1302`
**Issue:** `recordClusterSplit` inserts the new `clusters` row and moves the attribution, but
never writes `edition_clusters` or `cluster_sections` for the new cluster. The surviving
cluster keeps both. Verified against the project schema:

```
after split: newClusterId = 2
 cluster 1  edition_clusters: [uk]   cluster_sections: [2]
 cluster 2  edition_clusters: []     cluster_sections: []
```

The correction note tells the reader "The coverage has been separated into its own report",
but that report is on no front page and no section page — it is reachable only by URL.
**Fix:** copy the old cluster's `edition_clusters` and `cluster_sections` rows onto the new
cluster inside the same transaction.

### WR-02: The CLI's header claims a post-condition verification that does not exist

**File:** `scripts/curation/split-cluster.ts:14-23` vs `269-304`
**Issue:** The header states that the tool "re-reads the cluster afterwards and refuses to
report success unless the attribution rows and the correction note are all where they should
be." There is no such code: `main()` calls `splitCluster`, prints the result and exits. Given
CR-03 (the remote path is not transactional), the verification is the only thing standing
between a partial split and a silent success message.
**Fix:** implement the re-read (cluster exists, `story_sources` row moved, correction row
present) and exit non-zero when it fails.

### WR-03: The CLI silently ignores unknown flags and accepts malformed ids

**File:** `scripts/curation/split-cluster.ts:48-60`
**Issue:** `argv.filter((arg) => !arg.startsWith('--'))` discards every unknown flag, so
`--remtoe` (a typo for `--remote`) runs against the local mirror and says nothing. Extra
positional arguments are ignored. `Number.parseInt('42abc', 10)` returns `42`, so a typo'd id
is accepted as a valid one.
**Fix:** parse flags explicitly, reject any flag that is not in a known set, and require
`Number(arg)` to be a finite integer.

### WR-04: The shared-anchor gate accepts ordinary news words, which is the main over-merge exposure

**File:** `src/curation/guards.ts:74-100`, `config/stoplist.ts:47-63`
**Issue:** A "distinctive token" is any shared token longer than five characters that is not in
the stoplist. The English stoplist contains no nationality, office or common-noun terms, so
`premier`, `minister`, `american`, `british`, `russian`, `police`, `market`, `attack`,
`government`, `president`, `company`, `officials` all qualify. This is what allows the two
provincial-premier stories in CR-02 to merge once the entity guard is inert: they share
`premier` and nothing else, and the embedding is close enough at 0.82.
The phase's stated rule is "a shared **non-generic entity**"; a shared common noun is not that.
**Fix:** either raise the bar to a real entity match when the gazetteer recognises one, or add
a broad "generic news noun" list to `config/stoplist.ts` and require the shared token to
survive it. The merge benchmark (CR-02) must be re-baselined after the change.

### WR-05: The production merge path never supplies `outletAuthority`, so D-07's "prioritise by outlet authority" is dead code

**File:** `src/curation/cluster-engine.ts:52-80`, `src/curation/pipeline.ts:268-270`, `src/curation/split.ts:107-109`
**Issue:** `selectPrimaryHeadline` sorts by `outletAuthority ?? 0` first. The only caller that
supplies it is the unit test. Both production callers pass `{ headline }` only, so every
authority is 0 and the selection degenerates to "the longest headline under 110 characters" —
the opposite of the "crisp broadsheet headline" the function's own comment describes. The
schema has no authority column either, so there is no source for the value.
**Fix:** add an authority value to the source registry (`config/sources.ts` already carries a
per-outlet `section_prior`), join it through `story_sources`, and pass it at both call sites —
or remove the parameter and change the documented rule to match the code.

### WR-06: Gazetteer entries whose canonical name is an ordinary English noun match the common noun

**File:** `config/gazetteer.ts:430-468`, `src/curation/tagging.ts:62-77`
**Issue:** `\bApple\b`, `\bAmazon\b` and `\bMeta\b` are case-insensitive and match the common
nouns. Reproduced: `"Apple of his eye"` → `apple`, `"Amazon rainforest encroachment slows"` →
`amazon`, `"Meta analysis shows nothing"` → `meta`. Each of those produces a false entity
tag, an entity landing page, and (for a supranational or country-tagged entity) an edition
flag. The gazetteer is also very thin: it covers **23.8%** of the labelled fixture's headlines
and knows 62 of the 496 entity mentions, which is the direct cause of the 17 false negatives
in CR-02.
**Fix:** add a `requiresCapitalisation` / `isAcronym` flag per entity and honour it in
`buildEntityRegex`; restrict place and brand entries to their disambiguated forms (`"Apple
Inc"`, `"Amazon.com"`) or add a `contextWords` requirement; and expand the gazetteer to cover
the entities the fixture actually names.

### WR-07: The LSH band probe is executed on every story despite a measured recall of zero

**File:** `src/curation/pipeline.ts:150-157`, `apps/worker/src/db/repository.ts:646-667`
**Issue:** The code comments state the band probe found **0 of 92** labelled same-event pairs,
so the window scan is what carries recall. The probe is still run for every story, reading up
to 50 rows through a four-way `OR` over four separate indexes, and it inherits the same
newest-first `LIMIT` truncation as the window scan (CR-01), so the rows it does find are the
ones least likely to be the current batch.
**Fix:** either drop the probe until the band width is widened (more bands over fewer bits, so
paraphrases collide), or keep it but fix its ordering and filter exactly as CR-01 requires,
and instrument it to prove it contributes.

### WR-08: Every candidate is embedded before the cheap in-process guards run

**File:** `src/curation/cluster-engine.ts:148-163`
**Issue:** `evaluateCandidateClustering` computes `getBatchEmbeddings(candidateHeadlines)` for
the entire candidate list *before* calling `shouldMergeStories`, which applies the guards
first. With up to 200 candidates per story and 100 stories per batch, that is up to 20,000
Workers AI calls per build, of which the overwhelming majority are for candidates the guards
would have rejected on a string comparison. The project's zero-cost budget and the 20-minute
CI job cap are both load-bearing constraints.
**Fix:** run the guards first and embed only the survivors:

```ts
const survivors = existingCandidates.filter(
  (c) => evaluateAntiMergeGuards(newStory, c.story).allowed,
);
if (survivors.length === 0) return { action: 'new_cluster', ... };
const embeddings = await embeddingProvider.getBatchEmbeddings(survivors.map((c) => c.story.headline));
```

### WR-09: `FixtureEmbeddingProvider` calls `require()` inside an ESM module, so it silently falls back to pseudo-embeddings everywhere except vitest

**File:** `src/curation/embedding-provider.ts:110-130`, `package.json:6`
**Issue:** `package.json` declares `"type": "module"`, and `require` is not defined in an ESM
scope. The `require('node:fs')` call therefore throws a `ReferenceError`, which the surrounding
`catch` swallows with the comment "Non-fatal if running outside Node filesystem environment".
The result is that `new FixtureEmbeddingProvider()` loads **no fixture** and silently serves
deterministic pseudo-embeddings — in a script, in `tsx`, in CI, or in any future production
path. Reproduced: running the merge benchmark under `tsx` instead of vitest yields `TP=0,
FP=0, FN=92` (every same-event pair missed) with no warning of any kind.
**Fix:** use `createRequire(import.meta.url)` or a top-level `import fs from 'node:fs'`, and
log a warning (or throw) when the fixture file is expected but missing.

### WR-10: `engines.node` says `>=20`, but `node:sqlite` requires Node >= 22.5

**File:** `package.json:8-10`, `scripts/curation/split-cluster.ts:32`, `tests/curation/d1-harness.ts:24`
**Issue:** `node:sqlite`'s `DatabaseSync` was added in Node 22.5.0. The split CLI and the whole
curation test harness import it, so on the declared minimum Node the operator tool and every
curation test fail to load. The repository currently runs on Node 24, so the gap is invisible
locally.
**Fix:** set `"node": ">=22.5"` in `engines` and pin the CI runner to Node 22 or 24.

### WR-11: The "SQL lives only in the repository" scan does not cover `src/` or `config/`

**File:** `apps/worker/src/db/__tests__/repository.test.ts:30`
**Issue:** `SCAN_ROOTS = ['apps', 'shared', 'scripts', 'spikes']`. Phase 3's new code lives in
`src/curation/` and `config/`, neither of which is scanned, so a stray query in the pipeline
would not be caught. The scan is the enforcement mechanism for OPS-14 and it currently has a
hole exactly where this phase writes code. (I verified there is no SQL in `src/` or `config/`
today — the hole is latent, not active.)
**Fix:** add `'src'` and `'config'` to `SCAN_ROOTS`.

### WR-12: `clusters.score_updated_at` is never written by the curation pipeline

**File:** `apps/worker/src/db/repository.ts:1106-1145`
**Issue:** `updateClusterCuration` writes `trending_score` but not `score_updated_at`, and
`batchUpdateTrendingScores` — the only method that writes it — is never called by the
pipeline. Every cluster the pipeline creates therefore has `score_updated_at = NULL`, so any
later "rescore window" query that filters on that column finds nothing.
**Fix:** write `score_updated_at` in `updateClusterCuration`, or delete the column.

### WR-13: The section-id fallback is a magic number

**File:** `src/curation/pipeline.ts:224`
**Issue:** `const primarySectionId = sectionIdBySlug.get(sectionResult.sectionId) ?? 6;`. `6`
happens to be `world` today (the seed inserts the desks in `sort_order` order). A seed
reordering, or a desk added to `SECTIONS` without a matching seed row, silently files stories
under the wrong desk instead of failing. The comment above the block explicitly promises that
"a section added to the seed must not need a code change to be addressable" — this line is
the exception.
**Fix:** `?? sectionIdBySlug.get('world')` with an explicit throw if the seed is incomplete.

### WR-14: The oldest-first batch plus a rolling window starves fresh stories and has no composite index

**File:** `src/curation/pipeline.ts:116-121`, `apps/worker/src/db/repository.ts:854-869`
**Issue:** `listUnclusteredStories` always returns the **oldest** unclustered rows, but the
merge window is a rolling 24 hours. Once a backlog of unclusterable old rows reaches the batch
size, the pipeline works on the backlog forever and never reaches the current day's stories.
There is also no `(cluster_id, published_at)` index, so the `WHERE cluster_id = 0 ORDER BY
published_at ASC` has to sort the whole unclustered set.
**Fix:** bound the batch to the merge window (or cluster old rows into their own clusters
without a merge attempt) and add `CREATE INDEX idx_stories_unclustered ON stories(cluster_id, published_at)`.

### WR-15: The test harness disables the foreign keys production enforces

**File:** `tests/curation/d1-harness.ts:136-139`, `scripts/curation/split-cluster.ts:265`
**Issue:** The harness and the CLI both run `PRAGMA foreign_keys = OFF`, while
`shared/db/0001_init.sql:35` sets `PRAGMA foreign_keys = ON` and D1 enforces foreign keys by
default. No curation test can therefore detect an FK violation — which is precisely how CR-06's
`INSERT INTO story_sources` with a dangling `story_id` reaches production unnoticed. Separately,
the `cluster_id = 0` sentinel that the whole pipeline depends on
(`repository.ts:79-98`, `listUnclusteredStories`) violates `stories.cluster_id REFERENCES
clusters(id)` in production, where no cluster with id 0 exists.
**Fix:** reconcile the sentinel (a seeded cluster with id 0, or a nullable `cluster_id`, or
dropping the FK) and add a test that runs the curation suite with `foreign_keys = ON` so the
production constraint set is exercised.

### WR-16: Every multi-outlet cluster is written with `editorial_rank = 1`

**File:** `src/curation/pipeline.ts:285`, `src/curation/ranking.ts:75-83`
**Issue:** `evaluateEditorialRank(distinctOutlets)` returns `rawRankCandidate ?? 1`, and the
pipeline passes no candidate, so every multi-outlet cluster is written with
`editorial_rank = 1`. `idx_clusters_editorial` is a partial index on exactly this column, and
"Editor's Picks" ordering over it is degenerate — every pick ties.
**Fix:** assign real ranks in a scoring pass ordered by `trending_score`, or record the pick
separately from its rank until the ranking stage exists.

### WR-17: The trending score's section-diversity term is hardcoded to 1

**File:** `src/curation/pipeline.ts:275-276, 293-295`, `src/curation/split.ts:83-84, 116-118`
**Issue:** `distinctSections: 1` is passed on every call to `calculateTrendingScore`, so the
`0.8 * min(1, max(0, distinct_sections - 1))` term of the canonical D-09 formula is always
zero. A cluster that genuinely spans two desks never receives the diversity bonus, and the
published formula and the published score disagree.
**Fix:** compute the distinct section count from the cluster's `cluster_sections` rows and pass
it through.

---

## Info

### IN-01: Multi-word entries in the noise-token sets can never match

**File:** `config/stoplist.ts:10-45`
**Issue:** `GENERIC_NOISE_TOKENS_EN` contains `'breaking news'`, `'live update'`,
`'live updates'`, `'watch live'`, `'special report'`, `'just in'` and the Hindi set contains
`'ताज़ा खबर'`, `'ब्रेकिंग न्यूज़'`, `'लाइव अपडेट'`. `tokenizeHeadline` emits single-word tokens
only, so these entries are dead. Harmless, but they give a false impression of coverage.
**Fix:** remove them or match them on the tokenised sequence.

### IN-02: The aspect-marker guard has no Hindi counterpart for "tomorrow"

**File:** `src/curation/guards.ts:240-245`
**Issue:** The `relative_day` dimension lists `yesterday` (`बीते कल`), `today` (`आज`) and
`tomorrow` (English only). `कल` is missing, so a Hindi headline carrying "tomorrow" and one
carrying "today" are not detected as conflicting. Cross-language pairs never merge anyway, so
the exposure is limited to Hindi-vs-Hindi pairs that mix the scripts.
**Fix:** add `कल` to the tomorrow marker and `आज`/`कल` handling to the Hindi list.

### IN-03: The cluster slug has a narrow collision space against a UNIQUE column

**File:** `src/curation/pipeline.ts:55-57`, `src/curation/split.ts:74-75`
**Issue:** `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` gives
roughly 1.6 million suffixes per millisecond. A collision aborts the insert, and the build
fails for a reason that is invisible in the log.
**Fix:** use a wider suffix (`nanoid` is already a project dependency) or retry on conflict.

### IN-04: `matchGazetteerEntities` ignores its language argument

**File:** `src/curation/tagging.ts:83-86`
**Issue:** The `_language` parameter is unused, so a Hindi headline is matched against the
English canonical name and the English aliases as well as the Hindi ones. Usually harmless,
but it means an entity can be tagged on the strength of an English string inside a Hindi
headline, and the language boundary the rest of the phase enforces is not enforced here.
**Fix:** select the name/alias set by language, or document the deliberate permissiveness.

### IN-05: The CLI decides it was invoked directly with a substring match on `argv[1]`

**File:** `scripts/curation/split-cluster.ts:307`
**Issue:** `process.argv[1]?.includes('split-cluster')` is true for any path containing that
substring, so importing the module from a harness whose entry point happens to match would
execute the CLI's `main()` as a side effect of the import.
**Fix:** compare the resolved path to `fileURLToPath(import.meta.url)`.

### IN-06: A brand-new cluster receives a second `updated_at` stamp immediately after creation

**File:** `apps/worker/src/db/repository.ts:1119-1145`, `src/curation/pipeline.ts:321-327`
**Issue:** The pipeline calls `updateClusterCuration` immediately after
`createClusterWithStory`, which sets `last_seen_at = datetime('now')` and
`updated_at = datetime('now')` again. Harmless today (a new row is a real change), but it
means `updated_at` is written by a call whose only purpose is to set the editorial rank.
**Fix:** fold the initial editorial rank into the insert and drop the redundant update.

---

## Notes on checks that passed

- **SQL injection:** none. Every value in `repository.ts` is bound with `?`. The one
  interpolation — the table name in `countRows` — is validated against `COUNTABLE_TABLES`
  before use, and `findEntityIdsBySlugs` builds an `IN` list from placeholders only.
- **Star projections:** none. The repository test's column-list assertion covers the new
  statements as well.
- **Ceiling literals in `config/`:** none. `config/gazetteer.ts`, `config/lexicon.ts` and
  `config/stoplist.ts` contain no bare free-tier limits; the only numbers are lexicon weights.
- **Index coverage:** the new repository methods are index-driven
  (`idx_stories_published`, `idx_stories_band0..3`, `idx_stories_cluster`, the `story_sources`
  primary key, `idx_edition_clusters_edition`). The one exception is the
  `(cluster_id, published_at)` ordering noted in WR-14.
- **The union of the band probe and the window scan** is deduped through a `Map` keyed on
  candidate id, so the two paths cannot double-count a candidate.
- **CUR-10 on the split path** is correct: `editorial_rank = CASE WHEN ? < 2 THEN NULL ELSE
  editorial_rank END` nulls the rank when the surviving cluster drops below two outlets.
- **The dated correction note** names the real outlet via `findSourceById` and is attached to
  the old cluster's permanent slug, which is the page that was wrong. The previous
  "outlet (source 10)" defect is genuinely fixed.

---

_Reviewed: 2026-10-22T03:19:42Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
