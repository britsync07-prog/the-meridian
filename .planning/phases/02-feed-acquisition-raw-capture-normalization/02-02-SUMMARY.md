# Plan 02-02 Summary: Fetch-Only Edge Ingest Worker, Rate Limiting, Quarantine & R2 Storage

## Deliverables & Status

1. **Partitioned Cron Triggers & KV Feed State (`apps/worker/wrangler.jsonc`, `apps/worker/src/db/config.ts`, `apps/worker/src/fetcher/state.ts`)**:
   - Configured 3 partitioned cron triggers (`0,15,30,45 * * * *`, `5,20,35,50 * * * *`, `10,25,40,55 * * * *`) staying well within Cloudflare Worker Free plan limits (50 subrequests/invocation, 6 concurrent sockets, 10 ms CPU).
   - Bound KV namespace `KV` for feed polling state (`feed_state:${slug}`).
   - Updated `MeridianEnv` with `KV: KVNamespace`.
   - Implemented `getFeedState`, `updateFeedState`, and `createDefaultFeedState` in `apps/worker/src/fetcher/state.ts`.

2. **Automated Worker Purity Test (`apps/worker/__tests__/purity.test.ts`)**:
   - Implemented automated scan verifying `apps/worker/src` contains zero imports of XML parsers (`fast-xml-parser`, `xmldom`, `@xmldom/xmldom`, `cheerio`, `htmlparser2`, `sax`, `xml2js`) and zero usages of `DOMParser` (ING-02).
   - Validates cron triggers and KV binding directly from `wrangler.jsonc`.

3. **Polite HTTP Fetcher (`apps/worker/src/fetcher/polite-fetch.ts`)**:
   - Sent exact `USER_AGENT` from `shared/config/site.ts` with descriptive contact URL and monitored email (ING-10, D-04).
   - Conditional GET support: attaches `If-None-Match` and `If-Modified-Since` from KV state (ING-01, D-02).
   - Implemented `HostRateLimiter` enforcing minimum 1-second delay between requests to the same origin and max 20 requests per host per hour (ING-10, D-03).
   - 10-second `AbortController` timeout, retrying at most once with 2-second backoff upon transient network glitches (D-05).
   - Handled HTTP 304 Not Modified without touching R2, updating only `lastFetchedAt` and `lastStatus: 304` in KV.
   - Handled HTTP 429 Rate Limited: parsed `Retry-After` header (seconds integer or HTTP date), persisted `disabledUntil` backoff in KV, and skipped subsequent calls while disabled.

4. **Response Sniffing, 2 MB Streaming Ceiling, and R2 Quarantine (`apps/worker/src/fetcher/quarantine.ts`, `apps/worker/src/fetcher/index.ts`)**:
   - Sniffed `Content-Type` and first 256 bytes for valid XML prologs (`<?xml`, `<rss`, `<feed`, `<rdf:RDF`) vs HTML / bot challenge signatures (Cloudflare Turnstile, PerimeterX, `<!DOCTYPE html`, `cf-browser-verification`) (D-07).
   - Implemented `readStreamWithCeiling` enforcing hard 2 MB streaming body limit via `ReadableStreamDefaultReader.cancel()` to protect Worker memory (D-08).
   - Stored valid XML in R2 under `raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml` (D-06).
   - Stored quarantined payloads in R2 under `raw/quarantine/{YYYY-MM-DD}/{feedId}_{reason}_{timestamp}.xml` (D-09).
   - Isolated failures per feed: bad feed error or challenge quarantines cleanly without affecting other feeds in the partition (ING-07).
   - Partitioned active feed dispatch across the 3 cron triggers in `scheduled()` export in `apps/worker/src/index.ts`.

## Verification Results

- Automated test suites:
  - `apps/worker/__tests__/purity.test.ts`: Passed (4 tests passed)
  - `apps/worker/src/fetcher/__tests__/fetcher.test.ts`: Passed (6 tests passed)
  - `apps/worker/src/fetcher/__tests__/quarantine.test.ts`: Passed (6 tests passed)
- Full test suite:
  - `npm test -- --run`: Passed (16 test files, 162 tests passed)
- Typecheck:
  - `npm run typecheck`: Passed (exit code 0)
- Local D1 database contract:
  - `npm run db:verify:local`: Passed (24/24 assertions passed)
- Cloudflare R2 lifecycle rules:
  - `npm run r2:lifecycle:verify`: Passed (2 rules, raw/ 7d and media/ 365d)
