import { SITE_ORIGIN } from '../../../../shared/config/site.js';

export function GET(): Response {
  // Empty but valid structure - populated when v2 original-articles programme ships
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <!-- Original content sitemap - empty in v1, populated when v2 original-articles programme ships -->
</urlset>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } });
}