import { describe, expect, it } from 'vitest';
import { buildHreflang } from '../hreflang.js';

describe('buildHreflang', () => {
  it('does not duplicate an edition prefix passed by an Astro route', () => {
    expect(buildHreflang('uk', '/uk/')).toContainEqual({
      hreflang: 'en-GB',
      href: 'https://meridian-worker.mehedy303.workers.dev/uk/',
    });
  });

  it('keeps India English and Hindi alternates aligned to the same route suffix', () => {
    expect(buildHreflang('in', '/in/business/')).toEqual(expect.arrayContaining([
      { hreflang: 'en-IN', href: 'https://meridian-worker.mehedy303.workers.dev/in/business/' },
      { hreflang: 'hi-IN', href: 'https://meridian-worker.mehedy303.workers.dev/in-hi/business/' },
    ]));
  });
});
