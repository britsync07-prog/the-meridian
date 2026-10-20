# Phase 1: Foundation, Free-Tier Contract & Architecture Decisions - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock the delivery model, the shared data contract and the free-tier budget, and run the five architecture-changing spikes, before any feature code is written.

This phase delivers: the repo scaffold with one `package.json` and one lockfile; the shared type/schema layer; the D1 schema, migrations and seed; `config/free-tier-limits.json`; the D1 repository module; the R2 lifecycle rules; the delivery-model and D1-no-shard ADRs; the Astro config; the excerpt budget as a coded contract; and spikes S-1 through S-5.

Out of boundary: the ingest pipeline itself (Phase 2), the curation engine (Phase 3), the design system (Phase 4), the publication surface (Phase 5), the digest, trust layer and SEO surface (Phase 6), and operational hardening (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Accounts & access

- **D-01:** A Cloudflare account already exists with a payment method on file. The R2 bucket does not exist yet and is created in this phase. Card-on-file is accepted: R2 is a metered service with a free allowance, and without a card it suspends on overage rather than degrading.
- **D-02:** The GitHub repository is **public**. This removes the CI minutes ceiling entirely (public repos get unlimited GitHub Actions minutes; private is 2,000/month against a projected ~360/month need) and makes the curated source list and taxonomy public. The source list is already public RSS and the `/sources` page is a required deliverable, so this adds no new exposure.
- **D-03:** The repository lives under a **personal GitHub account**, not an organisation.
- **D-04:** R2 is protected from ever billing by: Cloudflare Billing alerts at 80% of each metered quota, plus lifecycle rules on the two growing prefixes — `raw/` expires after 7 days, `media/` after 12 months. The `og/` prefix and the site root are excluded from every lifecycle rule and never expire.

### Budget ceiling — the free tier is a permanent design constraint

- **D-05:** The free tier is a **hard ceiling, permanently**. The project never buys Workers Paid ($5/month) or any other paid tier — **not even once the site earns revenue**. Revenue is not a licence to spend on infrastructure.
- **D-06:** Because there is no paid escape hatch, the static shard is **mandatory infrastructure, built in this phase, not deferred**. The deploy target is 8 sharded Workers projects (160,000 static files total, ~3.6 years of story pages at 120 stories/day) rather than the single project the research settled on.
- **D-07:** When traffic outgrows the request ceiling, the site sheds load by **all three** mechanisms together: promoting hot stories into the static tier (served free, unlimited requests), edge-caching the story tier hard, and sharding the static tier across the 8 projects. The story tier may never be the only tier.
- **D-08:** The request ceiling is a **permanent traffic wall**, not a tripwire. At ~5,000-7,000 daily visitors against a 1,000-visitor target, there is roughly 5x headroom, but crossing it requires the static promotion path, not a spend decision.
- **D-09:** Open-Meteo's free tier is restricted to non-commercial use. Rather than budget its paid tier at monetization, the project **sources a free, commercially-usable weather replacement**. Open-Meteo serves v1 unchanged; the replacement is a later research task (see Deferred Ideas).

### Domain and masthead name

- **D-10:** The domain is bought **only after the site earns revenue** — explicitly after launch, not before it. The project builds and runs on a `workers.dev` subdomain until then.
- **D-11:** Consequence, accepted: **Google News enrolment, Publisher Center URL verification, the News Showcase panel and the AdSense path all stay closed until the domain exists.** Publisher Center requires a DNS TXT record on a domain the project controls, which a `workers.dev` subdomain cannot provide. Do not plan Phase 6 as if these can be completed on the subdomain.
- **D-12:** The site name is **"The Meridian", locked now**. It goes into `<news:name>`, the masthead, the Open Graph template and the repository name as a single config value, so it can never diverge. The research identified the `news:name` string as the single highest-impact string in the project — a mismatch against `news.google.com` silently kills Google News inclusion.
- **D-13:** All seven editions share **one** site name. Edition identity appears in the `<title>` and in the meta description (country keyword present in the snippet as well as the title), plus the `<h1>` and the visible masthead. Per-edition site names are not possible: Google supports one site name per domain and not at the subdirectory level.
- **D-14:** The domain migration to the custom domain happens with **301 redirects**, never canonicals, and the redirect map must be generated from the same source as the sitemap so the two can never drift. The sitemap and hreflang sets are re-verified afterwards.

### Image permanence

- **D-15:** Story images expire after **12 months, uniformly, with no exemptions**. Every media object runs the same clock. There is no curated permanent set and no second rule to reason about.
- **D-16:** An expired image renders a **silent typographic panel** in its place, carrying the headline's opening words. It reads as a deliberate design element, not an error. No "image archived" caption, no visible system explanation.
- **D-17:** The fallback is applied by **both** mechanisms: resolution at serve time (the image URL resolves through the edge, checks R2, and returns the typographic panel when the object is gone) **and** a periodic sweep that re-renders permanently-affected story pages so the common case never pays a lookup.
- **D-18:** The serve-time check costs one extra R2 Class B read per image view, which is well inside the 10M/month free allowance. This is the accepted cost of the mechanism.
- **D-19:** Open Graph images never expire and are therefore unaffected by the 12-month media rule. They are excluded from every lifecycle rule alongside the site root.

### Repository layout — carried forward, reconciled

- **D-20:** The repo is **one `package.json`, one lockfile, no workspace protocol.** This is carried forward from the research and is not re-litigated. The `shared/` directory holds the contract imported by both runtimes; `apps/` holds the runtimes; build-time Node scripts live outside `src/` so `sharp` and `satori` never enter an edge bundle.

### OpenCode's Discretion

- The exact directory names under `apps/` and `shared/`, the `tsconfig.json` path-alias strategy, and the choice of package manager and lockfile format.
- The D1 migration mechanism (`wrangler d1 migrations` versus a custom SQL runner) and the seed strategy.
- The D1 repository module's public API shape and its query-builder or ORM-free approach.
- The ADR file format and naming convention, and where under the repo the ADRs live.
- Whether the excerpt budget is expressed as constants, a Zod schema, or a config-driven value, and whether any per-source override is supported.
- The exact shape of `config/free-tier-limits.json` beyond the mandated per-limit source URL and verification date.
- The typographic fallback panel's visual specifics, provided it stays within the Phase 4 design system and reads as deliberate.

</decisions>

<specifics>
## Specific Ideas

- **"The Meridian"** — a longitude line running through every timezone the site covers. Global and newspaper-appropriate, and it does not name a country, which matters for a seven-country publication sharing one site name.
- The typographic fallback should read like a **classified ad or pull-quote** rather than a placeholder — the visual language of a printed paper, not a web app's missing-image state.
- The R2 safety model is **alerts plus lifecycle rules on the two growing prefixes**, rather than trusting the audit Worker alone to catch an overage after the fact.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture of record — read these first
- `.planning/codebase/ARCHITECTURE.md` — **The reconciled architecture.** Component boundaries, the three storage tiers, the data-flow table, the D1 model, the routing table, the three canonical rules, the excerpt budget, the free-tier budget and the stack corrections. This file supersedes `research/STACK.md` wherever the two disagree.
- `.planning/research/SUMMARY.md` — The reconciliation log. Records the seven conflicts between the four research documents and the definitive decision for each. Section 6 is the consolidated free-tier limits table with headroom. Section 3 is the exact hreflang specification.
- `.planning/research/STACK.md` — Verified package versions, free-tier ceilings with source URLs, Astro 7 gotchas, the RSS parsing and deduplication comparisons. **Read section "Stack Corrections" in `.planning/codebase/ARCHITECTURE.md` first — this file's 8-project split, 90-day lifecycle and Brevo allowance are superseded.**
- `.planning/research/ARCHITECTURE.md` §3 and §5 — The recommended project structure and the full D1 DDL (19 tables, 31 indexes, validated against SQLite). **§3 is pre-reconciliation and needs updating: it describes a Worker doing ingest + enrich + score + digest, a Pages `functions/` directory with `_routes.json`, and a single static project. All three are superseded by D-06, D-20 and the reconciled delivery model.**

### Requirements and constraints
- `.planning/REQUIREMENTS.md` — The 141 v1 requirements with REQ-IDs. Phase 1 owns OPS-01, OPS-04, OPS-14 and MED-08. The Traceability section maps every requirement to its phase.
- `.planning/PROJECT.md` — Core Value, the Out of Scope list with reasoning, and the Constraints block. The Constraints section carries the excerpt budget, the D1 topology rule, the storage-growth rule and the story-URL permanence rule.

### Feature and pitfall research
- `.planning/research/FEATURES.md` — Table stakes versus differentiators versus anti-features, plus the E-E-A-T feature set that makes Phase 6 possible.
- `.planning/research/PITFALLS.md` — The 17 severity-tagged pitfalls with phase mapping and warning signs. Read this before choosing any implementation that touches feed handling, quotas or canonicalisation.

### Spikes
- `.planning/ROADMAP.md` § Research Spikes — The canonical definition, budget, executing phase and decision rule for S-1 through S-7.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

None. This is a greenfield repository with no source code. The reusable assets are **planning documents**, and they are listed under Canonical References above.

### Established Patterns

- **Single contract, two runtimes.** `shared/` is a directory, not a package — no `workspace:*` resolution, no build step, no publish. Both the edge runtime and the CI/build runtime resolve it. Within edge Functions, `shared/` is imported by **relative path**, never by a TypeScript path alias, because that bundler's alias resolution is the least predictable part of the build.
- **Pure string builders for anything rendered in more than one place.** The shared layout lives as framework-free functions returning HTML strings. Astro components cannot be rendered inside an edge Function, so the shared surface must not depend on the framework. This is what guarantees a dynamically served story page looks identical to a statically served section page.
- **Build-time scripts live outside `src/`.** They are not part of any edge bundle and must never ship to the edge. `sharp` is a native module and cannot run in `workerd` at all.
- **No `SELECT *` on any table.** D1 bills rows *scanned*, not rows returned, so every filter that gets queried needs an index.

### Integration Points

- **`shared/types.ts`, `shared/sections.ts`, `shared/taxonomy.ts`** — imported by both the Worker and the Astro site. This is where the story schema must be defined once so it cannot drift between the two.
- **`shared/db/*.sql`** — the DDL, indexes and reference seed. The same file is the source for local SQLite validation and for the CI migration step.
- **`shared/templates/*`** — the pure functions that produce the `<html>` shell, the story body partial, the section listing partial, and the meta plus JSON-LD builders. `head.ts` is where `pageMeta()` lives, which is the single source of truth for title, description, self-referential canonical, hreflang set and sitemap entry.
- **`config/free-tier-limits.json`** — read by the audit Worker and by the paid-plan decision rule. Both live in the same versioned file so the rule and the budget cannot drift.
- **`astro.config.mjs`** — `compressHTML: true`, `experimental.incrementalBuild: true`, `build.concurrency: 1`. The `compressHTML` default of `'jsx'` in Astro 7 strips whitespace between inline elements and would silently eat spaces in broadsheet headlines.
- **The 8 sharded Workers projects** (D-06) — the deploy target. The route table must distribute edition prefixes across them so that every locale path prefix resolves to exactly one project.

</code_context>

<deferred>
## Deferred Ideas

- **Source a free, commercially-usable weather provider to replace Open-Meteo.** Open-Meteo's free tier is non-commercial only, and D-09 rules out paying for its paid tier. The replacement is needed before the site monetizes. This is a Phase 7 research task with a hard deadline of "before any revenue exists", because the moment revenue appears the current provider's terms stop covering the site.
- **The custom domain purchase itself.** Deferred past launch by D-10. When it happens it needs: the purchase, the 301 redirect map generated from the sitemap source, the Search Console property for the new domain, Publisher Center DNS TXT verification, and re-verification of the sitemap and hreflang sets.

</deferred>

---

*Phase: 1-foundation-free-tier-contract-architecture-decisions*
*Context gathered: 2026-10-20*
