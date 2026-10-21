# Plan 02-05: Offline Fixture Catalog, Quarantine Fault Isolation & Dual-Run Parity — Summary

**Execution Status:** Complete  
**Phase:** 02 (Feed Acquisition, Raw Capture & Normalization)  
**Plan:** 05  
**Requirements Addressed:** ING-01, ING-02, ING-07, ING-08, D-26, D-28, D-30, OPS-14  

---

## Executive Overview

Plan 02-05 delivered the offline feed fixture catalog, the network-mocked fault isolation test suite, the local CLI ingest runner (`npm run ingest:local`), and dual-run parity verification.

A resilient news aggregator must guarantee that broken, hostile, or oversized publisher responses never stall healthy feeds or bring down an edition (ING-07). Furthermore, offline fixtures covering all dialect variations (RSS 2.0, Atom 1.0, RDF, native Hindi Devanagari) allow predictable, reproducible testing without hitting third-party servers. The local CLI runner replays feeds directly into local D1 SQLite with full repository purity (OPS-14), and dual-run parity tests confirm that edge worker captures and the CI pipeline normalize raw bytes into byte-identical canonical items (ING-02).

---

## Completed Tasks

### Task 1: Create Offline Feed Fixture Catalog
- **Created Fixtures under `tests/fixtures/feeds/`:**
  - `rss-standard.xml`: Standard RSS 2.0 feed with multiple items, media enclosures, dc:creator, and channel metadata.
  - `atom-standard.xml`: Standard Atom 1.0 feed with entry elements, alternate links, authors, and summaries.
  - `rdf-standard.xml`: Valid RDF / RSS 1.0 feed with rdf:about identifiers and dc:date elements.
  - `hindi-standard.xml`: Native Devanagari news items with authentic sentences ending in purna viram `।`.
  - `bot-challenge.html`: HTML payload simulating Cloudflare Turnstile / PerimeterX bot protection signatures (`<!DOCTYPE html>`, `cf-browser-verification`, `turnstile-wrapper`).
  - `malformed.xml`: Truncated, unclosed XML feed payload simulating partial downloads or parser-breaking syntax.
  - `oversized.xml`: Valid XML feed payload exceeding the 2 MB streaming limit (2,200,283 bytes).
  - `oscillating-guid.xml`: Feed items with transient, missing, or empty GUIDs testing canonical URL identity resolution.
- **Verification:** Verified all 8 fixtures exist, `oversized.xml` > 2 MB, `hindi-standard.xml` contains Devanagari and purna viram, and `bot-challenge.html` contains bot signatures.
- **Git Commit:** `df6de5c` - `feat(ingest): add offline feed fixture catalog`

### Task 2: Build Network Mocking Integration Suite Verifying Fault Isolation and Quarantine
- **Created:** `tests/mocks/http.ts`:
  - `MockHttpDispatcher`: Configurable network interceptor simulating HTTP responses (200 OK, 304 Not Modified, 429 with `Retry-After: 3600`, 500 Internal Server Error, and hanging socket timeouts via `AbortSignal`).
  - Supports loading and serving raw fixtures directly from `tests/fixtures/feeds/`.
- **Created:** `tests/quarantine-isolation.test.ts`:
  - Simulated a full 17-feed partition execution via `pollFeedPartition`.
  - Feed 1 (bot challenge): Quarantined in R2 under `raw/quarantine/...` with reason `bot_challenge`.
  - Feed 2 (oversized >2 MB): Quarantined in R2 under `raw/quarantine/...` with reason `oversized`.
  - Feed 3 (500 Server Error): Isolated cleanly as error status without interrupting remaining feeds.
  - Feed 4 (Socket hang/timeout): Isolated via AbortController timeout without stalling the partition.
  - Feed 5 (304 Not Modified): Verified KV state update (`lastFetchedAt`) with 0 bytes written to R2.
  - Feeds 6..17 (12 healthy RSS/Atom feeds): Succeeded with status `'ok'`, writing raw XML snapshots to R2.
  - Proved 100% fault isolation invariant (ING-07): unhealthy feeds never cause healthy feeds or the partition to fail.
- **Verified:** `npm test -- --run tests/quarantine-isolation.test.ts` (2 tests passed).
- **Git Commit:** `b4b09ed` - `test(ingest): add network mock dispatcher and quarantine isolation test suite`

### Task 3: Build Local CLI Ingest Runner and Verify Dual-Run Parity
- **Updated:** `apps/worker/src/db/repository.ts`:
  - Added `RawStoryInsert` interface.
  - Added `batchInsertStories(stories: readonly RawStoryInsert[]): Promise<number>`:
    - Batches stories into chunks of 50 rows.
    - Parameterized execution with explicit column lists.
    - Uses `INSERT INTO stories (...) VALUES (...) ON CONFLICT(source_id, external_guid) DO NOTHING`.
    - Returns count of newly inserted rows, safely ignoring duplicates.
- **Updated:** `apps/worker/src/db/__tests__/repository.test.ts`:
  - Verified repository purity (zero SQL outside `repository.ts`), column name checks, and chunked batch insertion testing.
- **Created:** `scripts/ingest/run-local.ts`:
  - CLI runner callable via `npm run ingest:local`.
  - Supports `--fixtures` (replays local fixture catalog), `--edition <id>` (filters by edition), and `--live` (fetches active remote feeds).
  - Connects to local D1 SQLite database in `.wrangler/state` using `node:sqlite`'s `DatabaseSync`.
  - Maintains strict repository purity (OPS-14): zero SQL queries or keywords in the runner script.
  - Logs summary of feeds processed, items normalized, stories added, and errors.
- **Updated:** `package.json`:
  - Added `"ingest:local": "tsx scripts/ingest/run-local.ts"`.
- **Created:** `tests/dual-run-parity.test.ts`:
  - Compared `normalizeFeed` against `normalizeFeedForRunner` across RSS 2.0, native Hindi, Atom 1.0, RDF, and oscillating GUIDs.
  - Verified exact deep equality and byte-identical JSON string serialization across environments (ING-02).
  - Verified Hindi Devanagari text and purna viram preservation.
- **Verified:** `npm test -- --run tests/dual-run-parity.test.ts`, `npm run typecheck`, and `npm run db:verify:local`.
- **Git Commit:** `655da76` - `feat(ingest): add local CLI ingest runner and dual-run parity verification`

---

## Verification & Status Summary

| Check | Target | Status |
|-------|--------|--------|
| Offline Fixture Catalog | 8 files in `tests/fixtures/feeds/` | Passed |
| Quarantine & Fault Isolation | `tests/quarantine-isolation.test.ts` | 2/2 passed |
| Dual-Run Parity | `tests/dual-run-parity.test.ts` | 3/3 passed |
| Repository & Purity Assertions | `apps/worker/src/db/__tests__/repository.test.ts` | 14/14 passed |
| TypeScript Check | `npm run typecheck` | Passed (0 errors) |
| Local D1 Contract Verification | `npm run db:verify:local` | 24/24 assertions passed |
| Full Test Suite | `npm test -- --run` | 24/24 files, 223/223 passed |

---

## Key Invariants Maintained

- **ING-07 (Fault Isolation):** Single failing or malicious feed payloads (HTML bot screens, oversized streams, HTTP 500s, socket hangs) are isolated to quarantine or error logs and never cascade to healthy feeds.
- **ING-02 (Dual-Run Parity):** Normalization produces byte-identical canonical items from raw feed bytes across both runtime environments (local runner and CI).
- **OPS-14 (Repository Purity):** Every SQL query and statement remains strictly confined to `apps/worker/src/db/repository.ts`. `scripts/ingest/run-local.ts` contains zero SQL keywords.
