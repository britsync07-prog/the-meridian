# Phase 1 — Post-Planning Gap Analysis

**Generated:** 2026-10-20
**Scope:** REQUIREMENTS.md IDs mapped to Phase 1 in the ROADMAP traceability table, plus every trackable decision in `01-CONTEXT.md`.
**Command note:** `gsd-tools gap-analysis` is not exposed by the installed `gsd-tools` build (available commands: `state`, `resolve-model`, `find-phase`, `commit`, `verify-summary`, `verify`, `frontmatter`, `template`, `generate-slug`, `current-timestamp`, `list-todos`, `verify-path-exists`, `config-ensure-section`, `config-new-project`, `init`, `workstream`, `docs-init`). This report was produced from the same underlying sources — `gsd-sdk query requirements.extract-from-plans` and `gsd-sdk query check.decision-coverage-plan` — with word-boundary matching.

## REQUIREMENTS.md

| Source | Item | Status |
|--------|------|--------|
| REQUIREMENTS.md | OPS-01 | ✓ Covered — plan 01-03 |
| REQUIREMENTS.md | OPS-04 | ✓ Covered — plan 01-03 |
| REQUIREMENTS.md | OPS-14 | ✓ Covered — plan 01-02 |
| REQUIREMENTS.md | MED-08 | ✓ Covered — plan 01-04 |

**Phase requirement coverage: 4/4**

### Requirements also advanced by Phase 1 outside the phase's own four

These are recorded in `.planning/REQUIREMENTS.md`'s traceability table as Phase 1 *decision* requirements, and each plan that advances them cites it in its `requirements` field.

| Source | Item | Status |
|--------|------|--------|
| REQUIREMENTS.md | CON-01 … CON-05 | ✓ Covered — plan 01-05 (excerpt budget written as a coded contract; the normaliser and its full unit test land in Phase 2) |
| REQUIREMENTS.md | CON-09 | ✓ Covered — plan 01-05 (canonical policy decided and enforced in `pageMeta()`) |
| REQUIREMENTS.md | CON-10 | ✓ Covered — plan 01-05 (attribution-link policy recorded in ADR 0004) |
| REQUIREMENTS.md | ING-01, ING-02, ING-10 | ✓ Covered — plans 01-04 (ING-02 decided in the delivery-model ADR) and 01-06 (ING-01/ING-10 exercised by spikes S-2 and S-3) |
| REQUIREMENTS.md | OPS-07, OPS-09, OPS-10 | ✓ Covered — plan 01-06 (S-5 feeds the OPS-07 deploy budget; S-4 measures the OPS-09/OPS-10 build) |
| REQUIREMENTS.md | OPS-12, PUB-12 | ✓ Covered — plan 01-04 (tier split and the one-hostname locale-prefix rule decided in the delivery-model ADR) |
| REQUIREMENTS.md | DSN-12 | ✓ Covered — plan 01-01 (`compressHTML: true` in the Astro config) |
| REQUIREMENTS.md | SEO-13 | ✓ Covered — plan 01-01 (one site name in one config value) |

## CONTEXT.md

| Source | Item | Status |
|--------|------|--------|
| CONTEXT.md | D-01 | ✓ Covered — plan 01-04 |
| CONTEXT.md | D-02 | ✓ Covered — plan 01-01 |
| CONTEXT.md | D-03 | ✓ Covered — plan 01-01 |
| CONTEXT.md | D-04 | ✓ Covered — plan 01-04 |
| CONTEXT.md | D-05 | ✓ Covered — plan 01-03 |
| CONTEXT.md | D-06 | ✓ Covered — plan 01-04 |
| CONTEXT.md | D-07 | ✓ Covered — plan 01-03 |
| CONTEXT.md | D-08 | ✓ Covered — plan 01-03 |
| CONTEXT.md | D-09 | ✓ Covered — plan 01-03 |
| CONTEXT.md | D-10 | ✓ Covered — plan 01-05 |
| CONTEXT.md | D-11 | ✓ Covered — plan 01-05 |
| CONTEXT.md | D-12 | ✓ Covered — plan 01-01, plan 01-05 |
| CONTEXT.md | D-13 | ✓ Covered — plan 01-01, plan 01-05 |
| CONTEXT.md | D-14 | ✓ Covered — plan 01-05 |
| CONTEXT.md | D-15 | ✓ Covered — plan 01-04 |
| CONTEXT.md | D-16 | ✓ Covered — plan 01-05 |
| CONTEXT.md | D-17 | ✓ Covered — plan 01-05 |
| CONTEXT.md | D-18 | ✓ Covered — plan 01-03, plan 01-05 |
| CONTEXT.md | D-19 | ✓ Covered — plan 01-04 |
| CONTEXT.md | D-20 | ✓ Covered — plan 01-01 |

**Decision coverage: 20/20** — confirmed by `gsd-sdk query check.decision-coverage-plan` (`passed: true`).

## Deferred items (excluded, not gaps)

| Source | Item | Status |
|--------|------|--------|
| CONTEXT.md — Deferred Ideas | A free commercially-usable weather provider to replace Open-Meteo | Deferred to a Phase 7 research task, before any revenue exists (D-09) |
| CONTEXT.md — Deferred Ideas | The custom domain purchase | Deferred past launch by D-10; the migration requirements are recorded in ADR 0004 (plan 01-05) |

## Result

**0 items not covered by any plan.**

The phase is fully planned: all four phase requirements, all twenty locked decisions, all five ROADMAP Success Criteria and all nine Phase 1 work items are assigned to a plan, and no plan depends on an item that does not exist yet.

---
