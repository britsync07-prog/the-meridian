/**
 * The single source for the publication's identity.
 *
 * D-12: the site name is locked. It feeds `<news:name>`, the masthead, the Open
 * Graph template and the repository name, and a mismatch against news.google.com
 * silently kills Google News inclusion. It therefore lives here and nowhere else.
 *
 * Every runtime reads this module by RELATIVE path. The `@shared/*` TypeScript
 * alias exists for `tsc` and the editor only — no bundler resolves it.
 */

/** The locked publication name. Never duplicated, never reworded. */
export const SITE_NAME = 'The Meridian';

/**
 * The canonical origin. A placeholder until a domain exists (D-10): the site is
 * built and run on a `workers.dev` subdomain, and the migration to a custom domain
 * happens later with 301 redirects, never with canonicals (D-14).
 */
export const SITE_ORIGIN = 'https://meridian-worker.mehedy303.workers.dev';

/** The default document language for the English editions. */
export const SITE_LOCALE = 'en';

/**
 * The fetch identity sent to every publisher. It names the aggregator, carries a
 * contact URL and a monitored address (ING-10), and is the one string used by both
 * the edge fetcher and the CI runner so the two are never distinguishable.
 */
export const USER_AGENT = `TheMeridianBot/1.0 (+${SITE_ORIGIN}/about#contact; newsroom@example.invalid)`;
