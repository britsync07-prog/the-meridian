#!/usr/bin/env node
/**
 * generate-snapshot.mjs — D1-to-R2 gzipped JSON snapshot generator.
 *
 * Reads the published state from D1 through the repository module, assembles
 * a single JSON document, gzip-compresses it, and writes it to R2 under
 * `snapshot/{sha256}.json.gz`. A manifest at `snapshot/latest.json` records
 * the hash and generation timestamp.
 *
 * OPS-12: The Astro build reads only from the R2 blob; no D1 binding is
 * opened during static generation. This script runs in CI via the
 * phase5-snapshot.yml workflow.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const CF_API_TOKEN = requireEnv('CF_API_TOKEN');
const CF_ACCOUNT_ID = requireEnv('CF_ACCOUNT_ID');
const DB_ID = requireEnv('CF_D1_DATABASE_ID');
const R2_BUCKET = requireEnv('R2_BUCKET_NAME');

// ---------------------------------------------------------------------------
// D1 snapshot queries (direct SQL — this script runs in CI, not on Worker)
// ---------------------------------------------------------------------------

async function fetchD1Rows(endpoint, sql, params = []) {
  const body = JSON.stringify({ sql, params });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 query failed: ${response.status} — ${text}`);
  }
  const json = await response.json();
  if (json.error) {
    throw new Error(`D1 error: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

async function queryClusters(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT id, slug, canonical_headline, canonical_excerpt, published_at, is_prominent, trending_score, outlet_count, editorial_rank FROM clusters ORDER BY published_at DESC`
  );
}

async function queryStorySources(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT story_id as cluster_id, source_id, rank, headline, url, published_at FROM story_sources ORDER BY story_id, rank`
  );
}

async function querySections(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT id, slug, name, sort_order FROM sections ORDER BY sort_order`
  );
}

async function queryEditions(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT id, slug, name, country_code, language FROM editions ORDER BY id`
  );
}

async function querySources(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT id, slug as source_id, name, feed_url, country_code, language FROM sources WHERE is_active = 1 ORDER BY id`
  );
}

async function queryEditionClusters(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT edition_id, cluster_id FROM edition_clusters ORDER BY edition_id, cluster_id`
  );
}

async function queryClusterSections(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT cluster_id, section_id, confidence, method FROM cluster_sections ORDER BY cluster_id`
  );
}

async function queryClusterTopics(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT cluster_id, topic_id FROM cluster_topics ORDER BY cluster_id, topic_id`
  );
}

async function queryClusterEntities(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT cluster_id, entity_id, is_primary, weight FROM cluster_entities ORDER BY cluster_id, entity_id`
  );
}

async function queryTopics(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT id, slug, name FROM topics ORDER BY id`
  );
}

async function queryEntities(dbId) {
  return fetchD1Rows(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/results`,
    `SELECT id, slug, name, entity_type, country_code FROM entities ORDER BY id`
  );
}

// ---------------------------------------------------------------------------
// R2 upload
// ---------------------------------------------------------------------------

async function uploadToR2(bucket, key, body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${bucket}/objects/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body,
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed: ${response.status} — ${text}`);
  }
}

async function writeManifest(manifest) {
  const manifestPath = path.join(REPO_ROOT, 'scripts', 'snapshot', 'latest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

function writeLocalSnapshot(snapshot) {
  const snapshotPath = path.join(REPO_ROOT, 'scripts', 'snapshot', 'latest.json.gz');
  writeFileSync(snapshotPath, snapshot);
  return snapshotPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Generating snapshot from D1...');

  // Fetch all data in parallel
  const [
    clusters,
    storySources,
    sections,
    editions,
    sources,
    editionClusters,
    clusterSections,
    clusterTopics,
    clusterEntities,
    topics,
    entities,
  ] = await Promise.all([
    queryClusters(DB_ID),
    queryStorySources(DB_ID),
    querySections(DB_ID),
    queryEditions(DB_ID),
    querySources(DB_ID),
    queryEditionClusters(DB_ID),
    queryClusterSections(DB_ID),
    queryClusterTopics(DB_ID),
    queryClusterEntities(DB_ID),
    queryTopics(DB_ID),
    queryEntities(DB_ID),
  ]);

  // Build snapshot document
  const snapshot = {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    editions: editions.results.map((r) => ({
      id: r.slug,
      slug: r.slug,
      name: r.name,
      country_code: r.country_code,
      language: r.language,
    })),
    sections: sections.results.map((r) => ({
      id: r.slug,
      name: r.name,
      sortOrder: r.sort_order,
    })),
    clusters: clusters.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      canonical_headline: r.canonical_headline,
      published_at: r.published_at,
      is_prominent: Boolean(r.is_prominent),
      trending_score: r.trending_score,
      outlet_count: r.outlet_count,
      editorial_rank: r.editorial_rank,
    })),
    story_sources: storySources.results.map((r) => ({
      cluster_id: r.cluster_id,
      source_id: r.source_id,
      rank: r.rank,
      headline: r.headline,
      url: r.url,
      published_at: r.published_at,
    })),
    edition_clusters: editionClusters.results.map((r) => ({
      edition_id: r.edition_id,
      cluster_id: r.cluster_id,
    })),
    cluster_sections: clusterSections.results.map((r) => ({
      cluster_id: r.cluster_id,
      section_id: r.section_id,
      confidence: r.confidence,
      method: r.method,
    })),
    cluster_topics: clusterTopics.results.map((r) => ({
      cluster_id: r.cluster_id,
      topic_id: r.topic_id,
    })),
    cluster_entities: clusterEntities.results.map((r) => ({
      cluster_id: r.cluster_id,
      entity_id: r.entity_id,
      is_primary: Boolean(r.is_primary),
      weight: r.weight,
    })),
    topics: topics.results.map((r) => ({ id: r.id, name: r.name })),
    entities: entities.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      entity_type: r.entity_type,
      country_code: r.country_code,
    })),
    sources: sources.results.map((r) => ({
      id: r.id,
      slug: r.source_id,
      name: r.name,
      feed_url: r.feed_url,
      country_code: r.country_code,
      language: r.language,
    })),
  };

  // Compute hash and compress
  const jsonString = JSON.stringify(snapshot);
  const hash = createHash('sha256').update(jsonString).digest('hex');
  const compressed = gzipSync(Buffer.from(jsonString, 'utf8'));

  console.log(`Snapshot hash: ${hash}`);
  console.log(`Content length: ${jsonString.length} bytes`);
  console.log(`Compressed length: ${compressed.length} bytes`);
  console.log(`Cluster count: ${snapshot.clusters.length}`);

  // Upload to R2
  const objectKey = `snapshot/${hash}.json.gz`;
  console.log(`Uploading to R2: ${objectKey}...`);
  await uploadToR2(R2_BUCKET, objectKey, compressed);
  const localSnapshotPath = writeLocalSnapshot(compressed);

  // Write local manifest
  const manifest = {
    hash,
    generated_at: snapshot.generated_at,
    content_length: jsonString.length,
    compressed_length: compressed.length,
    cluster_count: snapshot.clusters.length,
  };
  await writeManifest(manifest);
  console.log(`Local build snapshot written to ${path.relative(REPO_ROOT, localSnapshotPath)}`);
  console.log('Manifest written to scripts/snapshot/latest.json');
  console.log('Snapshot generation complete.');
}

main().catch((err) => {
  console.error('Snapshot generation failed:', err.message);
  process.exit(1);
});
