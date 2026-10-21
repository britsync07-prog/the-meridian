import { describe, it, expect } from 'vitest';
import {
  tokenizeHeadline,
  computeSimHash,
  computeHammingDistance,
  fnv1a64,
} from '../../src/curation/simhash.js';

describe('SimHash-64 & LSH Bands (CUR-01, CUR-15)', () => {
  describe('tokenizeHeadline', () => {
    it('splits English headlines and strips generic breaking news noise and stop words', () => {
      const headline = 'BREAKING: Federal Reserve cuts interest rates by 25 basis points - live update';
      const tokens = tokenizeHeadline(headline, 'en');

      // Generic noise tokens ("breaking", "live", "update") and stop words ("by") should be stripped
      expect(tokens).not.toContain('breaking');
      expect(tokens).not.toContain('live');
      expect(tokens).not.toContain('update');
      expect(tokens).not.toContain('by');

      // Meaningful substantive tokens must be retained
      expect(tokens).toContain('federal');
      expect(tokens).toContain('reserve');
      expect(tokens).toContain('cuts');
      expect(tokens).toContain('interest');
      expect(tokens).toContain('rates');
      expect(tokens).toContain('25');
      expect(tokens).toContain('basis');
      expect(tokens).toContain('points');
    });

    it('strips all specified English noise tokens: watch, video, news, exclusive, report', () => {
      const headline = 'Watch Video Exclusive Report: News on Downing Street meeting';
      const tokens = tokenizeHeadline(headline, 'en');

      expect(tokens).not.toContain('watch');
      expect(tokens).not.toContain('video');
      expect(tokens).not.toContain('exclusive');
      expect(tokens).not.toContain('report');
      expect(tokens).not.toContain('news');
      expect(tokens).toContain('downing');
      expect(tokens).toContain('street');
      expect(tokens).toContain('meeting');
    });

    it('splits Hindi headlines and strips Devanagari generic noise and stop words', () => {
      const headline = 'ताज़ा खबर: दिल्ली में भारी बारिश, लाइव अपडेट और विशेष रिपोर्ट';
      const tokens = tokenizeHeadline(headline, 'hi');

      // Generic noise tokens and stop words should be stripped
      expect(tokens).not.toContain('ताज़ा');
      expect(tokens).not.toContain('खबर');
      expect(tokens).not.toContain('में');
      expect(tokens).not.toContain('लाइव');
      expect(tokens).not.toContain('अपडेट');
      expect(tokens).not.toContain('और');
      expect(tokens).not.toContain('विशेष');

      // Key content words preserved
      expect(tokens).toContain('दिल्ली');
      expect(tokens).toContain('भारी');
      expect(tokens).toContain('बारिश');
    });

    it('returns empty array for empty or whitespace-only inputs', () => {
      expect(tokenizeHeadline('', 'en')).toEqual([]);
      expect(tokenizeHeadline('   ', 'en')).toEqual([]);
      expect(tokenizeHeadline('Breaking Live Update', 'en')).toEqual([]);
    });
  });

  describe('fnv1a64 hash primitive', () => {
    it('produces deterministic 64-bit BigInt values for strings', () => {
      const hash1 = fnv1a64('federal');
      const hash2 = fnv1a64('federal');
      const hash3 = fnv1a64('reserve');

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('bigint');
      expect(hash1).not.toBe(hash3);
      expect(hash1).toBeGreaterThan(0n);
      expect(hash1).toBeLessThanOrEqual(0xffffffffffffffffn);
    });

    it('handles UTF-8 multi-byte characters accurately and deterministically', () => {
      const hashEn = fnv1a64('Delhi');
      const hashHi = fnv1a64('दिल्ली');

      expect(hashHi).toBe(fnv1a64('दिल्ली'));
      expect(hashHi).not.toBe(hashEn);
      expect(hashHi).toBeLessThanOrEqual(0xffffffffffffffffn);
    });
  });

  describe('computeSimHash & 4x16-bit Band Partitioning', () => {
    it('computes deterministic 64-bit BigInt with 4 unsigned 16-bit bands', () => {
      const headline = 'Chancellor announces autumn budget with public spending freeze';
      const result = computeSimHash(headline, 'en');

      expect(typeof result.simhash).toBe('bigint');
      expect(result.simhash).toBeGreaterThan(0n);
      expect(result.simhash).toBeLessThanOrEqual(0xffffffffffffffffn);

      // Verify each band is strictly an unsigned 16-bit integer (0..65535)
      expect(result.band0).toBeGreaterThanOrEqual(0);
      expect(result.band0).toBeLessThanOrEqual(65535);
      expect(result.band1).toBeGreaterThanOrEqual(0);
      expect(result.band1).toBeLessThanOrEqual(65535);
      expect(result.band2).toBeGreaterThanOrEqual(0);
      expect(result.band2).toBeLessThanOrEqual(65535);
      expect(result.band3).toBeGreaterThanOrEqual(0);
      expect(result.band3).toBeLessThanOrEqual(65535);

      // Verify that bands perfectly reconstruct the 64-bit simhash
      const reconstructed =
        (BigInt(result.band0) << 48n) |
        (BigInt(result.band1) << 32n) |
        (BigInt(result.band2) << 16n) |
        BigInt(result.band3);

      expect(reconstructed).toBe(result.simhash);
    });

    it('returns zero hash and zero bands for empty token lists', () => {
      const result = computeSimHash([]);
      expect(result.simhash).toBe(0n);
      expect(result.band0).toBe(0);
      expect(result.band1).toBe(0);
      expect(result.band2).toBe(0);
      expect(result.band3).toBe(0);
      expect(result.tokens).toEqual([]);
    });

    it('accepts pre-tokenized array of string tokens', () => {
      const tokens = ['earthquake', 'strikes', 'tokyo', 'coast'];
      const result = computeSimHash(tokens);

      expect(result.tokens).toEqual(tokens);
      expect(result.simhash).toBeGreaterThan(0n);
    });
  });

  describe('computeHammingDistance & Fingerprint Proximity', () => {
    it('calculates exact bitwise Hamming distance between two 64-bit hashes', () => {
      expect(computeHammingDistance(0n, 0n)).toBe(0);
      expect(computeHammingDistance(0n, 1n)).toBe(1);
      expect(computeHammingDistance(0n, 0xffffffffffffffffn)).toBe(64);
      expect(computeHammingDistance(0b1011n, 0b0101n)).toBe(3);
    });

    it('yields small Hamming distance (<= 10) for nearly identical headlines', () => {
      const h1 = 'Federal Reserve cuts interest rates by 25 basis points amid cooling inflation';
      const h2 = 'BREAKING: Federal Reserve cuts benchmark interest rates by 25 basis points';

      const res1 = computeSimHash(h1, 'en');
      const res2 = computeSimHash(h2, 'en');

      const dist = computeHammingDistance(res1.simhash, res2.simhash);
      expect(dist).toBeLessThanOrEqual(10);
    });

    it('yields large Hamming distance (> 20) for unrelated news stories', () => {
      const h1 = 'Federal Reserve cuts interest rates by 25 basis points amid cooling inflation';
      const h2 = 'Arsenal claims dramatic 2-1 victory over Chelsea at Emirates Stadium';

      const res1 = computeSimHash(h1, 'en');
      const res2 = computeSimHash(h2, 'en');

      const dist = computeHammingDistance(res1.simhash, res2.simhash);
      expect(dist).toBeGreaterThan(20);
    });

    it('demonstrates LSH band collision on near-duplicates', () => {
      const h1 = 'Bank of England holds interest rates at 5 percent';
      const h2 = 'BREAKING: Bank of England holds interest rates at 5 percent';

      const res1 = computeSimHash(h1, 'en');
      const res2 = computeSimHash(h2, 'en');

      // After stripping generic breaking noise, tokens and bands match exactly
      expect(res1.simhash).toBe(res2.simhash);
      expect(res1.band0).toBe(res2.band0);
      expect(res1.band1).toBe(res2.band1);
      expect(res1.band2).toBe(res2.band2);
      expect(res1.band3).toBe(res2.band3);
    });
  });
});
