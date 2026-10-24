/**
 * Tests for build-assertions.ts — the Phase 5 build assertion suite.
 */

import { describe, expect, it } from 'vitest';
import type { SnapshotData } from '../../../apps/site/src/lib/snapshot.js';
import {
  assertThinEdition,
  assertSectionStoryFloor,
  assertSingleOutletDominance,
  assertNoDuplicateTitles,
  assertStoryValueElements,
} from '../build-assertions';

// Helper to create minimal valid snapshots
function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    generated_at: '2026-10-24T10:00:00Z',
    schema_version: 1,
    editions: [
      { id: 'uk', slug: 'uk', name: 'United Kingdom', country_code: 'GB', language: 'en' },
      { id: 'us', slug: 'us', name: 'United States', country_code: 'US', language: 'en' },
      { id: 'au', slug: 'au', name: 'Australia', country_code: 'AU', language: 'en' },
      { id: 'ca', slug: 'ca', name: 'Canada', country_code: 'CA', language: 'en' },
      { id: 'ie', slug: 'ie', name: 'Ireland', country_code: 'IE', language: 'en' },
      { id: 'nz', slug: 'nz', name: 'New Zealand', country_code: 'NZ', language: 'en' },
      { id: 'in', slug: 'in', name: 'India', country_code: 'IN', language: 'en' },
      { id: 'in-hi', slug: 'in-hi', name: 'India (Hindi)', country_code: 'IN', language: 'hi' },
    ],
    sections: [
      { id: 'politics', name: 'Politics', sortOrder: 1 },
      { id: 'business', name: 'Business', sortOrder: 2 },
      { id: 'technology', name: 'Technology', sortOrder: 3 },
      { id: 'sport', name: 'Sport', sortOrder: 4 },
      { id: 'health', name: 'Health', sortOrder: 5 },
      { id: 'world', name: 'World', sortOrder: 6 },
      { id: 'weather', name: 'Weather', sortOrder: 7 },
      { id: 'entertainment', name: 'Entertainment', sortOrder: 8 },
    ],
    clusters: [
      { id: 1, slug: 'cluster-1', canonical_headline: 'Headline 1', published_at: '2026-10-24T08:00:00Z', is_prominent: true, trending_score: 10.0, outlet_count: 3, editorial_rank: 1 },
      { id: 2, slug: 'cluster-2', canonical_headline: 'Headline 2', published_at: '2026-10-24T07:00:00Z', is_prominent: false, trending_score: 8.5, outlet_count: 2, editorial_rank: 2 },
    ],
    story_sources: [
      { cluster_id: 1, source_id: 'bbc', rank: 1, headline: 'BBC', url: 'https://bbc.co.uk', published_at: '2026-10-24T08:00:00Z' },
      { cluster_id: 1, source_id: 'guardian', rank: 2, headline: 'Guardian', url: 'https://theguardian.com', published_at: '2026-10-24T07:30:00Z' },
      { cluster_id: 2, source_id: 'reuters', rank: 1, headline: 'Reuters', url: 'https://reuters.com', published_at: '2026-10-24T07:00:00Z' },
    ],
    edition_clusters: [
      { edition_id: 'uk', cluster_id: 1 },
      { edition_id: 'uk', cluster_id: 2 },
    ],
    cluster_sections: [
      { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
      { cluster_id: 2, section_id: 'technology', confidence: 0.8, method: 'keyword' },
    ],
    cluster_topics: [],
    cluster_entities: [],
    topics: [],
    entities: [],
    sources: [
      { id: 1, slug: 'bbc', name: 'BBC', feed_url: 'https://feeds.bbci.co.uk/news/rss.xml', country_code: 'GB', language: 'en' },
      { id: 2, slug: 'guardian', name: 'Guardian', feed_url: 'https://theguardian.com/feed', country_code: 'GB', language: 'en' },
      { id: 3, slug: 'reuters', name: 'Reuters', feed_url: 'https://reuters.com/feed', country_code: 'US', language: 'en' },
    ],
    manifest: {
      hash: 'abc123',
      content_length: 1000,
      compressed_length: 500,
      cluster_count: 2,
    },
    ...overrides,
  };
}

describe('build-assertions.ts', () => {
  describe('assertThinEdition', () => {
    it('passes when all editions have >= 8 stories', () => {
      const allEditionIds = ['uk', 'us', 'au', 'ca', 'ie', 'nz', 'in', 'in-hi'];
      const clusters = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, slug: `cluster-${i}` }));
      const editionClusters = clusters.flatMap((c) =>
        allEditionIds.map((e) => ({ edition_id: e, cluster_id: ((c.id - 1) % 8) + 1 + Math.floor((c.id - 1) / 8) * 8 }))
      );
      const snapshot = createSnapshot({ clusters: clusters as any, edition_clusters: editionClusters as any });

      expect(() => assertThinEdition(snapshot)).not.toThrow();
    });

    it('throws when an edition has fewer than 8 stories', () => {
      const editionClusters = [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
      ];
      const snapshot = createSnapshot({ edition_clusters: editionClusters as any });

      expect(() => assertThinEdition(snapshot)).toThrow('assertThinEdition');
    });
  });

  describe('assertSectionStoryFloor', () => {
    it('passes when all sections have >= 3 stories', () => {
      const sectionIds = ['politics','business','technology','sport','health','world','weather','entertainment'];
      const editionIds = ['uk','us','au','ca','ie','nz','in','in-hi'];
      // 3 clusters per section per edition = 8 sections * 8 editions * 3 clusters = 192 clusters
      const clusters = Array.from({ length: 192 }, (_, i) => ({ id: i + 1 }));
      const editionClusters = editionIds.flatMap((eid) =>
        sectionIds.flatMap((sid, si) =>
          [1, 2, 3].map((c) => ({ edition_id: eid, cluster_id: si * 3 + c }))
        )
      );
      // Each cluster maps to exactly ONE section (not all sections)
      const clusterSections = editionClusters.map((ec) => ({
        cluster_id: ec.cluster_id,
        section_id: sectionIds[(ec.cluster_id - 1) % 8],
        confidence: 0.9,
        method: 'test',
      }));
      const snapshot = createSnapshot({
        clusters: clusters as any,
        edition_clusters: editionClusters as any,
        cluster_sections: clusterSections as any,
      });

      expect(() => assertSectionStoryFloor(snapshot)).not.toThrow();
    });

    it('throws when a section has fewer than 3 stories', () => {
      const editionClusters = [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
      ];
      const clusterSections = [
        { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'test' },
        { cluster_id: 2, section_id: 'politics', confidence: 0.9, method: 'test' },
      ];
      const snapshot = createSnapshot({
        edition_clusters: editionClusters as any,
        cluster_sections: clusterSections as any,
      });

      expect(() => assertSectionStoryFloor(snapshot)).toThrow('assertSectionStoryFloor');
    });
  });

  describe('assertSingleOutletDominance', () => {
    it('passes when no outlet exceeds 35%', () => {
      const snapshot = createSnapshot();
      expect(() => assertSingleOutletDominance(snapshot)).not.toThrow();
    });

    it('throws when one outlet supplies > 35% of stories', () => {
      const editionClusters = [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
        { edition_id: 'uk', cluster_id: 3 },
      ];
      const storySources = [
        { cluster_id: 1, source_id: 'bbc', rank: 1, headline: 'A', url: 'https://bbc.co.uk', published_at: '2026-10-24T08:00:00Z' },
        { cluster_id: 2, source_id: 'bbc', rank: 1, headline: 'B', url: 'https://bbc.co.uk', published_at: '2026-10-24T07:00:00Z' },
        { cluster_id: 3, source_id: 'bbc', rank: 1, headline: 'C', url: 'https://bbc.co.uk', published_at: '2026-10-24T06:00:00Z' },
      ];
      const snapshot = createSnapshot({
        edition_clusters: editionClusters as any,
        story_sources: storySources as any,
      });

      expect(() => assertSingleOutletDominance(snapshot)).toThrow('assertSingleOutletDominance');
    });
  });

  describe('assertNoDuplicateTitles', () => {
    it('passes when all headlines are unique', () => {
      const snapshot = createSnapshot();
      expect(() => assertNoDuplicateTitles(snapshot)).not.toThrow();
    });

    it('throws when duplicate headlines exist', () => {
      const clusters = [
        { id: 1, slug: 'cluster-1', canonical_headline: 'Same Headline', published_at: '2026-10-24T08:00:00Z', is_prominent: true, trending_score: 10.0, outlet_count: 3, editorial_rank: 1 },
        { id: 2, slug: 'cluster-2', canonical_headline: 'Same Headline', published_at: '2026-10-24T07:00:00Z', is_prominent: false, trending_score: 8.5, outlet_count: 2, editorial_rank: 2 },
      ];
      const snapshot = createSnapshot({ clusters: clusters as any });

      expect(() => assertNoDuplicateTitles(snapshot)).toThrow('assertNoDuplicateTitles');
    });
  });

  describe('assertStoryValueElements', () => {
    it('passes when all clusters have >= 4 value elements', () => {
      const snapshot = createSnapshot();
      expect(() => assertStoryValueElements(snapshot)).not.toThrow();
    });

    it('throws when a cluster has fewer than 4 value elements', () => {
      const clusters = [
        { id: 1, slug: 'cluster-1', canonical_headline: 'Headline 1', published_at: '2026-10-24T08:00:00Z', is_prominent: false, trending_score: 0, outlet_count: 0, editorial_rank: 2 },
      ];
      const snapshot = createSnapshot({
        clusters: clusters as any,
        edition_clusters: [{ edition_id: 'uk', cluster_id: 1 }] as any,
        story_sources: [] as any,
        cluster_topics: [] as any,
        cluster_entities: [] as any,
        cluster_sections: [] as any,
      });

      expect(() => assertStoryValueElements(snapshot)).toThrow('assertStoryValueElements');
    });
  });
});
