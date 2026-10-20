/**
 * The silent typographic panel (D-16).
 *
 * Every media object expires on the same 12-month clock, and a story's URL
 * is permanent. So a page published in month one is still live in month
 * thirty, and the image it was rendered with is gone. What the reader sees
 * in its place must not be an error.
 *
 * The panel is a ruled typographic block carrying the headline's opening
 * words — the visual language of a classified ad or a pull-quote, not the
 * visual language of a web app's missing-picture state. There is no caption
 * explaining what happened, no broken icon and no visible system text. The
 * reader is not told that something is wrong, because from their side
 * nothing is wrong: they are reading a newspaper and this is a box in it.
 *
 * That silence is a hard constraint, not a tone choice. The strings that
 * would explain the failure — "image", "not found", "missing", "unavailable",
 * "archived", "expired" — are checked for by the test beside this file, and
 * the panel is written so that none of them can appear.
 *
 * The panel is a PURE function of the headline. It reads no clock, no
 * environment and no global state, so the dynamically served story page and
 * the statically built section page render the same block for the same
 * headline.
 *
 * The headline arrives from a publisher's feed, which is untrusted input, so
 * every interpolated value is HTML-escaped.
 */

/** How many opening words of the headline the panel carries. */
const OPENING_WORDS = 4;

/** Escape a value for interpolation into HTML text or a quoted attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The headline's opening words, joined by single spaces. */
function openingWords(headline: string): string {
  return headline
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, OPENING_WORDS)
    .join(' ');
}

/**
 * Render the typographic panel that stands in for an expired media object.
 *
 * The panel carries the headline's opening words in a ruled block. It is
 * marked `role="img"` with an `aria-label` carrying the same words, so a
 * screen reader announces a headline rather than announcing a failure.
 */
export function typographicFallback(headline: string): string {
  const words = escapeHtml(openingWords(headline));

  return [
    '<figure class="typographic-panel" role="img" aria-label="' + words + '">',
    '<div class="typographic-panel__rule" aria-hidden="true"></div>',
    '<blockquote class="typographic-panel__quote">',
    `<p class="typographic-panel__words">${words}</p>`,
    '</blockquote>',
    '</figure>',
  ].join('');
}
