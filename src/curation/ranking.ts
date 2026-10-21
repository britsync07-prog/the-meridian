/**
 * src/curation/ranking.ts — Broadsheet Trending Score & Recency Decay.
 *
 * Implements CUR-07, CUR-10, D-09, D-10, D-11, and D-12.
 *
 * Canonical Broadsheet Trending Score Formula (D-09):
 *   trending_score =
 *     3.0 * log2(1 + distinct_outlets) +
 *     1.0 * log2(1 + total_mentions) +
 *     5.0 * 0.5^(age_hours / 18.0) +
 *     0.8 * min(1, max(0, distinct_sections - 1))
 *
 * Key guarantees:
 * - Exponential recency decay with an exact 18-hour half-life.
 * - Multi-outlet consensus weighted 3x over duplicate single-source mentions.
 * - Section diversity bonus (0.8) for stories crossing desk boundaries.
 * - Editor's Picks qualification gate: clusters with < 2 distinct outlets
 *   strictly receive editorial_rank = null (CUR-10).
 */

export interface TrendingScoreInput {
  distinctOutlets: number;
  totalMentions: number;
  publishedAt: string; // ISO-8601 timestamp
  nowIso?: string;     // Deterministic timestamp for testing/builds
  distinctSections?: number;
}

export interface ClusterScoreUpdate {
  clusterId: number;
  trendingScore: number;
  editorialRank: number | null;
  scoreUpdatedAt: string;
}

/**
 * Calculates story age in fractional hours from publishedAt to nowIso (or current time).
 * Clamps negative elapsed time to 0 to safeguard against clock skew.
 */
export function calculateAgeHours(publishedAt: string, nowIso?: string): number {
  const publishedMs = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedMs)) {
    return 0;
  }
  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const elapsedMs = Math.max(0, nowMs - publishedMs);
  return elapsedMs / (3600 * 1000);
}

/**
 * Computes canonical broadsheet trending score (CUR-07, D-09).
 * Returns the score rounded to 3 decimal places.
 */
export function calculateTrendingScore(input: TrendingScoreInput): number {
  const distinctOutlets = Math.max(1, input.distinctOutlets);
  const totalMentions = Math.max(distinctOutlets, input.totalMentions);
  const distinctSections = Math.max(1, input.distinctSections ?? 1);
  const ageHours = calculateAgeHours(input.publishedAt, input.nowIso);

  const outletTerm = 3.0 * Math.log2(1 + distinctOutlets);
  const mentionTerm = 1.0 * Math.log2(1 + totalMentions);
  const recencyTerm = 5.0 * Math.pow(0.5, ageHours / 18.0);
  const sectionTerm = 0.8 * Math.min(1, Math.max(0, distinctSections - 1));

  const rawScore = outletTerm + mentionTerm + recencyTerm + sectionTerm;
  return Math.round(rawScore * 1000) / 1000;
}

/**
 * Enforces Editor's Picks & Lead Story qualification threshold (CUR-10, D-10).
 *
 * Single-outlet clusters (distinctOutlets < 2) unconditionally receive null.
 * Multi-outlet clusters (distinctOutlets >= 2) qualify and receive rawRankCandidate ?? 1.
 */
export function evaluateEditorialRank(
  distinctOutlets: number,
  rawRankCandidate?: number | null,
): number | null {
  if (distinctOutlets < 2) {
    return null;
  }
  return rawRankCandidate ?? 1;
}
