# The Meridian

## What This Is

The Meridian is a free, automatically-curated daily news portal that publishes a separate broadsheet edition for seven countries: the UK, US, Australia, Canada, Ireland, New Zealand, and India. The system fetches trending stories from those countries' major publishers on a schedule, deduplicates them across outlets, ranks them by coverage volume and recency, and publishes each surviving story on its own URL with a headline, excerpt, topic tags, and attribution back to the original publisher. Readers get the combined picture of what happened today in their country, in the visual language of an actual printed paper.

The India edition runs in both English and Hindi, with the Hindi edition sourced from native Hindi-language publishers rather than machine-translated from English.

## Core Value

Cross-outlet curation that turns many publishers' raw feeds into one genuinely useful daily paper per country, published with the speed, freshness, and discoverability that earns sustained organic search traffic.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet - ship to validate)

### Active

<!-- Current scope. Building toward these. All are hypotheses until shipped. -->

- [ ] Each of the seven country editions (UK, US, Australia, Canada, Ireland, New Zealand, India) has its own front page, section pages, and dated archive
- [ ] A Cloudflare Worker pipeline fetches publisher RSS feeds on a schedule and writes normalized stories into D1
- [ ] Stories about the same event across different outlets are collapsed into a single entry showing every outlet that covered it
- [ ] Each story carries a trending score derived from coverage volume and recency, surfaced as a "Most Covered" ranking
- [ ] Each story is auto-tagged with topic, country, and named entities, and the system flags stories relevant to more than one country edition
- [ ] Every story has its own permanent URL with headline, excerpt, tags, source attribution, and a link to the original publisher
- [ ] Each country edition publishes an auto-generated daily editorial digest giving an original summary of that day's stories
- [ ] The system supports occasional original articles written by the publisher, distinct from aggregated stories
- [ ] Each of the eight sections (Politics, Business, Technology, Sport, Health, World, Weather, Entertainment) has a landing page per country edition
- [ ] Weather sections show live forecasts from Open-Meteo for each country and its major cities
- [ ] Story images are fetched once, stored in R2, and served as resized local variants
- [ ] The India edition publishes a parallel Hindi edition sourced from native Hindi-language publishers
- [ ] Roughly 120 stories per day enter the system, with a 90-day rolling archive and permanent story URLs
- [ ] The site passes technical SEO: XML sitemaps (news and pages), robots.txt, canonicals, hreflang across the seven editions, RSS autodiscovery, and a clean URL structure
- [ ] Pages carry Schema.org markup: NewsArticle, Organization, Person, BreadcrumbList, and ItemList on section pages
- [ ] The site meets Core Web Vitals targets (LCP under 2.5s, INP under 200ms, CLS under 0.1)
- [ ] The site ships an E-E-A-T trust layer: About, Editorial Policy, Corrections, Contact, author bios, and a sourcing methodology page
- [ ] The site is enrolled in Google News via news sitemap and Publisher Center
- [ ] Topic and entity pages are generated programmatically from the tag layer
- [ ] Internal links are generated automatically between stories, topics, and country editions
- [ ] Each country edition exposes date archive pages
- [ ] Every story and section has a branded dynamic OG image generated at build time
- [ ] The site publishes an RSS feed and supports social sharing with Open Graph and Twitter cards
- [ ] Readers can subscribe to a daily newsletter via Brevo
- [ ] The site is reachable at a custom domain once one is acquired
- [ ] Traffic is measured with Cloudflare Web Analytics and Google Search Console
- [ ] The interface uses the classic broadsheet design language and is built in accordance with the design-taste-frontend skill

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Reader accounts, logins, and profiles - no engagement features to justify them, and account systems add breach surface and support load for a read-only publication
- Article comments - moderation and spam defence require ongoing human staffing, which conflicts with the fully automated operation model
- Copying full article body text from publishers - direct copyright exposure and the clearest possible trigger for Google's scaled content abuse and scraping manual actions
- Advertising and monetization - traffic first; revenue systems are deferred to v2 so nothing in the ranking path is compromised early
- Machine translation of the English edition into Hindi - native Hindi sources are both better for Hindi search demand and free of translation maintenance
- Paid hosting, paid APIs, and paid LLM calls - the entire platform runs on free tiers, and a dependency on a paid service breaks the project's central constraint
- Native mobile apps - web-first and mobile-responsive is sufficient for v1 and avoids app-store distribution overhead
- Site-wide search - deferred; it becomes valuable once the archive has meaningful depth
- User-generated content of any kind - a moderation liability with no upside for a curated daily paper

## Context

### Domain and sources

Seven country editions, each with eight sections, means 56 section landing pages plus topic, entity, and date archive pages on top of the story URLs. Target indexable page count is 10,000+ within six months, with roughly 120 stories per day producing approximately 44,000 story pages per year.

Candidate publishers per country include the BBC, Guardian, Sky News, The Independent, and the Financial Times for the UK; the New York Times, Washington Post, Wall Street Journal, CNN, and AP for the US; ABC Australia, Guardian Australia, and the Sydney Morning Herald for Australia; CBC, CTV, and the Globe and Mail for Canada; RTÉ, The Irish Times, and The Journal for Ireland; RNZ, the New Zealand Herald, and Stuff for New Zealand; and the Times of India, NDTV, and The Hindu for India, alongside Hindi-language outlets such as NDTV Hindi, Aaj Tak, and BBC Hindi. The exact feed list needs verification against each publisher's current RSS availability and terms of use before the fetch pipeline is locked in.

### The SEO reality this project is designed around

Google's spam policies explicitly target the pattern this project was originally going to use: "scraping feeds, search results, or other content to generate many pages... where little value is provided" is listed as scaled content abuse, and "republishing content from other sites without adding any original content or value" is listed as scraping. Aggregator and programmatic sites took 60-90 percent ranking drops in Google's March 2026 spam update. Sites that survived (Tripadvisor, G2, Indeed) all added unique value to the data they aggregated.

This is the single most important constraint in the project. The dedup, trending score, editor's picks, entity tagging, cross-country flagging, auto-generated daily digests, and original pieces are not nice-to-have features. They are the mechanism that keeps the site out of Google's spam bin. If the curation layer degrades into a plain republished feed, the site earns a manual action instead of rankings, and the traffic goal becomes unreachable.

Corollary: rollout cadence for new programmatic pages must be measured and controlled (roughly 50-500 pages per day with indexation monitoring), not deployed as a single mass dump.

### Design language

Classic broadsheet. News-serif headlines, hairline rules, a multi-column front page, high content density, paper-white and ink-black with a single signal accent. Tailwind CSS v4. The design-taste-frontend skill governs every visual decision; target dials are design variance 7, motion intensity 3, visual density 7. Fonts must be free and self-hosted, with a news-appropriate serif justified by the publication aesthetic. Light and dark themes both ship, with the page theme locked so no section inverts.

Card containers are inappropriate at this density. Grouping happens with rules, dividers, and negative space instead.

### Audience and success

Readers in seven countries who want to know what happened today without visiting twenty separate sites. There is no comparison product; the reader's alternative is a raw publisher feed or a conventional paywalled newspaper.

Success is defined as 1,000+ daily visitors and 10,000+ indexed pages within six months of launch. This is an honest ceiling for a free-only, new-domain site with no backlink profile, and it is treated as the planning target rather than an aspiration. Google News inclusion and the programmatic topic pages are the primary organic acquisition channels; RSS, social sharing, the newsletter, and directory submission are the supporting ones.

### Growth posture

The site is a growth asset. The success metric is traffic, and every architectural choice should be justified against it. Monetization is explicitly deferred to v2 so that no advertising script, cookie banner, or layout concession compromises the ranking path during the period when the site is establishing itself.

## Constraints

- **Budget**: Zero. Every service used must have a free tier that covers the projected load. Cloudflare Workers, D1, KV, R2, Pages, Cron Triggers, and Web Analytics, plus Brevo for email and Open-Meteo for weather.
- **Backend hosting**: Cloudflare Workers with D1 as the datastore. No VPS. This was chosen over Oracle Cloud Always Free (signup fragility, ARM architecture friction) and over a paid VPS (breaks the zero-cost constraint).
- **Frontend hosting**: Cloudflare Pages, static generation with scheduled rebuilds.
- **Domain**: Not yet acquired. The site must be built to run on a Cloudflare Pages subdomain and to be pointed at a custom domain later without rework. Domain purchase is a launch-blocking task for Google News, Search Console, and any meaningful ranking.
- **Content model**: Headline, excerpt, attribution, and link to the publisher. Full article body text is prohibited.
- **Language**: English across all seven editions. Hindi for the India edition only, sourced from native Hindi-language publishers.
- **Tech stack**: Astro or equivalent static-first framework with Tailwind CSS v4. Server-side rendering is not required for content pages.
- **Accessibility**: WCAG 2.2 AA for all user-facing surfaces, including contrast on the paper-white and ink-black palette.
- **Legal**: Every story attributes its original publisher with a working link. Feeds are consumed via their published RSS endpoints under their stated terms.
- **Timeline**: Targeting 1,000 daily visitors and 10,000 indexed pages within six months of launch.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Curated aggregation (headline + excerpt + source link) rather than full-text republication | Full-text republication is direct copyright exposure and the clearest trigger for Google's scaled content abuse manual action | - Pending |
| Cross-outlet deduplication as the core product, not a side feature | It is the specific value that distinguishes a surviving aggregator from a demoted one, and it is what makes a reader prefer the combined view over any single source | - Pending |
| One broadsheet edition per country | Each edition is a separate doorway for that country's search demand; a single global front page with filters cannot target them independently | - Pending |
| Seven country editions in v1 | UK, US, Australia, Canada, Ireland, New Zealand, and India cover the largest English-language news markets plus the Hindi opportunity | - Pending |
| Eight sections per edition | Politics, Business, Technology, Sport, Health, World, Weather, and Entertainment cover the recurring section structure of the target publications | - Pending |
| Cloudflare Workers + D1 over a VPS | Zero cost, no card, no server administration, cron triggers fit a scheduled fetch pipeline exactly, and it keeps the whole project inside one vendor | - Pending |
| Cloudflare Pages for the frontend | Static generation at the edge with scheduled rebuilds is the fastest possible path to strong Core Web Vitals at zero cost | - Pending |
| Images cached to R2 with resized variants | Hotlinking breaks, loads slowly, and gets blocked by publishers; local resized variants give fast, stable images and a free 10 GB budget | - Pending |
| Brevo for the newsletter | Best free balance of daily send volume, deliverability, and built-in signup forms | - Pending |
| Cloudflare Web Analytics plus Search Console | Both are free, and together they cover on-site behaviour and organic search performance | - Pending |
| Native Hindi sources instead of machine translation | Native Hindi content matches Hindi search demand directly and eliminates a translation pipeline that would need a paid API or a Workers AI dependency | - Pending |
| Auto-generated daily digest per country | Guarantees every edition carries genuinely original text, which is both an originality signal and a reader benefit | - Pending |
| Classic broadsheet design direction | Matches the reader expectation of a daily paper and gives the front page the density that makes a newspaper scannable rather than a list of cards | - Pending |
| Design-taste-frontend skill governs all UI work | Explicitly required; it prevents generic AI output and encodes the anti-slop rules for layout, type, colour, and motion | - Pending |
| Traffic first, monetization in v2 | Keeps advertising scripts and tracking out of the ranking path during the growth period, and matches a zero-budget constraint | - Pending |
| ~120 stories per day with a 90-day rolling archive | Produces roughly 44,000 indexable story pages per year, clears the 10,000-page target, and stays within free-tier limits | - Pending |
| No reader accounts or comments | Nothing in a read-only publication justifies them, and both add support and moderation load | - Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-20 after initialization*
