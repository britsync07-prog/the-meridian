import { typographicFallback } from '../templates/typographic-fallback';
import { MEDIA_LIFETIME_DAYS as configuredMediaLifetimeDays } from '../config/r2-lifecycle.js';

/**
 * D-15 through D-19: the image-permanence contract.
 *
 * A story's URL is permanent. Its image is not. Every media object runs the
 * same 12-month clock, and once the clock has run the object is gone — but
 * the page that referenced it was rendered months earlier and its HTML
 * still points at the missing object.
 *
 * The rule this module encodes is the whole of the decision:
 *
 *   D-15  every media object expires on the SAME 12-month clock. There are
 *         no exemptions, no curated permanent set and no second rule to
 *         reason about.
 *   D-16  an expired image renders a SILENT typographic panel carrying the
 *         headline's opening words. No caption, no broken icon, no visible
 *         system explanation.
 *   D-17  BOTH mechanisms apply: resolution at serve time, and a periodic
 *         sweep that re-renders the permanently affected pages.
 *   D-18  the serve-time check costs one extra R2 Class B read per image
 *         view. That cost is accepted and is charged against the
 *         `r2_class_b_ops_per_month` ceiling in `config/free-tier-limits.json`.
 *   D-19  Open Graph images never expire, and are excluded from every
 *         lifecycle rule alongside the site root.
 *
 * The module is PURE. It reads no bucket and no clock: the caller performs
 * the R2 read (that is the one Class B operation of D-18) and hands the
 * observed state in. A shared module that reached into R2 could not be used
 * by the static build, and the static build needs the same rule to decide
 * what to render for a story whose media has already expired.
 */

/**
 * The lifetime every media object runs on.
 *
 * D-15 states the clock in months; the R2 lifecycle rule that enforces it is
 * expressed in days, and 365 days is that clock. The value is the SAME for
 * every object — that is the entire point of D-15. There is no per-publisher
 * carve-out and no permanent set, because a rule with exceptions is a rule
 * that has to be reasoned about every time one of them is questioned.
 */
export const MEDIA_LIFETIME_DAYS = configuredMediaLifetimeDays;

/** Whether a media object is still there. */
export type MediaState = 'present' | 'expired';

/** The outcome of resolving a media object. */
export interface MediaResolution {
  /** Whether the object is still in the bucket. */
  readonly state: MediaState;
  /**
   * The HTML standing in for the media object.
   *
   * Empty when the object is present — the caller serves the real object.
   * The silent typographic panel when it is not.
   */
  readonly fallbackHtml: string;
}

/**
 * Whether an object of this age has run its clock.
 *
 * This is the sweep's predicate (D-17): the periodic job finds the pages
 * whose media has expired and re-renders exactly those, so the common case
 * never pays a lookup at serve time.
 */
export function hasMediaExpired(ageDays: number): boolean {
  return ageDays >= MEDIA_LIFETIME_DAYS;
}

/**
 * Resolve a media object from what the caller observed.
 *
 * The parameter is the observed presence of the object, not its key. The key
 * is resolved by the caller — that read is the single extra R2 Class B
 * operation of D-18, and paying for it belongs to the caller, not to a
 * shared function that must stay usable from the static build.
 *
 * An expired object renders the silent typographic panel and nothing else:
 * no caption, no icon, no explanation. The reader is not told that something
 * is wrong, because from their side nothing is wrong.
 */
export function resolveMediaObject(objectExists: boolean, headline: string): MediaResolution {
  if (objectExists) {
    return { state: 'present', fallbackHtml: '' };
  }

  return { state: 'expired', fallbackHtml: typographicFallback(headline) };
}
