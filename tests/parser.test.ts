import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseXmlFeed } from '../src/ingest/parser';

describe('XML feed parser (ING-08)', () => {
  it('fast-xml-parser@5.11.2 is installed in dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.dependencies['fast-xml-parser']).toBe('5.11.2');
  });

  it('parses RSS 2.0 feeds and extracts items array', () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Sample Daily</title>
    <link>https://example.com</link>
    <description>Sample news feed</description>
    <item>
      <title>First Headline</title>
      <link>https://example.com/story-1</link>
      <guid>https://example.com/story-1</guid>
      <description>First story description</description>
      <pubDate>Wed, 21 Oct 2026 10:00:00 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
    </item>
    <item>
      <title>Second Headline</title>
      <link>https://example.com/story-2</link>
      <guid>https://example.com/story-2</guid>
      <description>Second story description</description>
      <pubDate>Wed, 21 Oct 2026 11:00:00 GMT</pubDate>
      <dc:creator>John Smith</dc:creator>
    </item>
  </channel>
</rss>`;

    const items = parseXmlFeed(rss);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    expect(items[0]?.title).toBe('First Headline');
    expect(items[0]?.link).toBe('https://example.com/story-1');
    expect(items[0]?.guid).toBe('https://example.com/story-1');
    expect(items[0]?.description).toBe('First story description');
    expect(items[0]?.author).toBe('Jane Doe');
    expect(items[1]?.title).toBe('Second Headline');
  });

  it('isArray config ensures single-item RSS 2.0 feeds parse as arrays', () => {
    const singleItemRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Single Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Only One Headline</title>
      <link>https://example.com/only-one</link>
      <guid>guid-1</guid>
      <description>Single description</description>
      <pubDate>Wed, 21 Oct 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseXmlFeed(singleItemRss);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(1);
    expect(items[0]?.title).toBe('Only One Headline');
  });

  it('parses Atom 1.0 feeds and extracts entry array', () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom News</title>
  <link href="https://example.com"/>
  <updated>2026-10-21T10:00:00Z</updated>
  <id>urn:uuid:60a76c80-d399-11d9-b93C-0003939e0af6</id>
  <entry>
    <title>Atom Entry One</title>
    <link rel="alternate" type="text/html" href="https://example.com/atom-1"/>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <updated>2026-10-21T10:00:00Z</updated>
    <published>2026-10-21T09:30:00Z</published>
    <summary>Atom summary one</summary>
    <author>
      <name>Alice Reporter</name>
    </author>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/atom-2"/>
    <id>urn:uuid:2225c695-cfb8-4ebb-aaaa-80da344efa6b</id>
    <updated>2026-10-21T11:00:00Z</updated>
    <content type="html">&lt;p&gt;Atom content two&lt;/p&gt;</content>
    <author>
      <name>Bob Editor</name>
    </author>
  </entry>
</feed>`;

    const items = parseXmlFeed(atom);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    expect(items[0]?.title).toBe('Atom Entry One');
    expect(items[0]?.link).toBe('https://example.com/atom-1');
    expect(items[0]?.guid).toBe('urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a');
    expect(items[0]?.description).toBe('Atom summary one');
    expect(items[0]?.author).toBe('Alice Reporter');
    expect(items[1]?.title).toBe('Atom Entry Two');
    expect(items[1]?.link).toBe('https://example.com/atom-2');
  });

  it('isArray config ensures single-entry Atom feeds parse as arrays', () => {
    const singleAtom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Single Atom</title>
  <entry>
    <title>Solo Entry</title>
    <link href="https://example.com/solo"/>
    <id>urn:uuid:solo-entry</id>
    <summary>Solo summary</summary>
  </entry>
</feed>`;

    const items = parseXmlFeed(singleAtom);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(1);
    expect(items[0]?.title).toBe('Solo Entry');
    expect(items[0]?.link).toBe('https://example.com/solo');
    expect(items[0]?.guid).toBe('urn:uuid:solo-entry');
  });

  it('parses RDF / RSS 1.0 feeds and extracts items array', () => {
    const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com">
    <title>RDF Daily</title>
    <link>https://example.com</link>
    <description>RDF Channel</description>
  </channel>
  <item rdf:about="https://example.com/rdf-1">
    <title>RDF Headline 1</title>
    <link>https://example.com/rdf-1</link>
    <description>RDF Description 1</description>
    <dc:date>2026-10-21T08:00:00Z</dc:date>
    <dc:creator>RDF Author</dc:creator>
  </item>
  <item rdf:about="https://example.com/rdf-2">
    <title>RDF Headline 2</title>
    <link>https://example.com/rdf-2</link>
    <description>RDF Description 2</description>
    <dc:date>2026-10-21T09:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

    const items = parseXmlFeed(rdf);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    expect(items[0]?.title).toBe('RDF Headline 1');
    expect(items[0]?.link).toBe('https://example.com/rdf-1');
    expect(items[0]?.author).toBe('RDF Author');
    expect(items[0]?.pubDate).toBe('2026-10-21T08:00:00Z');
  });

  it('throws clear error on malformed or empty XML', () => {
    expect(() => parseXmlFeed('')).toThrow(/empty/i);
    expect(() => parseXmlFeed('   ')).toThrow(/empty/i);
    expect(() => parseXmlFeed('<html><body>Not a feed</body></html>')).toThrow(/unrecognized feed root/i);
  });
});
