/**
 * tests/curation/split.test.ts — Integration tests for the cluster split workflow.
 *
 * Tests CUR-02, CUR-03, D-18, D-19:
 * - Reversible story detachment from a cluster.
 * - Dated correction note generation, naming the outlet.
 * - story_sources integrity after the split.
 * - Metric recalculation for both the surviving cluster and the new one.
 * - Error handling for invalid split attempts.
 *
 * The behavioural tests run against a real database built from the project's
 * own schema, because the constraints that matter here — the attribution rows
 * that must survive, the counts that must be re-measured, the correction row
 * that must exist — live in the schema, not in a mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { splitCluster, type SplitClusterResult } from '../../src/curation/split.js';
import type { Repository, StorySourceRow } from '../../apps/worker/src/db/repository.js';
import { createTestRepository, seedSourceIds } from './d1-harness.js';

/** Minimal mock for the Repository interface sufficient for the guard tests. */
function makeRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    insertStory: vi.fn(),
    batchInsertStories: vi.fn(),
    findClusterBySlug: vi.fn(),
    listStoriesForCluster: vi.fn(),
    listProminentClusters: vi.fn(),
    countTables: vi.fn(),
    countRows: vi.fn(),
    syncSources: vi.fn(),
    recordFeedFetch: vi.fn(),
    updateSourceHealth: vi.fn(),
    findLshCandidates: vi.fn(),
    batchUpdateTrendingScores: vi.fn(),
    syncTaxonomyAndEntities: vi.fn(),
    assignClusterTaxonomy: vi.fn(),
    listUnclusteredStories: vi.fn(),
    findStoryById: vi.fn(),
    findSourceById: vi.fn(),
    listSections: vi.fn(),
    listEditions: vi.fn(),
    findRecentCandidateStories: vi.fn(),
    updateStoryFingerprint: vi.fn(),
    findEntityIdsBySlugs: vi.fn(),
    createClusterWithStory: vi.fn(),
    addStoryToCluster: vi.fn(),
    updateClusterCuration: vi.fn(),
    listActiveSources: vi.fn(),
    recordClusterSplit: vi.fn(),
    ...overrides,
  } as unknown as Repository;
}

const FIXED_NOW = '2026-10-21T12:00:00.000Z';

function makeMemberSources(count: number): StorySourceRow[] {
  return Array.from({ length: count }, (_, i) => ({
    story_id: 100 + i,
    source_id: 10 + i,
    rank: i,
    headline: `Headline from outlet ${i + 1}`,
    url: `https://outlet${i + 1}.com/story`,
    published_at: `2026-10-21T0${i}:00:00.000Z`,
  }));
}

const BBC_HEADLINE = 'Bank of England cuts interest rate to 4.75 percent';
const GUARDIAN_HEADLINE = 'BoE reduces benchmark interest rate by 25 basis points to 4.75%';

/** Build a two-outlet cluster in the test database and return its ids. */
async function seedTwoOutletCluster() {
  const { db, repository } = createTestRepository();
  const sourceIds = seedSourceIds(db);
  const bbcId = sourceIds.get('bbc-news')!;
  const guardianId = sourceIds.get('the-guardian')!;

  await repository.insertStory({
    clusterId: 0,
    sourceId: bbcId,
    externalGuid: 'bbc-001',
    headline: BBC_HEADLINE,
    excerpt: 'The Bank of England has cut its benchmark rate.',
    url: 'https://www.bbc.co.uk/news/business-001',
    slug: 'bbc-001',
    language: 'en',
    publishedAt: '2026-10-21T09:00:00.000Z',
    fetchedAt: '2026-10-21T09:05:00.000Z',
    simhash: 111,
    band0: 11,
    band1: 12,
    band2: 13,
    band3: 14,
    countryCode: 'GB',
    isPrimary: false,
  });

  await repository.insertStory({
    clusterId: 0,
    sourceId: guardianId,
    externalGuid: 'guardian-001',
    headline: GUARDIAN_HEADLINE,
    excerpt: 'The Bank of England has reduced its benchmark rate.',
    url: 'https://www.theguardian.com/business/001',
    slug: 'guardian-001',
    language: 'en',
    publishedAt: '2026-10-21T10:00:00.000Z',
    fetchedAt: '2026-10-21T10:05:00.000Z',
    simhash: 222,
    band0: 21,
    band1: 22,
    band2: 23,
    band3: 24,
    countryCode: 'GB',
    isPrimary: false,
  });

  const storyRows = db
    .prepare('SELECT id, source_id FROM stories ORDER BY id ASC')
    .all() as Array<{ id: number; source_id: number }>;

  const clusterId = await repository.createClusterWithStory(
    {
      slug: 'story-cluster-under-test',
      canonicalHeadline: BBC_HEADLINE,
      canonicalExcerpt: 'The Bank of England has cut its benchmark rate.',
      primarySectionId: 2,
      sectionConfidence: 0.9,
      sectionMethod: 'lexicon',
      publishedAt: '2026-10-21T09:00:00.000Z',
      outletCount: 1,
      mentionCount: 1,
      trendingScore: 4.5,
    },
    storyRows[0].id,
    bbcId,
    BBC_HEADLINE,
    'https://www.bbc.co.uk/news/business-001',
    '2026-10-21T09:00:00.000Z',
  );

  await repository.addStoryToCluster(
    clusterId,
    storyRows[1].id,
    guardianId,
    GUARDIAN_HEADLINE,
    'https://www.theguardian.com/business/001',
    '2026-10-21T10:00:00.000Z',
    false,
  );

  return {
    db,
    repository,
    clusterId,
    bbcStoryId: storyRows[0].id,
    guardianStoryId: storyRows[1].id,
  };
}

describe('splitCluster (CUR-02, CUR-03, D-18, D-19)', () => {
  describe('guard validation', () => {
    it('throws when the cluster has fewer than 2 member stories', async () => {
      const repo = makeRepository({
        listStoriesForCluster: vi.fn().mockResolvedValue([makeMemberSources(1)[0]]),
      });

      await expect(splitCluster(42, 100, repo, FIXED_NOW)).rejects.toThrow(
        'Cannot split cluster 42: must contain at least 2 member stories (found 1)',
      );
    });

    it('throws when the cluster has zero members', async () => {
      const repo = makeRepository({
        listStoriesForCluster: vi.fn().mockResolvedValue([]),
      });

      await expect(splitCluster(42, 100, repo, FIXED_NOW)).rejects.toThrow(
        'Cannot split cluster 42: must contain at least 2 member stories (found 0)',
      );
    });

    it('throws when storyId is not a member of the cluster', async () => {
      const repo = makeRepository({
        listStoriesForCluster: vi.fn().mockResolvedValue(makeMemberSources(2)),
      });

      // story_id 999 is not in [100, 101]
      await expect(splitCluster(42, 999, repo, FIXED_NOW)).rejects.toThrow(
        'Story 999 does not belong to cluster 42',
      );
    });
  });

  describe('corrected note', () => {
    it('names the outlet in the dated correction note (CUR-03, D-19)', async () => {
      const members = makeMemberSources(2);
      const repo = makeRepository({
        listStoriesForCluster: vi.fn().mockResolvedValue(members),
        findStoryById: vi.fn().mockResolvedValue({
          id: 100,
          cluster_id: 42,
          source_id: 10,
          external_guid: 'g-100',
          url: 'https://outlet1.com/story',
          slug: 'g-100',
          headline: 'Headline from outlet 1',
          excerpt: 'An excerpt.',
          published_at: '2026-10-21T00:00:00.000Z',
          fetched_at: '2026-10-21T00:05:00.000Z',
          simhash: 0,
          band0: 0,
          band1: 0,
          band2: 0,
          band3: 0,
          language: 'en',
          country_code: 'GB',
          is_primary: 0,
        }),
        findSourceById: vi.fn().mockResolvedValue({
          id: 10,
          slug: 'the-guardian',
          name: 'The Guardian',
          feed_url: 'https://www.theguardian.com/uk/rss',
          country_code: 'GB',
          language: 'en',
          etag: null,
          last_modified: null,
          disabled_until: null,
          terms_status: 'verified',
        }),
        recordClusterSplit: vi
          .fn()
          .mockResolvedValue({ newClusterId: 55, correctionId: 3 }),
      });

      const result = await splitCluster(42, 100, repo, FIXED_NOW);

      expect(result.correctionNote).toBe(
        'Correction (2026-10-21): An earlier version of this story incorrectly grouped coverage from The Guardian. The coverage has been separated into its own report.',
      );
    });

    it('falls back to the source id when the outlet name cannot be resolved', async () => {
      const repo = makeRepository({
        listStoriesForCluster: vi.fn().mockResolvedValue(makeMemberSources(2)),
        findStoryById: vi.fn().mockResolvedValue({
          id: 100,
          cluster_id: 42,
          source_id: 10,
          external_guid: 'g-100',
          url: 'https://outlet1.com/story',
          slug: 'g-100',
          headline: 'Headline from outlet 1',
          excerpt: null,
          published_at: '2026-10-21T00:00:00.000Z',
          fetched_at: '2026-10-21T00:05:00.000Z',
          simhash: 0,
          band0: 0,
          band1: 0,
          band2: 0,
          band3: 0,
          language: 'en',
          country_code: 'GB',
          is_primary: 0,
        }),
        findSourceById: vi.fn().mockResolvedValue(null),
        recordClusterSplit: vi
          .fn()
          .mockResolvedValue({ newClusterId: 55, correctionId: 3 }),
      });

      const result = await splitCluster(42, 100, repo, FIXED_NOW);

      expect(result.correctionNote).toContain('coverage from source 10.');
    });
  });

  describe('split against a real database', () => {
    it('detaches the story into a new cluster and keeps every attribution row', async () => {
      const { db, repository, clusterId, bbcStoryId, guardianStoryId } =
        await seedTwoOutletCluster();

      const result = await splitCluster(clusterId, guardianStoryId, repository, FIXED_NOW);

      expect(result.originalClusterId).toBe(clusterId);
      expect(result.newClusterId).not.toBe(clusterId);
      expect(result.correctionId).toBeGreaterThan(0);
      expect(result.newClusterSlug).toMatch(/^story-[a-z0-9]+-[a-z0-9]+$/);

      // The story now belongs to the new cluster and is its primary.
      const movedStory = db
        .prepare('SELECT cluster_id, is_primary FROM stories WHERE id = ?')
        .get(guardianStoryId) as { cluster_id: number; is_primary: number };
      expect(movedStory.cluster_id).toBe(result.newClusterId);
      expect(movedStory.is_primary).toBe(1);

      // The attribution rows follow the story: one row per cluster, no
      // orphans, and nothing is lost (CUR-02).
      const attributionRows = db
        .prepare(
          'SELECT cluster_id, story_id, source_id, rank FROM story_sources ORDER BY cluster_id ASC',
        )
        .all() as Array<{
        cluster_id: number;
        story_id: number;
        source_id: number;
        rank: number;
      }>;
      expect(attributionRows).toHaveLength(2);
      expect(
        attributionRows.find((r) => r.cluster_id === clusterId)?.story_id,
      ).toBe(bbcStoryId);
      expect(
        attributionRows.find((r) => r.cluster_id === result.newClusterId)?.story_id,
      ).toBe(guardianStoryId);
      expect(
        attributionRows.find((r) => r.cluster_id === result.newClusterId)?.rank,
      ).toBe(0);
    });

    it('re-measures the surviving cluster and the new one', async () => {
      const { db, repository, clusterId, guardianStoryId } =
        await seedTwoOutletCluster();

      const before = db
        .prepare(
          'SELECT trending_score, editorial_rank, outlet_count, mention_count FROM clusters WHERE id = ?',
        )
        .get(clusterId) as Record<string, number>;

      const result = await splitCluster(clusterId, guardianStoryId, repository, FIXED_NOW);

      const oldCluster = db
        .prepare(
          `SELECT slug, canonical_headline, canonical_excerpt, published_at,
                  outlet_count, mention_count, trending_score, editorial_rank,
                  primary_section_id, section_method
             FROM clusters WHERE id = ?`,
        )
        .get(clusterId) as Record<string, unknown>;

      // The surviving cluster now describes one outlet, one mention, and the
      // earliest of what is left.
      expect(oldCluster.outlet_count).toBe(1);
      expect(oldCluster.mention_count).toBe(1);
      expect(oldCluster.published_at).toBe('2026-10-21T09:00:00.000Z');
      expect(oldCluster.canonical_headline).toBe(BBC_HEADLINE);
      expect(oldCluster.trending_score).not.toBe(before.trending_score);
      // CUR-10: a cluster that drops below two outlets loses its pick.
      expect(oldCluster.editorial_rank).toBeNull();

      const newCluster = db
        .prepare(
          `SELECT canonical_headline, canonical_excerpt, published_at,
                  outlet_count, mention_count, editorial_rank,
                  primary_section_id, section_method
             FROM clusters WHERE id = ?`,
        )
        .get(result.newClusterId) as Record<string, unknown>;

      expect(newCluster.canonical_headline).toBe(GUARDIAN_HEADLINE);
      expect(newCluster.canonical_excerpt).toBe(
        'The Bank of England has reduced its benchmark rate.',
      );
      expect(newCluster.published_at).toBe('2026-10-21T10:00:00.000Z');
      expect(newCluster.outlet_count).toBe(1);
      expect(newCluster.mention_count).toBe(1);
      expect(newCluster.editorial_rank).toBeNull();
      // The desk is inherited: a split never re-classifies a story.
      expect(newCluster.primary_section_id).toBe(oldCluster.primary_section_id);
      expect(newCluster.section_method).toBe(oldCluster.section_method);
    });

    it('publishes the dated correction note on the affected story URL (CUR-03)', async () => {
      const { db, repository, clusterId, guardianStoryId } =
        await seedTwoOutletCluster();

      const result = await splitCluster(clusterId, guardianStoryId, repository, FIXED_NOW);

      const correction = db
        .prepare(
          `SELECT story_slug, reported_at, report_detail, status, resolution,
                  correction_note, resolved_at
             FROM corrections WHERE id = ?`,
        )
        .get(result.correctionId) as Record<string, unknown>;

      expect(correction.story_slug).toBe('story-cluster-under-test');
      expect(correction.status).toBe('resolved');
      expect(correction.reported_at).toBe(FIXED_NOW);
      expect(correction.resolved_at).toBe(FIXED_NOW);
      expect(correction.correction_note).toBe(
        'Correction (2026-10-21): An earlier version of this story incorrectly grouped coverage from The Guardian. The coverage has been separated into its own report.',
      );
      expect(correction.resolution).toContain('The Guardian');
      expect(correction.report_detail).toContain(`story ${guardianStoryId}`);
    });

    it('never deletes a story row, so the split can be undone (CUR-02)', async () => {
      const { db, repository, clusterId, guardianStoryId } =
        await seedTwoOutletCluster();

      await splitCluster(clusterId, guardianStoryId, repository, FIXED_NOW);

      const storyCount = db.prepare('SELECT COUNT(*) AS n FROM stories').get() as {
        n: number;
      };
      expect(storyCount.n).toBe(2);
    });

    it('refuses to split a cluster that has only one member', async () => {
      const { db, repository, guardianStoryId } = await seedTwoOutletCluster();

      const singleClusterId = await repository.createClusterWithStory(
        {
          slug: 'story-single-member',
          canonicalHeadline: 'A lonely headline',
          canonicalExcerpt: null,
          primarySectionId: 1,
          sectionConfidence: 0.5,
          sectionMethod: 'lexicon',
          publishedAt: '2026-10-21T09:00:00.000Z',
          outletCount: 1,
          mentionCount: 1,
          trendingScore: 3,
        },
        guardianStoryId,
        1,
        'A lonely headline',
        'https://example.com/lonely',
        '2026-10-21T09:00:00.000Z',
      );

      await expect(
        splitCluster(singleClusterId, guardianStoryId, repository, FIXED_NOW),
      ).rejects.toThrow(/at least 2 member stories/);
    });

    it('refuses to split a story that is not in the cluster', async () => {
      const { db, repository, clusterId } = await seedTwoOutletCluster();

      const outsider = db
        .prepare('SELECT id FROM stories ORDER BY id DESC LIMIT 1')
        .get() as { id: number };

      await expect(
        splitCluster(clusterId, outsider.id + 999, repository, FIXED_NOW),
      ).rejects.toThrow(/does not belong to cluster/);
    });
  });
});
