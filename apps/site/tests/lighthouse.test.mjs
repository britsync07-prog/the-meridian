import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MS_PER_SEC = Math.pow(10, 3);
const BASE_URL = 'http://localhost:4321';

function runLighthouse(url, outputPath) {
  const lhPath = path.resolve(process.cwd(), 'node_modules', '.bin', 'lighthouse');

  try {
    execFileSync(lhPath, [
      url,
      '--output=json',
      `--output-path=${outputPath}`,
      '--only-categories=performance',
      '--chrome-flags=--no-sandbox',
    ], { stdio: 'pipe', timeout: 60000 });
  } catch (e) {
    throw new Error(`Lighthouse failed: ${e.message}`);
  }

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  fs.unlinkSync(outputPath);
  return report;
}

// D-16: Lighthouse CI assertions for Phase 4 shell
// Asserts LCP < 2.5s, INP/BC-TBT < 200ms, CLS < 0.1

const pages = ['/', '/uk', '/uk/politics', '/story/example-story'];

let allPassed = true;

for (const page of pages) {
  const url = `${BASE_URL}${page}`;
  console.log(`\n=== Lighthouse: ${page} ===`);

  try {
    const outputPath = path.resolve(process.cwd(), 'tests/lighthouse-tmp.json');
    const report = runLighthouse(url, outputPath);
    const lhr = report.lhr || report;

    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity;
    const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity;
    const tbt = lhr.audits['total-blocking-time']?.numericValue ?? Infinity;

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
  } catch (e) {
    console.error(`ERROR for ${page}: ${e.message}`);
    allPassed = false;
  }
}

if (!allPassed) {
  console.error('\n=== Lighthouse CI: FAILED ===');
  process.exit(1);
} else {
  console.log('\n=== Lighthouse CI: PASSED ===');
  process.exit(0);
}
