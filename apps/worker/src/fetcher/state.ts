/**
 * Feed polling state and KV persistence helpers (D-02, ING-01).
 *
 * Persists ETag, Last-Modified, HTTP status, and backoff state in Cloudflare KV.
 * Writes to KV occur only on change (~50 writes/day), well within the 1,000 writes/day free ceiling.
 */

export interface FeedState {
  etag: string | null;
  lastModified: string | null;
  lastFetchedAt: string;
  lastStatus: number;
  consecutiveFailures: number;
  disabledUntil: string | null; // ISO timestamp
}

export interface FetchResult {
  sourceSlug: string;
  status: 'ok' | 'not_modified' | 'quarantined' | 'rate_limited' | 'error';
  httpStatus: number | null;
  bytes: number;
  r2Key?: string;
  error?: string;
  durationMs: number;
}

export function createDefaultFeedState(): FeedState {
  return {
    etag: null,
    lastModified: null,
    lastFetchedAt: '',
    lastStatus: 0,
    consecutiveFailures: 0,
    disabledUntil: null,
  };
}

export function getFeedStateKey(slug: string): string {
  return `feed_state:${slug}`;
}

export async function getFeedState(kv: KVNamespace, slug: string): Promise<FeedState | null> {
  const data = await kv.get(getFeedStateKey(slug), 'json');
  return data as FeedState | null;
}

export async function updateFeedState(
  kv: KVNamespace,
  slug: string,
  state: FeedState,
): Promise<void> {
  await kv.put(getFeedStateKey(slug), JSON.stringify(state));
}
