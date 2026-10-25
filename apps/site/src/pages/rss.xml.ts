/**
 * Global RSS feed route.
 *
 * PUB-09: One global RSS feed covering all editions.
 */
import type { APIRoute } from 'astro';
import { loadSnapshot } from '../lib/snapshot.js';
import { buildRssFeed } from '../lib/rss.js';
import { SITE_NAME } from '../../../../shared/config/site.js';

export const GET: APIRoute = async (_context) => {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return new Response(null, { status: 404 });
  }

  const rss = buildRssFeed(snapshot, {
    feedTitle: `${SITE_NAME} — Global`,
    feedDescription: `All stories from all ${SITE_NAME} editions`,
    siteOrigin: 'https://meridian.workers.dev',
  });

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
