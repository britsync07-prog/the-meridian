# ADR 0003 — Image permanence: one 12-month clock and a silent typographic panel

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Phase 1 — Foundation, Free-Tier Contract & Architecture Decisions
- **Requirements:** MED-08, PUB-09
- **Locked decisions:** D-15, D-16, D-17, D-18, D-19

---

## Context

A story's URL is permanent. That is the product's central promise: a link to a
story resolves forever, and the archive a reader is browsing is a promise
about the future as much as about the past.

Its image is not.

R2 storage crosses the free allowance around month 14 without a lifecycle
rule, and the project has no paid tier to escape into — D-05 makes the free
tier a permanent hard ceiling — so the media prefix must expire on a clock.
The expiry itself is the easy part, and it was created in plan 01-04: the
`media/` prefix runs a single 365-day lifecycle rule, scoped to the prefix so
that it can never match `og/` or the bucket root.

What the expiry does to a permanent URL is the hard part, and it is the part
that had to be decided before any of it was built.

**R2's lifecycle rules delete objects silently.** Nothing tells the
application that an object expired. There is no event, no callback, no
notification. The story page's HTML was rendered months earlier — in the
static tier, at build time, by a build that has long since finished — and it
points at an object that is no longer there. A page that renders a broken
image on a permanent URL is a broken promise in the most visible way
available: the reader sees the fault, and the fault is on the story they
came for.

**The stored HTML cannot be repaired in place.** The story tier is
pre-rendered HTML in R2, served by the edge Worker. Fixing one page means
re-rendering it, and re-rendering means running the renderer over that
story's data. Doing that at serve time for every view is not affordable.
Doing it for every story ever published is not affordable either. Something
has to decide *which* pages get re-rendered, and that decision has to be
made before the mechanism is built, because it determines what the mechanism
is.

**The free-tier budget has an opinion.** Every image view that checks the
bucket is one more R2 Class B operation, charged against the
`r2_class_b_ops_per_month` ceiling in `config/free-tier-limits.json`. The
projected traffic sits well inside that allowance — but a cost that is not
written down is a cost that gets discovered, and D-05 means there is no paid
tier to move it to.

**The failure must be invisible.** A reader who opens a three-year-old
story and sees "image expired" has been told something about the
publication's plumbing that they did not ask for and cannot act on. The
publication's visual language is that of a printed paper: a classified ad,
a pull-quote, a ruled box of type. A box of type in that visual language is
a design element, and nobody reading a newspaper thinks a newspaper is
broken because a story has a box of type where a photograph used to be.

## Decision

### D-15 — one clock, for everything, with no exemptions

Every media object expires after **12 months**. Every one. There is no
curated permanent set, no per-publisher carve-out, no "this one is
important enough" rule, and no second clock to reconcile with the first.

The rule is expressed in days in the lifecycle configuration — 365 days,
which is the same clock stated in the unit R2 takes — and the value lives in
one place, `shared/contract/image-permanence.ts`, as
`MEDIA_LIFETIME_DAYS`.

One rule, one value, one place to check. An exemption would be a hole in
the budget that someone has to remember, and the next person to add one
would not know why the first exists.

### D-16 — an expired image renders a silent typographic panel

An expired image renders a **typographic panel carrying the headline's
opening words**. It reads as a deliberate design element — a classified ad
or a pull-quote — not as an error.

There is **no "image archived" caption. No broken icon. No visible system
explanation.** The panel is the visual language of a printed paper, and that
is the whole of its claim on the reader's attention.

The panel is rendered by `shared/templates/typographic-fallback.ts`, a pure
function taking a headline and returning an HTML string. The headline comes
from a publisher's feed, so every interpolated value is HTML-escaped.

Its **visual** specifics — the rule, the type, the spacing, the way it sits
in the column — belong to Phase 4's broadsheet design system. Phase 1 fixes
only that it is a pure string builder, that it is silent, and that it is the
same bytes in the static build and at the edge.

### D-17 — both mechanisms, not one

The fallback is applied by **two** mechanisms, and both are required.

**(a) Resolution at serve time.** The image URL resolves through the edge.
The edge checks R2, and when the object is gone it returns the typographic
panel in its place. The stored HTML never changes, so a story published
years ago is correct the moment it is served. This is the mechanism that
makes the promise true on the first view, and it is why the panel exists as
a live render rather than as a baked-in image.

**(b) A periodic sweep.** A job finds the stories whose media object has
run its clock and re-renders just those pages, baking the panel into the
stored HTML. This is why the common case — a story whose media is still
there — never pays a lookup at serve time: the panel is already in the HTML
and the edge only checks for the objects that could have expired.

The two are complementary, and the order of importance is not symmetric. The
serve-time resolution is what makes the promise TRUE. The sweep is what
makes it CHEAP. A sweep alone would leave every story broken between the
expiry and the next sweep run; a serve-time check alone would pay D-18's
cost on every image view of every story, forever.

The rule the sweep uses is `hasMediaExpired()` in
`shared/contract/image-permanence.ts`.

### D-18 — the serve-time check costs one extra R2 Class B read per image view

The serve-time resolution performs **one additional R2 Class B operation per
image view** — the existence check that distinguishes "present" from
"expired".

**That cost is accepted.** It is well inside the `r2_class_b_ops_per_month`
allowance in `config/free-tier-limits.json`, and it is charged against that
ceiling explicitly, as its own row: `r2_class_b_reads_per_image_view`. It
is a number the project has agreed to pay, not one that turns up in a
dashboard later.

The sweep (D-17b) is what keeps the check off the hot path for the bulk of
traffic, and the edge caches the story HTML, so the paid check is bounded
by the views of stories whose media has actually expired.

### D-19 — Open Graph images never expire

Open Graph images are excluded from **every** lifecycle rule, alongside the
site root. They belong to permanent story URLs, and a permanent URL that
loses its social card is broken in exactly the same way a permanent URL that
loses its photograph is.

This exclusion is structural rather than a matter of remembering. The R2
lifecycle rules are prefix-scoped by construction — every rule this project
creates carries an explicit, non-empty prefix from the allow-list
`{raw/, media/}` — and `scripts/cloudflare/verify-lifecycle.mjs` asserts
against the **live** rule listing that no rule can match `og/` or the bucket
root. The rule set is structurally incapable of carrying a rule that would.

## Consequences

### Phase 1 owns the contract

- `shared/templates/typographic-fallback.ts` — the pure string builder. It
  takes a headline and returns the panel.
- `shared/contract/image-permanence.ts` — the resolution rule.
  `resolveMediaObject()` returns `present` or `expired`; `expired` renders
  the typographic fallback. `hasMediaExpired()` is the sweep's predicate.
- The R2 lifecycle rule that enforces the 12-month clock on `media/` was
  created in plan 01-04 and is scoped to the prefix alone.

### Later phases inherit it

- **Phase 5** implements the serve-time resolution: the image URL resolves
  through the edge, checks R2, and returns the panel when the object is gone.
- **Phase 7** implements the periodic sweep: a job finds the stories whose
  media has expired and re-renders exactly those pages.
- **Phase 4** owns the panel's visual treatment, inside the broadsheet
  design system.

### Accepted negative consequences

- **A story's photograph is not permanent even though its URL is.** The
  publication makes a promise about the text and not about the pictures. That
  is a real limitation and it is stated rather than hidden.
- **The serve-time check is a real cost on the request path**, accepted
  under D-18 and bounded by the sweep.
- **The sweep re-renders pages, and re-rendering costs build time.** The
  sweep is scoped to the expired set precisely so that the cost is bounded
  and does not grow with the archive.

### Neutral

- The `og/` prefix has no lifecycle rule and no objects today. The
  exclusion is already structural — the verifier fails if a rule ever
  appears on `og/` — and the objects arrive in Phase 5.
- `raw/` expires at 7 days and is unaffected by this decision: raw feed
  snapshots are working material, not published content.

## References

- `shared/contract/image-permanence.ts` — the resolution rule and the
  lifetime constant
- `shared/templates/typographic-fallback.ts` — the pure panel builder
- `shared/contract/__tests__/image-permanence.test.ts` — the assertions
- `config/free-tier-limits.json` — the `r2_class_b_ops_per_month` ceiling
  and the `r2_class_b_reads_per_image_view` row that charges D-18's cost
- `scripts/cloudflare/verify-lifecycle.mjs` — the live proof that no rule
  can match `og/` or the bucket root
- `docs/adr/0005-free-tier-ceiling-and-no-spend.md` — the standing no-spend
  rule this decision lives under
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md`
  — D-15, D-16, D-17, D-18, D-19
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-RESEARCH.md`
  §P8 — the image-permanence contract
- `.planning/codebase/ARCHITECTURE.md` — the three storage tiers
