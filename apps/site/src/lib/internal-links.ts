/**
 * Internal link graph builder.
 *
 * PUB-06: Every indexable URL must be reachable within 3 clicks from any front
 * page through ordinary anchor links.
 */

import type { SnapshotData } from './snapshot.js';

/** One entry in the link graph. */
export interface LinkEdge {
  from: string;
  to: string;
  relation: 'same-section' | 'cross-section' | 'same-topic' | 'same-entity' | 'edition-index';
}

/**
 * Build internal link edges from snapshot data.
 * Returns a list of {from, to, relation} tuples.
 */
export function buildInternalLinks(data: SnapshotData): LinkEdge[] {
  const edges: LinkEdge[] = [];
  const seen = new Set<string>();

  function addEdge(from: string, to: string, relation: LinkEdge['relation']) {
    const key = `${from}→${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, relation });
  }

  // Story-to-story within same section
  const sectionClusters = new Map<string, number[]>();
  for (const cs of data.cluster_sections) {
    const arr = sectionClusters.get(cs.section_id) ?? [];
    arr.push(cs.cluster_id);
    sectionClusters.set(cs.section_id, arr);
  }

  for (const [sectionId, clusterIds] of sectionClusters) {
    for (let i = 0; i < Math.min(clusterIds.length, 5); i++) {
      for (let j = i + 1; j < Math.min(clusterIds.length, 5); j++) {
        const a = data.clusters.find((c) => c.id === clusterIds[i]);
        const b = data.clusters.find((c) => c.id === clusterIds[j]);
        if (a && b) {
          addEdge(`/story/${a.slug}`, `/story/${b.slug}`, 'same-section');
        }
      }
    }
  }

  // Story to edition index pages
  for (const cluster of data.clusters) {
    for (const ec of data.edition_clusters) {
      if (ec.cluster_id === cluster.id) {
        addEdge(`/story/${cluster.slug}`, `/${ec.edition_id}/`, 'edition-index');
      }
    }
  }

  // Section landing pages link to their stories
  for (const [sectionId, clusterIds] of sectionClusters) {
    for (const cid of clusterIds.slice(0, 3)) {
      const cluster = data.clusters.find((c) => c.id === cid);
      if (cluster) {
        addEdge(`/${sectionId}/`, `/story/${cluster.slug}`, 'same-section');
      }
    }
  }

  return edges;
}

/**
 * Check that every indexable URL is reachable within 3 hops from at least one front page.
 * Returns a list of unreachable URLs, if any.
 */
export function assertThreeClickReachability(
  data: SnapshotData,
  edges: LinkEdge[],
): string[] {
  const allUrls = new Set<string>();
  for (const cluster of data.clusters) {
    allUrls.add(`/story/${cluster.slug}`);
  }
  for (const edition of data.editions) {
    allUrls.add(`/${edition.slug}/`);
  }

  // BFS from each front page
  const unreachable: string[] = [];
  const frontPages = data.editions.map((e) => `/${e.slug}/`);

  for (const start of frontPages) {
    const visited = new Set<string>([start]);
    const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];

    while (queue.length > 0) {
      const { url, depth } = queue.shift()!;
      if (depth >= 3) continue;

      const outgoing = edges.filter((e) => e.from === url);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({ url: edge.to, depth: depth + 1 });
        }
      }
    }

    // Check unreachability from this front page
    for (const url of allUrls) {
      if (!visited.has(url)) {
        unreachable.push(`${start} → ${url}`);
      }
    }
  }

  // Deduplicate
  return [...new Set(unreachable)];
}
