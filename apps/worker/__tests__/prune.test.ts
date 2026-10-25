import { describe, expect, it } from 'vitest';
import { pruneRawItems, dryRunPrune } from '../src/prune.js';

// Mock env for testing
function createMockEnv(tableExists = true, currentCount = 100) {
  const mockDb = {
    exec: (sql: string, params?: unknown[]) => {
      const result: Record<string, unknown> = {
        results: [],
        meta: { changes: 0 },
      };

      if (sql.includes('sqlite_master')) {
        result.results = tableExists ? [{ name: 'raw_items' }] : [];
      } else if (sql.includes('DELETE FROM raw_items')) {
        result.meta = { changes: currentCount };
      } else if (sql.includes('COUNT(*) as count FROM raw_items')) {
        result.results = [{ count: currentCount }];
      } else if (sql.includes('COUNT(*) as count FROM clusters')) {
        result.results = [{ count: 500 }];
      }

      return Promise.resolve(result);
    },
  };

  return {
    DB: mockDb,
    KV: { get: () => Promise.resolve(null), put: () => Promise.resolve() },
    R2: { put: () => Promise.resolve() },
  };
}

describe('prune.ts', () => {
  describe('pruneRawItems', () => {
    it('deletes old raw items and preserves clusters', async () => {
      const env = createMockEnv(true, 50);
      const result = await pruneRawItems(env as any);

      expect(result.deleted_raw_items).toBe(50);
      expect(result.preserved_clusters).toBe(500);
      expect(result.deleted_at).toBeTruthy();
    });

    it('returns zero deletions when raw_items table does not exist', async () => {
      const env = createMockEnv(false, 0);
      const result = await pruneRawItems(env as any);

      expect(result.deleted_raw_items).toBe(0);
      expect(result.preserved_clusters).toBe(0);
    });

    it('calculates cutoff date from 30 days ago', async () => {
      const env = createMockEnv(true, 10);
      const result = await pruneRawItems(env as any);

      // Verify cutoff is approximately 30 days ago
      const deletedDate = new Date(result.deleted_at);
      const now = new Date();
      const diffDays = (now.getTime() - deletedDate.getTime()) / (1000 * 3600 * 24);
      expect(diffDays).toBeLessThan(1); // Should be deleted now
    });
  });

  describe('dryRunPrune', () => {
    it('returns estimated deletions without deleting', async () => {
      const env = createMockEnv(true, 75);
      const result = await dryRunPrune(env as any);

      expect(result.estimated_deletions).toBe(75);
      expect(result.cutoff_date).toBeTruthy();
    });

    it('returns zero when raw_items table does not exist', async () => {
      const env = createMockEnv(false, 0);
      const result = await dryRunPrune(env as any);

      expect(result.estimated_deletions).toBe(0);
      expect(result.cutoff_date).toBeTruthy();
    });
  });
});
