import { SITE_ORIGIN } from '../../../../shared/config/site.ts';
import { getEditions, getSections, getAllStorySlugs, getArchiveDates } from '../lib/page-data.ts';

export function GET(): Response {
  const editions = getEditions();
  const sections = getSections();
  const storySlugs = getAllStorySlugs();
  const archiveDates = getArchiveDates();
  const urls: string[] = [SITE_ORIGIN];

  for (const e of editions) {
    urls.push(`${SITE_ORIGIN}/${e}/`, `${SITE_ORIGIN}/${e}/most-covered/`);
    for (const s of sections) urls.push(`${SITE_ORIGIN}/${e}/${s.id}/`);
    for (const d of archiveDates) urls.push(`${SITE_ORIGIN}/${e}/archive/${d}/`);
  }

  for (const slug of storySlugs) urls.push(`${SITE_ORIGIN}/story/${slug}/`);
  for (const s of sections) urls.push(`${SITE_ORIGIN}/topics/${s.id}/`);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } });
}
