import { describe, expect, it } from 'vitest';
import type { SourceRegistryEntry } from '../shared/types';
import {
  assertExcerptWithinBudget,
  ExcerptBudgetError,
} from '../shared/contract/excerpt-budget';
import {
  buildSanitizedExcerpt,
  extractExcerptCandidate,
} from '../src/ingest/excerpt';
import { normalizeFeed } from '../src/ingest/normalizer';

const MOCK_SOURCE_EN: SourceRegistryEntry = {
  slug: 'test-en',
  name: 'Test English Source',
  homepageUrl: 'https://test-en.example.com',
  feedUrl: 'https://test-en.example.com/rss.xml',
  countryCode: 'GB',
  language: 'en',
  defaultSection: 'politics',
  sectionPrior: {},
  freshnessSlaHours: 24,
  isActive: true,
  termsStatus: 'verified',
  termsVerifiedAt: '2026-10-21',
  verifiedBy: 'auditor',
  termsUrl: 'https://test-en.example.com/terms',
};

const MOCK_SOURCE_HI: SourceRegistryEntry = {
  slug: 'test-hi',
  name: 'Test Hindi Source',
  homepageUrl: 'https://test-hi.example.com',
  feedUrl: 'https://test-hi.example.com/rss.xml',
  countryCode: 'IN',
  language: 'hi',
  defaultSection: 'world',
  sectionPrior: {},
  freshnessSlaHours: 24,
  isActive: true,
  termsStatus: 'verified',
  termsVerifiedAt: '2026-10-21',
  verifiedBy: 'auditor',
  termsUrl: 'https://test-hi.example.com/terms',
};

function generateWords(count: number, prefix = 'w'): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`).join(' ');
}

describe('Excerpt extraction cascade (D-11)', () => {
  it('prioritizes description over content:encoded and content', () => {
    const item = {
      description: '<p>Primary editorial description.</p>',
      contentEncoded: '<p>Full body text from contentEncoded.</p>',
      content: '<p>Atom content.</p>',
    };
    const { candidate, sourceVisibleText } = extractExcerptCandidate(item);
    expect(candidate).toBe('Primary editorial description.');
    expect(sourceVisibleText).toBe('Full body text from contentEncoded.');
  });

  it('falls back to content:encoded / summary when description is missing', () => {
    const item = {
      description: '',
      contentEncoded: '<p>Detailed article text from content:encoded.</p>',
    };
    const { candidate, sourceVisibleText } = extractExcerptCandidate(item);
    expect(candidate).toBe('Detailed article text from content:encoded.');
    expect(sourceVisibleText).toBe('Detailed article text from content:encoded.');
  });

  it('falls back to Atom content when neither description nor contentEncoded is present', () => {
    const item = {
      content: '<p>Atom content only.</p>',
    };
    const { candidate, sourceVisibleText } = extractExcerptCandidate(item);
    expect(candidate).toBe('Atom content only.');
    expect(sourceVisibleText).toBe('Atom content only.');
  });
});

describe('Excerpt Budget Pipeline (CON-01 through CON-05)', () => {
  it('produces null excerpt when source article has fewer than 160 words (CON-02)', () => {
    const shortSource = generateWords(120);
    const candidate = generateWords(30);

    const excerpt = buildSanitizedExcerpt({
      candidateText: candidate,
      sourceVisibleText: shortSource,
      language: 'en',
    });

    expect(excerpt).toBeNull();
  });

  it('truncates candidate exceeding 50 words to 50 words with visible ellipsis (CON-01, CON-03)', () => {
    const longSource = generateWords(250);
    const overlongCandidate = generateWords(70);

    const excerpt = buildSanitizedExcerpt({
      candidateText: overlongCandidate,
      sourceVisibleText: longSource,
      language: 'en',
    });

    expect(excerpt).not.toBeNull();
    expect(excerpt?.wordCount).toBe(50);
    expect(excerpt?.text.endsWith('…')).toBe(true);

    const textWithoutEllipsis = excerpt?.text.slice(0, -1) ?? '';
    expect(overlongCandidate.startsWith(textWithoutEllipsis)).toBe(true);
  });

  it('truncates candidate exceeding 320 characters at word boundary with ellipsis (CON-01, CON-03)', () => {
    const longSource = generateWords(250);
    // 35 words each 10 chars = 35 * 10 + 34 spaces = 384 characters
    const candidate = Array.from({ length: 35 }, (_, i) => `abcdefgh${i + 1}`).join(' ');

    const excerpt = buildSanitizedExcerpt({
      candidateText: candidate,
      sourceVisibleText: longSource,
      language: 'en',
    });

    expect(excerpt).not.toBeNull();
    expect(excerpt?.charCount).toBeLessThanOrEqual(320);
    expect(excerpt?.text.endsWith('…')).toBe(true);

    const textWithoutEllipsis = excerpt?.text.slice(0, -1) ?? '';
    expect(candidate.startsWith(textWithoutEllipsis)).toBe(true);
  });

  it('truncates candidate exceeding 2 sentences to 2 sentences (CON-01)', () => {
    const longSource = generateWords(250);
    const candidate =
      'Sentence one is here. Sentence two follows it! Sentence three should be cut off? Sentence four is extra.';

    const excerpt = buildSanitizedExcerpt({
      candidateText: candidate,
      sourceVisibleText: longSource,
      language: 'en',
    });

    expect(excerpt).not.toBeNull();
    expect(excerpt?.sentenceCount).toBe(2);
    expect(excerpt?.text.startsWith('Sentence one is here. Sentence two follows it!')).toBe(true);
  });

  it('caps excerpt at 30% of source visible text (CON-01)', () => {
    // 160-word source -> 30% = 48 words (tighter than 50 words)
    const source = generateWords(160);
    const candidate = generateWords(60);

    const excerpt = buildSanitizedExcerpt({
      candidateText: candidate,
      sourceVisibleText: source,
      language: 'en',
    });

    expect(excerpt).not.toBeNull();
    expect(excerpt?.wordCount).toBe(48);
    expect(excerpt?.sourceShare).toBe(0.3);
  });

  it('asserts verbatim excerpt bounds via assertExcerptWithinBudget (CON-04, CON-05)', () => {
    const validSource = generateWords(200);
    const validExcerpt = generateWords(40);

    expect(() => assertExcerptWithinBudget(validExcerpt, validExcerpt, validSource)).not.toThrow();

    // Tampered excerpt exceeding word limit
    const tamperedExcerpt = generateWords(55);
    expect(() => assertExcerptWithinBudget(tamperedExcerpt, validExcerpt, validSource)).toThrow(ExcerptBudgetError);
  });

  it('handles Hindi Devanagari text with purna viram (D-14)', () => {
    // 200 words of Hindi source text
    const hindiWords = Array.from({ length: 200 }, () => 'समाचार').join(' ');
    const hindiCandidate =
      'भारत ने आज अंतरिक्ष में एक और नया कीर्तिमान स्थापित किया। इस ऐतिहासिक प्रक्षेपण से देश का मान बढ़ा है। यह तीसरा वाक्य कट जाना चाहिए।';

    const excerpt = buildSanitizedExcerpt({
      candidateText: hindiCandidate,
      sourceVisibleText: hindiWords,
      language: 'hi',
    });

    expect(excerpt).not.toBeNull();
    expect(excerpt?.sentenceCount).toBe(2);
    expect(
      excerpt?.text.startsWith(
        'भारत ने आज अंतरिक्ष में एक और नया कीर्तिमान स्थापित किया। इस ऐतिहासिक प्रक्षेपण से देश का मान बढ़ा है।'
      )
    ).toBe(true);
  });
});

describe('Normalizer integration with Excerpt Pipeline', () => {
  const fixedNow = new Date('2026-10-21T12:00:00Z').getTime();
  const snapshotTimestamp = '2026-10-21T12:00:00Z';

  it('populates excerpt and description on normalized item with substantial source', () => {
    const bodyWords = generateWords(220, 'news');
    const summary = 'Breaking news report on national infrastructure development.';
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>National Tribune</title>
    <link>https://test-en.example.com</link>
    <item>
      <title>Infrastructure Plan Approved</title>
      <link>https://test-en.example.com/story-1</link>
      <guid>https://test-en.example.com/story-1</guid>
      <description>&lt;p&gt;${summary}&lt;/p&gt;</description>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/">&lt;p&gt;${summary} ${bodyWords}&lt;/p&gt;</content:encoded>
      <pubDate>Wed, 21 Oct 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = normalizeFeed(rss, MOCK_SOURCE_EN, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(1);

    const item = items[0]!;
    expect(item.excerpt).not.toBeNull();
    expect(item.excerpt?.wordCount).toBe(7);
    expect(item.description).toBe(summary);
  });

  it('leaves excerpt null on item with short stub source under 160 words (CON-02)', () => {
    const shortSummary = 'Very short wire stub with only ten words in total.';
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Wire Service</title>
    <link>https://test-en.example.com</link>
    <item>
      <title>Quick Wire Update</title>
      <link>https://test-en.example.com/wire-1</link>
      <guid>https://test-en.example.com/wire-1</guid>
      <description>${shortSummary}</description>
      <pubDate>Wed, 21 Oct 2026 11:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = normalizeFeed(rss, MOCK_SOURCE_EN, snapshotTimestamp, fixedNow);
    expect(items.length).toBe(1);

    const item = items[0]!;
    expect(item.excerpt).toBeNull();
    expect(item.description).toBe(shortSummary);
  });
});
