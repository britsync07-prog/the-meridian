/**
 * HTML text sanitization and entity decoding utilities for feed descriptions and content.
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
};

/**
 * Decodes named, decimal, and hex XML/HTML entities into plain text.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  let decoded = text;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    decoded = decoded.replaceAll(entity, char);
  }
  // Decimal numeric entities &#123;
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    const code = Number(dec);
    return isNaN(code) ? _ : String.fromCharCode(code);
  });
  // Hexadecimal numeric entities &#x1F;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const code = parseInt(hex, 16);
    return isNaN(code) ? _ : String.fromCharCode(code);
  });
  return decoded;
}

/**
 * Cleans candidate HTML text:
 * 1. Strips <script> and <style> blocks completely.
 * 2. Strips all HTML markup tags.
 * 3. Decodes XML/HTML entities.
 * 4. Collapses consecutive whitespace to a single space.
 * 5. Trims leading and trailing whitespace.
 */
export function cleanCandidateText(rawHtml: string | null | undefined): string {
  if (!rawHtml) return '';
  return decodeHtmlEntities(
    rawHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|h[1-6]|li|article|section|blockquote|tr|td)>/gi, ' ')
      .replace(/<(br|hr)\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}
