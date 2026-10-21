/**
 * src/curation/simhash.ts — 64-bit SimHash fingerprinting and 4x16-bit LSH bands.
 *
 * Implements CUR-01, CUR-15, and architectural candidate-generation requirements.
 * Headline tokenization strips generic breaking-news noise tokens in English and Hindi.
 * SimHash computes a deterministic 64-bit fingerprint using 64-bit FNV-1a token hashing,
 * then extracts four 16-bit unsigned integer bands (band0..3) matching D1 database indexes.
 */

import { STOPLIST, isNoiseToken, isStopWord } from '../../config/stoplist.js';

export interface SimHashResult {
  simhash: bigint;
  band0: number; // unsigned 16-bit int (0..65535)
  band1: number;
  band2: number;
  band3: number;
  tokens: string[];
}

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

// Cached Intl.Segmenter instances for word granularity
const segmenterEn = new Intl.Segmenter('en', { granularity: 'word' });
const segmenterHi = new Intl.Segmenter('hi', { granularity: 'word' });

/**
 * Strips leading generic prefix phrases like "BREAKING NEWS:" or "ताज़ा खबर:".
 */
function stripGenericPrefixes(headline: string, language: 'en' | 'hi'): string {
  let cleaned = headline.trim();
  const prefixes = language === 'hi'
    ? [
        /^ताज़ा\s*खबर\s*[:\-\|]\s*/i,
        /^ब्रेकिंग\s*न्यूज़\s*[:\-\|]\s*/i,
        /^लाइव\s*अपडेट\s*[:\-\|]\s*/i,
        /^विशेष\s*[:\-\|]\s*/i,
      ]
    : [
        /^breaking\s*news\s*[:\-\|]\s*/i,
        /^breaking\s*[:\-\|]\s*/i,
        /^just\s*in\s*[:\-\|]\s*/i,
        /^special\s*report\s*[:\-\|]\s*/i,
        /^live\s*updates?\s*[:\-\|]\s*/i,
        /^live\s*[:\-\|]\s*/i,
        /^watch\s*live\s*[:\-\|]\s*/i,
        /^watch\s*[:\-\|]\s*/i,
        /^exclusive\s*[:\-\|]\s*/i,
        /^update\s*[:\-\|]\s*/i,
      ];

  for (const regex of prefixes) {
    cleaned = cleaned.replace(regex, '');
  }
  return cleaned;
}

/**
 * Tokenizes a headline into normalized Unicode tokens and strips generic breaking news
 * noise and stop words in English or Hindi.
 */
export function tokenizeHeadline(headline: string, language: 'en' | 'hi' = 'en'): string[] {
  if (!headline || typeof headline !== 'string') {
    return [];
  }

  // Ensure STOPLIST is referenced
  void STOPLIST;

  const strippedHeadline = stripGenericPrefixes(headline, language);
  const segmenter = language === 'hi' ? segmenterHi : segmenterEn;
  const tokens: string[] = [];

  for (const segment of segmenter.segment(strippedHeadline)) {
    if (!segment.isWordLike) {
      continue;
    }

    const raw = segment.segment.trim().toLowerCase();
    // Strip any boundary punctuation / symbols attached to the word (preserving letters, numbers, and combining marks like Devanagari matras)
    const cleaned = raw.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');
    if (!cleaned) {
      continue;
    }

    if (isNoiseToken(cleaned, language) || isStopWord(cleaned, language)) {
      continue;
    }

    tokens.push(cleaned);
  }

  return tokens;
}

/**
 * Computes 64-bit FNV-1a hash of a UTF-8 text string.
 */
export function fnv1a64(text: string): bigint {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let hash = FNV_OFFSET_64;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash;
}

/**
 * Computes 64-bit SimHash from an array of tokens (or a raw headline string).
 * Splits the 64-bit hash into four unsigned 16-bit integer bands:
 *   - band0: bits 48..63
 *   - band1: bits 32..47
 *   - band2: bits 16..31
 *   - band3: bits 0..15
 */
export function computeSimHash(
  input: string[] | string,
  language: 'en' | 'hi' = 'en'
): SimHashResult {
  const tokens = Array.isArray(input) ? input : tokenizeHeadline(input, language);

  if (tokens.length === 0) {
    return {
      simhash: 0n,
      band0: 0,
      band1: 0,
      band2: 0,
      band3: 0,
      tokens: [],
    };
  }

  // 64-bit accumulator vector
  const v = new Int32Array(64);

  for (const token of tokens) {
    const hash = fnv1a64(token);
    for (let bit = 0; bit < 64; bit++) {
      if ((hash & (1n << BigInt(bit))) !== 0n) {
        v[bit] += 1;
      } else {
        v[bit] -= 1;
      }
    }
  }

  let simhash = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (v[bit] > 0) {
      simhash |= (1n << BigInt(bit));
    }
  }

  const band0 = Number((simhash >> 48n) & 0xffffn);
  const band1 = Number((simhash >> 32n) & 0xffffn);
  const band2 = Number((simhash >> 16n) & 0xffffn);
  const band3 = Number(simhash & 0xffffn);

  return {
    simhash,
    band0,
    band1,
    band2,
    band3,
    tokens,
  };
}

/**
 * Computes exact bitwise Hamming distance between two 64-bit hashes using XOR and popcount.
 */
export function computeHammingDistance(hashA: bigint, hashB: bigint): number {
  let diff = (hashA ^ hashB) & MASK_64;
  let distance = 0;
  while (diff > 0n) {
    diff &= diff - 1n;
    distance += 1;
  }
  return distance;
}
