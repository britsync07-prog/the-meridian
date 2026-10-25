/**
 * Tests for digest.ts — per-edition daily digest generation.
 *
 * Phase 6 success criteria:
 * - 300 to 400 word daily digest
 * - No source headline reproduced verbatim
 * - 60%+ of sentences appear in no source headline or excerpt
 * - Deterministic template fallback when LLM unavailable
 * - Visible "Automated summary" notice on digest pages
 */

import { describe, expect, it } from 'vitest';
import type { SnapshotData } from '../src/lib/snapshot.js';
import { generateDigest } from '../src/lib/digest.js';

// Minimal mock snapshot with stories for a digest
function createDigestSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    generated_at: '2026-10-25T10:00:00Z',
    schema_version: 1,
    editions: [
      { id: 'uk', slug: 'uk', name: 'United Kingdom', country_code: 'GB', language: 'en' },
    ],
    sections: [
      { id: 'politics', name: 'Politics', sortOrder: 1 },
      { id: 'world', name: 'World', sortOrder: 2 },
    ],
    clusters: [
      { id: 1, slug: 'cluster-1', canonical_headline: 'Election results announced in landmark vote', published_at: '2026-10-25T08:00:00Z', is_prominent: true, trending_score: 12.5, outlet_count: 4, editorial_rank: 1 },
      { id: 2, slug: 'cluster-2', canonical_headline: 'Central bank raises interest rates amid inflation concerns', published_at: '2026-10-25T07:30:00Z', is_prominent: true, trending_score: 10.8, outlet_count: 3, editorial_rank: null },
      { id: 3, slug: 'cluster-3', canonical_headline: 'New trade agreement signed between regional powers', published_at: '2026-10-25T06:00:00Z', is_prominent: false, trending_score: 8.2, outlet_count: 2, editorial_rank: null },
    ],
    story_sources: [
      { cluster_id: 1, source_id: 'bbc', rank: 1, headline: 'Election results announced in landmark vote', url: 'https://bbc.co.uk/news/election', published_at: '2026-10-25T08:00:00Z' },
      { cluster_id: 1, source_id: 'guardian', rank: 2, headline: 'Voters head to polls in crucial election', url: 'https://theguardian.com/election', published_at: '2026-10-25T07:30:00Z' },
      { cluster_id: 2, source_id: 'reuters', rank: 1, headline: 'Central bank raises interest rates amid inflation concerns', url: 'https://reuters.com/economy', published_at: '2026-10-25T07:30:00Z' },
      { cluster_id: 2, source_id: 'ft', rank: 2, headline: 'Rate hike signals central bank response to rising prices', url: 'https://ft.com/economy', published_at: '2026-10-25T07:00:00Z' },
      { cluster_id: 3, source_id: 'cnn', rank: 1, headline: 'Regional leaders sign new trade pact after weeks of negotiation', url: 'https://cnn.com/trade', published_at: '2026-10-25T06:00:00Z' },
    ],
    edition_clusters: [
      { edition_id: 'uk', cluster_id: 1 },
      { edition_id: 'uk', cluster_id: 2 },
      { edition_id: 'uk', cluster_id: 3 },
    ],
    cluster_sections: [
      { cluster_id: 1, section_id: 'politics', confidence: 0.9, method: 'gazetteer' },
      { cluster_id: 2, section_id: 'business', confidence: 0.85, method: 'keyword' },
      { cluster_id: 3, section_id: 'world', confidence: 0.75, method: 'fallback' },
    ],
    cluster_topics: [],
    cluster_entities: [],
    topics: [],
    entities: [],
    sources: [],
    manifest: { hash: 'testhash123', content_length: 1000, compressed_length: 500, cluster_count: 3 },
    ...overrides,
  } as SnapshotData;
}

function extractSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

describe('digest generation', () => {
  it('generates a digest of 300 to 400 words for an edition', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');

    const wordCount = countWords(result.content);
    expect(wordCount).toBeGreaterThanOrEqual(300);
    expect(wordCount).toBeLessThanOrEqual(400);
  });

  it('does not reproduce any source headline verbatim', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');
    const sentences = extractSentences(result.content);

    const sourceHeadlines = [
      'Election results announced in landmark vote',
      'Voters head to polls in crucial election',
      'Central bank raises interest rates amid inflation concerns',
      'Rate hike signals central bank response to rising prices',
      'Regional leaders sign new trade pact after weeks of negotiation',
    ];

    for (const sentence of sentences) {
      for (const headline of sourceHeadlines) {
        // Check if the sentence IS the headline, or the headline IS a substring of the sentence
        expect(sentence).not.toBe(headline);
        expect(sentence.toLowerCase()).not.toBe(headline.toLowerCase());
        // The entire headline should not appear verbatim inside any digest sentence
        expect(sentence.toLowerCase()).not.toContain(headline.toLowerCase());
      }
    }
  });

  it('has at least 60% of sentences novel (not in any source headline)', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');
    const sentences = extractSentences(result.content);

    const sourceHeadlines = [
      'election results announced in landmark vote',
      'voters head to polls in crucial election',
      'central bank raises interest rates amid inflation concerns',
      'rate hike signals central bank response to rising prices',
      'regional leaders sign new trade pact after weeks of negotiation',
    ];

    let novelCount = 0;
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const isNovel = !sourceHeadlines.some((h) => lowerSentence.includes(h));
      if (isNovel) novelCount++;
    }

    const noveltyRatio = novelCount / sentences.length;
    expect(noveltyRatio).toBeGreaterThanOrEqual(0.6);
  });

  it('includes an "Automated summary" notice in the content', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');
    expect(result.content).toContain('Automated');
  });

  it('includes a sources list citing each outlet', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');
    expect(result.sources).toContain('bbc');
    expect(result.sources).toContain('guardian');
    expect(result.sources).toContain('reuters');
  });

  it('falls back to deterministic template when LLM is unavailable', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');
    // When no LLM is available, status should be "degraded"
    expect(result.status).toBe('degraded');
    // Content should still be valid digest text
    expect(result.content.length).toBeGreaterThan(100);
  });

  it('produces identical digest for identical input (deterministic fallback)', () => {
    const snapshot1 = createDigestSnapshot();
    const snapshot2 = createDigestSnapshot();
    const result1 = generateDigest(snapshot1, 'uk', 'en');
    const result2 = generateDigest(snapshot2, 'uk', 'en');

    // Deterministic mode should produce the same output
    expect(result1.content).toBe(result2.content);
  });

  it('includes a headline for the digest', () => {
    const snapshot = createDigestSnapshot();
    const result = generateDigest(snapshot, 'uk', 'en');
    expect(result.headline).toBeTruthy();
    expect(result.headline.length).toBeGreaterThan(5);
    expect(result.headline.length).toBeLessThan(120);
  });

  it('respects the edition when building content', () => {
    const snapshot = createDigestSnapshot({
      editions: [
        { id: 'uk', slug: 'uk', name: 'United Kingdom', country_code: 'GB', language: 'en' },
        { id: 'us', slug: 'us', name: 'United States', country_code: 'US', language: 'en' },
      ],
      edition_clusters: [
        { edition_id: 'uk', cluster_id: 1 },
        { edition_id: 'uk', cluster_id: 2 },
        { edition_id: 'uk', cluster_id: 3 },
        { edition_id: 'us', cluster_id: 1 },
      ],
    });

    const ukResult = generateDigest(snapshot, 'uk', 'en');
    const usResult = generateDigest(snapshot, 'us', 'en');

    // Different editions produce different headlines
    expect(ukResult.headline).not.toBe(usResult.headline);
  });
});
