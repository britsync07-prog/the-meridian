/**
 * Main feed ingest orchestrator: partitioned cron dispatch, response sniffing,
 * 2 MB streaming limit, R2 raw capture and quarantine routing (ING-01, ING-02, ING-07, ING-10).
 */

import { SOURCES } from '../../../../config/sources';
import type { SourceRegistryEntry } from '../../../../shared/types';
import type { MeridianEnv } from '../db/config';
import { politeFetch, type PoliteFetchOptions } from './polite-fetch';
import {
  getQuarantineStorageKey,
  getRawStorageKey,
  readStreamWithCeiling,
  sniffResponse,
} from './quarantine';
import {
  createDefaultFeedState,
  getFeedState,
  updateFeedState,
  type FetchResult,
} from './state';

export { getFeedState, updateFeedState, type FetchResult, type FeedState } from './state';
export {
  HostRateLimiter,
  defaultHostRateLimiter,
  parseRetryAfter,
  politeFetch,
  type PoliteFetchOptions,
  type PoliteFetchResult,
} from './polite-fetch';
export {
  MAX_BODY_BYTES,
  getQuarantineStorageKey,
  getRawStorageKey,
  readStreamWithCeiling,
  sniffResponse,
} from './quarantine';

/**
 * Polls a single feed source:
 * 1. Executes polite fetch (conditional GET, per-host rate limit, timeout).
 * 2. Streams body enforcing hard 2 MB limit (D-08).
 * 3. Sniffs for XML prologs vs bot challenges / HTML (D-07).
 * 4. Stores valid XML in R2 under raw/{YYYY-MM-DD}/ (D-06).
 * 5. Stores invalid or oversized payloads in R2 quarantine/ (D-09).
 * 6. Updates KV state upon success or status changes (D-02).
 */
export async function pollFeed(
  env: MeridianEnv,
  source: SourceRegistryEntry,
  fetchOptions?: Partial<PoliteFetchOptions>,
): Promise<FetchResult> {
  const fetchResult = await politeFetch({
    url: source.feedUrl,
    sourceSlug: source.slug,
    kv: env.KV,
    ...fetchOptions,
  });

  if (fetchResult.status === 'not_modified') {
    return {
      sourceSlug: source.slug,
      status: 'not_modified',
      httpStatus: 304,
      bytes: 0,
      durationMs: fetchResult.durationMs,
    };
  }

  if (fetchResult.status === 'rate_limited') {
    return {
      sourceSlug: source.slug,
      status: 'rate_limited',
      httpStatus: fetchResult.httpStatus,
      bytes: 0,
      error: fetchResult.error || 'Rate limited',
      durationMs: fetchResult.durationMs,
    };
  }

  if (fetchResult.status === 'error') {
    return {
      sourceSlug: source.slug,
      status: 'error',
      httpStatus: fetchResult.httpStatus,
      bytes: 0,
      error: fetchResult.error,
      durationMs: fetchResult.durationMs,
    };
  }

  // HTTP 200 OK
  const response = fetchResult.response;
  const contentType = response.headers.get('content-type');
  const now = Date.now();

  // Read body stream enforcing 2 MB ceiling
  const streamResult = await readStreamWithCeiling(response.body);

  if (streamResult.isOversized) {
    const r2Key = getQuarantineStorageKey(source.slug, 'oversized', now);
    await env.R2.put(r2Key, streamResult.body, {
      httpMetadata: { contentType: contentType || 'application/octet-stream' },
    });

    return {
      sourceSlug: source.slug,
      status: 'quarantined',
      httpStatus: response.status,
      bytes: streamResult.bytes,
      r2Key,
      error: 'oversized',
      durationMs: fetchResult.durationMs,
    };
  }

  // Sniff response for XML vs bot challenge / HTML
  const sniff = sniffResponse(contentType, streamResult.body);
  if (!sniff.isValidXml) {
    const reason = sniff.reason || 'invalid_prolog';
    const r2Key = getQuarantineStorageKey(source.slug, reason, now);
    await env.R2.put(r2Key, streamResult.body, {
      httpMetadata: { contentType: contentType || 'text/html' },
    });

    return {
      sourceSlug: source.slug,
      status: 'quarantined',
      httpStatus: response.status,
      bytes: streamResult.bytes,
      r2Key,
      error: reason,
      durationMs: fetchResult.durationMs,
    };
  }

  // Valid XML within 2 MB ceiling
  const r2Key = getRawStorageKey(source.slug, now);
  await env.R2.put(r2Key, streamResult.body, {
    httpMetadata: { contentType: 'application/xml; charset=utf-8' },
  });

  // Persist KV state
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  const state = (await getFeedState(env.KV, source.slug)) || createDefaultFeedState();
  if (etag) state.etag = etag;
  if (lastModified) state.lastModified = lastModified;
  state.lastFetchedAt = new Date(now).toISOString();
  state.lastStatus = 200;
  state.consecutiveFailures = 0;
  state.latestRawKey = r2Key;
  await updateFeedState(env.KV, source.slug, state);

  return {
    sourceSlug: source.slug,
    status: 'ok',
    httpStatus: 200,
    bytes: streamResult.bytes,
    r2Key,
    durationMs: fetchResult.durationMs,
  };
}

/**
 * Maps a cron schedule expression to its partition index (0, 1, or 2).
 */
export function getPartitionIndex(cronSchedule: string): number {
  if (cronSchedule.startsWith('0,')) return 0;
  if (cronSchedule.startsWith('5,')) return 1;
  if (cronSchedule.startsWith('10,')) return 2;

  let hash = 0;
  for (let i = 0; i < cronSchedule.length; i++) {
    hash = (hash * 31 + cronSchedule.charCodeAt(i)) >>> 0;
  }
  return hash % 3;
}

/**
 * Polls feeds assigned to the cron partition:
 * - Divides active sources by index % 3 === partitionIndex (D-01)
 * - Sequentially fetches to stay within 6 outgoing connections and 50 subrequests
 * - Safely isolates failures per feed so no single feed halts others (ING-07)
 */
export async function pollFeedPartition(
  env: MeridianEnv,
  cronSchedule: string,
  sources: readonly SourceRegistryEntry[] = SOURCES,
  fetchOptions?: Partial<PoliteFetchOptions>,
): Promise<FetchResult[]> {
  const partitionIndex = getPartitionIndex(cronSchedule);
  const activeSources = sources.filter((s) => s.isActive);
  const partitionSources = activeSources.filter((_, idx) => idx % 3 === partitionIndex);

  const results: FetchResult[] = [];

  for (const source of partitionSources) {
    try {
      const result = await pollFeed(env, source, fetchOptions);
      results.push(result);
    } catch (err) {
      results.push({
        sourceSlug: source.slug,
        status: 'error',
        httpStatus: null,
        bytes: 0,
        error: (err as Error).message || String(err),
        durationMs: 0,
      });
    }
  }

  return results;
}
