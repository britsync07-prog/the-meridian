# Architecture: The Meridian

**Status:** Reconciled and authoritative. Compiled from `.planning/research/SUMMARY.md`, which reconciled four independently researched documents.
**Verified:** 2026-10-20 against official Cloudflare and Google documentation.

> **This file overrides `research/STACK.md` wherever the two disagree.** `STACK.md` was written before the cross-document reconciliation and still carries the 8-project split, a 90-day image lifecycle, and a 5,000-email/month Brevo allowance. All three were corrected in `SUMMARY.md`. Where this file and `STACK.md` conflict, this file is right.

---

## The One-Paragraph Version

| Concern | Position |
|---------|----------|
| Codebases | **One.** Astro codebase, one `package.json`, one lockfile, no workspace protocol. The Worker, the ETL scripts and the site live in one repository so the story schema is shared and cannot drift. |
| Pipeline | **One.** GitHub Actions, 4 builds/day on a fixed schedule. Not a Cloudflare build service (20-minute job cap) and not a deploy hook (the hook URL is the credential). |
| Hostnames | **One.** All seven editions under locale path prefixes on a single hostname. |
| Storage tiers | **Three.** Static (Workers Static Assets), story (R2), media (R2). |
| Ingest | **Fetch-only Worker** writes raw bytes to R2. CI does all parsing, dedup, enrichment, scoring, AI, images and the build. |
| System of record | **D1**, a single database, accessed only through one repository module. |
| Build data source | **One gzipped JSON snapshot object in R2.** The build never opens a D1 binding. |
| Story tier | Pre-rendered HTML in R2, served by the edge Worker at `/story/*`. |

---

## Component Boundaries

| Component | Responsibility | Talks to |
|-----------|---------------|-----------|
| **Source registry** | Feed catalogue, per-outlet metadata, section priors, ETag state, backoff state, freshness SLA, terms-of-use verification ledger | D1 |
| **Fetcher** | Conditional GET only. Owns network I/O. **Never parses.** | R2 (raw), KV (ETag) |
| **Normaliser** | RSS 2.0 / Atom / RDF to canonical `RawItem`. Enforces the excerpt budget. Rejects malformed input loudly. | D1 |
| **Clusterer** | Fingerprint, candidate generation, two-gate merge. Deterministic, auditable, **reversible**. | D1 |
| **Enricher** | Section assignment, topic/entity tagging, cross-country flagging. Records method + confidence per decision. | D1, Workers AI |
| **Scorer** | Trending score, Most Covered ordering, Editor's Picks rank | D1 |
| **Digest generator** | Per-edition original prose with a deterministic template fallback and strict source-set validation | D1, Workers AI |
| **Repository** | The single module through which all D1 access happens. Database ID is a config value. | D1 |
| **Snapshot writer** | Serialises the dataset to one gzipped JSON object in R2. This is the build's data contract. | D1, R2 |
| **Media pipeline** | Content-addressed by `sha256(source_url)`. `sharp` to variants, `satori` to OG. | R2 |
| **Renderer** | One Astro codebase producing both the static tier and the story tier from one design system. | R2 (snapshot), R2 (output) |
| **Publisher** | Uploads story HTML to R2, strips it from the static output, writes sitemaps/RSS/robots.txt. **Fails loudly** on budget overrun. | R2, Workers Static Assets |
| **Edge host** | Workers Static Assets for the static tier; the Worker script for `/story/*` and `/api/*`. | R2, D1, Open-Meteo |
| **Audit Worker** | Daily free-tier accounting against `config/free-tier-limits.json`. | D1, KV |
| **Trust layer** | MDX in the repo, version-controlled, with visible `lastReviewed` dates. | Static output |

---

## Data Flow

| # | Stage | Runs in | Reads | Writes |
|---|-------|----------|-------|--------|
| 1 | Fetch (conditional GET) | Worker, 3 cron triggers, ~1 ms CPU | Publisher RSS feeds | R2 `raw/{date}/{source}.xml`, KV ETag |
| 2 | Parse + normalise + excerpt budget | CI | R2 raw | D1 `stories` rows |
| 3 | Cluster | CI | D1 | D1 `clusters`, `story_sources` |
| 4 | Enrich (section, topics, entities, countries) | CI + Workers AI | D1 | D1 `story_topics`, `story_entities`, `cluster_sections`, `edition_clusters` |
| 5 | Score | CI | D1 | D1 trending score, `editorial_rank` |
| 6 | Digest | CI + Workers AI | D1 | D1 `daily_digests` |
| 7 | Media + OG | CI (sharp, satori) | R2 raw + D1 | R2 `media/{hash}/*.webp`, R2 `og/{slug}.jpg` |
| 8 | Snapshot | CI | D1 | R2 `snapshot.json.gz` |
| 9 | Build | CI (Astro) | R2 snapshot only | `dist/` |
| 10 | Publish | CI | `dist/` | Workers Static Assets (static tier), R2 `story/{slug}.html` (story tier) |
| 11 | Edge serve | Worker script | R2, D1, Open-Meteo | HTTP response |

| Path | Tier | Served by | Worker requests |
|------|------|-----------|-----------------|
| `/uk/` `/us/` `/au/` `/ca/` `/ie/` `/nz/` `/in/` `/in-hi/` | Static | CDN (Workers Static Assets) | **0** - free and unlimited |
| `/story/{slug}/` | Story | Worker script reading R2 | 1 per view |
| `/topic/` `/entity/` `/sitemap*` `/rss/*` | Static | CDN | **0** |

---

## The Three Tiers and Why

| Tier | Contents | Host | Why |
|------|----------|------|-----|
| **Static** | 7 edition front pages, 56 section pages, dated archives, Most Covered pages, topic/entity pages, trust pages, RSS, robots.txt, sitemaps, fonts, CSS | Workers Static Assets | Static asset requests are **free and unlimited**. ~6,700 files at year 1, ~17,700 at year 3. |
| **Story** | One permanent HTML page per story, forever | R2, served by the edge Worker | 43,800 pages/year. In the static tier they would consume the 20,000-file cap at ~day 140-167, inside the six-month success window. |
| **Media** | Story image variants and Open Graph images | R2 behind a custom media domain | Content-addressed, so each publisher image is fetched and resized exactly once, ever. |

---

## D1 Model

| Table | Role | Key detail |
|-------|------|------------|
| `clusters` | **The published unit.** One row per event. | Immutable slug, permanent URL. `published_at` never changes; the 90-day window is a flag, not a deletion. |
| `stories` | Raw mentions. One row per outlet item. | Never rendered directly. Pruned 30 days after the merge window closes. |
| `story_sources` | Many-to-many carrying display rank. | Retains the outlet list, headline and URL permanently. |
| `sources` | Feed registry. | ETag, last-modified, failure count, `disabled_until`, freshness SLA, terms-of-use verification date. |
| `topics`, `entities` | Taxonomy. | `entities` only for gazetteer-matched entities; model-extracted entities never create pages. |
| `story_topics`, `story_entities` | Cluster-to-taxonomy joins. | |
| `sections` | The 8 sections. | Seeded. |
| `editions` | The 7 editions + `in-hi`. | Seeded. |
| `edition_clusters` | Which clusters appear in which editions. | Drives cross-country flagging and the one-story-many-editions model. |
| `cluster_sections` | Cluster to section, with method and confidence. | |
| `daily_digests` | Per-edition digest, with status. | `degraded` when the AI path fails and the template is used. |
| `images` | Media metadata. | Content-addressed by `sha256(source_url)`. |
| `feed_fetches` | Per-feed fetch log. | **Written on change only** - a naive per-poll log costs 11,500 rows/day for zero value. |
| `pipeline_runs` | Build run records. | |
| `usage_log` | Daily free-tier accounting. | Read by the audit Worker. |

| Index | On | Why it matters |
|-------|-----|----------------|
| 4 LSH band indexes | `stories` | Without them the clusterer scans the whole story table and breaches the D1 read budget immediately. |
| `idx_clusters_prominent` | `clusters` | 90-day prominence window lookups. |
| `idx_clusters_score` | `clusters` | Most Covered ordering. |
| `idx_clusters_editorial` (partial) | `clusters` | Editor's Picks, only where `editorial_rank` is set. |

| Topology decision | Position | Rationale |
|-------------------|----------|-----------|
| Database count | **One. No edition sharding.** | Growth is ~70 MB/year against a 500 MB cap (7 years). Sharding breaks the cross-edition queries the product is built on: cross-country flagging, one-story-many-editions, Most Covered. |
| How sharding stays cheap | All D1 access through one repository module with the database ID as a config value. | Sharding later is a routing change, not a rewrite. |
| Growth control | 90-day prominence flag, prune LSH band columns older than 30 days (the merge window is 48 h, so band data is dead weight after that), alert at 60% of 500 MB. | |

---

## Routing Table

| Pattern | Tier | Notes |
|---------|------|-------|
| `/` | Static | Global edition picker / x-default target |
| `/{edition}/` | Static | `uk`, `us`, `au`, `ca`, `ie`, `nz`, `in` |
| `/in-hi/` | Static | Hindi edition, native Hindi sources only |
| `/{edition}/{section}/` | Static | 8 sections |
| `/{edition}/{YYYY}/{MM}/{DD}/` | Static | Dated archive, only for dates with content |
| `/{edition}/most-covered/` | Static | |
| `/topic/{slug}/` | Static | Global, non-faceted, 5-story minimum |
| `/entity/{slug}/` | Static | Gazetteer-matched entities only |
| `/story/{slug}/` | **R2 via Worker** | One canonical page per cluster, edition-agnostic, permanent |
| `/insight/{slug}/` | Static | v2 only. Original articles, structurally separate. |
| `/feed.xml`, `/{edition}/feed.xml`, `/{edition}/{section}/feed.xml` | Static | |
| `/sitemap-index.xml`, `/sitemap-*.xml`, `/news-sitemap-*.xml` | Static | |
| `/api/*` | Worker | R2 / D1 / Open-Meteo. Never on the hot read path. |

**All editions on one hostname via locale path prefixes. Never subdomains.** Crawl budget is per-hostname; Google supports one site name per domain and not at the subdirectory level; subdomain splitting to escape a manual action is named policy circumvention.

---

## The Three Canonical Rules

| # | Rule | Why |
|---|------|-----|
| 1 | **Self-referential canonical on every page. Never a cross-domain canonical.** Publisher URLs are normal followed links with `rel="noopener"`, never `nofollow` or `sponsored`. | A canonical pointing at a publisher tells Google the Meridian URL is not canonical, so the page leaves the index and the property becomes referral-only. There is no duplicate to consolidate: the Meridian page carries the multi-outlet coverage line, coverage count, trending rank, tags, cross-country flags, related links and edition context, none of which exist on the publisher's page. |
| 2 | **hreflang only between India English and India Hindi.** Locale path prefixes do the geotargeting; self-referencing canonicals handle the rest. Alternate sets are bidirectional and self-including, with `x-default` pointing at `/`. | The seven editions carry *different stories*, so they are not localized variants of one page. Marking them as alternates tells Google they are the same page in seven languages, which is false, and it fights the duplicate-content model. |
| 3 | **One canonical story page per cluster**, at `/story/{slug}/`, edition-agnostic. | A story covered by five outlets in three countries is one URL linked from three front pages, not three near-identical pages. Cross-country flagging creates inbound internal links, not duplicate pages. |

| Within-site variant | Handled by | Why |
|---------------------|-----------|-----|
| Trailing-slash variant, `?page=1`, `www` vs apex, subdomain to custom domain | **301 redirect** | Redirects are the strongest signal; `rel=canonical` is next. Mixing the two is discouraged. `rel=canonical` is reserved for "this is me". |
| The canonical and the sitemap entry | Both generated from the same `pageMeta()` function | A sitemap/canonical mismatch makes Google pick arbitrarily. |

---

## The Excerpt Budget

Enforced in the normaliser, asserted by unit test. It is the one place the content model touches source text.

| Rule | Value |
|------|-------|
| Maximum length | 50 words AND 320 characters, whichever binds first |
| Maximum sentences | 2 |
| Maximum share of source | 30% of the source article's visible text |
| Short source | Under 160 words: publish no excerpt at all |
| Truncation | Hard cut at a word boundary with a visible ellipsis |
| Transformation | None. Verbatim or omitted. Never paraphrased, synonymized, or translated. |
| Value-element gate | Every story page must carry **at least four of the six** value elements listed below. Enforced as a build-time gate: a page with fewer fails the build rather than deploying. |

And the complementary value stack that must appear on every story page. **At least four of six, enforced as a build-time gate.** This is the operational form of the scaled-content-abuse defence: because the site self-canonicalises, Google holds the site responsible for the quality of that page, so a thin page is worse than no page.

| # | Value element | What it proves |
|---|---------------|----------------|
| 1 | Multi-outlet coverage line and count | The aggregation exists on no single publisher's page. |
| 2 | Trending rank | The site has its own judgement about what matters. |
| 3 | Topic and entity tags with cross-country flags | Structured classification the publisher does not provide. |
| 4 | Related-story links | The reader gets the combined picture. |
| 5 | The edition digest | Genuinely original prose generated for this edition. |
| 6 | The coverage byline | The site discloses who reported it and when it was first reported. |

---

## Build Order and Dependency Graph

| Phase | Name | Depends on | Track | Note |
|-------|------|-----------|-------|------|
| 1 | Foundation, Free-Tier Contract & Architecture Decisions | - | Both | Decisions and 5 spikes. Domain acquisition starts here as a parallel workstream. |
| 2 | Feed Acquisition, Raw Capture & Normalization | 1 | **A** | Track A. Strictly sequential from 3. |
| 3 | Curation Core: Clustering, Ranking & Enrichment | 2 | **A** | The critical path. Largest quality risk. Spike S-7 here. |
| 4 | Broadsheet Design System & Astro Shell | 1 | **B** | **Runs in parallel with Phases 2 and 3. Must not be sequenced after Phase 3.** |
| 5 | Publication Surface: Editions, Story Tier & Media | 2, 3, 4 | A + B | Needs both tracks. The story renderer reuses the static tier's components. |
| 6 | Digest, Trust Layer & SEO/Discovery | 5 (trust-layer MDX may start after 4) | A | Spike S-6 as entry gate. |
| 7 | Operational Hardening, Rollout & Measurement | 5, 6 | A | |

| Parallel workstream | Starts | Ends | Note |
|-------------------|--------|------|------|
| Domain acquisition | Phase 1 | Before launch | Launch-blocking for Search Console, Publisher Center and meaningful ranking, but **no code dependency**. Everything else builds on the `workers.dev` subdomain and migrates later via 301 redirects. |
| Track B: design system and Astro shell | Phase 1 | Phase 5 | Fully independent of ingest logic. Starting it late is the most common way a project like this misses its window. |
| Track E: taxonomy and lexicon curation | Phase 1 | Continuous | Source registry, section lexicons, country gazetteers and entity gazetteers are content work, not code work. Must never become a blocker for the pipeline. |
| Track C: trust-layer MDX | Phase 4 | Phase 6 | Repo-native MDX, reviewable in pull requests, publishable as soon as the Phase 4 routing and layout exist. |

| Track | Phases | Character | Risk |
|-------|--------|-----------|------|
| **A - pipeline** | 2 then 3 | Strictly sequential. The clusterer cannot be calibrated before real feeds are flowing. | Schedule risk lives here, in the clusterer's correctness, not in the UI. |
| **B - design** | 1, 4, 5 | Fully parallel from Phase 1. | Longest iteration cycle in any web project. |

---

## Failure Modes and Handling

| Failure | Behaviour |
|---------|-----------|
| Feed 404s or stops updating | Recorded as a failure against its freshness SLA, not as "no news". Backoff with jitter, then `disabled_until`. Other feeds unaffected. |
| Feed returns HTML bot-protection page | Sniffed via content-type and XML prolog, quarantined for that feed only, reported with the reason. |
| Feed body over 2 MB | Stream aborted at the ceiling. Quarantined for that feed only. |
| Feed GUIDs unstable | Falls back to canonicalized source URL as item identity. No duplicate items. |
| Image 403s | Typographic fallback renders. The build never fails on an image. |
| AI call times out | Digest falls back to the deterministic template, marked `degraded`. The build never fails on an AI call. |
| D1 write fails | Transaction aborts, the build fails, the previous edition stays live. |
| Build fails | **The previous edition stays live.** That is the correct failure mode for a daily product. |
| Static file budget exceeded | The deploy step fails loudly. It never silently truncates. |
| Build duration exceeds budget | Same. Hard failure. |
| Quota exhaustion at the edge | Routing fails open so the site degrades rather than serving a quota error. |
| Overlapping build trigger | Refused by the build-in-progress guard. |
| Wrongly merged cluster | Split it. Publishes a dated correction note on the affected URL and appends to the corrections log. |

---

## Free-Tier Budget

Full table with sources in `.planning/research/SUMMARY.md` §6 and `config/free-tier-limits.json` (created in Phase 1). Limits the project will actually hit:

| Resource | Limit | Hits at | Mitigation |
|----------|-------|---------|------------|
| Workers requests/day | 100,000 | ~5,000-7,000 daily visitors | Pre-agreed $5/month Workers Paid decision at ~4,000 visitors |
| R2 storage | 10 GB-month | ~month 14 | 12-month lifecycle rule on `media/` only |
| KV writes/day | 1,000 | ~350/day at current load | Never use KV as a site-wide page cache |
| Brevo emails/day | 300 | ~300 newsletter subscribers | Edition-scoped sends; overflow policy decided before 250 subscribers |
| Static asset files/project | 20,000 | ~month 24 | Story pages are already in R2, not the static tier |
| Cloudflare Images transforms/month | 5,000 | **already over** (-44%) | Never bind the service. Pre-generate with `sharp` in CI. |
| Crawl budget | per hostname | n/a | One hostname, hard rule |

---

## Stack Corrections

Corrections to `research/STACK.md` as reconciled in `SUMMARY.md`:

| STACK.md said | Correct position |
|---------------|-----------------|
| 8 assets-only Workers projects, path-routed on one zone | **One project.** The tier split dissolves the file-count problem the 8-project split was solving. |
| R2 lifecycle expiring story images after 90 days | **12 months**, scoped to the `media/` prefix only. Never on `og/` or the root. |
| Brevo free tier = 5,000 emails/month | **300 emails/day**, which caps the newsletter at ~300 daily subscribers. |
| Static files ≈ 143/day, 25,870 at 6 months | That figure describes **story pages in the static tier**. With story pages in R2 the static tier grows at ~18 files/day: ~6,700 at year 1. |
| Astro with an official Cloudflare adapter | **No adapter.** Astro 6+ removed Pages support from `@astrojs/cloudflare`. Pure static output deployed via `wrangler deploy`. |
| Durable Objects as the ingest engine | **Demoted to a spike-gated optimization** (S-1). The official docs contradict each other on the Free-plan CPU limit. The default is fetch-only Worker to R2 to CI, which works either way. |

---

*Compiled: 2026-10-20*
*Sources: `.planning/research/SUMMARY.md` (authoritative) · `.planning/research/ARCHITECTURE.md` · `.planning/research/STACK.md` · `.planning/research/PITFALLS.md` · `.planning/research/FEATURES.md`*
