import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SOURCES } from '../config/sources';
import { normalizeFeedForRunner } from '../scripts/ingest/run-local';
import { normalizeFeed } from '../src/ingest/normalizer';
import type { SourceRegistryEntry } from '../shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'feeds');

function loadFixture(filename: string): string {
  return readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
}

describe('Dual-Run Parity Verification (ING-02, D-28, D-30)', () => {
  const gbSource = SOURCES.find((s) => s.countryCode === 'GB') as SourceRegistryEntry;
  const hindiSource = SOURCES.find((s) => s.language === 'hi') as SourceRegistryEntry;
  const usSource = SOURCES.find((s) => s.countryCode === 'US') as SourceRegistryEntry;

  const fixedNow = Date.parse('2026-10-21T12:00:00.000Z');
  const snapshotIso = '2026-10-21T12:00:00.000Z';

  it('normalizes standard RSS 2.0 identically in local runner and CI pipeline', () => {
    const xml = loadFixture('rss-standard.xml');

    const ciItems = normalizeFeed(xml, gbSource, snapshotIso, fixedNow);
    const localItems = normalizeFeedForRunner(xml, gbSource, snapshotIso, fixedNow);

    expect(localItems).toHaveLength(ciItems.length);
    expect(localItems.length).toBeGreaterThan(0);

    // Deep equality of all fields
    expect(localItems).toEqual(ciItems);

    // Byte-identical serialization
    expect(JSON.stringify(localItems)).toBe(JSON.stringify(ciItems));

    // Field-level assertions
    for (let i = 0; i < localItems.length; i++) {
      expect(localItems[i].title).toBe(ciItems[i].title);
      expect(localItems[i].canonicalUrl).toBe(ciItems[i].canonicalUrl);
      expect(localItems[i].externalGuid).toBe(ciItems[i].externalGuid);
      expect(localItems[i].description).toBe(ciItems[i].description);
      expect(localItems[i].publishedAt).toBe(ciItems[i].publishedAt);
      expect(localItems[i].imageUrl).toBe(ciItems[i].imageUrl);
      expect(localItems[i].imageCredit).toBe(ciItems[i].imageCredit);
    }
  });

  it('normalizes native Hindi feed identically without Devanagari or punctuation drift', () => {
    const xml = loadFixture('hindi-standard.xml');

    const ciItems = normalizeFeed(xml, hindiSource, snapshotIso, fixedNow);
    const localItems = normalizeFeedForRunner(xml, hindiSource, snapshotIso, fixedNow);

    expect(localItems).toHaveLength(ciItems.length);
    expect(localItems.length).toBeGreaterThan(0);

    expect(localItems).toEqual(ciItems);
    expect(JSON.stringify(localItems)).toBe(JSON.stringify(ciItems));

    // Devanagari text and purna viram verification
    expect(localItems[0].title).toContain('सुप्रीम कोर्ट');
    expect(localItems[0].description).toContain('।');
    expect(localItems[0].description).toBe(ciItems[0].description);
  });

  it('maintains dual-run parity across Atom 1.0, RDF, and oscillating GUID feeds', () => {
    const atomXml = loadFixture('atom-standard.xml');
    const rdfXml = loadFixture('rdf-standard.xml');
    const oscillatingXml = loadFixture('oscillating-guid.xml');

    const atomCi = normalizeFeed(atomXml, usSource, snapshotIso, fixedNow);
    const atomLocal = normalizeFeedForRunner(atomXml, usSource, snapshotIso, fixedNow);
    expect(atomLocal).toEqual(atomCi);
    expect(JSON.stringify(atomLocal)).toBe(JSON.stringify(atomCi));

    const rdfCi = normalizeFeed(rdfXml, gbSource, snapshotIso, fixedNow);
    const rdfLocal = normalizeFeedForRunner(rdfXml, gbSource, snapshotIso, fixedNow);
    expect(rdfLocal).toEqual(rdfCi);
    expect(JSON.stringify(rdfLocal)).toBe(JSON.stringify(rdfCi));

    const oscCi = normalizeFeed(oscillatingXml, usSource, snapshotIso, fixedNow);
    const oscLocal = normalizeFeedForRunner(oscillatingXml, usSource, snapshotIso, fixedNow);
    expect(oscLocal).toEqual(oscCi);
    expect(JSON.stringify(oscLocal)).toBe(JSON.stringify(oscCi));
  });
});
