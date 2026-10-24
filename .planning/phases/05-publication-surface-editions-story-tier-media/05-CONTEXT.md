# Phase 5 Context: Publication Surface: Editions, Story Tier & Media

**Date:** 2026-10-24
**Goal:** The paper itself is published: seven edition front pages, 56 section pages, archives, topic and entity pages, and exactly one permanent, edition-agnostic story URL per story, with images served locally from a single hostname.

## Current State

Phase 5 is approximately 65% complete. The following has been built:
- 7 edition front pages with lead story, section grid, most-covered, editor's picks
- 56 section pages (handle empty sections gracefully)
- 7 dated archives per edition + most-covered per edition
- Story tier with canonical `/story/{slug}/`
- Topic & entity pages (8 topics, 10 entities)
- Dynamic sitemap.xml.ts + robots.txt.ts
- 7 layouts: Base, FrontLayout, SectionLayout, ArchiveLayout, StoryLayout, TopicEntityLayout
- 7 components: LeadStory, StoryItem, StoryList, MostCovered, EditorPicks, SectionGrid, MediaImage
- Image fallback CSS for expired images
- Lighthouse test + Playwright visual regression
- Build: 167 pages in 3.11s
- Tests: 360 passed, 1 skipped

## Grey Area Decisions

| Area | Proposal | Rationale |
|------|----------|-----------|
| **Snapshot contract** | Use D1→R2 gzipped JSON snapshot rather than direct D1 access in Astro | Matches architecture spec; build never opens datastore binding |
| **Edge Worker story tier** | Single Worker handles `/story/*` routing to R2 with proper headers | Standard pattern; one project, not_found_handling: "none" |
| **Media pipeline** | Content-addressed by sha256(source_url), sharp for WebP variants, satori+sharp for OG | Per PUB-03/MED-03 spec |
| **Build assertions** | Implement OPS-09 through OPS-13 as hard gates in CI | Required for Phase 7 compliance anyway |
| **RSS feeds** | Per-edition, per-section, global with outlet list | Required by PUB-09, CON-07 |
| **Internal links** | Auto-generated from cluster graph, max 3 clicks to any indexable URL | Required by PUB-06 success criterion |

## Open Questions

None - all grey areas resolved by roadmap spec and handoff notes.

## References

- `.planning/P5-HANDOFF.md` - detailed handoff with completed/remaining work
- `.planning/ROADMAP.md` - Phase 5 success criteria
- `scripts/write-phase5-files.mjs` - existing scaffolding script
