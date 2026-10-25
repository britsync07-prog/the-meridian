import { describe, expect, it } from 'vitest';

import { handleStoryRequest } from '../story-router.js';

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
});
