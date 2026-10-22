# Phase 4: Broadsheet Design System & Astro Shell - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The visual language of a printed broadsheet (paper-white, ink-black, one accent, rules not cards) exists as a Tailwind v4 `@theme` token set, a component library, and an Astro shell that meets WCAG 2.2 AA and Core Web Vitals — fully scaffolded before any real content arrives.

This phase delivers:
- Tailwind v4 `@theme` token set: warm paper-white/ink-black palette, single accent, type scale, spacing, hairline rules, complete light and dark theme driven by `prefers-color-scheme`.
- Self-hosted OFL fonts: Playfair Display (Regular/Bold/Italic) as the headline/display face; Noto Serif Devanagari (Regular/Bold) for Hindi; system-UI stack for body/chrome; WOFF2-only delivery with `font-display: swap` and `size-adjust` fallback.
- Broadsheet layout primitives: 5-column grid collapsing 5→3→1; sticky 56px masthead; horizontal hairline rule dividers only; no card containers; full-width single dominant lead story splash; typographic expired-image fallback panel.
- Five Astro layout types fully scaffolded with correct landmark structure, heading hierarchy, and CSS grid hooks: `FrontLayout`, `SectionLayout`, `StoryLayout`, `ArchiveLayout`, `TopicEntityLayout`.
- Accessibility baseline: skip-to-content link, focus-visible not obscured by sticky masthead (DSN-07), contrast in both themes, semantic landmarks, `h1`→`h3` hierarchy, `prefers-reduced-motion`, 360px usability.
- CI gates: Lighthouse CI check against the shell (LCP < 2.5s, INP < 200ms, CLS < 0.1) and Playwright visual regression snapshots at 360px and 1280px for headline spacing and theme-lock regression detection.

Out of boundary: content data flowing into the layouts (Phase 5), daily digests and newsletter (Phase 6), operational hardening (Phase 7). The expired-image serve-time R2 check and periodic sweep (Phase 1 D-17) are also out of scope — this phase defines only the visual panel itself.

</domain>

<decisions>
## Implementation Decisions

### Typography & Font Selection

- **D-01:** The headline and display face is **Playfair Display** (Regular, Bold, Italic). — **Reversibility:** costly — changing the display face requires updating every heading token and all visual regression baselines.
- **D-02:** The Devanagari serif (Hindi edition) is **Noto Serif Devanagari** (Regular, Bold, SemiBold). Pairs with Playfair Display's editorial register without clashing; full Unicode Devanagari range coverage. SIL OFL.
- **D-03:** Body text and all UI chrome use the **system-UI sans-serif stack**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Zero network weight for body text; Playfair Display loads only for headlines and display roles.
- **D-04:** Fonts are delivered as **WOFF2 only**, with `font-display: swap` and a `size-adjust` descriptor on the fallback stack to hold CLS under 0.1. No WOFF, no TTF — those formats add file weight with no audience benefit in 2026.

### Colour Palette & Theming

- **D-05:** Light theme base palette: **paper-white `#FAFAF7`** (background), **ink-black `#1A1A1A`** (text), single accent **broadsheet red-orange `#C0392B`**. — **Reversibility:** costly — the palette is baked into visual regression snapshots and any downstream design assets.
- **D-06:** Dark theme overrides: **ink-dark `#111111`** (background), **off-white `#F0EDE6`** (text). Warm off-whites match the print paper reference and avoid the harsh blue-white of pure `#FFFFFF`/`#000000`.
- **D-07:** Theme control is **`prefers-color-scheme` media query only** — no JS toggle, no localStorage, no class on `<html>`. Zero JS shipped. CLS-safe, FOUC-proof, consistent with DSN-09 (`prefers-reduced-motion` uses the same pattern).
- **D-08:** Both themes live in **one `@theme` block** in `global.css` with `@media (prefers-color-scheme: dark)` overrides inline. Single source of truth; the Tailwind v4 native approach.
- **D-09:** The page theme is **locked** — no section inverts against it (DSN-03). Section differentiation uses only horizontal hairline rules, increased negative space, and section label typography.

### Grid & Layout Architecture

- **D-10:** The base grid is **5 columns**, collapsing 5→3→1 at breakpoints (1280px desktop, 768px tablet, 640px single-column). The 5-column base enables asymmetric layouts (3+2, 2+3, 4+1) typical of quality daily papers. — **Reversibility:** costly — the column count is encoded in every layout template and the visual regression baselines.
- **D-11:** The masthead is **sticky at 56px**, paper-white background. Contains: edition label (country), site name ("The Meridian"), and today's date. The skip-to-content link precedes the masthead in DOM order and is the first Tab stop (DSN-06). The focus indicator is never obscured by the sticky masthead (DSN-07).
- **D-12:** The above-the-fold lead story treatment is a **single dominant splash** spanning full content width: headline + deck + image, no column split. The day's top-trending story only. Below the splash, the 5-column grid resumes.
- **D-13:** Section and story divisions use **horizontal hairline rules only** (`border-t` at the token-defined hairline weight). No vertical column rules anywhere. Column separation is handled by white space and the grid gap alone.

### Shell Layout Scaffolding

- **D-14:** Phase 4 fully scaffolds **all five layout types** with correct landmark structure, heading hierarchy, and CSS grid hooks — content `<slot>`s are empty, filled by Phase 5:
  - `FrontLayout.astro` — 5-column grid, splash zone, section grid, masthead, footer
  - `SectionLayout.astro` — masthead, section header `<h1>`, story list area
  - `StoryLayout.astro` — masthead, article landmark, `<h1>` headline, time element, body slot
  - `ArchiveLayout.astro` — masthead, date header, chronological story list
  - `TopicEntityLayout.astro` — masthead, topic/entity `<h1>`, story list
- **D-15:** The **expired-image typographic fallback panel** is: the headline's opening words set large in Playfair Display italic on the paper-white background, no border, no label. It reads as an intentional editorial pull-quote element, not a missing-image state. — **Reversibility:** reversible — visual only; Phase 1 D-17's serve-time R2 check is independent.

### CI Verification Gates

- **D-16:** **Lighthouse CI** runs against the shell stub pages as part of the Phase 4 test suite, asserting LCP < 2.5s, INP < 200ms, CLS < 0.1 (DSN-13). The CI gate runs before Phase 5 receives real content.
- **D-17:** **Playwright visual regression snapshots** of the front-page stub at 360px and 1280px catch: DSN-03 (no section theme inversion), DSN-10 (360px single-column usability), and DSN-12 (headline inter-word spacing not stripped). PNG diffs fail the CI build on any change.

### Agent's Discretion

- Exact Tailwind v4 token names (e.g., `--color-paper`, `--color-ink`, or similar) within the documented palette values.
- Glyph subsetting strategy for Playfair Display and Noto Serif Devanagari (unicode-range partitioning between Latin, Latin-Extended, and Devanagari blocks).
- Exact breakpoint pixel values for the 5→3→1 column collapse (within the 640px single-column requirement from DSN-10).
- The hairline rule weight in pixels (typically 0.5px–1px) and its token name.
- Exact masthead internal layout (flex, grid) and how the edition label, site name, and date are arranged within the 56px height.
- The visual specifics of the focus indicator (ring color derived from the accent token, offset, and exact pixel width ≥ 2px).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Constraints
- `.planning/REQUIREMENTS.md` — Requirements DSN-01 through DSN-13 (all Phase 4's requirements); DSN-12 is already complete.
- `.planning/ROADMAP.md` — Phase 4 goal, work items, success criteria (5 specific success criteria for this phase), and the `UI hint: yes` flag.

### Architecture and Prior Decisions
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md` — D-16 (expired-image silent typographic panel), D-17 (serve-time R2 check — out of this phase's scope but defines the interface the panel must satisfy), free-tier permanent constraint (D-05).
- `.planning/phases/03-curation-core-clustering-ranking-enrichment/03-CONTEXT.md` — D-10 (Editor's Picks gate: ≥2 distinct outlets) and D-12 (trending score persisted in D1) — the data contract the front-page layout must accommodate.

### Astro Configuration (already live)
- `apps/site/astro.config.mjs` — `compressHTML: true`, `experimental.incrementalBuild`, `build.concurrency: 1`, `@tailwindcss/vite` plugin — all locked; do not change.
- `apps/site/src/styles/global.css` — Current entry point: `@import "tailwindcss";` only. All `@theme` tokens go here.
- `apps/site/src/layouts/Base.astro` — Existing base shell; the five layout types extend or replace this.

### Design System Governance
- The `design-taste-frontend` skill (variance 7, motion intensity 3, visual density 7) governs every visual decision in this phase. The skill is invoked by name; the planner must reference it in every layout and component task.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/site/astro.config.mjs` — Fully configured; the `@tailwindcss/vite` plugin is already wired. No changes needed to the Astro config in this phase.
- `apps/site/src/layouts/Base.astro` — Thin shell with `SITE_NAME` import from `shared/config/site.ts`, `htmlLang` prop, and a `<slot />`. The five layout types will import or extend this.
- `apps/site/src/styles/global.css` — Bare `@import "tailwindcss";`. This is where the full `@theme` token block lands.

### Established Patterns
- **One `package.json`, no workspace protocol** (Phase 1 D-20) — all imports must work from the single root lockfile. Playfair Display and Noto Serif Devanagari font files are copied into `apps/site/public/fonts/` and referenced via `@font-face` in `global.css`.
- **No Cloudflare adapter** — the astro.config comment explicitly documents why; this pattern must not be broken.
- **`shared/config/site.ts`** exports `SITE_NAME` and `SITE_ORIGIN` — the masthead and Base.astro already consume these; all layouts should too.

### Integration Points
- The five layout types produce the HTML scaffold that Phase 5's `getStaticPaths()` pages will slot content into. Every layout's landmark structure and heading hierarchy must be final in this phase.
- The expired-image typographic panel is a Tailwind utility composition — likely an `.image-fallback` component class in `global.css`. Phase 5's story templates reference it by class name.
- The Lighthouse CI gate requires a `wrangler dev`-served or `astro dev`-served URL; the CI workflow must start the dev server before running Lighthouse.

</code_context>

<specifics>
## Specific Ideas

- **Playfair Display as the masthead display face** — the high-contrast ink-trap cuts give the site name "The Meridian" the same optical weight as a printed broadsheet masthead, especially at 40–60px.
- **Warm off-whites over pure white** — `#FAFAF7` light / `#F0EDE6` dark text avoids the harsh blue-white tones that make dark-mode news sites look like developer tools rather than newspapers.
- **Expired-image panel as a pull-quote** — the headline's opening words in Playfair Display italic, full-bleed on the paper-white panel, should read like a classified ad or a section break rather than a placeholder. No "image archived" label.
- **5-column asymmetric layouts** — the 3+2 split (lead column left, secondary stories right) mirrors the Financial Times homepage; the 4+1 split (lead + right briefs) mirrors the front page of a compact broadsheet.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Broadsheet Design System & Astro Shell*
*Context gathered: 2026-10-23*
