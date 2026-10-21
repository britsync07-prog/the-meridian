# Plan 02-01 Summary: Canonical Source Registry, Legal Gate, & Repository Synchronization

## Deliverables & Status

1. **Vitest Test Configuration & Canonical Source Registry (`config/sources.ts`, `shared/types.ts`)**:
   - Extended `vitest.config.ts` to include `tests/**/*.test.ts`.
   - Updated `shared/types.ts` with `SourceRegistryEntry` and `FeedFetchLog` interfaces.
   - Implemented `config/sources.ts` defining 24 publisher feeds across 7 countries (GB, US, AU, CA, IE, NZ, IN) plus native Hindi (Amar Ujala, BBC Hindi, Dainik Bhaskar).
   - Replaced dead/refusing feeds identified during Spikes S-2 and S-3 (WaPo, CNN, AP, Newshub NZ) with resilient, verified alternatives (NPR, ABC News US, PBS NewsHour, CBS News, The Spinoff).
   - All active feeds include terms verification metadata (`termsStatus: 'verified'`, `termsVerifiedAt: '2026-10-21'`, `verifiedBy: 'system-auditor'`, and HTTPS terms URLs).

2. **Launch-Blocking Legal Gate (`tests/legal-gate.test.ts`)**:
   - Implemented `tests/legal-gate.test.ts` enforcing:
     - All active sources have `termsStatus === 'verified'`.
     - Valid ISO-8601 `termsVerifiedAt` dates (`YYYY-MM-DD`).
     - Non-empty `verifiedBy` strings.
     - Secure `https://` terms URLs.
     - Freshness SLA strictly assigned to 24 hours (wire/national) or 48 hours (regional/specialty).
   - Included self-proving tests asserting rejection of unverified, refused, or malformed sources.

3. **D1 Repository Source Synchronization & Health Updates (`apps/worker/src/db/repository.ts`)**:
   - Extended `Repository` interface and implementation with:
     - `syncSources(sources)`: Batch upserts source entries using `INSERT INTO sources ... ON CONFLICT(slug) DO UPDATE SET ...`.
     - `recordFeedFetch(log)`: Parameterized insertion into `feed_fetches`.
     - `updateSourceHealth(sourceId, update)`: Parameterized updates to `sources` (`last_status`, `last_fetched_at`, `consecutive_failures`, `disabled_until`).
   - Extended unit tests in `apps/worker/src/db/__tests__/repository.test.ts` verifying all new methods with mock D1 database.
   - Maintained OPS-14 SQL purity: scan confirms zero SQL keywords outside `apps/worker/src/db/repository.ts`.

## Verification Results

- `npm run typecheck`: Passed (exit code 0)
- `npx vitest run tests/legal-gate.test.ts`: Passed (9 tests passed)
- `npx vitest run apps/worker/src/db/__tests__/repository.test.ts`: Passed (13 tests passed)
- Full suite `npx vitest run`: Passed (13 test files, 146 tests passed)
