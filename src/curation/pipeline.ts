/**
 * src/curation/pipeline.ts — End-to-end curation pipeline orchestrator.
 *
 * Implements CUR-01 through CUR-15, CON-15.
 *
 * Stages:
 *   Stage 3: Cluster — SimHash LSH → anti-merge guards → BGE-M3 cosine confirmation → create/merge cluster
 *   Stage 4: Enrich  — 4-stage section resolution → bilingual gazetteer tagging → edition flagging
 *   Stage 5: Score   — 18-hour decaying trending score → Editor's Picks gate
 *
 * Key invariants enforced:
 *   - CON-15: clusters.published_at = MIN(stories.published_at) across all members
 *   - CUR-05: two items whose recognised entity sets are disjoint are never merged
 *   - CUR-08: language boundary — Hindi stories only cluster with Hindi stories
 *   - CUR-10: editorial_rank = NULL for single-outlet clusters
 *   - OPS-14: all SQL lives exclusively in repository.ts
 */

import type { Repository } from '../../apps/worker/src/db/repository.js';
import type { EmbeddingProvider } from './embedding-provider.js';
import { computeSimHash, tokenizeHeadline } from './simhash.js';
import {
  evaluateCandidateClustering,
  selectPrimaryHeadline,
  type StoryCandidate,
} from './cluster-engine.js';
import { resolveSection } from './sections.js';
import { matchGazetteerEntities, determineEditionFlags } from './tagging.js';
import { calculateTrendingScore, evaluateEditorialRank } from './ranking.js';
import { GAZETTEER_ENTITIES } from '../../config/gazetteer.js';
import { SECTIONS } from '../../shared/config/editions.js';

export interface PipelineExecutionOptions {
  batchSize?: number;
  nowIso?: string;
  dryRun?: boolean;
}

export interface PipelineExecutionSummary {
  storiesProcessed: number;
  clustersCreated: number;
  storiesMerged: number;
  durationMs: number;
}

/** The number of recent stories considered as merge candidates per story. */
const CANDIDATE_WINDOW = 200;

/** The merge window. A story only merges with coverage published this recently. */
const MERGE_WINDOW_HOURS = 24;

/**
 * Build a unique immutable cluster slug from current timestamp and a random suffix.
 * Mirrors the convention used in split.ts and the ingest pipeline.
 */
function buildClusterSlug(): string {
  return `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Process unclustered stories through the full curation pipeline.
 *
 * For each unclustered story (cluster_id = 0):
 * 1. Compute SimHash-64 and extract 4x16-bit LSH bands, and write them onto
 *    the row so a later story can find this one.
 * 2. Collect merge candidates from D1 — the LSH band probe and the
 *    time-windowed scan, unioned.
 * 3. Evaluate candidate clusters with anti-merge guards + BGE-M3 cosine.
 * 4. Merge into an existing cluster OR create a new one, then re-measure the
 *    cluster so its counts, publication time, canonical headline, score and
 *    editorial rank describe what it actually contains.
 * 5. Resolve broadsheet section (4-stage cascade).
 * 6. Match gazetteer entities and determine edition flags.
 * 7. Assign taxonomy and edition associations.
 * 8. Calculate the 18-hour decaying trending score.
 *
 * @returns Summary with counts and elapsed time.
 */
export async function processCurationPipeline(
  repository: Repository,
  embeddingProvider: EmbeddingProvider,
  options: PipelineExecutionOptions = {},
): Promise<PipelineExecutionSummary> {
  const startMs = Date.now();
  const nowIso = options.nowIso ?? new Date().toISOString();
  const batchSize = options.batchSize ?? 100;
  const dryRun = options.dryRun ?? false;

  let storiesProcessed = 0;
  let clustersCreated = 0;
  let storiesMerged = 0;

  // ── Section and edition lookups ─────────────────────────────────────────
  // The numeric ids come from the database, never from a hard-coded table:
  // a section added to the seed must not need a code change to be addressable.
  // The gazetteer is the curated entity list (CUR-12). It is written into D1
  // once per run so entity ids can be resolved, and only gazetteer entities
  // are ever resolved — a model-extracted name never reaches this table.
  if (!dryRun) {
    await repository.syncTaxonomyAndEntities(
      SECTIONS.map((section) => ({ slug: section.id, name: section.name })),
      GAZETTEER_ENTITIES.map((entity) => ({
        slug: entity.slug,
        name: entity.canonicalName,
        entityType: entity.entityType,
        countryCode: entity.countryCode ?? null,
      })),
    );
  }

  const sectionRows = await repository.listSections();
  const sectionIdBySlug = new Map(sectionRows.map((s) => [s.slug, s.id]));
  const editionRows = await repository.listEditions();
  const editionIdBySlug = new Map(editionRows.map((e) => [e.slug, e.id]));

  // Stage 3: Fetch unclustered stories ordered by published_at ASC (CUR-01, CON-15)
  const stories = await repository.listUnclusteredStories(batchSize);

  // ISO timestamp for the merge window lookback
  const sinceWindowIso = new Date(
    new Date(nowIso).getTime() - MERGE_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Gazetteer matching is a regex sweep over the curated list. It is cached
  // per headline because the same candidate headline is evaluated repeatedly
  // as the batch walks forward.
  const entityCache = new Map<string, string[]>();
  const entitiesFor = (headline: string, language: 'en' | 'hi'): string[] => {
    const cacheKey = `${language}::${headline}`;
    const cached = entityCache.get(cacheKey);
    if (cached) return cached;
    const slugs = matchGazetteerEntities(headline, language).map((m) => m.entity.slug);
    entityCache.set(cacheKey, slugs);
    return slugs;
  };

  for (const story of stories) {
    const language = (story.language === 'hi' ? 'hi' : 'en') as 'en' | 'hi';

    // ── Stage 3a: Compute SimHash + LSH bands ───────────────────────────────
    const fingerprint = computeSimHash(tokenizeHeadline(story.headline, language));

    // ── Stage 3b: Collect merge candidates from D1 ───────────────────────────
    // Two sources, unioned: the LSH band probe (an index lookup) and the
    // time-windowed scan. The band probe alone cannot find paraphrased
    // headlines — measured in plan 03-05, none of the 92 labelled same-event
    // pairs collide on any of the four 16-bit bands — so the windowed scan is
    // what guarantees recall inside the merge window. The scan is bounded by
    // the window and by `idx_stories_published`, so it reads a day's worth of
    // rows rather than the table.
    const bandCandidates = await repository.findLshCandidates(
      fingerprint.band0,
      fingerprint.band1,
      fingerprint.band2,
      fingerprint.band3,
      sinceWindowIso,
      language,
    );
    const windowCandidates = await repository.findRecentCandidateStories(
      sinceWindowIso,
      language,
      CANDIDATE_WINDOW,
    );

    const byId = new Map<number, (typeof bandCandidates)[number]>();
    for (const candidate of [...bandCandidates, ...windowCandidates]) {
      // Only stories that already belong to a cluster are merge targets, and
      // a story is never a candidate for itself.
      if (candidate.cluster_id <= 0 || candidate.id === story.id) continue;
      byId.set(candidate.id, candidate);
    }

    // Convert to the cluster engine's candidate shape. The candidate's own
    // gazetteer entities are resolved here so the disjoint-entity guard
    // (CUR-05) can do its job: two items with disjoint entity sets are never
    // merged, no matter how similar their embeddings are.
    const candidates: StoryCandidate[] = [...byId.values()].map((c) => ({
      clusterId: c.cluster_id,
      story: {
        headline: c.headline,
        excerpt: c.excerpt ?? undefined,
        publishedAt: c.published_at,
        language,
        entities: entitiesFor(c.headline, language),
      },
    }));

    // ── Stage 3c: Evaluate candidate clusters (anti-merge guards + BGE-M3) ──
    const incomingEntitySlugs = entitiesFor(story.headline, language);
    const incomingStory = {
      headline: story.headline,
      excerpt: story.excerpt ?? undefined,
      publishedAt: story.published_at,
      language,
      entities: incomingEntitySlugs,
    };

    const decision = await evaluateCandidateClustering(
      incomingStory,
      candidates,
      embeddingProvider,
    );

    // ── Stage 3d: Resolve section desk (4-stage cascade) ────────────────────
    // For a merge the desk is resolved over the whole cluster's coverage, not
    // over the incoming headline alone: a cluster's desk is the desk of the
    // story it actually is.
    const targetClusterId =
      decision.action === 'merge' ? decision.targetClusterId : undefined;
    const clusterMembers =
      targetClusterId !== undefined
        ? await repository.listStoriesForCluster(targetClusterId)
        : [];

    const sectionHeadline =
      clusterMembers.length > 0
        ? [...clusterMembers.map((m) => m.headline), story.headline].join(' — ')
        : story.headline;

    const sectionResult = await resolveSection({
      headline: sectionHeadline,
      excerpt: story.excerpt ?? null,
      language,
    });
    const primarySectionId = sectionIdBySlug.get(sectionResult.sectionId);
    if (primarySectionId === undefined) {
      throw new Error(`Missing section seed for ${sectionResult.sectionId}`);
    }

    // ── Stage 3e: Determine edition flags ───────────────────────────────────
    const matchedEntities = matchGazetteerEntities(story.headline, language).map(
      (m) => m.entity,
    );
    const editionFlags = determineEditionFlags({
      outletCountries: [story.country_code],
      matchedEntities,
      isWireBreaking: false,
      language,
    });

    if (dryRun) {
      if (decision.action === 'merge') {
        storiesMerged++;
      } else {
        clustersCreated++;
      }
      storiesProcessed++;
      continue;
    }

    // ── Stage 3f: Persist the clustering decision ───────────────────────────
    let clusterId: number;
    let clusterPublishedAt: string;

    if (decision.action === 'merge' && decision.targetClusterId !== undefined) {
      clusterId = decision.targetClusterId;
      await repository.addStoryToCluster(
        clusterId,
        story.id,
        story.source_id,
        story.headline,
        story.url,
        story.published_at,
        false, // not primary — the existing cluster keeps its primary
      );
      storiesMerged++;

      // Re-measure the cluster from its member list of record.
      const members = await repository.listStoriesForCluster(clusterId);
      const distinctOutlets = new Set(members.map((m) => m.source_id)).size;
      const mentionCount = members.length;
      clusterPublishedAt = members.map((m) => m.published_at).sort()[0];
      const canonicalHeadline = selectPrimaryHeadline(
        members.map((m) => ({ headline: m.headline })),
      );
      const trendingScore = calculateTrendingScore({
        distinctOutlets,
        totalMentions: mentionCount,
        publishedAt: clusterPublishedAt,
        distinctSections: 1,
        nowIso,
      });

      await repository.updateClusterCuration(clusterId, {
        canonicalHeadline,
        publishedAt: clusterPublishedAt,
        outletCount: distinctOutlets,
        mentionCount,
        trendingScore,
        editorialRank: evaluateEditorialRank(distinctOutlets),
      });
    } else {
      const slug = buildClusterSlug();

      const trendingScore = calculateTrendingScore({
        distinctOutlets: 1,
        totalMentions: 1,
        publishedAt: story.published_at,
        distinctSections: 1,
        nowIso,
      });

      clusterId = await repository.createClusterWithStory(
        {
          slug,
          canonicalHeadline: story.headline,
          canonicalExcerpt: story.excerpt ?? null,
          primarySectionId,
          sectionConfidence: sectionResult.confidence,
          sectionMethod: sectionResult.method,
          publishedAt: story.published_at,
          outletCount: 1,
          mentionCount: 1,
          trendingScore,
        },
        story.id,
        story.source_id,
        story.headline,
        story.url,
        story.published_at,
      );
      clusterPublishedAt = story.published_at;
      clustersCreated++;

      // CUR-10: a cluster with a single outlet is never an Editor's Pick.
      await repository.updateClusterCuration(clusterId, {
        publishedAt: clusterPublishedAt,
        outletCount: 1,
        mentionCount: 1,
        trendingScore,
        editorialRank: evaluateEditorialRank(1),
      });
    }

    // ── Stage 3g: Write the LSH bands onto the story ───────────────────────
    // Without this the row keeps its zeroed bands and no later story can find
    // it through the band index. The four bands carry all 64 bits of the
    // fingerprint, so nothing is lost by not writing the 64-bit column.
    await repository.updateStoryFingerprint(story.id, {
      band0: fingerprint.band0,
      band1: fingerprint.band1,
      band2: fingerprint.band2,
      band3: fingerprint.band3,
    });

    // ── Stage 4: Assign taxonomy, editions and entities ─────────────────────
    const entityIdBySlug = await repository.findEntityIdsBySlugs(incomingEntitySlugs);
    const topicIdBySlug = await repository.findTopicIdsBySlugs([sectionResult.sectionId]);
    const entityRows = incomingEntitySlugs
      .map((slug) => entityIdBySlug.get(slug))
      .filter((id): id is number => id !== undefined)
      .map((entityId, index) => ({ entityId, isPrimary: index === 0 }));

    const editionFlagRows = editionFlags
      .filter((flag) => editionIdBySlug.has(flag.editionId))
      .map((flag) => ({
        editionId: editionIdBySlug.get(flag.editionId)!,
        publishedAt: clusterPublishedAt,
        reason: flag.reason,
        confidence: flag.confidence,
      }));

    await repository.assignClusterTaxonomy(
      clusterId,
      {
        sectionId: primarySectionId,
        confidence: sectionResult.confidence,
        method: sectionResult.method,
      },
      editionFlagRows,
      topicIdBySlug.get(sectionResult.sectionId) ? [topicIdBySlug.get(sectionResult.sectionId)!] : [],
      entityRows,
    );

    storiesProcessed++;
  }

  return {
    storiesProcessed,
    clustersCreated,
    storiesMerged,
    durationMs: Date.now() - startMs,
  };
}
