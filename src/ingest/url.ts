const BANNED_PARAM_PREFIXES = ['utm_', 'at_'];
const BANNED_EXACT_PARAMS = new Set([
  'ref',
  'ref_src',
  'fbclid',
  'gclid',
  'cmp',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'igshid',
  'msclkid',
]);

/**
 * Normalizes a source article URL into a canonical format:
 * - Enforces https:// protocol
 * - Lowercases hostname and strips leading www.
 * - Strips URL fragments (#...)
 * - Removes marketing and social tracking parameters (utm_*, ref, fbclid, gclid, etc.)
 * - Sorts remaining query parameters deterministically
 * - Strips trailing slashes from path (except for root '/')
 */
export function canonicalizeSourceUrl(rawUrl: string): string {
  let trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Cannot canonicalize empty URL');
  }

  if (trimmed.startsWith('//')) {
    trimmed = `https:${trimmed}`;
  } else if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  const url = new URL(trimmed);
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';

  const keysToDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    const lowerKey = key.toLowerCase();
    if (
      BANNED_EXACT_PARAMS.has(lowerKey) ||
      BANNED_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))
    ) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    url.searchParams.delete(key);
  }

  url.searchParams.sort();

  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname) pathname = '/';

  const query = url.searchParams.toString();
  return `https://${url.hostname}${pathname}${query ? `?${query}` : ''}`;
}
