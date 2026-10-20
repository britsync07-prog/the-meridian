/**
 * OPS-01: every free-tier ceiling the project depends on lives in one versioned
 * file, and every ceiling carries the URL it came from and the date it was
 * verified. A ceiling without a source is a guess, and a guess is how a free
 * tier gets breached without anybody noticing.
 *
 * D-05 makes the free tier a permanent hard ceiling, so these values are design
 * inputs rather than operational trivia: the code that depends on a ceiling has
 * to know it before the ceiling is reached.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url).href);
const REGISTRY_PATH = join(REPO_ROOT, 'config', 'free-tier-limits.json');

/** The shape of one row of `limits`. */
interface RegistryLimit {
  id: string;
  resource: string;
  value: number;
  unit: string;
  period: string;
  source_url: string;
  verified_on: string;
  enforcement: string;
}

/** The shape of one OPS-04 trigger. */
interface RegistryTrigger {
  id: string;
  metric: string;
  threshold: number;
  unit: string;
  comparison: string;
  source_requirement: string;
  decision_ref: string;
}

/** The shape of the whole registry file. */
interface RegistryFile {
  version: number;
  updated_on: string;
  limits: RegistryLimit[];
  paid_plan_decision_rule: {
    version: number;
    updated_on: string;
    triggers: RegistryTrigger[];
    standing_disposition: string;
    standing_decision_ref: string;
    standing_decision_text: string;
    response_mechanisms: string[];
    response_decision_ref: string;
    request_ceiling_is_a_permanent_wall_ref: string;
    known_non_conforming_dependency: {
      id: string;
      requirement_ref: string;
      issue: string;
      standing_obligation: string;
      explicitly_excluded: string;
    };
  };
}

/** The eighteen ceilings the project depends on, in the registry's own order. */
const EXPECTED_LIMIT_IDS = [
  'workers_requests_per_day',
  'workers_cpu_ms_per_invocation',
  'workers_subrequests_per_invocation',
  'workers_cron_triggers_per_account',
  'd1_rows_read_per_day',
  'd1_rows_written_per_day',
  'd1_storage_mb_per_database',
  'kv_writes_per_day',
  'r2_storage_gb_month',
  'r2_class_a_ops_per_month',
  'r2_class_b_ops_per_month',
  'static_asset_files_per_project',
  'github_actions_minutes_per_month',
  'brevo_emails_per_day',
  'open_meteo_calls_per_day',
  'google_news_sitemap_entries_per_file',
  'google_news_sitemap_window_hours',
  'r2_class_b_reads_per_image_view',
];

/** Read the registry from disk. Throws with a readable message when it is absent. */
function readRegistry(): RegistryFile {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`The free-tier ceiling registry is missing: ${REGISTRY_PATH}`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile;
}

describe('the free-tier ceiling registry (OPS-01)', () => {
  it('holds every ceiling the project depends on', () => {
    const registry = readRegistry();

    expect(registry.version).toBe(1);
    expect(registry.updated_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(registry.limits.map((entry) => entry.id)).toEqual(EXPECTED_LIMIT_IDS);
  });

  it('gives every ceiling a value, a unit, a period, a source and a verification date', () => {
    const registry = readRegistry();

    for (const entry of registry.limits) {
      expect(typeof entry.value, `${entry.id} has no numeric value`).toBe('number');
      expect(entry.unit.length, `${entry.id} has no unit`).toBeGreaterThan(0);
      expect(entry.period.length, `${entry.id} has no period`).toBeGreaterThan(0);
      expect(entry.source_url, `${entry.id} has no source`).toMatch(/^https:\/\//);
      expect(entry.verified_on, `${entry.id} has no verification date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['enforced', 'informational'], `${entry.id} has an unknown enforcement`).toContain(
        entry.enforcement,
      );
    }
  });

  it('names all three OPS-04 triggers in the decision rule', () => {
    const rule = readRegistry().paid_plan_decision_rule;

    expect(rule.triggers.map((trigger) => trigger.id)).toEqual(['traffic', 'static_files', 'revenue']);
    expect(rule.triggers.map((trigger) => trigger.threshold)).toEqual([4000, 20000, 1]);
    for (const trigger of rule.triggers) {
      expect(trigger.source_requirement).toBe('OPS-04');
      expect(trigger.metric.length).toBeGreaterThan(0);
      expect(trigger.comparison.length).toBeGreaterThan(0);
    }
  });

  it('records the standing never-purchase disposition (D-05)', () => {
    const rule = readRegistry().paid_plan_decision_rule;

    expect(rule.standing_disposition).toBe('never_purchase');
    expect(rule.standing_decision_ref).toBe('D-05');
    expect(rule.standing_decision_text).toContain('never buys');
    expect(rule.standing_decision_text).toContain('revenue');
  });

  it('records the three load-shedding mechanisms (D-07) and the permanent wall (D-08)', () => {
    const rule = readRegistry().paid_plan_decision_rule;

    expect(rule.response_mechanisms).toEqual([
      'promote_hot_stories_into_the_static_tier',
      'edge_cache_the_story_tier_hard',
      'shard_the_static_tier_across_the_8_projects',
    ]);
    expect(rule.response_decision_ref).toBe('D-07');
    expect(rule.request_ceiling_is_a_permanent_wall_ref).toBe('D-08');
  });

  it('records the Open-Meteo obligation as a known non-conforming dependency (D-09)', () => {
    const dependency = readRegistry().paid_plan_decision_rule.known_non_conforming_dependency;

    expect(dependency.requirement_ref).toBe('D-09');
    expect(dependency.standing_obligation.length).toBeGreaterThan(0);
    expect(dependency.explicitly_excluded).toContain('Open-Meteo');
  });
});
