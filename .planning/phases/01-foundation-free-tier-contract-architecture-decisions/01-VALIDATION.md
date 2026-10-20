---
phase: 1
slug: foundation-free-tier-contract-architecture-decisions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.5 |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~25 seconds |

Additional gates that are not vitest but must run in the same pre-commit sequence:

| Gate | Command | Purpose |
|------|---------|---------|
| Type check | `npm run typecheck` | `tsc --noEmit` over `shared/`, `apps/site/src/`, `apps/worker/src/` |
| Astro build | `npm run build` | Proves `compressHTML: true`, `build.concurrency: 1` and the Tailwind v4 wiring produce a green build |
| D1 schema apply | `npm run db:verify:local` | Applies `shared/db/*.sql` to an empty local D1 and asserts 19 tables / 31 indexes |
| D1 id swap | `npm run db:verify:swap` | Repoints the database id at a second empty local database; asserts zero code change |
| R2 lifecycle | `npm run r2:lifecycle:verify` | Parses `wrangler r2 bucket lifecycle list` and fails if any rule has an empty prefix or a prefix outside `{raw/, media/}` |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run && npm run typecheck && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npm run db:verify:local` and `npm run db:verify:swap`
- **Max feedback latency:** 30 seconds

---

## Per-task Verification Map

| task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | D-20, D-02, D-03 | — | One `package.json`, no `workspaces` key, exactly one lockfile; repo is public under a personal account | unit | `npm test -- --run scripts/__tests__/layout.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | D-12, D-13 | — | `SITE_NAME` is the single source for the site name; no duplicate literal elsewhere | unit | `npm test -- --run shared/config/__tests__/site.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DSN-12 (config half) | — | `compressHTML: true`, `build.concurrency: 1`, `incrementalBuild: true`, `output: 'static'`, no Cloudflare adapter | unit | `npm test -- --run apps/site/__tests__/astro-config.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | OPS-14 | T-01-01 | Schema applies to an empty database; 19 tables / 31 indexes; no `SELECT *` | integration | `npm run db:verify:local` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | OPS-14 | T-01-01 | The repository module is the only file with a D1 binding or SQL; db id comes from configuration | unit | `npm test -- --run apps/worker/src/db/__tests__/repository.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | OPS-14, D-20 | T-01-02 | Repointing the database id at an empty database needs **no code change** | integration | `npm run db:verify:swap` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | OPS-01 | T-01-03 | Every ceiling carries a `source_url` and a `verified_on`; the JSON is the single budget source | unit | `npm test -- --run shared/config/__tests__/free-tier-limits.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | OPS-01 | T-01-03 | No code path reads a ceiling from anywhere else — and the scanner provably catches a planted literal | unit | `npm test -- --run shared/config/__tests__/free-tier-limits.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | OPS-04, D-05, D-07, D-08, D-09 | T-01-03 | The decision rule names all three OPS-04 triggers and records the standing never-purchase disposition | unit | `npm test -- --run shared/config/__tests__/free-tier-limits.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | MED-08, D-15, D-19 | T-01-04 | Lifecycle rules are prefix-scoped; no rule can match `og/` or the bucket root | integration | `npm run r2:lifecycle:verify` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 2 | D-06 | T-01-05 | 8 shard configs, distinct locale prefixes, `not_found_handling: "none"` | unit | `npm test -- --run scripts/__tests__/shards.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-03 | 04 | 2 | D-01, D-04 | T-01-04 | Bucket exists; budget alerts configured; the ADR states alerts do not cap spend | manual | `npx wrangler r2 bucket list` | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 2 | PROJECT.md content model | T-01-06 | Every excerpt respects the word/char/sentence/share/short-source budget and is a verbatim prefix | unit | `npm test -- --run shared/contract/__tests__/excerpt-budget.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-02 | 05 | 2 | D-16, D-17, D-12, D-13 | — | Templates are pure string builders; `pageMeta()` canonical is always self-referential | unit | `npm test -- --run shared/templates/__tests__/head.test.ts && npm test -- --run shared/__tests__/purity.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-03 | 05 | 2 | D-10, D-11, D-14 | — | The domain/name ADR records the deferral, the consequences and the 301-redirect rule | manual | `grep -c "301" docs/adr/0004-domain-and-name.md` | ❌ W0 | ⬜ pending |
| 01-06-01 | 06 | 3 | ROADMAP SC#5 | — | S-1 and S-2 executed; observed values and decisions recorded | manual | `test -f spikes/s-1-do-cpu/RESULT.md && test -f spikes/s-2-worker-egress/RESULT.md` | ❌ W0 | ⬜ pending |
| 01-06-02 | 06 | 3 | ROADMAP SC#5 | — | S-3 and S-4 executed; observed values and decisions recorded | manual | `test -f spikes/s-3-ci-egress/RESULT.md && test -f spikes/s-4-astro-throughput/RESULT.md` | ❌ W0 | ⬜ pending |
| 01-06-03 | 06 | 3 | ROADMAP SC#5 | — | S-5 executed; `spikes/RESULTS.md` records all five spikes with the decision each drove | unit | `npm test -- --run spikes/__tests__/results.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is **Plan 01, Task 01** — the repo scaffold. It creates the test infrastructure every other row depends on.

- [ ] `package.json` — one package, no `workspaces` key, scripts: `test`, `typecheck`, `build`, `build:site`
- [ ] `vitest.config.ts` — includes `shared/**/*.test.ts`, `apps/**/*.test.ts`, `scripts/**/*.test.ts`, `spikes/**/*.test.ts`
- [ ] `tsconfig.json` — includes `shared/**/*`, `apps/site/src/**/*`, `apps/worker/src/**/*`; `noEmit: true`
- [ ] `scripts/__tests__/layout.test.ts` — stubs for D-20 (one `package.json`, one lockfile, no `fetch.ts`)
- [ ] `apps/site/__tests__/astro-config.test.ts` — stubs for the Astro config assertions
- [ ] `shared/config/__tests__/site.test.ts` — stubs for D-12
- [ ] `apps/worker/src/db/__tests__/repository.test.ts` — stubs for OPS-14
- [ ] `shared/config/__tests__/free-tier-limits.test.ts` — stubs for OPS-01 / OPS-04
- [ ] `scripts/__tests__/shards.test.ts` — stubs for D-06
- [ ] `shared/contract/__tests__/excerpt-budget.test.ts` — stubs for the excerpt budget
- [ ] `shared/templates/__tests__/head.test.ts` + `shared/__tests__/purity.test.ts` — stubs for D-16/D-17/D-13
- [ ] `spikes/__tests__/results.test.ts` — stubs for the spike outcomes

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| R2 bucket exists and holds no test objects | D-01 | Requires a live Cloudflare account | `npx wrangler r2 bucket list` → `meridian` appears. Then `npx wrangler r2 object list meridian` → empty. |
| Lifecycle rules are live and correctly scoped | MED-08, D-15, D-19 | Cloudflare-side state; the local test can only assert the config | `npm run r2:lifecycle:verify` → exit 0 and a printed table showing exactly two rules: `expire-raw` on `raw/` at 7 days and `expire-media` on `media/` at 365 days, with no empty-prefix rule. |
| Budget alerts configured | D-04 | Cloudflare dashboard / account state, no CLI | Dashboard → Manage Account → Billing → Billable Usage → Budget Alerts. Confirm an alert exists at the configured threshold for each metered quota. Record what the dashboard actually exposes in the ADR — the research notes Cloudflare alerts are spend-threshold based and informational only. |
| D1 database created | OPS-14 | Live account | `npx wrangler d1 list` → `meridian` with its id; the id is recorded in `apps/worker/wrangler.jsonc` and in `.dev.vars.example`. |
| 8 shard projects exist | D-06 | Live account | `npx wrangler deployments list` for each of `meridian-static-{uk,us,au,ca,ie,nz,in,in-hi}`. |
| S-1 Durable Object CPU on Workers Free | ROADMAP SC#5 | Needs a deployed Worker | Follow `spikes/s-1-do-cpu/RESULT.md`; record observed CPU ms and whether `Error 1102` occurred. |
| S-2 Worker egress vs publisher blocking | ROADMAP SC#5 | Needs a running Worker + real publisher egress | Follow `spikes/s-2-worker-egress/RESULT.md`; record status/latency for 10 feeds. |
| S-3 CI egress comparison | ROADMAP SC#5 | Needs a GitHub Actions run | Push the spike workflow; copy the job summary into `spikes/s-3-ci-egress/RESULT.md`. |
| S-4 Astro build throughput | ROADMAP SC#5 | Needs a 20,000-page synthetic build | `npm run build:spike:s4 -- --pages 20000`; record pages/second for the full and incremental builds. |
| S-5 wrangler asset-upload diffing | ROADMAP SC#5 | Needs two live deploys | Follow `spikes/s-5-wrangler-diffing/RESULT.md`; record the upload count on the second deploy. |
| Repository is public under a personal account | D-02, D-03 | GitHub account state | `gh repo view --json visibility,owner` → `"visibility": "PUBLIC"`, owner type `User`. |
| Domain not yet purchased | D-10 | Purchases are deferred past launch | No domain record exists in the repo; the ADR records the deferral. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
