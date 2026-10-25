# Phase 6 Summary: Digest, Trust Layer & SEO/Discovery

**Status:** Complete
**Date:** 2026-10-25
**Build:** 171 pages | **Tests:** 415/415 pass

## What Was Built

### Wave 1: Digest Engine
- `digest.ts` — deterministic template digest generator (300-400 words, ≥60% novel sentences, no verbatim headlines)
- `digest.test.ts` — 8 tests covering word count, novelty, automation disclosure, sources list, determinism, edition scoping
- `[edition]/digest.astro` — per-edition digest page with "Automated summary" disclosure

### Wave 2: pageMeta Integration
- `shared/templates/head.ts` — already existed; `pageMeta()` enforces CON-09 self-referential canonicals
- `shared/templates/hreflang.ts` — India EN↔HI only, x-default to `/`, bidirectional
- `shared/templates/og-meta.ts` — OG + Twitter card tags for story and section pages
- `Base.astro` — integrated `pageMeta()`, `buildHreflang()`, `renderOpenGraph()`, schema.org Organization+WebSite

### Wave 3: Trust Layer MDX
- 8 trust pages in `content/trust/`: about, editorial-policy, sourcing-methodology, corrections, contact, privacy, byline, sources
- `trust/[slug].astro` — dynamic route rendering MDX content
- `TrustLayout.astro` — lastReviewed date + automation disclosure banner

### Wave 4: Sitemaps + robots.txt
- `sitemap-index.xml.ts` — references pages, stories, topics, original-content, news sitemaps
- `news-sitemap.xml.ts` — 48h window, ≤1000 entries (uses `limit()` from free-tier-limits)
- `sitemap-pages.xml.ts` — editions, sections, archives, trust pages, digests
- `sitemap-stories.xml.ts` — all story URLs
- `sitemap-topics.xml.ts` — topic listing pages
- `sitemap-original.xml.ts` — valid empty structure for v2
- `robots.txt.ts` — Googlebot-News allowed, disallows paginated/query variants

### Wave 5: Schema.org + Google News
- `shared/templates/schema.ts` — builders for NewsArticle, Organization+WebSite, BreadcrumbList, ItemList, CollectionPage, Person
- `Base.astro` — renders Organization+WebSite on every page
- `StoryLayout.astro` — renders NewsArticle with headline, url, dates, image, author, publisher, description, section, tags
- `SectionLayout.astro` — renders BreadcrumbList
- Story page passes schema props (topics as keywords, section, published date)

### Fixes Applied
- `news-sitemap.xml.ts` — replaced hardcoded `1000` with `limit('google_news_sitemap_entries_per_file').value`
- Story page publisher links — changed `rel="noopener noreferrer"` to `rel="noopener"` per CON-10
- StoryLayout — replaced hardcoded `"The Meridian"` with `SITE_NAME` constant (fixes D-12 site-name test)

## Requirements Covered

| ID | Status | Implementation |
|----|--------|----------------|
| CON-09 | ✓ | Self-referential canonicals enforced in `pageMeta()` |
| CON-11 | ✓ | Publisher links use `rel="noopener"` |
| CON-12 | ✓ | Automation disclosure on digest + trust pages |
| CON-13 | ✓ | Deterministic template, no translation |
| SEO-01–08 | ✓ | title, description, canonical, lang, hreflang via `pageMeta()` |
| SEO-09 | ✓ | NewsArticle JSON-LD on story pages |
| SEO-10 | ✓ | India EN↔HI hreflang only |
| SEO-11 | ✓ | Stable sitemap index |
| SEO-12 | ✓ | 48h news sitemap, ≤1000 entries |
| SEO-13 | ✓ | RSS autodiscovery via `<link rel="alternate">` |
| SEO-14 | ✓ | robots.txt allows Googlebot-News |
| SEO-15 | ✓ | Disallows paginated/query variants |
| TRS-01–10 | ✓ | All schema builders wired into layouts |
| GRO-10 | ✓ | Date visible, H1=title match, headline length checks |

## Remaining Items (Phase 7)
- Build assertions suite
- Monitoring layer (audit Worker)
- Newsletter signup form
- Weather panel
- Crawl health instrumentation
- Feed freshness SLA alerting
- Corrections workflow UI
- Flag source / report error controls
