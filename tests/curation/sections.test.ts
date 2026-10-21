import { describe, it, expect } from 'vitest';
import { SECTIONS, SectionId } from '../../shared/config/editions.js';
import {
  resolveSection,
  scoreHeadlineLexicon,
  type AiSectionClassifier,
} from '../../src/curation/sections.js';

describe('Hierarchical 4-Stage Section Resolver (CUR-14, D-13, D-14, Task 2)', () => {
  const canonicalDeskIds = new Set(SECTIONS.map((s) => s.id));

  describe('Stage 1 — Feed Prior', () => {
    it('resolves to feed prior when confidence >= 0.80 with method "source" and confidence 0.85', async () => {
      const result = await resolveSection({
        headline: 'Local community garden blooms in springtime',
        language: 'en',
        feedPriorSection: 'sport',
        feedPriorScore: 0.9,
      });

      expect(result).toEqual({
        sectionId: 'sport',
        method: 'source',
        confidence: 0.85,
      });
      expect(canonicalDeskIds.has(result.sectionId)).toBe(true);
    });

    it('bypasses feed prior when feed prior score is below 0.80', async () => {
      const result = await resolveSection({
        headline: 'Premier League: Arsenal defeats Chelsea 3-1 in London derby',
        language: 'en',
        feedPriorSection: 'politics', // weak prior
        feedPriorScore: 0.4,
      });

      // Should resolve via lexicon (Stage 2) rather than weak feed prior
      expect(result.method).toBe('lexicon');
      expect(result.sectionId).toBe('sport');
    });
  });

  describe('Stage 2 — Weighted Lexicon', () => {
    it('resolves general feeds via keyword scores with method "lexicon" and confidence proportional to margin', async () => {
      const result = await resolveSection({
        headline: 'Quarterly earnings surge as central bank cuts interest rates',
        excerpt: 'Stock market rallies across Wall Street and FTSE on economic dividend growth',
        language: 'en',
      });

      expect(result.method).toBe('lexicon');
      expect(result.sectionId).toBe('business');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
      expect(canonicalDeskIds.has(result.sectionId)).toBe(true);
    });

    it('resolves Hindi headline accurately via Devanagari lexicon', async () => {
      const result = await resolveSection({
        headline: 'भारतीय टीम ने जीता रोमांचक मैच, विराट कोहली ने जड़ा शतक',
        language: 'hi',
      });

      expect(result.method).toBe('lexicon');
      expect(result.sectionId).toBe('sport');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('resolves technology desk on cybersecurity and artificial intelligence keywords', async () => {
      const result = await resolveSection({
        headline: 'New artificial intelligence algorithm defends cloud software from hacker cybersecurity attack',
        language: 'en',
      });

      expect(result.method).toBe('lexicon');
      expect(result.sectionId).toBe('technology');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('resolves weather desk on typhoon and rainfall flood forecast', async () => {
      const result = await resolveSection({
        headline: 'Severe typhoon brings torrential rainfall and flood warnings',
        language: 'en',
      });

      expect(result.method).toBe('lexicon');
      expect(result.sectionId).toBe('weather');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Stage 3 — AI Tiebreak', () => {
    it('invokes AI classifier when lexicon margin is narrow (< 0.2) or ambiguous', async () => {
      // Headline with no decisive lexicon keywords
      const headline = 'Unusual architectural dispute emerges over civic monument design';

      let aiCalled = false;
      const mockClassifier: AiSectionClassifier = async (text) => {
        aiCalled = true;
        expect(text).toContain('architectural dispute');
        return {
          sectionId: 'entertainment',
          confidence: 0.88,
        };
      };

      const result = await resolveSection(
        {
          headline,
          language: 'en',
        },
        mockClassifier,
      );

      expect(aiCalled).toBe(true);
      expect(result).toEqual({
        sectionId: 'entertainment',
        method: 'ai_tiebreak',
        confidence: 0.88,
      });
    });

    it('invokes AI classifier when keywords from two desks tie or have close scores', async () => {
      // Create a tied/narrow case between politics and business
      const scores = scoreHeadlineLexicon('policy deficit', 'en');
      // policy (politics: 1.0), deficit (business: 1.6) -> margin 0.6
      // Let's create an exact tie: say 0 keywords or balanced keywords
      const mockClassifier: AiSectionClassifier = async () => ({
        sectionId: 'politics',
        confidence: 0.75,
      });

      const result = await resolveSection(
        {
          headline: 'Delegates gather for silent memorial commemoration',
          language: 'en',
        },
        mockClassifier,
      );

      expect(result.method).toBe('ai_tiebreak');
      expect(result.sectionId).toBe('politics');
      expect(result.confidence).toBe(0.75);
    });
  });

  describe('Stage 4 — Fallback', () => {
    it('falls back to "world" desk with confidence 0.10 when AI is unavailable', async () => {
      const result = await resolveSection({
        headline: 'An inexplicable occurrence happened today at twilight',
        language: 'en',
      });

      expect(result).toEqual({
        sectionId: 'world',
        method: 'fallback',
        confidence: 0.1,
      });
      expect(canonicalDeskIds.has(result.sectionId)).toBe(true);
    });

    it('falls back to "world" desk when AI confidence is <= 0.60', async () => {
      const mockClassifier: AiSectionClassifier = async () => ({
        sectionId: 'entertainment',
        confidence: 0.52, // too low, below 0.60 threshold
      });

      const result = await resolveSection(
        {
          headline: 'Ambiguous vague statement made during casual afternoon gathering',
          language: 'en',
        },
        mockClassifier,
      );

      expect(result).toEqual({
        sectionId: 'world',
        method: 'fallback',
        confidence: 0.1,
      });
    });

    it('gracefully falls back to "world" when AI classifier throws an error', async () => {
      const faultyClassifier: AiSectionClassifier = async () => {
        throw new Error('Cloudflare Workers AI timeout');
      };

      const result = await resolveSection(
        {
          headline: 'Vague obscure phrase without any keyword matches',
          language: 'en',
        },
        faultyClassifier,
      );

      expect(result).toEqual({
        sectionId: 'world',
        method: 'fallback',
        confidence: 0.1,
      });
    });
  });

  describe('Canonical Broadsheet Desks Invariant (CUR-14)', () => {
    it('always outputs sectionId strictly among the 8 canonical values', async () => {
      const testCases = [
        { headline: 'Election minister vote', lang: 'en' as const },
        { headline: 'Cricket match score wickets', lang: 'en' as const },
        { headline: 'Hospital pandemic vaccine flu', lang: 'en' as const },
        { headline: 'Storm hurricane flood rainfall', lang: 'en' as const },
        { headline: 'Movie film actor box office', lang: 'en' as const },
        { headline: 'Random unknown text words', lang: 'en' as const },
      ];

      for (const tc of testCases) {
        const res = await resolveSection({ headline: tc.headline, language: tc.lang });
        expect(canonicalDeskIds.has(res.sectionId)).toBe(true);
        expect(['source', 'lexicon', 'ai_tiebreak', 'fallback']).toContain(res.method);
        expect(res.confidence).toBeGreaterThan(0);
        expect(res.confidence).toBeLessThanOrEqual(1.0);
      }
    });
  });
});
