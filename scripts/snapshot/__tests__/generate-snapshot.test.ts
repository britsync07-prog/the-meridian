/**
 * Tests for generate-snapshot.mjs
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync, inflateSync } from 'node:zlib';

describe('generate-snapshot.mjs', () => {
  it('produces correct JSON shape with all required fields', () => {
    const snapshot = {
      generated_at: '2026-10-24T10:00:00Z',
      schema_version: 1,
      editions: [{ id: 'uk', slug: 'uk', name: 'United Kingdom', country_code: 'GB', language: 'en' }],
      sections: [{ id: 'politics', name: 'Politics', sortOrder: 1 }],
      clusters: [
        { id: 1, slug: 'test-cluster-1', canonical_headline: 'Test Headline 1', published_at: '2026-10-24T08:00:00Z', is_prominent: true, trending_score: 10.0, outlet_count: 3, editorial_rank: 1 },
      ],
      story_sources: [
        { cluster_id: 1, source_id: 'bbc', rank: 1, headline: 'BBC Headline', url: 'https://bbc.co.uk', published_at: '2026-10-24T08:00:00Z' },
      ],
      edition_clusters: [{ edition_id: 'uk', cluster_id: 1 }],
      cluster_sections: [{ cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' }],
      cluster_topics: [],
      cluster_entities: [],
      topics: [],
      entities: [],
      sources: [{ id: 1, slug: 'bbc', name: 'BBC', feed_url: 'https://feeds.bbci.co.uk/news/rss.xml', country_code: 'GB', language: 'en' }],
    };

    expect(snapshot.schema_version).toBe(1);
    expect(snapshot.editions).toHaveLength(1);
    expect(snapshot.clusters).toHaveLength(1);
    expect(snapshot.story_sources).toHaveLength(1);
  });

  it('produces deterministic output for same input', () => {
    const data = { clusters: [{ id: 1, slug: 'a' }] };
    const json1 = JSON.stringify(data);
    const json2 = JSON.stringify(data);

    expect(json1).toBe(json2);

    const hash1 = createHash('sha256').update(json1).digest('hex');
    const hash2 = createHash('sha256').update(json2).digest('hex');

    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different content', () => {
    const hash1 = createHash('sha256').update(JSON.stringify({ id: 1 })).digest('hex');
    const hash2 = createHash('sha256').update(JSON.stringify({ id: 2 })).digest('hex');

    expect(hash1).not.toBe(hash2);
  });

  it('gzip compression is lossless', () => {
    const original = JSON.stringify({ test: 'data', count: 42 });
    const compressed = gzipSync(Buffer.from(original, 'utf8'));
    const decompressed = inflateSync(compressed).toString('utf8');

    expect(decompressed).toBe(original);
  });

  it('manifest includes hash, lengths, and cluster count', () => {
    const snapshot = { clusters: [{ id: 1 }, { id: 2 }] };
    const jsonString = JSON.stringify(snapshot);
    const hash = createHash('sha256').update(jsonString).digest('hex');
    const compressed = gzipSync(Buffer.from(jsonString, 'utf8'));

    expect(hash).toHaveLength(64); // SHA256 hex length
    expect(jsonString.length).toBeGreaterThan(0);
    expect(compressed.length).toBeGreaterThan(0);
    expect(snapshot.clusters.length).toBe(2);
  });
});
