---
phase: "02"
slug: "feed-acquisition-raw-capture-normalization"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.5 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && npm run db:verify:local && npm run r2:lifecycle:verify` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run && npm run db:verify:local && npm run r2:lifecycle:verify`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ING-03, ING-04 | T-02-01 | Rejects unverified feeds from ingest | contract | `npm test -- --run tests/legal-gate.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | OPS-14 | — | All SQL remains within single repository module | contract | `npm test -- --run apps/worker/src/db/__tests__/repository.test.ts` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 1 | ING-02 | T-02-02 | Worker contains no XML parsing libraries | contract | `npm test -- --run apps/worker/__tests__/purity.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | ING-01, ING-10 | T-02-03 | Rate limits 20 req/hr/host and honors Retry-After | unit | `npm test -- --run apps/worker/src/fetcher/__tests__/fetcher.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | ING-07 | T-02-04 | Aborts at 2 MB ceiling, quarantines HTML challenges | unit | `npm test -- --run apps/worker/src/fetcher/__tests__/fetcher.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | ING-08 | — | Normalizes RSS 2.0, Atom 1.0, and RDF | unit | `npm test -- --run tests/normalization.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | ING-09 | T-02-05 | Neutralizes oscillating GUIDs via canonical URL SHA256 | unit | `npm test -- --run tests/normalization.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | CON-01, CON-04 | — | Verbatim excerpt truncation with ellipsis at 50w/320c/2s | unit | `npm test -- --run tests/excerpt-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 2 | CON-02 | — | Source visible text <160 words produces null excerpt | unit | `npm test -- --run tests/excerpt-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-03 | 04 | 2 | CON-05 | — | Unicode segmentation with Hindi purna viram punctuation | unit | `npm test -- --run tests/excerpt-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 3 | ING-07 | — | Fault isolation: bad feed does not halt other feeds | integration | `npm test -- --run tests/quarantine-isolation.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-02 | 05 | 3 | ING-02 | — | Dual-run parity: Worker R2 bytes and CI produce identical items | integration | `npm test -- --run tests/dual-run-parity.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/feeds/` — XML fixtures for 7 editions, Hindi, malformed, bot-challenge, and oversized feeds
- [ ] `tests/legal-gate.test.ts` — Stubs for ING-04 terms of use verification
- [ ] `apps/worker/__tests__/purity.test.ts` — Stubs for ING-02 no XML parser in Worker
- [ ] `tests/normalization.test.ts` — Stubs for ING-08 and ING-09

---

## Manual-Only Verifications

| Requirement | Behavior | Verification Procedure | Why Not Automated |
|-------------|----------|------------------------|-------------------|
| ING-01 | Cloudflare Cron Trigger dispatch | Inspect Cloudflare dashboard Cron Trigger execution logs | Requires live Cloudflare edge runtime deployment |
