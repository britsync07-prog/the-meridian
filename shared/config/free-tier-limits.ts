/**
 * OPS-01: the only module permitted to read a free-tier ceiling.
 *
 * D-05 makes the free tier a permanent hard ceiling, so a ceiling is a design
 * input rather than an operational afterthought: the code that depends on one
 * has to know it before the ceiling is reached. Every module that needs a
 * ceiling reads it from here, and a ceiling hardcoded anywhere else has
 * already drifted from the budget.
 *
 * The registry is validated at import time, so a malformed or hand-edited
 * registry throws here rather than quietly serving a wrong ceiling.
 */

import { z } from 'zod';

import registryJson from '../../config/free-tier-limits.json';

/* ------------------------------------------------------------------------- */
/* Schema                                                                    */
/* ------------------------------------------------------------------------- */

const limitSchema = z.strictObject({
  id: z.string().min(1),
  resource: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  period: z.string().min(1),
  source_url: z.url(),
  verified_on: z.iso.date(),
  enforcement: z.enum(['enforced', 'informational']),
});

const triggerSchema = z.strictObject({
  id: z.string().min(1),
  metric: z.string().min(1),
  threshold: z.number(),
  unit: z.string().min(1),
  comparison: z.string().min(1),
  source_requirement: z.string().min(1),
  decision_ref: z.string().min(1),
});

const nonConformingDependencySchema = z.strictObject({
  id: z.string().min(1),
  requirement_ref: z.string().min(1),
  issue: z.string().min(1),
  standing_obligation: z.string().min(1),
  explicitly_excluded: z.string().min(1),
});

const decisionRuleSchema = z.strictObject({
  version: z.number().int().positive(),
  updated_on: z.iso.date(),
  triggers: z.array(triggerSchema).length(3),
  standing_disposition: z.literal('never_purchase'),
  standing_decision_ref: z.string().min(1),
  standing_decision_text: z.string().min(1),
  response_mechanisms: z.array(z.string().min(1)).length(3),
  response_decision_ref: z.string().min(1),
  request_ceiling_is_a_permanent_wall_ref: z.string().min(1),
  known_non_conforming_dependency: nonConformingDependencySchema,
});

const registrySchema = z.strictObject({
  version: z.number().int().positive(),
  updated_on: z.iso.date(),
  limits: z.array(limitSchema).min(1),
  paid_plan_decision_rule: decisionRuleSchema,
});

/* ------------------------------------------------------------------------- */
/* Public types                                                              */
/* ------------------------------------------------------------------------- */

/** One ceiling, as the registry records it. */
export interface FreeTierLimit {
  readonly id: string;
  readonly resource: string;
  readonly value: number;
  readonly unit: string;
  readonly period: string;
  readonly source_url: string;
  readonly verified_on: string;
  readonly enforcement: 'enforced' | 'informational';
}

/** The ceiling itself, as a caller needs it. */
export interface LimitValue {
  readonly value: number;
  readonly unit: string;
  readonly period: string;
  readonly source_url: string;
  readonly verified_on: string;
}

/** One OPS-04 trigger and the decision it points at. */
export interface DecisionTrigger {
  readonly id: string;
  readonly metric: string;
  readonly threshold: number;
  readonly unit: string;
  readonly comparison: string;
  readonly source_requirement: string;
  readonly decision_ref: string;
}

/** The standing decision rule, in the same file as the budget it governs. */
export interface PaidPlanDecisionRule {
  readonly version: number;
  readonly updated_on: string;
  readonly triggers: readonly DecisionTrigger[];
  readonly standing_disposition: 'never_purchase';
  readonly standing_decision_ref: string;
  readonly standing_decision_text: string;
  readonly response_mechanisms: readonly string[];
  readonly response_decision_ref: string;
  readonly request_ceiling_is_a_permanent_wall_ref: string;
  readonly known_non_conforming_dependency: {
    readonly id: string;
    readonly requirement_ref: string;
    readonly issue: string;
    readonly standing_obligation: string;
    readonly explicitly_excluded: string;
  };
}

/* ------------------------------------------------------------------------- */
/* Load                                                                      */
/* ------------------------------------------------------------------------- */

const parsed = registrySchema.safeParse(registryJson);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new Error(`config/free-tier-limits.json failed validation — ${problems}`);
}

const registry = parsed.data;

/* ------------------------------------------------------------------------- */
/* Exports                                                                   */
/* ------------------------------------------------------------------------- */

/** Every ceiling the project depends on, in the registry's own order. */
export const FREE_TIER_LIMITS: readonly FreeTierLimit[] = registry.limits;

/** The standing decision rule. It lives beside the budget so the two cannot drift. */
export const PAID_PLAN_DECISION_RULE: PaidPlanDecisionRule = registry.paid_plan_decision_rule;

/**
 * Read one ceiling by id.
 *
 * An unknown id throws rather than returning undefined: a caller that asked for
 * a ceiling the registry does not hold has a bug, and a silent undefined would
 * turn that bug into a comparison against nothing.
 */
export function limit(id: string): LimitValue {
  const found = FREE_TIER_LIMITS.find((entry) => entry.id === id);
  if (!found) {
    const known = FREE_TIER_LIMITS.map((entry) => entry.id).join(', ');
    throw new Error(`Unknown free-tier limit id: "${id}". Known ids: ${known}`);
  }
  return {
    value: found.value,
    unit: found.unit,
    period: found.period,
    source_url: found.source_url,
    verified_on: found.verified_on,
  };
}

/* ------------------------------------------------------------------------- */
/* Scan tokens                                                               */
/* ------------------------------------------------------------------------- */

/** Group the digits of a number into thousands with the given separator. */
function groupThousands(value: number, separator: string): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * The tokens the source scan looks for, derived from the enforced ceilings.
 *
 * The derivation lives with the data rather than in the test, so the token list
 * cannot drift from the registry: a newly recorded enforced ceiling is scanned
 * for as soon as it is written down, with no second edit anywhere.
 *
 * A ceiling is only `enforced` when its value is distinctive enough to be
 * searched for as a stray literal without colliding with unrelated code.
 * Informational ceilings are recorded, readable and measured by the audit
 * Worker, but they are not literal-scanned.
 */
function deriveEnforcedTokens(limits: readonly FreeTierLimit[]): string[] {
  const tokens = new Set<string>();
  for (const entry of limits) {
    if (entry.enforcement !== 'enforced') continue;
    const decimal = String(entry.value);
    tokens.add(decimal);
    tokens.add(decimal.replace(/,/g, ''));
    tokens.add(groupThousands(entry.value, '_'));
    if (entry.value >= 1e3) {
      tokens.add(groupThousands(entry.value, ','));
    }
  }
  return [...tokens].sort();
}

/** The deduplicated scan tokens for every enforced ceiling. */
export const ENFORCED_LIMIT_TOKENS: readonly string[] = deriveEnforcedTokens(registry.limits);
