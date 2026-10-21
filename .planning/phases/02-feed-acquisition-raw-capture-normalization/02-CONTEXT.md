# Phase 2: Feed Acquisition, Raw Capture & Normalization - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Publisher feeds across seven editions (and native Hindi sources for India) are fetched politely, captured raw, and turned into canonical story items under a hard excerpt budget, with one bad feed never able to affect another.

This phase delivers:
- The fetch-only Cloudflare Ingest Worker with partitioned cron schedules, conditional GET (ETag/Last-Modified in KV), polite rate limiting, body size ceilings, and raw XML snapshot storage in R2.
- The canonical feed source registry with metadata, section priors, health metrics, and the launch-blocking terms-of-use verification ledger.
- The CI normalization pipeline using `fast-xml-parser` to transform RSS 2.0/Atom/RDF snapshots into canonical `RawItem` records.
- Strict enforcement of the hard excerpt contract (≤50 words, ≤320 chars, ≤2 sentences, ≤30% visible text, no excerpt if <160 words, verbatim only) with unicode-aware `Intl.Segmenter` boundaries.
- Quarantine mechanisms for bot-challenge pages, malformed XML, and oversized payloads.
- Dual-identity deduplication (GUID fallback to canonicalized URL sha256).
- Offline unit and integration test fixtures with MSW network mocking and a local CLI ingest runner.

Out of boundary: cross-outlet deduplication clustering and ML embeddings (Phase 3), design tokens and typography styling (Phase 4), Astro page generation and sharded static publication (Phase 5), daily digests and newsletter generation (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Ingest Worker Fetch & Scheduling

- **D-01:** Partition feed polling across **3 separate Cron Triggers** (e.g. ~17 feeds per trigger invocation) to ensure execution stays safely below Cloudflare Worker Free plan limits (50 subrequests/invocation, 6 concurrent outgoing sockets, and 10 ms CPU time). — **Reversibility:** costly — changing triggers requires updating wrangler.toml cron definitions and partition assignment logic in the worker.
- **D-02:** Persist feed polling state (ETag, Last-Modified, last HTTP status, last fetched timestamp) as **compact JSON keys per feed in Cloudflare KV** (~50 writes/day, well within the 1,000 writes/day free limit). Skip writing to R2 entirely on HTTP 304 Not Modified; update only `last_checked_at` in KV.
- **D-03:** Enforce a strict **per-host rate limit**: minimum 1-second delay between requests to the same origin, capped at 20 requests per host per hour, honoring upstream `Retry-After` headers on HTTP 429.
- **D-04:** Use an explicit, transparent User-Agent string: `TheMeridian/1.0 (+https://themeridian.news/bot; bot@themeridian.news)`.
- **D-05:** Set an individual fetch timeout of **10 seconds using `AbortController`**, retrying at most once with a 2-second backoff upon transient network socket glitches.
- **D-06:** Raw XML bodies are written to R2 under the key pattern: `raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml` (covered by the Phase 1 7-day R2 lifecycle expiration rule).

### Quarantine & Malformed Feed Defense

- **D-07:** Sniff both the HTTP `Content-Type` header and the **first 256 bytes of the response body** for XML prolog indicators (`<?xml`, `<rss`, `<feed`). If HTML `<!DOCTYPE html` or bot-challenge signatures (Cloudflare Turnstile, PerimeterX, 403/503 HTML masquerading as 200) are detected, immediately abort and quarantine.
- **D-08:** Enforce a hard **2 MB body limit via a streaming byte counter** (`ReadableStreamDefaultReader`), calling `controller.abort()` the moment received bytes exceed 2 MB to protect Worker memory and avoid processing bloated/abusive payloads.
- **D-09:** Store quarantined bodies in R2 under `quarantine/{YYYY-MM-DD}/{feedId}_{reason}_{timestamp}.xml` and log error details to the D1 `feed_health` table so issues are auditable without blocking other feeds.
- **D-10:** Neutralize unstable or oscillating feed GUIDs by implementing **dual identity**: compute a SHA-256 hash of the canonicalized article URL (normalized protocol, www stripped, tracking params such as `utm_*`, `ref`, `fbclid` stripped) as the primary item deduplication key when GUID is unstable or absent.

### Excerpt Budget & Normalization Rules

- **D-11:** Candidate excerpt text extraction follows a strict priority cascade: 1) `description` (succinct editorial summary), 2) `content:encoded` or `summary`, 3) Atom `content`.
- **D-12:** Clean raw candidate text by stripping all HTML tags, decoding XML/HTML entities (`&amp;`, `&quot;`, `&#x27;`, etc.), collapsing consecutive whitespace, and removing inline tracking scripts/boilerplate before passing text to budget validators.
- **D-13:** Excerpts exceeding the 50-word or 320-character ceiling are truncated at the nearest clean word boundary followed by a non-breaking space and a typographic ellipsis character (` …`).
- **D-14:** Implement sentence and word counting using **`Intl.Segmenter`** (`granularity: 'word'` and `granularity: 'sentence'`) to provide robust, unicode-compliant tokenization across both English broadsheet editions and Devanagari Hindi text (respecting the purna viram `।` punctuation mark).
- **D-15:** Enforce the Phase 1 excerpt contract strictly: if the source text is under 160 words, or if visible excerpt text would exceed 30% of total source text, or if it exceeds 2 sentences, omit the excerpt entirely. Verbatim only; never paraphrased or translated.

### Source Registry & Health Tracking

- **D-16:** Maintain the canonical source registry as a version-controlled **TypeScript/JSON module in the repository** (e.g. `config/sources.ts`) containing feed URLs, country codes, language (`en` or `hi`), section priors, freshness SLA tiers, and legal verification metadata. This file is synced to D1 `sources` at build time.
- **D-17:** Implement the **launch-blocking legal gate**: CI build fails if any active feed record is missing `terms_verified_at`, `verified_by`, or a valid `terms_url`.
- **D-18:** Handle repeated polling failures with **exponential backoff and jitter** (1 failure: retry next scheduled run; 3 consecutive: wait 2 hours; 5 consecutive: wait 6 hours; 10 consecutive: auto-disable feed and alert).
- **D-19:** Define a **tiered freshness SLA**: major wire/daily feeds must produce new items within 24 hours; regional/weekly feeds alert after 48 hours. Feeds falling silent are flagged as health failures rather than "no news".

### Media & Image Enclosure Extraction

- **D-20:** Candidate image URL resolution priority cascade: 1) `<media:content medium="image">` (highest resolution variant), 2) `<enclosure type="image/*">`, 3) first inline `<img>` tag with width ≥ 400px. Filter out tracking pixels (dimensions < 200px or URLs matching tracker regexes).
- **D-21:** Sanitize candidate image URLs: enforce HTTPS, remove query tracking parameters (`utm_*`, `ref`), and store as optional/nullable in D1 `story_sources`.
- **D-22:** If no valid image enclosure exists, the story record stores `image_url: null`. Downstream UI tiers will render the Phase 1 typographic fallback panel.
- **D-23:** Extract photographer credits and copyright notices from `<media:credit>` or `<dc:creator>` when present and persist in `story_sources` for publisher attribution.

### Per-Run Items Cap & Backlog Management

- **D-24:** Cap ingestion to the **25 newest items per feed per run**, sorted by `pubDate` descending. Ignore items with a publication date older than 48 hours to avoid backfilling massive historical archives on initial discovery.
- **D-25:** Sanitize publication timestamps: if `pubDate` is missing or invalid, fall back to the snapshot fetch timestamp; if `pubDate` is in the future (>1 hour ahead), clamp to the current system time.
- **D-26:** Write normalized items to D1 using **batched `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING`** statements (chunks of 25–50 rows) to stay comfortably within D1's 30-second query duration and write thresholds.
- **D-27:** Update `last_item_at` on the feed record with the maximum processed timestamp, maintaining an ingestion high-water mark.

### Local Development & Offline Fixtures

- **D-28:** Maintain an offline test suite in `tests/fixtures/feeds/` containing real-world XML samples for all 7 countries and Hindi sources, covering standard RSS 2.0, Atom 1.0, malformed XML, oversized feeds, and bot-challenge pages.
- **D-29:** Use **`wrangler dev` local emulation** (`.wrangler/state`) to test worker fetch, local SQLite D1, local KV, and local R2 storage without needing live cloud credentials.
- **D-30:** Provide a standalone CLI runner script (`npm run ingest:local`) to replay or fetch feeds directly into local SQLite D1 for fast offline development and debugging.
- **D-31:** Simulate network edge cases (HTTP 304, HTTP 429 Retry-After, socket timeouts, byte caps) in Vitest using **Mock Service Worker (MSW)** or node undici interceptors.

### Agent's Discretion

- Choice of internal utility helpers for XML stream sniffing.
- Specific chunking algorithms for batching D1 SQL statements.
- Exact regex patterns for URL tracking parameter cleanup.
- Fine-grained structure of fixture directory files.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture and Decisions
- `.planning/codebase/ARCHITECTURE.md` — Reconciled system architecture, storage tiers (R2 raw/quarantine, KV ETag state, D1 relational store), and the 10 ms Worker CPU / CI Node transform separation.
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md` — Phase 1 decisions including free-tier hard ceiling, R2 7-day raw lifecycle, single package.json, and excerpt legal boundaries.
- `.planning/PROJECT.md` — Project core constraints, excerpt limits (≤50 words, ≤320 chars, ≤2 sentences, ≤30% visible text), and attribution requirements.
- `.planning/REQUIREMENTS.md` — Requirements ING-01 through ING-10 (feed ingest and polite crawling) and CON-01 through CON-05 (content contract and excerpt rules).
- `.planning/ROADMAP.md` — Phase 2 goal, scope, and success criteria.

### Technical References
- `.planning/research/STACK.md` — Fast-xml-parser 5.11.2 configuration (`ignoreAttributes:false`, `attributeNamePrefix:'@_'`, `trimValues:true`), Cloudflare Cron trigger specs, and D1 batching limits.
- `.planning/research/PITFALLS.md` — Pitfalls P-1 (publisher feed bot blocks), P-2 (silent feed failures), P-6 (unstable GUID duplicates), and P-11 (excerpt copyright creep).

</canonical_refs>
