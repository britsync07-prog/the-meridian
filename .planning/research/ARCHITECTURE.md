# Architecture Research

**Domain:** Automated news aggregation + programmatic SEO publication (static-first, zero-cost)
**Project:** The Meridian
**Researched:** 2026-10-20
**Confidence:** HIGH on Cloudflare platform limits and storage design (verified against official docs, dated Oct 2026); MEDIUM on Astro build throughput and Brevo send caps (secondary sources); MEDIUM on dedup thresholds (no published tuning for this corpus — must be calibrated empirically)

---

## 0. Executive Summary

The naive architecture for this project — "a cron Worker fetches RSS, writes D1, Astro rebuilds the site" — **does not survive contact with the free-tier limits.** Four hard constraints, all verified against Cloudflare's official documentation in October 2026, reshape it:

| # | Constraint | Source | Consequence |
|---|---|---|---|
| 1 | Workers Free = **10 ms CPU per invocation** (HTTP, Cron, Queue consumer, Durable Object — all of them) | [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) | A single cron job cannot parse 40 feeds + dedup + enrich + score. The pipeline must be **sharded and incremental**, or heavy CPU must move out of the Worker. |
| 2 | Cloudflare Pages Free = **20,000 files per site** | [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) | 44,000 story pages/year cannot live in Pages. Story pages must be a **separate tier**. |
| 3 | Pages Free = **20-minute build timeout**; Astro runs ~35–127 pages/sec | [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/), [Astro build optimisation](https://www.bitdoze.com/astro-ssg-build-optimization/) (secondary) | A full 50,000-page rebuild does not fit. The build must be **incremental by construction**. |
| 4 | D1 Free = **100,000 rows written/day**, 5M rows read/day, 500 MB/database | [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) | Naive per-fetch logging (40 feeds × 144 cycles = 5,760 rows/day) eats 6% of the write budget for no value. Writes must be **event-driven, not poll-driven**. |

Two further ceilings that are not obvious and will shape later product decisions:

- **Workers Free = 100,000 requests/day.** With story pages served by a Worker, this caps the site at roughly **5,000–7,000 daily visitors** before the request quota binds. The 1,000-visitor target has ~85% headroom; the growth path past ~5,000 does not, without Workers Paid ($5/mo).
- **Brevo Free = 300 emails/day** ([Brevo pricing](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)). The newsletter therefore supports **~300 daily subscribers**, not "1,000 visitors × 7 editions". One subscriber must receive one edition, never seven.

The architecture that satisfies all of this:

```
Publisher RSS ─▶ meridian-pipeline (Worker, cron, sharded, 10ms-safe)
                      │  fetch → parse → fingerprint → cluster → enrich
                      ▼
                  D1 (meridian.db)  ── write-mostly, no reads on the hot path
                      │
                      ▼
              snapshot JSON → R2 (gzipped)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  Pages (Astro static)        Pages Function
  editions, sections,          /story/*  ──▶ R2 (pre-rendered HTML)
  topics, entities,            /api/*    ──▶ R2 snapshot / D1
  archives, digests, trust
```

The essential move: **the Worker does I/O and rules; the Astro build container does CPU-heavy work (rasterisation, resizing, full-page rendering); story pages are pre-rendered by Astro into R2 rather than into Pages.** This keeps every operation inside a free tier, keeps the static tier under the file limit, keeps the build incremental, and keeps D1 off the reader-facing hot path.

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  PUBLISHERS (≈40 RSS/Atom feeds across 7 countries, 2 languages)             │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTPS GET (conditional: ETag / Last-Modified)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  TIER 1 — meridian-pipeline (Cloudflare Worker, cron `*/10 * * * *`)          │
│  CPU budget: 10 ms/invocation. One cron trigger, sharded by time-of-day.     │
│                                                                              │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │ Source     │─▶│ Fetcher   │─▶│ Parser / │─▶│ Dedup /   │─▶│ Enrichment│  │
│  │ Registry   │  │ (HTTP,    │  │ Normaliser│  │ Clusterer │  │ (rules +  │  │
│  │ (D1 table) │  │  304-aware│  │ (fast    │  │ (SimHash  │  │  AI tie-  │  │
│  │            │  │  )        │  │  scan)   │  │  +LSH)    │  │  break)   │  │
│  └────────────┘  └───────────┘  └──────────┘  └───────────┘  └───────────┘  │
│                                                                              │
│  Cron 2 — finalize (04:00,10:00,16:00,22:00 UTC):                           │
│    AI pass (entities/ambiguous sections) → trending rescore → digests →      │
│    weather snapshot → gzipped dataset snapshot → R2 → POST Pages Deploy Hook  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ D1 writes
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATA PLANE                                                                    │
│  ┌────────────────────────┐   ┌────────────────────────┐   ┌───────────────┐  │
│  │ D1 (meridian.db)       │   │ R2 (media + snapshots)  │   │ KV (optional) │  │
│  │ 500 MB / 5 GB acct     │   │ 10 GB-month free        │   │ 1 GB, 1k wr/d │  │
│  │ write-mostly           │   │ story HTML, images, OG  │   │ weather cache │  │
│  └───────────┬────────────┘   └───────────▲────────────┘   └───────────────┘  │
└──────────────┼────────────────────────────┼───────────────────────────────────┘
               │                            │
┌──────────────┴────────────────────────────┴───────────────────────────────────┐
│  TIER 2 — meridian-web (Cloudflare Pages)                                    │
│                                                                              │
│  BUILD (Ubuntu 22.04 container, 20-min timeout, no CPU cap, 2 vCPU-class):    │
│    prepare-data.mjs ─▶ fetch snapshot from R2                                 │
│    astro build      ─▶ dist/**  (static tier + DELTA story pages)            │
│    publish.mjs      ─▶ upload dist/story/** to R2, strip from dist/, sitemaps │
│                                                                              │
│  SERVE:                                                                        │
│    static assets ──────────────────────────▶ /{edition}/, /{section}/, /topic/  │
│    Pages Function /story/* ─▶ R2 ──────────▶ /story/{slug}   (permalink)      │
│    Pages Function /api/*   ─▶ D1/R2 ───────▶ JSON API (build, weather, og)   │
│  _routes.json: { "include": ["/story/*", "/api/*"] }  ← keeps static requests  │
│                                                            free & uncounted   │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EDGE — Cloudflare CDN ─▶ Reader / Googlebot / Google News                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     Brevo (newsletter) · Open-Meteo (weather)
                     Cloudflare Web Analytics · Search Console
```

### 1.1 The five architectural decisions that follow from the limits

1. **Story pages live in R2, served by a Pages Function, not in Pages' static output.** The 20,000-file ceiling is hit at roughly month 6 (see §13). Moving stories off the static tier keeps the static tier at ~6,700 files in year 1 and ~12,000 in year 3, and keeps the build at 2–3 minutes instead of 20+.
2. **The build is incremental by construction, not by optimisation.** `getStaticPaths()` for stories returns only clusters whose `updated_at` is newer than the last rendered manifest. The build renders ~200–400 story pages per cycle instead of 44,000.
3. **The Worker never rasterises, resizes, or re-serialises bulk data.** Those go to the build container (sharp, satori/resvg) or to a pre-serialised R2 snapshot. This is what keeps the 10 ms CPU budget safe.
4. **D1 is write-mostly.** The reader-facing path is R2 (story HTML) and the Pages static tier (everything else). D1 is read only by the build-time snapshot writer and the API endpoints — never per page view.
5. **Every feed, image and AI call is individually fenced.** One bad feed cannot fail an edition; one 403 image cannot fail a story; one AI timeout cannot fail a digest.

---

## 2. Component Decomposition

The proposed decomposition is **correct but needs four additions and one split**. Additions: an *image pipeline* as a first-class component (not a sub-step of ingest, because it runs in a different runtime), a *snapshot/export* component (the build's data contract), a *static-site generator* separated from a *publisher/deployer*, and a *rendering* component that is shared between the static tier and the story pages. The split: *fetcher* must be separated from *parser*, because conditional-GET short-circuiting is a network concern and parsing is a CPU concern, and the two must be independently gated against the 10 ms budget.

| # | Component | Responsibility | Runtime | Talks to | Boundary rule |
|---|---|---|---|---|---|
| 1 | **Source registry** | The catalogue of feeds: URL, publisher, country, language, per-source section prior, ETag, last status, backoff state. Also the config surface for adding an outlet. | D1 table `sources` | Fetcher (reads), Pipeline admin (writes) | Knows *where* feeds are. Knows nothing about content. |
| 2 | **Fetcher** | Conditional HTTP GET of a feed (`If-None-Match` / `If-Modified-Since`), 10 s timeout, single retry with jitter on 5xx/network error, honours `Retry-After` on 429. Returns `{status, etag, body}` or `{status: 304}`. | Worker | Source registry, Parser, `feed_fetches` | Owns network I/O only. **Must not parse.** |
| 3 | **Parser / Normaliser** | Converts raw RSS 2.0 / Atom / RDF into a canonical `RawItem`: `{guid, headline, excerpt, url, publishedAt, imageUrl, categories[], lang}`. Rejects malformed input loudly rather than guessing. | Worker | Fetcher, Dedup | Fast, tolerant, **allocation-light**: a bounded item scanner + targeted field regexes, not a full DOM parse. |
| 4 | **Dedup / Clusterer** | Decides whether an incoming item joins an existing cluster or creates one. Owns fingerprinting (SimHash), candidate generation (LSH banding), and the merge gates. | Worker | Parser, D1 (`stories`, `clusters`, `story_sources`) | The differentiator. Must be **deterministic** and **auditable**: every merge records which gate fired. |
| 5 | **Enricher** | Section assignment, topic tagging, entity extraction, country flagging. Three-tier: deterministic rules → source prior → Workers AI tie-break. | Worker (rules) + Worker (AI network call) | D1, Workers AI | Rules first, AI only on residual. Records the method + confidence per decision. |
| 6 | **Scorer** | Trending score and the "Most Covered" ordering. Incremental on touch, full rescore of the live window daily. | Worker | D1 (`clusters.trending_score`) | Reads `story_sources` for distinct-outlet counts. Never counts mentions as breadth. |
| 7 | **Digest generator** | Original 250–400 word prose per edition per day, LLM-generated from the day's clusters, paraphrased (not copied), with an explicit source list. | Worker (network call to Workers AI) | D1 (`daily_digests`), Scorer | **The originality signal.** Must never reproduce headlines verbatim in the body. |
| 8 | **Storage** | D1 schema, migrations, indexes, retention policy. Owns the 90-day prominence window and the permanent-URL guarantee. | D1 | Everything | The only component that knows the schema. |
| 9 | **Snapshot writer** | Serialises the current dataset to a gzipped JSON blob + a manifest, uploads to R2, bumps the version. This is the **build's data contract** — it decouples the build from D1 entirely. | Worker | D1, R2 | Pre-serialised on purpose: the build must not force a Worker to JSON-serialise 30,000 rows (that would exceed 10 ms CPU). |
| 10 | **Image pipeline** | Fetch publisher image → store original in R2 → resize to variants (sharp) → write R2 keys to D1 → generate OG image. Runs **once per source URL, ever** (content-addressed by source URL hash). | **Build container** (Node + sharp) | R2, D1 (`images`) | Not in the Worker: JPEG decode + resize is ~50 ms of CPU and would blow the 10 ms budget on the first image. |
| 11 | **Content renderer (Astro)** | Renders the static tier *and* the story pages, using **one** design system. Writes story HTML into `dist/story/**` for republication into R2. | Build container | Snapshot (local JSON), shared templates | The single source of visual truth. Layout is a pure TS function shared with the Function tier. |
| 12 | **Publisher / deployer** | Uploads `dist/story/**` to R2, strips them from `dist/`, writes sitemap index, news sitemaps, RSS and `robots.txt`, leaves the rest for Pages. | Build container | R2, Pages (deploy) | The Pages file budget is enforced here — a build that would exceed 20,000 files must fail loudly, not silently truncate. |
| 13 | **Static site host** | Cloudflare Pages: serves the static tier at the edge, honours `_routes.json`. | Cloudflare Pages | Publisher, CDN | Unchanged pages are served from the CDN without invoking any Worker — this is what preserves the "unlimited free static requests" property. |
| 14 | **Story page server** | Pages Function at `/story/*`: resolves slug → R2 key → returns HTML with correct `Content-Type`, `ETag`, `Cache-Control`. No D1 read. | Pages Function (Worker runtime) | R2, CDN | Deliberately dumb. No rendering logic here (that lives in the shared template module). |
| 15 | **JSON API** | `/api/snapshot` (build), `/api/weather`, `/api/og/*`, `/api/health`. Token-authenticated where it exposes editorial data. | Pages Function / Worker | D1, R2, Open-Meteo | The only non-static surface besides stories. Keep it small. |
| 16 | **Newsletter dispatcher** | Renders the daily digest email, pushes to Brevo per edition list, records delivery stats. | Worker (scheduled) | Brevo API, `daily_digests` | One subscriber → one edition → one email/day. Never seven. |
| 17 | **Analytics** | Cloudflare Web Analytics (free, no custom rules on Free) + Search Console verification + a first-party `newsletter_signup`/`outbound_click` event set. | Cloudflare + static snippet | — | Do not add a cookie banner (monetisation is v2); Web Analytics needs no consent. |
| 18 | **Feed + sitemap generator** | XML sitemap index, per-edition page sitemaps, per-year story sitemaps, the 48-hour news sitemap, RSS per edition/section, `robots.txt`. | Build container | Snapshot, Publisher | Runs at build time; the news sitemap's 48-hour window is why it must be regenerated every cycle. |

### 2.1 Component boundaries that are easy to get wrong

- **Fetcher ↔ Parser.** If parsing happens inside the fetch loop, one malformed 2 MB feed can consume the whole 10 ms budget and starve every other feed in that cycle. Keep parse cost proportional and bounded per item.
- **Dedup ↔ Enrichment.** Enrichment must run *after* clustering, because the topic/entity/country tags of a cluster are the union across its members — and because the merge gates depend on entity overlap, which requires the entity extraction to have happened on the *raw item* at least. **Exception:** the entity gate needs an entity on the incoming item, so entity extraction must be cheap enough to run pre-cluster. Resolution: run the *gazetteer* entity lookup (a local lexicon, ~0 CPU) before clustering; run the *AI* entity extraction after clustering, on the cluster, once. Two entity tiers: cheap-gazetteer for gating, AI for enrichment.
- **Snapshot writer ↔ Build.** The build must never talk to D1 directly. It reads one gzipped blob from R2. This is what makes the build fast, cacheable, and D1-load-free.
- **Publisher ↔ Story renderer.** The story HTML must be rendered by the *same* Astro components as the static tier, or the site will look like two products. The mechanism is a shared `shared/templates/*.ts` module of pure functions returning HTML strings, imported by both Astro layouts and (if ever needed) the Function.

---

## 3. Recommended Project Structure

**One `package.json`, one lockfile, no workspace protocol.** A monorepo toolchain (pnpm workspaces, Turborepo, Nx) is the single most common cause of "works locally, fails on the Pages build". The Pages build needs exactly one install step and one build step it can resolve without workspace graph traversal.

```
newsportal/
├── package.json                  # SINGLE root package.json (no "workspaces")
├── pnpm-lock.yaml                # one lockfile -> Pages runs one pnpm install
├── tsconfig.json                 # paths: { "@shared/*": ["shared/*"] }
├── wrangler.toml                 # pipeline Worker (apps/pipeline)
├── .node-version                 # 22  (Pages v3 image ships 22.16.0)
│
├── shared/                       # ── THE CONTRACT ── imported by BOTH tiers
│   ├── types.ts                  # Story, Cluster, Topic, Entity, Edition, Section, Digest
│   ├── sections.ts               # the 8 sections: slug, name, order, lexicon ref
│   ├── taxonomy.ts               # country gazetteers, entity gazetteer, stop-lists, lexicons
│   ├── templates/                # pure TS functions -> HTML strings (shared by Astro + Function)
│   │   ├── layout.ts             #   <html> shell, <head>, theme, skip-link
│   │   ├── story.ts              #   story body partial (headline, excerpt, sources, tags)
│   │   ├── section.ts            #   section listing partial
│   │   └── head.ts               #   meta + JSON-LD builders (NewsArticle, ItemList, ...)
│   └── db/
│       ├── 0001_init.sql         # DDL (see §5)
│       ├── 0002_indexes.sql
│       └── 0003_seed_reference.sql
│
├── apps/
│   ├── pipeline/                 # ── Cloudflare Worker: ingest + enrich + score + digest
│   │   ├── wrangler.toml
│   │   └── src/
│   │       ├── index.ts          #   fetch() health + scheduled() dispatcher
│   │       ├── ingest/
│   │       │   ├── fetcher.ts
│   │       │   ├── parser.ts
│   │       │   ├── normalizer.ts
│   │       │   └── shard.ts      #   time-based shard selection
│   │       ├── cluster/
│   │       │   ├── fingerprint.ts #   tokenise, normalise, simhash64
│   │       │   ├── lsh.ts         #   4-band candidate generation
│   │       │   └── merge.ts       #   the two-gate merge rule
│   │       ├── enrich/
│   │       │   ├── section.ts
│   │       │   ├── topics.ts
│   │       │   ├── entities.ts
│   │       │   ├── country.ts
│   │       │   └── ai.ts          #   Workers AI client (typed, budgeted)
│   │       ├── score/trending.ts
│   │       ├── digest/generate.ts
│   │       ├── snapshot/write.ts
│   │       └── lib/{db.ts,http.ts,logger.ts,metrics.ts}
│   │
│   └── web/                     # ── Cloudflare Pages: Astro + Pages Functions
│       ├── astro.config.mjs     # output:'static', build.format:'file', trailingSlash:'never'
│       ├── functions/           #   Pages Functions (NOT Astro API routes)
│       │   ├── story/[[slug]].ts    #   /story/*  -> R2
│       │   ├── api/snapshot.ts      #   /api/snapshot -> R2 blob
│       │   ├── api/health.ts
│       │   └── api/og/[slug].ts     #   /og/* -> R2
│       ├── public/
│       │   ├── _routes.json     #   { "include": ["/story/*","/api/*","/og/*"] }
│       │   ├── _headers          #   security + cache headers
│       │   └── robots.txt        #   (generated, see §12)
│       ├── src/
│       │   ├── pages/           #   Astro routes (the static tier)
│       │   ├── layouts/
│       │   ├── components/      #   broadsheet UI primitives
│       │   ├── content/         #   MDX collections
│       │   │   ├── trust/       #   about, editorial-policy, corrections, contact, methodology
│       │   │   ├── authors/     #   author bios (Person schema)
│       │   │   └── insight/     #   original articles (publisher-authored)
│       │   └── styles/          #   Tailwind v4 theme, fonts, print rules
│       └── scripts/
│           ├── prepare-data.mjs #   pull snapshot from R2 -> .cache/content.json
│           ├── publish.mjs      #   upload dist/story/** to R2, strip, write sitemaps/RSS
│           └── images.mjs       #   fetch + resize images for rows with status='pending'
│
└── .planning/
```

### 3.1 Structure rationale

- **`shared/` is a directory, not a package.** No `workspace:*` resolution, no build step, no publish. Both `apps/pipeline` (bundled by Wrangler/esbuild) and `apps/web` (bundled by Astro/Vite and by Pages' esbuild for Functions) resolve it. **Within `apps/web/functions/`, import `shared/` by relative path (`../../../../shared/templates/story.ts`), not by alias** — Pages' Function bundler is the least predictable part of the build, and relative paths always work. TypeScript path aliases are fine for the Astro app and the Worker (both use esbuild with a tsconfig), but never gamble on them in Functions.
- **`shared/templates/` holds the layout as plain functions.** The only way to guarantee a dynamically served story page looks identical to a statically served section page is to have one implementation. Astro components cannot be rendered inside a Pages Function, so the shared surface must be framework-free string builders. Astro pages then use `<Fragment set:html={renderStoryLayout(...)} />` or, better, Astro components that *call* the same string builders for the inner regions.
- **One `package.json`.** `apps/web` uses the root `node_modules` via Node's upward resolution. The Pages "Root directory" is the repo root; the build command is `pnpm install --frozen-lockfile && pnpm build`. Astro's `root`/`srcDir` point into `apps/web`. No workspace graph, no `--filter`, no lockfile churn.
- **`scripts/` separate from `src/`.** Build-time Node scripts are not part of the Astro bundle and must not be shipped to the edge. They are also where `sharp` and `satori` live — devDependencies that must never enter the Worker bundle (the Worker bundle limit is 64 MiB and `sharp` is a native module that cannot run there at all).

---

## 4. Data Flow

### 4.1 Flow A — Ingest (publisher RSS → D1)

Runs on cron `*/10 * * * *` (144 invocations/day, one cron trigger, well inside the 5-per-account limit).

```
1.  scheduled(controller)
2.    shard = floor(epochMinutes / 10) % NUM_SHARDS          # time-based, deterministic
3.    sources = SELECT id, feed_url, etag, last_modified FROM sources
4.           WHERE is_active = 1
5.           AND (disabled_until IS NULL OR disabled_until < now)
6.           AND hash(id) % NUM_SHARDS = shard                 # spread load over the day
7.    for each source (sequential — 6 concurrent-connection limit):
8.        res = await fetch(feed_url, { headers: { 'If-None-Match': etag, ... },
9.                                        signal: AbortSignal.timeout(10_000) })
10.       if res.status === 304 -> mark unchanged; continue      # 0 CPU, minimal bytes
11.       if res.status === 429 -> honour Retry-After; set disabled_until; continue
12.       if !res.ok            -> retry once (jitter); record failure; continue
13.       body = await res.text()
14.       items = parseFeed(body)                                # bounded scanner
15.       newItems = items.filter(i => fingerprint(i) not seen)   # cheap pre-filter
16.       for each newItem:
17.         fp = simhash64(normaliseTokens(headline))
18.         cands = SELECT ... FROM stories WHERE band IN (bands(fp))
19.                 AND published_at > now - 72h  LIMIT 32       # LSH candidate gen
20.         target = mergeGate(cands, fp, item)                  # see §6
21.         db.batch([ ...insert story / link story_sources / touch cluster... ])
22.       UPDATE sources SET etag, last_modified, last_status      # only when changed
23.    log pipeline_runs row (status, counts, errors)
```

**Where it stops and starts:**
- **Stops at the D1 write.** The Worker never reads D1 on the reader path.
- **Continues in the build container**, via the snapshot, not the database.
- **The AI pass does not run here.** It runs in the daily *finalize* cycle (see below), because (a) AI calls cost 200 ms–2 s of wall time each and 120 of them per 10-minute cycle is wasteful, and (b) batching AI work into a cycle that immediately precedes a build produces a consistent edition.

### 4.2 Flow B — Finalize + publish (D1 → R2 snapshot → Pages build → CDN)

```
Cron "5 4,10,16,22 * * *"  (finalize — 4x/day = 120 builds/month, 24% of the 500/month cap)

 1.  Load the last 24 h of clusters from D1 (page of 500, chunked).
 2.  AI pass (network, ~0 Worker CPU):
       - entity extraction + disambiguation for each cluster that lacks entities
       - Workers AI zero-shot section tie-break for clusters below rule confidence
       - digest prose for each edition: 250-400 words, paraphrased from the day's
         top clusters, with an explicit "Sources" list
 3.  Rescore trending for every cluster with published_at >= now - 7d   (~525 rows)
 4.  Refresh the prominence window (published_at within 90 days => is_prominent = 1)
 5.  Write daily_digests rows (7 editions x 1)
 6.  Fetch Open-Meteo for the 7 edition centroids + city list (7-14 calls, multi-coordinate)
 7.  SERIALISE the dataset ONCE:
       snapshot = gzip(JSON.stringify({ editions, sections, clusters90d, topics, entities,
                                        digests, digests30d, weather, manifest }))
       env.MEDIA.put('snapshots/{version}.json.gz', snapshot)     # R2, ~1-6 MB
       env.MEDIA.put('snapshots/{version}.manifest.json', manifest)
 8.  POST the Pages Deploy Hook (stored as a Worker secret) -> starts the build
```

```
Pages build container (Ubuntu 22.04, 20-min timeout)

 9.  pnpm install --frozen-lockfile                                # cached by Pages build cache
10.  node scripts/images.mjs
       - SELECT * FROM images WHERE status = 'pending'             # via the API snapshot or D1 REST
       - for each: fetch publisher image -> sharp resize -> 2 variants -> R2.put
       - UPDATE images SET r2_key, status='ready'
       - (content-addressed by sha256(source_url): a URL already 'ready' is skipped forever)
11.  node scripts/prepare-data.mjs
       - GET {R2}/snapshots/{version}.json.gz  -> .cache/content.json  (gzip-decompressed)
       - read the previous render manifest from R2 (renders/{version}.json)
12.  astro build
       - static tier: editions, sections, front pages, topic pages, entity pages,
         date archives, digest pages, trust pages, author pages, original articles
       - story pages: getStaticPaths() returns ONLY clusters whose updated_at >
         last_rendered_at  (typically 200-400 per cycle)
13.  node scripts/publish.mjs
       - for each dist/story/**/index.html -> R2.put('story/{slug}.html', bytes)
         (and R2.put('og/{slug}.png', rasterised OG image))
       - DELETE dist/story/** from dist/   <-- enforces the Pages 20,000-file budget
       - write sitemap.xml (index), sitemap-news.xml, sitemap-pages-{edition}.xml,
         sitemap-stories-{year}.xml, rss/{edition}.xml, robots.txt
       - write dist/renders/{version}.json (render manifest for the next cycle)
14.  Pages deploys dist/  (static tier only, ~6,700 files)
```

**The concrete answer to "how does the build obtain fresh data without a paid DB":**
**D1 → (Worker) → gzipped JSON snapshot in R2 → (build container) → local file.** The build never opens a D1 binding, never runs `wrangler d1 execute`, and never touches a paid service. The snapshot is the build's data contract; it is versioned, immutable, and cheap to re-fetch (one R2 GET, ~1 MB gzipped, cached at the edge). The snapshot is also the natural place to keep the build deterministic — the same snapshot always produces the same site.

**Why not KV for the snapshot:** KV Free allows 1,000 writes/day (fine) but the KV value ceiling is 25 MiB and there is no partial-read API, so serving a multi-MB dataset means either one huge value or many chunk keys and reassembly. R2 is the better store: unlimited object size, gzip at rest, free egress, Class A writes at 1M/month against ~120/day of snapshots.

**Why not D1 → JSON export → build directly:** two reasons, both fatal. (a) The Pages build container has no D1 binding; reaching D1 means the REST API with an account token, whose queries are limited to 30 s and which has its own rate limits — a 30,000-row serialisation would have to be chunked and would be slow and brittle. (b) The serialisation itself must happen somewhere; doing it in a Worker at request time would exceed the 10 ms CPU limit (30,000 rows ≈ 30 ms of JSON work). Doing it in the *pipeline Worker* during the finalize cycle (where the CPU budget is 10 ms too — but the serialisation can be chunked across a few invocations, or the dataset kept small enough) is the answer. Keeping the snapshot small is therefore a design constraint: the snapshot contains **90 days of clusters**, not all history.

### 4.3 Flow C — Read (reader → HTML)

```
Reader requests https://site/story/{slug}
  ├─ Pages static asset?  (only if the slug somehow has a static file — never by design)
  └─ Pages Function /story/[[slug]]
        ├─ R2.get('story/{slug}.html')            # ~25-40 ms, no D1
        ├─ return 200, Content-Type: text/html; charset=utf-8
        │         Cache-Control: public, max-age=300, stale-while-revalidate=86400
        │         ETag: "{cluster.updated_at_epoch}"
        └─ (on 304) CDN revalidates without re-rendering
```

Every other URL (`/uk`, `/uk/politics`, `/topic/{slug}`, `/uk/2026/10/20`) is a **static asset served straight from the CDN** — no Worker invocation, no request-quota consumption, no D1, no CPU. This is why `_routes.json` must include only `/story/*`, `/api/*` and `/og/*`: any wider include converts free unlimited static requests into metered Worker requests.

---

## 5. The D1 Schema

SQLite (D1's engine). Foreign keys are enforced (D1 enables them by default); migrations should `PRAGMA defer_foreign_keys = true` so the `stories ⇄ clusters` cycle resolves. `WITHOUT ROWID` is used on the pure join tables to save space and a lookup.

```sql
-- ============================================================================
-- 0001_init.sql — The Meridian content model
-- Design rules:
--   * `clusters` are the published units ("BBC · Guardian · Sky"). They are
--     permanent and their `slug` never changes.
--   * `stories` are raw mentions — one row per (outlet, item). They are the
--     dedup evidence and the attribution record. Never rendered directly.
--   * `story_sources` is the many-to-many between a cluster and its outlets,
--     carrying display rank so the primary (earliest/best) source is first.
--   * 90-day prominence is a *flag*, not a deletion. Rows are never deleted.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ─────────────────────────────── Reference ──────────────────────────────────

CREATE TABLE editions (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,          -- 'uk' | 'us' | 'au' | 'ca' | 'ie' | 'nz' | 'in' | 'in-hi'
  name         TEXT NOT NULL,                 -- 'The Meridian — United Kingdom'
  country_code TEXT NOT NULL,                 -- ISO-3166-1 alpha-2
  language     TEXT NOT NULL,                 -- 'en' | 'hi'
  timezone     TEXT NOT NULL,                 -- IANA zone
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sections (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,            -- 'politics' | 'business' | ... | 'weather'
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE edition_sections (
  edition_id INTEGER NOT NULL REFERENCES editions(id),
  section_id INTEGER NOT NULL REFERENCES sections(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (edition_id, section_id)
) WITHOUT ROWID;

-- The feed catalogue. `section_prior` is the per-outlet prior used by the
-- section resolver; it is JSON so adding a section does not need a migration.
CREATE TABLE sources (
  id                   INTEGER PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,  -- 'bbc-news'
  name                 TEXT NOT NULL,         -- 'BBC News'
  homepage_url         TEXT NOT NULL,
  feed_url             TEXT NOT NULL,
  country_code         TEXT NOT NULL,         -- outlet's home country
  language             TEXT NOT NULL DEFAULT 'en',
  default_section      TEXT,                  -- prior section slug, if the feed is section-specific
  section_prior        TEXT NOT NULL DEFAULT '{}',  -- JSON: {"politics":0.6,"world":0.3}
  etag                 TEXT,
  last_modified        TEXT,
  last_fetched_at      TEXT,
  last_status          TEXT,                  -- http status of the last real fetch
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  disabled_until       TEXT,                  -- backoff window
  is_active            INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
-- The fetcher's hot path: "which enabled sources are due?"
CREATE INDEX idx_sources_active ON sources(is_active, disabled_until);
CREATE INDEX idx_sources_country ON sources(country_code);

-- ─────────────────────────────── Taxonomy ───────────────────────────────────

CREATE TABLE topics (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,            -- 'uk-election-2026'
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'topic',   -- 'topic' | 'beat'
  story_count INTEGER NOT NULL DEFAULT 0,     -- denormalised for the thin-page gate
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_topics_kind_count ON topics(kind, story_count);
CREATE INDEX idx_topics_name ON topics(name);

CREATE TABLE entities (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,         -- 'keir-starmer'
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,                -- 'person' | 'org' | 'place' | 'event'
  country_code  TEXT,
  mention_count INTEGER NOT NULL DEFAULT 0,
  story_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entities_count ON entities(story_count);
CREATE INDEX idx_entities_name  ON entities(name);
CREATE INDEX idx_entities_country ON entities(country_code);

-- ────────────────────────────── Content core ────────────────────────────────

-- A published story = one event, however many outlets covered it.
CREATE TABLE clusters (
  id                 INTEGER PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,    -- IMMUTABLE. Derived from id at creation.
  canonical_headline TEXT NOT NULL,           -- the headline we publish (the best member's)
  canonical_excerpt  TEXT,
  primary_section_id INTEGER REFERENCES sections(id),
  section_confidence REAL NOT NULL DEFAULT 0,
  section_method     TEXT NOT NULL DEFAULT 'rules',   -- 'rules' | 'source' | 'ai'
  published_at       TEXT NOT NULL,           -- earliest member's pubDate (ISO-8601 UTC)
  first_seen_at      TEXT NOT NULL,
  last_seen_at       TEXT NOT NULL,
  outlet_count       INTEGER NOT NULL DEFAULT 0,       -- DISTINCT outlets
  mention_count      INTEGER NOT NULL DEFAULT 0,      -- total mentions
  trending_score     REAL NOT NULL DEFAULT 0,
  score_updated_at   TEXT,
  editorial_rank     INTEGER,                 -- editor's picks; NULL = not picked
  is_prominent       INTEGER NOT NULL DEFAULT 1,       -- inside the 90-day window
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Front page / section listing: prominent + newest.
CREATE INDEX idx_clusters_prominent ON clusters(is_prominent, published_at DESC);
-- Section page: one section, newest first.
CREATE INDEX idx_clusters_section ON clusters(primary_section_id, published_at DESC);
-- "Most Covered" ranking.
CREATE INDEX idx_clusters_score ON clusters(trending_score DESC);
-- Editor's picks (partial index: only picked rows are indexed).
CREATE INDEX idx_clusters_editorial ON clusters(editorial_rank) WHERE editorial_rank IS NOT NULL;
-- Daily rescore window.
CREATE INDEX idx_clusters_recent ON clusters(published_at DESC);

-- One row per (outlet, item). The raw evidence of the aggregation.
CREATE TABLE stories (
  id            INTEGER PRIMARY KEY,
  cluster_id    INTEGER NOT NULL REFERENCES clusters(id),
  source_id     INTEGER NOT NULL REFERENCES sources(id),
  external_guid TEXT NOT NULL,               -- the feed's <guid> / <id>
  headline      TEXT NOT NULL,
  excerpt       TEXT,
  url           TEXT NOT NULL,               -- publisher URL (the attribution link)
  slug          TEXT NOT NULL,               -- slug of the ORIGINAL item (never published)
  language      TEXT NOT NULL DEFAULT 'en',
  published_at  TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  simhash       INTEGER NOT NULL,            -- 64-bit headline fingerprint (signed int64; compare
                                            -- with unsigned semantics on the two 32-bit halves)
  band0 INTEGER NOT NULL, band1 INTEGER NOT NULL,
  band2 INTEGER NOT NULL, band3 INTEGER NOT NULL,
  country_code  TEXT NOT NULL,
  is_primary    INTEGER NOT NULL DEFAULT 0,  -- the member whose headline we publish
  UNIQUE (source_id, external_guid)
);
-- The cluster's member list, in display order.
CREATE INDEX idx_stories_cluster ON stories(cluster_id);
-- LSH candidate generation (4 bands -> 4 index lookups).
CREATE INDEX idx_stories_band0 ON stories(band0);
CREATE INDEX idx_stories_band1 ON stories(band1);
CREATE INDEX idx_stories_band2 ON stories(band2);
CREATE INDEX idx_stories_band3 ON stories(band3);
-- "Latest from this outlet", dedupe of re-ingested items.
CREATE INDEX idx_stories_source_pub ON stories(source_id, published_at DESC);
CREATE INDEX idx_stories_published ON stories(published_at DESC);

-- THE MANY-TO-MANY. One row per (cluster, outlet mention).
CREATE TABLE story_sources (
  cluster_id   INTEGER NOT NULL REFERENCES clusters(id),
  story_id     INTEGER NOT NULL REFERENCES stories(id),
  source_id    INTEGER NOT NULL REFERENCES sources(id),
  rank         INTEGER NOT NULL DEFAULT 0,   -- 0 = primary/headline source
  published_at TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cluster_id, story_id)
) WITHOUT ROWID;
-- "Which clusters did this outlet cover?" + the member list ordered for display.
-- (The PK already covers cluster_id lookups; this index serves source_id.)
CREATE INDEX idx_story_sources_source ON story_sources(source_id, published_at DESC);
CREATE INDEX idx_story_sources_rank ON story_sources(cluster_id, rank);

-- Which sections a cluster belongs to (usually one; two when it genuinely spans).
CREATE TABLE cluster_sections (
  cluster_id INTEGER NOT NULL REFERENCES clusters(id),
  section_id INTEGER NOT NULL REFERENCES sections(id),
  confidence REAL NOT NULL,
  method     TEXT NOT NULL,                  -- 'rules' | 'source' | 'ai'
  PRIMARY KEY (cluster_id, section_id)
) WITHOUT ROWID;
CREATE INDEX idx_cluster_sections_section ON cluster_sections(section_id, cluster_id);

-- Cross-country flagging: a cluster may appear in several editions.
CREATE TABLE edition_clusters (
  edition_id INTEGER NOT NULL REFERENCES editions(id),
  cluster_id INTEGER NOT NULL REFERENCES clusters(id),
  reason     TEXT NOT NULL,                  -- 'source' | 'entity' | 'gazetteer' | 'wire'
  confidence REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (edition_id, cluster_id)
) WITHOUT ROWID;
-- The PK (edition_id, cluster_id) already serves "all clusters for an edition".
-- This index serves the reverse direction: "which editions carry this cluster?"
CREATE INDEX idx_edition_clusters_cluster ON edition_clusters(cluster_id);

CREATE TABLE story_topics (
  story_id INTEGER NOT NULL REFERENCES stories(id),
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  weight   REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (story_id, topic_id)
) WITHOUT ROWID;
CREATE INDEX idx_story_topics_topic ON story_topics(topic_id, story_id);

CREATE TABLE story_entities (
  story_id   INTEGER NOT NULL REFERENCES stories(id),
  entity_id  INTEGER NOT NULL REFERENCES entities(id),
  weight     REAL NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, entity_id)
) WITHOUT ROWID;
CREATE INDEX idx_story_entities_entity ON story_entities(entity_id, story_id);

-- ───────────────────────── Digests, media, ops ──────────────────────────────

CREATE TABLE daily_digests (
  id          INTEGER PRIMARY KEY,
  edition_id  INTEGER NOT NULL REFERENCES editions(id),
  digest_date TEXT NOT NULL,                 -- '2026-10-20'
  language    TEXT NOT NULL DEFAULT 'en',
  title       TEXT NOT NULL,
  lead        TEXT,
  body        TEXT NOT NULL,                 -- ORIGINAL generated prose (not headlines)
  headline_ids TEXT NOT NULL,                -- JSON array of cluster ids
  model       TEXT,
  token_count INTEGER,
  status      TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'failed'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (edition_id, digest_date, language)
);
CREATE INDEX idx_digests_date ON daily_digests(digest_date DESC);
CREATE INDEX idx_digests_edition ON daily_digests(edition_id, digest_date DESC);

CREATE TABLE images (
  id           INTEGER PRIMARY KEY,
  story_id     INTEGER REFERENCES stories(id),
  cluster_id   INTEGER REFERENCES clusters(id),
  source_url   TEXT NOT NULL UNIQUE,         -- publisher URL = the dedupe key
  content_hash TEXT NOT NULL,                -- sha256 of the fetched bytes
  r2_key       TEXT,                         -- 'media/2026/10/20/{hash}/hero.webp'
  r2_key_thumb TEXT,                         -- 'media/2026/10/20/{hash}/thumb.webp'
  width        INTEGER, height INTEGER, bytes INTEGER,
  alt_text     TEXT,
  credit       TEXT,                         -- 'Photo: <publisher>' / photographer
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'ready'|'failed'|'skipped'
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_images_story ON images(story_id);
CREATE INDEX idx_images_status ON images(status);

-- Operational log. IMPORTANT: only append on CHANGE, never per poll.
CREATE TABLE feed_fetches (
  id          INTEGER PRIMARY KEY,
  source_id   INTEGER NOT NULL REFERENCES sources(id),
  fetched_at  TEXT NOT NULL,
  http_status INTEGER,
  bytes       INTEGER,
  item_count  INTEGER,
  new_items   INTEGER,
  duration_ms INTEGER,
  error       TEXT
);
CREATE INDEX idx_feed_fetches_source ON feed_fetches(source_id, fetched_at DESC);

CREATE TABLE pipeline_runs (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,                -- 'ingest' | 'finalize'
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT NOT NULL,                -- 'ok' | 'degraded' | 'error'
  items_seen   INTEGER NOT NULL DEFAULT 0,
  items_new    INTEGER NOT NULL DEFAULT 0,
  clusters_new INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);
CREATE INDEX idx_pipeline_runs_started ON pipeline_runs(started_at DESC);
```

### 5.1 Index reasoning

| Index | Serves | Why it must exist |
|---|---|---|
| `idx_stories_band0..3` | LSH candidate generation | Without these the clusterer scans `stories` — at 44,000 rows that is 44,000 rows read per incoming item, i.e. ~5M rows read per day and an immediate breach of the D1 read budget. Four 16-bit bands give ~4 lookup sets instead of one scan. |
| `idx_stories_cluster` | Member list | The "BBC · Guardian · Sky" list and the primary-member lookup. Without it, rendering a story page scans every story. |
| `idx_clusters_prominent` | Front page, section listings | A composite covering the exact predicate (`is_prominent = 1`) plus the sort key, so the front page is an index scan of ~200 rows rather than a scan of 44,000. |
| `idx_clusters_score` | "Most Covered" | Ordering by score requires the index; without it the ranking sorts every prominent cluster. |
| `idx_clusters_editorial` (partial) | Editor's picks | Partial index over the ~1% of rows that are picked. Cheap to maintain, tiny to scan. |
| `idx_stories_source_pub` | Re-ingest suppression + per-outlet listing | `(source_id, published_at DESC)` answers "what has this outlet published?" and makes the `UNIQUE(source_id, external_guid)` lookup cheap. |
| `idx_story_sources_source` | "Outlet X covered" | The PK covers `cluster_id` lookups; this covers the reverse direction. |
| `idx_edition_clusters_edition` | Edition listing | The `(edition_id, published_at)` shape matches "the edition front page" query exactly. |

**Index amplification caveat.** Cloudflare states that "indexes will add an additional written row when writes include the indexed column" ([D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)). An `INSERT` into `stories` with 5 indexes therefore counts as 6 rows written. This is the reason the write budget below is computed on *physical* rows, not logical rows.

### 5.2 Permanence and the 90-day archive

- **URLs never change.** `clusters.slug` is generated once, at creation, from a normalised headline plus the cluster id (`{headline-slug}-{base36(id)}`). It is never regenerated, even if the canonical headline changes (which happens when a better outlet's headline supersedes the first one). The `UNIQUE` constraint on `slug` guarantees collision-freedom.
- **Nothing is deleted.** There is no `DELETE` anywhere in the content tables. The 90-day window is expressed as `is_prominent`, refreshed by the finalize cycle: `UPDATE clusters SET is_prominent = (published_at >= datetime('now','-90 days'))`. Prominent clusters appear in front pages, section listings and the ranking; non-prominent ones remain addressable at their permanent URL, appear in date archives and topic/entity pages, and remain in the sitemap.
- **`published_at` never changes.** It is the earliest member's publication time, so a story's position in the archive is stable. `last_seen_at` moves; `published_at` does not.
- **Storage growth.** At ~700 bytes per story row plus ~250 bytes of index, 44,000 stories/year ≈ 42 MB/year. Cluster, topic, entity, digest and image rows add roughly 25 MB/year. **Total ≈ 70 MB/year against a 500 MB database and a 5 GB account — roughly 7 years of headroom on the database limit and 70 years on the account limit.** Do **not** persist embedding vectors (a 384-float vector is 1.5 KB, which would triple the story table); SimHash is 8 bytes and does the same job for candidate generation.

---

## 6. Deduplication Architecture

### 6.1 Where clustering happens

**In the Worker, immediately after parsing, before any enrichment.** Rationale:
- It is the cheapest place to prevent duplicate work: an item that joins an existing cluster does not need its own topic/entity/section resolution — it inherits the cluster's.
- It must happen before the trending score, because breadth is a property of the cluster.
- It must happen before the story page is written, because the whole product promise is "one entry, many outlets".

### 6.2 The cluster key

There is **no single hash key** for a cluster, and this is the crux. A SimHash alone cannot distinguish "two outlets covering the same event" from "two different events about the same topic" — two separate election stories will share most of their headline tokens and land close together on the hash space.

The cluster is identified by a **surrogate id** (`clusters.id`), and *membership* is decided by a **two-gate rule** over a set of candidates:

**Gate 1 — Surface similarity** (both must hold)
1. **SimHash Hamming distance ≤ 12** (of 64 bits). A 64-bit SimHash of a ~10-token headline puts near-identical headlines within 0–8 bits and related-but-distinct headlines at 15+.
2. **Token Jaccard ≥ 0.55** on the *stop-list-filtered, stemmed* token sets. Computed on the small sets (8–14 tokens) so it is cheap.
3. **Temporal proximity**: `|published_at(new) − published_at(candidate)| ≤ 48 h`.

**Gate 2 — Semantic agreement** (at least one must hold)
4. **Shared specific entity**: the incoming item and the candidate share at least one **non-generic** entity from the gazetteer — a named person, organisation, or place. "Keir Starmer" qualifies; "the government", "the election", "the storm" do not.
5. **Near-identical phrasing**: Jaccard ≥ 0.80 (no entity gate needed — at that level it is the same story told twice).

**Explicit anti-merge guards** (applied before the gates)
- **Generic token removal.** Before computing Jaccard, strip a stop-list of high-frequency news tokens: `election, government, storm, warning, live, latest, update, updates, says, said, warns, report, news, today, yesterday, video, live`. Without this, "Election live: Labour ahead" and "Election live: Conservatives ahead" score ~0.7 Jaccard and would wrongly merge.
- **Aspect marker conflict.** If one headline contains an aspect marker from one set and the other contains a marker from a conflicting set, refuse the merge regardless of similarity. Example sets: `{announces, unveils, launches}` vs `{criticises, scraps, cancels}`; `{ahead, wins, victory}` vs `{behind, trails, defeat}`; `{injury, blow, ruled out}` vs `{return, fit, available}`. Aspect markers are per-section lexicons.
- **Round/ordinal guard.** Two headlines that both contain a distinct numeric token (`2026`, `second`, `third`, `round two`, `semi-final`) with *different* values are different events unless they share an entity **and** the same aspect marker.
- **Distinct-event guard.** If the two headlines each contain a specific entity that the other does not (e.g. "Starmer faces Sunak" vs "Starmer faces Reeves"), and neither shares a second entity, do not merge even if Jaccard is 0.7.

### 6.3 Candidate generation (keeping it O(1), not O(N))

Naively comparing every new item against every cluster is O(N) per item — at 44,000 clusters that is 5M comparisons/day and an instant breach of both the CPU budget and the D1 read budget. The fix is **LSH banding over the SimHash**:

```
simhash64  ->  4 bands of 16 bits
band_i = (simhash >> (16*i)) & 0xFFFF

candidate clusters =
  SELECT DISTINCT s.cluster_id
  FROM stories s
  WHERE (s.band0 = ?1 OR s.band1 = ?2 OR s.band2 = ?3 OR s.band3 = ?4)
    AND s.published_at > datetime('now','-72 hours')
  LIMIT 32
```

Four indexed lookups (using the four band indexes) reduce the comparison set from 44,000 to a handful. The four `band*` columns are stored on `stories` so this is four index seeks, not one OR-scan.

**Tuning note:** a 64-bit SimHash split into four 16-bit bands guarantees that any two hashes within Hamming distance ≤ 3 share at least one band. Distance 12 can share *no* band, so the LSH is a **recall filter, not a decision**: the merge gate must be evaluated on candidates found by *any* band plus a fallback for high-simhash pairs. Practical fix used here: also index the full `simhash` value (`idx_stories_simhash`) and run a second query for `simhash BETWEEN ? AND ?` (arithmetic range on the ±12 neighbourhood is not a contiguous range in the integer ordering — instead, keep a `hamming ≤ 16` prefilter by querying all four bands and accepting that very distant hashes are missed). **In practice**: for same-event headlines the Hamming distance is 0–10, which almost always shares a band. Measure recall empirically against a labelled sample in the first month; if recall is below ~95%, increase band count to 8×8 bits (more candidate noise, same cost) or add a `title_token_hash` bucket as a second LSH key.

### 6.4 The "single entry showing BBC · Guardian · Sky" data model

```
clusters (1 row — the published story)
   id: 4182
   slug: 'starmer-calls-snap-election-1g8'
   canonical_headline: 'Starmer calls snap election for October'
   outlet_count: 3        <- DISTINCT source_id in story_sources
   mention_count: 4       <- total story_sources rows
   trending_score: 14.82
        │
        │ story_sources (many-to-many)
        ▼
story_sources ─────────────── stories ─────────────── sources
 (cluster_id, story_id,        (the raw mention:      (the outlet:
  source_id, rank,              guid, headline,        name, homepage,
  published_at)                  excerpt, url,          country, logo)
                                published_at, simhash)
   rank 0 → BBC News    story #99101  headline "Starmer calls snap election for October"
   rank 1 → The Guardian story #99107  headline "PM Starmer announces October poll"
   rank 2 → Sky News     story #99115  headline "Starmer triggers snap election in October"
                          (rank 3) Sky News (live) — a second mention from an
                          outlet already present; counted in mention_count,
                          NOT in outlet_count
```

Rendering rules:
- The **canonical headline** is the member with `rank = 0`. Rank is assigned by: (a) prefer the outlet with the highest editorial-authority tier configured per source, (b) tie-break by earliest `published_at`, (c) tie-break by `simhash` centrality within the cluster (the member closest to the cluster centroid) — the "most typical phrasing" headline, which tends to be the least sensational.
- The **excerpt** is the corresponding member's excerpt, truncated at a word boundary to ~320 characters, with no full-article text ever stored.
- The **outlet list** is rendered from `story_sources` joined to `sources`, ordered by `rank`, each linking to the publisher's original URL (`stories.url`) with `rel="nofollow noopener"`. Each outlet is a `<a>` to the publisher, never a duplicate of our own page.
- Schema.org: the page is a single `NewsArticle` whose `author` is `{"@type":"Organization","name":"The Meridian"}`, with `isBasedOn` pointing at the publisher URLs and `citation` listing them. We are *not* claiming authorship of the reporting; we are claiming authorship of the curation. This distinction matters for both honesty and structured-data validity.

### 6.5 Re-rendering the member list when a new outlet joins

This is where the tier split pays for itself.

```
New outlet joins cluster 4182
  1. INSERT INTO story_sources (cluster_id, story_id, source_id, rank, published_at)
  2. UPDATE clusters
       SET outlet_count  = outlet_count + 1,
           mention_count = mention_count + 1,
           last_seen_at  = ?,
           updated_at    = ?                      -- bumps the render manifest
  3. UPDATE clusters SET trending_score = <recompute> , score_updated_at = ?
  4. The story page for /story/starmer-calls-snap-election-1g8 is rendered by the
     NEXT Astro build (because updated_at > last_rendered_at) and re-uploaded to
     R2, overwriting the previous object.
  5. The CDN holds the previous copy for up to `max-age=300`; after that it
     revalidates against R2's ETag and serves the new HTML.
```

**Latency: ≤ 6 hours** with a 4×/day build (worst case), typically much less because the finalize cycle runs 4×/day and a story that gains an outlet usually gains it within the first few hours.

**Why this is acceptable:** the product is a *daily paper*. A member list that is at most 6 hours behind is consistent with the edition model, and it is dramatically better than the alternative (rebuilding 44,000 pages every time an outlet joins, which the 20-minute build timeout forbids).

**Why the alternative was rejected:** rendering the story page live from D1 at request time would make the member list instant, but it puts D1 (single-threaded, 500 MB) on the hot path of every page view, and it requires a second rendering implementation in the Function tier — visual drift between static and dynamic pages is a real risk to the brand. Pre-rendering to R2 keeps one renderer and keeps D1 quiet.

**The one place where staleness would hurt** is the "Most Covered" ranking on the front page. That page *is* rebuilt every cycle from the snapshot, so it is never staler than one cycle. Consistent.

---

## 7. Trending Score

### 7.1 Formula

```
score(cluster) =  W_breadth · log2(1 + distinct_outlets)
               +  W_volume  · log2(1 + mention_count)
               +  W_recency · recency_decay
               +  W_depth   · min(1, distinct_sections - 1)
```

| Term | Definition | Weight |
|---|---|---|
| `distinct_outlets` | `COUNT(DISTINCT source_id)` in `story_sources` for the cluster | `W_breadth = 3.0` |
| `mention_count` | `COUNT(*)` in `story_sources` | `W_volume = 1.0` |
| `recency_decay` | `exp(-ln2 · age_hours / HALF_LIFE)`, `HALF_LIFE = 18 h` | `W_recency = 5.0` |
| `distinct_sections` | number of `cluster_sections` rows for the cluster | `W_depth = 0.8` |

**Breadth is weighted 3× volume** so a story carried by five different outlets always outranks a story that one outlet published five times. This is the explicit anti-gaming property: it rewards independent corroboration, not repetition.

**Decay profile** (fresh = 1.0): 6 h → 0.79 · 12 h → 0.63 · 18 h → 0.50 · 24 h → 0.40 · 36 h → 0.25 · 48 h → 0.16 · 72 h → 0.06 · 7 d → 0.003.

**Worked examples:**

| Case | breadth | volume | recency | depth | score |
|---|---|---|---|---|---|
| 1 outlet, 1 mention, fresh | 3.0 | 1.0 | 5.0 | 0 | **9.0** |
| 5 outlets, 5 mentions, fresh | 7.75 | 2.58 | 5.0 | 0.8 | **16.1** |
| 5 outlets, 8 mentions, 24 h old | 7.75 | 3.00 | 2.00 | 0.8 | **13.6** |
| 1 outlet, 5 mentions, fresh | 3.0 | 2.58 | 5.0 | 0 | **10.6** |
| 3 outlets, 3 mentions, 48 h old | 4.75 | 2.00 | 0.80 | 0 | **7.6** |

The ranking is monotone in every term, decays roughly geometrically, and is cheap to evaluate.

### 7.2 Recompute cadence

| When | Scope | Rows touched | Cost |
|---|---|---|---|
| On ingest (every 10 min) | Only clusters touched in this cycle | ~20–40 | 2 UPDATEs each (row + `idx_clusters_score`) |
| Daily, in the finalize cycle | All clusters with `published_at >= now − 7 days` | ~525 | ~1,050 rows written |
| Daily, in the finalize cycle | Clusters with `published_at >= now − 90 days` (prominence window) — only if the 7-day set is under 200 clusters | ~1,500 | ~3,000 rows written |

**Why the 7-day window for the daily rescore:** scores decay with time even when nothing new arrives. A story that peaked yesterday must lose rank today. Only the live window needs continuous decay; the 90-day archive is ranked by `published_at`, not by score, so its stale scores are never displayed. The 90-day rescore exists only to keep the archive's scores roughly meaningful for the topic pages.

**Cost against the D1 budget:** ~1,000–3,000 physical rows written per day, i.e. **1–3% of the 100,000/day write limit.** Cheap.

### 7.3 What the score is *not*

It is **not** a quality score. It is a coverage-and-freshness score used exclusively for ordering. Quality signals (does it have an image? is the excerpt substantive? is it from a tier-1 outlet?) are handled separately by `editorial_rank` and by the thin-page gates. Mixing them would make "Most Covered" mean "most covered *and* good", which is not what the label promises.

### 7.4 Editor's picks

`clusters.editorial_rank` is a small integer set by a human (or by a deterministic promotion rule: the top-scoring cluster of each edition per day that is not already covered). The front page renders the two or three lowest `editorial_rank` values as "Editor's Picks". This exists because the dedup/trending layer alone reads as mechanical; a curated slot is an explicit originality and curation signal to both readers and Google's quality classifiers.

---

## 8. Section / Category Assignment

RSS `<category>` elements are unreliable in practice: many publishers emit one catch-all category, others emit a taxonomy (`/news/politics/politics`), others emit slugs that do not map onto our eight sections, and some emit nothing. But there is a *much* stronger source-category signal available: **the feed URL itself**. A publisher that maintains `/news/world/rss.xml` has already curated that feed to that section.

### 8.1 Comparison of the four approaches

| Method | Free | Worker CPU | Accuracy on this corpus | Explainable / auditable | Notes |
|---|---|---|---|---|---|
| **Feed-URL section** (a dedicated per-section feed) | 0 | 0 | **High** — the publisher did the work | Yes | Not available for every outlet/section. The strongest signal when present. |
| **RSS `<category>` mapping** | 0 | 0 | **Low–Medium** | Yes | Unreliable, as above. Use only as a weak prior, never as a decision. |
| **Keyword / lexicon rules** | 0 | <0.5 ms | **Medium–High** once tuned | Yes | Needs per-vertical lexicons and a maintenance burden. Deterministic, zero cost, zero latency. |
| **Workers AI classification** | ~2 neurons/day (see below) | ~0 (network wait) | **High** | No | Effectively free at this volume; the constraints are latency and non-determinism, not cost. |
| **Hybrid (recommended)** | ~0 | <0.5 ms | **High** | Partly | Rules decide the easy majority; AI arbitrates the ambiguous band. |

**The cost surprise:** Workers AI's free allocation is 10,000 neurons/day, and section classification with `@cf/baai/bge-reranker-base` costs 283 neurons per million input tokens. Scoring 120 items against 8 section labels (~60 tokens each) is 120 × 8 × 60 = 57,600 tokens ≈ **16 neurons/day** — 0.16% of the free allocation. Cost is simply not a factor. The real reasons to prefer rules are **determinism** (the same headline always lands in the same section, which matters for stable URLs and for debugging) and **latency** (rules are free and instant).

### 8.2 Recommended resolver (in priority order)

```
1. FEED SECTION (decisive)
   If sources.default_section is set, the cluster's primary section = that section.
   Confidence 0.95. Method 'source'.

2. LEXICON SCORE (decisive if clear)
   For each of the 8 sections, score = Σ over section keywords present in
   (headline + excerpt + source name) of weight.
   Weights: a headline match is 3.0; an excerpt match is 1.0; a source-name
   match is 2.0. Stop-listed generic words contribute 0.
   Take the argmax. If (top − second) >= 2.0 -> accept, confidence = min(0.9, top/8).
   Method 'rules'.

3. SECTION-SPECIFIC RULES (overrides)
   - If the headline matches a foreign-country gazetteer entry or a 'foreign'
     marker, and the matched lexicon was politics/business -> section = 'world'.
   - Weather feeds and headlines matching the weather lexicon -> 'weather'
     (and these clusters bypass the normal path: weather is a live-data section).
   - Sport lexicon wins over the generic 'world' lexicon for team/competition terms.

4. AI TIE-BREAK (only when steps 1-3 leave a margin < 2.0)
   Zero-shot: embed the headline with @cf/baai/bge-small-en-v1.5
   (1841 neurons/M tokens -> 120 items x 60 tokens = 13 neurons/day),
   compare against 8 precomputed section-label embeddings, take argmax.
   Confidence = softmax margin. Method 'ai'.
   On any error or timeout -> fall back to 'world' with confidence 0.3 and
   flag the cluster enrichment_degraded.

5. FALLBACK
   'world' with confidence 0.2. A wrong section on one story is far less
   damaging than an unrendered story.
```

Every decision is persisted in `cluster_sections` with its `method` and `confidence`, so the classification is auditable and can be re-run offline against a labelled sample. `clusters.primary_section_id` and `section_confidence` are denormalised caches of the highest-confidence row.

### 8.3 Weather is a special case

Weather is not a story section; it is a live-data panel on the edition front page and a landing page per edition. It should **not** be routed through the clusterer at all. The Weather section page renders the Open-Meteo forecast for the edition's country and its major cities, refreshed hourly and cached (see §11.4). Stories about weather *events* (a storm making landfall) are ordinary clusters and go to "World" or "Politics" depending on impact — do not conflate the two.

---

## 9. Cross-Country Flagging

A cluster appears in an edition if it is relevant to that edition's country. The rule is a **scored union of four signals**, with the outcome stored in `edition_clusters` (with `reason` and `confidence`).

| Signal | Weight | Notes |
|---|---|---|
| **A. Outlet country** | 0.9 | The cluster has a member from an outlet whose `sources.country_code` matches the edition's country. This is the dominant signal for domestic stories. A BBC story (UK) → the UK edition; a NYT story (US) → the US edition. |
| **B. Entity country** | 0.6 | A cluster's entity mentions include a person/organisation/place whose `entities.country_code` matches. "Modi" → the India edition even when the only outlet is Reuters. |
| **C. Gazetteer match** | 0.5 | The headline/excerpt contains a place name in the edition's country gazetteer ("Wall Street" → US; "Canberra" → AU; "Dublin" → IE). |
| **D. Story type** | 0.4 | A cluster flagged as a major world event (high `outlet_count` across ≥3 countries AND score above a threshold) is added to every edition with a "World" placement. This is the mechanism that puts a genuinely global story into all seven papers. |

**Threshold rule:** a cluster joins an edition if `max(signal scores for that edition) ≥ 0.5`, or if signal D applies. Signal A alone (0.9) qualifies. Signal B alone (0.6) qualifies. Signal C alone (0.5) qualifies at the boundary — a place-name mention is often incidental ("Paris climate talks" mentioned in a UK story), so **C requires corroboration**: the gazetteer match must be in the headline (not merely the excerpt) to count on its own.

**Why this matters for SEO:** a story appearing in four editions is **one URL** linked from four front pages, with four `hreflang`-linked editions. That is the correct signal — it says "this story matters in four countries" without creating four duplicate pages. The per-edition *listing* pages are distinct and legitimately unique (different stories in each), so there is no duplicate-content exposure.

**"World" section interaction.** The "World" section of an edition holds clusters whose primary subject is another country. A cluster's "subject country" is derived from signal B/C (whichever is strongest) and compared to the edition's own country. If they differ and the cluster scores ≥ 0.5 for the edition, it appears in that edition's "World" section; if they match, it appears in the country-appropriate section (Politics/Business/etc.) as well.

---

## 10. Image Pipeline

### 10.1 Flow

```
1.  Normaliser extracts the first usable <media:content> / <media:thumbnail> /
    <enclosure> / <image><url> from the feed item.
2.  Worker: INSERT INTO images (source_url, story_id, cluster_id, status='pending')
    -- no image bytes are touched in the Worker.
3.  Build container, scripts/images.mjs:
      SELECT * FROM images WHERE status = 'pending' ORDER BY id LIMIT 200
      for each:
        key = sha256(source_url)
        if R2 has 'media/{key}/hero.webp' -> skip the download entirely (already done)
        buf = await fetch(source_url, { signal: timeout(8000) })
        if !buf.ok -> UPDATE images SET status='failed', error=...
                      CONTINUE (never throw)
        hash = sha256(buf)
        if images.content_hash = hash -> skip resize, reuse existing keys
        sharp(buf).resize(1000, 563, {fit:'cover'})
              .webp({quality:72}).toBuffer()  -> R2.put('media/{hash}/hero.webp')
        sharp(buf).resize(400, 225,  {fit:'cover'})
              .webp({quality:70}).toBuffer()  -> R2.put('media/{hash}/thumb.webp')
        UPDATE images SET r2_key, r2_key_thumb, width, height, bytes, status='ready'
4.  Story HTML references https://<media-host>/media/{hash}/hero.webp
    with srcset for the thumb variant.
```

### 10.2 Where resizing runs, and why not in the Worker

**Resizing runs in the build container, at ingest time (first sight of a URL), not at page-build time.** Two reasons:

1. **CPU.** JPEG decode + resize is roughly 40–120 ms of CPU per image. The Workers Free budget is **10 ms per invocation** — a single image would exceed it, and the failure mode is error 1102 with the whole batch lost. The build container has no CPU cap.
2. **Never reprocess.** The image is keyed by `sha256(source_url)`, and `images.status='ready'` is checked before any download. A given publisher image is fetched and resized **exactly once, ever**. Re-running the build never re-processes anything. This is the direct answer to "how do you avoid re-processing images every build": the build is idempotent because the content-addressed key and the `status` column make the work a no-op on the second pass.

### 10.3 Why not Cloudflare Image Resizing

Cloudflare Images' free tier allows **5,000 unique transformations per month** ([Images Pricing](https://developers.cloudflare.com/images/pricing/)). At 120 stories/day × 30 days × 2 variants = **7,200 transformations/month** — over the limit, and it is also a *serve-time* dependency that would put an Images bill or a `9422` error in the reader path. Pre-resizing into R2 removes the dependency entirely and moves the cost to a one-time operation under the R2 free tier (10 GB-month, 1M Class A/month).

### 10.4 Serving

- **R2 via a custom subdomain** (`media.<domain>`), with `Cache-Control: public, max-age=31536000, immutable` — the key contains a content hash, so the URL is immutable and can be cached forever. R2 egress is free.
- Images are `<img loading="lazy" decoding="async" width height>` with an explicit `width`/`height` to guarantee **CLS = 0** (the project's CLS target is < 0.1; reserved aspect-ratio boxes make it 0).
- The hero image of the top story is `loading="eager"` with `fetchpriority="high"` and is the **LCP element** — it must be the first byte-weighted resource. Because it is served from a separate origin with an immutable cache header, repeat views hit the edge cache.
- **Credit is mandatory**: `alt` is generated as `"{headline}"` or `"{subject} — {publisher}"` and a visible credit line reads "Photo: {publisher}". This is both an ethical requirement and an E-E-A-T signal.

### 10.5 Storage trajectory (the one place R2 gets close to its limit)

| Object | Size each | Per year (44,000 stories) | Annual growth |
|---|---|---|---|
| Story HTML in R2 | ~30 KB | 13,650 → **1.32 GB** | 1.32 GB |
| OG images (1200×630 WebP) | ~35 KB | 44,000 → **1.54 GB** | 1.54 GB |
| Story images, 2 variants | ~70 + 25 KB | 44,000 → **4.18 GB** | 4.18 GB |
| Snapshots | ~1–6 MB | 120/mo → **~0.5 GB** rolling | ~0.1 GB |
| **Total** | | | **~7.1 GB/year** |

Against the **10 GB-month free storage**, this reaches the ceiling in **~14 months**. Mitigation, in order of preference:
1. **R2 lifecycle rule**: expire `media/` objects older than 12 months. Story pages survive without an image (the broadsheet layout has a typographic fallback), and the image URL is not a Google-indexed entity (no image sitemap).
2. **Store one image variant** (1000×563) rather than two → 3.1 GB/year → ~20 months to the ceiling.
3. **Regenerate OG images on demand** — *not* recommended: rasterising in the Worker exceeds the 10 ms CPU budget, so OG images must be pre-generated. Regenerate them only for clusters inside the 90-day prominence window, and fall back to a generic branded OG for older stories.
4. **Move to Workers Paid ($5/month)** at ~10 GB stored, which raises the storage ceiling and the request ceiling together.

---

## 11. The E-E-A-T Content Layer

### 11.1 Two content stores, deliberately

| Store | Technology | Contents | Lifecycle |
|---|---|---|---|
| **Editorial** | MDX files in `apps/web/src/content/` | Trust pages, author bios, original articles | Git; reviewed via PR; published on the next build |
| **Generated** | D1 `daily_digests` | Per-edition daily digests | Written by the finalize cycle; rendered by the build |

**Why editorial content is MDX and not D1:** it needs version history, review, and diffs (a corrections trail and an editorial-policy trail are themselves E-E-A-T signals); it costs zero D1 writes; it is static by nature; and it requires no admin surface, which matters for a zero-staff operation. The trade-off — publishing requires a build — is a non-issue given a 4×/day build cycle.

**Why digests are in D1:** they are machine-generated, machine-replaced, and high-volume; putting them in the repo would mean a commit per edition per day.

### 11.2 The trust layer (all repo-native MDX, all static)

| Page | URL | Purpose | Freshness signal |
|---|---|---|---|
| About | `/about` | What The Meridian is, who runs it, how it is funded | `lastReviewed` in frontmatter |
| Editorial Policy | `/editorial-policy` | How stories are selected, deduplicated, ranked and corrected | `lastReviewed` |
| Corrections | `/corrections` | Append-only log: date, story URL, what changed and why | Each entry dated; newest first |
| Sourcing & Methodology | `/methodology` | Exactly how the feed list is curated, how clustering works, what is and is not included, what is never copied | `lastReviewed` |
| Sources | `/sources` | Every outlet we aggregate, with a link and the date its feed was verified | Per-source `lastVerified` |
| Contact | `/contact` | A real monitored address (or a clearly-labelled form) | — |
| Privacy | `/privacy` | What is collected (newsletter address only), what is not (no reader accounts, no comments) | — |
| Authors | `/authors/{slug}` | Bios for the publisher's own writers; the editorial-desk author for digests | Person schema |

`lastReviewed` is rendered visibly on the page ("Last reviewed 12 September 2026") and in the page's `dateModified` — a dated, human-maintained signal that generic aggregator pages do not have.

### 11.3 Original articles, modelled separately

Original articles are the strongest originality signal available and must be **structurally separate** from aggregated clusters, not just labelled differently:

| Dimension | Aggregated cluster | Original article |
|---|---|---|
| Storage | D1 `clusters` + `stories` | MDX in `src/content/insight/` |
| URL | `/story/{slug}/` | `/insight/{slug}/` |
| Schema.org | `NewsArticle` | `Article` (or `OpinionNewsArticle` for signed commentary) |
| `author` | `Organization` — The Meridian (we are the curator, not the reporter) | `Person` — a named author with a link to `/authors/{slug}` |
| `datePublished` | earliest member's pubDate | The article's own date |
| `dateModified` | cluster `updated_at` | The revision date |
| Trending | participates in `trending_score` | **excluded** — original pieces are ranked by `editorial_rank` only |
| Clustering | participates | **excluded** — never merged into a cluster |
| Sitemap | `sitemap-stories-{year}.xml` | `sitemap-original.xml` (separate file) |
| News sitemap (48 h) | included | **excluded** — a stale original piece is not news; it goes in the evergreen sitemap |
| Front page | normal listing | a distinct "From The Meridian" slot, visually separated from the wire copy |

`isBasedOn` is used on original articles that draw on aggregated material (e.g. an analysis citing that morning's stories), so the provenance is explicit rather than implied.

**The distinction must be visible in the UI, not just in the markup.** A reader must be able to tell, at a glance, which text is ours and which is a curated pointer to someone else's reporting. This is also the practical defence against the "republishing content from other sites without adding any original content" spam policy — the site demonstrably produces original content, and the structure proves it.

### 11.4 The daily digest

Per edition, per day, one URL: **`/{edition}/{yyyy}/{mm}/{dd}/`** — the edition's date archive, whose lead element is that day's digest.

```
/uk/2026/10/20/
├── <h1>The Meridian — United Kingdom — Tuesday 20 October 2026</h1>
├── <article>  ← THE DIGEST: 300–400 words of ORIGINAL prose
│   ├── 3–5 paragraphs synthesising the day's stories
│   ├── NO headline reproduced verbatim — the prose paraphrases
│   ├── a "Today's most covered" list (3 items, with outlet counts)
│   └── a "Sources" list linking to the publishers
├── <ol> the day's full story list (headline, excerpt, outlets, section)
└── JSON-LD: Article { author: Organization "The Meridian Editorial Desk",
                       isBasedOn: [publisher URLs] }
```

**Generation rules (non-negotiable, because this is the originality defence):**
1. **300–400 words**, prose, not a list. A digest that is a bulleted list of headlines is republished content.
2. **No headline appears verbatim in the body.** Post-generation, assert that no cluster headline is a substring of the digest body; if it is, regenerate that sentence.
3. **At least 60% of sentences must not appear in any source headline or excerpt.** Enforced by a similarity check against the day's cluster texts.
4. **The source list is explicit** — the digest links to every publisher it drew on. This is honest attribution, and it is the opposite of hiding provenance.
5. **Model**: `@cf/meta/llama-3.2-3b-instruct` via Workers AI. Cost per edition: ~2,000 input + ~800 output tokens ≈ **33 neurons**; 7 editions ≈ 235 neurons/day = **2.4% of the 10,000/day free allocation.** A larger model would still fit (llama-3.1-8b ≈ 100 neurons/digest = 700/day), so the model choice is a quality decision, not a budget one.
6. **Failure mode**: if the AI call fails, fall back to a **template digest** that states the day's shape ("Twelve stories were published across politics, business and sport. The most covered was X, carried by five outlets.") plus the story list. The edition still publishes; the digest is flagged `status='degraded'` in `daily_digests` and the word "Automated summary" appears in the byline.

### 11.5 Schema.org coverage

| Page type | Schema types |
|---|---|
| Story page | `NewsArticle` (headline, datePublished, dateModified, author=Organization, image, isBasedOn, citation, publisher, mainEntityOfPage) + `BreadcrumbList` |
| Section / front page | `CollectionPage` + `ItemList` of the listed `NewsArticle`s + `BreadcrumbList` |
| Edition page | `WebSite` / `CollectionPage` + `Organization` (the publisher) |
| Topic / entity page | `CollectionPage` + `ItemList` + `DefinedTerm` (entity) / `Thing` (topic) |
| Digest / date archive | `Article` + `BreadcrumbList` |
| Original article | `Article` + `Person` (author) + `BreadcrumbList` |
| Author page | `ProfilePage` + `Person` |
| Trust page | `WebPage` + `Organization` |
| Whole site | `Organization` (The Meridian) + `WebSite` with `SearchAction` omitted (no site search in v1) |

**`author` vs `publisher` discipline.** On aggregated story pages, `author` = `Organization` (The Meridian) and `isBasedOn`/`citation` point to the publishers. Setting `author` to the original journalist on a page we do not host their words on would be a misrepresentation. This is a small detail that structured-data validators and quality reviewers both check.

---

## 12. URL Routing and Sitemap Partitioning

### 12.1 Routing table

| Pattern | Example | Rendering | Canonical | In sitemap |
|---|---|---|---|---|
| `/` | `/` | Edition picker / redirect to `/uk` | self | no (redirect) |
| `/{edition}/` | `/uk` | **Static** — edition front page | self | pages |
| `/{edition}/most-covered/` | `/uk/most-covered` | **Static** — trending ranking (last 7 days) | self | pages |
| `/{edition}/{section}/` | `/uk/politics` | **Static** — section landing | self | pages |
| `/{edition}/{yyyy}/{mm}/{dd}/` | `/uk/2026/10/20` | **Static** — edition date archive + digest | self | pages + news (if <48 h) |
| `/{edition}/digest/{yyyy}/{mm}/{dd}/` | — | *not used* — the digest is the archive page | — | — |
| `/story/{slug}/` | `/story/starmer-calls-snap-election-1g8` | **Dynamic** — R2 via Pages Function | self | stories (year file) + news (if <48 h) |
| `/topic/{slug}/` | `/topic/uk-election-2026` | **Static** — global topic page (all editions) | self | pages |
| `/entity/{slug}/` | `/entity/keir-starmer` | **Static** — global entity page | self | pages |
| `/topic/`, `/entity/` | — | **Static** — hub indexes (paginated, `?page=2` is noindex) | self | no |
| `/archive/{yyyy}/{mm}/{dd}/` | `/archive/2026/10/20` | **Static** — global day index, grouped by edition | self | pages |
| `/insight/{slug}/` | `/insight/why-the-house-rules-changed` | **Static** — original article (MDX) | self | original |
| `/authors/{slug}/` | `/authors/j-r-vance` | **Static** — author bio | self | pages |
| `/about`, `/editorial-policy`, `/corrections`, `/contact`, `/methodology`, `/sources`, `/privacy` | — | **Static** — trust layer | self | pages |
| `/rss/{edition}.xml` | `/rss/uk.xml` | **Static** — per-edition RSS | self | no (linked via `<link rel=alternate>`) |
| `/rss/{edition}-{section}.xml` | `/rss/uk-politics.xml` | **Static** | self | no |
| `/sitemap.xml` | — | **Static** — sitemap index | — | — |
| `/sitemap-news.xml` | — | **Static** — last 48 h only | — | — |
| `/sitemap-pages-{edition}.xml` | — | **Static** | — | — |
| `/sitemap-stories-{year}.xml` | — | **Static** | — | — |
| `/sitemap-original.xml` | — | **Static** | — | — |
| `/robots.txt` | — | **Static** | — | — |
| `/api/*` | `/api/health` | **Dynamic** — JSON | no (`noindex`) | no |

**Unambiguity rules** (why these patterns cannot collide):
- Section slugs come from a closed set of 8 words; none is 4 digits, so `/{edition}/{yyyy}/…` cannot be confused with `/{edition}/{section}/`.
- The year segment is exactly 4 digits, the month and day exactly 2. A regex router (`/^\/([a-z-]{2,6})\/(\d{4})\/(\d{2})\/(\d{2})\/?$/`) disambiguates at the edge.
- Topic and entity pages have their own first segments, so they can never be mistaken for an edition.
- Edition slugs are a closed set of 8 (`uk, us, au, ca, ie, nz, in, in-hi`); the router validates against `editions` and 404s an unknown edition rather than guessing.

**Permalink permanence rules:**
- `clusters.slug` is assigned once, at creation, and never regenerated.
- The canonical URL is `https://{domain}/story/{slug}/` — fixed for the life of the site.
- A story that later gains a better headline keeps its slug; only the displayed headline changes. The URL is derived from the *first* headline plus an id, so it does not drift.
- The story URL is **edition-agnostic**. A story in five editions has one URL, linked from five front pages. This is what prevents five duplicate pages per story.
- **Never reuse a slug.** `clusters.slug` has a `UNIQUE` constraint and slugs embed the cluster id, so reuse is impossible even after a manual deletion (which does not happen).

### 12.2 Sitemap partitioning

```
/sitemap.xml                                  ← sitemap index
├── /sitemap-news.xml                         ← NEWS: only clusters with published_at
│                                                within the last 48 h, across all editions,
│                                                ≤ 1,000 URLs (Google's news limit).
│                                                Regenerated every build cycle.
│                                                Namespaced: xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
│                                                Each <news:news> carries <news:publication>, <news:publication_date>,
│                                                <news:title>, and <news:news:keywords> (the topic tags).
├── /sitemap-pages-{edition}.xml   × 8         ← per-edition: front page, sections, most-covered,
│                                                date archives, trust pages, authors.
├── /sitemap-stories-{year}.xml    × 1/yr      ← the evergreen story URLs for a year.
│                                                ~27,000 URLs/year — well under the 50,000 limit.
│                                                Partition by year so each file stays small; if a year
│                                                exceeds 40,000 URLs, shard by half-year.
├── /sitemap-topics.xml                       ← topic + entity pages, one file (thin-page gate applied)
└── /sitemap-original.xml                    ← original articles (separate, so they can be judged on their own)
```

**Rules:**
- **News sitemap = 48-hour window only.** Google requires that news sitemap entries be less than two days old; older entries cause the file to be ignored. This is why the news sitemap must be regenerated on every build rather than being a static artefact.
- **News sitemap ≤ 1,000 URLs.** At ~75 clusters/day we will hold ~150 URLs in the window. If the corpus grows past ~1,300 clusters/day, shard into `sitemap-news-{yyyy-mm-dd}.xml` and list them all in the index.
- **One canonical story URL per story**, in the yearly story sitemap, and the same URL in the news sitemap while it is fresh. Never list a story in a per-edition sitemap — that would create the duplicate-URL impression.
- **No `noindex`, no redirects, no 4xx URLs** in any sitemap (Google's explicit guidance).
- **Sitemaps are generated at build time** into `dist/`, so they always match the deployed content exactly.
- **`robots.txt`** must reference the sitemap index, allow `/story/`, `/topic/`, `/entity/`, `/api/` (which is `noindex` at the HTML level anyway), and disallow `/search`, `/?` query variants, and any pagination beyond page 1 of the hubs. There is no site search in v1, so `/search` returns 404 and is disallowed.

### 12.3 hreflang across the 7 editions

```
Edition pages declare:
  <link rel="alternate" hreflang="en-GB" href="https://{d}/uk">
  <link rel="alternate" hreflang="en-US" href="https://{d}/us">
  <link rel="alternate" hreflang="en-AU" href="https://{d}/au">
  <link rel="alternate" hreflang="en-CA" href="https://{d}/ca">
  <link rel="alternate" hreflang="en-IE" href="https://{d}/ie">
  <link rel="alternate" hreflang="en-NZ" href="https://{d}/nz">
  <link rel="alternate" hreflang="en-IN" href="https://{d}/in">
  <link rel="alternate" hreflang="hi-IN" href="https://{d}/in-hi">
  <link rel="alternate" hreflang="x-default" href="https://{d}/uk">
```

Every edition page is `self-canonical` and lists all eight alternates plus `x-default`. **Story, topic and entity pages are single-language and carry no hreflang** — they have one URL and are canonical to themselves. Section pages are single-language too (the section index for a given language is the edition's section page), so they carry only `self` and `x-default` pointing at the edition.

**A note on region-only hreflang.** Seven editions in one language is region targeting, not translation. Google treats region-only alternates as a weak signal and will usually consolidate them to the single best variant. That is acceptable and even desirable here: the *content* differs per edition (different stories), so these are genuinely different pages, not alternates of one page. Treat hreflang as a correctness requirement (never point at a mismatched variant) rather than as a ranking lever. The Hindi edition is the only true language alternate, and it is the one that will actually benefit.

---

## 13. Static Build Architecture

### 13.1 The page-count arithmetic that drives the design

| Tier | Year 1 | Year 2 | Year 3 | Where it lives |
|---|---|---|---|---|
| Story pages | 27,400 | 54,800 | 82,200 | **R2** (served by a Function) |
| Edition front pages | 8 | 8 | 8 | Pages |
| Section pages | 56 | 56 | 56 | Pages |
| Most-covered pages | 8 | 8 | 8 | Pages |
| Edition date archives | 2,555 | 5,110 | 7,665 | Pages |
| Global date archives | 365 | 730 | 1,095 | Pages |
| Topic pages (≥5 stories) | ~1,400 | ~2,400 | ~3,200 | Pages |
| Entity pages (≥5 stories) | ~2,200 | ~3,800 | ~5,200 | Pages |
| Trust + author + original | ~60 | ~180 | ~360 | Pages |
| Sitemaps, RSS, robots, assets | ~70 | ~70 | ~70 | Pages |
| **Pages file total** | **~6,700** | **~12,200** | **~17,700** | **limit 20,000** |
| **R2 object total** | ~90,000 | ~180,000 | ~270,000 | 10 GB storage ceiling |

**If story pages had stayed in Pages:** year 1 would be 34,000 files — already 70% over the 20,000 limit at month 12, and 4× over by year 3. **The Pages file limit is the single reason the tier split exists.** It also means the static tier must be kept under ~15,000 files by design, which is why topic and entity pages carry a **≥5-story thin-page gate** — a quality control that happens to be a capacity control.

### 13.2 Incremental build

Astro has no first-class incremental build for `output: 'static'`. The incremental behaviour is produced by controlling what `getStaticPaths()` returns.

```js
// apps/web/src/pages/story/[slug].astro
export async function getStaticPaths() {
  const content = await loadSnapshot();          // .cache/content.json
  const rendered = await loadRenderManifest();     // R2 renders/{version}.json
  return content.clusters
    .filter(c => c.updated_at > rendered.lastRenderedAt)   // ONLY changed clusters
    .map(c => ({ params: { slug: c.slug }, props: { cluster: c } }));
}
```

- The **render manifest** (`R2 renders/{version}.json`) records the timestamp of the last successful render. It is written by `publish.mjs` *after* the R2 uploads succeed, so a failed build never advances the watermark and the next build re-renders the same set.
- A cluster is re-rendered when (a) it is new, (b) a new outlet joined it, (c) its section changed, (d) its excerpt was improved, or (e) its OG image was regenerated. All of these bump `clusters.updated_at`.
- **The static tier is always fully rebuilt.** Editions, sections, topics, entities and archives are small (6,700 pages in year 1) and cheap to rebuild, and their correctness depends on the whole 90-day dataset. Rebuilding them fully removes a whole class of "stale index" bugs.
- **Result:** a typical build renders ~6,700 static pages + ~250–400 changed story pages ≈ 7,100 pages. At 35–127 pages/sec (measured range reported for Astro on typical build containers), that is **55–200 seconds**, plus ~30 s of image processing and ~40 s of OG rasterisation → **~2–4 minutes against a 20-minute timeout (80% headroom).**

### 13.3 Build caching

| What | Mechanism | Effect |
|---|---|---|
| `node_modules`, package manager store | Pages build cache (V2+ build image; the v1 image is being retired in 2026, so confirm the project is on v3) | Removes ~40 s of install from every build; 10 GB per project |
| `node_modules/.astro` | Pages build cache — Astro's content-collection cache | Speeds up content collection revalidation |
| `dist/` | **Not cached** — Pages replaces the deployment wholesale | — |
| Snapshot fetch | Cloudflare CDN cache on the R2 public bucket / API response | ~1 MB gzipped, edge-cached |
| Story HTML | R2 + CDN | Pre-rendered, never rebuilt unnecessarily |

**Enable the Pages build cache** (Settings → Build → Build cache). Note its retention rule: artifacts are purged 7 days after their last read, so a build cache that is not read for a week is discarded. With 4 builds/day, the cache is read continuously and stays warm.

### 13.4 Build trigger

**Scheduled, not on-write.** A deploy hook (POST) is fired by the pipeline's finalize cycle after the snapshot is written.

```
Cron "5 4,10,16,22 * * *"   →  finalize cycle  →  POST <deploy-hook>  →  Pages build
```

- **Why not on-write:** a D1 write does not trigger a Pages build. Pages builds on git pushes and on deploy-hook POSTs. The deploy hook is the only mechanism that ties the build to the data.
- **Why 4×/day:** 4 builds/day = 120/month against the **500 builds/month** free limit (24% used). Each build keeps the front page and the "Most Covered" ranking at most 6 hours stale. Two builds/day would also fit (60/month) but leaves 12-hour staleness on the paper's most visible page.
- **The deploy hook URL is a secret.** Store it as a Worker secret (`wrangler secret put PAGES_DEPLOY_HOOK`) and never in the repo or in the client bundle. The docs are explicit that the hook URL is unauthenticated — anyone with it can trigger builds, so it must be treated as a credential.
- **Fallback trigger:** a second cron in the pipeline checks "has a build completed in the last 8 hours?" against the render manifest. If not, it re-fires the hook. This covers a dropped webhook.
- **Deploy hook → git push → two deployments:** do **not** also push to the production branch on every data change. The deploy hook builds the configured branch; the git integration should be limited to code changes, so a content cycle and a code release never race.

### 13.5 What happens when the build fails

Pages keeps the **previous deployment live** when a build fails. Since story pages are served from R2 (not from Pages), they remain available and correct even if the static tier is stale. The pipeline records `pipeline_runs(status='error')`, retries once after 10 minutes, and alerts if it fails twice. The stale edition is explicitly labelled with its "as of" timestamp in the site footer, so a stale edition is honest rather than misleading.

---

## 14. Failure-Mode Handling

| # | Component | Failure | Detection | Response | Blast radius |
|---|---|---|---|---|---|
| 1 | Fetcher | Feed returns 404/410 | HTTP status | Record in `sources.last_status`; increment `consecutive_failures`; **do not disable on the first failure**. After 5 consecutive failures spanning ≥24 h → `disabled_until = now + 24h`, alert, and surface the outage on the internal status page. The source row is never deleted. | one outlet |
| 2 | Fetcher | Publisher returns 429 | HTTP status | Honour `Retry-After`; set `disabled_until` to that time; do not retry sooner. Never retry in a tight loop — this is the fastest way to get an IP blocked. | one outlet |
| 3 | Fetcher | Network error / timeout | `fetch` throws | One retry with 1–3 s jitter, then record the failure and continue to the next feed. | one feed |
| 4 | Parser | Malformed XML, or 200 with 0 items | Parse error / zero items | **Treat zero items from a 200 as a failure, not as "no news."** Log the error, mark the source's last_status, keep the previous content, continue. A feed that legitimately has no items is vanishingly rare for a news feed. | one feed |
| 5 | Parser | One malformed item among 30 | Per-item parse error | Skip that item, count it in `pipeline_runs`, keep the other 29. Never let one bad `<item>` fail a feed. | one item |
| 6 | Parser | A 10 MB feed | Byte length > 512 KB | Refuse the feed, log, alert. A news RSS feed is 10–100 KB; 10 MB means something is wrong (an HTML error page). | one feed |
| 7 | Dedup | LSH returns 0 candidates | Query result | Create a new cluster. The fallback path is normal operation, not an error. | none |
| 8 | Dedup | Merge ambiguity (two gates disagree) | Gate evaluation | Do not merge. Create a separate cluster. **Under-merging is far less harmful than over-merging**: a duplicate entry is a minor quality issue, a wrongly-merged cluster destroys the product's core promise. | one item |
| 9 | Enrich | Workers AI times out / errors | HTTP error | Fall back to rules-only for that item; set confidence 0.3 and method 'rules'. Continue. | one item |
| 10 | Enrich | Workers AI daily quota exhausted | HTTP 429 from the AI API | Set a flag; skip all AI enrichment for the rest of the cycle; digests fall back to the template digest; flag `status='degraded'`. The edition still publishes. | one cycle |
| 11 | Enrich | Entity resolution collision | Two entities with the same normalised name | Prefer the entity with the higher `mention_count`; log the collision for review. | one entity |
| 12 | Storage | D1 write fails | Exception / `overloaded` | Retry up to 3× with exponential backoff. D1's "overloaded" is transient (single-threaded queueing). Use a single `db.batch()` per cluster so a cluster's rows are written together — never leave a cluster with a `stories` row but no `story_sources` row. If the batch still fails, abort the cycle and **retain the in-memory batch for the next cycle** rather than dropping it. | one batch |
| 13 | Storage | D1 query exceeds 30 s or row limits | Error | Chunk the query (500 rows/page). The snapshot writer pages at 500. | one query |
| 14 | Storage | D1 write budget exceeded (100k rows/day) | API error | Cannot happen at 4–5% utilisation; if it does, the cause is per-poll logging. The defence is `feed_fetches` written **on change only** and `sources.last_fetched_at` updated **at most hourly**. | — |
| 15 | Image | Publisher image returns 403/404 | HTTP status | `images.status='failed'`, `error` recorded. The story renders with a typographic fallback block. **Never retry more than twice**; hotlink-protected images are a normal condition, not an exception. | one image |
| 16 | Image | `sharp` throws on a malformed file | Exception | `status='failed'`, continue with the next image. | one image |
| 17 | Image | R2 put fails | Exception | Retry once; then `status='pending'` again so the next build retries. The story still renders (no image). | one image |
| 18 | Build | `astro build` exits non-zero | Exit code | Pages keeps the previous deployment live. The pipeline retries once after 10 min, then alerts. Story pages continue to serve from R2. | one refresh |
| 19 | Build | Snapshot fetch fails | HTTP error | The build uses the previous cached snapshot if present; otherwise it fails the build and the previous deployment stays live. | one refresh |
| 20 | Build | R2 upload of a story page fails | Exception | `publish.mjs` aborts **before** updating the render manifest. The next build re-renders the same stories. Partially uploaded story pages are harmless — the R2 object is overwritten on the next attempt. | one story page |
| 21 | Build | Deploy hook POST fails | HTTP error | Retry with backoff; the fallback cron re-fires within 8 h. | one refresh |
| 22 | CDN | A story page is requested before its first render | R2 404 | The Function returns the edition's front page with a 404 status, or a proper 404 page. In practice this cannot happen: a story is rendered in the same cycle it is created. | one URL |
| 23 | Newsletter | Brevo API fails | HTTP error | Retry once; if the daily send fails, send a single "today's edition" link to the whole list rather than per-edition sends, and alert. | one newsletter |
| 24 | Newsletter | Subscriber count exceeds 300/day | Pre-flight check | Cap the send, prioritise by subscription date, and record the overflow. **This is a hard free-tier ceiling, not a bug** — it needs a product decision (a paid Brevo tier, or a weekly digest for the overflow) before it becomes one. | one newsletter |
| 25 | Weather | Open-Meteo errors / rate limit | HTTP error | Serve the last cached forecast with an "as of HH:MM" timestamp, or omit the panel. Weather is a convenience; it must never fail a build. | one panel |
| 26 | Whole system | **One bad feed kills the edition** | — | **Structurally impossible.** The ingest loop is per-feed with try/catch; failures are recorded per source; the edition is assembled from whatever succeeded. A minimum-viable gate (≥30 clusters) is enforced: below it, the previous edition stays live rather than publishing a near-empty paper. | — |

**Design rule for all of the above:** every component's failure is *local*. The pipeline is a sequence of independent, individually-fenced operations, and the only cross-component failure that can stop an edition is one that fails the *minimum-viable gate*.

---

## 15. Build Order and Dependency Graph

```
                          ┌──────────────────────────────┐
                          │ P1  Repo scaffold + contract │
                          │ shared/types, sections,      │
                          │ taxonomy, templates, DDL     │
                          └──────────────┬───────────────┘
                                         │
        ┌────────────────────────────────┼───────────────────────────────┐
        │                                │                               │
        ▼                                ▼                               ▼
┌───────────────────┐        ┌────────────────────┐          ┌────────────────────┐
│ P2  D1 schema +   │        │ P3  Design system  │          │ P4  Astro shell +  │
│ migrations + seed │        │ + broadsheet UI    │          │ routing + layout   │
│ (editions,        │        │ (Tailwind v4,      │          │ (static tier only, │
│  sections,        │        │  fonts, light/dark)│          │  empty collections)│
│  sources)         │        └─────────┬──────────┘          └─────────┬──────────┘
└─────────┬─────────┘                  │                              │
          │                            │                              │
          ▼                            │                              │
┌───────────────────────┐              │                              │
│ P5  Fetcher + Parser  │              │                              │
│ (Worker cron, 304-   │              │                              │
 │  aware, sharded)     │              │                              │
 └─────────┬─────────────┘              │                              │
           │                           │                              │
           ▼                           │                              │
┌───────────────────────┐              │                              │
│ P6  Fingerprint +     │              │                              │
│ Clusterer (SimHash + │              │                              │
 │  LSH + merge gates)  │              │                              │
 └─────────┬─────────────┘              │                              │
           │                           │                              │
           ▼                           │                              │
┌───────────────────────┐              │                              │
│ P7  Enrichment        │              │                              │
│ (section rules, topics│              │                              │
 │  entities, countries)│              │                              │
 └─────────┬─────────────┘              │                              │
           │                           │                              │
     ┌─────┴──────┐                    │                              │
     ▼            ▼                    │                              │
┌──────────┐ ┌────────────┐            │                              │
│ P8 Trending│ │ P9 Digest  │            │                              │
│  score +  │ │ generation │            │                              │
│  ranking  │ │ (WorkersAI)│            │                              │
└─────┬─────┘ └─────┬──────┘            │                              │
      │             │                   │                              │
      └──────┬──────┘                   │                              │
             │                          │                              │
             ▼                          │                              │
┌───────────────────────┐              │                              │
│ P10 Snapshot writer   │              │                              │
│ (D1 -> gzipped JSON   │              │                              │
│  -> R2) + finalize    │              │                              │
│  cron -> deploy hook  │              │                              │
└─────────┬─────────────┘              │                              │
          │                            │                              │
          ▼                            ▼                              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ P11  Static tier: editions, sections, front pages, most-covered,         │
│      date archives, topic pages, entity pages  (dep: P3, P4, P10)         │
└─────────┬─────────────────────────────────────────────────┬───────────────┘
          │                                                   │
          ▼                                                   ▼
┌───────────────────────┐                        ┌───────────────────────┐
│ P12  Story page       │                        │ P13  Trust layer +    │
│ renderer (Astro ->    │                        │ original articles +  │
│  R2, incremental)     │                        │ author bios (MDX)    │
└─────────┬─────────────┘                        └─────────┬─────────────┘
          │                                                   │
          ▼                                                   ▼
┌───────────────────────┐                        ┌───────────────────────┐
│ P14  Pages Function   │                        │ P15  Sitemaps + RSS + │
│ /story/* from R2 +    │                        │ robots + hreflang +  │
│ /api/* + _routes.json │                        │ news sitemap (48 h)   │
└─────────┬─────────────┘                        └─────────┬─────────────┘
          │                                                   │
          └───────────────────────┬───────────────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │ P16  Newsletter (Brevo)      │
                    │ P17  Weather (Open-Meteo)    │
                    │ P18  Analytics + Search      │
                    │      Console enrolment       │
                    │ P19  Google News / Publisher │
                    │      Center enrolment        │
                    └─────────────────────────────┘
```

### 15.1 Dependency reasoning

| Phase | Depends on | Why it cannot start earlier |
|---|---|---|
| P1 | — | Everything imports `shared/`. Doing it first prevents the contract from drifting between tiers. |
| P2 | P1 | Migrations reference the shared types. |
| P3 | P1 | The design system consumes the shared token set. |
| P4 | P1, P3 | Astro needs the layout components. |
| P5 | P1, P2 | The fetcher reads `sources`; it can be built against a seeded table before the clusterer exists. |
| P6 | P5 | The clusterer consumes parsed items and the `stories`/`clusters` schema. |
| P7 | P6 | Enrichment needs a cluster to enrich. The gazetteer entity lookup can be built in parallel with P6, but the topic/country assignment needs the cluster id. |
| P8 | P7 | The score reads `story_sources` populated by the clusterer, and the section from P7 for the depth term. |
| P9 | P8 | The digest summarises the day's ranked clusters — it needs the score to pick the top items. |
| P10 | P9 | The snapshot must contain the digests. |
| P11 | P3, P4, P10 | The static tier renders from the snapshot. |
| P12 | P6, P11 | The story renderer reuses the static tier's layout; it must be built after the layout is proven. |
| P13 | P4 | Trust pages are Astro pages with MDX; they need the routing and the layout. **Fully parallel with P11–P12.** |
| P14 | P12 | The Function serves what P12 renders. |
| P15 | P11 | Sitemaps are generated from the same dataset the static tier renders. |
| P16–P19 | P11 | Newsletter, weather, analytics and enrolment all consume the published URLs. |

### 15.2 Parallelisable tracks

- **Track A (pipeline):** P5 → P6 → P7 → P8 → P9 → P10. Strictly sequential; this is the critical path.
- **Track B (presentation):** P3 → P4 → P11 → P12 → P14. Starts at P3, which is independent of the entire pipeline. **This is the track to staff in parallel** — the design work and the Astro shell do not depend on the ingest logic, and they are the longest pole in terms of iteration.
- **Track C (editorial/trust):** P13 and P15. Independent of A and B once P4 exists.
- **Track D (growth plumbing):** P16–P19. Independent once P11 exists.
- **Track E (data/lexicon curation):** the source registry, the section lexicons, the country gazetteer and the entity gazetteer are **content work, not code work**. They can start in week 1 and continue indefinitely. The AI fallback exists precisely because these lexicons will never be complete. **Do not let this track become a blocker for the pipeline** — start with a 30-outlet, 8-section, 7-country lexicon and grow it.

**The critical path is Track A.** If there is a schedule risk, it is in the clusterer's correctness (P6), not in the UI. Budget the most iteration time there: the merge gates need to be calibrated against a labelled sample of real headlines, and that calibration cannot be done until real feeds are flowing.

---

## 16. Free-Tier Resource Budget

All limits verified against official Cloudflare documentation on 2026-10-20. Steady state: 120 raw mentions/day, ~75 published clusters/day, 40 feeds, 4 builds/day, 1,000 daily visitors.

### 16.1 Workers (Free — 100,000 requests/day, 10 ms CPU/invocation, 50 external subrequests, 1,000 internal service ops, 6 concurrent connections)

| Consumption | Per day | Limit | Headroom |
|---|---|---|---|
| Ingest cron invocations (`*/10`) | 144 | — | — |
| Finalize cron + deploy-hook POSTs | 8 | — | — |
| Build snapshot fetches (4 builds × 1) | 4 | — | — |
| Build image/OG processing (build container, not a Worker) | 0 | — | — |
| **Story page views** (Function → R2) | ~4,000 | — | — |
| **Googlebot story crawls** | ~6,000 | — | — |
| RSS readers, OG fetches, sitemap fetches | ~3,000 | — | — |
| **Total Worker requests/day** | **~13,200** | 100,000 | **87% free** |
| **Worker CPU per ingest invocation** | ~2–4 ms | 10 ms | **60–80% free** |
| **Worker CPU per finalize invocation** | ~4–7 ms (mostly network waits) | 10 ms | **30–60% free** |
| External subrequests per ingest invocation | 40 (one per feed) | 50 | **20% free** ⚠ |
| Internal service ops per ingest invocation | ~60 (D1 reads/writes) | 1,000 | **94% free** |

⚠ **The 50-subrequest external limit is the tightest Worker constraint.** At 40 feeds it is 80% consumed. Three mitigations, in order of preference:
1. **Shard by feed.** Use `hash(source_id) % 4` to split feeds across four sub-shards inside each cron invocation, so each invocation touches only 10 feeds → 10 subrequests. The cost is that each feed is fetched once per cron cycle regardless (the fetch is the subrequest), so this does not help — **the number of feeds per cycle is what matters.**
2. **Reduce the fetch frequency.** A `*/20` cron (72 invocations/day) halves both the subrequests per invocation risk and the publisher-facing request rate, at the cost of up to 20 minutes of feed latency. **Recommended: fetch each feed every 20 minutes** (72 cycles/day × 40 feeds = 2,880 conditional GETs/day, ~72 per publisher/day — comfortably polite). Within any single invocation, still 40 subrequests.
3. **Run two cron triggers at different minutes** (e.g. `0,20,40 * * * *` and `10,30,50 * * * *`), each handling half the catalogue by `hash(source_id) % 2`. This gives 20 feeds per invocation — **half the subrequest limit — while keeping a 10-minute effective per-feed cadence.** **This is the recommended configuration.** Two cron triggers of the 5-per-account allowance are used.

### 16.2 D1 (Free — 5,000,000 rows read/day, 100,000 rows written/day, 500 MB/database, 10 databases, 5 GB/account, 50 queries/invocation, 30 s max query duration)

**Writes/day (physical rows, including index amplification):**

| Table | Logical rows | Physical (×indexes) | Note |
|---|---|---|---|
| `clusters` | ~75 new + ~120 updates | ~315 | 3 indexes on the hot columns |
| `stories` | 120 | ~720 | 5 indexes → 6 rows written per insert |
| `story_sources` | 120 | ~240 | WITHOUT ROWID + 1 index |
| `cluster_sections` | ~100 | ~100 | WITHOUT ROWID |
| `edition_clusters` | ~90 | ~90 | WITHOUT ROWID |
| `story_topics` | ~300 | ~300 | WITHOUT ROWID |
| `story_entities` | ~300 | ~300 | WITHOUT ROWID |
| `topics` | ~10 new + ~20 updates | ~50 | |
| `entities` | ~25 new + ~25 updates | ~75 | |
| `images` | ~120 inserts + ~120 updates | ~480 | 2 indexes |
| `daily_digests` | 7 × 4 = 28 upserts | ~84 | |
| `sources` status updates | **throttled to ≤1/hour** | ~160 | **not 5,760** |
| `feed_fetches` | **on change only** | ~120 | **not 5,760** |
| `pipeline_runs` | ~76 | ~152 | |
| **Total** | | **~3,285** | **3.3% of 100,000** |

⚠ **Without the two throttles (`sources` status and `feed_fetches`), writes would be ~11,500/day — 11.5% of the budget for zero value.** The throttles are the difference between a comfortable 3% and a wasteful 12%.

**Reads/day:**

| Consumer | Rows read | Note |
|---|---|---|
| Ingest: source list per invocation | 5,760 | 40 rows × 144 invocations; one indexed scan |
| Ingest: LSH candidate lookups | ~4,800 | 120 items × 4 band queries × ~10 rows |
| Ingest: recent-story guard queries | ~2,400 | |
| Finalize: 24 h of clusters + rescore window | ~4,000 | 4 cycles × 1,000 |
| Snapshot writer: 90 days of clusters + taxonomy | ~30,000 | 4 cycles × 7,500, paged at 500 |
| **Total** | **~47,000** | **0.9% of 5,000,000** |

**Storage:** ~70 MB/year against 500 MB per database → **~7 years** before the database limit binds. Well inside the 5 GB account limit. **Do not persist embeddings** (they would triple the story table).

### 16.3 Cloudflare Pages (Free — 20,000 files, 500 builds/month, 20-minute build timeout, 100 projects)

| Consumption | Year 1 | Limit | Headroom |
|---|---|---|---|
| Files in `dist/` | ~6,700 | 20,000 | **67% free** |
| Files, year 3 | ~17,700 | 20,000 | **12% free** ⚠ |
| Builds/month (4/day) | 120 | 500 | **76% free** |
| Build duration | ~2–4 min | 20 min | **80% free** |
| Projects | 1 | 100 | 99% free |
| Custom domains | 1 (+1 for R2 media) | 100 | 99% free |

⚠ **The year-3 file position needs a decision before month 24.** Options, in order of preference: (a) drop the per-edition date archives for editions older than 90 days and keep only the global archive — saves ~2,000 files/year; (b) move entity pages to the same R2 tier as story pages; (c) tighten the entity thin-page gate from 5 to 8 stories. **This is not a month-6 problem and should not consume launch-phase attention**, but it must be on the roadmap.

### 16.4 R2 (Free — 10 GB-month storage, 1,000,000 Class A/month, 10,000,000 Class B/month, free egress)

| Consumption | Per month | Limit | Headroom |
|---|---|---|---|
| Class A (writes): story HTML | ~2,300 | 1,000,000 | 99.8% free |
| Class A: OG images | ~3,700 | | |
| Class A: story images (2 variants) | ~7,200 | | |
| Class A: snapshots | ~120 | | |
| **Class A total** | **~13,300** | 1,000,000 | **98.7% free** |
| Class B (reads): story page views | ~120,000 | 10,000,000 | 98.8% free |
| Class B: image reads (edge-cached) | ~200,000 | | |
| Class B: snapshot reads | ~120 | | |
| **Class B total** | **~320,000** | 10,000,000 | **96.8% free** |
| Storage | growing ~0.6 GB/month | 10 GB | **~14 months to the ceiling** ⚠ |

⚠ **Storage is the only R2 constraint that binds.** Add an R2 lifecycle rule to expire `media/` objects after 12 months, or store a single image variant. Tracked in §10.5.

### 16.5 Workers AI (Free — 10,000 neurons/day)

| Consumption | Neurons/day | Limit | Headroom |
|---|---|---|---|
| Digests (7 editions × llama-3.2-3b) | ~235 | 10,000 | 97.6% free |
| Entity extraction (120 clusters × llama-3.2-3b) | ~530 | | |
| Section tie-break (bge-reranker-base) | ~2 | | |
| Embeddings for cluster assist (bge-small) | ~13 | | |
| **Total** | **~780** | 10,000 | **92% free** |

**Workers AI is effectively free at this volume.** Even a much larger model for digests (llama-3.1-8b, ~100 neurons/digest) stays under 1,000 neurons/day. The constraints are latency and determinism, not budget.

### 16.6 KV (Free — 100,000 reads/day, 1,000 writes/day to different keys, 1 write/sec to the same key, 1 GB storage)

**Recommendation: use KV minimally or not at all.** The write ceiling of 1,000/day is the trap — writing per-story or per-build-item exhausts it. Planned use:

| Key | Writes/day | Reads/day |
|---|---|---|
| `weather:{edition}` (forecast cache, 30-min TTL) | ~336 (7 editions × 4 changes/hour × 12 h) | ~500 |
| `build:lock` (in-progress guard) | ~8 | ~20 |
| `build:last-success` | ~4 | ~20 |
| **Total** | **~350** | **~540** |

**35% of the write budget, 0.5% of the read budget.** Everything else lives in D1 or R2.

### 16.7 External services

| Service | Free tier | Consumption/day | Headroom |
|---|---|---|---|
| **Open-Meteo** | <10,000 calls/day, 5,000/hour, 600/min; **non-commercial use only** | 7–14 calls/day (multi-coordinate, one per edition + city list) | 99.9% free ⚠ terms |
| **Brevo** | **300 emails/day**, 100,000 contacts | 1 send per subscriber per day | **caps at ~300 subscribers** ⚠ |
| **Cloudflare Web Analytics** | Free; no site limit for proxied sites; 0 custom rules on Free | 1 script + N events | unlimited |
| **Google Search Console** | Free | — | unlimited |

⚠ **Open-Meteo's free tier is non-commercial only.** The Meridian is non-commercial in v1 (monetisation is deferred), so this is compliant. **Re-evaluate before any monetisation lands** — a paid Open-Meteo tier, or self-hosting, becomes a v2 cost line.
⚠ **Brevo's 300 emails/day is a hard ceiling on the newsletter.** One subscriber receives one edition's digest — never seven. At 300/day the newsletter supports 300 daily subscribers. Beyond that: a paid Brevo tier, a weekly digest for the overflow, or an email-on-demand model (send only when a subscriber's edition has ≥N stories). **This should be a documented roadmap item, not a surprise in month 4.**

### 16.8 The honest summary of where the free tier breaks

| Constraint | Ceiling | Notes |
|---|---|---|
| Workers requests/day | **~5,000–7,000 daily visitors** | The binding constraint on growth. Story-page views are the driver. Mitigations: aggressive CDN caching on `/story/*` (immutable-ish, `stale-while-revalidate`), and moving to Workers Paid ($5/month) at the threshold. |
| Brevo emails/day | **~300 daily subscribers** | A product limit, not a technical one. |
| Pages files | **~month 24** at the current page-mix | Addressable by tightening the entity gate or moving entity pages to R2. |
| R2 storage | **~month 14** | Addressable with a lifecycle rule. |
| D1 database | **~year 7** | Not a concern. |
| Workers AI | **~12× headroom** | Not a concern. |
| D1 writes | **~30× headroom** | Not a concern (with the throttles). |
| D1 reads | **~100× headroom** | Not a concern. |

**The 1,000-daily-visitor target has ~85% headroom on the binding constraint.** The architecture comfortably delivers the six-month goal. The first hard wall is traffic scale, and it is reached at roughly 5–7× the target — which is a v2 decision (Workers Paid at $5/month, plus a paid Brevo tier at $9/month) rather than an architectural failure.

---

## 17. Anti-Patterns to Avoid

### 17.1 "The Worker does everything"

**What people do:** one cron trigger fetches all 40 feeds, parses them, deduplicates, enriches, scores, generates digests, writes D1 and triggers the build — in one invocation.
**Why it's wrong:** the 10 ms CPU limit makes this a coin flip. The failure mode is error 1102 with the *entire cycle* lost and no partial progress, because the writes happen at the end. It also violates the 50-subrequest external limit the moment the feed list grows.
**Instead:** shard by feed, use conditional GETs so unchanged feeds cost nothing, write each cluster in its own `db.batch()`, and move all CPU-heavy work (rasterisation, resizing, bulk serialisation) to the build container.

### 17.2 "Log every poll"

**What people do:** insert a `feed_fetches` row for every fetch, and update `sources.last_fetched_at` every time.
**Why it's wrong:** 40 feeds × 144 cycles = 5,760 rows/day for `feed_fetches` alone, plus 5,760 `sources` updates — over 11% of the 100,000/day D1 write budget, spent on data nobody reads. Scale it to 100 feeds and it becomes the dominant write.
**Instead:** write the log row only when the status or item count changes; throttle `last_fetched_at` to at most hourly; keep the per-cycle counters in `pipeline_runs` (one row per cycle, not per feed).

### 17.3 "Persist embeddings in D1"

**What people do:** store a 384-dimension float vector per story to do semantic clustering.
**Why it's wrong:** 1.5 KB per story vs 8 bytes for a SimHash. At 44,000 stories that is 66 MB/year of pure vector, on a 500 MB database, and it never gets queried at read time — the story pages are pre-rendered. The database is paying for a capability the read path does not use.
**Instead:** SimHash + LSH bands (8 bytes + 4 small ints) for candidate generation, and Workers AI embeddings *transiently* at classify time if an embedding-based tie-break is needed. Never persist a vector you do not query.

### 17.4 "Rebuild the whole site every cycle"

**What people do:** `astro build` over all 44,000 story pages, four times a day.
**Why it's wrong:** 44,000 pages at 35–127 pages/sec is 6–21 minutes — at or over the 20-minute timeout, and the build fails intermittently depending on container load. It also burns 120 build slots a month for no benefit, because 43,600 of those pages are byte-identical to last cycle.
**Instead:** keep the static tier small (the 20,000-file limit enforces this), and make the story tier incremental via a render manifest. A build then renders ~7,100 pages in 2–4 minutes.

### 17.5 "Render story pages live from D1"

**What people do:** a Worker fetches the story from D1 and renders HTML on every request.
**Why it's wrong:** it puts a single-threaded 500 MB database on the hot path of every page view, and it forces a second rendering implementation (the Function's string templates) that will drift from the Astro layout — producing a site that looks like two products. The D1 read budget is fine; the *contention* and the *design drift* are not.
**Instead:** pre-render to R2 and serve a static object. The member list can be up to one build cycle stale — acceptable for a daily paper — and the design stays coherent because there is exactly one renderer.

### 17.6 "Trust the RSS `<category>` tag"

**What people do:** `item.categories[0]` → section.
**Why it's wrong:** publishers use wildly inconsistent taxonomies, often emit one catch-all category, and frequently use a taxonomy that does not map onto eight sections. The result is a Politics section containing half the world's weather.
**Instead:** prefer the **feed URL** as the section signal (the publisher already curated it), then a weighted lexicon, then AI, then a `world` fallback. Persist the method and confidence on every decision so the taxonomy can be audited and improved.

### 17.7 "Merge on similarity alone"

**What people do:** if two headlines are >0.85 similar, merge them.
**Why it's wrong:** it both under-merges (two genuinely-same-event headlines phrased differently score 0.6) and over-merges (two distinct election stories, or two matches in the same series, score 0.7 on generic tokens). Over-merging is the worse failure: it silently destroys the product's core promise and is invisible until a reader notices a wrong story.
**Instead:** two gates — surface similarity (SimHash distance + Jaccard + time window) AND semantic agreement (shared specific entity, or near-identical phrasing) — with a generic-token stop-list and aspect-marker conflict guards. **When in doubt, do not merge.**

### 17.8 "Regenerate everything on every build"

**What people do:** re-resize every image and re-rasterise every OG image on every build.
**Why it's wrong:** 44,000 images × 50 ms = 37 minutes of build time, for byte-identical output.
**Instead:** content-address everything by `sha256(source_url)` and check `status='ready'` before doing any work. The build is idempotent; the second pass does nothing.

### 17.9 "Put the deploy hook URL in the repo"

**What people do:** commit the Pages deploy hook URL so the build script can call it.
**Why it's wrong:** deploy hooks are unauthenticated URLs. Anyone with the URL can trigger builds — a trivial denial-of-service and a way to burn the 500 builds/month quota.
**Instead:** `wrangler secret put PAGES_DEPLOY_HOOK`, and treat the URL as a credential. Rotate it if it is ever exposed.

### 17.10 "Add a cookie banner and analytics scripts for the ranking path"

**What people do:** add GA4, a consent manager and an ad slot "just in case".
**Why it's wrong:** every third-party script is render-blocking, a direct Core Web Vitals liability against a 2.5 s LCP / 200 ms INP / 0.1 CLS budget, and — with no consent — a GDPR problem. Monetisation is explicitly deferred to v2 precisely so nothing compromises the ranking path.
**Instead:** Cloudflare Web Analytics (free, no cookies, no consent banner needed, first-party) plus Search Console. Revisit consent only if v2 introduces non-essential cookies.

---

## 18. Open Questions and Risks

| # | Question / risk | Impact | How to resolve |
|---|---|---|---|
| 1 | **Merge-gate thresholds are unvalidated.** Jaccard 0.55, Hamming 12, the stop-list and the aspect-marker sets are reasoned from event-clustering literature and general practice, not from this corpus. | **High.** Wrong thresholds either fail to merge (the product looks like a plain feed) or over-merge (the core promise breaks). | **Phase-1 spike:** hand-label 300 headline pairs (same-event / different-event / related-but-distinct) from the real feeds, then tune the gates against that set. Re-label monthly. Budget this explicitly; it is the highest-value research in the project. |
| 2 | **LSH band recall is unmeasured.** 4 × 16-bit bands guarantee a shared band only for Hamming distance ≤ 3; the gate accepts up to 12. | **Medium.** Silently missing a same-event headline that scores 8–12 bits apart. | Measure recall against the labelled set. If <95%, switch to 8 × 8-bit bands, or add a second LSH key (a hash of the top-3 entity names). |
| 3 | **Astro build throughput on the Pages container is a secondary-source figure (35–127 pages/sec).** | **Medium.** If the real figure is at the low end, the year-3 static tier (~17,700 pages) approaches the build timeout. | Measure it in the first week with a synthetic 20,000-page build. If it is below 60 pages/sec, plan to move topic/entity pages to R2 before year 2. |
| 4 | **D1 database count on the Free plan reads as "10" in the limits table.** The project needs only one. | Low. | Confirm in the dashboard. Irrelevant at one database. |
| 5 | **Story-page views are the binding Worker-request constraint.** | **High at scale.** Caps the site at ~5,000–7,000 daily visitors. | Aggressive CDN caching from day one; measure cache-hit ratio weekly; plan the Workers Paid ($5/month) decision in advance rather than as an emergency. |
| 6 | **The 4×/day build leaves the front page up to 6 hours stale.** | **Medium.** A breaking story published at 09:00 may not appear until the 10:00 build, and its member list may lag further. | Accept for v1. If it hurts, raise to 6 builds/day (180/month, still 36% of the limit) — the constraint is the build quota, not the architecture. |
| 7 | **Google's treatment of a curation-only `NewsArticle` with an `Organization` author.** | **Medium.** If Google treats the aggregated page as republished content, the `NewsArticle` markup provides no benefit. | Validate in Search Console after 8 weeks of impressions. If `NewsArticle` rich results are not granted, switch to `Article` — the page's value is in the curation and the digest, not in the rich result. **Do not change it before there is impression data.** |
| 8 | **Open-Meteo's non-commercial clause vs future monetisation.** | Low now, high at v2. | Re-evaluate at the v2 kickoff. Budget a paid Open-Meteo tier or self-hosting. |
| 9 | **Brevo's 300 emails/day vs subscriber growth.** | **Medium.** | Decide the overflow policy before 250 subscribers. |
| 10 | **Publisher terms of use.** Several publishers restrict RSS aggregation or require specific attribution. | **High, legal.** | Verify each feed's terms **before** adding it to the source registry; record the verification date in the `sources` table and surface it on `/sources`. This is a launch-blocking check, not a post-launch one. |
| 11 | **R2 storage ceiling at ~month 14.** | Low now. | Add the lifecycle rule in phase 1 — it costs nothing to configure now and removes a future incident. |
| 12 | **The Pages file ceiling at ~month 24.** | Low now. | Revisit the entity thin-page gate annually. Not a launch concern. |

---

## 19. Sources

**Cloudflare platform limits (all verified 2026-10-20):**
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — 100,000 req/day, 10 ms CPU (Free), 50 external subrequests, 1,000 internal service ops, 6 concurrent connections, 5 cron triggers/account, 15-min cron wall time, 20,000 static asset files
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — `*/3 * * * *` expressions supported; changes take up to 15 minutes to propagate
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) — 10 databases, 500 MB/db, 5 GB/account, 50 queries/invocation, 30 s max query duration, 7-day Time Travel
- [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/) — 5M rows read/day, 100,000 rows written/day (Free); index writes count as additional rows
- [KV Limits](https://developers.cloudflare.com/kv/platform/limits/) — 100,000 reads/day, 1,000 writes/day to different keys, 1 write/sec to the same key
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — 10 GB-month, 1M Class A/month, 10M Class B/month, free egress
- [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) — **20,000 files/site (Free)**, 500 builds/month, **20-minute build timeout**, 100 projects
- [Pages Routing (Functions)](https://developers.cloudflare.com/pages/functions/routing/) — functions fall back to static assets; `_routes.json` controls which requests invoke a Function; "on a purely static project, Pages offers unlimited free requests"
- [Pages Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) — static asset precedence, `404.html`, cache headers
- [Pages Build Configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) — Astro preset (`npm run build` → `dist`), monorepo root directory
- [Pages Build Caching](https://developers.cloudflare.com/pages/configuration/build-caching/) — 10 GB per project, 7-day retention on last read
- [Pages Deploy Hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/) — POST-triggered builds; the URL is unauthenticated
- [Pages Build Image](https://developers.cloudflare.com/pages/configuration/build-image/) — v3 image (Ubuntu 22.04, Node 22.16.0, pnpm 10.11.1); v1 retired 2026-09-15, v2 2027-02-23
- [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) — **10,000 neurons/day free**; bge-small 1,841/M tokens, bge-reranker-base 283/M, llama-3.2-3b 4,625 in / 30,475 out per M
- [Workers AI Limits](https://developers.cloudflare.com/workers-ai/platform/limits/) — per-task-type rate limits
- [Images Pricing](https://developers.cloudflare.com/images/pricing/) — **5,000 unique transformations/month free**; not sufficient for 7,200/month
- [Queues Limits](https://developers.cloudflare.com/queues/platform/limits/) — consumer CPU configurable to 5 min but still bound by the Workers plan limit on Free
- [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) — footnote: "Identical to the Workers script limit"
- [Web Analytics Limits](https://developers.cloudflare.com/web-analytics/limits/) — no site limit for proxied sites; 0 custom rules on Free

**SEO / search:**
- [Create a News Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap) — 48-hour freshness window, 1,000-URL cap, `news:` namespace
- [Sitemaps protocol](https://www.sitemaps.org/protocol.html) — 50,000 URLs / 50 MB per file, sitemap index required beyond that
- [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies) — scaled content abuse, scraping
- [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) — LCP < 2.5 s, INP < 200 ms, CLS < 0.1

**Algorithms:**
- [NewsCatcher — article deduplication](https://www.newscatcherapi.com/docs/news-api/guides-and-concepts/articles-deduplication) — cosine similarity over embeddings with a 0.95 threshold (for *exact* duplicates)
- [Event-Driven News Stream Clustering using Entity-Aware Similarity (EACL 2021)](https://aclanthology.org/2021.eacl-main.198.pdf) — entity awareness materially improves event clustering; TF-IDF + embeddings + time
- [MinHash + LSH](https://arpitbhayani.me/blogs/jaccard-minhash/) and [SimHash](https://sumonbis.github.io/academic-project/simhash/) — the near-duplicate detection primitives used here
- [Manku, Jain & Das Sarma — Detecting Near-Duplicates for Web Crawling](https://research.google.com/pubs/archive/33026.pdf) — the SimHash banding scheme

**External services:**
- [Open-Meteo Terms](https://open-meteo.com/en/terms) — free tier: <10,000 calls/day, 5,000/hour, 600/minute, **non-commercial use only**
- [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) — **300 emails/day**, 100,000 contacts

**Secondary (MEDIUM confidence):**
- [Astro build optimisation for large SSG sites](https://www.bitdoze.com/astro-ssg-build-optimization/) — 35–127 pages/sec reported; used for the build-throughput estimate

---
*Architecture research for: The Meridian — automated news aggregation + programmatic SEO publication*
*Researched: 2026-10-20*
