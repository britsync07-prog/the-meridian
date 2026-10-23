# ADR 0002 — One D1 database, no edition sharding

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
- **Requirement:** OPS-14 — "All datastore access goes through one repository module with the database identifier held as a configuration value"
- **Supersedes:** the sharding recommendation in `.planning/research/PITFALLS.md` (see *Overrides* below)

---

## Context

D1 is the system of record for the whole publication: eight editions, every story,
the outlet registry, the taxonomy, the digests, the media metadata and the
operational logs. Two facts about D1 decide its shape.

**First: D1 bills the rows a query scans, not the rows it returns.** A star
projection over a table with 44,000 rows costs 44,000 rows read whether it
returns one row or all of them. Every filtered column therefore needs an index,
and the index set is a load-bearing part of the schema rather than a
performance nicety. Without the four 16-bit LSH band indexes on `stories`, the
clusterer scans the whole story table on every incoming item and breaches the
5M rows/day read budget on its first busy day.

**Second: the Free plan caps a single database at 500 MB, and there are ten
databases per account.** The Free plan also stops accepting writes to a full
database, so the cap is not a slowdown — it is a hard wall.

The research corpus disagrees about what to do about that wall.
`research/PITFALLS.md` says, in an anti-pattern table, *"Single D1 database for
all editions … **Never.** Shard from day one (7 editions = 7 DBs; 10 allowed
on Free)"*. `research/SUMMARY.md` §6(b) reaches the opposite conclusion from
the same numbers.

This ADR settles it.

## Decision

**ONE D1 database, named `meridian`, holding every edition. NO edition-based
sharding.**

The database identifier is a **configuration value**, not a constant in the
code. It lives in the `d1_databases` binding of `apps/worker/wrangler.jsonc`,
and every query in the project reaches the datastore through exactly one
module: `apps/worker/src/db/repository.ts`.

### Rationale

**The cap is not close.** Measured growth is ~70 MB/year (research
`ARCHITECTURE.md` §5.2: ~42 MB/year of story rows and indexes, ~25 MB/year of
cluster, topic, entity, digest and image rows). Against a 500 MB per-database
limit that is roughly **seven years** of headroom; against the 5 GB account
limit, roughly seventy. The Free plan permits ten databases, so the database
*count* is not binding either. Sharding would buy seven years of headroom at
the cost of breaking the product's core queries.

**Sharding destroys the queries the product is built on.** A story covered by
BBC, the New York Times and CBC appears in the UK, US and Canadian editions.
Under edition sharding it would live in three databases. Every one of these
becomes a cross-database query, and none of them can be a join:

| Product behaviour | Query it needs | Under edition sharding |
|---|---|---|
| Cross-country flagging | which editions carry this cluster | three lookups plus a union |
| One story, many editions | one canonical page, linked from three front pages | three rows to merge, with a risk of divergence |
| Most Covered | rank every story by coverage volume across all editions | a fan-out query over every shard |
| The edition front page | prominent clusters of one edition, newest first | one shard — the one case that still works |

Sharding does not make the first three cheaper. It makes them *distributed*,
which is the expensive kind of cheap: every cross-edition query becomes a
fan-out, a merge and a consistency question, and the "one canonical story page
per cluster" rule — a canonical rule of the publication, not just an
implementation detail — becomes hard to keep true.

**"Retrofitting sharding later is painful" is answered structurally, not by
sharding now.** The pain in a retrofit comes from SQL scattered across a
codebase: each query has to be found, understood and rewritten. This project
answers that pain with the repository module. All D1 access goes through
`apps/worker/src/db/repository.ts`, the identifier is a configuration value,
and the repository's public surface is seven typed methods. If sharding ever
becomes necessary — and the trigger for revisiting is an alert at 60% of the
500 MB limit, not a hunch — it is a **routing change**, not a rewrite: the
repository gains a router, and the seven methods keep their signatures.

**The proof is executable.** `scripts/db/verify-swap.mjs` repoints the
`d1_databases` binding at a different database identifier, deletes the local
state so the target is genuinely empty, applies the migrations, seeds it, and
asserts that the 8 editions and the 30-outlet registry are there — and that
every other file in the repository is byte-identical afterwards, with
`apps/worker/wrangler.jsonc` restored byte-for-byte. That is
"pointing that identifier at an empty database and running the migration
succeeds with no code change", run as a test rather than asserted in prose.

### Growth controls

Sharding is not the growth strategy. These are:

1. **The 90-day `is_prominent` flag.** A flag, never a deletion.
   `clusters.published_at` never changes and `clusters.slug` is immutable, so a
   story's URL resolves forever. Non-prominent clusters stay addressable at
   their permanent URL, remain in date archives and topic/entity pages, and
   remain in the sitemap.
2. **Pruning raw `stories` rows after 30 days.** The merge window is 48 hours,
   so raw dedup evidence is dead weight after 30 days. `story_sources` is
   permanent under `(cluster_id, source_id)`, retaining the outlet list,
   headline, URL, publication time and display rank after the raw mention and
   its topic, entity and image children are deleted. `npm run db:verify:local`
   executes that prune proof.
3. **An alert at 60% of the 500 MB database limit.** The audit Worker (Phase 7)
   reads `config/free-tier-limits.json` and writes its observations to the
   `usage_log` table. This is the trigger that reopens this ADR.

### Index amplification

Cloudflare counts an indexed column as an additional written row when a write
includes it. An `INSERT` into `stories` with five indexes therefore counts as
six physical rows written. **Write budgets are computed on physical rows, not
logical rows.**

The `stories` table carries seven explicit indexes — the cluster index, the
four LSH band indexes, `(source_id, published_at DESC)` and
`(published_at DESC)` — plus the implicit index behind its
`UNIQUE (source_id, external_guid)` constraint. One raw mention therefore
costs roughly nine physical writes: the row itself and eight index entries.
Against the 100,000 rows/day budget that is ~9,000 writes/day at the
projected ingest rate of ~1,200 mentions/day, so the budget is comfortable —
but it is a budget, and it is counted in physical rows.

### The schema deviations made in Phase 1

Phase 1 owns the schema; later phases own the behaviour. Shipping a schema
that cannot express a later phase's requirement would force an avoidable
migration, so the deviations are made here and recorded here.

| Deviation | Why |
|---|---|
| `sources.terms_status`, `sources.terms_verified_at`, `sources.terms_url` | ROADMAP Phase 2 requires a terms-of-use verification ledger on the registry record, and REQUIREMENTS ING-04 requires the verification date on that record. The terms of use are a launch-blocking legal gate, and Phase 2 must be able to refuse to fetch a feed whose terms are unverified. Every seeded source starts at `terms_status = 'unverified'`, and `scripts/db/verify-local.mjs` fails if any seeded row is not. |
| `sources.freshness_sla_hours` | The reconciled D1 model lists the freshness SLA on the registry record itself. |
| `story_sources.headline`, `story_sources.url` | `stories` rows are pruned 30 days after the merge window closes, but the outlet list, the headline and the attribution URL are retained permanently. They therefore live on the join table, not only on the raw mention row. |
| `edition_clusters.published_at` | The edition index sorts on it: the edition front page must be an index scan, not a sort of every cluster the edition carries. |
| `usage_log` | The reconciled D1 model lists it: daily free-tier accounting, read by the audit Worker. |
| `corrections` | OPS-23: a reader reports a factual error and the report enters a corrections queue that produces a dated correction note. Phase 7 needs the table to exist; adding it in Phase 1 avoids a migration later. |
| `idx_edition_clusters_edition` on `(edition_id, published_at)` | The edition front page's exact access path. |

The result is **19 tables and 32 named indexes**. The research DDL carries 17
tables and 31 indexes; the difference is the six additions above plus the
index that the phase's own access-path requirement needs.

## Consequences

### Positive

- The cross-edition queries — cross-country flagging, one story in many
  editions, Most Covered — stay ordinary joins. This is the single most
  important consequence, and it is why the decision is not revisited lightly.
- One migration path, one repository surface, one query surface to audit.
- Seven years of headroom on the database limit and seventy on the account
  limit, with a defined trigger for revisiting rather than a hunch.
- The repository module makes the *structure* of a future sharding migration
  cheap, which is the only form of "cheap retrofit" that is actually cheap.

### Negative — accepted

- The 500 MB per-database cap becomes a hard wall that, if reached, stops
  writes. Mitigated by the three growth controls and by the 60% alert, but not
  eliminated.
- A single database is a single point of failure for writes. Mitigated by D1's
  7-day Time Travel and by the fact that the previous edition stays live if a
  build fails.
- The database id must be managed. Two places hold it — the
  `d1_databases` binding and the `MERIDIAN_DB_ID` override — and the override
  is only a reporting convenience. The binding is authoritative; the
  `verify-swap` script proves the two can be moved together with no code
  change.

### Neutral

- The database identifier is not a secret and is committed in
  `apps/worker/wrangler.jsonc`. It grants no access on its own; reading or
  writing still requires an account credential. `.dev.vars` stays gitignored
  and `.dev.vars.example` holds only this non-secret id.

## Overrides

This ADR **overrides** two statements in the research corpus:

- `research/SUMMARY.md` §6(b) — *"D1 sharding: the research conflicts, and the
  numbers favour NOT sharding … Decision: one D1 database (`meridian.db`), no
  edition sharding."* §6(b) already reached this conclusion; this ADR makes it
  binding and records why.
- `research/PITFALLS.md` — the anti-pattern entry *"Single D1 database for all
  editions … **Never.** Shard from day one"*, and the recommendation at
  PITFALLS §5, *"Shard D1 deliberately: 7–10 databases, one per edition"*.

**The reason for overriding:** PITFALLS.md reasons from the 500 MB cap alone,
and that reasoning does not survive contact with the measured growth rate
(~70 MB/year, not a runaway) or with the shape of the product (three of its
core behaviours are cross-edition queries). PITFALLS.md's own remedy — shard
from day one so the retrofit is not painful — is better addressed by the
repository module, which removes the retrofit's actual cost.

`research/ARCHITECTURE.md` §5 remains the source of the DDL. This ADR governs
the topology, not the table definitions.

## Verification

| Claim | How it is checked |
|---|---|
| The schema applies to an empty database and prune preserves attribution | `node scripts/db/verify-local.mjs` — deletes `.wrangler/state`, applies every numbered migration, asserts 19 tables and 32 named indexes, then deletes a populated raw mention and proves its permanent attribution survives |
| The seed is complete and no source is pre-verified | the same script — 8 editions, 8 sections, 64 edition-sections rows, 30 sources, zero sources with `terms_status <> 'unverified'` |
| The identifier is a configuration value | `node scripts/db/verify-swap.mjs` — repoints the binding, rebuilds from nothing, restores the file byte-for-byte, and hashes `apps/worker/src` and `shared` before and after |
| All SQL lives in one module | `apps/worker/src/db/__tests__/repository.test.ts` — a repository-wide scan for SQL keywords outside `apps/worker/src/db/repository.ts` |

## References

- `.planning/codebase/ARCHITECTURE.md` — the reconciled architecture (the D1
  model, the growth controls, the canonical rules)
- `.planning/research/ARCHITECTURE.md` §5 — the DDL this ADR's schema is
  transcribed from
- `.planning/research/SUMMARY.md` §6(b) — the reconciliation that reached the
  same conclusion
- `.planning/research/PITFALLS.md` §5 and the anti-pattern table — the
  recommendation this ADR overrides
- `.planning/REQUIREMENTS.md` OPS-14, OPS-23, ING-04
- `scripts/db/verify-local.mjs`, `scripts/db/verify-swap.mjs`
