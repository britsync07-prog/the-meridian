# Phase 3: Curation Core: Clustering, Ranking & Enrichment - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Stories about the same event collapse into one entry listing every outlet that covered it, ranked by coverage volume and recency, and tagged well enough to place them in editions, sections, topics, and entity pages.

This phase delivers:
- Fingerprinting and two-gate merge pipeline (SimHash-64 with 4x16-bit LSH bands, followed by Cloudflare Workers AI `@cf/baai/bge-m3` cosine similarity gating).
- Strict anti-merge guards: generic token stoplist, disjoint-entity guard (unconditional block), and round/ordinal/temporal aspect-marker guard.
- Conservative single-linkage incremental clustering with a 24-hour maximum publication time window.
- Primary cluster headline selection based on outlet authority and length; language-partitioned clustering (English vs Hindi).
- Broadsheet trending score formula with 18-hour half-life exponential recency decay, multi-outlet weighting, and section diversity bonus.
- Editor's Picks qualification threshold (minimum 2 distinct outlets).
- 4-stage hierarchical section resolver (feed URL priors -> weighted lexicon -> Workers AI tie-break -> world fallback) with audit metadata logging (`method` and `confidence`).
- Curated bilingual gazetteer (English + Hindi Devanagari) for landing-page eligible entities; lightweight offline NLP (WinkNLP/compromise) for cluster topic extraction.
- Hand-labelled validation fixture of 200–300 headline pairs enforcing precision ≥ 98% and recall ≥ 85% in CI.
- Reversible cluster split CLI workflow (`npm run cluster:split`) with D1 audit tracking and published dated correction notes on story URLs.

Out of boundary: Broadsheet design tokens and CSS components (Phase 4), Astro static publication and story tier HTML generation (Phase 5), daily LLM digests, trust layer MDX, and Google News sitemaps (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Two-Gate Merge Pipeline & Anti-Merge Guards

- **D-01:** Implement candidate story pruning using a **two-gate architecture**: Gate 1 queries D1 for matching SimHash-64 16-bit LSH bands (using existing `idx_stories_band0..3`) within a rolling 24-hour window; Gate 2 computes cosine similarity using `@cf/baai/bge-m3` embeddings on candidates exceeding LSH hamming thresholds (similarity threshold ≥ 0.82). — **Reversibility:** costly — changing similarity thresholds impacts existing cluster definitions and requires re-evaluating the 200-pair benchmark.
- **D-02:** Enforce a strict **Disjoint-Entity Guard**: if two stories both have recognized named entities (persons, organizations, specific locations) from the gazetteer or extractor and their intersection is empty, **reject the merge unconditionally**, regardless of headline text similarity.
- **D-03:** Enforce a strict **Round / Ordinal & Aspect-Marker Guard**: never merge items that share an event root but differ in ordinals/rounds (e.g. "Day 1" vs "Day 2", "Part 1" vs "Part 2", "Round 1" vs "Quarter-final") or distinct temporal markers ("morning" vs "evening", "Friday" vs "Saturday").
- **D-04:** Use **conservative single-linkage** for incremental clustering: attach an incoming raw story to the existing cluster with the highest cosine similarity above 0.82; if multiple clusters tie or similarity is borderline, preserve the item as a new distinct cluster ("When in doubt, do not merge").
- **D-05:** Apply a **24-hour maximum publication time window**: stories published more than 24 hours apart cannot be merged into the same cluster, preventing ongoing evolving news sagas from accumulating into bloated multi-day mega-clusters.
- **D-06:** Strip generic breaking-news noise tokens ("breaking", "update", "latest", "live", "watch", "video", "news", "exclusive", "report") prior to SimHash generation and token comparisons.
- **D-07:** Primary representative headline selection: select the headline from the highest-authority outlet in the cluster (or the longest headline within broadsheet character limits if outlet authority is equal); retain all original outlet headlines in `story_sources`.
- **D-08:** Maintain **strict language boundaries**: Hindi feeds cluster only with Hindi feeds; English feeds cluster only with English feeds. Cross-lingual linking is handled via shared gazetteer entity and topic tags, never raw cluster merges.

### Trending Scoring Formula & Recency Decay

- **D-09:** Calculate trending score using the canonical formula:  
  `trending_score = 3.0 * log2(1 + distinct_outlets) + 1.0 * log2(1 + total_mentions) + 5.0 * 0.5^(age_hours / 18.0) + 0.8 * min(1, distinct_sections - 1)`
- **D-10:** Enforce the **Editor's Picks / Lead Story gate**: a cluster must have a coverage count of at least 2 distinct outlets (`distinct_outlets >= 2`) to qualify for Editor's Picks or Lead Story broadsheet prominence. Single-outlet stories appear in section lists and chronological feeds only.
- **D-11:** Trending scores are calculated on a global basis; edition front pages display stories that have at least one mention in that country's feeds, boosted by country-specific outlet presence.
- **D-12:** Trending scores are recalculated deterministically once per CI build cycle and persisted to D1 `clusters.trending_score` with an indexed timestamp.

### Section Classifier & Gazetteers

- **D-13:** Section assignment resolves among the 8 canonical broadsheet sections (`politics`, `business`, `technology`, `science`, `health`, `sports`, `arts`, `world`) via a 4-stage cascade:  
  1. Source feed URL section priors (from `config/sources.ts`)  
  2. Weighted keyword/lexicon scoring  
  3. Cloudflare Workers AI zero-shot classifier for close ties (threshold > 0.6)  
  4. Default fallback to `world`
- **D-14:** Audit metadata is saved with every section assignment: write `section_assigned`, `section_method` (`feed_prior` | `lexicon` | `ai_tiebreak` | `fallback`), and `section_confidence` (0.0 to 1.0) to the `clusters` table.
- **D-15:** Curate a version-controlled entity gazetteer in `config/gazetteer.ts` with bilingual aliases (English + Hindi Devanagari) for world leaders, major cities, countries, and institutions. **Only entities matched against this curated gazetteer generate permanent entity landing pages/slugs.** Model-extracted entities enrich metadata but never generate URLs.
- **D-16:** Perform lightweight named-entity and topic extraction post-clustering in CI using a deterministic Node library (e.g. WinkNLP/compromise); Workers AI text extraction is used only as a secondary fallback for ambiguous high-prominence clusters.

### Validation Fixture & Split Workflow

- **D-17:** Validate the merge rules against a hand-labelled JSON fixture (`tests/fixtures/curation/headline-pairs.json`) of 200–300 real headline pairs (covering same-event, different-event, and related-but-distinct cases). **CI fails if precision < 98% or recall < 85%.**
- **D-18:** Implement an administrative CLI tool `npm run cluster:split -- <clusterId> <storyId>` that detaches a mistakenly merged story into its own cluster, updates `stories.cluster_id`, records an audit row in `cluster_corrections`, and recalculates scores for both clusters.
- **D-19:** A split cluster automatically publishes a dated correction note on the story URL:  
  `"Correction (YYYY-MM-DD): An earlier version of this story incorrectly grouped coverage from [Outlet]. The coverage has been separated into its own report."`
- **D-20:** For offline Vitest testing, embed pre-computed BGE-M3 vector fixtures so test suites run instantaneously without network access, with integration tests running live Workers AI on staging.

### Agent's Discretion

- Choice of specific SimHash-64 hashing primitives (e.g., Jenkins or MurmurHash3 based).
- Specific weights and vocabulary entries in the section classification lexicon.
- Exact structure of internal helper types in `src/curation/`.
- Fine-tuning of BGE-M3 batching during CI runs to respect Cloudflare Workers AI rate limits (3,000 req/min for embeddings).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture and Design
- `.planning/codebase/ARCHITECTURE.md` — Section 4 (Data-Flow & Ingest Contract), Section 5 (D1 Database Model, indexes `idx_stories_band0..3`), and Section 9 (The Three Canonical Rules).
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md` — Free-tier limits, D1 single repository rule, and single site-name value.
- `.planning/phases/02-feed-acquisition-raw-capture-normalization/02-CONTEXT.md` — Normalized `RawItem` schema, dual-identity deduplication, and source registry with section priors.
- `.planning/PROJECT.md` — Core Value: "Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country."

### Requirements and Constraints
- `.planning/REQUIREMENTS.md` — Requirements CUR-01 through CUR-07, CUR-10 through CUR-15, and CON-15.
- `.planning/ROADMAP.md` — Phase 3 goal, work items, and success criteria (including the 200-pair benchmark requirement).
- `.planning/research/PITFALLS.md` — Pitfall P-6 (unstable GUIDs / false merges) and P-11 (over-clustering and loss of distinct event identity).

</canonical_refs>
