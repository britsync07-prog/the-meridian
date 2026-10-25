/**
 * Upload rendered story pages to R2, then exclude them from Static Assets.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const WRANGLER = join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function uploadToR2(bucketName, key, file) {
  const result = spawnSync(
    process.execPath,
    [WRANGLER, 'r2', 'object', 'put', `${bucketName}/${key}`, '--file', file, '--remote'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `wrangler exited ${result.status}`);
  }
}

function main() {
  const distDir = process.argv[2] ?? join(REPO_ROOT, 'apps', 'site', 'dist');
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) throw new Error('R2_BUCKET_NAME environment variable required');

  const storyDir = join(distDir, 'story');
  if (!existsSync(storyDir)) {
    console.log('No story directory found, nothing to upload');
    return;
  }

  let uploaded = 0;
  for (const slug of readdirSync(storyDir)) {
    const file = join(storyDir, slug, 'index.html');
    if (!existsSync(file)) continue;
    uploadToR2(bucketName, `story/${slug}/index.html`, file);
    uploaded++;
  }

  rmSync(storyDir, { recursive: true, force: true });
  console.log(`Upload complete: ${uploaded} uploaded. Removed static story output.`);
}

try {
  main();
} catch (error) {
  console.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
