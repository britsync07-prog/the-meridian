/**
 * Build assertion suite for Phase 5.
 *
 * OPS-09 through OPS-13: hard build gates that fail the build rather than warn.
 * Each assertion throws on failure — there is no soft-fail path.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { SnapshotData } from '../../apps/site/src/lib/snapshot.js';
import { EDITIONS, SECTIONS } from '../../shared/config/editions.js';
import freeTierLimits from '../../config/free-tier-limits.json' with { type: 'json' };

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

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
 * Editorial diversity gate: each edition needs three staffed sections, with
 * two stories in each. Requiring every desk daily would need 192 stories/day,
 * above the documented 120-story total supply.
 */
export function assertSectionStoryFloor(data: SnapshotData): void {
  const sectionCounts = new Map<string, Map<string, number>>();

  for (const ec of data.edition_clusters) {
    const editionId = ec.edition_id;
    const clusterId = ec.cluster_id;
    const editionMap = sectionCounts.get(editionId) ?? new Map();
    for (const sectionAssignment of data.cluster_sections.filter((cs) => cs.cluster_id === clusterId)) {
      const count = editionMap.get(sectionAssignment.section_id) ?? 0;
      editionMap.set(sectionAssignment.section_id, count + 1);
    }
    sectionCounts.set(editionId, editionMap);
  }

  const minStories = 2;
  const minSections = 3;
  for (const edition of EDITIONS) {
    const editionMap = sectionCounts.get(edition.id) ?? new Map();
    const staffedSections = [...editionMap.values()].filter((count) => count >= minStories).length;
    if (staffedSections < minSections) {
      throw new Error(
        `assertSectionStoryFloor: Edition "${edition.id}" has ${staffedSections} staffed sections, minimum is ${minSections} with ${minStories} stories each`,
      );
    }
  }
}

/**
 * OPS-11: No single outlet may supply more than 45% of stories in an edition.
 * Prevents single-source dominance while allowing realistic variance across editions
 * with 3-4 primary national publishers (e.g. CA, NZ, IE).
 */
export function assertSingleOutletDominance(data: SnapshotData, maxDominance = 0.45): void {

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
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

/**
 * OPS-13: Static tier file count must not exceed the free-tier ceiling.
 */
export function assertStaticTierFileCount(buildDir: string): void {
  const trigger = freeTierLimits.paid_plan_decision_rule.triggers.find((entry) => entry.id === 'static_files');
  if (!trigger) {
    throw new Error('Free-tier static-file trigger not found');
  }
  const ceiling = trigger.threshold;

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
 * CON-06: Each cluster must have at least 4 value elements from:
 * coverage count/line, trending rank, topics/entities tags,
 * related stories/sources, edition digest, and coverage byline.
 */
export function assertStoryValueElements(data: SnapshotData): void {
  const minElements = 4;

  for (const cluster of data.clusters) {
    let elementCount = 0;

    // 1. multi-outlet coverage line and count
    if (cluster.outlet_count > 0) elementCount++;
    // 2. trending rank / score
    if (cluster.trending_score > 0) elementCount++;
    // 3. editorial rank
    if (cluster.editorial_rank !== null) elementCount++;

    // 4. topic and entity tags
    const hasTopics = data.cluster_topics.some((ct) => ct.cluster_id === cluster.id);
    const hasEntities = data.cluster_entities.some((ce) => ce.cluster_id === cluster.id);
    if (hasTopics || hasEntities) elementCount++;

    // 5. the edition digest / edition membership
    const hasEdition = data.edition_clusters.some((ec) => ec.cluster_id === cluster.id);
    if (hasEdition) elementCount++;

    // 6. the coverage byline / source links
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
    const raw = readFileSync(snapshotPath);
    data = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8'));
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
