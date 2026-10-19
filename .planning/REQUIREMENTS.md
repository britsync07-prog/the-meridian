# Requirements: The Meridian

**Defined:** 2026-10-20
**Core Value:** Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.

**Source:** `.planning/PROJECT.md` (post-research) + `.planning/research/SUMMARY.md`

**Note on scope:** This is a fully automated publication. There is no human editor, so the daily digest defaults to a deterministic template and every automated surface carries a visible disclosure. The original-articles programme is deferred to v2 rather than shipped with a fabricated byline.

---

## v1 Requirements

Requirements for initial release. Each maps to exactly one roadmap phase.

### Ingest Pipeline

- [ ] **ING-01**: A Cloudflare Worker fetches every registered publisher feed on a schedule using conditional GET (ETag / If-Modified-Since) and persists the raw response bytes to R2 under `raw/{date}/{source}.xml`
- [ ] **ING-02**: The fetch Worker performs no parsing, no normalization, and no scoring; all transformation happens in the CI pipeline
- [ ] **ING-03**: Each feed has a registry record holding publisher name, country, language, feed URL, section prior, ETag, last-modified, consecutive failure count, and disabled-until timestamp
- [ ] **ING-04**: A feed is fetched only after its terms of use have been verified, and the verification date is recorded on its registry record
- [ ] **ING-05**: The Sources page publishes every outlet the site aggregates, each with the date its feed terms were verified
- [ ] **ING-06**: Each feed carries a freshness SLA, and a feed that stops producing items is reported as a failure rather than as "no news"
- [ ] **ING-07**: A response that is not parseable XML, or that is larger than 2 MB, or that is served by a bot-protection page, is quarantined for that feed only and does not fail the edition
- [ ] **ING-08**: Raw feed items from RSS 2.0, Atom, and RDF normalize to a single canonical item shape, including DC creator, media content, and content-encoded variants
- [ ] **ING-09**: A feed whose item GUIDs change between polls falls back to a canonicalized source URL as its item identity
- [ ] **ING-10**: The fetch Worker identifies itself with a descriptive User-Agent containing a contact URL, requests no more than 20 times per host per hour, and honours Retry-After on a 429

### Curation Core

- [ ] **CUR-01**: Items describing the same event collapse into one cluster that lists every outlet that covered it
- [ ] **CUR-02**: Cluster membership is stored per contributing item, so any merge can be split without losing the original outlet list
- [ ] **CUR-03**: A split of a wrongly merged cluster publishes a dated correction note on the affected story URL
- [ ] **CUR-04**: The merge rule requires agreement on a shared non-generic entity and a close time window before it will consider headline similarity
- [ ] **CUR-05**: Two items whose entity sets are disjoint are never merged
- [ ] **CUR-06**: The merge rule is validated against a hand-labelled fixture of at least 200 real headline pairs, with precision and recall measured and recorded
- [ ] **CUR-07**: Every cluster carries a trending score that decays with an 18-hour half-life and weights distinct outlets three times more heavily than repeat mentions from one outlet
- [ ] **CUR-08**: An edition front page shows a "Most Covered" ranking ordered by the trending score
- [ ] **CUR-09**: An edition front page shows "Editor's Picks" selected by published, rules-based criteria
- [ ] **CUR-10**: A cluster with a coverage count of 1 is excluded from Editor's Picks
- [ ] **CUR-11**: Every cluster is tagged with topics and named entities, and each tagging decision records the method and confidence used
- [ ] **CUR-12**: Named entities are matched against a curated per-country gazetteer before any model-based extraction runs, and model-extracted entities are not used to generate entity pages
- [ ] **CUR-13**: A cluster is flagged for additional editions when its outlet country, entity country, or gazetteer match indicates relevance beyond its primary edition
- [ ] **CUR-14**: A cluster is assigned to one of the eight sections, and every assignment records whether it came from the feed source, a section lexicon, or a model tie-break, along with a confidence value
- [ ] **CUR-15**: The system ships a topic lexicon, an entity gazetteer, and a generic-token stop list per country, in English and Devanagari

### Content Model

- [ ] **CON-01**: The published excerpt is at most 50 words, at most 320 characters, and at most 2 sentences, and is at most 30 percent of the source article's visible text
- [ ] **CON-02**: An item whose source article is shorter than 160 words publishes no excerpt
- [ ] **CON-03**: A truncated excerpt ends at a word boundary and shows a visible ellipsis
- [ ] **CON-04**: Excerpts are quoted verbatim from the source or omitted; they are never paraphrased, synonymized, or translated
- [ ] **CON-05**: A unit test asserts the word, character, sentence, and source-share limits for every stored excerpt
- [ ] **CON-06**: Every story page carries at least four of these six value elements: the multi-outlet coverage line and count, the trending rank, topic and entity tags with cross-country flags, related-story links, the edition digest, and the coverage byline
- [ ] **CON-07**: A story page carrying fewer than four value elements fails the build rather than deploying
- [ ] **CON-08**: Each cluster has one permanent, edition-agnostic URL at `/story/{slug}/`; other editions list it and link to it rather than rendering a second page
- [ ] **CON-09**: Every page emits a self-referential canonical, and no page ever emits a canonical pointing to a publisher's domain
- [ ] **CON-10**: Publisher attribution links are normal followed links carrying `rel="noopener"` and never `nofollow` or `sponsored`
- [ ] **CON-11**: Each edition publishes a daily digest of 300 to 400 words, generated by a deterministic template from that edition's clusters
- [ ] **CON-12**: A digest reproduces no source headline verbatim, and at least 60 percent of its sentences appear in no source headline or excerpt
- [ ] **CON-13**: A digest that fails the validation gate in CON-12 is not published
- [ ] **CON-14**: Every digest, and every page containing automatically generated text, shows a visible notice that it was produced automatically
- [ ] **CON-15**: A cluster's publication date is the earliest publication time among its members, and its modified date reflects a real change to the cluster

### Publication Surface

- [ ] **PUB-01**: Seven edition front pages exist at `/uk/`, `/us/`, `/au/`, `/ca/`, `/ie/`, `/nz/`, `/in/`, plus a Hindi edition at `/in-hi/` and a global edition picker at `/`
- [ ] **PUB-02**: An edition front page shows a lead story, secondary leads, Most Covered, Editor's Picks, a section index, and a dateline
- [ ] **PUB-03**: Fifty-six section landing pages exist, one per section per edition
- [ ] **PUB-04**: A section landing page shows a lead story, a ranked list, a "Most Covered in {Section}" module, and most-recent items
- [ ] **PUB-05**: Each edition exposes dated archive pages at `/{edition}/{YYYY}/{MM}/{DD}/`, generated only for dates that have content
- [ ] **PUB-06**: Each edition exposes a Most Covered archive page
- [ ] **PUB-07**: Topic pages are generated globally across editions, without faceting by country, date, or outlet
- [ ] **PUB-08**: A topic page shows a chronological timeline of its stories and a breakdown of which outlets covered it and how many times
- [ ] **PUB-09**: Entity pages are generated for gazetteer-matched entities only
- [ ] **PUB-10**: A topic or entity page is published only when it holds at least five stories
- [ ] **PUB-11**: An archive, section, or topic page that has no qualifying content returns a 404 rather than a 200 with an empty list
- [ ] **PUB-12**: All editions are served from one hostname using locale path prefixes; no edition uses a subdomain
- [ ] **PUB-13**: Every indexable URL is reachable within three clicks of a front page through ordinary anchor links
- [ ] **PUB-14**: No indexable surface uses infinite scroll or auto-refresh; listing pages paginate with real anchor links
- [ ] **PUB-15**: A front page's content and ordering are identical for every visitor within a build cycle
- [ ] **PUB-16**: Links between stories, topics, entities, and editions are generated automatically from the cluster graph
- [ ] **PUB-17**: A cluster is prominent on edition front and section pages for 90 days, and its URL resolves permanently thereafter
- [ ] **PUB-18**: The India edition's eight sections are published in Hindi at `/in-hi/`, sourced from native Hindi-language publishers

### Media

- [ ] **MED-01**: A story image is fetched, resized, and stored exactly once, keyed by a hash of its source URL
- [ ] **MED-02**: Each stored image has a 1000-pixel-wide and a 400-pixel-wide WebP variant
- [ ] **MED-03**: Each story has a 1200 by 630 pixel JPEG Open Graph image
- [ ] **MED-04**: Every image element declares explicit width and height, and every image below the fold loads lazily and decodes asynchronously
- [ ] **MED-05**: The lead image on a front page loads eagerly with high fetch priority and is preloaded
- [ ] **MED-06**: Every image shows a visible credit naming the publisher it came from, and its alt text is derived from the story headline
- [ ] **MED-07**: An image that cannot be fetched renders a typographic fallback and never fails the build
- [ ] **MED-08**: An R2 lifecycle rule expires objects under the media prefix after 12 months, and is scoped so that it can never apply to Open Graph images or the site root
- [ ] **MED-09**: Media and Open Graph images are served from a custom media subdomain with a one-year immutable cache, never from the default R2 development domain

### SEO and Discovery

- [ ] **SEO-01**: A stable sitemap index references per-edition page sitemaps, per-year story sitemaps, a topics sitemap, and an original-content sitemap
- [ ] **SEO-02**: A news sitemap covers only the most recent 48 hours of story URLs, contains at most 1,000 entries per file, and carries correct publication name, language, publication date, and title fields
- [ ] **SEO-03**: A story sitemap's last-modified value reflects the actual data change time, not the deploy time
- [ ] **SEO-04**: robots.txt allows Googlebot-News, references the sitemap index, and disallows paginated and query-string URL variants
- [ ] **SEO-05**: Every page carries a `<link rel="alternate" type="application/rss+xml">` autodiscovery link
- [ ] **SEO-06**: Story pages carry NewsArticle structured data including datePublished, dateModified, headline, image, isAccessibleForFree, and citation links to each publisher
- [ ] **SEO-07**: The site carries Organization and WebSite structured data with a single alternateName shared by all editions
- [ ] **SEO-08**: The editorial-desk byline page carries Person structured data with honest, role-based descriptions and no invented individual personas
- [ ] **SEO-09**: Listing pages carry BreadcrumbList, ItemList, and CollectionPage structured data
- [ ] **SEO-10**: hreflang is emitted only between the India English and India Hindi editions, as bidirectional self-including sets with `x-default` pointing at the global front page
- [ ] **SEO-11**: An India English story with no genuine Hindi counterpart declares no `hi-IN` alternate
- [ ] **SEO-12**: Every page declares a correct `lang` attribute, including `en-IN` and `hi-IN`
- [ ] **SEO-13**: All editions share one site name, set once in configuration and matching the `<news:name>` value exactly
- [ ] **SEO-14**: Story pages meet the Google News article requirements: a visible date and time between the headline and the body, an `<h1>` matching the `<title>`, anchor text matching the title, a headline of 2 to 22 words and no more than 110 characters, and images of at least 60 by 90 pixels
- [ ] **SEO-15**: Publisher Center is configured with the publication name, favicon, headquarters, contact, and URL verification
- [ ] **SEO-16**: The News Showcase panel is configured for the publication
- [ ] **SEO-17**: The site publishes an RSS feed per edition, per edition-section, and one global feed, with the outlet list included in each item
- [ ] **SEO-18**: Story and section pages carry Open Graph and Twitter card tags pointing at their dynamic image

### Trust Layer

- [ ] **TRS-01**: An About page explains what the publication is, how it is produced, and who runs it
- [ ] **TRS-02**: An Editorial Policy states the rules the system applies when selecting, placing, and summarising stories
- [ ] **TRS-03**: A Sourcing and Methodology page names every outlet, explains how feeds are consumed, how deduplication works, how the trending score is computed, and states exactly what is never reproduced
- [ ] **TRS-04**: A Corrections policy is published alongside a live, append-only corrections log
- [ ] **TRS-05**: A Contact page carries a monitored address
- [ ] **TRS-06**: An editorial-desk byline page describes the editorial desk by role, with no invented individual personas
- [ ] **TRS-07**: A Privacy page states what is and is not collected
- [ ] **TRS-08**: A content-accuracy statement explains what the automated system can and cannot guarantee
- [ ] **TRS-09**: Every trust page shows a visible "last reviewed" date
- [ ] **TRS-10**: Every trust page is linked from the footer of every edition

### Design and Accessibility

- [ ] **DSN-01**: The interface implements the classic broadsheet design language and follows the design-taste-frontend skill for every visual decision
- [ ] **DSN-02**: The design token set defines paper-white and ink-black bases, a single accent, a type scale, spacing, hairline rules, and a complete light and dark theme
- [ ] **DSN-03**: The page theme is locked, so no section inverts against the page theme
- [ ] **DSN-04**: Fonts are self-hosted and licensed under the SIL Open Font License, comprising a news serif with regular, bold, and italic plus a Devanagari serif with matching weights
- [ ] **DSN-05**: Content is grouped with rules, dividers, and negative space; card containers are not used
- [ ] **DSN-06**: A skip-to-content link is the first focusable element on every page
- [ ] **DSN-07**: The focus indicator is at least a 2 CSS pixel perimeter with at least 3:1 contrast, and is not obscured by the sticky masthead
- [ ] **DSN-08**: Body text meets a 4.5:1 contrast ratio and non-text elements meet 3:1 in both light and dark themes
- [ ] **DSN-09**: Motion respects the user's reduced-motion preference
- [ ] **DSN-10**: The layout is usable at 360 pixels wide and the multi-column grid collapses to one column at 640 pixels
- [ ] **DSN-11**: Every page uses semantic landmarks and a single unbroken `h1` to `h3` heading hierarchy, and story times use the `time` element
- [ ] **DSN-12**: The static build sets `compressHTML: true` so whitespace between inline elements in headlines and bylines is preserved
- [ ] **DSN-13**: Pages meet the Core Web Vitals targets of LCP under 2.5 seconds, INP under 200 milliseconds, and CLS under 0.1

### Platform and Operations

- [ ] **OPS-01**: A single versioned configuration file holds every free-tier ceiling the project depends on
- [ ] **OPS-02**: A daily audit Worker reads the datastore usage log and reports each metric as a percentage of its ceiling
- [ ] **OPS-03**: Alerts fire at 50 percent and 75 percent of each budgeted resource
- [ ] **OPS-04**: A written decision rule states that the paid Workers plan is bought when daily visitors approach 4,000, when a static project would exceed 20,000 files, or when the project earns revenue
- [ ] **OPS-05**: The build fails rather than deploying when any edition has fewer than eight stories, when a section has fewer than three stories, or when one outlet supplies more than 35 percent of a front page
- [ ] **OPS-06**: The build fails rather than deploying when the story count falls outside 60 to 140 percent of the trailing seven-day mean
- [ ] **OPS-07**: The build fails rather than deploying when any title repeats, any canonical is not self-referential, any excerpt breaks its budget, or any file count or build duration exceeds budget
- [ ] **OPS-08**: A failed build leaves the previously published edition live
- [ ] **OPS-09**: The scheduled build runs in CI and triggers on a fixed schedule rather than a deploy hook
- [ ] **OPS-10**: The static build is incremental via a render manifest, so only clusters changed since the last successful build are re-rendered
- [ ] **OPS-11**: Story pages are pre-rendered to HTML, stored in R2, and served by an edge Worker with a cache header and a validator
- [ ] **OPS-12**: The static tier contains only editions, sections, archives, topic and entity pages, and support files
- [ ] **OPS-13**: The build reads its dataset from a single compressed snapshot object and never opens a datastore binding
- [ ] **OPS-14**: All datastore access goes through one repository module with the database identifier held as a configuration value
- [ ] **OPS-15**: Raw item rows are pruned 30 days after their merge window closes, while the cluster's outlet list, headline, and URL are retained permanently
- [ ] **OPS-16**: A build-in-progress guard prevents a second overlapping build from starting
- [ ] **OPS-17**: Edge routing fails open, so a quota exhaustion degrades the site rather than serving an error page
- [ ] **OPS-18**: The site never returns a 5xx or a 429 to Googlebot
- [ ] **OPS-19**: New pages are published at a rate of 50 to 500 per day, and the published-page rate is tracked daily
- [ ] **OPS-20**: The index rate is tracked weekly, with a target of at least 60 percent indexed by week 8
- [ ] **OPS-21**: The Search Console manual actions report is reviewed weekly and is always empty
- [ ] **OPS-22**: A reader can flag a source from any story page, and flagged content enters a review queue without publishing
- [ ] **OPS-23**: A reader can report a factual error on a story, and the report enters a corrections queue that produces a dated correction note

### Growth Channels

- [ ] **GRO-01**: A reader can subscribe to the daily digest for one edition
- [ ] **GRO-02**: A subscriber receives one email per day for their edition, never one per edition
- [ ] **GRO-03**: The newsletter send volume is monitored against the provider's daily cap, and an overflow policy is decided before 250 subscribers
- [ ] **GRO-04**: The newsletter signup form submits server-side, so the provider API key never reaches the browser
- [ ] **GRO-05**: The newsletter signup form sits outside the critical rendering path, so it cannot affect LCP or INP
- [ ] **GRO-06**: Each edition shows live weather for its country centroid and major cities, with a visible "as of" timestamp and provider attribution
- [ ] **GRO-07**: A weather fetch failure never fails the build; the last cached forecast is served or the panel is omitted
- [ ] **GRO-08**: Traffic is measured with Cloudflare Web Analytics and Google Search Console
- [ ] **GRO-09**: The site is reachable at a custom domain, with the migration from the build subdomain performed through 301 redirects and the sitemap and hreflang sets re-verified afterwards
- [ ] **GRO-10**: A domain name and homepage title contain no language they are not written in, so that the India Hindi edition and the global English edition remain distinguishable in search results

---

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Editorial

- **V2-EDT-01**: Original articles written by a named human editor, structurally separate from aggregated clusters with their own URL prefix, schema, byline, and front-page slot
- **V2-EDT-02**: A human review gate on the generated digest, replacing the deterministic template as the default

### Product

- **V2-PRD-01**: Site-wide search across the archive
- **V2-PRD-02**: Pagination controls on archive and topic pages beyond the crawlable anchor form
- **V2-PRD-03**: Social share buttons beyond Open Graph and Twitter card metadata
- **V2-PRD-04**: Additional country editions, each a new doorway for a new locale cluster
- **V2-PRD-05**: Reader-facing topic following and an audio version of the daily digest

### Monetization

- **V2-MON-01**: Advertising and monetization, deferred so that no ad script, cookie banner, or layout concession touches the ranking path during the growth period
- **V2-MON-02**: Re-evaluation of the Open-Meteo free tier, which is restricted to non-commercial use, before any monetization begins

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full article body text | Direct copyright exposure and the clearest trigger for Google's scaled content abuse and scraping manual actions |
| Paraphrased or machine-translated excerpts | Obfuscating a source to dodge duplicate detection is itself a named scaled-content-abuse example |
| AI-translated Hindi edition | The Hindi edition is built from native Hindi publishers; translation would be a weaker and less honest substitute |
| Reader accounts, logins, profiles | No engagement feature justifies them, and they add breach surface and support load to a read-only publication |
| Comments and user-generated content | Moderation and spam defence require staffing that conflicts with a fully automated operation model |
| Advertising in v1 | Traffic first; monetization is deferred so the ranking path is never compromised |
| Paid hosting, paid APIs, paid LLM calls | The entire platform runs on free tiers, and a dependency on a paid service breaks the project's central constraint |
| Native mobile apps | Web-first and mobile-responsive is sufficient for v1 and avoids app-store distribution overhead |
| A dedicated internal linking engine | v1 ships the automatic links it needs; a dedicated engine earns its cost only once the archive has depth |
| Faceted programmatic pages (topic by country by date by outlet) | A faceted URL space on this scale is the canonical scaled-content-abuse pattern |
| hreflang across the seven editions | The editions carry different stories, so they are not localized variants of one page; hreflang would fight the duplicate-content model |
| Canonicalising story pages to the publisher | Drops the pages from Google's index and zeroes organic traffic |
| A separate site name per edition | Google supports one site name per domain and not at the subdirectory level |
| Edition subdomains | Crawl budget is per-hostname, and subdomain splitting to escape a manual action is named policy circumvention |
| Cloudflare Images | Its free transformation allowance is exceeded by 44 percent at this project's volume; variants are pre-generated with sharp in CI |
| A paid tier bought to dodge a free-tier ceiling | The paid Workers plan is a pre-agreed decision point tied to revenue or traffic, not a v1 requirement |
| AI-generated bulk article pages | The 2026 spam update names this pattern directly |
| Automatic freshness, such as bumping a modified date | Google's publication-dates guidance explicitly prohibits artificial freshness |
| Auto-generated person profiles for named entities | Fabricated personas are an E-E-A-T liability, and the entity page set is limited to gazetteer-matched entities |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ING-01 | Phase 2 | Pending |
| ING-02 | Phase 2 | Pending |
| ING-03 | Phase 2 | Pending |
| ING-04 | Phase 2 | Pending |
| ING-05 | Phase 6 | Pending |
| ING-06 | Phase 2 | Pending |
| ING-07 | Phase 2 | Pending |
| ING-08 | Phase 2 | Pending |
| ING-09 | Phase 2 | Pending |
| ING-10 | Phase 2 | Pending |
| CUR-01 | Phase 3 | Pending |
| CUR-02 | Phase 3 | Pending |
| CUR-03 | Phase 3 | Pending |
| CUR-04 | Phase 3 | Pending |
| CUR-05 | Phase 3 | Pending |
| CUR-06 | Phase 3 | Pending |
| CUR-07 | Phase 3 | Pending |
| CUR-08 | Phase 5 | Pending |
| CUR-09 | Phase 5 | Pending |
| CUR-10 | Phase 3 | Pending |
| CUR-11 | Phase 3 | Pending |
| CUR-12 | Phase 3 | Pending |
| CUR-13 | Phase 3 | Pending |
| CUR-14 | Phase 3 | Pending |
| CUR-15 | Phase 3 | Pending |
| CON-01 | Phase 2 | Pending |
| CON-02 | Phase 2 | Pending |
| CON-03 | Phase 2 | Pending |
| CON-04 | Phase 2 | Pending |
| CON-05 | Phase 2 | Pending |
| CON-06 | Phase 5 | Pending |
| CON-07 | Phase 5 | Pending |
| CON-08 | Phase 5 | Pending |
| CON-09 | Phase 6 | Pending |
| CON-10 | Phase 5 | Pending |
| CON-11 | Phase 6 | Pending |
| CON-12 | Phase 6 | Pending |
| CON-13 | Phase 6 | Pending |
| CON-14 | Phase 6 | Pending |
| CON-15 | Phase 3 | Pending |
| PUB-01 | Phase 5 | Pending |
| PUB-02 | Phase 5 | Pending |
| PUB-03 | Phase 5 | Pending |
| PUB-04 | Phase 5 | Pending |
| PUB-05 | Phase 5 | Pending |
| PUB-06 | Phase 5 | Pending |
| PUB-07 | Phase 5 | Pending |
| PUB-08 | Phase 5 | Pending |
| PUB-09 | Phase 5 | Pending |
| PUB-10 | Phase 5 | Pending |
| PUB-11 | Phase 5 | Pending |
| PUB-12 | Phase 5 | Pending |
| PUB-13 | Phase 5 | Pending |
| PUB-14 | Phase 5 | Pending |
| PUB-15 | Phase 5 | Pending |
| PUB-16 | Phase 5 | Pending |
| PUB-17 | Phase 5 | Pending |
| PUB-18 | Phase 5 | Pending |
| MED-01 | Phase 5 | Pending |
| MED-02 | Phase 5 | Pending |
| MED-03 | Phase 5 | Pending |
| MED-04 | Phase 5 | Pending |
| MED-05 | Phase 5 | Pending |
| MED-06 | Phase 5 | Pending |
| MED-07 | Phase 5 | Pending |
| MED-08 | Phase 1 | Pending |
| MED-09 | Phase 5 | Pending |
| SEO-01 | Phase 6 | Pending |
| SEO-02 | Phase 6 | Pending |
| SEO-03 | Phase 6 | Pending |
| SEO-04 | Phase 6 | Pending |
| SEO-05 | Phase 6 | Pending |
| SEO-06 | Phase 6 | Pending |
| SEO-07 | Phase 6 | Pending |
| SEO-08 | Phase 6 | Pending |
| SEO-09 | Phase 6 | Pending |
| SEO-10 | Phase 6 | Pending |
| SEO-11 | Phase 6 | Pending |
| SEO-12 | Phase 6 | Pending |
| SEO-13 | Phase 6 | Pending |
| SEO-14 | Phase 6 | Pending |
| SEO-15 | Phase 6 | Pending |
| SEO-16 | Phase 6 | Pending |
| SEO-17 | Phase 6 | Pending |
| SEO-18 | Phase 6 | Pending |
| TRS-01 | Phase 6 | Pending |
| TRS-02 | Phase 6 | Pending |
| TRS-03 | Phase 6 | Pending |
| TRS-04 | Phase 6 | Pending |
| TRS-05 | Phase 6 | Pending |
| TRS-06 | Phase 6 | Pending |
| TRS-07 | Phase 6 | Pending |
| TRS-08 | Phase 6 | Pending |
| TRS-09 | Phase 6 | Pending |
| TRS-10 | Phase 6 | Pending |
| DSN-01 | Phase 4 | Pending |
| DSN-02 | Phase 4 | Pending |
| DSN-03 | Phase 4 | Pending |
| DSN-04 | Phase 4 | Pending |
| DSN-05 | Phase 4 | Pending |
| DSN-06 | Phase 4 | Pending |
| DSN-07 | Phase 4 | Pending |
| DSN-08 | Phase 4 | Pending |
| DSN-09 | Phase 4 | Pending |
| DSN-10 | Phase 4 | Pending |
| DSN-11 | Phase 4 | Pending |
| DSN-12 | Phase 4 | Pending |
| DSN-13 | Phase 4 | Pending |
| OPS-01 | Phase 1 | Pending |
| OPS-02 | Phase 7 | Pending |
| OPS-03 | Phase 7 | Pending |
| OPS-04 | Phase 1 | Pending |
| OPS-05 | Phase 7 | Pending |
| OPS-06 | Phase 7 | Pending |
| OPS-07 | Phase 7 | Pending |
| OPS-08 | Phase 7 | Pending |
| OPS-09 | Phase 5 | Pending |
| OPS-10 | Phase 5 | Pending |
| OPS-11 | Phase 5 | Pending |
| OPS-12 | Phase 5 | Pending |
| OPS-13 | Phase 5 | Pending |
| OPS-14 | Phase 1 | Pending |
| OPS-15 | Phase 7 | Pending |
| OPS-16 | Phase 7 | Pending |
| OPS-17 | Phase 7 | Pending |
| OPS-18 | Phase 7 | Pending |
| OPS-19 | Phase 7 | Pending |
| OPS-20 | Phase 7 | Pending |
| OPS-21 | Phase 7 | Pending |
| OPS-22 | Phase 7 | Pending |
| OPS-23 | Phase 7 | Pending |
| GRO-01 | Phase 7 | Pending |
| GRO-02 | Phase 7 | Pending |
| GRO-03 | Phase 7 | Pending |
| GRO-04 | Phase 7 | Pending |
| GRO-05 | Phase 7 | Pending |
| GRO-06 | Phase 7 | Pending |
| GRO-07 | Phase 7 | Pending |
| GRO-08 | Phase 7 | Pending |
| GRO-09 | Phase 7 | Pending |
| GRO-10 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: **141**
- Mapped to phases: **141** (100%)
- Unmapped: **0**
- Duplicated across phases: **0**

**Per-phase counts:** Phase 1 = 4 · Phase 2 = 14 · Phase 3 = 14 · Phase 4 = 13 · Phase 5 = 37 · Phase 6 = 35 · Phase 7 = 24 → **141**

---

## Cross-References

Requirements whose *work* is split across phases. The **Traceability** table above is authoritative: each requirement has exactly one phase, the one where it is verified. This table records the other phases that touch the same work, so a planner working in one phase knows what a neighbouring phase already assumed.

| Requirement | Verified in | Also touches | Note |
|-------------|-------------|--------------|------|
| ING-02 | Phase 2 | Phase 1 | The "Worker parses nothing" rule is *decided* in the Phase 1 delivery-model ADR; it is *verified* in Phase 2 by the deployed bundle and byte-identical normalization. |
| ING-05 | Phase 6 | Phase 2 | The registry and the per-feed verification date land in Phase 2; the published `/sources` page lands with the Phase 6 trust layer. |
| CON-01 to CON-05 | Phase 2 | Phase 1 | The excerpt budget is written as a coded contract in Phase 1; the normaliser implementation and the unit test land in Phase 2. |
| CON-09 | Phase 6 | Phase 1, Phase 5 | The canonical policy is recorded in the Phase 1 ADR and emitted by the Phase 5 story renderer; Phase 6 centralizes it in `pageMeta()` and asserts it. |
| CON-10 | Phase 5 | Phase 1 | The attribution-link policy (`rel="noopener"`, never `nofollow`/`sponsored`) is decided in the Phase 1 ADR and rendered by the Phase 5 story page. |
| CON-07 | Phase 5 | Phase 7 | The at-least-4-of-6 value-element gate ships with the Phase 5 story renderer; Phase 7 extends it into the consolidated build-assertion suite (OPS-05/06/07). |
| CUR-08, CUR-09 | Phase 5 | Phase 3 | The trending score and the Editor's Picks selection rule are Phase 3; the front-page modules that display them are Phase 5. |
| MED-08 | Phase 1 | Phase 5 | The R2 lifecycle rule is configured in Phase 1 (PROJECT.md requires it in the first phase); the `media/` prefix it scopes is populated from Phase 5. |
| OPS-12 | Phase 5 | Phase 1 | The tier split is decided in the Phase 1 delivery-model ADR; the deployed static-tier contents are verified in Phase 5. |
| OPS-13 | Phase 5 | Phase 1 | The snapshot contract is designed in Phase 1; the build that reads only the snapshot lands in Phase 5. |
| PUB-12 | Phase 5 | Phase 1 | The one-hostname / locale-path rule is decided in the Phase 1 ADR; the deployed routing table is verified in Phase 5. |
| GRO-09 | Phase 7 | Phase 1 | Domain *acquisition* starts as a Phase 1 parallel workstream; the 301-redirect migration and sitemap/hreflang re-verification land in Phase 7. |
| GRO-10 | Phase 6 | Phase 1 | The domain-name and homepage-title language rule is implemented in the Phase 6 metadata layer; the name itself is chosen when the domain is acquired in Phase 1. |

---

*Requirements defined: 2026-10-20*
*Last updated: 2026-10-20 after roadmap creation — traceability populated (141/141 mapped, 0 unmapped)*
