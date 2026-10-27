import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MS_PER_SEC = Math.pow(10, 3);
const PORT = 4322;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = 10 * 10 ** 3;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_PATH = path.join(REPO_ROOT, 'apps', 'site', '__fixtures__', 'publication-snapshot.json');

async function startSiteServer() {
  const astro = 'node_modules/astro/bin/astro.mjs';
  const env = { ...process.env, SNAPSHOT_PATH: FIXTURE_PATH };
  execFileSync(process.execPath, [astro, 'build', '--root', 'apps/site'], {
    cwd: REPO_ROOT,
    env,
    stdio: 'pipe',
    timeout: 120000,
  });
  const server = spawn(process.execPath, [
    astro, 'preview', '--root', 'apps/site', '--port', String(PORT), '--host', '127.0.0.1',
  ], {
    cwd: REPO_ROOT,
    env,
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/uk/`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok) return server;
    } catch {
      // Astro has not finished starting yet.
    }
    await new Promise((resolve) => setTimeout(resolve, MS_PER_SEC / 2));
  }

  server.kill();
  throw new Error(`Astro did not start at ${BASE_URL}`);
}

function runLighthouse(url, outputPath) {
  const lhPath = path.resolve(process.cwd(), 'node_modules', 'lighthouse', 'cli', 'index.js');

  try {
    execFileSync(process.execPath, [lhPath,
      url,
      '--output=json',
      `--output-path=${outputPath}`,
      '--only-categories=performance',
      '--chrome-flags=--no-sandbox --headless=new',
      '--max-wait-for-load=15000',
    ], { stdio: 'pipe', timeout: MS_PER_SEC * 90 });
  } catch (e) {
    throw new Error(`Lighthouse failed: ${e.message}`);
  }

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  fs.unlinkSync(outputPath);
  return report;
}

// D-16: Lighthouse CI assertions for Phase 4 shell
// Asserts LCP < 2.5s, INP/BC-TBT < 200ms, CLS < 0.1

const pages = ['/', '/uk/', '/uk/politics/'];
const server = await startSiteServer();

try {
  const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  throw new Error(`Lighthouse requires the site at ${BASE_URL}: ${error instanceof Error ? error.message : String(error)}`);
}

let allPassed = true;

for (const page of pages) {
  const url = `${BASE_URL}${page}`;
  console.log(`\n=== Lighthouse: ${page} ===`);

  try {
    const outputPath = path.resolve(process.cwd(), 'apps/site/tests/lighthouse-tmp.json');
    let lcp = Infinity;
    let cls = Infinity;
    let tbt = Infinity;
    for (let attempt = 0; attempt < 3 && ![lcp, cls, tbt].every(Number.isFinite); attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, MS_PER_SEC));
      const report = runLighthouse(url, outputPath);
      const lhr = report.lhr || report;
      lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity;
      cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity;
      tbt = lhr.audits['total-blocking-time']?.numericValue ?? Infinity;
    }

    console.log(`LCP: ${(lcp / MS_PER_SEC).toFixed(2)}s (target < 2.5s)`);
    console.log(`CLS: ${cls.toFixed(4)} (target < 0.1)`);
    console.log(`TBT: ${tbt.toFixed(0)}ms (target < 200ms)`);

    const lcpOk = lcp < 2500;
    const clsOk = cls < 0.1;
    const tbtOk = tbt < 200;

    if (!lcpOk) { console.error(`FAIL: LCP ${lcp}ms >= 2500ms`); allPassed = false; }
    if (!clsOk) { console.error(`FAIL: CLS ${cls} >= 0.1`); allPassed = false; }
    if (!tbtOk) { console.error(`FAIL: TBT ${tbt}ms >= 200ms`); allPassed = false; }

    if (lcpOk && clsOk && tbtOk) {
      console.log('✓ All Core Web Vitals within threshold');
    }
    await new Promise((resolve) => setTimeout(resolve, MS_PER_SEC));
  } catch (e) {
    console.error(`ERROR for ${page}: ${e.message}`);
    allPassed = false;
  }
}

if (!allPassed) {
  server.kill();
  console.error('\n=== Lighthouse CI: FAILED ===');
  process.exit(1);
} else {
  server.kill();
  console.log('\n=== Lighthouse CI: PASSED ===');
  process.exit(0);
}
