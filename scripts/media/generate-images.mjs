#!/usr/bin/env node
/** Generate content-addressed responsive publisher-image variants in CI. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..', '..');
const snapshotPath = process.env.SNAPSHOT_PATH ?? join(root, 'scripts', 'snapshot', 'latest.json.gz');
const outputDir = process.env.MEDIA_OUTPUT_DIR ?? join(root, 'dist', 'media');
const widths = [480, 960, 1440];

async function markImageReady(sourceUrl) {
  const { CF_API_TOKEN, CF_ACCOUNT_ID, CF_D1_DATABASE_ID } = process.env;
  if (!CF_API_TOKEN && !CF_ACCOUNT_ID && !CF_D1_DATABASE_ID) return;
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_D1_DATABASE_ID) {
    throw new Error('CF_API_TOKEN, CF_ACCOUNT_ID, and CF_D1_DATABASE_ID must be set together to publish image readiness');
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: "UPDATE images SET status = 'ready' WHERE source_url = ?", params: [sourceUrl] }),
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.success || !payload.result?.[0]?.success) {
    throw new Error(`Could not mark image ready: ${payload.errors?.[0]?.message ?? `HTTP ${response.status}`}`);
  }
}

async function loadSnapshot() {
  const raw = await readFile(snapshotPath);
  return JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8'));
}

async function main() {
  const snapshot = await loadSnapshot();
  await mkdir(outputDir, { recursive: true });
  const images = snapshot.images ?? [];
  const manifest = [];

  async function generateImage(image) {
    try {
      if (!image.cluster_id || !image.source_url || !/^https?:\/\//.test(image.source_url)) return;
      const key = image.media_key ?? createHash('sha256').update(image.source_url).digest('hex');
      const response = await fetch(image.source_url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      const variants = [];
      for (const width of widths) {
        const filename = `${key}-${width}.webp`;
        await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(outputDir, filename));
        variants.push({ width, path: `media/${filename}` });
      }
      manifest.push({ clusterId: image.cluster_id, sourceUrl: image.source_url, variants });
      await markImageReady(image.source_url).catch((error) => {
        console.warn(`Could not mark image ready: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      // A publisher may hotlink-protect its image; publishing the news page still wins.
      console.warn(`Skipped image ${image.source_url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (let start = 0; start < images.length; start += 6) {
    await Promise.all(images.slice(start, start + 6).map(generateImage));
  }
  manifest.sort((a, b) => a.clusterId - b.clusterId);
  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Generated ${manifest.length} image set(s) in ${outputDir}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
