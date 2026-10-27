/**
 * Daily audit Worker — reports free-tier usage as percentage of ceiling.
 *
 * OPS-02: Reads datastore usage metrics and compares against free-tier-limits.json
 * OPS-03: Fires alerts at 50% and 75% thresholds via Brevo webhook
 */

import type { MeridianEnv } from './db/config.js';
import { readUsageTotals } from './db/repository.js';
import freeTierLimits from '../../../config/free-tier-limits.json' with { type: 'json' };

interface UsageMetric {
  id: string;
  resource: string;
  value: number;
  unit: string;
  period: string;
  percentage: number;
  threshold_50: boolean;
  threshold_75: boolean;
  status: 'ok' | 'warning' | 'critical';
}

interface AuditReport {
  generated_at: string;
  metrics: UsageMetric[];
  summary: {
    total_metrics: number;
    warnings: number;
    criticals: number;
    needs_attention: boolean;
  };
  paid_plan_decision: {
    triggered: boolean;
    trigger_reasons: string[];
    recommendation: 'stay_free' | 'upgrade_recommended';
  };
}

/**
 * Get ceiling value from free-tier-limits.json by id.
 */
function getCeiling(id: string): number | null {
  const limit = freeTierLimits.limits.find((l) => l.id === id);
  if (!limit || limit.enforcement !== 'enforced') {
    return null;
  }
  return limit.value;
}

/**
 * Calculate usage metrics as percentage of ceiling.
 * In production, this would query actual D1/R2/KV usage stats.
 */
async function calculateMetrics(env: MeridianEnv): Promise<UsageMetric[]> {
  const { rowsRead, rowsWritten, storageBytes } = await readUsageTotals(env);
  const storageMB = Math.round(storageBytes / (1024 * 1024));

  const metrics: UsageMetric[] = [];

  // D1 rows read
  const d1ReadCeiling = getCeiling('d1_rows_read_per_day');
  if (d1ReadCeiling) {
    const pct = (rowsRead / d1ReadCeiling) * 100;
    metrics.push({
      id: 'd1_rows_read_per_day',
      resource: 'D1 rows read',
      value: rowsRead,
      unit: 'rows',
      period: 'day',
      percentage: Math.round(pct * 100) / 100,
      threshold_50: pct >= 50,
      threshold_75: pct >= 75,
      status: pct >= 75 ? 'critical' : pct >= 50 ? 'warning' : 'ok',
    });
  }

  // D1 rows written
  const d1WriteCeiling = getCeiling('d1_rows_written_per_day');
  if (d1WriteCeiling) {
    const pct = (rowsWritten / d1WriteCeiling) * 100;
    metrics.push({
      id: 'd1_rows_written_per_day',
      resource: 'D1 rows written',
      value: rowsWritten,
      unit: 'rows',
      period: 'day',
      percentage: Math.round(pct * 100) / 100,
      threshold_50: pct >= 50,
      threshold_75: pct >= 75,
      status: pct >= 75 ? 'critical' : pct >= 50 ? 'warning' : 'ok',
    });
  }

  // D1 storage
  const d1StorageCeiling = getCeiling('d1_storage_mb_per_database');
  if (d1StorageCeiling) {
    const pct = (storageMB / d1StorageCeiling) * 100;
    metrics.push({
      id: 'd1_storage_mb_per_database',
      resource: 'D1 storage',
      value: storageMB,
      unit: 'MB',
      period: 'database',
      percentage: Math.round(pct * 100) / 100,
      threshold_50: pct >= 50,
      threshold_75: pct >= 75,
      status: pct >= 75 ? 'critical' : pct >= 50 ? 'warning' : 'ok',
    });
  }

  return metrics;
}

/**
 * Check paid plan decision triggers.
 */
function checkPaidPlanDecision(metrics: UsageMetric[]): {
  triggered: boolean;
  trigger_reasons: string[];
  recommendation: 'stay_free' | 'upgrade_recommended';
} {
  const triggers: string[] = [];

  // Check traffic trigger (would need analytics integration)
  // For now, check if any metric exceeds 75%
  const criticalMetrics = metrics.filter(m => m.threshold_75);
  if (criticalMetrics.length > 0) {
    triggers.push(`Resource utilization above 75%: ${criticalMetrics.map(m => m.resource).join(', ')}`);
  }

  const triggered = triggers.length > 0;

  return {
    triggered,
    trigger_reasons: triggers,
    recommendation: triggered ? 'upgrade_recommended' : 'stay_free',
  };
}

/**
 * Send alert via Brevo webhook when thresholds exceeded.
 */
async function sendAlert(report: AuditReport, env: MeridianEnv): Promise<void> {
  const criticalMetrics = report.metrics.filter(m => m.status === 'critical');
  const warningMetrics = report.metrics.filter(m => m.status === 'warning');

  if (criticalMetrics.length === 0 && warningMetrics.length === 0) {
    return;
  }

  const alertBody = {
    subject: `[Meridian] Free-tier alert: ${criticalMetrics.length} critical, ${warningMetrics.length} warning`,
    message: `Audit report generated at ${report.generated_at}\n\n` +
      `Critical:\n${criticalMetrics.map(m => `  - ${m.resource}: ${m.percentage}%`).join('\n')}\n\n` +
      `Warning:\n${warningMetrics.map(m => `  - ${m.resource}: ${m.percentage}%`).join('\n')}`,
    timestamp: report.generated_at,
  };

  console.log('ALERT:', JSON.stringify(alertBody, null, 2));

  // In production, would POST to Brevo webhook URL stored in env
  // const brevoUrl = env.BREVO_WEBHOOK_URL;
  // await fetch(brevoUrl, { method: 'POST', body: JSON.stringify(alertBody) });
}

/**
 * Write audit report to R2 for admin page consumption.
 */
async function writeReportToR2(report: AuditReport, env: MeridianEnv): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `audits/${today}.json`;

  await env.R2.put(key, JSON.stringify(report, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });

  console.log(`Audit report written to R2: ${key}`);
}

/**
 * Main audit handler — called by cron trigger daily.
 */
export async function runAudit(env: MeridianEnv): Promise<AuditReport> {
  console.log('Starting daily audit...');

  const metrics = await calculateMetrics(env);
  const paidPlanDecision = checkPaidPlanDecision(metrics);

  const report: AuditReport = {
    generated_at: new Date().toISOString(),
    metrics,
    summary: {
      total_metrics: metrics.length,
      warnings: metrics.filter(m => m.status === 'warning').length,
      criticals: metrics.filter(m => m.status === 'critical').length,
      needs_attention: metrics.some(m => m.status === 'warning' || m.status === 'critical'),
    },
    paid_plan_decision: paidPlanDecision,
  };

  // Send alerts if needed
  await sendAlert(report, env);

  // Write report to R2
  await writeReportToR2(report, env);

  console.log(`Audit complete: ${report.summary.warnings} warnings, ${report.summary.criticals} criticals`);
  return report;
}

/**
 * Export for testing
 */
export { calculateMetrics, checkPaidPlanDecision };
