/**
 * tests/curation/split-cli.test.ts — The administrative split tool, end to end.
 *
 * The plan's contract for the CLI is that `npm run cluster:split -- <clusterId>
 * <storyId>` runs, detaches the story, and reports the correction note it
 * published. This test runs the tool as a command against a real database
 * file and checks both what it printed and what it left behind.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { createD1Binding, createTestDatabase, seedSourceIds } from './d1-harness.js';
import { createRepository } from '../../apps/worker/src/db/repository.js';
import type { MeridianEnv } from '../../apps/worker/src/db/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** The tsx runner, invoked directly so the test does not depend on npx. */
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_SCRIPT = path.join('scripts', 'curation', 'split-cluster.ts');

const BBC_HEADLINE = 'Bank of England cuts interest rate to 4.75 percent';
const GUARDIAN_HEADLINE = 'BoE reduces benchmark interest rate by 25 basis points to 4.75%';

describe('the cluster split command (03-05)', () => {
  it('runs, detaches the story and reports the correction note', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'meridian-split-cli-'));
    const databasePath = path.join(directory, 'meridian.sqlite');
    const db = createTestDatabase(databasePath);

    try {
      // Build a real database with a two-outlet cluster in it.
      const binding = createD1Binding(db);
      const repository = createRepository({
        DB: binding as unknown as MeridianEnv['DB'],
        R2: {} as MeridianEnv['R2'],
        KV: {} as MeridianEnv['KV'],
      });
      const sourceIds = seedSourceIds(db);
      const bbcId = sourceIds.get('bbc-news')!;
      const guardianId = sourceIds.get('the-guardian')!;

      const insert = async (
        guid: string,
        sourceId: number,
        headline: string,
        url: string,
        publishedAt: string,
      ) => {
        await repository.insertStory({
          clusterId: 0,
          sourceId,
          externalGuid: guid,
          headline,
          excerpt: null,
          url,
          slug: guid,
          language: 'en',
          publishedAt,
          fetchedAt: publishedAt,
          simhash: 0,
          band0: 0,
          band1: 0,
          band2: 0,
          band3: 0,
          countryCode: 'GB',
          isPrimary: false,
        });
      };

      await insert(
        'bbc-1',
        bbcId,
        BBC_HEADLINE,
        'https://www.bbc.co.uk/news/1',
        '2026-10-21T09:00:00.000Z',
      );
      await insert(
        'guardian-1',
        guardianId,
        GUARDIAN_HEADLINE,
        'https://www.theguardian.com/1',
        '2026-10-21T10:00:00.000Z',
      );

      const rows = db
        .prepare('SELECT id FROM stories ORDER BY id ASC')
        .all() as Array<{ id: number }>;

      const clusterId = await repository.createClusterWithStory(
        {
          slug: 'story-cli-under-test',
          canonicalHeadline: BBC_HEADLINE,
          canonicalExcerpt: null,
          primarySectionId: 2,
          sectionConfidence: 0.8,
          sectionMethod: 'lexicon',
          publishedAt: '2026-10-21T09:00:00.000Z',
          outletCount: 1,
          mentionCount: 1,
          trendingScore: 4,
        },
        rows[0].id,
        bbcId,
        BBC_HEADLINE,
        'https://www.bbc.co.uk/news/1',
        '2026-10-21T09:00:00.000Z',
      );
      await repository.addStoryToCluster(
        clusterId,
        rows[1].id,
        guardianId,
        GUARDIAN_HEADLINE,
        'https://www.theguardian.com/1',
        '2026-10-21T10:00:00.000Z',
        false,
      );
      const storyId = rows[1].id;

      // The tool runs as a command, exactly as an operator would run it.
      const outcome = spawnSync(
        process.execPath,
        [TSX_CLI, CLI_SCRIPT, String(clusterId), String(storyId)],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, MERIDIAN_D1_LOCAL_PATH: databasePath },
          encoding: 'utf8',
        },
      );

      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('Split complete.');
      expect(outcome.stdout).toContain('Correction note published:');
      expect(outcome.stdout).toContain('The Guardian');

      // The database behind it really changed.
      const moved = db
        .prepare('SELECT cluster_id FROM stories WHERE id = ?')
        .get(storyId) as { cluster_id: number };
      expect(moved.cluster_id).not.toBe(clusterId);

      const clusters = db
        .prepare('SELECT COUNT(*) AS n FROM clusters')
        .get() as { n: number };
      expect(clusters.n).toBe(2);

      const attribution = db
        .prepare('SELECT COUNT(*) AS n FROM story_sources')
        .get() as { n: number };
      expect(attribution.n).toBe(2);

      const correction = db
        .prepare('SELECT correction_note FROM corrections')
        .get() as { correction_note: string };
      expect(correction.correction_note).toContain('Correction (');
      expect(correction.correction_note).toContain('The Guardian');
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses to run without both arguments', () => {
    const outcome = spawnSync(process.execPath, [TSX_CLI, CLI_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('Usage:');
  });
});
