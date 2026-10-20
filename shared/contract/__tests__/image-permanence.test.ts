import { describe, expect, it } from 'vitest';

import {
  MEDIA_LIFETIME_DAYS,
  hasMediaExpired,
  resolveMediaObject,
} from '../image-permanence';

/**
 * D-15 through D-19: the image-permanence contract.
 *
 * A story's URL is permanent; its image is not. The page that referenced the
 * image was rendered months earlier and its HTML still points at the object
 * that has since expired. What the reader sees in its place must not be an
 * error, and the cost of checking must be a number the project has agreed to
 * pay rather than one discovered in a dashboard.
 */

describe('the media lifetime', () => {
  it('runs every media object on the same twelve-month clock', () => {
    // D-15: one clock for everything. A second rule would be a second thing
    // to reason about, and an exemption would be a hole in the budget.
    expect(MEDIA_LIFETIME_DAYS).toBe(365);
  });

  it('expires an object that has run its clock and no younger one', () => {
    expect(hasMediaExpired(MEDIA_LIFETIME_DAYS)).toBe(true);
    expect(hasMediaExpired(MEDIA_LIFETIME_DAYS + 1)).toBe(true);
    expect(hasMediaExpired(MEDIA_LIFETIME_DAYS - 1)).toBe(false);
    expect(hasMediaExpired(0)).toBe(false);
  });
});

describe('resolveMediaObject', () => {
  it('reports a present object and stands nothing in for it', () => {
    const resolution = resolveMediaObject(true, 'Council backs new rail link');

    expect(resolution.state).toBe('present');
    expect(resolution.fallbackHtml).toBe('');
  });

  it('reports an expired object and stands the silent panel in for it', () => {
    const resolution = resolveMediaObject(false, 'Council backs new rail link');

    expect(resolution.state).toBe('expired');
    expect(resolution.fallbackHtml).toContain('Council');
    expect(resolution.fallbackHtml).toContain('rail');
  });

  it('carries no error wording in the panel it substitutes', () => {
    const resolution = resolveMediaObject(false, 'Council backs new rail link');
    const lowered = resolution.fallbackHtml.toLowerCase();

    for (const phrase of ['image', 'not found', 'missing', 'unavailable', 'archived', 'expired']) {
      expect(lowered).not.toContain(phrase);
    }
  });

  it('is a pure function of its arguments', () => {
    const first = resolveMediaObject(false, 'Council backs new rail link');
    const second = resolveMediaObject(false, 'Council backs new rail link');

    expect(first).toEqual(second);
  });
});
