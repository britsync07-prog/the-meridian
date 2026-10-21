# Phase 03: Curation Core: Clustering, Ranking & Enrichment - Research

## Executive Summary

Phase 03 establishes the algorithmic heart of The Meridian: transforming normalized, raw outlet mentions into high-value broadsheet story clusters. In the overall pipeline, Phase 02 ingests feeds into `stories` with `cluster_id = 0`, and Phase 03 executes **Stage 3 (Cluster)**, **Stage 4 (Enrich)**, and **Stage 5 (Score)**.

The curation engine operates on the foundational principle: **"Conservative aggregation — when in doubt, do not merge."** Over-merging destroys factual accuracy, while under-merging simply yields single-outlet reports that are filtered out of prominent front-page slots by the Editor's Picks gate (`distinct_outlets >= 2`). Every merge decision is fully auditable, deterministic, and reversible via an administrative CLI workflow with published dated correction notes.

---

## 1. Requirements & Scope Traceability

| Requirement | Description | Implementation Strategy in Phase 03 |
|---|---|---|
| **CUR-01** | Same-event items collapse into one cluster listing all outlets | Incremental single-linkage clustering attaching incoming raw stories to existing clusters within a 24h window if BGE-M3 cosine similarity ≥ 0.82 and all guards pass. |
| **CUR-02** | Cluster membership stored per contributing item; splits retain outlet lists | D1 `stories.cluster_id` and `story_sources` table retain every outlet mention, source URL, and original headline permanently. |
| **CUR-03** | Split of wrongly merged cluster publishes dated correction note on story URL | CLI tool (`npm run cluster:split`) moves story to a new cluster and appends a row in `corrections` with standard dated text. |
| **CUR-04** | Merge rule requires shared non-generic entity + close time window before headline similarity | Anti-merge gate verifies non-generic entity match and ≤24h publication difference prior to evaluating headline similarity. |
| **CUR-05** | Disjoint entity sets are never merged | If both candidate stories have extracted named entities and their intersection is empty, merge is unconditionally blocked. |
| **CUR-06** | Hand-labelled fixture of ≥200 headline pairs; precision and recall measured | `tests/fixtures/curation/headline-pairs.json` (200–300 pairs) evaluated in CI; fails build if Precision < 98% or Recall < 85%. |
| **CUR-07** | Trending score decays with 18h half-life, 3x weight on distinct outlets vs repeat mentions | Canonical formula: `3.0 * log2(1 + distinct_outlets) + 1.0 * log2(1 + total_mentions) + 5.0 * 0.5^(age_hours / 18.0) + 0.8 * min(1, distinct_sections - 1)`. |
| **CUR-10** | Cluster with coverage count = 1 excluded from Editor's Picks | Editor's picks gate enforces `distinct_outlets >= 2`; single-outlet clusters have `editorial_rank = NULL`. |
| **CUR-11** | Clusters tagged with topics and named entities; records method and confidence | Cluster tags aggregated from member stories with confidence and method recorded in `cluster_sections`, `story_topics`, `story_entities`. |
| **CUR-12** | Gazetteer matching precedes model extraction; model entities never generate pages | Curated bilingual gazetteer (`config/gazetteer.ts`); only gazetteer matches create landing-page eligible rows in `entities`. |
| **CUR-13** | Clusters flagged for additional editions based on outlet country, entity, or wire status | Recorded in `edition_clusters` with reasons: `'source'`, `'entity'`, `'gazetteer'`, or `'wire'`. |
| **CUR-14** | Cluster assigned to one of 8 sections via 4-stage cascade with method and confidence logged | 4 stages: Feed prior -> Lexicon -> Workers AI tie-break -> Fallback (`world`); audit columns in `clusters` and `cluster_sections`. |
| **CUR-15** | Ships topic lexicon, entity gazetteer, and generic-token stop list in English & Devanagari | Packaged in `config/lexicon.ts`, `config/gazetteer.ts`, and `config/stoplist.ts`. |
| **CON-15** | `published_at` is earliest member time; `updated_at` reflects real cluster changes | `clusters.published_at = MIN(stories.published_at)`; `updated_at` is bumped only upon merge or split, never refreshed artificially. |

### Critical Architectural Finding: Section Nomenclature Alignment
In `03-CONTEXT.md` D-13, the sections were colloquially listed as `politics, business, technology, science, health, sports, arts, world`.
However, the frozen Phase 01 codebase contract (`shared/config/editions.ts`), the D1 seed (`shared/db/seed.sql`), and the `SectionId` TypeScript type strictly define the 8 desks as:
- `politics`
- `business`
- `technology`
- `sport` (singular, not `sports`)
- `health`
- `world`
- `weather` (in place of `science`)
- `entertainment` (in place of `arts`)

**Planning Mandate:** Phase 03 MUST compile against `shared/config/editions.ts` `SectionId` and use foreign keys to the seeded `sections` table (`politics`, `business`, `technology`, `sport`, `health`, `world`, `weather`, `entertainment`). Science topics map to `technology`/`health`, and arts topics map to `entertainment`.

---

## 2. Two-Gate Merge Pipeline & Anti-Merge Guards

The pipeline follows a tiered, hierarchical structure to guarantee precision and eliminate D1 table scans:

```
Raw Story (normalized, cluster_id = 0)
        │
        ▼
[Pre-Filter]
  - Language boundary (EN vs HI)
  - Strip generic noise tokens ("breaking", "exclusive", "live", "report", etc.)
  - Match curated gazetteer entities & extract tokens
        │
        ▼
[Gate 1: Fast LSH Candidate Generation]
  - Compute SimHash-64
  - Split into 4x16-bit unsigned integer bands (band0, band1, band2, band3)
  - Query D1 using 4 index lookups on idx_stories_band0..3 within rolling 24h window
  - Candidates found? If none -> Create New Cluster
        │
        ▼
[Anti-Merge Guards]
  1. Time Window Guard: |pub_date_diff| <= 24 hours (reject if > 24h)
  2. Disjoint-Entity Guard: If entities(A) != ∅ and entities(B) != ∅ and intersection == ∅ -> REJECT
  3. Shared Entity Guard: Must share >=1 non-generic entity or strong token
  4. Round / Ordinal & Aspect-Marker Guard:
     - Check ordinal/round markers ("Day 1" vs "Day 2", "Part 1" vs "Part 2", "Round 1" vs "Quarter-final")
     - Check temporal markers ("morning" vs "evening", "Friday" vs "Saturday")
     - If mismatch found -> REJECT
        │
        ▼
[Gate 2: Semantic Embedding Confirmation]
  - Compute cosine similarity using Cloudflare Workers AI @cf/baai/bge-m3 embeddings
  - Threshold >= 0.82
        │
        ▼
[Single-Linkage Cluster Decision]
  - If max_similarity >= 0.82: Merge into existing cluster with highest score
  - Else: Create new distinct cluster
```

### SimHash-64 & 4x16-bit LSH Details
- **Tokenization:** Unicode word segmentation via `Intl.Segmenter` (supported in Node and edge).
- **Noise Stripping:** Stop words and breaking news prefixes ("breaking", "update", "latest", "live", "watch", "video", "news", "exclusive", "report") are stripped prior to hashing.
- **Hashing Primitive:** 64-bit FNV-1a or MurmurHash3 algorithm operating on tokens to produce 64-bit BigInt.
- **SimHash-64 Vector:** 64 accumulator weights summed across token hashes; positive weights become bit `1`, non-positive become `0`.
- **Band Partitioning:**
  ```ts
  const band0 = Number((simhash >> 48n) & 0xffffn);
  const band1 = Number((simhash >> 32n) & 0xffffn);
  const band2 = Number((simhash >> 16n) & 0xffffn);
  const band3 = Number(simhash & 0xffffn);
  ```
- **D1 Candidate Query:** UNION of 4 index queries across `idx_stories_band0..3` with `published_at >= datetime(now, '-24 hours')`. This guarantees D1 uses the 4 band indexes without triggering a 44,000-row table scan (protecting the 5M daily row read budget).

### BGE-M3 Embeddings & Offline Fixture Strategy (D-20)
- **Model:** `@cf/baai/bge-m3` produces 1024-dimensional dense vectors. It is multilingual (covers English and Hindi Devanagari in a single vector space) and costs 1,075 neurons per million input tokens.
- **CI / Production Path:** Calls Cloudflare Workers AI API (`POST /ai/run/@cf/baai/bge-m3`) with batched headlines.
- **Testing / Offline Path (Vitest):** To prevent test flakiness, rate limits, and network requirements during `npm test`, pre-computed BGE-M3 vectors for the 200–300 headline benchmark are saved in `tests/fixtures/curation/headline-embeddings.json`. An embedding provider interface switches between `LiveWorkersAiEmbeddingProvider` and `FixtureEmbeddingProvider` seamlessly.

---

## 3. Broadsheet Trending Scoring & Recency Decay

### Mathematical Formula (D-09)
```ts
trending_score = 
  3.0 * Math.log2(1 + distinct_outlets) +
  1.0 * Math.log2(1 + total_mentions) +
  5.0 * Math.pow(0.5, age_hours / 18.0) +
  0.8 * Math.min(1, Math.max(0, distinct_sections - 1))
```

### Analysis of Terms:
1. **Multi-Outlet Multiplier:** `3.0 * log2(1 + distinct_outlets)` heavily rewards stories verified across distinct publishers (e.g. 5 outlets = +7.75 points) vs a single outlet repeated 5 times (`1.0 * log2(1 + 5)` = +2.58 points).
2. **Exponential Recency Decay:** `5.0 * 0.5^(age_hours / 18.0)` provides an exact 18-hour half-life. Fresh stories receive up to 5.0 bonus points; after 18h it decays to 2.5; after 36h to 1.25.
3. **Section Diversity Bonus:** `0.8 * min(1, distinct_sections - 1)` awards a 0.8 point bonus if a major story spans across multiple desks (e.g. politics + business).
4. **Editor's Picks Gate (D-10, CUR-10):**
   `distinct_outlets >= 2` is a hard requirement. If `distinct_outlets < 2`, `clusters.editorial_rank` remains `NULL`.

Scores are recomputed deterministically once per build cycle and persisted to `clusters.trending_score` with `score_updated_at`.

---

## 4. Hierarchical 4-Stage Section Resolver (D-13, D-14, CUR-14)

Section resolution follows a strict cascade:

```
Stage 1: Feed URL Section Priors (from config/sources.ts)
  - If feed defaultSection is defined or feed URL specifically maps to a section:
    Confidence = 0.85, Method = 'source' / 'feed_prior'
        │ (if feed is general or prior < threshold)
        ▼
Stage 2: Weighted Keyword Lexicon (config/lexicon.ts)
  - Tokenize headline + excerpt; compute score per section across English/Hindi lexicons.
  - If top score exceeds margin over runner-up:
    Confidence = calculated (0.60 – 0.95), Method = 'rules' / 'lexicon'
        │ (if margin is narrow or tie)
        ▼
Stage 3: Cloudflare Workers AI Tie-Breaker
  - Zero-shot classification prompt or classifier over the 8 section labels.
  - If top label confidence > 0.6:
    Confidence = model_score, Method = 'ai' / 'ai_tiebreak'
        │ (if AI unavailable, offline, or confidence <= 0.6)
        ▼
Stage 4: Default Fallback Desk
  - Assign to 'world'
  - Confidence = 0.10, Method = 'fallback'
```

Audit logging: Writes `primary_section_id`, `section_method`, and `section_confidence` to `clusters` and rows to `cluster_sections`.

---

## 5. Curated Gazetteers & Taxonomy (D-15, D-16, CUR-12, CUR-15)

- **Curated Gazetteer (`config/gazetteer.ts`):**
  - Contains high-profile named entities across UK, US, AU, CA, IE, NZ, IN.
  - Bilingual aliases: English + Hindi Devanagari (e.g. `{"en": "Narendra Modi", "hi": "नरेंद्र मोदी"}`).
  - Maps entities to primary country codes (`country_code`) and types (`person`, `org`, `place`, `event`).
- **Hard Landing-Page Gate (CUR-12, D-15):**
  - **Only entities matched against `config/gazetteer.ts` are written to `entities` with `slug` eligible for landing pages.**
  - Model-extracted entities from secondary NLP enrich story metadata but NEVER create rows with URL generation capability in `entities`.
- **Cross-Country Edition Flagging (`edition_clusters`, CUR-13):**
  - Links clusters to editions based on:
    - `'source'`: Member story published by an outlet from that country.
    - `'entity'`: Gazetteer entity relevant to that country.
    - `'gazetteer'`: Supranational / international relevance (e.g. UN, NATO).
    - `'wire'`: Major global breaking story.

---

## 6. Administrative Cluster Split Workflow (D-18, D-19, CUR-02, CUR-03)

- **CLI Tool:** `npm run cluster:split -- <clusterId> <storyId>`
- **Execution Steps:**
  1. Validate that `storyId` currently belongs to `clusterId`.
  2. Ensure `clusterId` has at least 2 member stories (cannot split a single-member cluster).
  3. Create a new cluster in `clusters` with a new immutable slug.
  4. Update `stories` setting `cluster_id = newClusterId` and `is_primary = 1` for `storyId`.
  5. Move or recreate `story_sources` row for `storyId` under `newClusterId`.
  6. Recompute canonical headlines, canonical excerpts, `outlet_count`, `mention_count`, and `trending_score` for both old and new clusters.
  7. Insert audit record in D1 `corrections`:
     - `story_slug`: slug of the original cluster.
     - `reported_at`: current ISO timestamp.
     - `report_detail`: "Administrative split of story <storyId> from cluster <clusterId>".
     - `status`: "resolved".
     - `resolution`: "Detached coverage into independent story cluster <newClusterSlug>".
     - `correction_note`: `"Correction (YYYY-MM-DD): An earlier version of this story incorrectly grouped coverage from [Outlet]. The coverage has been separated into its own report."`
     - `resolved_at`: current ISO timestamp.

---

## 7. D1 Repository Purity & Schema Integration (OPS-14)

All datastore operations MUST reside exclusively in `apps/worker/src/db/repository.ts`. Zero SQL statements are allowed in `src/curation/`.

### Required New Repository Methods:
1. `findLshCandidates(band0, band1, band2, band3, sinceIso, language)`:
   Performs 4 indexed union queries on `stories` returning candidate items.
2. `createClusterWithStory(clusterData, storyId, sourceId)`:
   Inserts new cluster, links story, creates `story_sources` row.
3. `addStoryToCluster(clusterId, storyId, sourceId, headline, url, publishedAt, isPrimary)`:
   Updates `stories.cluster_id`, inserts into `story_sources`.
4. `updateClusterCuration(clusterId, updates)`:
   Updates canonical fields, counts, trending score, and section metadata.
5. `batchUpdateTrendingScores(scoreUpdates)`:
   Updates scores and `score_updated_at` across clusters.
6. `recordClusterSplit(oldClusterId, newClusterData, storyId, sourceId, correctionData)`:
   Transactionally performs the split and writes the correction note.
7. `syncTaxonomyAndEntities(topics, entities)`:
   Upserts curated topics and gazetteer entities into `topics` and `entities`.
8. `assignClusterTaxonomy(clusterId, sections, topics, entities, editionClusters)`:
   Writes join rows for `cluster_sections`, `edition_clusters`, `story_topics`, `story_entities`.
9. `listUnclusteredStories(limit)`:
   Selects raw stories where `cluster_id = 0` ordered by `published_at ASC`.

---

## 8. Validation Architecture

### Test Strategy & CI Quality Gates

```
Unit Tests (Fast, Offline)
  ├── simhash.test.ts: FNV-1a hashing, SimHash-64 generation, 4x16-bit band partitioning
  ├── guards.test.ts: Disjoint entity guard, round/ordinal guard, temporal markers, stop words
  ├── ranking.test.ts: Trending score calculation, 18h half-life recency decay, Editor's Picks gate
  ├── sections.test.ts: 4-stage cascade resolution, confidence scoring, fallback
  ├── tagging.test.ts: Curated gazetteer matching, language aliases, landing-page gate
  └── split.test.ts: Cluster split logic, recalculation, dated correction note format

Benchmark & Calibration Suite (Spike S-7 / CUR-06)
  └── merge-benchmark.test.ts:
      - Evaluates 200–300 hand-labelled headline pairs (tests/fixtures/curation/headline-pairs.json)
      - Computes Confusion Matrix (True Positives, False Positives, True Negatives, False Negatives)
      - Enforces Precision >= 0.98 (98%) and Recall >= 0.85 (85%)
      - CI FAILS if Precision < 0.98 or Recall < 0.85

Integration Tests (Local D1 SQLite)
  └── curation-pipeline.test.ts:
      - End-to-end ingest -> unclustered stories -> LSH -> guards -> BGE-M3 confirm -> cluster -> enrich -> score
      - Verifies D1 repository purity and zero table scan
      - Exercises cluster split CLI command
```

### Benchmark Metric Specifications:
- **Precision:** $\frac{TP}{TP + FP} \ge 0.98$ (Hard gate: fewer than 2% false merges allowed).
- **Recall:** $\frac{TP}{TP + FN} \ge 0.85$ (Hard gate: at least 85% of genuine duplicate stories merged).
- **False Merge Threshold:** Zero false merges across disjoint entities and ordinal/round markers.

---

## RESEARCH COMPLETE
