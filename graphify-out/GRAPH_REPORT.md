# Graph Report - newsportal  (2026-10-20)

## Corpus Check
- 12 files · ~106,814 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: (none) 1)

## Summary
- 35 nodes · 24 edges · 13 communities (5 shown, 8 thin omitted)
- Extraction: 79% EXTRACTED · 21% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.89)
- Token cost: 256,945 input · 5,108 output

## Community Hubs (Navigation)
- Roadmap Phase Sequence
- Delivery Model and Ingest
- Curation and Originality Layer
- Cloudflare Storage Services
- Astro Publishing Layer
- D1 Data Model
- Frontend Framework Stack
- International SEO Rules
- OG Image Rendering
- Image Processing
- AI Inference Layer
- Digest and SEO Phase
- Operational Hardening Phase

## God Nodes (most connected - your core abstractions)
1. `Delivery Model` - 5 edges
2. `Ingest Pipeline` - 3 edges
3. `Phase 3: Curation Core` - 3 edges
4. `Ingest Pipeline` - 3 edges
5. `The Meridian` - 2 edges
6. `Cloudflare R2` - 2 edges
7. `Phase 1: Foundation` - 2 edges
8. `Phase 2: Feed Acquisition` - 2 edges
9. `Phase 5: Publication Surface` - 2 edges
10. `Curation Core` - 2 edges

## Surprising Connections (you probably didn't know these)
- `The Meridian` --conceptually_related_to--> `Delivery Model`  [EXTRACTED]
  AGENTS.md → .planning/research/SUMMARY.md
- `The Meridian` --conceptually_related_to--> `Google News Compliance`  [EXTRACTED]
  AGENTS.md → .planning/research/FEATURES.md
- `Delivery Model` --conceptually_related_to--> `Ingest Pipeline`  [INFERRED]
  .planning/research/SUMMARY.md → .planning/research/ARCHITECTURE.md
- `Delivery Model` --references--> `Cloudflare R2`  [EXTRACTED]
  .planning/research/SUMMARY.md → .planning/research/STACK.md
- `Delivery Model` --references--> `Cloudflare Workers`  [EXTRACTED]
  .planning/research/SUMMARY.md → .planning/research/STACK.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Core Pipeline Flow** — planning_research_architecture_ingest_pipeline, planning_research_stack_cloudflare_r2, planning_research_stack_cloudflare_d1, planning_research_stack_astro [EXTRACTED 1.00]
- **SEO Compliance Strategy** — architecture_canonical_rules, architecture_hreflang_rules, architecture_delivery_model [EXTRACTED 1.00]
- **Parallel Development Tracks** — planning_roadmap_phase_2, planning_roadmap_phase_3, planning_roadmap_phase_4 [EXTRACTED 1.00]
- **Core Data Flow** — ingest_pipeline, curation_core, publication_surface [EXTRACTED 1.00]
- **Cloudflare Free Tier Stack** — cloudflare_workers, cloudflare_d1, cloudflare_r2 [EXTRACTED 1.00]
- **Originality & Compliance Layer** — deduplication_engine, daily_digest_generator, google_news_compliance [INFERRED 0.90]

## Communities (13 total, 8 thin omitted)

### Community 0 - "Roadmap Phase Sequence"
Cohesion: 0.29
Nodes (7): Phase 1: Foundation, Phase 2: Feed Acquisition, Phase 3: Curation Core, Phase 4: Design System, Phase 5: Publication Surface, Spike S-1: DO CPU, Spike S-7: Merge Calibration

### Community 1 - "Delivery Model and Ingest"
Cohesion: 0.40
Nodes (6): Canonical Rules, Delivery Model, Ingest Pipeline, Cloudflare R2, Cloudflare Workers, fast-xml-parser

### Community 2 - "Curation and Originality Layer"
Cohesion: 0.40
Nodes (5): Curation Core, Daily Digest Generator, Deduplication Engine, Google News Compliance, The Meridian

### Community 3 - "Cloudflare Storage Services"
Cohesion: 0.50
Nodes (4): Cloudflare D1, Cloudflare R2, Cloudflare Workers, Ingest Pipeline

### Community 4 - "Astro Publishing Layer"
Cohesion: 0.67
Nodes (3): Astro Shell, Publication Surface, SEO Strategy

## Knowledge Gaps
- **22 isolated node(s):** `D1 Data Model`, `Canonical Rules`, `hreflang Rules`, `Astro 7.4.1`, `Tailwind CSS 4.3.3` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 22 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Delivery Model` connect `Delivery Model and Ingest` to `Curation and Originality Layer`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `The Meridian` connect `Curation and Originality Layer` to `Delivery Model and Ingest`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Delivery Model` (e.g. with `Canonical Rules` and `Ingest Pipeline`) actually correct?**
  _`Delivery Model` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `D1 Data Model`, `Canonical Rules`, `hreflang Rules` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._