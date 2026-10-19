# Feature Research

**Domain:** Automated daily news aggregation + programmatic SEO publication (multi-edition broadsheet)
**Researched:** 2026-10-20
**Confidence:** HIGH on all Google / Google News policy claims (fetched from official Google documentation on 2026-10-20). MEDIUM on competitor product features (read from vendor feature pages). MEDIUM on March 2026 update specifics (secondary SEO analysis, not an official Google statement). LOW / unverified on any claim about OG-image click-through-rate lift — no authoritative source was found (see §6).

---

## Feature Landscape

### Table Stakes (Users Expect These)

A reader arriving at "a free automatically-curated daily paper" expects the artefact of a newspaper. These are not differentiators; their absence makes the product feel broken. They are, however, the substrate that makes the differentiators legible.

#### A. The paper (editorial surface) — per edition

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Edition front page** — lead story, secondary leads, Most Covered, Editor's Picks, section index, dateline | A newspaper *is* a front page. Without one there is no "edition", only a feed | M | 7 editions. The front page is the single highest-value page per edition. Must carry the day's top items, not a reverse-chronological list |
| **8 section landing pages per edition (56 total)** | Section structure is the reader's mental model of a newspaper and the taxonomy of the target publications | S | Requires a section classifier to place stories. The page itself is trivial; the classifier is not |
| **Section page = a real front page for that section** (lead + list + "Most Covered in Politics" + Most Recent) | A section page that is a bare `<ul>` of links reads as a directory, not a newspaper | S | Depends on the section classifier |
| **Story permalink page** — headline, excerpt, topic tags, attribution, publisher link, visible timestamp, country tags, related stories | The canonical unit of the product. Every story needs a durable destination | M | Full text is prohibited. See §Anti-Features and "Excerpt budget" below |
| **Permanent, date-free story URLs** | "Permanent URL" is a project promise; embedding a date or a mutable section in the URL breaks it when the classifier re-routes a story | S | Recommend `/{edition}/news/{slug}-{shortid}/` with **no** date and **no** section slug in the path. The date lives in the byline and the date-archive page, not the URL |
| **Date archive page per edition** (`/{edition}/YYYY/MM/DD/`) | Newspapers are dated; readers look for "yesterday's paper" | S | Only generate pages for dates that actually have content — never an empty archive page |
| **Per-edition RSS feed + `<link rel="alternate" type="application/rss+xml">` autodiscovery** | RSS is the fastest zero-cost re-entry path and the classic aggregator's baseline | S | Also the primary freshness channel if static rebuild cadence is limited (see §Corrections, C-6) |
| **"Most Covered" ranking module** | The signature feature of the genre (Techmeme's core algorithm; NewsBlur's Daily Briefing has a "widely covered topics" section) | M | Depends on dedup + trending score. Must be visible on front pages, not buried |
| **Cross-outlet source line** ("BBC · Guardian · Sky") | The reader's reason to use an aggregator over a single publisher | M | Depends on dedup. This is also the originality proof point (§D) |
| **Live weather block per edition** (Open-Meteo) | Already in project scope; a weather section without live weather looks broken | S–M | Include today's forecast + multi-day, and the nearest major cities |
| **Branded masthead, edition label, dateline, print-style footer** | The whole design premise; "classic broadsheet" | S | design-taste-frontend skill governs |

#### B. Story mechanics

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Attribution + working outbound link to the original publisher** | Both a legal requirement and a reader trust signal. Google's own guidance lists source attribution as part of the news transparency policy | S | Every story. Not optional, not a footer link |
| **Visible publication date and time, labelled** ("Published 08:14, 20 October 2026") | Google News requires articles to "show both a clear, visible date and time… between the headline and the article text" | S | See §Corrections C-4 |
| **Topic tag chips linking to topic pages** | The navigational spine of a broadsheet | S | Requires the tagging layer |
| **Related-stories module** (3–5 items) | Readers expect context; a story page with no onward path is a dead end | M | Depends on the story graph + tags |
| **Share affordances** (Open Graph + Twitter card, native Web Share on mobile) | Table stakes for social distribution | S | See §6 for what OG images do and do not do |
| **Read-time / effort estimate** (2 min at source) | Sets expectations and is a genuine service the aggregator adds over the raw link | S | Cheap, high trust return — it tells the reader what they're about to send to |

#### C. Technical SEO foundation

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **XML sitemap index** + separate **news sitemap** + **pages sitemap** | The discovery substrate for 10,000+ pages | S | Google: a news sitemap is best kept separate from the general sitemap for better Search Console tracking |
| **News sitemap carries only the last 2 days of URLs** | Google's explicit instruction: "Only include recent URLs for articles that were created in the last two days" | S | Required, and it maps exactly to the 90-day rolling archive design |
| **Per-edition news sitemaps** with correct `<news:publication><news:language>` | `<news:name>` "must exactly match the name as it appears on your articles on news.google.com"; `<news:language>` must be an ISO 639 code | S | English editions = `en`; Hindi edition = `hi`. The `<news:name>` must match the on-site publication name exactly — pick the name once and never diverge |
| **robots.txt** | Baseline | S | Must allow `Googlebot-News` |
| **Self-referencing `<link rel="canonical">`** on every page | Baseline; prevents parameter/duplicate URL issues | S | Critical: **do not** canonicalise across the 7 editions — see §Corrections C-2 |
| **hreflang** | Required for the bilingual India edition | M | Scope is narrower than the project currently assumes — see §Corrections C-2 |
| **Clean, human-readable, lowercase URL structure** | Baseline for both crawlers and readers | S | |
| **Search Console + Cloudflare Web Analytics** | The only way to know whether the ranking path is working | S | Both free. Search Console also exposes the **Google News performance report**, which Google names as "the best way to determine if you have eligible content that's appearing on Google News" |
| **Publisher Center setup** (publication info, HQ location, contact details, URL verification) | Frees the News Showcase module and establishes the publication entity | S | Note: this is *not* an application or approval — see §Corrections C-1 |
| **Google News Showcase panel** | A curated panel on the Google News app; a genuine traffic surface | S | Publisher Center has a News Showcase module for exactly this. Configure at launch — it is free and the panel is high-leverage |

#### D. Trust, transparency and E-E-A-T

Google's news transparency policy requires that news sources "provide: clear dates and bylines; information about the authors, publication, and publisher; information about the company or network behind the content; contact information." That is the floor. Google's own people-first guidance adds the *Who / How / Why* frame, and explicitly warns that "attribution or giving credit to other sources doesn't replace the need for original effort."

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **About page** (what the Meridian is, what it does, what it deliberately does not do) | Baseline trust surface | S | Must state plainly that it is an automated curator, not a newsroom |
| **Editorial Policy page** (what gets selected, how, by what rules; what the AI does and does not do) | The single highest-value trust page for this product model | M | Content-heavy, not code-heavy. This page *is* the originality defence made legible |
| **Sourcing & Methodology page** (which outlets are ingested, how feeds are consumed, how dedup works, how the trending score is computed) | The uniqueness proof. Directly answers Google's "does it provide substantial value" test | M | Publish the dedup + scoring rules in enough detail to be checkable |
| **Corrections policy + a live corrections log** | Every publication that claims rigour needs one; Google News treats corrections handling as part of trust | S | The log must be a real, per-page, linked page — not a policy statement with no entries |
| **Contact page** with a working address | Explicitly required by the Google News transparency policy | S | |
| **Named author/editor pages (Person schema) with bios** | Required by the Google News transparency policy and by `NewsArticle.author.url` | S–M | Since the product is automated, these should be *roles* (e.g. "The Meridian Editorial Desk") with honest bios — **never fabricated individual personas**. Google: "avoid using deceptive authorship information… Fabricating creator profiles… is a form of deception" |
| **Automation / AI disclosure** (on-page, in the editorial policy, and on each AI-produced item) | Google's guidance: "If you're automatically generating content, consider adding information on how your content was created… by providing more background information on how automation was used." | S | Required for the daily digest and for any generated metadata |
| **Organization / WebSite schema** with name, `alternateName`, logo, contact | Entity authority is a post-2026 ranking signal | S | `alternateName` matters — Google's site-name system may pick a different name otherwise |
| **`NewsArticle` schema** — headline, `datePublished`, `dateModified`, `image[]`, `author` (with `url`), `publisher` | Directly drives how Google News renders a card | S | Google News uses `datepublished`, `datemodified`, `headline`, `image`, `isAccessibleForFree`, `author.url` |
| **`BreadcrumbList` schema** | Rich-result eligibility and crawl path clarity | S | |
| **`ItemList` schema on section/topic/archive pages** | Required by project scope; helps list rendering | S | |
| **Content-accuracy statement** | The honest counterweight to a fully automated product | S | |

#### E. Accessibility and performance (non-negotiable constraints, not features)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **WCAG 2.2 AA conformance** | Non-negotiable by project constraint; also a legal exposure in the EU (European Accessibility Act) and a quality signal | M | Specific criteria that apply to a newspaper — see §A11 |
| **Core Web Vitals budget** — LCP < 2.5 s, INP < 200 ms, CLS < 0.1 | Google's stated "good" thresholds | S (as a build constraint) | Static/Astro pages make this largely free — but only if images are sized, fonts are `font-display: swap`, and no layout-shifting hydration exists |
| **Semantic HTML** — `<article>`, `<nav>`, `<time>`, `<h1>`–`<h3>` hierarchy, landmark regions | Screen-reader navigation and Google's content understanding | S | Google's 2026 AI-search guide explicitly recommends semantic HTML for screen-reader users |
| **Skip-to-content link** | WCAG 2.2 SC 2.4.1 Bypass Blocks (Level A) | S | |
| **Visible focus indicator** | WCAG 2.2 SC 2.4.7 Focus Visible (AA); SC 2.4.13 Focus Appearance (AAA) sets the bar at a ≥2 CSS px perimeter with ≥3:1 contrast | S | Hairline rules and paper-white make focus states easy to lose — specify them explicitly |
| **Focus not obscured** by sticky headers | WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum) (AA) | S | A sticky masthead is a *new* 2.2 criterion — easy to fail with a broadsheet layout |
| **Reduced-motion support** | `prefers-reduced-motion` — the project targets motion intensity 3, so this is mostly about honouring the OS setting | S | WCAG 2.3.3 Animation from Interactions is Level AAA, but treat it as required |
| **Responsive down to 360 px**, multi-column grid collapsing gracefully | Mobile is the majority of news traffic | S | Multi-column broadsheet must reflow, not shrink |

---

### Differentiators (Competitive Advantage)

These are the features that make The Meridian worth a reader's habit and — more importantly — make it defensible under Google's scaled-content-abuse and scraping policies. Google's spam policy names the exact failure mode: *"Scraping feeds, search results, or other content to generate many pages… where little value is provided to users"* and *"Republishing content from other sites without adding any original content or value."* The differentiators below are the value layer that keeps the product out of that category.

#### D1. The dedup / trending / curation core

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Cross-outlet event clustering (dedup)** | The product. Five outlets covering one event collapse to a single entry showing "BBC · Guardian · Sky". This is simultaneously the reader value, the originality proof, and the anti-scraping mechanism | **L** | Two-layer approach, modelled on NewsBlur: (1) title normalisation + significant-word overlap; (2) semantic/embedding similarity for differently-worded stories about the same event. Add entity overlap + time-window proximity as the third signal for the zero-cost stack. This is the highest-risk component in the whole build |
| **Trending score from coverage volume + recency** | Powers "Most Covered" — the genre's signature ranking | M | Techmeme's algorithm is the precedent: importance depends on "the number of links to the story's web page and how old the story is." **Two mandatory refinements from Techmeme's anti-gaming work:** (a) discount volume when the links arrived in a short burst; (b) weight by *source diversity* — 5 links from one outlet must not equal 5 links from 5 outlets |
| **Editor's Picks (auto-surfaced)** | A curated-feeling front page without a human newsroom — the closest thing to an editorial layer a zero-staff product can have | M | Derive from the trending score with diversity and source-quality weighting; editorial selection is transparent and rules-based, and the rules are published on the Methodology page |
| **Coverage-breadth display** ("6 outlets covered this story") | A number the reader cannot get anywhere else; quantifies the aggregator's unique contribution | S | Depends on dedup. Cheap, high signal |
| **Cross-country flagging** (a story appears in more than one edition) | Directly serves the "one country, the whole picture" promise; creates legitimate multi-edition inbound links | M | Requires country detection on the story, separate from topic tagging |
| **Consensus signal** ("reported by 4 of 5 sources on this story") | Optional; a genuinely journalistic concept — where outlets agree is more likely to be accurate | M | Deferred to v1.x. Careful: this must not become an automated factual-accuracy claim, which would be a YMYL liability |

#### D2. Original-text layer

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Auto-generated daily editorial digest per country** | The single most important originality artefact. Google: *"automatically generating pages from feeds… represents little to no effort. Attribution or giving credit to other sources doesn't replace the need for original effort."* A per-edition digest of the day's stories, written by the publisher, is that original effort | M | 7 digests/day. **Feasible on the free tier** — see §Research Flags F-4. Must be genuine synthesis across the day's stories (a narrative of what happened), *not* an LLM paraphrase of headlines, which is the exact pattern the March 2026 update targeted ("Passing data through an LLM for cosmetic rewriting was explicitly insufficient") |
| **Occasional original articles by the publisher** | The strongest possible E-E-A-T signal and the clearest evidence of a real editorial function | L (human effort) | Genuinely a business/editorial commitment, not a feature to "build". Must be clearly distinguished from aggregated stories in the UI and in schema |
| **Source-category scanning → automatic section placement** | Removes the most obvious "dumb template" tell: stories filed into the wrong section | M | |
| **Topic + named-entity tagging** | Powers topic pages, entity pages, internal linking, and cross-country flagging | L | Feasible on the free tier via Workers AI (§Research Flags F-4), but the *quality* bar (accuracy of entity IDs) is the hard part, not the cost |
| **Story-to-story related-story graph** | "Also covered" — the reader's natural next click, and a crawl path that keeps pages from being orphans | M | |
| **Per-topic timeline / chronology** | Turns a topic page from a list into a story of events. This is the "unique data" that makes programmatic topic pages survive — see D4 | M | |
| **Per-topic outlet-distribution breakdown** ("BBC covered this 4×, Guardian 2×") | The aggregation itself becomes the value add. Post-2026 analysis of surviving aggregators: "Aggregator models survive when the aggregation itself is the value add… The synthesis layer must be non-trivial and require genuine analysis logic, not a template wrapper" | M | This is the single strongest anti-scaled-content-abuse feature for topic pages |

#### D3. Distribution and habit

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Per-edition daily newsletter** (Brevo) | The only owned channel. Converts a search visitor into a return visitor, and return visits are the engagement signal Google weighs | M | Brevo free tier = **300 emails/day** (verified from brevo.com/pricing, 2026-10-20). With 7 editions this is a hard cap: a per-edition list of ~43 subscribers exhausts the daily allowance. Design the signup to be per-edition and monitor the cap from day one |
| **Daily digest email mirrors the on-site digest** | Same artefact, two surfaces — cheap, consistent | S | |
| **"Most Covered" newsletter section** | The genre's proven hook (NewsBlur's Daily Briefing ships a "widely covered topics" section) | S | |
| **RSS + autodiscovery** | The classic aggregator's zero-cost re-entry path | S | |
| **Dynamic OG images per story and section** | Branded, shareable, and the thumbnail Google News selects — see §6 | M | |
| **Multi-edition topic/entity pages as the programmatic acquisition engine** | The primary organic acquisition channel per the project brief | M | |

#### D4. What makes a programmatic page genuinely useful (the 2026 survival criteria)

These are the *structural* rules the programmatic topic/entity pages must satisfy to avoid the scaled-content-abuse classification. They are listed here because they change the feature specification, not just the implementation.

| Rule | Operational test | Source confidence |
|---|---|---|
| **Distinct-query test** | "Each page in a programmatic set answers a user query that is genuinely distinct from every other page in the set, and the answer requires data that is unique to that page" | MEDIUM (secondary analysis of the March 2026 update) |
| **Non-nullable unique-data column** | Build the schema so every programmatic page type has a mandatory "unique data" column that cannot be null. "If you cannot populate that column with genuine, non-replicated data at scale, that page type should not exist in your programmatic architecture" | MEDIUM |
| **Uniqueness ratio ≥ 30–40 %** | Pages below 30–40 % unique content (vs. shared template) are described as high-risk. For a topic page, the unique portion = the specific stories, the outlet distribution, the timeline, and the summary — not the nav, masthead and footer | MEDIUM |
| **Genuine editorial layer** | 100–150 words of real editorial synthesis per programmatic page materially raises the uniqueness ratio | MEDIUM |
| **Structural fingerprinting** | Google fingerprints template structure independently of variable content. Generating unique-sounding intros with AI that are structurally identical across a set does **not** help | MEDIUM |
| **Freshness tied to real data change** | Render a "data last updated" timestamp; sitemap `lastmod` must track actual data changes, not deploy time | MEDIUM |
| **Rollout cadence** | Roll out programmatic pages in measured batches (the project brief already sets ~50–500 pages/day with indexation monitoring) — do not mass-dump | MEDIUM |
| **Surviving-category patterns** | The classes that survived: (a) comparison pages with live differing data; (b) location pages with genuine local data ("The page for Glasgow must contain data that cannot be copy-pasted onto the Manchester page"); (c) structured-data aggregation with editorial synthesis | MEDIUM |
| **Anti-scraping rule (official)** | "Publishers must block content that scrapes all or nearly all of an original work without providing any substantial or clear added value." → The Meridian must never publish an excerpt that approaches the original work's substance. See the excerpt budget below | **HIGH** (official Google News policy) |

**Excerpt budget (a concrete, citable rule for this project).** Google News requires publishers to block scraped content, and defines scraping as taking "substantial material from another site without express permission". To stay clearly on the right side, the published excerpt should be a *summary reference* — roughly 25–50 words / 1–3 sentences — never the full lede paragraph reproduced verbatim, always paired with a prominent link to the original. This is the only place where the content model touches the source text, so it should have a hard rule rather than a judgement call.

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Full article body text** | "Readers want the story" | Direct copyright exposure, and the clearest possible trigger for the scraping and scaled-content-abuse policies the whole project is designed to avoid | Headline + short excerpt + tags + prominent link to the original publisher. The reader gets the combined picture; the publisher keeps the words |
| **AI-translated Hindi edition** (machine translation of the English edition) | Cheap way to get a second language edition | Explicitly listed in post-March-2026 analysis as "AI Translation Spam" — translating content into many language variants to multiply page counts without original value — and heavily penalised. Google also notes it "adds maintenance cost" | **Native Hindi-language sources**, already the project's decision. This is one of the strongest validated decisions in the brief |
| **AI-generated bulk article pages** (AI writing articles from a keyword list) | Cheap page volume | Scaled content abuse, explicitly. Also the most common way a news site dies in 2026 | AI used *inside* a curated pipeline: tagging, summarising the day's real stories, clustering. Never as a page factory |
| **Thin category / tag pages** | Easy SEO surface | Below the uniqueness-ratio floor; the classic template-substitution fingerprint | Only generate a programmatic page when it has a non-nullable unique-data column (D4). Otherwise, let it 404 |
| **Duplicate date pages** (one archive page per edition per section per date, all with the same content) | Sitemap volume | Near-duplicate content across hundreds of URLs — exactly the template-substitution fingerprint | One date archive page per edition, containing that day's actual stories, no section-split variants |
| **Infinite scroll** | Modern UX, keeps users on the page | Google's own pagination guidance: crawlers "generally don't 'click' buttons and generally don't trigger JavaScript functions that require user actions"; infinite scroll "can't handle very large numbers of results"; it also causes "scrolling fatigue" | Server-side pagination with real crawlable `<a href>` links on archive and topic pages. Front pages are single-page-per-day (a daily paper front page is one edition, not an endless stream) |
| **Infinite auto-refresh / live ticker polling** | "Always shows the latest" | Destroys Core Web Vitals stability, confuses crawlers about freshness, and pushes users to re-read the same page | Scheduled rebuilds with a visible "last updated" timestamp; RSS for near-real-time. No client-side polling |
| **Comments / UGC / ratings** | Community = engagement | Moderation and spam-defence require ongoing human staffing; incompatible with a fully-automated, zero-staff operation. Also a spam surface | None. The brief already excludes it — keep it excluded |
| **Reader accounts / logins** | Personalisation, newsletter gating | Adds breach surface and support load to a read-only publication for no engagement upside. Also collides with the "no paywall, no registration" stance that Google News rewards | Anonymous newsletter signup only (email + edition), stored in Brevo |
| **Programmatic faceted pages** (topic × country × date × outlet) | Combinatorial page volume | The "thin-but-keyword-matched pages that once ranked on template volume alone" pattern. Combinatorics without unique data is the definition of the abuse | Ship a single global topic page and a single global entity page. Do not facet |
| **Canonicalising the 7 editions to one another** | "Avoid duplicate content" | Destroys the entire per-edition positioning. Google: for multi-regional sites, only use canonical where the pages are genuinely duplicates. Different editions carry different stories | Self-referencing canonicals only. See §Corrections C-2 |
| **hreflang across the 7 editions** | "Tell Google about our 7 versions" | The editions are not localized variants of one page — they contain different stories. Google's hreflang doc: "Localized versions of a page are only considered duplicates if the main content of the page remains untranslated" | hreflang only for genuine language parallels (India English ↔ India Hindi). See §Corrections C-2 |
| **Over-linking / anchor-text stuffing** ("UK politics", "today's UK politics news", 40 links per page) | Passes PageRank, looks like a network | Google's link-spam policy names keyword-stuffed anchor text; Google's links guidance: "Don't chain up links next to each other" and "resist the urge to cram every keyword that's related to the page you're linking to" | A small, contextual link set per page: ~5–12 links, descriptive anchors, spaced in prose |
| **Keyword-stuffed or boilerplate `<title>` tags** | "Optimised titles" | Google's title-link guidance explicitly calls out "long text in the `<title>` element that varies by only a single piece of information" as bad, and warns that keyword stuffing "can make your results look spammy" | Distinct, descriptive titles. For an aggregator, the title is `{Headline} — {Source} | The Meridian {Edition}` |
| **Artificial freshness** (bumping `dateModified` on untouched stories, re-dating a story and redirecting) | "Freshness signals" | Google's news article guidance: "it's against our guidelines to artificially freshen a story"; the helpful-content guidance also names "changing the date of pages to make them seem fresh when the content has not substantially changed" | Set `datePublished` once (first publication at the source) and only set `dateModified` when the Meridian's page content actually changes |
| **Ad scripts, cookie banners, interstitials, ad-layout compromises** | Monetisation upside | Google News policies require that advertising "shouldn't exceed your content"; interstitials hurt CWV; and the brief defers monetisation to v2 to protect the ranking path | None in v1. Monetise in v2 with a layout that does not disturb the ranking path |
| **Site-wide search** | "Readers expect search" | Genuinely low value until the archive has depth; also a thin-results page, which is a scaled-content-abuse vector | Defer to v1.x, gated on index depth |
| **Native mobile apps** | Engagement | App-store distribution overhead for a zero-budget project | Responsive web |
| **Auto-generated person profiles for named entities** (fake author pages for politicians/people) | More pages, more schema | Google's Article markup guidance is explicit: "Don't impersonate any person or organization… or misrepresent your ownership, affiliation, or primary purpose"; the helpful-content guidance calls fabricated creator profiles "a form of deception" | Topic/entity pages for *organisations, places and topics*. People only if there is a real editorial relationship |
| **Paywall or registration gating** | Revenue | Google News requires `isAccessibleForFree` and treats gated content differently; the entire model is free | Free, always |
| **Auto-inserted "trending now" and "you may also like" rails of thin link lists** | Engagement | Thin template blocks; a scaled-content-abuse tell | The Most Covered module, driven by real coverage data |
| **Recirculating old stories to look fresh** | More stories per day | Direct violation of the freshness guidance above; also a duplicate-content generator | Honest rolling archive with accurate dates |

---

### Feature Dependencies

```
[RSS/API ingestion]
    └──requires──> [Feed registry + per-outlet metadata]
                        └──requires──> [Publisher feed ToS verification]   ← launch-blocking legal gate

[Story normalizer]
    └──requires──> [Story store (D1)]
    └──requires──> [Article parser: title, excerpt, image, timestamp, author, link]

[Cross-outlet clustering (D1)]                ← THE critical path
    └──requires──> [Story store]
    └──requires──> [Similarity engine: title-overlap + embedding + entity + time-window]
    └──requires──> [Entity extraction]
            └──requires──> [LLM budget on Workers AI free tier]

[Trending score]
    └──requires──> [Clustering]
    └──requires──> [Coverage-volume + recency + source-diversity weighting]

[Most Covered module]
    └──requires──> [Trending score]

[Editor's Picks]
    └──requires──> [Trending score]
    └──requires──> [Published selection rules (Methodology page)]

[Section placement]
    └──requires──> [Source-category scan]
    └──requires──> [Clustering] (a cluster needs one section, not eight)

[Front page / section pages]
    └──requires──> [Clustering] + [Trending score] + [Section placement] + [Cross-country flagging]
    └──requires──> [Story permalink pages] (for links)

[Story permalink page]
    └──requires──> [Story store] + [Clustering] (source line) + [Tagging] + [Related-story graph]
    └──requires──> [R2 image pipeline] + [OG image generator]
    └──requires──> [NewsArticle schema] + [canonical + byline date]

[Topic / entity pages]                        ← programmatic acquisition engine
    └──requires──> [Tagging] + [Clustering] + [Timeline] + [Outlet-distribution breakdown]
    └──requires──> [Non-nullable unique-data schema gate]   ← the anti-abuse forcing function
    └──requires──> [Freshness timestamp + sitemap lastmod]
    └──enhances──> [Internal linking]

[Daily digest per edition]
    └──requires──> [Story store for the day] + [Clustering] + [Trending score]
    └──requires──> [LLM budget] + [Automation disclosure]
    └──enhances──> [Front page] (linked from the edition front page)

[Cross-country flagging]
    └──requires──> [Country detection per story] + [Tagging]

[Newsletter]
    └──requires──> [Daily digest] + [Brevo] + [Edition-scoped signup]
    └──requires──> [Subscriber-cap monitoring (300 emails/day free tier)]

[Google News inclusion]
    └──requires──> [News sitemap (2-day window)] + [robots.txt allowing Googlebot-News]
    └──requires──> [NewsArticle schema + visible date/time + headline in <h1> + <title> match]
    └──requires──> [Trust layer: About, Policy, Methodology, Corrections, Contact, author pages]
    └──enhances──> [Publisher Center configuration + News Showcase panel]

[Search Console + Web Analytics]
    └──requires──> [Domain acquired]   ← launch-blocking
    └──requires──> [Sitemap submission]

[Accessibility (WCAG 2.2 AA)]
    └──requires──> [Semantic HTML + focus states + skip link + contrast tokens]
    └──conflicts──> [Hairline-rule dividers + hairline focus rings]   ← focus ring must exceed the rule weight
```

### Dependency Notes

- **Clustering is on the critical path for nearly everything.** The front page, section pages, "Most Covered", Editor's Picks, the source line, the digest, topic pages, and the related-story graph all depend on it. If clustering is not built first and well, none of the differentiators exist and the product degrades into exactly the republished feed that Google's policies target. **Sequence clustering before any page generation.**
- **The trust layer is not a page-generation task — it is a content task, and it is launch-blocking for Google News.** Google's news policies require clear dates and bylines, author/publisher/company information, and contact information. A site missing these is ineligible for news surfaces regardless of technical SEO quality.
- **The domain is launch-blocking.** Search Console verification, Google News discovery, Publisher Center URL verification and any meaningful ranking all require it. Everything else can be built on the `pages.dev` subdomain; this cannot.
- **Feed Terms-of-Use verification gates ingestion.** Consuming a publisher's RSS without checking their stated terms is a legal exposure that undercuts the entire "attribution + legal" posture. This must happen before the pipeline is locked in.
- **The LLM budget is not the constraint it appears to be.** Workers AI's free allocation (10,000 neurons/day) supports all seven digests plus entity tagging at 120 stories/day with a very large margin — see §Research Flags F-4. The constraint is *quality of the synthesis*, not cost.
- **Excerpt length is a compliance dependency, not a style preference.** Google News requires publishers to block scraped content — "all or nearly all of an original work without providing any substantial or clear added value." The excerpt budget (D4) is a hard rule in the normalizer, not a per-editor judgement.
- **Freshness depends on the rebuild cadence**, which is in tension with the Pages free-tier build limit — see §Corrections C-6. Choose the delivery model before designing the front page.
- **Clustering and section placement interact.** A cluster may contain stories from different sections; the cluster needs one canonical section. Decide the precedence rule (majority of outlets, then highest-trending outlet) before building either.

---

### MVP Definition

#### Launch With (v1)

The list below is what the concept needs in order to be validated. Anything not here is a candidate for v1.x or v2, and several items here are launch-blocking in a way that is not obvious from the feature name.

**Pipeline and data**
- [ ] **Feed registry + per-outlet metadata + ToS verification** — the legal gate; nothing ships without it (S)
- [ ] **Story normalizer** with a hard excerpt budget (S)
- [ ] **Cross-outlet clustering** — the product (L)
- [ ] **Trending score** with volume + recency + source-diversity weighting (M)
- [ ] **Topic, entity and country tagging** (L)
- [ ] **Source-category section placement** (M)
- [ ] **Cross-country flagging** (M)
- [ ] **R2 image pipeline** with resized variants (S)

**Publication surface**
- [ ] **7 edition front pages** with lead stories, Most Covered, Editor's Picks (M)
- [ ] **56 section landing pages**, each a real section front page (M)
- [ ] **Story permalink pages** with headline, excerpt, tags, attribution, visible date/time, source line, related stories (M)
- [ ] **Date archive pages** per edition (S)
- [ ] **Topic pages** (global, non-faceted) with timeline + outlet-distribution breakdown + editorial synthesis (M)
- [ ] **Entity pages** (organisations, places, topics) (M)
- [ ] **Auto-generated daily digest per edition** with an on-page automation disclosure (M)
- [ ] **A byline/bio page for the editorial desk** — honest, role-based, not a fabricated persona (S)

**Discovery and trust**
- [ ] **Sitemap index + news sitemap (2-day window) + pages sitemap** (S)
- [ ] **robots.txt, self-referencing canonicals, clean URLs** (S)
- [ ] **`NewsArticle`, `Person`, `Organization`/`WebSite`, `BreadcrumbList`, `ItemList` schema** (S)
- [ ] **Trust layer** — About, Editorial Policy, Sourcing & Methodology, Corrections policy + log, Contact, authors (M as content)
- [ ] **Domain acquisition** — launch-blocking (S)
- [ ] **Search Console + Publisher Center configuration + News Showcase panel** (S)
- [ ] **RSS feed per edition + autodiscovery** (S)
- [ ] **OG/Twitter card tags + dynamic OG images** for story and section pages (M)

**Non-functional (constraints, not features)**
- [ ] **WCAG 2.2 AA** — skip link, focus visible, focus not obscured, contrast ≥4.5:1 text / ≥3:1 non-text, semantic landmarks, reduced motion (M)
- [ ] **Core Web Vitals** — LCP < 2.5 s, INP < 200 ms, CLS < 0.1 (S as a build constraint)
- [ ] **Cloudflare Web Analytics** (S)

#### Add After Validation (v1.x)

- [ ] **Internal linking engine** — story→topic, story→country, story→related, story→story, with descriptive anchors and a link budget (M). Note the dependency: internal linking is more valuable once topic pages have depth, so it lands after topic pages have real data
- [ ] **Newsletter** — edition-scoped signup, Brevo, 300 emails/day cap monitoring (M). Depends on the digest existing and on subscriber volume justifying the cap
- [ ] **Pagination on archive and topic pages** (S)
- [ ] **Site-wide search** (M) — only once the archive has meaningful depth
- [ ] **Consensus signal** ("reported by 4 of 5 sources") (M)
- [ ] **Story-to-story "more on this" graph refinements** (M)
- [ ] **Original articles by the publisher** — a human commitment, launched as a proof point (L)
- [ ] **Social share buttons** (in addition to OG tags) (S)

#### Future Consideration (v2+)

- [ ] **Advertising / monetisation** — deferred by decision; must not touch the ranking path (L)
- [ ] **Audio briefings / text-to-speech of the daily digest** — Workers AI audio is free-tier-limited (L)
- [ ] **Reader-facing topic following** — reintroduces accounts; only if a different posture is adopted (M)
- [ ] **Native apps** (L)
- [ ] **Additional country editions** — a good v2 expansion *because* each new edition is a new doorway for a new language/locale cluster (M)

---

### Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Cross-outlet clustering (dedup) | HIGH | HIGH | **P1** |
| Story permalink pages (headline + excerpt + attribution + date + tags) | HIGH | MED | **P1** |
| 7 edition front pages | HIGH | MED | **P1** |
| 56 section landing pages | HIGH | MED | **P1** |
| Trending score + Most Covered | HIGH | MED | **P1** |
| Trust layer (About/Policy/Methodology/Corrections/Contact/Authors) | HIGH | MED (content) | **P1** |
| NewsArticle + Person + Organization schema | HIGH | LOW | **P1** |
| News sitemap (2-day window) + sitemap index | HIGH | LOW | **P1** |
| Feed registry + ToS verification | HIGH (legal) | LOW | **P1** |
| Domain acquisition | HIGH (blocking) | LOW | **P1** |
| Section classifier (source-category scan) | HIGH | MED | **P1** |
| Daily digest per edition | HIGH | MED | **P1** |
| Editorial desk byline page | HIGH | LOW | **P1** |
| Topic + entity + country tagging | HIGH | HIGH | **P1** |
| WCAG 2.2 AA conformance | HIGH (constraint) | MED | **P1** |
| R2 image pipeline | MED | MED | **P1** |
| Cross-country flagging | MED | MED | **P1** |
| Dynamic OG images | MED | MED | **P1** |
| RSS + autodiscovery | MED | LOW | **P1** |
| Date archive pages | MED | LOW | **P1** |
| Search Console + Web Analytics + Publisher Center | MED | LOW | **P1** |
| Editor's Picks | MED | MED | P2 |
| Topic pages with timeline + outlet breakdown | MED | MED | P2 |
| Internal linking engine | MED | MED | P2 |
| Newsletter | MED | MED | P2 |
| Related-story module | MED | MED | P2 |
| Pagination on archive/topic pages | MED | LOW | P2 |
| Original articles by publisher | MED | HIGH (human) | P2 |
| Entity pages | MED | MED | P2 |
| Consensus signal | LOW | MED | P3 |
| Site-wide search | LOW | MED | P3 |
| Social share buttons | LOW | LOW | P3 |
| Audio briefing of digest | LOW | HIGH | P3 |
| Monetisation | LOW | HIGH | P3 (v2) |

**Priority key:**
- **P1:** Must have for launch (or is a launch-blocking constraint)
- **P2:** Should have, add when possible
- **P3:** Nice to have, future consideration

---

### Competitor Feature Analysis

| Feature | Techmeme | NewsBlur | Flipboard | Newser (daily briefing) | The Meridian's approach |
|---|---|---|---|---|---|
| **Cross-outlet story clustering** | Core algorithm — groups links covering the same event | "Story Clustering" via title matching + Elasticsearch `more_like_this` semantic matching | Topic engine + smart magazines | No (single-source briefs) | **Adopt the two-layer NewsBlur model** (word-overlap + embedding), add entity + time-window signals. Third-party priority: this is *the* differentiator |
| **Ranking signal** | Link count + story age, with anti-gaming on link bursts and low-source-count concentration | User training (thumbs up/down on author, tag, title, full text) | Personalised "For You" | Editor curation | **Adopt Techmeme's formula** (coverage volume + recency + source-diversity weighting). Explicitly *not* user-trained — no accounts |
| **Content model** | **Headline + link only — no body text** | Full text, plus "Web Feeds" scraping for sites without RSS | Magazine layout of full content | Two-paragraph summaries | **Same as Techmeme** — headline + short excerpt + link. Techmeme has run this model for 20 years without a scraping action; it is the strongest available precedent for the content model |
| **"Most Covered" concept** | The site itself is a most-covered ranking | Daily Briefing ships a "widely covered topics" section | No equivalent | No | **Make it the headline module.** Two independent precedents validate it |
| **Daily briefing** | "Briefing" (subscription to search patterns with notifications) | "Ask AI" + "Daily Briefing" with curated sections: top stories, long reads, stories from infrequent sites, widely covered topics | No | "Grid format… a simple way to scan the day's headlines" | **Per-edition daily digest.** Add the sections NewsBlur validates — top stories, long reads, less-covered sources (a genuinely differentiated section: stories only one outlet ran) |
| **Proactive/search subscription** | "Prospective search" — subscribe to a future search result and get notified | Save searches as feeds; IFTTT/Zapier | "Surf" RSS browser | No | **Deferred.** Worth adding in v2 as "watch this topic" once topic pages exist |
| **Full-text search** | Search across the archive by headline | Elasticsearch full-text search across subscriptions | No | No | **Deferred to v1.x.** Correctly out of scope for v1 |
| **Story archive / permanence** | Full archive with headline search | "Story Archive — every story kept and searchable forever", with history back-fill on subscribe | No | No | **Permanent permalinks + 90-day rolling prominence.** Matches NewsBlur's permanence model |
| **Editorial layer without a newsroom** | "run without human editors" (automation first, 2–5 human editors tuning the headline mix) | Intelligence Training (explicit user feedback) | Algorithmic | Human editors | **Editor's Picks driven by published rules + a role-based editorial desk byline.** Truthful about automation |
| **User accounts / training** | None | Free tier, 64 feeds; Premium/Pro paid tiers | Free accounts | Free app | **None.** Consistent with the brief and with the "no engagement features" rationale |
| **Anti-scraping posture** | Headline + link; no republication | Scrapes (Web Feeds) — a different risk profile | Republishes full content | Summarises full articles | **Short excerpt + link + synthesis layer.** The safest of the group |
| **Multi-country / locale structure** | None | None | Localised into 21 languages | None | **7 country editions + a native Hindi edition.** Uniquely positioned in the comparison set |
| **Monetisation** | Sponsors program | Subscription | Ads | Ads | **None in v1** (deferred to v2 by decision) |

**Where the Meridian has no competitor:** no product in this comparison set runs country-edition broadsheets with cross-outlet coverage breadth as the organising principle, and none pairs that with per-edition original digests and full native-language sourcing for one market. That combination is the product's position, and it is exactly the position Google's policies describe as "adding original content and value" rather than republishing.

---

### Corrections to Project Assumptions

Six findings from this research materially change requirements already written into `PROJECT.md`. Each needs a decision before the roadmap is locked.

**C-1 — "Enrolled in Google News via news sitemap and Publisher Center" is no longer an enrolment process.** Publisher Center's own overview states: *"Google automatically considers all web content for inclusion in Google News, so you don't need to apply. To be eligible, content must comply with our overall requirements and content policies."* There is no application, no approval queue, and no approval timeline. Publisher Center is now for publication metadata (basic info, HQ, URL verification, contact), Reader Revenue Manager, and **News Showcase** — which is itself a free, high-value traffic surface that should be configured at launch.
*Impact:* the requirement should be reworded from "enroll in Google News" to "publish a compliant news sitemap + meet the news content policies + configure Publisher Center and News Showcase". No dependency on an approval gate, and no roadmap phase should wait on one.
*Source:* https://support.google.com/news/publisher-center/answer/9606538 · https://support.google.com/news/publisher-center/answer/9606634

**C-2 — hreflang scope must be narrowed; "hreflang across the seven editions" is likely wrong.** Google's hreflang documentation describes the mechanism for *"localized variations of the same content"* and states: *"Localized versions of a page are only considered duplicates if the main content of the page remains untranslated."* The seven editions carry **different stories**, so they are not localized variants of one page. Google's multi-regional guidance instead directs locale-targeted content to **locale-specific URLs** (`/uk/`, `/us/`), which is exactly what the 7-edition structure already does, and says to use canonical only where pages are genuinely duplicates. Marking the editions as hreflang alternates would tell Google they are the same page in different languages, which they are not.
*Recommendation:*
- 7 country editions → **locale-specific URL paths** for geotargeting, **self-referencing canonicals**, no hreflang between them.
- India English ↔ India Hindi → **genuine hreflang** (`en-IN`, `hi-IN`, `hi` catchall, `x-default`).
- Add a generic English catchall (`en`) — Google's hreflang guidance explicitly recommends one when several URLs target the same language in different locales.
- Google notes it does **not** use the `lang` attribute to detect language (it uses visible content), but `lang` is still required for WCAG and screen readers, and "Make sure the page language is obvious… by avoiding side-by-side translations."
*Impact:* one requirement's wording changes; a sitemap/head-tag spec changes. Medium effort, high correctness value.
*Source:* https://developers.google.com/search/docs/specialty/international/localized-versions · https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites

**C-3 — Story URL structure should not embed the date or the section.** The brief promises permanent URLs that are never deleted. Embedding a date creates a URL that must change if a story is ever re-dated; embedding the section creates a URL that must change when the classifier re-routes a story. Neither is compatible with the permanence promise. Recommended: `/{edition}/news/{slug}-{shortid}/`, with the date shown as the visible byline date and the section as a displayed classification. Note that Google News requires a visible date and time on the page and in the sitemap regardless — a visible date, not a date in the URL.
*Source:* https://support.google.com/news/publisher-center/answer/9607104 · https://developers.google.com/search/docs/appearance/publication-dates

**C-4 — Google News article requirements are specific and several are not in the brief.** The current best-practices page requires: a clear visible date and time between the headline and the article text; the headline in a prominent `<h1>`; the `<title>` element matching the `<h1>`; anchor text pointing to the article matching the article title; **headlines between 2 and 22 words and at least 10 characters**; **headlines not exceeding 110 characters**; no date or time in the article title; no leading number in the anchor text of the title; images relevant to the story (not logos or captions); images at least 60×90 px; and `author.url` pointing to an author-identifying page. Google News also uses `datepublished`, `datemodified`, `headline`, `image` and `isAccessibleForFree` from structured data. None of these are currently in the requirement list.
*Source:* https://support.google.com/news/publisher-center/answer/9607104

**C-5 — The Google News scraping rule is directly binding on this project and has a concrete consequence.** Google News policies state: *"Publishers must block content that scrapes all or nearly all of an original work without providing any substantial or clear added value."* The Meridian's answer is the excerpt budget (D4): a short summary excerpt, never a reproduction of the original's substance, always with a prominent link to the source. This should be enforced in the normalizer as a hard rule, and documented on the Methodology page. Also note Google News' separate recommendation that syndicators use `<meta name="Googlebot-News" content="noindex">` to stop syndicated copies competing with the original — a publisher-side behaviour the Meridian should be aware of and, where a publisher offers it, respect.
*Source:* https://support.google.com/news/publisher-center/answer/9520026 · https://support.google.com/news/publisher-center/answer/9606800

**C-6 — "Static generation with scheduled rebuilds" is in tension with the Cloudflare Pages free plan, and the delivery model needs a decision.** Cloudflare Pages on the Free plan allows **500 builds per month** and **20,000 files per site**. A news site's freshness needs are on the order of dozens of rebuilds per day: 30-minute rebuilds ≈ 1,440/month and hourly ≈ 720/month — both blow through the 500/month allowance. Separately, 10,000+ indexable pages plus per-story HTML, OG images and images will exceed 20,000 files. Three viable shapes, to be chosen in the architecture phase:
1. **Workers Static Assets** (Workers Free plan) — the Worker serves assets directly with no build step at all; removes the build budget entirely, at the cost of losing pure-static simplicity.
2. **Worker-rendered front page + static evergreen pages** — front page and section pages rendered at the edge from D1/KV; story, topic, archive and trust pages pre-built in a low-frequency build. Fresh where it matters, cheap where it doesn't.
3. **Low-frequency static rebuilds + RSS as the realtime channel** — 2–3 rebuilds/day (≈90/month, inside budget) with RSS and a visible "last updated" stamp carrying freshness.
This is arguably an architecture decision, but it changes which features are viable (live "Most Covered" refresh, real-time weather, "published X minutes ago" badges), so it must be settled before the front-page and digest features are specified.
*Source:* https://developers.cloudflare.com/pages/platform/limits/ (Free plan: 500 builds/month, 20,000 files, 1 build at a time, 20-minute build timeout)

**C-7 — One additional constraint the brief does not currently account for: all 7 editions share one site name.** Google states that a site name is defined at the domain or subdomain level and that *"Google Search does not support site names at the subdirectory level. Not supported: https://example.com/news."* All seven editions will therefore display the same site name in search results. The edition identity (UK Edition, India Edition) must live in the `<title>`, the `<h1>`, and the visible masthead — and the site name should be short and distinctive so it is not truncated.
*Source:* https://developers.google.com/search/docs/appearance/site-names

---

### Research Flags for Phase Planning

| # | Topic | Flag | Why it matters |
|---|---|---|---|
| **F-1** | Clustering quality | **Likely needs deeper research.** The clustering algorithm is the whole product and the hardest engineering problem in the project | Needs a spike with real feed data: measure precision/recall against a hand-labelled sample of same-event clusters, tune thresholds, decide the merge/split rules, decide the cluster's canonical section and canonical headline. Do not build pages before this is validated |
| **F-2** | Delivery model vs. Pages build limits | **Needs an architecture decision before front-page and digest work.** See C-6 | Determines freshness guarantees, build budget, and whether dynamic features (live weather, "minutes ago", live Most Covered) are possible |
| **F-3** | Google News traffic reality | **LOW confidence — unverified.** No authoritative source was found quantifying current Google News referral traffic in 2026. The brief treats Google News as a primary acquisition channel; treat that as an assumption to be measured via Search Console's Google News performance report, not as a fact | Phase should include a measurement plan from day one (Search Console News report + Web Analytics) rather than a traffic projection |
| **F-4** | LLM budget on the free tier | **Resolved — feasible.** Workers AI free allocation is **10,000 neurons/day**; `@cf/meta/llama-3.2-3b-instruct` costs 4,625 neurons/M input and 30,475/M output. Seven digests of ~800 output tokens each, plus entity tagging for 120 stories/day, costs roughly **300–500 neurons/day** — under 5 % of the allocation. Even `@cf/meta/llama-3.1-70b-instruct-fp8-fast` (26,668/M in, 204,805/M out) would fit the free tier for digests alone | Verify per-model pricing before committing, and re-check if models are retired. Note: some models now require the Workers **Paid** plan (July 2026 change) — confirm the chosen model is free-tier eligible |
| **F-5** | OG image click-through-rate impact | **LOW confidence — no authoritative source found.** Multiple attempts to retrieve a credible study returned nothing usable. What *is* authoritative: Open Graph requires `og:title`, `og:type`, `og:image`, `og:url`; `og:image:width`, `og:image:height`, `og:image:alt` and `og:locale` are supported; and Google's news guidance says OG/Schema image tags are how the image crawler identifies the thumbnail it wants. **Do not build a business case on an assumed CTR lift.** Build dynamic OG images because branding + correct thumbnail selection are worth it, and measure CTR in Search Console | |
| **F-6** | Publisher RSS availability and terms | **Needs research before the feed list is locked** | Each outlet's current feed URL, whether it permits republication of headline + excerpt, and its robots/publisher policy. This is a legal gate, not a technical one |
| **F-7** | Hindi source set and quality bar | **Needs research** | NDTV Hindi, Aaj Tak, BBC Hindi etc. — feed availability, whether they permit republication, and the tone/register a Hindi broadsheet needs (formal standard Hindi vs. Hinglish newsroom style). Google's guidance against side-by-side translations and for a single obvious page language applies |
| **F-8** | Hindi typography and fonts | **Needs research** | A Devanagari news serif (OFL-licensed, self-hosted, with a matching Devanagari bold and a Devanagari italic for emphasis) plus correct line-height and glyph fallback. A Latin-only serif stack will fall back to a system Devanagari face and break the broadsheet aesthetic. Also affects the self-hosted font budget and CLS (font swap) |
| **F-9** | D1 daily row-read/write limits | **Needs verification against actual query patterns** | D1 Free-plan row read/write limits are enforced daily and reset at 00:00 UTC (enforced since 1 Sep 2026). A full-site rebuild that reads every story for every edition could blow the daily read budget. Requires index design and a projection of reads per rebuild |
| **F-10** | Brevo free-tier economics | **Partially resolved.** Free tier = **300 emails/day** (verified from brevo.com/pricing, 2026-10-20). With 7 editions and per-edition lists, that is ~43 subscribers per edition before the cap is hit | Decide early: one global list with edition preference, or seven lists with a hard per-edition cap. A single global list at 300/day is roughly 300 subscribers total — the newsletter's growth ceiling is a real constraint, not a footnote |
| **F-11** | Programme of original articles | **Not a research task — an editorial commitment** | The brief says "occasional original articles written by the publisher". That is a human editorial function with a cost in time, not a feature to implement. Confirm whether a human editor exists to do it, because it is the single strongest E-E-A-T artefact available |
| **F-12** | Topic-page rollout cadence | **Needs a measured rollout plan** | The brief already sets ~50–500 pages/day with indexation monitoring. That number needs to be justified against crawl budget and D1 read limits, and tied to an explicit "publish or 404" gate for any page type that cannot populate its unique-data column |

---

### Sources

**Google — official documentation (fetched 2026-10-20, HIGH confidence)**
- Creating helpful, reliable, people-first content — https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Spam policies for Google web search (scaled content abuse, scraping, doorway abuse, link spam) — https://developers.google.com/search/docs/essentials/spam-policies
- Google's guidance on using generative AI content — https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- Optimizing your website for generative AI features on Google Search (2026) — https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- News sitemaps — https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
- Manage sitemaps with a sitemap index file — https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps
- Article (`Article`, `NewsArticle`, `BlogPosting`) structured data — https://developers.google.com/search/docs/appearance/structured-data/article
- General structured data guidelines — https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Provide a site name to Google Search — https://developers.google.com/search/docs/appearance/site-names
- Influencing your title links in search results — https://developers.google.com/search/docs/appearance/title-link
- Influence your byline dates in Google Search — https://developers.google.com/search/docs/appearance/publication-dates
- Understanding Core Web Vitals — https://developers.google.com/search/docs/appearance/core-web-vitals
- Link best practices for Google — https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- Pagination, incremental page loading, and their impact on Google Search — https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading
- Tell Google about localized versions of your page (hreflang) — https://developers.google.com/search/docs/specialty/international/localized-versions
- Managing multi-regional and multilingual sites — https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- Google Search spam updates and your site — https://developers.google.com/search/docs/appearance/spam-updates
- Regional differences in Search experience — https://developers.google.com/search/docs/appearance/aggregator-features

**Google News / Publisher Center — official documentation (HIGH confidence)**
- Publisher Center overview ("you don't need to apply") — https://support.google.com/news/publisher-center/answer/9606538
- Help Google News discover your web crawled content — https://support.google.com/news/publisher-center/answer/9606634
- News content across Google — https://support.google.com/news/publisher-center/answer/9607025
- Appear on other News surfaces — https://support.google.com/news/publisher-center/answer/9607026
- Add a Google News sitemap — https://support.google.com/news/publisher-center/answer/9606709
- Ranking within Google News — https://support.google.com/news/publisher-center/answer/9606702
- Google News policies (transparency, ads, misleading content) — https://support.google.com/news/publisher-center/answer/6204050
- **Content that must be blocked from Google News** (scraping, republished content, paid links) — https://support.google.com/news/publisher-center/answer/9520026
- Avoid article duplication in Google News — https://support.google.com/news/publisher-center/answer/9606800
- Block access to content on your site — https://support.google.com/news/publisher-center/answer/9605477
- Web crawled content best practices — https://support.google.com/news/publisher-center/answer/9606797
- Best practices for your article pages (headlines, dates, images, redirects) — https://support.google.com/news/publisher-center/answer/9607104

**W3C (HIGH confidence)**
- Web Content Accessibility Guidelines (WCAG) 2.2 — https://www.w3.org/TR/WCAG22/ — cited SCs: 1.1.1, 1.3.1, 1.3.2, 1.3.6, 1.4.3 (4.5:1 / 3:1 large text), 1.4.11 (3:1 non-text), 1.4.12, 1.4.13, 2.1.1, 2.1.2, 2.3.3, 2.4.1, 2.4.3, 2.4.4, 2.4.5, 2.4.6, 2.4.7, 2.4.11, 2.4.13, 2.5.8 (24×24 CSS px), 3.3.7, 3.3.8

**Open Graph protocol (HIGH confidence)**
- The Open Graph protocol — https://ogp.me/ — required: `og:title`, `og:type`, `og:image`, `og:url`; recommended/structured: `og:description`, `og:locale`, `og:locale:alternate`, `og:site_name`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt`, `og:image:secure_url`

**Cloudflare — official documentation (HIGH confidence)**
- Pages platform limits (Free: 500 builds/month, 20,000 files, 1 concurrent build, 20-minute timeout) — https://developers.cloudflare.com/pages/platform/limits/
- Workers AI pricing (10,000 Neurons/day free; `$0.011`/1,000 Neurons; per-model rates) — https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers AI free-plan model restrictions (July 2026) — https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/
- D1 platform pricing (daily row read/write limits, reset 00:00 UTC) — https://developers.cloudflare.com/d1/platform/pricing/
- D1 free-tier limit enforcement (1 Sep 2026) — https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/

**Competitor products (MEDIUM confidence — vendor-controlled pages, read 2026-10-20)**
- NewsBlur — Story Clustering: https://www.newsblur.com/features/story-clustering · Full feature list: https://www.newsblur.com/features
- Techmeme — Wikipedia overview (algorithm, anti-gaming, editors, archive, prospective search): https://en.wikipedia.org/wiki/Techmeme
- News aggregator — Wikipedia (function, history, aggregation-website taxonomy): https://en.wikipedia.org/wiki/News_aggregator
- Flipboard — Wikipedia (Cover Stories, topic engine, smart magazines): https://en.wikipedia.org/wiki/Flipboard
- NewsBlur — Wikipedia (clustering, full-text reading, story change tracking, IFTTT): https://en.wikipedia.org/wiki/NewsBlur
- Newser — App Store listing ("Our stories are brief – usually two paragraphs… Our grid format gives you a simple way to scan the day's headlines"): https://apps.apple.com/us/app/newser/id334678577

**Secondary SEO analysis (MEDIUM confidence — not an official Google statement)**
- Programmatic SEO After March 2026: Scaled Content Survival (uniqueness ratio 30–40 %, non-nullable unique-data schema, editorial synthesis layer, structural fingerprinting, freshness signals, rollout cadence) — https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban
- Scaled Content Abuse: Google's AI Page Crackdown Guide (March 2026 impact; "Data Aggregation" pattern; "AI Translation Spam" pattern) — https://www.digitalapplied.com/blog/scaled-content-abuse-google-march-update-ai-pages-decimated

**Commercial**
- Brevo pricing (Free plan: 300 emails/day) — https://www.brevo.com/pricing/

---
*Feature research for: The Meridian — automated multi-edition news aggregation and programmatic SEO publication*
*Researched: 2026-10-20*
