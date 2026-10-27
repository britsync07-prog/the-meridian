import { describe, expect, it } from 'vitest';

import { handleMediaRequest, handleOgRequest, handleStoryRequest } from '../story-router.js';

function bucket() {
  const get = async (key: string) => key === 'story/example/index.html'
    ? { body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('<h1>Story</h1>')); controller.close(); } }), httpEtag: '"story-etag"' }
    : null;
  return { get };
}

describe('handleStoryRequest', () => {
  it('serves the trailing-slash URL from the uploader key', async () => {
    const response = await handleStoryRequest(new Request('https://example.test/story/example/'), { R2: bucket() } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Story');
    expect(response.headers.get('ETag')).toBe('"story-etag"');
  });

  it('returns 304 only when the client supplied the matching ETag', async () => {
    const request = new Request('https://example.test/story/example/', { headers: { 'If-None-Match': '"story-etag"' } });
    const response = await handleStoryRequest(request, { R2: bucket() } as never);

    expect(response.status).toBe(304);
  });

  it('serves only content-addressed media keys from R2', async () => {
    const key = `${'a'.repeat(64)}-960.webp`;
    const mediaBucket = { get: async (value: string) => value === `media/${key}`
      ? { body: new ReadableStream(), httpEtag: '"media-etag"' }
      : null };

    const response = await handleMediaRequest(new Request(`https://example.test/media/${key}`), { R2: mediaBucket } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect((await handleMediaRequest(new Request('https://example.test/media/not-an-image'), { R2: mediaBucket } as never)).status).toBe(404);
  });

  it('serves generated Open Graph cards from the permanent R2 prefix only', async () => {
    const ogBucket = { get: async (value: string) => value === 'og/example-story.jpg'
      ? { body: new ReadableStream(), httpEtag: '"og-etag"' }
      : null };

    const response = await handleOgRequest(new Request('https://example.test/og/example-story.jpg'), { R2: ogBucket } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await handleOgRequest(new Request('https://example.test/og/not-a-card.png'), { R2: ogBucket } as never)).status).toBe(404);
  });
});
