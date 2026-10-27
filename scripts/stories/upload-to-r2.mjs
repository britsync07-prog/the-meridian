/**
 * Upload rendered story pages to R2, then exclude them from Static Assets.
 */

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
async function uploadToR2(accountId, apiToken, bucketName, key, file) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: readFileSync(file),
      signal: AbortSignal.timeout(45_000),
    });
    if (response.ok) return;
    if (attempt === 3) throw new Error(`R2 upload failed for ${key}: ${response.status} ${await response.text()}`);
  }
}

async function uploadAll(accountId, apiToken, bucketName, objects) {
  const concurrency = 8;
  for (let start = 0; start < objects.length; start += concurrency) {
    await Promise.all(objects.slice(start, start + concurrency).map(({ key, file }) => uploadToR2(accountId, apiToken, bucketName, key, file)));
  }
}

async function main() {
  const distDir = process.argv[2] ?? join(REPO_ROOT, 'apps', 'site', 'dist');
  const bucketName = process.env.R2_BUCKET_NAME;
  const accountId = process.env.CF_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
  if (!bucketName) throw new Error('R2_BUCKET_NAME environment variable required');
  if (!accountId || !apiToken) throw new Error('Cloudflare account ID and API token are required');

  const storyDir = join(distDir, 'story');
  const objects = [];
  if (existsSync(storyDir)) {
    for (const slug of readdirSync(storyDir)) {
      const file = join(storyDir, slug, 'index.html');
      if (!existsSync(file)) continue;
      objects.push({ key: `story/${slug}/index.html`, file });
    }
  }

  const mediaDir = join(distDir, 'media');
  if (existsSync(mediaDir)) {
    for (const file of readdirSync(mediaDir)) {
      if (!/^[a-f0-9]{64}-(480|960|1440)\.webp$/.test(file)) continue;
      objects.push({ key: `media/${file}`, file: join(mediaDir, file) });
    }
  }
  const ogDir = join(distDir, 'og');
  if (existsSync(ogDir)) {
    for (const file of readdirSync(ogDir)) {
      if (!/^[a-z0-9_-]+\.jpg$/.test(file)) continue;
      objects.push({ key: `og/${file}`, file: join(ogDir, file) });
    }
  }
  await uploadAll(accountId, apiToken, bucketName, objects);
  if (existsSync(storyDir)) rmSync(storyDir, { recursive: true, force: true });
  if (existsSync(mediaDir)) rmSync(mediaDir, { recursive: true, force: true });
  if (existsSync(ogDir)) rmSync(ogDir, { recursive: true, force: true });
  console.log(`Upload complete: ${objects.length} story page and image object(s) uploaded to R2.`);
}

main().catch((error) => {
  console.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
