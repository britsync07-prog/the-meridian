/**
 * Tests for snapshot.ts — the snapshot reader and accessor module.
 */

import { describe, expect, it } from 'vitest';
import type { SnapshotData } from '../src/lib/snapshot.js';
import {
  getEditionFrontData,
  getSectionPageData,
  getStoryPageData,
  getAllStorySlugs,
  getArchivePaths,
  getTopicPaths,
  getEntityPaths,
} from '../src/lib/snapshot.js';

// Mock snapshot data
const mockSnapshot: SnapshotData = {
  generated_at: '2026-10-24T10:00:00Z',
  schema_version: 1,
  editions: [
    { id: 'uk', slug: 'uk', name: 'United Kingdom', country_code: 'GB', language: 'en' },
    { id: 'us', slug: 'us', name: 'United States', country_code: 'US', language: 'en' },
  ],
  sections: [
    { id: 'politics', name: 'Politics', sortOrder: 1 },
    { id: 'technology', name: 'Technology', sortOrder: 2 },
  ],
  clusters: [
    { id: 1, slug: 'cluster-1', canonical_headline: 'Headline 1', published_at: '2026-10-24T08:00:00Z', is_prominent: true, trending_score: 10.0, outlet_count: 3, editorial_rank: 1 },
    { id: 2, slug: 'cluster-2', canonical_headline: 'Headline 2', published_at: '2026-10-24T07:00:00Z', is_prominent: false, trending_score: 8.5, outlet_count: 2, editorial_rank: null },
    { id: 3, slug: 'cluster-3', canonical_headline: 'Headline 3', published_at: '2026-10-23T08:00:00Z', is_prominent: false, trending_score: 7.0, outlet_count: 1, editorial_rank: 2 },
  ],
  story_sources: [
    { cluster_id: 1, source_id: 'bbc', rank: 1, headline: 'BBC Story', url: 'https://bbc.co.uk', published_at: '2026-10-24T08:00:00Z' },
    { cluster_id: 1, source_id: 'guardian', rank: 2, headline: 'Guardian Story', url: 'https://theguardian.com', published_at: '2026-10-24T07:30:00Z' },
    { cluster_id: 2, source_id: 'reuters', rank: 1, headline: 'Reuters Story', url: 'https://reuters.com', published_at: '2026-10-24T07:00:00Z' },
  ],
  edition_clusters: [
    { edition_id: 'uk', cluster_id: 1 },
    { edition_id: 'uk', cluster_id: 2 },
    { edition_id: 'us', cluster_id: 1 },
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
    cluster_count: 3,
  },
};

describe('snapshot.ts', () => {
  describe('getEditionFrontData', () => {
    it('returns data for a valid edition', () => {
      const result = getEditionFrontData(mockSnapshot, 'uk');
      expect(result).not.toBeNull();
      expect(result!.edition).toBe('uk');
      expect(result!.clusters).toHaveLength(2);
    });

    it('returns null for unknown edition', () => {
      const result = getEditionFrontData(mockSnapshot, 'fr');
      expect(result).toBeNull();
    });

    it('returns null when edition has no clusters', () => {
      const emptySnapshot = { ...mockSnapshot, edition_clusters: [] };
      const result = getEditionFrontData(emptySnapshot, 'uk');
      expect(result).toBeNull();
    });
  });

  describe('getSectionPageData', () => {
    it('returns data for valid edition + section', () => {
      const result = getSectionPageData(mockSnapshot, 'uk', 'politics');
      expect(result).not.toBeNull();
      expect(result!.clusters).toHaveLength(1);
    });

    it('returns null for empty section', () => {
      const result = getSectionPageData(mockSnapshot, 'uk', 'sports');
      expect(result).toBeNull();
    });

    it('returns null for unknown section', () => {
      const result = getSectionPageData(mockSnapshot, 'uk', 'sports');
      expect(result).toBeNull();
    });
  });

  describe('getStoryPageData', () => {
    it('returns data for valid slug', () => {
      const result = getStoryPageData(mockSnapshot, 'cluster-1');
      expect(result).not.toBeNull();
      expect(result!.cluster.slug).toBe('cluster-1');
      expect(result!.sources).toHaveLength(2);
    });

    it('returns null for unknown slug', () => {
      const result = getStoryPageData(mockSnapshot, 'unknown-slug');
      expect(result).toBeNull();
    });
  });

  describe('getAllStorySlugs', () => {
    it('returns all cluster slugs', () => {
      const slugs = getAllStorySlugs(mockSnapshot);
      expect(slugs).toEqual(['cluster-1', 'cluster-2', 'cluster-3']);
    });
  });

  describe('getArchivePaths', () => {
    it('returns paths for editions with recent stories', () => {
      const paths = getArchivePaths(mockSnapshot);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].edition).toBe('uk');
    });
  });

  describe('getTopicPaths', () => {
    it('returns empty array when no topics', () => {
      const paths = getTopicPaths(mockSnapshot);
      expect(paths).toEqual([]);
    });
  });

  describe('getEntityPaths', () => {
    it('returns empty array when no entities', () => {
      const paths = getEntityPaths(mockSnapshot);
      expect(paths).toEqual([]);
    });
  });
});
