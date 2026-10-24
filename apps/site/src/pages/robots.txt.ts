import { SITE_ORIGIN } from '../../../../shared/config/site.js';

export function GET(): Response {
  const body = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
}
