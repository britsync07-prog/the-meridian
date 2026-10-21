import { describe, expect, it, vi } from 'vitest';
import type { SourceRegistryEntry } from '../../../../../shared/types';
import type { MeridianEnv } from '../../db/config';
import worker from '../../index';
import {
  getPartitionIndex,
  pollFeed,
  pollFeedPartition,
} from '../index';
import { HostRateLimiter } from '../polite-fetch';
import {
  getQuarantineStorageKey,
  getRawStorageKey,
  readStreamWithCeiling,
  sniffResponse,
} from '../quarantine';
import { getFeedState } from '../state';

function createMockR2() {
  const store = new Map<string, Uint8Array>();
  return {
    async put(key: string, value: Uint8Array | string) {
      if (typeof value === 'string') {
        store.set(key, new TextEncoder().encode(value));
      } else {
        store.set(key, value);
      }
      return {} as R2Object;
    },
    async get(key: string) {
      const data = store.get(key);
      if (!data) return null;
      return {
        async text() {
          return new TextDecoder().decode(data);
        },
        async arrayBuffer() {
          return data.buffer;
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
  } as unknown as KVNamespace;
}

function createMockEnv(r2 = createMockR2(), kv = createMockKv()): MeridianEnv {
  return {
    DB: {} as unknown as MeridianEnv['DB'],
    R2: r2 as unknown as R2Bucket,
    KV: kv,
  };
}

function createMockSource(slug: string, feedUrl = `https://example.com/${slug}.xml`): SourceRegistryEntry {
  return {
    slug,
    name: slug,
    homepageUrl: 'https://example.com',
    feedUrl,
    countryCode: 'GB',
    language: 'en',
    defaultSection: 'politics',
    sectionPrior: { politics: 0.5 },
    freshnessSlaHours: 24,
    isActive: true,
    termsStatus: 'verified',
    termsVerifiedAt: '2026-10-21',
    verifiedBy: 'auditor',
    termsUrl: 'https://example.com/terms',
  };
}

describe('Response sniffing, 2 MB body ceiling, and quarantine (ING-01, ING-02, ING-07, D-06, D-07, D-08, D-09)', () => {
  it('sniffs Content-Type and first 256 bytes for XML prologs', () => {
    const encoder = new TextEncoder();

    // Standard RSS 2.0 with XML declaration
    const rssWithDecl = encoder.encode('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>');
    expect(sniffResponse('application/rss+xml', rssWithDecl)).toEqual({ isValidXml: true });

    // Atom feed starting directly with <feed>
    const atomDirect = encoder.encode('<feed xmlns="http://www.w3.org/2005/Atom"><title>Feed</title></feed>');
    expect(sniffResponse('application/atom+xml', atomDirect)).toEqual({ isValidXml: true });

    // RDF feed
    const rdfDirect = encoder.encode('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>');
    expect(sniffResponse('text/xml', rdfDirect)).toEqual({ isValidXml: true });

    // Non-XML plain text
    const plainText = encoder.encode('Welcome to our plain text server error notice');
    expect(sniffResponse('text/plain', plainText)).toEqual({ isValidXml: false, reason: 'invalid_prolog' });
  });

  it('identifies HTML bodies and bot challenges (Turnstile, PerimeterX, <!DOCTYPE html) and quarantines them', () => {
    const encoder = new TextEncoder();

    // Content-Type: text/html
    const htmlHeader = encoder.encode('<?xml version="1.0"?><rss></rss>');
    expect(sniffResponse('text/html; charset=UTF-8', htmlHeader)).toEqual({
      isValidXml: false,
      reason: 'bot_challenge',
    });

    // Cloudflare Turnstile challenge page
    const turnstilePage = encoder.encode('<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="turnstile-wrapper"></div></body></html>');
    expect(sniffResponse('application/xml', turnstilePage)).toEqual({
      isValidXml: false,
      reason: 'bot_challenge',
    });

    // PerimeterX challenge
    const perimeterX = encoder.encode('<html><script src="https://client.perimeterx.net/px.js"></script></html>');
    expect(sniffResponse(null, perimeterX)).toEqual({
      isValidXml: false,
      reason: 'bot_challenge',
    });

    // Cloudflare challenge platform
    const cfChallenge = encoder.encode('<html class="challenge-platform"><div id="cf-browser-verification"></div></html>');
    expect(sniffResponse('application/xml', cfChallenge)).toEqual({
      isValidXml: false,
      reason: 'bot_challenge',
    });
  });

  it('enforces 2 MB body ceiling via streaming byte counter, canceling stream if exceeded', async () => {
    // Stream under 2 MB completes
    const smallChunk = new TextEncoder().encode('<rss><channel><title>Small</title></channel></rss>');
    const smallStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(smallChunk);
        controller.close();
      },
    });

    const smallResult = await readStreamWithCeiling(smallStream, 2 * 1024 * 1024);
    expect(smallResult.isOversized).toBe(false);
    expect(smallResult.bytes).toBe(smallChunk.byteLength);
    expect(smallResult.body.byteLength).toBe(smallChunk.byteLength);

    // Stream exceeding 2 MB is aborted
    let streamCancelled = false;
    const chunkSize = 1024 * 1024; // 1 MB per chunk
    const chunk1MB = new Uint8Array(chunkSize).fill(65); // 'A'

    const bigStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk1MB); // 1 MB
        controller.enqueue(chunk1MB); // 2 MB
        controller.enqueue(chunk1MB); // 3 MB (exceeds 2 MB!)
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const bigResult = await readStreamWithCeiling(bigStream, 2 * 1024 * 1024);
    expect(bigResult.isOversized).toBe(true);
    expect(bigResult.reason).toBe('oversized');
    expect(bigResult.bytes).toBeGreaterThan(2 * 1024 * 1024);
    expect(bigResult.body.byteLength).toBe(2 * 1024 * 1024); // truncated to 2 MB
    expect(streamCancelled).toBe(true);
  });

  it('stores valid XML in R2 under raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml', async () => {
    const r2 = createMockR2();
    const kv = createMockKv();
    const env = createMockEnv(r2, kv);
    const source = createMockSource('bbc-news-uk');

    const validXml = '<?xml version="1.0"?><rss version="2.0"><channel><title>BBC</title></channel></rss>';
    const mockFetch = vi.fn(async () =>
      new Response(validXml, {
        status: 200,
        headers: {
          'Content-Type': 'application/rss+xml',
          ETag: '"bbc-etag-1"',
          'Last-Modified': 'Wed, 21 Oct 2026 09:00:00 GMT',
        },
      }),
    );

    const result = await pollFeed(env, source, {
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
    });

    expect(result.status).toBe('ok');
    expect(result.httpStatus).toBe(200);
    expect(result.r2Key).toBeDefined();
    expect(result.r2Key).toMatch(/^raw\/\d{4}-\d{2}-\d{2}\/bbc-news-uk_\d+\.xml$/);

    // Verify written to R2
    const stored = r2._store.get(result.r2Key!);
    expect(stored).toBeDefined();
    expect(new TextDecoder().decode(stored)).toBe(validXml);

    // Verify KV updated
    const savedState = await getFeedState(kv, 'bbc-news-uk');
    expect(savedState?.etag).toBe('"bbc-etag-1"');
    expect(savedState?.lastModified).toBe('Wed, 21 Oct 2026 09:00:00 GMT');
    expect(savedState?.lastStatus).toBe(200);
  });

  it('stores quarantined payloads under raw/quarantine/{YYYY-MM-DD}/{feedId}_{reason}_{timestamp}.xml', async () => {
    const r2 = createMockR2();
    const kv = createMockKv();
    const env = createMockEnv(r2, kv);
    const source = createMockSource('turnstile-feed');

    const challengeHtml = '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>';
    const mockFetch = vi.fn(async () =>
      new Response(challengeHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    const result = await pollFeed(env, source, {
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
    });

    expect(result.status).toBe('quarantined');
    expect(result.error).toBe('bot_challenge');
    expect(result.r2Key).toBeDefined();
    expect(result.r2Key).toMatch(/^raw\/quarantine\/\d{4}-\d{2}-\d{2}\/turnstile-feed_bot_challenge_\d+\.xml$/);

    // Verify stored in R2 quarantine
    const stored = r2._store.get(result.r2Key!);
    expect(stored).toBeDefined();
    expect(new TextDecoder().decode(stored)).toBe(challengeHtml);
  });

  it('scheduled() handler partitions sources across the 3 cron triggers', async () => {
    expect(getPartitionIndex('0,15,30,45 * * * *')).toBe(0);
    expect(getPartitionIndex('5,20,35,50 * * * *')).toBe(1);
    expect(getPartitionIndex('10,25,40,55 * * * *')).toBe(2);

    const r2 = createMockR2();
    const kv = createMockKv();
    const env = createMockEnv(r2, kv);

    const sources: SourceRegistryEntry[] = [
      createMockSource('source-0'), // idx 0 -> part 0
      createMockSource('source-1'), // idx 1 -> part 1
      createMockSource('source-2'), // idx 2 -> part 2
      createMockSource('source-3'), // idx 3 -> part 0
      createMockSource('source-4'), // idx 4 -> part 1
      createMockSource('source-5'), // idx 5 -> part 2
    ];

    const fetchedSlugs: string[] = [];
    const mockFetch = vi.fn(async (url: string) => {
      const slugMatch = url.match(/\/([^/]+)\.xml$/);
      if (slugMatch) fetchedSlugs.push(slugMatch[1]);
      return new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    });

    // Run partition 1 ("5,20,35,50 * * * *")
    const results = await pollFeedPartition(env, '5,20,35,50 * * * *', sources, {
      fetchFn: mockFetch as unknown as typeof fetch,
      rateLimiter: new HostRateLimiter({ minDelayMs: 0 }),
    });

    expect(results.length).toBe(2);
    expect(results.map((r) => r.sourceSlug)).toEqual(['source-1', 'source-4']);
    expect(fetchedSlugs).toEqual(['source-1', 'source-4']);

    // Verify scheduled() exported handler dispatches via ctx.waitUntil
    let waitedPromise: Promise<unknown> | null = null;
    const mockCtx = {
      waitUntil(promise: Promise<unknown>) {
        waitedPromise = promise;
      },
      passThroughOnException() {},
    } as unknown as ExecutionContext;

    const mockController = {
      cron: '10,25,40,55 * * * *',
      scheduledTime: Date.now(),
      noRetry() {},
    } as ScheduledController;

    await worker.scheduled(mockController, env, mockCtx);
    expect(waitedPromise).not.toBeNull();
  });
});
