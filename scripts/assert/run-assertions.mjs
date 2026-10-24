#!/usr/bin/env node
/**
 * run-assertions.mjs — CLI runner for Phase 5 build assertions.
 *
 * Loads a snapshot JSON file and runs all OPS-09 through OPS-13 assertions.
 * Exits non-zero if any assertion fails.
 *
 * Usage:
 *   node scripts/assert/run-assertions.mjs [snapshot-path] [build-dir]
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const snapshotPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(REPO_ROOT, 'scripts', 'snapshot', 'latest.json');

const buildDir = process.argv[3]
  ? resolve(process.cwd(), process.argv[3])
  : resolve(REPO_ROOT, 'apps', 'site', 'dist');

// Import assertions dynamically to avoid TS import issues in .mjs
const { runAssertions } = await import('./build-assertions.js');

try {
  console.log(`Running assertions against: ${snapshotPath}`);
  await runAssertions(snapshotPath, buildDir);
  console.log('All assertions passed.');
  process.exit(0);
} catch (err) {
  console.error(`Assertion failed: ${err.message}`);
  process.exit(1);
}
