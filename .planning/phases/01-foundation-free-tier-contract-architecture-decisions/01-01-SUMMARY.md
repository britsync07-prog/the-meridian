---
phase: 01-foundation-free-tier-contract-architecture-decisions
plan: 01
subsystem: infra
tags: [astro, tailwind, vitest, typescript, cloudflare-workers, d1, r2, monorepo-free, contract-layer]

# Dependency graph
requires:
  - phase: none
    provides: greenfield repository; D-20 (one package.json, one lockfile, no workspace protocol) and D-12 (the locked site name) are decided inputs, not code
provides:
  - "A buildable repository: `npm install`, `npm test`, `npm run typecheck` and `npm run build` all exit 0"
  - "The shared contract layer (`shared/`) imported by both the edge runtime and the Astro site, reachable only by relative path"
  - "SITE_NAME = 'The Meridian' in exactly one file, guarded by a test that scans the whole source tree"
  - "Eight editions and eight sections as typed constants, with EditionId derived from the data so the union cannot drift"
  - "The Astro 7 shell configuration with compressHTML true, build.concurrency 1 and experimental.incrementalBuild enabled"
  - "A DSN-12 regression fixture proving inter-word spacing survives HTML compression"
  - "A public GitHub repository under a personal account (D-02, D-03)"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, phase-2-feed-acquisition, phase-3-curation-core, phase-4-design-system, phase-5-publication-surface, phase-6-digest-trust-seo]

# Tech tracking
tech-stack:
  added:
    - "astro@7.4.1"
    - "tailwindcss@4.3.3 + @tailwindcss/vite@4.3.3"
    - "zod@4.6.7"
    - "wrangler@4.151.3"
    - "vitest@5.0.5"
    - "typescript@5.9.3"
    - "@cloudflare/workers-types@5.20261019.1"
    - "@types/node@24.19.2 (added — see Deviations)"
  patterns:
    - "One package.json, one lockfile, no workspace protocol (D-20). `shared/` is a plain directory, not a package."
    - "Relative imports only for `shared/` — the `@shared/*` alias exists for `tsc` and the editor, never for a bundler."
    - "TDD: the test is written and observed failing before the implementation exists, then the implementation lands in its own commit."
    - "Repository-layout invariants asserted against the real tree, not documented."

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - vitest.config.ts
    - scripts/__tests__/layout.test.ts
    - shared/config/site.ts
    - shared/config/editions.ts
    - shared/config/__tests__/site.test.ts
    - shared/sections.ts
    - shared/taxonomy.ts
    - shared/types.ts
    - apps/site/astro.config.mjs
    - apps/site/tsconfig.json
    - apps/site/src/layouts/Base.astro
    - apps/site/src/pages/index.astro
    - apps/site/src/styles/global.css
    - apps/site/__tests__/astro-config.test.ts
  modified:
    - .gitignore

key-decisions:
  - "The GitHub repository is `britsync07-prog/the-meridian` — public, under a personal account, named for the locked site name (D-02, D-03, D-12)."
  - "`USER_AGENT` is composed from `SITE_ORIGIN` rather than repeating the origin string, so the origin has exactly one home while the emitted value is byte-identical to the plan's."
  - "`EditionId` is derived from the literal `EDITIONS` array; a compile-time assignment proves the array satisfies the published `Edition` shape."
  - "The Astro config imports `SITE_ORIGIN` from the shared contract instead of repeating the origin, and exposes `SITE_NAME` to components through `vite.define`."
  - "The `pretest` hook was NOT added: the plan fixes the script keys exactly, so the built-HTML test skips with a clear message when `npm run build` has not run."
  - "The local branch was renamed `master` -> `main` to match the new remote's default branch."

patterns-established:
  - "Shared-contract modules are pure and runtime-agnostic: no import of `astro:` or `workerd` anywhere under `shared/`."
  - "Every load-bearing configuration value has a test that asserts it against the real artifact, not against a comment."
  - "Tests live in `__tests__/` beside the code they guard and are excluded from repository-wide literal scans."

requirements-completed: [DSN-12, SEO-13]

# Metrics
duration: 21min
completed: 2026-10-20
---

# Phase 1 Plan 01: Repo Scaffold, Shared Contract and Astro Shell Summary

**One `package.json`, one `package-lock.json`, no workspace protocol; a `shared/` contract imported by both runtimes with the site name living in exactly one file; and an Astro 7 shell whose `compressHTML: true` keeps the space between two inline elements.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-20T21:18:49Z
- **Completed:** 2026-10-20T21:39:00Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- **The repository is buildable end to end.** `npm install`, `npm test -- --run` (21 tests, 3 files), `npm run typecheck` and `npm run build` all exit 0. The Astro build emits `apps/site/dist/index.html` with the Tailwind stylesheet linked.
- **D-20 is enforced, not merely stated.** `scripts/__tests__/layout.test.ts` walks the real tree and fails if a second `package.json` or a second lockfile ever appears, if a `workspaces` key is added, or if a file named `fetch.ts` is created anywhere (Astro 7 reserves that name for advanced routing).
- **D-12 is enforced at the source level.** `shared/config/site.ts` is the only file in the repository that contains the literal `The Meridian`; `shared/config/__tests__/site.test.ts` proves it by scanning every `.ts`, `.mjs`, `.astro` and `.json` file under `shared/`, `apps/`, `scripts/`, `spikes/` and `config/`.
- **DSN-12 is proven, not configured.** The built HTML contains `<span>The</span> <em>Meridian</em>` — a single space between two inline elements — and contains no `TheMeridian`. A second run of the build dropped from 10.6 s to 1.7 s, which confirms `build.concurrency: 1` and `experimental.incrementalBuild` are both actually in force.
- **The GitHub repository is live and correct.** `britsync07-prog/the-meridian` is `PUBLIC` with an owner type of `User`, confirmed through the GitHub API.

## task Commits

Each task was committed atomically, with the failing test landed before the implementation it guards:

1. **task 1: scaffold the repository — one package, one lockfile, public and personal** — `94c52c2` (test) → `3fa771f` (feat)
2. **task 2: write the shared contract layer and the single site-name value** — `ebc99f1` (test) → `79669c3` (feat)
3. **task 3: configure Astro 7 with compressHTML true and prove the build** — `7b40ff1` (test) → `dc183e8` (feat)

**Plan metadata:** see the closing `docs(01-01)` commit.

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `package.json` — the one manifest: `private`, `type: module`, no `workspaces`, the eleven mandated scripts, and the Phase 1 dependency set.
- `package-lock.json` — the single lockfile (the only one in the repository).
- `tsconfig.json` — strict, `noEmit`, `moduleResolution: bundler`, the `@shared/*` alias for `tsc` only, and the include list covering `shared/`, both runtimes, `scripts/`, `spikes/` and the vitest config.
- `vitest.config.ts` — `defineConfig` with the four test globs, `environment: 'node'`, `globals: false`, and an exclude list that keeps `node_modules`, `dist`, `.astro-cache` and `.wrangler` out of the run.
- `.gitignore` — appended `apps/site/dist/`, `apps/site/.astro/`, `.astro-cache/` and `*.local`; the existing `node_modules/`, `.wrangler/`, `.dev.vars` and `.env` entries were already present and remain the first line of defence for credentials.
- `scripts/__tests__/layout.test.ts` — the D-20 repository-layout contract.
- `shared/config/site.ts` — `SITE_NAME`, `SITE_ORIGIN`, `SITE_LOCALE`, `USER_AGENT`. The only home of the publication name.
- `shared/config/editions.ts` — the eight editions and the eight sections, with `EditionId` derived from the data.
- `shared/sections.ts` — the section list re-export plus the `SECTION_LEXICON_PRIORS` seed for the Track E workstream.
- `shared/taxonomy.ts` — the tag vocabulary, the country codes, and the `GENERATES_ENTITY_PAGE = false` rule that keeps model-extracted entities from ever creating a page.
- `shared/types.ts` — `RawItem`, `StoryExcerpt`, `Cluster`, `EditionCluster`, `SectionAssignment`, `StorySource`, `PageMetaInput`, `PageMeta` and `HreflangAlternate`.
- `shared/config/__tests__/site.test.ts` — the D-12 and D-13 contract, including the whole-tree literal scan.
- `apps/site/astro.config.mjs` — `output: 'static'`, `compressHTML: true`, `build.concurrency: 1`, `experimental.incrementalBuild: true`, `cacheDir: './.astro-cache'`, Tailwind through the Vite plugin, `vite.server.fs.allow: ['../..']`, and no Cloudflare adapter.
- `apps/site/tsconfig.json` — the Astro project's own tsconfig, extending the root.
- `apps/site/src/styles/global.css` — exactly `@import "tailwindcss";`.
- `apps/site/src/layouts/Base.astro` — the minimal, valid-by-construction layout (the Astro 7 Rust compiler treats an unclosed tag as an error and does not repair invalid nesting).
- `apps/site/src/pages/index.astro` — the DSN-12 spacing fixture.
- `apps/site/__tests__/astro-config.test.ts` — the configuration contract plus the built-HTML assertion.

## Decisions Made

- **The GitHub repository is named `the-meridian`, not `newsportal`.** D-12 places the locked site name in the repository name; the local directory name is incidental.
- **`USER_AGENT` is derived from `SITE_ORIGIN`.** The plan gives the value as a literal that embeds the origin. Composing it from `SITE_ORIGIN` produces the byte-identical string while leaving the origin with exactly one home in the codebase.
- **The Astro config reads `SITE_ORIGIN` from the shared contract** rather than repeating `https://meridian.workers.dev`, and passes `SITE_NAME` to components through `vite.define` so the name has one import path everywhere.
- **The `EditionId` derivation and the `Edition` interface are reconciled with a compile-time assignment.** The plan asks for `EditionId` to be derived from the array while also declaring an interface that references `EditionId` — a circular type. The array is declared first and the union derived from it; a `const _editionsSatisfyEdition: readonly Edition[] = EDITIONS` line then proves the two agree at compile time, and the drift guard the plan wants is the test assertion on the ordered id list.
- **No `pretest` hook.** The plan fixes the script keys exactly, and the plan itself offers "a `pretest` step **or** an explicit note". The note is in the test file's doc comment and in this summary; the built-HTML test skips with a clear message when the build has not run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `@types/node@24.19.2` to devDependencies**
- **Found during:** task 1 (RED phase)
- **Issue:** the plan mandates that the layout test use `node:fs` and `node:path`, and the site test needs `node:fs`, `node:path` and `node:url`. None of those modules typecheck without Node's type declarations, and the plan's devDependency list did not include them. `tsc --noEmit` failed with `TS2307: Cannot find module 'node:fs'`.
- **Fix:** added `@types/node` pinned to `24.19.2`, matching the Node 24 runtime.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `npm run typecheck` exits 0.
- **Committed in:** `3fa771f` (part of the task 1 commit)

**2. [Rule 1 - Bug] Corrected the relative import path for the layout and the page**
- **Found during:** task 3 (RED phase)
- **Issue:** the plan states the layout imports `SITE_NAME` from `../../shared/config/site.ts`. From `apps/site/src/layouts/Base.astro` that path resolves to `apps/site/shared/config/site.ts`, which does not exist — four levels up are needed to reach the repository root. The plan's own `key_links` entry names `apps/site/astro.config.mjs` as the file that reaches `shared/config/site.ts`, and `../../shared/config/site.ts` is correct for exactly that file.
- **Fix:** used `../../../../shared/config/site.ts` from `apps/site/src/layouts/Base.astro` and from `apps/site/src/pages/index.astro`, and `../../shared/config/site.ts` from `apps/site/astro.config.mjs`.
- **Files modified:** `apps/site/src/layouts/Base.astro`, `apps/site/src/pages/index.astro`, `apps/site/astro.config.mjs`
- **Verification:** `npm run build` exits 0 and the built page renders the site name.
- **Committed in:** `dc183e8`

**3. [Rule 2 - Missing Critical] Enabled `allowJs` so the Astro config module can be typechecked**
- **Found during:** task 3
- **Issue:** `apps/site/__tests__/astro-config.test.ts` imports `../astro.config.mjs`. TypeScript cannot resolve a JavaScript module without `allowJs`, and the plan's root `include` list does not cover `apps/site/__tests__/`, so the site project's own tsconfig is the only place that file is checked.
- **Fix:** added `"allowJs": true` to the root `tsconfig.json` and verified the site project separately with `npx tsc --noEmit -p apps/site/tsconfig.json` (exits 0).
- **Files modified:** `tsconfig.json`
- **Verification:** `npx tsc --noEmit -p apps/site/tsconfig.json` exits 0.
- **Committed in:** `dc183e8`

**4. [Rule 1 - Bug] Removed the forbidden adapter package name from the config file's own comment**
- **Found during:** task 3
- **Issue:** the plan's test asserts the **raw file text** of `astro.config.mjs` does not contain the Cloudflare adapter package name. The first draft of the config file explained *why* there is no adapter and named the package in the explanation, so the assertion failed even though no adapter was imported. The test was right and the file was wrong.
- **Fix:** reworded the comment to state the rule (no Cloudflare adapter; Astro 6+ removed Cloudflare Pages support from the official adapter) without naming the package.
- **Files modified:** `apps/site/astro.config.mjs`
- **Verification:** `npm test -- --run apps/site/__tests__/astro-config.test.ts` exits 0.
- **Committed in:** `dc183e8`

**5. [Rule 1 - Bug] Made the layout test's path assertion platform-independent**
- **Found during:** task 1 (RED phase)
- **Issue:** the first version of the "exactly one package.json" assertion string-replaced the repository root out of each path and compared against `/package.json`, which fails on Windows because the root carries a trailing separator. The failure was a formatting artefact, not a real layout violation, and it masked the genuine lockfile failure.
- **Fix:** compare `path.relative(REPO_ROOT, file)` normalised to forward slashes.
- **Files modified:** `scripts/__tests__/layout.test.ts`
- **Verification:** the test now fails only for the reason it is meant to catch.
- **Committed in:** `94c52c2`

**6. [Rule 3 - Blocking] Kept the two runtime `URL` type universes apart in the tests**
- **Found during:** task 1 and task 2
- **Issue:** `@cloudflare/workers-types` declares a global `URL` class, and Node's `fileURLToPath` accepts `string | URL` where `URL` is Node's class. Passing the global instance failed with `TS2345`.
- **Fix:** pass the serialised `href` string instead of the URL instance, which `fileURLToPath` accepts, so neither runtime's type is asserted onto the other and no cast is needed.
- **Files modified:** `scripts/__tests__/layout.test.ts`, `shared/config/__tests__/site.test.ts`
- **Verification:** `npm run typecheck` and `npx tsc --noEmit -p apps/site/tsconfig.json` both exit 0.
- **Committed in:** `94c52c2`, `ebc99f1`

---

**Total deviations:** 6 auto-fixed (1 missing critical, 3 bugs, 2 blocking)
**Impact on plan:** All six are correctness fixes required for the plan's own tests and typecheck gate to pass. No scope creep; no file outside the plan's `files_modified` list was created.

### Housekeeping outside the plan's task actions

- **The local branch was renamed `master` → `main`** so it matches the default branch of the newly created remote. No content changed.
- **The remote `origin` was created** against `https://github.com/britsync07-prog/the-meridian.git` and the branch pushed, so D-02 and D-03 are verifiable with `gh repo view` rather than merely asserted.

## Issues Encountered

- **The `@cloudflare/workers-types` / `@types/node` global `URL` clash** (deviation 6) is the one issue that could have forced a choice between the plan's mandated `types` array and the plan's mandated `node:fs` test files. It was resolved without changing either: `skipLibCheck` keeps the two declaration sets from colliding, and passing `href` instead of a `URL` instance keeps the two classes distinct.
- **The plan's `<interfaces>` block and its action step disagree on `EditionId`** (explicit union versus derived union). The derived form was chosen because the plan states the reason — "so the union can never drift from the data" — and the explicit union is preserved as the test's ordered id assertion, which is where the drift guard actually belongs.
- **The plan's `<interfaces>` block for `SITE_ORIGIN` and `USER_AGENT` embeds the origin twice.** Composing `USER_AGENT` from `SITE_ORIGIN` removed the duplication without changing the emitted value.

## Known Stubs

| Stub | Location | Reason | Resolved by |
|------|----------|--------|-------------|
| `SITE_ORIGIN = 'https://meridian.workers.dev'` | `shared/config/site.ts:15` | Deliberate placeholder until a domain exists. D-10 defers the purchase until after launch, and D-11 accepts that Google News enrolment, Publisher Center verification, the News Showcase panel and the AdSense path stay closed until then. The value flows to `<link rel="canonical">` and to the sitemap, so it is recorded rather than left silent. | The domain migration in Phase 7, via 301 redirects and a sitemap/hreflang re-verification (D-14). |

No other stub was introduced: no component renders a hardcoded empty value, no placeholder copy reaches the page, and no data source is left unwired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: dev_server_filesystem_scope | `apps/site/astro.config.mjs` | `vite.server.fs.allow: ['../..']` grants the Astro dev server read access to the whole repository root, because `shared/` sits above the Astro project root. This is required by the layout and is dev-only, but it does widen the dev server's reachable file scope beyond the Astro root. The repository contains no secrets, and `.dev.vars`, `.env` and `.wrangler/` are all ignored. |
| threat_flag: public_repository | `github.com/britsync07-prog/the-meridian` | The repository is now public by user decision (D-02, D-03). The committed content is the planning corpus and the curated-source design; no credential, feed content or runtime data is committed. Treated as accepted, not as a defect — the same disposition the plan's T-01-07 records. |

## User Setup Required

None — no external service configuration was required. The GitHub repository was created and verified automatically; the Cloudflare account work (R2 bucket, D1 database, the eight shard projects, budget alerts) belongs to plan 01-04 and is not part of this plan.

## Next Phase Readiness

- **Plan 01-02 (D1 schema, seed, repository module)** can start. `shared/` exists and is importable by relative path, the root `tsconfig.json` already includes `apps/worker/src/**/*`, and the `db:verify:local` / `db:verify:swap` scripts are already declared in `package.json`.
- **Plan 01-03 (free-tier ceiling registry)** can start. `shared/config/` is the established home for a single-source config module, and `config/` is already in the site-test's scan roots.
- **Plan 01-04 (R2 lifecycle, eight-project shard, delivery-model ADR)** can start. `scripts/shards/split-output.mjs` and `scripts/shards/deploy-all.mjs` already have script entries, and the ADR must state **eight** projects, superseding the research's single-project conclusion.
- **The shared contract is stable.** Later phases import `shared/types.ts` for the story schema and `shared/config/site.ts` for the publication name; neither may be redefined.
- **The Astro shell is green.** Phase 4's design work starts from a working build with `compressHTML: true` already proven against a real fixture, and `apps/site/src/styles/global.css` awaiting the `@theme` token block.

---

## Self-Check: PASSED

Every file, commit and claim in this summary was verified against the working tree.

- **Files:** all 17 created files plus the modified `.gitignore` exist on disk. `missing_count=0`.
- **Commits:** all six task commits exist in `git log --all` — `94c52c2`, `3fa771f`, `ebc99f1`, `79669c3`, `7b40ff1`, `dc183e8`.
- **`npm install`:** exits 0 and produces exactly one `package-lock.json` (asserted by `scripts/__tests__/layout.test.ts`).
- **`npm test -- --run`:** exits 0 — 3 test files, 21 tests, all passing.
- **`npm run typecheck`:** exits 0.
- **`npx tsc --noEmit -p apps/site/tsconfig.json`:** exits 0.
- **`npm run build`:** exits 0 from a clean `apps/site/dist` and produces `apps/site/dist/index.html`.
- **Built HTML:** contains `The Meridian` (single space) and does not contain `TheMeridian`.
- **GitHub:** `visibility=public`, `owner_type=User` for `britsync07-prog/the-meridian`.

---

*Phase: 01-foundation-free-tier-contract-architecture-decisions*
*Completed: 2026-10-20*
