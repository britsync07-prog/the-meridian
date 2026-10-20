# ADR 0004 — The domain, the name, and the canonical policy

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
- **Requirements:** SEO-13, SEO-10, PUB-12
- **Locked decisions:** D-10, D-11, D-12, D-13, D-14

---

## Context

Two strings and one URL decide how discoverable this publication is, and
none of them can be taken back once they are wrong.

**`news:name` is the single highest-impact string in the project.** It is
the name Google displays beside every story in Google News. A mismatch
against `news.google.com` silently kills inclusion — there is no error, no
warning, and no dashboard that reports it. The only symptom is that the
traffic does not arrive, months later, when the traffic is the entire point.

**The domain does not exist.** D-10 defers its purchase until the site
earns revenue, which is explicitly after launch. Everything builds and runs
on a `workers.dev` subdomain until then. That is a reasonable decision — a
domain is an ongoing cost, and paying for one before there is an audience
spends money on the possibility of an audience — but it has consequences
that have to be written down now rather than discovered in Phase 6.

**Publisher Center needs a DNS TXT record on a domain the project
controls.** A `workers.dev` subdomain cannot provide one. Google News
enrolment, Publisher Center URL verification, the News Showcase panel and
the AdSense path all run through it, and all four therefore stay closed
until the domain exists. This is the direct consequence of D-10 and it is
not a detail: an entire acquisition channel is switched off for the entire
pre-launch period, and the plan for the phase that owns SEO must know that.

**A canonical decides whether a page stays in Google's index.** The
canonical is the single instruction the page gives about its own identity,
and it is the one instruction a project can get quietly, invisibly wrong.

## Decision

### The name

**D-12 — the site name is "The Meridian", locked now, in exactly ONE config
value.**

It lives in `shared/config/site.ts`, as `SITE_NAME`. That value feeds the
`<news:name>`, the masthead, the Open Graph template and the repository
name. It can never diverge from itself, because there is no second copy of
it to diverge from.

A test enforces the single-copy rule: the literal appears in exactly one
source file in the whole repository. A second copy — in a component, a
config, a comment, a template — is a failure the build reports, because the
failure mode it causes (a mismatch on `news.google.com`) has no error
message of its own.

**D-13 — all seven editions share ONE site name.**

Edition identity appears in:

- the `<title>`, with the site name first and the edition identity second;
- the meta description, with the **country keyword present in the snippet**
  as well as in the title;
- the `<h1>` and the visible masthead.

Per-edition site names are not merely discouraged — they are **impossible**.
Google supports one site name per domain and not at the subdirectory level,
so an attempt to give the Indian edition its own site name would fail
silently and lose the entire edition's Google News presence.

`shared/templates/head.ts` is where this is enforced. `pageMeta()` reads the
site name from the one config value and the edition from the one edition
list, and builds the title as `${SITE_NAME} — ${edition.countryName}`.

### The domain

**D-10 — the domain is bought ONLY after the site earns revenue.**

Explicitly after launch. Everything builds and runs on a `workers.dev`
subdomain until then. `SITE_ORIGIN` in `shared/config/site.ts` is a
placeholder until that day, and changing it is a one-line configuration
change.

**D-11 — the consequence is accepted, and must not be quietly dropped:**

> **Google News enrolment, Publisher Center URL verification, the News
> Showcase panel and the AdSense path all stay closed until the domain
> exists.**

Publisher Center requires a DNS TXT record on a domain the project
controls. A `workers.dev` subdomain cannot provide one. **Phase 6 must NOT
be planned as if these can be completed on the subdomain.**

This is recorded here rather than left implicit because the failure mode is
a stalled phase: a plan that assumes Publisher Center enrolment is
completable will reach that step, discover the DNS requirement, and stall.
The plan that knows about it configures the value and marks the enrolment as
deferred, and the phase finishes.

**D-14 — the migration to the custom domain uses 301 redirects, never
canonicals.**

301 redirects are the strongest signal for a URL that has moved, and a
canonical is the weakest. The two are used for different jobs: a canonical
says "this is me", and a redirect says "that one is over there". Mixing them
is discouraged by Google, and the mixing here would be actively harmful — a
cross-domain canonical to the old subdomain would strip the new domain of
its own pages.

**The redirect map is generated from the SAME source as the sitemap**, so
the two cannot drift. A redirect map and a sitemap that disagree is the
classic cause of a migration that half-works: some URLs redirect, some 404,
and the sitemap advertises a third set.

After the migration, the sitemap and the hreflang sets are re-verified.

### The canonical policy

**CON-09 — every page emits a self-referential canonical, and no page ever
emits a canonical pointing to a publisher's domain.**

The Meridian page carries the multi-outlet coverage line and count, the
trending rank, the topic and entity tags with their cross-country flags,
the related-story links and the coverage byline. **None of that exists on
the publisher's page** — that aggregation layer IS the publication's
originality. A cross-domain canonical pointing at the publisher tells Google
that the Meridian page is not the canonical page, so the page leaves the
index, the traffic never arrives, and the entire property becomes
referral-only.

There is no duplicate to consolidate here. The canonical is therefore
**constructed**, not sanitised: `pageMeta()` builds it as the site's own
origin plus a path, and a path that is a full URL is **refused outright**
with an error. There is no code path by which a canonical could come to
point at a publisher.

**CON-10 — publisher attribution links are normal followed links carrying
`rel="noopener"`, and never `nofollow` or `sponsored`.**

The publication's relationship to its sources is editorial, not
transactional. The outlet list is part of the value proposition — the
coverage count and the byline are two of the six value elements a story page
must carry — and a `nofollow` on those links would tell the search engine
not to credit the source for the story, which is both inaccurate and
self-harming.

`rel="noopener"` is retained. It is a security property, not an editorial
signal: it stops the opened tab from reaching back through `window.opener`.
It carries no implication about the link's follow status.

## Consequences

### The migration is a routing change, not a rewrite

Phase 5's route table is already single-hostname with locale path
prefixes. Buying the domain changes DNS and adds a redirect map; it does not
change a page, a template or a URL structure.

### The redirect map has one source

The redirect map and the sitemap are generated together, from the same
input. They cannot disagree, because there is one input. Phase 7 owns the
generation; Phase 6 owns the SEO surface it shares.

### `SITE_ORIGIN` is a configuration value, not a constant in the code

Changing it is a one-line change in `shared/config/site.ts`, and every
canonical follows from it, because every canonical is constructed from it.

### Phase 6 must plan Publisher Center as configuration, not as a gate

Phase 6 configures the value, prepares the enrolment, and records that the
verification step waits for the domain. It does not treat the enrolment as
completable on the subdomain, because it is not.

### Accepted negative consequences

- **An entire acquisition channel is closed for the pre-launch period.**
  Google News enrolment, Publisher Center verification, the News Showcase
  panel and AdSense all wait for the domain. The site's discovery in the
  meantime depends on ordinary search indexing and on the editorial
  aggregation itself.
- **The `workers.dev` subdomain is not a durable identity.** Readers who
  arrive during the pre-launch period may have the old host in their
  bookmarks. The 301 redirect map handles it at migration time; before
  that, there is nothing to handle.

### Neutral

- The site name is locked now and will not change. It is a single value in a
  single file, and a test fails the build if a second copy appears.
- The Hindi edition shares the site name with the English India edition, and
  the two are distinguished by their hreflang alternates and their document
  languages (`en-IN` and `hi-IN`).

## References

- `shared/config/site.ts` — `SITE_NAME` and `SITE_ORIGIN`, the one and only
  home of the publication's identity
- `shared/templates/head.ts` — `pageMeta()`, where D-13 and CON-09 are
  enforced
- `shared/config/__tests__/site.test.ts` — the single-copy assertion for the
  site name
- `config/free-tier-limits.json` — the free-tier ceiling registry this
  decision lives under
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md`
  — D-10, D-11, D-12, D-13, D-14
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-RESEARCH.md`
  §P8 and §P9 — the name contract and the domain contract
- `.planning/REQUIREMENTS.md` — CON-09 and CON-10
- `.planning/codebase/ARCHITECTURE.md` — the three canonical rules and the
  one-hostname routing table
