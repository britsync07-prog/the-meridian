import { SITE_ORIGIN } from '../../../../shared/config/site.js';
import { getEditions, getSections, getArchiveDates, getAllSectionPaths } from '../lib/page-data.js';

export function GET(): Response {
  const editions = getEditions();
  const sections = getSections();
  const archiveDates = getArchiveDates();
  const sectionPaths = getAllSectionPaths();
  const urls: string[] = [SITE_ORIGIN];

  // Edition front pages and archives
  for (const e of editions) {
    urls.push(`${SITE_ORIGIN}/${e}/`);
    urls.push(`${SITE_ORIGIN}/${e}/most-covered/`);
    for (const d of archiveDates) {
      urls.push(`${SITE_ORIGIN}/${e}/archive/${d}/`);
    }
    urls.push(`${SITE_ORIGIN}/${e}/archive/most-covered/`);
  }

  // Section pages
  for (const sp of sectionPaths) {
    urls.push(`${SITE_ORIGIN}/${sp.edition}/${sp.section}/`);
    urls.push(`${SITE_ORIGIN}/${sp.edition}/${sp.section}/most-covered/`);
  }

  // Trust pages (per edition)
  const trustSlugs = ['about', 'editorial-policy', 'sourcing-methodology', 'corrections', 'contact', 'privacy', 'byline', 'sources'];
  for (const e of editions) {
    for (const slug of trustSlugs) {
      urls.push(`${SITE_ORIGIN}/${e}/trust/${slug}/`);
    }
  }

  // Digest pages
  for (const e of editions) {
    urls.push(`${SITE_ORIGIN}/${e}/digest/`);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } });
}