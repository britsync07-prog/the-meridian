/**
 * Upload rendered story pages to R2, then exclude them from Static Assets.
 */

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function hmac(key, string) {
  return crypto.createHmac('sha256', key).update(string).digest();
}

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac('AWS4' + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

function getContentType(key) {
  if (key.endsWith('.html')) return 'text/html; charset=utf-8';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

async function uploadToR2S3(accountId, accessKeyId, secretAccessKey, bucketName, key, file) {
  const body = readFileSync(file);
  const contentType = getContentType(key);
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, 'auto', 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Host': host,
          'x-amz-date': amzDate,
          'x-amz-content-sha256': payloadHash,
          'Authorization': authorizationHeader,
          'Content-Type': contentType,
        },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return;
      if (response.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      if (attempt === 3) throw new Error(`R2 S3 upload failed for ${key}: ${response.status} ${await response.text()}`);
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

async function uploadToR2Rest(accountId, apiToken, bucketName, key, file) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': getContentType(key),
        },
        body: readFileSync(file),
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return;
      if (response.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 3000));
        continue;
      }
      if (attempt === 3) throw new Error(`R2 REST upload failed for ${key}: ${response.status} ${await response.text()}`);
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}

async function uploadAll(options, objects) {
  const concurrency = options.useS3 ? 32 : 8;
  for (let start = 0; start < objects.length; start += concurrency) {
    const batch = objects.slice(start, start + concurrency);
    await Promise.all(
      batch.map(({ key, file }) => {
        if (options.useS3) {
          return uploadToR2S3(
            options.accountId,
            options.accessKeyId,
            options.secretAccessKey,
            options.bucketName,
            key,
            file,
          );
        }
        return uploadToR2Rest(options.accountId, options.apiToken, options.bucketName, key, file);
      }),
    );
  }
}

async function main() {
  const distDir = process.argv[2] ?? join(REPO_ROOT, 'apps', 'site', 'dist');
  const bucketName = process.env.R2_BUCKET_NAME ?? 'meridian';
  const accountId = process.env.CF_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!bucketName) throw new Error('R2_BUCKET_NAME environment variable required');
  if (!accountId) throw new Error('Cloudflare account ID is required');

  const useS3 = Boolean(accessKeyId && secretAccessKey);
  if (!useS3 && !apiToken) {
    throw new Error('Either Cloudflare API token or R2 S3 access keys are required');
  }

  console.log(`Starting R2 story tier upload (${useS3 ? 'S3 API' : 'REST API'})...`);

  const storyDir = join(distDir, 'story');
  const objects = [];
  if (existsSync(storyDir)) {
    for (const slug of readdirSync(storyDir)) {
      const file = join(storyDir, slug, 'index.html');
      if (!existsSync(file)) continue;
      objects.push({ key: `story/${slug}/index.html`, file });
    }
  }

  // Upload edition-specific story pages
  const editions = ['uk', 'us', 'au', 'ca', 'ie', 'nz', 'in', 'in-hi'];
  for (const ed of editions) {
    const edStoryDir = join(distDir, ed, 'story');
    if (existsSync(edStoryDir)) {
      for (const slug of readdirSync(edStoryDir)) {
        const file = join(edStoryDir, slug, 'index.html');
        if (!existsSync(file)) continue;
        objects.push({ key: `${ed}/story/${slug}/index.html`, file });
      }
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

  console.log(`Found ${objects.length} object(s) to upload to R2.`);
  await uploadAll({ useS3, accountId, accessKeyId, secretAccessKey, apiToken, bucketName }, objects);

  if (existsSync(storyDir)) rmSync(storyDir, { recursive: true, force: true });
  for (const ed of editions) {
    const edStoryDir = join(distDir, ed, 'story');
    if (existsSync(edStoryDir)) rmSync(edStoryDir, { recursive: true, force: true });
  }
  if (existsSync(mediaDir)) rmSync(mediaDir, { recursive: true, force: true });
  if (existsSync(ogDir)) rmSync(ogDir, { recursive: true, force: true });

  console.log(`Upload complete: ${objects.length} story page and image object(s) uploaded to R2.`);
}

main().catch((error) => {
  console.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
