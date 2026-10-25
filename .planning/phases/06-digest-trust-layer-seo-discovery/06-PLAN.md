# Phase 6 Plan: Digest, Trust Layer & SEO/Discovery

**Phase:** 06  
**Goal:** Every edition carries genuinely original prose and a complete, honest trust layer, and the whole site becomes technically compliant, discoverable and eligible for Google News.  
**Started:** 2026-10-25  
**Status:** ◆ In Progress

---

## Requirements to Implement

| ID | Requirement | Implementation |
|----|-------------|----------------|
| CON-09 | Self-referential canonicals only | `pageMeta()` in `shared/templates/head.ts` — path must be site-relative |
| CON-11 | Publisher attribution as normal links | Story pages: `rel="noopener"`, no `nofollow`/`sponsored` |
| CON-12 | Visible automation disclosure | All auto-generated pages: "Automatically curated" notice |
| CON-13 | No machine translation | Hindi digest from native publishers, deterministic template |
| CON-14 | Edition-agnostic story URLs | `/story/{slug}/` — already exists from Phase 5 |
| SEO-01–08 | Title, description, canonical, lang, hreflang, sitemap | `pageMeta()` integration + hreflang builder |
| SEO-09 | NewsArticle schema | JSON-LD in page head |
| SEO-10 | India EN↔HI hreflang only | hreflang set with x-default to / |
| SEO-11 | Sitemap index | Multi-file sitemap structure |
| SEO-12 | 48h news sitemap, 1000 entries max | `news-sitemap.xml` |
| SEO-13 | RSS autodiscovery | `<link rel="alternate">` in head |
| SEO-14 | robots.txt allows Googlebot-News | Enhanced robots |
| SEO-15 | Noindex on paginated/query variants | robots.txt disallow rules |
| SEO-16 | Alt text from headline | MediaImage component |
| SEO-17 | Image dimensions | MediaImage: explicit width/height |
| SEO-18 | Font preload only hero/primary | Already in Base.astro |
| TRS-01–10 | Trust layer: About, Policy, Sources, Corrections, Contact, Privacy, Byline | MDX in `apps/site/content/` |
| ING-05 | Per-feed terms verification ledger | Source registry (Phase 2 — verify exists) |
| GRO-10 | Google News article requirements | Visible date, H1=title, headline 2-22 words, image 60×90+ |

---

## Work Breakdown

### Wave 1: Digest Engine (TDD)
1. **Write digest tests** (`apps/site/__tests__/digest.test.ts`)
   - 300-400 words
   - ≥60% novel sentences (not in source headlines/excerpts)
   - No verbatim source headline
   - Deterministic template fallback
   - "Automated summary" visible notice
2. **Implement digest generator** (`apps/site/src/lib/digest.ts`)
   - `generateDigest(clusters, sources, edition): DigestResult`
   - Deterministic template: native headline composition, no translation
   - Novel sentence scoring: compare against source headlines
   - Status: `generated` or `degraded`
3. **Digest page** (`apps/site/src/pages/[edition]/digest.astro`)
   - Renders digest with disclosure

### Wave 2: pageMeta Integration
1. **Write pageMeta integration tests**
   - Canonical is self-referential
   - Title includes edition country + SITE_NAME
   - htmlLang matches edition
   - hreflang correct for India EN/HI
2. **Create hreflang helper** (`shared/templates/hreflang.ts`)
   - `buildHreflang(edition, path): HreflangAlternate[]`
   - India EN↔HI only; x-default to /
3. **Create og-image helper** (`shared/templates/og-meta.ts`)
   - Open Graph + Twitter card tags
4. **Integrate pageMeta into Base layout**
   - Replace current head with `renderHead(pageMeta(...))`

### Wave 3: Trust Layer MDX
1. **Create content/ directory structure**
   ```
   apps/site/content/trust/
   ├── about.mdx
   ├── editorial-policy.mdx
   ├── sourcing-methodology.mdx
   ├── corrections.mdx
   ├── contact.mdx
   ├── privacy.mdx
   ├── byline.mdx
   └── sources.mdx
   ```
2. **TrustLayout component** with lastReviewed date + automation disclosure
3. **Trust pages** auto-link from footer

### Wave 4: Sitemaps + robots.txt
1. **Sitemap index** (`sitemap-index.xml`) — references per-edition, per-year, topic, original
2. **News sitemap** (`news-sitemap.xml`) — 48h window, ≤1000 entries
3. **Per-edition page sitemaps** — static pages
4. **Per-year story sitemaps** — story URLs
5. **Topics sitemap**
6. **Original-content sitemap** (empty, valid structure)
7. **Enhanced robots.txt** — Googlebot-News, noindex on paginated

### Wave 5: Schema.org + Google News
1. **JSON-LD builder** (`shared/templates/schema.ts`)
   - NewsArticle (story pages)
   - Organization + WebSite
   - BreadcrumbList (listings)
   - ItemList (Most Covered, sections)
   - CollectionPage (listings)
2. **Google News article checks** (story page):
   - Visible date between headline and body
   - H1 matches title
   - Anchor text matches title
   - Headline 2-22 words, ≤110 chars
   - Image ≥60×90px
   - author.url → byline page

### Wave 6: Tests + Build Verification
1. Run full test suite
2. Run typecheck
3. Run build (155 pages → +trust pages)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/site/src/lib/digest.ts` | New — digest generator |
| `apps/site/__tests__/digest.test.ts` | New — digest tests |
| `apps/site/src/pages/[edition]/digest.astro` | New — digest page |
| `shared/templates/hreflang.ts` | New — hreflang builder |
| `shared/templates/og-meta.ts` | New — OG/Twitter helper |
| `shared/templates/schema.ts` | New — JSON-LD builders |
| `apps/site/src/layouts/Base.astro` | Modify — integrate pageMeta |
| `apps/site/src/pages/sitemap-index.xml.ts` | New — sitemap index |
| `apps/site/src/pages/news-sitemap.xml.ts` | New — 48h news sitemap |
| `apps/site/src/pages/sitemap.xml.ts` | Replace — page sitemap |
| `apps/site/src/pages/robots.txt.ts` | Replace — enhanced robots |
| `apps/site/content/trust/*.mdx` | New — 8 trust pages |
| `apps/site/src/layouts/TrustLayout.astro` | New — trust page layout |

---

## Grey Areas (Auto-Approved)

| Area | Decision | Rationale |
|------|----------|-----------|
| digest-model | Deterministic template default; LLM if available via env | S-6 bake-off deferred; template is compliant |
| content-dir | MDX in `apps/site/content/trust/` | Standard Astro MDX pattern; reviewable in PRs |
| sitemap-freq | `hourly` for front pages, `weekly` for stories | Matches publishing cadence |
| news-sitemap | 48 hours, 1000 entries max | Per SEO-12 spec |
| original-content-sitemap | Valid empty structure, populated in v2 | Per SEO-07 spec |

---

## Test Strategy (TDD)

1. Write tests FIRST for each module
2. Confirm RED (tests fail)
3. Implement to pass GREEN
4. Refactor for clarity
5. Verify 80%+ coverage on new code

## Execution Order

1. Digest engine (Wave 1)
2. pageMeta + hreflang + OG (Wave 2)
3. Trust layer MDX (Wave 3)
4. Sitemaps + robots (Wave 4)
5. Schema.org + Google News (Wave 5)
6. Tests + build (Wave 6)
