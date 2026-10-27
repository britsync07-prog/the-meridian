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
const MEDIA_CACHE = 'public, max-age=31536000, immutable';

export async function handleStoryRequest(
  request: Request,
  env: { R2: R2Bucket },
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const slug = decodeURIComponent(path.replace(/^\/story\//, '').replace(/\/+$/, ''));
  if (!slug || slug.includes('/') || slug.includes('..') || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return new Response(null, { status: 404 });
  }

  const object = await env.R2.get(`story/${slug}/index.html`);
  if (!object) {
    return new Response(null, { status: 404 });
  }

  const etag = object.httpEtag;
  if (etag && request.headers.get('If-None-Match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': STORY_CACHE,
        'ETag': etag,
      },
    });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': STORY_CACHE,
      ...(etag ? { ETag: etag } : {}),
    },
  });
}

/** Serve immutable CI-generated publisher-image variants from R2. */
export async function handleMediaRequest(
  request: Request,
  env: { R2: R2Bucket },
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const key = decodeURIComponent(path.replace(/^\/media\//, ''));
  if (!/^[a-f0-9]{64}-(480|960|1440)\.webp$/.test(key)) {
    return new Response(null, { status: 404 });
  }
  const object = await env.R2.get(`media/${key}`);
  if (!object) return new Response(null, { status: 404 });
  if (object.httpEtag && request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers: { 'Cache-Control': MEDIA_CACHE, ETag: object.httpEtag } });
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': MEDIA_CACHE,
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}

export async function handleOgRequest(request: Request, env: { R2: R2Bucket }): Promise<Response> {
  const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/og\//, ''));
  if (!/^[a-z0-9_-]+\.jpg$/.test(key)) return new Response(null, { status: 404 });
  const object = await env.R2.get(`og/${key}`);
  return object ? new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } }) : new Response(null, { status: 404 });
}
