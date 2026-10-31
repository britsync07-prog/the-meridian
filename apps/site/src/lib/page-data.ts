/**
 * Page data layer for static generation.
 *
 * Loads the snapshot once at module initialization time, then exposes
 * synchronous accessors so Astro pages can call them directly in
 * getStaticPaths() and frontmatter.
 */
import type { EditionId, SectionId } from '../../../../shared/config/editions.js';
import { EDITIONS, SECTIONS } from '../../../../shared/config/editions.js';
import { SITE_NAME } from '../../../../shared/config/site.js';
export { EDITIONS, SECTIONS, SITE_NAME };
import type { SnapshotData, SnapshotCluster, SnapshotImage, SnapshotStorySource } from './snapshot.js';
import { loadSnapshot, getEditionFrontData, getSectionPageData as _getSectionPageData, getStoryPageData as _getStoryPageData, getAllStorySlugs as _getAllStorySlugs, getEditionStoryPaths as _getEditionStoryPaths, getArchivePaths as _getArchivePaths, getEntityPaths } from './snapshot.js';

/* ------------------------------------------------------------------------- */
/* Public interfaces (unchanged for page compatibility)                        */
/* ------------------------------------------------------------------------- */

export interface PageCluster {
  id: number;
  slug: string;
  canonicalHeadline: string;
  canonicalExcerpt: string | null;
  publishedAt: string;
  isProminent: boolean;
  trendingScore: number;
  coverageCount: number;
  editorialRank: number | null;
}

export interface PageSource {
  clusterId: number;
  sourceId: string;
  sourceName: string;
  rank: number;
  headline: string;
  url: string;
  publishedAt: string;
}

export interface PageStory {
  cluster: PageCluster;
  sources: PageSource[];
  image?: PageImage;
  section?: SectionId;
  edition?: EditionId;
}

export interface PageImage {
  alt: string;
  credit: string | null;
  src: string;
  srcset: string;
}

export interface FrontPageData {
  edition: EditionId;
  date: string;
  leadStory: PageStory | null;
  secondaryStories: PageStory[];
  sectionStories: Map<SectionId, PageStory[]>;
  mostCovered: PageStory[];
  editorPicks: PageStory[];
}

export interface SectionPageData {
  edition: EditionId;
  section: SectionId;
  sectionName: string;
  leadStory: PageStory | null;
  stories: PageStory[];
  mostCoveredInSection: PageStory[];
}

export interface StoryPageData {
  slug: string;
  edition: EditionId;
  cluster: PageCluster;
  sources: PageSource[];
  section: SectionId;
  sectionName: string;
  topics: string[];
  entities: string[];
  relatedStories: PageStory[];
}

/* ------------------------------------------------------------------------- */
/* Snapshot cache (loaded once at module init)                                */
/* ------------------------------------------------------------------------- */

let _snapshot: SnapshotData | null = null;

/** Pre-load the snapshot so synchronous accessors work in Astro pages. */
export async function loadPageSnapshot(): Promise<void> {
  if (!_snapshot) {
    _snapshot = await loadSnapshot();
  }
}

/** Return the cached snapshot or null if not yet loaded. */
function getSnapshot(): SnapshotData | null {
  return _snapshot;
}

/** Export snapshot getter for pages that need raw snapshot data (e.g., digest). */
export function getSnapshotData(): SnapshotData | null {
  return _snapshot;
}

/* ------------------------------------------------------------------------- */
/* Snapshot → PageStory conversion                                            */
/* ------------------------------------------------------------------------- */

function toPageCluster(c: SnapshotCluster): PageCluster {
  return {
    id: c.id,
    slug: c.slug,
    canonicalHeadline: c.canonical_headline,
    canonicalExcerpt: c.canonical_excerpt ?? null,
    publishedAt: c.published_at,
    isProminent: c.is_prominent,
    trendingScore: c.trending_score,
    coverageCount: c.outlet_count,
    editorialRank: c.editorial_rank,
  };
}

function toPageSources(clusterId: number, sources: SnapshotStorySource[]): PageSource[] {
  return sources.map(s => ({
    clusterId: s.cluster_id,
    sourceId: s.source_id,
    sourceName: s.source_name ?? s.source_id,
    rank: s.rank,
    headline: s.headline,
    url: s.url,
    publishedAt: s.published_at,
  }));
}

function toPageImage(image: SnapshotImage | undefined, headline: string): PageImage | undefined {
  if (!image) return undefined;
  return {
    alt: image.alt_text || headline,
    credit: image.credit,
    src: `/media/${image.media_key}-960.webp`,
    srcset: [480, 960, 1440].map(width => `/media/${image.media_key}-${width}.webp ${width}w`).join(', '),
  };
}

function storyKey(edition: string, clusterId: number): string {
  return `${edition}:${clusterId}`;
}

function buildStoryMap(snapshot: SnapshotData): Map<string, PageStory> {
  const map = new Map<string, PageStory>();
  const images = new Map<number, SnapshotImage>();
  for (const image of snapshot.images ?? []) {
    if (!images.has(image.cluster_id)) images.set(image.cluster_id, image);
  }
  for (const ec of snapshot.edition_clusters) {
    const cluster = snapshot.clusters.find(c => c.id === ec.cluster_id);
    if (!cluster) continue;
    const sectionAssignment = snapshot.cluster_sections.find(cs => cs.cluster_id === ec.cluster_id);
    const sources = snapshot.story_sources.filter(s => s.cluster_id === ec.cluster_id);
    const story: PageStory = {
      cluster: toPageCluster(cluster),
      sources: toPageSources(ec.cluster_id, sources),
      image: toPageImage(images.get(cluster.id), cluster.canonical_headline),
      section: sectionAssignment?.section_id as SectionId | undefined,
      edition: ec.edition_id as EditionId | undefined,
    };
    map.set(storyKey(ec.edition_id, ec.cluster_id), story);
  }
  return map;
}

/* ------------------------------------------------------------------------- */
/* Public API (same signatures as before — pages unchanged)                   */
/* ------------------------------------------------------------------------- */

export function getEditions(): string[] {
  return EDITIONS.map(e => e.id);
}

export function getSections(): { id: SectionId; name: string }[] {
  return SECTIONS.map(s => ({ id: s.id, name: s.name }));
}

export function getFrontPageData(edition: string): FrontPageData | null {
  const snapshot = getSnapshot();
  if (!snapshot) return null;

  const editionId = edition as EditionId;
  const frontData = getEditionFrontData(snapshot, edition);
  if (!frontData) return null;

  const storyMap = buildStoryMap(snapshot);
  const clusters = frontData.clusters;
  const stories = clusters.map(c => {
    return storyMap.get(storyKey(editionId, c.id))
      ?? { cluster: toPageCluster(c), sources: [], section: undefined, edition: editionId };
  });

  const prominent = stories.filter(s => s.cluster.isProminent);
  const sectionStories = new Map<SectionId, PageStory[]>();
  for (const s of SECTIONS) {
    sectionStories.set(s.id, stories.filter(st => st.section === s.id));
  }

  return {
    edition: editionId,
    date: new Date().toISOString().split('T')[0],
    leadStory: prominent[0] || stories[0] || null,
    secondaryStories: stories.filter(s => s.cluster.coverageCount >= 2).slice(0, 6),
    sectionStories,
    mostCovered: [...stories].sort((a, b) => b.cluster.coverageCount - a.cluster.coverageCount).slice(0, 10),
    editorPicks: stories
      .filter(s => s.cluster.editorialRank !== null && s.cluster.editorialRank !== undefined && s.cluster.editorialRank <= 3)
      .slice(0, 5),
  };
}

export function getSectionPageData(edition: string, section: string): SectionPageData | null {
  const snapshot = getSnapshot();
  if (!snapshot) return null;

  const editionId = edition as EditionId;
  const secData = _getSectionPageData(snapshot, edition, section);
  if (!secData) return null;

  const storyMap = buildStoryMap(snapshot);
  const stories: PageStory[] = secData.clusters.map(c => {
    return storyMap.get(storyKey(editionId, c.id))
      ?? { cluster: toPageCluster(c), sources: [], section: secData.section as SectionId, edition: editionId };
  });

  const leadStory = stories.find(s => s.cluster.isProminent) ?? stories[0] ?? null;
  const rest = stories.filter(s => s !== leadStory);
  const sectionName = snapshot.sections.find(s => s.id === section)?.name ?? section;

  const mostCoveredInSection = [...stories]
    .sort((a, b) => b.cluster.coverageCount - a.cluster.coverageCount)
    .slice(0, 3);

  return {
    edition: editionId,
    section: section as SectionId,
    sectionName,
    leadStory,
    stories: rest,
    mostCoveredInSection,
  };
}

export function getStoryPageData(slug: string, editionContext?: string): StoryPageData | null {
  const snapshot = getSnapshot();
  if (!snapshot) return null;

  const storyData = _getStoryPageData(snapshot, slug);
  if (!storyData) return null;

  const cluster = toPageCluster(storyData.cluster);
  const sources = toPageSources(storyData.cluster.id, storyData.sources);

  // Build related stories from same section
  const allSlugs = _getAllStorySlugs(snapshot);
  const sectionMap = new Map<number, string>();
  for (const cs of snapshot.cluster_sections) sectionMap.set(cs.cluster_id, cs.section_id);

  const relatedSlugs = allSlugs
    .filter(s => s !== slug)
    .slice(0, 5);

  const relatedStories: PageStory[] = [];
  for (const rs of relatedSlugs) {
    const rd = _getStoryPageData(snapshot, rs);
    if (rd) {
      relatedStories.push({
        cluster: toPageCluster(rd.cluster),
        sources: toPageSources(rd.cluster.id, rd.sources),
        image: toPageImage(snapshot.images?.find(image => image.cluster_id === rd.cluster.id), rd.cluster.canonical_headline),
        section: (sectionMap.get(rd.cluster.id) as SectionId) ?? storyData.section as SectionId,
        edition: undefined,
      });
    }
  }

  const sectionName = snapshot.sections.find(s => s.id === storyData.section)?.name ?? '';
  const edition = editionContext && snapshot.edition_clusters.some((item) =>
    item.edition_id === editionContext && item.cluster_id === storyData.cluster.id,
  )
    ? editionContext as EditionId
    : snapshot.edition_clusters.find((item) => item.cluster_id === storyData.cluster.id)?.edition_id as EditionId | undefined;

  return {
    slug,
    edition: edition ?? snapshot.edition_clusters.find((item) => item.cluster_id === storyData.cluster.id)?.edition_id as EditionId ?? 'uk',
    cluster,
    sources,
    section: (storyData.section as SectionId) ?? 'general',
    sectionName,
    topics: storyData.topics,
    entities: storyData.entities,
    relatedStories,
  };
}

/** Permanent story routes retain the edition from which the reader opened it. */
export function getEditionStoryPaths(): { edition: string; slug: string }[] {
  const snapshot = getSnapshot();
  return snapshot ? _getEditionStoryPaths(snapshot) : [];
}

export function getAllStorySlugs(): string[] {
  const snapshot = getSnapshot();
  return snapshot ? _getAllStorySlugs(snapshot) : [];
}

export function getAllSectionPaths(): { edition: string; section: string }[] {
  const r: { edition: string; section: string }[] = [];
  for (const e of EDITIONS) {
    for (const s of SECTIONS) {
      r.push({ edition: e.id, section: s.id });
    }
  }
  return r;
}

export function getArchiveDates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function getArchivePaths(): { edition: string; date: string }[] {
  const snapshot = getSnapshot();
  return snapshot ? _getArchivePaths(snapshot) : [];
}

// Route modules import this data layer before calling synchronous accessors.
// Awaiting here prevents static-path generation from racing the local CI snapshot.
await loadPageSnapshot();

// Re-export getTopicPaths from snapshot (wraps to handle missing snapshot)
export function getTopicPaths(): string[] {
  const snapshot = getSnapshot();
  if (!snapshot) return [];
  const topicIds = new Set(snapshot.cluster_topics.map((ct) => ct.topic_id));
  return snapshot.topics
    .filter((t) => topicIds.has(t.id))
    .map((t) => t.name.toLowerCase().replace(/\s+/g, '-'));
}
