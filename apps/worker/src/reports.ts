/**
 * Reports handler — OPS-22 and OPS-23.
 * Handles flag source and report error submissions.
 */

import type { MeridianEnv } from './db/config.js';

interface FlagRequest {
  story_slug: string;
  type: 'flag';
  reason: string;
  comment?: string;
}

interface ErrorRequest {
  story_slug: string;
  type: 'error';
  error_type: string;
  description: string;
  evidence_url?: string;
}

type ReportRequest = FlagRequest | ErrorRequest;

interface ReportResult {
  id: number;
  type: string;
  story_slug: string;
  status: 'pending';
  data: Record<string, unknown>;
  created_at: string;
}

/**
 * Parse and validate report request.
 */
function validateReport(data: unknown): ReportRequest | null {
  if (!data || typeof data !== 'object') return null;

  const { story_slug, type } = data as Record<string, unknown>;

  if (!story_slug || typeof story_slug !== 'string') return null;
  if (type !== 'flag' && type !== 'error') return null;

  if (type === 'flag') {
    const { reason } = data as FlagRequest;
    if (!reason || typeof reason !== 'string') return null;
    return { story_slug, type, reason, comment: (data as FlagRequest).comment };
  }

  if (type === 'error') {
    const { error_type, description } = data as ErrorRequest;
    if (!error_type || typeof error_type !== 'string') return null;
    if (!description || typeof description !== 'string') return null;
    return { story_slug, type, error_type, description, evidence_url: (data as ErrorRequest).evidence_url };
  }

  return null;
}

/**
 * Store report in D1.
 */
export async function storeReport(env: MeridianEnv, report: ReportRequest): Promise<ReportResult> {
  const db = env.DB;

  const result = await db.prepare(`
    INSERT INTO reports (type, story_slug, status, data, created_at)
    VALUES (?, ?, 'pending', ?, datetime('now'))
    RETURNING id, type, story_slug, status, data, created_at
  `)
    .bind(
      report.type,
      report.story_slug,
      JSON.stringify(report),
    )
    .first<ReportResult>();

  if (!result) {
    throw new Error('Failed to store report');
  }

  return result;
}

/**
 * Handle flag source submission.
 */
export async function handleFlagRequest(request: Request, env: MeridianEnv): Promise<Response> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const validated = validateReport(data);
  if (!validated || validated.type !== 'flag') {
    return new Response('Invalid request', { status: 400 });
  }

  try {
    const report = await storeReport(env, validated);
    return new Response(JSON.stringify({ success: true, id: report.id }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('Failed to store flag:', err);
    return new Response('Internal server error', { status: 500 });
  }
}

/**
 * Handle error report submission.
 */
export async function handleErrorRequest(request: Request, env: MeridianEnv): Promise<Response> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const validated = validateReport(data);
  if (!validated || validated.type !== 'error') {
    return new Response('Invalid request', { status: 400 });
  }

  try {
    const report = await storeReport(env, validated);
    return new Response(JSON.stringify({ success: true, id: report.id }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('Failed to store report:', err);
    return new Response('Internal server error', { status: 500 });
  }
}

/**
 * Get pending reports for admin review.
 */
export async function getPendingReports(env: MeridianEnv): Promise<ReportResult[]> {
  const db = env.DB;
  const result = await db.prepare(`
    SELECT id, type, story_slug, status, data, created_at
    FROM reports
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT 100
  `).all<ReportResult>();

  return result.results ?? [];
}

/**
 * Update report status.
 */
export async function updateReportStatus(env: MeridianEnv, id: number, status: 'reviewed' | 'approved' | 'rejected'): Promise<void> {
  const db = env.DB;
  await db.prepare(`
    UPDATE reports
    SET status = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).bind(status, id).run();
}
