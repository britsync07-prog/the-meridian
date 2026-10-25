import { SITE_ORIGIN } from '../../../../shared/config/site.js';
import { getTopicPaths } from '../lib/page-data.js';

export function GET(): Response {
  const topicPaths = getTopicPaths();
  const urls = topicPaths.map(topic => `${SITE_ORIGIN}/topics/${topic}/`);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`).join('\n')}
</urlset>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } });
}