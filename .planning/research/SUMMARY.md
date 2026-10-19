# Project Research Summary

**Project:** The Meridian
**Domain:** Free-tier, zero-budget automated news aggregation + programmatic-SEO publication (7 country editions, ~120 stories/day, permanent URLs, organic-search growth asset)
**Researched:** 2026-10-20
**Confidence:** MEDIUM-HIGH overall. All Cloudflare limits and all Google policy claims were verified against official documentation on 2026-10-20 (HIGH). The uncertain areas are the dedup thresholds, Astro build throughput, the Durable Objects CPU question, Hindi generation quality, and Google News traffic volume (MEDIUM/LOW) — each is flagged below with a concrete spike.

---

## Executive Summary

The Meridian is a **scaled content-abuse survival project disguised as a news site**. Google's spam policies name "scraping feeds… to generate many pages… where little value is provided" as scaled content abuse and "republishing content from other sites without adding any original content or value, **or even citing the original source**" as scraping — and the helpful-content guidance closes the escape hatch: *"Attribution or giving credit to other sources doesn't replace the need for original effort."* That means the deduplication / coverage-count / trending / daily-digest layer is not a feature set; it **is** the compliance mechanism. A story page that shows one headline, one excerpt, one source link and a tag list is structurally identical to a republished feed item no matter how good the surrounding site is, and Google evaluates "main content" per page. The product thesis and the survival condition are the same thing.

Four hard platform constraints — all official, all dated — reshape the naive design ("cron Worker fetches RSS → writes D1 → Astro rebuilds the site"):

1. **Workers Free = 10 ms CPU per invocation** (HTTP, Cron, Queue consumer, Durable Object). Measured on this machine: parsing one realistic 40 KB / 60-item feed costs **9.45 ms**; 50 feeds need ~500–600 ms — **50–60× the entire cron budget**. The RSS pipeline cannot live inside a Free-plan cron.
2. **20,000 static files per project** on *both* Cloudflare Pages and Cloudflare Workers Static Assets (100,000 on Paid). At ~143 files/day the single-project cap is consumed around **day 140–167 — inside the project's own six-month success window**.
3. **Astro 6+ removed Cloudflare Pages support from `@astrojs/cloudflare`.** The official upgrade note says the adapter no longer deploys to Pages; Cloudflare publishes a Pages→Workers migration guide. PROJECT.md's frontend-hosting assumption is stale.
4. **D1 Free = 100,000 rows written/day, 5M rows read/day, 500 MB/database, 5 GB/account.** These are hard stops, not degradations: a write-cap breach refuses queries; a storage-cap breach blocks inserts, table alters and index creation entirely.

The reconciled architecture that survives all four is: **one Astro codebase, one GitHub Actions pipeline, one hostname, three storage tiers.** A fetch-only Worker (≈1 ms CPU, 3 cron triggers) pulls raw feeds into R2; CI does all parsing, dedup, enrichment, scoring, AI, image and OG work, writes D1 (system of record) and publishes; the **static tier** (editions, sections, archives, topic/entity pages — ~6,700 files at year 1) is served by Cloudflare Workers Static Assets; the **story tier** (43,800 permanent URLs/year, growing forever) is pre-rendered into **R2** and served by the Worker's `/story/*` route; **media** (story images, OG images) lives in R2 behind a custom domain. The delivery model's file-count problem is dissolved by moving story pages out of the static tier, not by splitting into 8 projects.

The three highest-severity risks are all design decisions, not implementation details, and all must be made in the first phase: **(a)** canonicalising story pages to the original publisher — the intuitive "be a good citizen" choice — drops the pages from Google's index and zeroes organic traffic, making the 1,000-visitor target unreachable; **(b)** hreflang across the seven editions tells Google the editions are localized variants of one page, which is false because the editions carry *different stories* — it fights the duplicate-content model rather than helping it; **(c)** a build that deploys a partial paper is a silent failure that Google reads as a thin section page. The canonical model is **self-referential canonical + one canonical story page per cluster + a hard excerpt budget of ≤50 words / ≤320 characters / ≤30% of the source article's visible text**, with the originality expressed structurally (coverage list, coverage count, trending rank, tags, cross-country flags, related links, per-edition digest) rather than by paraphrasing source text — because "synonymizing, translating, or other obfuscation techniques" is itself a named scaled-content-abuse example.

---

## Reconciliation Log

Four independent researchers surfaced genuine contradictions. Each is resolved below with a definitive decision and the condition under which the rejected alternative becomes correct.

| # | Conflict | Positions | Resolution |
|---|---|---|---|
| 1 | Delivery model / host | STACK: Workers Static Assets, 8 projects. ARCH: Pages + R2 story tier + Functions. FEATURES: Pages 500 builds/mo. PITFALLS: rolling window + on-demand archive | **Cloudflare Workers Static Assets, one project, assets + minimal Worker script; story HTML → R2; CI builds** (§1) |
| 2 | Ingest location | STACK/ARCH: Durable Object. PITFALLS: build runner. STACK Option 1: fetch in Worker, transform in CI | **Hybrid: fetch-only Worker → R2 raw; transform + build in CI.** DO demoted to a spike-gated optimization (§2) |
| 3 | hreflang | FEATURES: wrong mechanism for 7 editions. STACK/ARCH/PITFALLS: assume hreflang across 7 | **FEATURES wins.** Locale paths + self-canonicals for editions; hreflang only for India EN↔HI (§3) |
| 4 | Canonical | PITFALLS: publisher-canonical = zero traffic. Tension with excerpt proximity | **Self-referential canonical only; no cross-domain canonicals ever; hard excerpt budget** (§4) |
| 5 | Google News enrolment | PROJECT.md: "enrolled via news sitemap and Publisher Center" | **No application exists.** Corrected requirement (§5) |
| 6 | Ceiling numbers | Conflicting counts across all four docs | **One consolidated table** (§6) |
| 7 | Crawl budget | PITFALLS: per-hostname | **Confirmed hard rule:** one hostname, locale path prefixes (§7) |

---

## Reconciled Decisions

### 1. Delivery model — the one definitive model

**Decision: Cloudflare Workers Static Assets, one project, `assets` + a minimal Worker script, deployed from GitHub Actions. Story-page HTML pre-rendered to R2 and served by the Worker script. All media in R2 behind a custom domain. One hostname.**

```
                        GitHub Actions (cron, 4×/day — no CPU cap, no 20-min cap)
                        ┌──────────────────────────────────────────────────────┐
                        │ parse → normalize → dedup → enrich → score            │
                        │ → digest (Workers AI) → images (sharp) → OG (satori)  │
                        │ → write D1 → snapshot → astro build → publish → deploy │
                        └──────────────────────────────────────────────────────┘
                            ▲                                │              │
        [Worker: meridian-ingest, 3 cron triggers]           ▼              ▼
        fetch only, ~1 ms CPU                    D1 (system of record)   R2
        conditional GET → raw/*.xml ──────────────────────────────┘  ├─ raw/
                                                                        ├─ story/{slug}.html
   EDGE: meridian.news                                                ├─ media/{hash}/*.webp
   ├─ /uk/ … /in-hi/  → static assets (free, unlimited requests)      └─ og/{slug}.jpg
   ├─ /story/{slug}/  → Worker script → R2 (1 Worker request per view)
   └─ /topic/, /entity/, /sitemap*, /rss/*  → static assets
```

**Why this model, in order of decisiveness:**

- **The file cap is host-agnostic.** Workers Static Assets and Pages both cap at 20,000 files on Free. Choosing a host does not solve the file problem — so the file problem must be solved *architecturally*. Moving story pages to R2 does that: the static tier is ~6,700 files at year 1 and ~17,700 at year 3 (one project is sufficient past month 24). **The 8-project split proposed in STACK.md is unnecessary** — it solves a problem the tier split dissolves.
- **Astro 6+ removed the Pages adapter.** A pure-static Astro build needs no adapter at all; `wrangler deploy` with an `assets` block is the documented path. STACK.md is correct that Pages is no longer first-class for Astro. (Pages is *not* unusable for static output — `wrangler pages deploy dist/` still works — but it buys nothing: same file cap, plus a 500-builds/month ceiling, a 1-concurrent-build ceiling, and the same 20-minute timeout.)
- **A Worker script gives the `/story/*` tier with the same deployment.** With `assets` + `main` in one `wrangler.jsonc`, static assets are served first and unmatched paths fall through to the script. Configuration must use **`not_found_handling: "none"`** (the default) — *not* `"404-page"`, which would swallow `/story/*` before the script sees it. This is the Pages `_routes.json { "include": ["/story/*","/api/*"] }` equivalent, expressed natively.
- **CI removes the 20-minute build timeout.** Pages Builds and Workers Builds both cap at 20 minutes; the Astro 7 build of the static tier is projected at 2–4 minutes (year 1) but grows. GitHub Actions has no such cap and is free (2,000 min/month for private repos, unlimited for public). ~360 min/month projected = 18% of the private-repo allowance.
- **CI removes the deploy-hook credential.** With `on: schedule:` the build is triggered by GitHub's scheduler, not by a webhook URL. This retires a whole class of risk (PITFALLS: "the deploy hook URL *is* the credential") at zero cost.
- **One hostname, one project, one route table.** Satisfies the crawl-budget rule (§7) and the single-site-name rule (§5) simultaneously.

**Rejected alternatives — and exactly when each becomes correct:**

| Rejected model | Why rejected | Becomes correct when |
|---|---|---|
| **Cloudflare Pages + Pages Functions** (ARCHITECTURE.md's proposal) | Same 20,000-file cap, so no advantage on the binding constraint; plus 500 builds/mo, 1 concurrent build, 20-min timeout, and a de-facto-deprecated Astro path | The domain's nameservers will **not** be on Cloudflare (Workers custom domains require Cloudflare-managed nameservers), or the team wants zero Worker code |
| **8 assets-only Workers projects, path-routed** (STACK.md's proposal) | Solves a file-count problem the tier split already dissolves; 8× the deploy/upload surface, 8× the wrangler config, no headroom gained | The static tier ever exceeds 20,000 files (~month 24 at current topic/entity growth) — then shard by edition, or buy Workers Paid for 100,000 files |
| **Pure static — all story pages in static assets** | 120 files/day consumes the 20,000 cap at ~day 140–167, inside the success window; breaks the permanence promise | Never, at $0. On Workers Paid (100,000 files) it still breaks at ~day 830 |
| **Story pages rendered live from D1 per request** | Puts single-threaded D1 on the hot path of every page view *and* forces a second rendering implementation → visual drift between static and dynamic pages ("the site looks like two products") | Never for story pages. `/api/*` only |
| **Rolling static window + D1 SSR for the long tail** (PITFALLS.md option 1) | Same Worker-request cost as R2, plus D1 contention, plus template drift | R2 storage becomes the binding constraint (~month 14 without a lifecycle rule) — mitigate with a lifecycle rule instead, which costs nothing |
| **Workers Paid ($5/mo) as the primary plan** | Violates the stated zero-cost constraint; the free-tier architecture genuinely works for ~2 years | The project earns any revenue — $5 removes three ceilings (100,000 files, 15-min cron CPU, Vectorize) for $60/year. **This is the first thing to buy.** Also becomes correct if the Workers request ceiling is hit before monetisation |

**Build cadence:** 4 builds/day (120/month). Front page and Most Covered are never staler than one cycle (~6 h). The daily product tolerates this; the alternative (hourly = 720/month) is unnecessary and, under Pages, would have been near the build ceiling.

### 2. Ingest location — fetch in the Worker, transform in CI

**Decision: hybrid — a fetch-only Worker writes raw feed bytes to R2; the CI pipeline parses, normalizes, deduplicates, enriches, scores, writes D1 and builds.**

All four researchers agree the Free-plan 10 ms cron CPU forbids parsing 40–60 feeds in a cron trigger. They disagree on the fix. The reconciliation:

**Why fetch stays in the Worker:**
- Fetching is network I/O — **CPU time excludes network wait**. A fetch + R2 PUT + one KV update is ~1 ms CPU. The Worker is a ~40-line fetcher with zero parsing.
- Conditional GETs (ETag / If-Modified-Since) make unchanged feeds cost ~0 bytes and ~0 CPU. This is the single most important optimisation: it means the 50-subrequest cap and the 6-connection cap are only hit by *changed* feeds.
- **Publisher politeness survives.** Workers egress from datacenter IP ranges, which publishers block more aggressively than browser traffic — but so do GitHub Actions runners, and more so. A dedicated Worker with a descriptive `User-Agent` and a contact URL is the *better* citizen of the two, and its per-host request pattern is controllable and auditable.
- **Ingest freshness is decoupled from build freshness.** If the build fails, yesterday's paper stays live but the feed capture continues — the next successful build has no gap. If CI did the fetching, a failed build would also stop the news.

**Why transform moves to CI:**
- Parsing is pure CPU: 9.45 ms/feed measured, ~500–600 ms for 50 feeds, versus a 10 ms budget. CI has no CPU cap.
- Dedup (Jaccard over 1,770 pairs = 2.06 ms; embedding cosine over 200 candidates <1 ms), image resizing (40–120 ms/image), OG rasterisation (50–150 ms/image), and bulk JSON serialisation all belong in CI.
- `sharp` is a native module and **cannot run in `workerd` at all**; satori in a Worker would cost 5–15× the Free CPU limit per image. CI is not merely better — it is the only place these can run on the free tier.

**Why not a Durable Object (STACK/ARCH's Option 2):** the official docs contradict each other. The [Workers limits page](https://developers.cloudflare.com/workers/platform/limits/) says 10 ms per invocation on Free; the [Durable Objects limits page](https://developers.cloudflare.com/durable-objects/platform/limits/) says 30 s CPU per request by default, while its own footnote states Durable Objects inherit the Workers script limit. **A DO cannot be committed to on contradictory documentation.** It is demoted to a spike-gated optimization (§5, Spike S-1). The Worker→R2→CI path works today regardless of the answer, so it is the default.

**Why not a Queue (STACK Option 3):** 10,000 operations/day free (~3,333 messages/day) would cover 50 feed-messages/day easily, and Queues give retries and backpressure. But a queue consumer is still a Worker invocation, so it does not solve CPU — it only improves fan-out. **Use Queues as a retry/backpressure layer if feed flakiness proves to be a problem; never as the CPU solution.**

**Cron trigger configuration (3 of the 5 available):**

| Trigger | Schedule | Feeds | Subrequests used | CPU |
|---|---|---|---|---|
| `meridian-ingest-1` | `7,20,33,46,59 * * * *` | ~20 | 20 | ~0.5 ms |
| `meridian-ingest-2` | offset +4 min | ~20 | 20 | ~0.5 ms |
| `meridian-ingest-3` | offset +8 min | ~20 | 20 | ~0.5 ms |

Effective per-feed cadence ≈ 12 min; polite (≤20 conditional GETs per host per hour). Each invocation stays under the 50-subrequest cap with 60% headroom, and the 6-simultaneous-connection limit is respected with bounded concurrency (do **not** use unbounded `Promise.all` over 50 feeds).

**Required spikes before Phase 2 (see §Spikes):**
- **S-1 — Durable Object CPU on Free (30 min).** Deploy a SQLite-backed DO on Workers Free, burn ~2 s of CPU in a loop, observe whether it dies at 10 ms (`Error 1102`) or survives to 30 s. *Outcome:* if it survives, the DO becomes the ingest engine (SQLite-backed, no R2 raw staging, no R2 read in CI) and the architecture simplifies materially. If it dies, the DO is dead and the default is confirmed. Either way the default builds.
- **S-2 — Worker egress vs publisher blocking (30 min).** Fetch 10 real target publisher feeds from a Worker with a descriptive UA + contact URL. Record HTTP status, latency, and any 403/429. Confirms the fetch path and calibrates the backoff policy.
- **S-3 — CI egress comparison (15 min).** The same 10 feeds from the GitHub Actions runner. *Decision rule:* if ≥30% of publishers block the CI IP range, the Worker is definitively the only fetch path (which is already the plan) — this spike exists to detect a surprise, not to reopen the decision.

### 3. hreflang — FEATURES.md wins; the roadmap must not carry a requirement that fights Google

**Decision: locale path prefixes for geotargeting; self-referencing canonicals on every page; hreflang for exactly one pair — India English ↔ India Hindi — and for nothing else.**

**Why FEATURES.md is right.** Google's hreflang documentation describes the mechanism as being for *"localized variations of the same content"*, and states: *"Localized versions of a page are only considered duplicates if the main content of the page remains untranslated."* The seven editions carry **different stories** — they are not localized variants of one page. Marking them as hreflang alternates tells Google *"these are the same page in seven languages"*, which is false, and it invites the exact consolidation behaviour Google applies to region-only alternates. Google's own multi-regional guidance points locale-targeted content at **locale-specific URLs** and reserves canonical for genuinely duplicate pages. Emitting hreflang across the editions would fight the canonical model rather than support it.

**This decision forces one more decision: the story URL must be edition-agnostic.**

> **One canonical story page per cluster, hosted at a single URL (`/story/{slug}/`), regardless of how many editions it appears in. Other editions show a listing entry (headline, excerpt, outlet chips) that links to the canonical page.**

This is the structural answer to the hreflang/duplicate trap. It means:
- A story covered by 5 outlets in 3 countries is **one URL**, linked from three front pages — not three near-identical pages.
- Story pages therefore need **no hreflang at all** (except the India pair below) and have no cross-edition canonical to negotiate.
- Cross-country flagging creates **inbound internal links**, not duplicate pages. This dissolves PITFALLS.md Pitfall 12's "unbounded cross-country duplication" concern entirely.
- **FEATURES.md's proposed `/{edition}/news/{slug}-{shortid}/` URL scheme is rejected.** An edition-scoped story URL forces either duplicate pages or a redirect for every cross-country story, and a redirect is a weaker signal than a clean single URL.

**The exact hreflang specification:**

| Page type | hreflang set | Rationale |
|---|---|---|
| Edition front page, topic page, entity page, section page | **none** | Distinct pages with distinct content; not localized variants |
| Story page (`/story/{slug}/`) | **none**, except the India pair below | One URL, one language, self-canonical |
| `/in/` (India English front page) | `en-IN` (self), `hi-IN` → `/in-hi/`, `x-default` → `/` | Genuine language parallel |
| `/in-hi/` (India Hindi front page) | `hi-IN` (self), `en-IN` → `/in/`, `x-default` → `/` | Genuine language parallel |
| India story pair (an English India story with a genuine native-Hindi counterpart) | `en-IN` (self), `hi-IN` → the Hindi URL, `hi` catchall → the Hindi front page, `x-default` → `/` | Only where a real Hindi counterpart exists |
| India story with **no** Hindi counterpart | `en-IN` (self) only — **no `hi-IN` alternate** | Never point at a 404 |
| `/` (global English front page) | `en` (self), `x-default` (self) | Google's generic-English catchall for unmatched locales |

**Implementation rules (non-negotiable):**
1. Alternate sets are **bidirectional** and **self-including** — every page in a set lists every other page including itself. A set that is not byte-identical on every member is ignored by Google.
2. Fully-qualified absolute URLs, including `https://`.
3. **One implementation only.** Emit hreflang in the sitemap as the primary mechanism (manageable across 50,000+ pages) and mirror it in `<head>` for the small set of pages that have it. Google explicitly warns that running two different implementations for the same URL is harder to manage than picking one.
4. `x-default` always points at `https://{domain}/` (the global English front page / edition picker) — the broadest match for an unmatched locale.
5. **Never machine-translate to create a variant.** The Hindi edition is built from native Hindi publishers; an English story simply has no `hi-IN` alternate.

**Superseded by this decision:** ARCHITECTURE.md §12.3 (edition pages listing all eight alternates + `x-default`) and PITFALLS.md Pitfall 10 (alternate set as a pure function of the story's country-flag set). Both must be updated in the phase that implements the SEO surface.

**Also mandated:** `lang` attributes (`en`, `en-IN`, `hi`, `hi-IN`) on every page — Google does not use `lang` to detect language, but it is required for WCAG and screen readers, and Google requires the page language to be *obvious* to users (no side-by-side translations on one page).

### 4. Canonical policy and the exact excerpt budget

**Decision: self-referential canonical on every page, forever. The excerpt is a *summary reference* bounded by a hard, code-enforced budget. The originality lives in the aggregation layer, not in the text.**

**The canonical policy, stated exactly:**

1. **Every page on the Meridian domain emits `<link rel="canonical" href="{absolute URL of this page}">`.** No exceptions, no conditional logic.
2. **Cross-domain canonicals are forbidden.** A canonical pointing at a publisher's URL tells Google the Meridian URL is not the canonical version of that content; Google drops the Meridian URL from the index and shows the publisher's page. The site's organic traffic for story pages goes to zero and the property becomes referral-only — the 1,000-visitor target becomes unreachable. **There is no duplicate to consolidate**: the Meridian page carries the multi-outlet coverage line, coverage count, trending rank and rank position, topic/entity tags, cross-country flags, related-story links and edition context, none of which exist on the publisher's page.
3. **Within-site variants are handled by 301 redirects, not by canonical tags.** Google's canonicalisation documentation states redirects are the strongest signal and `rel=canonical` is next; mixing the two is explicitly discouraged. So: trailing-slash variants, `?page=1`, `www` vs apex, and the pre-launch subdomain → custom-domain move are all **301s**. `rel=canonical` is reserved for "this is me".
4. **The sitemap and the canonical are generated from the same function** (`pageMeta()`), so the same URL can never appear in one and not the other. A sitemap/canonical mismatch makes Google pick arbitrarily.
5. **Outbound attribution links use `rel="noopener"` only — never `nofollow` or `sponsored`.** These are editorial citation links, not ad links; Google's link-spam policy targets "text advertisements or text links that don't block ranking credit", which does not describe attribution. Capping the outbound count per story page at the outlet list (typically ≤6 outlets) keeps the profile clean.
   *(Note: ARCHITECTURE.md §6.4 specifies `rel="nofollow noopener"` on the outlet list. This is overridden.)*
6. **Build-time assertions:** every canonical is self-referential and every `<title>` is unique across the build. Both are hard gates — a single template bug that points every story canonical at the homepage collapses the entire story set to one URL while looking like a finished site.

**Why the tension with the excerpt is real, and how it resolves.** Google's scraping policy says: *"Publishers must block content that scrapes all or nearly all of an original work without providing any substantial or clear added value."* "Substantial material" is the test, and it is relative to the source. If the excerpt *is* the substance of the source article, the page is a republication regardless of how good the rest of the page is. If the excerpt is a fragment and the page carries a genuinely different information structure, the page is not a republication. Google's site-reputation policy independently confirms the model is viable: it lists **"News publications that have syndicated news content from other news publications"** as content that is **not** inconsistent with the policy — syndication with added value is a recognised publishing model, and Google's EEA-only Aggregator unit exists precisely for it.

**The exact excerpt budget (hard rules, enforced in the normaliser):**

| Rule | Value | Why |
|---|---|---|
| Maximum length | **≤ 50 words AND ≤ 320 characters**, whichever binds first | A reference, not a substitute for the article |
| Maximum sentences | **≤ 2** (≤1 where the feed description permits a clean cut) | Never the full lede paragraph |
| Maximum share of source | **≤ 30% of the source article's visible text** | The mechanical form of "all or nearly all" |
| Short source | If the source article is **under 160 words**, publish **no excerpt** — headline + attribution only | Prevents a short post being copied in full |
| Truncation | Hard cut at a word boundary **with a visible ellipsis**, so the fragment is legible as a fragment | Honesty about what was taken |
| Transformation | **None.** Quote the source excerpt verbatim or omit it. No paraphrasing, no synonymizing, no translation | "Synonymizing, translating, or other obfuscation techniques" is a *named* scaled-content-abuse example |
| Attribution | Every excerpt carries an explicit "From {Publisher}" line and every image a "Photo: {Publisher}" credit | Legal + E-E-A-T |
| Enforcement | A unit test asserts word count, character count and the ≤30% rule for **every** stored excerpt. It is not a per-editor judgement. | The one place the content model touches source text |

**And the complementary value stack that must appear on every story page** — this is what makes the page "structurally distinct" from the publisher's page and satisfies "clear added value":

1. The multi-outlet coverage line ("BBC · Guardian · Sky") with the **coverage count**
2. The trending score and its rank in "Most Covered"
3. Topic / entity tags with cross-country flags
4. Automatic internal links to related stories, topics and the country edition
5. The per-edition daily digest (genuinely original prose) linked from the edition front page
6. A visible "reported by N outlets" / "first reported {time}" byline block

**Build-time gate: every story page must carry at least 4 of these 6.** A page that fails the gate is a thin restatement and must not deploy. This is the operational form of PITFALLS.md Pitfall 1, and it is the self-canonical flip side: because we self-canonical, Google holds **us** responsible for the quality of **that** page. Self-canonicalising a thin page does not make it safe — it makes you accountable for it.

### 5. Google News / Publisher Center — the corrected requirement

**The finding, from official Google documentation:** *"Google automatically considers all web content for inclusion in Google News, so you don't need to apply. To be eligible, content must comply with our overall requirements and content policies."* There is no application, no approval queue, and no approval timeline. Google News has also moved to **automatically-generated publication pages** — Publisher Center RSS feeds and web locations no longer drive publication pages. Publisher Center is now for publication metadata (name, favicon/logo, HQ, contact, URL verification), Reader Revenue Manager (N/A — no paywall), and **News Showcase**.

**The corrected requirement (replaces the PROJECT.md line):**

> ~~"The site is enrolled in Google News via news sitemap and Publisher Center."~~
>
> **"The site is discoverable and eligible for Google News: it publishes a compliant news sitemap (last 48 hours of URLs only, ≤1,000 `<news:news>` per file, correct `news:publication`/`news:language`/`news:publication_date`/`news:title`), allows `Googlebot-News` in robots.txt, and satisfies the Google News article requirements (clear visible date and time between the headline and the body; headline in a prominent `<h1>`; `<title>` matching the `<h1>`; anchor text matching the title; headline 2–22 words and ≥10 characters; headline ≤110 characters; no date in the article title; no leading number in the anchor text; story-relevant images ≥60×90 px; `author.url` pointing to an author-identifying page; `NewsArticle` with `datePublished`, `dateModified`, `headline`, `image`, `isAccessibleForFree`). Publisher Center is configured for publication metadata and the News Showcase panel — a high-leverage traffic surface and free — but enrolment is not a gate and no approval is pending."**

**Operational consequences:**

- **No phase waits on a Google News approval.** The success criterion is eligibility + news-sitemap correctness + crawlability, measured through Search Console's Google News performance report.
- **`<news:name>` must exactly match the publication name as it appears on `news.google.com`.** Fix the string once, in a single config value, before configuring Publisher Center, and never let it diverge. A mismatch silently kills Google News inclusion. This is the single highest-impact string in the project.
- **The news sitemap is the mechanism, not the paperwork.** Regenerate every cycle: 48-hour window only, split at 1,000 URLs, referenced from a **stable** sitemap index. Google: *"Don't create a new sitemap with each update."* `<news:publication_date>` is the original publication date, not the date the URL was added. `<news:title>` must not include the author, publication name, or publication date.
- **One site name for all seven editions.** Google supports one site name per domain or subdomain and explicitly does **not** support site names at the subdirectory level. All editions display "The Meridian" in search results; the edition identity ("UK Edition", "India Edition") lives in the `<title>`, the `<h1>` and the visible masthead. The site name should be short and distinctive so it is not truncated. *(This was missing from PROJECT.md entirely — see §PROJECT.md Changes, C-17.)*
- **Set the favicon.** Google News now uses site favicons as publisher logos.
- **Publisher-side etiquette to be aware of:** Google News recommends syndicators use `<meta name="Googlebot-News" content="noindex">` to stop syndicated copies competing with the original. This is the publisher's choice, not the aggregator's — but The Meridian must not be structured as a copy of a publisher's page, or it may receive that treatment from publishers who syndicate.

### 6. Consolidated free-tier limits — one table, with headroom

Every limit this project depends on, with its source document and its headroom against projected load. **Limits the project will actually hit are marked ⚠.**

| Resource | Free-tier limit | Source doc(s) | Projected load | Headroom | Status |
|---|---|---|---|---|---|
| **Workers requests/day** | 100,000 | ARCH §16.1, STACK, PITFALLS 5 | ~13,200/day at 1,000 visitors | 87% | ⚠ **Hits at ~5,000–7,000 daily visitors.** The binding growth wall, not a launch constraint |
| **Workers CPU / invocation** | 10 ms | STACK, ARCH §16.1, PITFALLS 4 | ~1 ms (fetch-only Worker) | 90% | ✅ (only because parsing moved to CI) |
| **Workers subrequests / invocation** | 50 external | STACK, ARCH §16.1, PITFALLS 4 | ~20 (3 triggers × 20 feeds) | 60% | ✅ |
| **Workers concurrent connections** | 6 | all three | bounded at 6 | — | ✅ |
| **Cron triggers / account** | 5 | STACK, ARCH, PITFALLS 4 | 3 | 40% | ✅ |
| **Static asset files / project** | **20,000** (100,000 Paid) | STACK, ARCH §16.3, PITFALLS 2 | ~6,700 (yr 1) → ~17,700 (yr 3) | 33% → 12% | ⚠ Hits ~month 24. Mitigation: entity thin-page gate, move entity pages to R2, or Workers Paid |
| **Pages files / site** | 20,000 · 500 builds/mo · 20-min timeout · 1 concurrent build | STACK, FEATURES C-6, ARCH §16.3, PITFALLS 2 | n/a under the resolved model (CI builds) | — | ✅ Moot — Pages not used |
| **Workers Builds minutes** | 3,000/mo · 20-min timeout | STACK | n/a (GitHub Actions instead) | — | ✅ Moot |
| **GitHub Actions minutes** | 2,000/mo (private) · unlimited (public) | STACK | ~360/mo (4 jobs × 12 min × 30) | 18% | ✅ |
| **D1 rows read/day** | 5,000,000 | STACK, ARCH §16.2, PITFALLS 5 | ~47,000/day | 99% | ✅ |
| **D1 rows written/day** | 100,000 | STACK, ARCH §16.2, PITFALLS 5 | ~3,285/day *with throttles* (11,500 without) | 97% | ✅ — but only with `feed_fetches` on-change-only and `sources.last_fetched_at` throttled to hourly |
| **D1 storage / database** | **500 MB** (10 GB Paid) | STACK, ARCH §16.2, PITFALLS 5 | ~70 MB/year → ~7 yrs | 86% | ✅ **Do not shard** (see below) |
| **D1 storage / account** | 5 GB | STACK, ARCH, PITFALLS 5 | ~70 MB/year | 99% | ✅ |
| **D1 databases / account** | 10 | ARCH §18.4, PITFALLS 5 | 1 | 90% | ✅ |
| **D1 queries / Worker invocation** | 50 | STACK, ARCH, PITFALLS 5 | use `db.batch()` | — | ✅ |
| **D1 max query duration** | 30 s | STACK, ARCH | page at 500 rows | — | ✅ |
| **KV writes/day** | **1,000** (to different keys) | STACK, ARCH §16.6, PITFALLS 5 | ~350/day (weather cache + build lock) | 65% | ⚠ Watch — 1 write/sec to the same key |
| **KV reads/day** | 100,000 | all three | ~540/day | 99% | ✅ Never use KV as a site-wide page cache |
| **R2 storage** | **10 GB-month** | STACK, ARCH §10.5/§16.4, PITFALLS 5 | ~7.1 GB/year growing ~0.6 GB/mo | 40% | ⚠ **Hits ~month 14.** Mitigate: 12-month lifecycle rule on `media/` only — never on `og/` |
| **R2 Class A ops/month** | 1,000,000 | STACK, ARCH §16.4 | ~13,300/mo | 98.7% | ✅ |
| **R2 Class B ops/month** | 10,000,000 | STACK, ARCH §16.4 | ~320,000/mo | 96.8% | ✅ |
| **R2 egress** | free | all three | — | — | ✅ |
| **R2 same-key writes** | 1/second (Free) | ARCH §16.4, PITFALLS 5 | content-addressed keys, so no hot key | — | ✅ |
| **R2 REST API** | 1,200 requests / 5 min | PITFALLS 5 | use Workers/S3 API | — | ✅ |
| **Workers AI neurons/day** | **10,000** | STACK, ARCH §16.5, PITFALLS | ~170–780/day depending on model choice | 92–98% | ✅ Cost is not the constraint; latency and determinism are |
| **Vectorize** | **Paid only** | STACK | n/a | — | ✅ Not used — int8-quantised vectors in D1 or transient embeddings only |
| **Cloudflare Images transforms/month** | **5,000** | STACK, ARCH §10.3, PITFALLS | needs 7,200/mo | **−44%** | ❌ **FAILS.** Pre-generate variants with `sharp` in CI; never bind the Images service (`imageService: 'passthrough'`) |
| **Brevo emails/day** | **300** (≈9,000/mo theoretical) | FEATURES F-10, ARCH §16.7 | 1 send/subscriber/day | — | ⚠ **Caps the newsletter at ~300 subscribers.** (STACK.md cites "5,000 emails/month" — see Gaps) |
| **Open-Meteo calls/day** | 10,000/day · 300,000/mo · **non-commercial only** · CC BY 4.0 attribution | STACK, ARCH §16.7 | 7–14/day | 99.9% | ✅ v1 only — re-evaluate before any monetisation |
| **Google News sitemap** | ≤1,000 `<news:news>`/file · 48-hour window | STACK, ARCH §12.2, FEATURES, PITFALLS 7 | ~240 URLs in window | 76% | ✅ |
| **Sitemap `<loc>` per file** | 50,000 (45,000 safe) | STACK, ARCH §12.2, PITFALLS 6 | ~27,000–44,000/yr | 46% | ✅ Shard by year |
| **Crawl budget** | **per hostname** | PITFALLS 6 | one hostname | — | ⚠ Hard rule — no subdomains (§7) |

**Three notes on reconciling this table:**

**(a) The file-cap arithmetic depends on the tier split, not the host.** STACK.md's 143 files/day and PITFALLS.md's 120 files/day both describe *story pages in the static tier*. With story pages in R2, the static tier grows at only ~18 files/day (7 date archives + ~8 topic + ~8 entity, amortised) → ~6,700 files at year 1. The two numbers are consistent; they describe different tiers.

**(b) D1 sharding: the research conflicts, and the numbers favour NOT sharding.** PITFALLS.md and ARCHITECTURE.md's technical-debt tables both say "shard D1 from day one, never a single DB," on the strength of the 500 MB/database cap. But the measured growth is **~70 MB/year** (ARCHITECTURE.md §5.2), which is ~7 years to the cap and ~70 years to the account cap — and the Free plan allows 10 databases, so the *count* isn't binding either. Meanwhile, sharding by edition **destroys the queries the product is built on**: a cluster appearing in the UK, US and CA editions would live in three databases, and cross-country flagging, the "one story, many editions" model and the Most Covered ranking are all cross-edition queries.
**Decision: one D1 database (`meridian.db`), no edition sharding.** The "retrofitting is painful" concern from PITFALLS.md is answered *structurally* rather than by sharding: all D1 access goes through a single repository module with the database ID as a config value, so sharding later is a routing change, not a rewrite. Growth is controlled by (a) the 90-day `is_prominent` flag, (b) pruning the LSH band columns on `stories` older than 30 days (the merge window is 48 h, so band data is dead weight after that — and `story_sources` retains the outlet list and URLs permanently), and (c) an alert at 60% of 500 MB. **This explicitly overrides PITFALLS.md's "Never: single D1 database for all editions."** Revisit only if the alert fires.

**(c) The two limits the project will actually hit are the Workers request ceiling and R2 storage.** The Workers request ceiling (~5,000–7,000 daily visitors) is a *growth* wall at roughly 5–7× the 1,000-visitor target, and its mitigation is a pre-agreed $5/month Workers Paid decision — not a redesign. R2 storage (~month 14) is fixed for free by a lifecycle rule that costs nothing to configure on day one and must be configured in the first phase.

### 7. Crawl budget — confirmed hard architectural rule

**Confirmed. All seven editions live on one hostname, distinguished by locale path prefix (`/uk/`, `/us/`, `/au/`, `/ca/`, `/ie/`, `/nz/`, `/in/`, `/in-hi/`). Never subdomains.**

Google's crawling-infrastructure guidance (rewritten 2026-07-22) states: *"Google's crawling infrastructure defines a site as a unique hostname. For example, https://www.example.com/ and https://code.example.com/ are treated as separate sites and have separate crawl budgets."* Three compounding consequences:

1. Seven hostnames would mean **seven independent budgets**, each starting at the conservative default for a brand-new hostname — on a project whose entire acquisition strategy is organic search.
2. Google supports **one site name per domain or subdomain**. Seven hostnames would also mean seven competing site names.
3. PITFALLS.md Pitfall 11 adds the policy risk: *"Using existing or creating new subdomains, subdirectories, or sites with the intention of continuing to violate our policies"* is named **policy circumvention**. Splitting editions across subdomains to escape a manual action is explicitly the wrong move.

**This rule is fully consistent with the §3 locale-path decision** — the same decision satisfies both. It is not in tension with anything; it is the reason §3 chose path prefixes over subdomains in the first place.

**Operational consequences to design for now:**
- Never return 5xx or 429 to Googlebot. A single 503 during a deploy window permanently ratchets the crawl capacity limit down, and it recovers over weeks.
- Use **robots.txt**, not `noindex`, to exclude URLs you do not want crawled (Google still fetches a `noindex` page, then discards it — wasted budget). Reserve `noindex` for URLs you *want* crawled but not indexed.
- Return **404 or 410** for permanently gone URLs, and **404 for empty archive/topic/section pages** (never a 200 with an empty list — soft 404s burn budget forever).
- Serve **304** for unchanged pages.
- Every indexable URL must be reachable within **3 clicks** of a front page via real `<a href>` links. No infinite scroll on any indexable surface; paginate with real anchors.
- The front page must be **immutable for the day** — no auto-refresh, no client-side reordering that changes the DOM between crawls. A new edition is published at a fixed UTC time as a new build.
- The **domain migration** (subdomain → custom domain) must be executed with **301 redirects**, never canonicals, with the sitemap and hreflang sets re-verified afterwards.

---

## Key Findings

### Recommended Stack

Full detail in [STACK.md](./STACK.md). A **single Astro 7.4.1 codebase with Tailwind CSS 4.3.3** via the `@tailwindcss/vite` plugin (not the PostCSS plugin), deployed as pure static output with **no Cloudflare adapter** to Cloudflare Workers Static Assets. One `package.json`, one lockfile, no workspace protocol. The ETL scripts, the Astro site and the Worker live in one repository so the story schema is shared and cannot drift.

**Core technologies:**

- **Astro 7.4.1** — static site generator for 7 editions + global pages. Ships zero JS by default (INP ≈ 0, CLS ≈ 0 free), a real component model for a broadsheet layout system, one language for the whole ETL + render pipeline, and `experimental.incrementalBuild` (added `astro@7.2.0`) to skip re-rendering unchanged pages.
- **Tailwind CSS 4.3.3 + `@tailwindcss/vite` 4.3.3** — v4's CSS-first `@theme` config fits a token-heavy broadsheet (paper-white / ink-black / one accent, light + dark) without a JS config file. Use the Vite plugin path, per Tailwind's own Astro guide.
- **Cloudflare Workers Static Assets (Free)** — static hosting for the static tier. Static asset requests are **free and unlimited**. 20,000 files/project free, 100,000 Paid. Non-root routes support path-based multi-project routing if ever needed.
- **Cloudflare Workers + Cron Triggers (Free)** — feed capture only. 5 cron triggers/account, 15-min wall time, 100,000 requests/day, 50 subrequests/invocation, 1,000 internal service ops.
- **Cloudflare D1 (Free)** — system of record for stories, sources, tags, entities, clusters, digests. 5M rows read/day, 100K rows written/day, 5 GB across 10 DBs (500 MB/DB), 7-day Time Travel, 30 s max query. Project needs ~70 MB/year.
- **Cloudflare R2 (Free tier)** — raw feed snapshots, story HTML (the permanent story tier), story images + variants, OG images. 10 GB-month, 1M Class A/mo, 10M Class B/mo, **free egress**.
- **Cloudflare Workers KV (Free)** — *minimal only*. 100K reads/day but only **1,000 writes/day** — use for ~60–350 keys/day (weather cache, build lock, feed ETags). Never a site-wide page cache.
- **Cloudflare Workers AI (Free)** — embeddings (dedup confirmation), digests, section tie-breaks. 10,000 neurons/day; projected use 170–780/day.
- **Wrangler 4.151.2** — the only supported way to deploy assets-only Workers and to import SQL into D1 from CI (`wrangler d1 execute --file`).
- **GitHub Actions (Free)** — the scheduled build. 2,000 min/month private, unlimited public. **No 20-minute job cap** (unlike Workers/ Pages Builds). ~360 min/month projected.

**Supporting libraries:** `fast-xml-parser@5.11.2` (RSS/Atom; 9.45 ms per realistic feed, pure JS, Node + Workers compatible), `zod@4.6.7` (schema validation at the ingest boundary), `sharp@0.35.5` (image resizing + SVG rasterisation — **Node only, never in a Worker**), `satori@0.63.0` (HTML+CSS → SVG for OG images — MPL-2.0, use as a dependency and do not copy its source), `sitemap@9.0.1` (index + chunking), `@astrojs/rss@4.0.19`, `p-limit@7.3.3`, `nanoid@6.0.2`, `vitest@5.0.5`.

**Astro 7 gotchas that must be handled in configuration, not discovered later:**
- **`compressHTML` defaults to `'jsx'` in Astro 7** — JSX whitespace rules, not HTML rules. `<span>hello</span><em>world</em>` renders as `helloworld`. A broadsheet with inline `<span>`/`<em>`/`<cite>` in headlines and bylines will silently lose spaces. **Set `compressHTML: true`** and visually verify every template that uses inline elements.
- The **Rust compiler is the only compiler** — unclosed tags are now errors, and invalid nesting (a `<div>` inside a `<p>`) is no longer auto-corrected; the browser closes the `<p>` early and the layout breaks. Never nest block elements inside `<p>` in the broadsheet templates.
- `experimental.incrementalBuild` is **mutually exclusive with `build.concurrency > 1`** — keep `build.concurrency: 1`, enable `experimental.incrementalBuild: true`, return a per-story `cacheKey`, and persist `cacheDir` between CI runs.
- `src/fetch.ts` is a reserved filename. Astro 7 uses **Sätteri** as the default Markdown processor; `@astrojs/markdown-remark` is no longer installed by default.
- If the Cloudflare adapter is ever adopted (for on-demand rendering), set `imageService: 'passthrough'` (the default `'cloudflare-binding'` silently spends the 5,000/month Cloudflare Images budget) and `prerenderEnvironment: 'node'`.

### Expected Features

Full detail in [FEATURES.md](./FEATURES.md). The feature landscape divides cleanly into table stakes (the artefact of a newspaper), differentiators (the value layer that keeps the site out of the spam bin), and anti-features (commonly requested, often policy-hostile).

**Must have (table stakes):**
- **7 edition front pages** — lead story, secondary leads, Most Covered, Editor's Picks, section index, dateline. A newspaper *is* a front page; without one there is no "edition", only a feed.
- **56 section landing pages** (8 sections × 7 editions), each a real section front page — lead + list + "Most Covered in Politics" + Most Recent. A section page that is a bare `<ul>` reads as a directory.
- **Story permalink pages** — headline, excerpt, topic tags, attribution, working outbound link, visible publication date and time, country tags, related stories, coverage line. The canonical unit of the product.
- **Date archive pages per edition** (`/{edition}/YYYY/MM/DD/`) — newspapers are dated; readers look for "yesterday's paper". Only generate pages for dates with content; empty archives return **404**.
- **Per-edition RSS feeds + `<link rel="alternate">` autodiscovery** — the fastest zero-cost re-entry path and the primary freshness channel.
- **"Most Covered" ranking module** — the genre's signature ranking (Techmeme's core algorithm; NewsBlur's Daily Briefing). Must be visible on front pages, not buried.
- **Cross-outlet source line** ("BBC · Guardian · Sky") + coverage count — the reader's reason to use an aggregator, and the originality proof point.
- **Live weather block per edition** (Open-Meteo) — a weather section without live weather looks broken.
- **Branded masthead, edition label, dateline, print-style footer** — the whole design premise. No card containers at this density; grouping with rules and negative space.
- **Attribution + working outbound link on every story** — a legal requirement and a trust signal.
- **Visible, labelled publication date and time** — required by Google News.
- **Topic tag chips → topic pages**, **related-stories module** (3–5 items), **share affordances** (OG + Twitter card), **read-time estimate**.
- **Technical SEO substrate** — XML sitemap index + separate news sitemap + pages sitemap; news sitemap carries only the last 2 days; correct `<news:publication>`/`<news:language>`; robots.txt allowing `Googlebot-News`; self-referencing canonicals; clean lowercase URLs; Search Console + Cloudflare Web Analytics; Publisher Center configuration + News Showcase panel.
- **E-E-A-T trust layer** — About, Editorial Policy, Sourcing & Methodology, Corrections policy **+ a live corrections log**, Contact with a working address, role-based author/editor pages (Person schema, honest bios — **never fabricated personas**), on-page AI/automation disclosure, Organization/WebSite schema with `alternateName`, `NewsArticle` schema, `BreadcrumbList`, `ItemList` on listing pages, a content-accuracy statement.
- **WCAG 2.2 AA** and **Core Web Vitals** (LCP < 2.5 s, INP < 200 ms, CLS < 0.1) — constraints, not features, but non-negotiable and legally exposed in the EU (European Accessibility Act).

**Should have (competitive):**
- **Cross-outlet event clustering (dedup)** — *the product*. Five outlets covering one event collapse to one entry showing "BBC · Guardian · Sky". Simultaneously the reader value, the originality proof, and the anti-scraping mechanism. **The highest-risk component in the build.**
- **Trending score from coverage volume + recency + source diversity** — Techmeme's formula with two mandatory anti-gaming refinements: discount volume when links arrive in a burst; weight by *distinct outlets*, so 5 links from one outlet ≠ 5 links from 5 outlets.
- **Editor's Picks** — a curated-feeling front page with published, rules-based selection.
- **Auto-generated daily editorial digest per country** — the single most important originality artefact. Must be genuine synthesis across the day's stories, **not** an LLM paraphrase of headlines (which is the exact pattern the March 2026 update targeted).
- **Topic + entity tagging and cross-country flagging** — powers topic/entity pages, internal linking, and multi-edition placement.
- **Topic pages with a timeline + per-topic outlet-distribution breakdown** ("BBC covered this 4×, Guardian 2×") — the aggregation itself as the value add; the strongest anti-scaled-content-abuse feature for programmatic pages.
- **Occasional original articles by the publisher** — the strongest E-E-A-T signal and the clearest evidence of a real editorial function. A human commitment, not a feature to build; must be structurally distinct (separate URL prefix, schema, byline, sitemap, front-page slot) and excluded from clustering.
- **Per-edition newsletter** (Brevo), **dynamic OG images**, **multi-edition topic/entity pages** as the acquisition engine, **related-story graph**, **per-topic chronology**.

**Defer (v1.x / v2+):**
- **Internal linking engine** (as a dedicated engine — v1 ships basic links), **pagination on archive/topic pages**, **site-wide search** (needs archive depth; also a thin-results scaled-content-abuse vector), **consensus signal** ("reported by 4 of 5 sources" — must not become an automated factual-accuracy claim; a YMYL liability), **social share buttons** beyond OG tags, **newsletter** (v1.x — it needs existing traffic and Brevo caps it at ~300 subscribers anyway).
- **v2:** advertising/monetisation (must not touch the ranking path), audio briefings, reader-facing topic following, native apps, additional country editions (a good v2 expansion — each new edition is a new doorway for a new locale cluster).

**Anti-features — explicitly rejected in v1:** full article body text; AI-translated Hindi; AI-generated bulk article pages; thin category/tag pages; duplicate date pages; infinite scroll; infinite auto-refresh / live-ticker polling; comments and UGC; reader accounts and logins; faceted programmatic pages (topic × country × date × outlet); canonicalising the seven editions to one another; hreflang across the seven editions; over-linking and keyword-stuffed anchors; keyword-stuffed `<title>` tags; artificial freshness (`dateModified` bumping on untouched stories); ad scripts / cookie banners / interstitials; auto-generated person profiles for named entities; paywall or registration gating; thin "trending now" rails; recirculating old stories as fresh.

### Architecture Approach

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md). A three-tier static-first system: **a fetch-only Worker that captures raw feeds into R2; a CI pipeline that transforms and publishes; and an edge serving a small static tier plus an R2-backed story tier.** The essential moves: heavy CPU leaves the Worker (the 10 ms budget is never approached); the build is **incremental by construction** (a render manifest means only changed clusters are re-rendered, ~200–400 story pages per cycle instead of 44,000); D1 is **write-mostly** and never on the reader-facing path; story pages are pre-rendered to R2 rather than rendered live, so there is exactly one renderer and no visual drift; and every feed, image and AI call is **individually fenced**, so one bad feed cannot fail an edition, one 403 image cannot fail a story, and one AI timeout cannot fail a digest.

**Major components (merged from ARCHITECTURE.md's 18, into the phase structure below):**

1. **Source registry + feed-health model** — the feed catalogue with per-outlet metadata, section priors, ETag, backoff state, freshness SLA, content-type sniffing, GUID-stability flag, and the **ToS verification ledger** (launch-blocking legal gate).
2. **Fetcher** — conditional GET only. Owns network I/O; must never parse.
3. **Parser / normaliser** — RSS 2.0 / Atom / RDF → canonical `RawItem`; enforces the excerpt budget; rejects malformed input loudly.
4. **Dedup / clusterer** — the differentiator. Fingerprinting (SimHash), candidate generation (LSH banding), and a two-gate merge rule with stop-list, aspect-marker and distinct-event guards. Deterministic, auditable, and **reversible**.
5. **Enricher** — section assignment (feed URL → lexicon → AI tie-break), topic/entity tagging (gazetteer first, AI second), cross-country flagging. Records method + confidence per decision.
6. **Scorer** — trending score, breadth-weighted 3× volume, 18-hour half-life decay, "Most Covered" ordering, Editor's Picks rank.
7. **Digest generator** — per-edition original prose with a deterministic template fallback and strict source-set validation.
8. **Storage** — D1 schema, migrations, indexes, 90-day prominence window, the permanence guarantee.
9. **Snapshot writer + finalizer** — serialises the dataset to a gzipped JSON blob in R2; this is the build's data contract and it decouples the build from D1 entirely.
10. **Image + OG pipeline** — content-addressed by `sha256(source_url)`, so a given publisher image is fetched and resized exactly once, ever; `sharp` → 2 WebP variants; `satori` → 1200×630 JPEG → R2.
11. **Content renderer** — one Astro codebase rendering the static tier and the story tier from one design system.
12. **Publisher / deployer** — uploads story HTML to R2, strips it from the static output, writes sitemaps, RSS and robots.txt, and **fails loudly** if the file budget or the build-duration budget is exceeded.
13. **Edge hosts** — Workers Static Assets for the static tier; the Worker script for `/story/*` (R2) and `/api/*`.
14. **Trust layer + original articles** — MDX in the repo, version-controlled, with visible `lastReviewed` dates.
15. **Growth plumbing** — Brevo newsletter, Open-Meteo weather, Web Analytics + Search Console enrolment, Publisher Center + News Showcase.

**The D1 model (from ARCHITECTURE.md §5, with corrections from §6 above):** `clusters` are the published units (one per event, immutable slug, permanent URL); `stories` are raw mentions (one row per outlet item) and are never rendered directly; `story_sources` is the many-to-many carrying display rank; `sources`, `topics`, `entities`, `sections`, `edition_clusters`, `cluster_sections`, `story_topics`, `story_entities`, `daily_digests`, `images`, `feed_fetches` and `pipeline_runs` complete the set. The critical indexes are the four LSH band indexes (without them the clusterer scans the whole story table and breaches the D1 read budget immediately), `idx_clusters_prominent`, `idx_clusters_score`, and the partial `idx_clusters_editorial`. Indexes count as additional written rows, so the write budget is computed on *physical* rows. `published_at` never changes; the 90-day window is a *flag*, not a deletion.

### Critical Pitfalls

Full detail in [PITFALLS.md](./PITFALLS.md) — 17 pitfalls with severity ratings, plus technical-debt patterns, integration gotchas, performance traps, security mistakes and UX pitfalls. The five that matter most:

1. **[S] The curation layer collapses into a republished feed → scaled content abuse / scraping manual action.** Google evaluates "main content" per page, and the site-level quality of the surrounding paper does not rescue a page whose main content is a restatement. **Prevention:** the 6-element value stack on every story page, the ≥4-of-6 build gate, the digest, the methodology page, honest bylines, and a real contact. **Never paraphrase the excerpt to dodge duplicate detection** — that converts a thin-content risk into a policy violation. *Warning signs:* median coverage count = 1; Manual Actions shows "Scraping" or "Scaled content abuse"; Search Console shows a growing "Duplicate, Google chose different canonical" bucket; you cannot answer *"what does this page provide that a reader clicking through to BBC would not get?"*
2. **[S] Free-tier ceilings fail *hard*, not softly.** D1 write-cap breach = queries refused; D1 storage-cap breach = inserts, table alters and index creation all blocked; KV limit breach = "further operations of that type will fail with an error"; Workers request cap = `Error 1027`. **Prevention:** model every projection against the official numbers in the first phase; keep `feed_fetches` on-change-only; index every filter you query (D1 bills rows *scanned*, not rows returned); never cache the whole site in KV; set Workers routes to fail-open so a quota exhaustion degrades the site rather than serving a 1027 error page.
3. **[S] Canonicalising to the original publisher zeroes organic traffic.** Canonical is a *strong* instruction, not a hint — redirects are strongest, `rel=canonical` next. **Prevention:** self-referential canonical everywhere; publisher URL as a normal followed outbound link; **no** cross-domain canonicals. See §4.
4. **[M] Dedup fails in both directions.** Under-merging makes the site a thin restatement (the operational form of pitfall 1); over-merging destroys accuracy and gets the Corrections policy exercised on day one. Headline-similarity clustering is structurally weak for news — the literature is explicit that story identification requires grouping by *events, places and people*, not text similarity. **Prevention:** a tiered, entity-first matcher — Tier 0 exact identity (canonicalised URL / GUID), Tier 1 entity + time window + action signature, Tier 2 headline similarity as a tiebreaker only; never merge on headline similarity alone; never merge disjoint entity sets; **reversible merges** (a merge that cannot be undone cannot be corrected, and a wrongly merged story permanently misattributes facts); allow a cluster's coverage count and score to grow over hours without changing its URL. *Warning signs:* median coverage count ≤1; >40% of stories with coverage 1; spikes to 8+ coverage.
5. **[M] Indexation collapse — pages written but never indexed.** Google's 2026-07-22 crawling guidance targets exactly this profile ("10,000+ unique pages with very rapidly changing content"). The four mechanisms: crawl capacity limit (falls on 5xx/429, recovers over weeks), per-hostname budget (§7), perceived inventory waste (duplicates and URL variants), and shared capacity. **Prevention:** one hostname; never 5xx/429 Googlebot; robots.txt over noindex; 404/410 for removed pages; eliminate soft 404s; serve 304; current sitemaps with accurate `<lastmod>`. *Cheap diagnostic:* publish a page, add it to the sitemap, check it with URL Inspection — indexed within a few days means crawl budget is not your problem; weeks means it is.

**Additional traps that will bite if unaddressed:** feed-level failures (a feed that stops updating, returns HTML bot-protection pages instead of XML, has unstable GUIDs, or floods with 50 items/hour) need a per-feed health model with a freshness SLA and a content gate; the news sitemap's 48-hour window and 1,000-tag cap are easy to blow; the daily digest must never invent a fact (validate every sentence against the source set; fall back to a deterministic template); and a build that silently ships a partial paper is the worst failure mode for a daily product — **build assertions must be a hard gate**.

---

## Implications for Roadmap

Seven phases. The dependency graph from ARCHITECTURE.md §15 is preserved: **Track A (pipeline) is the critical path** — Phase 2 → Phase 3 — and **Track B (design system + Astro shell) is the longest iteration pole**, running in parallel from Phase 1 onward. ARCHITECTURE.md's 19 components are merged into these 7 phases.

### Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
**Rationale:** Everything imports `shared/`, and the delivery model, the D1 strategy and the excerpt budget must be decided before any code is written. PITFALLS.md is explicit that the Pages-file-cap decision "must be made in Phase 1, not discovered in Phase 4," and that the free-tier-vs-Paid decision "changes the ingest architecture completely."

**Delivers:**
- Repo scaffold: **one `package.json`, one lockfile, no workspace protocol** (the single most common cause of "works locally, fails on the build"). `shared/types.ts`, `shared/sections.ts` (8 sections), `shared/taxonomy.ts` (gazetteers, stop-lists, lexicons), `shared/templates/*` (pure functions → HTML strings, shared by Astro and any function tier), `shared/db/*.sql`.
- DDL + migrations + seed (editions, sections, sources), with the full index set from ARCHITECTURE.md §5.
- **`config/free-tier-limits.json`** — every ceiling in one versioned file that the audit Worker reads. When Cloudflare changes a limit, one file changes, not ten code paths.
- The **D1 repository layer** (single DB id as a config value) so edition sharding, if ever needed, is a routing change rather than a rewrite.
- The **excerpt budget** as a coded, tested rule in the normaliser contract.
- The **delivery-model ADR** (Workers Static Assets, one project, R2 story tier, CI build) and the **D1-no-shard decision** with its rationale.
- **Spikes S-1 (DO CPU), S-4 (Astro build throughput on a synthetic 20,000-page build), S-5 (wrangler asset-upload diffing)** — all in the first week, all cheap, all decision-changing.
- `astro.config.mjs` with **`compressHTML: true`**, `experimental.incrementalBuild: true`, `build.concurrency: 1`.

**Addresses:** the delivery model, D1 strategy, free-tier budget, excerpt budget, one-hostname rule.
**Avoids:** Pitfall 4 (10 ms CPU — decided, not discovered), Pitfall 5 (ceilings modelled with headroom), Pitfall 2 (file cap).
**Research flag:** **YES** — but for *spikes*, not literature: the DO CPU question, the Astro throughput figure (currently a secondary-source estimate of 35–127 pages/sec), and whether wrangler re-uploads unchanged assets on every deploy.

### Phase 2 — Feed Acquisition, Raw Capture & Normalization
**Rationale:** Track A starts here and is strictly sequential. Real feed data is the prerequisite for calibrating the clusterer in Phase 3, so nothing on the critical path can start before this. The fetch-only Worker keeps CPU at ~1 ms and therefore makes the ingest architecture safe by construction.

**Delivers:**
- **Source registry + per-outlet metadata + the ToS verification ledger** — each feed's URL, publisher, country, language, section prior, and the **date its terms of use were verified**. This is a **launch-blocking legal gate**, not a technical one, and it must be settled before the feed list is locked.
- The **fetch-only ingest Worker**: 3 cron triggers, conditional GETs (ETag / If-Modified-Since), `Retry-After` honoured on 429, per-host concurrency 1, descriptive `User-Agent` with a contact URL, ≤20 requests/host/hour, hard 2 MB body ceiling with stream abort, content-type / XML-prolog sniffing to classify bot-protection pages, GUID-stability detection with a canonicalised-URL fallback identity, defensive charset decoding, exponential backoff with jitter, and a per-outlet items-per-run cap (so a live blog contributes its top items, not its whole feed). Raw bytes → R2 `raw/{date}/{source}.xml`; ETag + last status → one KV key per feed.
- The **CI transform stage**: parse (`fast-xml-parser`, configured `ignoreAttributes:false`, `attributeNamePrefix:'@_'`, `trimValues:true`) → normalize to `RawItem` (RSS 2.0, Atom, RDF; `dc:creator`, `media:content`, `content:encoded` handled explicitly) → **enforce the excerpt budget** → write unclustered `stories` rows to D1.
- The **per-feed health model**: `last_success_at`, `last_item_at`, `guid_stability_flag`, `parse_errors_24h`, `content_type_last`, `bytes_last`, `consecutive_failures`, `disabled_until`, plus a **freshness SLA per feed** — a feed that stops updating is a failure, not "no news".
- The **quarantine + flag-source path** (publisher-domain allowlist, keyword/category blocklist, minimum-relevance score; a one-click "flag source" on every story page feeding a quarantine queue). This is the closest thing to UGC the project allows without moderation staffing.

**Addresses:** feed registry, ToS verification, story normaliser with excerpt budget, per-feed health, quarantine.
**Avoids:** Pitfall 9 (feed-level failures), Pitfall 4 (CPU), Pitfall 14d (inappropriate content), Pitfall 11 (SSRF / untrusted-URL ingestion).
**Research flag:** **YES — empirical.** Publisher RSS availability, bot protection, datacenter-IP blocking, and terms of use vary per outlet and must be measured per feed, not assumed.

### Phase 3 — Curation Core: Clustering, Ranking & Enrichment
**Rationale:** **The critical path and the schedule risk.** Every differentiator depends on it — the front page, section pages, Most Covered, Editor's Picks, the source line, the digest, topic pages, the related-story graph. If clustering is not built first and well, none of the differentiators exist and the product degrades into exactly the republished feed that Google's policies target. Budget the most iteration time here.

**Delivers:**
- **Fingerprinting:** normalised token set, SimHash-64, 4 × 16-bit LSH bands stored on `stories` with the four band indexes.
- **The two-gate merge rule:** Gate 1 = surface similarity (SimHash Hamming ≤ 12 AND token Jaccard ≥ 0.55 on stop-list-filtered stemmed tokens AND ≤48 h proximity); Gate 2 = semantic agreement (shared *non-generic* entity from the gazetteer OR Jaccard ≥ 0.80). Plus the anti-merge guards: generic-token stop-list, aspect-marker conflict sets, round/ordinal guard, distinct-event guard. **When in doubt, do not merge** — under-merging is a minor quality issue, over-merging destroys the core promise.
- **Reversible merges** — every contributing source item is stored so a bad merge can be split, and a split publishes a correction note on the affected URL.
- **Two entity tiers:** the curated gazetteer (~500–1,500 entries per country, including Devanagari forms) runs pre-cluster for the entity gate; AI entity extraction runs post-cluster, once, on the cluster. **No LLM for NER** — hallucinated entities produce a long tail of garbage entity pages, which is fatal for E-E-A-T credibility.
- **Section resolver:** feed URL (decisive, confidence 0.95) → weighted lexicon (headline 3.0 / source name 2.0 / excerpt 1.0; accept if top − second ≥ 2.0) → section-specific overrides → AI tie-break only on a margin < 2.0 → `world` fallback at confidence 0.2. Every decision persists its **method and confidence** so the taxonomy is auditable and re-runnable.
- **Topic and entity tagging** (embedding-centroid clustering of the day's headlines, with a review queue for clusters far from any known entity), **cross-country flagging** (four scored signals: outlet country 0.9, entity country 0.6, gazetteer match 0.5 — headline only to count alone, story type 0.4).
- **Trending score:** `3.0·log2(1+distinct_outlets) + 1.0·log2(1+mention_count) + 5.0·recency_decay(18h half-life) + 0.8·min(1, distinct_sections−1)`. **Breadth weighted 3× volume** — 5 outlets always outrank 1 outlet × 5 mentions. Per-outlet diminishing returns so one prolific feed cannot dominate.
- **Editor's Picks** (`editorial_rank`) and the **Most Covered** ordering.
- **The labelled fixture**: ≥200–300 hand-labelled headline pairs (same-event / different-event / related-but-distinct) drawn from the real feeds, with the merge thresholds and the LSH recall measured against it. Re-label monthly.

**Addresses:** cross-outlet clustering, trending score, topic/entity/country tagging, cross-country flagging, section placement, Editor's Picks.
**Avoids:** Pitfall 8 (under/over-merge), Pitfall 1 (the value layer), Pitfall 14b (one feed dominating).
**Research flag:** **YES — the highest-value research in the project.** Merge-gate thresholds are reasoned from literature, not from this corpus. Deliverable is a measured precision/recall number, not a vibe.

### Phase 4 — Broadsheet Design System & Astro Shell
**Rationale:** Track B. **This is the longest iteration pole and it is fully independent of the ingest logic** — the design work does not depend on clustering and must start immediately, running in parallel with Phases 2 and 3. The layout must be proven before Phase 5 renders story pages from it.

**Delivers:**
- **Tailwind v4 `@theme` token set**: paper-white / ink-black / one signal accent, light + dark, spacing and type scale, hairline rules, focus-ring tokens that **exceed the hairline rule weight** (WCAG 2.2 SC 2.4.7 Focus Visible; SC 2.4.13 sets the bar at a ≥2 CSS px perimeter with ≥3:1 contrast).
- **Self-hosted OFL fonts**: a news serif (regular + bold + italic) plus a **Devanagari serif with matching bold and italic** — a Latin-only stack falls back to a system Devanagari face and breaks the broadsheet aesthetic, and the font swap is a CLS risk.
- **Two complete light/dark themes**, page theme locked, **no per-section inversion** (an inverted section reads as broken to a crawler/rater and hurts perceived quality).
- **Broadsheet primitives:** masthead, edition label, dateline, print-style footer, multi-column front-page grid, **rules and dividers instead of card containers**, high density, no `border-radius` card UI. Grouping by rules and negative space.
- **Accessibility baseline:** skip-to-content link (SC 2.4.1), focus visible (SC 2.4.7), **focus not obscured by the sticky masthead** (SC 2.4.11 — a new 2.2 criterion that broadsheet layouts fail easily), contrast ≥4.5:1 text / ≥3:1 non-text, semantic landmarks, `<article>`/`<nav>`/`<time>`/`h1–h3` hierarchy, `prefers-reduced-motion` support, **responsive to 360 px with the grid collapsing to one column at ≤640 px** (Google indexes mobile-first; the multi-column grid must reflow, not shrink).
- **The Astro shell**: routing table, layouts, the shared template layer, `compressHTML: true` with a visual check on every inline-element template, the Rust-compiler-safe markup rules (no unclosed tags, no block elements inside `<p>`), `experimental.incrementalBuild` + `build.concurrency: 1`.

**Addresses:** the design language, the WCAG 2.2 AA constraint, the Core Web Vitals constraint, the Astro shell.
**Avoids:** Pitfall 16 (UX/CWV mistakes specific to news), the Astro 7 default-behaviour traps.
**Research flag:** **NO** — well-documented patterns; the `design-taste-frontend` skill governs the visual decisions (design variance 7, motion intensity 3, visual density 7). The one sub-item worth checking is Devanagari font availability and licensing.

### Phase 5 — Publication Surface: Editions, Story Tier & Media
**Rationale:** Consumes the snapshot contract from Track A and the proven layout from Track B. This is where the tier split is implemented — and where the file budget is enforced.

**Delivers:**
- **The snapshot contract:** D1 → gzipped JSON blob + manifest → R2 → build. The build never opens a D1 binding; it reads one ~1 MB gzipped file. The same snapshot always produces the same site.
- **The static tier:** 7 edition front pages, 56 section landing pages, Most Covered pages, date archives, topic/entity pages (global, non-faceted, with a **≥5-story thin-page gate** — a quality control that happens to be a capacity control), trust pages, author pages, RSS, robots.txt, sitemaps.
- **The story tier:** the Astro story renderer → `dist/story/**` → R2 `story/{slug}.html` → served by the Worker script at `/story/*` with `Content-Type`, `ETag` and `Cache-Control: public, max-age=300, stale-while-revalidate=86400`. **Incremental by construction**: `getStaticPaths()` returns only clusters whose `updated_at` exceeds the last-rendered watermark; the manifest is written only after the R2 uploads succeed, so a failed build re-renders the same set next cycle. The static tier is always fully rebuilt (it is small and its correctness depends on the whole 90-day dataset).
- **The Worker script** (one project, `assets` + `main`, `not_found_handling: "none"`): `/story/*` → R2; `/api/*` → R2/D1/Open-Meteo; everything else → static asset, served by the CDN with **zero Worker requests**. Rate-limited and token-gated where it exposes editorial data.
- **The media pipeline:** content-addressed by `sha256(source_url)` so an image is fetched and resized **exactly once, ever**; `sharp` → 2 WebP variants (1000×563 q72 hero + 400×225 q70 thumb); `status='ready'` checked before any download; a failed image renders a typographic fallback rather than failing the build. OG images via `satori` + `sharp` → **1200×630 JPEG q80** (~50 KB, not PNG) → R2. Both on a **custom domain** (`media.{domain}`), `Cache-Control: public, max-age=31536000, immutable`, **never `r2.dev`** (not intended for production, rate-limited at hundreds of req/s → 429s).
- **Image discipline:** explicit `width`/`height` on every `<img>` (CLS = 0), `loading="lazy"` + `decoding="async"` on everything except the LCP hero, which is `loading="eager"` + `fetchpriority="high"` and preloaded, `srcset` with the correct variant, visible "Photo: {Publisher}" credit, and `alt` generated from the headline.
- **The R2 lifecycle rule** — 12-month expiry scoped to the `media/` prefix **only**; never to `og/` and never to the site root. Configure it in this phase; it costs nothing now and removes a month-14 incident.
- **The deploy step** enforcing the file budget and the build-duration budget as **hard failures** — a build that would exceed 20,000 static files or 20 minutes must fail loudly, not silently truncate.

**Addresses:** front pages, section pages, story permalink pages, date archives, topic/entity pages, story images, OG images.
**Avoids:** Pitfall 2 (file count / build time — enforced, not monitored), Pitfall 12 (soft 404s), Pitfall 16 (image dimensions and LCP).
**Research flag:** **NO** — standard patterns; this phase needs *measurement* (the file manifest, the build duration), not research.

### Phase 6 — Digest, Trust Layer & SEO/Discovery
**Rationale:** The originality artefact and the ranking-path substrate. The digest depends on the trending score (Phase 3); the trust layer and sitemaps depend on the published URLs (Phase 5). The MDX trust layer can start as soon as the shell exists (Phase 4) and runs in parallel with the rest of this phase.

**Delivers:**
- **The per-edition daily digest** (7/day, on the edition date-archive page): 300–400 words of original prose; **no headline reproduced verbatim** (asserted post-generation); **≥60% of sentences must not appear in any source headline or excerpt** (similarity check); an explicit Sources list; a deterministic **template fallback** when the AI call fails; `status='degraded'` in that case; a visible "Automated summary" note in the byline; a per-page **automation disclosure**.
- **The MDX trust layer** (all repo-native, all static, all linked from every edition's footer): About, Editorial Policy, Sourcing & Methodology (which outlets, how feeds are consumed, how dedup works, how the score is computed, **and exactly what is never reproduced**), Corrections policy **+ a live, append-only corrections log**, Contact with a working monitored address, Sources (every outlet, with the date its feed was verified), Privacy, and an **editorial-desk byline page** — role-based, honest, `Person` schema, **never a fabricated individual persona**. Visible "Last reviewed {date}" stamps.
- **Original articles** — structurally separate from aggregated clusters: different URL prefix (`/insight/`), `Article` schema with a `Person` author, excluded from clustering, excluded from the news sitemap, a distinct front-page slot, and `isBasedOn` where they draw on aggregated material.
- **`pageMeta()` — the single source of truth** emitting title, description, **self-referential canonical**, hreflang set and sitemap entry from the same record. Build-time assertions: every canonical self-referential, every `<title>` unique across the build.
- **The hreflang implementation** exactly as specified in §3 — India EN↔HI only, bidirectional, self-including, `x-default` → `/`, one implementation only.
- **Sitemaps:** a stable index; per-edition page sitemaps; per-year story sitemaps (sharded at 45,000); a **48-hour news sitemap** split at 1,000 `<news:news>` with correct `news:publication`/`news:language`/`news:publication_date`/`news:title`; a topics sitemap; an original-articles sitemap. `<lastmod>` must track **actual data changes**, not deploy time.
- **robots.txt** referencing the sitemap index, allowing `Googlebot-News`, disallowing paginated and query variants (robots.txt, never noindex).
- **RSS** per edition + per edition-section + a global feed, with the outlet list in each item, and `<link rel="alternate" type="application/rss+xml">` autodiscovery in every page head.
- **Schema.org:** `NewsArticle` (with `author` = Organization "The Meridian", `isBasedOn` + `citation` pointing at the publishers, `isAccessibleForFree`, `datePublished` = the earliest member's publication time, `dateModified` = the cluster's real last change), `Organization`/`WebSite` with `alternateName`, `Person` (real, role-based), `BreadcrumbList`, `ItemList` on listings, `CollectionPage`, `ProfilePage`.
- **Google News article requirements** implemented and asserted: visible date and time between the headline and the body; `<h1>` matching `<title>`; anchor text matching the title; headline 2–22 words, ≥10 characters, ≤110 characters; no date or number in the article title; story-relevant images ≥60×90 px; `author.url` → an author-identifying page.
- **Publisher Center configuration** (name, favicon, HQ, contact, URL verification) **+ the News Showcase panel** — with the explicit note that this is configuration, **not an enrolment or approval gate**.
- **Search Console + Cloudflare Web Analytics enrolment**, plus the **domain acquisition and the 301 redirect map** from the subdomain.

**Addresses:** daily digest, E-E-A-T trust layer, schema, technical SEO, Google News discoverability, RSS, social sharing, analytics.
**Avoids:** Pitfall 3 (canonical), Pitfall 6 (indexation), Pitfall 7 (news sitemap / Google News), Pitfall 10 (hreflang — as resolved in §3), Pitfall 11 (site reputation — first-party content on every edition), Pitfall 13 (digest hallucination + disclosure), Pitfall 15 (SEO mistakes specific to news).
**Research flag:** **PARTIAL.** Two items: (a) the **hreflang alternate-set rule for an N-of-7 edition set plus an optional Hindi variant** needs a written **spec** before implementation — that is a specification task, not more research; (b) **Hindi digest generation quality on the free tier is unverified** — test `llama-3.1-8b-instruct` and `gemma-sea-lion-v4-27b-it` against 20 real Hindi story sets, with the deterministic template digest as the default until a model passes.

### Phase 7 — Operational Hardening, Rollout & Measurement
**Rationale:** A daily product must survive feed deaths, build failures, quota exhaustion and its own growth without losing crawl budget. This phase converts the design into an operating system, and it is also where the free-tier ceilings are actively watched rather than discovered.

**Delivers:**
- **The finalize cycle:** AI pass (entities, section tie-breaks) → trending rescore (7-day window) → 90-day prominence refresh → write the 7 daily digests → weather snapshot → **one** gzipped dataset snapshot to R2 → build trigger. R2 is the right store for the snapshot (KV's 1,000-writes/day ceiling and 25 MiB value cap with no partial reads make it a poor fit; the build container has no D1 binding and the REST API path is slow and brittle).
- **Build-time assertions as a hard gate** — the build must **fail**, not deploy a broken paper: each edition has ≥8 stories in ≥6 of 8 sections; no single outlet exceeds 35% of the front page; total story count is within 60–140% of the 7-day trailing average; every story has an outlet, an excerpt, ≥1 tag, a country and a timestamp; every `<title>` is unique; every canonical is self-referential; the file count and build duration are within budget; the excerpt budget holds for every stored excerpt. A failed build leaves yesterday's paper live — the correct failure mode for a daily product. **Then deliberately break it and confirm the failure.**
- **The monitoring layer:** a daily audit Worker (~1 ms CPU) reading the D1 `usage_log` table and computing each metric as a percentage of the ceiling in `config/free-tier-limits.json`; **Cloudflare Alerts** on the hard-ceiling signals (static file count, R2 storage, Workers requests); a weekly static admin page publishing the usage table (free, and it feeds the E-E-A-T story); Brevo as the alert channel.
- **Crawl-health instrumentation:** published-page rate tracked daily against the **50–500 pages/day** band; index rate (indexed ÷ submitted) tracked weekly — **target ≥60% by week 8, below 40% for two consecutive weeks is an engineering defect, not a patience problem**; the Page Indexing report and Crawl Stats reviewed weekly; the **Manual Actions report checked weekly and always empty**; a change log correlating deploys, feed changes and schema changes with impression movements (so a single algorithm update is not misattributed).
- **Operational hardening:** feed freshness SLA alerting; a fallback build trigger if a scheduled build is missed; a **build-in-progress guard** (a second overlapping trigger must not be fired); fail-open routing on Worker quota exhaustion; the corrections workflow (correction notes on affected URLs + the Corrections log + a split of a bad merge); the quarantine review queue; per-story "flag source".
- **The newsletter** (Brevo): edition-scoped signup, **one subscriber → one edition → one email/day (never seven)**, the 300/day cap monitored from day one, an explicit overflow policy decided **before** 250 subscribers, the signup form below the fold or on its own page (never in the critical path — it must not affect LCP/INP), server-side submission so the Brevo API key never reaches the browser.
- **The weather panel** (Open-Meteo): 7 edition centroids + major cities, aggressively KV-cached with a TTL above the 2 s minimum, a visible "as of HH:MM" timestamp, source attribution, and **CC BY 4.0 attribution** in the footer. Weather must never fail a build — serve the last cached forecast or omit the panel.
- **The expectation-setting frame:** milestones on leading indicators (pages published, index rate, average coverage count, feed freshness SLA compliance, CWV pass rate, manual-action status empty). Traffic is measured against those, never against a calendar. **Do not change the content model in response to a single update** — a redesign resets the multi-month learning clock.

**Addresses:** rollout, monitoring, newsletter, weather, analytics enrolment, growth operations.
**Avoids:** Pitfall 6 (crawl health), Pitfall 14 (all operational failures), Pitfall 17 (timeline and expectation failures), Pitfall 5 (quota exhaustion), Pitfall 12 (the URL-persistence liability — via the crawl-budget discipline and the 404 rules).
**Research flag:** **NO** — standard observability and SRE patterns.

### Phase Ordering Rationale

- **Phase 1 first** because every component imports `shared/`, and because the delivery model, the D1 strategy and the excerpt budget are decisions that must be *recorded* before code exists. Three of the four highest-severity pitfalls are design decisions, and all three are cheap to make correctly now and expensive to make later.
- **Track A (Phases 2 → 3) is the critical path.** Phases 2 and 3 are strictly sequential: the clusterer needs real parsed feeds to calibrate against, and the calibration is the project's single largest quality risk. Nothing on the critical path can be parallelised; everything else can.
- **Track B (Phase 4) starts immediately and runs in parallel with Phases 2–3.** The design system and Astro shell do not depend on ingest logic at all, and design iteration is the longest cycle in any web project. Starting it late is the most common way a project like this misses its window.
- **Phase 5 needs both tracks.** It consumes the snapshot from Track A and the proven layout from Track B — the story renderer reuses the static tier's components, so it cannot be written before the layout is proven.
- **Phase 6 needs Phase 5** (it operates on published URLs) but its MDX trust layer can start as soon as Phase 4's shell exists. The digest needs Phase 3's trending score.
- **Phase 7 last** because the assertions and monitoring it delivers are only meaningful once there is something to assert about. The monitoring *Worker* itself can be built in Phase 1; the operational content arrives later.
- **Track E (source registry, section lexicons, country gazetteers, entity gazetteers) is content work, not code work.** It starts in week 1 and continues indefinitely. **It must not become a blocker for the pipeline** — start with a 30-outlet, 8-section, 7-country lexicon and grow it. The AI fallback exists precisely because these lexicons will never be complete.
- **The phase split respects granularity=standard.** 7 phases, not 19. ARCHITECTURE.md's 19 components are merged into 7 coherent deliverables; PITFALLS.md's 6-phase suggestion is expanded to 7 because the delivery-model decision (Phase 1) and the media pipeline deserve their own gates, and the design track needs to start earlier than a strictly sequential reading would allow.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** **Spikes, not literature.** S-1 Durable Object CPU on Free (contradictory official docs — 30 min, decision-changing). S-4 Astro build throughput (35–127 pages/sec is a secondary-source estimate; run a synthetic 20,000-page build). S-5 whether wrangler re-uploads unchanged assets every deploy. **All three must complete before Phase 2 starts.**
- **Phase 2:** **YES — empirical, per publisher.** Feed availability, bot protection, datacenter-IP blocking, GUID stability, terms of use. This is 40–60 individual investigations, not one research question. The ToS verification is a legal gate with a recorded date per source.
- **Phase 3:** **YES — the highest-value research in the project.** Merge-gate thresholds, the generic stop-list, aspect-marker sets and LSH band recall must be calibrated against a labelled fixture of ≥200–300 real headline pairs. The deliverable is a measured precision/recall number.
- **Phase 6:** **PARTIAL.** (a) The hreflang alternate-set rule for an N-of-7 edition set plus an optional Hindi variant needs a written **spec** before implementation — a specification task, not more research. (b) Hindi digest generation quality is unverified — a 20-story-set model bake-off, with the deterministic template as the default until one passes.

Phases with standard patterns (skip research-phase):
- **Phase 4:** Well-documented — Astro 7 + Tailwind v4 + the `design-taste-frontend` skill. Only check: Devanagari font licensing and the focus-ring/hairline-rule interaction.
- **Phase 5:** Standard — content-addressed image pipelines, incremental SSG, CDN caching. Needs *measurement*, not research.
- **Phase 7:** Standard SRE and observability. The ramp curve and index-rate expectations are third-party estimates to be re-baselined against the first 30 days of Search Console data, not researched.

### Required Spikes

| ID | Spike | Budget | Decision it unblocks | Gate |
|---|---|---|---|---|
| **S-1** | Durable Object CPU on Workers Free: burn ~2 s of CPU in a loop; does it die at 10 ms (`Error 1102`) or reach 30 s? | 30 min | Whether a DO becomes the ingest engine (would remove the R2 raw-staging step entirely) | Before Phase 2 |
| **S-2** | Worker egress vs publisher blocking: conditional GET 10 real target feeds from a Worker with a descriptive UA + contact URL | 30 min | Feed capture viability and the backoff policy | Before Phase 2 |
| **S-3** | CI egress comparison: the same 10 feeds from the GitHub Actions runner | 15 min | Confirms the Worker is the only viable fetch path (detects a surprise; does not reopen the decision) | Before Phase 2 |
| **S-4** | Astro build throughput: synthetic 20,000-page build | 60 min | Whether the static tier needs to move entity pages to R2 before year 2 | Before Phase 5 |
| **S-5** | wrangler asset-upload diffing: does it re-upload unchanged files each deploy? | 30 min | Upload time and rate-limit risk per deploy | Before Phase 5 |
| **S-6** | Hindi digest bake-off: `llama-3.1-8b-instruct` vs `gemma-sea-lion-v4-27b-it` vs the deterministic template on 20 real Hindi story sets | 90 min | The India digest model (or confirms the template as the default) | Before Phase 6 |
| **S-7** | Merge-gate calibration: hand-label ≥200–300 headline pairs; tune thresholds and measure LSH recall | 2–3 days | The thresholds themselves — the project's single largest quality risk | During Phase 3 |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | **HIGH** | All Cloudflare limits read from official documentation on 2026-10-20; package versions verified against the npm registry; XML-parsing CPU **measured locally** (9.45 ms/feed, 0.48 ms normalize, 2.06 ms for 1,770 Jaccard pairs). MEDIUM on two specific items: Durable Objects CPU on Free (official docs contradict each other) and Hindi generation quality (no benchmark exists). MEDIUM on wrangler's asset-upload diffing behaviour. |
| **Features** | **HIGH on Google policy claims** (all fetched from official Google/Google News documentation on 2026-10-20 — spam policies, helpful content, hreflang, multi-regional management, news sitemaps, Publisher Center, article best practices, site names). **MEDIUM** on competitor feature sets (vendor-controlled pages) and on the March 2026 "survival criteria" (uniqueness ratio, non-nullable unique-data column — a secondary SEO analysis, not an official Google statement). **LOW** on any OG-image CTR claim (no authoritative source exists; do not build a business case on it) and on Google News referral-traffic volume (no authoritative source; measure, do not project). |
| **Architecture** | **HIGH on Cloudflare limits, storage design and the free-tier model** (verified against official docs; the request→visitor conversion is arithmetic on those limits). **MEDIUM** on Astro build throughput (35–127 pages/sec is a single secondary source — spike S-4 resolves it), on Brevo's monthly allowance (see Gaps), on the Workers-request→visitor conversion (assumes 4 story views per visitor), and on the merge-gate thresholds (unvalidated). **LOW** on the 2027-2028 projections beyond year 1. |
| **Pitfalls** | **HIGH on Google policy and Cloudflare quota claims** (all fetched from official documentation 2026-10-20). **MEDIUM** on practitioner guidance (the 50–500 pages/day rollout band, the 3–6 month new-domain "sandbox"). **LOW** on the "60–90% ranking drop" figure in PROJECT.md — it is third-party commentary; Google publishes no per-category impact percentages. The verified fact is the update dates and durations, plus Google's statement that policy-violating sites "may rank lower in results or not appear in results at all." |

**Overall confidence: MEDIUM-HIGH.** The platform and policy facts — the ones that determine the architecture — are verified and stable. The uncertainty is concentrated in four places, each of which has a named spike or a fallback: dedup thresholds (S-7, with a template-digest / no-digest fallback), Astro build throughput (S-4, with a topic/entity-page-to-R2 fallback), the DO CPU question (S-1, with a working default already chosen), and Google News traffic volume (measured from day one via Search Console, never projected).

### Gaps to Address

- **Merge-gate thresholds and LSH recall are unvalidated.** The Jaccard 0.55 / Hamming 12 / stop-list / aspect-marker sets are reasoned from literature, not from this corpus. *Handle during Phase 3:* spike S-7 against a labelled fixture; re-label monthly. The failure modes are asymmetric — under-merging degrades quality, over-merging destroys the core promise — so the bias must be toward not merging.
- **Astro build throughput is a secondary-source figure.** *Handle during Phase 1:* spike S-4. If the real rate is below 60 pages/sec, move topic/entity pages to the R2 tier before year 2.
- **Durable Objects CPU on the Free plan is officially ambiguous.** *Handle during Phase 1:* spike S-1. The default architecture does not depend on the answer.
- **Hindi digest quality on the free tier is unverified.** *Handle during Phase 6:* spike S-6. The deterministic template digest is the default until a model passes — and it is arguably *more* original, since it involves no synthesis risk. It also respects the no-machine-translation constraint, because it composes native Hindi headlines with no translation step.
- **Google News referral traffic volume has no authoritative source.** *Handle from day one:* the Search Console Google News performance report is the measurement; treat Google News as an assumption to be measured, not a channel to be projected. The ramp curve and index-rate expectations are third-party estimates to be re-baselined after 30 days of data.
- **Publisher feed availability, terms of use and bot protection are unknown per outlet.** *Handle during Phase 2:* verify each of the 40–60 feeds and record the verification date in the `sources` table and on `/sources`. A launch-blocking legal gate, not a technical one. Some outlets (notably WSJ and some Indian publishers) may need a different approach.
- **Whether Google grants `NewsArticle` rich results for an Organization-authored curated page is unknown.** *Handle after 8 weeks of impression data:* if rich results are not granted, switch to `Article`. The page's value is in the curation and the digest, not the rich result. **Do not change it before there is impression data.**
- **Brevo's exact free allowance: 300 emails/day (FEATURES.md, ARCHITECTURE.md, both read from brevo.com/pricing on 2026-10-20) vs 5,000 emails/month (STACK.md).** The binding number is **300/day → ~300 daily subscribers**. *Handle at Phase 7 planning:* re-verify from the pricing page and decide the overflow policy before 250 subscribers (paid tier, weekly digest for the overflow, or send-on-demand).
- **Devanagari typography, font licensing and self-hosted font budget.** *Handle during Phase 4:* a Devanagari news serif (OFL, self-hosted) with matching bold and italic, correct line-height, glyph fallback, and a font-swap CLS budget.
- **Workers AI cold-start latency on the free tier is unmeasured.** *Handle during Phase 2/3:* run the ~300 embeddings + 7 generations concurrently and measure. If it exceeds ~5 minutes per build, batch the AI calls into a small Worker with a persistent isolate.
- **The `news:name` string is the single highest-impact string in the project** and it must exactly match the name on `news.google.com`. *Handle during Phase 6:* fix it once in a single config value before configuring Publisher Center, and never let it diverge.
- **The domain is not yet acquired and is launch-blocking** for Search Console verification, Google News discovery, Publisher Center URL verification and any meaningful ranking. Everything else can be built on a `workers.dev` / `pages.dev` subdomain; this cannot. *Handle immediately, in parallel with Phase 1.*
- **Whether a human editor exists for the digest review gate and for occasional original articles.** *Handle during Phase 6 planning:* this is an editorial commitment, not a feature to build. Google's helpful-content guidance treats editorial oversight as the opposite of unmonitored AI generation. If no editor is available, the digest must be disclosed as fully automated and the original-articles programme dropped from v1 rather than faked.

---

## Changes to PROJECT.md

Every change this synthesis makes to PROJECT.md, so the orchestrator can apply them. **C-1 through C-4 are corrections of existing text; C-5 through C-17 are additions of constraints the current document does not capture.**

### Requirement wording changes (Active)

| # | Current text | Replace with |
|---|---|---|
| **C-1** | "A Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule and writes normalized stories into D1" | "**A Cloudflare Worker fetches publisher RSS feeds on a schedule and persists raw feed snapshots to R2; the build pipeline normalizes, deduplicates, tags and writes stories into D1.**" — the Worker performs no parsing (10 ms CPU limit); D1 remains the system of record |
| **C-2** | "The site passes technical SEO: XML sitemaps (news and pages), robots.txt, canonicals, **hreflang across the seven editions**, RSS autodiscovery, and a clean URL structure" | "The site passes technical SEO: XML sitemaps (news and pages), robots.txt, **self-referencing canonicals**, **locale-specific URL paths for the seven country editions**, **hreflang only between the India English and India Hindi editions**, RSS autodiscovery, and a clean URL structure" |
| **C-3** | "The site is enrolled in Google News via news sitemap and Publisher Center" | "**The site is discoverable and eligible for Google News:** it publishes a compliant news sitemap (last 48 hours of URLs only, ≤1,000 `<news:news>` per file, correct `news:publication`/`news:language`/`news:publication_date`/`news:title`), allows `Googlebot-News`, and meets the Google News article requirements (visible date and time, `<h1>` matching `<title>`, headline 2–22 words and ≤110 characters, images ≥60×90 px, `author.url`, `isAccessibleForFree`). Publisher Center is configured for publication metadata and the News Showcase panel; enrolment is not a gate and no approval is pending" |
| **C-4** | "Every story has its own permanent URL with headline, excerpt, tags, source attribution, and a link to the original publisher" | "Every story has its own **permanent, edition-agnostic** URL (`/story/{slug}/`) with headline, **a summary-reference excerpt bounded at ≤50 words / ≤320 characters / ≤30% of the source article's visible text**, topic/entity tags, the multi-outlet coverage line and count, the trending rank, source attribution with a working outbound link, and a **self-referential canonical**. **One canonical story page exists per cluster**; other editions list it and link to it" |

### New requirements to add (Active)

| # | Add to Active | Rationale |
|---|---|---|
| **C-5** | "All seven editions are served from **one hostname** under locale path prefixes (`/uk/`, `/us/`, `/au/`, `/ca/`, `/ie/`, `/nz/`, `/in/`, `/in-hi/`). Edition subdomains are never used." | Google's crawl budget is per-hostname; one site name per domain; subdirectory-level site names are unsupported; subdomain splitting risks policy-circumvention optics |
| **C-6** | "The site emits a **self-referential canonical on every page** and never a cross-domain canonical. Publisher URLs appear as normal followed outbound attribution links (`rel="noopener"`, never `nofollow` or `sponsored`)." | Cross-domain canonical to the publisher drops the pages from Google's index and zeroes organic traffic |
| **C-7** | "The published excerpt is a **summary reference**: ≤50 words and ≤320 characters, ≤2 sentences, ≤30% of the source article's visible text, truncated at a word boundary with a visible ellipsis, quoted verbatim or omitted, and never paraphrased, synonymized or translated. If the source article is under 160 words, no excerpt is published." | Google News requires publishers to block content scraped "all or nearly all… without providing any substantial or clear added value"; paraphrasing to dodge duplicate detection is itself a named scaled-content-abuse example |
| **C-8** | "Every story page carries at least four of: the multi-outlet coverage line and count, the trending rank, topic/entity tags with cross-country flags, related-story links, the edition digest, the coverage byline. Enforced as a build-time gate." | Google evaluates "main content" per page; a restatement is a thin page regardless of site quality. Self-canonicalising a thin page makes the site accountable for it |
| **C-9** | "Story pages are **pre-rendered into R2** and served by an edge Worker; the static tier holds only editions, sections, archives, topic/entity pages and support files. The build fails if the static file count or the build duration exceeds budget." | The 20,000-file free-tier cap is consumed at ~day 140–167 if story pages live in the static tier |
| **C-10** | "The scheduled build runs in **CI** (GitHub Actions), not in a Cloudflare build service. The Astro build is incremental via a render manifest and `experimental.incrementalBuild`, with `build.concurrency: 1`." | Cloudflare build services cap at 20 minutes; CI has no such cap and removes the deploy-hook credential entirely |
| **C-11** | "Publisher feeds are consumed **only after their terms of use are verified**, and the verification date is recorded per source and published on the Sources page." | A launch-blocking legal gate that undercuts the entire attribution posture |
| **C-12** | "The site publishes a **per-edition daily digest** with a deterministic template fallback, a strict source-set validation gate (no headline reproduced verbatim; ≥60% of sentences not present in any source headline or excerpt), and a visible automation disclosure on every digest page." | A hallucinated digest is a worse scaled-content-abuse signal than no digest; disclosure is explicitly required |
| **C-13** | "Build assertions are a **hard gate**: minimum story count per edition and per section, no single outlet above 35% of a front page, story count within 60–140% of the 7-day mean, unique `<title>`s across the build, self-referential canonicals, the excerpt budget, and the file/duration budgets. A failed build leaves the previous edition live." | A partial paper is a silent failure; Google reads a thin section page as a quality problem |
| **C-14** | "Empty or below-threshold archive, section and topic pages return **404**, not a 200 with an empty list. Non-crawlable URL variants are excluded with **robots.txt**, never `noindex`." | Soft 404s burn crawl budget permanently; `noindex` still costs a fetch |
| **C-15** | "Free-tier ceilings are tracked against a single versioned `config/free-tier-limits.json`, with a daily audit Worker and alerts at 50% / 75% of each budget. The **Workers Paid decision point is pre-agreed**: buy the $5/month plan when daily visitors approach ~4,000, when a static project would exceed 20,000 files, or when the project earns revenue." | The Workers request ceiling (~5,000–7,000 daily visitors) is the binding growth wall; the decision must not be an emergency |
| **C-16** | "The newsletter is **edition-scoped**: one subscriber receives one edition's digest, never seven. The Brevo 300 emails/day cap is monitored from day one and the overflow policy is decided before 250 subscribers." | The free tier caps the newsletter at ~300 subscribers; seven sends per subscriber would exhaust it three times over |
| **C-17** | "All seven editions share **one site name** ('The Meridian'), set once in config and matched exactly to `<news:name>`. Edition identity appears in the `<title>`, the `<h1>` and the masthead, never as a separate site name." | Google supports one site name per domain or subdomain and not at the subdirectory level; a `news:name` mismatch silently kills Google News inclusion |

### Constraint changes

| # | Current | Replace with |
|---|---|---|
| **C-18** | **Frontend hosting:** "Cloudflare Pages, static generation with scheduled rebuilds." | "**Frontend hosting:** Cloudflare Workers Static Assets (one project: static assets + a minimal edge Worker for the story tier), deployed from CI. Astro static output with **no Cloudflare adapter**. Cloudflare Pages is not used." — Astro 6+ removed Pages support from `@astrojs/cloudflare`, and Pages carries the same 20,000-file free cap plus a 500-builds/month and 20-minute-timeout ceiling |
| **C-19** | **Domain:** "The site must be built to run on a Cloudflare Pages subdomain…" | "The site must be built to run on a `workers.dev` subdomain and to be pointed at a custom domain later **without rework**, using **301 redirects** (never canonicals) for the migration, with the sitemap and hreflang sets re-verified afterwards." |
| **C-20** | **Tech stack:** "Astro or equivalent static-first framework with Tailwind CSS v4. Server-side rendering is not required for content pages." | "Astro 7 static-first with Tailwind CSS v4, `output: 'static'`, `compressHTML: true` (Astro 7's `'jsx'` default strips whitespace between inline elements and would eat spaces in broadsheet headlines), `experimental.incrementalBuild` with `build.concurrency: 1`, and one `package.json` with no workspace protocol. Server-side rendering is not used for content pages; the story tier is pre-rendered HTML served from R2." |
| **C-21** | **Content model:** "Headline, excerpt, attribution, and link to the publisher. Full article body text is prohibited." | "Headline, **summary-reference excerpt (see C-7)**, topic/entity tags, the multi-outlet coverage line and count, the trending rank, attribution with a working outbound link, and a self-referential canonical. Full article body text is prohibited, and the excerpt is never paraphrased or translated." |
| **C-22** | **Budget:** "Zero. Every service used must have a free tier that covers the projected load. Cloudflare Workers, D1, KV, R2, **Pages**, Cron Triggers, and Web Analytics, plus Brevo for email and Open-Meteo for weather." | "Zero. Every service used must have a free tier that covers the projected load, and the projection is verified against the official limits in the first phase. Cloudflare Workers, **Workers Static Assets**, D1, KV, R2, Cron Triggers and Web Analytics, plus Brevo for email and Open-Meteo for weather. **Cloudflare Images is not used** — its 5,000 free transformations/month is exceeded by 44% at this project's volume; image variants are pre-generated with `sharp` in CI. **Open-Meteo's free tier is non-commercial only** and requires CC BY 4.0 attribution; it must be re-evaluated before any monetisation." |
| **C-23** | *(no equivalent — add to Constraints)* | "**Storage growth:** an R2 lifecycle rule expires `media/` objects after 12 months. The rule must never apply to `og/` or the site root, or a permanent story URL would lose its image. Configure it in the first phase." |
| **C-24** | *(no equivalent — add to Constraints)* | "**D1 topology:** a single database with all queries behind one repository module and the database ID as a configuration value. Edition-based sharding is not used — cross-edition queries (cross-country flagging, the one-story-many-editions model, Most Covered) are core to the product and would break across shards. Growth is controlled by the 90-day prominence flag, pruning LSH band columns older than 30 days, and an alert at 60% of the 500 MB database limit." |
| **C-25** | *(no equivalent — add to Constraints)* | "**Story URLs are permanent but rows are not all permanent.** A story's URL resolves forever; the `stories` raw-mention rows are pruned after 30 days once their merge window has closed, with `story_sources` retaining the outlet list, headline and URL permanently." |

### Key Decisions to add

| Decision | Rationale | Outcome |
|---|---|---|
| Cloudflare Workers Static Assets with a single project, story tier in R2, CI builds | The 20,000-file free cap is identical on Pages and Workers Static Assets, so the host choice does not solve the file problem — the tier split does. Astro 6+ removed the Pages adapter, CI removes the 20-minute build cap, and CI removes the deploy-hook credential | Pending |
| Fetch raw in the Worker, transform and build in CI | The Workers Free cron budget is 10 ms and one feed parse measures 9.45 ms; CPU excludes network wait, so a fetch-only Worker costs ~1 ms. Parsing, dedup, resizing and rasterisation have no free-tier home inside a Worker | Pending |
| Self-referential canonicals, one canonical story page per cluster, a hard excerpt budget | A cross-domain canonical to the publisher drops the pages from Google's index and zeroes organic traffic; the originality must live in the aggregation layer, and paraphrasing the excerpt to dodge duplicate detection is itself a named policy violation | Pending |
| Locale path prefixes and self-referencing canonicals for the seven editions; hreflang only for India EN↔HI | The editions carry different stories and are therefore not localized variants of one page; hreflang across them would fight the duplicate-content model. India English and India Hindi are a genuine language parallel | Pending |
| A single hostname for all editions | Crawl budget is per-hostname; one site name per domain; subdirectory site names are unsupported; subdomain splitting risks policy-circumvention optics | Pending |
| Google News eligibility by compliance, not by enrolment | Google automatically considers all web content; there is no application, no approval queue and no approval timeline. Publisher Center is publication metadata and News Showcase | Pending |
| One D1 database with a repository abstraction, not edition sharding | The 500 MB cap is ~7 years away at the projected ~70 MB/year, and sharding would break the cross-edition queries the product is built on | Pending |
| Build assertions as a hard gate | A partial paper is a silent failure; a failed build that leaves yesterday's paper live is the correct failure mode for a daily product | Pending |

### Out of Scope — one addition

- **Adding a paid tier to avoid a free-tier ceiling as a v1 requirement.** The $5/month Workers Paid plan is the correct answer the moment the project earns revenue, or when traffic approaches ~4,000 daily visitors, or when a static project would exceed 20,000 files. Until then, the free-tier architecture (8,000+ daily visitors is not the claim; ~5,000–7,000 is the ceiling) is the design constraint. **This is a pre-agreed decision point, not an open question** — see C-15.

---

## Sources

### Primary (HIGH confidence) — official documentation, all fetched 2026-10-20

**Cloudflare:**
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — 100,000 req/day, 10 ms CPU (Free), 50 external subrequests, 6 concurrent connections, 5 cron triggers/account, 20,000 static asset files/Worker version, 64 MiB bundle, 128 MB memory, 15-min cron wall time
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Paid plan inclusions, subrequest billing, Vectorize paid-only, Queues/DO/D1/R2/KV free tiers
- [Workers Static Assets — Billing and Limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) — static asset requests free and unlimited
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) — compatibility matrix, non-root routes, `wrangler deploy` vs `wrangler pages deploy`
- [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) — 20,000 files/site, 500 builds/month, 1 concurrent build, 20-minute timeout (all plans)
- [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) — 30 s CPU per request (conflicts with the Workers Free 10 ms; footnote: "identical to the Workers script limit")
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/) — 10 DBs, 500 MB/DB, 5 GB/account, 5M rows read/day, 100K rows written/day, indexes count as extra written rows, hard-stop behaviour
- [KV Limits](https://developers.cloudflare.com/kv/platform/limits/), [R2 Pricing](https://developers.cloudflare.com/r2/pricing/), [R2 Limits](https://developers.cloudflare.com/r2/platform/limits/)
- [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [Limits](https://developers.cloudflare.com/workers-ai/platform/limits/) — 10,000 neurons/day; [Models catalog](https://developers.cloudflare.com/workers-ai/models/) — 72 models, no NER model, models requiring a paid billing method
- [Images Pricing](https://developers.cloudflare.com/images/pricing/) — 5,000 free transformations/month, and R2 + Image Resizing count against the same metric
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [Alerts](https://developers.cloudflare.com/notifications/), [Web Analytics](https://developers.cloudflare.com/web-analytics/)

**Astro / Tailwind:**
- [Upgrade to Astro v7](https://docs.astro.build/en/guides/upgrade-to/v7/) — Vite 8, Rust compiler, `compressHTML: 'jsx'`, Sätteri, `src/fetch.ts` reserved
- [@astrojs/cloudflare v14.4.1](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) — "Removed: Cloudflare Pages support"; `imageService` and `prerenderEnvironment` defaults
- [Experimental incremental static builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/) — `cacheKey`, `cacheDir`, `build.concurrency` conflict
- [Tailwind CSS — Install with Astro](https://tailwindcss.com/docs/installation/framework-guides/astro) — the `@tailwindcss/vite` path

**Google — search policy:**
- [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies) — scaled content abuse, scraping, doorway abuse, site reputation policy, policy circumvention
- [Update to the Site Reputation Policy](https://developers.google.com/search/blog/2026/08/update-site-reputation-policy) — EEA vs non-EEA enforcement from 2026-08-30
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — "attribution… doesn't replace the need for original effort"; rater guidelines §4.6.5/§4.6.6
- [Optimize your crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget) (updated 2026-07-22) — per-hostname budget, capacity limit falls on 5xx/429, robots.txt over noindex, 404/410, soft-404 elimination
- [How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) — signal strength ordering; redirects strongest; do not mix signals
- [Tell Google about localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions) — "localized versions… are only considered duplicates if the main content remains untranslated"; generic `en`; `x-default`; bidirectional self-including sets
- [Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Provide a site name to Google Search](https://developers.google.com/search/docs/appearance/site-names) — one site name per domain/subdomain; not at subdirectory level
- [News sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap) — 48-hour window, 1,000-tag cap, required tags, `news:name` matching
- [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article), [General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Publish your byline dates](https://developers.google.com/search/docs/appearance/publication-dates) — no artificial freshness
- [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) — LCP < 2.5 s, INP < 200 ms, CLS < 0.1
- [Pagination and infinite scroll](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading), [Link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), [Title link guidance](https://developers.google.com/search/docs/appearance/title-link)
- [Regional differences in Search experience](https://developers.google.com/search/docs/appearance/aggregator-features) — Aggregator unit / Supplier unit
- [Understanding the JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) — the rendering queue applies to all 200s; `<a href>` discoverability
- [Google Search spam updates](https://developers.google.com/search/docs/appearance/spam-updates) — the multi-month learning curve

**Google News / Publisher Center:**
- [Publisher Center overview](https://support.google.com/news/publisher-center/answer/9606538) — *"Google automatically considers all web content… so you don't need to apply"*
- [Help Google News discover your web crawled content](https://support.google.com/news/publisher-center/answer/9606634)
- [Content that must be blocked from Google News](https://support.google.com/news/publisher-center/answer/9520026) — the scraping rule
- [Avoid article duplication in Google News](https://support.google.com/news/publisher-center/answer/9606800)
- [Best practices for your article pages](https://support.google.com/news/publisher-center/answer/9607104) — visible date/time, `<h1>`/`<title>` match, 2–22 words, ≤110 characters, ≥60×90 px images, `author.url`
- [Google News policies](https://support.google.com/news/publisher-center/answer/6204050) — transparency requirements
- [Google News transitions to automatically-generated publication pages](https://support.google.com/news/publisher-center/answer/15898024)

**W3C:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — SC 1.1.1, 1.3.1, 1.4.3, 1.4.11, 2.4.1, 2.4.3, 2.4.7, 2.4.11, 2.4.13, 2.5.8, 3.3.8

**Open Graph:** [The Open Graph protocol](https://ogp.me/) — required `og:title`, `og:type`, `og:image`, `og:url`

**Third-party:** [Open-Meteo pricing](https://open-meteo.com/en/pricing) (10,000 calls/day, non-commercial only, CC BY 4.0) · [Open-Meteo terms](https://open-meteo.com/en/terms) · [Brevo pricing](https://www.brevo.com/pricing/) and [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) (300 emails/day) · [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)

### Secondary (MEDIUM confidence)
- [Astro build optimisation for large SSG sites](https://www.bitdoze.com/astro-ssg-build-optimization/) — 35–127 pages/sec (the build-throughput estimate; resolve with spike S-4)
- [Programmatic SEO After March 2026](https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban) — uniqueness ratio 30–40%, non-nullable unique-data column, structural fingerprinting, rollout cadence (practitioner analysis, not Google policy)
- [Scaled Content Abuse: Google's AI Page Crackdown Guide](https://www.digitalapplied.com/blog/scaled-content-abuse-google-march-update-ai-pages-decimated) — AI Translation Spam pattern
- [NewsBlur Story Clustering](https://www.newsblur.com/features/story-clustering) · [Techmeme](https://en.wikipedia.org/wiki/Techmeme) (algorithm, anti-gaming) · [Flipboard](https://en.wikipedia.org/wiki/Flipboard) · [Newser](https://apps.apple.com/us/app/newser/id334678577) — competitor feature baselines
- [Cloudflare Community: Pages 20,000-file limit not lifted on Workers Paid](https://community.cloudflare.com/t/pages-20-000-file-limit-not-lifted-despite-workers-paid-plan-static-site-with-50k/911111) · [403s on Worker-origin requests](https://community.cloudflare.com/t/403-error-on-worker-tonight/919499) · [Bot Fight Mode breaking RSS readers](https://community.cloudflare.com/t/wordpress-rss-feed-pull-being-blocked-as-403-error/729918)
- [State of Digital Publishing: How to Setup Google Publisher Center](https://www.stateofdigitalpublishing.com/modules/google-publisher-center)

### Tertiary (LOW confidence — flagged, not relied upon)
- The **"60–90% ranking drops for aggregators in the March 2026 update"** figure in PROJECT.md is third-party commentary. Google publishes update dates and durations but no per-category impact percentages. The verified fact is the update calendar (24 Mar 2026 spam, 27 Mar 2026 core, 18 Aug 2026 spam, 24 Sep 2026 spam) and Google's statement that policy-violating sites "may rank lower in results or not appear in results at all."
- The **"50–500 pages/day rollout cadence"** is practitioner guidance, not Google policy — defensible here because the project's natural rate (120–360/day with cross-country flagging) already falls inside it.
- The **new-domain traffic ramp** (3–6 month sandbox) and the **index-rate targets** (≥60% by week 8) are practitioner estimates to be re-baselined after 30 days of Search Console data.
- **OG-image click-through lift** — no authoritative source found. Build dynamic OG images for branding and correct thumbnail selection; measure CTR; do not build a business case on an assumed lift.

---

*Research synthesized: 2026-10-20*
*Sources: [STACK.md](./STACK.md) · [FEATURES.md](./FEATURES.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [PITFALLS.md](./PITFALLS.md)*
*Ready for roadmap: yes — 7 phases, 7 spikes, 25 PROJECT.md changes, 7 free-tier limits that will actually be hit.*
