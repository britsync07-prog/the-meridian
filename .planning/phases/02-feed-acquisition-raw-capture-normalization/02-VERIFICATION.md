# Phase 02: Feed Acquisition, Raw Capture & Normalization — Verification Report

**Phase:** 02  
**Slug:** `feed-acquisition-raw-capture-normalization`  
**Status:** Complete & Verified  
**Date:** 2026-10-21  
**Author:** gsd-verifier  

---

## Executive Summary

Phase 02 delivers the complete ingest, raw capture, quarantine, and normalization pipeline for The Meridian. Publisher feeds across 7 country editions (UK, US, AU, CA, IE, NZ, IN) plus native Hindi publishers are fetched politely at the edge, stored raw in Cloudflare R2, and normalized into canonical `RawItem` records in CI/Node without breaching Cloudflare Workers free-tier limits or copyright excerpt boundaries.

Every phase goal and requirement (ING-01, ING-02, ING-03, ING-04, ING-06, ING-07, ING-08, ING-09, ING-10, CON-01, CON-02, CON-03, CON-04, CON-05) has been validated through automated tests, contract checks, and offline fixture replays.

---

## Phase Goal Verification

> **Goal:** Publisher feeds are fetched politely, captured raw, and turned into canonical story items under a hard excerpt budget, with one bad feed never able to affect another.

| Success Criterion | Status | Evidence |
|-------------------|--------|----------|
| **1. Scheduled Raw Fetch & Fault Isolation**<br>Scheduled fetch stores raw snapshots in R2 under `raw/{date}/{source}.xml` without broken feeds affecting others. | **VERIFIED** | Partitioned cron trigger dispatches feeds. `pollFeed` writes to `raw/{YYYY-MM-DD}/{slug}_{ts}.xml`. `tests/quarantine-isolation.test.ts` proves full fault isolation across a 17-feed partition where bot challenges, oversized streams, HTTP 500s, and socket hangs do not affect healthy feeds. |
| **2. Edge Worker Purity & Dual-Run Parity**<br>Edge Worker performs no parsing/scoring. Same raw bytes normalize to identical items across edge and CI environments. | **VERIFIED** | `apps/worker/__tests__/purity.test.ts` asserts zero XML parsing or DOM libraries in the Worker bundle. `tests/dual-run-parity.test.ts` asserts byte-identical normalized items across RSS 2.0, Atom 1.0, RDF, and Hindi feeds. |
| **3. Hard Excerpt Budget Enforcement**<br>Published excerpts obey ≤50 words, ≤320 characters, ≤2 sentences, ≤30% visible text, word-boundary truncation with ellipsis, and null excerpts for articles under 160 words. Never paraphrased or translated. | **VERIFIED** | Enforced by `shared/contract/excerpt-budget.ts`, `shared/contract/segmenter.ts` (using `Intl.Segmenter` for English and Hindi Devanagari purna viram `।`), and verified by 24 contract tests and 12 pipeline tests (`tests/excerpt-pipeline.test.ts`). |
| **4. Dual Identity & Quarantine Path**<br>Oscillating GUIDs fall back to canonicalized source URL SHA-256. Non-XML or >2 MB responses are quarantined under `raw/quarantine/` with logged reason. | **VERIFIED** | `src/ingest/identity.ts` implements SHA-256 canonical URL fallback. `apps/worker/src/fetcher/quarantine.ts` sniffs bot challenge signatures and aborts streams exceeding 2 MB (`readStreamWithCeiling`), routing payloads to `raw/quarantine/{date}/{slug}_{reason}_{ts}.xml`. |
| **5. Polite Ingestion & Legal Gate**<br>Feeds fetched only with verified terms of use recorded on registry records. User-Agent with contact URL, ≤20 req/hr/host, and Retry-After honored. | **VERIFIED** | `tests/legal-gate.test.ts` enforces terms verification, audit dates, auditor attribution, and HTTPS terms URLs. `apps/worker/src/fetcher/polite-fetch.ts` enforces `USER_AGENT`, `HostRateLimiter` (1s delay, 20 req/hr/host), and HTTP 429 backoff handling. |

---

## Detailed Requirement Verification

| Requirement ID | Description | Verifier / Implementation | Status |
|----------------|-------------|---------------------------|--------|
| **ING-01** | Scheduled Worker fetches feeds via conditional GET (`If-None-Match`, `If-Modified-Since`) and persists raw bytes to R2 under `raw/{date}/{source}.xml`. | `apps/worker/src/fetcher/polite-fetch.ts`<br>`apps/worker/src/fetcher/index.ts`<br>`tests/quarantine-isolation.test.ts` | **PASS** |
| **ING-02** | Fetch Worker performs no parsing, normalization, or scoring; all transformations happen in CI. | `apps/worker/__tests__/purity.test.ts`<br>`src/ingest/normalizer.ts`<br>`tests/dual-run-parity.test.ts` | **PASS** |
| **ING-03** | Feed registry record contains publisher name, country, language, feed URL, section prior, ETag, last-modified, consecutive failures, and disabled-until. | `shared/types.ts`<br>`config/sources.ts`<br>`shared/db/0001_init.sql`<br>`apps/worker/src/db/repository.ts` | **PASS** |
| **ING-04** | Feeds are fetched only after terms of use verification, recorded on the registry record. | `config/sources.ts`<br>`tests/legal-gate.test.ts`<br>`apps/worker/src/db/repository.ts` | **PASS** |
| **ING-06** | Each feed carries a freshness SLA (24h wire/daily, 48h regional), and feeds that stop producing are reported as failures rather than "no news". | `config/sources.ts`<br>`tests/legal-gate.test.ts`<br>`apps/worker/src/db/repository.ts` (`freshness_sla_hours`) | **PASS** |
| **ING-07** | Responses that are non-XML, >2 MB, or bot challenges quarantine per-feed and do not fail the edition. | `apps/worker/src/fetcher/quarantine.ts`<br>`tests/quarantine-isolation.test.ts`<br>`apps/worker/src/fetcher/__tests__/quarantine.test.ts` | **PASS** |
| **ING-08** | Normalization converts RSS 2.0, Atom 1.0, and RDF to a single canonical `RawItem` shape with enclosures and DC metadata. | `src/ingest/parser.ts`<br>`src/ingest/normalizer.ts`<br>`tests/parser.test.ts`<br>`tests/normalizer.test.ts` | **PASS** |
| **ING-09** | Oscillating or missing GUIDs fall back to `url:${sha256(canonicalUrl)}`. | `src/ingest/url.ts`<br>`src/ingest/identity.ts`<br>`tests/normalization.test.ts` | **PASS** |
| **ING-10** | Descriptive User-Agent with contact URL, ≤20 req/host/hr rate limiter, and Retry-After backoff parsing. | `shared/config/site.ts`<br>`apps/worker/src/fetcher/polite-fetch.ts`<br>`apps/worker/src/fetcher/__tests__/fetcher.test.ts` | **PASS** |
| **CON-01** | Excerpts capped at ≤50 words, ≤320 characters, ≤2 sentences, and ≤30% source visible text. | `shared/contract/excerpt-budget.ts`<br>`tests/excerpt-pipeline.test.ts`<br>`shared/contract/__tests__/excerpt-budget.test.ts` | **PASS** |
| **CON-02** | Source articles under 160 words produce null excerpt. | `shared/contract/excerpt-budget.ts`<br>`src/ingest/excerpt.ts`<br>`tests/excerpt-pipeline.test.ts` | **PASS** |
| **CON-03** | Truncated excerpts cut at word boundaries with visible typographic ellipsis (`…`). | `shared/contract/excerpt-budget.ts`<br>`shared/contract/segmenter.ts`<br>`tests/excerpt-pipeline.test.ts` | **PASS** |
| **CON-04** | Excerpts are quoted verbatim or omitted; never paraphrased, synonymized, or translated. | `src/ingest/text.ts`<br>`src/ingest/excerpt.ts`<br>`tests/text-cleaner.test.ts` | **PASS** |
| **CON-05** | Unit test asserts word, character, sentence, and source-share limits for every stored excerpt. | `shared/contract/excerpt-budget.ts` (`assertExcerptWithinBudget`)<br>`tests/excerpt-pipeline.test.ts` | **PASS** |

---

## Architectural & Invariant Verifications

1. **OPS-14 Repository Purity**:
   - Automated scan in `apps/worker/src/db/__tests__/repository.test.ts` asserts that SQL queries exist exclusively inside `apps/worker/src/db/repository.ts`.
   - `scripts/ingest/run-local.ts` executes entirely via the repository contract and contains zero database query strings.

2. **D1 Local Schema Integrity**:
   - `npm run db:verify:local` runs 24 automated checks against a fresh, empty SQLite database.
   - Result: 19 tables, 32 named indexes, 8 editions, 8 sections, 64 joins, and 30 seed sources verified.

3. **Cloudflare R2 Bucket Lifecycle Rules**:
   - `npm run r2:lifecycle:verify` checks the live Cloudflare R2 bucket configuration.
   - Result: Exactly 2 rules (`expire-media` for `media/` at 365d, `expire-raw` for `raw/` at 7d). Quarantined payloads under `raw/quarantine/` are automatically expired within 7 days, and `og/` images or bucket root are never matched.

4. **Offline Fixture Catalog & Replay**:
   - Complete fixture suite under `tests/fixtures/feeds/`: `rss-standard.xml`, `atom-standard.xml`, `rdf-standard.xml`, `hindi-standard.xml`, `bot-challenge.html`, `malformed.xml`, `oversized.xml`, `oscillating-guid.xml`.
   - Local CLI runner (`npm run ingest:local -- --fixtures`) successfully processed 27 feeds, normalized 54 items, and inserted 12 stories into local D1 without errors.

---

## Automated Test Suite Summary

Executed test runs:
- `npx vitest run`: **24 test files, 223 tests passed (100% pass rate)**
- `npm run typecheck`: **0 errors (clean exit code 0)**
- `npm run db:verify:local`: **24/24 assertions passed**
- `npm run r2:lifecycle:verify`: **PASS (2 prefix-scoped rules)**
- `npm run ingest:local -- --fixtures`: **PASS (0 errors)**

---

## Conclusion & Verdict

Phase 02 satisfies all requirements, invariants, and success criteria specified in the project roadmap and architecture documentation. The pipeline is robust against network, parser, and format abnormalities, guarantees copyright safety through hard excerpt budgets, and preserves worker edge purity.

Phase 02 is **COMPLETE** and verified. Ready to proceed to Phase 03: Curation Core.
