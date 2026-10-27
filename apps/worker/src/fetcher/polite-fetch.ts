/**
 * Polite HTTP fetcher with per-host rate limiting, AbortController timeouts,
 * and KV-backed conditional GET (ING-01, ING-10, D-02, D-03, D-04, D-05).
 */

import { USER_AGENT } from '../../../../shared/config/site';
import {
  createDefaultFeedState,
  getFeedState,
  updateFeedState,
  type FeedState,
} from './state';

const MS_PER_SECOND = 250 * 4;
export const DEFAULT_FETCH_TIMEOUT_MS = 10 * MS_PER_SECOND;

export interface HostRateLimiterOptions {
  minDelayMs?: number;
  maxPerHour?: number;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
}

/**
 * Enforces:
 * 1. Minimum 1-second delay between requests to the same hostname (D-03).
 * 2. Capped at 20 requests per host per hour (ING-10, D-03).
 */
export class HostRateLimiter {
  private lastRequestTime = new Map<string, number>();
  private requestHistory = new Map<string, number[]>();
  private minDelayMs: number;
  private maxPerHour: number;
  private sleepFn: (ms: number) => Promise<void>;
  private nowFn: () => number;

  constructor(options: HostRateLimiterOptions = {}) {
    this.minDelayMs = options.minDelayMs ?? MS_PER_SECOND;
    this.maxPerHour = options.maxPerHour ?? 20;
    this.sleepFn = options.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    this.nowFn = options.nowFn ?? (() => Date.now());
  }

  async acquire(hostname: string): Promise<boolean> {
    const now = this.nowFn();
    const oneHourAgo = now - 3600_000;

    // Clean up history older than 1 hour
    const history = (this.requestHistory.get(hostname) || []).filter((t) => t > oneHourAgo);
    this.requestHistory.set(hostname, history);

    if (history.length >= this.maxPerHour) {
      return false; // Hourly cap reached
    }

    const lastTime = this.lastRequestTime.get(hostname);
    if (lastTime !== undefined) {
      const elapsed = now - lastTime;
      if (elapsed < this.minDelayMs) {
        await this.sleepFn(this.minDelayMs - elapsed);
      }
    }

    const recordTime = this.nowFn();
    this.lastRequestTime.set(hostname, recordTime);
    history.push(recordTime);
    this.requestHistory.set(hostname, history);

    return true;
  }

  reset(): void {
    this.lastRequestTime.clear();
    this.requestHistory.clear();
  }
}

export const defaultHostRateLimiter = new HostRateLimiter();

/**
 * Parses HTTP Retry-After header as integer seconds or HTTP date.
 * Returns absolute epoch millisecond timestamp.
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number {
  if (!header) return now + 60_000;
  const trimmed = header.trim();
  const seconds = parseInt(trimmed, 10);
  if (!Number.isNaN(seconds) && seconds >= 0 && /^\d+$/.test(trimmed)) {
    return now + seconds * MS_PER_SECOND;
  }
  const dateParsed = Date.parse(trimmed);
  if (!Number.isNaN(dateParsed) && dateParsed > now) {
    return dateParsed;
  }
  return now + 60_000;
}

export type PoliteFetchResult =
  | {
      status: 'ok';
      httpStatus: number;
      response: Response;
      durationMs: number;
    }
  | {
      status: 'not_modified';
      httpStatus: 304;
      bytes: 0;
      durationMs: number;
    }
  | {
      status: 'rate_limited';
      httpStatus: number | null;
      bytes: 0;
      durationMs: number;
      disabledUntil?: string;
      error?: string;
    }
  | {
      status: 'error';
      httpStatus: number | null;
      bytes: 0;
      error: string;
      durationMs: number;
    };

export interface PoliteFetchOptions {
  url: string;
  sourceSlug: string;
  kv: KVNamespace;
  fetchFn?: typeof fetch;
  rateLimiter?: HostRateLimiter;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Fetch timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    return await fetchFn(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes a polite HTTP fetch adhering to all project crawler mandates:
 * - Transparent User-Agent header (ING-10, D-04)
 * - Conditional GET with ETag / If-Modified-Since (ING-01, D-02)
 * - 1-second min host delay & 20 req/hr cap (ING-10, D-03)
 * - 10-second timeout with at most one 2-second retry (D-05)
 * - 429 Retry-After handling & backoff (ING-10)
 * - 304 Not Modified KV timestamp refresh (D-02)
 */
export async function politeFetch(
  urlOrOptions: string | PoliteFetchOptions,
  sourceSlug?: string,
  kv?: KVNamespace,
  extraOptions?: Partial<PoliteFetchOptions>,
): Promise<PoliteFetchResult> {
  const options: PoliteFetchOptions =
    typeof urlOrOptions === 'object'
      ? urlOrOptions
      : {
          url: urlOrOptions,
          sourceSlug: sourceSlug!,
          kv: kv!,
          ...extraOptions,
        };

  const {
    url,
    sourceSlug: slug,
    kv: kvNamespace,
    fetchFn = fetch,
    rateLimiter = defaultHostRateLimiter,
    sleepFn = (ms: number) => new Promise((r) => setTimeout(r, ms)),
    nowFn = () => Date.now(),
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    retryDelayMs = 2 * MS_PER_SECOND,
  } = options;

  const startTime = nowFn();

  // Check if feed is disabled due to previous Retry-After or failure backoff
  const existingState = await getFeedState(kvNamespace, slug);
  if (existingState?.disabledUntil) {
    const disabledTime = new Date(existingState.disabledUntil).getTime();
    if (disabledTime > nowFn()) {
      return {
        status: 'rate_limited',
        httpStatus: 429,
        bytes: 0,
        durationMs: 0,
        disabledUntil: existingState.disabledUntil,
      };
    }
  }

  // Enforce host rate limit
  const urlObj = new URL(url);
  const hostAllowed = await rateLimiter.acquire(urlObj.hostname);
  if (!hostAllowed) {
    return {
      status: 'rate_limited',
      httpStatus: 429,
      bytes: 0,
      durationMs: nowFn() - startTime,
      error: `Host rate limit exceeded (max 20 requests/hour for ${urlObj.hostname})`,
    };
  }

  // Build polite request headers
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
  };

  if (existingState?.etag) {
    headers['If-None-Match'] = existingState.etag;
  }
  if (existingState?.lastModified) {
    headers['If-Modified-Since'] = existingState.lastModified;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, headers, timeoutMs, fetchFn);
  } catch (firstErr) {
    // Retry at most once after retryDelayMs upon socket/timeout glitch (D-05)
    await sleepFn(retryDelayMs);
    try {
      response = await fetchWithTimeout(url, headers, timeoutMs, fetchFn);
    } catch (secondErr) {
      const durationMs = nowFn() - startTime;
      const state = existingState || createDefaultFeedState();
      state.lastFetchedAt = new Date(nowFn()).toISOString();
      state.consecutiveFailures += 1;
      await updateFeedState(kvNamespace, slug, state);

      return {
        status: 'error',
        httpStatus: null,
        bytes: 0,
        error: (secondErr as Error).message || String(secondErr),
        durationMs,
      };
    }
  }

  const durationMs = nowFn() - startTime;

  // Handle 304 Not Modified
  if (response.status === 304) {
    const state = existingState || createDefaultFeedState();
    state.lastFetchedAt = new Date(nowFn()).toISOString();
    state.lastStatus = 304;
    state.consecutiveFailures = 0;
    await updateFeedState(kvNamespace, slug, state);

    return {
      status: 'not_modified',
      httpStatus: 304,
      bytes: 0,
      durationMs,
    };
  }

  // Handle 429 Rate Limited
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('retry-after');
    const disabledUntilTimestamp = parseRetryAfter(retryAfterHeader, nowFn());
    const disabledUntil = new Date(disabledUntilTimestamp).toISOString();

    const state = existingState || createDefaultFeedState();
    state.disabledUntil = disabledUntil;
    state.lastStatus = 429;
    state.lastFetchedAt = new Date(nowFn()).toISOString();
    await updateFeedState(kvNamespace, slug, state);

    return {
      status: 'rate_limited',
      httpStatus: 429,
      bytes: 0,
      durationMs,
      disabledUntil,
    };
  }

  // Handle HTTP error (4xx/5xx)
  if (!response.ok) {
    const state = existingState || createDefaultFeedState();
    state.lastFetchedAt = new Date(nowFn()).toISOString();
    state.lastStatus = response.status;
    state.consecutiveFailures += 1;
    await updateFeedState(kvNamespace, slug, state);

    return {
      status: 'error',
      httpStatus: response.status,
      bytes: 0,
      error: `HTTP ${response.status}`,
      durationMs,
    };
  }

  // HTTP 200 OK
  return {
    status: 'ok',
    httpStatus: response.status,
    response,
    durationMs,
  };
}
