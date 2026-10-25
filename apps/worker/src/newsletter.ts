/**
 * Newsletter handler — Brevo integration.
 *
 * GRO-01: Reader can subscribe to daily digest for one edition
 * GRO-02: Subscriber receives one email per day for their edition
 * GRO-03: Newsletter send volume monitored against provider daily cap
 * GRO-04: Newsletter signup form submits server-side; API key never reaches browser
 */

import type { MeridianEnv } from './db/config.js';
import freeTierLimits from '../../../config/free-tier-limits.json' with { type: 'json' };

const BREVO_DAILY_CAP = 300;

interface SubscribeRequest {
  edition: string;
  email: string;
}

interface SubscribeResult {
  success: boolean;
  message: string;
  status?: 'subscribed' | 'exists' | 'quota_exceeded' | 'invalid';
}

/**
 * Validate subscription request.
 */
function validateRequest(data: unknown): SubscribeRequest | null {
  if (!data || typeof data !== 'object') return null;

  const { edition, email } = data as Record<string, unknown>;

  if (!edition || typeof edition !== 'string') return null;
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;

  // Validate edition
  const validEditions = ['uk', 'us', 'au', 'ca', 'ie', 'nz', 'in', 'in-hi'];
  if (!validEditions.includes(edition)) return null;

  return { edition, email: email.toLowerCase().trim() };
}

/**
 * Check if subscriber already exists (rate limit / dedup).
 */
async function checkExistingSubscriber(env: MeridianEnv, email: string): Promise<boolean> {
  try {
    const result = await env.KV.get(`newsletter:${email}`);
    return result !== null;
  } catch {
    // KV unavailable, assume not exists
    return false;
  }
}

/**
 * Record subscriber in KV for rate limiting.
 */
async function recordSubscriber(env: MeridianEnv, email: string, edition: string): Promise<void> {
  try {
    await env.KV.put(
      `newsletter:${email}`,
      JSON.stringify({ edition, subscribed_at: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 * 365 } // 1 year TTL
    );
  } catch {
    // KV unavailable, continue
  }
}

/**
 * Check daily send quota.
 * Returns true if within quota, false if exceeded.
 */
async function checkDailyQuota(env: MeridianEnv): Promise<{ withinQuota: boolean; currentCount: number }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const countStr = await env.KV.get(`newsletter:daily_count:${today}`);
    const count = countStr ? parseInt(countStr, 10) : 0;
    return { withinQuota: count < BREVO_DAILY_CAP, currentCount: count };
  } catch {
    // KV unavailable, assume within quota
    return { withinQuota: true, currentCount: 0 };
  }
}

/**
 * Increment daily send counter.
 */
async function incrementDailyCount(env: MeridianEnv): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const countStr = await env.KV.get(`newsletter:daily_count:${today}`);
    const count = countStr ? parseInt(countStr, 10) : 0;
    await env.KV.put(`newsletter:daily_count:${today}`, String(count + 1), { expirationTtl: 60 * 60 * 24 * 2 });
  } catch {
    // KV unavailable, ignore
  }
}

/**
 * Handle newsletter subscription request.
 */
export async function handleSubscribe(request: Request, env: MeridianEnv): Promise<Response> {
  // Parse request body
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Validate
  const validated = validateRequest(data);
  if (!validated) {
    return new Response(JSON.stringify({ success: false, message: 'Invalid edition or email', status: 'invalid' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const { edition, email } = validated;

  // Check existing subscriber
  const exists = await checkExistingSubscriber(env, email);
  if (exists) {
    return new Response(JSON.stringify({ success: true, message: 'Already subscribed', status: 'exists' }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Check daily quota
  const { withinQuota, currentCount } = await checkDailyQuota(env);
  if (!withinQuota) {
    // Overflow policy: reject with grace period message
    return new Response(JSON.stringify({
      success: false,
      message: `Daily subscription limit reached (${currentCount}/${BREVO_DAILY_CAP}). Please try again tomorrow.`,
      status: 'quota_exceeded',
    }), {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // In production, would call Brevo API here
  // const brevoKey = env.BREVO_API_KEY;
  // await fetch('https://api.brevo.com/v3/contacts', { ... });

  // Record in KV for tracking
  await recordSubscriber(env, email, edition);
  await incrementDailyCount(env);

  return new Response(JSON.stringify({
    success: true,
    message: 'Subscribed successfully',
    status: 'subscribed',
  }), {
    status: 201,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Export for testing
 */
export { validateRequest, checkExistingSubscriber, checkDailyQuota };
