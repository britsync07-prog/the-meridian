/**
 * Schema.org JSON-LD builders.
 *
 * TRS-01–10: Structured data for NewsArticle, Organization, WebSite,
 * BreadcrumbList, ItemList, CollectionPage, Person.
 */

import type { PageMeta } from '../types.js';
import { SITE_NAME, SITE_ORIGIN } from '../config/site.js';

/** Base JSON-LD context. */
const CONTEXT = 'https://schema.org';

/**
 * Build NewsArticle schema for story pages.
 */
export function buildNewsArticleSchema(params: {
  headline: string;
  url: string;
  datePublished: string;
  dateModified: string;
  imageUrl: string;
  authorUrl: string;
  publisherName: string;
  publisherUrl: string;
  description: string;
  section: string;
  tags: string[];
}): object {
  return {
    '@context': CONTEXT,
    '@type': 'NewsArticle',
    headline: params.headline,
    url: params.url,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    image: {
      '@type': 'ImageObject',
      url: params.imageUrl,
      width: 1200,
      height: 630,
    },
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: params.authorUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: params.publisherName,
      url: params.publisherUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${params.publisherUrl}/favicon.ico`,
      },
    },
    description: params.description,
    articleSection: params.section,
    keywords: params.tags.join(', '),
    isAccessibleForFree: true,
  };
}

/**
 * Build Organization + WebSite schema (shared across all pages).
 */
export function buildOrganizationSchema(params: {
  name: string;
  url: string;
  logoUrl: string;
  sameAs: string[];
}): object {
  return {
    '@context': CONTEXT,
    '@type': ['Organization', 'WebSite'],
    name: params.name,
    alternateName: SITE_NAME,
    url: params.url,
    logo: params.logoUrl,
    sameAs: params.sameAs,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${params.url}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Build BreadcrumbList schema for listing pages.
 */
export function buildBreadcrumbSchema(items: Array<{ name: string; url: string }>): object {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build ItemList schema for "Most Covered" and similar modules.
 */
export function buildItemListSchema(params: {
  name: string;
  items: Array<{ name: string; url: string; position: number }>;
}): object {
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name: params.name,
    itemListElement: params.items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build CollectionPage schema for section/topic/entity listing pages.
 */
export function buildCollectionPageSchema(params: {
  name: string;
  url: string;
  description: string;
  imageUrl?: string;
}): object {
  return {
    '@context': CONTEXT,
    '@type': 'CollectionPage',
    name: params.name,
    url: params.url,
    description: params.description,
    image: params.imageUrl,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: 0, // Filled in by page data
    },
  };
}

/**
 * Build Person schema for editorial-desk byline page.
 */
export function buildPersonSchema(params: {
  name: string;
  url: string;
  worksFor: string;
  description: string;
  sameAs: string[];
}): object {
  return {
    '@context': CONTEXT,
    '@type': 'Person',
    name: params.name,
    url: params.url,
    worksFor: {
      '@type': 'Organization',
      name: params.worksFor,
    },
    description: params.description,
    sameAs: params.sameAs,
  };
}

/**
 * Render one or more schemas as a script tag.
 */
export function renderSchema(schemas: object | object[]): string {
  const arr = Array.isArray(schemas) ? schemas : [schemas];
  const json = JSON.stringify(arr.length === 1 ? arr[0] : arr);
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * Render multiple schemas as separate script tags (recommended for CSP).
 */
export function renderSchemas(schemas: object[]): string {
  return schemas.map((s) => renderSchema(s)).join('\n');
}