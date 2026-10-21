/**
 * tests/curation/ranking.test.ts — Unit tests for Broadsheet Trending Score and Recency Decay.
 *
 * Requirements: CUR-07, CUR-10, D-09, D-10.
 */

import { describe, expect, it } from 'vitest';
import {
  calculateAgeHours,
  calculateTrendingScore,
  evaluateEditorialRank,
} from '../../src/curation/ranking';

describe('Broadsheet Trending Score and Recency Decay', () => {
  const BASE_TIME = '2026-10-21T12:00:00.000Z';

  describe('calculateAgeHours', () => {
    it('computes exact elapsed hours between publishedAt and nowIso', () => {
      const publishedAt = '2026-10-21T00:00:00.000Z';
      const nowIso = '2026-10-21T18:00:00.000Z';
      expect(calculateAgeHours(publishedAt, nowIso)).toBe(18.0);
    });

    it('clamps negative elapsed time to 0 for future timestamps', () => {
      const publishedAt = '2026-10-21T15:00:00.000Z';
      const nowIso = '2026-10-21T12:00:00.000Z';
      expect(calculateAgeHours(publishedAt, nowIso)).toBe(0);
    });

    it('returns 0 for invalid date strings safely', () => {
      expect(calculateAgeHours('invalid-date', BASE_TIME)).toBe(0);
    });
  });

  describe('Canonical Formula & 18-Hour Recency Decay (CUR-07, D-09)', () => {
    it('evaluates exact canonical formula components', () => {
      // outlets = 3, mentions = 3, age = 0h, sections = 1
      // outletTerm = 3.0 * log2(4) = 6.0
      // mentionTerm = 1.0 * log2(4) = 2.0
      // recencyTerm = 5.0 * 0.5^0 = 5.0
      // sectionTerm = 0.8 * min(1, 0) = 0.0
      // expected sum = 13.0
      const score = calculateTrendingScore({
        distinctOutlets: 3,
        totalMentions: 3,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
        distinctSections: 1,
      });

      expect(score).toBe(13.0);
    });

    it('enforces exact 18-hour half-life exponential decay (age = 0h, 9h, 18h, 36h, 72h)', () => {
      // Single outlet, 1 mention, 1 section (so base non-recency score = 3*1 + 1*1 + 0 = 4.0)
      const testCases = [
        { ageHours: 0, expectedRecency: 5.0, expectedTotal: 9.0 },
        { ageHours: 9, expectedRecency: 5.0 * Math.pow(0.5, 9 / 18), expectedTotal: 4.0 + 5.0 * Math.pow(0.5, 0.5) },
        { ageHours: 18, expectedRecency: 2.5, expectedTotal: 6.5 },
        { ageHours: 36, expectedRecency: 1.25, expectedTotal: 5.25 },
        { ageHours: 72, expectedRecency: 0.3125, expectedTotal: 4.313 },
      ];

      for (const tc of testCases) {
        const publishedDate = new Date(new Date(BASE_TIME).getTime() - tc.ageHours * 3600 * 1000).toISOString();
        const score = calculateTrendingScore({
          distinctOutlets: 1,
          totalMentions: 1,
          publishedAt: publishedDate,
          nowIso: BASE_TIME,
          distinctSections: 1,
        });

        expect(score).toBeCloseTo(tc.expectedTotal, 3);
      }
    });

    it('satisfies CUR-07 multi-outlet weighting: distinct outlets heavily out-weigh duplicate mentions', () => {
      // 5 distinct outlets (5 mentions)
      const multiOutletScore = calculateTrendingScore({
        distinctOutlets: 5,
        totalMentions: 5,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
        distinctSections: 1,
      });

      // 1 outlet mentioned 5 times
      const singleOutletSpamScore = calculateTrendingScore({
        distinctOutlets: 1,
        totalMentions: 5,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
        distinctSections: 1,
      });

      // Outlet term for 5 outlets: 3.0 * log2(6) = 7.755
      // Outlet term for 1 outlet: 3.0 * log2(2) = 3.000
      // Multi-outlet score should be significantly higher (~15.339 vs ~10.585)
      expect(multiOutletScore).toBeGreaterThan(singleOutletSpamScore + 4.0);

      // Verify the outlet term component directly
      const fiveOutletsTerm = 3.0 * Math.log2(1 + 5);
      const oneOutletFiveMentionsTerm = 1.0 * Math.log2(1 + 5);
      expect(fiveOutletsTerm).toBeCloseTo(7.755, 2);
      expect(oneOutletFiveMentionsTerm).toBeCloseTo(2.585, 2);
    });

    it('awards section diversity bonus only when distinct desks >= 2', () => {
      const oneSectionScore = calculateTrendingScore({
        distinctOutlets: 2,
        totalMentions: 2,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
        distinctSections: 1,
      });

      const twoSectionsScore = calculateTrendingScore({
        distinctOutlets: 2,
        totalMentions: 2,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
        distinctSections: 2,
      });

      const threeSectionsScore = calculateTrendingScore({
        distinctOutlets: 2,
        totalMentions: 2,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
        distinctSections: 3,
      });

      // Bonus for 2 sections is exactly 0.8
      expect(twoSectionsScore - oneSectionScore).toBeCloseTo(0.8, 3);

      // Bonus is capped at 0.8 for 3+ sections via min(1, sections - 1)
      expect(threeSectionsScore).toBe(twoSectionsScore);
    });

    it('clamps negative or zero inputs gracefully', () => {
      const score = calculateTrendingScore({
        distinctOutlets: 0,
        totalMentions: 0,
        publishedAt: BASE_TIME,
        nowIso: BASE_TIME,
      });

      // distinctOutlets clamped to 1: 3.0 * log2(2) = 3.0
      // totalMentions clamped to distinctOutlets (1): 1.0 * log2(2) = 1.0
      // recency at 0h: 5.0
      // distinctSections default 1: 0.0
      // total = 9.0
      expect(score).toBe(9.0);
    });
  });

  describe("Editor's Picks Qualification Gate (CUR-10, D-10)", () => {
    it('unconditionally returns null for single-outlet clusters (distinctOutlets < 2)', () => {
      expect(evaluateEditorialRank(1)).toBeNull();
      expect(evaluateEditorialRank(1, 1)).toBeNull();
      expect(evaluateEditorialRank(1, 5)).toBeNull();
      expect(evaluateEditorialRank(0)).toBeNull();
    });

    it('allows qualification for multi-outlet clusters (distinctOutlets >= 2)', () => {
      expect(evaluateEditorialRank(2)).toBe(1);
      expect(evaluateEditorialRank(2, 3)).toBe(3);
      expect(evaluateEditorialRank(5, 2)).toBe(2);
      expect(evaluateEditorialRank(10, null)).toBe(1);
    });
  });
});
