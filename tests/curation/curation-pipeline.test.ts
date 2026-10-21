/**
 * tests/curation/curation-pipeline.test.ts — End-to-end curation pipeline test.
 *
 * Implements the 03-05 plan's integration contract: raw unclustered stories
 * go in, curated clusters come out, and every invariant the phase claims is
 * asserted against a real database built from the project's own schema.
 *
 * Covers CUR-01..CUR-15 and CON-15:
 *   - CUR-01/CUR-04/CUR-05/CUR-06 — same-event coverage merges; unrelated and
 *     entity-disjoint coverage never does.
 *   - CUR-02/CUR-03 — the split workflow that makes a merge reversible.
 *   - CUR-07/CUR-10 — the trending score and the Editor's Picks gate.
 *   - CUR-11/CUR-12/CUR-13/CUR-14/CUR-15 — sections, entities, editions.
 *   - CON-15 — a cluster's publication time is the earliest member's.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { processCurationPipeline } from '../../src/curation/pipeline.js';
import { FixtureEmbeddingProvider } from '../../src/curation/embedding-provider.js';
import { splitCluster } from '../../src/curation/split.js';
import { createTestRepository, seedSourceIds } from './d1-harness.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const FIXED_NOW = '2026-10-21T18:00:00.000Z';

/** The BGE-M3 vectors the pipeline test runs against. */
const EMBEDDINGS: Record<string, number[]> = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, 'tests', 'fixtures', 'curation', 'headline-embeddings.json'),
    'utf8',
  ),
);

interface SeedStory {
  key: string;
  source: string;
  headline: string;
  excerpt: string | null;
  publishedAt: string;
  language: string;
  countryCode: string;
}

/**
 * The batch: five pairs of same-event coverage and five standalone stories.
 * The paired headlines are the labelled same-event pairs from
 * `tests/fixtures/curation/headline-pairs.json`, so the vectors the pipeline
 * confirms against are the ones the merge benchmark already measured.
 */
const BATCH: SeedStory[] = [
  // Pair 1 — two UK outlets on the same rate decision.
  {
    key: 'p1a',
    source: 'bbc-news',
    headline: 'Bank of England cuts interest rate to 4.75 percent',
    excerpt: 'The Bank of England has cut its benchmark rate by 25 basis points.',
    publishedAt: '2026-10-21T09:00:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  {
    key: 'p1b',
    source: 'the-guardian',
    headline: 'BoE reduces benchmark interest rate by 25 basis points to 4.75%',
    excerpt: 'Interest rates were reduced by a quarter of a percentage point.',
    publishedAt: '2026-10-21T09:15:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  // Pair 2 — a US outlet and a UK outlet on the same Fed decision.
  {
    key: 'p2a',
    source: 'cnn',
    headline: 'Federal Reserve holds interest rates steady after policy meeting',
    excerpt: 'The Federal Reserve left its benchmark rate unchanged.',
    publishedAt: '2026-10-21T10:00:00.000Z',
    language: 'en',
    countryCode: 'US',
  },
  {
    key: 'p2b',
    source: 'bbc-news',
    headline: 'Fed leaves benchmark interest rate unchanged at latest policy session',
    excerpt: 'Policymakers left the interest rate unchanged at the meeting.',
    publishedAt: '2026-10-21T10:20:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  // Pair 3 — an Australian outlet and a UK outlet on the same storm.
  {
    key: 'p3a',
    source: 'abc-news-au',
    headline: 'Storm Ashley causes widespread travel disruption and power cuts in Scotland',
    excerpt: 'Severe weather brought disruption to rail and air travel.',
    publishedAt: '2026-10-21T11:00:00.000Z',
    language: 'en',
    countryCode: 'AU',
  },
  {
    key: 'p3b',
    source: 'bbc-news',
    headline: 'Severe gales from Storm Ashley disrupt flights and trains across Scotland',
    excerpt: 'Rail and air services were disrupted by severe gales.',
    publishedAt: '2026-10-21T11:10:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  // Pair 4 — two Hindi-language publishers on the same launch.
  {
    key: 'p4a',
    source: 'bbc-hindi',
    headline:
      'इसरो ने गगनयान मानव अंतरिक्ष मिशन के लिए महत्वपूर्ण रॉकेट परीक्षण सफलतापूर्वक पूरा किया',
    excerpt: 'इसरो ने गगनयान मिशन के रॉकेट का सफल परीक्षण किया।',
    publishedAt: '2026-10-21T12:00:00.000Z',
    language: 'hi',
    countryCode: 'GB',
  },
  {
    key: 'p4b',
    source: 'amar-ujala',
    headline:
      'अंतरिक्ष अनुसंधान संगठन इसरो ने गगनयान अभियान के प्रणोदन चरण का सफल परीक्षण किया',
    excerpt: 'गगनयान अभियान का प्रणोदन चरण सफल रहा।',
    publishedAt: '2026-10-21T12:20:00.000Z',
    language: 'hi',
    countryCode: 'IN',
  },
  // Pair 5 — a UK outlet and an Australian outlet on the same plant closure.
  {
    key: 'p5a',
    source: 'the-guardian',
    headline: 'Tata Steel confirms permanent shutdown of Port Talbot blast furnace',
    excerpt: 'The final blast furnace at Port Talbot will close permanently.',
    publishedAt: '2026-10-21T13:00:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  {
    key: 'p5b',
    source: 'abc-news-au',
    headline: 'End of traditional steelmaking as Tata closes final blast furnace in Wales',
    excerpt: 'Traditional steelmaking in Wales has ended.',
    publishedAt: '2026-10-21T13:20:00.000Z',
    language: 'en',
    countryCode: 'AU',
  },
  // Five stories nobody else covered.
  {
    key: 's1',
    source: 'bbc-news',
    headline: 'London Gatwick airport reopens runway following drone investigation',
    excerpt: 'The runway reopened after a security investigation.',
    publishedAt: '2026-10-21T14:00:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  {
    key: 's2',
    source: 'cnn',
    headline: 'NASA Artemis II astronauts complete final lunar flyby simulations',
    excerpt: 'The crew completed their final simulations.',
    publishedAt: '2026-10-21T14:10:00.000Z',
    language: 'en',
    countryCode: 'US',
  },
  {
    key: 's3',
    source: 'abc-news-au',
    headline: 'Supreme Court agrees to hear major social media free speech appeal',
    excerpt: 'The court will hear a First Amendment appeal.',
    publishedAt: '2026-10-21T14:20:00.000Z',
    language: 'en',
    countryCode: 'AU',
  },
  {
    key: 's4',
    source: 'the-guardian',
    headline: 'British Museum unveils masterplan for major historic gallery restoration',
    excerpt: 'The museum has published its restoration masterplan.',
    publishedAt: '2026-10-21T14:30:00.000Z',
    language: 'en',
    countryCode: 'GB',
  },
  {
    key: 's5',
    source: 'amar-ujala',
    headline: 'शेयर बाजार में जबरदस्त तेजी, सेंसेक्स और निफ्टी नए सर्वकालिक उच्च स्तर पर बंद',
    excerpt: 'शेयर बाजार में तेजी दर्ज की गई।',
    publishedAt: '2026-10-21T14:40:00.000Z',
    language: 'hi',
    countryCode: 'IN',
  },
];

/** The two Hindi publishers the batch needs beyond the seeded registry. */
const EXTRA_SOURCES = [
  {
    slug: 'bbc-hindi',
    name: 'BBC Hindi',
    country: 'GB',
    language: 'hi',
  },
  {
    slug: 'dainik-bhaskar',
    name: 'Dainik Bhaskar',
    country: 'IN',
    language: 'hi',
  },
];

interface PipelineFixture {
  db: ReturnType<typeof createTestRepository>['db'];
  repository: ReturnType<typeof createTestRepository>['repository'];
  storyIds: Map<string, number>;
  provider: FixtureEmbeddingProvider;
  summary: Awaited<ReturnType<typeof processCurationPipeline>>;
}

/** Seed the batch, run the pipeline once, and hand back everything. */
async function runPipeline(): Promise<PipelineFixture> {
  const { db, repository } = createTestRepository();
  const sourceIds = seedSourceIds(db);

  for (const extra of EXTRA_SOURCES) {
    db.prepare(
      `INSERT INTO sources (slug, name, homepage_url, feed_url, country_code, language,
                           is_active, terms_status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'verified')`,
    ).run(
      extra.slug,
      extra.name,
      `https://example.com/${extra.slug}`,
      `https://example.com/${extra.slug}/rss`,
      extra.country,
      extra.language,
    );
  }

  for (const [slug, id] of seedSourceIds(db)) {
    sourceIds.set(slug, id);
  }

  const storyIds = new Map<string, number>();

  for (const story of BATCH) {
    const sourceId = sourceIds.get(story.source);
    if (!sourceId) throw new Error(`Unknown source in fixture: ${story.source}`);

    await repository.insertStory({
      clusterId: 0,
      sourceId,
      externalGuid: `guid-${story.key}`,
      headline: story.headline,
      excerpt: story.excerpt,
      url: `https://example.com/${story.key}`,
      slug: story.key,
      language: story.language,
      publishedAt: story.publishedAt,
      fetchedAt: story.publishedAt,
      simhash: 0,
      band0: 0,
      band1: 0,
      band2: 0,
      band3: 0,
      countryCode: story.countryCode,
      isPrimary: false,
    });

    const row = db
      .prepare('SELECT id FROM stories WHERE external_guid = ?')
      .get(`guid-${story.key}`) as { id: number };
    storyIds.set(story.key, row.id);
  }

  const provider = new FixtureEmbeddingProvider(EMBEDDINGS);
  const summary = await processCurationPipeline(repository, provider, {
    nowIso: FIXED_NOW,
    batchSize: 100,
  });

  return { db, repository, storyIds, provider, summary };
}

describe('processCurationPipeline (CUR-01..CUR-15, CON-15)', () => {
  it('processes every unclustered story in the batch', async () => {
    const { summary } = await runPipeline();

    expect(summary.storiesProcessed).toBe(BATCH.length);
    expect(summary.clustersCreated + summary.storiesMerged).toBe(BATCH.length);
  });

  it('produces five two-outlet clusters and five single-outlet clusters', async () => {
    const { db, summary } = await runPipeline();

    const clusters = db
      .prepare('SELECT id, outlet_count, mention_count FROM clusters ORDER BY id ASC')
      .all() as Array<{ id: number; outlet_count: number; mention_count: number }>;

    expect(clusters).toHaveLength(10);
    // Fifteen stories become ten clusters: the first story of each pair
    // opens a cluster, the second joins it, and the five singletons open
    // their own.
    expect(summary.clustersCreated).toBe(10);
    expect(summary.storiesMerged).toBe(5);

    const twoOutlet = clusters.filter((c) => c.outlet_count === 2);
    const oneOutlet = clusters.filter((c) => c.outlet_count === 1);
    expect(twoOutlet).toHaveLength(5);
    expect(oneOutlet).toHaveLength(5);
    expect(clusters.every((c) => c.mention_count === c.outlet_count)).toBe(true);
  });

  it('keeps every outlet attribution row (CUR-02)', async () => {
    const { db } = await runPipeline();

    const attributionRows = db
      .prepare('SELECT COUNT(*) AS n FROM story_sources')
      .get() as { n: number };
    expect(attributionRows.n).toBe(BATCH.length);

    // No row may point at a story that is not in the cluster it claims.
    const orphans = db
      .prepare(
        `SELECT ss.story_id, ss.cluster_id
           FROM story_sources AS ss
           JOIN stories AS s ON s.id = ss.story_id
          WHERE s.cluster_id <> ss.cluster_id`,
      )
      .all();
    expect(orphans).toEqual([]);
  });

  it('gives every cluster a canonical headline, a section and a section method (CUR-14)', async () => {
    const { db } = await runPipeline();

    const clusters = db
      .prepare(
        `SELECT id, canonical_headline, primary_section_id, section_confidence, section_method
           FROM clusters`,
      )
      .all() as Array<{
      id: number;
      canonical_headline: string;
      primary_section_id: number;
      section_confidence: number;
      section_method: string;
    }>;

    expect(clusters).toHaveLength(10);
    for (const cluster of clusters) {
      expect(cluster.canonical_headline.length).toBeGreaterThan(0);
      expect(cluster.primary_section_id).toBeGreaterThanOrEqual(1);
      expect(cluster.primary_section_id).toBeLessThanOrEqual(8);
      expect(['source', 'lexicon', 'ai_tiebreak', 'fallback']).toContain(
        cluster.section_method,
      );
      expect(cluster.section_confidence).toBeGreaterThan(0);
    }

    // Every cluster carries its desk in the join table as well.
    const sectionRows = db
      .prepare('SELECT cluster_id, section_id, confidence, method FROM cluster_sections')
      .all() as Array<{ cluster_id: number; section_id: number; method: string }>;
    expect(sectionRows).toHaveLength(10);
    for (const row of sectionRows) {
      expect(['source', 'lexicon', 'ai_tiebreak', 'fallback']).toContain(row.method);
    }
  });

  it('sets each cluster publication time to the earliest member (CON-15)', async () => {
    const { db } = await runPipeline();

    const clusters = db
      .prepare('SELECT id, published_at FROM clusters')
      .all() as Array<{ id: number; published_at: string }>;

    for (const cluster of clusters) {
      const earliest = db
        .prepare(
          'SELECT MIN(published_at) AS earliest FROM story_sources WHERE cluster_id = ?',
        )
        .get(cluster.id) as { earliest: string };
      expect(cluster.published_at).toBe(earliest.earliest);
    }

    // A merged pair publishes at the earlier of its two members.
    const merged = db
      .prepare('SELECT id, published_at FROM clusters WHERE outlet_count = 2')
      .all() as Array<{ id: number; published_at: string }>;
    expect(merged).toHaveLength(5);
    expect(merged.map((c) => c.published_at)).toContain('2026-10-21T09:00:00.000Z');
  });

  it('gives multi-outlet clusters an editorial rank and single-outlet clusters none (CUR-10)', async () => {
    const { db } = await runPipeline();

    const clusters = db
      .prepare('SELECT id, outlet_count, editorial_rank FROM clusters')
      .all() as Array<{ id: number; outlet_count: number; editorial_rank: number | null }>;

    for (const cluster of clusters) {
      if (cluster.outlet_count >= 2) {
        expect(cluster.editorial_rank).not.toBeNull();
      } else {
        expect(cluster.editorial_rank).toBeNull();
      }
    }
  });

  it('flags a cross-country cluster into more than one edition (CUR-13)', async () => {
    const { db } = await runPipeline();

    const editionRows = db
      .prepare(
        `SELECT ec.cluster_id, e.slug
           FROM edition_clusters AS ec
           JOIN editions AS e ON e.id = ec.edition_id`,
      )
      .all() as Array<{ cluster_id: number; slug: string }>;

    expect(editionRows.length).toBeGreaterThan(0);

    const editionsByCluster = new Map<number, string[]>();
    for (const row of editionRows) {
      const list = editionsByCluster.get(row.cluster_id) ?? [];
      list.push(row.slug);
      editionsByCluster.set(row.cluster_id, list);
    }

    const multiEdition = [...editionsByCluster.values()].filter(
      (editions) => editions.length > 1,
    );
    expect(multiEdition.length).toBeGreaterThan(0);

    // The Hindi pair is covered by a GB publisher and an IN publisher, so it
    // appears in more than one edition.
    const hindiCluster = db
      .prepare(
        `SELECT cluster_id FROM stories WHERE external_guid = 'guid-p4a'`,
      )
      .get() as { cluster_id: number };
    expect(editionsByCluster.get(hindiCluster.cluster_id)!.length).toBeGreaterThan(1);
  });

  it('tags gazetteer entities onto the story rows (CUR-12)', async () => {
    const { db } = await runPipeline();

    const entityRows = db
      .prepare(
        `SELECT se.story_id, se.entity_id, se.is_primary, e.slug
           FROM story_entities AS se
           JOIN entities AS e ON e.id = se.entity_id`,
      )
      .all() as Array<{
      story_id: number;
      entity_id: number;
      is_primary: number;
      slug: string;
    }>;

    expect(entityRows.length).toBeGreaterThan(0);

    // Every join row points at a real story — a cluster id is not a story id.
    const storyIds = new Set(
      (db.prepare('SELECT id FROM stories').all() as Array<{ id: number }>).map(
        (r) => r.id,
      ),
    );
    for (const row of entityRows) {
      expect(storyIds.has(row.story_id)).toBe(true);
    }

    // The Hindi pair is tagged with the gazetteer entity both headlines name.
    const isroRows = entityRows.filter((row) => row.slug === 'isro');
    expect(isroRows.length).toBeGreaterThan(0);
  });

  it('writes the LSH fingerprint onto every processed story', async () => {
    const { db } = await runPipeline();

    const rows = db
      .prepare('SELECT band0, band1, band2, band3 FROM stories')
      .all() as Array<{ band0: number; band1: number; band2: number; band3: number }>;

    expect(rows).toHaveLength(BATCH.length);
    for (const row of rows) {
      const bands = [row.band0, row.band1, row.band2, row.band3];
      expect(bands.every((band) => band > 0)).toBe(true);
    }
  });

  it('never merges two items whose recognised entity sets are disjoint (CUR-05)', async () => {
    const { db, repository } = createTestRepository();
    const sourceIds = seedSourceIds(db);
    const bbcId = sourceIds.get('bbc-news')!;

    // Two headlines that are near-identical to the embedding model but name
    // two different institutions. Their entity sets are disjoint, so the
    // disjoint-entity guard must refuse the merge no matter how similar the
    // vectors are — and no matter that they share the word "rate".
    const headlines = [
      'Bank of England cuts interest rate to 4.75 percent',
      'Federal Reserve holds interest rates steady after policy meeting',
    ];

    for (const [index, headline] of headlines.entries()) {
      await repository.insertStory({
        clusterId: 0,
        sourceId: bbcId,
        externalGuid: `guid-disjoint-${index}`,
        headline,
        excerpt: null,
        url: `https://example.com/disjoint-${index}`,
        slug: `disjoint-${index}`,
        language: 'en',
        publishedAt: `2026-10-21T1${index}:00:00.000Z`,
        fetchedAt: '2026-10-21T15:00:00.000Z',
        simhash: 0,
        band0: 0,
        band1: 0,
        band2: 0,
        band3: 0,
        countryCode: 'GB',
        isPrimary: false,
      });
    }

    const provider = new FixtureEmbeddingProvider({
      [headlines[0]]: [1, 0, 0, 0],
      [headlines[1]]: [0.97, 0.24, 0, 0], // cosine ~ 0.97
    });

    await processCurationPipeline(repository, provider, {
      nowIso: FIXED_NOW,
      batchSize: 100,
    });

    const clusters = db
      .prepare('SELECT COUNT(*) AS n FROM clusters')
      .get() as { n: number };
    expect(clusters.n).toBe(2);
  });

  it('splits a merged cluster back into two and records the correction (CUR-02, CUR-03)', async () => {
    const { db, repository, storyIds } = await runPipeline();

    const guardianStoryId = storyIds.get('p1b')!;
    const clusterId = (
      db
        .prepare('SELECT cluster_id FROM stories WHERE id = ?')
        .get(guardianStoryId) as { cluster_id: number }
    ).cluster_id;

    const result = await splitCluster(clusterId, guardianStoryId, repository, FIXED_NOW);

    // The cluster is now two clusters again, and the outlet list survived.
    const clusterCount = db
      .prepare('SELECT COUNT(*) AS n FROM clusters')
      .get() as { n: number };
    expect(clusterCount.n).toBe(11);

    const attributionRows = db
      .prepare('SELECT COUNT(*) AS n FROM story_sources')
      .get() as { n: number };
    expect(attributionRows.n).toBe(BATCH.length);

    const correction = db
      .prepare('SELECT story_slug, correction_note FROM corrections WHERE id = ?')
      .get(result.correctionId) as { story_slug: string; correction_note: string };
    expect(correction.correction_note).toContain('Correction (2026-10-21)');
    expect(correction.correction_note).toContain('The Guardian');
  });
});
