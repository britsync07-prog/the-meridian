import { createHash } from 'node:crypto';
import { canonicalizeSourceUrl } from './url';

export interface ResolveIdentityOptions {
  forceUrlIdentity?: boolean;
}

/**
 * Resolves the persistent deduplication identity for an item.
 * - When a stable publisher GUID is provided and not flagged as oscillating, uses the GUID.
 * - If GUID is absent, empty, or flagged as unstable/oscillating, falls back to SHA-256 of canonical URL.
 */
export function resolveItemIdentity(
  item: { guid?: string; link: string },
  options?: ResolveIdentityOptions
): string {
  if (options?.forceUrlIdentity || !item.guid || !item.guid.trim()) {
    const canonical = canonicalizeSourceUrl(item.link);
    const hash = createHash('sha256').update(canonical).digest('hex');
    return `url:${hash}`;
  }

  return item.guid.trim();
}
