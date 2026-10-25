/**
 * Upload rendered story pages to R2.
 *
 * OPS-11: Story pages pre-rendered to HTML, stored in R2, served by edge Worker.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;
const REPO_ROOT = join(__dirname, '..', '..');

async function uploadToR2(bucketName, key, body) {
  const CF_API_TOKEN = process.env.CF_API_TOKEN;
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    throw new Error('Missing CF_API_TOKEN or CF_ACCOUNT_ID');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${bucketName}/objects/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed: ${response.status} — ${text}`);
  }

  return response;
}

/**
 * Walk directory and upload all .html files to R2 under story/{slug}/index.html
 */
async function main() {
  const distDir = process.argv[2] ?? join(REPO_ROOT, 'apps', 'site', 'dist');
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!bucketName) {
    throw new Error('R2_BUCKET_NAME environment variable required');
  }

  const storyDir = join(distDir, 'story');
  if (!require('node:fs').existsSync(storyDir)) {
    console.log('No story directory found, nothing to upload');
    return;
  }

  const slugs = readdirSync(storyDir);
  console.log(`Found ${slugs.length} story slugs to upload`);

  let uploaded = 0;
  let failed = 0;

  for (const slug of slugs) {
    const indexHtml = join(storyDir, slug, 'index.html');
    if (!require('node:fs').existsSync(indexHtml)) continue;

    const html = readFileSync(indexHtml);
    const key = `story/${slug}/index.html`;

    try {
      await uploadToR2(bucketName, key, html);
      uploaded++;
    } catch (err) {
      console.error(`Failed to upload ${key}: ${err.message}`);
      failed++;
    }
  }

  console.log(`Upload complete: ${uploaded} uploaded, ${failed} failed`);
}

function require(name) {
  return import(name);
}

main().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
