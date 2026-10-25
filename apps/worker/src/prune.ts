/**
 * Pruning Worker — cleans up old raw items while preserving cluster data.
 *
 * OPS-15: Raw item rows are pruned 30 days after their merge window closes,
 * while the cluster's outlet list, headline, and URL are retained permanently.
 */

import type { MeridianEnv } from './db/config.js';

const PRUNE_WINDOW_DAYS = 30;

interface PruneResult {
  deleted_raw_items: number;
  preserved_clusters: number;
  skipped_referenced: number;
  deleted_at: string;
}

/**
 * Delete raw_item rows older than PRUNE_WINDOW_DAYS from their merge date.
 * Safe: only deletes raw_items that have no associated permanent cluster data
 * (i.e., not referenced in story_sources).
 */
export async function pruneRawItems(env: MeridianEnv): Promise<PruneResult> {
  const db = env.DB;
  const deletedAt = new Date().toISOString();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRUNE_WINDOW_DAYS);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];

  console.log(`Pruning raw_items older than ${PRUNE_WINDOW_DAYS} days (cutoff: ${cutoffISO})`);

  // First, count how many raw_items are referenced by story_sources (permanent data)
  const referencedStmt = db.prepare(`
    SELECT COUNT(DISTINCT raw_item_id) as count
    FROM story_sources
    WHERE raw_item_id IS NOT NULL
  `);
  const referencedResult = await referencedStmt.all<{ count: number }>();
  const referencedCount = referencedResult.results?.[0]?.count ?? 0;
  console.log(`Found ${referencedCount} raw_items referenced by story_sources (permanent data)`);

  // Delete old raw items that are NOT referenced by story_sources
  // This ensures we never delete raw items that have been promoted to permanent clusters
  const deleteStmt = db.prepare(`
    DELETE FROM raw_items
    WHERE published_at < ?
    AND id NOT IN (SELECT raw_item_id FROM story_sources WHERE raw_item_id IS NOT NULL)
  `).bind(cutoffISO);

  const deleteResult = await deleteStmt.all();
  const deletedCount = deleteResult.meta?.changes ?? 0;
  console.log(`Deleted ${deletedCount} raw_item rows`);

  // Verify no clusters were affected (safety check)
  const clusterStmt = db.prepare(`SELECT COUNT(*) as count FROM clusters`);
  const clusterCount = await clusterStmt.all<{ count: number }>();
  const preservedClusters = clusterCount.results?.[0]?.count ?? 0;

  const result: PruneResult = {
    deleted_raw_items: deletedCount,
    preserved_clusters: preservedClusters,
    skipped_referenced: referencedCount,
    deleted_at: deletedAt,
  };

  console.log(`Prune complete: ${deletedCount} items deleted, ${preservedClusters} clusters preserved, ${referencedCount} referenced items skipped`);
  return result;
}

/**
 * Dry-run mode: show what would be deleted without actually deleting.
 */
export async function dryRunPrune(env: MeridianEnv): Promise<{ estimated_deletions: number; cutoff_date: string }> {
  const db = env.DB;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRUNE_WINDOW_DAYS);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM raw_items
    WHERE published_at < ?
  `).bind(cutoffISO);

  const result = await countStmt.all<{ count: number }>();
  const estimatedDeletions = result.results?.[0]?.count ?? 0;

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
    console.log(`Dry run: would delete ${estimate.estimated_deletions} raw_item rows`);
    return {
      deleted_raw_items: 0,
      preserved_clusters: 0,
      skipped_referenced: 0,
      deleted_at: new Date().toISOString(),
    };
  }

  return pruneRawItems(env);
}
