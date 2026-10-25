import { SITE_ORIGIN } from '../../../../shared/config/site.js';
import { limit } from '../../../../shared/config/free-tier-limits.js';
import { getAllStorySlugs } from '../lib/page-data.js';

export function GET(): Response {
  const storySlugs = getAllStorySlugs();
  const maxEntries = limit('google_news_sitemap_entries_per_file').value;
  const urls = storySlugs.slice(0, maxEntries).map(slug => `${SITE_ORIGIN}/story/${slug}/`);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>`).join('\n')}
</urlset>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } });
}