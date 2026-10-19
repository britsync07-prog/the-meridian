# Stack Research

**Domain:** Free-tier Cloudflare-based automated news aggregation + programmatic SEO publication (7 country editions, ~120 stories/day, ~50k static pages/year, zero budget)
**Project:** The Meridian
**Researched:** 2026-10-20
**Confidence:** HIGH on all Cloudflare limits and package versions (verified against official docs / npm registry on 2026-10-20). MEDIUM on Durable Objects CPU-on-Free (contradictory official docs — flagged). MEDIUM on satori CPU cost in Workers and Hindi-generation quality (no official benchmark; spike required).

---

## Executive Summary — Read This First

Three findings override every other decision in this document.

**1. The Workers Free plan gives a cron trigger 10 ms of CPU. Parsing one RSS feed costs ~9.5 ms.**
Measured on this machine (Node 24.12, `fast-xml-parser@5.11.2`): a realistic 40 KB / 60-item feed parses in **9.45 ms**; normalization adds **0.48 ms**; all-pairs Jaccard over 60 headlines adds **2.06 ms**. Fifty feeds therefore need **~500–600 ms of CPU** — 50–60× the entire Free-plan budget for one cron invocation. *The RSS pipeline cannot live inside a Workers Free cron trigger.* This is a hard architectural fact, not a tuning problem.

**2. The 20,000-file static-asset cap is hit around day 140 — inside the project's own 6-month success window.**
Cloudflare Pages (Free) and Cloudflare Workers Static Assets (Free) both cap a site at **20,000 files**. This project adds ~143 files/day (120 stories + 7 date archives + ~16 new topic/entity pages). `20,000 ÷ 143 = 140 days`. At 12 months the site needs ~54,000 files. **The free tier's file cap is the single binding constraint on this project.** The fix is a multi-project split (8 Workers projects) — detailed in §"The File-Count Problem".

**3. Astro 6+ removed Cloudflare Pages support from `@astrojs/cloudflare`.**
The official Astro upgrade notes say: *"Removed: Cloudflare Pages support — The Astro Cloudflare adapter no longer supports deployment on Cloudflare Pages. For the best experience and feature support, you should migrate to Cloudflare Workers."* Cloudflare publishes a first-party Pages→Workers migration guide. **PROJECT.md's "Cloudflare Pages" assumption is stale and must be amended to "Cloudflare Workers with Static Assets."** No rework is needed: the recommended path is a pure-static Astro build with **no adapter at all**, deployed as assets-only Workers.

**The net architecture that satisfies every constraint:**

```
Cron Worker (Free, ~0 CPU)          CI build (Node, full CPU)              Edge (free, unlimited)
─────────────────────────────        ────────────────────────────          ─────────────────────
fetch 50 feeds  ──► R2 raw/          read R2 → parse (fast-xml-parser)       8 assets-only Workers
  (network only,                     → normalize → dedup (embeddings)        (20k files each)
   no subrequest charge)              → tag → score → write D1                → 160k files total
                                    → generate OG images → R2
                                    → render HTML → split → 8 × wrangler deploy
```

The Worker becomes a ~40-line fetcher. All CPU-heavy work moves to CI, where CPU is free. Everything still lands in D1 as the system of record.

**Verdict on the zero-cost constraint: the free tier covers this project for ~2 years, but only with the 8-project static split and with parsing moved to CI.** The $5/month Workers Paid plan removes three separate ceilings (file count, cron CPU, Vectorize availability) for $60/year — the highest-leverage spend available, and the first thing to buy if the project ever earns revenue.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Astro** | `7.4.1` | Static site generator for the 7 editions + global pages | Ships zero JS by default (INP ≈ 0, CLS ≈ 0 out of the box); component model gives a real broadsheet layout system; one language for the whole ETL + render pipeline; official Cloudflare adapter; `experimental.incrementalBuild` (added `astro@7.2.0`) skips re-rendering unchanged pages. **Rust compiler is now the only compiler** — faster, but stricter about unclosed tags and invalid nesting. |
| **Tailwind CSS** | `4.3.3` | Utility CSS for the broadsheet design system | v4's CSS-first `@theme` config fits a design-token-heavy broadsheet (paper-white/ink-black/one accent, light+dark) without a JS config file. Official Astro guide: `npm install tailwindcss @tailwindcss/vite` → add `tailwindcss()` to `vite.plugins` → `@import "tailwindcss";` in `src/styles/global.css`. |
| **@tailwindcss/vite** | `4.3.3` | Tailwind v4 integration for Astro/Vite | **Use this, not `@tailwindcss/postcss` (4.3.3).** The Vite plugin path is what Tailwind's own Astro guide documents; the PostCSS path is the fallback for non-Vite setups and adds a redundant processing layer. |
| **Cloudflare Workers (assets-only)** | Free plan | Static hosting for 8 projects | Static asset requests are **free and unlimited** on Workers ([billing-and-limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). Astro 6+ dropped Pages support. Non-root routes let 8 projects share one zone via path routing. |
| **Cloudflare Workers + Cron Triggers** | Free plan | Feed ingest, Workers AI calls | 5 cron triggers/account, 15 min wall time per trigger, 100,000 requests/day, 50 subrequests/invocation, 1,000 subrequests to internal services (D1/KV/R2). |
| **Cloudflare D1** | Free plan | System of record (stories, sources, tags, entities, clusters, digests) | 5M rows read/day, 100K rows written/day, 5 GB storage across 10 DBs (500 MB/DB), 7-day Time Travel, 30 s max query duration, 50 queries per Worker invocation. Project needs <100 MB/year of row data. |
| **Cloudflare R2** | Free tier | Raw feed snapshots, story images + resized variants, OG images | 10 GB-month storage, 1M Class A ops/mo, 10M Class B ops/mo, **free egress**. Projected year-1 usage: ~4 GB with a 90-day lifecycle rule on story images. |
| **Cloudflare Workers KV** | Free plan | Small hot caches (per-edition front-page payload, feed ETag cache) | 100K reads/day, only **1,000 writes/day** — so use it for ~60 keys/day, not as a primary store. 1 GB storage, 25 MiB value cap. |
| **Cloudflare Workers AI** | Free tier | Embeddings (dedup + topic classification), text generation (daily digests) | 10,000 neurons/day free, $0.011/1,000 neurons above. Rate limits: embeddings 3,000/min, text generation 300/min, classification 2,000/min. Projected usage: **~170 neurons/day = 1.7% of budget.** |
| **Wrangler** | `4.151.2` | Deploy Workers, manage D1/R2/KV bindings, run migrations | The only supported way to deploy assets-only Workers and to import SQL into D1 from CI. `wrangler d1 execute --file` is the D1 write path from CI. |
| **GitHub Actions** | Free tier | The scheduled build | 2,000 min/month free for private repos, **unlimited for public repos**. No 20-minute job cap (unlike Workers Builds). One job/day at ~12 min = ~360 min/month. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **fast-xml-parser** | `5.11.2` | RSS 2.0 / Atom parsing | Always. Pure JS, no native deps, Workers- and Node-compatible. Configure `ignoreAttributes:false`, `attributeNamePrefix:'@_'`, `processEntities:true`, `trimValues:true`. |
| **@astrojs/cloudflare** | `14.4.1` | Cloudflare adapter | **Only if** a future phase needs on-demand rendering (site search, live weather widget). Requires `astro ^7.4.0` + `wrangler ^4.125.0`. Set `imageService:'passthrough'` and `prerenderEnvironment:'node'` if used — see Gotchas. |
| **@astrojs/sitemap** | `3.7.4` | Basic XML sitemap | Partially — it does **not** support the `news:` namespace or `xhtml:link` hreflang alternates. Use it for the simple page sitemap, and hand-roll the news sitemap + alternates. |
| **@astrojs/rss** | `4.0.19` | The site's own RSS feed endpoints | Always. One endpoint per edition + one global feed. |
| **satori** | `0.63.0` | HTML+CSS → SVG for OG images | Always, in the CI build (Node). MPL-2.0 license. Pure JS with base64-embedded WASM; in Workers use `satori/standalone` + a separately-imported `layout.wasm`. |
| **sharp** | `0.35.5` | Image resizing + SVG→JPEG/PNG rasterization | Always, in the CI build only. **sharp is a native module and does not run in Workers.** |
| **@resvg/resvg-wasm** | `2.6.2` | Alternative SVG→PNG (wasm, Workers-compatible) | Only if OG generation must move into a Worker on Workers Paid. 2.5 MB unpacked. Prefer satori+sharp in CI. |
| **sitemap** | `9.0.1` | Sitemap index + chunked sitemaps with `xhtml:link` alternates | Use for the hand-rolled sitemap generator (50k-URL chunks + hreflang). |
| **rss** | `1.2.2` | Underlying RSS 2.0 builder | Used by `@astrojs/rss`; also directly if the news feed needs a custom shape. |
| **zod** | `4.6.7` | Schema validation for normalized feed records and AI JSON output | Always, at the ingest boundary. Zod 4.5.0+ uses substantially less memory in Workers. |
| **p-limit** | `7.3.3` | Concurrency limiter for feed fetches | In the CI build. Note the Workers runtime hard-caps **6 simultaneous outgoing connections** per invocation regardless of what you request. |
| **nanoid** | `6.0.2` | Slug/suffix generation for content-addressed keys | Always. |
| **clsx** + **tailwind-merge** | `2.1.1` / `3.7.0` | Conditional class composition | Only if any React/Preact island is added. Prefer plain Astro class strings for a zero-JS site. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **vitest** `5.0.5` | Unit tests for the dedup, scoring, and normalization logic | Test the dedup thresholds against a labelled fixture set of 200 near-duplicate headlines — this is the core differentiator and must be measurable. |
| **eslint** `10.13.0` + **prettier** `3.9.10` | Lint/format | Standard. |
| **wrangler** `4.151.2` | Local emulation, D1 shell, R2/KV dev, deploy | `wrangler dev` runs the real `workerd` runtime. D1 local DB lives at `.wrangler/state`. |
| **@cloudflare/workers-types** `5.20261019.1` | TS types for the Worker | Regenerate with `wrangler types` after every binding change. |
| **@cloudflare/vite-plugin** `1.64.0` | Vite integration for Workers | Use if/when the Cloudflare adapter is adopted. |
| **design-taste-frontend** skill | Governs all UI work | Required by PROJECT.md. Encodes the anti-slop rules and the dials (variance 7, motion 3, density 7). |

---

## The Free-Tier Ceiling Table (All Verified 2026-10-20)

Every number below was read from the linked official page on 2026-10-20.

### Cloudflare Workers — Free plan

| Limit | Value | Source |
|---|---|---|
| Requests | 100,000 / day | [workers/platform/limits](https://developers.cloudflare.com/workers/platform/limits/) |
| CPU time per HTTP request | **10 ms** | same |
| CPU time per Cron Trigger | **10 ms** | same |
| Memory | 128 MB | same |
| Subrequests per invocation | 50 | same |
| Subrequests to internal services (D1/KV/R2) | 1,000 | same |
| Simultaneous outgoing connections | 6 | same |
| Worker bundle size (uncompressed) | 64 MiB | same |
| Cron Triggers per account | 5 | same |
| Cron Trigger wall time | 15 min | same |
| Workers per account | 100 | same |
| Static asset files per Worker version | **20,000** (100,000 Paid) | same |
| Static asset requests | **free and unlimited** | [static-assets/billing-and-limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| Workers Logs | 200,000 events/day, 3-day retention | [workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Vectorize | **Paid only** | same |
| Subrequest billing | "Cloudflare does not bill for subrequests" | same |

### Cloudflare D1 — Free plan

| Limit | Value | Source |
|---|---|---|
| Rows read | 5,000,000 / day | [d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Rows written | 100,000 / day | same |
| Storage | 5 GB total / account | same |
| Max database size | 500 MB | [d1/platform/limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Databases per account | 10 | same |
| Queries per Worker invocation | 50 | same |
| Max SQL query duration | 30 s | same |
| Time Travel | 7 days | same |
| Max row size | 2 MB | same |
| `d1 execute --file` import size | 5 GB | same |

### Cloudflare KV — Free plan

| Limit | Value | Source |
|---|---|---|
| Reads | 100,000 / day | [kv/platform/limits](https://developers.cloudflare.com/kv/platform/limits/) |
| Writes to different keys | **1,000 / day** | same |
| Writes to same key | 1 / second | same |
| Operations per Worker invocation | 1,000 | same |
| Storage | 1 GB / account, 1 GB / namespace | same |
| Value size | 25 MiB | same |
| Key size | 512 bytes | same |

### Cloudflare R2 — Free tier

| Limit | Value | Source |
|---|---|---|
| Storage | 10 GB-month / month | [r2/pricing](https://developers.cloudflare.com/r2/pricing/) |
| Class A ops (writes, lists) | 1,000,000 / month | same |
| Class B ops (reads, heads) | 10,000,000 / month | same |
| Egress | **Free** | same |
| Max upload (single-part) | 5 GiB | [r2/platform/limits](https://developers.cloudflare.com/r2/platform/limits/) |
| Object key length | 1,024 bytes | same |

### Cloudflare Workers AI — Free

| Limit | Value | Source |
|---|---|---|
| Daily allocation | **10,000 neurons/day** | [workers-ai/platform/pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Price above free allocation | $0.011 / 1,000 neurons (Paid only) | same |
| Text Generation rate | 300 req/min | [workers-ai/platform/limits](https://developers.cloudflare.com/workers-ai/platform/limits/) |
| Text Embeddings rate | 3,000 req/min (`bge-large-en-v1.5`: 1,500) | same |
| Text Classification rate | 2,000 req/min | same |
| Summarization rate | 1,500 req/min | same |
| Translation rate | 720 req/min | same |
| Models requiring a paid billing method (**avoid**) | `@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `deepseek-v4-pro-0813` | same |

### Cloudflare Pages / Workers Builds

| Limit | Pages Free | Workers Builds Free | Source |
|---|---|---|---|
| Builds | 500 / month | 3,000 build minutes / month | [pages/platform/limits](https://developers.cloudflare.com/pages/platform/limits/), [workers/ci-cd/builds/limits-and-pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) |
| Build timeout | 20 min | 20 min | same |
| Concurrent builds | 1 | 1 | same |
| Files per site | **20,000** | n/a | same |
| Max file size | 25 MiB | n/a | same |
| Build CPU / RAM / disk | n/a | 2 vCPU / 8 GB / 20 GB | same |
| Projects | 100 | 500 Workers | same |

### Third-party

| Service | Free tier | Source |
|---|---|---|
| **Open-Meteo** | 10,000 calls/day, 5,000/hour, 600/min, 300,000/month. **Non-commercial use only.** Data is CC BY 4.0 → **attribution required.** | [open-meteo.com/en/pricing](https://open-meteo.com/en/pricing) |
| **Brevo** | From **5,000 emails/month**, free forever, no credit card | [brevo.com/pricing](https://www.brevo.com/pricing/) |
| **Cloudflare Web Analytics** | All plans, no published quota | [developers.cloudflare.com/web-analytics](https://developers.cloudflare.com/web-analytics/) |
| **GitHub Actions** | 2,000 min/month (private), **free for public repos** | [docs.github.com billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) |

---

## The Workload Check (Every Limit vs. Projected Load)

Projected load: 50 RSS feeds, 120 stories/day, 120 images/day, 8 editions, ~50k static files at 12 months, 1,000 daily visitors at launch, 10,000 by 12 months.

| Resource | Limit | Projected @6mo | Projected @12mo | Verdict |
|---|---|---|---|---|
| **Workers requests/day** | 100,000 | ~400 (5 cron + ~300 AI + ~50 internal) | ~400 | ✅ **0.4% used.** Static page views are free & unlimited. |
| **Workers cron CPU** | 10 ms | ~1 ms (fetch+put only) | ~1 ms | ✅ **Only if parsing happens in CI.** See §"Ingest". |
| **Worker subrequests** | 50/invocation | 50 feeds → must use **2+ cron triggers** (5 available) or CI | same | ⚠️ Split across 2–3 triggers. |
| **Simultaneous connections** | 6 | 6 concurrent → 9 rounds for 50 feeds | same | ✅ Wall time 15 min is ample. |
| **Workers AI neurons/day** | 10,000 | ~170 (13 embed + 155 digest) | ~170 | ✅ **1.7% used.** Even 70B digests = 945 (9.5%). |
| **Workers AI req/min** | 300 (text gen) | 7 digests | 7 | ✅ |
| **D1 rows read/day** | 5,000,000 | ~250,000 (full dataset read per build) | ~600,000 | ✅ **12% at 12mo.** Use indexes; never `SELECT *` on `stories`. |
| **D1 rows written/day** | 100,000 | ~1,200 (incl. index rows) | ~1,200 | ✅ **1.2% used.** |
| **D1 storage** | 5 GB (500 MB/DB) | ~60 MB | ~120 MB | ✅ **2.4% used.** |
| **KV writes/day** | 1,000 | ~60 (8 edition payloads + 50 feed ETags + manifest) | ~60 | ✅ **6% used.** |
| **KV reads/day** | 100,000 | ~100 (static site reads almost nothing) | ~500 | ✅ |
| **R2 storage** | 10 GB-month | ~1.9 GB | ~4.0 GB (with 90-day lifecycle on story images) | ✅ **40% used.** ⚠️ Without a lifecycle rule: ~5.2 GB at 12mo (still OK), ~26 GB at 24mo (**fails**). |
| **R2 Class A ops/mo** | 1,000,000 | ~12,300 (50 feeds + 240 image variants + 120 OG) | ~12,300 | ✅ **1.2% used.** |
| **R2 Class B ops/mo** | 10,000,000 | ~90,000 (1k visitors × 3 images) | ~900,000 (10k visitors) | ✅ **9% used.** |
| **R2 egress** | Free | Free | Free | ✅ |
| **Static files (1 project)** | **20,000** | **25,870** | **54,465** | ❌ **FAILS at ~day 140.** → 8-project split required. |
| **Static files (8 projects)** | 160,000 | 25,870 | 54,465 | ✅ **34% used at 12mo.** Comfortable to ~24 months. |
| **Cloudflare Images transforms** | 5,000/mo | 7,200/mo if used | 7,200/mo | ❌ **FAILS.** → Pre-generate variants with sharp in CI. |
| **Workers Builds minutes** | 3,000/mo | 360 (1 job × 12 min × 30) | 360 | ✅ But the **20-min job timeout** is the risk → use GitHub Actions. |
| **GitHub Actions minutes** | 2,000/mo | ~360 | ~360 | ✅ **18% used.** |
| **Brevo emails/mo** | 5,000 | 210 (7 daily × 30) | 210 | ✅ |
| **Open-Meteo calls/day** | 10,000 | ~20 (7 countries + 13 cities, cached 30 min) | ~20 | ✅ |
| **Images (5,000/mo free)** | 5,000 | 7,200 | 7,200 | ❌ **Confirmed not free-sufficient.** |

### The File-Count Problem — Quantified

| Asset | Files/day | @6 months | @12 months |
|---|---|---|---|
| Story pages (120/day) | 120 | 21,600 | 43,800 |
| Date archive pages (7 editions/day) | 7 | 1,260 | 2,555 |
| Topic pages (global, growing) | ~8 | ~1,400 | ~2,600 |
| Entity pages (global, growing) | ~8 | ~1,500 | ~3,400 |
| Edition front pages + 56 section pages | 0 | 64 | 64 |
| RSS feeds, robots.txt, sitemaps, fonts, CSS, JS | 0 | ~45 | ~45 |
| **Subtotal (static files)** | **~143/day** | **~25,870** | **~54,465** |
| OG images (**if stored as static files**) | 120 | +21,600 | +43,800 |
| **Total if OG images are static** | **~263/day** | **~47,470** | **~98,265** |

**Two decisions follow:**

1. **OG images go to R2, not to static assets.** Served from an R2 custom domain (`assets.meridian.news`) with `Cache-Control: public, max-age=31536000, immutable`. `og:image` accepts any absolute URL. This removes the single biggest file multiplier and consumes zero Worker requests. → 25,870 files at 6 months.
2. **Split the site across 8 assets-only Workers projects**: `meridian-global` (root `/`), `meridian-uk`, `meridian-us`, `meridian-au`, `meridian-ca`, `meridian-ie`, `meridian-nz`, `meridian-in`. Each gets its own 20,000-file budget = **160,000 total**. Per-project at 12 months: ~6,600 files (edition) / ~6,100 (global) — **33% of each budget.**
   - Route all 8 to one zone with **non-root routes** (`meridian.news/uk/*` → `meridian-uk`). Workers supports non-root routes; Pages does not. → **Zero Worker requests for page views** (native routing, not a Worker proxy).
   - Deploy all 8 from one CI job: one `astro build` → a split script copies `dist/uk` → `.deploy/uk`, etc. → 8 × `wrangler deploy -c wrangler.uk.jsonc`.
   - **Alternative if $5/month is acceptable:** one project + Workers Paid → 100,000 files, no split, no 8 deploys. See §"What NOT to Use".

---

## The Ingest Pipeline — Free-Tier Architecture

### Option 1 (RECOMMENDED): Fetch in the Worker, transform in CI

```
[Worker: meridian-ingest]  scheduled, 2-3 cron triggers
  └─ 50 feeds → fetch() (subrequests free) → R2 raw/2026-10-20/<publisher>.xml
     CPU cost: ~1 ms (network wait does not count). No parsing.
  └─ writes 1 KV key per feed (ETag + last-modified) → 50 KV writes/day

[CI: GitHub Actions, cron 05:00 UTC]
  └─ read raw/ from R2 → fast-xml-parser → normalize (zod) → dedup → tag → score
  └─ write D1 via `wrangler d1 execute meridian --file=out.sql`
  └─ Workers AI calls (embeddings, digests) via a small Worker endpoint or REST + API token
  └─ download + resize images with sharp → upload variants to R2
  └─ generate OG images with satori + sharp → upload to R2
  └─ astro build → split → 8 × wrangler deploy
```

**Why this is the right call:**
- Zero CPU risk in the Worker — the 10 ms limit is never approached.
- Removes the 50-subrequest cap from the critical path (the Worker fetches, but 2–3 cron triggers × 50 = 100–150 capacity, and the CI build can fetch directly as a fallback with no cap at all).
- Removes the 6-connection cap as a bottleneck.
- Puts the entire dedup + AI + image pipeline in one place with full CPU and full debuggability.
- D1 is still the system of record and is still written every build, satisfying PROJECT.md's D1 requirement.

**Required amendment to PROJECT.md:** the requirement *"A Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule and writes normalized stories into D1"* should become: *"A Cloudflare Worker fetches publisher RSS feeds on a schedule and persists raw feed snapshots to R2; the build pipeline normalizes, deduplicates, tags and writes stories into D1."* This is a wording change, not a scope change.

**Cron trigger split (respecting 50 subrequests/invocation):**

| Trigger | Schedule | Feeds | Subrequests used |
|---|---|---|---|
| `meridian-ingest-1` | `*/13 * * * *` (or `7,20,33,46,59 * * * *`) | ~17 | 17 |
| `meridian-ingest-2` | offset by 7 min | ~17 | 17 |
| `meridian-ingest-3` | offset by 14 min | ~16 | 16 |

5 cron triggers/account are available; use 3. Wall time per trigger is 15 min; 17 feeds × 6 concurrent = 3 rounds ≈ 10 s.

### Option 2: Durable Object as the ingest engine — **INVESTIGATE, DO NOT COMMIT YET**

The official docs contradict each other:
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free plan = 10 ms CPU per invocation.
- [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/): *"SQLite-backed Durable Objects general limits → CPU per request: 30 seconds (default)"*, while also stating *"Durable Objects are a special kind of Worker, so Workers Limits apply according to your Workers plan. In addition, Durable Objects have specific limits."*

If DO requests genuinely get 30 s CPU on the Free plan, a single SQLite-backed DO could parse all 50 feeds in one invocation and be the cleanest possible ingest design (SQLite storage billed at D1 rates: 5M rows read/day, 100K rows written/day, 5 GB storage free; 100,000 DO requests/day; 13,000 GB-s duration/day). **Confidence: MEDIUM. Spike required: deploy a DO on the Free plan, burn ~2 s of CPU in a loop, and see whether it dies at 10 ms (Error 1102) or 30 s.** Budget 30 minutes. Do this before the ingest phase, not during it.

### Option 3: Cloudflare Queues

10,000 operations/day free on the Workers Free plan (~3,333 messages/day). 50 feed-messages/day = 150 ops. Queues give automatic retries and backpressure, which is genuinely valuable for a 50-feed ingest. **But** if queue consumer invocations inherit the 10 ms CPU cap, Queues alone does not solve the parse cost — it only improves fan-out. **Use Queues as a retry/backpressure layer around Option 1 if feed flakiness proves to be a problem; do not depend on it to solve CPU.**

### Option 4: Workers Paid ($5/month) — the escape hatch

| Limit | Free | Paid |
|---|---|---|
| Cron Trigger CPU | 10 ms | **15 min** |
| Static asset files | 20,000 | **100,000** |
| Vectorize | not available | **available** |
| D1 rows read | 5M/day | 25B/month |
| D1 rows written | 100K/day | 50M/month |
| D1 max DB size | 500 MB | 10 GB |
| Requests | 100K/day | 10M/month included, then $0.30/M |
| CPU time | — | 30M ms/month included, then $0.02/M |
| Cost | $0 | **$5/month base; at this project's scale, usage is far under the included allotments → $5/month flat, $60/year** |

**Recommendation: do not buy it on day 1. Build for the Free tier, and buy it the moment the project has revenue.** The $5 removes three ceilings for the price of a coffee, but the free-tier architecture above genuinely works for ~2 years.

---

## RSS Parsing (Question 4)

**`fast-xml-parser@5.11.2` — the choice. No contest.**

| Option | Verdict | Why |
|---|---|---|
| **`fast-xml-parser` 5.11.2** | ✅ **Use** | Pure JS, no native deps, runs in Node **and** Workers. 1.3 MB unpacked. Handles RSS 2.0, Atom, and `media:`/`dc:` namespaces via `attributeNamePrefix`. Measured 9.45 ms for a 40 KB/60-item feed. |
| `sax` / `sax-js` | ❌ Avoid | Streaming (lower memory) but materially slower per byte and a far more awkward API. At 50 feeds/day, memory is a non-issue. |
| `node-html-parser` / `cheerio` 1.2.0 | ❌ Avoid | HTML parsers. Wrong tool. `cheerio` is heavy (full DOM + CSS selectors) for no benefit. |
| `@xmldom/xmldom` | ❌ Avoid | DOM-building XML parser: slow, allocation-heavy, no advantage. |
| `htmlparser2` | ⚠️ Possible | Fast, but oriented at HTML. Only consider if a publisher's feed is malformed XML and `fast-xml-parser` chokes (use `processEntities:false` as the first fix). |

**Configuration:**
```js
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});
```
Handle RSS 2.0 (`rss.channel.item[]`) and Atom (`feed.entry[]`) with a normalizer that maps both to a single `FeedItem` shape. **RSS 2.0 and Atom both need `dc:creator`, `media:content`/`media:thumbnail`, and `content:encoded` handled explicitly** — publisher feeds are inconsistent here.

---

## Deduplication (Question 5)

### Recommended: two-stage, lexical gate → embedding confirm

**Stage 1 — lexical gate (free, instant, 0 neurons).**
Normalize the headline (lowercase, strip punctuation and stopwords), build a token set, and compute Jaccard similarity against headlines from the last 48 hours. Measured: **2.06 ms for 1,770 pairs** (60×60/2) — trivial. Candidates above ~0.30–0.35 proceed.

**Stage 2 — embedding confirmation (`@cf/baai/bge-m3`, 1,075 neurons/M input tokens).**
Embed the candidate headline (1024 dims) and compute cosine against the stored vectors of the candidate cluster's members. Merge above ~0.82. Store vectors as **int8-quantized BLOBs in D1** (1 KB each) — Vectorize is Workers-Paid-only, so D1 + in-process cosine is the free-tier path. 1024 dims × 200 candidates ≈ 205k multiply-adds ≈ **<1 ms**.

**Why bge-m3 and not bge-small-en-v1.5:**

| Model | Dims | Neurons/M input | Multilingual | Use |
|---|---|---|---|---|
| **`@cf/baai/bge-m3`** | 1024 | **1,075** (cheapest) | Yes (incl. Hindi) | ✅ **Primary.** One model covers English + Hindi; cheapest per token. |
| `@cf/baai/bge-small-en-v1.5` | 384 | 1,841 | English only | Use only as an English-only fast path if neuron pressure appears (it won't). |
| `@cf/baai/bge-base-en-v1.5` | 768 | 6,058 | English only | ❌ Worse on both axes than bge-m3. |
| `@cf/baai/bge-large-en-v1.5` | 1024 | 18,582 | English only | ❌ 17× the neuron cost of bge-m3, rate-limited to 1,500/min. No benefit here. |
| `@cf/qwen/qwen3-embedding-0.6b` | — | 1,075 | Multilingual | Equivalent cost; bge-m3 is the more battle-tested choice. |

**Neuron budget for dedup:** 300 new headlines/day × ~40 tokens = 12,000 tokens = **12.9 neurons/day = 0.13% of the free allocation.** Embedding cost is effectively zero; the *threshold tuning* is the real work.

**SimHash / MinHash / TF-IDF cosine comparison:**
- **SimHash** (64-bit) — 2 ms to compute, but near-duplicate detection on 64-bit SimHash is weak for headline paraphrase; false negatives are common. Good as a *secondary* fast filter, not as the primary.
- **MinHash** — good for near-duplicate *documents* (Jaccard estimation), heavier than needed for 1-line headlines.
- **TF-IDF cosine** — needs a corpus IDF table; at 120 stories/day the IDF statistics are unstable and the vocabulary is small. A plain token-set Jaccard is equivalent for this input and needs no corpus.
- **Verdict:** Jaccard (gate) + bge-m3 (confirm) beats any of them alone, and beats embeddings alone on cost and on the *precision* axis (lexical matching will not merge "Trump tariffs EU" with "EU threatens retaliation" that embedding cosine might).

**Validation is mandatory:** build a labelled fixture of ≥200 near-duplicate headline pairs drawn from real multi-outlet coverage of the same event, then tune the two thresholds against it. This is the product's differentiator and it must be measurable, not vibes.

---

## Topic, Entity and Section Tagging (Question 6)

### Section assignment (8 sections) — publisher categories first, embeddings second

1. **Publisher `<category>` / `<dc:subject>`** → a per-publisher mapping table to our 8 sections. Zero cost, zero latency, high precision. ~40% of publisher feeds carry usable categories.
2. **Fallback: embedding centroid.** Precompute one centroid vector per section from a labelled seed set (50–100 headlines each). Cosine the story embedding against all 8 centroids. **Zero additional neurons** — it reuses the embedding already computed for dedup. ~0.1 ms of CPU.
3. **Weather section** is filled by the Open-Meteo integration, not by story tagging. Exclude weather-looking stories from the classifier and route them to the weather section only if they come from a weather-tagged publisher feed.

### Named entities — no NER model exists on Workers AI

The 72-model Workers AI catalog ([models index](https://developers.cloudflare.com/workers-ai/models/)) contains **no NER model**. The only classification model is `distilbert-sst-2-int8` (sentiment) and `resnet-50` (images). Confirmed by reading the full catalog.

**Recommended hybrid:**
1. **Curated gazetteer** (version-controlled YAML per country: people, government bodies, companies, places, ~500–1,500 entries each, including Devanagari forms for India). Deterministic, zero cost, zero hallucination, high precision. Matches the E-E-A-T requirement better than LLM extraction.
2. **Embedding-clustered discovery** — cluster the day's headline embeddings, surface clusters whose centroid is far from any known entity, and route them to a human review queue. This is how the gazetteer grows without an LLM in the loop.
3. **LLM extraction — do not use for NER.** It costs neurons, hallucinates entities, and produces a long tail of garbage entity pages. Bad for a site whose survival depends on E-E-A-T credibility.

**Hindi handling:** bge-m3 embeds Devanagari natively. The gazetteer needs Devanagari entries, and entity names will differ across Hindi outlets (अमेरिका vs अमरीका) — the embedding clustering is what bridges transliteration variants.

### Cross-country flagging
For each story compute a country score from (a) the source publisher's country (each feed is country-scoped by construction), (b) cosine against 7 precomputed country centroids, (c) an entity→country map. Flag the story into the 2nd country when the score clears a threshold. Zero extra neurons.

### Neuron cost for all tagging
300 embeddings/day (12.9 neurons) + section centroids (0, computed once) + country centroids (0) = **~13 neurons/day = 0.13% of the free allocation.**

---

## Daily Digest Generation (Question 7)

**7 digests/day (one per country) + occasional regeneration. Rate limit 300 req/min — irrelevant at this volume. The constraint is neurons and quality, not throughput.**

### Model selection

| Model | Neurons/M in | Neurons/M out | Neurons / 7 digests (2k in, 400 out) | Quality | Verdict |
|---|---|---|---|---|---|
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | 4,119 | 34,868 | **~155** | Adequate | ✅ **v1 default** |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 24,545 | 77,273 | ~560 | Good | ✅ **Upgrade path** |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 26,668 | 204,805 | ~945 | Best | ✅ **Use for the flagship edition's digest** — still 9.5% of budget |
| `@cf/meta/llama-3.2-1b-instruct` | 2,457 | 18,252 | ~79 | Poor for 300-word prose | ⚠️ Only for short summaries |
| `@cf/meta/llama-3.2-3b-instruct` | 4,625 | 30,475 | ~119 | Weak | ❌ |
| `@cf/google/gemma-4-26b-a4b-it` | 9,091 | 27,273 | ~188 | Good, multilingual | ⚠️ Requires `chat_template_kwargs.enable_thinking:false` to avoid a reasoning tax |
| `@cf/moonshotai/kimi-k2.6`, `@cf/zai-org/glm-5.3*`, `@cf/deepseek-ai/deepseek-v4-*` | — | — | — | — | ❌ **Require a paid billing method. Unusable on Free.** |

**Recommended:** `@cf/meta/llama-3.1-8b-instruct-fp8-fast` for all 7 editions in v1 (155 neurons/day, 60× headroom), with a deterministic **template fallback** that assembles the day's top stories into a structured digest with attribution. Then A/B against `llama-4-scout-17b-16e-instruct` once real traffic exists. The template fallback is not a degraded path — it is arguably *more* original (no synthesis risk) and is the correct answer when the LLM output fails validation.

**Prompt budget guard:** 120 headlines × ~12 tokens = ~1,500 tokens of input per country digest. Well under any per-request token cap, but **verify the per-request input cap for the chosen model** — Cloudflare enforces a maximum tokens-per-request limit that varies by model. If the cap bites, chunk the input by section.

**Hindi digest (the India edition):** no strong Hindi-first generation model exists in the free catalog. `@cf/aisingapore/gemma-sea-lion-v4-27b-it` is the closest candidate — **confidence LOW, unverified for Hindi news prose.** Plan:
- **Primary:** generate the Hindi digest from the *Hindi* story set with a multilingual model (`llama-3.1-8b-instruct` handles Devanagari reasonably; `gemma-4-26b-a4b-it` is a candidate).
- **Fallback:** the deterministic template digest, which composes Hindi headlines + outlet attribution with no translation at all. This respects PROJECT.md's "no machine translation of the English edition into Hindi" constraint — the Hindi digest is built from native Hindi sources, never translated from English.
- `@cf/ai4bharat/indictrans2-en-indic-1B` (10 Indic languages, 31,050 neurons/M each way) is available **if** a translation fallback is ever needed: ~19 neurons per 300-token digest. Keep it as an emergency valve, not a plan.

**Hallucination guard (non-negotiable):** the digest must only reference stories that exist in the day's cluster set. Validate every generated sentence against the source set; on mismatch, fall back to the template. A digest that invents a fact is a worse scaled-content-abuse signal than no digest at all.

---

## Dynamic OG Images (Question 8)

**Recommendation: generate in CI with `satori@0.63.0` + `sharp@0.35.5`. Do not generate in a Worker on the Free plan.**

| Approach | CPU | Bundle | Verdict |
|---|---|---|---|
| **satori + sharp in CI (Node)** | Unbounded (CI has 2 vCPU / 8 GB) | n/a | ✅ **Recommended.** Matches PROJECT.md ("generated at build time"). |
| satori in a Worker (default build) | ~50–150 ms/image → **5–15× over the 10 ms Free CPU limit** | ~1.5–2 MB base64-embedded WASM | ❌ Fails on Free. |
| satori/standalone + `layout.wasm` in a Worker | ~50–150 ms/image | 2.5 MB wasm module | ⚠️ The correct Workers path *if* you are on Workers Paid. Cloudflare supports `.wasm` module imports; satori's README explicitly calls out *"If there is a limitation on dynamically loading WASM (e.g. Cloudflare Workers), you can use the Standalone Build."* |
| `@resvg/resvg-wasm` 2.6.2 | ~30–60 ms (raster only) | 2.5 MB wasm | ⚠️ Rasterizer only; still needs satori for layout. Same CPU problem. |
| Cloudflare Image Resizing | n/a | n/a | ❌ Wrong tool — it resizes, it doesn't compose text into a layout. |

**Implementation notes:**
- satori renders text as `<path>` by default (embeds font path data). At 1200×630 with 2 fonts the intermediate SVG is multi-megabyte — fine in Node, but do not carry that string into a Worker.
- satori is **MPL-2.0** (file-level copyleft). Using it as a dependency is fine; do not copy its source into the project.
- Pass your own OFL font files (the same self-hosted news serif used on the site) via `fonts: [{ name, data, weight, style }]`.
- **Output JPEG, not PNG.** 1200×630 JPEG q80 ≈ 40–60 KB vs PNG ≈ 200–400 KB. At 120 images/day the difference over a year is ~3.6 GB of R2 — meaningful against a 10 GB free tier.
- **Store OG images in R2, not as static assets** (see the file-count table). Serve via an R2 custom domain; `og:image` accepts any absolute URL. Zero Worker requests, zero static-file budget consumed.

---

## Image Storage and Resizing (Question 9)

**Cloudflare Images is NOT free-tier sufficient. Confirmed and quantified.**

| Metric | Free | Paid | Source |
|---|---|---|---|
| Images Transformed (unique/month) | **5,000** | 5,000 included, then $0.50/1,000 | [images/pricing](https://developers.cloudflare.com/images/pricing/) |
| Images Stored | Not available | $5 / 100,000 images/month | same |
| Images Delivered | Not available | $1 / 100,000 images/month | same |

The same page states the free plan covers *"Optimize images stored outside of Images"* (i.e. R2 + the `/cdn-cgi/image/` endpoint) — **and that counts against the same 5,000/month "Images Transformed" metric.** This project needs 120 stories/day × 2 variants = **7,200 transformations/month** — 44% over the cap, and transformations are counted per unique source+parameter combination per month, so serving a hot image 10,000 times still counts once. Still over.

**Also note the Images binding counts as Images Transformed** (per the same doc), which means the `@astrojs/cloudflare` adapter's **default `imageService: 'cloudflare-binding'` will silently start spending the 5,000/month budget.** Override it to `'passthrough'`.

**Recommended free pipeline (all in CI, using `sharp@0.35.5`):**

```
Publisher image URL
  → fetch (Node, CI)
  → sharp: resize to 1200w (card, q78 WebP)  + 400w (thumb, q75 WebP)
  → upload both to R2 under images/<story-id>/<variant>.webp
  → record the two R2 keys + dimensions in D1
  → <img srcset="..."> in the Astro template, served from the R2 custom domain
```

| Concern | Verdict |
|---|---|
| R2 storage | 120/day × 2 variants × ~55 KB = ~13 MB/day → 4.0 GB at 12 months without pruning, **1.2 GB with a 90-day R2 lifecycle rule**. ✅ |
| R2 Class A (writes) | 240/day = 7,200/month ✅ |
| R2 Class B (reads) | 1,000 visitors × 3 images = 90,000/month; 10,000 visitors → 900,000/month ✅ (9% of 10M) |
| Egress | Free ✅ |
| sharp in Workers | **Not possible** — native module. Run it in CI only. |
| Astro image service | Set `imageService: 'passthrough'` if the Cloudflare adapter is used. Do not rely on `astro:assets` for publisher-hosted images. |

---

## Tailwind CSS v4 + Astro Integration (Question 10)

**Official Tailwind guide for Astro** (https://tailwindcss.com/docs/installation/framework-guides/astro) — exactly four steps:

```bash
npm install tailwindcss @tailwindcss/vite
```
```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
});
```
```css
/* src/styles/global.css */
@import "tailwindcss";
```

**`@tailwindcss/vite@4.3.3` — not `@tailwindcss/postcss@4.3.3`.** The Vite plugin is the documented path for Astro/Vite; the PostCSS plugin is the fallback for setups without Vite and adds a redundant transform layer.

### Astro 7 + Tailwind v4 gotchas (all verified against the Astro v7 upgrade guide)

| Gotcha | Detail | Action |
|---|---|---|
| **`compressHTML: 'jsx'` is the new default** | Astro 7 strips whitespace using **JSX rules**, not HTML rules. `<span>hello</span><em>world</em>` renders as `helloworld`. A broadsheet layout with inline `<span>`/`<em>`/`<cite>` inside headlines and bylines will lose spaces. | **Set `compressHTML: true`** in `astro.config.mjs` to restore HTML-aware whitespace, then visually verify every template that uses inline elements. |
| **Rust compiler is the only compiler** | Stricter than the old Go compiler: unclosed tags are now **errors**, and invalid nesting (e.g. `<div>` inside `<p>`) is no longer auto-corrected — it is passed through and the browser closes the `<p>` early, breaking the layout. | Fix all unclosed tags before the first build. Never nest block elements inside `<p>` in the broadsheet templates. |
| **Vite 8** | Astro 7 upgrades the bundler to Vite 8. | Check any Vite-specific plugin for Vite 8 compatibility. `@tailwindcss/vite` 4.3.3 is Vite 8-compatible. |
| **Sätteri is the default Markdown processor** | `@astrojs/markdown-remark` is no longer installed by default; remark/rehype plugins need the `unified()` pipeline restored explicitly. | Relevant to original articles and any MDX. Verify `@astrojs/mdx@8.1.0` against Sätteri before relying on MDX for the publisher's own articles. |
| **`src/fetch.ts` is reserved** | Astro 7 auto-imports it for advanced routing. | Do not name a file `src/fetch.ts` for another purpose. |
| **`experimental.incrementalBuild`** | Added in `astro@7.2.0`. Skips re-rendering pages whose `cacheKey` and module dependency hash are unchanged. Cache lives in `cacheDir` (`node_modules/.astro/`). **Disabled when `build.concurrency > 1`.** | Enable it (`experimental: { incrementalBuild: true }`) and return a `cacheKey` per story (e.g. the story's content hash). **Keep `build.concurrency: 1`** — do not use parallel prerendering, they are mutually exclusive. Requires restoring `cacheDir` between CI runs. |
| **`experimental.parallelPrerendering`** | Mutually exclusive with `incrementalBuild`. | ❌ Do not enable. |
| **`@astrojs/cloudflare` defaults** | `imageService: 'cloudflare-binding'` (spends the 5,000/month Images Transformed budget); `prerenderEnvironment: 'workerd'` (prerendered pages run in `workerd`, so `node:fs` reads fail). | Set `imageService: 'passthrough'` and `prerenderEnvironment: 'node'` if the adapter is adopted. |
| **Astro 6+ removed Cloudflare Pages support** | The adapter no longer deploys to Pages. | Use assets-only Workers (no adapter) for a pure-static site. |

---

## RSS and Sitemap Generation (Question 11)

### Site RSS feeds
- **`@astrojs/rss@4.0.19`** for the standard feeds: one per edition (`/uk/feed.xml`, `/us/feed.xml`, …) plus a global `/feed.xml`. Output the **deduplicated cluster headline**, the **excerpt**, the **publication date**, and the **outlet list** — the outlet list is the differentiating content and belongs in the feed.
- Also emit `<link rel="alternate" type="application/rss+xml">` in the `<head>` of every page for **RSS autodiscovery** (a stated v1 requirement).
- The `rss@1.2.2` package underneath gives control if the feed shape needs to diverge from the spec defaults.

### Google News sitemap — hand-roll it

`@astrojs/sitemap@3.7.4` does **not** support the `news:` namespace or `xhtml:link` hreflang alternates. Requirements are verified in [Google's news sitemap docs](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap):

- Namespace: `http://www.google.com/schemas/sitemap-news/0.9`
- Required tags per URL: `<news:news>` → `<news:publication>` → `<news:name>`, `<news:language>`, plus `<news:publication_date>` and `<news:title>`
- **Only include URLs created in the last two days.** Older URLs must be removed from the news sitemap (or have their `<news:news>` metadata stripped). *Do not put all 44,000 stories in it.*
- **Max 1,000 `<news:news>` tags per sitemap** — split into multiple files beyond that.
- `<news:name>` must exactly match the publication name as it appears on news.google.com.
- `<news:publication_date>` must be the original publication date, not the date you added it to the sitemap.

**Implementation:** a build script that writes:
- `news-sitemap-<edition>-<n>.xml` — last 2 days only, ≤1,000 URLs per file
- `sitemap-<section>.xml` — the full URL set, chunked at 45,000 (Google's per-file ceiling is 50,000)
- `sitemap-index.xml` — the index referencing all of the above
- `xhtml:link rel="alternate" hreflang="..."` on every URL in the page sitemaps, for the 7 editions

Use the **`sitemap@9.0.1`** package for the index + chunking + alternates, or hand-roll the XML (it is ~40 lines and gives exact control over the news namespace). Hand-rolling is recommended — the constraint set (news namespace + hreflang + 2-day window + 1,000 cap) is outside every off-the-shelf integration's defaults.

**Sitemap count estimate at 12 months:** 54,465 URLs / 45,000 per file = **2 page sitemap files**, plus ~4 news sitemap files, plus 1 index, plus 8 RSS feeds. ~15 files total.

### hreflang across 7 editions — the duplicate-content trap

The same story appears in multiple editions when cross-country flagged. If the UK and US editions both render a full story page for it, you have **near-identical pages on one domain** — the classic hreflang/canonical conflict, and exactly the duplicate-content pattern Google penalises.

**Rule:** each deduplicated cluster has **one canonical story page**, hosted in its primary edition. Other editions show a **listing entry** (headline, excerpt, outlet chips) that links to the canonical page. `hreflang` alternates are emitted only for genuinely distinct pages (a section landing page per edition, the per-edition digest, the per-edition topic listing). Never emit hreflang between two copies of the same story. **This is a spec-level decision the roadmap must record.**

---

## Free-Tier Monitoring (Question 12)

| Signal | Where to read it | Automation |
|---|---|---|
| **Workers requests/day** | Dashboard Metrics; [GraphQL Analytics API](https://developers.cloudflare.com/workers/observability/metrics-analytics/) | Cloudflare Alerts → custom threshold on the Workers dataset (email/webhook). |
| **Workers CPU** | `exceededCpu` invocation outcome in Workers Logs / Logpush | Alert on any `exceededCpu` count > 0. |
| **D1 rows read / written** | Every query returns a `meta` object: `{ rows_read, rows_written, duration }`; dashboard Metrics → Row Metrics; GraphQL API | A daily audit Worker writes its own counters to a D1 `usage_log` table. |
| **KV reads/writes** | Dashboard + GraphQL API | Daily audit. |
| **R2 storage + Class A/B ops** | Dashboard + GraphQL API | Daily audit. |
| **Workers AI neurons** | "Monitor your Neuron usage in the Cloudflare Workers AI dashboard" | Daily audit; the neuron counter is the one metric that is *easy* to blow past silently if a model changes. |
| **Static asset file count** | `wrangler versions view` / dashboard for each of the 8 Workers | **Highest-priority alert.** At 143 files/day, 20,000 per project is reached in ~140 days. Alert at 50% and 75% of each project's budget. |
| **Build minutes** | Workers Builds dashboard / GitHub Actions usage page | Monthly check. |
| **R2 storage approaching 10 GB** | R2 dashboard | Alert at 8 GB. |
| **Brevo / Open-Meteo** | Brevo dashboard; Open-Meteo has no usage portal on the free tier | Track call counts in the audit table. |

**Recommended monitoring stack:**
1. A **daily audit Worker** (cron, ~1 ms CPU) that reads the D1 `usage_log` table, computes each metric as a percentage of its free-tier ceiling, and writes a single row per day. It never approaches a limit.
2. **Cloudflare Alerts** (custom thresholds on SQL API datasets, email + webhook, available on all plans) for hard-ceiling products: static asset count, R2 storage, Workers requests.
3. **Brevo email** for the alert channel (already a dependency, 5,000 emails/month free, 210 used).
4. A **weekly digest** of the usage table published as a static admin page — useful for the E-E-A-T story and free.

**Key principle:** put the free-tier ceilings in a **single versioned config file** (`config/free-tier-limits.json`) that the audit Worker reads. When Cloudflare changes a limit, one file changes, not ten code paths. This is the single most important defensive move against silent quota exhaustion.

---

## Installation

```bash
# ---- Frontend site (Astro) ----
npm create astro@latest meridian-site -- --template minimal
cd meridian-site

# Core
npm install astro@7.4.1 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
npm install @astrojs/rss@4.0.19 @astrojs/sitemap@3.7.4
# Only if on-demand rendering is ever needed:
# npm install @astrojs/cloudflare@14.4.1

# ---- Ingest + transform (runs in CI, Node) ----
npm install fast-xml-parser@5.11.2 zod@4.6.7 satori@0.63.0 sharp@0.35.5
npm install sitemap@9.0.1 nanoid@6.0.2 p-limit@7.3.3
# Optional, only if OG generation must move into a Worker on Paid:
# npm install @resvg/resvg-wasm@2.6.2

# ---- Cloudflare tooling ----
npm install -D wrangler@4.151.2 @cloudflare/workers-types@5.20261019.1
npm install -D vitest@5.0.5 eslint@10.13.0 prettier@3.9.10
```

**One package.json, three entry points.** The Astro site, the ingest/transform scripts, and the Worker live in one repo (Astro `src/`, scripts `scripts/`, Worker `worker/`) so the dedup logic, the schema, and the design tokens are shared. Do not split into separate repos — the Worker and the build must agree on the story schema exactly.

**Wrangler config shape (assets-only, no Worker script):**
```jsonc
{
  "name": "meridian-uk",
  "compatibility_date": "2026-10-20",
  "assets": {
    "directory": ".deploy/uk",
    "not_found_handling": "404-page"
  }
}
```
No `main` and no `assets.binding` — the Workers guide states the binding is only valid when a Worker script is present. Eight of these, one per project, plus a ninth for the ingest Worker (which has `main` and cron triggers).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| **Astro 7.4.1** | **Hugo 0.166.0** | Hugo builds 50k+ pages *faster* than Astro (Go, single binary, no Node runtime) and would solve the build-time problem outright. Use it if (a) the Astro build exceeds the 20-minute CI budget and `incrementalBuild` doesn't close the gap, or (b) the team prefers Go templates. Costs you: a second language for the whole pipeline, no shared TS schema/types with the Worker, and no first-class Tailwind v4 Vite plugin (Hugo uses a PostCSS pipeline — a documented downgrade). |
| **Astro 7.4.1** | **Next.js 16.4.2 (`output: 'export'`)** | Only if the site later needs per-user interactivity (it never will — no accounts, no comments, no UGC). Static export forces every route to be pre-rendered, ships a React runtime to the browser, produces heavier HTML, and has no built-in hreflang/news-sitemap support. Strictly worse for a read-only broadsheet. |
| **Astro 7.4.1** | **Eleventy 3.1.7** | ❌ Not recommended at all. No official Cloudflare adapter, weaker TypeScript story, weaker component model, and effectively in maintenance mode. |
| **Workers Static Assets (8 projects)** | **Cloudflare Pages (8 projects)** | Pages still works (500 builds/mo, 20-min timeout, 20,000 files) and supports custom domains on non-Cloudflare DNS. Use it only if the domain's nameservers will *not* be on Cloudflare — Workers custom domains require Cloudflare-managed nameservers. Astro 6+ no longer supports Pages deployment, so Pages also means `wrangler pages deploy dist/` with no adapter. |
| **Workers Static Assets** | **Single project + Workers Paid ($5/mo)** | The simplest architecture: one project, 100,000 files, one deploy, no split script, plus 15-min cron CPU and Vectorize. **Recommended the moment the project has any revenue.** |
| **Parse in CI** | **Parse in a Durable Object** | If the DO spike confirms 30 s CPU on the Free plan, a SQLite-backed DO becomes a far cleaner ingest engine than "fetch raw → read raw in CI." Do the spike before committing either way. |
| **fast-xml-parser 5.11.2** | **sax / sax-js** | Only if a specific publisher's feed is large enough (>1 MB) that streaming matters. At 50 feeds/day it does not. |
| **Jaccard + bge-m3** | **Pure SimHash 64-bit** | Only as an *additional* pre-filter if the Jaccard gate starts producing too many embedding calls. At 13 neurons/day, there is no pressure to do this. |
| **bge-m3** | **bge-small-en-v1.5 + a separate Hindi model** | Only if bge-m3's Hindi quality fails validation. Requires a second model and doubles the embedding code path. |
| **CI-generated OG images in R2** | **Runtime OG generation in a Worker** | Only on Workers Paid (needs ~50–150 ms CPU per image, well over the 10 ms Free limit). Also far worse for Core Web Vitals and R2 op counts. |
| **sharp in CI** | **Cloudflare Images** | Only if the project pays for Images ($5/100k stored, $1/100k delivered, $0.50/1k transforms). The 5,000/month free transform cap is exceeded by 44% at this project's volume. |
| **satori + sharp** | **@resvg/resvg-wasm** | Only inside a Worker on Workers Paid. In CI, satori+sharp is simpler and sharp's SVG rendering (librsvg) is better tested. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Cloudflare Images (free tier)** | 5,000 unique transformations/month; this project needs 7,200. Also, the `@astrojs/cloudflare` adapter's default `imageService: 'cloudflare-binding'` silently spends this budget. | Pre-generate variants with `sharp` in CI → R2. Set `imageService: 'passthrough'`. |
| **Vectorize on the Free plan** | *"Vectorize is currently only available on the Workers paid plan."* | Store int8-quantized embeddings as BLOBs in D1; compute cosine in-process. 1 KB/vector × 30-day window = ~9 MB. |
| **Parsing RSS inside a Free-plan cron trigger** | 10 ms CPU vs. a measured 9.45 ms per feed. | Fetch raw in the Worker; parse in CI. |
| **A single static-assets project on the Free plan** | 20,000 files; this project hits it at ~day 140. | 8 projects (160,000 files) or Workers Paid. |
| **OG images as static files** | Doubles the file count (+43,800 at 12 months) and burns R2 storage on 200–400 KB PNGs. | Store in R2 as JPEG (~50 KB) behind an R2 custom domain. |
| **Next.js `output: 'export'`** | React runtime shipped to the browser, heavier HTML, no hreflang/news-sitemap story, much slower builds. | Astro 7 static output. |
| **Eleventy** | No Cloudflare adapter, weaker TS/component story, maintenance-mode trajectory. | Astro 7. |
| **`@astrojs/markdown-remark` defaults in Astro 7** | Astro 7 uses Sätteri; the remark/rehype pipeline is no longer installed by default and needs an explicit `unified()` opt-in. | Either accept Sätteri (recommended) or explicitly configure `markdown: { processor: unified() }` and install `@astrojs/markdown-remark`. |
| **`compressHTML: 'jsx'` (the Astro 7 default)** | Strips whitespace between inline elements, which will silently eat spaces in broadsheet headlines and bylines. | Set `compressHTML: true` and visually verify. |
| **HTML parsers for feeds** (`cheerio`, `node-html-parser`) | Wrong format; heavy. | `fast-xml-parser`. |
| **LLM-based named-entity extraction** | Neuron cost, hallucination rate, and a long tail of garbage entity pages. Bad for E-E-A-T. | Curated gazetteer + embedding-clustered discovery. |
| **LLM-only digests with no template fallback** | A hallucinated digest is a worse scaled-content-abuse signal than no digest. | LLM digest + strict source validation + deterministic template fallback. |
| **Models requiring a paid billing method** | `@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2/5.3/5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `deepseek-v4-pro-0813` cannot be called on the Free plan. | `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, `llama-4-scout-17b-16e-instruct`, `llama-3.3-70b-instruct-fp8-fast`. |
| **sharp inside a Worker** | Native module; not supported by `workerd`. | sharp in CI only. |
| **Open-Meteo for anything beyond v1** | The free tier is explicitly **non-commercial only** and requires CC BY 4.0 attribution. Monetization is v2 — when v2 starts, budget the paid Standard plan (1M calls/month). | Open-Meteo free in v1, with attribution in the Weather section footer, and a paid-plan decision at v2. |
| **Brevo on the Standard plan** | The free Starter plan already provides 5,000 emails/month — 23× what the daily digest needs. | Brevo Free. |
| **A single monolithic Astro build with `build.concurrency > 1`** | Disables `experimental.incrementalBuild` entirely (it warns and re-renders every page). | `build.concurrency: 1` + `experimental.incrementalBuild: true`. |
| **Cloudflare Pages as the frontend target** | Astro 6+ removed Pages support from the adapter; Cloudflare publishes a Pages→Workers migration guide; Pages' custom domains need non-Cloudflare DNS while Workers' need Cloudflare-managed nameservers (inverted for subdomain-only setups). | Cloudflare Workers with Static Assets. |

---

## Stack Patterns by Variant

**If the project must stay strictly at $0:**
- Use 8 assets-only Workers projects, path-routed on one zone.
- Keep the Worker to fetch-only; do all transform work in CI.
- Put OG images and story images in R2, never in static assets.
- Add an R2 lifecycle rule expiring story-image variants after 90 days (keeps storage ≈ 1.2 GB).
- Reuse one Astro codebase with 8 output directories, split at deploy time.
- Enforce a hard cap on new programmatic pages per build to stay inside the file budget.

**If the project takes the $5/month Workers Paid plan:**
- Collapse to **one** static-assets project (100,000 files) — no split script, no 8 deploys, one route table.
- Move RSS parsing into the cron trigger (15 min CPU) — the Worker becomes the full pipeline and the CI job shrinks to rendering only.
- Enable Vectorize for embedding search, which also unlocks site-search in v2.
- Raise D1 to 10 GB/DB and 25B rows read/month — removes the "read the whole dataset each build" concern at year 2+.
- This is the only configuration in which the *entire* pipeline lives on Cloudflare, and it is worth revisiting the moment there is revenue.

**If a single project exceeds 20,000 files (i.e. the split was not used):**
- Do **not** start deleting story pages — URLs are permanent and the project promises permanence.
- Switch to a hybrid: keep the most recent N days prerendered as static assets and serve the archive from a Worker reading D1, with `Cache-Control` on the edge. This costs a Worker invocation per archive pageview (still well under 100,000/day) and a bit of 10 ms CPU per render.

**If the Astro build exceeds 20 minutes in CI:**
- Enable `experimental.incrementalBuild` with a per-story `cacheKey` and persist `cacheDir` between runs.
- If still too slow, split the build by edition into 8 parallel CI jobs.
- If still too slow, evaluate Hugo 0.166.0 for the rendering step only (keeping the TS pipeline for ETL).

**If Workers AI neuron usage approaches 8,000/day:**
- Check for a digest model that was silently upgraded to a large one.
- Cache embeddings for cluster representatives (one embedding per cluster, not per headline).
- Drop to `@cf/meta/llama-3.2-1b-instruct` for non-flagship editions.
- Only then consider Paid.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `astro@7.4.1` | `@astrojs/cloudflare@14.4.1` | Adapter peer-deps: `astro ^7.4.0`, `wrangler ^4.125.0`. |
| `astro@7.4.1` | `@astrojs/rss@4.0.19` | Astro 5+ integration line. |
| `astro@7.4.1` | `@astrojs/sitemap@3.7.4` | Astro 5+ integration line. No `news:` namespace support. |
| `astro@7.4.1` | `@astrojs/mdx@8.1.0` | Verify against Astro 7's default Sätteri processor before use. |
| `astro@7.4.1` | `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` | Official guide path. Vite 8 (Astro 7's bundler) compatible. |
| `astro@7.4.1` | `wrangler@4.151.2` | ≥ 4.125.0 required by the Cloudflare adapter; ≥ 4.34.0 for the 100,000-file limit. |
| `astro@7.4.1` | Node 20+ | Astro 7 requires a modern Node LTS. |
| `fast-xml-parser@5.11.2` | Node ≥ 18, `workerd` | Zero dependencies; no native code. |
| `sharp@0.35.5` | Node ≥ 18 | **Node only.** Never bundle into a Worker. |
| `satori@0.63.0` | Node ≥ 16, `workerd` (standalone build) | MPL-2.0. Default build embeds WASM as base64; use `satori/standalone` + `layout.wasm` in Workers. |
| `@resvg/resvg-wasm@2.6.2` | `workerd` (`.wasm` module import) | 2.5 MB; Workers bundle limit is 64 MiB, so size is fine. |
| `wrangler@4.151.2` | `@cloudflare/workers-types@5.20261019.1` | Regenerate types with `wrangler types` on every binding change. |
| `zod@4.6.7` | `workerd` | Zod ≥ 4.5.0 uses materially less memory in Workers. |
| `sitemap@9.0.1` | Node only (build-time) | Emits the sitemap index + chunks. |
| `p-limit@7.3.3` | Node only (build-time) | The Workers runtime hard-caps 6 concurrent outbound connections regardless. |

---

## Open Risks and Required Spikes

| # | Risk | Impact | Action | Confidence |
|---|---|---|---|---|
| 1 | **DO CPU limit on the Free plan is ambiguous** — 10 ms (Workers limits page) vs. 30 s (DO limits page). | Decides whether the ingest can live entirely on Cloudflare. | **30-minute spike:** deploy a SQLite-backed DO on the Free plan, burn 2 s of CPU, observe whether it dies at 10 ms (Error 1102) or survives. | MEDIUM |
| 2 | **Wrangler asset upload may re-upload unchanged files on every deploy.** 8 projects × 20,000 files/day would be a lot of HTTP traffic. | Build time and possible upload rate limits. | Verify wrangler's asset manifest diffing on a staging project; if it re-uploads, either build one project at a time across days, or take the $5 Paid plan. | MEDIUM |
| 3 | **Hindi text-generation quality on Workers AI free tier is unverified.** | The India edition's daily digest — a core originality signal. | Test `llama-3.1-8b-instruct` and `gemma-sea-lion-v4-27b-it` against 20 real Hindi story sets. Have a deterministic template digest ready as the default. | LOW |
| 4 | **Workers AI cold-start latency** on the free tier (no guaranteed warm isolates). | Adds minutes to every CI build that calls the AI. | Run the 300 embeddings + 7 generations concurrently and measure. If > 5 min, move AI calls to a small Worker with a persistent isolate or batch them. | MEDIUM |
| 5 | **Real publisher feed quality** — many outlets serve non-standard or intermittently-broken XML; some block datacenter IPs. | Ingest completeness. | Verify each of the ~50 feeds' availability, freshness, and `User-Agent` requirements during the feed-discovery phase. Some (notably WSJ, and some Indian outlets) may require a different approach. | MEDIUM |
| 6 | **The `news:name>` value must exactly match news.google.com.** A mismatch silently kills Google News inclusion. | Loss of the primary organic acquisition channel. | Fix the string once in config, before Publisher Center enrollment. | HIGH (documented) |
| 7 | **R2 lifecycle rules vs. permanent URLs.** An over-eager lifecycle rule could delete a story's image while the story page persists. | Broken images on permanent pages. | Scope the lifecycle rule to the `images/` prefix only; never to `og/` or the site root. | HIGH |

---

## Sources

**Official Cloudflare documentation (all read 2026-10-20):**
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — requests/day, CPU time, subrequests, connections, bundle size, cron triggers, static asset file count
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Paid plan inclusions, subrequest billing, KV/Hyperdrive/Queues/Workflows/D1/DO/Vectorize/R2 free tiers
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [KV Limits](https://developers.cloudflare.com/kv/platform/limits/)
- [R2 Limits](https://developers.cloudflare.com/r2/platform/limits/) and [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Workers Static Assets — Billing and Limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) — static asset requests free and unlimited
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) — compatibility matrix, non-root routes, `wrangler deploy` vs `wrangler pages deploy`
- [Workers Builds — Limits and Pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) and [Workers Deploy Hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- [Pages Deploy Hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — 5 per account, 5-field cron, UTC
- [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) — CPU per request 30 s (conflicts with Workers Free 10 ms)
- [Workers AI Limits](https://developers.cloudflare.com/workers-ai/platform/limits/) and [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) — 10,000 neurons/day, per-model neuron rates
- [Workers AI Models catalog](https://developers.cloudflare.com/workers-ai/models/) — 72 models; confirmed no NER model; confirmed paid-billing-method models
- [Workers AI Workers Bindings](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/) — `env.AI.run(...)`, `chat_template_kwargs.enable_thinking:false`
- [Images Pricing](https://developers.cloudflare.com/images/pricing/) — 5,000 free transformations/month; Images Transformed applies to R2 + Image Resizing
- [Choose a data or storage product](https://developers.cloudflare.com/workers/platform/storage-options/) — Vectorize paid-only, D1 vs DO guidance
- [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) — `nodejs_compat` default from compatibility date 2026-08-04
- [Alerts](https://developers.cloudflare.com/notifications/) — custom thresholds on SQL API datasets, all plans
- [Web Analytics](https://developers.cloudflare.com/web-analytics/)

**Official Astro / Tailwind documentation (read 2026-10-20):**
- [@astrojs/cloudflare v14.4.1](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) — *"Removed: Cloudflare Pages support"*, `imageService` default, `prerenderEnvironment` default, `limits.cpu_ms`
- [Upgrade to Astro v7](https://docs.astro.build/en/guides/upgrade-to/v7/) — Vite 8, Rust compiler, `compressHTML: 'jsx'`, Sätteri, `src/fetch.ts` reserved
- [Experimental incremental static builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/) — `cacheKey`, `cacheDir`, `build.concurrency` conflict
- [Tailwind CSS — Install with Astro](https://tailwindcss.com/docs/installation/framework-guides/astro) — `@tailwindcss/vite` path, `@import "tailwindcss"`

**Other official sources:**
- [Google — News sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap) — namespace, required tags, 2-day window, 1,000-tag cap, `news:name` matching rule
- [Open-Meteo Pricing](https://open-meteo.com/en/pricing) — 10,000 calls/day, 300,000/month, non-commercial only, CC BY 4.0
- [Brevo Pricing](https://www.brevo.com/pricing/) — Starter free, 5,000 emails/month
- [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) — 2,000 min/month free (private), free (public)
- [vercel/satori](https://github.com/vercel/satori) — MPL-2.0, Node ≥ 16 and Web Workers, standalone build for restricted WASM environments

**Measured locally (this machine, Node 24.12, 2026-10-20):**
- `fast-xml-parser@5.11.2` parsing a synthetic 40.1 KB / 60-item RSS feed: **9.450 ms** (n=50 after warm-up)
- Normalization of the same feed to the target schema: **0.476 ms**
- Tokenization + all-pairs Jaccard over the same 60 headlines (1,770 pairs): **2.062 ms**

**npm registry (versions verified 2026-10-20):** `astro@7.4.1`, `@astrojs/cloudflare@14.4.1`, `@astrojs/sitemap@3.7.4`, `@astrojs/rss@4.0.19`, `@astrojs/mdx@8.1.0`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, `@tailwindcss/postcss@4.3.3`, `fast-xml-parser@5.11.2`, `satori@0.63.0`, `@resvg/resvg-js@2.6.2`, `@resvg/resvg-wasm@2.6.2`, `sharp@0.35.5`, `wrangler@4.151.2`, `@cloudflare/workers-types@5.20261019.1`, `@cloudflare/vite-plugin@1.64.0`, `sitemap@9.0.1`, `rss@1.2.2`, `zod@4.6.7`, `p-limit@7.3.3`, `nanoid@6.0.2`, `clsx@2.1.1`, `tailwind-merge@3.7.0`, `hugo-bin@0.166.0`, `@11ty/eleventy@3.1.7`, `next@16.4.2`, `vitest@5.0.5`, `eslint@10.13.0`, `prettier@3.9.10`.

---

*Stack research for: The Meridian — free-tier Cloudflare news aggregation + programmatic SEO publication*
*Researched: 2026-10-20*
*All free-tier limits verified against official Cloudflare documentation on 2026-10-20. Package versions verified against the npm registry on 2026-10-20. XML-parsing CPU costs measured locally on 2026-10-20.*
