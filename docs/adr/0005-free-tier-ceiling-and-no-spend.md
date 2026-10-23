# ADR 0005 — The free tier is a permanent ceiling, and the project never spends

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
- **Requirements:** OPS-01, OPS-04
- **Decisions:** D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-18

---

## Context

The free tier is not a budget with an escape hatch. It is the project's
**design constraint**, and every ceiling it imposes has to be known, sourced and
dated before the code that depends on it is written.

The reconciled ceilings live in `config/free-tier-limits.json` (OPS-01). Every
row carries the value, the unit, the period it is measured over, the URL it was
read from and the date it was verified. Eighteen ceilings are recorded. A
ceiling marked `enforcement: enforced` has a value distinctive enough to be
searched for as a stray literal in executable source and deployment
configuration, and `shared/config/__tests__/free-tier-limits.test.ts` proves
that no executable path or deployment setting reads one from anywhere else.
Planning and research prose is documentary evidence rather than part of this
numeric gate. A ceiling marked `informational` is still
recorded, still readable through `shared/config/free-tier-limits.ts` and still
measured by the Phase 7 audit Worker; it is simply not distinctive enough to be
literal-scanned without colliding with unrelated code.

**Two of the ceilings are not comfortable.**

| Ceiling | Limit | When it binds |
|---|---|---|
| Workers requests | 100,000/day | ~5,000–7,000 daily visitors, against a 1,000-visitor target |
| R2 storage | 10 GB-month | ~month 14 at the current growth rate |

The Workers request ceiling is the binding one, and it binds roughly five to
seven times out. Everything else has years of headroom.

The earlier project position was that hitting either ceiling would be a
**spend decision**: a pre-agreed $5/month Workers Paid plan, or an alert and a
manual upgrade. That position is what this ADR replaces.

## Decision

**D-05: the free tier is a permanent hard ceiling. The project never buys
Workers Paid ($5/month) or any other paid tier, not even once the site earns
revenue. Revenue is not a licence to spend on infrastructure.**

This is a standing, unconditional decision. It is recorded in the registry
itself as `standing_disposition: never_purchase`, so the rule and the budget
that it governs cannot drift apart.

### The OPS-04 triggers and their response

OPS-04 requires a written rule that names three triggers. This ADR names all
three, verbatim, with the metric and the threshold:

| Trigger | Metric | Threshold | Response |
|---|---|---|---|
| Traffic | `daily_visitors` | approaching **4,000** | Promote hot stories into the static tier (D-07) |
| Static files | `static_files_per_project` | exceeding **20,000** | Shard the static tier across the 8 projects (D-06, D-07) |
| Revenue | `monthly_revenue_usd` | any | **Still no purchase** (D-05) — the same load shedding |

The rule satisfies OPS-04 by **naming all three triggers**, in the registry's
`paid_plan_decision_rule` block. What it does *not* do is treat any of them as
a purchase trigger. The standing disposition for each of the three is load
shedding rather than spending, because the disposition was decided once, in
D-05, and a trigger that arrives after the site is earning money is exactly the
moment when "just buy the paid tier" would be easiest to say and most expensive
to accept.

The revenue trigger deserves its own line. It is the one that would have
justified a purchase under the earlier position, and it is the one that most
needs to be written down in advance, because a project that has just earned its
first revenue is a project under pressure to spend it. The answer is fixed
before that pressure arrives: no.

### D-07 and D-08 — how the load is shed

When traffic outgrows the request ceiling, the site sheds load by **all three**
mechanisms together, not by picking one:

1. **Promote hot stories into the static tier.** Static asset requests are free
   and unlimited, so a story that is promoted into a shard's output costs the
   request budget nothing at all.
2. **Edge-cache the story tier hard.** The story tier is served from R2 through
   the edge Worker; caching it aggressively keeps repeat views off the request
   counter.
3. **Shard the static tier across the 8 projects.** Eight Workers projects hold
   160,000 static files between them, which is the only way the story pages fit
   at all under a 20,000-file-per-project cap.

D-08 makes the framing explicit: the request ceiling is a **permanent traffic
wall, not a tripwire**. Crossing it is a design change, never a spend
decision. The static promotion path is therefore not a late optimisation — it is
a first-class requirement of the architecture, and the story tier may never be
the only tier.

### The honest limits of Cloudflare's alerting

Cloudflare's budget alerts are **informational only**. Cloudflare's own
documentation states that the alert *"does not cap your usage or impact your
account in any way"*, and usage is processed once per day for the prior day's
activity, so an alert fires the day after the threshold is reached rather than
in real time. Budget alerts are also spend-threshold based, not
percentage-of-quota based.

This ADR therefore does **not** claim that alerts prevent billing, because that
claim would be false and a false assurance is worse than a known limit. What
the alerts are is a notification. What actually holds the line is this:

- The **lifecycle rules** (plan 01-04) are the real cap on storage growth.
  They delete objects, so GB-months and Class A/B operations stay inside the
  free allowance by construction rather than by monitoring.
- The **50% and 75% percentage-of-ceiling alerts** are the audit Worker's job in
  Phase 7 (OPS-03), and they read this same registry — `config/free-tier-limits.json`
  — so the thresholds the Worker alerts on and the ceilings the budget names can
  never disagree.
- The **budget alerts configured in the Cloudflare dashboard** cover the
  dollar-metered products as a notification, not as a control.

### D-09 — the one dependency that does not conform

Open-Meteo's free tier is restricted to non-commercial use and requires CC BY
4.0 attribution. The project serves it unchanged in v1 and carries a **standing
obligation to source a free, commercially-usable replacement before any revenue
exists** — the moment revenue appears, the current provider's terms stop
covering the site.

The project will **not** buy the Open-Meteo paid Standard plan at monetisation.
The replacement is the only acceptable path, and it is recorded in the registry
as a `known_non_conforming_dependency` so that it cannot be quietly forgotten
when the money starts arriving. It is a Phase 7 research task with a hard
deadline of "before any revenue exists".

### D-18 — the accepted cost of the serve-time image check

The serve-time image resolution check — the edge resolves the image URL, checks
R2, and renders the typographic fallback panel when the object has expired —
costs **one extra R2 Class B read per image view**. That cost is accepted. It
is well inside the 10,000,000-operation monthly allowance, and it is charged
against the `r2_class_b_ops_per_month` ceiling, which is recorded in the
registry as its own row so the arithmetic is visible rather than assumed.

## Consequences

### The permanent ceiling makes three things mandatory

1. **The eight-project static shard is infrastructure, not an optimisation.**
   With no paid tier to buy, a single static project caps at 20,000 files and
   the story pages exhaust it. The shard exists because the ceiling is
   permanent — see `docs/adr/0001-delivery-model.md` (written in plan 01-04).
2. **The static promotion path is a first-class requirement.** It is the
   mechanism that keeps the request ceiling from becoming a wall the site hits,
   so it cannot be deferred to "when traffic grows".
3. **The domain is bought only after revenue, and its consequences are
   accepted.** D-10 defers the purchase until the site earns money. D-11
   accepts that Google News enrolment, Publisher Center URL verification, the
   News Showcase panel and the AdSense path all stay closed until the domain
   exists — a `workers.dev` subdomain cannot provide the DNS TXT record
   Publisher Center requires. Phase 6 must not plan those as completable on the
   subdomain.

### Accepted negative consequences

- The site has a **hard ceiling on audience size** it cannot lift by paying.
  Reaching it means the publication stops being able to serve new readers in
  the current shape, and the response is architectural.
- The Phase 7 audit Worker becomes load-bearing rather than advisory. It reads
  this registry, and its 50% and 75% alerts are the only percentage-based
  warning the project has.
- Two dependencies do not fit the shape of the budget — Open-Meteo's terms
  (D-09) and the request ceiling itself — and both are handled by carrying the
  obligation explicitly rather than by paying.

### Neutral

- The registry is public because the repository is public. It contains ceilings,
  source URLs and decision thresholds — no credentials, no configuration, and
  nothing that grants access to anything.

## References

- `config/free-tier-limits.json` — the reconciled ceilings and the
  `paid_plan_decision_rule` this ADR governs
- `shared/config/free-tier-limits.ts` — the only module permitted to read a
  ceiling; `shared/config/__tests__/free-tier-limits.test.ts` — the scan that
  proves it is the only one
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md`
  — D-05, D-07, D-08, D-09, D-18
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-RESEARCH.md`
  §P6 — the registry design and the honest limits of Cloudflare's alerting
- `.planning/research/SUMMARY.md` §6 — the consolidated free-tier limits table
- `.planning/REQUIREMENTS.md` — OPS-01 and OPS-04
- `docs/adr/0001-delivery-model.md` — the delivery model and the eight-project
  static shard (written in plan 01-04)
- `docs/adr/0002-d1-no-shard.md` — the D1 topology decision
