/**
 * Writes Phase 5 dynamic Astro page files to disk using fs.writeFileSync.
 * Bracketed directories like [edition] require writeFileSync, not the Write tool.
 */
import fs from 'node:fs';
import path from 'node:path';

const base = 'D:/myapps/newsportal';
const siteRoot = path.join(base, 'apps/site/src');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(relPath, content) {
  const fullPath = path.join(siteRoot, relPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`wrote ${relPath}`);
}

// ============================================================================
// 1. lib/page-data.ts
// ============================================================================
writeFile('lib/page-data.ts', `/**
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
    cluster: { id: 6, slug: 'canada-healthcare-funding', canonicalHeadline: 'Federal Budget Allocates \$2B for Healthcare', publishedAt: '2026-10-24T09:00:00Z', isProminent: true, trendingScore: 13.0, coverageCount: 7, editorialRank: 1 },
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

export function getSectionPageData(edition: string, section: string): SectionPageData | null {
  const stories = SAMPLE_STORIES.filter(s => s.section === section && (!s.edition || s.edition === edition));
  if (stories.length === 0) return null;

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
`);

// ============================================================================
// 2. Components
// ============================================================================

// LeadStory.astro
writeFile('components/LeadStory.astro', `---
import type { PageStory } from '../lib/page-data.ts';
import MediaImage from './MediaImage.astro';

interface Props {
  story: PageStory;
  edition: string;
}

const { story, edition } = Astro.props;
const { cluster, sources } = story;
const publishedDate = new Date(cluster.publishedAt).toISOString().split('T')[0];
---

<article class="grid-column-span-5 mb-8">
  <MediaImage
    src="/images/lead-placeholder.jpg"
    alt={cluster.canonicalHeadline}
    width={800}
    height={450}
    priority={true}
    class="w-full h-auto object-cover rounded-lg mb-4"
  />
  <h1 class="font-masthead text-h1 font-bold italic mb-3">
    <a href={\`/story/\${cluster.slug}/\`} class="text-ink no-underline hover:text-accent">
      {cluster.canonicalHeadline}
    </a>
  </h1>
  <p class="text-deck text-muted mb-4 max-w-3xl">
    This is the leading story for the {edition.toUpperCase()} edition. {sources.length} source{sources.length !== 1 ? 's are' : ' is'} covering this development.
  </p>
  <div class="flex flex-wrap gap-4 text-caption text-muted">
    <time datetime={publishedDate}>{publishedDate}</time>
    <span>Edition: {edition.toUpperCase()}</span>
    {cluster.coverageCount > 0 && (
      <span>{cluster.coverageCount} outlet{cluster.coverageCount > 1 ? 's' : ''} covering</span>
    )}
  </div>
</article>
`);

// StoryItem.astro
writeFile('components/StoryItem.astro', `---
import type { PageStory } from '../lib/page-data.ts';

interface Props {
  story: PageStory;
  edition: string;
  isSecondary?: boolean;
}

const { story, edition, isSecondary = false } = Astro.props;
const { cluster, sources } = story;
const publishedDate = new Date(cluster.publishedAt).toISOString().split('T')[0];
const primarySource = sources[0];
---

<article class={\`border-b hairline pb-4 \${isSecondary ? 'mb-4' : 'mb-6'}\`}>
  <h3 class={\`font-masthead text-h2 font-bold italic mb-1 \${isSecondary ? 'text-base' : 'text-lg'}\`}>
    <a href={\`/story/\${cluster.slug}/\`} class="text-ink no-underline hover:text-accent">
      {cluster.canonicalHeadline}
    </a>
  </h3>
  {primarySource && (
    <p class="text-caption text-muted mb-1">
      {primarySource.sourceId} &middot; <time datetime={publishedDate}>{publishedDate}</time>
    </p>
  )}
  <p class="text-deck text-muted mb-2">
    A developing story with {cluster.coverageCount} coverage{cluster.coverageCount > 1 ? 's' : ''}.
  </p>
  {cluster.trendingScore > 9 && (
    <span class="inline-block text-caption font-medium text-accent bg-accent/10 px-2 py-0.5 rounded">
      Trending
    </span>
  )}
</article>
`);

// MostCovered.astro
writeFile('components/MostCovered.astro', `---
import type { PageStory } from '../lib/page-data.ts';
import StoryItem from './StoryItem.astro';

interface Props {
  stories: PageStory[];
  title: string;
  edition: string;
}

const { stories, title, edition } = Astro.props;
---

<aside class="mb-8">
  <h2 class="font-masthead text-h2 font-bold italic mb-4 border-b hairline pb-2">
    {title}
  </h2>
  <div class="space-y-4">
    {stories.map(story => (
      <StoryItem story={story} edition={edition} isSecondary={true} />
    ))}
  </div>
</aside>
`);

// EditorPicks.astro
writeFile('components/EditorPicks.astro', `---
import type { PageStory } from '../lib/page-data.ts';
import StoryItem from './StoryItem.astro';

interface Props {
  stories: PageStory[];
  edition: string;
}

const { stories, edition } = Astro.props;
---

<aside class="mb-8">
  <h2 class="font-masthead text-h2 font-bold italic mb-4 border-b hairline pb-2">
    Editor&rsquo;s Picks
  </h2>
  <div class="space-y-4">
    {stories.map(story => (
      <StoryItem story={story} edition={edition} isSecondary={true} />
    ))}
  </div>
</aside>
`);

// SectionGrid.astro
writeFile('components/SectionGrid.astro', `---
import type { FrontPageData } from '../lib/page-data.ts';
import StoryItem from './StoryItem.astro';

interface Props {
  data: FrontPageData;
}

const { data } = Astro.props;
const { sectionStories, edition } = data;
const entries = Array.from(sectionStories.entries()).filter(([, stories]) => stories.length > 0);
---

<div class="front-grid">
  {entries.slice(0, Math.ceil(entries.length / 2)).map(([section, stories]) => {
    const sectionName = stories[0]?.section ?? section;
    return (
      <div class="section-split-left" key={section}>
        <h2 class="font-masthead text-h2 font-bold italic mb-3 border-b hairline pb-1 capitalize">
          {sectionName}
        </h2>
        <div class="space-y-3">
          {stories.slice(0, 3).map(story => (
            <StoryItem story={story} edition={edition} />
          ))}
        </div>
      </div>
    );
  })}
  {entries.slice(Math.ceil(entries.length / 2)).map(([section, stories]) => {
    const sectionName = stories[0]?.section ?? section;
    return (
      <div class="section-split-right" key={section}>
        <h2 class="font-masthead text-h2 font-bold italic mb-3 border-b hairline pb-1 capitalize">
          {sectionName}
        </h2>
        <div class="space-y-3">
          {stories.slice(0, 2).map(story => (
            <StoryItem story={story} edition={edition} />
          ))}
        </div>
      </div>
    );
  })}
</div>
`);

// StoryList.astro
writeFile('components/StoryList.astro', `---
import type { PageStory } from '../lib/page-data.ts';
import StoryItem from './StoryItem.astro';

interface Props {
  stories: PageStory[];
  edition: string;
  showSecondary?: boolean;
}

const { stories, edition, showSecondary = true } = Astro.props;
---

<div class="space-y-6">
  {stories.map(story => (
    <StoryItem story={story} edition={edition} isSecondary={showSecondary} />
  ))}
</div>
`);

// MediaImage.astro
writeFile('components/MediaImage.astro', `---
interface Props {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  class?: string;
}

const { src, alt, width, height, priority = false, class: className = '' } = Astro.props;
---

<img
  src={src}
  alt={alt}
  width={width}
  height={height}
  loading={priority ? 'eager' : 'lazy'}
  fetchpriority={priority ? 'high' : 'low'}
  class={className}
/>
`);

// ============================================================================
// 3. Dynamic pages
// ============================================================================

// [edition]/index.astro
writeFile('pages/[edition]/index.astro', `---
import FrontLayout from '../../layouts/FrontLayout.astro';
import LeadStory from '../../components/LeadStory.astro';
import MostCovered from '../../components/MostCovered.astro';
import EditorPicks from '../../components/EditorPicks.astro';
import SectionGrid from '../../components/SectionGrid.astro';
import { getFrontPageData, getEditions } from '../../lib/page-data.ts';

export function getStaticPaths() {
  return getEditions().map(e => ({
    params: { edition: e },
    props: { edition: e }
  }));
}

interface Props {
  edition: string;
}

const { edition } = Astro.props;
const data = getFrontPageData(edition);
const today = data.date;
---
<FrontLayout edition={edition} date={today}>
  {data.leadStory && <LeadStory story={data.leadStory} edition={edition} />}
  <SectionGrid data={data} />
  <hr class="hairline my-6" />
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <MostCovered stories={data.mostCovered} title={\`Most Covered in \${edition.toUpperCase()}\`} edition={edition} />
    {data.editorPicks.length > 0 && <EditorPicks stories={data.editorPicks} edition={edition} />}
  </div>
</FrontLayout>
`);

// [edition]/[section]/index.astro
writeFile('pages/[edition]/[section]/index.astro', `---
import SectionLayout from '../../layouts/SectionLayout.astro';
import StoryList from '../../components/StoryList.astro';
import StoryItem from '../../components/StoryItem.astro';
import { getSectionPageData, getEditions, getSections } from '../../lib/page-data.ts';

export function getStaticPaths() {
  const paths: Array<{ params: { edition: string; section: string }; props: { edition: string; section: string } }> = [];
  for (const e of getEditions()) {
    for (const s of getSections()) {
      paths.push({
        params: { edition: e, section: s.id },
        props: { edition: e, section: s.id }
      });
    }
  }
  return paths;
}

interface Props {
  edition: string;
  section: string;
}

const { edition, section } = Astro.props;
const data = getSectionPageData(edition, section);

if (!data) {
  throw new Error(\`No data for edition=\${edition} section=\${section}\`);
}

const today = new Date().toISOString().split('T')[0];
---
<SectionLayout edition={edition} sectionName={data.sectionName} date={today}>
  <div name="splash" class="mb-6">
    {data.leadStory && (
      <StoryItem story={data.leadStory} edition={edition} />
    )}
  </div>
  <div name="story-list" class="mt-6">
    <h2 class="font-masthead text-h2 font-bold italic mb-4 border-b hairline pb-2 capitalize">
      {data.sectionName}
    </h2>
    <StoryList stories={data.stories} edition={edition} />
  </div>
  {data.mostCoveredInSection.length > 0 && (
    <aside class="mt-8">
      <h3 class="font-masthead text-h2 font-bold italic mb-3 border-b hairline pb-1">Most Covered</h3>
      <StoryList stories={data.mostCoveredInSection} edition={edition} showSecondary={true} />
    </aside>
  )}
</SectionLayout>
`);

// story/[slug]/index.astro
writeFile('pages/story/[slug]/index.astro', `---
import StoryLayout from '../../layouts/StoryLayout.astro';
import StoryList from '../../components/StoryList.astro';
import { getStoryPageData, getAllStorySlugs } from '../../lib/page-data.ts';

export function getStaticPaths() {
  return getAllStorySlugs().map(slug => ({
    params: { slug },
    props: { slug }
  }));
}

interface Props {
  slug: string;
}

const { slug } = Astro.props;
const data = getStoryPageData(slug);

if (!data) {
  throw new Error(\`Story not found: \${slug}\`);
}

const today = new Date().toISOString().split('T')[0];
const publishedDate = new Date(data.cluster.publishedAt).toISOString().split('T')[0];
---
<StoryLayout storyTitle={data.cluster.canonicalHeadline} edition={data.section} date={today}>
  <div name="body" class="mb-8">
    <div class="flex flex-wrap gap-4 text-caption text-muted mb-6">
      <span>Section: {data.sectionName}</span>
      <time datetime={publishedDate}>Published: {publishedDate}</time>
      {data.cluster.coverageCount > 0 && (
        <span>{data.cluster.coverageCount} outlet{data.cluster.coverageCount > 1 ? 's' : ''} covering</span>
      )}
      {data.cluster.trendingScore > 9 && (
        <span class="text-accent font-medium">Trending ({data.cluster.trendingScore.toFixed(1)})</span>
      )}
    </div>

    <div class="prose lg:prose-xl max-w-none">
      <p class="text-deck text-muted mb-6">
        {data.cluster.canonicalHeadline}
      </p>

      <h2 class="font-masthead text-h2 font-bold italic mb-3">Key Points</h2>
      <ul class="mb-6">
        <li>Development trending with score {data.cluster.trendingScore.toFixed(1)}</li>
        <li>Editorial rank: {data.cluster.editorialRank ?? 'Unranked'}</li>
        <li>Topics: {data.topics.join(', ')}</li>
      </ul>

      <h2 class="font-masthead text-h2 font-bold italic mb-3">Coverage Sources</h2>
      <ul class="mb-6">
        {data.sources.map(source => (
          <li key={\`\${source.sourceId}-\${source.rank}\`} class="mb-2">
            <a href={source.url} class="text-ink no-underline hover:text-accent" target="_blank" rel="noopener noreferrer">
              {source.sourceId} &mdash; {source.headline}
            </a>
            <span class="text-caption text-muted"> (Rank {source.rank})</span>
          </li>
        ))}
      </ul>

      <h2 class="font-masthead text-h2 font-bold italic mb-3">Entities Mentioned</h2>
      <p class="text-deck text-muted mb-6">
        {data.entities.join(', ') || 'No entities identified'}
      </p>

      <div class="mt-8">
        <StoryList stories={data.relatedStories} edition={data.section} />
      </div>
    </div>
  </div>
</StoryLayout>
`);

// [edition]/archive/[date]/index.astro
writeFile('pages/[edition]/archive/[date]/index.astro', `---
import ArchiveLayout from '../../../layouts/ArchiveLayout.astro';
import StoryList from '../../../components/StoryList.astro';
import { getFrontPageData, getEditions, getArchiveDates } from '../../../lib/page-data.ts';

export function getStaticPaths() {
  const paths: Array<{ params: { edition: string; date: string }; props: { edition: string; date: string } }> = [];
  for (const e of getEditions()) {
    for (const d of getArchiveDates()) {
      paths.push({
        params: { edition: e, date: d },
        props: { edition: e, date: d }
      });
    }
  }
  return paths;
}

interface Props {
  edition: string;
  date: string;
}

const { edition, date } = Astro.props;
const data = getFrontPageData(edition);
const storiesForArchive = data.leadStory
  ? [data.leadStory, ...data.secondaryStories]
  : data.secondaryStories;
---
<ArchiveLayout edition={edition} archiveDate={date} date={date}>
  <div name="story-list" class="mt-6">
    <StoryList stories={storiesForArchive} edition={edition} />
  </div>
</ArchiveLayout>
`);

// topics/[slug]/index.astro
writeFile('pages/topics/[slug]/index.astro', `---
import TopicEntityLayout from '../../layouts/TopicEntityLayout.astro';
import StoryItem from '../../components/StoryItem.astro';
import { getAllStorySlugs, getStoryPageData } from '../../lib/page-data.ts';

export function getStaticPaths() {
  const topics = ['politics', 'business', 'technology', 'sport', 'health', 'world', 'weather', 'entertainment'];
  return topics.map(topic => ({
    params: { slug: topic },
    props: { slug: topic }
  }));
}

interface Props {
  slug: string;
}

const { slug } = Astro.props;

// Collect stories matching the topic
const allSlugs = getAllStorySlugs();
const topicStories = allSlugs
  .map(s => getStoryPageData(s))
  .filter((s): s is NonNullable<typeof s> => s !== null)
  .filter(s => s.section === slug as any);

const topicName = slug.charAt(0).toUpperCase() + slug.slice(1);
const today = new Date().toISOString().split('T')[0];
---
{topicStories.length >= 5 ? (
  <TopicEntityLayout edition={topicStories[0]?.section ?? 'uk'} topicName={topicName} date={today}>
    <div name="story-list" class="mt-6">
      <h2 class="font-masthead text-h2 font-bold italic mb-4 border-b hairline pb-2">
        Stories tagged: {topicName}
      </h2>
      <div class="space-y-6">
        {topicStories.map(story => (
          <StoryItem
            story={{
              cluster: story.cluster,
              sources: story.sources,
              section: story.section,
              edition: undefined
            }}
            edition={story.section}
            key={story.slug}
          />
        ))}
      </div>
    </div>
  </TopicEntityLayout>
) : (
  <p class="text-muted">Not enough stories found for this topic.</p>
)}
`);

// entities/[slug]/index.astro
writeFile('pages/entities/[slug]/index.astro', `---
import TopicEntityLayout from '../../layouts/TopicEntityLayout.astro';
import StoryItem from '../../components/StoryItem.astro';
import { getAllStorySlugs, getStoryPageData } from '../../lib/page-data.ts';

export function getStaticPaths() {
  const entities = ['bbc', 'guardian', 'reuters', 'wsj', 'abc-au', 'cnbc', 'cbc', 'globe', 'ndtv', 'irishtimes'];
  return entities.map(e => ({
    params: { slug: e },
    props: { slug: e }
  }));
}

interface Props {
  slug: string;
}

const { slug } = Astro.props;

// Collect stories from this entity
const allSlugs = getAllStorySlugs();
const entityStories = allSlugs
  .map(s => getStoryPageData(s))
  .filter((s): s is NonNullable<typeof s> => s !== null)
  .filter(s => s.entities.includes(slug));

const entityName = slug.charAt(0).toUpperCase() + slug.slice(1);
const today = new Date().toISOString().split('T')[0];
---
<TopicEntityLayout edition={entityStories[0]?.section ?? 'uk'} topicName={entityName} date={today}>
  <div name="story-list" class="mt-6">
    <h2 class="font-masthead text-h2 font-bold italic mb-4 border-b hairline pb-2">
      Stories from: {entityName}
    </h2>
    <div class="space-y-6">
      {entityStories.map(story => (
        <StoryItem
          story={{
            cluster: story.cluster,
            sources: story.sources,
            section: story.section,
            edition: undefined
          }}
          edition={story.section}
          key={story.slug}
        />
      ))}
    </div>
  </div>
</TopicEntityLayout>
`);

// [edition]/most-covered/index.astro
writeFile('pages/[edition]/most-covered/index.astro', `---
import FrontLayout from '../../layouts/FrontLayout.astro';
import MostCovered from '../../components/MostCovered.astro';
import { getFrontPageData, getEditions } from '../../lib/page-data.ts';

export function getStaticPaths() {
  return getEditions().map(e => ({
    params: { edition: e },
    props: { edition: e }
  }));
}

interface Props {
  edition: string;
}

const { edition } = Astro.props;
const data = getFrontPageData(edition);
const today = data.date;
---
<FrontLayout edition={edition} date={today}>
  <div class="mb-6">
    <h1 class="font-masthead text-h1 font-bold italic mb-4">Most Covered Stories</h1>
    <p class="text-deck text-muted mb-4">
      The most extensively covered stories in the {edition.toUpperCase()} edition, ranked by number of outlets.
    </p>
  </div>
  <MostCovered stories={data.mostCovered} title={\`Most Covered in \${edition.toUpperCase()}\`} edition={edition} />
</FrontLayout>
`);

// sitemap.xml.ts
writeFile('pages/sitemap.xml.ts', `---
import { SITE_ORIGIN } from '../../../shared/config/site.ts';
import { getEditions, getSections, getAllStorySlugs, getArchiveDates } from '../../lib/page-data.ts';

export async function GET(): Promise<Response> {
  const editions = getEditions();
  const sections = getSections();
  const storySlugs = getAllStorySlugs();
  const archiveDates = getArchiveDates();

  const urls: string[] = [];

  // Homepage
  urls.push(SITE_ORIGIN);

  // Edition front pages
  for (const e of editions) {
    urls.push(\`\${SITE_ORIGIN}/\${e}/\`);
    urls.push(\`\${SITE_ORIGIN}/\${e}/most-covered/\`);

    // Section pages
    for (const s of sections) {
      urls.push(\`\${SITE_ORIGIN}/\${e}/\${s.id}/\`);
    }

    // Archive pages
    for (const d of archiveDates) {
      urls.push(\`\${SITE_ORIGIN}/\${e}/archive/\${d}/\`);
    }
  }

  // Story pages
  for (const slug of storySlugs) {
    urls.push(\`\${SITE_ORIGIN}/story/\${slug}/\`);
  }

  // Topic pages
  for (const s of sections) {
    urls.push(\`\${SITE_ORIGIN}/topics/\${s.id}/\`);
  }

  // Entity pages will be added later when entity data is available.

  const sitemap = \`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
\${urls.map(url => \`  <url>
    <loc>\${url}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>\`).join('\\n')}
</urlset>
\`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml;charset=UTF-8',
    },
  });
}
---
`);

// robots.txt.ts
writeFile('pages/robots.txt.ts', `---
import { SITE_ORIGIN } from '../../../shared/config/site.ts';

export async function GET(): Promise<Response> {
  const robotsTxt = \`User-agent: *
Allow: /
Disallow: /api/

Sitemap: \${SITE_ORIGIN}/sitemap.xml
\`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
    },
  });
}
---
`);

console.log('All Phase 5 files written successfully.');
