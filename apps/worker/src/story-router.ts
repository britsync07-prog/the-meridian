/**
 * Story tier router — serves /story/* pages from R2.
 *
 * OPS-12: Story pages live in R2, not the static tier. This handler fetches
 * the pre-rendered HTML from R2 and serves it with proper cache headers.
 */

import type { R2Bucket } from '@cloudflare/workers-types';

/** Cache policy for story pages per PUB-07. */
const STORY_TTL_SECONDS = 60 * 5;
const STORY_CACHE = `public, max-age=${STORY_TTL_SECONDS}, stale-while-revalidate=86400`;

export async function handleStoryRequest(
  path: string,
  env: { R2: R2Bucket },
): Promise<Response> {
  // Strip leading /story/ and normalise
  const slug = decodeURIComponent(path.replace(/^\/story\//, ''));
  if (!slug || slug.includes('/') || slug.includes('..') || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return new Response(null, { status: 404 });
  }

  const object = await env.R2.get(`story/${slug}.html`);
  if (!object) {
    return new Response(null, { status: 404 });
  }

  const body = await object.body;
  const checksumEtag = object.checksums?.sha256
    ? Buffer.from(object.checksums.sha256 as unknown as Uint8Array).toString('base64')
    : null;

  // Conditional GET support — use only checksum-based ETag since httpMetadata.etag is not in R2HTTPMetadata
  const ifNoneMatch = checksumEtag;

  if (ifNoneMatch) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': STORY_CACHE,
        'ETag': ifNoneMatch,
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': STORY_CACHE,
      'ETag': ifNoneMatch ?? undefined,
    },
  });
}

/**
 * Build an ETag string from object checksums or content hash.
 * Falls back to a hash of the body if no server-side checksum exists.
 */
function buildEtag(object: {
  httpMetadata?: { etag?: string };
  checksums?: { sha256?: Uint8Array | number[] };
}): string | null {
  if (object.httpMetadata?.etag) return object.httpMetadata.etag;
  if (object.checksums?.sha256) {
    const bytes = object.checksums.sha256;
    return Buffer.from(bytes as unknown as Uint8Array).toString('base64');
  }
  return null;
}
