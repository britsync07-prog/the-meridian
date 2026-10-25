/**
 * Reports handler — OPS-22 and OPS-23.
 * Handles flag source and report error submissions.
 */

import type { MeridianEnv } from './db/config.js';

const MAX_REQUEST_BODY_SIZE = 10 * 1024; // 10KB
const MAX_STORY_SLUG_LENGTH = 128;
const REPORT_RATE_LIMIT_TTL = 60 * 60; // 1 hour
const MAX_REPORTS_PER_IP_PER_HOUR = 10;

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
 * Get client IP for rate limiting.
 */
function getClientIP(request: Request): string {
  const forwarded = request.headers.get('CF-Connecting-IP');
  if (forwarded) return forwarded;
  const realIP = request.headers.get('X-Real-IP');
  if (realIP) return realIP;
  return 'unknown';
}

/**
 * Check IP-based rate limit for report submissions.
 */
async function checkReportRateLimit(env: MeridianEnv, ip: string): Promise<boolean> {
  try {
    const key = `reports:rate_limit:${ip}`;
    const countStr = await env.KV.get(key);
    const count = countStr ? parseInt(countStr, 10) : 0;
    if (count >= MAX_REPORTS_PER_IP_PER_HOUR) return false;
    await env.KV.put(key, String(count + 1), { expirationTtl: REPORT_RATE_LIMIT_TTL });
    return true;
  } catch {
    // KV unavailable, allow request
    return true;
  }
}

/**
 * Parse and validate report request.
 */
function validateReport(data: unknown): ReportRequest | null {
  if (!data || typeof data !== 'object') return null;

  const { story_slug, type } = data as Record<string, unknown>;

  if (!story_slug || typeof story_slug !== 'string') return null;
  if (story_slug.length > MAX_STORY_SLUG_LENGTH) return null;
  if (type !== 'flag' && type !== 'error') return null;

  if (type === 'flag') {
    const { reason } = data as FlagRequest;
    if (!reason || typeof reason !== 'string') return null;
    if (reason.length > 500) return null; // Reason length limit
    const comment = (data as FlagRequest).comment;
    if (comment && comment.length > 1000) return null; // Comment length limit
    return { story_slug, type, reason, comment };
  }

  if (type === 'error') {
    const { error_type, description } = data as ErrorRequest;
    if (!error_type || typeof error_type !== 'string') return null;
    if (error_type.length > 100) return null;
    if (!description || typeof description !== 'string') return null;
    if (description.length > 2000) return null;
    const evidence_url = (data as ErrorRequest).evidence_url;
    if (evidence_url && evidence_url.length > 500) return null;
    return { story_slug, type, error_type, description, evidence_url };
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
  // Check IP rate limit
  const ip = getClientIP(request);
  const rateLimited = await checkReportRateLimit(env, ip);
  if (!rateLimited) {
    return new Response(JSON.stringify({ success: false, message: 'Too many reports. Please try again later.' }), {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const validated = validateReport(data);
  if (!validated || validated.type !== 'flag') {
    return new Response(JSON.stringify({ success: false, message: 'Invalid request' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const report = await storeReport(env, validated);
    return new Response(JSON.stringify({ success: true, id: report.id }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('Failed to store flag:', err);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}

/**
 * Handle error report submission.
 */
export async function handleErrorRequest(request: Request, env: MeridianEnv): Promise<Response> {
  // Check IP rate limit
  const ip = getClientIP(request);
  const rateLimited = await checkReportRateLimit(env, ip);
  if (!rateLimited) {
    return new Response(JSON.stringify({ success: false, message: 'Too many reports. Please try again later.' }), {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const validated = validateReport(data);
  if (!validated || validated.type !== 'error') {
    return new Response(JSON.stringify({ success: false, message: 'Invalid request' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const report = await storeReport(env, validated);
    return new Response(JSON.stringify({ success: true, id: report.id }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('Failed to store report:', err);
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
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
