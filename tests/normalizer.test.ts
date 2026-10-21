import { describe, expect, it } from 'vitest';
import type { RawItem, SourceRegistryEntry } from '../shared/types';
import { normalizeFeed } from '../src/ingest/normalizer';

const MOCK_SOURCE: SourceRegistryEntry = {
  slug: 'mock-news',
  name: 'Mock News Agency',
  homepageUrl: 'https://mocknews.example.com',
  feedUrl: 'https://mocknews.example.com/rss.xml',
  countryCode: 'GB',
  language: 'en',
  defaultSection: 'politics',
  sectionPrior: { politics: 0.8, world: 0.2 },
  freshnessSlaHours: 24,
  isActive: true,
  termsStatus: 'verified',
  termsVerifiedAt: '2026-10-21',
  verifiedBy: 'system-auditor',
  termsUrl: 'https://mocknews.example.com/terms',
};

describe('Feed item normalizer (ING-08, D-24, D-25)', () => {
  const fixedNow = new Date('2026-10-21T12:00:00Z').getTime();
  const snapshotTimestamp = '2026-10-21T12:00:00Z';

  it('normalizes raw feed items into canonical RawItem records', () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Mock News</title>
    <link>https://mocknews.example.com</link>
    <item>
      <title>&lt;b&gt;Breaking:&lt;/b&gt; Crucial Vote Passed &amp;amp; Confirmed</title>
      <link>https://www.mocknews.example.com/politics/vote-passed?utm_source=feed</link>
      <guid>https://mocknews.example.com/politics/vote-passed</guid>
      <description>&lt;p&gt;Parliament voted today on the critical bill.&lt;/p&gt;</description>
      <dc:creator>Alice Reporter</dc:creator>
      <pubDate>Wed, 21 Oct 2026 10:00:00 GMT</pubDate>
      <media:content url="https://mocknews.example.com/photo.jpg" medium="image" width="800"/>
      <media:credit>Reuters</media:credit>
    </item>
  </channel>
</rss>`;

    const items = normalizeFeed(rss, MOCK_SOURCE, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(1);

    const item: RawItem = items[0]!;
    expect(item.sourceId).toBe('mock-news');
    expect(item.externalGuid).toBe('https://mocknews.example.com/politics/vote-passed');
    expect(item.canonicalUrl).toBe('https://mocknews.example.com/politics/vote-passed');
    expect(item.title).toBe('Breaking: Crucial Vote Passed & Confirmed');
    expect(item.description).toBe('Parliament voted today on the critical bill.');
    expect(item.author).toBe('Alice Reporter');
    expect(item.publishedAt).toBe('2026-10-21T10:00:00.000Z');
    expect(item.imageUrl).toBe('https://mocknews.example.com/photo.jpg');
    expect(item.imageCredit).toBe('Reuters');
    expect(item.sectionHint).toBe('politics');
  });

  it('caps ingestion to newest 25 items per feed sorted by pubDate descending (D-24)', () => {
    // Generate 40 items with spaced publication dates within last 24h
    let itemsXml = '';
    for (let i = 1; i <= 40; i++) {
      const pubHour = (fixedNow - i * 30 * 60 * 1000); // every 30 mins back
      const dateStr = new Date(pubHour).toUTCString();
      itemsXml += `
      <item>
        <title>Item Number ${i}</title>
        <link>https://mocknews.example.com/item-${i}</link>
        <guid>item-${i}</guid>
        <description>Description for item ${i}</description>
        <pubDate>${dateStr}</pubDate>
      </item>`;
    }

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>High Volume Feed</title>
    <link>https://mocknews.example.com</link>
    ${itemsXml}
  </channel>
</rss>`;

    const items = normalizeFeed(feedXml, MOCK_SOURCE, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(25);

    // Verify sorted descending by publishedAt
    for (let j = 0; j < items.length - 1; j++) {
      const current = new Date(items[j]!.publishedAt).getTime();
      const next = new Date(items[j + 1]!.publishedAt).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }

    // Newest is item 1
    expect(items[0]?.title).toBe('Item Number 1');
    expect(items[24]?.title).toBe('Item Number 25');
  });

  it('filters out items with publication dates older than 48 hours (D-24)', () => {
    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed</title>
    <item>
      <title>Recent Story</title>
      <link>https://mocknews.example.com/recent</link>
      <pubDate>${new Date(fixedNow - 2 * 3600 * 1000).toUTCString()}</pubDate>
    </item>
    <item>
      <title>Three Days Ago Story</title>
      <link>https://mocknews.example.com/three-days-ago</link>
      <pubDate>${new Date(fixedNow - 72 * 3600 * 1000).toUTCString()}</pubDate>
    </item>
    <item>
      <title>Borderline 47h Story</title>
      <link>https://mocknews.example.com/borderline</link>
      <pubDate>${new Date(fixedNow - 47 * 3600 * 1000).toUTCString()}</pubDate>
    </item>
  </channel>
</rss>`;

    const items = normalizeFeed(feedXml, MOCK_SOURCE, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(2);
    expect(items.map((i) => i.title)).toEqual(['Recent Story', 'Borderline 47h Story']);
  });

  it('clamps future publication dates (>1h ahead) to current system time (D-25)', () => {
    const futureDate = new Date(fixedNow + 24 * 3600 * 1000).toUTCString(); // +24h
    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Future Feed</title>
    <item>
      <title>Tomorrow News</title>
      <link>https://mocknews.example.com/tomorrow</link>
      <pubDate>${futureDate}</pubDate>
    </item>
  </channel>
</rss>`;

    const items = normalizeFeed(feedXml, MOCK_SOURCE, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(1);
    expect(items[0]?.title).toBe('Tomorrow News');
    expect(items[0]?.publishedAt).toBe(new Date(fixedNow).toISOString());
  });

  it('falls back to snapshot fetch timestamp when pubDate is missing or unparseable', () => {
    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed Without Dates</title>
    <item>
      <title>Undated Story</title>
      <link>https://mocknews.example.com/undated</link>
    </item>
    <item>
      <title>Gibberish Date Story</title>
      <link>https://mocknews.example.com/gibberish</link>
      <pubDate>not-a-valid-date-string</pubDate>
    </item>
  </channel>
</rss>`;

    const items = normalizeFeed(feedXml, MOCK_SOURCE, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(2);
    expect(items[0]?.publishedAt).toBe(new Date(snapshotTimestamp).toISOString());
    expect(items[1]?.publishedAt).toBe(new Date(snapshotTimestamp).toISOString());
  });
});
