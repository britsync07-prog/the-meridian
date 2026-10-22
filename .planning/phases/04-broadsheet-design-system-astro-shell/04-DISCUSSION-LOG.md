# Phase 4: Broadsheet Design System & Astro Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-23
**Phase:** 4-Broadsheet Design System & Astro Shell
**Areas discussed:** Font selection, Front-page grid anatomy, Dark theme strategy, Shell routing table

---

## Font Selection

### Headline/Display Face

| Option | Description | Selected |
|--------|-------------|----------|
| Playfair Display | High-contrast ink-trap cuts, wide optical range from 6-pt captions to 120-pt mastheads; strong editorial identity. Regular/Bold/Italic available. SIL OFL. | ✓ |
| Lora | More traditional text face, designed for screens. Slightly less headline drama but comfortable at body size. Regular/Bold/Italic. SIL OFL. | |
| Noto Serif | Universal serif with excellent Latin+Devanagari coverage in one family. Trades editorial character for neutrality. | |

**User's choice:** Playfair Display
**Notes:** Recommended option selected. Valued for its strong editorial identity and optical range.

---

### Devanagari Serif

| Option | Description | Selected |
|--------|-------------|----------|
| Noto Serif Devanagari | Matching serif register, pairs cleanly alongside Playfair Display. Regular/Bold/SemiBold. Full Unicode Devanagari range. SIL OFL. | ✓ |
| Tiro Devanagari | Newer, scholarly-grade Devanagari with traditional proportions. More authentic to classical Hindi print but less screen-tested. SIL OFL. | |
| Baloo 2 | Rounded, modern feel. Not a match for Playfair Display's register; better for UI chrome. | |

**User's choice:** Noto Serif Devanagari
**Notes:** Recommended option selected.

---

### Body/Chrome Typeface

| Option | Description | Selected |
|--------|-------------|----------|
| System UI stack | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Zero network weight; Playfair Display loads only for headlines. | ✓ |
| Playfair Display across all roles | Maximum typographic unity but adds ~80KB+ for body sizes where difference from system UI is minor. | |
| Source Serif 4 | A second OFL face for body text; richer but another font asset and CLS surface. | |

**User's choice:** System UI stack for body + UI chrome
**Notes:** Recommended option selected. Keeps font loading lean.

---

### Font Delivery Format

| Option | Description | Selected |
|--------|-------------|----------|
| WOFF2 only + font-display: swap + size-adjust fallback | Universal browser support; size-adjust holds CLS under 0.1. | ✓ |
| WOFF2 + WOFF | Covers IE11 and early Android. ~25% file size overhead per face. No audience benefit in 2026. | |
| Variable font | One file for all weights; slightly larger initial download. Worth it only if more than 3 weight stops are used. | |

**User's choice:** WOFF2 only with `font-display: swap` and `size-adjust` fallback
**Notes:** Recommended option selected.

---

## Front-page Grid Anatomy

### Column Count

| Option | Description | Selected |
|--------|-------------|----------|
| 5-column grid (5→3→1) | Asymmetric layouts (3+2, 2+3, 4+1) typical of quality daily papers; 5 divides cleanly at 1280px. | ✓ |
| 4-column grid (4→2→1) | More common in digital news; symmetric but risks the 'two card row' look. | |
| 6-column grid (6→3→1) | Maximum flexibility but generates many more utility class combinations. | |

**User's choice:** 5-column broadsheet grid, collapsing 5→3→1
**Notes:** Recommended option selected. Enables the asymmetric editorial layouts characteristic of printed papers.

---

### Masthead Behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky 56px masthead, paper-white background | Contains edition label, site name, date. Narrow; stays in view on scroll. | ✓ |
| Static masthead (not sticky) | More traditional feel; simpler DSN-07 focus implementation. User loses context on scroll. | |
| Tall masthead (96–120px) scrolling away + slim 40px sticky nav | Richer at top-of-page but doubles the layout surface to test. | |

**User's choice:** Sticky masthead, fixed height 56px, paper-white background
**Notes:** Recommended option selected.

---

### Above-the-Fold Lead Story

| Option | Description | Selected |
|--------|-------------|----------|
| Single dominant lead story spanning full width | Strong newspaper splash; top-trending story occupies full-width headline + deck + image. Classic broadsheet. | ✓ |
| 2-up lead stories side by side | More balanced but approaches the 'two cards' look the design rules reject. | |
| Lead story + 3-item vertical stack aside (4+1) | Mimics compact broadsheet right-column briefs. More information density above the fold. | |

**User's choice:** Single dominant lead story spanning full width
**Notes:** Recommended option selected. Classic broadsheet 'splash' treatment.

---

### Section/Story Dividers

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal hairline rules only | `border-t` hairlines; no vertical rules; white space handles column separation. Purest broadsheet look. | ✓ |
| Hairline rules + one vertical rule separating lead from secondary | Adds one vertical rule on front page only; FT/Guardian-style. | |
| Column rules everywhere (horizontal + vertical) | Maximum columnar structure; heavy on mobile; large CSS surface area. | |

**User's choice:** Horizontal rule dividers only
**Notes:** Recommended option selected. Keeps the visual language clean and unambiguous.

---

## Dark Theme Strategy

### Theme Control Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| `prefers-color-scheme` media query only | OS-level setting; no JS, no localStorage, no toggle. CLS-safe. Consistent with DSN-09. | ✓ |
| User-controlled toggle + localStorage | Small inline `<script>` in `<head>` to avoid FOUC; adds ~500B JS per page. | |
| Both (OS default + user override) | Most common in 2026 news sites; adds JS, localStorage, and class management. | |

**User's choice:** `prefers-color-scheme` media query only
**Notes:** Recommended option selected. Zero JS shipped; aligns with the site's zero-JS philosophy.

---

### Token Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Both themes in one `@theme` block with inline `@media` overrides | Single source of truth; Tailwind v4 native approach. | ✓ |
| Light in `@theme`, dark overrides in separate `@layer utilities` | Slight separation; minimal practical difference. | |
| Light in `@theme`, dark in separate `dark.css` | Split source of truth; harder to maintain. | |

**User's choice:** Both themes in one `@theme` block with `@media (prefers-color-scheme: dark)` overrides inline
**Notes:** Recommended option selected.

---

### Base Palette Values

| Option | Description | Selected |
|--------|-------------|----------|
| Paper-white #FAFAF7 / Ink-black #1A1A1A / Accent #C0392B (broadsheet red-orange); Dark: #111111 bg / #F0EDE6 text | Warm off-whites match print paper reference. | ✓ |
| Pure white #FFFFFF / Pure black #000000 / Accent TBD | Maximum contrast; loses paper texture feel. | |
| Agent decides | Trust the design-taste-frontend skill. | |

**User's choice:** Paper-white `#FAFAF7` + Ink-black `#1A1A1A`; dark: `#111111` bg + `#F0EDE6` text; Accent: `#C0392B`
**Notes:** Warm palette chosen over pure white/black. Broadsheet red-orange accent is traditional in quality newspaper design.

---

## Shell Routing Table

### Layout Types to Scaffold

| Option | Description | Selected |
|--------|-------------|----------|
| All 5 layout types fully scaffolded with grid + landmarks + spacing | FrontLayout, SectionLayout, StoryLayout, ArchiveLayout, TopicEntityLayout — all with correct structure; Phase 5 fills slots. | ✓ |
| Front + section only; story/archive/topic as pass-through stubs | Less work now; Phase 5 retrofits grid decisions. | |
| Single generic Base.astro; Phase 5 defines all layouts | Simplest; defers column grid definition entirely. | |

**User's choice:** Full layout types scaffolded as stubs, content slots empty
**Notes:** Recommended option selected. Enables Phase 5 to immediately test CWV against real layouts.

---

### DSN-13 Verification (Core Web Vitals)

| Option | Description | Selected |
|--------|-------------|----------|
| Lighthouse CI against the shell in Phase 4 test suite | Verifiable before content arrives; satisfies DSN-13 for the shell baseline. | ✓ |
| Manual Lighthouse run in Phase 5 against real content | Defers CWV verification; Phase 4 could ship a CWV-failing font load silently. | |
| Both: Phase 4 shell gate + Phase 5 real story pages gate | Most thorough; increases Phase 4 scope. | |

**User's choice:** Lighthouse CI check in the Phase 4 test suite against the shell
**Notes:** Recommended option selected. Early gate catches font-loading CWV issues before Phase 5.

---

### DSN-12 Regression Detection (Headline Spacing)

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright visual regression snapshots at 360px and 1280px | PNG diff catches headline spacing, theme-lock, and 360px usability regressions on every CI run. | ✓ |
| Storybook component catalogue | Interactive but adds a build step; zero-JS concern; over-engineered for a static site. | |
| No automated visual test; manual review only | Fragile; ROADMAP success criteria explicitly requires a visual-regression check. | |

**User's choice:** Visual regression via Playwright snapshots at 360px and 1280px
**Notes:** Recommended option selected.

---

### Expired-Image Typographic Panel

| Option | Description | Selected |
|--------|-------------|----------|
| Typographic pull-quote panel — headline's opening words in Playfair Display italic on paper-white, no border, no label | Reads as intentional editorial element, not missing-image state. | ✓ |
| Dark-ink initials block — large initial capital in Playfair Display, ink-black, centered | More abstract; still deliberate. | |
| Tinted placeholder with dateline text — off-white panel with outlet name and date in small caps | Reads more clearly as 'image not available'. | |

**User's choice:** Typographic pull-quote panel
**Notes:** Recommended option selected. Aligns with Phase 1 D-16 intent: "reads as a deliberate design element, not an error."

---

## Agent's Discretion

- Exact Tailwind v4 token names within the documented palette values
- Glyph subsetting strategy (unicode-range partitioning between Latin, Latin-Extended, Devanagari)
- Exact breakpoint pixel values for the 5→3→1 column collapse
- Hairline rule weight in pixels and its token name
- Masthead internal layout (flex vs. grid) within the 56px height constraint
- Focus indicator visual specifics (ring color, offset, exact width ≥ 2px from DSN-07)

## Deferred Ideas

None — discussion stayed within phase scope.
