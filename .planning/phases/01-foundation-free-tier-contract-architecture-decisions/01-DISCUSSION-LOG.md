# Phase 1: Foundation, Free-Tier Contract & Architecture Decisions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-20
**Phase:** 1-foundation-free-tier-contract-architecture-decisions
**Areas discussed:** Accounts & access, Budget ceiling, Domain & name, Image permanence

---

## Accounts & access

### Cloudflare account state

| Option | Description | Selected |
|--------|-------------|----------|
| Have Cloudflare + card, R2 pending | Account exists, payment method already on file, R2 bucket may or may not exist. Phase 1 can create the bucket and run all five spikes immediately. | ✓ |
| Have Cloudflare, no card | Account exists but no payment method. Adding a card is needed before R2 can be enabled. | |
| No Cloudflare account yet | Nothing set up yet. Phase 1 opens with account creation. | |
| Want to avoid a card entirely | Rules out R2 entirely, requiring a re-architecture of the storage tiers before any code is written. | |

**User's choice:** Have Cloudflare + card, R2 pending
**Notes:** Raised during the discussion that R2 requires a payment method on file even for the free tier — it is a "free allowance inside a metered service", not a cardless Free plan. Workers, D1, Pages and Web Analytics are cardless. R2 was confirmed against Cloudflare's billing documentation and community reports. The card requirement also means R2 *suspends* on overage rather than degrading, which is the opposite of the site's "degrade, don't break" rule. The user accepted the card on file.

### Repository visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Public (Recommended) | Unlimited GitHub Actions minutes (private is capped at 2,000/mo, and your projected need is ~360/mo anyway). The curated source list and taxonomy become public - but that list is already public RSS, and the /sources page is a requirement anyway. | ✓ |
| Private | Nothing exposed. 2,000 CI minutes/month is still 5x your projected need. | |
| Public repo, private repo later | Public during growth so CI has no cap, then flip to private. Flipping later changes the canonical URL. | |

**User's choice:** Public (Recommended)
**Notes:** The CI minutes ceiling is a free-tier constraint, which makes repo visibility a budget decision as much as a privacy one. The source list being public was judged not to be new exposure because the feeds are already public and `/sources` is a Phase 6 deliverable regardless.

### R2 zero-bill protection

| Option | Description | Selected |
|--------|-------------|----------|
| Alerts + lifecycle on raw/ and media/ (Recommended) | Cloudflare Billing alerts at 80% of each metered quota, plus lifecycle rules on raw/ (7 days) and media/ (12 months) so the two growing prefixes self-limit. og/ and story/ never expire. | ✓ |
| Add spend alerts + separate billing profile | Everything above, plus a dedicated Cloudflare billing profile so an accidental overage is capped at the account level rather than the bucket level. | |
| Nothing extra, trust the audit Worker | Just the daily audit Worker reading the usage_log table and the versioned limits file. | |

**User's choice:** Alerts + lifecycle on raw/ and media/ (Recommended)
**Notes:** The lifecycle-on-raw/ decision also bounds the raw-feed snapshot growth, which is the single largest storage producer. Standard storage only — the R2 free tier explicitly does not apply to Infrequent Access storage.

### GitHub account

| Option | Description | Selected |
|--------|-------------|----------|
| Personal account | Simplest. The repo lives under your personal namespace. CI secrets live with the only account that will ever need them. | ✓ |
| Create an org | Better for long-term ownership, keeps the repo URL independent of a personal handle. Costs one extra setup step. | |
| Personal now, org later | Start personal and move later. The move keeps GitHub redirecting, but Actions secrets and CI history need re-wiring. | |

**User's choice:** Personal account

---

## Budget ceiling

### The $5/month Workers Paid tripwire

| Option | Description | Selected |
|--------|-------------|----------|
| Hard $0 until revenue exists | Free tier is the ceiling. If traffic approaches the wall, the site degrades deliberately until revenue exists and you authorise spending. You are never surprised by a bill. | ✓ |
| Pre-authorise $5/mo, gated on revenue | The $5/month plan is pre-authorised the day the site earns its first dollar, or at 3,000 daily visitors, whichever comes first. | |
| $5/mo now, treat it as the budget | Buy the $5/month plan from day one and treat $5/month as the real budget. Breaks the zero-cost constraint. | |

**User's choice:** Hard $0 until revenue exists
**Notes:** The question was raised because OPS-04 pre-agreed buying the paid plan at ~4,000 daily visitors, which collided with the stated everything-free constraint. This question was superseded by the fourth one in this area.

### Load shedding when traffic outgrows the free tier

| Option | Description | Selected |
|--------|-------------|----------|
| Promote hot stories to the static tier | As traffic climbs, the most-viewed stories get promoted into the static tier (free, unlimited requests) and the long tail keeps costing one Worker request each. | |
| Edge-cache the story tier | Push the story-tier cache headers hard so repeat views are served from Cloudflare's edge cache without invoking the Worker at all. | |
| Both, plus shard the static tier | Promote hot stories to the static tier AND edge-cache the story tier AND shard the static tier across 8 Workers projects when it nears 20,000 files. | ✓ |

**User's choice:** Both, plus shard the static tier
**Notes:** The 8-project shard is the mechanism that dissolves the request ceiling: 160,000 static files at 120 stories/day is ~3.6 years of story pages in the static tier, at which point story views cost zero Worker requests.

### Open-Meteo at monetization

| Option | Description | Selected |
|--------|-------------|----------|
| Budget the paid tier at v2 | Keep the weather feature and budget Open-Meteo's paid Standard plan when the site monetizes. | |
| Drop weather at v2 | At monetization, drop the weather panel rather than pay for it. | |
| Replace with a free alternative | Find a different weather source with a commercial-friendly free tier. Adds a Phase 7 research task and a new failure surface, but keeps the cost at zero. | ✓ |

**User's choice:** Replace with a free alternative
**Notes:** Driven by D-05 — the project never spends on infrastructure, so a paid weather tier is off the table regardless of revenue.

### Buying the paid plan when revenue exists

| Option | Description | Selected |
|--------|-------------|----------|
| Manual approval, every time | The audit report shows the ceiling approaching and you decide. You are never auto-charged for anything, even with revenue in hand. | |
| Standing rule above a revenue threshold | Once monthly revenue crosses a set threshold, the $5/month plan is bought automatically without asking again. | |
| Never spend, even with revenue | Revenue is reserved for something else entirely. The free tier is the permanent design constraint and the site is architected to live inside it. | ✓ |

**User's choice:** Never spend, even with revenue
**Notes:** This escalated the constraint considerably. The free tier becomes a permanent architectural constraint rather than a budget with an escape hatch, which converted the static shard from an option into mandatory infrastructure.

### Static shard timing

| Option | Description | Selected |
|--------|-------------|----------|
| Build the shard now (Recommended) | Build the 8-project shard and the story-to-static promotion path from day one. The story tier starts in R2 and hot stories get promoted into the static tier as they accumulate traffic. | ✓ |
| One project now, shard in Phase 5 | Start with the single project the research settled on and add the shard in Phase 5. | |
| Defer the whole decision | Leave the shard as a Phase 7 operational concern. Accept that the request ceiling is a real wall. | |

**User's choice:** Build the shard now (Recommended)
**Notes:** Follows directly from "never spend". With no paid tier available, the request ceiling is a permanent traffic wall and crossing it requires the static promotion path, not a spend decision.

---

## Domain & name

### Domain purchase timing

| Option | Description | Selected |
|--------|-------------|----------|
| Buy now, before any URL is indexed | Buy it in Phase 1 for ~$10-15/year. No 301 migration, no sitemap re-verification. | |
| Buy in Phase 7, before launch | Build on workers.dev, buy before launch, migrate once. The redirect map has to be generated and tested. | |
| After launch, when revenue exists | Launch on workers.dev and buy the domain only once the site is earning. | ✓ |

**User's choice:** After launch, when revenue exists

### Where the domain actually lands, given Publisher Center needs DNS

| Option | Description | Selected |
|--------|-------------|----------|
| Buy in Phase 6, before the SEO phase | Publisher Center verification, News Showcase and the ads path all open in the phase that needs them. | |
| Buy before launch after all | Treat the domain as a launch gate. Never do a 301 migration at all. | |
| Truly after revenue | Accept that Google News inclusion, Publisher Center verification and AdSense all stay switched off until the site earns something. | ✓ |

**User's choice:** Truly after revenue
**Notes:** This question was asked because the research classified the domain as launch-blocking for Search Console verification, Google News discovery and Publisher Center URL verification, which conflicts with the first answer. The consequence was put to the user explicitly and they confirmed the choice with full information. The trade-off accepted: Google News enrolment, Publisher Center verification, News Showcase and AdSense all stay closed until the domain exists; the 301 redirect map must be generated from the same source as the sitemap so the two cannot drift.

### Site name

| Option | Description | Selected |
|--------|-------------|----------|
| Lock 'The Meridian' now | Locked in config now. It goes into <news:name>, the masthead, the OG image template and the repo name. | ✓ |
| Keep as placeholder for now | Treat it as a placeholder; a rename later would still need the OG template, the repo, and the Publisher Center name to move together. | |
| Explore alternatives now | The domain is not bought yet, so now is the only cheap time to try a few alternatives. | |

**User's choice:** Lock 'The Meridian' now
**Notes:** The research identified the `news:name` string as the single highest-impact string in the project — a mismatch against news.google.com silently kills Google News inclusion. Locking early means one config value that can never diverge.

### Edition identity under a single site name

| Option | Description | Selected |
|--------|-------------|----------|
| Edition in the title only | All editions share the single site name. The edition appears only in the <title>, the <h1> and the visible masthead. | |
| Edition in the title and meta | Same single site name, but each edition also carries its own <title> suffix and meta description naming the country, so the country keyword is present in the snippet as well as the title. | ✓ |
| One site name per edition | Each edition gets its own site name. Google does not support site names at the subdirectory level, so this would mean seven subdomains — which breaks the one-hostname crawl-budget rule. | |

**User's choice:** Edition in the title and meta
**Notes:** Keeps one site name for all seven editions per Google's rule, while getting the country keyword into the search snippet rather than only the title.

---

## Image permanence

### Image lifetime

| Option | Description | Selected |
|--------|-------------|----------|
| 12 months, then a typographic fallback | The 12-month rule from MED-08. Old stories keep everything except the photo, and render a typographic fallback in its place. | ✓ |
| 24 months, tighter elsewhere | 24 months on the 1000px hero variant, 12 months on the 400px thumbnail. | |
| Never expire images | Storage crosses 10 GB around month 14 and starts billing. Contradicts the permanent-$0 decision. | |

**User's choice:** 12 months, then a typographic fallback
**Notes:** MED-08 confirmed as written.

### What an expired-image story page looks like

| Option | Description | Selected |
|--------|-------------|----------|
| Typographic panel, silent | A ruled typographic block carrying the headline's opening words. Looks deliberate, like a classified ad or a pull-quote. No error, no broken icon. | ✓ |
| Typographic panel, dated | The same panel plus a small honest caption noting the photograph was archived to stay inside the free storage tier. | |
| Reuse the OG image | The story's own Open Graph image is never expired, so it can stand in as the visual. | |

**User's choice:** Typographic panel, silent
**Notes:** The silent variant was chosen over the dated one and over reusing the OG image. The visual should read as newspaper design, not as a web app's missing-image state.

### How the fallback gets applied

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve at serve time | The image URL resolves through the edge, which checks R2 and returns the typographic panel if the object is gone. The stored HTML never changes. One extra R2 read per image view. | |
| Re-render on a schedule | A daily job finds stories whose images have expired and re-renders just those pages with the fallback baked in. | |
| Both | Serve-time resolution as the safety net, plus a periodic sweep that rewrites the permanently-affected pages so the common case never pays a lookup. | ✓ |

**User's choice:** Both
**Notes:** The problem being solved is that R2's lifecycle rule deletes objects silently. Nothing tells the application that an image expired, and the story page's HTML was rendered months earlier pointing at it — so a permanent URL would otherwise show a broken image.

### Exemptions from expiry

| Option | Description | Selected |
|--------|-------------|----------|
| No exemptions, uniform expiry | Every media object expires on the same 12-month clock. One rule, one budget, no exceptions to reason about. | ✓ |
| Exempt a curated permanent set | A small curated set in a separate prefix with no expiry rule, covering the most-viewed stories. | |

**User's choice:** No exemptions, uniform expiry

---

## OpenCode's Discretion

No area was explicitly handed to OpenCode by the user. The following implementation choices were left open because they are technical mechanics rather than product decisions, and are recorded in CONTEXT.md under OpenCode's Discretion:

- Directory names under `apps/` and `shared/`, the `tsconfig.json` path-alias strategy, package manager and lockfile format
- D1 migration mechanism and seed strategy
- The D1 repository module's public API shape
- ADR file format, naming convention and location
- How the excerpt budget is expressed (constants, Zod schema, config-driven) and whether per-source overrides are supported
- The exact shape of `config/free-tier-limits.json` beyond the mandated per-limit source URL and verification date
- The typographic fallback panel's visual specifics, provided it stays within the Phase 4 design system and reads as deliberate

## Deferred Ideas

- **Free commercially-usable weather provider to replace Open-Meteo** — needed before the site monetizes, because Open-Meteo's free tier's non-commercial restriction stops covering the site the moment revenue appears. Phase 7 research task.
- **The custom domain purchase** — deferred past launch. When it happens it needs the purchase, the 301 redirect map generated from the sitemap source, a Search Console property for the new domain, Publisher Center DNS TXT verification, and re-verification of the sitemap and hreflang sets.
