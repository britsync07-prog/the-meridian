import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import astroConfig from '../astro.config.mjs';

/**
 * DSN-12: Astro 7 changed the default `compressHTML` from `true` to `'jsx'`, and the
 * JSX rules strip whitespace between inline elements. A broadsheet whose headlines
 * and bylines carry inline `<span>`, `<em>` and `<cite>` would silently lose the
 * spaces between the words. The configuration below is therefore asserted directly
 * rather than trusted to the framework's defaults.
 *
 * The built-HTML assertion in this file needs `npm run build` to have run first.
 * The repository deliberately carries no `pretest` hook, so the single `npm test`
 * script keeps exactly the script keys the plan mandates; run the build before the
 * suite when the built output is what you are checking.
 */

const SITE_ROOT = fileURLToPath(new URL('../', import.meta.url).href);
const CONFIG_PATH = join(SITE_ROOT, 'astro.config.mjs');
const BUILT_INDEX_PATH = join(SITE_ROOT, 'dist', 'index.html');

interface AstroConfigUnderTest {
  output?: string;
  compressHTML?: boolean | 'jsx';
  build?: { concurrency?: number };
  experimental?: { incrementalBuild?: boolean };
  vite?: { server?: { fs?: { allow?: string[] } } };
}

const config = astroConfig as AstroConfigUnderTest;

describe('the Astro 7 configuration (DSN-12)', () => {
  it('compresses HTML with the HTML-aware rules, never the JSX default', () => {
    expect(config.compressHTML).toBe(true);
    expect(config.compressHTML).not.toBe('jsx');
  });

  it('keeps build concurrency at 1 so incrementalBuild is not silently disabled', () => {
    expect(config.build?.concurrency).toBe(1);
    expect(config.experimental?.incrementalBuild).toBe(true);
  });

  it('emits static output', () => {
    expect(config.output).toBe('static');
  });

  it('lets Vite read the shared contract that sits above the Astro root', () => {
    expect(config.vite?.server?.fs?.allow).toContain('../..');
  });

  it('declares no Cloudflare adapter in the config source', () => {
    const source = readFileSync(CONFIG_PATH, 'utf8');
    expect(source).not.toContain('@astrojs/cloudflare');
    expect(source).not.toContain('@astrojs/pages');
  });

  it('wires Tailwind through the Vite plugin and sets compressHTML literally', () => {
    const source = readFileSync(CONFIG_PATH, 'utf8');
    expect(source).toContain('tailwindcss()');
    expect(source).toContain('compressHTML: true');
  });
});

describe('the built page (DSN-12 regression fixture)', () => {
  it.skipIf(!existsSync(BUILT_INDEX_PATH))(
    'preserves the space between two inline elements',
    () => {
      const html = readFileSync(BUILT_INDEX_PATH, 'utf8');
      expect(html).toContain('The Meridian');
      expect(html).not.toContain('TheMeridian');
    },
  );
});
