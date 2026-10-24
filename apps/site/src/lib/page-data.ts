/**
 * Page data layer for static generation.
 *
 * Returns plain objects/Maps (no Astro imports) so it can be unit-tested in
 * isolation and reused by both the Astro pages and the sitemap generator.
 */
import type { EditionId, SectionId } from '../../../../shared/config/editions.ts';
import { EDITIONS, SECTIONS } from '../../../../shared/config/editions.ts';
import { SITE_ORIGIN } from '../../../../shared/config/site.ts';

export interface PageCluster {
  id: number;
  slug: string;
  canonicalHeadline: string;
  publishedAt: string;
  isProminent: boolean;
  trendingScore: number;
  coverageCount: number;
  editorialRank: number | null;
}

export interface PageSource {
  clusterId: number;
  sourceId: string;
  rank: number;
  headline: string;
  url: string;
  publishedAt: string;
}

export interface PageStory {
  cluster: PageCluster;
  sources: PageSource[];
  section?: SectionId;
  edition?: EditionId;
}

export interface FrontPageData {
  edition: EditionId;
  date: string;
  leadStory: PageStory | null;
  secondaryStories: PageStory[];
  sectionStories: Map<SectionId, PageStory[]>;
  mostCovered: PageStory[];
  editorPicks: PageStory[];
}

export interface SectionPageData {
  edition: EditionId;
  section: SectionId;
  sectionName: string;
  leadStory: PageStory | null;
  stories: PageStory[];
  mostCoveredInSection: PageStory[];
}

export interface StoryPageData {
  slug: string;
  cluster: PageCluster;
  sources: PageSource[];
  section: SectionId;
  sectionName: string;
  topics: string[];
  entities: string[];
  relatedStories: PageStory[];
}

const SAMPLE_STORIES: PageStory[] = [
  {
    cluster: { id: 1, slug: 'uk-parliament-budget-debate', canonicalHeadline: 'Parliament Debates New Budget Measures', publishedAt: '2026-10-24T08:00:00Z', isProminent: true, trendingScore: 12.5, coverageCount: 5, editorialRank: 1 },
    sources: [
      { clusterId: 1, sourceId: 'bbc', rank: 1, headline: 'Budget debate begins', url: 'https://bbc.co.uk/news', publishedAt: '2026-10-24T08:00:00Z' },
      { clusterId: 1, sourceId: 'guardian', rank: 2, headline: 'PM faces questions on spending', url: 'https://theguardian.com/politics', publishedAt: '2026-10-24T07:30:00Z' },
    ],
    section: 'politics', edition: 'uk'
  },
  {
    cluster: { id: 2, slug: 'tech-ai-regulation-summit', canonicalHeadline: 'Global AI Regulation Summit Concludes', publishedAt: '2026-10-24T06:00:00Z', isProminent: false, trendingScore: 10.2, coverageCount: 4, editorialRank: 2 },
    sources: [
      { clusterId: 2, sourceId: 'reuters', rank: 1, headline: 'AI summit wraps with new accord', url: 'https://reuters.com', publishedAt: '2026-10-24T06:00:00Z' },
    ],
    section: 'technology', edition: 'us'
  },
  {
    cluster: { id: 3, slug: 'cricket-world-cup-final', canonicalHeadline: 'Cricket World Cup Final Draws Record Viewership', publishedAt: '2026-10-23T18:00:00Z', isProminent: false, trendingScore: 9.8, coverageCount: 6, editorialRank: 3 },
    sources: [], section: 'sport', edition: 'in'
  },
  {
    cluster: { id: 4, slug: 'us-economy-inflation-data', canonicalHeadline: 'US Inflation Data Shows Unexpected Rise', publishedAt: '2026-10-24T05:00:00Z', isProminent: true, trendingScore: 11.0, coverageCount: 3, editorialRank: null },
    sources: [
      { clusterId: 4, sourceId: 'wsj', rank: 1, headline: 'Inflation rises above expectations', url: 'https://wsj.com', publishedAt: '2026-10-24T05:00:00Z' },
    ],
    section: 'business', edition: 'us'
  },
  {
    cluster: { id: 5, slug: 'australia-bushfire-warning', canonicalHeadline: 'Bushfire Warning Issued for New South Wales', publishedAt: '2026-10-24T02:00:00Z', isProminent: false, trendingScore: 8.5, coverageCount: 2, editorialRank: null },
    sources: [
      { clusterId: 5, sourceId: 'abc-au', rank: 1, headline: 'Fire danger extreme across NSW', url: 'https://abc.net.au', publishedAt: '2026-10-24T02:00:00Z' },
    ],
    section: 'weather', edition: 'au'
  },
  {
    cluster: { id: 6, slug: 'canada-healthcare-funding', canonicalHeadline: 'Federal Budget Allocates $2B for Healthcare', publishedAt: '2026-10-24T09:00:00Z', isProminent: true, trendingScore: 13.0, coverageCount: 7, editorialRank: 1 },
    sources: [
      { clusterId: 6, sourceId: 'cbc', rank: 1, headline: 'Healthcare funding announced', url: 'https://cbc.ca', publishedAt: '2026-10-24T09:00:00Z' },
      { clusterId: 6, sourceId: 'globe', rank: 2, headline: 'Budget 2026 details', url: 'https://globeandmail.com', publishedAt: '2026-10-24T09:15:00Z' },
    ],
    section: 'health', edition: 'ca'
  },
  {
    cluster: { id: 7, slug: 'election-results-projection', canonicalHeadline: 'Exit Polls Project Tight Race in Key Constituencies', publishedAt: '2026-10-24T07:00:00Z', isProminent: false, trendingScore: 14.0, coverageCount: 8, editorialRank: 1 },
    sources: [
      { clusterId: 7, sourceId: 'ndtv', rank: 1, headline: 'Vote counting underway', url: 'https://ndtv.com', publishedAt: '2026-10-24T07:00:00Z' },
    ],
    section: 'politics', edition: 'in'
  },
  {
    cluster: { id: 8, slug: 'wall-street-tech-earnings', canonicalHeadline: 'Big Tech Earnings Beat Expectations Despite Market Jitters', publishedAt: '2026-10-24T04:00:00Z', isProminent: false, trendingScore: 9.2, coverageCount: 6, editorialRank: 2 },
    sources: [
      { clusterId: 8, sourceId: 'cnbc', rank: 1, headline: 'Tech stocks rally after hours', url: 'https://cnbc.com', publishedAt: '2026-10-24T04:00:00Z' },
      { clusterId: 8, sourceId: 'reuters', rank: 2, headline: 'Earnings beat despite headwinds', url: 'https://reuters.com', publishedAt: '2026-10-24T04:15:00Z' },
    ],
    section: 'business', edition: 'us'
  },
  {
    cluster: { id: 9, slug: 'climate-change-summit-outcome', canonicalHeadline: 'Climate Summit Reaches Landmark Agreement on Carbon Targets', publishedAt: '2026-10-24T06:30:00Z', isProminent: false, trendingScore: 10.8, coverageCount: 9, editorialRank: null },
    sources: [
      { clusterId: 9, sourceId: 'guardian', rank: 1, headline: 'Historic climate deal struck', url: 'https://theguardian.com/environment', publishedAt: '2026-10-24T06:30:00Z' },
      { clusterId: 9, sourceId: 'bbc', rank: 2, headline: 'Global carbon pact signed', url: 'https://bbc.co.uk/news', publishedAt: '2026-10-24T06:45:00Z' },
      { clusterId: 9, sourceId: 'reuters', rank: 3, headline: 'World leaders commit to targets', url: 'https://reuters.com', publishedAt: '2026-10-24T06:50:00Z' },
    ],
    section: 'world', edition: 'uk'
  },
  {
    cluster: { id: 10, slug: 'australian-open-tennis-upset', canonicalHeadline: 'Top Seed Stuns in Australian Open Third Round', publishedAt: '2026-10-24T03:00:00Z', isProminent: false, trendingScore: 7.9, coverageCount: 4, editorialRank: null },
    sources: [
      { clusterId: 10, sourceId: 'abc-au', rank: 1, headline: 'Major upset at AO', url: 'https://abc.net.au/news', publishedAt: '2026-10-24T03:00:00Z' },
    ],
    section: 'sport', edition: 'au'
  },
  {
    cluster: { id: 11, slug: 'data-breach-credit-cards', canonicalHeadline: 'Major Retailer Faces Fallout From Data Breach Affecting Millions', publishedAt: '2026-10-24T04:30:00Z', isProminent: true, trendingScore: 15.3, coverageCount: 7, editorialRank: 1 },
    sources: [
      { clusterId: 11, sourceId: 'reuters', rank: 1, headline: 'Data breach exposes millions', url: 'https://reuters.com', publishedAt: '2026-10-24T04:30:00Z' },
    ],
    section: 'technology', edition: 'ca'
  },
  {
    cluster: { id: 12, slug: 'irish-property-market-cooling', canonicalHeadline: 'Irish Property Market Cools as Interest Rates Stay High', publishedAt: '2026-10-24T05:30:00Z', isProminent: false, trendingScore: 8.1, coverageCount: 3, editorialRank: 4 },
    sources: [
      { clusterId: 12, sourceId: 'irishtimes', rank: 1, headline: 'Property prices drop in Dublin', url: 'https://irishtimes.com', publishedAt: '2026-10-24T05:30:00Z' },
    ],
    section: 'business', edition: 'ie'
  },
];

export function getEditions(): string[] {
  return EDITIONS.map(e => e.id);
}

export function getSections(): { id: SectionId; name: string }[] {
  return SECTIONS.map(s => ({ id: s.id, name: s.name }));
}

export function getFrontPageData(edition: string): FrontPageData {
  const today = new Date().toISOString().split('T')[0];
  const editionId = edition as EditionId;
  const editionStories = SAMPLE_STORIES.filter(s => !s.edition || s.edition === editionId);
  const prominent = editionStories.filter(s => s.cluster.isProminent);

  const sectionStories = new Map<SectionId, PageStory[]>();
  for (const s of SECTIONS) {
    sectionStories.set(s.id, editionStories.filter(st => st.section === s.id));
  }

  return {
    edition: editionId,
    date: today,
    leadStory: prominent[0] || editionStories[0] || null,
    secondaryStories: editionStories.filter(s => s.cluster.coverageCount >= 2).slice(0, 6),
    sectionStories,
    mostCovered: [...editionStories].sort((a, b) => b.cluster.coverageCount - a.cluster.coverageCount).slice(0, 10),
    editorPicks: editionStories
      .filter(s => s.cluster.editorialRank !== null && s.cluster.editorialRank !== undefined && s.cluster.editorialRank <= 3)
      .slice(0, 5),
  };
}

export function getSectionPageData(edition: string, section: string): SectionPageData {
  const stories = SAMPLE_STORIES.filter(s => s.section === section && (!s.edition || s.edition === edition));
  const sectionName = SECTIONS.find(s => s.id === section as SectionId)?.name ?? section;

  if (stories.length === 0) {
    return {
      edition: edition as EditionId,
      section: section as SectionId,
      sectionName,
      leadStory: null,
      stories: [],
      mostCoveredInSection: [],
    };
  }

  const leadStory = stories.find(s => s.cluster.isProminent) ?? stories[0] ?? null;
  const rest = stories.filter(s => s !== leadStory);
  const sectionName = SECTIONS.find(s => s.id === section as SectionId)?.name ?? section;

  const mostCoveredInSection = [...stories]
    .sort((a, b) => b.cluster.coverageCount - a.cluster.coverageCount)
    .slice(0, 3);

  return {
    edition: edition as EditionId,
    section: section as SectionId,
    sectionName,
    leadStory,
    stories: rest,
    mostCoveredInSection,
  };
}

export function getStoryPageData(slug: string): StoryPageData | null {
  const story = SAMPLE_STORIES.find(s => s.cluster.slug === slug);
  if (!story) return null;

  const allStories = SAMPLE_STORIES.filter(s => s.section === story.section);
  const sectionName = SECTIONS.find(s => s.id === story.section!)?.name ?? '';
  const relatedStories = allStories.filter(s => s.cluster.slug !== slug).slice(0, 5);

  return {
    slug,
    cluster: story.cluster,
    sources: story.sources,
    section: story.section!,
    sectionName,
    topics: [story.section ?? 'news'],
    entities: story.sources.map(s => s.sourceId),
    relatedStories,
  };
}

export function getAllStorySlugs(): string[] {
  return SAMPLE_STORIES.map(s => s.cluster.slug);
}

export function getAllSectionPaths(): { edition: string; section: string }[] {
  const r: { edition: string; section: string }[] = [];
  for (const e of EDITIONS) {
    for (const s of SECTIONS) {
      r.push({ edition: e.id, section: s.id });
    }
  }
  return r;
}

export function getArchiveDates(): string[] {
  // Generate 7 days ending today
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function getArchivePaths(): { edition: string; date: string }[] {
  const r: { edition: string; date: string }[] = [];
  for (const e of EDITIONS) {
    for (const d of getArchiveDates()) {
      r.push({ edition: e.id, date: d });
    }
  }
  return r;
}
