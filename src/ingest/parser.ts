import { XMLParser } from 'fast-xml-parser';

export interface ParsedRawItem {
  title: string;
  link: string;
  guid?: string;
  description?: string;
  contentEncoded?: string;
  author?: string;
  pubDate?: string;
  [key: string]: any;
}

export interface ParsedRawFeed {
  title?: string;
  description?: string;
  link?: string;
  items: ParsedRawItem[];
}

function extractText(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    for (const item of val) {
      const text = extractText(item);
      if (text) return text;
    }
    return '';
  }
  if (typeof val === 'object') {
    if (val['#text'] != null) return extractText(val['#text']);
  }
  return '';
}

function extractAuthor(item: any): string | undefined {
  if (item['dc:creator']) {
    const text = extractText(item['dc:creator']);
    if (text) return text;
  }
  if (item.author) {
    if (typeof item.author === 'object') {
      const name = extractText(item.author.name);
      if (name) return name;
      const text = extractText(item.author);
      if (text) return text;
    } else {
      const text = extractText(item.author);
      if (text) return text;
    }
  }
  return undefined;
}

function extractAtomLink(links: any): string {
  if (!links) return '';
  if (typeof links === 'string') return links.trim();
  if (Array.isArray(links)) {
    // Prefer alternate link or link without rel
    const alt = links.find(
      (l) => l && (l['@_rel'] === 'alternate' || !l['@_rel']) && (l['@_href'] || l['@_url'])
    );
    if (alt) return (alt['@_href'] || alt['@_url'] || '').trim();

    // Fall back to first link with href
    const firstWithHref = links.find((l) => l && (l['@_href'] || l['@_url']));
    if (firstWithHref) return (firstWithHref['@_href'] || firstWithHref['@_url'] || '').trim();

    // Or text of first link
    return extractText(links[0]);
  }
  if (typeof links === 'object') {
    return (links['@_href'] || links['@_url'] || extractText(links)).trim();
  }
  return '';
}

function createXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: true,
    trimValues: true,
    isArray: (name) => ['item', 'entry', 'link', 'media:content'].includes(name),
  });
}

/**
 * Parses raw XML text into canonical intermediate ParsedRawItem records.
 * Supports RSS 2.0, Atom 1.0, and RDF (RSS 1.0).
 */
export function parseXmlFeed(xmlText: string): ParsedRawItem[] {
  if (!xmlText || !xmlText.trim()) {
    throw new Error('Empty feed XML: body contains no content');
  }

  const parser = createXmlParser();
  let parsed: any;
  try {
    parsed = parser.parse(xmlText);
  } catch (err) {
    throw new Error(`XML parsing failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unrecognized feed root: parsed document is empty or invalid');
  }

  // Dialect 1: RSS 2.0
  if (parsed.rss?.channel) {
    const rawItems = parsed.rss.channel.item || [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    return items.map((raw: any) => {
      const title = extractText(raw.title);
      const link = extractText(raw.link);
      const guid = extractText(raw.guid) || (raw['@_about'] ? String(raw['@_about']) : undefined);
      const description = extractText(raw.description);
      const contentEncoded = extractText(raw['content:encoded']);
      const author = extractAuthor(raw);
      const pubDate = extractText(raw.pubDate || raw['dc:date'] || raw.date);

      return {
        ...raw,
        title,
        link,
        guid: guid || undefined,
        description: description || undefined,
        contentEncoded: contentEncoded || undefined,
        author,
        pubDate: pubDate || undefined,
      };
    });
  }

  // Dialect 2: Atom 1.0
  if (parsed.feed) {
    const rawEntries = parsed.feed.entry || [];
    const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
    return entries.map((raw: any) => {
      const title = extractText(raw.title);
      const link = extractAtomLink(raw.link);
      const guid = extractText(raw.id);
      const summary = extractText(raw.summary);
      const content = extractText(raw.content);
      const contentEncoded = extractText(raw['content:encoded']) || content;
      const author = extractAuthor(raw);
      const pubDate = extractText(raw.published || raw.updated || raw['dc:date']);

      return {
        ...raw,
        title,
        link,
        guid: guid || undefined,
        description: summary || content || undefined,
        contentEncoded: contentEncoded || undefined,
        author,
        pubDate: pubDate || undefined,
      };
    });
  }

  // Dialect 3: RDF / RSS 1.0
  if (parsed['rdf:RDF']) {
    const rawItems = parsed['rdf:RDF'].item || [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    return items.map((raw: any) => {
      const title = extractText(raw.title);
      const link = extractText(raw.link) || (raw['@_rdf:about'] ? String(raw['@_rdf:about']) : '');
      const guid = (raw['@_rdf:about'] ? String(raw['@_rdf:about']) : undefined) || link;
      const description = extractText(raw.description);
      const contentEncoded = extractText(raw['content:encoded']);
      const author = extractAuthor(raw);
      const pubDate = extractText(raw['dc:date'] || raw.date);

      return {
        ...raw,
        title,
        link,
        guid: guid || undefined,
        description: description || undefined,
        contentEncoded: contentEncoded || undefined,
        author,
        pubDate: pubDate || undefined,
      };
    });
  }

  throw new Error('Unrecognized feed root: expected RSS 2.0, Atom 1.0, or RDF');
}
