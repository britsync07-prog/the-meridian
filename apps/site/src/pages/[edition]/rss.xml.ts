/**
 * Per-edition RSS feed route.
 *
 * PUB-09: One RSS feed per edition.
 */
import type { APIRoute } from 'astro';
import { loadSnapshot } from '../../lib/snapshot.js';
import { buildRssFeed } from '../../lib/rss.js';
import { EDITIONS } from '../../../../../shared/config/editions.js';
import { SITE_NAME } from '../../../../../shared/config/site.js';

export const getStaticPaths = async () => {
  const paths = EDITIONS.map((e) => ({
    params: { edition: e.slug },
    props: { edition: e.slug },
  }));
  return paths;
};

interface Props {
  edition: string;
}

export const get: APIRoute = async (context) => {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return new Response(null, { status: 404 });
  }

  const edition = context.params.edition!;
  const editionInfo = EDITIONS.find((e) => e.slug === edition);
  if (!editionInfo) {
    return new Response(null, { status: 404 });
  }

  const rss = buildRssFeed(snapshot, {
    edition,
    feedTitle: `${SITE_NAME} — ${editionInfo.countryName}`,
    feedDescription: `Latest stories from ${SITE_NAME} ${editionInfo.countryName} edition`,
    siteOrigin: 'https://meridian.workers.dev',
  });

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
