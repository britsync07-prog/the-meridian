import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MEDIA_LIFETIME_DAYS as configuredMediaLifetimeDays,
  R2_EXPIRY_PREFIXES,
  R2_LIFECYCLE_RULES,
} from '../../config/r2-lifecycle.js';
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
  it('uses the lifecycle config as the sole expiry definition', () => {
    expect(R2_LIFECYCLE_RULES).toEqual([
      { id: 'expire-raw', prefix: 'raw/', expireDays: 7 },
      { id: 'expire-media', prefix: 'media/', expireDays: 365 },
    ]);
    expect(MEDIA_LIFETIME_DAYS).toBe(configuredMediaLifetimeDays);
    expect(R2_EXPIRY_PREFIXES).toEqual(['raw/', 'media/']);
    expect(R2_EXPIRY_PREFIXES).not.toContain('og/');
    expect(R2_EXPIRY_PREFIXES).not.toContain('');
  });

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

describe('the lifecycle safety boundary', () => {
  it('documents the shared two-rule source and permanent og/root boundary', () => {
    const adr = readFileSync(join(process.cwd(), 'docs', 'adr', '0003-image-permanence.md'), 'utf8');

    expect(adr).toContain('shared/config/r2-lifecycle.js');
    expect(adr).toMatch(/raw\/.*7 days/i);
    expect(adr).toMatch(/media\/.*365 days/i);
    expect(adr).toContain('og/');
    expect(adr).toMatch(/bucket-root objects are permanent/i);

    for (const script of ['r2-lifecycle.mjs', 'verify-lifecycle.mjs']) {
      const content = readFileSync(join(process.cwd(), 'scripts', 'cloudflare', script), 'utf8');
      expect(content).toContain("../../shared/config/r2-lifecycle.js");
    }
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
