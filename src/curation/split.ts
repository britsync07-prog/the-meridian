/**
 * src/curation/split.ts — Reversible administrative cluster split.
 *
 * Implements CUR-02, CUR-03, D-18, D-19.
 *
 * A wrongly merged story is detached into a cluster of its own. Nothing is
 * destroyed: the outlet list, the headline and the attribution URL travel with
 * the story to its new cluster, the surviving cluster is re-measured, and the
 * URL that was wrong carries a dated correction note.
 *
 * The split never deletes a `stories` row. It moves the row's `cluster_id` and
 * moves its `story_sources` row across with it, so the operation is
 * reversible: re-merging the two clusters restores the original shape without
 * losing a single attribution link (CUR-02).
 */

import type { Repository } from '../../apps/worker/src/db/repository.js';
import { selectPrimaryHeadline } from './cluster-engine.js';
import { calculateTrendingScore } from './ranking.js';

export interface SplitClusterResult {
  originalClusterId: number;
  newClusterId: number;
  newClusterSlug: string;
  correctionId: number;
  correctionNote: string;
}

/**
 * Detaches a mistakenly merged story from an existing cluster into a new cluster (CUR-02, CUR-03, D-18, D-19).
 * Preserves all source attribution links and records an immutable dated correction note in D1.
 */
export async function splitCluster(
  oldClusterId: number,
  storyId: number,
  repository: Repository,
  nowIso?: string,
): Promise<SplitClusterResult> {
  const currentTimestamp = nowIso ?? new Date().toISOString();
  const dateStr = currentTimestamp.slice(0, 10);

  // 1. Fetch the cluster's member list. `story_sources` is the member list of
  //    record — the raw `stories` rows are pruned 30 days after the merge
  //    window closes, so the attribution list is what survives.
  const memberSources = await repository.listStoriesForCluster(oldClusterId);
  if (!memberSources || memberSources.length < 2) {
    throw new Error(
      `Cannot split cluster ${oldClusterId}: must contain at least 2 member stories (found ${memberSources?.length ?? 0}).`,
    );
  }

  // 3. The detached story and the outlet that published it. The correction
  //    note names the outlet, so the name has to be the real one — the source
  //    id alone would publish "source 10" to a reader.
  const story = await repository.findStoryById(storyId);
  if (!story) {
    throw new Error(`Story ${storyId} does not belong to cluster ${oldClusterId}.`);
  }
  const source = await repository.findSourceById(story.source_id);
  const outletName = source?.name ?? `source ${story.source_id}`;

  // 2. Validate that the target story is a member of this cluster
  const targetSource = memberSources.find((s) => s.source_id === story.source_id);
  if (!targetSource) {
    throw new Error(
      `Story ${storyId} does not belong to cluster ${oldClusterId}.`,
    );
  }

  // 4. Generate standard dated correction note (CUR-03, D-19)
  const correctionNote = `Correction (${dateStr}): An earlier version of this story incorrectly grouped coverage from ${outletName}. The coverage has been separated into its own report.`;

  // 5. Generate immutable unique slug for the new cluster
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  const newSlug = `story-${Date.now().toString(36)}-${randomSuffix}`;

  // 6. Metrics for the new cluster: one outlet, one mention, the story's own
  //    publication time (CON-15 — the earliest member's, and it has one).
  const newTrendingScore = calculateTrendingScore({
    distinctOutlets: 1,
    totalMentions: 1,
    publishedAt: story.published_at,
    distinctSections: 1,
    nowIso: currentTimestamp,
  });

  const newCluster = {
    slug: newSlug,
    canonicalHeadline: story.headline,
    canonicalExcerpt: story.excerpt,
    publishedAt: story.published_at,
    outletCount: 1,
    mentionCount: 1,
    trendingScore: newTrendingScore,
  };

  // 7. Re-measure the cluster the story is leaving. The surviving members
  //    keep the cluster; its canonical headline, counts, earliest publication
  //    time and trending score are recomputed from what is left.
  const remaining = memberSources.filter((s) => s.source_id !== story.source_id);
  const distinctOutlets = new Set(remaining.map((s) => s.source_id)).size;
  const mentionCount = remaining.length;
  const earliestPublishedAt = remaining
    .map((s) => s.published_at)
    .sort()[0];

  const canonicalHeadline = selectPrimaryHeadline(
    remaining.map((s) => ({ headline: s.headline })),
  );
  const promoted = remaining.find((s) => s.headline === canonicalHeadline) ?? remaining[0];
  const promotedStory = await repository.findStoryBySourceAndCluster(promoted.source_id, oldClusterId);

  const oldTrendingScore = calculateTrendingScore({
    distinctOutlets,
    totalMentions: mentionCount,
    publishedAt: earliestPublishedAt,
    distinctSections: 1,
    nowIso: currentTimestamp,
  });

  const oldClusterUpdates = {
    promotedStoryId: promotedStory?.id ?? promoted.source_id,
    canonicalHeadline,
    canonicalExcerpt: promotedStory?.excerpt ?? null,
    publishedAt: earliestPublishedAt,
    outletCount: distinctOutlets,
    mentionCount,
    trendingScore: oldTrendingScore,
  };

  // 8. Execute the transactional split in the repository (OPS-14)
  const { newClusterId, correctionId } = await repository.recordClusterSplit(
    oldClusterId,
    newCluster,
    storyId,
    outletName,
    correctionNote,
    currentTimestamp,
    oldClusterUpdates,
  );

  return {
    originalClusterId: oldClusterId,
    newClusterId,
    newClusterSlug: newSlug,
    correctionId,
    correctionNote,
  };
}
