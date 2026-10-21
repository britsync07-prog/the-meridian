# Plan 02-03: Feed Parsing, URL Canonicalization, Dual Identity & Normalization — Summary

**Execution Status:** Complete  
**Phase:** 02 (Feed Acquisition, Raw Capture & Normalization)  
**Plan:** 03  
**Requirements Addressed:** ING-08, ING-09, D-10, D-20, D-21, D-22, D-23, D-24, D-25  

---

## Executive Overview

Plan 02-03 delivered the CI and Node.js feed normalization engine. Publisher feeds across 7 editions and native Hindi sources exhibit significant variance across XML dialects, enclosure styles, tracking parameters, and oscillating GUID schemes. This engine bridges raw captured XML snapshots with downstream curation and clustering by producing standardized, sanitized `RawItem` records.

All XML parsing remains strictly isolated to the CI/Node environment (`src/ingest/`), completely preserving the Cloudflare Worker fetcher's 10 ms CPU budget and purity invariant (zero XML parser libraries in edge bundle).

---

## Completed Tasks

### Task 1: Multi-Dialect XML Feed Parser
- **Installed:** `fast-xml-parser@5.11.2` as a pinned dependency in `package.json`.
- **Created:** `src/ingest/parser.ts` configuring `XMLParser` with `processEntities: true`, `trimValues: true`, `attributeNamePrefix: '@_'`, and `isArray: (name) => ['item', 'entry', 'link', 'media:content'].includes(name)`.
- **Implemented:** `parseXmlFeed(xmlText: string)` supporting:
  - RSS 2.0 (`rss.channel.item`)
  - Atom 1.0 (`feed.entry` mapping `title`, `summary`/`content`, `id`, `link`)
  - RDF / RSS 1.0 (`rdf:RDF.item` with `rdf:about` fallback)
  - Array guarantees for single-item feeds and malformed input handling.
- **Verified:** `tests/parser.test.ts` (7 passing tests).
- **Git Commit:** `6080330` - `feat(ingest): install fast-xml-parser and build multi-dialect XML feed parser (ING-08)`

### Task 2: URL Canonicalization, Dual Identity & Media Enclosure Cascade
- **Created:** `src/ingest/url.ts` implementing `canonicalizeSourceUrl(rawUrl)`:
  - Enforces HTTPS protocol.
  - Lowercases hostname and removes leading `www.`.
  - Removes URL fragments (`#...`).
  - Strips tracking parameters (`utm_*`, `ref`, `ref_src`, `fbclid`, `gclid`, `cmp`, `at_*`, `mc_*`, `_hs*`).
  - Deterministically sorts remaining query parameters.
  - Normalizes trailing slashes (preserving root `/`).
- **Created:** `src/ingest/identity.ts` implementing `resolveItemIdentity(item, options)`:
  - Uses publisher GUID when present and reliable.
  - Falls back to `url:${sha256(canonicalUrl)}` when GUID is absent, empty, or flagged as oscillating/unstable (ING-09).
- **Created:** `src/ingest/media.ts` implementing `extractMediaEnclosure(item)`:
  - Priority cascade: `<media:content>` / `<media:thumbnail>` (largest width) > `<enclosure type="image/*">` > inline `<img>` (width ≥ 400px).
  - Filters tracking pixels (width/height < 200px or tracker domains like `feedburner`, `stats.`, `pixel.gif`).
  - Enforces HTTPS and parameter sanitization on candidate image URLs.
  - Extracts photographer / attribution credit from `<media:credit>`, `<media:copyright>`, or `<dc:creator>`.
- **Verified:** `tests/normalization.test.ts` (12 passing tests).
- **Git Commit:** `41f9bf5` - `feat(ingest): implement URL canonicalizer, dual identity, and media cascade (ING-09, D-20-D-23)`

### Task 3: Item Normalization with Backlog Capping & Timestamp Sanitization
- **Created:** `src/ingest/normalizer.ts` implementing `normalizeFeed(xmlText, source, snapshotTimestamp, nowMs)`:
  - Transforms raw parsed XML elements into canonical `RawItem` records conforming to `shared/types.ts`.
  - Cleans HTML tags and decodes entities in `title` and `description`.
  - Parses pubDate across dialects (`pubDate`, `published`, `updated`, `dc:date`), falling back to `snapshotTimestamp`.
  - Filters out backlog items older than 48 hours (D-24).
  - Clamps future publication dates (>1 hour ahead) to current system time (D-25).
  - Sorts items by `publishedAt` descending and caps output to top 25 newest items (D-24).
- **Verified:** `tests/normalizer.test.ts` (5 passing tests) and `npm run typecheck`.
- **Git Commit:** `3fbb97f` - `feat(ingest): implement item normalization with backlog capping and timestamp clamping (ING-08, D-24, D-25)`

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Parser Unit Tests | `npm test -- --run tests/parser.test.ts` | 7 passed |
| Normalization Unit Tests | `npm test -- --run tests/normalization.test.ts` | 12 passed |
| Normalizer Unit Tests | `npm test -- --run tests/normalizer.test.ts` | 5 passed |
| TypeScript Typecheck | `npm run typecheck` | Passed (0 errors) |
| Full Test Suite | `npm test -- --run` | 19 test files, 186 tests passed |
| Local D1 Invariant Check | `npm run db:verify:local` | 24/24 assertions passed |
| R2 Lifecycle Rules | `npm run r2:lifecycle:verify` | Verified 2 prefix rules (raw/ 7d, media/ 365d) |

---

## Artifacts Produced

- `src/ingest/parser.ts`: Multi-dialect XML parser for RSS 2.0, Atom 1.0, and RDF
- `src/ingest/url.ts`: URL canonicalizer stripping tracking parameters and normalizing paths
- `src/ingest/identity.ts`: Dual-identity resolver with SHA-256 fallback for unstable GUIDs
- `src/ingest/media.ts`: Media enclosure extractor, tracking pixel filter, and credit parser
- `src/ingest/normalizer.ts`: Canonical `RawItem` pipeline with 48h filtering and 25-item capping
- `tests/parser.test.ts`: Unit tests for XML parsing and dialect detection
- `tests/normalization.test.ts`: Unit tests for URL canonicalization, identity resolution, and media extraction
- `tests/normalizer.test.ts`: Unit tests for backlog capping, date sanitization, and output schema
