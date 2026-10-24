# Phase 6 Context: Digest, Trust Layer & SEO/Discovery

**Date:** 2026-10-25
**Goal:** Every edition carries genuinely original prose and a complete, honest trust layer, and the whole site becomes technically compliant, discoverable and eligible for Google News.

## Current State

Phase 5 is complete:
- 155 static pages built
- 406 tests passing
- Typecheck clean
- Snapshot contract implemented (D1→R2)
- RSS feeds working
- Internal link graph complete
- Story router serving from R2 with ETag/cache headers

## Grey Area Decisions

| Area | Proposal | Rationale |
|------|----------|-----------|
| **Daily digest** | Use LLM (Claude/GPT) for original prose, deterministic template fallback | Phase 6 spec; S-6 bake-off will validate |
| **Trust layer** | MDX files in `apps/site/content/`, rendered via Astro MDX integration | Standard pattern; reviewable in PRs |
| **pageMeta()** | Single source of truth function returning {title, description, canonical, lang, hreflang, ogImage, sitemapEntry} | Required by CON-09, SEO-01–SEO-18 |
| **hreflang** | India EN ↔ HI only, bidirectional, x-default to `/` | Required by SEO-10 |
| **Sitemaps** | Stable index + per-edition pages + per-year stories + 48h news sitemap + topics | Required by SEO-04, SEO-08 |
| **Schema.org** | JSON-LD on story/section pages: NewsArticle, Organization, BreadcrumbList | Required by TRS-01–TRS-10 |
| **Google News** | Date/time visible, H1=title match, headline length 2-22 words, image 60×90min | Required by GRO-10 |

## Open Questions

None — spec is clear from ROADMAP.md requirements.

## References

- `.planning/ROADMAP.md` — Phase 6 success criteria
- `.planning/REQUIREMENTS.md` — CON-09–14, SEO-01–18, TRS-01–10, ING-05, GRO-10
- `apps/site/src/pages/sitemap.xml.ts` — existing sitemap (needs replacement with proper structure)
- `apps/site/src/pages/robots.txt.ts` — existing robots.txt (needs enhancement)
