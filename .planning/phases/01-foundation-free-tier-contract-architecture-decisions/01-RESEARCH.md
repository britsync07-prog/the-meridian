# Phase 1 Research: Foundation, Free-Tier Contract & Architecture Decisions

**Phase:** 1 — Foundation, Free-Tier Contract & Architecture Decisions
**Researched:** 2026-10-20
**Requirements in scope:** OPS-01, OPS-04, OPS-14, MED-08
**Locked decisions in scope:** D-01 … D-20 (all 20 in `01-CONTEXT.md`)
**Status:** Ready for planning

---

## Executive Summary

Phase 1 is a greenfield scaffold phase. There is no source code in the repository today — only `.planning/` planning documents, `AGENTS.md` and `.gitignore`. The phase produces a repo skeleton, a shared contract layer, the D1 schema and a repository module, a versioned free-tier ceiling registry with a standing no-spend rule, the R2 lifecycle rules, four ADRs, the Astro config, the coded excerpt budget, and the execution of five architecture-changing spikes.

Four findings from this research materially change how the phase must be planned:

1. **The 8-project static shard (D-06) is buildable, and the mechanism is a per-project `routes` entry, not a single multi-directory project.** Each shard is its own Workers project with its own `wrangler.jsonc` (`assets.directory` pointing at that shard's build output) and a zone route that claims only its own path prefixes. This is verified against the current Cloudflare Workers CLI reference. It means the shard matrix is a *Phase 1* deliverable, not Phase 5 work.

2. **`wrangler r2 bucket lifecycle add <BUCKET> <NAME> <PREFIX> --expire-days N` is prefix-scoped by construction.** The prefix argument is mandatory-position and an empty prefix means "all prefixes". MED-08's requirement — a rule that can never match `og/` or the bucket root — is therefore satisfiable *structurally*: every rule this project creates carries a non-empty prefix, and the Phase 1 verification is a `wrangler r2 bucket lifecycle list` assertion that every listed rule has a non-empty, explicitly-allow-listed prefix.

3. **Cloudflare Budget Alerts are informational only — they do not cap spend.** This is stated in Cloudflare's own changelog. D-04's "alerts plus lifecycle rules" therefore has an asymmetric strength profile: the *lifecycle rules* are the real cap on storage growth (they delete objects, so R2 Class A/B ops and GB-months stay inside the free allowance), while the *alerts* are a notification, not a control. The plan must record this honestly rather than claiming alerts prevent billing.

4. **Cloudflare's `d1` command set is now also reachable as `cf`**, and the `cf` variant only supports `--local` for D1 `migrations list` / `migrations apply`. This project must standardize on **`npx wrangler`** for everything (per Cloudflare's own guidance: "Commands not yet supported: `cf` is in beta … Run `npx wrangler` instead of installing Wrangler"), because the R2 lifecycle, D1 migration and deploy commands the phase needs are all stable on `wrangler`.

Two version drifts were found against the planning documents (both trivial, both pinned in the plan): `wrangler` is now **4.151.3** (docs said 4.151.2) and `satori` is now **0.63.2** (docs said 0.63.0). Every other planned version was confirmed exact against the npm registry.

---

## Standard Stack (Phase 1 subset)

Versions verified against the npm registry on **2026-10-20**.

| Package | Planned | Registry `latest` | Status | Phase 1 use |
|---------|---------|-------------------|--------|-------------|
| `astro` | 7.4.1 | **7.4.1** | ✅ exact | `apps/site` static output; `astro.config.mjs` |
| `tailwindcss` | 4.3.3 | **4.3.3** | ✅ exact | via `@tailwindcss/vite` |
| `@tailwindcss/vite` | 4.3.3 | **4.3.3** | ✅ exact | Vite plugin for Tailwind v4 |
| `wrangler` | 4.151.2 | **4.151.3** | ⚠ **minor drift** | D1 migrations, R2 lifecycle, deploy, `wrangler types` |
| `vitest` | 5.0.5 | **5.0.5** | ✅ exact | unit tests for the shared contract |
| `zod` | 4.6.7 | **4.6.7** | ✅ exact | excerpt-budget contract schema, config validation |
| `fast-xml-parser` | 5.11.2 | 5.11.2 | ✅ exact | **not used in Phase 1** (Phase 2) |
| `nanoid` | 6.0.2 | 6.0.2 | ✅ exact | slug generation (Phase 3) — not needed in Phase 1 |
| `sharp` | 0.35.5 | 0.35.5 | ✅ exact | **not used in Phase 1** (Phase 5) — Node only, never in an edge bundle |
| `satori` | 0.63.0 | **0.63.2** | ⚠ **minor drift** | **not used in Phase 1** (Phase 5) |
| `p-limit` | 7.3.3 | 7.3.3 | ✅ exact | **not used in Phase 1** (Phase 2) |
| `@astrojs/rss` | 4.0.19 | 4.0.19 | ✅ exact | Phase 6 — not needed in Phase 1 |
| `@astrojs/sitemap` | 3.7.4 | 3.7.4 | ✅ exact | Phase 6 — not needed in Phase 1 |

**Phase 1 dependency set (minimal):** `astro`, `tailwindcss`, `@tailwindcss/vite`, `wrangler`, `vitest`, `zod`, plus `@cloudflare/workers-types` (for `wrangler types` output) and `typescript`. `sharp`/`satori`/`fast-xml-parser` are **deliberately not installed** in Phase 1 — nothing in Phase 1 uses them, and installing `sharp` early risks it entering an edge bundle.

**Package manager recommendation: `npm` with `package-lock.json`.** Reasons, in order:
- D-20 requires exactly one lockfile and forbids the workspace protocol. `npm` is the only manager that is preinstalled on every GitHub Actions `ubuntu-latest` runner with no extra setup, and its lockfile format (`lockfileVersion: 3`) is a plain, diff-friendly JSON.
- `wrangler` and `@cloudflare/workers-types` ship their own TypeScript types; no extra `@types/node` gymnastics are needed for the Worker runtime.
- `pnpm` would be faster but requires a Corepack enable step in CI and stores its lockfile outside the repo root, which complicates "one lockfile" reviewability.
- The project uses one `package.json` at the root with **no** workspace protocol, so there is exactly one install, one `node_modules`, and one lockfile.

---

## Repository Layout (proposed)

D-20 locks: one `package.json`, one lockfile, no workspace protocol; `shared/` holds the contract imported by both runtimes; `apps/` holds the runtimes; build-time scripts live outside `src/`.

```
newsportal/
├── package.json                  # ONE package.json, no "workspaces" key
├── package-lock.json             # ONE lockfile
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── apps/
│   ├── site/                     # Astro runtime (the static tier)
│   │   ├── astro.config.mjs      # compressHTML:true, incrementalBuild, concurrency:1
│   │   └── src/
│   │       ├── pages/
│   │       ├── components/
│   │       ├── layouts/
│   │       └── styles/global.css # @import "tailwindcss";
│   └── worker/                   # edge runtime (fetch-only Worker, later the story tier)
│       ├── wrangler.jsonc        # d1 binding + assets + main
│       └── src/
│           ├── index.ts
│           ├── config/           # reads shared/config
│           └── db/               # THE repository module (OPS-14)
├── shared/                       # THE contract — imported by BOTH runtimes
│   ├── types.ts
│   ├── sections.ts
│   ├── taxonomy.ts
│   ├── config/
│   │   ├── site.ts               # SITE_NAME = "The Meridian" (D-12) — single source
│   │   ├── editions.ts           # 8 editions, 8 sections (D-13)
│   │   └── free-tier-limits.ts   # the ONLY module allowed to read a ceiling (OPS-01)
│   ├── contract/
│   │   └── excerpt-budget.ts     # the coded excerpt budget (Phase 2 implements)
│   ├── templates/
│   │   ├── head.ts               # pageMeta() contract
│   │   └── typographic-fallback.ts
│   └── db/
│       ├── 0001_init.sql         # DDL (research/ARCHITECTURE.md §5)
│       └── seed.sql              # editions + sections + 30-outlet starter registry
├── config/
│   └── free-tier-limits.json     # OPS-01 — every ceiling + source + verified_on
├── docs/
│   └── adr/                      # 0001..0005
├── scripts/                      # build-time scripts — OUTSIDE src/, never in an edge bundle
└── spikes/                       # S-1..S-5 harnesses + RESULTS.md
```

**Why `apps/site/astro.config.mjs` and not a root `astro.config.mjs`.** ROADMAP Phase 1's work item names "`astro.config.mjs`" without a directory prefix, while it prefixes every `shared/` path explicitly. D-20 says `apps/` holds the runtimes (plural). Placing the Astro project at `apps/site/` satisfies D-20 literally and keeps `sharp`/`satori` (Phase 5) inside `scripts/`, physically separated from any `src/`.

**The `shared/` import problem and its fix.** `shared/` lives at the repo root, which is *above* the Astro project root (`apps/site/`) and above the Worker root (`apps/worker/`). Both bundlers therefore import `shared/` by **relative path** — never by TypeScript path alias — exactly as CONTEXT.md's Established Patterns require ("Within edge Functions, `shared/` is imported by relative path, never by a TypeScript path alias, because that bundler's alias resolution is the least predictable part of the build"). Two consequences the plan must encode:

- **Astro/Vite needs filesystem permission to read above the project root.** `apps/site/astro.config.mjs` must set:
  ```js
  vite: { server: { fs: { allow: ['../..'] } } }
  ```
  Without this, the Astro dev server refuses to serve `../../shared/*`.
- **TypeScript still needs to typecheck `shared/`.** The root `tsconfig.json` includes both `shared/**/*` and `apps/**/*` and `apps/site/src/**/*`, with `paths` used **only by the editor and `tsc --noEmit`**, never by a bundler. Edge Functions keep using relative imports so the Workers bundler never has to resolve an alias.

---

## Key Patterns

### P1 — Astro 7 configuration (verified against the Astro v7 upgrade guide and the incremental-build reference)

```js
// apps/site/astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  compressHTML: true,          // NOT the v7 default 'jsx' — see P1.1
  build: { concurrency: 1 },    // MANDATORY: >1 disables incrementalBuild
  experimental: { incrementalBuild: true },
  cacheDir: './.astro-cache',   // persisted between CI runs — see P1.3
  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: ['../..'] } },  // allow reading ../../shared
  },
});
```

**P1.1 — `compressHTML: true` is a hard requirement, not a preference.** Astro v7 changed the default from `true` to `'jsx'`. JSX whitespace rules strip whitespace between inline elements: `<span>hello</span><em>world</em>` renders as `helloworld`. A broadsheet with inline `<span>`/`<em>`/`<cite>` inside headlines and bylines would silently lose spaces. `compressHTML: true` restores HTML-aware whitespace. The project-wide rule: **never use `compressHTML: false`** (it also strips nothing but bloats output), and every template using inline elements gets a visual check.

**P1.2 — The Rust compiler is the only compiler.** Unclosed tags are now **errors**, and invalid nesting is no longer auto-corrected — `<div>` inside `<p>` is passed through and the browser closes the `<p>` early, breaking layout. Phase 1's smoke page must therefore be deliberately valid markup, and Phase 4 inherits the rule.

**P1.3 — Incremental build mechanics (verified).** `experimental.incrementalBuild` was added in `astro@7.2.0`. Only pages returned from `getStaticPaths()` that include a **`cacheKey`** can be skipped; every other page re-renders each build. `cacheKey` is a string that changes whenever the page's data changes. Astro hashes the page's module dependency graph, so editing any layout/component/import invalidates the pages that use it. Changing the Astro config or project dependencies invalidates the entire cache. The cache lives in `cacheDir` (default `node_modules/.astro/`), holds both the build manifest and reusable output, and **must be restored before `astro build` in CI** — otherwise every page re-renders. `astro build --force` re-renders everything and still writes a fresh cache.

**P1.4 — `build.concurrency` and incrementalBuild are mutually exclusive.** "The incremental cache is disabled when `build.concurrency` is greater than `1`. Astro logs a warning and re-renders every page." The project must keep `build.concurrency: 1`. `experimental.parallelPrerendering` must **not** be enabled.

**P1.5 — Tailwind v4 wiring.** `npm install tailwindcss @tailwindcss/vite` → add `tailwindcss()` to `vite.plugins` → `@import "tailwindcss";` in `apps/site/src/styles/global.css`. The `@tailwindcss/postcss` path is the fallback for non-Vite setups and adds a redundant processing layer. Tailwind v4's CSS-first `@theme` block is the token surface Phase 4 will populate; Phase 1 only needs the import to exist and the build to be green.

**P1.6 — `src/fetch.ts` is a reserved filename** in Astro 7 (advanced routing auto-imports it). No file in the project may be named `shared/fetch.ts` or `apps/site/src/fetch.ts`.

**P1.7 — Markdown processor.** Astro 7 defaults to **Sätteri**; `@astrojs/markdown-remark` is no longer installed by default. Phase 1 installs neither — there is no Markdown in Phase 1. Phase 6's MDX trust layer will need an explicit decision (accept Sätteri, or `markdown: { processor: unified() }`).

### P2 — Wrangler command surface (verified against the current Wrangler command reference)

**P2.1 — R2 lifecycle (this is the MED-08 mechanism).**
```
npx wrangler r2 bucket create <BUCKET>
npx wrangler r2 bucket lifecycle add <BUCKET> <NAME> <PREFIX> --expire-days <N>
npx wrangler r2 bucket lifecycle list <BUCKET>
npx wrangler r2 bucket lifecycle remove <BUCKET> --name <NAME>
npx wrangler r2 bucket lifecycle set <BUCKET> --file <JSON>
```
Positional signature: `<BUCKET>` (required) `[NAME]` (alias `--id`) `[PREFIX]` — *"Prefix condition for the lifecycle rule (leave empty for all prefixes)"*. Other flags: `--expire-days`, `--expire-date`, `--ia-transition-days`, `--ia-transition-date`, `--abort-multipart-days`, `--jurisdiction`/`--J`, `--force`/`-y`.

**The MED-08 guarantee, made structural.** A rule is created **only** with an explicit, non-empty prefix. The Phase 1 verification is a `lifecycle list` assertion that (a) every listed rule's prefix is a member of the allow-list `["raw/", "media/"]`, and (b) **no** rule has an empty prefix, and (c) neither `og/` nor the bucket root appears in any rule's prefix. A rule with an empty prefix would match `og/` and the root — so "no empty prefix" is exactly "can never match `og/` or the root". `--ia-transition-*` must never be used: the R2 free tier does not apply Infrequent Access storage.

**P2.2 — D1 migrations.**
```
npx wrangler d1 create <DATABASE_NAME>
npx wrangler d1 migrations create <NAME>
npx wrangler d1 migrations list <DATABASE_NAME>
npx wrangler d1 migrations apply <DATABASE_NAME> [--local|--remote]
npx wrangler d1 execute <DATABASE_NAME> --file <SQL> [--local|--remote]
```
Migrations live in a `migrations/` folder and are applied in filename order. The folder and the applied-migrations table name are both configurable on the `d1_databases` binding: `migrations_dir`, `migrations_table` (default `d1_migrations`), `migrations_pattern` (glob). **`--local` executes against a local SQLite file in `.wrangler/state`** — this is the mechanism for Phase 1 Success Criterion #2 ("pointing that identifier at an empty database and running the migration succeeds with no code change"): delete `.wrangler/state`, create an empty DB, point the binding at a different `database_id`, apply, and observe the schema build with zero source edits.

**P2.3 — `cf` vs `wrangler`.** Cloudflare now exposes a `cf` CLI with equivalents for many commands. It is in beta, it does not support all commands, and `--local` works on it only for a small set (D1 `migrations list` / `migrations apply` among them). Cloudflare's own guidance: *"Commands not yet supported: `cf` is in beta … Run `npx wrangler` instead of installing Wrangler."* **The project standardizes on `npx wrangler`** for every Phase 1 command.

**P2.4 — Deploy and asset configuration.**
```jsonc
{
  "name": "<shard-name>",
  "main": "./src/index.ts",
  "compatibility_date": "<YYYY-MM-DD>",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "none",        // default; MUST NOT be "404-page" (it would swallow /story/*)
    "html_handling": "force-trailing-slash"
  },
  "routes": [ { "pattern": "<zone>/uk/*", "zone_name": "<zone>" } ]
}
```
`assets.not_found_handling` accepts `"single-page-application" | "404-page" | "none"` and **defaults to `"none"`**. `"404-page"` must never be used here: it makes the asset layer answer unmatched paths before the Worker script sees them, which would swallow `/story/*` and `/api/*`. `assets.run_worker_first` accepts `boolean | string[]` (glob patterns, `!` exception prefix, ≤100 entries) and is the correct tool for "run the Worker for `/story/*` and `/api/*`, serve everything else from the CDN". `assets.html_handling` accepts `"auto-trailing-slash" | "force-trailing-slash" | "drop-trailing-slash" | "none"`.

### P3 — The 8-project static shard (D-06), and how it is routed

**Mechanism.** Each shard is an **independent Workers project** with its own `wrangler.jsonc` and its own `assets.directory` pointing at that shard's build output directory. Routing across the 8 projects is done with **zone routes**: each project declares the path prefixes it owns, and the zone routes those prefixes to that project. `--routes`/`--route` on the CLI (`--route example.com/*`) and the `routes` array in `wrangler.jsonc` are the two equivalent surfaces.

**Why not one project with 8 asset directories.** `assets.directory` is a single folder per project. Eight directories in one project would mean eight `wrangler deploy` invocations against the same project name, with each overwriting the previous — the file-count cap applies **per project**, so one project still caps at 20,000 files. Eight projects means 8 × 20,000 = 160,000 files, which is the whole point of D-06.

**The shard matrix (route ownership).** The eight locale prefixes are `/uk/`, `/us/`, `/au/`, `/ca/`, `/ie/`, `/nz/`, `/in/`, `/in-hi/`. Eight prefixes, eight shards, one prefix each — the shard boundary is the edition boundary. Global surfaces (the edition picker at `/`, `/topic/*`, `/entity/*`, `/sitemap*`, `/rss/*`, `/robots.txt`, fonts/CSS) are **duplicated into every shard's output** so that whichever project's route receives the request, the file is present. This duplication costs ~45 files × 8 = 360 files against a 160,000-file budget — irrelevant — and it removes every cross-project dependency from the static tier.

**Route table (one row per shard):**
| Shard | Project name | Zone route | Asset prefix served |
|-------|--------------|-----------|--------------------|
| 01 | `meridian-static-uk` | `<zone>/uk/*` | `/uk/` |
| 02 | `meridian-static-us` | `<zone>/us/*` | `/us/` |
| 03 | `meridian-static-au` | `<zone>/au/*` | `/au/` |
| 04 | `meridian-static-ca` | `<zone>/ca/*` | `/ca/` |
| 05 | `meridian-static-ie` | `<zone>/ie/*` | `/ie/` |
| 06 | `meridian-static-nz` | `<zone>/nz/*` | `/nz/` |
| 07 | `meridian-static-in` | `<zone>/in/*` | `/in/` |
| 08 | `meridian-static-in-hi` | `<zone>/in-hi/*` | `/in-hi/` |

**The story tier is not in the static shard.** `/story/*` is served by the edge Worker reading R2, per the reconciled architecture. That Worker is a *separate* project (`meridian-edge`) with `main` + an `assets` binding and `run_worker_first: ["/story/*", "/api/*"]`. Sharding does not change the story tier's request cost; D-07's "promote hot stories into the static tier" is the mechanism that eventually moves hot story HTML into the shards' output directories, making those views free.

**The shard matrix is Phase 1 work, not Phase 5 work.** D-06 says the shard is "mandatory infrastructure, built in this phase, not deferred". Phase 1 therefore creates: the 8 `wrangler.jsonc` files, the route table, the build-time splitter that partitions one Astro build output into 8 shard directories, and the deploy script that deploys all 8. The *content* of those directories is Phase 5's job.

### P4 — D1 schema

**Source of truth:** `.planning/research/ARCHITECTURE.md` §5 (lines 356–636) — the full DDL, already validated against SQLite by the research phase. Phase 1's job is to land it as `shared/db/0001_init.sql` and prove it applies to an empty database.

**Design rules carried from the research:**
- `PRAGMA foreign_keys = ON;` at the top; migrations should use `PRAGMA defer_foreign_keys = true;` so the `stories ⇄ clusters` cycle resolves.
- `WITHOUT ROWID` on the pure join tables (`edition_sections`) to save space and a lookup.
- `clusters` are the published units; `stories` are raw mentions, never rendered directly; `story_sources` is the many-to-many carrying display rank.
- 90-day prominence is a **flag** (`is_prominent`), never a deletion. `published_at` never changes.
- Index amplification: Cloudflare counts an indexed column as an additional written row, so the write budget is computed on **physical** rows.

**Required index set (ROADMAP Phase 1 work item: "the full index set including the four LSH band indexes and the partial editorial-rank index"):**
`idx_stories_band0`, `idx_stories_band1`, `idx_stories_band2`, `idx_stories_band3` (four 16-bit LSH bands on `stories`), `idx_stories_cluster`, `idx_stories_source_pub`, `idx_story_sources_source`, `idx_clusters_prominent` (composite over the exact `is_prominent = 1` predicate plus the sort key), `idx_clusters_score`, `idx_clusters_editorial` (**partial**, `WHERE editorial_rank IS NOT NULL`), `idx_sources_active`, `idx_sources_country`, `idx_edition_clusters_edition`. The research counts **19 tables and 31 indexes** — the Phase 1 plan must assert both counts so a dropped index fails loudly.

**SQLite partial indexes.** `CREATE INDEX ... WHERE <predicate>` is standard SQLite syntax and D1 runs SQLite, so the partial editorial-rank index is supported. This is not a portability risk.

**No `SELECT *`.** D1 bills rows **scanned**, not rows returned. Every filtered column needs an index. Phase 1's repository module must therefore enumerate columns explicitly in every statement it issues. A lint-style check is warranted here but is not required in Phase 1; the repository module's first task should simply never write `SELECT *`.

**Schema deviation Phase 1 must make, and why.** The research DDL's `sources` table has **no terms-of-use ledger**, but ROADMAP Phase 2 requires "the terms-of-use verification ledger" and REQUIREMENTS.md ING (Phase 2) requires "the verification date on its registry record", and Phase 6's `/sources` page publishes "the date its feed terms were verified". Since Phase 1 owns the schema and Phase 2 owns the fetch, shipping a `sources` table that cannot express the next phase's launch-blocking legal gate would force an avoidable migration. **Phase 1 adds three columns to `sources`:**
```sql
terms_status     TEXT NOT NULL DEFAULT 'unverified',  -- 'unverified' | 'verified' | 'refused'
terms_verified_at TEXT,                                 -- ISO-8601 date the terms were checked
terms_url         TEXT,                                 -- where the publisher publishes its terms
```
This deviation is recorded in the D1 ADR.

**Migration mechanism (OpenCode's discretion → decided):** `wrangler d1 migrations`. It is the officially supported path, it tracks applied migrations in a `d1_migrations` table, and `migrations_dir` / `migrations_pattern` let the migrations live in `shared/db/` alongside the DDL instead of in the Worker's directory. The `d1_databases` binding on `apps/worker/wrangler.jsonc` sets `"migrations_dir": "../../shared/db"` and `"migrations_table": "d1_migrations"`.

**Seed strategy (OpenCode's discretion → decided):** a single `shared/db/seed.sql` with `INSERT OR IGNORE` statements, applied with `npx wrangler d1 execute <DB> --file shared/db/seed.sql --local`. It seeds: **8 editions** (`uk`, `us`, `au`, `ca`, `ie`, `nz`, `in`, `in-hi`), **8 sections** (`politics`, `business`, `technology`, `sport`, `health`, `world`, `weather`, `entertainment`), the `edition_sections` join (8 × 8 = 64 rows), and a **30-outlet starter source registry** across the seven countries (the "Track E taxonomy curation" workstream's Phase 1 contribution per ROADMAP's Parallel Workstreams table — "Start with a 30-outlet, 8-section, 7-country lexicon"). Every seeded source carries `terms_status = 'unverified'` by default; Phase 2 sets it to `'verified'` with a date before that feed is ever fetched.

### P5 — The repository module (OPS-14)

**Requirement:** "All datastore access goes through one repository module with the database identifier held as a configuration value."

**Design (OpenCode's discretion → decided):**
- One module: `apps/worker/src/db/repository.ts`. It is the **only** file in the repo that imports a D1 binding or issues SQL.
- The database identifier is **not** hardcoded in the module. It is read from configuration: the `wrangler.jsonc` `d1_databases[].database_id` is the binding's target, and the module resolves its target through a single indirection — `apps/worker/src/db/config.ts` exports `resolveDatabaseId(env)` which reads `env.MERIDIAN_DB_ID` (a plain-text Worker variable) and falls back to the binding's configured id. Pointing the project at a different database is therefore a configuration change, not a code change.
- The module is **ORM-free**. Plain parameterized `prepare().bind().run()/all()/first()` calls. No `SELECT *` anywhere.
- **Local development:** the module is written against the Workers `D1Database` interface, so it can be exercised against a local D1 (`wrangler d1 execute --local`, SQLite file in `.wrangler/state`) via `wrangler dev`, or directly through the same SQL against the local SQLite file in a vitest test.
- **Migration path:** the repository exposes `applyMigrations()` semantics through the CLI, not through runtime code — migrations are applied by `npx wrangler d1 migrations apply`, never by the Worker. The Worker never mutates the schema.

**The OPS-14 proof (Phase 1 Success Criterion #2):** delete `.wrangler/state`; create a second, empty local database; change only the `database_id` in `wrangler.jsonc`; run `npx wrangler d1 migrations apply <DB> --local`; run the seed; query `SELECT COUNT(*) FROM editions` → 8. Zero source-file edits. That command sequence is the automated verification for the requirement.

### P6 — The free-tier ceiling registry (OPS-01) and the no-spend rule (OPS-04)

**`config/free-tier-limits.json` — required shape:**
```jsonc
{
  "version": 1,
  "updated_on": "2026-10-20",
  "limits": [
    {
      "id": "workers_requests_per_day",
      "resource": "Workers requests",
      "value": 100000,
      "unit": "requests",
      "period": "day",
      "source_url": "https://developers.cloudflare.com/workers/platform/limits/",
      "verified_on": "2026-10-20",
      "enforcement": "enforced"
    }
    // … 16 more rows — see the coverage table below
  ],
  "paid_plan_decision_rule": { /* see below */ }
}
```
`enforcement` is `"enforced"` when the numeric value is distinctive enough to be safely scanned for as a stray literal in source; `"informational"` for values that would produce false positives when scanned (e.g. `50` subrequests, `5` cron triggers, `10` GB) but which are still recorded and still readable through the loader. **Every limit is recorded; only the scan is selective.**

**The required ceiling coverage (ROADMAP Phase 1 Success Criterion #1 names thirteen):**
| # | Ceiling | Value | Unit / period | Source |
|---|---------|-------|--------------|--------|
| 1 | Workers requests | 100,000 | requests/day | `workers/platform/limits` |
| 2 | Workers CPU per invocation | 10 | ms | `workers/platform/limits` |
| 3 | Worker subrequests | 50 | per invocation | `workers/platform/limits` |
| 4 | Cron triggers per account | 5 | triggers | `workers/platform/limits` |
| 5 | D1 rows read | 5,000,000 | rows/day | `d1/platform/pricing` |
| 6 | D1 rows written | 100,000 | rows/day | `d1/platform/pricing` |
| 7 | D1 storage per database | 500 | MB | `d1/platform/limits` |
| 8 | KV writes to different keys | 1,000 | writes/day | `kv/platform/limits` |
| 9 | R2 storage | 10 | GB-month | `r2/pricing` |
| 10 | R2 Class A ops | 1,000,000 | ops/month | `r2/pricing` |
| 11 | R2 Class B ops | 10,000,000 | ops/month | `r2/pricing` |
| 12 | Static asset files per project | 20,000 | files | `workers/platform/limits` |
| 13 | GitHub Actions minutes | 2,000 | minutes/month | `docs.github.com` |
| 14 | Brevo daily sends | 300 | emails/day | `brevo.com/pricing` |
| 15 | Open-Meteo daily calls | 10,000 | calls/day | `open-meteo.com/en/pricing` |
| 16 | Google News sitemap entries | 1,000 | entries/file | `developers.google.com` |

All sixteen are the reconciled values from `.planning/research/SUMMARY.md` §6. Row 16 (Google News sitemap) additionally carries the **48-hour window** as a second limit row (`google_news_sitemap_window_hours`, value 48).

**The "no ceiling read from anywhere else" test — concrete, non-brittle, and self-proving.** The mechanism is a **source scan for stray literals**, implemented as a vitest test:

1. Load `config/free-tier-limits.json`; collect every limit with `enforcement: "enforced"` into a token set — the numeric value (`100000`) and its comma-stripped and underscore-stripped forms, plus any `scan_tokens` the row declares (e.g. `"100,000"`, `"10GB"`).
2. Walk the repo's source tree — `apps/`, `shared/`, `scripts/`, `config/`, `spikes/` — collecting `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.json` files. **Exclude** `config/free-tier-limits.json` itself and `shared/config/free-tier-limits.ts` (the loader — the one legal home for a literal).
3. For each file, for each token, search with a **word-boundary** regex. Any hit is a failure, reported as `file:line — token`.
4. **Self-proving step (required):** the test writes a temporary file into a scanned directory containing `const FREE_TIER_WORKERS_REQUESTS = 100000;`, re-runs the scanner, and asserts the scanner **detects** it; then deletes the temp file. A gate that has never been observed to fail is not a gate. This step is what makes Phase 1 Success Criterion #1's "a test fails if any code path reads a ceiling from anywhere else" literally true.

The loader `shared/config/free-tier-limits.ts` is the single export surface: it imports the JSON (or parses it at build time), validates it with Zod (so a malformed row fails loudly), and exports typed accessors (`limit('workers_requests_per_day')`). The loader is also where the loader-side numeric literals live, and it is the only file the scan exempts.

**The paid-plan decision rule (OPS-04) — reconciled with D-05 and D-07.** OPS-04 requires a written rule naming three triggers; D-05 forbids ever buying the paid plan; D-07 defines the load-shedding response. The rule that satisfies all three lives in the **same file** as the budget (Phase 1 Success Criterion #4: "lives in the same versioned file the audit Worker reads, so the rule and the budget can never drift apart"):
```jsonc
"paid_plan_decision_rule": {
  "version": 1,
  "updated_on": "2026-10-20",
  "triggers": [
    { "id": "traffic",     "metric": "daily_visitors",           "threshold": 4000,  "unit": "visitors/day", "comparison": "approaching", "source_requirement": "OPS-04" },
    { "id": "static_files","metric": "static_files_per_project", "threshold": 20000, "unit": "files",         "comparison": "exceeding",  "source_requirement": "OPS-04" },
    { "id": "revenue",     "metric": "monthly_revenue_usd",      "threshold": 1,     "unit": "USD/month",    "comparison": "any",        "source_requirement": "OPS-04" }
  ],
  "standing_disposition": "never_purchase",
  "standing_decision_ref": "D-05",
  "standing_decision_text": "The free tier is a permanent hard ceiling. The project never buys Workers Paid or any other paid tier, not even after the site earns revenue.",
  "response_mechanisms": [
    "promote_hot_stories_into_the_static_tier",
    "edge_cache_the_story_tier_hard",
    "shard_the_static_tier_across_the_8_projects"
  ],
  "response_decision_ref": "D-07",
  "request_ceiling_is_a_permanent_wall_ref": "D-08"
}
```
All three OPS-04 triggers are **named** (satisfying OPS-04 and Phase 1 Success Criterion #4 verbatim), while the disposition records that the response to any of them is load shedding, not spending (satisfying D-05, D-07, D-08). D-09 (Open-Meteo replacement) is recorded in the same file as a **known non-conforming dependency**: the free tier is non-commercial only, so the project carries a standing obligation to source a commercially-usable replacement before any revenue exists — and, per D-05, it will **not** buy Open-Meteo's paid tier when that moment comes.

**Honest note on D-04's "protected from ever billing".** Cloudflare Budget Alerts are documented as **informational only**: *"The alert is informational only. It does not cap your usage or impact your account in any way."* Usage is processed once per day for the prior day's activity, so alerts fire the day after a threshold is reached, not in real time. Budget alerts are also **spend-threshold** based, not percentage-of-quota based. The project's 50% / 75% percentage alerts are the audit Worker's job (OPS-03, Phase 7) reading the same versioned file. **The real protection against an R2 overage is the lifecycle rules**, which delete objects and therefore keep GB-months and Class A/B ops inside the free allowance by construction. The Phase 1 ADR must state this plainly rather than implying alerts cap spend.

### P7 — The coded excerpt budget

**Shape (OpenCode's discretion → decided):** `shared/contract/excerpt-budget.ts`, exporting the constants, a Zod schema for the result, and pure functions. The budget itself is fixed by PROJECT.md and must not be configurable per source (the Discretion section permits "whether any per-source override is supported" — the decision is **no per-source override**, because an override is a paraphrase-shaped loophole).

```ts
export const EXCERPT_BUDGET = {
  maxWords: 50,
  maxChars: 320,
  maxSentences: 2,
  maxSourceShare: 0.30,
  minSourceWords: 160,
  ellipsis: '…',
} as const;

export interface ExcerptInput {
  candidate: string;          // the publisher-supplied summary/description, verbatim
  sourceVisibleText: string;  // the publisher article's visible text
}

export type ExcerptRejection = 'source_absent' | 'source_too_short';

export interface ExcerptResult {
  text: string | null;        // null => publish NO excerpt (omit entirely)
  truncated: boolean;
  rejection: ExcerptRejection | null;
  wordCount: number;
  charCount: number;
  sentenceCount: number;
  sourceShare: number;        // excerpt words / source visible words
}

export function applyExcerptBudget(input: ExcerptInput): ExcerptResult;
export function assertExcerptWithinBudget(text: string, sourceVisibleText: string): void; // throws ExcerptBudgetError
```

**The algorithm, in order:**
1. If `sourceVisibleText` is empty → `{ text: null, rejection: 'source_absent' }`.
2. If the source's visible-text word count is `< 160` → `{ text: null, rejection: 'source_too_short' }` — publish **no excerpt at all** (PROJECT.md).
3. Compute the binding word allowance: `allowed = min(50, floor(0.30 × sourceWords))`. The character cap and the sentence cap are applied afterwards, because a word-bound cut is the only cut that can guarantee the word cap.
4. Cut to at most `allowed` words **at a word boundary**. Never mid-word.
5. Cut to at most 2 sentences (sentence boundary = `.`, `!`, `?` followed by whitespace or end-of-string).
6. Cut to at most 320 characters **at a word boundary**.
7. If any cut removed content, append the visible ellipsis `…` (U+2026) — and the ellipsis itself must fit inside the 320-character budget.
8. **Verbatim guarantee:** the function only ever *truncates*. It never rewrites, paraphrases, synonymizes or translates. The result must be a prefix of the candidate (plus the ellipsis). This is directly testable.

**Phase 1 vs Phase 2.** Phase 1 delivers the **contract and its tests** (ROADMAP: "The excerpt budget written as a coded, tested rule in the normaliser contract (implementation and test land in Phase 2)"). Phase 1 therefore ships `shared/contract/excerpt-budget.ts` plus its vitest suite, with the Phase 2 normaliser calling it. Phase 1 must NOT build the normaliser, the feed parser or the excerpt extraction pipeline.

**Tests Phase 1 must write (each a named case):**
- 49-word candidate under a 200-word source → unchanged, `truncated: false`.
- 51-word candidate → cut to 50 words + `…`, `wordCount === 50`.
- A candidate whose first 50 words exceed 320 characters → cut at the word boundary that keeps `charCount <= 320` including the ellipsis.
- A 3-sentence candidate → 2 sentences retained.
- A candidate of 40 words against a 100-word source → `text: null, rejection: 'source_too_short'` (100 < 160).
- A candidate of 40 words against a 200-word source → allowed = floor(0.30 × 200) = 60, so 40 words survive unchanged; `sourceShare === 0.20`.
- A candidate of 100 words against a 200-word source → allowed = 60 → cut to 60 words; `sourceShare === 0.30`.
- Verbatim: `expect(result.text.startsWith(input.candidate.slice(0, result.text.length - 1))).toBe(true)` — the output is a prefix of the input, never a rewrite.
- `assertExcerptWithinBudget` throws on an over-budget string.

### P8 — Image permanence contract (D-15 … D-19)

Phase 1 records the **decision and the contract**; the mechanism ships in Phase 5 (serve-time resolution) and Phase 7 (periodic sweep). What Phase 1 must commit to the repo:
- `shared/templates/typographic-fallback.ts` — a **pure function returning an HTML string** (the project's "pure string builders" convention, so the dynamically served story page looks identical to the statically served section page). Signature: `typographicFallback(headline: string): string` — it renders the headline's **opening words** in a ruled typographic block. No "image archived" caption, no visible system explanation (D-16).
- `shared/contract/image-permanence.ts` — the resolution rule: `resolveMediaObject(key)` returns `present` or `expired`; `expired` renders the typographic fallback. Serve-time resolution costs **one extra R2 Class B read per image view** (D-18) — inside the 10M/month allowance.
- The sweep's trigger condition: a periodic job that finds stories whose media object is past the 12-month clock and re-renders those pages so the common case never pays a lookup (D-17).
- `docs/adr/0003-image-permanence.md` — records D-15 (uniform 12 months, no exemptions), D-16 (silent typographic panel), D-17 (both mechanisms), D-18 (the accepted read cost), D-19 (OG images never expire).

The panel's **visual** specifics are Phase 4's (CONTEXT.md Discretion). Phase 1 fixes only that it is a pure string builder taking a headline.

### P9 — The name contract (D-12, D-13) and the domain contract (D-10, D-11, D-14)

- **One site name, one place.** `shared/config/site.ts` exports `export const SITE_NAME = 'The Meridian';`. It is the single source for `<news:name>`, the masthead, the Open Graph template and the repository name. Phase 1 creates the value and the module; Phase 6 emits `<news:name>` from it; Phase 5's OG template reads it.
- **One site name across seven editions.** `shared/config/editions.ts` exports the 8 editions (`uk`, `us`, `au`, `ca`, `ie`, `nz`, `in`, `in-hi`) with their country codes and languages (`en`, `hi`). D-13's rule — edition identity lives in the `<title>`, the meta description (country keyword present in the snippet), the `<h1>` and the visible masthead, never as a separate site name — is encoded as the **shape** of `pageMeta()`.
- **`pageMeta()` lives in `shared/templates/head.ts`** and is the single source of truth for title, description, self-referential canonical, hreflang set and sitemap entry. Phase 1 fixes the **signature and the type**, not the full Phase 6 behaviour:
  ```ts
  export interface PageMetaInput {
    title: string;            // e.g. "UK — The Meridian"  (edition in title, D-13)
    description: string;       // must contain the country keyword (D-13)
    path: string;              // self-referential canonical path (never a publisher URL)
    edition: EditionId;
    alternates?: HreflangAlternate[];   // India EN <-> HI only (Phase 6 populates)
  }
  export interface PageMeta {
    title: string; description: string; canonical: string;
    htmlLang: string;          // 'en' | 'en-IN' | 'hi-IN'
    alternates: HreflangAlternate[];
  }
  export function pageMeta(input: PageMetaInput): PageMeta;
  ```
  A Phase 1 test asserts `canonical` always equals the site's own origin + `input.path` and never contains an external host — the self-referential canonical rule, asserted at contract level.
- **Domain.** D-10 defers the purchase past launch; D-11 records the consequence (Google News enrolment, Publisher Center URL verification, the News Showcase panel and the AdSense path stay closed until a domain exists — a `workers.dev` subdomain cannot provide the DNS TXT record Publisher Center requires). Phase 1 records both in `docs/adr/0004-domain-and-name.md` together with D-14's migration rule: **301 redirects, never canonicals**, with the redirect map generated from the same source as the sitemap so the two cannot drift.

---

## Spike Protocols (S-1 … S-5)

These are work items with budgets and decision rules (ROADMAP §Research Spikes). Each has a scaffold, a command, a metric, a threshold and an artefact.

### S-1 — Durable Object CPU on Workers Free (30 min, gates Phase 2)
**Question:** does a Durable Object on the Free plan die at 10 ms CPU (`Error 1102`) or reach 30 s?
**Scaffold:** `spikes/s-1-do-cpu/` with its own `wrangler.jsonc` (`main`, `compatibility_date`, `durable_objects` binding), and a DO class that burns CPU in a loop for a target duration.
**Command:** `npx wrangler dev --config spikes/s-1-do-cpu/wrangler.jsonc` then invoke the worker; or `npx wrangler deploy --dry-run` + `wrangler dev`. The measurement is the DO's reported CPU time vs the wall time of the loop.
**Metric:** maximum CPU milliseconds the DO consumed before the runtime terminated the invocation.
**Threshold:** survives ≥ 2 s of CPU → the DO becomes a candidate ingest engine; dies at ~10 ms with `Error 1102` → the fetch-only-Worker-to-R2-to-CI default is confirmed.
**Artefact:** `spikes/s-1-do-cpu/RESULT.md` — observed CPU, error code if any, decision, and whether the delivery model changes.
**Why it matters:** this is the one spike that could materially simplify the architecture. But per the reconciled architecture, **either outcome leaves the default build intact** — so the spike is a bonus, never a blocker.

### S-2 — Worker egress vs publisher blocking (30 min, gates Phase 2)
**Question:** do real publishers serve a Worker?
**Scaffold:** `spikes/s-2-worker-egress/` — a Worker that conditionally GETs 10 target feeds with a descriptive User-Agent.
**Command:** `npx wrangler dev --config spikes/s-2-worker-egress/wrangler.jsonc`; issue the 10 requests; record status + latency.
**Metric:** HTTP status and latency for each of the 10 feeds, plus any 403/429 and whether `Retry-After` was present.
**Threshold:** ≥ 80% of feeds return 200 → the Worker is the fetch path. Record the 10% case per-feed; it calibrates the per-host backoff policy.
**Artefact:** `spikes/s-2-worker-egress/RESULT.md` — a table of feed URL, status, latency, 403/429 flag, `Retry-After` value.
**The 10 feeds** (5 UK + 5 US; the rest of the country feeds are added in Phase 2):
`https://feeds.bbci.co.uk/news/rss.xml` · `https://www.theguardian.com/uk/rss` · `https://feeds.skynews.com/feeds/rss/uk.xml` · `https://www.independent.co.uk/news/uk/rss` · `https://www.ft.com/rss/home` · `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml` · `https://feeds.washingtonpost.com/rss/world` · `https://rss.cnn.com/rss/edition.rss` · `https://feeds.aol.com/news/rss19.rss` · `https://apnews.com/hub/ap-top-news?output=rss`
*(These are the publishers PROJECT.md names. Each feed's availability and terms must still be verified in Phase 2 before it is fetched for real — S-2 measures blocking, it does not clear the legal gate.)*
**User-Agent format:** `TheMeridianBot/1.0 (+https://<site-host>/about#contact; <monitored-email>)` — descriptive, contains a contact URL, identifies the aggregator. The exact string is a constant in `shared/config/site.ts` (`USER_AGENT`) so the fetch Worker and the CI runner send the same one (S-3 compares them).

### S-3 — CI egress comparison (15 min, gates Phase 2)
**Question:** does a GitHub Actions runner get blocked where the Worker does not?
**Scaffold:** `spikes/s-3-ci-egress/` — a GitHub Actions workflow that runs the same 10 URLs with the same User-Agent and writes the results to the job summary.
**Command:** push to a branch; the workflow runs; read the job summary.
**Metric:** the percentage of publishers returning 403/429 to the CI IP range.
**Threshold:** **≥ 30% blocked** → the Worker is definitively the only fetch path. Below 30% → the Worker is still preferred (a dedicated, auditable, rate-limited identity beats a shared runner IP), but CI remains a viable fallback.
**Artefact:** `spikes/s-3-ci-egress/RESULT.md` — the same table shape as S-2, side by side.
**Note:** this spike *detects* a surprise; it does not reopen the decision.

### S-4 — Astro build throughput (60 min, gates Phase 5)
**Question:** how fast does Astro 7 build a large static site, and is `incrementalBuild` effective?
**Scaffold:** `spikes/s-4-astro-throughput/` — a **generator script** that writes N synthetic page files from a small template (no 20,000 files committed). Each generated page is a `getStaticPaths` route with a `cacheKey`.
**Command:** `npm run build:spike:s4 -- --pages 20000`; time it. Then re-run with the `cacheDir` preserved and measure the incremental build.
**Metric:** pages/second for the full build; pages/second and wall time for the incremental build; the ratio between them.
**Threshold:** **< 60 pages/second** → topic and entity pages move to the R2 tier before year 2. ≥ 60 pages/second → the static tier stays as designed.
**Artefact:** `spikes/s-4-astro-throughput/RESULT.md` — the two timings, the page counts, and the decision.
**Why it matters:** the shard decision (D-06) and the file-count budget both depend on build throughput.

### S-5 — wrangler asset-upload diffing (30 min, gates Phase 5)
**Question:** does `wrangler deploy` re-upload unchanged assets on every deploy?
**Scaffold:** `spikes/s-5-wrangler-diffing/` — a small static directory and a minimal `wrangler.jsonc` with an `assets` block.
**Command:** deploy twice with **no** content change; capture the upload output and the timing of each.
**Metric:** the number of assets uploaded on the second deploy (0 = full diffing; N = full re-upload), and the wall time of each deploy.
**Threshold:** a full re-upload means the deploy step must be budgeted at full size and may need the shard split to stay under upload rate limits. Full diffing means deploys are cheap and the shard count can grow.
**Artefact:** `spikes/s-5-wrangler-diffing/RESULT.md` — both deploy logs' upload counts and timings, and the resulting deploy-step budget that feeds the OPS-07 assertion.

### Consolidated results
`spikes/RESULTS.md` — one row per spike (ID, question, metric, observed value, threshold, decision, delivery-model change if any) plus the resolved answers to S-1 … S-5 that Phase 2 and Phase 5 read as their entry gates.

---

## Pitfalls and Anti-Patterns

| # | Pitfall | Why it bites here | Guard |
|---|---------|-------------------|-------|
| 1 | **Copying the research's "one project"** | `research/SUMMARY.md` §1 and `.planning/codebase/ARCHITECTURE.md` recommend ONE static project; D-06 mandates **8**. A plan that copies the research text produces the wrong architecture. | The ADR must say **8 projects**; the shard matrix test asserts 8 `wrangler.jsonc` files. |
| 2 | **`not_found_handling: "404-page"`** | It makes the asset layer answer unmatched paths before the Worker sees them, swallowing `/story/*` and `/api/*`. | `"none"` only; asserted by a config test. |
| 3 | **A lifecycle rule with an empty prefix** | An empty prefix means "all prefixes" — it would expire `og/` and the site root, destroying permanent story images (MED-08's exact prohibition). | Every rule carries an explicit prefix; the Phase 1 assertion requires a non-empty prefix from the allow-list `{raw/, media/}`. |
| 4 | **`--ia-transition-days`** | Infrequent Access storage is not covered by the R2 free tier. | Never used. Only `--expire-days`. |
| 5 | **`compressHTML` left at the v7 default** | `'jsx'` strips whitespace between inline elements → `helloworld` inside broadsheet headlines. | `compressHTML: true` in `astro.config.mjs`, asserted by a config test. |
| 6 | **`build.concurrency > 1`** | Silently disables `incrementalBuild`; Astro re-renders every page and logs a warning. | `build.concurrency: 1`, asserted by a config test. |
| 7 | **Using `@tailwindcss/postcss`** | Adds a redundant processing layer; the Vite plugin is Tailwind's own documented path for Astro. | `@tailwindcss/vite` only. |
| 8 | **TypeScript path aliases for `shared/`** | Edge bundler alias resolution is the least predictable part of the build. | Relative imports in edge code; aliases only for `tsc`. |
| 9 | **`SELECT *`** | D1 bills rows **scanned**. A `SELECT *` on `stories` is ~44,000 rows read per call. | Explicit column lists in every statement; the repository module is the only place SQL exists. |
| 10 | **Forgetting D1 index amplification** | Each indexed column counts as an additional written row; a 5-index insert counts as 6 writes. | Write budgets computed on physical rows (Phase 7's audit Worker). |
| 11 | **Hardcoding a ceiling outside the registry** | The budget and the code drift; the free tier is breached silently. | The scan test — **with the self-proving step**. |
| 12 | **Believing Budget Alerts cap spend** | Cloudflare states budget alerts are informational only and do not cap usage. | The ADR says so; the real cap is the lifecycle rules. |
| 13 | **Applying the migration at runtime** | The Worker must never mutate the schema; a failed migration must fail the build, not a request. | Migrations are applied by `npx wrangler d1 migrations apply`, never by the Worker. |
| 14 | **Copying research §3's project structure** | It describes a Worker doing ingest+enrich+score+digest and a Pages `functions/` directory with `_routes.json`. All superseded. | Use `.planning/codebase/ARCHITECTURE.md` + this document. |
| 15 | **A file named `fetch.ts`** | Reserved by Astro 7 for advanced routing; it is auto-imported and will break the build. | No `fetch.ts` anywhere under a `src/` root. |
| 16 | **Installing `sharp`/`satori` in Phase 1** | Nothing uses them yet, and `sharp` is a native module that can never run in `workerd`. | They are Phase 5 dependencies; Phase 1 installs neither. |

---

## Validation Architecture

**Framework:** `vitest` 5.0.5 · **Config:** `vitest.config.ts` at the repo root · **Quick run:** `npm test -- --run` · **Full suite:** `npm test -- --run` (the same command; Phase 1's suite is fast, < 30 s) · **Lint/type gate:** `npm run typecheck` (`tsc --noEmit`).

### Automatically verifiable in Phase 1 (no network, no account)

| # | Check | Command | Requirement |
|---|-------|---------|-------------|
| 1 | Excerpt budget contract: word cap, char cap, sentence cap, 30% share, 160-word floor, word-boundary cut, verbatim prefix | `npm test -- --run shared/contract/__tests__/excerpt-budget.test.ts` | PROJECT.md content model |
| 2 | Ceiling-registry integrity: JSON parses, every limit has `source_url` + `verified_on`, the decision rule names all three OPS-04 triggers, the loader deep-equals the JSON | `npm test -- --run shared/config/__tests__/free-tier-limits.test.ts` | OPS-01, OPS-04 |
| 3 | **Ceiling single-source scan + self-proof** (a deliberate stray literal IS detected) | same file as #2 | OPS-01, Phase 1 SC#1 |
| 4 | DDL applies to an empty local D1; 19 tables and 31 indexes exist; the four LSH band indexes and the partial editorial-rank index are present | `npm run db:verify:local` → `npx wrangler d1 migrations apply meridian --local` then a schema query | ROADMAP Phase 1 SC#2, D-20 |
| 5 | Repository module: db id read from configuration; **no `SELECT *`** in the module; the module is the only file importing a D1 binding | `npm test -- --run apps/worker/src/db/__tests__/repository.test.ts` | OPS-14 |
| 6 | Empty-database swap: repoint the db id, re-apply, re-seed — **no code change** | `npm run db:verify:swap` (a script that runs #4 against a second local db) | Phase 1 SC#2 |
| 7 | Astro config assertions: `compressHTML === true`, `build.concurrency === 1`, `experimental.incrementalBuild === true`, `output === 'static'`, no Cloudflare adapter | `npm test -- --run apps/site/__tests__/astro-config.test.ts` | AGENTS.md tech stack |
| 8 | Shared contract purity: no module under `shared/` imports from `astro/` or `workerd`; templates are pure functions returning strings | `npm test -- --run shared/__tests__/purity.test.ts` | CONTEXT.md Established Patterns |
| 9 | Site-name single source: `SITE_NAME === 'The Meridian'`; no other file in the repo contains the literal `'The Meridian'` outside `shared/config/site.ts` and the ADR | `npm test -- --run shared/config/__tests__/site.test.ts` | D-12 |
| 10 | `pageMeta()` self-referential canonical: the canonical never contains an external host | `npm test -- --run shared/templates/__tests__/head.test.ts` | canonical rule, D-14 |
| 11 | Shard matrix: 8 `wrangler.jsonc` shard configs exist, each declares a distinct locale prefix, each sets `not_found_handling: "none"`, and the union of the prefixes is exactly the 8 edition prefixes | `npm test -- --run scripts/__tests__/shards.test.ts` | D-06, MED-08 |
| 12 | R2 lifecycle rules (live): `npx wrangler r2 bucket lifecycle list <bucket>` shows only rules whose prefix is in `{raw/, media/}`, and **no rule has an empty prefix** | `npm run r2:lifecycle:verify` (a script that parses the CLI output and exits non-zero on violation) | MED-08, D-15, D-19, Phase 1 SC#3 |
| 13 | `npm run build` produces `apps/site/dist/index.html` with no Astro compiler error | `npm run build` | P1.1, P1.2 |
| 14 | The repo has exactly one `package.json` and no `workspaces` key; exactly one lockfile | `npm test -- --run scripts/__tests__/layout.test.ts` | D-20 |
| 15 | The repo has no file named `fetch.ts` under a `src/` root | same as #14 | P1.6 |
| 16 | The GitHub repository is **public** and lives under a personal account | `gh repo view --json visibility,owner` | D-02, D-03 |

### Requires the live Cloudflare account (manual / one-time, recorded in an ADR)

| # | Check | Command | Requirement |
|---|-------|---------|-------------|
| 17 | R2 bucket exists | `npx wrangler r2 bucket create meridian` | D-01 |
| 18 | Lifecycle rules: `raw/` 7 days, `media/` 365 days | `npx wrangler r2 bucket lifecycle add meridian expire-raw raw/ --expire-days 7` and `... meridian expire-media media/ --expire-days 365` | D-04, D-15 |
| 19 | Billing/budget alerts configured at 80% of each metered quota | Cloudflare Dashboard → Manage Account → Billing → Billable Usage → Budget Alerts (or the Notifications API) | D-04 |
| 20 | D1 database created and the id recorded as configuration | `npx wrangler d1 create meridian` | OPS-14 |
| 21 | 8 shard Workers projects created | `npx wrangler deploy --config wrangler/shards/shard-01.jsonc` × 8 | D-06 |

### Requires GitHub Actions
| # | Check | Requirement |
|---|-------|-------------|
| 22 | S-3 CI egress comparison | Phase 2 gate |

### Measured only (no pass/fail on a value, a decision on a threshold)
| # | Check | Requirement |
|---|-------|-------------|
| 23 | S-1 DO CPU · S-4 build throughput · S-5 upload diffing | Phase 2 / Phase 5 gates |

**Nyquist coverage:** Phase 1 Success Criterion #1 → checks 2 + 3. #2 → checks 4, 5, 6. #3 → check 12 (+ 11). #4 → check 2 (+ ADR). #5 → spikes 17–23 recorded in `spikes/RESULTS.md`.

---

## Architecture Decision Inputs (what the ADRs must record)

| ADR | File | Must state |
|-----|------|-----------|
| 0001 | `docs/adr/0001-delivery-model.md` | **8** sharded Workers Static Assets projects (D-06), NOT one project; the edition→shard route table; the edge Worker for `/story/*` and `/api/*`; CI builds (GitHub Actions, no deploy hook); no Cloudflare adapter; `not_found_handling: "none"`; the shard build-time splitter; why the research's "one project" was rejected (D-05 removes the paid escape hatch) |
| 0002 | `docs/adr/0002-d1-no-shard.md` | One D1 database, `meridian.db`, no edition sharding; cross-edition queries (cross-country flagging, one-story-many-editions, Most Covered) are the product; growth is controlled by the 90-day `is_prominent` flag, 30-day LSH-band pruning and a 60%-of-500 MB alert; the repository module + db-id-as-configuration pattern (OPS-14); the `sources` terms-of-use ledger columns added in Phase 1 |
| 0003 | `docs/adr/0003-image-permanence.md` | Uniform 12-month expiry, no exemptions (D-15); the silent typographic panel (D-16); serve-time resolution **and** the periodic sweep (D-17); the accepted one-extra-R2-Class-B-read cost (D-18); OG images and the bucket root are never expired (D-19) |
| 0004 | `docs/adr/0004-domain-and-name.md` | One site name "The Meridian" from one config value (D-12); edition identity in title + meta + h1 + masthead only (D-13); the domain is bought only after revenue (D-10) and the consequences accepted — Google News enrolment, Publisher Center verification, News Showcase and AdSense stay closed until it exists (D-11); migration by **301 redirects, never canonicals**, with the redirect map generated from the sitemap source (D-14) |
| 0005 | `docs/adr/0005-free-tier-ceiling-and-no-spend.md` | The free tier is a permanent hard ceiling (D-05); all three OPS-04 triggers named and the standing disposition "never purchase — shed load" with D-07's three mechanisms (D-08: the request ceiling is a permanent wall); Cloudflare budget alerts are **informational only** and do not cap spend — the lifecycle rules are the real cap; D-09's Open-Meteo non-commercial obligation |

---

## Open Questions and Required Decisions

| # | Question | Status | Resolution path |
|---|----------|--------|-----------------|
| 1 | Does the Astro project root sit at the repo root or at `apps/site/`? | **Decided in this research** | `apps/site/` — satisfies D-20 ("`apps/` holds the runtimes") and keeps `sharp`/`satori` in `scripts/` outside any `src/`. Requires `vite.server.fs.allow: ['../..']`. |
| 2 | Package manager? | **Decided in this research** | `npm` + `package-lock.json`. |
| 3 | D1 migration mechanism? | **Decided in this research** | `wrangler d1 migrations`, with `migrations_dir: "../../shared/db"`. |
| 4 | How is the "no ceiling read from anywhere else" test enforced? | **Decided in this research** | A vitest source scan over the `enforced` limits' tokens, with a mandatory self-proving step that demonstrates the scanner catches a deliberately planted literal. |
| 5 | What exactly is the excerpt-budget contract shape? | **Decided in this research** | `shared/contract/excerpt-budget.ts` — constants + Zod-validated result + `applyExcerptBudget` + `assertExcerptWithinBudget`; no per-source override. |
| 6 | Do Cloudflare Budget Alerts satisfy D-04's "80% of each metered quota"? | **Partially — recorded honestly** | Budget alerts are **spend-threshold** based, informational only, and processed daily. The percentage-of-quota mechanism (50%/75%) is the audit Worker's, in Phase 7 (OPS-03). The ADR states this rather than overclaiming. |
| 7 | Is there a real 80%-of-quota alert for R2 storage in Cloudflare's UI? | **Open — one-time dashboard check** | Phase 1's infra task configures the alerts and records what the dashboard actually exposes. If no percentage-of-quota alert exists for a given quota, the ADR records the audit Worker's percentage as the substitute. Not a blocker. |
| 8 | Which Cloudflare zone will host the 8 shard routes? | **Open — no domain yet (D-10)** | The shard configs carry a `zone_name` placeholder consumed from configuration, and Phase 1 deploys the shard projects to `workers.dev` subdomains. The zone routing is asserted by the route-table test, not by a live deploy, until a domain exists. |
| 9 | Do the 8 shards need the global surfaces duplicated into every shard? | **Decided in this research** | Yes — ~45 files × 8 = 360 files against a 160,000 budget. It removes every cross-project dependency from the static tier. |

---

## Sources

Every external claim in this document, with its URL and the date it was verified (**2026-10-20**):

**Cloudflare — R2 lifecycle**
- `wrangler r2 bucket lifecycle add|list|remove|set` — https://developers.cloudflare.com/workers/wrangler/commands/r2/ — verified 2026-10-20. Signature `add <BUCKET> [NAME] [PREFIX]`; *"Prefix condition for the lifecycle rule (leave empty for all prefixes)"*; flags `--expire-days`, `--expire-date`, `--ia-transition-days`, `--ia-transition-date`, `--abort-multipart-days`, `--jurisdiction`, `--force`.
- R2 object lifecycles — https://developers.cloudflare.com/r2/buckets/object-lifecycles/

**Cloudflare — D1**
- Migrations — https://developers.cloudflare.com/d1/reference/migrations/ — `migrations_dir`, `migrations_table` (default `d1_migrations`), `migrations_pattern`; applied migrations are tracked in the `d1_migrations` table.
- D1 and Prisma ORM (local/remote apply semantics) — https://developers.cloudflare.com/d1/tutorials/d1-and-prisma-orm/ — `--local` applies against a SQLite file in `.wrangler/state`.
- D1 limits — https://developers.cloudflare.com/d1/platform/limits/ · D1 pricing — https://developers.cloudflare.com/d1/platform/pricing/

**Cloudflare — Workers / Static Assets**
- Static assets — https://developers.cloudflare.com/workers/static-assets/ — routing behaviour: assets are served first without invoking Worker code; unmatched paths fall through to the Worker.
- Workers configuration reference — https://developers.cloudflare.com/workers/wrangler/configuration/ — `assets.directory`, `assets.binding`, `assets.not_found_handling` (`"single-page-application" | "404-page" | "none"`, default `"none"`), `assets.run_worker_first` (`boolean | string[]`), `assets.html_handling`.
- Worker script routing — https://developers.cloudflare.com/workers/static-assets/routing/worker-script/ — `run_worker_first` with glob and `!` exception patterns, ≤100 entries.
- Workers CLI reference — https://developers.cloudflare.com/workers/wrangler/commands/workers/ — `--routes`/`--route` (`--route example.com/*`), `--assets`, `--host`.
- Workers limits — https://developers.cloudflare.com/workers/platform/limits/ — 100,000 requests/day, 10 ms CPU per invocation, 50 subrequests, 5 cron triggers, 20,000 static asset files per project.
- Workers static assets billing — https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ — static asset requests are free and unlimited.

**Cloudflare — Billing**
- Budget alerts default on — https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/ — *"The alert is informational only. It does not cap your usage or impact your account in any way."* Usage is processed once per day for the prior day's activity; alerts fire the day after the threshold is reached. Budget alerts consider spend on usage-based products only.
- Budget alerts documentation — https://developers.cloudflare.com/billing/manage/budget-alerts/ — configured under Manage Account → Billing → Billable Usage.
- The `cf` CLI beta notice — https://developers.cloudflare.com/cf/wrangler/reference/ — *"Commands not yet supported: `cf` is in beta… Run `npx wrangler` instead of installing Wrangler."*

**Cloudflare — KV / R2 pricing**
- KV limits — https://developers.cloudflare.com/kv/platform/limits/ (1,000 writes/day to different keys) · R2 pricing — https://developers.cloudflare.com/r2/pricing/ (10 GB-month, 1M Class A, 10M Class B, free egress).

**Astro**
- Upgrade to Astro v7 — https://docs.astro.build/en/guides/upgrade-to/v7/ — `compressHTML` default changed `true` → `'jsx'`; Rust compiler is the only compiler (unclosed tags are errors; invalid nesting is not auto-corrected); `src/fetch.ts` is reserved; Sätteri is the default Markdown processor; Vite 8.
- Experimental incremental static builds — https://docs.astro.build/en/reference/experimental-flags/incremental-build/ — `experimental.incrementalBuild` added in `astro@7.2.0`; only `getStaticPaths()` results carrying a `cacheKey` can be skipped; the cache lives in `cacheDir`; `cacheDir` must be restored between CI builds; `astro build --force` re-renders everything; `build.concurrency > 1` disables the cache.
- Configuration reference — https://docs.astro.build/en/reference/configuration-reference/ — `compressHTML`, `cacheDir`, `build.concurrency`, `output`.

**Tailwind CSS**
- Install with Astro — https://tailwindcss.com/docs/installation/framework-guides/astro — `npm install tailwindcss @tailwindcss/vite`; add `tailwindcss()` to `vite.plugins`; `@import "tailwindcss";`.

**npm registry (versions verified 2026-10-20)**
`astro@7.4.1`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, `wrangler@4.151.3`, `vitest@5.0.5`, `zod@4.6.7`, `fast-xml-parser@5.11.2`, `sharp@0.35.5`, `satori@0.63.2`, `nanoid@6.0.2`, `p-limit@7.3.3`, `@astrojs/rss@4.0.19`, `@astrojs/sitemap@3.7.4`.

**Third-party**
- Brevo pricing — https://www.brevo.com/pricing/ — 300 emails/day on the free Starter plan. · Open-Meteo pricing — https://open-meteo.com/en/pricing — 10,000 calls/day, non-commercial only, CC BY 4.0. · GitHub Actions billing — https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions — 2,000 min/month private, unlimited public. · Google News sitemaps — https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap — ≤1,000 entries per file, 48-hour window.

**Internal (this repository)**
- `.planning/codebase/ARCHITECTURE.md` — architecture of record; supersedes `research/STACK.md` where they disagree. Note its "Stack Corrections" table still records the *research's* one-project conclusion, which D-06 supersedes.
- `.planning/research/SUMMARY.md` §6 — the consolidated free-tier limits table with headroom, used as the source for `config/free-tier-limits.json`.
- `.planning/research/ARCHITECTURE.md` §5 — the D1 DDL (19 tables, 31 indexes), the source for `shared/db/0001_init.sql`.
- `.planning/research/ARCHITECTURE.md` §5.1 — the index reasoning table.
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md` — D-01 … D-20, the authoritative locked decisions.
