import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

import { SITE_NAME, SITE_ORIGIN } from '../../shared/config/site.ts';

/**
 * The Astro 7 configuration for the static tier.
 *
 * Every value below is load-bearing:
 *
 * - `compressHTML: true` — Astro 7's default is `'jsx'`, which strips whitespace
 *   between inline elements. `<span>hello</span> <em>world</em>` would render as
 *   `helloworld` inside a broadsheet headline or byline (DSN-12).
 * - `build.concurrency: 1` — any value above 1 silently disables
 *   `experimental.incrementalBuild` and Astro re-renders every page with a warning.
 * - `experimental.incrementalBuild: true` — added in astro@7.2.0. Only pages
 *   returned from `getStaticPaths()` carrying a `cacheKey` can be skipped.
 * - `cacheDir: './.astro-cache'` — the incremental cache is restored between CI
 *   runs, so it lives in one explicit directory rather than `node_modules/.astro`.
 * - `vite.server.fs.allow: ['../..']` — `shared/` sits ABOVE the Astro root.
 *   Without this the dev server refuses to serve `../../shared/*`.
 * - NO Cloudflare adapter. Astro 6+ removed Cloudflare Pages support from the
 *   official Cloudflare adapter; the site is pure static output deployed with
 *   `wrangler deploy`. The adapter package names are deliberately absent from
 *   this file so the configuration test can assert their absence from the raw
 *   source text.
 */
export default defineConfig({
  output: 'static',
  compressHTML: true,
  build: { concurrency: 1 },
  experimental: { incrementalBuild: true },
  cacheDir: process.env.ASTRO_CACHE_DIR ?? './.astro-cache',
  site: SITE_ORIGIN,
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: ['../..'] } },
    define: {
      'import.meta.env.SITE_NAME': JSON.stringify(SITE_NAME),
    },
  },
});
