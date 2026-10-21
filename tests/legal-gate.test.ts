import { describe, expect, it } from 'vitest';
import { SOURCES } from '../config/sources';
import type { SourceRegistryEntry } from '../shared/types';

/**
 * Validates the terms of use compliance for a given source registry entry.
 * Throws an Error if an active source fails the launch-blocking legal gate (ING-04, D-17).
 */
export function validateSourceTerms(source: SourceRegistryEntry): void {
  if (!source.isActive) {
    return;
  }

  if (source.termsStatus !== 'verified') {
    throw new Error(
      `Legal gate failure for active source "${source.slug}": termsStatus must be 'verified', got '${source.termsStatus}'.`,
    );
  }

  if (!source.termsVerifiedAt || !/^\d{4}-\d{2}-\d{2}$/.test(source.termsVerifiedAt)) {
    throw new Error(
      `Legal gate failure for active source "${source.slug}": termsVerifiedAt must match YYYY-MM-DD format, got '${source.termsVerifiedAt}'.`,
    );
  }

  if (!source.verifiedBy || source.verifiedBy.trim().length === 0) {
    throw new Error(
      `Legal gate failure for active source "${source.slug}": verifiedBy must be non-empty.`,
    );
  }

  if (!source.termsUrl || !source.termsUrl.startsWith('https://')) {
    throw new Error(
      `Legal gate failure for active source "${source.slug}": termsUrl must start with https://, got '${source.termsUrl}'.`,
    );
  }

  if (source.freshnessSlaHours !== 24 && source.freshnessSlaHours !== 48) {
    throw new Error(
      `SLA gate failure for source "${source.slug}": freshnessSlaHours must be 24 or 48, got ${source.freshnessSlaHours}.`,
    );
  }
}

describe('launch-blocking legal gate and freshness SLA', () => {
  const activeSources = SOURCES.filter((s) => s.isActive);

  it('contains at least 20 active sources configured across all editions', () => {
    expect(activeSources.length).toBeGreaterThanOrEqual(20);
  });

  it('enforces that every active source has termsStatus === "verified"', () => {
    for (const source of activeSources) {
      expect(source.termsStatus).toBe('verified');
    }
  });

  it('enforces that every active source has termsVerifiedAt in YYYY-MM-DD format', () => {
    for (const source of activeSources) {
      expect(source.termsVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('enforces that every active source has non-empty verifiedBy', () => {
    for (const source of activeSources) {
      expect(typeof source.verifiedBy).toBe('string');
      expect(source.verifiedBy!.trim().length).toBeGreaterThan(0);
    }
  });

  it('enforces that every active source has an HTTPS termsUrl', () => {
    for (const source of activeSources) {
      expect(source.termsUrl).toMatch(/^https:\/\//);
    }
  });

  it('enforces that every source has a freshnessSlaHours of 24 or 48', () => {
    for (const source of SOURCES) {
      expect([24, 48]).toContain(source.freshnessSlaHours);
    }
  });

  it('passes all active sources through validateSourceTerms without throwing', () => {
    for (const source of activeSources) {
      expect(() => validateSourceTerms(source)).not.toThrow();
    }
  });

  it('self-proving: rejects active sources with unverified or refused terms', () => {
    const unverifiedFixture: SourceRegistryEntry = {
      slug: 'unverified-test',
      name: 'Unverified Test Outlet',
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/rss',
      countryCode: 'GB',
      language: 'en',
      sectionPrior: {},
      freshnessSlaHours: 24,
      isActive: true,
      termsStatus: 'unverified',
      termsVerifiedAt: null,
      verifiedBy: null,
      termsUrl: null,
    };

    expect(() => validateSourceTerms(unverifiedFixture)).toThrow(/termsStatus must be 'verified'/);

    const refusedFixture: SourceRegistryEntry = {
      ...unverifiedFixture,
      termsStatus: 'refused',
      termsVerifiedAt: '2026-10-21',
      verifiedBy: 'system-auditor',
      termsUrl: 'https://example.com/terms',
    };

    expect(() => validateSourceTerms(refusedFixture)).toThrow(/termsStatus must be 'verified'/);
  });

  it('self-proving: rejects active sources with invalid termsUrl or missing verifiedBy', () => {
    const badUrlFixture: SourceRegistryEntry = {
      slug: 'bad-url-test',
      name: 'Bad URL Outlet',
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/rss',
      countryCode: 'US',
      language: 'en',
      sectionPrior: {},
      freshnessSlaHours: 24,
      isActive: true,
      termsStatus: 'verified',
      termsVerifiedAt: '2026-10-21',
      verifiedBy: 'system-auditor',
      termsUrl: 'http://insecure.example.com/terms',
    };

    expect(() => validateSourceTerms(badUrlFixture)).toThrow(/termsUrl must start with https:\/\//);

    const missingAuditorFixture: SourceRegistryEntry = {
      ...badUrlFixture,
      termsUrl: 'https://example.com/terms',
      verifiedBy: '   ',
    };

    expect(() => validateSourceTerms(missingAuditorFixture)).toThrow(/verifiedBy must be non-empty/);
  });
});
