/**
 * Hreflang alternate builder.
 *
 * SEO-10: hreflang is emitted ONLY between the India English and India Hindi editions,
 * as a bidirectional self-including set with x-default pointing at the global front page.
 * An India English story with no genuine Hindi counterpart declares no hi-IN alternate.
 */

import { EDITIONS } from '../config/editions.js';
import type { HreflangAlternate } from '../types.js';

/**
 * Build the hreflang alternate set for a given edition and path.
 *
 * Rules:
 * - Only India EN (en-IN) and India HI (hi-IN) are linked to each other
 * - x-default points to the global front page (/)
 * - No other editions emit hreflang alternates
 * - The set is bidirectional and self-including
 */
export function buildHreflang(
  editionId: string,
  path: string,
): HreflangAlternate[] {
  const edition = EDITIONS.find((e) => e.id === editionId);
  if (!edition) return [];

  const baseOrigin = 'https://meridian.workers.dev';
  const alternates: HreflangAlternate[] = [];

  // x-default always points to global front page
  alternates.push({ hreflang: 'x-default', href: baseOrigin });

  // Only India EN and India HI get hreflang links to each other
  if (edition.id === 'in') {
    // India English → India Hindi
    alternates.push({ hreflang: 'en-IN', href: `${baseOrigin}/in${path}` });
    alternates.push({ hreflang: 'hi-IN', href: `${baseOrigin}/in-hi${path}` });
  } else if (edition.id === 'in-hi') {
    // India Hindi → India English
    alternates.push({ hreflang: 'hi-IN', href: `${baseOrigin}/in-hi${path}` });
    alternates.push({ hreflang: 'en-IN', href: `${baseOrigin}/in${path}` });
  } else {
    // Other editions: only self + x-default (no hreflang between editions)
    alternates.push({ hreflang: edition.htmlLang, href: `${baseOrigin}/${edition.slug}${path}` });
  }

  return alternates;
}

/**
 * Check if an edition should emit hreflang alternates.
 * Only true for India EN and India HI.
 */
export function hasHreflang(editionId: string): boolean {
  return editionId === 'in' || editionId === 'in-hi';
}