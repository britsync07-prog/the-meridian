/**
 * Snapshot reader module for the Astro site.
 *
 * Loads the D1→R2 gzipped JSON snapshot and provides typed accessors for
 * edition fronts, section pages, story pages, archives, topics, and entities.
 *
 * In CI, SNAPSHOT_PATH points to the local manifest copy. In production,
 * the snapshot is fetched from R2 at build time by the snapshot generation
 * script and bundled with the static output.
 */

import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

/* ------------------------------------------------------------------------- */
/* Types                                                                      */
/* ------------------------------------------------------------------------- */

export interface SnapshotCluster {
  id: number;
  slug: string;
  canonical_headline: string;
  canonical_excerpt?: string | null;
  published_at: string;
  is_prominent: boolean;
  trending_score: number;
  outlet_count: number;
  editorial_rank: number | null;
}

export interface SnapshotStorySource {
  cluster_id: number;
  source_id: string;
  source_name?: string;
  rank: number;
  headline: string;
  url: string;
  published_at: string;
}

export interface SnapshotEdition {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  language: string;
}

export interface SnapshotSection {
  id: string;
  name: string;
  sortOrder: number;
}

export interface SnapshotImage {
  cluster_id: number;
  source_url: string;
  alt_text: string | null;
  credit: string | null;
  media_key: string;
}

export interface SnapshotData {
  generated_at: string;
  schema_version: number;
  editions: SnapshotEdition[];
  sections: SnapshotSection[];
  clusters: SnapshotCluster[];
  story_sources: SnapshotStorySource[];
  edition_clusters: { edition_id: string; cluster_id: number }[];
  cluster_sections: { cluster_id: number; section_id: string; confidence: number; method: string }[];
  cluster_topics: { cluster_id: number; topic_id: number }[];
  cluster_entities: { cluster_id: number; entity_id: number; is_primary: boolean; weight: number }[];
  topics: { id: number; name: string }[];
  entities: { id: number; slug: string; name: string; entity_type: string; country_code: string | null }[];
  sources: { id: number; slug: string; name: string; feed_url: string; country_code: string; language: string }[];
  images?: SnapshotImage[];
  manifest: {
    hash: string;
    content_length: number;
    compressed_length: number;
    cluster_count: number;
  };
}

/* ------------------------------------------------------------------------- */
/* Loaders                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Load snapshot from SNAPSHOT_PATH env var or the CI-generated local copy.
 * Returns null if the snapshot is unavailable — callers must handle gracefully.
 */
export async function loadSnapshot(): Promise<SnapshotData | null> {
  const snapshotPath = process.env.SNAPSHOT_PATH ?? join(REPO_ROOT, 'scripts', 'snapshot', 'latest.json.gz');

  if (!existsSync(snapshotPath)) {
    return null;
  }
  const buffer = readFileSync(snapshotPath);
  // Auto-detect compression
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return JSON.parse(gunzipSync(buffer).toString('utf8'));
  }
  return JSON.parse(buffer.toString('utf8'));
}

/* ------------------------------------------------------------------------- */
/* Accessors                                                                  */
/* ------------------------------------------------------------------------- */

/** Map cluster IDs to their story sources. */
function buildSourceMap(sources: SnapshotStorySource[]): Map<number, SnapshotStorySource[]> {
  const map = new Map<number, SnapshotStorySource[]>();
  for (const src of sources) {
    const arr = map.get(src.cluster_id) ?? [];
    arr.push(src);
    map.set(src.cluster_id, arr);
  }
  return map;
}

/** Map cluster IDs to their section assignments. */
function buildSectionMap(sections: SnapshotData['cluster_sections']): Map<number, string> {
  const map = new Map<number, string>();
  for (const s of sections) {
    if (!map.has(s.cluster_id)) {
      map.set(s.cluster_id, s.section_id);
    }
  }
  return map;
}

/** Map cluster IDs to their topic names. */
function buildTopicMap(
  clusterTopics: SnapshotData['cluster_topics'],
  topics: SnapshotData['topics'],
): Map<number, string[]> {
  const topicById = new Map(topics.map((t) => [t.id, t.name]));
  const map = new Map<number, string[]>();
  for (const ct of clusterTopics) {
    const arr = map.get(ct.cluster_id) ?? [];
    const name = topicById.get(ct.topic_id);
    if (name && !arr.includes(name)) {
      arr.push(name);
    }
    map.set(ct.cluster_id, arr);
  }
  return map;
}

/** Map cluster IDs to their entity names. */
function buildEntityMap(
  clusterEntities: SnapshotData['cluster_entities'],
  entities: SnapshotData['entities'],
): Map<number, string[]> {
  const entityById = new Map(entities.map((e) => [e.id, e.name]));
  const map = new Map<number, string[]>();
  for (const ce of clusterEntities) {
    const arr = map.get(ce.cluster_id) ?? [];
    const name = entityById.get(ce.entity_id);
    if (name && !arr.includes(name)) {
      arr.push(name);
    }
    map.set(ce.cluster_id, arr);
  }
  return map;
}

/** Get edition ID from slug. */
function getEditionId(data: SnapshotData, edition: string): string | null {
  return data.editions.find((e) => e.slug === edition)?.id ?? null;
}

/** Get clusters published to an edition. */
function getEditionClusters(data: SnapshotData, editionId: string): SnapshotCluster[] {
  const clusterIds = new Set(
    data.edition_clusters
      .filter((ec) => ec.edition_id === editionId)
      .map((ec) => ec.cluster_id),
  );
  return data.clusters.filter((c) => clusterIds.has(c.id));
}

/**
 * Build front-page data for one edition.
 * Returns null if the edition has no clusters in the snapshot.
 */
export function getEditionFrontData(
  data: SnapshotData,
  edition: string,
): { edition: string; date: string; clusters: SnapshotCluster[] } | null {
  const editionId = getEditionId(data, edition);
  if (!editionId) return null;

  const clusters = getEditionClusters(data, editionId);
  if (clusters.length === 0) return null;

  const date = new Date().toISOString().split('T')[0];

  return { edition, date, clusters };
}

/**
 * Build section page data for one edition + section.
 * Returns null when there are no stories (404 path).
 */
export function getSectionPageData(
  data: SnapshotData,
  edition: string,
  section: string,
): { edition: string; section: string; clusters: SnapshotCluster[] } | null {
  const editionId = getEditionId(data, edition);
  if (!editionId) return null;

  const editionClusters = getEditionClusters(data, editionId);
  const sectionClusterIds = new Set(
    data.cluster_sections
      .filter((cs) => cs.section_id === section)
      .map((cs) => cs.cluster_id),
  );
  const clusters = editionClusters.filter((c) => sectionClusterIds.has(c.id));

  if (clusters.length === 0) return null;

  return { edition, section, clusters };
}

/**
 * Build story page data for a slug.
 * Returns null when the slug is unknown.
 */
export function getStoryPageData(
  data: SnapshotData,
  slug: string,
): { cluster: SnapshotCluster; sources: SnapshotStorySource[]; section?: string; topics: string[]; entities: string[] } | null {
  const cluster = data.clusters.find((c) => c.slug === slug);
  if (!cluster) return null;

  const sourceMap = buildSourceMap(data.story_sources);
  const sectionMap = buildSectionMap(data.cluster_sections);
  const topicMap = buildTopicMap(data.cluster_topics, data.topics);
  const entityMap = buildEntityMap(data.cluster_entities, data.entities);

  return {
    cluster,
    sources: sourceMap.get(cluster.id) ?? [],
    section: sectionMap.get(cluster.id),
    topics: topicMap.get(cluster.id) ?? [],
    entities: entityMap.get(cluster.id) ?? [],
  };
}

/**
 * Return all story slugs for sitemap generation.
 */
export function getAllStorySlugs(data: SnapshotData): string[] {
  return data.clusters.map((c) => c.slug);
}

/**
 * Return archive paths (edition + date) for editions that have stories on that date.
 */
export function getArchivePaths(data: SnapshotData): { edition: string; date: string }[] {
  const paths: { edition: string; date: string }[] = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    for (const edition of data.editions) {
      const editionClusters = getEditionClusters(data, edition.id);
      const hasStory = editionClusters.some((c) => c.published_at.startsWith(dateStr));
      if (hasStory) {
        paths.push({ edition: edition.slug, date: dateStr });
      }
    }
  }

  return paths;
}

/**
 * Return topic paths for editions that have clusters with topics.
 */
export function getTopicPaths(data: SnapshotData): string[] {
  const topicIds = new Set(data.cluster_topics.map((ct) => ct.topic_id));
  return data.topics
    .filter((t) => topicIds.has(t.id))
    .map((t) => t.name.toLowerCase().replace(/\s+/g, '-'));
}

/**
 * Return entity paths for editions that have clusters with entities.
 */
export function getEntityPaths(data: SnapshotData): string[] {
  const entityIds = new Set(data.cluster_entities.map((ce) => ce.entity_id));
  return data.entities
    .filter((e) => entityIds.has(e.id))
    .map((e) => e.slug);
}
