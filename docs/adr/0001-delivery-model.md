# ADR 0001 — The delivery model: eight static shards, one edge Worker, R2 story tier

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
- **Requirements:** OPS-09, OPS-12, PUB-12, ING-02
- **Locked decisions:** D-02, D-05, D-06, D-07, D-08, D-10, D-19
- **Supersedes:** the single-project delivery model in `.planning/research/SUMMARY.md` §1 and `.planning/codebase/ARCHITECTURE.md` (see *Overrides* below)

---

## Context

The Meridian publishes a separate broadsheet edition for seven countries, plus
a Hindi edition of the India paper, from one hostname. It fetches raw feed
bytes from roughly fifty publishers, deduplicates them across outlets, ranks
them by coverage and recency, and publishes each surviving story on its own
permanent URL with a headline, an excerpt, topic tags and attribution back to
the original publisher.

Three facts decide the shape of the delivery model, and none of them are
negotiable.

**First: the free tier is a hard ceiling, permanently (D-05).** The project
never buys Workers Paid ($5/month) or any other paid tier — **not even after
the site earns revenue**. Revenue is not a licence to spend on infrastructure.
The Workers request ceiling is therefore a **permanent traffic wall** (D-08),
not a tripwire that a purchase resolves. Roughly five times the headroom
exists against the traffic target, but crossing the ceiling requires an
engineering response, not a budget decision.

**Second: the static asset file cap is per project, and the story tier grows
without bound.** A story URL resolves forever — that is the product's central
promise — so story pages cannot be deleted, and a site publishing 120 stories a
day accumulates them indefinitely. Inside the static tier that growth would
consume a single project's file allowance inside the six-month success
window. Eight projects multiply the allowance eightfold.

**Third: the build and the transform run in CI, not at the edge.** The Free
plan gives a Cron Trigger ten milliseconds of CPU per invocation, and one
realistic feed parse measures 9.45 ms. Parsing feeds inside the Worker would
sit directly on that ceiling; fetching raw bytes and transforming them in CI
puts the whole pipeline where the CPU is.

The research corpus reached a delivery model. **It reached the wrong one for
the static tier**, and this ADR is where that is settled.

---

## Decision

### The static tier is EIGHT sharded Workers Static Assets projects, not one

The route table is `wrangler/shards/route-table.json`. Each shard owns
exactly one locale prefix, and the global surfaces are duplicated into every
shard's output directory.

| Shard | Project | Locale prefix | Zone route |
|-------|---------|---------------|------------|
| 01 | `meridian-static-uk` | `/uk/` | `<zone>/uk/*` |
| 02 | `meridian-static-us` | `/us/` | `<zone>/us/*` |
| 03 | `meridian-static-au` | `/au/` | `<zone>/au/*` |
| 04 | `meridian-static-ca` | `/ca/` | `<zone>/ca/*` |
| 05 | `meridian-static-ie` | `/ie/` | `<zone>/ie/*` |
| 06 | `meridian-static-nz` | `/nz/` | `<zone>/nz/*` |
| 07 | `meridian-static-in` | `/in/` | `<zone>/in/*` |
| 08 | `meridian-static-in-hi` | `/in-hi/` | `<zone>/in-hi/*` |

**The global surfaces** — the edition picker at `/`, `/topic/*`, `/entity/*`,
`/sitemap*`, `/rss/*`, `/robots.txt`, the fonts and the CSS — are **duplicated
into every shard's output directory**, so whichever project's route receives a
request, the file is already present there. That costs a few dozen files per
shard and removes every cross-project dependency from the static tier: a
request that has to be fetched from another project is a request that can
fail.

Each shard is an **assets-only** project: no `main` key, no Worker code. Each
sets `not_found_handling: "none"` — `"404-page"` would make the asset layer
answer unmatched paths *before* the Worker script sees them, swallowing
`/story/*` and `/api/*` — and `html_handling: "force-trailing-slash"`.

The eight projects are **built in this phase**, not deferred. D-06 makes the
shard mandatory infrastructure. The route table, the eight configurations, the
build-time splitter (`scripts/shards/split-output.mjs`) and the deploy script
(`scripts/shards/deploy-all.mjs`) all land here.

### The tier split (OPS-12)

The **static tier** holds only:

- edition front pages,
- section pages,
- dated archives,
- Most Covered pages,
- topic and entity pages,
- support files (fonts, CSS, RSS, sitemaps, `robots.txt`).

**Story pages are not in the static tier.** They are pre-rendered to R2 and
served by the edge Worker at `/story/*`.

**The build never opens a datastore binding.** It reads exactly one gzipped
JSON snapshot object from R2. That is the build's data contract: the whole
dataset arrives as a single object, so a build cannot issue a query per page
and cannot accidentally bill rows against the D1 read allowance.

### The edge Worker

One project with **both** `assets` and `main`:

- `not_found_handling: "none"`,
- `run_worker_first` covering `/story/*` and `/api/*`,
- static asset requests are **free and unlimited**, so the static tier costs
  **zero** Worker requests. The story tier is the only tier that spends the
  request allowance.

### CI builds (OPS-09)

**GitHub Actions, on a fixed schedule.** Never a deploy hook: the deploy-hook
URL is itself the credential, and a build service's job timeout does not apply
to GitHub Actions. The repository is **public** (D-02), so GitHub Actions
minutes are unlimited.

### No Cloudflare adapter

Astro 6+ removed Pages support from the official Cloudflare adapter. The site
is **pure static output**, deployed with `wrangler deploy`.

### The fetch Worker parses nothing (ING-02)

**The fetch Worker performs no parsing, no normalization and no scoring. All
transformation happens in CI.**

The reason is arithmetic: the Free plan allows ten milliseconds of CPU per
cron invocation, and one realistic feed parse measures 9.45 ms. A parse inside
the Worker sits on that ceiling before it does anything else. The Worker
fetches raw bytes and writes them to R2; CI reads the raw bytes, parses,
normalizes, deduplicates, enriches, scores and renders.

### One hostname, locale path prefixes, never subdomains (PUB-12)

**All seven editions and the Hindi edition live under locale path prefixes on
ONE hostname.**

The reasons are specific:

- **Seven crawl budgets would mean seven independent budgets for a new
  domain.** A brand-new site needs every scrapable page it can get.
- **Google supports one site name per domain**, and the site name is locked
  (D-12). Seven subdomains would each need their own site name, and the
  News Showcase panel and Publisher Center enrolment work at the domain level.
- **Subdomain splitting carries policy-circumvention optics.** A publication
  that runs its seven editions on separate hosts invites the reading that it
  is running several sites rather than one.

### The load-shedding path (D-07)

When traffic outgrows the request ceiling, the site sheds load by **all three**
mechanisms together:

1. **Promoting hot stories into the static tier**, where they are served free
   and unlimited.
2. **Edge-caching the story tier hard.**
3. **Sharding the static tier across the eight projects.**

**The story tier may never be the only tier.**

---

## Overrides

**This ADR overrides `.planning/research/SUMMARY.md` section 1 and
`.planning/codebase/ARCHITECTURE.md`, which both describe a single static
project.** The user's locked decision D-06 supersedes them, because D-05
removes the paid escape hatch entirely, which makes the Workers request
ceiling a permanent wall (D-08) and the static shard mandatory infrastructure
rather than an optimisation.

The research reached the single-project conclusion from a reasonable premise:
the Paid plan's file allowance would have made one project sufficient. That
premise no longer holds, because the Paid plan is forbidden. The conclusion
does not survive the removal of its premise, and the shard is the direct
consequence of that removal.

`research/ARCHITECTURE.md` §3 and §5 remain the source of the D1 DDL and the
general component boundaries. This ADR governs the delivery model, not the
schema.

---

## Consequences

### Positive

- **Eight deploys per build.** That is the price, and it is paid
  deliberately.
- **The splitter and the route table exist for exactly this reason.** One
  Astro build, eight output directories, one deploy script. The matrix is
  **asserted by a test** (`scripts/shards/__tests__/shards.test.ts`), not by
  convention — the prefixes are exactly the eight edition prefixes, no two
  shards claim the same one, and every shard sets `not_found_handling: "none"`.
- **The global surfaces are duplicated deliberately.** The duplication is
  visible in the file counts, and it is the reason no request depends on
  another project.
- **The static tier costs zero Worker requests.** Static asset requests are
  free and unlimited, so the request allowance is spent only where it must be.
- **A failed deploy does not blank the site.** A shard that fails to deploy
  keeps its previous version live.

### Negative — accepted

- **Eight projects to manage, and eight deploys per build.** CI minutes are
  unlimited on a public repository (D-02), so the cost is wall time, not
  money.
- **The route table is a second source of truth** alongside the eight config
  files. The test asserts the two agree, so a divergence fails the build.
- **A shard's zone route cannot attach until a domain exists (D-10).** The
  shards deploy to their `workers.dev` subdomains and the zone routes attach
  when the domain is bought. The deploy script reports a pending route rather
  than a failure, because the shard itself deployed correctly.

### Neutral

- **The build reads one snapshot object, not a database.** This is a
  constraint on the build pipeline, not a preference: it makes a build
  impossible to bill against the D1 read allowance.

---

## Rejected alternatives

| Alternative | Why it was rejected | The condition under which it becomes correct |
|-------------|--------------------|-----------------------------------------------|
| **One static project** | Its per-project file allowance is exhausted inside the six-month success window, because story pages accumulate and story URLs are permanent. | **Only if a paid tier is ever bought** — which D-05 forbids permanently, not even after revenue. |
| **Cloudflare Pages** | Adds a monthly build ceiling and a shorter job timeout for no gain. Astro 6+ also removed Pages support from the official adapter, so Pages means deploying by hand rather than by adapter. | Only if the domain's nameservers cannot be Cloudflare-managed — Workers custom domains require Cloudflare-managed nameservers, while Pages custom domains do not. |
| **Pure static with story pages included** | Breaks the per-project file cap inside the success window, and a story page that cannot be served cannot be ranked. | Only if the story volume stays below the cap indefinitely, which it does not: 120 stories a day, forever. |
| **Live rendering of story pages from D1** | Puts single-threaded D1 on the hot read path of every story view, and forces a second rendering implementation — which produces visual drift between the static and dynamic tiers. | Only if the story tier becomes the only tier, which D-07 forbids. |

---

## Verification

| Claim | How it is checked |
|-------|-------------------|
| The static tier is eight projects | `scripts/shards/__tests__/shards.test.ts` — exactly eight `shard-NN-*.jsonc` files, eight unique project names, eight unique route patterns |
| Every locale prefix resolves to exactly one shard | The same test — the union of the prefixes equals exactly the eight edition prefixes, and no two shards claim the same one |
| No shard can swallow `/story/*` or `/api/*` | The same test — every shard sets `assets.not_found_handling` to `"none"`, and no shard declares a `main` key |
| One build becomes eight shard directories | `node scripts/shards/split-output.mjs` — creates eight directories and prints a per-shard file count table |
| No shard bypasses the budget registry | The same test — a scan of `wrangler/`, `scripts/shards/` and `scripts/cloudflare/` for every enforced ceiling literal |
| The shards deploy | `node scripts/shards/deploy-all.mjs` — deploys each shard in order and names the one that failed |
| The fetch Worker parses nothing | The absence of any parsing, normalising or scoring code in the Worker; all transformation is in CI |
| One hostname, locale path prefixes | The route table — every route pattern is `<zone>/<locale>/*`, and no project is addressed by subdomain |

---

## References

- `config/free-tier-limits.json` — the ceiling registry, and the
  `paid_plan_decision_rule` that records D-05's standing disposition.
- `wrangler/shards/route-table.json` — the eight-shard route table.
- `wrangler/shards/shard-01-uk.jsonc` … `shard-08-in-hi.jsonc` — the eight
  assets-only shard configurations.
- `scripts/shards/split-output.mjs` — the build-time splitter.
- `scripts/shards/deploy-all.mjs` — the deploy script.
- `scripts/shards/__tests__/shards.test.ts` — the shard matrix assertions.
- `scripts/cloudflare/r2-lifecycle.mjs`, `scripts/cloudflare/verify-lifecycle.mjs`
  — the R2 lifecycle rules and their live proof.
- `scripts/cloudflare/billing-alerts.md` — the billing alert configuration
  record, and the honest limits of what an alert can do.
- `docs/adr/0002-d1-no-shard.md` — the datastore topology decision.
- `docs/adr/0005-free-tier-ceiling-and-no-spend.md` — the standing no-spend
  decision.
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md`
  — D-02, D-05, D-06, D-07, D-08, D-10, D-19.
- `.planning/REQUIREMENTS.md` — OPS-09, OPS-12, PUB-12, ING-02.
- `.planning/research/SUMMARY.md` §1 and §6 — the reconciliation this ADR
  overrides, and the consolidated free-tier limits table.
- `.planning/codebase/ARCHITECTURE.md` — the reconciled architecture, whose
  single-project static tier this ADR supersedes.
