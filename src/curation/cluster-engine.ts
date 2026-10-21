/**
 * src/curation/cluster-engine.ts — Two-Gate Clustering Engine.
 *
 * Implements CUR-01, CUR-06, D-01, D-04, D-07, D-08, and Spike S-7.
 *
 * Two-gate incremental single-linkage clustering:
 * - Gate 1: Fast candidate pruning via SimHash LSH bands + Anti-merge defensive guards
 *           (time window, disjoint entity, shared non-generic entity/token, round/aspect conflicts).
 * - Gate 2: Semantic embedding confirmation via BGE-M3 (cosine threshold >= 0.82).
 * - Conservative aggregation: "When in doubt, do not merge."
 * - Strict language isolation: English never merges with Hindi.
 * - Primary headline selection: prioritized by outlet authority then length (<110 chars).
 */

import { evaluateAntiMergeGuards, type CandidateStoryInput } from './guards.js';
import { cosineSimilarity, type EmbeddingProvider } from './embedding-provider.js';

export { type CandidateStoryInput };

export const BGE_M3_SIMILARITY_THRESHOLD = 0.82;

export interface ClusteringDecision {
  action: 'merge' | 'new_cluster';
  targetClusterId?: number;
  confidence: number;
  reason: string;
}

export interface CandidateStoryRow {
  id: number;
  clusterId: number;
  headline: string;
  excerpt: string | null;
  publishedAt: string;
  simhash: bigint | number;
  language: string;
  countryCode: string;
}

export interface StoryCandidate {
  clusterId: number;
  story: CandidateStoryInput;
}

/**
 * Selects the primary representative headline for a cluster (D-07).
 * Prioritizes:
 * 1. Outlet authority descending (highest authority first).
 * 2. If authority is equal, chooses the longer informative headline within
 *    broadsheet headline length limit (< 110 characters).
 */
export function selectPrimaryHeadline(
  stories: Array<{ headline: string; outletAuthority?: number }>
): string {
  if (!stories || stories.length === 0) {
    return '';
  }

  const sorted = [...stories].sort((a, b) => {
    const authA = a.outletAuthority ?? 0;
    const authB = b.outletAuthority ?? 0;
    if (authB !== authA) {
      return authB - authA;
    }

    const lenA = a.headline.trim().length;
    const lenB = b.headline.trim().length;

    const inRangeA = lenA < 110;
    const inRangeB = lenB < 110;

    if (inRangeA && !inRangeB) return -1;
    if (!inRangeA && inRangeB) return 1;

    // Both in range or both out of range: prefer longer informative headline
    return lenB - lenA;
  });

  return sorted[0].headline;
}

/**
 * Evaluates whether two stories should merge into the same cluster.
 * Strict defensive evaluation:
 * 1. Strict language boundary (en != hi -> reject)
 * 2. Anti-merge guards (time window, disjoint entities, shared token, round/aspect conflicts)
 * 3. Gate 2 semantic similarity (BGE-M3 cosine >= 0.82)
 */
export function shouldMergeStories(
  storyA: CandidateStoryInput,
  storyB: CandidateStoryInput,
  embeddingA: number[],
  embeddingB: number[]
): { shouldMerge: boolean; confidence: number; reason: string } {
  // 1. Strict language boundary (D-08)
  if (storyA.language !== storyB.language) {
    return {
      shouldMerge: false,
      confidence: 0,
      reason: 'different_languages',
    };
  }

  // 2. Anti-merge defensive guards (CUR-04, CUR-05, D-02, D-03, D-05)
  const guardResult = evaluateAntiMergeGuards(storyA, storyB);
  if (!guardResult.allowed) {
    return {
      shouldMerge: false,
      confidence: 0,
      reason: guardResult.reason ?? 'guard_rejected',
    };
  }

  // 3. Gate 2: Semantic embedding confirmation (CUR-01, D-04)
  const similarity = cosineSimilarity(embeddingA, embeddingB);
  if (similarity >= BGE_M3_SIMILARITY_THRESHOLD) {
    return {
      shouldMerge: true,
      confidence: similarity,
      reason: 'bge_m3_match',
    };
  }

  return {
    shouldMerge: false,
    confidence: similarity,
    reason: 'below_similarity_threshold',
  };
}

/**
 * Evaluates candidate clustering for a new incoming raw story against existing candidates.
 * Implements conservative single-linkage clustering (D-04).
 */
export async function evaluateCandidateClustering(
  newStory: CandidateStoryInput,
  existingCandidates: StoryCandidate[],
  embeddingProvider: EmbeddingProvider
): Promise<ClusteringDecision> {
  if (!existingCandidates || existingCandidates.length === 0) {
    return {
      action: 'new_cluster',
      confidence: 1.0,
      reason: 'no_candidates',
    };
  }

  const newEmbedding = await embeddingProvider.getEmbedding(newStory.headline);
  const candidateHeadlines = existingCandidates.map((c) => c.story.headline);
  const candidateEmbeddings = await embeddingProvider.getBatchEmbeddings(candidateHeadlines);

  let bestMatch: { clusterId: number; confidence: number; reason: string } | null = null;

  for (let i = 0; i < existingCandidates.length; i++) {
    const candidate = existingCandidates[i];
    const candEmbedding = candidateEmbeddings[i];

    const mergeDecision = shouldMergeStories(
      newStory,
      candidate.story,
      newEmbedding,
      candEmbedding
    );

    if (mergeDecision.shouldMerge) {
      if (!bestMatch || mergeDecision.confidence > bestMatch.confidence) {
        bestMatch = {
          clusterId: candidate.clusterId,
          confidence: mergeDecision.confidence,
          reason: mergeDecision.reason,
        };
      }
    }
  }

  if (bestMatch) {
    return {
      action: 'merge',
      targetClusterId: bestMatch.clusterId,
      confidence: bestMatch.confidence,
      reason: bestMatch.reason,
    };
  }

  return {
    action: 'new_cluster',
    confidence: 1.0,
    reason: 'no_candidate_passed_gates',
  };
}
