#!/usr/bin/env node
/** Generate permanent 1200x630 JPEG social cards from the publication snapshot. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..', '..');
const snapshotPath = process.env.SNAPSHOT_PATH ?? join(root, 'scripts', 'snapshot', 'latest.json.gz');
const outputDir = process.env.OG_OUTPUT_DIR ?? join(root, 'apps', 'site', 'dist', 'og');

function escapeXml(value) { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' })[character]); }
function titleLines(title) {
  const words = title.split(/\s+/); const lines = []; let line = '';
  for (const word of words) { if (`${line} ${word}`.trim().length > 34 && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
  if (line) lines.push(line); return lines.slice(0, 3);
}

const raw = await readFile(snapshotPath);
const snapshot = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8'));
await mkdir(outputDir, { recursive: true });
for (const story of snapshot.clusters) {
  const lines = titleLines(story.canonical_headline).map((line, index) => `<text x="84" y="${230 + index * 110}" font-size="76" font-family="Georgia,serif" font-weight="700">${escapeXml(line)}</text>`).join('');
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#fafaf7"/><rect x="0" width="20" height="630" fill="#c0392b"/><text x="84" y="108" font-size="34" font-family="Arial,sans-serif" fill="#5c5853">THE MERIDIAN · ${story.outlet_count} OUTLETS COVERING</text><g fill="#1a1a1a">${lines}</g><text x="84" y="560" font-size="30" font-family="Arial,sans-serif" fill="#5c5853">Automatically curated daily news</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(join(outputDir, `${story.slug}.jpg`));
}
await writeFile(join(outputDir, 'manifest.json'), JSON.stringify({ count: snapshot.clusters.length }));
console.log(`Generated ${snapshot.clusters.length} Open Graph images.`);
