/**
 * Build-in-progress guard — prevents overlapping CI builds.
 *
 * OPS-16: A build-in-progress guard prevents a second overlapping build from starting.
 * Uses R2 lock file with TTL.
 */

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = '.build-lock';
const LOCK_TTL_MS = 30 * 60 * 10 ** 3; // 30 minutes

interface LockData {
  pid: number;
  started_at: string;
  workflow_run_id: number;
}

/**
 * Check if a build is currently in progress.
 * Returns true if lock exists and is not expired.
 */
export function isBuildInProgress(): boolean {
  try {
    const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as LockData;
    const elapsed = Date.now() - new Date(lockData.started_at).getTime();

    if (elapsed > LOCK_TTL_MS) {
      console.log(`Build lock expired (${elapsed}ms > ${LOCK_TTL_MS}ms), cleaning up`);
      unlinkSync(LOCK_FILE);
      return false;
    }

    console.log(`Build already in progress (PID ${lockData.pid}, started ${elapsed}ms ago)`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire build lock.
 * Throws if lock cannot be acquired.
 */
export function acquireBuildLock(workflowRunId: number): void {
  if (isBuildInProgress()) {
    throw new Error('Build already in progress. Refusing to start overlapping build.');
  }

  const lockData: LockData = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    workflow_run_id: workflowRunId,
  };

  writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2), 'utf8');
  console.log(`Build lock acquired (PID ${process.pid})`);
}

/**
 * Release build lock.
 * Called on build completion (success or failure).
 */
export function releaseBuildLock(): void {
  try {
    unlinkSync(LOCK_FILE);
    console.log('Build lock released');
  } catch {
    // Lock file doesn't exist, ignore
  }
}

/**
 * Main CLI entry point.
 */
export async function main(): Promise<void> {
  const action = process.argv[2];
  const workflowRunId = parseInt(process.env.GITHUB_RUN_ID ?? '0', 10);

  switch (action) {
    case 'acquire':
      acquireBuildLock(workflowRunId);
      break;
    case 'release':
      releaseBuildLock();
      break;
    case 'check':
      if (isBuildInProgress()) {
        console.log('BUILD_IN_PROGRESS=true');
        process.exit(1);
      } else {
        console.log('BUILD_IN_PROGRESS=false');
        process.exit(0);
      }
      break;
    default:
      console.error('Usage: build-guard.ts [acquire|release|check]');
      process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Build guard failed:', err);
    process.exit(1);
  });
}
