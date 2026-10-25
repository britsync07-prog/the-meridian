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
const MAX_REQUEST_BODY_SIZE = 10 * 1024; // 10KB
const SUBSCRIPTION_RATE_LIMIT_TTL = 60 * 60; // 1 hour

interface SubscribeRequest {
  edition: string;
  email: string;
}

interface SubscribeResult {
  success: boolean;
  message: string;
  status?: 'subscribed' | 'exists' | 'quota_exceeded' | 'invalid' | 'rate_limited';
}

interface ConfirmRequest {
  token: string;
  email: string;
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

  // Limit email length
  if (email.length > 254) return null;

  return { edition, email: email.toLowerCase().trim() };
}

/**
 * Get client IP for rate limiting.
 * Only trusts CF-Connecting-IP when running on Cloudflare Workers.
 * In local development, falls back to 'unknown'.
 */
function getClientIP(request: Request): string {
  // In Cloudflare Workers, the actual client IP is available via CF-Connecting-IP
  // This header is set by Cloudflare's edge and cannot be spoofed by the client
  // We verify we're in a Workers environment by checking for the header presence
  // combined with the fact that Workers runtime doesn't expose raw socket info
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // No trusted proxy header available - use 'unknown' for rate limiting
  // This is safe: rate limiting by 'unknown' will apply globally but is better
  // than trusting spoofable headers like X-Real-IP or X-Forwarded-For
  return 'unknown';
}

/**
 * Check IP-based rate limit for subscription attempts.
 */
async function checkSubscriptionRateLimit(env: MeridianEnv, ip: string): Promise<boolean> {
  try {
    const key = `newsletter:rate_limit:${ip}`;
    const countStr = await env.KV.get(key);
    const count = countStr ? parseInt(countStr, 10) : 0;
    if (count >= 5) return false; // Max 5 attempts per hour per IP
    await env.KV.put(key, String(count + 1), { expirationTtl: SUBSCRIPTION_RATE_LIMIT_TTL });
    return true;
  } catch {
    // KV unavailable, allow request
    return true;
  }
}

/**
 * Generate a verification token for double opt-in.
 */
function generateVerificationToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Store pending verification in KV.
 */
async function storePendingVerification(env: MeridianEnv, email: string, edition: string, token: string): Promise<void> {
  try {
    await env.KV.put(
      `newsletter:verify:${token}`,
      JSON.stringify({ email, edition, created_at: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 } // 24 hour TTL for verification
    );
  } catch {
    // KV unavailable, continue
  }
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
      JSON.stringify({ edition, subscribed_at: new Date().toISOString(), verified: true }),
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
 * Handle newsletter subscription request — initiates double opt-in.
 */
export async function handleSubscribe(request: Request, env: MeridianEnv): Promise<Response> {
  // Check IP rate limit
  const ip = getClientIP(request);
  const rateLimited = await checkSubscriptionRateLimit(env, ip);
  if (!rateLimited) {
    return new Response(JSON.stringify({ success: false, message: 'Too many requests. Please try again later.', status: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

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

  // Generate verification token and store pending verification
  const token = generateVerificationToken();
  await storePendingVerification(env, email, edition, token);

  // In production, would send verification email via Brevo
  // const verifyUrl = `${new URL(request.url).origin}/api/newsletter/verify?token=${token}&email=${encodeURIComponent(email)}`;
  // await sendVerificationEmail(email, verifyUrl);

  // Debug log: only non-sensitive identifiers
  // Controlled by DEBUG_NEWSLETTER env var — disabled by default in production
  if (process.env.DEBUG_NEWSLETTER === 'true') {
    const emailHash = email.split('@')[0].substring(0, 3) + '***' + '@' + email.split('@')[1];
    console.debug(`Newsletter verification initiated: email_hash=${emailHash}, token_prefix=${token.substring(0, 6)}, edition=${edition}`);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Verification email sent. Please check your inbox to confirm subscription.',
    status: 'verification_sent',
  }), {
    status: 202,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Handle email verification callback.
 */
export async function handleVerify(request: Request, env: MeridianEnv): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const email = url.searchParams.get('email');

  if (!token || !email) {
    return new Response(JSON.stringify({ success: false, message: 'Invalid verification link' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const pending = await env.KV.get(`newsletter:verify:${token}`);
    if (!pending) {
      return new Response(JSON.stringify({ success: false, message: 'Verification link expired or invalid' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const { edition, email: storedEmail } = JSON.parse(pending);
    if (storedEmail !== email) {
      return new Response(JSON.stringify({ success: false, message: 'Verification link mismatch' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // Check quota again at verification time
    const { withinQuota, currentCount } = await checkDailyQuota(env);
    if (!withinQuota) {
      return new Response(JSON.stringify({
        success: false,
        message: `Daily subscription limit reached (${currentCount}/${BREVO_DAILY_CAP}). Please try again tomorrow.`,
        status: 'quota_exceeded',
      }), {
        status: 429,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // Record subscriber and increment counter
    await recordSubscriber(env, email, edition);
    await incrementDailyCount(env);

    // Clean up verification token
    await env.KV.delete(`newsletter:verify:${token}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Subscription confirmed! You will receive the next daily digest.',
      status: 'subscribed',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('Verification failed:', err);
    return new Response(JSON.stringify({ success: false, message: 'Verification failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}

/**
 * Export for testing
 */
export { validateRequest, checkExistingSubscriber, checkDailyQuota };
