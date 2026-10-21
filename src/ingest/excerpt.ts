import type { StoryExcerpt } from '../../shared/types';
import {
  applyExcerptBudget,
  assertExcerptWithinBudget,
  toStoredExcerpt,
} from '../../shared/contract/excerpt-budget';
import { cleanCandidateText } from './text';

export interface BuildExcerptOptions {
  candidateText: string;
  sourceVisibleText: string;
  language?: 'en' | 'hi';
}

/**
 * Extracts raw candidate text and source visible text from a parsed feed item
 * adhering to priority cascade (D-11):
 * Candidate: 1) description, 2) content:encoded / summary, 3) content
 * Source visible text: 1) content:encoded / content, fallback to description.
 */
export function extractExcerptCandidate(item: any): { candidate: string; sourceVisibleText: string } {
  if (!item || typeof item !== 'object') {
    return { candidate: '', sourceVisibleText: '' };
  }

  const candidateRaw =
    (typeof item.description === 'string' && item.description.trim()) ||
    (typeof item['content:encoded'] === 'string' && item['content:encoded'].trim()) ||
    (typeof item.contentEncoded === 'string' && item.contentEncoded.trim()) ||
    (typeof item.summary === 'string' && item.summary.trim()) ||
    (typeof item.content === 'string' && item.content.trim()) ||
    '';

  const sourceRaw =
    (typeof item['content:encoded'] === 'string' && item['content:encoded'].trim()) ||
    (typeof item.contentEncoded === 'string' && item.contentEncoded.trim()) ||
    (typeof item.content === 'string' && item.content.trim()) ||
    candidateRaw;

  return {
    candidate: cleanCandidateText(candidateRaw),
    sourceVisibleText: cleanCandidateText(sourceRaw),
  };
}

/**
 * Builds a sanitized excerpt obeying the hard legal excerpt budget:
 * - <= 50 words, <= 320 chars, <= 2 sentences, <= 30% of source visible text
 * - Null excerpt if source visible text < 160 words
 * - Truncation at word boundary with visible ellipsis
 * - 100% verbatim prefix only (CON-04)
 * - Verifies assertion assertExcerptWithinBudget on non-null results (CON-05)
 */
export function buildSanitizedExcerpt(options: BuildExcerptOptions): StoryExcerpt | null {
  const result = applyExcerptBudget({
    candidate: options.candidateText,
    sourceVisibleText: options.sourceVisibleText,
    language: options.language,
  });

  if (result.text !== null) {
    assertExcerptWithinBudget(result.text, options.sourceVisibleText, options.language);
  }

  return toStoredExcerpt(result);
}
