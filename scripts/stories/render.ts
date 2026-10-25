/**
 * Story page pre-rendering script.
 *
 * OPS-11: Pre-renders all story pages to HTML and uploads to R2.
 * Each story gets a permanent URL under /story/{slug}/ served by the edge Worker.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SnapshotData } from '../../apps/site/src/lib/snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

interface StoryRenderResult {
  slug: string;
  html: string;
}

/**
 * Render a single story page to HTML string.
 * Minimal valid HTML with proper structure for the story tier.
 */
function renderStoryPage(data: SnapshotData, slug: string): string | null {
  const cluster = data.clusters.find(c => c.slug === slug);
  if (!cluster) return null;

  const sources = data.story_sources.filter(s => s.cluster_id === cluster.id);
  const sectionAssignment = data.cluster_sections.find(cs => cs.cluster_id === cluster.id);
  const topics = data.cluster_topics
    .filter(ct => ct.cluster_id === cluster.id)
    .map(ct => data.topics.find(t => t.id === ct.topic_id)?.name ?? '')
    .filter(Boolean);
  const entities = data.cluster_entities
    .filter(ce => ce.cluster_id === cluster.id)
    .map(ce => data.entities.find(e => e.id === ce.entity_id)?.name ?? '')
    .filter(Boolean);

  const sectionName = sectionAssignment
    ? data.sections.find(s => s.id === sectionAssignment.section_id)?.name ?? 'General'
    : 'General';

  const publishedDate = new Date(cluster.published_at).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  // Build sources list HTML
  const sourcesHtml = sources.map(source => `
        <li class="mb-2">
          <a href="${source.url}" class="text-ink no-underline hover:text-accent" target="_blank" rel="noopener">
            ${source.source_id} &mdash; ${source.headline}
          </a>
          <span class="text-caption text-muted"> (Rank ${source.rank})</span>
        </li>`).join('\n');

  // Build metadata
  const description = sources.length > 0
    ? sources.map(s => s.headline).join(' | ').substring(0, 160)
    : cluster.canonical_headline;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${cluster.canonical_headline} | The Meridian</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${cluster.canonical_headline}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${publishedDate}">
  <meta property="article:section" content="${sectionName}">
  <link rel="canonical" href="https://meridian.news/story/${slug}/">
  <style>
    :root { --color-surface: oklch(98% 0 0); --color-text: oklch(18% 0 0); --color-accent: oklch(68% 0.21 250); --color-muted: oklch(60% 0 0); }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: var(--color-text); background: var(--color-surface); }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; border-bottom: 1px solid var(--color-muted); padding-bottom: 0.5rem; }
    .meta { color: var(--color-muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
    .deck { font-style: italic; color: var(--color-muted); margin-bottom: 2rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    a { color: inherit; text-decoration: none; }
    a:hover { color: var(--color-accent); }
    .trending { display: inline-block; background: var(--color-accent); color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--color-muted); font-size: 0.875rem; color: var(--color-muted); }
  </style>
</head>
<body>
  <article>
    <h1>${cluster.canonical_headline}</h1>
    <div class="meta">
      <time datetime="${publishedDate}">${publishedDate}</time>
      &middot; ${sectionName}
      ${cluster.outlet_count > 0 ? `&middot; ${cluster.outlet_count} outlet${cluster.outlet_count > 1 ? 's' : ''}` : ''}
      ${cluster.trending_score > 9 ? `&middot; <span class="trending">Trending (${cluster.trending_score.toFixed(1)})</span>` : ''}
    </div>

    <p class="deck">${cluster.canonical_headline}</p>

    <h2>Key Points</h2>
    <ul>
      <li>Development trending with score ${cluster.trending_score.toFixed(1)}</li>
      <li>Editorial rank: ${cluster.editorial_rank !== null ? cluster.editorial_rank : 'Unranked'}</li>
      <li>Topics: ${topics.join(', ') || 'None identified'}</li>
    </ul>

    <h2>Coverage Sources</h2>
    <ul>
      ${sourcesHtml}
    </ul>

    <h2>Entities Mentioned</h2>
    <p>${entities.join(', ') || 'No entities identified'}</p>

    <footer>
      <p>The Meridian &mdash; automatically curated daily paper. No human editor.</p>
    </footer>
  </article>
</body>
</html>`;
}

/**
 * Render all stories from snapshot.
 */
function renderAllStories(snapshot: SnapshotData): StoryRenderResult[] {
  const results: StoryRenderResult[] = [];

  console.log(`Rendering ${snapshot.clusters.length} story pages...`);

  for (const cluster of snapshot.clusters) {
    const html = renderStoryPage(snapshot, cluster.slug);
    if (html) {
      results.push({ slug: cluster.slug, html });
    }
  }

  return results;
}

/**
 * Write stories to local directory for testing.
 */
function writeStoriesLocal(stories: StoryRenderResult[], outputDir: string): void {
  const distDir = join(REPO_ROOT, outputDir);
  const storyDir = join(distDir, 'story');

  if (!existsSync(storyDir)) {
    mkdirSync(storyDir, { recursive: true });
  }

  for (const story of stories) {
    const filePath = join(storyDir, story.slug, 'index.html');
    const dirPath = dirname(filePath);

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    writeFileSync(filePath, story.html, 'utf8');
  }

  console.log(`Wrote ${stories.length} story pages to ${outputDir}`);
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const snapshotPath = process.env.SNAPSHOT_PATH ?? join(REPO_ROOT, 'scripts', 'snapshot', 'latest.json');
  const outputDir = process.argv[2] ?? 'apps/site/dist';

  console.log(`Loading snapshot from: ${snapshotPath}`);

  let snapshot: SnapshotData;
  try {
    const raw = readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);

    // Handle compressed snapshots
    if (raw[0] === '' && raw[1] === '') {
      const { inflateSync } = await import('node:zlib');
      snapshot = JSON.parse(inflateSync(Buffer.from(raw, 'binary')).toString('utf8'));
    } else {
      snapshot = parsed;
    }
  } catch (err) {
    throw new Error(`Failed to load snapshot: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (snapshot.schema_version !== 1) {
    throw new Error(`Unsupported schema version: ${snapshot.schema_version}`);
  }

  const stories = renderAllStories(snapshot);
  writeStoriesLocal(stories, outputDir);
  console.log('Story rendering complete.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Story rendering failed:', err);
    process.exit(1);
  });
}

export { renderStoryPage, renderAllStories };
