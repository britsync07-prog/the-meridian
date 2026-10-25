/**
 * Open Graph and Twitter card meta tag builder.
 *
 * Phase 6: All story and section pages emit OG/Twitter cards pointing at
 * their dynamic image. The image URL is content-addressed by sha256(source_url).
 */

import type { PageMeta } from '../types.js';
import { SITE_NAME } from '../config/site.js';

/**
 * Render Open Graph and Twitter card tags from page metadata.
 */
export function renderOpenGraph(meta: PageMeta): string {
  const lines: string[] = [];

  // Open Graph
  lines.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
  lines.push(`<meta property="og:description" content="${escapeHtml(meta.description)}" />`);
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
  lines.push(`<meta property="og:locale" content="${meta.htmlLang}" />`);
  lines.push(`<meta property="og:site_name" content="${SITE_NAME}" />`);

  // Twitter card
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);

  // hreflang alternates as xhtml:link for OG
  for (const alt of meta.alternates) {
    lines.push(
      `<link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${escapeHtml(alt.href)}" />`,
    );
  }

  return lines.join('\n');
}

/**
 * Render story-specific Open Graph with dynamic image.
 */
export function renderStoryOpenGraph(
  meta: PageMeta,
  imageUrl: string,
  imageWidth: number = 1200,
  imageHeight: number = 630,
): string {
  const lines: string[] = [];

  // Open Graph
  lines.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
  lines.push(`<meta property="og:description" content="${escapeHtml(meta.description)}" />`);
  lines.push(`<meta property="og:type" content="article" />`);
  lines.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
  lines.push(`<meta property="og:locale" content="${meta.htmlLang}" />`);
  lines.push(`<meta property="og:site_name" content="${SITE_NAME}" />`);
  lines.push(`<meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
  lines.push(`<meta property="og:image:width" content="${imageWidth}" />`);
  lines.push(`<meta property="og:image:height" content="${imageHeight}" />`);

  // Twitter card
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`);
  lines.push(`<meta name="twitter:image:width" content="${imageWidth}" />`);
  lines.push(`<meta name="twitter:image:height" content="${imageHeight}" />`);

  // hreflang alternates
  for (const alt of meta.alternates) {
    lines.push(
      `<link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${escapeHtml(alt.href)}" />`,
    );
  }

  return lines.join('\n');
}

/**
 * Render section listing Open Graph.
 */
export function renderSectionOpenGraph(
  meta: PageMeta,
  imageUrl: string,
  imageWidth: number = 1200,
  imageHeight: number = 630,
): string {
  const lines: string[] = [];

  lines.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
  lines.push(`<meta property="og:description" content="${escapeHtml(meta.description)}" />`);
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
  lines.push(`<meta property="og:locale" content="${meta.htmlLang}" />`);
  lines.push(`<meta property="og:site_name" content="${SITE_NAME}" />`);
  lines.push(`<meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
  lines.push(`<meta property="og:image:width" content="${imageWidth}" />`);
  lines.push(`<meta property="og:image:height" content="${imageHeight}" />`);

  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`);

  for (const alt of meta.alternates) {
    lines.push(
      `<link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${escapeHtml(alt.href)}" />`,
    );
  }

  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}