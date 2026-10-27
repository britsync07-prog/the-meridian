/**
 * Pruning Worker — cleans up old raw items while preserving cluster data.
 *
 * OPS-15: Raw item rows are pruned 30 days after their merge window closes,
 * while the cluster's outlet list, headline, and URL are retained permanently.
 */

import type { MeridianEnv } from './db/config.js';
import { countRawItemsBefore, pruneRawItemsBefore } from './db/repository.js';

const PRUNE_WINDOW_DAYS = 30;

interface PruneResult {
  deleted_raw_items: number;
  preserved_clusters: number;
  skipped_referenced: number;
  deleted_at: string;
}

/**
 * Remove raw-item rows older than PRUNE_WINDOW_DAYS from their merge date.
 * Safe: only deletes raw_items that have no associated permanent cluster data
 * (i.e., not referenced in story_sources).
 */
export async function pruneRawItems(env: MeridianEnv): Promise<PruneResult> {
  const deletedAt = new Date().toISOString();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRUNE_WINDOW_DAYS);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];

  console.log(`Pruning raw_items older than ${PRUNE_WINDOW_DAYS} days (cutoff: ${cutoffISO})`);

  const { deleted: deletedCount, referenced: referencedCount, clusters: preservedClusters } = await pruneRawItemsBefore(env, cutoffISO);
  console.log(`Found ${referencedCount} raw_items referenced by story_sources (permanent data)`);
  console.log(`Removed ${deletedCount} raw_item rows`);

  const result: PruneResult = {
    deleted_raw_items: deletedCount,
    preserved_clusters: preservedClusters,
    skipped_referenced: referencedCount,
    deleted_at: deletedAt,
  };

  console.log(`Prune complete: ${deletedCount} items removed, ${preservedClusters} clusters preserved, ${referencedCount} referenced items skipped`);
  return result;
}

/**
 * Dry-run mode: show what would be deleted without actually deleting.
 */
export async function dryRunPrune(env: MeridianEnv): Promise<{ estimated_deletions: number; cutoff_date: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRUNE_WINDOW_DAYS);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];

  const estimatedDeletions = await countRawItemsBefore(env, cutoffISO);

  return {
    estimated_deletions: estimatedDeletions,
    cutoff_date: cutoffISO,
  };
}

/**
 * Main entry point for pruning Worker.
 */
export async function runPrune(env: MeridianEnv, dryRun = false): Promise<PruneResult> {
  if (dryRun) {
    const estimate = await dryRunPrune(env);
    console.log(`Dry run: would remove ${estimate.estimated_deletions} raw_item rows`);
    return {
      deleted_raw_items: 0,
      preserved_clusters: 0,
      skipped_referenced: 0,
      deleted_at: new Date().toISOString(),
    };
  }

  return pruneRawItems(env);
}
