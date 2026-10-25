import { describe, expect, it } from 'vitest';
import { calculateMetrics, checkPaidPlanDecision } from '../src/audit.js';

// Mock env for testing
function createMockEnv() {
  const mockResults: Record<string, unknown> = {};
  const mockDb = {
    exec: (sql: string, params?: unknown[]) => {
      // Return mock results based on query
      const result: Record<string, unknown> = {
        results: [],
        meta: { changes: 0 },
      };

      if (sql.includes('SUM(rows_read)')) {
        result.results = [{ total: 1500000 }];
      } else if (sql.includes('SUM(rows_written)')) {
        result.results = [{ total: 5000 }];
      } else if (sql.includes('pragma_page_count')) {
        result.results = [{ bytes: 25 * 1024 * 1024 }]; // 25MB
      } else if (sql.includes('sqlite_master')) {
        result.results = [{ name: 'raw_items' }];
      }

      return Promise.resolve(result);
    },
  };

  const mockKV = {
    get: (key: string) => Promise.resolve(null),
    put: (key: string, value: string) => Promise.resolve(),
  };

  const mockR2 = {
    put: (key: string, value: unknown) => Promise.resolve(),
  };

  return { DB: mockDb, KV: mockKV, R2: mockR2 };
}

describe('audit.ts', () => {
  describe('calculateMetrics', () => {
    it('calculates D1 rows read percentage correctly', async () => {
      const env = createMockEnv();
      const metrics = await calculateMetrics(env as any);

      const rowsReadMetric = metrics.find(m => m.id === 'd1_rows_read_per_day');
      expect(rowsReadMetric).toBeDefined();
      expect(rowsReadMetric!.value).toBe(1500000);
      expect(rowsReadMetric!.percentage).toBeCloseTo(30, 0); // 1.5M / 5M
      expect(rowsReadMetric!.status).toBe('ok');
    });

    it('flags warning at 50% threshold', async () => {
      const env = createMockEnv();
      // Override to simulate 50%+ usage
      env.DB.exec = (sql: string) => {
        const result: Record<string, unknown> = { results: [], meta: { changes: 0 } };
        if (sql.includes('SUM(rows_read)')) {
          result.results = [{ total: 2500001 }]; // ~50% of 5M
        } else if (sql.includes('SUM(rows_written)')) {
          result.results = [{ total: 50000 }];
        } else if (sql.includes('pragma_page_count')) {
          result.results = [{ bytes: 250 * 1024 * 1024 }]; // 250MB
        }
        return Promise.resolve(result);
      };

      const metrics = await calculateMetrics(env as any);
      const rowsReadMetric = metrics.find(m => m.id === 'd1_rows_read_per_day');
      expect(rowsReadMetric!.threshold_50).toBe(true);
      expect(rowsReadMetric!.status).toBe('warning');
    });

    it('flags critical at 75% threshold', async () => {
      const env = createMockEnv();
      env.DB.exec = (sql: string) => {
        const result: Record<string, unknown> = { results: [], meta: { changes: 0 } };
        if (sql.includes('SUM(rows_read)')) {
          result.results = [{ total: 4000000 }]; // 80% of 5M
        } else if (sql.includes('SUM(rows_written)')) {
          result.results = [{ total: 50000 }];
        } else if (sql.includes('pragma_page_count')) {
          result.results = [{ bytes: 250 * 1024 * 1024 }];
        }
        return Promise.resolve(result);
      };

      const metrics = await calculateMetrics(env as any);
      const rowsReadMetric = metrics.find(m => m.id === 'd1_rows_read_per_day');
      expect(rowsReadMetric!.threshold_75).toBe(true);
      expect(rowsReadMetric!.status).toBe('critical');
    });
  });

  describe('checkPaidPlanDecision', () => {
    it('returns stay_free when no critical metrics', () => {
      const metrics = [
        { id: 'test', resource: 'Test', value: 10, unit: 'units', period: 'day', percentage: 10, threshold_50: false, threshold_75: false, status: 'ok' as const },
      ];

      const decision = checkPaidPlanDecision(metrics);
      expect(decision.triggered).toBe(false);
      expect(decision.recommendation).toBe('stay_free');
    });

    it('returns upgrade_recommended when critical metrics exist', () => {
      const metrics = [
        { id: 'test', resource: 'Test', value: 4000000, unit: 'rows', period: 'day', percentage: 80, threshold_50: true, threshold_75: true, status: 'critical' as const },
      ];

      const decision = checkPaidPlanDecision(metrics);
      expect(decision.triggered).toBe(true);
      expect(decision.recommendation).toBe('upgrade_recommended');
    });
  });
});
