/**
 * S-2 — does a real publisher serve a Cloudflare Worker?
 *
 * The spike issues one conditional GET per feed and records what came back.
 * It is a measurement of *egress*, not of content: the question is whether the
 * request is served, how long it takes, whether the publisher blocks it, and
 * what the publisher hands back that the real fetcher will need (an ETag, a
 * `Retry-After`).
 *
 * Three rules shape the code:
 *
 * - **It parses nothing (ING-02).** The body is counted in bytes and
 *   discarded. No XML is read, no item is extracted, no title is touched. The
 *   spike answers "is the request served?", and the answer does not require
 *   understanding the document.
 * - **It identifies itself (ING-10).** Every request carries the project's
 *   shared descriptive User-Agent, read from `shared/config/site.ts` by
 *   relative path, so the Worker and the CI runner are indistinguishable to a
 *   publisher and the comparison between them is like for like.
 * - **It does not loop.** One request per feed per invocation. A spike that
 *   hammers a publisher's feed to satisfy a curiosity is how a project's IP
 *   range gets blocked before launch, which is the exact outcome this spike
 *   exists to avoid.
 *
 * The conditional-GET path is exercised across two invocations rather than
 * one: the first invocation collects each feed's ETag, and the second
 * invocation supplies those ETags so the publisher can answer `304 Not
 * Modified`. Both invocations are one request per feed, so the total is two
 * requests per feed across the whole spike.
 */

import { USER_AGENT } from '../../../shared/config/site';

import { FEEDS } from './feeds.mjs';

/** One feed's outcome. */
interface FeedResult {
  id: string;
  url: string;
  status: number | null;
  ms: number;
  blocked: boolean;
  retryAfter: string | null;
  etag: string | null;
  conditional: boolean;
  bytes: number | null;
  bytesDeclared: number | null;
  error: string | null;
}

/**
 * Read the ETags the caller supplies.
 *
 * The caller passes them as a JSON object keyed by feed id, URL-encoded. An
 * absent or malformed parameter means "no conditional requests", which is the
 * first invocation of the spike.
 */
function readSuppliedEtags(raw: string | null): Record<string, string> {
  if (raw === null || raw.trim() === '') return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};

    const etags: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value !== '') etags[id] = value;
    }
    return etags;
  } catch {
    return {};
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const supplied = readSuppliedEtags(url.searchParams.get('etags'));

    const results: FeedResult[] = [];

    for (const feed of FEEDS) {
      const suppliedEtag = supplied[feed.id];
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
      if (suppliedEtag) headers['If-None-Match'] = suppliedEtag;

      const startedAt = Date.now();
      let status: number | null = null;
      let retryAfter: string | null = null;
      let etag: string | null = null;
      let bytes: number | null = null;
      let bytesDeclared: number | null = null;
      let error: string | null = null;

      try {
        const response = await fetch(feed.url, { headers, redirect: 'follow' });
        status = response.status;
        retryAfter = response.headers.get('retry-after');
        etag = response.headers.get('etag');

        const declared = response.headers.get('content-length');
        bytesDeclared = declared === null ? null : Number.parseInt(declared, 10);

        /*
         * The body is counted and discarded. Reading it is not parsing it:
         * no byte is interpreted, no structure is assumed, nothing is kept.
         * The count is what tells Phase 2 how large a feed is before it
         * decides whether to fetch it whole.
         */
        const body = await response.arrayBuffer();
        bytes = body.byteLength;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }

      const ms = Date.now() - startedAt;

      results.push({
        id: feed.id,
        url: feed.url,
        status,
        ms,
        blocked: status === 403 || status === 429,
        retryAfter,
        etag,
        conditional: Boolean(suppliedEtag),
        bytes,
        bytesDeclared,
        error,
      });
    }

    const served = results.filter((result) => result.status === 200).length;
    const notModified = results.filter((result) => result.status === 304).length;
    const blocked = results.filter((result) => result.blocked).length;
    const servedShare = FEEDS.length === 0 ? 0 : Math.round((served / FEEDS.length) * 100);

    return Response.json({
      userAgent: USER_AGENT,
      feedCount: FEEDS.length,
      served,
      notModified,
      blocked,
      servedSharePercent: servedShare,
      results,
    });
  },
} satisfies ExportedHandler;
