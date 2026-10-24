/**
 * Tests for rss.ts — RSS 2.0 feed generation.
 *
 * PUB-09: Valid RSS feeds for per-edition, per-section, and global scopes.
 * CON-07: Excerpts are verbatim from source items.
 */

import { describe, expect, it } from 'vitest';
import type { SnapshotData } from '../src/lib/snapshot.js';
import { buildRssFeed } from '../src/lib/rss.js';

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
    sources: [],
    manifest: { hash: 'abc123', content_length: 1000, compressed_length: 500, cluster_count: 2 },
    ...overrides,
  } as SnapshotData;
}

describe('buildRssFeed', () => {
  it('generates valid RSS 2.0 XML with required elements', () => {
    const snapshot = createSnapshot();
    const rss = buildRssFeed(snapshot, {
      feedTitle: 'Test Feed',
      feedDescription: 'Test description',
      siteOrigin: 'https://example.com',
    });

    expect(rss).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain('<channel>');
    expect(rss).toContain('<title>Test Feed</title>');
    expect(rss).toContain('<description>Test description</description>');
    expect(rss).toContain('</rss>');
  });

  it('includes item elements for each cluster', () => {
    const snapshot = createSnapshot();
    const rss = buildRssFeed(snapshot, {
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    // Two clusters should produce two items
    expect(rss).toContain('<item>');
    expect(rss).toContain('<guid isPermaLink="true">cluster-1</guid>');
    expect(rss).toContain('<guid isPermaLink="true">cluster-2</guid>');
  });

  it('uses source headline as excerpt (CON-07)', () => {
    const snapshot = createSnapshot();
    const rss = buildRssFeed(snapshot, {
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    // First source headline should appear in description
    expect(rss).toContain('<description>BBC Story</description>');
  });

  it('filters by edition', () => {
    const snapshot = createSnapshot();
    const rss = buildRssFeed(snapshot, {
      edition: 'uk',
      feedTitle: 'UK Feed',
      feedDescription: 'UK',
      siteOrigin: 'https://example.com',
    });

    // UK has clusters 1 and 2
    expect(rss).toContain('<guid isPermaLink="true">cluster-1</guid>');
    expect(rss).toContain('<guid isPermaLink="true">cluster-2</guid>');
  });

  it('returns empty string for invalid edition', () => {
    const snapshot = createSnapshot();
    const rss = buildRssFeed(snapshot, {
      edition: 'nonexistent',
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    expect(rss).toBe('');
  });

  it('filters by section', () => {
    const snapshot = createSnapshot();
    const rss = buildRssFeed(snapshot, {
      section: 'politics',
      feedTitle: 'Politics',
      feedDescription: 'Politics',
      siteOrigin: 'https://example.com',
    });

    // Only cluster-1 is in politics section
    expect(rss).toContain('<guid isPermaLink="true">cluster-1</guid>');
    expect(rss).not.toContain('cluster-2');
  });

  it('sorts clusters by published_at descending', () => {
    const snapshot = createSnapshot({
      clusters: [
        { id: 1, slug: 'older', canonical_headline: 'Older Story', published_at: '2026-10-23T08:00:00Z', is_prominent: false, trending_score: 5.0, outlet_count: 1, editorial_rank: null },
        { id: 2, slug: 'newer', canonical_headline: 'Newer Story', published_at: '2026-10-24T08:00:00Z', is_prominent: false, trending_score: 5.0, outlet_count: 1, editorial_rank: null },
      ],
      edition_clusters: [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
      ],
      cluster_sections: [],
      story_sources: [
        { cluster_id: 1, source_id: 'a', rank: 1, headline: 'Old Headline', url: 'https://a.com', published_at: '2026-10-23T08:00:00Z' },
        { cluster_id: 2, source_id: 'b', rank: 1, headline: 'New Headline', url: 'https://b.com', published_at: '2026-10-24T08:00:00Z' },
      ],
    });

    const rss = buildRssFeed(snapshot, {
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    // Newer should appear before older (source headlines used)
    const newerIdx = rss.indexOf('New Headline');
    const olderIdx = rss.indexOf('Old Headline');
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('escapes XML special characters', () => {
    const snapshot = createSnapshot({
      clusters: [
        { id: 1, slug: 'test', canonical_headline: 'Head <tag> & "quoted"', published_at: '2026-10-24T08:00:00Z', is_prominent: false, trending_score: 0, outlet_count: 0, editorial_rank: null },
      ],
      story_sources: [
        { cluster_id: 1, source_id: 'a', rank: 1, headline: 'A & "B" > C', url: 'https://a.com', published_at: '2026-10-24T08:00:00Z' },
      ],
      edition_clusters: [{ edition_id: 'uk', cluster_id: 1 }],
      cluster_sections: [],
    });

    const rss = buildRssFeed(snapshot, {
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    // Should escape &, <, >, " in source headline
    expect(rss).toContain('A &amp; &quot;B&quot; &gt; C');
  });

  it('limits items with limit option', () => {
    const clusters = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      slug: `cluster-${i}`,
      canonical_headline: `Headline ${i}`,
      published_at: `2026-10-${24 - i}T08:00:00Z`,
      is_prominent: false,
      trending_score: 5.0,
      outlet_count: 1,
      editorial_rank: null,
    }));

    const snapshot = createSnapshot({
      clusters,
      edition_clusters: clusters.map(c => ({ edition_id: 'uk', cluster_id: c.id })),
      cluster_sections: [],
      story_sources: clusters.map(c => ({
        cluster_id: c.id,
        source_id: 'a',
        rank: 1,
        headline: `Source ${c.id}`,
        url: `https://a.com/${c.id}`,
        published_at: c.published_at,
      })),
    });

    const rss = buildRssFeed(snapshot, {
      limit: 5,
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    // Should only have 5 items
    const itemCount = (rss.match(/<item>/g) || []).length;
    expect(itemCount).toBe(5);
  });

  it('uses cluster headline when no sources exist', () => {
    const snapshot = createSnapshot({
      story_sources: [],
    });

    const rss = buildRssFeed(snapshot, {
      feedTitle: 'Test',
      feedDescription: 'Test',
      siteOrigin: 'https://example.com',
    });

    // Should use canonical_headline as fallback
    expect(rss).toContain('Headline 1');
  });
});
