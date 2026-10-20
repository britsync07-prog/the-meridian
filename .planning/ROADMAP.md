# Roadmap: The Meridian

## Overview

The Meridian is a free, automatically-curated daily news portal publishing one broadsheet edition for each of seven countries (UK, US, Australia, Canada, Ireland, New Zealand, India, plus a parallel Hindi edition) from a single hostname. This roadmap takes it from an undecided architecture to a live, measured, indexed daily paper. The journey runs along two tracks that are deliberately separated: **Track A (the pipeline)** is strictly sequential and carries the project's single largest quality risk, the cross-outlet merge rule, while **Track B (the design system and Astro shell)** is the longest iteration pole and starts in parallel from Phase 1 because it has no dependency on ingest logic. The delivery model is fixed: a fetch-only Cloudflare Worker captures raw feed bytes to R2, CI does all transformation and building, D1 is the system of record behind one repository module, the static tier holds only editions/sections/archives/topics/entities/support files, and story pages are pre-rendered to R2 and served by an edge Worker. There is no human editor: the daily digest defaults to a deterministic template and every automated surface carries a visible disclosure. The original-articles programme is deferred to v2 rather than faked.

**Success target:** 1,000+ daily visitors and 10,000+ indexed pages within six months of launch.

**Non-negotiable architecture rules and the phase that implements each:**

| Rule | Requirement | Implemented in |
|------|-------------|----------------|
| One hostname for all editions; locale path prefixes, never subdomains | PUB-12 | Phase 5 (decided and recorded in the Phase 1 delivery-model ADR) |
| Self-referential canonicals only; never a cross-domain canonical | CON-09 | Phase 6 (decided in the Phase 1 canonical ADR; enforced by the Phase 6 metadata function) |
| hreflang only between India English and India Hindi | SEO-10 | Phase 6 |
| Build assertions fail the build, never warn | CON-07, OPS-05, OPS-06, OPS-07 | Phase 5 (story-page gate) and Phase 7 (full assertion suite) |

## Phases

- [ ] **Phase 1: Foundation, Free-Tier Contract & Architecture Decisions** - Lock the delivery model, the data contract and the free-tier budget, and run the five architecture-changing spikes before any feature code is written.
- [ ] **Phase 2: Feed Acquisition, Raw Capture & Normalization** - Fetch publisher feeds politely, capture raw bytes to R2, and normalize to canonical story items under a hard, tested excerpt budget.
- [ ] **Phase 3: Curation Core: Clustering, Ranking & Enrichment** - Collapse the same event into one multi-outlet entry, rank it by coverage and recency, and tag it for editions, sections, topics and entities, calibrated against a labelled fixture.
- [ ] **Phase 4: Broadsheet Design System & Astro Shell** - Build the paper's visual language, accessibility baseline and Astro shell; independent of ingest and running in parallel from Phase 1.
- [ ] **Phase 5: Publication Surface: Editions, Story Tier & Media** - Publish seven front pages, 56 section pages, archives, topic and entity pages, and one permanent story URL per story, with locally served images.
- [ ] **Phase 6: Digest, Trust Layer & SEO/Discovery** - Give every edition original prose and an honest trust layer, and make the whole site technically compliant, discoverable and Google-News eligible.
- [ ] **Phase 7: Operational Hardening, Rollout & Measurement** - Survive feed deaths, build failures and quota exhaustion; measure crawl health and growth instead of assuming them.

**Phase execution order:** 1 to 2 to 3 to 4 to 5 to 6 to 7, with **Phase 4 executed in parallel with Phases 2 and 3** and with the Phase 6 MDX trust layer started as soon as the Phase 4 shell exists. Phases 2 and 3 are strictly sequential: the merge rule cannot be calibrated before real feeds are flowing.

## Parallel Workstreams

These are **not phases**. They run alongside the phase sequence and must not be scheduled as if they were.

| Workstream | Starts | Ends | Notes |
|------------|--------|------|-------|
| **Domain acquisition** | Phase 1 | Before launch | Launch-blocking for Search Console verification, Publisher Center URL verification and meaningful ranking, but it has **no code dependency**. Everything else builds on the `workers.dev` subdomain and migrates later via 301 redirects (GRO-09, Phase 7). |
| **Track B: design system and Astro shell** | Phase 1 | Phase 5 | Fully independent of ingest logic. Starting it late is the most common way a project like this misses its window. **Phase 4 must not be sequenced after Phase 3.** |
| **Track E: taxonomy and lexicon curation** | Phase 1 | Continuous | The source registry, section lexicons, country gazetteers and entity gazetteers are content work, not code work. Start with a 30-outlet, 8-section, 7-country lexicon and grow it. It must never become a blocker for the pipeline. |
| **Track C: trust-layer MDX** | Phase 4 | Phase 6 | Repo-native MDX, reviewable in pull requests, publishable as soon as the Phase 4 routing and layout exist. |

## Research Spikes

Seven spikes are concrete work items, not research topics. Each has an owner phase, a budget and a decision it unblocks. Outcomes are recorded in `.planning/research/`.

| ID | Spike | Budget | Executed in | Gates | Decision rule / what is recorded |
|----|-------|--------|-------------|-------|-------------------------------|
| **S-1** | Durable Object CPU on Workers Free. Burn about 2 s of CPU in a loop; does it die at 10 ms (`Error 1102`) or reach 30 s? | 30 min | Phase 1 | **Phase 2** | If it survives, the DO becomes the ingest engine (SQLite-backed, no R2 raw staging) and the architecture simplifies materially. If it dies, the fetch-only Worker to R2 to CI default is confirmed. Either way the default builds. |
| **S-2** | Worker egress vs publisher blocking. Conditional GET of 10 real target feeds from a Worker with a descriptive UA and contact URL. | 30 min | Phase 1 | **Phase 2** | Record HTTP status, latency and any 403/429 for all 10. Confirms the fetch path and calibrates the per-host backoff policy. |
| **S-3** | CI egress comparison. The same 10 feeds from a GitHub Actions runner. | 15 min | Phase 1 | **Phase 2** | If 30% or more of publishers block the CI IP range, the Worker is definitively the only fetch path. This spike detects a surprise; it does not reopen the decision. |
| **S-4** | Astro build throughput. Synthetic 20,000-page build. | 60 min | Phase 1 | **Phase 5** | Measures pages per second and full-build duration. If the rate is below roughly 60 pages per second, topic and entity pages move to the R2 tier before year 2. |
| **S-5** | wrangler asset-upload diffing. Does it re-upload unchanged assets on every deploy? | 30 min | Phase 1 | **Phase 5** | Determines per-deploy upload time and rate-limit risk. Feeds the deploy-step budget assertion (OPS-07). |
| **S-6** | Hindi digest bake-off. `llama-3.1-8b-instruct` vs `gemma-sea-lion-v4-27b-it` vs the deterministic template on 20 real Hindi story sets. | 90 min | Phase 6 (entry gate) | **Phase 6** digest and Hindi edition | The **deterministic template digest remains the default** until a model passes. The template also respects the no-machine-translation constraint because it composes native Hindi headlines with no translation step. |
| **S-7** | Merge-gate calibration. Hand-label 200 or more real headline pairs, tune thresholds, measure LSH recall. | 2-3 days | Phase 3 (during) | **Phase 3** curation release | Produces a **measured precision and recall number**, not a vibe. The failure modes are asymmetric: under-merging degrades quality, over-merging destroys the core promise, so the bias is toward not merging. Re-label monthly. |

> **Resolution of a source conflict:** `research/SUMMARY.md` lists S-4 and S-5 as Phase 1 spikes while the phase gate for them is Phase 5. Both are satisfied by executing them in Phase 1 (they are cheap and decision-changing, and the file-cap decision in Phase 1 depends on S-4) and recording them as gates on Phase 5. S-1, S-2 and S-3 all gate Phase 2.

## Phase Details

### Phase 1: Foundation, Free-Tier Contract & Architecture Decisions
**Goal**: The delivery model, the shared data contract and the free-tier budget are decided, recorded and testable before any feature code exists, and the five architecture-changing spikes have been run.
**Depends on**: Nothing (first phase)
**Requirements**: OPS-01, OPS-04, OPS-14, MED-08
**Success Criteria** (what must be TRUE):
  1. `config/free-tier-limits.json` holds every ceiling the project depends on (Workers requests, CPU per invocation, subrequests, cron triggers, D1 rows read and written, D1 storage, KV writes, R2 storage and Class A/B ops, static file count, GitHub Actions minutes, Brevo daily sends, Open-Meteo daily calls, Google News sitemap entry limit), each with its source and verification date, and a test fails if any code path reads a ceiling from anywhere else.
  2. All datastore access goes through one repository module and the database identifier is read from configuration; pointing that identifier at an empty database and running the migration succeeds with no code change.
  3. The R2 lifecycle rule exists and is scoped to the `media/` prefix only. The live rule listing shows no rule that can match the `og/` prefix or the bucket root.
  4. The written paid-plan decision rule names all three triggers (daily visitors approaching 4,000, a static project exceeding 20,000 files, any revenue) and lives in the same versioned file the audit Worker reads, so the rule and the budget can never drift apart.
  5. Spikes S-1, S-2, S-3, S-4 and S-5 have each been executed and their outcomes recorded, with the decision each one drove and the resulting change, if any, to the delivery model.
**Plans**: 6 plans

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Repo scaffold, shared contract layer and the Astro 7 shell configuration

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — D1 schema, seed and the single repository module, with the database id held as configuration
- [x] 01-03-PLAN.md — The versioned free-tier ceiling registry and the standing no-spend decision rule
- [ ] 01-04-PLAN.md — R2 bucket with prefix-scoped lifecycle rules, the eight-project static shard and the delivery-model ADR
- [ ] 01-05-PLAN.md — The coded excerpt budget, the shared metadata and typographic fallback templates, and the image and domain ADRs

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 01-06-PLAN.md — Spikes S-1 through S-5, executed and recorded with the decision each one drove
**UI hint**: no
**Work items**:
- Repo scaffold: one `package.json`, one lockfile, no workspace protocol; `shared/types.ts`, `shared/sections.ts`, `shared/taxonomy.ts`, `shared/templates/*` (pure functions returning HTML strings, shared by every rendering tier), `shared/db/*.sql`.
- D1 DDL, migrations and seed for editions, sections and sources, with the full index set including the four LSH band indexes and the partial editorial-rank index.
- `config/free-tier-limits.json`, plus the D1 repository module with the database id as a configuration value.
- The R2 lifecycle rule scoped to `media/` only, and the paid-plan decision rule.
- Delivery-model ADR (**eight** sharded Workers Static Assets projects — one per locale prefix — plus the edge Worker for the story tier, CI builds, no Cloudflare adapter) and the D1-no-shard ADR with its rationale. **D-06 supersedes the single-project conclusion in `research/SUMMARY.md` §1 and `codebase/ARCHITECTURE.md`:** because the free tier is a permanent ceiling with no paid escape hatch (D-05), the request ceiling is a permanent wall (D-08) and the shard is mandatory infrastructure, built in this phase rather than deferred.
- `astro.config.mjs` with `compressHTML: true`, `experimental.incrementalBuild: true`, `build.concurrency: 1`.
- The excerpt budget written as a coded, tested rule in the normaliser contract (implementation and test land in Phase 2).
- **Spikes S-1, S-2, S-3, S-4, S-5.**
- **Parallel workstreams started here:** domain acquisition (deferred past launch by D-10; the accepted consequences are recorded in ADR 0004), and Track E taxonomy curation (the 30-outlet starter source registry and the eight-section lexicon seed).
**Research flag**: YES, for spikes, not literature.

### Phase 2: Feed Acquisition, Raw Capture & Normalization
**Goal**: Publisher feeds are fetched politely, captured raw, and turned into canonical story items under a hard excerpt budget, with one bad feed never able to affect another.
**Depends on**: Phase 1
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-06, ING-07, ING-08, ING-09, ING-10, CON-01, CON-02, CON-03, CON-04, CON-05
**Success Criteria** (what must be TRUE):
  1. A scheduled fetch stores a raw snapshot for every registered feed in R2 under `raw/{date}/{source}.xml` within 30 minutes of the feed publishing, and one broken feed produces no visible effect on any other feed's coverage.
  2. The fetch Worker performs no parsing, normalization or scoring. The deployed bundle contains no XML parser, and the same feed bytes captured by the Worker and by CI normalize to identical items.
  3. Every stored excerpt is at most 50 words, 320 characters, 2 sentences and 30% of the source article's visible text, truncated at a word boundary with a visible ellipsis, quoted verbatim or omitted and never paraphrased, synonymized or translated. A source article under 160 words publishes no excerpt, and a unit test fails the build on any violation.
  4. A feed whose item GUIDs change between polls is re-identified by its canonicalized source URL and produces no duplicate item. A feed that returns a non-XML body or exceeds 2 MB is quarantined for that feed only and reported with the reason, while every other feed continues to publish.
  5. Every feed is fetched only after its terms of use have been verified, with the verification date on its registry record. The fetch identifies itself with a descriptive User-Agent containing a contact URL, never exceeds 20 requests per host per hour, and honours `Retry-After` on a 429.
**Plans**: TBD
**UI hint**: no
**Work items**:
- Source registry with per-outlet metadata, section priors, ETag, last-modified, consecutive-failure count, disabled-until timestamp and the terms-of-use verification ledger (launch-blocking legal gate).
- The fetch-only ingest Worker: 3 cron triggers, conditional GET, `Retry-After` honoured, per-host concurrency 1, descriptive UA with contact URL, 20 requests per host per hour, 2 MB body ceiling with stream abort, content-type and XML-prolog sniffing to classify bot-protection pages, GUID-stability detection with canonicalized-URL fallback identity, defensive charset decoding, exponential backoff with jitter, per-outlet items-per-run cap. Raw bytes to R2; ETag and last status to one KV key per feed.
- The CI transform stage: parse (`fast-xml-parser` with `ignoreAttributes:false`, `attributeNamePrefix:'@_'`, `trimValues:true`), normalize to `RawItem` across RSS 2.0, Atom and RDF including `dc:creator`, `media:content` and `content:encoded`, enforce the excerpt budget, write unclustered `stories` rows to D1.
- The per-feed health model: `last_success_at`, `last_item_at`, GUID-stability flag, parse errors in 24 h, content type, bytes, consecutive failures, disabled-until, plus a freshness SLA per feed so a feed that stops producing is a **failure, not "no news"**.
- The quarantine path for malformed, oversized and bot-protection responses.
**Research flag**: YES, empirical and per publisher. Feed availability, bot protection, datacenter-IP blocking, GUID stability and terms of use must be measured per feed, not assumed.

### Phase 3: Curation Core: Clustering, Ranking & Enrichment
**Goal**: Stories about the same event collapse into one entry listing every outlet that covered it, ranked by coverage and recency, and tagged well enough to place them in editions, sections, topics and entity pages.
**Depends on**: Phase 2
**Requirements**: CUR-01, CUR-02, CUR-03, CUR-04, CUR-05, CUR-06, CUR-07, CUR-10, CUR-11, CUR-12, CUR-13, CUR-14, CUR-15, CON-15
**Success Criteria** (what must be TRUE):
  1. The merge rule is validated against a hand-labelled fixture of at least 200 real headline pairs, and the **measured precision and recall are recorded in the repository**. A threshold change that would drop precision below the recorded floor is rejected rather than shipped.
  2. Two items describing the same event collapse into one entry listing every outlet that covered it, every contributing item stays individually addressable so a wrong merge can be split without losing the outlet list, and a split publishes a dated correction note on the affected story URL.
  3. Two items whose entity sets are disjoint are never merged, and headline similarity is never considered without a shared non-generic entity and a close time window.
  4. A cluster's trending score decays with an 18-hour half-life and weights five distinct outlets above one outlet mentioned five times. The same score yields the same ordering for every reader of a given build, and a cluster with a coverage count of 1 is excluded from Editor's Picks.
  5. Every cluster carries topics, named entities and exactly one of the eight sections, every tagging and section decision records the method and confidence used, and model-extracted entities never generate entity pages.
**Plans**: TBD
**UI hint**: no
**Work items**:
- Fingerprinting: normalized token set, SimHash-64, four 16-bit LSH bands with the four band indexes.
- The two-gate merge rule (surface similarity plus semantic agreement) with the anti-merge guards: generic-token stop list, aspect-marker conflict sets, round/ordinal guard, distinct-event guard. **When in doubt, do not merge.**
- Reversible merges with per-item membership storage and the split to dated correction note path.
- Two entity tiers: the curated gazetteer (English and Devanagari forms) pre-cluster for the entity gate, and model-based extraction post-cluster, once, on the cluster. No LLM for named-entity recognition.
- Section resolver (feed URL, then weighted lexicon, then section overrides, then model tie-break, then a `world` fallback), persisting method and confidence per decision.
- Topic and entity tagging; cross-country flagging from outlet country, entity country, gazetteer match and story type.
- Trending score (`3.0*log2(1+distinct_outlets) + 1.0*log2(1+mentions) + 5.0*recency_decay(18h) + 0.8*min(1, distinct_sections-1)`), Most Covered ordering and Editor's Picks rank.
- The labelled fixture (200 to 300 real headline pairs: same-event, different-event, related-but-distinct), re-labelled monthly.
- **Spike S-7.**
**Research flag**: YES, the highest-value research in the project. The deliverable is a measured precision and recall number.

### Phase 4: Broadsheet Design System & Astro Shell
**Goal**: The visual language of a printed broadsheet (paper-white, ink-black, one accent, rules not cards) exists as a token set, a component library and an Astro shell that meets WCAG 2.2 AA and Core Web Vitals, and it is ready before any real content arrives.
**Depends on**: Phase 1. **Runs in parallel with Phases 2 and 3 and must not be sequenced after Phase 3.**
**Requirements**: DSN-01, DSN-02, DSN-03, DSN-04, DSN-05, DSN-06, DSN-07, DSN-08, DSN-09, DSN-10, DSN-11, DSN-12, DSN-13
**Success Criteria** (what must be TRUE):
  1. A reader on a 360 px viewport sees all page content with the multi-column grid collapsed to a single column at 640 px, with no horizontal scroll and nothing hidden behind an overflow.
  2. The first Tab press on any page lands on a visible skip-to-content link. The focus indicator is at least a 2 CSS pixel perimeter at 3:1 or better contrast and is never obscured by the sticky masthead. Body text meets 4.5:1 and non-text elements 3:1 in both the light and dark themes.
  3. Headlines and bylines keep their inter-word spacing in the built HTML, and a build that would strip it fails a visual-regression check rather than shipping silently.
  4. The page theme is locked so no section inverts against it. Grouping uses rules, dividers and negative space rather than card containers. The type scale, spacing and hairline rules all come from one token set shared by every template, and the news serif and the matching Devanagari serif are self-hosted under the SIL Open Font License.
  5. A Lighthouse run against the shell reports LCP under 2.5 s, INP under 200 ms and CLS under 0.1, the layout is usable with `prefers-reduced-motion: reduce`, and every page uses semantic landmarks with an unbroken `h1` to `h3` hierarchy and `time` elements for story times.
**Plans**: TBD
**UI hint**: yes - this phase defines the design system, the layout primitives, the theme and the responsive behaviour for every page that follows.
**Work items**:
- Tailwind v4 `@theme` token set: paper-white and ink-black bases, one signal accent, type scale, spacing, hairline rules, a complete light and dark theme, and a locked page theme with no per-section inversion.
- Self-hosted OFL fonts: a news serif (regular, bold, italic) plus a Devanagari serif with matching weights, a glyph-fallback chain and a font-swap CLS budget.
- Broadsheet primitives: masthead, edition label, dateline, print-style footer, multi-column front-page grid, rules and dividers instead of card containers, high density, no border-radius card UI.
- Accessibility baseline: skip-to-content link, focus visible, focus not obscured by the sticky masthead (SC 2.4.11), contrast in both themes, semantic landmarks, `h1` to `h3` hierarchy, `prefers-reduced-motion`, 360 px usability with a one-column collapse at 640 px.
- The Astro shell: routing table, layouts, shared template layer, `compressHTML: true` with a visual check on every inline-element template, the Rust-compiler-safe markup rules (no unclosed tags, no block elements inside `<p>`), `experimental.incrementalBuild` with `build.concurrency: 1`.
- Design decisions governed by the `design-taste-frontend` skill (design variance 7, motion intensity 3, visual density 7).
**Research flag**: NO, well-documented patterns. The one item worth checking is Devanagari font availability and licensing.

### Phase 5: Publication Surface: Editions, Story Tier & Media
**Goal**: The paper itself is published: seven edition front pages, 56 section pages, archives, topic and entity pages, and exactly one permanent, edition-agnostic story URL per story, with images served locally from a single hostname.
**Depends on**: Phases 2, 3, 4
**Requirements**: PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-07, PUB-08, PUB-09, PUB-10, PUB-11, PUB-12, PUB-13, PUB-14, PUB-15, PUB-16, PUB-17, PUB-18, MED-01, MED-02, MED-03, MED-04, MED-05, MED-06, MED-07, MED-09, CUR-08, CUR-09, CON-06, CON-07, CON-08, CON-10, OPS-09, OPS-10, OPS-11, OPS-12, OPS-13
**Success Criteria** (what must be TRUE):
  1. A reader on any edition sees a front page with a lead story, secondary leads, a Most Covered ranking, Editor's Picks, a section index and a dateline. Each of the 56 section pages shows a lead, a ranked list, a "Most Covered in {Section}" module and most-recent items. Each edition exposes dated archive pages and a Most Covered archive page.
  2. A story covered by five outlets has exactly one permanent URL at `/story/{slug}/`. Other editions list it and link to it rather than rendering a second page, the URL still resolves after the 90-day prominence window, and the page carries at least four of the six value elements. A page carrying fewer **fails the build** rather than deploying.
  3. A story's image is fetched, resized and stored exactly once, keyed by a hash of its source URL, with 1000 px and 400 px WebP variants and a 1200 by 630 JPEG Open Graph image, served from a custom media host with a one-year immutable cache and never from the default R2 development domain. An image that cannot be fetched renders a typographic fallback and never fails the build.
  4. An archive, section or topic page with no qualifying content returns 404 rather than a 200 with an empty list. A topic page appears only at five or more stories and an entity page only for a gazetteer-matched entity. Every indexable URL is reachable within three clicks of a front page through ordinary anchor links, no listing uses infinite scroll or auto-refresh, and the front page's content and ordering are identical for every visitor within a build cycle.
  5. The build re-renders only the clusters changed since the last successful build, reads its dataset from a single compressed snapshot object and never opens a datastore binding, runs in CI on a fixed schedule rather than a deploy hook, and the deployed static tier contains only editions, sections, archives, topic and entity pages and support files.
**Plans**: TBD
**UI hint**: yes - front pages, section pages, archives, topic and entity pages, the story page, the image treatment and the internal-link layout are all designed and rendered in this phase.
**Work items**:
- The snapshot contract: D1 to gzipped JSON blob plus manifest to R2 to build. The build never opens a D1 binding; the same snapshot always produces the same site.
- The static tier: 7 edition front pages, 56 section landing pages, Most Covered pages, dated archives, global topic and entity pages (non-faceted, with a 5-story thin-page gate), the India Hindi edition's eight sections from native Hindi publishers, RSS, robots.txt and sitemaps.
- The story tier: the Astro story renderer to `dist/story/**` to R2 `story/{slug}.html`, served by the edge Worker at `/story/*` with `Content-Type`, `ETag` and `Cache-Control: public, max-age=300, stale-while-revalidate=86400`. Incremental by construction; the render manifest is written only after the R2 uploads succeed.
- The Worker script: one project, `assets` plus `main`, `not_found_handling: "none"`. `/story/*` to R2, `/api/*` to R2/D1/Open-Meteo, everything else to a static asset served by the CDN with zero Worker requests.
- The media pipeline: content-addressed by `sha256(source_url)`, `sharp` to two WebP variants, `satori` plus `sharp` to a 1200 by 630 JPEG, on a custom media domain with `Cache-Control: public, max-age=31536000, immutable`, never `r2.dev`.
- Image discipline: explicit `width` and `height` on every `<img>`, `loading="lazy"` plus `decoding="async"` below the fold, `loading="eager"` plus `fetchpriority="high"` and preload for the lead image, `srcset` across variants, a visible "Photo: {Publisher}" credit, and alt text derived from the headline.
- Automatic internal links between stories, topics, entities and editions, generated from the cluster graph.
- The single-hostname routing table: all editions at locale path prefixes (`/uk/`, `/us/`, `/au/`, `/ca/`, `/ie/`, `/nz/`, `/in/`, `/in-hi/`), never subdomains.
**Research flag**: NO, standard patterns. This phase needs measurement (the file manifest, the build duration), not research.

### Phase 6: Digest, Trust Layer & SEO/Discovery
**Goal**: Every edition carries genuinely original prose and a complete, honest trust layer, and the whole site becomes technically compliant, discoverable and eligible for Google News.
**Depends on**: Phase 5 (the MDX trust layer may start as soon as the Phase 4 shell exists)
**Requirements**: CON-09, CON-11, CON-12, CON-13, CON-14, SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06, SEO-07, SEO-08, SEO-09, SEO-10, SEO-11, SEO-12, SEO-13, SEO-14, SEO-15, SEO-16, SEO-17, SEO-18, TRS-01, TRS-02, TRS-03, TRS-04, TRS-05, TRS-06, TRS-07, TRS-08, TRS-09, TRS-10, ING-05, GRO-10
**Success Criteria** (what must be TRUE):
  1. Every edition publishes a 300 to 400 word daily digest that reproduces no source headline verbatim and whose at least 60% of sentences appear in no source headline or excerpt. A digest that fails the gate is not published and the edition falls back to a deterministic template digest. Every digest and every page containing automatically generated text shows a visible notice that it was produced automatically.
  2. A reader can reach About, Editorial Policy, Sourcing and Methodology, Corrections (with a live append-only log), Contact, Privacy, the Sources page listing every outlet with the date its feed terms were verified, and a role-based editorial-desk byline page. All are linked from the footer of every edition, each shows a visible "last reviewed" date, and none names an invented individual.
  3. Every page emits a self-referential canonical and no page ever emits a canonical pointing to a publisher's domain. Publisher attribution links are normal followed links carrying `rel="noopener"` and never `nofollow` or `sponsored`. Every page declares a correct `lang` attribute, including `en-IN` and `hi-IN`.
  4. The news sitemap covers only the last 48 hours, holds at most 1,000 entries per file, and carries correct publication name, language, publication date and title. A stable sitemap index references per-edition, per-year, topic and original-content sitemaps with `<lastmod>` tracking real data changes. robots.txt allows Googlebot-News, references the index, and disallows paginated and query-string variants without using `noindex`.
  5. hreflang is emitted only between the India English and India Hindi editions, as a bidirectional self-including set with `x-default` pointing at the global front page. An India English story with no genuine Hindi counterpart declares no `hi-IN` alternate. All editions share one site name matching `<news:name>` exactly, and the domain name and homepage title contain no language they are not written in.
**Plans**: TBD
**UI hint**: yes - the trust layer adds a new family of pages (About, Editorial Policy, Methodology, Corrections, Sources, Privacy, byline) and the digest page plus the visible automation-disclosure component must match the Phase 4 design system exactly.
**Work items**:
- The per-edition daily digest (7 per day on the edition date-archive page): original prose, no verbatim headline, 60% or more novel sentences, an explicit Sources list, the deterministic template fallback with a `degraded` status, a visible "Automated summary" note and a per-page automation disclosure.
- The MDX trust layer: About, Editorial Policy, Sourcing and Methodology, the Corrections policy plus the live append-only corrections log, Contact with a monitored address, Sources, Privacy, the content-accuracy statement, and the role-based editorial-desk byline page, all with visible `lastReviewed` dates.
- `pageMeta()`, the single source of truth emitting title, description, self-referential canonical, hreflang set and sitemap entry from one record, with build-time assertions that every canonical is self-referential and every `<title>` is unique.
- The hreflang implementation exactly as specified: India EN to HI only, bidirectional, self-including, `x-default` to `/`, one implementation only.
- Sitemaps: stable index, per-edition page sitemaps, per-year story sitemaps, the 48-hour news sitemap split at 1,000, a topics sitemap, and the original-content sitemap (emitted and valid in v1; populated when the v2 original-articles programme ships).
- robots.txt, RSS per edition, per edition-section and global with the outlet list in each item, and `<link rel="alternate" type="application/rss+xml">` autodiscovery in every page head.
- Schema.org: NewsArticle with `isAccessibleForFree`, `datePublished` as the earliest member's time, `dateModified` as a real change, `isBasedOn` and `citation` to the publishers, and `author` as Organization "The Meridian"; Organization and WebSite with a single shared `alternateName`; Person on the editorial-desk byline page; BreadcrumbList, ItemList and CollectionPage on listings.
- The Google News article requirements implemented and asserted: visible date and time between the headline and the body, `<h1>` matching `<title>`, anchor text matching the title, headline 2 to 22 words and 110 characters or fewer, story-relevant images at least 60 by 90 px, and `author.url` pointing to an author-identifying page.
- Publisher Center configuration (name, favicon, headquarters, contact, URL verification) and the News Showcase panel. Configuration, not an enrolment or approval gate.
- Open Graph and Twitter card tags on story and section pages pointing at their dynamic image.
- **Spike S-6** (entry gate for the Hindi digest).
**Research flag**: PARTIAL. A written hreflang specification before implementation (a specification task, not more research), plus the Hindi digest bake-off.

### Phase 7: Operational Hardening, Rollout & Measurement
**Goal**: The daily paper survives feed deaths, build failures and its own growth, and its health is measured rather than assumed.
**Depends on**: Phases 5, 6
**Requirements**: OPS-02, OPS-03, OPS-05, OPS-06, OPS-07, OPS-08, OPS-15, OPS-16, OPS-17, OPS-18, OPS-19, OPS-20, OPS-21, OPS-22, OPS-23, GRO-01, GRO-02, GRO-03, GRO-04, GRO-05, GRO-06, GRO-07, GRO-08, GRO-09
**Success Criteria** (what must be TRUE):
  1. A deliberate violation of each build assertion (a thin edition, a section with too few stories, one outlet above 35% of a front page, a story count outside 60 to 140% of the seven-day mean, a repeated title, a non-self-referential canonical, an over-budget excerpt, an over-budget file count or build duration) **fails the build**, and the previously published edition stays live and unchanged.
  2. A daily audit Worker reports every free-tier metric as a percentage of the ceiling in the versioned limits file and fires an alert at 50% and at 75%. The paid-plan decision rule is reachable from the same report.
  3. The site never returns a 5xx or a 429 to Googlebot, edge routing fails open on quota exhaustion so the site degrades rather than erroring, and a second overlapping build is refused by a build-in-progress guard.
  4. New pages are published at a rate of 50 to 500 per day and the rate is tracked daily. The index rate is tracked weekly against a target of at least 60% indexed by week 8. The Search Console manual actions report is reviewed weekly and is empty.
  5. Traffic is measured in Cloudflare Web Analytics and Google Search Console, and the custom-domain migration from the build subdomain uses 301 redirects with the sitemap and hreflang sets re-verified afterwards. A subscriber receives exactly one email per day for their edition, with the 300 per day cap monitored and the overflow policy decided before 250 subscribers, the signup form submitting server-side and sitting outside the critical rendering path. Each edition shows live weather with a visible "as of" timestamp and provider attribution that never fails the build. A reader can flag a source or report a factual error from a story page into a queue that produces a dated correction note.
**Plans**: TBD
**UI hint**: yes - the newsletter signup form, the weather panel, the "flag source" and "report an error" controls on the story page, and the internal usage-report page are new reader-facing surfaces.
**Work items**:
- The finalize cycle: AI pass (entities, section tie-breaks), trending rescore over a 7-day window, 90-day prominence refresh, the 7 daily digests, the weather snapshot, one gzipped dataset snapshot to R2, then the build trigger.
- Build-time assertions as a hard gate, then deliberately broken and confirmed to fail.
- The monitoring layer: the daily audit Worker, Cloudflare alerts on the hard-ceiling signals, a weekly static admin page publishing the usage table, Brevo as the alert channel.
- Crawl-health instrumentation: published-page rate, index rate, the Page Indexing and Crawl Stats reports, the Manual Actions report, and a change log correlating deploys, feed changes and schema changes with impression movements.
- Operational hardening: feed freshness SLA alerting, a fallback build trigger, the build-in-progress guard, fail-open routing, the corrections workflow, the quarantine review queue, the per-story "flag source" and "report error" affordances, and the 30-day pruning of raw item rows while the cluster's outlet list, headline and URL are retained permanently.
- The newsletter (Brevo): edition-scoped signup, one subscriber to one edition to one email per day, the 300 per day cap monitored from day one, an overflow policy decided before 250 subscribers.
- The weather panel (Open-Meteo): edition centroids and major cities, cached, with a visible "as of HH:MM" timestamp, source attribution and CC BY 4.0 attribution in the footer.
- The rollout: a controlled publication rate of 50 to 500 pages per day with indexation monitoring, and the expectation-setting frame on leading indicators rather than calendar dates.
**Research flag**: NO, standard observability and SRE patterns.

## Progress

**Execution order:** 1 to 2 to 3 to 4 to 5 to 6 to 7, with Phase 4 executed in parallel with Phases 2 and 3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Free-Tier Contract & Architecture Decisions | 0/TBD | Not started | - |
| 2. Feed Acquisition, Raw Capture & Normalization | 0/TBD | Not started | - |
| 3. Curation Core: Clustering, Ranking & Enrichment | 0/TBD | Not started | - |
| 4. Broadsheet Design System & Astro Shell | 0/TBD | Not started | - |
| 5. Publication Surface: Editions, Story Tier & Media | 0/TBD | Not started | - |
| 6. Digest, Trust Layer & SEO/Discovery | 0/TBD | Not started | - |
| 7. Operational Hardening, Rollout & Measurement | 0/TBD | Not started | - |

## Requirement Coverage

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | OPS-01, OPS-04, OPS-14, MED-08 | 4 |
| 2 | ING-01, ING-02, ING-03, ING-04, ING-06, ING-07, ING-08, ING-09, ING-10, CON-01, CON-02, CON-03, CON-04, CON-05 | 14 |
| 3 | CUR-01, CUR-02, CUR-03, CUR-04, CUR-05, CUR-06, CUR-07, CUR-10, CUR-11, CUR-12, CUR-13, CUR-14, CUR-15, CON-15 | 14 |
| 4 | DSN-01 to DSN-13 | 13 |
| 5 | PUB-01 to PUB-18, MED-01 to MED-07, MED-09, CUR-08, CUR-09, CON-06, CON-07, CON-08, CON-10, OPS-09, OPS-10, OPS-11, OPS-12, OPS-13 | 37 |
| 6 | CON-09, CON-11, CON-12, CON-13, CON-14, SEO-01 to SEO-18, TRS-01 to TRS-10, ING-05, GRO-10 | 35 |
| 7 | OPS-02, OPS-03, OPS-05, OPS-06, OPS-07, OPS-08, OPS-15, OPS-16, OPS-17, OPS-18, OPS-19, OPS-20, OPS-21, OPS-22, OPS-23, GRO-01 to GRO-09 | 24 |
| **Total** | | **141 / 141** |

---

*Roadmap created: 2026-10-20, derived from `.planning/REQUIREMENTS.md` (141 v1 requirements) and `.planning/research/SUMMARY.md` (authoritative architecture).*
