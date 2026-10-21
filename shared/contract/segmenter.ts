/**
 * Unicode-aware tokenization using Intl.Segmenter for English and Hindi text.
 * Accurately parses word-like tokens and sentence boundaries across English
 * punctuation and Hindi Devanagari purna viram (। - U+0964).
 */

/**
 * Counts the word-like tokens in a string using Intl.Segmenter word granularity.
 * Ignores punctuation, spaces, and symbols.
 */
export function countWordsUnicode(text: string, lang = 'en'): number {
  if (!text) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) {
        count += 1;
      }
    }
    return count;
  }
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Counts the sentences in a string using Intl.Segmenter sentence granularity.
 * Explicitly recognizes English terminators (. ! ?) and Hindi purna viram (।).
 * Filters out empty or punctuation-only segments (such as standalone ellipses).
 */
export function countSentencesUnicode(text: string, lang = 'en'): number {
  if (!text) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (/[\p{L}\p{N}]/u.test(segment.segment)) {
        count += 1;
      }
    }
    return count;
  }
  const stripped = text.replace(/[…\s]+$/, '');
  const boundaries = [...stripped.matchAll(/[.!?।](?=\s|$)/gu)];
  if (boundaries.length === 0) {
    return /[\p{L}\p{N}]/u.test(stripped) ? 1 : 0;
  }
  const last = boundaries[boundaries.length - 1];
  const remainder = stripped.slice((last?.index ?? 0) + 1);
  return boundaries.length + (/[\p{L}\p{N}]/u.test(remainder) ? 1 : 0);
}

/**
 * Returns the end offsets of every word-like token in the string.
 */
export function getWordEndOffsets(text: string, lang = 'en'): number[] {
  if (!text) return [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
    const offsets: number[] = [];
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) {
        offsets.push(segment.index + segment.segment.length);
      }
    }
    return offsets;
  }
  return [...text.matchAll(/\S+/g)].map((match) => (match.index ?? 0) + match[0].length);
}
