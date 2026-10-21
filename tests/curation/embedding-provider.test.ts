import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  generateDeterministicPseudoEmbedding,
  FixtureEmbeddingProvider,
} from '../../src/curation/embedding-provider.js';

describe('benchmark fixture validation (CUR-06, S-7)', () => {
  const pairsPath = path.resolve(process.cwd(), 'tests', 'fixtures', 'curation', 'headline-pairs.json');
  const embeddingsPath = path.resolve(process.cwd(), 'tests', 'fixtures', 'curation', 'headline-embeddings.json');

  it('headline-pairs.json exists and contains at least 200 hand-labelled pairs', () => {
    expect(fs.existsSync(pairsPath)).toBe(true);
    const pairs = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThanOrEqual(200);

    const categories = new Set(pairs.map((p: any) => p.category));
    expect(categories.has('same_event')).toBe(true);
    expect(categories.has('different_event')).toBe(true);
    expect(categories.has('round_conflict')).toBe(true);
    expect(categories.has('temporal_conflict')).toBe(true);
    expect(categories.has('disjoint_entity')).toBe(true);

    const languages = new Set(pairs.map((p: any) => p.language));
    expect(languages.has('en')).toBe(true);
    expect(languages.has('hi')).toBe(true);
  });

  it('headline-embeddings.json contains 1024-dimensional unit-normalized vectors', () => {
    expect(fs.existsSync(embeddingsPath)).toBe(true);
    const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
    const headlines = Object.keys(embeddings);
    expect(headlines.length).toBeGreaterThanOrEqual(200);

    // Verify dimension and unit normalization for a sample of vectors
    for (let i = 0; i < Math.min(headlines.length, 20); i++) {
      const vec = embeddings[headlines[i]];
      expect(vec.length).toBe(1024);

      let norm = 0;
      for (const val of vec) {
        norm += val * val;
      }
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 2);
    }
  });
});

describe('embedding provider abstraction and cosine similarity', () => {
  it('cosineSimilarity returns 1.0 for identical vectors', () => {
    const v1 = [0.6, 0.8];
    expect(cosineSimilarity(v1, v1)).toBeCloseTo(1.0, 5);
  });

  it('cosineSimilarity returns 0.0 for orthogonal vectors', () => {
    const v1 = [1, 0];
    const v2 = [0, 1];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
  });

  it('cosineSimilarity handles zero vectors or length mismatches safely', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('generateDeterministicPseudoEmbedding produces deterministic 1024-d unit vectors', () => {
    const vec1 = generateDeterministicPseudoEmbedding('Bank of England interest rate cut');
    const vec2 = generateDeterministicPseudoEmbedding('Bank of England interest rate cut');
    const vec3 = generateDeterministicPseudoEmbedding('Completely different news headline about sports');

    expect(vec1.length).toBe(1024);
    expect(vec1).toEqual(vec2);

    let norm = 0;
    for (const val of vec1) norm += val * val;
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 2);

    // Similarity of different text pseudo-embeddings should be relatively low
    const sim = cosineSimilarity(vec1, vec3);
    expect(sim).toBeLessThan(0.7);
  });

  it('FixtureEmbeddingProvider retrieves stored fixture vectors and falls back deterministically', async () => {
    const mockFixture: Record<string, number[]> = {
      'headline a': [1, 0, 0, 0],
      'headline b': [0, 1, 0, 0],
    };
    const provider = new FixtureEmbeddingProvider(mockFixture);

    const embA = await provider.getEmbedding('headline a');
    expect(embA).toEqual([1, 0, 0, 0]);

    // Unseen headline falls back to pseudo embedding
    const fallback = await provider.getEmbedding('unknown headline');
    expect(fallback.length).toBe(1024);

    const batch = await provider.getBatchEmbeddings(['headline a', 'headline b']);
    expect(batch.length).toBe(2);
    expect(batch[0]).toEqual([1, 0, 0, 0]);
    expect(batch[1]).toEqual([0, 1, 0, 0]);
  });
});
