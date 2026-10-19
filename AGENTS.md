<!-- GSD:project-start source:PROJECT.md -->
## Project

**The Meridian**

The Meridian is a free, automatically-curated daily news portal that publishes a separate broadsheet edition for seven countries: the UK, US, Australia, Canada, Ireland, New Zealand, and India. The system fetches trending stories from those countries' major publishers on a schedule, deduplicates them across outlets, ranks them by coverage volume and recency, and publishes each surviving story on its own URL with a headline, excerpt, topic tags, and attribution back to the original publisher. Readers get the combined picture of what happened today in their country, in the visual language of an actual printed paper.

The India edition runs in both English and Hindi, with the Hindi edition sourced from native Hindi-language publishers rather than machine-translated from English.

**Core Value:** Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.

### Constraints

- **Budget**: Zero. Every service used must have a free tier that covers the projected load, and the projection is verified against the official limits in the first phase. Cloudflare Workers, Workers Static Assets, D1, KV, R2, Cron Triggers and Web Analytics, plus Brevo for email and Open-Meteo for weather. **Cloudflare Images is not used** - its 5,000 free transformations/month is exceeded by 44% at this project's volume; image variants are pre-generated with `sharp` in CI. **Open-Meteo's free tier is non-commercial only** and requires CC BY 4.0 attribution; it must be re-evaluated before any monetisation.
- **Backend hosting**: Cloudflare Workers with D1 as the datastore. No VPS. This was chosen over Oracle Cloud Always Free (signup fragility, ARM architecture friction) and over a paid VPS (breaks the zero-cost constraint).
- **Frontend hosting**: Cloudflare Workers Static Assets (one project: static assets plus a minimal edge Worker for the story tier), deployed from CI. Astro static output with **no Cloudflare adapter**. Cloudflare Pages is not used - Astro 6+ removed Pages support from `@astrojs/cloudflare`, and Pages carries the same 20,000-file free cap plus a 500-builds/month and 20-minute-timeout ceiling.
- **Domain**: Not yet acquired. The site must be built to run on a `workers.dev` subdomain and to be pointed at a custom domain later **without rework**, using **301 redirects** (never canonicals) for the migration, with the sitemap and hreflang sets re-verified afterwards.
- **Content model**: Headline, summary-reference excerpt (≤50 words / ≤320 characters / ≤30% of source visible text / ≤2 sentences / never paraphrased or translated), topic/entity tags, the multi-outlet coverage line and count, the trending rank, attribution with a working outbound link, and a self-referential canonical. Full article body text is prohibited.
- **Language**: English across all seven editions. Hindi for the India edition only, sourced from native Hindi-language publishers.
- **Tech stack**: Astro 7 static-first with Tailwind CSS v4, `output: 'static'`, `compressHTML: true` (Astro 7's `'jsx'` default strips whitespace between inline elements and would eat spaces in broadsheet headlines), `experimental.incrementalBuild` with `build.concurrency: 1`, and one `package.json` with no workspace protocol. Server-side rendering is not used for content pages; the story tier is pre-rendered HTML served from R2.
- **Accessibility**: WCAG 2.2 AA for all user-facing surfaces, including contrast on the paper-white and ink-black palette.
- **Legal**: Every story attributes its original publisher with a working link. Feeds are consumed via their published RSS endpoints under their stated terms, and only after their terms of use have been verified.
- **Storage growth**: An R2 lifecycle rule expires `media/` objects after 12 months. The rule must never apply to `og/` or the site root, or a permanent story URL would lose its image. Configure it in the first phase.
- **D1 topology**: A single database with all queries behind one repository module and the database ID as a configuration value. Edition-based sharding is not used - cross-edition queries (cross-country flagging, the one-story-many-editions model, Most Covered) are core to the product and would break across shards. Growth is controlled by the 90-day prominence flag, pruning LSH band columns older than 30 days, and an alert at 60% of the 500 MB database limit.
- **Story URLs are permanent but rows are not all permanent**: A story's URL resolves forever; the `stories` raw-mention rows are pruned after 30 days once their merge window has closed, with `story_sources` retaining the outlet list, headline and URL permanently.
- **Timeline**: Targeting 1,000 daily visitors and 10,000 indexed pages within six months of launch.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Summary — Read This First
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
## The Free-Tier Ceiling Table (All Verified 2026-10-20)
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
## The Workload Check (Every Limit vs. Projected Load)
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
## The Ingest Pipeline — Free-Tier Architecture
### Option 1 (RECOMMENDED): Fetch in the Worker, transform in CI
- Zero CPU risk in the Worker — the 10 ms limit is never approached.
- Removes the 50-subrequest cap from the critical path (the Worker fetches, but 2–3 cron triggers × 50 = 100–150 capacity, and the CI build can fetch directly as a fallback with no cap at all).
- Removes the 6-connection cap as a bottleneck.
- Puts the entire dedup + AI + image pipeline in one place with full CPU and full debuggability.
- D1 is still the system of record and is still written every build, satisfying PROJECT.md's D1 requirement.
| Trigger | Schedule | Feeds | Subrequests used |
|---|---|---|---|
| `meridian-ingest-1` | `*/13 * * * *` (or `7,20,33,46,59 * * * *`) | ~17 | 17 |
| `meridian-ingest-2` | offset by 7 min | ~17 | 17 |
| `meridian-ingest-3` | offset by 14 min | ~16 | 16 |
### Option 2: Durable Object as the ingest engine — **INVESTIGATE, DO NOT COMMIT YET**
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free plan = 10 ms CPU per invocation.
- [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/): *"SQLite-backed Durable Objects general limits → CPU per request: 30 seconds (default)"*, while also stating *"Durable Objects are a special kind of Worker, so Workers Limits apply according to your Workers plan. In addition, Durable Objects have specific limits."*
### Option 3: Cloudflare Queues
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
## RSS Parsing (Question 4)
| Option | Verdict | Why |
|---|---|---|
| **`fast-xml-parser` 5.11.2** | ✅ **Use** | Pure JS, no native deps, runs in Node **and** Workers. 1.3 MB unpacked. Handles RSS 2.0, Atom, and `media:`/`dc:` namespaces via `attributeNamePrefix`. Measured 9.45 ms for a 40 KB/60-item feed. |
| `sax` / `sax-js` | ❌ Avoid | Streaming (lower memory) but materially slower per byte and a far more awkward API. At 50 feeds/day, memory is a non-issue. |
| `node-html-parser` / `cheerio` 1.2.0 | ❌ Avoid | HTML parsers. Wrong tool. `cheerio` is heavy (full DOM + CSS selectors) for no benefit. |
| `@xmldom/xmldom` | ❌ Avoid | DOM-building XML parser: slow, allocation-heavy, no advantage. |
| `htmlparser2` | ⚠️ Possible | Fast, but oriented at HTML. Only consider if a publisher's feed is malformed XML and `fast-xml-parser` chokes (use `processEntities:false` as the first fix). |
## Deduplication (Question 5)
### Recommended: two-stage, lexical gate → embedding confirm
| Model | Dims | Neurons/M input | Multilingual | Use |
|---|---|---|---|---|
| **`@cf/baai/bge-m3`** | 1024 | **1,075** (cheapest) | Yes (incl. Hindi) | ✅ **Primary.** One model covers English + Hindi; cheapest per token. |
| `@cf/baai/bge-small-en-v1.5` | 384 | 1,841 | English only | Use only as an English-only fast path if neuron pressure appears (it won't). |
| `@cf/baai/bge-base-en-v1.5` | 768 | 6,058 | English only | ❌ Worse on both axes than bge-m3. |
| `@cf/baai/bge-large-en-v1.5` | 1024 | 18,582 | English only | ❌ 17× the neuron cost of bge-m3, rate-limited to 1,500/min. No benefit here. |
| `@cf/qwen/qwen3-embedding-0.6b` | — | 1,075 | Multilingual | Equivalent cost; bge-m3 is the more battle-tested choice. |
- **SimHash** (64-bit) — 2 ms to compute, but near-duplicate detection on 64-bit SimHash is weak for headline paraphrase; false negatives are common. Good as a *secondary* fast filter, not as the primary.
- **MinHash** — good for near-duplicate *documents* (Jaccard estimation), heavier than needed for 1-line headlines.
- **TF-IDF cosine** — needs a corpus IDF table; at 120 stories/day the IDF statistics are unstable and the vocabulary is small. A plain token-set Jaccard is equivalent for this input and needs no corpus.
- **Verdict:** Jaccard (gate) + bge-m3 (confirm) beats any of them alone, and beats embeddings alone on cost and on the *precision* axis (lexical matching will not merge "Trump tariffs EU" with "EU threatens retaliation" that embedding cosine might).
## Topic, Entity and Section Tagging (Question 6)
### Section assignment (8 sections) — publisher categories first, embeddings second
### Named entities — no NER model exists on Workers AI
### Cross-country flagging
### Neuron cost for all tagging
## Daily Digest Generation (Question 7)
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
- **Primary:** generate the Hindi digest from the *Hindi* story set with a multilingual model (`llama-3.1-8b-instruct` handles Devanagari reasonably; `gemma-4-26b-a4b-it` is a candidate).
- **Fallback:** the deterministic template digest, which composes Hindi headlines + outlet attribution with no translation at all. This respects PROJECT.md's "no machine translation of the English edition into Hindi" constraint — the Hindi digest is built from native Hindi sources, never translated from English.
- `@cf/ai4bharat/indictrans2-en-indic-1B` (10 Indic languages, 31,050 neurons/M each way) is available **if** a translation fallback is ever needed: ~19 neurons per 300-token digest. Keep it as an emergency valve, not a plan.
## Dynamic OG Images (Question 8)
| Approach | CPU | Bundle | Verdict |
|---|---|---|---|
| **satori + sharp in CI (Node)** | Unbounded (CI has 2 vCPU / 8 GB) | n/a | ✅ **Recommended.** Matches PROJECT.md ("generated at build time"). |
| satori in a Worker (default build) | ~50–150 ms/image → **5–15× over the 10 ms Free CPU limit** | ~1.5–2 MB base64-embedded WASM | ❌ Fails on Free. |
| satori/standalone + `layout.wasm` in a Worker | ~50–150 ms/image | 2.5 MB wasm module | ⚠️ The correct Workers path *if* you are on Workers Paid. Cloudflare supports `.wasm` module imports; satori's README explicitly calls out *"If there is a limitation on dynamically loading WASM (e.g. Cloudflare Workers), you can use the Standalone Build."* |
| `@resvg/resvg-wasm` 2.6.2 | ~30–60 ms (raster only) | 2.5 MB wasm | ⚠️ Rasterizer only; still needs satori for layout. Same CPU problem. |
| Cloudflare Image Resizing | n/a | n/a | ❌ Wrong tool — it resizes, it doesn't compose text into a layout. |
- satori renders text as `<path>` by default (embeds font path data). At 1200×630 with 2 fonts the intermediate SVG is multi-megabyte — fine in Node, but do not carry that string into a Worker.
- satori is **MPL-2.0** (file-level copyleft). Using it as a dependency is fine; do not copy its source into the project.
- Pass your own OFL font files (the same self-hosted news serif used on the site) via `fonts: [{ name, data, weight, style }]`.
- **Output JPEG, not PNG.** 1200×630 JPEG q80 ≈ 40–60 KB vs PNG ≈ 200–400 KB. At 120 images/day the difference over a year is ~3.6 GB of R2 — meaningful against a 10 GB free tier.
- **Store OG images in R2, not as static assets** (see the file-count table). Serve via an R2 custom domain; `og:image` accepts any absolute URL. Zero Worker requests, zero static-file budget consumed.
## Image Storage and Resizing (Question 9)
| Metric | Free | Paid | Source |
|---|---|---|---|
| Images Transformed (unique/month) | **5,000** | 5,000 included, then $0.50/1,000 | [images/pricing](https://developers.cloudflare.com/images/pricing/) |
| Images Stored | Not available | $5 / 100,000 images/month | same |
| Images Delivered | Not available | $1 / 100,000 images/month | same |
| Concern | Verdict |
|---|---|
| R2 storage | 120/day × 2 variants × ~55 KB = ~13 MB/day → 4.0 GB at 12 months without pruning, **1.2 GB with a 90-day R2 lifecycle rule**. ✅ |
| R2 Class A (writes) | 240/day = 7,200/month ✅ |
| R2 Class B (reads) | 1,000 visitors × 3 images = 90,000/month; 10,000 visitors → 900,000/month ✅ (9% of 10M) |
| Egress | Free ✅ |
| sharp in Workers | **Not possible** — native module. Run it in CI only. |
| Astro image service | Set `imageService: 'passthrough'` if the Cloudflare adapter is used. Do not rely on `astro:assets` for publisher-hosted images. |
## Tailwind CSS v4 + Astro Integration (Question 10)
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
## RSS and Sitemap Generation (Question 11)
### Site RSS feeds
- **`@astrojs/rss@4.0.19`** for the standard feeds: one per edition (`/uk/feed.xml`, `/us/feed.xml`, …) plus a global `/feed.xml`. Output the **deduplicated cluster headline**, the **excerpt**, the **publication date**, and the **outlet list** — the outlet list is the differentiating content and belongs in the feed.
- Also emit `<link rel="alternate" type="application/rss+xml">` in the `<head>` of every page for **RSS autodiscovery** (a stated v1 requirement).
- The `rss@1.2.2` package underneath gives control if the feed shape needs to diverge from the spec defaults.
### Google News sitemap — hand-roll it
- Namespace: `http://www.google.com/schemas/sitemap-news/0.9`
- Required tags per URL: `<news:news>` → `<news:publication>` → `<news:name>`, `<news:language>`, plus `<news:publication_date>` and `<news:title>`
- **Only include URLs created in the last two days.** Older URLs must be removed from the news sitemap (or have their `<news:news>` metadata stripped). *Do not put all 44,000 stories in it.*
- **Max 1,000 `<news:news>` tags per sitemap** — split into multiple files beyond that.
- `<news:name>` must exactly match the publication name as it appears on news.google.com.
- `<news:publication_date>` must be the original publication date, not the date you added it to the sitemap.
- `news-sitemap-<edition>-<n>.xml` — last 2 days only, ≤1,000 URLs per file
- `sitemap-<section>.xml` — the full URL set, chunked at 45,000 (Google's per-file ceiling is 50,000)
- `sitemap-index.xml` — the index referencing all of the above
- `xhtml:link rel="alternate" hreflang="..."` on every URL in the page sitemaps, for the 7 editions
### hreflang across 7 editions — the duplicate-content trap
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
## Installation
# ---- Frontend site (Astro) ----
# Core
# Only if on-demand rendering is ever needed:
# npm install @astrojs/cloudflare@14.4.1
# ---- Ingest + transform (runs in CI, Node) ----
# Optional, only if OG generation must move into a Worker on Paid:
# npm install @resvg/resvg-wasm@2.6.2
# ---- Cloudflare tooling ----
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
## Stack Patterns by Variant
- Use 8 assets-only Workers projects, path-routed on one zone.
- Keep the Worker to fetch-only; do all transform work in CI.
- Put OG images and story images in R2, never in static assets.
- Add an R2 lifecycle rule expiring story-image variants after 90 days (keeps storage ≈ 1.2 GB).
- Reuse one Astro codebase with 8 output directories, split at deploy time.
- Enforce a hard cap on new programmatic pages per build to stay inside the file budget.
- Collapse to **one** static-assets project (100,000 files) — no split script, no 8 deploys, one route table.
- Move RSS parsing into the cron trigger (15 min CPU) — the Worker becomes the full pipeline and the CI job shrinks to rendering only.
- Enable Vectorize for embedding search, which also unlocks site-search in v2.
- Raise D1 to 10 GB/DB and 25B rows read/month — removes the "read the whole dataset each build" concern at year 2+.
- This is the only configuration in which the *entire* pipeline lives on Cloudflare, and it is worth revisiting the moment there is revenue.
- Do **not** start deleting story pages — URLs are permanent and the project promises permanence.
- Switch to a hybrid: keep the most recent N days prerendered as static assets and serve the archive from a Worker reading D1, with `Cache-Control` on the edge. This costs a Worker invocation per archive pageview (still well under 100,000/day) and a bit of 10 ms CPU per render.
- Enable `experimental.incrementalBuild` with a per-story `cacheKey` and persist `cacheDir` between runs.
- If still too slow, split the build by edition into 8 parallel CI jobs.
- If still too slow, evaluate Hugo 0.166.0 for the rendering step only (keeping the TS pipeline for ETL).
- Check for a digest model that was silently upgraded to a large one.
- Cache embeddings for cluster representatives (one embedding per cluster, not per headline).
- Drop to `@cf/meta/llama-3.2-1b-instruct` for non-flagship editions.
- Only then consider Paid.
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
## Sources
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
- [@astrojs/cloudflare v14.4.1](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) — *"Removed: Cloudflare Pages support"*, `imageService` default, `prerenderEnvironment` default, `limits.cpu_ms`
- [Upgrade to Astro v7](https://docs.astro.build/en/guides/upgrade-to/v7/) — Vite 8, Rust compiler, `compressHTML: 'jsx'`, Sätteri, `src/fetch.ts` reserved
- [Experimental incremental static builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/) — `cacheKey`, `cacheDir`, `build.concurrency` conflict
- [Tailwind CSS — Install with Astro](https://tailwindcss.com/docs/installation/framework-guides/astro) — `@tailwindcss/vite` path, `@import "tailwindcss"`
- [Google — News sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap) — namespace, required tags, 2-day window, 1,000-tag cap, `news:name` matching rule
- [Open-Meteo Pricing](https://open-meteo.com/en/pricing) — 10,000 calls/day, 300,000/month, non-commercial only, CC BY 4.0
- [Brevo Pricing](https://www.brevo.com/pricing/) — Starter free, 5,000 emails/month
- [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) — 2,000 min/month free (private), free (public)
- [vercel/satori](https://github.com/vercel/satori) — MPL-2.0, Node ≥ 16 and Web Workers, standalone build for restricted WASM environments
- `fast-xml-parser@5.11.2` parsing a synthetic 40.1 KB / 60-item RSS feed: **9.450 ms** (n=50 after warm-up)
- Normalization of the same feed to the target schema: **0.476 ms**
- Tokenization + all-pairs Jaccard over the same 60 headlines (1,770 pairs): **2.062 ms**
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

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
## The Three Tiers and Why
| Tier | Contents | Host | Why |
|------|----------|------|-----|
| **Static** | 7 edition front pages, 56 section pages, dated archives, Most Covered pages, topic/entity pages, trust pages, RSS, robots.txt, sitemaps, fonts, CSS | Workers Static Assets | Static asset requests are **free and unlimited**. ~6,700 files at year 1, ~17,700 at year 3. |
| **Story** | One permanent HTML page per story, forever | R2, served by the edge Worker | 43,800 pages/year. In the static tier they would consume the 20,000-file cap at ~day 140-167, inside the six-month success window. |
| **Media** | Story image variants and Open Graph images | R2 behind a custom media domain | Content-addressed, so each publisher image is fetched and resized exactly once, ever. |
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
## The Excerpt Budget
| Rule | Value |
|------|-------|
| Maximum length | 50 words AND 320 characters, whichever binds first |
| Maximum sentences | 2 |
| Maximum share of source | 30% of the source article's visible text |
| Short source | Under 160 words: publish no excerpt at all |
| Truncation | Hard cut at a word boundary with a visible ellipsis |
| Transformation | None. Verbatim or omitted. Never paraphrased, synonymized, or translated. |
| Value-element gate | Every story page must carry **at least four of the six** value elements listed below. Enforced as a build-time gate: a page with fewer fails the build rather than deploying. |
| # | Value element | What it proves |
|---|---------------|----------------|
| 1 | Multi-outlet coverage line and count | The aggregation exists on no single publisher's page. |
| 2 | Trending rank | The site has its own judgement about what matters. |
| 3 | Topic and entity tags with cross-country flags | Structured classification the publisher does not provide. |
| 4 | Related-story links | The reader gets the combined picture. |
| 5 | The edition digest | Genuinely original prose generated for this edition. |
| 6 | The coverage byline | The site discloses who reported it and when it was first reported. |
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
## Free-Tier Budget
| Resource | Limit | Hits at | Mitigation |
|----------|-------|---------|------------|
| Workers requests/day | 100,000 | ~5,000-7,000 daily visitors | Pre-agreed $5/month Workers Paid decision at ~4,000 visitors |
| R2 storage | 10 GB-month | ~month 14 | 12-month lifecycle rule on `media/` only |
| KV writes/day | 1,000 | ~350/day at current load | Never use KV as a site-wide page cache |
| Brevo emails/day | 300 | ~300 newsletter subscribers | Edition-scoped sends; overflow policy decided before 250 subscribers |
| Static asset files/project | 20,000 | ~month 24 | Story pages are already in R2, not the static tier |
| Cloudflare Images transforms/month | 5,000 | **already over** (-44%) | Never bind the service. Pre-generate with `sharp` in CI. |
| Crawl budget | per hostname | n/a | One hostname, hard rule |
## Stack Corrections
| STACK.md said | Correct position |
|---------------|-----------------|
| 8 assets-only Workers projects, path-routed on one zone | **One project.** The tier split dissolves the file-count problem the 8-project split was solving. |
| R2 lifecycle expiring story images after 90 days | **12 months**, scoped to the `media/` prefix only. Never on `og/` or the root. |
| Brevo free tier = 5,000 emails/month | **300 emails/day**, which caps the newsletter at ~300 daily subscribers. |
| Static files ≈ 143/day, 25,870 at 6 months | That figure describes **story pages in the static tier**. With story pages in R2 the static tier grows at ~18 files/day: ~6,700 at year 1. |
| Astro with an official Cloudflare adapter | **No adapter.** Astro 6+ removed Pages support from `@astrojs/cloudflare`. Pure static output deployed via `wrangler deploy`. |
| Durable Objects as the ingest engine | **Demoted to a spike-gated optimization** (S-1). The official docs contradict each other on the Free-plan CPU limit. The default is fetch-only Worker to R2 to CI, which works either way. |
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using edit, write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
