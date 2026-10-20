import { EDITIONS } from '../config/editions';
import { SITE_NAME, SITE_ORIGIN } from '../config/site';
import type { HreflangAlternate, PageMeta, PageMetaInput } from '../types';

/**
 * The single source of truth for a page's title, description, canonical,
 * document language and hreflang set.
 *
 * Four rules live here, and each of them exists because the alternative is a
 * silent, expensive failure:
 *
 *   D-12  the site name comes from ONE config value. It is never written out
 *         again, because `news:name` is the single highest-impact string in
 *         the project — a mismatch against news.google.com kills Google News
 *         inclusion without any error being raised anywhere.
 *
 *   D-13  all seven editions share that one site name. The edition identity
 *         appears in the title, in the meta description (the country keyword
 *         is in the snippet as well as the title), in the document language
 *         and in the visible masthead. Per-edition site names are impossible:
 *         Google supports one site name per domain, not per subdirectory.
 *
 *   CON-09  every canonical is SELF-REFERENTIAL and never points at a
 *         publisher's domain. A Meridian page carries the multi-outlet
 *         coverage line and count, the trending rank, the tags, the
 *         cross-country flags and the related links, and none of that exists
 *         on the publisher's page. A canonical pointing at the publisher
 *         tells Google the Meridian page is not canonical, so the page leaves
 *         the index and the publication becomes referral-only.
 *
 *   CON-10  publisher attribution links are normal followed links carrying
 *         `rel="noopener"`, and never `nofollow` or `sponsored`. They are
 *         rendered by the story page; the policy is recorded in
 *         `docs/adr/0004-domain-and-name.md`.
 *
 * The canonical is CONSTRUCTED rather than sanitised: it is the site's own
 * origin plus a path, and a path that is a full URL is refused outright. A
 * canonical cannot drift to a publisher because there is no code path that
 * would let one.
 *
 * This module is framework-free and returns plain data. It is imported by
 * both the static build and the edge runtime, and it must stay importable by
 * both.
 */

/**
 * Build the metadata for a page.
 *
 * The hreflang set is carried, not computed. Phase 6 populates it, and the
 * India English / India Hindi rule is Phase 6's — this function only makes
 * sure the slot exists and that the rules above are applied.
 */
export function pageMeta(input: PageMetaInput): PageMeta {  const edition = EDITIONS.find((candidate) => candidate.id === input.edition);

  if (!edition) {
    throw new Error(`Unknown edition id: "${input.edition}".`);
  }

  // CON-09. A full URL here would put a publisher's domain into the
  // canonical and drop the page from the index. The refusal is loud because
  // the failure it prevents is invisible until the traffic does not arrive.
  if (/^https?:\/\//i.test(input.path)) {
    throw new Error(
      `pageMeta path must be a site path, never a full URL — got "${input.path}". A canonical must point at this site (CON-09).`,
    );
  }

  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;

  // D-12 and D-13: the site name first, the edition identity second, and
  // exactly one site name for every edition.
  const title = `${SITE_NAME} — ${edition.countryName}`;

  // D-13: the country keyword has to be in the snippet as well as the title.
  // A description without it reads as a generic description of the whole
  // publication rather than of this country's edition.
  const description = input.description.includes(edition.countryName)
    ? input.description
    : `${edition.countryName} — ${input.description}`;

  // CON-09: the canonical is the site's own origin plus the path. There is
  // no parameter that could make it point anywhere else.
  const canonical = `${SITE_ORIGIN}${path}`;

  const alternates: HreflangAlternate[] = input.alternates ?? [];

  return {
    title,
    description,
    canonical,
    htmlLang: edition.htmlLang,
    alternates,
  };
}

/**
 * Escape a value for interpolation into HTML text or a quoted attribute.
 *
 * A description can carry a publisher's words, so it is untrusted input.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the `<head>` metadata as an HTML string.
 *
 * This is the string-builder half of the module. `pageMeta` decides WHAT the
 * metadata is; this decides how it is written out. Keeping both here means
 * the statically built page and the dynamically served story page emit the
 * same bytes for the same metadata — which is the whole reason the shared
 * surface is framework-free string builders rather than components.
 *
 * The canonical it emits is the self-referential one from `pageMeta`, so
 * CON-09 holds in the rendered output and not merely in the data.
 */
export function renderHead(meta: PageMeta): string {
  const lines = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
  ];

  for (const alternate of meta.alternates) {
    lines.push(
      `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`,
    );
  }

  return lines.join('\n');
}
