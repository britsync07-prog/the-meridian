import type { EditionId, SectionId } from './config/editions';

export type { EditionId, SectionId };

/**
 * The canonical contract shared by the edge runtime and the Astro site.
 *
 * Every type is defined here and imported elsewhere — never redefined. The two
 * runtimes read the same shapes, so the story schema cannot drift between the
 * page that is pre-rendered into R2 and the page that is rendered statically.
 */

/** A normalised feed item, before any clustering. */
export interface RawItem {
  sourceId: string;
  externalGuid: string;
  canonicalUrl: string;
  title: string;
  description: string;
  author: string | null;
  publishedAt: string;
  imageUrl: string | null;
  sectionHint: SectionId | null;
}

/** A published excerpt, measured against the budget it had to satisfy. */
export interface StoryExcerpt {
  text: string;
  wordCount: number;
  charCount: number;
  sentenceCount: number;
  sourceShare: number;
}

/** The published unit: one event, one permanent URL, one canonical page. */
export interface Cluster {
  id: number;
  slug: string;
  canonicalHeadline: string;
  publishedAt: string;
  isProminent: boolean;
  trendingScore: number;
  coverageCount: number;
  editorialRank: number | null;
}

/** Which editions a cluster appears in. */
export interface EditionCluster {
  editionId: EditionId;
  clusterId: number;
}

/** The section a cluster was assigned to, and how that assignment was made. */
export interface SectionAssignment {
  clusterId: number;
  sectionId: SectionId;
  method: string;
  confidence: number;
}

/** One outlet's coverage of a cluster. The outlet list is kept permanently. */
export interface StorySource {
  clusterId: number;
  sourceId: string;
  rank: number;
  headline: string;
  url: string;
  publishedAt: string;
}

/** One hreflang alternate. Only the India English and India Hindi editions are linked. */
export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

/** The input to the page metadata builder. */
export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  edition: EditionId;
  alternates?: HreflangAlternate[];
}

/**
 * The output of the page metadata builder: title, description, self-referential
 * canonical, document language and the hreflang set.
 */
export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  htmlLang: string;
  alternates: HreflangAlternate[];
}

/** One record in the canonical feed source registry. */
export interface SourceRegistryEntry {
  slug: string;
  name: string;
  homepageUrl: string;
  feedUrl: string;
  countryCode: 'GB' | 'US' | 'AU' | 'CA' | 'IE' | 'NZ' | 'IN';
  language: 'en' | 'hi';
  defaultSection?: SectionId;
  sectionPrior: Partial<Record<SectionId, number>>;
  freshnessSlaHours: number; // 24 for wire/daily, 48 for regional
  isActive: boolean;
  termsStatus: 'verified' | 'unverified' | 'refused';
  termsVerifiedAt: string | null; // ISO YYYY-MM-DD
  verifiedBy: string | null;      // Auditor name or id
  termsUrl: string | null;        // Canonical terms URL
}

/** Operational log of a feed fetch attempt. */
export interface FeedFetchLog {
  sourceId: number;
  fetchedAt: string;
  httpStatus: number | null;
  bytes: number | null;
  itemCount: number | null;
  newItems: number | null;
  durationMs: number | null;
  error: string | null;
}

