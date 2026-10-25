import { SITE_ORIGIN } from '../../../../shared/config/site.js';

export function GET(): Response {
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /search?
Disallow: /*?page=
Disallow: /*?sort=
Disallow: /*?filter=

User-agent: Googlebot-News
Allow: /
Disallow: /api/

Sitemap: ${SITE_ORIGIN}/sitemap-index.xml`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
}