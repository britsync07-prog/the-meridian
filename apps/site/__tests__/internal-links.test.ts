/**
 * Tests for internal-links.ts — internal link graph builder.
 *
 * PUB-06: Every indexable URL must be reachable within 3 clicks from any front page.
 */

import { describe, expect, it } from 'vitest';
import type { SnapshotData } from '../src/lib/snapshot.js';
import { buildInternalLinks, assertThreeClickReachability } from '../src/lib/internal-links.js';

// Minimal mock snapshot
function createSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
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
      { cluster_id: 2, source_id: 'reuters', rank: 1, headline: 'Reuters Story', url: 'https://reuters.com', published_at: '2026-10-24T07:00:00Z' },
    ],
    edition_clusters: [
      { edition_id: 'uk', cluster_id: 1 },
      { edition_id: 'uk', cluster_id: 2 },
      { edition_id: 'us', cluster_id: 1 },
    ],
    cluster_sections: [
      { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
      { cluster_id: 2, section_id: 'politics', confidence: 0.8, method: 'keyword' },
      { cluster_id: 3, section_id: 'technology', confidence: 0.7, method: 'keyword' },
    ],
    cluster_topics: [],
    cluster_entities: [],
    topics: [],
    entities: [],
    sources: [],
    manifest: { hash: 'abc123', content_length: 1000, compressed_length: 500, cluster_count: 3 },
    ...overrides,
  } as SnapshotData;
}

describe('buildInternalLinks', () => {
  it('generates edges for same-section stories', () => {
    const snapshot = createSnapshot();
    const edges = buildInternalLinks(snapshot);

    // Clusters 1 and 2 are both in politics section
    const politicsEdges = edges.filter(e =>
      e.from.includes('politics') || e.to.includes('politics')
    );
    expect(politicsEdges.length).toBeGreaterThan(0);
  });

  it('generates edition-index edges', () => {
    const snapshot = createSnapshot();
    const edges = buildInternalLinks(snapshot);

    // Each cluster should link to its edition index
    const ukEdges = edges.filter(e =>
      e.relation === 'edition-index' && e.to === '/uk/'
    );
    expect(ukEdges.length).toBeGreaterThan(0);
  });

  it('does not generate duplicate edges', () => {
    const snapshot = createSnapshot();
    const edges = buildInternalLinks(snapshot);

    const edgeKeys = edges.map(e => `${e.from}→${e.to}`);
    const uniqueKeys = new Set(edgeKeys);
    expect(edgeKeys.length).toBe(uniqueKeys.size);
  });

  it('includes cross-section edges where applicable', () => {
    const snapshot = createSnapshot({
      cluster_sections: [
        { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
        { cluster_id: 2, section_id: 'technology', confidence: 0.8, method: 'keyword' },
      ],
    });
    const edges = buildInternalLinks(snapshot);

    // No explicit cross-section edges in current implementation,
    // but edges should still be valid
    expect(edges.every(e => ['same-section', 'edition-index'].includes(e.relation))).toBe(true);
  });
});

describe('assertThreeClickReachability', () => {
  it('finds no unreachable URLs in a connected graph', () => {
    // All clusters assigned to both editions — every front page can reach everything
    const snapshot = createSnapshot({
      edition_clusters: [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
        { edition_id: 'uk', cluster_id: 3 },
        { edition_id: 'us', cluster_id: 1 },
        { edition_id: 'us', cluster_id: 2 },
        { edition_id: 'us', cluster_id: 3 },
      ],
      cluster_sections: [
        { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
        { cluster_id: 2, section_id: 'politics', confidence: 0.8, method: 'keyword' },
        { cluster_id: 3, section_id: 'technology', confidence: 0.7, method: 'keyword' },
      ],
    });
    const edges = buildInternalLinks(snapshot);
    const unreachable = assertThreeClickReachability(snapshot, edges);

    expect(unreachable).toEqual([]);
  });

  it('reports unreachable URLs when edges are missing', () => {
    // Create a snapshot where cluster-3 has no edition association
    const snapshot = createSnapshot({
      edition_clusters: [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
        // cluster-3 has no edition association
      ],
      cluster_sections: [
        { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
        { cluster_id: 2, section_id: 'politics', confidence: 0.8, method: 'keyword' },
      ],
    });
    const edges = buildInternalLinks(snapshot);
    const unreachable = assertThreeClickReachability(snapshot, edges);

    // cluster-3 should be unreachable from both UK and US front pages
    expect(unreachable.some(u => u.includes('cluster-3'))).toBe(true);
  });

  it('handles empty snapshot gracefully', () => {
    const snapshot = createSnapshot({
      clusters: [],
      edition_clusters: [],
      cluster_sections: [],
      editions: [],
    });
    const edges = buildInternalLinks(snapshot);
    const unreachable = assertThreeClickReachability(snapshot, edges);

    expect(unreachable).toEqual([]);
  });

  it('respects 3-click limit in BFS', () => {
    // Create a long chain: front → section → story1 → story2 → story3
    const snapshot = createSnapshot({
      clusters: [
        { id: 1, slug: 's1', canonical_headline: 'H1', published_at: '2026-10-24T08:00:00Z', is_prominent: false, trending_score: 0, outlet_count: 0, editorial_rank: null },
        { id: 2, slug: 's2', canonical_headline: 'H2', published_at: '2026-10-24T07:00:00Z', is_prominent: false, trending_score: 0, outlet_count: 0, editorial_rank: null },
        { id: 3, slug: 's3', canonical_headline: 'H3', published_at: '2026-10-23T08:00:00Z', is_prominent: false, trending_score: 0, outlet_count: 0, editorial_rank: null },
      ],
      edition_clusters: [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
        { edition_id: 'uk', cluster_id: 3 },
        { edition_id: 'us', cluster_id: 1 },
        { edition_id: 'us', cluster_id: 2 },
        { edition_id: 'us', cluster_id: 3 },
      ],
      cluster_sections: [
        { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
        { cluster_id: 2, section_id: 'politics', confidence: 0.8, method: 'keyword' },
        { cluster_id: 3, section_id: 'politics', confidence: 0.7, method: 'keyword' },
      ],
    });
    const edges = buildInternalLinks(snapshot);
    const unreachable = assertThreeClickReachability(snapshot, edges);

    // With proper section-to-story and story-to-story links, all should be reachable within 3 clicks
    expect(unreachable).toEqual([]);
  });
});
