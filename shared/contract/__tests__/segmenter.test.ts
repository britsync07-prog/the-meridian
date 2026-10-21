import { describe, expect, it } from 'vitest';
import {
  countSentencesUnicode,
  countWordsUnicode,
  getWordEndOffsets,
} from '../segmenter';

describe('segmenter', () => {
  describe('countWordsUnicode', () => {
    it('accurately counts words in English', () => {
      expect(countWordsUnicode('The quick brown fox jumps over the lazy dog.')).toBe(9);
      expect(countWordsUnicode('One, two, three! Four?')).toBe(4);
    });

    it('accurately counts words in Hindi Devanagari', () => {
      // 7 words with 'आज'
      const hindiText = 'भारत ने आज नया उपग्रह प्रक्षेपित किया।';
      expect(countWordsUnicode(hindiText, 'hi')).toBe(7);

      // Exactly 6 words without 'आज'
      const sixWordHindi = 'भारत ने नया उपग्रह प्रक्षेपित किया।';
      expect(countWordsUnicode(sixWordHindi, 'hi')).toBe(6);
    });

    it('handles empty or whitespace strings', () => {
      expect(countWordsUnicode('')).toBe(0);
      expect(countWordsUnicode('   \t\n  ')).toBe(0);
    });
  });

  describe('countSentencesUnicode', () => {
    it('correctly splits English sentences on ., !, ?', () => {
      const text = 'First sentence. Second sentence! Third sentence? Fourth sentence';
      expect(countSentencesUnicode(text, 'en')).toBe(4);
    });

    it('correctly splits Hindi sentences on purna viram । (U+0964)', () => {
      const hindiText = 'यह पहला वाक्य है। यह दूसरा वाक्य है।';
      expect(countSentencesUnicode(hindiText, 'hi')).toBe(2);
    });

    it('handles a single Hindi sentence with purna viram', () => {
      const hindiText = 'यह एक पूर्ण वाक्य है।';
      expect(countSentencesUnicode(hindiText, 'hi')).toBe(1);
    });

    it('handles empty or whitespace strings', () => {
      expect(countSentencesUnicode('')).toBe(0);
      expect(countSentencesUnicode('   \n\t ')).toBe(0);
    });
  });

  describe('getWordEndOffsets', () => {
    it('returns end offsets of word tokens in English', () => {
      const text = 'Hello world';
      expect(getWordEndOffsets(text, 'en')).toEqual([5, 11]);
    });

    it('returns end offsets of word tokens in Hindi', () => {
      const text = 'नमस्ते भारत';
      const offsets = getWordEndOffsets(text, 'hi');
      expect(offsets).toHaveLength(2);
      expect(text.slice(0, offsets[0])).toBe('नमस्ते');
      expect(text.slice(offsets[0] + 1, offsets[1])).toBe('भारत');
    });

    it('handles empty string', () => {
      expect(getWordEndOffsets('')).toEqual([]);
    });
  });
});
