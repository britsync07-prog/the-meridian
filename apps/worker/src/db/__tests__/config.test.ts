import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { resolveDatabaseId, type MeridianEnv } from '../config';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const WRANGLER_PATH = path.join(REPO_ROOT, 'apps', 'worker', 'wrangler.jsonc');

function workerEnv(databaseId: string): MeridianEnv {
  return { DB: {} as MeridianEnv['DB'], R2: {} as MeridianEnv['R2'], KV: {} as MeridianEnv['KV'], MERIDIAN_DB_ID: databaseId };
}

describe('the deployed D1 identity', () => {
  it('keeps the one Wrangler binding and runtime variable identical', () => {
    const source = readFileSync(WRANGLER_PATH, 'utf8');
    const bindingIds = [...source.matchAll(/"database_id"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
    const variable = source.match(/"MERIDIAN_DB_ID"\s*:\s*"([^"]+)"/)?.[1];

    expect(bindingIds).toHaveLength(1);
    expect(variable).toBe(bindingIds[0]);
    expect(variable?.trim()).not.toBe('');
    expect(resolveDatabaseId(workerEnv(variable ?? ''))).toBe(bindingIds[0]);
  });

  it('does not silently accept a blank deployed identity', () => {
    expect(resolveDatabaseId(workerEnv('   '))).toBe('');
  });
});
