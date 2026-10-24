/**
 * RSS feed generator.
 *
 * PUB-09: Produces valid RSS 2.0 feeds for per-edition, per-section, and global scopes.
 * CON-07: Excerpts are verbatim from source items — never rewritten or paraphrased.
 */

import type { SnapshotData } from './snapshot.js';
import { SITE_NAME } from '../../../../shared/config/site.js';

/** One RSS item representing one cluster story. */
interface RssItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  sources: string[];
}

/** Generate a full RSS 2.0 XML string from snapshot data. */
export function buildRssFeed(
  snapshot: SnapshotData,
  options: {
    edition?: string;
    section?: string;
    limit?: number;
    feedTitle: string;
    feedDescription: string;
    siteOrigin: string;
  },
): string {
  const { edition, section, limit = 50, feedTitle, feedDescription, siteOrigin } = options;

  // Filter clusters
  let clusters = snapshot.clusters;
  if (edition) {
    const editionId = snapshot.editions.find((e) => e.slug === edition)?.id;
    if (!editionId) return '';
    const clusterIds = new Set(
      snapshot.edition_clusters
        .filter((ec) => ec.edition_id === editionId)
        .map((ec) => ec.cluster_id),
    );
    clusters = clusters.filter((c) => clusterIds.has(c.id));
  }

  if (section) {
    const sectionClusterIds = new Set(
      snapshot.cluster_sections
        .filter((cs) => cs.section_id === section)
        .map((cs) => cs.cluster_id),
    );
    clusters = clusters.filter((c) => sectionClusterIds.has(c.id));
  }

  // Sort by published_at descending
  clusters.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

  // Build items
  const items: RssItem[] = clusters.slice(0, limit).map((cluster) => {
    const sources = snapshot.story_sources.filter((ss) => ss.cluster_id === cluster.id);
    const sourceNames = sources.map((s) => s.source_id).join(', ');
    const firstSource = sources[0];
    const link = `${siteOrigin}/story/${cluster.slug}`;
    const guid = cluster.slug;
    const pubDate = firstSource?.published_at ?? cluster.published_at;
    const excerpt = firstSource?.headline ?? cluster.canonical_headline;

    return {
      title: truncate(excerpt, 100),
      link,
      guid,
      pubDate: new Date(pubDate).toUTCString(),
      description: excerpt,
      sources: sources.map((s) => s.source_id),
    };
  });

  // Build XML
  const now = new Date().toUTCString();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
  xml += `  <channel>\n`;
  xml += `    <title>${escXml(feedTitle)}</title>\n`;
  xml += `    <link>${escXml(siteOrigin)}</link>\n`;
  xml += `    <description>${escXml(feedDescription)}</description>\n`;
  xml += `    <language>en</language>\n`;
  xml += `    <lastBuildDate>${now}</lastBuildDate>\n`;
  const selfLink = `${siteOrigin}/rss.xml`;
  xml += `    <atom:link href="${escXml(selfLink)}" rel="self" type="application/rss+xml" />\n`;

  for (const item of items) {
    xml += `    <item>\n`;
    xml += `      <title>${escXml(item.title)}</title>\n`;
    xml += `      <link>${escXml(item.link)}</link>\n`;
    xml += `      <guid isPermaLink="true">${escXml(item.guid)}</guid>\n`;
    xml += `      <pubDate>${item.pubDate}</pubDate>\n`;
    xml += `      <description>${escXml(item.description)}</description>\n`;
    xml += `      <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${escXml(item.sources.join(', '))}</dc:creator>\n`;
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n`;
  xml += `</rss>`;
  return xml;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
