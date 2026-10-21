import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveItemIdentity } from '../src/ingest/identity';
import { extractMediaEnclosure } from '../src/ingest/media';
import { canonicalizeSourceUrl } from '../src/ingest/url';

describe('URL canonicalization (ING-09, D-10)', () => {
  it('strips www, forces https, normalizes trailing slashes, and sorts query params', () => {
    const raw = 'http://www.Example.COM/world/news/?b=2&a=1';
    const canonical = canonicalizeSourceUrl(raw);
    expect(canonical).toBe('https://example.com/world/news?a=1&b=2');
  });

  it('removes tracking query parameters (utm_*, ref, ref_src, fbclid, gclid, cmp, at_*)', () => {
    const raw =
      'https://example.com/article?utm_source=twitter&ref=rss&fbclid=xyz123&gclid=abc&cmp=1&at_medium=social&utm_campaign=daily&story=42';
    const canonical = canonicalizeSourceUrl(raw);
    expect(canonical).toBe('https://example.com/article?story=42');
  });

  it('preserves root path as single slash', () => {
    const raw = 'https://www.example.com/';
    expect(canonicalizeSourceUrl(raw)).toBe('https://example.com/');
  });

  it('strips hash fragments', () => {
    const raw = 'https://example.com/story#comments-section';
    expect(canonicalizeSourceUrl(raw)).toBe('https://example.com/story');
  });
});

describe('Dual-identity resolution (ING-09, D-10)', () => {
  it('returns stable GUID when present and not forced to URL identity', () => {
    const item = {
      guid: 'urn:news:unique-guid-1234',
      link: 'https://example.com/news/1234?utm_source=rss',
    };
    const identity = resolveItemIdentity(item);
    expect(identity).toBe('urn:news:unique-guid-1234');
  });

  it('returns "url:" + sha256(canonicalUrl) when GUID is absent or empty', () => {
    const item = {
      guid: '',
      link: 'http://www.example.com/news/1234/?utm_source=rss',
    };
    const canonical = 'https://example.com/news/1234';
    const expectedHash = createHash('sha256').update(canonical).digest('hex');

    const identity = resolveItemIdentity(item);
    expect(identity).toBe(`url:${expectedHash}`);
  });

  it('falls back to URL identity when forceUrlIdentity is true', () => {
    const item = {
      guid: 'oscillating-random-timestamp-token',
      link: 'https://example.com/story-a',
    };
    const canonical = 'https://example.com/story-a';
    const expectedHash = createHash('sha256').update(canonical).digest('hex');

    const identity = resolveItemIdentity(item, { forceUrlIdentity: true });
    expect(identity).toBe(`url:${expectedHash}`);
  });
});

describe('Media enclosure cascade & sanitization (D-20 to D-23)', () => {
  it('prioritizes media:content with largest width', () => {
    const item = {
      'media:content': [
        { '@_url': 'http://example.com/small.jpg', '@_width': '400', '@_medium': 'image' },
        { '@_url': 'http://example.com/large.jpg', '@_width': '1200', '@_medium': 'image' },
        { '@_url': 'http://example.com/medium.jpg', '@_width': '800', '@_medium': 'image' },
      ],
      enclosure: { '@_url': 'https://example.com/enclosure.jpg', '@_type': 'image/jpeg' },
    };

    const media = extractMediaEnclosure(item);
    expect(media.imageUrl).toBe('https://example.com/large.jpg');
  });

  it('falls back to enclosure when media:content is not present', () => {
    const item = {
      enclosure: {
        '@_url': 'http://example.com/photo.jpg?utm_source=rss',
        '@_type': 'image/jpeg',
      },
    };

    const media = extractMediaEnclosure(item);
    expect(media.imageUrl).toBe('https://example.com/photo.jpg');
  });

  it('falls back to inline img >=400px when neither media:content nor enclosure exist', () => {
    const item = {
      description:
        '<p>Some text</p><img src="http://example.com/inline-hero.jpg" width="600" height="400" /><p>More text</p>',
    };

    const media = extractMediaEnclosure(item);
    expect(media.imageUrl).toBe('https://example.com/inline-hero.jpg');
  });

  it('filters tracking pixels with width < 200px or tracking domain', () => {
    const pixelItem = {
      'media:content': [
        { '@_url': 'http://example.com/1x1.gif', '@_width': '1', '@_height': '1' },
      ],
      enclosure: {
        '@_url': 'http://feedburner.google.com/tracker.gif',
        '@_type': 'image/gif',
      },
      description: '<img src="https://stats.wordpress.com/b.gif?v=noscript" width="1" height="1">',
    };

    const media = extractMediaEnclosure(pixelItem);
    expect(media.imageUrl).toBeNull();
  });

  it('extracts photographer credit from media:credit or dc:creator', () => {
    const itemWithCredit = {
      'media:content': [
        { '@_url': 'https://example.com/photo.jpg', '@_width': '800', '@_medium': 'image' },
      ],
      'media:credit': 'Reuters / John Doe',
    };
    expect(extractMediaEnclosure(itemWithCredit).imageCredit).toBe('Reuters / John Doe');

    const itemWithDcCreator = {
      enclosure: { '@_url': 'https://example.com/photo.jpg', '@_type': 'image/jpeg' },
      'dc:creator': 'Jane Staff Photographer',
    };
    expect(extractMediaEnclosure(itemWithDcCreator).imageCredit).toBe('Jane Staff Photographer');
  });
});
