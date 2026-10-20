import { z } from 'zod';

import type { StoryExcerpt } from '../types';

/**
 * CON-01 through CON-05: the excerpt budget, as a coded contract.
 *
 * The excerpt is the one place where the publication touches a publisher's
 * own text. Google names "synonymizing, translating, or other obfuscation
 * techniques" as an example of scaled-content abuse, so paraphrasing an
 * excerpt to dodge duplicate detection is not a quality shortcut — it is a
 * policy violation. This module is therefore the one place in the codebase
 * that is allowed to shorten a publisher's sentence, and it may only ever
 * SHORTEN it.
 *
 * The guarantees, and how each one is held:
 *
 *   CON-01  the excerpt is at most 50 words, 320 characters, 2 sentences and
 *           30 percent of the source article's visible text;
 *   CON-02  a source article shorter than 160 words carries no excerpt at all;
 *   CON-03  a shortened excerpt ends at a word boundary and carries a
 *           visible ellipsis;
 *   CON-04  the excerpt is a verbatim prefix of the publisher's own text — it
 *           is never rewritten, synonymized or translated;
 *   CON-05  every limit above is asserted by the unit test beside this file.
 *
 * CON-04 is structural rather than procedural: the only operation this module
 * performs on the candidate is cutting it. There is no rewrite path, no
 * synonym table, no translation step, no per-source override parameter and no
 * configuration lookup — and there is deliberately no place to add one. A
 * per-source override would be exactly the loophole this contract exists to
 * close, so the shape of the API makes it impossible rather than merely
 * discouraged. `applyExcerptBudget` checks its own output against the
 * candidate before returning, so a future edit that rewrote text would fail
 * here rather than in a stored row three phases later.
 *
 * The result shape is deliberately NOT the same as `StoryExcerpt` in
 * `shared/types.ts`. `StoryExcerpt` describes an excerpt that was STORED —
 * it has a non-null text and it carries no verdict. This module's result
 * describes a VERDICT — it can be a refusal (no source, source too short),
 * and it records whether the text was shortened. The two are bridged by
 * `toStoredExcerpt`, which is the only place the conversion happens.
 */

/* ------------------------------------------------------------------------- */
/* The budget                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * The published excerpt budget.
 *
 * These are editorial and legal limits, not tuning parameters. Nothing reads
 * them from configuration and nothing overrides them per source.
 */
export const EXCERPT_BUDGET = {
  /** The most words a published excerpt may contain. */
  maxWords: 50,
  /** The most characters a published excerpt may contain. */
  maxChars: 320,
  /** The most sentences a published excerpt may contain. */
  maxSentences: 2,
  /** The largest share of the source article's visible text an excerpt may be. */
  maxSourceShare: 0.30,
  /** A source shorter than this carries no excerpt at all. */
  minSourceWords: 160,
  /** The visible marker that a shortened excerpt was shortened. */
  ellipsis: '…',
} as const;

/* ------------------------------------------------------------------------- */
/* The contract's own types                                                   */
/* ------------------------------------------------------------------------- */

/** What the contract needs in order to reach a verdict. */
export interface ExcerptInput {
  /** The publisher-supplied summary or description, verbatim. */
  candidate: string;
  /** The publisher article's visible text. */
  sourceVisibleText: string;
}

/** Why no excerpt can be published. */
export type ExcerptRejection = 'source_absent' | 'source_too_short';

/** The verdict, including the measurements the budget is enforced against. */
export interface ExcerptResult {
  /** The excerpt to publish, or null when nothing may be published. */
  text: string | null;
  /** True when any limit shortened the candidate. */
  truncated: boolean;
  /** Why nothing may be published, or null when an excerpt was produced. */
  rejection: ExcerptRejection | null;
  /** The words in the published text. */
  wordCount: number;
  /** The characters in the published text, the visible ellipsis included. */
  charCount: number;
  /** The sentences in the published text. */
  sentenceCount: number;
  /** The published words as a share of the source article's visible words. */
  sourceShare: number;
}

/**
 * The runtime shape of a verdict.
 *
 * The contract checks its own output against this before returning it, so a
 * verdict that violates the contract cannot escape the module.
 */
export const EXCERPT_RESULT_SCHEMA = z.object({
  text: z.string().nullable(),
  truncated: z.boolean(),
  rejection: z.enum(['source_absent', 'source_too_short']).nullable(),
  wordCount: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(),
  sentenceCount: z.number().int().nonnegative(),
  sourceShare: z.number().min(0).max(1),
});

/* ------------------------------------------------------------------------- */
/* Measuring                                                                  */
/* ------------------------------------------------------------------------- */

/** Count the whitespace-separated words in a piece of text. */
function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Count the sentences in a piece of text.
 *
 * A sentence boundary is a terminator followed by whitespace or by the end of
 * the text. A trailing fragment with no terminator is still a sentence — it
 * is the sentence that was cut off.
 */
function countSentences(text: string): number {
  const boundaries = [...text.matchAll(/[.!?](?=\s|$)/g)];
  if (boundaries.length === 0) {
    return /\S/.test(text) ? 1 : 0;
  }
  const last = boundaries[boundaries.length - 1];
  const remainder = text.slice((last?.index ?? 0) + 1);
  return boundaries.length + (/\S/.test(remainder) ? 1 : 0);
}

/** The end offsets of every word in a piece of text. */
function wordEndOffsets(text: string): number[] {
  return [...text.matchAll(/\S+/g)].map((match) => (match.index ?? 0) + match[0].length);
}

/* ------------------------------------------------------------------------- */
/* Cutting                                                                    */
/* ------------------------------------------------------------------------- */

/** The result of a cut: the surviving text, and whether anything was removed. */
interface Cut {
  text: string;
  cut: boolean;
}

/**
 * Cut the text to at most `maxWords` words, at a word boundary.
 *
 * The cut lands immediately after the last surviving word, so the text is
 * always a verbatim prefix of what came in.
 */
function cutToWords(text: string, maxWords: number): Cut {
  const offsets = wordEndOffsets(text);
  if (offsets.length <= maxWords) {
    return { text, cut: false };
  }
  const end = offsets[maxWords - 1];
  if (end === undefined) {
    return { text: '', cut: true };
  }
  return { text: text.slice(0, end), cut: true };
}

/**
 * Cut the text to at most `maxSentences` sentences.
 *
 * The cut lands immediately after the terminator that closes the last
 * surviving sentence, so the surviving text keeps its own punctuation and
 * remains a verbatim prefix of what came in.
 */
function cutToSentences(text: string, maxSentences: number): Cut {
  const boundaries = [...text.matchAll(/[.!?](?=\s|$)/g)];
  if (boundaries.length < maxSentences) {
    return { text, cut: false };
  }
  const boundary = boundaries[maxSentences - 1];
  if (boundary === undefined) {
    return { text, cut: false };
  }
  const end = (boundary.index ?? 0) + 1;
  if (end >= text.length) {
    return { text, cut: false };
  }
  return { text: text.slice(0, end), cut: true };
}

/**
 * Cut the text to at most `maxChars` characters, at a word boundary.
 *
 * The cut lands immediately after the last whole word that fits.
 */
function cutToChars(text: string, maxChars: number): Cut {
  if (text.length <= maxChars) {
    return { text, cut: false };
  }
  let end = 0;
  for (const offset of wordEndOffsets(text)) {
    if (offset > maxChars) {
      break;
    }
    end = offset;
  }
  if (end === 0) {
    return { text: '', cut: true };
  }
  return { text: text.slice(0, end), cut: true };
}

/** Drop the last word of the text, and the space in front of it. */
function dropLastWord(text: string): string {
  const trimmed = text.replace(/\s+$/, '');
  const last = /\s+\S+$/.exec(trimmed);
  if (!last) {
    return '';
  }
  return trimmed.slice(0, last.index);
}

/**
 * The number of words the source share allows.
 *
 * The percentage is converted to whole percent before the multiplication, so
 * the allowance is computed in integer arithmetic. `0.3 * 30` is
 * `8.999999999999998` in binary floating point, and a floor of the wrong side
 * of that error would silently shorten an excerpt by a word.
 */
function allowedWordCount(sourceWordCount: number): number {
  const percent = Math.round(EXCERPT_BUDGET.maxSourceShare * 100);
  const shareAllowance = Math.floor((sourceWordCount * percent) / 100);
  return Math.min(EXCERPT_BUDGET.maxWords, shareAllowance);
}

/* ------------------------------------------------------------------------- */
/* The contract                                                               */
/* ------------------------------------------------------------------------- */

/** A verdict that publishes nothing. */
function refusal(rejection: ExcerptRejection): ExcerptResult {
  return EXCERPT_RESULT_SCHEMA.parse({
    text: null,
    truncated: false,
    rejection,
    wordCount: 0,
    charCount: 0,
    sentenceCount: 0,
    sourceShare: 0,
  });
}

/**
 * A verdict that publishes nothing because nothing survived the budget.
 *
 * There is no rejection to report: the source was usable, the candidate
 * simply carried nothing that could be quoted.
 */
function nothingToQuote(truncated: boolean): ExcerptResult {
  return EXCERPT_RESULT_SCHEMA.parse({
    text: null,
    truncated,
    rejection: null,
    wordCount: 0,
    charCount: 0,
    sentenceCount: 0,
    sourceShare: 0,
  });
}

/**
 * Apply the excerpt budget to a candidate.
 *
 * The candidate is only ever shortened. The order of the caps matters: the
 * word cap goes first because a cut at a word boundary is the only cut that
 * can guarantee the word cap, and the character and sentence caps follow it.
 * Both the word cap and the share cap are ceilings — the tighter of the two
 * binds, and an excerpt that satisfies both is inside CON-01.
 */
export function applyExcerptBudget(input: ExcerptInput): ExcerptResult {
  const sourceText = input.sourceVisibleText ?? '';
  const candidate = input.candidate ?? '';

  if (sourceText.trim().length === 0) {
    return refusal('source_absent');
  }

  const sourceWordCount = countWords(sourceText);
  if (sourceWordCount < EXCERPT_BUDGET.minSourceWords) {
    return refusal('source_too_short');
  }

  let body = candidate;
  let truncated = false;

  const byWord = cutToWords(body, allowedWordCount(sourceWordCount));
  body = byWord.text;
  truncated = truncated || byWord.cut;

  const bySentence = cutToSentences(body, EXCERPT_BUDGET.maxSentences);
  body = bySentence.text;
  truncated = truncated || bySentence.cut;

  const byChar = cutToChars(body, EXCERPT_BUDGET.maxChars);
  body = byChar.text;
  truncated = truncated || byChar.cut;

  if (body.trim().length === 0) {
    return nothingToQuote(truncated);
  }

  if (truncated) {
    // The visible ellipsis marks the cut, and it has to fit inside the
    // character cap along with the text it marks. If it does not, one more
    // word goes.
    body = body.replace(/\s+$/, '');
    while (body.length + EXCERPT_BUDGET.ellipsis.length > EXCERPT_BUDGET.maxChars) {
      const shortened = dropLastWord(body);
      if (shortened === body) {
        body = '';
        break;
      }
      body = shortened;
    }
    if (body.length === 0) {
      return nothingToQuote(true);
    }
  }

  const text = truncated ? `${body}${EXCERPT_BUDGET.ellipsis}` : body;

  // CON-04, enforced rather than intended. The result may only ever be the
  // candidate itself or a prefix of it, plus the visible marker that a cut
  // happened. A rewrite of any kind would break this check.
  const published = truncated ? text.slice(0, -EXCERPT_BUDGET.ellipsis.length) : text;
  if (!candidate.startsWith(published)) {
    throw new Error('The excerpt budget produced text that is not a verbatim prefix of the candidate.');
  }

  const wordCount = countWords(text);
  const charCount = text.length;
  const sentenceCount = countSentences(text);

  return EXCERPT_RESULT_SCHEMA.parse({
    text,
    truncated,
    rejection: null,
    wordCount,
    charCount,
    sentenceCount,
    sourceShare: sourceWordCount === 0 ? 0 : wordCount / sourceWordCount,
  });
}

/* ------------------------------------------------------------------------- */
/* The assertion Phase 2 runs over every stored excerpt                       */
/* ------------------------------------------------------------------------- */

/** Raised when a stored excerpt breaks the budget. */
export class ExcerptBudgetError extends Error {
  /** Every limit the excerpt broke, in full. */
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Excerpt budget violated: ${violations.join('; ')}`);
    this.name = 'ExcerptBudgetError';
    this.violations = violations;
  }
}

/**
 * Assert that a stored excerpt sits inside the budget.
 *
 * This is the gate Phase 2's normaliser runs over every excerpt it is about
 * to store. It throws with the FULL list of broken limits rather than the
 * first one, so a single failure tells the whole story.
 */
export function assertExcerptWithinBudget(text: string, sourceVisibleText: string): void {
  const violations: string[] = [];
  const sourceWordCount = countWords(sourceVisibleText);

  if (sourceWordCount < EXCERPT_BUDGET.minSourceWords) {
    violations.push(
      `the source article has ${sourceWordCount} words, fewer than the ${EXCERPT_BUDGET.minSourceWords} a published excerpt requires`,
    );
  }

  const wordCount = countWords(text);
  if (wordCount > EXCERPT_BUDGET.maxWords) {
    violations.push(`the excerpt has ${wordCount} words, more than the ${EXCERPT_BUDGET.maxWords} allowed`);
  }

  const charCount = text.length;
  if (charCount > EXCERPT_BUDGET.maxChars) {
    violations.push(
      `the excerpt has ${charCount} characters, more than the ${EXCERPT_BUDGET.maxChars} allowed`,
    );
  }

  const sentenceCount = countSentences(text);
  if (sentenceCount > EXCERPT_BUDGET.maxSentences) {
    violations.push(
      `the excerpt has ${sentenceCount} sentences, more than the ${EXCERPT_BUDGET.maxSentences} allowed`,
    );
  }

  if (sourceWordCount > 0) {
    const share = wordCount / sourceWordCount;
    if (share > EXCERPT_BUDGET.maxSourceShare) {
      violations.push(
        `the excerpt is ${share.toFixed(3)} of the source article, more than the ${EXCERPT_BUDGET.maxSourceShare} allowed`,
      );
    }
  }

  if (violations.length > 0) {
    throw new ExcerptBudgetError(violations);
  }
}

/* ------------------------------------------------------------------------- */
/* The bridge to the stored shape                                             */
/* ------------------------------------------------------------------------- */

/**
 * Carry a verdict into the stored shape, or null when nothing may be stored.
 *
 * `StoryExcerpt` in `shared/types.ts` is the record the database holds. This
 * is the only place the two shapes meet, so a stored excerpt can never carry
 * a field the budget did not produce.
 */
export function toStoredExcerpt(result: ExcerptResult): StoryExcerpt | null {
  if (result.text === null) {
    return null;
  }
  return {
    text: result.text,
    wordCount: result.wordCount,
    charCount: result.charCount,
    sentenceCount: result.sentenceCount,
    sourceShare: result.sourceShare,
  };
}
