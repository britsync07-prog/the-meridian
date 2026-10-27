import { describe, expect, it, vi } from 'vitest';
import { USER_AGENT } from '../../../../../shared/config/site';
import {
  HostRateLimiter,
  fetchWithTimeout,
  parseRetryAfter,
  politeFetch,
} from '../polite-fetch';
import { getFeedState, updateFeedState } from '../state';

function createMockKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const val = store.get(key);
      if (val === undefined) return null;
      if (type === 'json') return JSON.parse(val);
      return val;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

describe('Polite HTTP fetcher (ING-01, ING-10, D-02, D-03, D-04, D-05)', () => {
  it('aborts a hung request at the configured timeout', async () => {
    const hangingFetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => reject(signal.reason));
    }));

    await expect(fetchWithTimeout(
      'https://example.com/hung.xml',
      { 'User-Agent': USER_AGENT },
      1,
      hangingFetch as unknown as typeof fetch,
    )).rejects.toThrow(/timed out/i);
    expect(hangingFetch).toHaveBeenCalledOnce();
  });

  it('sends exact USER_AGENT from shared/config/site.ts and correct Accept header', async () => {
    const kv = createMockKv();
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers || {}) as Record<string, string>;
      return new Response('<rss><channel><title>News</title></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    });

    const result = await politeFetch({
      url: 'https://example.com/feed.xml',
      sourceSlug: 'test-feed',
      kv,
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
    });

    expect(result.status).toBe('ok');
    expect(capturedHeaders['User-Agent']).toBe(USER_AGENT);
    expect(capturedHeaders['Accept']).toContain('application/rss+xml');
  });

  it('includes If-None-Match and If-Modified-Since from KV state', async () => {
    const kv = createMockKv();
    await updateFeedState(kv, 'etag-feed', {
      etag: '"etag-12345"',
      lastModified: 'Wed, 21 Oct 2026 06:00:00 GMT',
      lastFetchedAt: '2026-10-21T06:00:00.000Z',
      lastStatus: 200,
      consecutiveFailures: 0,
      disabledUntil: null,
    });

    let capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers || {}) as Record<string, string>;
      return new Response(null, { status: 304 });
    });

    const result = await politeFetch({
      url: 'https://example.com/etag-feed.xml',
      sourceSlug: 'etag-feed',
      kv,
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
    });

    expect(result.status).toBe('not_modified');
    expect(capturedHeaders['If-None-Match']).toBe('"etag-12345"');
    expect(capturedHeaders['If-Modified-Since']).toBe('Wed, 21 Oct 2026 06:00:00 GMT');
  });

  it('HTTP 304 response updates lastFetchedAt in KV and returns status not_modified', async () => {
    const kv = createMockKv();
    const fixedNow = 1792576800000; // 2026-10-21T10:00:00.000Z

    const mockFetch = vi.fn(async () => new Response(null, { status: 304 }));

    const result = await politeFetch({
      url: 'https://example.com/304-feed.xml',
      sourceSlug: 'feed-304',
      kv,
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
      nowFn: () => fixedNow,
    });

    expect(result.status).toBe('not_modified');
    if (result.status === 'not_modified') {
      expect(result.httpStatus).toBe(304);
      expect(result.bytes).toBe(0);
    }

    const savedState = await getFeedState(kv, 'feed-304');
    expect(savedState).not.toBeNull();
    expect(savedState?.lastStatus).toBe(304);
    expect(savedState?.lastFetchedAt).toBe(new Date(fixedNow).toISOString());
    expect(savedState?.consecutiveFailures).toBe(0);
  });

  it('enforces minimum 1-second delay between requests to same host and max 20 requests/host/hour', async () => {
    let simulatedTime = 100000;
    const sleepCalls: number[] = [];

    const limiter = new HostRateLimiter({
      minDelayMs: 1000,
      maxPerHour: 20,
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
        simulatedTime += ms;
      },
      nowFn: () => simulatedTime,
    });

    // Request 1 to bbc.co.uk
    const allowed1 = await limiter.acquire('bbc.co.uk');
    expect(allowed1).toBe(true);
    expect(sleepCalls.length).toBe(0);

    // Request 2 to bbc.co.uk 400ms later -> must sleep 600ms
    simulatedTime += 400;
    const allowed2 = await limiter.acquire('bbc.co.uk');
    expect(allowed2).toBe(true);
    expect(sleepCalls).toEqual([600]);

    // Request to a DIFFERENT host should NOT wait for bbc.co.uk
    const allowedOther = await limiter.acquire('theguardian.com');
    expect(allowedOther).toBe(true);
    expect(sleepCalls).toEqual([600]); // No new sleep

    // Exhaust 20 requests per hour for bbc.co.uk
    // Already did 2, do 18 more
    for (let i = 0; i < 18; i++) {
      simulatedTime += 1000;
      const ok = await limiter.acquire('bbc.co.uk');
      expect(ok).toBe(true);
    }

    // 21st request within the same hour must be rejected
    simulatedTime += 1000;
    const allowed21 = await limiter.acquire('bbc.co.uk');
    expect(allowed21).toBe(false);
  });

  it('parses Retry-After header on HTTP 429 and calculates disabledUntil backoff timestamp in KV', async () => {
    const kv = createMockKv();
    const fixedNow = 1792576800000;

    // Test parseRetryAfter with integer seconds
    expect(parseRetryAfter('120', fixedNow)).toBe(fixedNow + 120_000);

    // Test parseRetryAfter with HTTP date
    const targetDate = new Date(fixedNow + 300_000).toUTCString();
    expect(parseRetryAfter(targetDate, fixedNow)).toBe(Date.parse(targetDate));

    // Test parseRetryAfter fallback
    expect(parseRetryAfter(null, fixedNow)).toBe(fixedNow + 60_000);

    // Test politeFetch handling 429
    const mockFetch = vi.fn(async () =>
      new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '180' },
      }),
    );

    const result = await politeFetch({
      url: 'https://example.com/rate-limited.xml',
      sourceSlug: 'rl-feed',
      kv,
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
      nowFn: () => fixedNow,
    });

    expect(result.status).toBe('rate_limited');
    if (result.status === 'rate_limited') {
      expect(result.httpStatus).toBe(429);
      expect(result.disabledUntil).toBe(new Date(fixedNow + 180_000).toISOString());
    }

    const savedState = await getFeedState(kv, 'rl-feed');
    expect(savedState?.disabledUntil).toBe(new Date(fixedNow + 180_000).toISOString());
    expect(savedState?.lastStatus).toBe(429);

    // Subsequent call before disabledUntil expires returns early without hitting fetch
    mockFetch.mockClear();
    const earlyResult = await politeFetch({
      url: 'https://example.com/rate-limited.xml',
      sourceSlug: 'rl-feed',
      kv,
      fetchFn: mockFetch as unknown as typeof fetch,
      nowFn: () => fixedNow + 50_000,
    });

    expect(earlyResult.status).toBe('rate_limited');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('enforces 10-second timeout, retrying at most once with 2-second backoff upon failure', async () => {
    const kv = createMockKv();
    const sleepCalls: number[] = [];
    let attempts = 0;

    const mockFetchGlitchThenSuccess = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Socket closed prematurely');
      }
      return new Response('<rss><channel></channel></rss>', { status: 200 });
    });

    const result = await politeFetch({
      url: 'https://example.com/glitch.xml',
      sourceSlug: 'glitch-feed',
      kv,
      fetchFn: mockFetchGlitchThenSuccess as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
      },
      retryDelayMs: 2000,
      timeoutMs: 10_000,
    });

    expect(attempts).toBe(2);
    expect(sleepCalls).toEqual([2000]); // 2-second backoff before retry (D-05)
    expect(result.status).toBe('ok');

    // Test persistent failure after retry
    attempts = 0;
    sleepCalls.length = 0;
    const mockFetchPermanentFail = vi.fn(async () => {
      attempts++;
      throw new Error('ETIMEDOUT');
    });

    const failResult = await politeFetch({
      url: 'https://example.com/fail.xml',
      sourceSlug: 'fail-feed',
      kv,
      fetchFn: mockFetchPermanentFail as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
      },
      retryDelayMs: 2000,
    });

    expect(attempts).toBe(2);
    expect(sleepCalls).toEqual([2000]);
    expect(failResult.status).toBe('error');
    if (failResult.status === 'error') {
      expect(failResult.error).toContain('ETIMEDOUT');
    }
  });
});
