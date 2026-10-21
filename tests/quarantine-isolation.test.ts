import { describe, expect, it } from 'vitest';
import type { SourceRegistryEntry } from '../shared/types';
import type { MeridianEnv } from '../apps/worker/src/db/config';
import { pollFeedPartition } from '../apps/worker/src/fetcher/index';
import { HostRateLimiter } from '../apps/worker/src/fetcher/polite-fetch';
import { getFeedState } from '../apps/worker/src/fetcher/state';
import { MockHttpDispatcher } from './mocks/http';

function createMockR2() {
  const store = new Map<string, { data: Uint8Array; metadata?: Record<string, any> }>();
  return {
    async put(key: string, value: Uint8Array | string, options?: any) {
      const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
      store.set(key, { data, metadata: options?.httpMetadata });
      return {} as R2Object;
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        async text() {
          return new TextDecoder().decode(entry.data);
        },
        async arrayBuffer() {
          return entry.data.buffer;
        },
      } as unknown as R2ObjectBody;
    },
    _store: store,
  };
}

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
    _store: store,
  } as unknown as KVNamespace;
}

function createSource(slug: string, feedUrl: string): SourceRegistryEntry {
  return {
    slug,
    name: `Source ${slug}`,
    homepageUrl: 'https://example.com',
    feedUrl,
    countryCode: 'GB',
    language: 'en',
    defaultSection: 'politics',
    sectionPrior: { politics: 1.0 },
    freshnessSlaHours: 24,
    isActive: true,
    termsStatus: 'verified',
    termsVerifiedAt: '2026-10-21',
    verifiedBy: 'test',
    termsUrl: 'https://example.com/terms',
  };
}

describe('Network Mocking & Fault Isolation (ING-01, ING-07, ING-10)', () => {
  it('simulates 200 OK, 304 Not Modified, 429 Retry-After, 500 Server Error, socket timeouts', async () => {
    const dispatcher = new MockHttpDispatcher();
    dispatcher.register('https://mock.test/ok', {
      status: 200,
      fixture: 'rss-standard.xml',
    });
    dispatcher.register('https://mock.test/not-modified', {
      status: 304,
    });
    dispatcher.register('https://mock.test/rate-limited', {
      status: 429,
      headers: { 'Retry-After': '3600' },
      body: 'Rate limit exceeded',
    });
    dispatcher.register('https://mock.test/server-error', {
      status: 500,
      body: 'Internal Server Error',
    });
    dispatcher.register('https://mock.test/hang', {
      hang: true,
    });

    // 200 OK
    const res200 = await dispatcher.fetch('https://mock.test/ok');
    expect(res200.status).toBe(200);
    const body200 = await res200.text();
    expect(body200).toContain('<rss');

    // 304 Not Modified
    const res304 = await dispatcher.fetch('https://mock.test/not-modified');
    expect(res304.status).toBe(304);

    // 429 Retry-After
    const res429 = await dispatcher.fetch('https://mock.test/rate-limited');
    expect(res429.status).toBe(429);
    expect(res429.headers.get('Retry-After')).toBe('3600');

    // 500 Server Error
    const res500 = await dispatcher.fetch('https://mock.test/server-error');
    expect(res500.status).toBe(500);

    // Socket timeout via AbortController
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    await expect(
      dispatcher.fetch('https://mock.test/hang', { signal: controller.signal })
    ).rejects.toThrow();
  });

  it('isolates broken feeds (bot challenge, oversized, 500, timeout) in a 17-feed partition without failing healthy feeds (ING-07)', async () => {
    const dispatcher = new MockHttpDispatcher();
    const r2 = createMockR2();
    const kv = createMockKv();
    const env: MeridianEnv = {
      DB: {} as unknown as MeridianEnv['DB'],
      R2: r2 as unknown as R2Bucket,
      KV: kv,
    };

    // Configure 17 target feeds
    // Feed 1: bot challenge
    dispatcher.register('https://feed1.test/rss', {
      status: 200,
      fixture: 'bot-challenge.html',
    });

    // Feed 2: oversized (>2 MB)
    dispatcher.register('https://feed2.test/rss', {
      status: 200,
      fixture: 'oversized.xml',
    });

    // Feed 3: 500 Internal Server Error
    dispatcher.register('https://feed3.test/rss', {
      status: 500,
      body: 'Server error',
    });

    // Feed 4: Socket hang / timeout
    dispatcher.register('https://feed4.test/rss', {
      hang: true,
    });

    // Feed 5: 304 Not Modified
    dispatcher.register('https://feed5.test/rss', {
      status: 304,
    });

    // Feeds 6..17: 12 valid feeds
    for (let i = 6; i <= 17; i++) {
      dispatcher.register(`https://feed${i}.test/rss`, {
        status: 200,
        fixture: i % 2 === 0 ? 'rss-standard.xml' : 'atom-standard.xml',
      });
    }

    // Build 51 sources so partition 0 (idx % 3 === 0) extracts our exact 17 feeds
    const allSources: SourceRegistryEntry[] = [];
    for (let k = 1; k <= 17; k++) {
      allSources.push(createSource(`feed-${k}`, `https://feed${k}.test/rss`));
      allSources.push(createSource(`dummy-${k}-a`, `https://dummy-a.test/rss`));
      allSources.push(createSource(`dummy-${k}-b`, `https://dummy-b.test/rss`));
    }

    // Run partition 0 with rateLimiter minDelayMs: 0 and fast timeout
    const results = await pollFeedPartition(
      env,
      '0,15,30,45 * * * *',
      allSources,
      {
        fetchFn: dispatcher.fetch as unknown as typeof fetch,
        rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
        timeoutMs: 40,
        retryDelayMs: 0,
      }
    );

    // Total feeds processed in partition = 17
    expect(results).toHaveLength(17);

    // Feed 1: Quarantined as bot challenge
    const feed1Result = results.find((r) => r.sourceSlug === 'feed-1');
    expect(feed1Result?.status).toBe('quarantined');
    expect(feed1Result?.error).toBe('bot_challenge');
    expect(feed1Result?.r2Key).toContain('raw/quarantine/');

    // Feed 2: Quarantined as oversized
    const feed2Result = results.find((r) => r.sourceSlug === 'feed-2');
    expect(feed2Result?.status).toBe('quarantined');
    expect(feed2Result?.error).toBe('oversized');
    expect(feed2Result?.r2Key).toContain('raw/quarantine/');

    // Feed 3: Error 500
    const feed3Result = results.find((r) => r.sourceSlug === 'feed-3');
    expect(feed3Result?.status).toBe('error');
    expect(feed3Result?.httpStatus).toBe(500);

    // Feed 4: Timed out
    const feed4Result = results.find((r) => r.sourceSlug === 'feed-4');
    expect(feed4Result?.status).toBe('error');

    // Feed 5: Not modified
    const feed5Result = results.find((r) => r.sourceSlug === 'feed-5');
    expect(feed5Result?.status).toBe('not_modified');
    expect(feed5Result?.bytes).toBe(0);

    // Feeds 6..17: Exactly 12 healthy feeds succeeded
    const healthyFeeds = results.filter((r) => r.status === 'ok');
    expect(healthyFeeds).toHaveLength(12);
    for (const feed of healthyFeeds) {
      expect(feed.bytes).toBeGreaterThan(0);
      expect(feed.r2Key).toContain('raw/');
      expect(feed.r2Key).not.toContain('quarantine');
    }

    // Verify R2 storage keys
    const r2Keys = Array.from(r2._store.keys());
    // 2 quarantined feeds + 12 healthy feeds = 14 objects stored in R2 (Feed 5 304 and errors store 0 objects)
    expect(r2Keys).toHaveLength(14);
    const quarantineKeys = r2Keys.filter((k) => k.startsWith('raw/quarantine/'));
    expect(quarantineKeys).toHaveLength(2);
    expect(quarantineKeys.some((k) => k.includes('feed-1') && k.includes('bot_challenge'))).toBe(true);
    expect(quarantineKeys.some((k) => k.includes('feed-2') && k.includes('oversized'))).toBe(true);

    // Verify KV state: feed-5 has lastFetchedAt updated, healthy feeds have lastStatus 200
    const state5 = await getFeedState(kv, 'feed-5');
    expect(state5?.lastFetchedAt).toBeDefined();

    for (let i = 6; i <= 17; i++) {
      const stateHealthy = await getFeedState(kv, `feed-${i}`);
      expect(stateHealthy?.lastStatus).toBe(200);
      expect(stateHealthy?.consecutiveFailures).toBe(0);
    }
  });
});
