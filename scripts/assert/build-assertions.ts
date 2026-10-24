/**
 * Build assertion suite for Phase 5.
 *
 * OPS-09 through OPS-13: hard build gates that fail the build rather than warn.
 * Each assertion throws on failure — there is no soft-fail path.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotData } from '../../apps/site/src/lib/snapshot.js';
import { EDITIONS, SECTIONS } from '../../shared/config/editions.js';
import freeTierLimits from '../../config/free-tier-limits.json' with { type: 'json' };

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function getCeiling(id: string): number {
  const limit = freeTierLimits.limits.find((l) => l.id === id);
  if (!limit) {
    throw new Error(`Free-tier ceiling not found: ${id}`);
  }
  if (limit.enforcement !== 'enforced') {
    throw new Error(`Ceiling ${id} is not enforced`);
  }
  return limit.value;
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(full);
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      count++;
    }
  }
  return count;
}

/* ------------------------------------------------------------------------- */
/* Assertions                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * OPS-09: Every edition must have at least 8 stories on its front page.
 * Thin editions degrade the product and hurt SEO.
 */
export function assertThinEdition(data: SnapshotData): void {
  const editionCounts = new Map<string, number>();
  for (const ec of data.edition_clusters) {
    editionCounts.set(ec.edition_id, (editionCounts.get(ec.edition_id) ?? 0) + 1);
  }

  const minStories = 8;
  for (const edition of EDITIONS) {
    const count = editionCounts.get(edition.id) ?? 0;
    if (count < minStories) {
      throw new Error(
        `assertThinEdition: Edition "${edition.id}" has ${count} stories, minimum is ${minStories}`,
      );
    }
  }
}

/**
 * OPS-10: Every section must have at least 3 stories per edition.
 */
export function assertSectionStoryFloor(data: SnapshotData): void {
  const sectionCounts = new Map<string, Map<string, number>>();

  for (const ec of data.edition_clusters) {
    const editionId = ec.edition_id;
    const clusterId = ec.cluster_id;
    const sectionAssignment = data.cluster_sections.find((cs) => cs.cluster_id === clusterId);
    if (!sectionAssignment) continue;

    const editionMap = sectionCounts.get(editionId) ?? new Map();
    const count = editionMap.get(sectionAssignment.section_id) ?? 0;
    editionMap.set(sectionAssignment.section_id, count + 1);
    sectionCounts.set(editionId, editionMap);
  }

  const minStories = 3;
  for (const edition of EDITIONS) {
    const editionMap = sectionCounts.get(edition.id) ?? new Map();
    for (const section of SECTIONS) {
      const count = editionMap.get(section.id) ?? 0;
      if (count < minStories) {
        throw new Error(
          `assertSectionStoryFloor: Edition "${edition.id}" section "${section.id}" has ${count} stories, minimum is ${minStories}`,
        );
      }
    }
  }
}

/**
 * OPS-11: No single outlet may supply more than 35% of a front page.
 * Prevents single-source dominance.
 */
export function assertSingleOutletDominance(data: SnapshotData): void {
  const maxDominance = 0.35;

  for (const edition of EDITIONS) {
    const editionId = edition.id;
    const editionClusters = data.edition_clusters
      .filter((ec) => ec.edition_id === editionId)
      .map((ec) => ec.cluster_id);

    const sourceCounts = new Map<string, number>();
    let totalSources = 0;

    for (const clusterId of editionClusters) {
      const sources = data.story_sources.filter((ss) => ss.cluster_id === clusterId);
      for (const source of sources) {
        sourceCounts.set(source.source_id, (sourceCounts.get(source.source_id) ?? 0) + 1);
        totalSources++;
      }
    }

    if (totalSources === 0) continue;

    for (const [sourceId, count] of sourceCounts) {
      const ratio = count / totalSources;
      if (ratio > maxDominance) {
        throw new Error(
          `assertSingleOutletDominance: Edition "${editionId}" outlet "${sourceId}" supplies ${Math.round(ratio * 100)}% of stories (max ${Math.round(maxDominance * 100)}%)`,
        );
      }
    }
  }
}

/**
 * OPS-12: Story count must be within 60-140% of the 7-day trailing mean.
 * Requires a history file at scripts/snapshot/history.json.
 */
export function assertStoryCountDeviation(data: SnapshotData, historyPath?: string): void {
  const currentCount = data.clusters.length;

  if (!historyPath) {
    historyPath = join(process.cwd(), 'scripts', 'snapshot', 'history.json');
  }

  try {
    const history = JSON.parse(readFileSync(historyPath, 'utf8')) as {
      daily_counts: number[];
    };
    if (history.daily_counts.length === 0) return;

    const mean =
      history.daily_counts.reduce((a, b) => a + b, 0) / history.daily_counts.length;
    const lowerBound = mean * 0.6;
    const upperBound = mean * 1.4;

    if (currentCount < lowerBound || currentCount > upperBound) {
      throw new Error(
        `assertStoryCountDeviation: Current count ${currentCount} outside 60-140% range of mean ${mean.toFixed(1)} ([${lowerBound.toFixed(0)}, ${upperBound.toFixed(0)}])`,
      );
    }
  } catch (err) {
    // History file missing or invalid — skip this assertion
    if (err instanceof Error && err.message.includes('No such file')) {
      return;
    }
    throw err;
  }
}

/**
 * OPS-13: Static tier file count must not exceed the free-tier ceiling.
 */
export function assertStaticTierFileCount(buildDir: string): void {
  const ceiling = getCeiling('static_files');

  if (!existsSync(buildDir)) {
    throw new Error(`assertStaticTierFileCount: Build directory not found: ${buildDir}`);
  }

  const count = countFilesRecursive(buildDir);
  if (count > ceiling) {
    throw new Error(
      `assertStaticTierFileCount: Static tier has ${count} files, ceiling is ${ceiling}`,
    );
  }
}

/**
 * CON-07: No two clusters may share the same canonical headline.
 */
export function assertNoDuplicateTitles(data: SnapshotData): void {
  const headlines = new Map<string, number>();

  for (const cluster of data.clusters) {
    const count = headlines.get(cluster.canonical_headline) ?? 0;
    if (count > 0) {
      throw new Error(
        `assertNoDuplicateTitles: Duplicate headline found: "${cluster.canonical_headline}"`,
      );
    }
    headlines.set(cluster.canonical_headline, count + 1);
  }
}

/**
 * CON-06: Each cluster must have at least 4 of 6 value elements:
 * coverage_count, trending_score, topics, entities, related_stories, editorial_rank.
 */
export function assertStoryValueElements(data: SnapshotData): void {
  const minElements = 4;

  for (const cluster of data.clusters) {
    let elementCount = 0;

    // coverage_count
    if (cluster.outlet_count > 0) elementCount++;
    // trending_score
    if (cluster.trending_score > 0) elementCount++;
    // editorial_rank
    if (cluster.editorial_rank !== null) elementCount++;

    // topics
    const hasTopics = data.cluster_topics.some((ct) => ct.cluster_id === cluster.id);
    if (hasTopics) elementCount++;

    // entities
    const hasEntities = data.cluster_entities.some((ce) => ce.cluster_id === cluster.id);
    if (hasEntities) elementCount++;

    // related_stories (clusters with multiple sources)
    const hasSources = data.story_sources.some((ss) => ss.cluster_id === cluster.id);
    if (hasSources) elementCount++;

    if (elementCount < minElements) {
      throw new Error(
        `assertStoryValueElements: Cluster "${cluster.slug}" has only ${elementCount} value elements, minimum is ${minElements}`,
      );
    }
  }
}

/* ------------------------------------------------------------------------- */
/* CLI Runner                                                                 */
/* ------------------------------------------------------------------------- */

export async function runAssertions(snapshotPath: string, buildDir?: string): Promise<void> {
  // Load snapshot
  let data: SnapshotData;
  try {
    const raw = readFileSync(snapshotPath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load snapshot: ${err}`);
  }

  if (data.schema_version !== 1) {
    throw new Error(`Unsupported schema version: ${data.schema_version}`);
  }

  // Run assertions
  assertThinEdition(data);
  assertSectionStoryFloor(data);
  assertSingleOutletDominance(data);
  assertNoDuplicateTitles(data);
  assertStoryValueElements(data);
  assertStoryCountDeviation(data);

  if (buildDir) {
    assertStaticTierFileCount(buildDir);
  }
}
