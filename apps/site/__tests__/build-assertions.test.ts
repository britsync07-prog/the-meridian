/**
 * Tests for build-assertions.ts — the Phase 5 build assertion suite.
 */

import { describe, expect, it } from 'vitest';
import type { SnapshotData } from '../src/lib/snapshot.js';
import {
  assertThinEdition,
  assertSectionStoryFloor,
  assertSingleOutletDominance,
  assertNoDuplicateTitles,
  assertStoryValueElements,
} from '../../scripts/assert/build-assertions.js';

// Helper to create minimal valid snapshots
function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    generated_at: '2026-10-24T10:00:00Z',
    schema_version: 1,
    editions: [
      { id: 'uk', slug: 'uk', name: 'United Kingdom', country_code: 'GB', language: 'en' },
    ],
    sections: [
      { id: 'politics', name: 'Politics', sortOrder: 1 },
      { id: 'technology', name: 'Technology', sortOrder: 2 },
    ],
    clusters: [
      { id: 1, slug: 'cluster-1', canonical_headline: 'Headline 1', published_at: '2026-10-24T08:00:00Z', is_prominent: true, trending_score: 10.0, outlet_count: 3, editorial_rank: 1 },
      { id: 2, slug: 'cluster-2', canonical_headline: 'Headline 2', published_at: '2026-10-24T07:00:00Z', is_prominent: false, trending_score: 8.5, outlet_count: 2, editorial_rank: null },
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
      const clusters = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, slug: `cluster-${i}` }));
      const editionClusters = clusters.map((c) => ({ edition_id: 'uk', cluster_id: c.id }));
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
      // Create enough clusters distributed across sections
      const clusters = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));
      const editionClusters = clusters.map((c) => ({ edition_id: 'uk', cluster_id: c.id }));
      const clusterSections = clusters.map((c) => ({
        cluster_id: c.id,
        section_id: c.id % 2 === 0 ? 'politics' : 'technology',
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
        { id: 2, slug: 'cluster-2', canonical_headline: 'Same Headline', published_at: '2026-10-24T07:00:00Z', is_prominent: false, trending_score: 8.5, outlet_count: 2, editorial_rank: null },
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
        { id: 1, slug: 'cluster-1', canonical_headline: 'Headline 1', published_at: '2026-10-24T08:00:00Z', is_prominent: false, trending_score: 0, outlet_count: 0, editorial_rank: null },
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
