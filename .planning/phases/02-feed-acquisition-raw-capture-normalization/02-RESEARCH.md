# Phase 02: Feed Acquisition, Raw Capture & Normalization — Research Document

**Target File:** `D:/myapps/newsportal/.planning/phases/02-feed-acquisition-raw-capture-normalization/02-RESEARCH.md`  
**Status:** Complete & Ready for Plan Synthesis  
**Milestone:** v1.0  
**Phase:** 02 (Feed Acquisition, Raw Capture & Normalization)

---

# Phase 02 Research: Feed Acquisition, Raw Capture & Normalization

## Executive Summary & Boundary Definition

The objective of Phase 02 is to establish the polite, fault-isolated acquisition of publisher feeds across seven English editions (UK, US, AU, CA, IE, NZ, IN) and the native Hindi edition, capture raw XML snapshots into Cloudflare R2, and normalize them in CI into canonical `RawItem` records under a strict, non-negotiable excerpt budget.

### Governing Constraints & Decisions
1. **Architectural Separation (10 ms CPU Ceiling Protection):** The Cloudflare Worker handles **fetch only** (network I/O) and writes raw bytes to R2. It performs **no parsing, no normalization, and no scoring** (ING-02). Its bundle contains **zero XML parsing libraries**. All parsing occurs in Node.js during the CI pipeline using `fast-xml-parser` (5.11.2), where CPU time is unconstrained.
2. **Permanent Free-Tier Ceiling (D-05, OPS-01):**
   - KV: 1,000 writes/day ceiling. The Worker updates feed state (`etag`, `last_modified`, `last_status`, `last_fetched_at`) in KV only on changes or checks (~50 writes/day, 5% of quota). On HTTP 304 Not Modified, R2 writes are skipped completely.
   - Worker Subrequests: 50 subrequests per invocation max. Polling is partitioned across **3 Cron Triggers** (~17 feeds per trigger), ensuring each run uses <25 subrequests and respects the 6 simultaneous outgoing socket limit.
   - R2 Lifecycle: Stored under `raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml`, covered by the 7-day R2 lifecycle rule landed in Phase 01.
3. **Hard Excerpt Contract (CON-01 to CON-05):** Normalization must integrate with `shared/contract/excerpt-budget.ts`: ≤50 words, ≤320 characters, ≤2 sentences, ≤30% of visible source text. If source visible text <160 words, no excerpt is published (`text: null`). Truncation occurs at word boundaries with typographic ellipsis (` …`). Paraphrasing, synonymizing, or translating is strictly prohibited (CON-04).
4. **Launch-Blocking Legal Gate (ING-04, D-17):** Feeds can only be fetched if their terms of use have been verified. The CI build fails if any active feed record is missing `terms_verified_at`, `verified_by`, or `terms_url`, or if `terms_status !== 'verified'`.
5. **Fault Isolation & Quarantine (ING-07, D-07 to D-09):** One broken feed must never affect any other feed or fail an edition. HTML bodies, bot challenge pages (Turnstile/PerimeterX), and payloads >2 MB (enforced via streaming abort) are isolated to `quarantine/` in R2 and logged to D1 `feed_fetches`.
6. **Dual Identity Deduplication (ING-09, D-10):** Feeds with oscillating or absent GUIDs fall back to `sha256(canonicalizedUrl)` (stripping `utm_*`, `ref`, `fbclid`, tracking parameters and normalising protocols/trailing slashes).

---

## 1. System Architecture & Component Design

```
+---------------------------------------------------------------------------------------------------+
| Cloudflare Edge Runtime (Worker)                                                                   |
|                                                                                                   |
|  [3 Cron Triggers] (Partitions 0, 1, 2)                                                           |
|          │                                                                                        |
|          ▼                                                                                        |
|  [Ingest Worker Fetcher] ──(Check KV ETag/State)──> [Cloudflare KV]                               |
|          │                                                                                        |
|    Polite Fetch (1s per-host delay, max 20 req/hr/host, 10s AbortTimeout, User-Agent)             |
|          │                                                                                        |
|          ├─► HTTP 304 Not Modified ──► Update KV `last_checked_at` (Skip R2 write)                |
|          │                                                                                        |
|          ├─► HTTP 200 OK                                                                          |
|          │     ├── Sniff first 256 bytes & Content-Type for XML vs HTML/Bot-Challenge             |
|          │     ├── Stream body with 2 MB byte counter (`ReadableStreamDefaultReader`)             |
|          │     │                                                                                  |
|          │     ├── If Quarantined (HTML, bot challenge, >2MB, invalid prolog):                     |
|          │     │     └── Store in R2: `raw/quarantine/{YYYY-MM-DD}/{feedId}_{reason}_{time}.xml`  |
|          │     │                                                                                  |
|          │     └── If Valid XML:                                                                  |
|          │           ├── Store in R2: `raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml`                 |
|          │           └── Update KV: `{ etag, lastModified, lastStatus: 200, lastFetchedAt }`      |
|          │                                                                                        |
|          └─► HTTP 429 / 5xx / Error ──► Honor `Retry-After`, Exponential backoff in KV            |
+---------------------------------------------------------------------------------------------------+
                                            │
                                  R2 Raw Snapshots
                                            │
+---------------------------------------------------------------------------------------------------+
| CI / Local Node.js Pipeline                                                                       |
|                                                                                                   |
|  [CI Normalizer Runner]                                                                           |
|          │                                                                                        |
|  Reads Raw XML Snapshots from R2                                                                  |
|          │                                                                                        |
|  [fast-xml-parser 5.11.2]                                                                         |
|          │ (Handles RSS 2.0, Atom 1.0, RDF/RSS 1.0)                                               |
|          ▼                                                                                        |
|  [Normalizer & Filter Stage]                                                                      |
|     ├── Cap 25 newest items, filter items >48h old, clamp future pubDates                         |
|     ├── Dual Identity: Stable GUID vs sha256(canonicalizedUrl)                                   |
|     ├── Media Extractor: <media:content>, <enclosure>, inline <img> ≥400px; extract credit        |
|     └── Excerpt Pipeline:                                                                         |
|           ├── Clean Text (strip HTML tags, decode XML entities, collapse whitespace)              |
|           ├── `Intl.Segmenter` tokenization (English words & Hindi Devanagari sentences/`।`)      |
|           ├── `applyExcerptBudget({ candidate, sourceVisibleText })`                              |
|           └── `assertExcerptWithinBudget(excerptText, sourceVisibleText)`                         |
|          │                                                                                        |
|          ▼                                                                                        |
|  Canonical `RawItem` Records                                                                      |
|          │                                                                                        |
|  [Batch D1 Ingest] ──(Via `apps/worker/src/db/repository.ts` only)──► [Cloudflare D1: `stories`]  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Ingest Worker Fetch & Scheduling (Cloudflare Edge)

### 2.1 Partitioned Cron Triggers (D-01)
- Workers Free allows up to 5 Cron Triggers per account (`workers_cron_triggers_per_account`).
- We assign 3 Cron Triggers in `apps/worker/wrangler.jsonc`:
  - `meridian-ingest-0`: `0,15,30,45 * * * *` (Partition 0: feeds 0..16)
  - `meridian-ingest-1`: `5,20,35,50 * * * *` (Partition 1: feeds 17..33)
  - `meridian-ingest-2`: `10,25,40,55 * * * *` (Partition 2: feeds 34..50)
- In the Worker `scheduled(controller, env, ctx)` handler:
  `controller.cron` identifies which partition to execute. Feeds are partitioned deterministically by index or `hash(slug) % 3`.
- Running ~17 feeds per trigger ensures:
  - Subrequests per invocation: ~17 HTTP fetch requests + ~17 R2/KV puts <= 34 total (limit is 50 HTTP subrequests and 1,000 internal subrequests).
  - Wall time: 10–15 seconds total (limit is 15 minutes).
  - Concurrency: Max 6 outgoing connections at a time.
  - Worker CPU: <2 ms per invocation (Worker only pipes streams).

### 2.2 KV Polling State (D-02)
- State key pattern: `feed_state:{sourceSlug}`.
- Value JSON schema:
  ```ts
  interface FeedState {
    etag: string | null;
    lastModified: string | null;
    lastFetchedAt: string;
    lastStatus: number;
    consecutiveFailures: number;
    disabledUntil: string | null; // ISO timestamp
  }
  ```
- Conditional GET headers:
  - If `etag` exists: send `If-None-Match: etag`.
  - If `lastModified` exists: send `If-Modified-Since: lastModified`.
- If response is HTTP 304:
  - Do NOT touch R2.
  - Update `lastFetchedAt` in KV.

### 2.3 Rate Limiting & User-Agent (D-03, D-04, ING-10)
- User-Agent: Configured in `shared/config/site.ts`:
  `TheMeridian/1.0 (+https://themeridian.news/bot; bot@themeridian.news)` (reconciling with D-04).
- Host rate limit:
  - Minimum 1-second delay between requests to the same hostname (`new URL(feedUrl).hostname`).
  - Max 20 requests per host per hour.
  - If HTTP 429 is encountered: parse `Retry-After` header (seconds or RFC 2822 date), clamp to a maximum backoff (e.g. 24 hours), and set `disabledUntil` in KV.

### 2.4 Streaming Body Limit & Quarantine Sniffing (D-07, D-08, D-09, ING-07)
- 10-second timeout per fetch via `AbortController` (D-05), retrying once on transient socket error with 2-second backoff.
- On HTTP 200 response:
  - Check `Content-Type`: If `text/html`, flag immediately as quarantine candidate.
  - Use `response.body.getReader()`. Read first chunk (up to 256 bytes).
  - Inspect prolog:
    - HTML check: `<!DOCTYPE html` or `<html`
    - Bot challenges: `cf-browser-verification`, `challenge-platform`, `Turnstile`, `PerimeterX`, `Just a moment...`
    - Valid XML prolog: `<?xml`, `<rss`, `<feed`, `<rdf:RDF`.
  - Stream reading loop:
    - Track `totalBytes += chunk.byteLength`.
    - If `totalBytes > 2 * 1024 * 1024` (2 MB): abort reader via `reader.cancel('Oversized')` and flag as `oversized`.
  - Storage destination:
    - If valid: R2 key `raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml`.
    - If quarantined: R2 key `raw/quarantine/{YYYY-MM-DD}/{feedId}_{reason}_{timestamp}.xml`.
      *(Note on prefix: Storing under `raw/quarantine/` ensures the Phase 01 7-day R2 lifecycle rule automatically purges quarantine files without breaching the verified 2-rule lifecycle invariant on the bucket).*
    - Log error details in `feed_fetches` / source error log.

---

## 3. Source Registry & Legal Verification Gate

### 3.1 Registry Structure (`config/sources.ts`)
- Stored as a version-controlled TypeScript file: `config/sources.ts`.
- Typed schema with Zod validation:
  ```ts
  export interface SourceRegistryEntry {
    slug: string;
    name: string;
    homepageUrl: string;
    feedUrl: string;
    countryCode: 'GB' | 'US' | 'AU' | 'CA' | 'IE' | 'NZ' | 'IN';
    language: 'en' | 'hi';
    defaultSection?: string;
    sectionPrior: Record<string, number>;
    freshnessSlaHours: number; // 24 for wire/daily, 48 for regional
    isActive: boolean;
    termsStatus: 'verified' | 'unverified' | 'refused';
    termsVerifiedAt: string | null; // ISO YYYY-MM-DD
    verifiedBy: string | null;      // Auditor name/ID
    termsUrl: string | null;        // Canonical terms URL
  }
  ```

### 3.2 Launch-Blocking Legal Gate (ING-04, D-17)
- A dedicated test `tests/legal-gate.test.ts` runs during `npm test` and CI:
  ```ts
  for (const source of SOURCES.filter(s => s.isActive)) {
    expect(source.termsStatus).toBe('verified');
    expect(source.termsVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(source.verifiedBy).toBeTruthy();
    expect(source.termsUrl).toMatch(/^https:\/\//);
  }
  ```
- Any active feed without verified terms fails the CI build immediately.
- Inactive/unverified feeds have `isActive: false` and are never queried by the fetch Worker.

### 3.3 Dead & Refusing Feed Replacements from S-2/S-3
In Spikes S-2 and S-3, 4 feeds were identified as dead/refusing for all clients:
- `washington-post`: 502 -> Replace with NPR Top News (`https://feeds.npr.org/1001/rss.xml`) or CBS News.
- `cnn`: TLS redirect loop -> Replace with ABC News US (`https://abcnews.go.com/abcnews/topstories`).
- `associated-press`: 403 Forbidden -> Replace with Reuters US wire endpoint or PBS NewsHour (`https://www.pbs.org/newshour/feeds/rss/headlines`).
- `newshub-nz`: Defunct organisation (closed July 2024) -> Replace with Otago Daily Times or The Spinoff (`https://thespinoff.co.nz/feed`).
- Hindi sources: Validate `amar-ujala` (`https://www.amarujala.com/rss/`) and add Dainik Bhaskar / BBC Hindi (`https://feeds.bbci.co.uk/hindi/rss.xml`).

### 3.4 Freshness SLA & Failure Backoff (ING-06, D-18, D-19)
- Wire/daily feeds: alert after 24 hours without new items.
- Regional/weekly feeds: alert after 48 hours without new items.
- Silent feeds are reported as health failures in D1 `feed_fetches` / status dashboards, never masked as "no news".
- Exponential backoff on failure:
  - 1 failure: retry next scheduled run.
  - 3 consecutive failures: backoff 2 hours.
  - 5 consecutive failures: backoff 6 hours.
  - 10 consecutive failures: auto-disable feed (`isActive = false`), log critical alert.

---

## 4. Normalization Pipeline & Dual Identity (CI / Node.js)

### 4.1 XML Parsing with `fast-xml-parser` (ING-08)
- Library: `fast-xml-parser` version `5.11.2`.
- Parser Options:
  ```ts
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: true,
    trimValues: true,
    isArray: (name) => ['item', 'entry', 'link', 'media:content'].includes(name),
  });
  ```
  *(Using `isArray` guarantees single-item feeds parse as arrays rather than objects).*
- Dialect handling:
  - **RSS 2.0**: `parsed.rss.channel.item`
  - **Atom 1.0**: `parsed.feed.entry`
  - **RDF / RSS 1.0**: `parsed['rdf:RDF'].item`

### 4.2 Field Extraction & Priority Cascades
1. **Title**: Strip HTML tags, decode entities, collapse whitespace.
2. **Author**: Extract from `<dc:creator>`, `<author><name>`, or `<author>`.
3. **Publication Timestamp (D-24, D-25)**:
   - Parse `pubDate`, `published`, `updated`, or `dc:date`.
   - If invalid or missing: fall back to snapshot fetch timestamp.
   - If in future (>1 hour ahead of current system clock): clamp to current system clock.
   - Discard items older than 48 hours.
   - Cap ingest at newest 25 items per feed per run.
4. **Media & Image Enclosures (D-20 to D-23)**:
   - Cascade:
     1. `<media:content medium="image">` or `<media:thumbnail>`: select variant with largest width.
     2. `<enclosure type="image/*">`: extract `@_url`.
     3. Inline `<img>` in content/description with width ≥ 400px.
   - Filter tracking pixels: reject if dimensions < 200px or URL matches known tracking regexes (`feedburner`, `stats.`, `/pixel.gif`, etc.).
   - Sanitize: force `https://`, strip tracking params (`utm_*`, `ref`).
   - Extract credit: `<media:credit>` or `<dc:creator>`.
   - If no image passes: `imageUrl = null`.

### 4.3 Dual-Identity Deduplication (ING-09, D-10)
- Normalise source URL:
  ```ts
  export function canonicalizeSourceUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    // Strip tracking parameters
    const BANNED_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'ref_src', 'cmp'];
    for (const key of Array.from(url.searchParams.keys())) {
      if (BANNED_PARAMS.includes(key) || key.startsWith('utm_') || key.startsWith('at_')) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    let pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';
    return `https://${url.hostname}${pathname}${url.search ? url.search : ''}`;
  }
  ```
- Identity Resolution:
  - If feed is known to have unstable GUIDs or if GUID is absent:
    `identity = 'url:' + sha256(canonicalizeSourceUrl(item.link))`
  - Otherwise: `identity = item.guid` (or fallback to canonical URL hash).

---

## 5. Hard Excerpt Contract & Text Sanitization (CON-01 to CON-05)

### 5.1 Cleaning Candidate Text (D-12)
- Cascade candidate excerpt: 1) `description`, 2) `content:encoded` or `summary`, 3) Atom `content`.
- Text sanitization:
  - Strip `<script>` and `<style>` blocks.
  - Strip HTML tags.
  - Decode HTML entities (`&amp;` -> `&`, `&#x27;` -> `'`, `&nbsp;` -> ` `, etc.).
  - Collapse multiple whitespace to single space.
  - Trim leading and trailing whitespace.

### 5.2 Unicode & Language Segmentation (`Intl.Segmenter`) (D-14)
- `Intl.Segmenter` must be used to tokenize text across English and Hindi Devanagari:
  - Word count: `new Intl.Segmenter(language, { granularity: 'word' })`, counting segments where `segment.isWordLike === true`.
  - Sentence count: `new Intl.Segmenter(language, { granularity: 'sentence' })`. For Hindi (`hi`), `Intl.Segmenter` natively handles the purna viram `।` (U+0964).
- The existing Phase 01 contract in `shared/contract/excerpt-budget.ts` provides `applyExcerptBudget(input)` and `assertExcerptWithinBudget(text, sourceVisibleText)`.
- **Note on Source Visible Text (CON-02):**
  If the source text provided in the feed is under 160 words (e.g. short synopsis only, without full `content:encoded`), `applyExcerptBudget()` returns `rejection: 'source_too_short'` and `text: null`. The item is saved with `excerpt: null`. No excerpt is published.
- Truncation formatting (D-13): When truncated, text ends at word boundary followed by ` …` (`\u00A0…` or ` …`).
- Verbatim verification (CON-04): The contract asserts `candidate.startsWith(publishedPrefix)` before returning.

---

## 6. D1 Persistence & Datastore Invariants (OPS-14)

### 6.1 Single Repository Module Rule
- In Phase 01, `apps/worker/src/db/__tests__/repository.test.ts` established that `apps/worker/src/db/repository.ts` is the **only module allowed to contain SQL**.
- Any new queries required for Phase 02 must be added as methods on `Repository` in `apps/worker/src/db/repository.ts`:
  1. `syncSources(sources: SourceRegistryEntry[])`: Bulk `INSERT OR REPLACE` into `sources`.
  2. `recordFeedFetch(log: FeedFetchLog)`: Appends to `feed_fetches`.
  3. `batchInsertStories(stories: StoryInsert[])`: Batched `INSERT OR IGNORE` into `stories`.
  4. `updateSourceHealth(id: number, status: string, error: string | null)`: Updates `sources` health metrics.

### 6.2 D1 Batching (D-26)
- D1 writes are batched in chunks of 25–50 rows using `db.batch()` to minimize subrequests and respect the 30-second query timeout.

---

## 7. Phase 02 Plan Decomposition (Recommended Execution Waves)

We recommend structuring Phase 02 into five discrete, sequenced plans:

| Plan | Name | Scope & Deliverables |
|---|---|---|
| **02-01** | **Source Registry & Legal Verification Gate** | - Create `config/sources.ts` covering 7 countries + Hindi with validated replacement feeds for S-2/S-3 failures.<br>- Implement launch-blocking legal gate `tests/legal-gate.test.ts` (ING-03, ING-04, D-16, D-17).<br>- Add source synchronization logic to D1 repository (OPS-14). |
| **02-02** | **Ingest Fetch Worker & Partitioned Scheduling** | - Update `apps/worker/wrangler.jsonc` with 3 cron triggers and KV binding (D-01, D-02).<br>- Implement polite fetcher in `apps/worker/src/fetcher/` with 1s per-host rate limit, max 20 req/hr/host, 10s AbortController timeout, and descriptive User-Agent (ING-01, ING-10, D-03, D-04, D-05).<br>- Implement body sniffer and 2 MB streaming byte limiter (D-07, D-08).<br>- Implement raw XML storage in R2 (`raw/`) and quarantine storage (`raw/quarantine/`) (ING-07, D-06, D-09).<br>- Add worker purity test: assert Worker contains NO XML parser (ING-02). |
| **02-03** | **Feed Normalization & Dual Identity** | - Add `fast-xml-parser` (5.11.2) to `package.json`.<br>- Implement RSS 2.0, Atom 1.0, and RDF normalizer in CI pipeline (`src/ingest/normalizer.ts`) (ING-08).<br>- Implement URL canonicalizer and SHA-256 fallback for unstable GUIDs (ING-09, D-10).<br>- Implement media enclosure and credit extractor (D-20 to D-23).<br>- Implement per-run backlog cap (25 items, 48h filter, future timestamp clamp) (D-24, D-25). |
| **02-04** | **Hard Excerpt Budget Integration & Language Segmentation** | - Implement HTML tag stripping, XML entity decoding, and text cleaning (D-11, D-12).<br>- Integrate `Intl.Segmenter` for unicode-compliant word and sentence boundary counting in English and Devanagari Hindi `।` (D-14).<br>- Connect normalizer output to `applyExcerptBudget()` and `assertExcerptWithinBudget()` (CON-01 to CON-05, D-13, D-15).<br>- Verify 160-word floor and null excerpt behavior (CON-02). |
| **02-05** | **Test Fixtures, MSW Network Mocking & Local CLI Runner** | - Create offline fixture set in `tests/fixtures/feeds/` for all 7 countries, Hindi, malformed XML, bot challenges, oversized feeds, and unstable GUIDs (D-28).<br>- Setup MSW / Undici mock test suite verifying HTTP 304, HTTP 429 Retry-After, timeouts, and quarantine isolation (D-31).<br>- Implement local CLI runner `npm run ingest:local` for offline development (D-30).<br>- Run dual-run parity test: confirm identical XML captured by Worker and CI normalize to identical items (Success Criterion 2). |

---

## 8. Validation Architecture

### 8.1 Automated Test Strategy
The phase verification must include unit, contract, and end-to-end integration tests:

1. **Worker Purity & No XML Parser (ING-02):**
   - Test: `apps/worker/__tests__/purity.test.ts`
   - Scans `apps/worker/src` and built Worker bundle for any import of `fast-xml-parser`, `xmldom`, or XML parsing regexes.
2. **Legal Verification Gate (ING-04, D-17):**
   - Test: `tests/legal-gate.test.ts`
   - Inspects `config/sources.ts`. Fails if any active feed has `termsStatus !== 'verified'`, missing `termsVerifiedAt`, missing `verifiedBy`, or invalid `termsUrl`.
3. **Repository Purity (OPS-14):**
   - Existing test: `apps/worker/src/db/__tests__/repository.test.ts`
   - Confirms all new SQL queries live strictly within `apps/worker/src/db/repository.ts`.
4. **Free-Tier Literal Scan (OPS-01):**
   - Existing test: `shared/config/__tests__/free-tier-limits.test.ts`
   - Confirms no bare enforced ceiling literals are planted in new code.
5. **Fetcher Logic & Rate Limiting (ING-01, ING-10, D-01 to D-09):**
   - Test: `apps/worker/src/fetcher/__tests__/fetcher.test.ts`
   - Validates conditional GET headers (`If-None-Match`, `If-Modified-Since`).
   - Validates HTTP 304 handling (KV updated, R2 write skipped).
   - Validates 1-second host delay and max 20 requests/host/hour.
   - Validates HTTP 429 `Retry-After` parsing and backoff.
   - Validates 10-second timeout and 1-retry backoff.
   - Validates first 256 bytes sniffing: rejects HTML and bot-challenges (`Turnstile`, `PerimeterX`).
   - Validates streaming 2 MB limit: aborts stream and writes to `raw/quarantine/`.
6. **Normalization & Dual Identity (ING-08, ING-09, D-10, D-20 to D-27):**
   - Test: `tests/normalization.test.ts`
   - Parses RSS 2.0, Atom 1.0, and RDF fixtures to canonical `RawItem`.
   - Validates `canonicalizeSourceUrl` and SHA-256 fallback when GUID oscillates.
   - Validates candidate image extraction and tracking pixel filtering.
   - Validates backlog cap: exactly ≤25 items, no items >48h old, future timestamps clamped.
7. **Excerpt Budget & Unicode Segmentation (CON-01 to CON-05, D-13 to D-15):**
   - Test: `tests/excerpt-pipeline.test.ts`
   - Validates `Intl.Segmenter` sentence splitting with Hindi purna viram `।`.
   - Validates HTML tag stripping and entity unescaping.
   - Validates source text <160 words produces `text: null`.
   - Validates verbatim prefix check (CON-04).
   - Validates `assertExcerptWithinBudget` throws on any manual tampering.
8. **Fault Isolation / Quarantine Independence (ING-07):**
   - Test: `tests/quarantine-isolation.test.ts`
   - Simulates a batch where one feed returns HTML bot-challenge, one returns >2MB, and one returns 500. Proves valid feeds in the same run are ingested and stored without interruption.
9. **Dual Run Parity:**
   - Test: `tests/dual-run-parity.test.ts`
   - Proves raw bytes saved in R2 produce byte-identical canonical items whether parsed in CI or local runner.

### 8.2 Verification Commands
```bash
# 1. Run all unit and contract tests
npm test -- --run

# 2. Verify D1 repository purity and schema
npm run db:verify:local

# 3. Verify R2 lifecycle rules remain untouched (exactly 2 rules)
npm run r2:lifecycle:verify

# 4. Verify local ingest runner against offline fixtures
npm run ingest:local -- --fixtures
```

---

## RESEARCH COMPLETE
