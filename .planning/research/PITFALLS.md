# Pitfalls Research

**Domain:** Automated news aggregation + programmatic-SEO publication (multi-country daily broadsheet, ~120 stories/day, 7 editions, zero-cost Cloudflare stack)
**Researched:** 2026-10-20
**Confidence:** HIGH on all Google policy claims and Cloudflare quota numbers (fetched directly from official documentation on 2026-10-20). MEDIUM on third-party practitioner guidance (rollout cadence, traffic ramp curves). LOW on the "60–90% ranking drop" figure, which is **not** an official Google statement.

---

## Severity Legend

| Code | Meaning | Consequence |
|------|---------|-------------|
| **S** | Severe | Kills the project or its core thesis. Recovery is months, not days. |
| **M** | Major | Degrades the traffic path materially but is survivable with a fix. |
| **L** | Moderate | Localised degradation. Costs days of engineering time. |

---

## THE THREE HIGHEST-SEVERITY PITFALLS

> Read these three first. Each is a **hard** constraint the current plan has not accounted for, and each is preventable only if it is designed for *before* Phase 1 ships.

### **1. [S] The curation layer collapses into a republished feed → scaled content abuse / scraping manual action**
Google's spam policy names this exact pattern twice: *"Scraping feeds … to generate many pages … where little value is provided to users"* is scaled content abuse, and *"Republishing content from other sites without adding any original content or value, **or even citing the original source**"* is scraping. The helpful-content guidance adds the line that kills the "we credit our sources" defence: *"Attribution or giving credit to other sources doesn't replace the need for original effort."* The whole value of the dedup / trending / digest layer is that it *is* the compliance mechanism. If dedup is weak, or the digest generator is dropped, or a redesign flattens the multi-outlet coverage list into a single-source story page, the site becomes a feed mirror and the ranking path is dead.

### **2. [S] Cloudflare Pages Free cannot host 50,000 pages — the 20,000-file cap and the 20-minute build timeout are hit around month 5**
This is a hard, dated, numeric blocker that is not in PROJECT.md. Pages Free allows **20,000 files per site** and **builds time out after 20 minutes** (every plan, including paid). At 120 stories/day, 20,000 files is consumed in ~167 days — and that counts *only* story pages. Add OG images, 56 section pages, topic/entity pages, date-archive pages, sitemaps and feeds and the ceiling arrives much earlier, before the 10,000-indexed-page target is even met. The 20-minute build timeout is a ceiling that "cannot be bought out of" (community consensus on Cloudflare's own forum). A 50,000-page build does not fit. This forces an architecture decision (hybrid rendering or rolling-window static builds) that must be made in Phase 1, not discovered in Phase 4.

### **3. [S] Canonicalising to the original publisher zeroes organic traffic**
If every story page ships `rel="canonical"` pointing at the publisher's URL, Google drops The Meridian's URL from the index for that page. The site becomes a referral-only property. Traffic then depends entirely on direct/newsletter/social, and the 1,000-daily-visitor / 10,000-indexed-page target becomes unreachable within the six-month window. The correct model is **self-referential canonical** plus a page that is genuinely not equivalent to the publisher's page. This is the single make-or-break design decision in the project and it is currently unstated.

---

## Critical Pitfalls

### Pitfall 1: [S] Scaled content abuse and scraping manual action

**What goes wrong:**
The site is demoted or removed from Google entirely. Google's spam policy defines scaled content abuse as *"many pages are generated for the primary purpose of manipulating search rankings and not helping users… typically focused on creating large amounts of unoriginal content that provides little to no value to users, no matter how it's created,"* and lists as examples *"Scraping feeds, search results, or other content to generate many pages (including through automated transformations like synonymizing, translating, or other obfuscation techniques), where little value is provided to users"* and *"Stitching or combining content from different web pages without adding value."* Scraping is defined as *"taking content from other sites… and hosting it with the purpose of manipulating search rankings,"* with the example *"Republishing content from other sites without adding any original content or value, **or even citing the original source**."* A manual action means the pages are excluded from results, not merely demoted — the 1,000-visitor goal becomes permanently unreachable.

**Why it happens:**
Because the aggregate output looks like a feed mirror at the page level. A story page that shows one headline, one excerpt, one source link, and a tag list is *structurally identical* to a republished feed item, regardless of what the surrounding site does. Google evaluates "main content" per page (see the rater guidelines §4.6.6 on *"main content created with little to no effort, little to no originality, and little to no added value"*). Site-level quality does not rescue a page whose main content is a restatement.

**How to avoid:**
Make the *individual story page* carry the value, not just the site. Minimum viable value stack on every story page: (a) the multi-outlet coverage line — "BBC · Guardian · Sky" with a coverage count; (b) the coverage-volume/recency trending score and its rank; (c) topic/entity tags with cross-country flags; (d) automatic internal links to related stories, topics, and the country edition; (e) the auto-generated daily digest for the edition, which is genuinely original prose. Additionally: publish a sourcing-methodology page that states exactly what is taken from feeds (headline, excerpt, attribution, link) and what is original (aggregation, ranking, tags, digest); include author/editorial-owner bylines and Person/Organization schema on every page; include a Corrections policy and a real contact. Do **not** paraphrase the excerpt to dodge duplicate detection — "synonymizing, translating, or other obfuscation techniques" is itself a listed scaled-content-abuse example. Quote the excerpt as a clearly attributed excerpt and put the originality in the aggregation layer.

**Warning signs:**
- A story page whose main content is only headline + excerpt + link (no coverage list, no score, no related links).
- Manual Actions report shows a "Scraping" or "Scaled content abuse" entry; Search Console message center shows a manual action notification.
- Page Indexing report shows "Duplicate, Google chose different canonical" or "Duplicate without user-selected canonical" as a growing share.
- Search Quality rater-style self-audit: if you cannot answer *"what does this page provide that a reader clicking through to BBC would not get?"* the page is thin.
- Coverage count on a majority of stories is 1 (dedup is not merging — see Pitfall 8).

**Phase to address:** Phase 1 (Deduplication, Ranking & Tagging) and Phase 4 (SEO, Schema & Trust Layer) — but the *design* must be fixed in Phase 1; Phase 4 only enforces it.

**Mitigating PROJECT.md requirement:** *"Stories about the same event across different outlets are collapsed into a single entry showing every outlet that covered it"*; *"Each story carries a trending score derived from coverage volume and recency"*; *"Each story is auto-tagged with topic, country, and named entities"*; *"Each country edition publishes an auto-generated daily editorial digest giving an original summary of that day's stories"*; *"The system supports occasional original articles written by the publisher"*; *"The site ships an E-E-A-T trust layer: About, Editorial Policy, Corrections, Contact, author bios, and a sourcing methodology page"*; and the Out-of-Scope constraint *"Copying full article body text from publishers."*

---

### Pitfall 2: [S] Cloudflare Pages Free caps: 20,000 files per site and a 20-minute build timeout

**What goes wrong:**
The deploy fails outright, or the site silently truncates. Official Pages limits on the Free plan:
- **20,000 files per site** (Paid: 100,000, and only if `PAGES_WRANGLER_MAJOR_VERSION=4` is set).
- **"Builds will timeout after 20 minutes"** — stated for every plan, Free through Business.
- **1 build at a time** (Free); 5 concurrent on Pro, 20 on Business.
- **500 builds per month** (Free).
- 25 MiB max per asset; 2,100 redirects max in `_redirects`; 100 header rules in `_headers`.

The file arithmetic is the killer: 120 stories/day × 365 = 43,800 story pages/year. **20,000 files ≈ 167 days of stories alone**, before OG images (1 per story + per section + per topic + per archive), 56 section landing pages, topic/entity pages, date archives (7 editions × 365/yr = 2,555 archive pages/yr), sitemaps and feeds. The site's own stated targets — 10,000 indexed pages at month 6 and ~44,000 story pages/year — put the file ceiling at or before the six-month measurement window. The 20-minute build timeout means a full rebuild of ~10,000–20,000 Astro pages plus image generation is a coin-flip.

**Why it happens:**
Because the plan assumes "static generation with scheduled rebuilds" scales linearly with content volume. It does not. Pages is a whole-site-replace deployment model: every build re-uploads the *entire* asset set, and the file cap is enforced at upload.

**How to avoid:**
Choose the hybrid explicitly, in Phase 1:
1. **Rolling-window static + on-demand archive.** Static-build the last N days of stories, section pages, front pages, and recent archives; serve older stories from a Pages Function / Worker that renders from D1 on demand and caches the result. Tune N so static files stay under ~15,000 (headroom for OG images, sections, topics, archives). At 120/day, N ≈ 60–90 days fits — which matches the project's stated 90-day rolling prominence window. The archive stays queryable and indexable via SSR; the "static-first, SSR not required for content pages" constraint becomes "SSR optional and reserved for the long tail," which is a small, defensible amendment to that constraint.
2. **Or** move story-page HTML for the long tail into R2 and serve it via a Worker (R2 Free: 10 GB storage, 1M Class A ops/month, 10M Class B ops/month — egress is free).
3. **Or** accept the Workers Static Assets route (same 20,000-file free cap, 100,000 paid — still requires the hybrid approach on free).
4. Store OG images in R2, not in the Pages deploy, so they do not consume the 20,000 file budget.
5. Keep the build under 20 minutes by measuring early: a per-page build-time budget (e.g. <60 ms/page) means 15,000 pages ≈ 15 minutes of render time — tight. Parallelise or reduce pages-per-build.

**Warning signs:**
- Pages deploy errors mentioning the file limit, or `PAGES_WRANGLER_MAJOR_VERSION=4` failing to raise it (documented on Cloudflare's forum as still enforced by the internal wrangler 3.x runner — the recommended fallback is Workers Static Assets, which has the same free cap).
- Build logs showing the build step being killed at 20:00 with no deploy.
- `dist/` file count crossing 12,000 — the point where the next deploy fails.
- Build duration trending above 12 minutes (leaving no margin for a retry).

**Phase to address:** Phase 1 (architecture decision), implemented in Phase 3 (Rendering & Editions), monitored in Phase 5 (Publish Pipeline).

**Mitigating PROJECT.md requirement:** *"Each country edition exposes date archive pages"*; *"Every story has its own permanent URL"*; *"Roughly 120 stories per day enter the system, with a 90-day rolling archive and permanent story URLs"*; and the constraint *"Frontend hosting: Cloudflare Pages, static generation with scheduled rebuilds"* (which this pitfall qualifies rather than contradicts).

---

### Pitfall 3: [S] Cross-domain canonical to the publisher kills indexation

**What goes wrong:**
`rel="canonical" href="https://www.bbc.co.uk/news/..."` on a Meridian story page tells Google the Meridian URL is not the canonical version. Google drops the Meridian URL from the index and shows the publisher's page instead. The site's organic traffic for story pages goes to zero. Note also that Google's canonicalization doc says redirects are the strongest signal and rel=canonical is next — so this is a *strong* instruction, not a hint.

**Why it happens:**
It is the intuitive "be a good citizen" instinct, and it is exactly wrong for a value-adding aggregator. The canonical tag answers "which URL is the definitive version of *this same content*?" The Meridian page is **not** the same content as the publisher's page: it has the multi-outlet coverage list, coverage count, trending rank, tags, cross-country flags, related stories, and edition context. There is no duplicate to consolidate.

**How to avoid:**
**Self-referential canonical on every page.** `<link rel="canonical" href="<the Meridian URL for this page>">` — never cross-domain. Cite the source with a normal, followed outbound link (no `nofollow`, no `sponsored` — these are editorial attribution links, and Google treats "Text advertisements or text links that don't block ranking credit" as link spam, which attribution links are not).

Corroboration that aggregators do not canonical away:
- Google's site reputation policy explicitly lists **"News publications that have syndicated news content from other news publications"** as content that is **NOT** inconsistent with the policy — i.e. Google recognises syndication/aggregation as a legitimate publishing model, distinct from reputation borrowing.
- Google's EEA-only aggregator features (Aggregator unit, Supplier unit) exist precisely to let aggregators appear in results alongside their suppliers.
- Real aggregators that rank (Google News, MSN/Yahoo News, Flipboard, NewsNow) self-canonicalise and add layers — ranking, coverage counts, commentary — that do not exist on the publisher's page.

The flip side, which must be respected: because the Meridian page is self-canonical, Google will hold *it* responsible for the quality of *that* page. Self-canonicalising a thin page does not make it safe — it makes you accountable for it. That is why Pitfall 1's value stack is non-negotiable.

**Warning signs:**
- Any `<link rel="canonical">` whose href is on a different registrable domain than the page.
- Page Indexing report: "Duplicate, Google chose different canonical" on story URLs.
- Search Console: story URLs appearing as "Alternate page with proper canonical tag" instead of "Submitted and indexed."
- Zero impressions on story pages while section pages index normally.

**Phase to address:** Phase 4 (SEO, Schema & Trust Layer).

**Mitigating PROJECT.md requirement:** *"Every story has its own permanent URL with headline, excerpt, tags, source attribution, and a link to the original publisher"* (the link is to the publisher; the canonical is to ourselves); *"The site passes technical SEO: XML sitemaps (news and pages), robots.txt, canonicals, hreflang across the seven editions…"*; and the constraint *"Legal: Every story attributes its original publisher with a working link."*

---

### Pitfall 4: [M] The Workers Free plan gives a cron-triggered Worker only 10 ms of CPU

**What goes wrong:**
The ingest cron fires and dies with `Error 1102 — Worker exceeded resource limits` / `exceededCpu`. The feed list never gets ingested. This is *not* the "30-second CPU limit" most plans assume — as of the current Workers limits documentation:

| Limit | Workers Free | Workers Paid |
|---|---|---|
| CPU time per HTTP request | **10 ms** | 5 min (default 30 s) |
| **CPU time per Cron Trigger** | **10 ms** | 30 s (<1 h interval) / 15 min (≥1 h interval) |
| Subrequests per invocation | **50** | 10,000 |
| Simultaneous outgoing connections | 6 | 6 |
| Requests | 100,000/day → `Error 1027` | 10M/month included |
| Cron Triggers per account | **5** | 250 |

Parsing 50+ RSS feeds (XML parse + normalisation + dedup) will not fit in 10 ms of CPU. The subrequest limit compounds it: **50 subrequests per invocation** on Free — one `fetch()` per feed plus every D1/KV/R2 call is a subrequest, so a single invocation cannot fetch 50 feeds *and* write to D1.

**Why it happens:**
Because the plan says "a Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule" without specifying where the parsing CPU happens. The trap is that **CPU time excludes time spent waiting on network I/O** (fetch, KV reads, D1 queries), so a Worker that only `await`s is cheap — but the XML parsing, normalisation, entity extraction and clustering that follow are pure CPU and are exactly what blows the budget.

**How to avoid:**
Move the heavy CPU out of the cron and into the **Pages build runner** (which has no 10 ms cap). The Astro build can fetch, parse, normalise, dedup and render in Node. The Worker cron then becomes a thin orchestrator: trigger the Pages deploy hook, do a lightweight freshness probe on 2–3 feeds, and fetch images into R2. If some ingest must live in a Worker, then:
- Chunk it across multiple cron triggers (5 available on Free) and multiple invocations, storing a cursor in D1/KV so each invocation handles a bounded slice.
- Keep every invocation under 50 subrequests (use `db.batch()` for D1 writes — one request for the whole batch).
- Use `ctx.waitUntil()` to extend execution by up to 30 s after the response for background work (wall-time, not CPU).
- Keep the cron on a ≥1-hour interval if you ever move to Workers Paid (15 min CPU vs 30 s).

**Decision point this pitfall forces:** Workers Paid is **$5 USD/month** and requires a card. That single $5 moves CPU from 10 ms → 5 min, subrequests from 50 → 10,000, cron triggers from 5 → 250, and requests from 100,000/day → 10M/month. It also unlocks Durable Objects and Hyperdrive. "Zero cost" and "$5/month" are different constraints and PROJECT.md does not currently say which one governs. **Resolve this in Phase 1** — it changes the ingest architecture completely.

**Warning signs:**
- Cloudflare dashboard → Workers → Metrics → Errors → Invocation Statuses showing "Exceeded CPU Time Limits."
- `Error 1102` in cron logs.
- `Error 1027` on route errors (100,000 requests/day exhausted).
- Feed count per cron invocation exceeding ~40 with any parsing work (subrequest ceiling).
- Cron handler timing out at the 15-minute wall-clock limit.

**Phase to address:** Phase 1 (Feed Acquisition & Normalization) and Phase 5 (monitoring).

**Mitigating PROJECT.md requirement:** *"A Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule and writes normalized stories into D1"*; and the constraint *"Budget: Zero. Every service used must have a free tier that covers the projected load."* (This pitfall is the reason the phrase "that covers the projected load" must be tested, not assumed.)

---

### Pitfall 5: [M] Free-tier ceilings fail *hard*, not softly — and the ceilings are tighter than the plan assumes

**What goes wrong:**
Different services fail in different, and in some cases destructive, ways. Verified free-tier numbers and their documented failure modes:

| Service | Free limit (official) | Failure mode when exceeded |
|---|---|---|
| Workers | 100,000 req/day | `Error 1027`; route can be set to fail **open** (Worker bypassed) or fail **closed** (1027 page). Both are visible. |
| D1 — rows read | 5,000,000/day | **Hard stop.** "When your account hits the daily read and/or write limits, you will not be able to run queries against D1. D1 API will return errors to your client indicating that your daily limits have been exceeded." |
| D1 — rows written | 100,000/day | Same hard stop. Note indexes count as extra written rows. |
| D1 — storage | 5 GB/account; **500 MB per database** | "Once you have reached your included storage limit, you will need to delete unused databases or clean up stale data before you can insert new data, create or alter tables or create indexes and triggers." **Writes stop working.** |
| D1 — queries per Worker invocation | **50** (Free) vs 1,000 (Paid) | Per-invocation ceiling; independent of the daily counters. |
| KV | 100,000 reads/day; 1,000 writes/day; 1,000 deletes/day; 1,000 lists/day; 1 GB stored | "If you exceed any one of these limits, further operations of that type will fail with an error." **Hard stop on that operation type.** |
| R2 | 10 GB-month; 1M Class A (mutations) /month; 10M Class B (reads) /month; egress free | Class A is billed per *mutation*; every resized image variant is a separate PutObject. |
| R2 `r2.dev` | "not intended for production usage"; hundreds of req/s | `429 Too Many Requests` + bandwidth throttle. |
| R2 REST API | 1,200 requests / 5 min across all R2 REST ops | `429`. Use the S3-compatible or Workers API for volume. |
| R2 same-key writes | 1/second (Free) | `429` on concurrent writes to the same object name. |

**Why it happens:**
Because the ceilings are per-category and compound silently across the pipeline. The 500 MB per-database D1 cap is the sleeper: a single D1 database holding all editions, all stories, all tags and all entity joins for seven countries *will* hit 500 MB, and the consequence is that inserts stop — not that writes slow down. The free tier allows **10 databases per account** (50,000 on Paid), which is exactly enough to shard one per edition, or by month, if planned.

**How to avoid:**
- **Shard D1 deliberately**: 7–10 databases, one per edition (or per country×language), each well under 500 MB. Start with the sharding even at day one — retrofitting it after 6 months of data is a painful migration, and D1's own docs warn that *"Data migrations like a large UPDATE or DELETE affecting millions of rows must be run in batches… Break the work into smaller chunks (e.g., processing 1,000 rows at a time)."*
- **Index every filter you query.** D1 bills rows *read* (scanned), not rows returned. "A query that filters on an unindexed column may return fewer rows to your Worker, but is still required to read (scan) more rows." Every unindexed `WHERE` on the story table is a silent 5M/day budget burner.
- **Do not use KV as a page cache for the whole site.** 100,000 reads/day is the ceiling; caching every story page exhausts it at ~25k cache hits/day (about 2 days of traffic at the 1,000-visitor target). Cache selectively: front pages, section pages, topic hubs, and the day's top stories. KV is also 1 write/second to the same key — a build that writes 500 cache keys at once will hit it.
- **Keep R2 image variants to a small fixed set** (e.g. 3 widths) so Class A writes stay ~360/day.
- **Set a fail-open route mode on Workers** so a quota exhaustion degrades the site rather than serving a 1027 error page to readers.
- **Budget explicitly**: write the monthly projection (feed fetches/day, D1 reads/writes/day, KV reads/day, R2 ops/month) into the Phase 1 design doc, using the official numbers above.

**Warning signs:**
- D1 `meta` object showing `rows_read` far above expectation for a query returning few rows.
- Cloudflare dashboard → D1 → Metrics → Row Metrics trending toward the 5M/100k daily caps.
- KV returning null/errors on `get()` for keys that were definitely written.
- `429` responses from R2 or from publisher feeds.
- A growing D1 database file size approaching 500 MB.

**Phase to address:** Phase 1 (schema + shard plan), monitored in Phase 5.

**Mitigating PROJECT.md requirement:** *"A Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule and writes normalized stories into D1"*; *"Story images are fetched once, stored in R2, and served as resized local variants"*; *"Roughly 120 stories per day enter the system…"*; and the constraint *"Budget: Zero."*

---

### Pitfall 6: [M] Indexation collapse — pages written but never indexed

**What goes wrong:**
The build succeeds, the sitemap is submitted, Search Console shows thousands of "Discovered – currently not indexed" and the indexed count stays flat. The success metric (10,000 indexed pages) never moves.

**Why it happens:**
Google's crawling-infrastructure guidance was rewritten on 2026-07-22 and this project falls squarely inside the audience it describes: *"Medium or larger sites (10,000+ unique pages) with very rapidly changing content (daily)"* and *"Sites with a large portion of their total URLs classified by Search Console as Discovered – currently not indexed."* The four mechanisms:

1. **Crawl capacity limit.** *"Every site starts with the same default, conservative crawl capacity limit. If there is demand to crawl more and the site remains healthy, Google's systems will automatically adjust this limit over time."* It rises only when the site *"responds consistently and its response times (including latency and Time-to-First Byte) remain stable or improve."* It **falls** when the site *"responds with server errors (5xx HTTP status codes) or rate-limiting signals (such as HTTP 429)."* A Cloudflare Pages origin returning 5xx during a deploy window, or a Worker returning 429, permanently ratchets the budget down.
2. **Per-hostname budget.** *"Google's crawling infrastructure defines a site as a unique hostname. For example, https://www.example.com/ and https://code.example.com/ are treated as separate sites and have separate crawl budgets."* **Seven editions must live on ONE hostname**, or the site gets seven budgets instead of one — and a brand-new hostname starts at the conservative default in each case.
3. **Perceived inventory waste.** Duplicate URLs, parameterised URLs, infinite-scroll URLs and differently-sorted variants all consume the budget without adding indexable pages.
4. **Shared capacity.** *"the crawl capacity limit is shared across all crawlers. This means that high demand from one crawler can reduce the capacity available for others."*

**How to avoid:**
- One hostname for all seven editions (`/uk/`, `/us/`, …), not seven subdomains.
- Never return 5xx or 429 to Googlebot. A deploy that briefly 503s the front page costs crawl budget for weeks.
- Robots.txt (not `noindex`) for any URL that must not be crawled — Google explicitly says: *"Don't use noindex, as Google will still request, but then drop the page when it sees a noindex meta tag or header in the HTTP response, wasting crawling time."* This is the direct fix for infinite-scroll and paginated views (which Google's own guide names as the examples).
- Return **404 or 410** for anything permanently gone. *"Google won't forget a URL that it knows about, but a 404 status code is a strong signal not to crawl that URL again."* This matters because *"URLs persist"* in this project — see Pitfall 12.
- Eliminate soft 404s: an archive page with no stories must return 404, not a 200 with an empty list.
- Serve `304 Not Modified` for unchanged pages so Google reuses cached copies.
- Keep sitemaps current; include `<lastmod>`. Split sitemaps with a sitemap index (up to 50,000 `<loc>` tags per index; up to 500 indexes per site).
- Monitor: Page Indexing report weekly, and the Crawl Stats report. The cheap diagnostic — publish a page, add it to the sitemap, and check it with the URL Inspection tool; indexed within a few days means crawl budget is not your problem, weeks means it is.

**Warning signs:**
- Page Indexing report: "Discovered – currently not indexed" or "Crawled – currently not indexed" above ~20% of submitted URLs.
- "Duplicate, Google chose different canonical" appearing on story pages.
- "Alternate page with proper canonical tag" on story pages (a canonical bug, see Pitfall 3).
- "Soft 404" clusters on archive and topic pages.
- Crawl Stats showing request counts flat while the site grows.
- Any 5xx or 429 in Cloudflare analytics correlating with a crawl-budget dip.

**Phase to address:** Phase 4 (SEO & Trust Layer) and Phase 5 (rollout & monitoring).

**Mitigating PROJECT.md requirement:** *"The site passes technical SEO: XML sitemaps (news and pages), robots.txt, canonicals, hreflang across the seven editions, RSS autodiscovery, and a clean URL structure"*; *"Traffic is measured with Cloudflare Web Analytics and Google Search Console"*; *"Each country edition has its own front page, section pages, and dated archive"* (all on one hostname).

---

### Pitfall 7: [M] The news sitemap and Google News enrolment are the wrong lever, and the 2-day window is easy to blow

**What goes wrong:**
The site submits a news sitemap and sits in Publisher Center waiting for approval that never comes, or the news sitemap goes stale and Google stops surfacing stories.

**Why it happens:**
Two facts current as of 2026:
1. **Publisher Center no longer controls publication pages.** *"Google News will no longer use RSS feeds or web locations that were submitted in Publisher Center. As a result, publication pages that were created by publishers manually will no longer appear to users in Google News."* Publication pages are now automatically generated. Publisher Center is now primarily for Reader Revenue Manager, News Showcase, publication metadata and (optionally) RSS feed submission for review.
2. **No application is required.** *"Google automatically considers all web content for inclusion in Google News, so you don't need to apply. To be eligible, content must comply with our overall requirements and content policies."* Publisher Center enrolment is optional and does not affect eligibility.

Meanwhile the news sitemap has a hard rule that is easy to miss: *"Only include recent URLs for articles that were created in the last two days. Once the articles are older than two days, either remove those URLs from the news sitemap or remove the `<news:news>` metadata in your sitemap from the older URLs."* And: *"a sitemap may have up to 1,000 `<news:news>` tags. If there are more than 1,000 `<news:news>` tags in a news sitemap, split your sitemap into several smaller sitemaps."* And: *"Don't create a new sitemap with each update."* Required tags are `<news:publication>` (with `<news:name>` that *"must exactly match the name as it appears on your articles on news.google.com"* and `<news:language>`), `<news:publication_date>`, and `<news:title>` — and *"Don't include the author name, publication name, or publication date in the `<news:title>` tag."*

**How to avoid:**
- Treat the news sitemap as the real Google News mechanism: a daily-generated file containing only the last 48 hours of stories, split at 1,000 URLs, referenced from a stable sitemap index, with `<lastmod>` accurate.
- Do not chase "Google News approval" as a milestone. Success is eligibility + news sitemap correctness + a crawlable site. Publisher Center enrolment stays (it sets site name, logo, verification), but it is not a gate.
- Ensure `<news:name>` matches the on-page site name exactly, and that the site name is specified via `WebSite` structured data on the home page. Note the constraint: *"Google Search only supports one site name per site, where a site is defined by the domain or subdomain. Google Search does not support site names at the subdirectory level."* — so all seven editions share one site name, and the edition is a page-level concept, not a brand.
- Set the favicon (Google News now uses site favicons as publisher logos) and a clear site title.

**Warning signs:**
- News sitemap still containing URLs older than 2 days.
- A single news sitemap exceeding 1,000 `<news:news>` tags.
- Search Console showing "Empty Sitemap" warnings (benign, but only if intentional).
- `<news:name>` differing from the site's visible name/favicon.

**Phase to address:** Phase 4 (SEO & Trust Layer).

**Mitigating PROJECT.md requirement:** *"The site is enrolled in Google News via news sitemap and Publisher Center"*; *"The site publishes an RSS feed and supports social sharing with Open Graph and Twitter cards"*; *"The site passes technical SEO: XML sitemaps (news and pages)…"*.

---

### Pitfall 8: [M] Dedup fails in both directions — under-merging (looks like a thin restatement) and over-merging (destroys accuracy)

**What goes wrong:**
- **Under-merging:** The same event covered by five outlets appears as five separate story pages. The site becomes exactly the "thin restatement of one source" Google penalises, and the differentiator (the "BBC · Guardian · Sky" line) never appears. Coverage count stays at 1 for most stories. This is the operational form of Pitfall 1.
- **Over-merging:** Two genuinely different stories collapse into one. A story page shows a headline that matches neither source accurately, a wrong excerpt, a wrong topic, and a wrong country. Readers lose trust immediately; the Corrections policy gets exercised on day one; the site is a worse product than a plain feed.

**Why it happens:**
Headline-similarity clustering is structurally weak for news, and the literature is explicit about this. The real-time news story identification research states: *"story identification … requires that articles be grouped based on particular events, places, and people, rather than general text similarity (as in clustering)"* and *"articles describing a presidential election may describe the same event from various points of view, resulting in articles with limited text similarity. Therefore, clustering approaches that work on general text similarity may be unsuitable for our task."* It also names the under-merge failure directly: *"Automatic macro-cluster assignment sometimes fails to merge micro-clusters that belong to the same story. This can happen if two stories describe the same event using sufficiently different wording."* And it names the fix: *"calculating topic terms on named entities improves the results compared to calculating them on the entire text. Named entities are likely more useful for merging clusters because they are better at identifying the key facts of each story."*

**How to avoid:**
Use a **tiered, entity-first matcher**, not a headline-similarity threshold:
1. **Tier 0 — exact identity.** Normalised URL (strip tracking params) and publisher GUID are the hard identity. If a feed changes GUIDs, fall back to the canonicalised link.
2. **Tier 1 — entity + time window + action signature.** Extract named entities (people, organisations, places) and a normalised action/event signature. Two items merge when they share ≥1 strong entity (an unusual, named person or organisation), fall within a bounded time window (24–48 h), and share an action signature. This is the approach the research literature supports.
3. **Tier 2 — headline similarity, as a tiebreaker only.** Normalise the headline (lowercase, strip stopwords and punctuation, stem) and require high token overlap *within* a Tier-1 candidate set. Never merge on headline similarity alone.
4. **Explicit merge/split guards.** Enforce a minimum coverage count for showing a merged "N outlets" line; never merge two items whose entity sets are disjoint; never merge items from different countries into one country edition unless the story is genuinely cross-country (that's what the cross-country flag is for — flag it, don't merge it).
5. **Reversibility.** Store each story's contributing source items, so a bad merge can be split at any time. A merge that cannot be undone cannot be corrected, and a wrongly merged story permanently misattributes facts.
6. **Latency.** Feed real-world practice: Feedly measures *"80% of our articles to be duplicates of another article"* using Locality Sensitive Hashing at ~80% similarity, and reduces clustering latency by *"deduplicating prior to clustering"* and propagating the already-computed cluster to exact duplicates. Design for the fact that a story's cluster gets more members over hours — the merged page's coverage count and trending score must be able to grow after publication without changing its URL or title.

**Warning signs:**
- Median coverage count per story at or near 1 (dedup not working).
- More than ~40% of published stories having coverage count 1.
- A spike in coverage counts of 8+ (over-merging; likely a rolling story such as a live update or a "politician resigns" pattern absorbing unrelated stories).
- Manual spot-check: sample 20 random merged stories and compare the headline against each contributing outlet's actual headline. Any mismatch is a false merge.
- Coverage counts that only ever land on 1 or 2 (Tier 1 never firing — entity extraction broken).

**Phase to address:** Phase 2 (Deduplication, Ranking & Tagging).

**Mitigating PROJECT.md requirement:** *"Stories about the same event across different outlets are collapsed into a single entry showing every outlet that covered it"*; *"Each story carries a trending score derived from coverage volume and recency, surfaced as a 'Most Covered' ranking"*; *"Each story is auto-tagged with topic, country, and named entities, and the system flags stories relevant to more than one country edition"*; *"The system supports occasional original articles written by the publisher, distinct from aggregated stories"* (the original-article path must be excluded from merge candidates).

---

### Pitfall 9: [M] Feed-level production failures — the pipeline's most frequent outage source

**What goes wrong:**
A feed 404s, stops updating, serves HTML instead of XML, or returns a 10 MB payload; the ingest stalls, the front page goes stale, and an editor's picks slot is silently empty. If the pipeline retries hard enough, it hammers the publisher and gets the whole feed list IP-blocked.

**Why it happens:**
Real RSS feeds break in documented, recurring ways:
- **Feeds that stop updating** — no new items; the pipeline cannot distinguish "no news" from "broken feed" without a freshness baseline per feed.
- **Feeds returning HTML instead of XML** — bot protection returns a challenge page. This is a well-documented failure: *"Check with support for the platform whether there is bot protection in place that returns HTML at the URL, rather than XML."* Cloudflare-hosted publishers using Bot Fight Mode have caused exactly this for RSS consumers.
- **Feed GUID instability** — some publishers regenerate GUIDs per request, which breaks every downstream dedup key at once.
- **Oversized payloads** — *"Avoid making the feed too large, well under a megabyte is recommended"* and *"Try to keep items in the feed for at least a day. Some clients check quite infrequently."*
- **Missing identifiers** — feeds without a GUID *or* a unique link are unusable for identity resolution.
- **Rate limiting / IP blocking** — publishers block datacenter ranges. Cloudflare's own community has reports of Worker-originated requests being blocked because *"The API may be blocking Cloudflare Worker IP ranges or flagging them as restricted."* Cloudflare Workers egress from datacenter IP space, so a Worker is *more* likely to be treated as a bot than a residential client.

**How to avoid:**
Build a **per-feed health model** stored in D1, with these tracked fields: `last_success_at`, `last_item_at`, `last_guid_at`, `item_count_24h`, `http_status_last`, `content_type_last`, `bytes_last`, `parse_errors_24h`, `guid_stability_flag`, `consecutive_failures`. Then:
- **Freshness SLA per feed** (e.g. the BBC main feed should produce items at least every 20 minutes during waking hours). Missing the SLA ≠ "no news" → raise an alert, do not silently publish an empty section.
- **Content-type and body sniffing**: check `Content-Type` and the first bytes for `<rss`/`<feed`/XML; if it looks like HTML, classify the failure as "bot protection", back off exponentially, and retry with a proper `User-Agent` identifying the project with a contact URL.
- **Body size cap**: refuse to `await response.text()` on anything above a hard ceiling (e.g. 2 MB); abort the body stream and classify as "oversized feed."
- **GUID stability check**: if the GUID set of consecutive fetches overlaps <50%, flag `guid_unstable` and switch the identity key to the canonicalised URL (strip `utm_*`, `at_*`, `CMP`, `ref` params). Keep a fallback to the headline+timestamp+publisher fingerprint.
- **Encoding**: decode defensively (detect charset from the XML declaration or `Content-Type`; fall back to UTF-8; strip BOM and control characters). Broken encodings produce mojibake headlines that get published and are visible to readers.
- **Polite fetching**: per-host concurrency of 1, a descriptive `User-Agent` with a contact URL, an `If-Modified-Since`/`ETag` conditional request where supported, exponential backoff with jitter, and a hard cap of N fetches per host per day (e.g. 20) so a retry storm cannot look like an attack.
- **Publisher blocklist/blacklist** for content, not just network failure (see Pitfall 14).
- **Never let one feed failure fail the build.** A per-feed try/catch with a recorded error is mandatory; the build continues with the feeds that worked.

**Warning signs:**
- `parse_errors_24h > 0` for any feed.
- `guid_stability_flag` flipping true.
- `bytes_last` spiking above 2 MB.
- `content_type_last` = `text/html`.
- `last_item_at` older than the feed's SLA.
- A publisher emailing about excessive requests, or a feed suddenly returning 403/429.
- Coverage count for a single outlet dropping to zero for a whole edition.

**Phase to address:** Phase 1 (Feed Acquisition & Normalization), monitored in Phase 5.

**Mitigating PROJECT.md requirement:** *"A Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule and writes normalized stories into D1"*; *"Each of the seven country editions … has its own front page, section pages, and dated archive"* (a dead feed silently empties a section — the failure is invisible to a reader but immediately visible to Google as a thin section page).

---

### Pitfall 10: [M] Hreflang across seven editions + Hindi — wrong-country rankings and an ignored tag set

**What goes wrong:**
A UK reader searching in English lands on the Indian edition; an Indian Hindi-language reader lands on an English page. Hreflang is ignored entirely, and the wrong edition is served for every query in that country.

**Why it happens:**
The hreflang rules are exacting, and each edition is a separate URL set:
- *"Each language version must list itself as well as all other language versions."*
- *"If two pages don't both point to each other, the tags will be ignored."*
- *"Alternate URLs must be fully-qualified, including the transport method."*
- *"provide a generic English (`en`) page for searchers in the US, UK, and all other English-speaking locations"* — because six of the seven editions are English. Without an `en` + `x-default` fallback, English queries in countries with no edition (and unmatched locales) have nowhere to land.
- *"If you're using hreflang elements, make sure to specify a canonical page in the same language"* — and canonicals must be self-referential (Pitfall 3), so this constrains the hreflang set.
- The sitemap method requires a `<url>` element per URL, each carrying the *full* set of `<xhtml:link rel="alternate" hreflang="…">` children including itself.

The India edition adds a language dimension (Hindi `hi` sourced from native Hindi publishers, not machine-translated — per PROJECT.md's Out-of-Scope decision), so the alternate set for an India story is `en-IN` ↔ `hi-IN` plus the cross-edition English set, and for a story that is *not* cross-country there may be no Hindi equivalent at all.

**How to avoid:**
- Generate hreflang as a *pure function of the story's country-flag set*, emitted identically on every page in the set, listing every page including itself, plus `x-default` pointing at the English global front page.
- Only emit hreflang for pages that actually exist. A story that appears only in the UK edition gets `en-GB` + `en` + `x-default` — not seven `en-XX` links pointing at 404s.
- Put hreflang in the sitemap as the primary mechanism (easier to keep bidirectional and consistent across 50,000+ pages than hand-editing HTML), and mirror it in `<head>` for the pages you can verify. Do **not** use two different implementations for the same URL (Google: *"There's no benefit in Search (in fact, it maybe be much harder to manage three implementations instead of just picking one)"*).
- Because the edition is a *content* dimension rather than a *language* dimension for six of seven editions, treat `en-GB`, `en-US`, `en-AU` etc. as locale variants, and never machine-translate to create a variant.
- The Hindi edition's stories should carry `hi-IN` and point back to `en-IN` only where an English version of the same story exists.

**Warning signs:**
- Search Console international targeting report showing "no return tags" errors.
- Hreflang validation warnings in Search Console.
- A page whose hreflang set is not identical to the set on its alternates.
- `x-default` missing.
- Story pages in the India edition with no `hi-IN` alternate.
- Wrong-country impressions: a `en-GB` URL earning impressions in India and an `en-IN` URL earning impressions in the UK.

**Phase to address:** Phase 4 (SEO & Trust Layer).

**Mitigating PROJECT.md requirement:** *"The site passes technical SEO: XML sitemaps (news and pages), robots.txt, canonicals, hreflang across the seven editions, RSS autodiscovery, and a clean URL structure"*; *"The India edition publishes a parallel Hindi edition sourced from native Hindi-language publishers"*; *"Each of the seven country editions … has its own front page…"*.

---

### Pitfall 11: [M] Site reputation abuse — the policy that punishes hosts of third-party content

**What goes wrong:**
A manual action is applied to a portion of the site. Outside the EEA, affected pages are suppressed. Inside the EEA (from 2026-08-30), the affected section is *"separated in our systems so that, over time, it ranks independently from the rest of the site"* — and Google explicitly says *"Our evaluation of numerous cases has shown that no amount of first-party involvement alters the fundamental third-party nature of the content or the unfair, exploitative nature of attempting to take advantage of the host's sites ranking signals."*

**Why it happens:**
The policy targets *"third-party content that is published on a host site mainly because of that host's already-established ranking signals, which it has earned primarily from its first-party content."* For a brand-new site, the exposure is *low* — there is no established reputation to borrow, so the classic "reputation borrowing" trigger does not fire. The realistic risk is different and comes from two other policies:

1. **The aggregator looks like a host of third-party content.** Every story page on The Meridian is, in Google's view, third-party content (written by the BBC, not by The Meridian) published on a host site. Google lists what is *not* inconsistent, and this project sits inside a listed carve-out: **"News publications that have syndicated news content from other news publications"** and **"Columns, opinion pieces, articles, and other work of an editorial nature."** The second carve-out is the reason the auto-generated digest and the occasional original articles matter: they are the *first-party* content that establishes the site's own editorial character. Google also asks *"Does the content appear on multiple other sites in identical or near-identical form?"* — another argument for making each Meridian page structurally distinct rather than a clean restatement.
2. **A subdomain migration looks like circumvention.** *"Policy circumvention … includes but isn't limited to: Using existing or creating new subdomains, subdirectories, or sites with the intention of continuing to violate our policies."* Moving from the `pages.dev` subdomain to a custom domain is fine; creating *additional* subdomains or a parallel edition site to escape a manual action is not. Keep one hostname and one site.

**How to avoid:**
- Publish real first-party content on every edition: the daily digest, the editorial/About/Policy/Corrections/Contact/Methodology pages, author/editor bylines with Person schema, and the occasional original article. Google's own host-model guidance says third-party content is judged against *"the host domain exercises control over the page content"*, assessed via presentation and design consistency, quality, stated authorship, and whether the content appears identically on many other sites. All four are winnable for this project.
- Keep one hostname, one site, one site name. No edition subdomains.
- Do not let the design diverge between the aggregate pages and the original pages — a distinctly lower-quality template on the digest page is exactly the "quality issues that don't appear on the main domain" signal.
- Do not fabricate authorship. *"Fabricating creator profiles (such as AI-generated headheads, made-up names, or false credentials) to make content appear as if it was written by human experts) is a form of deception."* Use real bylines for real editors, and clearly label automated content as automated.
- Never leave a manual action unaddressed. Google says the request must reference the specific issue; there is a reconsideration request process and, for eligible sites, mediation via the CEDR scheme.

**Warning signs:**
- Manual Actions report shows a site-reputation-abuse entry (this will be reported in Search Console's Manual actions report and the message center).
- A sudden, section-scoped drop in impressions that correlates with the addition of many pages rather than a core update.
- Story pages visually identical to raw feed items with no Meridian-specific structure.
- No first-party content at all on an edition.

**Phase to address:** Phase 4 (SEO & Trust Layer) and Phase 5 (rollout).

**Mitigating PROJECT.md requirement:** *"Each country edition publishes an auto-generated daily editorial digest giving an original summary of that day's stories"*; *"The system supports occasional original articles written by the publisher, distinct from aggregated stories"*; *"The site ships an E-E-A-T trust layer: About, Editorial Policy, Corrections, Contact, author bios, and a sourcing methodology page"*; *"The interface uses the classic broadsheet design language and is built in accordance with the design-taste-frontend skill"*.

---

### Pitfall 12: [M] Permanent URLs create an indexation liability you must actively manage

**What goes wrong:**
Because *"Every story has its own permanent URL"* and URLs are never deleted, the archive grows monotonically. Combined with cross-country flagging (a story may appear in 2–3 editions) the page count grows faster than 120/day. Over a year: 43,800 story URLs plus duplicates-per-edition, plus 2,555 date-archive pages, plus topic/entity pages, plus 56 section pages — well past 60,000 indexable URLs, on a platform whose free tier caps at 20,000 files.

**Why it happens:**
"URLs persist" is a product promise that has an SEO cost: every dead-end URL consumes crawl budget and, if it returns 200 with thin content, becomes a soft-404-style liability. Google's own guide: *"Eliminate soft 404 errors. soft 404 pages will continue to be crawled, and waste your budget."* And: *"Return a 404 or 410 status code for permanently removed pages."*

**How to avoid:**
- Distinguish *URL persistence* from *index persistence*. A story's URL should always resolve (the promise is about the link, not the ranking). But an old story with no inbound links and no impressions can legitimately return **410 Gone** *if and only if* it has been removed from the archive — and only after a grace period, since a 410 for a page Google still wants is a signal loss. The safest default for a news archive is: keep serving 200, but control crawl consumption with robots.txt for URLs below a stated value threshold (deep archive with zero internal links and zero impressions).
- Guarantee every story URL is reachable within ≤3 clicks from a front page (via the date archive and topic/entity hubs). This is also the internal-linking requirement. Google's crawl guide explicitly names infinite-scroll pages that duplicate linked pages and differently-sorted versions as things to block with robots.txt.
- Cap cross-country duplication. A story flagged for three editions creates three near-identical URLs. Ensure the country variants carry genuinely different content (different edition context: local section placement, local relevance, local digest reference) so they are not duplicates of each other. If a variant would be identical, canonicalise it *within* the site (uk variant → canonical → the primary edition's URL) — that is a legitimate same-site canonical, not Pitfall 3.
- Enforce the 90-day prominence window: story URLs older than 90 days drop out of the front page, section pages, and tag hubs, but remain reachable via the date archive.

**Warning signs:**
- Page Indexing report shows a growing "Soft 404" bucket.
- Googlebot hitting URLs that are not linked from anywhere.
- Crawl Stats: high request count with low index growth.
- Two country-edition variants of the same story with identical HTML body content.

**Phase to address:** Phase 3 (Rendering & Editions) and Phase 4 (SEO & Trust Layer).

**Mitigating PROJECT.md requirement:** *"Every story has its own permanent URL"*; *"Roughly 120 stories per day enter the system, with a 90-day rolling archive and permanent story URLs"*; *"Each story is auto-tagged with topic, country, and named entities, and the system flags stories relevant to more than one country edition"*; *"Internal links are generated automatically between stories, topics, and country editions"*; *"Each country edition exposes date archive pages"*.

---

### Pitfall 13: [M] AI-generated content disclosure and the "hallucination in the digest" failure

**What goes wrong:**
The auto-generated daily digest produces a sentence that misstates a fact, a number, a quotation, or an attribution. It is published as original editorial text. Readers notice, the Corrections policy fires, and the site's originality advantage becomes a liability. Separately, presenting automated text as human-written without disclosure risks the "deceptive authorship" signal.

**Why it happens:**
Google's guidance is unambiguous: *"generative models don't retrieve facts, but predict a likely sequence of words based on their training data. Because of this, generative AI outputs may contain inaccuracies (also known as hallucinations). It is critical to manually factcheck and review all AI-generated content for accuracy and trustworthiness before publishing. This review also applies to metadata like `<title>` elements, meta description elements, structured data, and alternate texts for images."* And on disclosure: *"If you are automatically generating content, consider adding information on how your content was created in a way that makes sense for your audience, such as by providing more background information on how automation was used and adding image metadata."* The helpful-content guidance adds: *"Is the use of automation, including AI-generation, self-evident to visitors through disclosures or in other ways?"* and *"It is helpful to readers to know how a piece of content was produced."*

**How to avoid:**
- **Never let the generator invent facts.** The digest generator must be strictly extractive/abstractive over the ingested headline + excerpt corpus, with no external knowledge and no numeric inference. Every sentence must be traceable to a specific story in that day's set.
- **Deterministic generation.** Zero-cost constraint rules out paid LLM calls, so the digest must be template/compositional: assemble summaries from the day's story records (headline + excerpt + outlet + coverage count), grouped by section, ranked by trending score. Deterministic assembly cannot hallucinate.
- **A human-in-the-loop review gate** for the digest before publish — even a 10-minute daily read. This is what makes the digest *editorial* rather than *generated*, which is what the helpful-content guidance calls *"editorial oversight"* (the exact opposite of *"using generative AI to produce large amounts of text without manual oversight or curation"*).
- **Disclose the automation.** A "How this paper is made" / methodology page stating that stories are gathered from public RSS feeds, that the coverage list and ranking are computed, that the digest is assembled from the day's records and reviewed by an editor, and that no article body text is reproduced. A short on-page note on digest pages.
- **Use real bylines.** Person schema on original pieces with genuine, checkable credentials. Never fabricate author identities.
- **Structural data must be truthful too.** NewsArticle `datePublished` must be the story's real publication time, `dateModified` must reflect real changes, and the author/editor entity must be real. Never synthesise a plausible-looking date or author.
- Never *artificially refresh* dates. *"It is against Google's guidelines to artificially refresh a date without significant updates."* And *"You are changing the date of pages to make them seem fresh when the content has not substantially changed?"* is an explicit warning sign.

**Warning signs:**
- Digest sentences with numbers, quotes, or names that do not appear in any source record.
- Digest copy that is near-identical across editions on the same day.
- A reader correction on a digest claim.
- Structured data `datePublished` drifting from the source's own publication date.
- No byline anywhere on first-party content.

**Phase to address:** Phase 2 (digest generation) and Phase 4 (trust layer).

**Mitigating PROJECT.md requirement:** *"Each country edition publishes an auto-generated daily editorial digest giving an original summary of that day's stories"*; *"The system supports occasional original articles written by the publisher, distinct from aggregated stories"*; *"The site ships an E-E-A-T trust layer: About, Editorial Policy, Corrections, Contact, author bios, and a sourcing methodology page"*; *"Pages carry Schema.org markup: NewsArticle, Organization, Person, BreadcrumbList, and ItemList on section pages"*; and the constraint *"Paid hosting, paid APIs, and paid LLM calls"* (Out of Scope) — which forces the deterministic design.

---

### Pitfall 14: [M] Operational failures that silently break a daily product

**What goes wrong:**
Five specific, high-frequency failures:

a) **The build silently produces an empty or partial paper.** A feed fails → the front page has no Politics stories → but the build succeeds and deploys. Readers see a paper with holes; Google sees a thin front page. This is a *silent* failure — there is no error to alert on.
b) **One feed dominates the front page.** A publisher's feed floods (e.g. a live-blog feed emitting 50 items an hour) and the trending score, which is volume-weighted, ranks 40 entries from one outlet above everything else. The front page becomes one topic.
c) **An ingest bug publishes the same story 300 times.** A missing dedup key, a re-run with a wiped cursor, or a GUID instability event creates hundreds of near-identical URLs. This is simultaneously a crawl-budget catastrophe, an index-quality catastrophe, and a visible-to-readers embarrassment.
d) **A source starts sending inappropriate or unwanted content.** A feed changes owner, or a feed starts carrying content that is off-topic, adult, hateful, or fabricated. Because the site is fully automated with no human moderation layer, it publishes it.
e) **A story is wrong because dedup merged two events.** The headline, excerpt, image, and topic of one story attached to another event's outlet list.

**Why it happens:**
Each is a missing guardrail rather than a missing feature, and each is cheap to prevent at the right layer.

**How to avoid:**
- **Build-time assertions with a hard gate.** Before deploy: each edition must have a minimum story count (e.g. ≥8 stories in ≥6 of 8 sections); no single outlet may exceed 35% of the front page; the total story count must be within 60%–140% of the 7-day trailing average; every story must have an outlet, an excerpt, at least one tag, a country, and a timestamp. If an assertion fails, **fail the build** — do not deploy a broken paper. A failed build that leaves yesterday's paper live is the correct failure mode for a daily product.
- **Per-outlet rate limiting in the ingest.** Cap items per outlet per run (e.g. 25) and cap items per outlet per day (e.g. 200). Live blogs then contribute their top items, not their full feed.
- **Trending score normalisation.** Volume must be *relative*: use outlet-count and a decay over time, and normalise per outlet so one prolific feed cannot dominate. Add a per-outlet diminishing-returns term.
- **Idempotent ingest.** Every write keyed on a stable identity hash (canonical URL + publisher + normalised title). Re-running the ingest for a day must be a no-op. Add a uniqueness constraint at the database level, not only in application logic — a bug that bypasses the code path still cannot create duplicates.
- **Content gate.** A per-feed allowlist of publisher domains plus a keyword/category blocklist plus a minimum-relevance score (the story must match the edition's country or be flagged cross-country). Anything failing the gate is quarantined to a review table, not published. Add a one-click "flag source" mechanism reachable from every story page, feeding the quarantine queue — the closest thing to UGC this project allows without moderation staffing.
- **Corrections workflow.** A corrections page, a per-story "correction" note capability, and a documented process. When a merge error is found, the story keeps its URL, gains a correction note, and the merge is split (see Pitfall 8 — reversibility).

**Warning signs:**
- Front-page story count deviating >40% from the trailing 7-day mean.
- Any single outlet >30% of a front page.
- Duplicate-story detector (by title similarity) firing more than a handful of times a day.
- A section page with <3 stories.
- A spike in quarantine-table volume from one feed.
- Story pages whose excerpt does not match any contributing outlet's excerpt (merge corruption).

**Phase to address:** Phase 1 (ingest guards), Phase 2 (dedup + trending), Phase 5 (build assertions and monitoring).

**Mitigating PROJECT.md requirement:** *"Each story carries a trending score derived from coverage volume and recency, surfaced as a 'Most Covered' ranking"*; *"Stories about the same event across different outlets are collapsed into a single entry"*; *"The site ships an E-E-A-T trust layer: … Corrections, Contact …"*; *"Each country edition … has its own front page, section pages, and dated archive"*; and the Out-of-Scope constraint *"User-generated content of any kind - a moderation liability with no upside for a curated daily paper"* (which is why the fix must be a quarantine + flag-source mechanism, never comments).

---

### Pitfall 15: [M] SEO mistakes specific to news sites

**What goes wrong:**
A list of concrete, high-frequency failures, each verified against Google's current documentation:

| Mistake | What Google actually says | Consequence |
|---|---|---|
| **Duplicate date/archive pages** | *"Eliminate soft 404 errors. soft 404 pages will continue to be crawled, and waste your budget."* | Empty archive pages (e.g. a Sunday with no ingested stories, or a future-dated archive) must 404, not render 200 with an empty list. |
| **Near-duplicate section pages** | Doorway abuse: *"Creating substantially similar pages that are closer to search results than a clearly defined, browseable hierarchy."* | Seven editions × eight sections = 56 pages. If the only difference is the country name in a heading, they are near-duplicates. Each needs genuinely different content (the stories, the digest, local context). |
| **Thin tag/topic pages** | Scaled content abuse: *"Creating many pages where the content makes little or no sense to a reader but contains search keywords."* | A topic page with 1 story is a thin page. Gate topic/entity pages on a minimum story count (e.g. 3) and 404 below that. This is also the "gate before generating" discipline for programmatic SEO. |
| **Keyword-stuffed headlines** | Keyword stuffing: *"Repeating the same words or phrases so often that it sounds unnatural."* | Never rewrite a publisher's headline to add keywords. Publish the real headline. Rewrite the *meta description*, not the headline. |
| **All-identical `<title>` tags** | *"Describe your page with unique titles and snippets."* | `<title>` = "The Meridian — UK Edition" on 500 pages is a title-stuffing duplicate. Each story, section, topic and archive page needs a distinct title. Google also uses the site name (not `<title>`) for the brand, and only one site name is supported per domain/subdomain. |
| **Canonical pointing to the homepage by mistake** | *"Don't specify different URLs as canonical for the same page using different canonicalization techniques."* | A template bug pointing every story canonical at the front page collapses the entire story set to one URL. This is a single-character bug that destroys the site. |
| **News sitemap with stale URLs** | *"Only include recent URLs for articles that were created in the last two days."* | Google stops using the news sitemap. |
| **Sitemap mismatch (sitemap vs canonical vs actual)** | *"Don't specify a URL in a sitemap, but a different URL for that same page using rel='canonical'."* | Conflicting signals cause Google to pick arbitrarily. Generate sitemap entries *from* the same function that generates the canonical. |
| **`noindex` instead of robots.txt for non-crawlable URLs** | *"Don't use noindex, as Google will still request, but then drop the page when it sees a noindex meta tag."* | Wastes crawl budget. Use robots.txt for URLs you don't want crawled; use `noindex` only for URLs you want crawled but not indexed. |
| **Article body text copied** | Scraping: *"Republishing content from other sites without adding any original content or value."* | Direct violation, plus the copyright exposure PROJECT.md already forbids. |

**How to avoid:**
- One source of truth for URL metadata: a single `pageMeta()` function that emits title, description, canonical, hreflang set, and sitemap entry from the same record. Templates cannot drift from it. Add a build-time test that asserts every emitted `<title>` is unique across the build, and that every canonical points at itself.
- Gate programmatic pages: topic/entity pages require ≥3 stories; archive pages require ≥1 story; section pages require ≥3 stories per section. Below threshold → 404.
- Section pages must contain the day's digest and a real story list — not a template with a heading.

**Warning signs:**
- A build-time uniqueness check on `<title>` failing (should be a hard gate).
- Page Indexing report: "Duplicate without user-selected canonical," "Alternate page with proper canonical tag," or "Soft 404."
- Search Console: *"Duplicate title"* / *"Duplicate meta description"* reports.
- Topic/entity pages with a story count of 1 or 2 in the sitemap.

**Phase to address:** Phase 3 (Rendering) and Phase 4 (SEO & Trust Layer).

**Mitigating PROJECT.md requirement:** *"The site passes technical SEO: XML sitemaps (news and pages), robots.txt, canonicals, hreflang across the seven editions, RSS autodiscovery, and a clean URL structure"*; *"Topic and entity pages are generated programmatically from the tag layer"*; *"Each of the eight sections … has a landing page per country edition"*; *"Each country edition exposes date archive pages"*; *"Pages carry Schema.org markup: NewsArticle, Organization, Person, BreadcrumbList, and ItemList on section pages"*; *"Copying full article body text from publishers"* (Out of Scope).

---

### Pitfall 16: [M] Design/UX mistakes that specifically damage a news site's search performance

**What goes wrong:**
- **Infinite scroll on the front page or archives.** *"Block crawling of URLs using robots.txt. Some pages might be important to users, but you don't necessarily want them to appear on Google surfaces or get reprocessed by Google's systems. Examples include infinite scrolling pages that duplicate information on linked pages, or differently sorted versions of the same page."* With infinite scroll, story pages 2..N are not linked and are not discoverable. On a site whose entire asset is 43,800 story URLs, this is catastrophic. Note also: *"Google can only discover your links if they are `<a>` HTML elements with a `href` attribute"* — client-side routing that only mutates the URL bar is invisible. Use the History API and real anchors.
- **Auto-refreshing front pages.** A front page that changes on a timer causes Google to see a different page on every crawl — crawl churn, no stable canonical target, wasted budget, and it destroys the "byline dates" and archive-promise semantics. A daily paper should be immutable for the day, with a new edition at a fixed UTC time.
- **CLS from unsized images.** Target is CLS < 0.1. Every image must have explicit `width`/`height` (or `aspect-ratio`) so the layout is reserved before the image arrives. Reserve space for the image slot even when the image fails to load.
- **Poor LCP from unoptimised hero images.** Target LCP < 2.5 s. The lead image on a story page is the LCP element. Requirements: serve from R2 (already in the plan), correct dimensions, `fetchpriority="high"` on the hero, modern formats (AVIF/WebP), responsive `srcset`, and *no* lazy-loading on the LCP image. Do not lazy-load the hero. Preload it.
- **Ad scripts / cookie banners.** Deferred to v2 by PROJECT.md — correct, and it must stay deferred: an interstitial dialog is a page-experience negative, and ad latency directly harms LCP and INP.
- **Client-side-only rendering.** *"All pages with a 200 HTTP status code are sent to the rendering queue, no matter whether JavaScript is present on the page."* Static HTML is faster to crawl and index and is the cheap path. Keep the JS budget small; the project is server-rendered static HTML with no hydration needed on content pages.
- **Mobile layout failures.** Google indexes mobile-first. A broadsheet multi-column grid that does not reflow to a single column on a 360 px viewport will tank mobile LCP/CLS and mobile usability.
- **Dark mode theme flips.** The project locks the page theme so no section inverts. This is a design requirement, but it also has an SEO-adjacent consequence: an inverted section reads as broken to a crawler/rater and hurts perceived quality. Ship light and dark as two complete themes, never a per-section inversion.

**How to avoid:**
Ship static HTML for all indexable content and treat the four crawl-critical behaviours as build-time rules, not design preferences:
1. **Every indexable URL is a real `<a href>` link** somewhere in the static HTML, reachable within 3 clicks from the front page. No infinite scroll on any indexable surface; paginate the archive with real links. Client-side routing uses the History API, never fragments, and never a hash-only URL.
2. **The front page is immutable for the day.** No auto-refresh, no rotating hero, no client-side reordering that changes the DOM between crawls. A new edition is published at a fixed UTC time as a new build, so Google always sees the same front page for a given day.
3. **Every image reserves its box.** Explicit `width` and `height` (or `aspect-ratio`) on every `<img>`, including the story card slot when no image is present. The hero image is **not** lazy-loaded, carries `fetchpriority="high"`, has correct intrinsic dimensions, and is served as AVIF/WebP from R2 at the exact rendered width via `srcset`.
4. **Zero third-party scripts in the critical path.** No ad tags, no consent banner, no newsletter SDK, no analytics tag above the fold on content pages (Cloudflare Web Analytics is script-free). The design brief's own rules — no card containers, hairline rules instead of containers, high density — are also a performance win: less DOM, fewer shadow-scoped style recalcs.
5. **A mobile-first reflow.** One column at ≤640 px, preserving the type scale and rules; the multi-column grid is a desktop-only treatment. Verify at 360 px width, not just at a breakpoint boundary.
6. **Field verification, not lab verification.** Lighthouse on a local build will not catch LCP regressions caused by R2 delivery, self-hosted font loading, or third-party DNS. Use the Core Web Vitals report in Search Console and the CrUX field data once available; treat it as the gate.

**Warning signs:**
- Core Web Vitals report in Search Console showing CLS > 0.1 on story pages (images without dimensions).
- LCP > 2.5 s concentrated on pages with a large hero image.
- Crawl Stats showing repeated hits to the same front-page URL with no new URLs discovered.
- Googlebot finding fewer story URLs than exist.
- Search Console "Page experience" report flags.

**Phase to address:** Phase 3 (Rendering & Broadsheet Design), verified in Phase 4.

**Mitigating PROJECT.md requirement:** *"The site meets Core Web Vitals targets (LCP under 2.5s, INP under 200ms, CLS under 0.1)"*; *"The interface uses the classic broadsheet design language and is built in accordance with the design-taste-frontend skill"*; *"Story images are fetched once, stored in R2, and served as resized local variants"*; *"Advertising and monetization - traffic first; revenue systems are deferred to v2"* (Out of Scope); *"Light and dark themes both ship, with the page theme locked so no section inverts."*

---

### Pitfall 17: [L→M] Timeline and expectation-setting failures

**What goes wrong:**
The team concludes the project failed because traffic is zero at week 6, or spends three weeks waiting for a Google News approval that will never come, or concludes the site is broken because Search Console shows no impressions for the first month.

**Why it happens:**
Four distinct misbeliefs, each with a specific correction:

1. **"Domain age is a hard blocker."** It is not, formally. Google publishes no minimum-age requirement. But there is a real, related mechanism: *"Every site starts with the same default, conservative crawl capacity limit. If there is demand to crawl more and the site remains healthy, Google's systems will automatically adjust this limit over time."* A brand-new hostname starts at the conservative default and must earn its way up. Third-party practitioner estimates put the "sandbox" period at 3–6 months before signals stabilise (LOW–MEDIUM confidence; not an official Google statement). **Practical consequence:** the six-month success target (1,000 daily visitors, 10,000 indexed pages) is achievable but tight, and the *indexation* half of it (10,000 indexed pages) is a crawl-budget-and-demand problem that takes months, not days. Plan the measurement so that indexation, not traffic, is the month-3 milestone.
2. **"Google News approval is a gate."** It is not. *"Google automatically considers all web content for inclusion in Google News, so you don't need to apply."* Publisher Center enrolment is optional and does not affect eligibility. Waiting for approval wastes weeks.
3. **"Expecting traffic before Google indexes."** These are sequential, not parallel. Impressions begin before clicks; clicks begin before stable rankings. Google itself notes: *"Making changes may help a site improve if our automated systems learn over a period of months that the site complies with our spam policies"* — the same multi-month learning curve applies to legitimate recovery, and equally to legitimate growth.
4. **"One algorithm update can be blamed on us."** The 2026 update calendar shows overlapping rollouts: March 2026 spam update (24 Mar, 19h30m) → March 2026 core update (27 Mar, 12d4h) → August 2026 spam update (18 Aug, 2d16h) → September 2026 spam update (24 Sep, 13d16h). Attribution between a core update, a spam update and a seasonal change is genuinely hard. Maintain a change log (builds, deploys, feed changes, schema changes) so you can correlate.

**How to avoid:**
- Set milestone gates on *leading* indicators you control: pages published, pages indexed (Page Indexing report), index rate (indexed ÷ submitted), average coverage count per story, feed freshness SLA compliance, Core Web Vitals pass rate, manual-action status (must always be empty). Set the traffic target only against these.
- Do not change the content model in response to a single update's data. Google's own spam-update guidance says changes take *"a period of months"* to be learned — a panic redesign resets that clock.
- Track "indexed ÷ submitted" weekly. A healthy programmatic news site should hold above ~60–70% index rate at steady state; below ~40% is an indexing pipeline defect, not a patience problem.

**Warning signs:**
- Index rate below 40% for two consecutive weeks → engineering problem, escalate.
- Index rate above 80% but impressions near zero → crawl-demand problem (usually thin content or a topical mismatch), not an indexation problem.
- A dip in impressions within 48 hours of a deploy → likely a build defect (500s, canonical bug, sitemap churn), not an algorithm.

**Phase to address:** Phase 5 (rollout and monitoring); expectations set in the roadmap.

**Mitigating PROJECT.md requirement:** *"Success is defined as 1,000+ daily visitors and 10,000+ indexed pages within six months of launch."*; *"Traffic is measured with Cloudflare Web Analytics and Google Search Console"*; *"The site is enrolled in Google News via news sitemap and Publisher Center"*; *"Timeline: Targeting 1,000 daily visitors and 10,000 indexed pages within six months of launch."*

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| **Single D1 database for all editions** | Simple, one migration path | Hard 500 MB/database cap; when hit, *"you will need to delete unused databases or clean up stale data before you can insert new data"* — writes stop and the site dies. Retrofitting shards onto 6 months of data is a multi-day migration. | **Never.** Shard from day one (7 editions = 7 DBs; 10 allowed on Free). |
| **Pre-render every story page into the Pages deploy** | Maximum performance, simplest runtime | Hard 20,000-file cap and 20-minute build timeout. Breaks around month 5. | **Never.** Use a rolling static window + on-demand archive. |
| **Cache every page in KV** | Fast reads | 100,000 KV reads/day hard cap; exhausted by ~25k cache hits/day. Exceeding it makes *further operations of that type fail with an error*. | **Never** at full-site scale. Cache selectively (front pages, sections, hubs, top stories). |
| **Canonicalise story pages to the publisher** | Feels ethical, is legally cautious | Removes the pages from Google's index entirely. Zero organic traffic. | **Never.** Self-referential canonical + attribution link. |
| **Paraphrase/translate the excerpt to "avoid duplicate content"** | Passes naive duplication checks | "Synonymizing, translating, or other obfuscation techniques" is an *explicit* example of scaled content abuse. Turns a thin-content risk into a policy violation. | **Never.** Add structural value instead. |
| **Merge stories on headline similarity alone** | Cheap, no ML needed | Systematically fails on the cases that matter (different wording, same event) and over-merges live/rolling stories. Destroys accuracy. | **Never** as the primary key. Use as a Tier-2 tiebreaker only. |
| **Generate the digest with a free LLM endpoint** | Reads naturally | Hallucination risk in published original text; requires a paid API (Out of Scope) or an unreliable free tier. | **Never.** Deterministic composition + human review. |
| **Use `noindex` to stop Google crawling archive pages** | One-line fix | Wastes crawl budget — Google still fetches, then discards. | **Never.** Use robots.txt for crawl exclusion; `noindex` only for crawl-but-don't-index. |
| **Ship all 7 editions as subdomains** | Natural URL structure | Each hostname is a separate crawl-budget domain starting at the conservative default, and only one site name is supported per hostname. Also risks "policy circumvention" optics. | **Never.** One hostname, path prefixes. |
| **Let the build deploy whatever it produced** | Fastest pipeline | A partial paper ships silently. The build's most important job is to *refuse* to ship a broken edition. | **Never.** Build assertions are a hard gate. |
| **Manual-only dedup review for the first 90 days** | Human quality | 43,800 stories/yr is not manually reviewable, and it blocks the automation that makes the site defensible. | Only as a *sampling* QA layer on top of automation. |
| **Assume the free tier "covers the projected load"** | No procurement time | D1's 500 MB/DB and 5 GB/account and Workers' 10 ms CPU are the two ceilings that define the architecture. Assuming otherwise produces a design that must be rewritten. | **Never.** Model the projection against the official numbers in Phase 1. |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Publisher RSS feeds** | Fetching every feed on every run with no conditional request, no per-host cap and no backoff | `If-Modified-Since`/`ETag`; per-host concurrency of 1; ≤20 fetches/host/day; exponential backoff with jitter; descriptive `User-Agent` naming the project + a contact URL |
| **Publisher RSS feeds (identity)** | Using the feed GUID as the primary key | GUIDs are unstable at some publishers. Primary key = canonicalised URL (tracking params stripped); GUID is a secondary signal; headline+publisher+time is the last-resort fingerprint |
| **Publisher RSS feeds (safety)** | `await response.text()` on an unbounded body | Hard byte ceiling (~2 MB); abort the stream past it. Otherwise a 10 MB feed blows the 128 MB memory limit (Error 1102) |
| **Publisher RSS feeds (bot protection)** | Treating an HTML challenge page as a parse error | Detect `text/html` / missing XML prolog → classify as "bot protection", back off, retry with a proper UA. Do not hammer |
| **Cloudflare Worker egress** | Assuming datacenter IPs are treated like a browser | Cloudflare Worker egress IPs *are* more likely to be blocked; a community report documents requests being rejected as "restricted" from Worker ranges. Conditional requests + a real UA + per-host politeness are the mitigation |
| **D1** | Billing confusion — thinking "rows returned" is what's billed | D1 bills **rows scanned**. An unindexed `WHERE` scans the table. Index every filter. Each query's `meta.rows_read` is the ground truth |
| **D1** | Assuming a large `UPDATE`/`DELETE` is atomic and fast | *"Data migrations like a large UPDATE or DELETE affecting millions of rows must be run in batches… Break the work into smaller chunks (e.g., processing 1,000 rows at a time)."* |
| **D1** | Assuming writes degrade gracefully at the storage cap | They do not. Storage full = inserts, table alters and index creation all stop. Alert on database size well before 500 MB |
| **KV** | Using it as a page cache | 100,000 reads/day and 1,000 writes/day are hard. Also 1 write/second to the same key — a build writing many keys at once will hit it |
| **R2** | Serving production traffic from `r2.dev` | `r2.dev` is *"not intended for production usage"* and is rate-limited at hundreds of req/s → 429s. Use a custom domain or the Workers API |
| **R2** | Treating every resize as free | Each resized variant is a separate `PutObject` = a Class A op. 1M/month = ~2,700/day. 3 variants × 120 stories/day = 360/day. Keep the variant count small |
| **R2** | Using the REST API for bulk operations | Capped at 1,200 requests / 5 minutes across all R2 REST operations. Use the S3-compatible or Workers API |
| **Cloudflare Pages** | Assuming a deploy hook queues a build | On the Free plan there is **1 build at a time**. A second POST while a build is running will not queue; it will fail or be rejected. Guard with a "build in progress" flag (KV/D1) |
| **Cloudflare Pages** | Deploy hook URL treated as a public URL | *"Deploy Hooks are uniquely linked to your project and do not require additional authentication."* The URL *is* the credential. Rotate it if leaked; never log it; never put it in the repo |
| **Cloudflare Pages** | Expecting `PAGES_WRANGLER_MAJOR_VERSION=4` to raise the file cap | Community reports say the 20,000-file cap is still enforced by the internal wrangler 3.x runner even with the variable set. Verify empirically before relying on it |
| **Cloudflare Workers cron** | Assuming cron times are local | *"Cron Triggers execute on UTC time."* Pick edition publish times in UTC deliberately and label them |
| **Cloudflare Workers cron** | Expecting a cron change to take effect immediately | *"Cron Trigger changes take time to propagate… may take several minutes (up to 15 minutes)."* |
| **Open-Meteo** | Fetching weather per city per request at the edge | Cache aggressively in KV (with a TTL above the 2 s free minimum) — 100,000 KV reads/day is the ceiling, and 7 editions × N cities per pageview multiplies fast |
| **Brevo** | Treating a newsletter signup as a growth lever in month 1 | It needs existing traffic. Also: never put the newsletter form behind a wall that blocks crawlers, and never let Brevo's embed scripts affect LCP/INP |
| **Google News sitemap** | Publishing one sitemap per day | *"Don't create a new sitemap with each update."* Use a stable index + a rolling 48-hour news sitemap, split at 1,000 URLs |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| **Pre-rendering every story into the Pages deploy** | Deploy fails with a file-count error; build killed at 20:00 | Rolling static window + on-demand archive from D1/R2 | ~20,000 files ≈ month 5 at 120 stories/day |
| **Full Astro rebuild every run** | Build duration climbs past 15 min; no margin for retry | Cache the parsed/clustered corpus; rebuild only the delta; keep per-page build cost <60 ms | ~10,000 pages |
| **Unindexed D1 queries on the story table** | `meta.rows_read` in the hundreds of thousands for a 20-row result | Index every filter/sort column the story page and section page use | ~50k rows in the table |
| **One D1 database for everything** | Writes start failing with a storage error at 500 MB | Shard by edition (7 DBs) from day one | ~500 MB |
| **Full-site KV page cache** | KV reads exhausted; cache `get()` starts erroring | Cache only front pages, sections, hubs and top-N stories | ~25,000 cache hits/day |
| **Unbounded feed body reads** | Error 1102 (memory) on a large feed | Byte ceiling + stream abort at ~2 MB | First 10 MB feed |
| **Naive `Promise.all` over 50 feeds** | 50 concurrent fetches exceeds the 6 simultaneous-connection limit and the 50-subrequest cap | Bounded concurrency (6), chunked across invocations, `db.batch()` for writes | >6 feeds per invocation |
| **R2 `r2.dev` as the image origin** | 429s under real traffic; bandwidth throttling | Custom domain or the Workers API | Any real traffic |
| **Per-edition OG image generation at build time** | Build time balloons; image generation is the slowest step | Generate OG images once per story and cache the PNG in R2; render a generic fallback at build time for the rest | ~1,000 images/day |
| **Unbounded cross-country duplication** | Page count grows at 2–3× the story rate; crawl budget thins | Cap the editions a single story can appear in; make variants genuinely distinct | ~50k stories |
| **Rebuilding the whole sitemap set each run** | Sitemap churn; Google re-crawls unchanged URLs | Stable index + per-section sitemaps with accurate `<lastmod>`; regenerate only changed files | ~500 sitemap files |
| **KV `list()` for anything large** | `list` is capped at 1,000/day on Free and returns everything in one response | Never list KV at runtime; use D1 queries with indexes | Immediately |
| **D1 `batch()` inside a loop** | Exceeds "maximum bound parameters per query: 100" and "maximum SQL statement length: 100 KB" | Chunk batches; keep each statement under 100 KB and under 100 bound parameters | ~100 statements |
| **Cloudflare Pages free-plan concurrency** | A second deploy hook POST during a running build fails | "Build in progress" flag in KV/D1; retry with backoff | Every overlapping build |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Deploy hook URL committed to the repo or logged** | Anyone can trigger builds (and, if a build injects env secrets, exfiltrate them) | Store as a Worker secret; never in git; redact from logs; rotate if leaked |
| **Publisher API keys or feed credentials in the client bundle** | Keys are public in the shipped JS | Server-side only; Workers env vars/secrets; Astro `PUBLIC_` prefix discipline |
| **R2 bucket left on `r2.dev`** | The bucket is publicly enumerable and unthrottled | `r2.dev` is for testing only. Use a custom domain with a Worker, and keep the bucket private |
| **Over-broad robots.txt that blocks Googlebot after a bad deploy** | The whole site de-indexes | Use `robots.txt` to exclude specific patterns, never to exclude the whole site; alert on a sudden robots.txt change |
| **SSRF via feed URLs** | A feed URL from an untrusted source could probe internal services | Validate feed URLs against an allowlist of publisher domains before fetching |
| **Unbounded URL ingestion** | Path traversal or malformed slugs creating arbitrary URLs | Strict slug normalisation and an allowlist of characters; derive the slug from a hash of the story ID, not from the raw headline |
| **XSS via feed-sourced headlines/excerpts** | A hostile feed injects script into every edition | Escape all feed-sourced text at render time; never use `set:html` on untrusted content; sanitise excerpts |
| **Image pipeline SSRF / oversized downloads** | A feed's `media:content` URL points at an internal address or a 2 GB file | Restrict to publisher CDN domains; cap download bytes; validate content-type |
| **No rate limiting on the public Worker surface** | Abuse of any public endpoint | Cloudflare WAF rate limiting; keep the public surface minimal (the Worker should serve the archive, not an API) |
| **Trusting a feed's `author` field** | A feed could inject a fabricated byline that then appears in Person schema | Never create a Person entity from feed data; only from your own editorial records |
| **Brevo API key in a client-side form handler** | Key leakage and list abuse | Server-side proxy; keep the form submission through a Worker/Pages Function |
| **AI-generated content passing through unvalidated** | Hallucinated claims published as fact | Deterministic generation + human review gate (Pitfall 13) |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|------------|-----------------|
| **Front page is a single-column feed of cards** | Looks like a link dump, not a newspaper; readers cannot scan | True broadsheet: masthead + rules + multi-column grid, high density, no card containers (per the project's design brief) |
| **The reader cannot tell how many outlets covered a story** | The differentiator is invisible; the site looks like one more feed | Coverage count and outlet list on every story, on the front page, in sections, and in the digest |
| **Dead-end "Read more" links to the publisher with no context** | Reader has to leave the site to understand the story | Show the multi-outlet coverage, the trending score, the topic tags, and the related-coverage links *before* the outbound link |
| **An edition with a sparse or stale front page** | Reader concludes the edition is broken; Google sees a thin page | Build assertions + a "last updated" timestamp + honest empty states (never a 200 with nothing on it) |
| **Dark mode that inverts only some sections** | Visually broken; kills trust in a product whose entire proposition is editorial polish | Two complete themes; the page theme is locked (per the project brief) |
| **Mobile layout that keeps the multi-column grid** | Unreadable on a phone; mobile LCP/CLS fail | Reflow to one column at ≤640 px; keep the hairline rules and typography, drop the columns |
| **Infinite scroll** | No shareable position, no crawlable story links, poor back-button behaviour | Paginated archives with real `<a href>` links |
| **A story merged wrongly** | Reader gets a headline that doesn't match the article | Reversible merges + a visible correction note |
| **Weather section showing a live forecast with no timestamp** | Reader acts on stale data | Timestamp and source attribution on the forecast |
| **A 404 that returns a styled page with a 200 status** | Readers and crawlers both misled; soft 404 | Real 404 status with a proper not-found page |
| **Newsletter form in the header stealing focus** | Degrades LCP and INP on every page | Place it below the fold in the footer, or on a dedicated page; keep it out of the critical path |
| **Publication time shown in the reader's local time with no UTC anchor** | Confusion across editions | Show edition-local time plus an explicit UTC/date stamp |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Dedup:** "Stories about the same event are collapsed" — verify the *median* coverage count per story is ≥2. If it is 1, the dedup is decorative. Spot-check 20 merged stories against each contributing outlet's real headline.
- [ ] **Trending score:** verify the score is normalised per outlet. If one publisher can occupy 40% of "Most Covered", the score is a volume counter, not a trending signal.
- [ ] **Cross-country flagging:** verify flagged stories appear in *each* edition and that the country variants are genuinely different pages — not the same HTML with a different header.
- [ ] **Digest:** verify every sentence in a published digest traces to a specific story record. Verify no invented number, name, or quotation.
- [ ] **Original articles:** verify they are marked as original in schema and on-page, and are excluded from merge candidates.
- [ ] **Exclusion of full body text:** verify no story page contains more than the permitted excerpt. Grep the built `dist/` for long publisher sentences.
- [ ] **Canonical:** verify every page's canonical is self-referential. A template bug pointing at the homepage will look like a finished site until Google collapses it.
- [ ] **Hreflang:** verify the alternate set is byte-identical on every page in the set, includes `x-default`, and that every alternate resolves 200.
- [ ] **News sitemap:** verify it contains only URLs from the last 48 hours and that no single file exceeds 1,000 `<news:news>` tags.
- [ ] **Sitemaps:** verify the index references only files that exist, and that `<lastmod>` values are real.
- [ ] **robots.txt:** verify Googlebot is allowed and that the excluded patterns are the intended ones (infinite scroll, paginated variants) — and that no editorial page is accidentally blocked.
- [ ] **Core Web Vitals:** verify against the *field* data in Search Console, not just Lighthouse. Lighthouse on a local build will not catch LCP regressions from R2 delivery or font loading.
- [ ] **Images:** verify explicit `width`/`height` on every `<img>` and that the LCP hero is *not* lazy-loaded.
- [ ] **Feed health:** verify every feed has a freshness SLA, a last-success timestamp, and that a dead feed produces an alert — not a silent empty section.
- [ ] **Build gate:** verify the build *fails* when an edition has fewer than N stories, when one outlet exceeds its share, or when a duplicate-story check trips. Then deliberately break it and confirm the failure.
- [ ] **Free-tier headroom:** verify actual Workers requests/day, D1 rows read/day, KV reads/day and R2 ops/month against the official caps, with ≥40% headroom.
- [ ] **File budget:** verify `dist/` file count and the 20-minute build duration against the real numbers, at the projected 6-month and 12-month content volumes.
- [ ] **E-E-A-T pages:** verify About, Editorial Policy, Corrections, Contact, author bios and the sourcing-methodology page are real, specific, and linked from the footer of every edition — and that the methodology page names the actual publishers and says exactly what is and is not reproduced.
- [ ] **AI disclosure:** verify the automation disclosure is present on digest pages and in the methodology.
- [ ] **Google News:** verify Publisher Center is configured (name, favicon, verification) *and* that the news sitemap is correct — remembering that enrolment does not gate eligibility.
- [ ] **Rollout cadence:** verify the published-page rate is measured daily and that it is tracking within the 50–500/day band, with index rate watched weekly.
- [ ] **Manual actions:** verify the Manual Actions report is checked weekly and is empty.
- [ ] **Domain migration plan:** verify a redirect map exists for moving from the `pages.dev` subdomain to the custom domain, with 301s (not canonicals) and matching hreflang/sitemap entries.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **Scaled content abuse / scraping manual action** | HIGH (weeks–months) | 1. Read the manual action notice; identify the specific pattern it cites. 2. Stop publishing the offending pattern — rebuild the value layer (coverage list, score, tags, related links, digest) on every affected page type. 3. Consolidate: noindex or 410 the thinnest pages. 4. Submit a reconsideration request referencing the specific fix. 5. Expect the learning curve: Google says systems need *"a period of months"* to re-learn compliance. 6. Do not create new subdomains or sites to escape it — that is policy circumvention |
| **Canonical collapse (all story pages canonical to homepage)** | MEDIUM (hours–days) | Fix the template, redeploy, resubmit the sitemap. Because canonicals are a strong signal, recovery is usually fast once fixed — but pages may need re-crawling. Do not also change the sitemap signal to something different |
| **Canonical to publisher (indexation lost)** | MEDIUM–HIGH | Change to self-referential canonicals, redeploy, resubmit sitemap, and use URL Inspection → Request Indexing on the top pages. Expect a multi-week recrawl. This is a design error, so fix it once, in the template, permanently |
| **Pages file-count / build-timeout failure** | MEDIUM | Adopt the rolling static window + on-demand archive immediately. Rebuild with the reduced file set. Consider Workers Static Assets (same free cap — still needs the hybrid) if Pages refuses the deploy |
| **D1 storage cap hit (writes stopped)** | MEDIUM | Identify the largest tables/indexes; delete or archive stale rows; move one edition to a second database; re-check indexes (indexes count toward storage). Prevention: shard and alert on DB size at 60% of 500 MB |
| **D1 daily row cap hit (queries refused)** | LOW–MEDIUM | Read `meta.rows_read` for the top queries; add the missing index; move per-outlet scanning into a batch. Verify the reset is 00:00 UTC |
| **Workers request cap (Error 1027)** | LOW | Set the route to fail-open so readers still get the static site; move the archive rendering to a cache-friendly path; if sustained, this is the signal to accept the $5 Workers Paid plan |
| **Dedup over-merge (accuracy incident)** | LOW (if merges are reversible) | Split the merged story, restoring each contributing item; publish a correction note on the affected URL; add the failing entity/action pattern to the guard tests. If merges are not reversible, this becomes HIGH — which is why reversibility is a design requirement |
| **Dedup under-merge (thin site)** | MEDIUM | Tighten the entity + action-signature matcher; re-run clustering over the last 30 days; raise the coverage count shown on existing pages. Because the multi-outlet line is the visible proof of value, this must be fixed before any traffic push |
| **Feed goes dead** | LOW | Mark the feed inactive; quarantine its items; alert; retry with backoff; if permanently dead, remove it from the feed list and from the "Sources we cover" methodology page (which must stay accurate) |
| **Feed starts sending inappropriate content** | LOW–MEDIUM | Quarantine the feed immediately (pre-publish gate); purge already-published items from that feed; add the domain to the blocklist; decide whether to keep the source in the "Sources" page (accuracy matters more than source count) |
| **A story was wrong (merge error or bad digest)** | LOW | Correct in place — the URL persists, so publish a visible correction note; update the Corrections page; if the error was systemic, fix the guard and audit the same pattern across the archive |
| **Sitemap / canonical mismatch deployed** | LOW | Regenerate both from the same source-of-truth function; redeploy; resubmit; monitor for 48 hours |
| **Crawl budget throttled after a period of 5xx/429** | MEDIUM | Eliminate the 5xx/429 source; the limit recovers over weeks, not days. Meanwhile reduce waste: robots.txt the paginated/infinite-scroll URLs, 404 the empty archives, remove duplicate URLs |
| **Traffic dip after an algorithm update** | LOW (if legitimate) | Wait. Distinguish core update from spam update from seasonality using the Search Status Dashboard history and your own change log. Do not redesign the content model in response — a redesign resets the multi-month learning clock |
| **Wrong-country rankings after an hreflang deploy** | LOW–MEDIUM | Fix the alternate sets (bidirectional, self-including, with `x-default`), redeploy, revalidate in Search Console |
| **Domain migration to the custom domain** | LOW | 301 the old subdomain URLs to the new host (redirects, not canonicals); preserve the sitemap; re-verify Search Console and Publisher Center; keep one hostname only — no edition subdomains |

---

## Pitfall-to-Phase Mapping

Recommended roadmap phase structure. Phase names are proposals for the roadmapper to adopt or rename; the mapping is the deliverable.

| # | Recommended phase | Pitfalls addressed here | Verification that prevention worked |
|---|-------------------|------------------------|------------------------------------|
| 1 | **Feed Acquisition & Normalization** | 4 (10 ms cron CPU), 5 (free-tier ceilings), 9 (feed-level failures), 14a/14d (build gate + content gate) | Per-feed health table populated for every feed; a deliberately killed feed raises an alert within one SLA window; D1/Workers/KV/R2 projections documented with ≥40% headroom; the free-tier-vs-Workers-Paid decision recorded |
| 2 | **Deduplication, Ranking & Tagging** | 1 (value layer), 8 (under/over-merge), 13 (digest accuracy), 14b (one-feed dominance) | Median coverage count ≥2; 20-story manual spot-check passes; over-merge guard tests fire; trending score normalised per outlet (no outlet >35% of "Most Covered"); every digest sentence traceable to a source record |
| 3 | **Rendering & Editions** (broadsheet design) | 2 (file count / build time), 12 (permanent URLs), 15 (duplicate/thin pages), 16 (UX/CWV) | `dist/` file count and build duration measured and within budget at projected 6- and 12-month volumes; every story page shows coverage count, trending score, tags, related links; every `<img>` has dimensions; mobile reflow verified at 360 px; two complete light/dark themes with no section inversion |
| 4 | **SEO, Schema & Trust Layer** | 3 (canonical), 6 (indexation), 7 (news sitemap / Google News), 10 (hreflang), 11 (site reputation), 13 (disclosure + structured data), 15 (SEO mistakes) | Every canonical is self-referential (asserted at build time); `<title>` uniqueness asserted; hreflang sets byte-identical and bidirectional with `x-default`; news sitemap holds only 48-hour URLs and ≤1,000 entries per file; About/Policy/Corrections/Contact/Authors/Methodology all live and linked; Publisher Center configured |
| 5 | **Publish Pipeline & Monitoring** | 6 (crawl health), 14 (all operational failures), 17 (timeline) | Deploy hook fires daily with a build-in-progress guard; build assertions fail the build (verified by deliberate breakage); feed freshness SLAs alerting; index rate tracked weekly (target ≥60%); Manual Actions report checked weekly and empty; a change log exists correlating deploys to impression changes |
| 6 | **Launch, Rollout & Growth** | 6 (crawl demand), 17 (expectations), 2 (measured rollout) | Published-page rate tracked inside the 50–500/day band; index rate ≥60% by week 8; Core Web Vitals field data passing on story templates; newsletter and analytics live; domain-migration redirect map rehearsed on a subdomain |

**Research flags for phases** (phases that will likely need deeper research than this document provides):

- **Phase 1** — the Workers-Free-10 ms-CPU constraint has no documented pattern for "50 feeds inside the free tier." The chunking/placement strategy (build-time vs cron-time) needs empirical benchmarking before the architecture is fixed. **Flag: needs deeper research.**
- **Phase 2** — the entity + action-signature matcher needs a prototype against real feeds from the target publishers before the threshold values can be set. **Flag: needs deeper research (empirical).**
- **Phase 3** — the rolling-static-window boundary (how many days fit under 20,000 files *after* OG images, section pages, topic pages and archives) must be computed from the real `dist/` manifest. **Flag: needs measurement, not research.**
- **Phase 4** — the canonical/hreflang model is settled here, but the *exact* alternate-set rule for stories that exist in N of 7 editions plus optionally a Hindi variant should be specified as a formal spec before implementation. **Flag: needs a spec, not more research.**
- **Phase 5/6** — the ramp curve and index-rate expectations are MEDIUM/LOW-confidence third-party estimates and should be treated as hypotheses to be re-baselined after the first 30 days of Search Console data.

---

## Sources

### Google — official policy and documentation (all fetched 2026-10-20)

- Spam policies for Google web search — https://developers.google.com/search/docs/essentials/spam-policies (scaled content abuse; scraping; doorway abuse; site reputation policy; legal removals; policy circumvention; keyword stuffing; link spam; manual action link https://support.google.com/webmasters/answer/9044175)
- Update to the Site Reputation Policy, Google Search Central Blog, 28 Aug 2026 — https://developers.google.com/search/blog/2026/08/update-site-reputation-policy (EEA vs non-EEA enforcement from 30 Aug 2026; separation of affected sections; reconsideration + CEDR mediation)
- Creating helpful, reliable, people-first content — https://developers.google.com/search/docs/fundamentals/creating-helpful-content ("automatically generating pages from feeds … represents little to no effort"; "Attribution or giving credit to other sources doesn't replace the need for original effort"; "Are you mainly summarizing what others have to say without adding much value?"; date-freshness and fresh-content warnings; author/byline guidance; rater guidelines §4.6.5 / §4.6.6)
- Google's guidance on using generative AI content — https://developers.google.com/search/docs/fundamentals/using-gen-ai-content (hallucination risk; manual factcheck requirement; automation disclosure; metadata and structured data also subject to review)
- Google Search spam updates — https://developers.google.com/search/docs/appearance/spam-updates ("Making changes may help a site improve if our automated systems learn over a period of months")
- Ranking update history (official status dashboard) — https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history (March 2026 spam update 24 Mar 2026, 19h30m; March 2026 core update 27 Mar 2026, 12d4h; August 2026 spam update 18 Aug 2026, 2d16h; September 2026 spam update 24 Sep 2026, 13d16h)
- Optimize your crawl budget (Crawling infrastructure), updated 22 Jul 2026 — https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget (unique-hostname budget; conservative default capacity limit; 5xx/429 reduce the limit; shared capacity across crawlers; 10,000+ pages changing daily is this guide's target audience; robots.txt over noindex; 404/410 for removed pages; soft-404 elimination; 304; long redirect chains)
- Learn about sitemaps — https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview (sitemap needed for a new site with few external links; ~500-page threshold for "small")
- Manage your sitemaps with a sitemap index file — https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps (50,000 `<loc>` per index; 500 indexes per site)
- News sitemaps — https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap (48-hour recency rule; 1,000 `<news:news>` tags per sitemap; required tags; "Don't create a new sitemap with each update")
- How to specify a canonical URL — https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls (signal strength ordering; self-referential canonical; don't mix signals; robots.txt is not a canonicalisation tool; absolute URLs)
- Tell Google about localized versions of your page — https://developers.google.com/search/docs/specialty/international/localized-versions (bidirectional self-including alternate sets; fully-qualified URLs; generic `en` fallback; `x-default`; canonical must be in the same language)
- Understanding Core Web Vitals — https://developers.google.com/search/docs/appearance/core-web-vitals (LCP < 2.5 s; INP < 200 ms; CLS < 0.1)
- Understand the JavaScript SEO basics — https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics (rendering queue applies to all 200s; `<a href>` discoverability; History API; soft-404 avoidance)
- Provide a site name to Google Search — https://developers.google.com/search/docs/appearance/site-names (one site name per domain or subdomain; not at subdirectory level; WebSite structured data on the home page)
- Regional differences in Search experience (Aggregator unit / Supplier unit) — https://developers.google.com/search/docs/appearance/aggregator-features
- Publisher Center overview — https://support.google.com/news/publisher-center/answer/9606538 ("Google automatically considers all web content for inclusion in Google News, so you don't need to apply")
- Google News transitions to automatically-generated publication pages — https://support.google.com/news/publisher-center/answer/15898024 (Publisher Center RSS feeds and web locations no longer used for publication pages)

### Cloudflare — official documentation (all fetched 2026-10-20)

- Workers limits — https://developers.cloudflare.com/workers/platform/limits/ (Free: 100,000 req/day → Error 1027; **10 ms CPU per HTTP request and 10 ms per Cron Trigger**; 50 subrequests/invocation; 6 simultaneous connections; 5 cron triggers/account; 20,000 static asset files/Worker version; 64 MiB Worker size; 128 MB memory; 15-min cron wall time; `waitUntil` +30 s; Error 1102 for exceeded CPU/memory; CPU time excludes network wait)
- Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/ (Free = 10 ms CPU/invocation; Paid = $5 USD/month minimum, 30M CPU-ms included, 5-min max CPU, 15-min max CPU per Cron Trigger/Queue Consumer)
- Cron Triggers — https://developers.cloudflare.com/workers/configuration/cron-triggers/ (UTC execution; up to 15 minutes for trigger changes to propagate)
- D1 limits — https://developers.cloudflare.com/d1/platform/limits/ (Free: 10 databases/account; **500 MB max database size**; 5 GB max storage/account; 50 queries per Worker invocation; 7-day Time Travel; single-threaded DB; "overloaded" error on queue saturation; batch migrations in 1,000-row chunks)
- D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/ (Free: 5M rows read/day; 100,000 rows written/day; 5 GB storage; resets 00:00 UTC; **daily limit breach = hard stop on D1 queries**; **storage-limit breach = inserts/alters/index creation blocked**; rows *scanned* are billed, not rows returned; indexes count as extra written rows)
- Workers KV limits & pricing — https://developers.cloudflare.com/kv/platform/limits/ and https://developers.cloudflare.com/kv/platform/pricing/ (Free: 100,000 reads/day; 1,000 writes/day; 1,000 deletes/day; 1,000 lists/day; 1 GB stored; 1 write/second per key; **"further operations of that type will fail with an error"** when a limit is exceeded)
- R2 pricing — https://developers.cloudflare.com/r2/pricing/ (Free: 10 GB-month; 1M Class A ops/month; 10M Class B ops/month; free egress; Class A = mutations)
- R2 limits — https://developers.cloudflare.com/r2/platform/limits/ (`r2.dev` "not intended for production usage", hundreds of req/s → 429; REST API 1,200 requests / 5 min; 1 concurrent write per object name on Free → 429)
- Cloudflare Pages limits — https://developers.cloudflare.com/pages/platform/limits/ (Free: **1 build at a time**, **500 builds/month**, **builds timeout after 20 minutes (all plans)**, **20,000 files per site** (100,000 paid with `PAGES_WRANGLER_MAJOR_VERSION=4`), 25 MiB max asset, 2,100 redirects, 100 header rules, 100 projects/account, 48-hour new-project restriction)
- Deploy Hooks — https://developers.cloudflare.com/pages/configuration/deploy-hooks (POST to the hook URL triggers a build; no auth header — the URL is the credential; every request triggers a build)

### Industry / academic sources (dedup, clustering, feeds, platform behaviour)

- Feedly engineering, "How deduplication and clustering can work together" — https://feedly.com/engineering/posts/reducing-clustering-latency (dedup = exact matching and scales; clustering is quadratic; LSH at ~80% similarity; **80% of articles are duplicates of another article**; dedup-before-cluster to cut latency; cluster propagation to duplicates)
- Škvorc, Ivačič, Hribar, Robnik-Šikonja, "Real-time News Story Identification" (arXiv:2508.08272v1, 30 Jul 2025) — https://arxiv.org/html/2508.08272v1 (story identification = grouping by *events, places and people*, not text similarity; text similarity unsuitable for news; **named entities are better merge keys than topic terms**; automatic macro-cluster assignment fails on sufficiently different wording)
- NewsBlur story clustering — https://www.newsblur.com/features/story-clustering (normalised-title + significant-word overlap for fuzzy matches; Elasticsearch `more_like_this` for semantic matching)
- HubSpot, "Troubleshoot RSS feed errors" — https://knowledge.hubspot.com/marketing-email/troubleshoot-rss-feed-errors (bot protection returning HTML instead of XML)
- Kevin Cox, "RSS Feed Best Practices" — https://kevincox.ca/2022/05/06/rss-feed-best-practices (keep items in the feed at least a day; keep the feed well under a megabyte)
- IFTTT Help, "My RSS feed isn't working or updating" — https://help.ifttt.com/hc/en-us/articles/115010396768/ (GUID or unique link required; updated-but-not-republished items are ignored)
- Cloudflare Community, "403 error on Worker tonight" — https://community.cloudflare.com/t/403-error-on-worker-tonight/919499 (Worker-origin requests blocked as "restricted"; UA headers and IP allowlisting as mitigations)
- Cloudflare Community, "WordPress RSS feed pull being blocked as 403 error" — https://community.cloudflare.com/t/wordpress-rss-feed-pull-being-blocked-as-403-error/729918 (Bot Fight Mode returning non-XML to feed readers)
- Cloudflare Community, "Pages 20,000 file limit not lifted despite Workers Paid plan" — https://community.cloudflare.com/t/pages-20-000-file-limit-not-lifted-despite-workers-paid-plan-static-site-with-50k/911111 (MEDIUM confidence: the variable does not raise the cap on Pages; Workers Static Assets is the suggested route — but it carries the same 20,000-file free cap)
- State of Digital Publishing, "How to Setup Google Publisher Center" — https://www.stateofdigitalpublishing.com/modules/google-publisher-center (MEDIUM confidence: Google News feed fetched ~every 30 minutes; articles capped ~1 MB; feeds capped ~2 MB; ~60 new articles per fetch)
- Seobility, "SEO for New Websites in 2026" — https://www.seobility.net/en/blog/seo-for-new-websites (LOW–MEDIUM confidence: 3–6 months before signals stabilise; no domain history; zero backlinks)

### Explicitly flagged as NOT official

- The **"60–90% ranking drops for aggregators in the March 2026 update"** figure originates from third-party commentary (e.g. Lucid Media, Coalition Technologies, seo-kreativ, seovendor) and industry forum reports. Google publishes update dates and durations on the status dashboard but does not publish per-category impact percentages. **Treat as LOW confidence**; the verified fact is the update dates/durations above and Google's own statement that sites violating its policies "may rank lower in results or not appear in results at all."
- The **"50–500 pages/day rollout cadence"** in PROJECT.md is practitioner guidance, not Google policy. Google publishes no such threshold. It is defensible here because the project's natural rate (120 stories/day, up to ~360 with cross-country flagging) already falls inside that band. **MEDIUM confidence.**
- The **new-domain traffic ramp curves** (3–6 month sandbox, 6–12 months to meaningful traffic) are practitioner estimates. Google publishes no timeline. **LOW–MEDIUM confidence**; re-baseline against the first 30 days of Search Console data.

---

*Pitfalls research for: automated news aggregation + programmatic-SEO publication (The Meridian)*
*Researched: 2026-10-20*
*All Google policy claims and Cloudflare quota numbers verified against official documentation on 2026-10-20.*
