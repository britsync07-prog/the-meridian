/**
 * tests/curation/merge-benchmark.test.ts — Calibration Benchmark & Clustering Suite.
 *
 * Implements CUR-01, CUR-06, D-01, D-04, D-07, D-08, and Spike S-7.
 *
 * Enforces the non-negotiable benchmark gate:
 * Precision >= 98% and Recall >= 85% over >= 200 hand-labelled headline pairs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  selectPrimaryHeadline,
  shouldMergeStories,
  evaluateCandidateClustering,
  BGE_M3_SIMILARITY_THRESHOLD,
  type CandidateStoryInput,
} from '../../src/curation/cluster-engine.js';
import { FixtureEmbeddingProvider } from '../../src/curation/embedding-provider.js';

interface BenchmarkHeadlinePair {
  id: string;
  headlineA: string;
  headlineB: string;
  entitiesA: string[];
  entitiesB: string[];
  pubDateA: string;
  pubDateB: string;
  language: 'en' | 'hi';
  category: 'same_event' | 'different_event' | 'round_conflict' | 'temporal_conflict' | 'disjoint_entity';
  expectedMerge: boolean;
}

describe('clustering engine unit behaviors (CUR-01, D-07, D-08)', () => {
  it('selectPrimaryHeadline prioritizes outlet authority then length within 110 characters', () => {
    // Authority priority
    const candidates1 = [
      { headline: 'Short headline from wire service', outletAuthority: 95 },
      { headline: 'Extremely detailed and very comprehensive headline from regional outlet', outletAuthority: 40 },
    ];
    expect(selectPrimaryHeadline(candidates1)).toBe('Short headline from wire service');

    // Equal authority -> prefer longer informative headline under 110 characters
    const candidates2 = [
      { headline: 'Rate cut announced', outletAuthority: 90 },
      { headline: 'Bank of England cuts benchmark interest rate to 4.75 percent', outletAuthority: 90 },
    ];
    expect(selectPrimaryHeadline(candidates2)).toBe(
      'Bank of England cuts benchmark interest rate to 4.75 percent'
    );

    // Headline >= 110 chars is deprioritized over crisp < 110 char headline
    const runawayHeadline = 'A'.repeat(120);
    const crispHeadline = 'Prime Minister delivers major address on economic reform in London';
    const candidates3 = [
      { headline: runawayHeadline, outletAuthority: 80 },
      { headline: crispHeadline, outletAuthority: 80 },
    ];
    expect(selectPrimaryHeadline(candidates3)).toBe(crispHeadline);

    expect(selectPrimaryHeadline([])).toBe('');
  });

  it('enforces strict language isolation (English never merges with Hindi)', () => {
    const storyEn: CandidateStoryInput = {
      headline: 'Reserve Bank of India holds repo rate at 6.5%',
      publishedAt: '2026-10-21T10:00:00.000Z',
      entities: ['rbi'],
      language: 'en',
    };
    const storyHi: CandidateStoryInput = {
      headline: 'भारतीय रिज़र्व बैंक ने रेपो रेट 6.5% पर स्थिर रखा',
      publishedAt: '2026-10-21T10:00:00.000Z',
      entities: ['rbi'],
      language: 'hi',
    };

    // Even with identical mock embeddings, cross-language merge is unconditionally blocked
    const dummyEmbedding = new Array(1024).fill(0.1);
    const result = shouldMergeStories(storyEn, storyHi, dummyEmbedding, dummyEmbedding);

    expect(result.shouldMerge).toBe(false);
    expect(result.reason).toBe('different_languages');
    expect(result.confidence).toBe(0);
  });

  it('evaluateCandidateClustering returns new_cluster when candidate list is empty', async () => {
    const provider = new FixtureEmbeddingProvider();
    const story: CandidateStoryInput = {
      headline: 'Breaking news event happens',
      publishedAt: '2026-10-21T10:00:00.000Z',
      entities: [],
      language: 'en',
    };

    const decision = await evaluateCandidateClustering(story, [], provider);
    expect(decision.action).toBe('new_cluster');
    expect(decision.reason).toBe('no_candidates');
  });

  it('evaluateCandidateClustering merges into highest scoring candidate above threshold', async () => {
    const provider = new FixtureEmbeddingProvider({
      'New story headline': [1, 0, 0, 0],
      'Candidate A headline': [0.95, 0.31, 0, 0], // cosine ~ 0.95
      'Candidate B headline': [0.85, 0.52, 0, 0], // cosine ~ 0.85
    });

    const newStory: CandidateStoryInput = {
      headline: 'New story headline',
      publishedAt: '2026-10-21T10:00:00.000Z',
      entities: ['shared-entity'],
      language: 'en',
    };

    const candidates = [
      {
        clusterId: 10,
        story: {
          headline: 'Candidate B headline',
          publishedAt: '2026-10-21T10:30:00.000Z',
          entities: ['shared-entity'],
          language: 'en' as const,
        },
      },
      {
        clusterId: 20,
        story: {
          headline: 'Candidate A headline',
          publishedAt: '2026-10-21T09:45:00.000Z',
          entities: ['shared-entity'],
          language: 'en' as const,
        },
      },
    ];

    const decision = await evaluateCandidateClustering(newStory, candidates, provider);
    expect(decision.action).toBe('merge');
    expect(decision.targetClusterId).toBe(20);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe('CUR-06 & Spike S-7 Merge Calibration Benchmark', () => {
  const pairsPath = path.resolve(process.cwd(), 'tests', 'fixtures', 'curation', 'headline-pairs.json');
  const pairs: BenchmarkHeadlinePair[] = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
  const provider = new FixtureEmbeddingProvider();

  it('benchmark fixture satisfies dataset size requirement (>= 200 pairs)', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(200);
  });

  it('executes 200+ pair calibration benchmark and enforces Precision >= 98% and Recall >= 85%', async () => {
    let tp = 0; // True Positives (expectedMerge: true, merged: true)
    let fp = 0; // False Positives (expectedMerge: false, merged: true)
    let tn = 0; // True Negatives (expectedMerge: false, merged: false)
    let fn = 0; // False Negatives (expectedMerge: true, merged: false)

    const categoryStats: Record<
      string,
      { total: number; correct: number; falsePositives: number; falseNegatives: number }
    > = {};

    for (const pair of pairs) {
      if (!categoryStats[pair.category]) {
        categoryStats[pair.category] = {
          total: 0,
          correct: 0,
          falsePositives: 0,
          falseNegatives: 0,
        };
      }
      categoryStats[pair.category].total += 1;

      const storyA: CandidateStoryInput = {
        headline: pair.headlineA,
        publishedAt: pair.pubDateA,
        entities: pair.entitiesA,
        language: pair.language,
      };

      const storyB: CandidateStoryInput = {
        headline: pair.headlineB,
        publishedAt: pair.pubDateB,
        entities: pair.entitiesB,
        language: pair.language,
      };

      const [embA, embB] = await Promise.all([
        provider.getEmbedding(pair.headlineA),
        provider.getEmbedding(pair.headlineB),
      ]);

      const decision = shouldMergeStories(storyA, storyB, embA, embB);
      const merged = decision.shouldMerge;

      if (pair.expectedMerge) {
        if (merged) {
          tp += 1;
          categoryStats[pair.category].correct += 1;
        } else {
          fn += 1;
          categoryStats[pair.category].falseNegatives += 1;
        }
      } else {
        if (!merged) {
          tn += 1;
          categoryStats[pair.category].correct += 1;
        } else {
          fp += 1;
          categoryStats[pair.category].falsePositives += 1;
        }
      }
    }

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    const f1 = (2 * precision * recall) / (precision + recall);

    // Format summary output table for CI log inspection
    console.log('\n======================================================');
    console.log('       MERIDIAN CURATION MERGE BENCHMARK (CUR-06)       ');
    console.log('======================================================');
    console.log(`Total Pairs Evaluated : ${pairs.length}`);
    console.log(`True Positives (TP)   : ${tp}`);
    console.log(`False Positives (FP)  : ${fp}`);
    console.log(`True Negatives (TN)   : ${tn}`);
    console.log(`False Negatives (FN)  : ${fn}`);
    console.log('------------------------------------------------------');
    console.log(`PRECISION             : ${(precision * 100).toFixed(2)}% (target >= 98.0%)`);
    console.log(`RECALL                : ${(recall * 100).toFixed(2)}% (target >= 85.0%)`);
    console.log(`F1 SCORE              : ${(f1 * 100).toFixed(2)}%`);
    console.log('------------------------------------------------------');
    console.log('Category Breakdown:');
    for (const [cat, stats] of Object.entries(categoryStats)) {
      const accuracy = ((stats.correct / stats.total) * 100).toFixed(1);
      console.log(
        `  ${cat.padEnd(20)}: ${stats.correct}/${stats.total} (${accuracy}%) | FP: ${stats.falsePositives}, FN: ${stats.falseNegatives}`
      );
    }
    console.log('======================================================\n');

    // Strict non-negotiable benchmark gates
    expect(precision).toBeGreaterThanOrEqual(0.98);
    expect(recall).toBeGreaterThanOrEqual(0.85);

    // Critical defensive invariants: zero false positives on conflict/disjoint subsets
    expect(categoryStats['round_conflict']?.falsePositives ?? 0).toBe(0);
    expect(categoryStats['temporal_conflict']?.falsePositives ?? 0).toBe(0);
    expect(categoryStats['disjoint_entity']?.falsePositives ?? 0).toBe(0);
  });
});
