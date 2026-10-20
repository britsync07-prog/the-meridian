---
phase: 01-foundation-free-tier-contract-architecture-decisions
plan: 05
subsystem: contract
tags: [excerpt-budget, content-model, canonical, hreflang, adr, typographic-fallback, purity, zod, con-01, con-09]

# Dependency graph
requires:
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 01
    provides: "the `shared/` contract layer, `shared/types.ts` (the `StoryExcerpt`, `PageMeta` and `PageMetaInput` shapes) and `shared/config/site.ts` (`SITE_NAME`, `SITE_ORIGIN`)"
  - phase: 01-foundation-free-tier-contract-architecture-decisions
    plan: 03
    provides: "`config/free-tier-limits.json` and `shared/config/free-tier-limits.ts`, whose `ENFORCED_LIMIT_TOKENS` the prose-ADR scan reuses"
provides:
  - "`shared/contract/excerpt-budget.ts` — the excerpt budget as a coded contract: `EXCERPT_BUDGET`, `applyExcerptBudget`, `assertExcerptWithinBudget`, `ExcerptBudgetError`, `EXCERPT_RESULT_SCHEMA` and `toStoredExcerpt`"
  - "`shared/contract/__tests__/excerpt-budget.test.ts` — 22 assertions over every limit, the verbatim-prefix guarantee and a 200-candidate sweep"
  - "`shared/templates/head.ts` — `pageMeta()` (the single source of truth for title, description, canonical, html lang and hreflang set) and `renderHead()`"
  - "`shared/templates/typographic-fallback.ts` — the silent typographic panel builder"
  - "`shared/contract/image-permanence.ts` — the resolution rule: `resolveMediaObject()`, `hasMediaExpired()`, `MEDIA_LIFETIME_DAYS`"
  - "`shared/__tests__/purity.test.ts` — the gate proving `shared/` carries no runtime dependency and is not a package"
  - "`docs/adr/0003-image-permanence.md` — D-15 through D-19, including the accepted extra R2 Class B read per image view"
  - "`docs/adr/0004-domain-and-name.md` — D-10 through D-14, the four accepted consequences of the domain deferral, and CON-09 and CON-10"
affects: [01-06, phase-2-feed-acquisition-raw-capture-normalization, phase-3-curation-core, phase-4-design-system, phase-5-publication-surface, phase-6-digest-trust-seo, phase-7-operational-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The excerpt budget is TRUNCATION-ONLY. The contract has no rewrite path, no synonym table, no translation step, no per-source override parameter and no configuration lookup — the API shape makes a paraphrase impossible rather than merely discouraged."
    - "A contract checks its own output before returning it. `applyExcerptBudget` verifies the result against a Zod schema AND verifies that the published text is a verbatim prefix of the candidate, so a future edit that rewrote text would fail at the contract rather than in a stored row three phases later."
    - "A canonical is CONSTRUCTED, not sanitised. `pageMeta` builds it as the site's own origin plus a path and refuses a full URL as a path outright, so there is no code path by which a canonical could come to point at a publisher."
    - "The shared layer is pure string builders returning HTML, not components — because a dynamically served story page must render identically to a statically served section page, and an Astro component cannot render inside an edge Function."
    - "A decision that names a budget references the registry id, never the number. The prose-ADR scan enforces it, and the gate was observed to fail on a planted literal."
    - "TDD: the failing test lands in its own commit before the implementation it guards, and the RED state was confirmed by moving the implementation aside."

key-files:
  created:
    - shared/contract/excerpt-budget.ts
    - shared/contract/__tests__/excerpt-budget.test.ts
    - shared/contract/image-permanence.ts
    - shared/contract/__tests__/image-permanence.test.ts
    - shared/templates/head.ts
    - shared/templates/typographic-fallback.ts
    - shared/templates/__tests__/head.test.ts
    - shared/__tests__/purity.test.ts
    - docs/adr/0003-image-permanence.md
    - docs/adr/0004-domain-and-name.md
  modified:
    - scripts/shards/__tests__/shards.test.ts

key-decisions:
  - "The excerpt budget is truncation-only, with no override path. CONTEXT.md left the override question to OpenCode and the decision is to exercise it in the negative: an override is a paraphrase-shaped loophole, so the API has no shape for one and `applyExcerptBudget` takes exactly one argument."
  - "The word cap and the share cap are both ceilings and the tighter one binds. A 200-word source would allow 60 words at 30 percent, but 60 breaches the 50-word cap, so the excerpt is 50 words and a quarter of the source. Both limits hold at once; neither is traded for the other."
  - "The source-share allowance is computed in integer percentage arithmetic, not in floating point. `0.3 * 30` is `8.999999999999998` in binary floating point and a floor of the wrong side of that error would silently shorten an excerpt by a word."
  - "`pageMeta` and `renderHead` are both in `shared/templates/head.ts`. `pageMeta` decides WHAT the metadata is; `renderHead` decides how it is written out. Keeping both means the static build and the edge runtime emit the same bytes for the same metadata."
  - "The image-permanence resolution rule is split into `shared/contract/image-permanence.ts` rather than living inside the template module. The rule and the rendering are different concerns: the rule decides `present` or `expired`, the template decides what an expired object looks like."
  - "The media lifetime is a named constant (`MEDIA_LIFETIME_DAYS`) rather than a literal at each use, so the sweep's predicate and the serve-time resolution read the same clock."
  - "ADR 0003 charges D-18's cost against the `r2_class_b_ops_per_month` registry id rather than repeating the number, and the prose-ADR ceiling scan was extended to cover ADR 0003 and ADR 0004."

patterns-established:
  - "A contract is a module with no exit except its own return. Anything that would need a knob to weaken it does not get one."
  - "A gate that has never been observed to fail is not a gate. Every new scan in this plan was run against a deliberately planted violation first."
  - "The shared surface is imported by RELATIVE path and by no alias — a TypeScript path alias in an edge bundle is the least predictable part of the Workers build."
  - "A permanently hosted page whose backing object expires renders a deliberate design element in its place, never an error. The reader is not told about the plumbing."

requirements-completed: [CON-01, CON-02, CON-03, CON-04, CON-05, CON-09, CON-10]

# Metrics
duration: 34min
completed: 2026-10-21
---

# Phase 1 Plan 05: The Coded Excerpt Budget, the Shared Templates and the Image and Domain ADRs Summary

**The excerpt budget as a truncation-only coded contract with 22 assertions, a self-referential canonical that cannot be made to point at a publisher, a silent typographic panel for expired media, and the two ADRs that record the image lifetime and the domain deferral's accepted consequences.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-10-21T02:08:00Z
- **Completed:** 2026-10-21T02:42:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- **The excerpt budget is code, not prose.** `shared/contract/excerpt-budget.ts` enforces all five limits (50 words, 320 characters, 2 sentences, 30 percent of the source, and the 160-word source floor) and the function's ONLY operation on the candidate is cutting it. There is no rewrite path, no synonym table, no translation step, no per-source override parameter and no configuration lookup. The contract verifies its own output against a Zod schema *and* verifies that the published text is a verbatim prefix of the candidate, so a future edit that paraphrased would fail at the contract rather than in a stored row three phases later. `assertExcerptWithinBudget` throws with every breached limit listed rather than the first one, so one failure tells the whole story.
- **The canonical is constructed, not sanitised.** `pageMeta()` builds it as `SITE_ORIGIN + path` and **refuses a full URL as a path outright**. A cross-domain canonical would tell Google the Meridian page is not canonical, and the page would leave the index — so the guarantee is enforced by there being no code path that could produce one, not by a test that checks for one afterwards. The test asserts it across all eight editions anyway.
- **The expired-image fallback is silent by construction.** `typographicFallback()` renders a ruled typographic panel carrying the headline's opening words, escaped for untrusted publisher input, with no caption, no broken icon and no visible system explanation. The six forbidden strings ("image", "not found", "missing", "unavailable", "archived", "expired") are asserted absent from the output.
- **The image lifetime and the domain deferral are written down where Phase 5, 6 and 7 will find them.** ADR 0003 records D-15 through D-19 including the accepted cost of one extra R2 Class B read per image view. ADR 0004 records D-10 through D-14, the four consequences the domain deferral accepts (Google News enrolment, Publisher Center verification, News Showcase and AdSense all stay closed until the domain exists), and the CON-09 and CON-10 canonical policy.

## task Commits

Each task was committed atomically, with the failing test landed before the implementation it guards. The RED state was **confirmed** for both TDD tasks by moving the implementation aside and watching the suite fail:

1. **task 1: write the excerpt budget as a coded, tested contract** — `9eb4d43` (test, RED) then `a075eab` (feat, GREEN)
2. **task 2: write the shared metadata and typographic fallback templates as pure string builders** — `e3d5b88` (test, RED) then `d7846ee` (feat, GREEN)
3. **task 3: record the image-permanence and the domain-and-name decisions** — `0ecdaad` (docs)

**Plus one hardening commit:** `225a3ca` (fix) — ADR 0003 charges D-18's cost against the registry id rather than repeating the number, and the prose-ADR ceiling scan was extended to cover ADR 0003 and ADR 0004.

**Plan metadata:** see the closing `docs(01-05)` commit.

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `shared/contract/excerpt-budget.ts` — the coded excerpt budget. `EXCERPT_BUDGET` carries the five published limits and the visible ellipsis; `applyExcerptBudget` reaches a verdict; `assertExcerptWithinBudget` is the gate Phase 2's normaliser runs over every excerpt it is about to store; `EXCERPT_RESULT_SCHEMA` is the runtime shape the contract checks itself against; `toStoredExcerpt` is the only bridge to the stored `StoryExcerpt` shape.
- `shared/contract/__tests__/excerpt-budget.test.ts` — 22 assertions: each named budget case, the verbatim-prefix guarantee across six candidate shapes, a randomised sweep over 200 generated candidates, and the assertion's throw/no-throw behaviour.
- `shared/templates/head.ts` — `pageMeta()`, the single source of truth for title, description, self-referential canonical, document language and hreflang set; and `renderHead()`, which writes the same head markup in both runtimes.
- `shared/templates/typographic-fallback.ts` — the silent typographic panel. A pure function of the headline; reads no clock, no environment and no global state.
- `shared/templates/__tests__/head.test.ts` — 19 assertions over the canonical, the edition identity, the rendered head and the panel's silence and escaping.
- `shared/__tests__/purity.test.ts` — the gate proving `shared/` imports no runtime-specific module, imports nothing from `apps/`, `scripts/` or `spikes/`, holds no `package.json` of its own, and that every template module exports a string-returning builder.
- `shared/contract/image-permanence.ts` — the resolution rule the ADR names: `resolveMediaObject()` returns `present` or `expired` and `expired` renders the typographic fallback; `hasMediaExpired()` is the sweep's predicate; `MEDIA_LIFETIME_DAYS` is the one clock.
- `shared/contract/__tests__/image-permanence.test.ts` — the assertions over the lifetime, the resolution and the panel's silence.
- `docs/adr/0003-image-permanence.md` — D-15 through D-19.
- `docs/adr/0004-domain-and-name.md` — D-10 through D-14, the four accepted consequences, and CON-09 and CON-10.
- `scripts/shards/__tests__/shards.test.ts` — the prose-ADR ceiling scan extended from ADR 0001 to ADR 0003 and ADR 0004.

## Decisions Made

- **No per-source override, exercised in the negative.** CONTEXT.md explicitly left the choice to OpenCode. The decision is to exercise it in the negative: an override is exactly the paraphrase-shaped loophole the contract exists to close, so there is no parameter to pass and no config key to read. `applyExcerptBudget.length === 1` is asserted, so a future attempt to add one fails a test.
- **The tighter cap binds, and neither limit is traded for the other.** The plan's own test 6 asked for a 60-word excerpt at exactly 30 percent of a 200-word source — which breaches the 50-word cap that CON-01 states. The algorithm in the plan (`min(maxWords, floor(share × sourceWords))`) is the correct reading, and it is what shipped: the excerpt is 50 words and 25 percent. A separate test now covers the 160-word source where the SHARE cap binds (48 words at exactly 30 percent), so both ceilings are proven independently.
- **The source-share allowance is computed in integer percentage arithmetic.** `Math.round(maxSourceShare * 100)` then integer division. In binary floating point `0.3 * 30` is `8.999999999999998`, and a floor of the wrong side of that error would silently shorten an excerpt by a word — a silent, one-word-wide loophole in the sharpest rule in the project.
- **`pageMeta` and `renderHead` are separate functions in one module.** The plan specified `pageMeta` alone, but the plan's own purity gate requires every module under `shared/templates/` to export a string-returning function, and the architectural reason for the shared layer existing is that both runtimes must emit identical markup. `pageMeta` decides what the metadata IS; `renderHead` decides how it is WRITTEN. Both live in `head.ts` so the two halves cannot drift apart.
- **The image-permanence rule is split out of the template module** into `shared/contract/image-permanence.ts`, which the plan explicitly permitted ("if the executor chooses to split the resolution rule out of the template module"). The rule and the rendering are different concerns, and Phase 5's edge Worker needs the rule without the rendering.
- **The media lifetime is one named constant, not a literal at each use.** `MEDIA_LIFETIME_DAYS` is read by both the serve-time resolution and the sweep's predicate, so the two mechanisms cannot use different clocks.
- **The prose-ADR ceiling scan was widened, not just added to.** The scan already covered ADR 0001. It now covers ADR 0003 and ADR 0004, because both name a ceiling (the R2 Class B allowance D-18 is charged against). ADR 0003 was rewritten to charge the cost against the `r2_class_b_ops_per_month` registry id instead of repeating the number.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's own test 6 asked for a 60-word excerpt, which breaches CON-01's 50-word cap**
- **Found during:** task 1 (writing the contract's test suite)
- **Issue:** The plan's `<behavior>` list says "a 100-word candidate against a 200-word source yields 60 words and a source share of exactly 0.30", and its action section repeats it as `wordCount === 60`. Thirty percent of 200 words is 60, so the two agree — but the plan's own algorithm step 3 is `allowedWords = Math.min(maxWords, Math.floor(maxSourceShare * sourceWordCount))`, which gives `min(50, 60) = 50`, and the plan's must-have truth states "no published excerpt exceeds 50 words". 60 words would have breached the sharper of the project's two hardest content rules.
- **Fix:** implemented the plan's algorithm, which satisfies CON-01's 50-word cap and the 30 percent cap simultaneously. The share cap is proven separately at a 160-word source, where it is the binding one: `floor(0.30 × 160) = 48` words at exactly 0.30. A new test, "applies the fifty-word cap when it binds before the share cap", covers the plan's original scenario and asserts 50 words and a 0.25 share.
- **Files modified:** `shared/contract/__tests__/excerpt-budget.test.ts`
- **Verification:** the randomised sweep over 200 generated candidates asserts `wordCount <= 50`, `charCount <= 320`, `sentenceCount <= 2` and `sourceShare <= 0.30` for every one.
- **Committed in:** `9eb4d43` (test commit, part of task 1)

**2. [Rule 1 - Bug] `Math.floor(0.30 * sourceWordCount)` could silently shorten an excerpt by a word**
- **Found during:** task 1 (implementing the contract)
- **Issue:** `0.3 * 30` is `8.999999999999998` in binary floating point, and `Math.floor` of that is 8, not 9. The allowance is a floor, so a source whose word count lands just below a multiple would have its excerpt shortened by one word — a silent, one-word-wide discrepancy in the sharpest rule in the project.
- **Fix:** the allowance is computed in integer percentage arithmetic: `Math.round(maxSourceShare * 100)` percent, then `Math.floor((sourceWordCount * percent) / 100)`. The constant stays `0.30`; only the arithmetic is made exact.
- **Files modified:** `shared/contract/excerpt-budget.ts`
- **Verification:** the 200-candidate sweep asserts the share never exceeds 0.30 across every source size it generates, and the "caps the excerpt at thirty percent of the source" test asserts an EXACT `0.3` share, which only holds if the arithmetic is exact.
- **Committed in:** `a075eab` (part of task 1)

**3. [Rule 2 - Missing Critical] `head.ts` had no string-returning export, so the plan's own purity gate could not pass**
- **Found during:** task 2 (writing the purity test)
- **Issue:** The plan requires the purity test to "assert every module under `shared/templates/` exports at least one function whose return type is `string`", but the plan also specifies `pageMeta(input): PageMeta` — an object, not a string. The two requirements are jointly unsatisfiable with `head.ts` alone. Leaving it unsatisfiable would have meant either weakening the purity gate (the gate that keeps the shared layer framework-free) or leaving the plan's verification red.
- **Fix:** added `renderHead(meta: PageMeta): string` to `shared/templates/head.ts`. It is not a workaround: it is the string-builder half of a module whose whole architectural purpose is emitting identical markup from two runtimes, and it keeps the canonical guarantee in the RENDERED output rather than only in the data. `pageMeta` is unchanged and still the single source of truth for the values.
- **Files modified:** `shared/templates/head.ts`, `shared/templates/__tests__/head.test.ts`
- **Verification:** the purity gate passes; `renderHead` has four assertions of its own covering the canonical, the title, the hreflang alternates and the escaping of a description carrying markup.
- **Committed in:** `d7846ee` (part of task 2)

**4. [Rule 2 - Missing Critical] The typographic panel was not escaped against untrusted publisher input**
- **Found during:** task 2 (implementing the panel)
- **Issue:** The plan specifies that the panel "must HTML-escape the text it interpolates — the headline comes from a publisher feed and is untrusted input", and names this as threat T-01-15. A headline containing `<script>` rendered unescaped into a story page would be a stored cross-site-scripting vector against every reader of that story.
- **Fix:** the panel escapes `&`, `<`, `>`, `"` and `'` in every interpolated value. `renderHead()` escapes the description and the canonical the same way, for the same reason — a description can carry a publisher's words.
- **Files modified:** `shared/templates/typographic-fallback.ts`, `shared/templates/head.ts`, `shared/templates/__tests__/head.test.ts`
- **Verification:** a test asserts the output contains `&lt;script&gt;` and not `<script>`; a second asserts the same for a description carrying markup.
- **Committed in:** `d7846ee` (part of task 2)

**5. [Rule 3 - Blocking] The purity test's own import path was wrong and the suite could not load**
- **Found during:** task 2 (first run of the purity test)
- **Issue:** `shared/__tests__/purity.test.ts` imported `../../config/editions` — one level too many. The file sits in `shared/__tests__/`, so the config directory is at `../config/editions`. The suite failed to load at all with `Cannot find module`.
- **Fix:** corrected the specifier to `../config/editions`.
- **Files modified:** `shared/__tests__/purity.test.ts`
- **Verification:** the suite loads and passes.
- **Committed in:** `e3d5b88` (test commit, part of task 2)

**6. [Rule 1 - Bug] The site's own name-literal guard caught a comment in `head.ts`**
- **Found during:** task 2 (full test suite run)
- **Issue:** `shared/config/__tests__/site.test.ts` asserts the site-name literal appears in EXACTLY ONE source file in the whole tree — `shared/config/site.ts`. A doc comment in `head.ts` that began "The Meridian page carries the multi-outlet coverage line…" put a second copy of the literal in the tree, and the D-12 guard failed the build. This is the guard working exactly as designed: a second copy of that string is how a per-edition site name creeps back in, and how `<news:name>` ends up mismatched against `news.google.com`.
- **Fix:** reworded the comment to "A Meridian page carries…". The literal now appears exactly once, and the guard passes.
- **Files modified:** `shared/templates/head.ts`
- **Verification:** `shared/config/__tests__/site.test.ts` passes; the full suite is green.
- **Committed in:** `d7846ee` (part of task 2)

**7. [Rule 2 - Missing Critical] The prose-ADR ceiling scan did not cover the two new ADRs**
- **Found during:** task 3 (writing the ADRs)
- **Issue:** Plan 01-04 established a scan that keeps free-tier ceiling literals out of the prose ADRs, because a ceiling written into prose is a second copy of the budget that can drift from the registry. It covered ADR 0001 only. ADR 0003 names the R2 Class B ceiling that D-18's serve-time read is charged against, and ADR 0004 names the ceiling the no-spend rule lives under — so both were newly exposed to exactly the drift the scan exists to prevent, and neither was covered.
- **Fix:** ADR 0003 now charges the cost against the `r2_class_b_ops_per_month` registry id rather than repeating the number, and the scan was widened from ADR 0001 to ADR 0001 + ADR 0003 + ADR 0004.
- **Files modified:** `docs/adr/0003-image-permanence.md`, `scripts/shards/__tests__/shards.test.ts`
- **Verification:** the gate was **observed to fail** — a line containing `10000000` was planted in ADR 0003, the scan reported `docs/adr/0003-image-permanence.md:212 — 10000000` and the test exited 1; the line was removed and the suite passed again.
- **Committed in:** `225a3ca`

---

**Total deviations:** 7 auto-fixed (2 missing critical, 3 bugs, 1 blocking, 1 plan-internal conflict)
**Impact on plan:** All seven are correctness fixes required for the plan's own acceptance criteria to hold, and every one is a case where the plan's requirements collided with each other or with a locked decision. No scope creep: every file created is in the plan's `files_modified` list or is explicitly permitted by the plan's task 3 ("if the executor chooses to split the resolution rule out of the template module"), and no locked decision, requirement or ceiling value was changed.

## Issues Encountered

- **The plan contradicted itself on the excerpt budget's word cap.** Behaviour list and action section said 60 words; the algorithm and the must-have truth said 50. Resolved in favour of the algorithm and the truth, because a 60-word excerpt would have breached CON-01 — the sharpest legal constraint in the project — and because the algorithm is the normative part of the plan. Both readings are now covered by separate tests, so neither cap can regress unnoticed.
- **The purity gate and `pageMeta`'s signature could not both hold.** Resolved by adding `renderHead()` rather than weakening the gate. The gate is what keeps the shared layer framework-free; a weaker purity test is a future phase importing `astro/` into the shared contract and the two tiers drifting into looking like different products.
- **A comment in `head.ts` failed the D-12 site-name guard.** The fix was to reword, not to weaken the guard or to add an exemption. The guard had found exactly the class of drift it exists to find, in the very file that depends on the value.
- **The verification command in the plan checks for the literal string `The Meridian` in ADR 0004.** The ADRs are outside the scanned roots of the site-name guard (`shared`, `apps`, `scripts`, `spikes`, `config`), so the ADR is unaffected by the single-copy rule and the plan's verification passes as written.

## Known Stubs

| Stub | Location | Reason | Resolved by |
|------|----------|--------|-------------|
| `pageMeta` does not compute the hreflang set — it carries whatever it is given | `shared/templates/head.ts` | Deliberate. The India English / India Hindi rule is Phase 6's, and the plan is explicit that Phase 1 only carries the slot. | Phase 6 — the digest, trust layer and SEO surface, which populates the alternates. |
| `renderHead` emits the title, description, canonical and hreflang links only | `shared/templates/head.ts` | Deliberate. The rest of the `<head>` — the stylesheet link, the Open Graph tags, the `<news:name>` — is Phase 4's and Phase 6's. | Phase 4 (design system) and Phase 6 (SEO surface), which read the same `pageMeta()` output. |
| The typographic panel has classes but no styles | `shared/templates/typographic-fallback.ts` | Deliberate. The panel's VISUAL treatment is Phase 4's, inside the broadsheet design system. Phase 1 fixes that it is a pure, silent, escaped string builder. | Phase 4 — the broadsheet design system. |
| The media lifetime constant is 365 days | `shared/contract/image-permanence.ts` | Matches the R2 lifecycle rule created in plan 01-04 (`media/` at 365 days). D-15 states the clock in months; the value is the same clock in the unit R2 takes. | Nothing — it is correct as it stands, and both the rule and the constant agree. |

No other stub was introduced: every file created is complete, every function is exercised by a test, and no data source is left unwired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: untrusted_publisher_text_reaches_html | `shared/templates/typographic-fallback.ts`, `shared/templates/head.ts` | A publisher headline and a publisher-derived description are interpolated into HTML. Both are escaped for `&`, `<`, `>`, `"` and `'`, and both are asserted by tests. The escape is the mitigation for T-01-15 and it is tested rather than assumed. |
| threat_flag: none_raised | — | No new network endpoint, no new authentication path, no new schema change and no new file-access pattern was introduced by this plan. The only new I/O surface is none: every module added here is pure and takes its inputs as arguments. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 01-06 (spikes S-1 through S-5) can start.** The excerpt budget, the shared templates and the two ADRs are landed and committed; nothing in that plan depends on them.
- **Phase 2 inherits a contract rather than inventing one.** The normaliser calls `applyExcerptBudget()` and then `assertExcerptWithinBudget()` over every excerpt it is about to store; `toStoredExcerpt()` produces the `StoryExcerpt` shape the database holds. Phase 2 must NOT build its own excerpt logic, and the `ExcerptBudgetError` gives it the full list of broken limits on failure.
- **Phase 4 owns the panel's visuals.** `typographicFallback()` emits classed markup with no styles attached; Phase 4 gives it the broadsheet treatment inside the design system. The rule that it must READ as a deliberate design element and carry no error wording is now a test, so Phase 4 cannot quietly add a caption.
- **Phase 5 owns the serve-time resolution and the story page.** `resolveMediaObject()` is the rule the edge Worker calls, and `renderHead()` writes the same head markup the static build writes. Phase 5 also renders the publisher attribution links that CON-10 governs — `rel="noopener"`, never `nofollow` or `sponsored`.
- **Phase 6 must plan Publisher Center as configuration, not as an enrolment gate.** ADR 0004 states the consequence of D-10 plainly: Google News enrolment, Publisher Center URL verification, the News Showcase panel and the AdSense path all stay closed until the domain exists, because a `workers.dev` subdomain cannot provide the DNS TXT record Publisher Center requires. A Phase 6 plan that assumes the enrolment is completable on the subdomain will stall at that step.
- **Phase 7 owns the sweep and the domain migration.** The sweep's predicate is `hasMediaExpired()`. The migration uses 301 redirects, never canonicals, with the redirect map generated from the same source as the sitemap so the two cannot drift.
- **One thing to carry forward:** the excerpt contract is truncation-only and that is now structural. A future phase that needs a "cleaner" or "shorter" excerpt must shorten it further, never rewrite it — and the contract's own prefix check will fail loudly if anyone tries.
- **One thing to carry forward:** ADR 0003 charges D-18's cost against the `r2_class_b_ops_per_month` ceiling, and the Phase 7 audit Worker reads the same registry. The serve-time image check must be counted there, or the audit will under-report R2 Class B operations by one read per image view.

---

## Self-Check: PASSED

Every file, commit and claim in this summary was verified against the working tree.

- **Files:** all 10 created files and 1 modified file exist on disk. `missing_count=0`.
- **Commits:** all six commits exist in `git log` — `9eb4d43`, `a075eab`, `e3d5b88`, `d7846ee`, `0ecdaad`, `225a3ca`.
- **RED states observed:** task 1's suite fails with the implementation moved aside (`Failed Suites 1 failed (1) / Tests no tests`); task 2's two suites fail the same way. Neither is a green suite with the implementation present.
- **`npx vitest --run shared/contract/__tests__/excerpt-budget.test.ts`:** exits 0 — 22 tests.
- **`npx vitest --run shared/templates/__tests__/head.test.ts shared/__tests__/purity.test.ts`:** exits 0 — 27 tests.
- **`npx vitest --run shared/contract/__tests__/image-permanence.test.ts`:** exits 0 — 6 tests.
- **`npm test -- --run` (full suite):** exits 0 — 11 test files, 123 tests, all passing. The suite was 68 tests across 7 files before this plan.
- **`npm run typecheck`:** exits 0.
- **`npm run build`:** exits 0 — the Astro build still succeeds.
- **Plan verification command:** prints `ADR 0003 + 0004 OK` and exits 0.
- **The prose-ADR scan gate was observed to fail:** a line containing `10000000` was planted in ADR 0003, the scan reported `docs/adr/0003-image-permanence.md:212 — 10000000` and the test exited 1; the line was removed and the suite passed again.
- **The site-name single-copy guard holds:** the site-name literal appears in exactly one source file, `shared/config/site.ts`, asserted by `shared/config/__tests__/site.test.ts`.
- **The excerpt contract's limits hold across a randomised sweep:** 200 generated candidates of varying length, word length and sentence structure, every one asserted inside all four limits.

---

*Phase: 01-foundation-free-tier-contract-architecture-decisions*
*Completed: 2026-10-21*
