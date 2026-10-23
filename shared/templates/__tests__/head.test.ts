import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EDITIONS } from '../../config/editions';
import { SITE_NAME, SITE_ORIGIN } from '../../config/site';
import { pageMeta, renderHead } from '../head';
import { typographicFallback } from '../typographic-fallback';

/**
 * D-13: all seven editions share ONE site name, and the edition identity
 * lives in the title, the description, the document language and the visible
 * masthead. There is no second site name, and there cannot be one.
 *
 * CON-09: every page emits a self-referential canonical and never one
 * pointing at a publisher's domain. A cross-domain canonical tells Google
 * that the Meridian page is not the canonical page, so the page leaves the
 * index and the publication becomes referral-only. The canonical is therefore
 * not merely tested — it is CONSTRUCTED from the site's own origin, and the
 * function refuses a full URL as a path.
 *
 * D-16: an expired image renders a SILENT typographic panel. No error
 * wording, no broken icon, no visible system explanation — the panel reads
 * as a deliberate design element, like a classified ad or a pull-quote.
 */

describe('pageMeta', () => {
  it('builds a canonical from the site origin and the path', () => {
    const meta = pageMeta({ title: 'x', description: 'y', path: '/uk/', edition: 'uk' });

    expect(meta.canonical).toBe(`${SITE_ORIGIN}/uk/`);
  });

  it('never emits a canonical that points at a foreign host', () => {
    for (const edition of EDITIONS) {
      const meta = pageMeta({
        title: 'x',
        description: 'y',
        path: `/${edition.slug}/`,
        edition: edition.id,
      });

      expect(meta.canonical.startsWith(SITE_ORIGIN)).toBe(true);
      // Exactly one scheme separator: the site's own. A publisher URL would
      // add a second one, or a different host entirely.
      expect(meta.canonical.split('://').length - 1).toBe(1);
      expect(meta.canonical).not.toMatch(/https?:\/\/(?!meridian)/);
    }
  });

  it('refuses a full URL as a path', () => {
    expect(() =>
      pageMeta({
        title: 'x',
        description: 'y',
        path: 'https://www.bbc.co.uk/news/world-123',
        edition: 'uk',
      }),
    ).toThrow(/path/i);
  });

  it('carries the site name and the edition identity in the title', () => {
    for (const edition of EDITIONS) {
      const meta = pageMeta({
        title: 'x',
        description: 'y',
        path: `/${edition.slug}/`,
        edition: edition.id,
      });

      expect(meta.title).toContain(SITE_NAME);
      expect(meta.title).toContain(edition.countryName);
      expect(meta.title.startsWith('x — ')).toBe(true);
      // The site name appears once. Two copies is how a per-edition site name
      // creeps back in.
      expect(meta.title.split(SITE_NAME).length - 1).toBe(1);
    }
  });

  it('uses the caller title first across editions and rejects invalid identity input', () => {
    expect(pageMeta({ title: 'Politics', description: 'y', path: '/uk/', edition: 'uk' }).title).toBe(
      'Politics — United Kingdom — The Meridian',
    );
    expect(pageMeta({ title: 'Election & <polls>', description: 'y', path: '/in/', edition: 'in' }).title).toBe(
      'Election & <polls> — India — The Meridian',
    );
    expect(() => pageMeta({ title: '   ', description: 'y', path: '/uk/', edition: 'uk' })).toThrow(/title/i);
    expect(() => pageMeta({ title: SITE_NAME, description: 'y', path: '/uk/', edition: 'uk' })).toThrow(/site name/i);
  });

  it('carries the country keyword in the description', () => {
    for (const edition of EDITIONS) {
      const meta = pageMeta({
        title: 'x',
        description: 'y',
        path: `/${edition.slug}/`,
        edition: edition.id,
      });

      expect(meta.description).toContain(edition.countryName);
    }
  });

  it('does not prefix the description when the country keyword is already there', () => {
    const meta = pageMeta({
      title: 'x',
      description: 'The latest from the United Kingdom, curated.',
      path: '/uk/',
      edition: 'uk',
    });

    expect(meta.description).toBe('The latest from the United Kingdom, curated.');
  });

  it("carries the edition's document language", () => {
    const expected: Record<string, string> = {
      uk: 'en-GB',
      us: 'en-US',
      au: 'en-AU',
      ca: 'en-CA',
      ie: 'en-IE',
      nz: 'en-NZ',
      in: 'en-IN',
      'in-hi': 'hi-IN',
    };

    for (const edition of EDITIONS) {
      const meta = pageMeta({
        title: 'x',
        description: 'y',
        path: `/${edition.slug}/`,
        edition: edition.id,
      });

      expect(meta.htmlLang).toBe(expected[edition.id]);
    }
  });

  it('carries an empty alternate set when none is supplied', () => {
    const meta = pageMeta({ title: 'x', description: 'y', path: '/uk/', edition: 'uk' });

    expect(meta.alternates).toEqual([]);
  });

  it('passes the alternate set through untouched', () => {
    const alternates = [{ hreflang: 'hi-IN', href: `${SITE_ORIGIN}/in-hi/` }];
    const meta = pageMeta({
      title: 'x',
      description: 'y',
      path: '/in/',
      edition: 'in',
      alternates,
    });

    expect(meta.alternates).toEqual(alternates);
  });
});

describe('renderHead', () => {
  it('renders the self-referential canonical, never a publisher URL', () => {
    const meta = pageMeta({
      title: 'Council backs new rail link',
      description: 'A story from the United Kingdom.',
      path: '/story/meridian-council-rail-link/',
      edition: 'uk',
    });
    const html = renderHead(meta);

    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/story/meridian-council-rail-link/" />`);
    expect(html).not.toMatch(/href="https?:\/\/(?!meridian)/);
  });

  it('renders the title and the description', () => {
    const meta = pageMeta({
      title: 'Council backs new rail link',
      description: 'A story from the United Kingdom.',
      path: '/uk/',
      edition: 'uk',
    });
    const html = renderHead(meta);

    expect(html).toContain(`<title>Council backs new rail link — United Kingdom — ${SITE_NAME}</title>`);
    expect(html).toContain('<meta name="description"');
  });

  it('renders each alternate as an hreflang link', () => {
    const meta = pageMeta({
      title: 'Council backs new rail link',
      description: 'A story from India.',
      path: '/in/',
      edition: 'in',
      alternates: [{ hreflang: 'hi-IN', href: `${SITE_ORIGIN}/in-hi/` }],
    });
    const html = renderHead(meta);

    expect(html).toContain(`<link rel="alternate" hreflang="hi-IN" href="${SITE_ORIGIN}/in-hi/" />`);
  });

  it('escapes a description that carries markup', () => {
    const meta = pageMeta({
      title: 'Council backs new rail link',
      description: 'A story from the United Kingdom: <script>alert("x")</script>',
      path: '/uk/',
      edition: 'uk',
    });
    const html = renderHead(meta);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a caller title that carries markup', () => {
    const html = renderHead(
      pageMeta({
        title: 'Council <em>backs</em>',
        description: 'A story from the United Kingdom.',
        path: '/uk/',
        edition: 'uk',
      }),
    );

    expect(html).toContain('&lt;em&gt;backs&lt;/em&gt;');
    expect(html).not.toContain('<em>backs</em>');
  });

  it('keeps the site-name ADR bound to executable source and runtime/deployment configuration', () => {
    const adr = readFileSync(fileURLToPath(new URL('../../../docs/adr/0004-domain-and-name.md', import.meta.url)), 'utf8');

    expect(adr).toContain('shared/config/site.ts');
    expect(adr).toContain('executable source');
    expect(adr).toContain('runtime/deployment configuration');
    expect(adr).toContain('Historical or explanatory Markdown');
  });
});

describe('typographicFallback', () => {  /** The wording a silent panel must never contain. */
  const FORBIDDEN = ['image', 'not found', 'missing', 'unavailable', 'archived', 'expired'];

  it('renders the headline opening words as a deliberate design element', () => {
    const html = typographicFallback('Council backs new rail link after long debate');

    // The panel carries the OPENING words — the first four — and no more.
    expect(html).toContain('Council');
    expect(html).toContain('back');
    expect(html).toContain('rail');
    expect(html).not.toContain('link');
    expect(html).not.toContain('debate');
  });

  it('carries no error wording at all', () => {
    const html = typographicFallback('Council backs new rail link after long debate');
    const lowered = html.toLowerCase();

    for (const phrase of FORBIDDEN) {
      expect(lowered).not.toContain(phrase);
    }
  });

  it('reads as a headline to a screen reader rather than as a broken picture', () => {
    const html = typographicFallback('Council backs new rail link after long debate');

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label=');
    // The label carries the headline, not an explanation of the failure.
    expect(html).toMatch(/aria-label="[^"]*rail[^"]*"/);
  });

  it('escapes a headline that carries markup', () => {
    const html = typographicFallback('<script>alert("x")</script>');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is a pure function of its argument', () => {
    const first = typographicFallback('Council backs new rail link after long debate');
    const second = typographicFallback('Council backs new rail link after long debate');

    expect(first).toBe(second);
  });

  it('takes only the opening words of the headline', () => {
    const html = typographicFallback('Council backs new rail link after long debate');

    expect(html).toContain('Council');
    expect(html).not.toContain('link');
    expect(html).not.toContain('debate');
  });
});
