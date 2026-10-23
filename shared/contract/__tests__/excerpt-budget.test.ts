/**
 * CON-01 through CON-05: the excerpt budget is a coded contract, and this suite
 * is what makes it a contract rather than a comment.
 *
 * The excerpt is the ONE place where the publication touches a publisher's
 * text. Google names "synonymizing, translating, or other obfuscation
 * techniques" as a scaled-content-abuse example, so paraphrasing an excerpt to
 * dodge duplicate detection is not a quality shortcut — it is a policy
 * violation. The rules that prevent it are therefore hard, and they are
 * asserted here:
 *
 *   CON-01  at most 50 words, 320 characters, 2 sentences and 30 percent of
 *           the source article's visible text;
 *   CON-02  a source shorter than 160 words publishes no excerpt at all;
 *   CON-03  a truncated excerpt ends at a word boundary and carries a visible
 *           ellipsis;
 *   CON-04  an excerpt is a verbatim prefix of the publisher's own text — it
 *           is never rewritten, synonymized or translated;
 *   CON-05  a unit test asserts every limit for every stored excerpt.
 *
 * The verbatim guarantee (CON-04) is the structural one: the contract only
 * ever truncates. There is no rewrite path, no override parameter and no
 * config lookup, so a paraphrase cannot be introduced without changing this
 * file.
 */

import { describe, expect, it } from 'vitest';

import {
  EXCERPT_BUDGET,
  EXCERPT_RESULT_SCHEMA,
  ExcerptBudgetError,
  applyExcerptBudget,
  assertExcerptWithinBudget,
  toStoredExcerpt,
} from '../excerpt-budget';

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* ------------------------------------------------------------------------- */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Build one deterministic pseudo-word of a fixed length.
 *
 * The words are synthetic so that a fixture is exactly as long as the test
 * needs it to be — a word-count assertion and a character-count assertion are
 * different assertions, and a fixture whose length is an accident of prose
 * cannot make them independently.
 */
function synthWord(index: number, length: number): string {
  let word = '';
  let value = index + 1;
  for (let position = 0; position < length; position += 1) {
    word += ALPHABET[value % ALPHABET.length];
    value = Math.floor(value / ALPHABET.length) + index + 7;
  }
  return word;
}

/** A list of `count` deterministic pseudo-words. */
function synthWords(count: number, length = 5, offset = 0): string[] {
  return Array.from({ length: count }, (_, index) => synthWord(index + offset, length));
}

/** A run of words as one unterminated sentence. */
function phrase(count: number, length = 5, offset = 0): string {
  return synthWords(count, length, offset).join(' ');
}

/** A source article's visible text: `count` words, no punctuation. */
function sourceText(count: number): string {
  return phrase(count, 6, 500);
}

/** A deterministic pseudo-random generator, so a failure is reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/* ------------------------------------------------------------------------- */
/* Group A — the budget itself                                                */
/* ------------------------------------------------------------------------- */

describe('the excerpt budget', () => {
  it('carries exactly the published limits', () => {
    expect(EXCERPT_BUDGET.maxWords).toBe(50);
    expect(EXCERPT_BUDGET.maxChars).toBe(320);
    expect(EXCERPT_BUDGET.maxSentences).toBe(2);
    expect(EXCERPT_BUDGET.maxSourceShare).toBe(0.3);
    expect(EXCERPT_BUDGET.minSourceWords).toBe(160);
    expect(EXCERPT_BUDGET.ellipsis).toBe('…');
  });

  it('exposes no override path — there is no per-source variant to reach', () => {
    // The function takes one argument and it is the input, not a knob. An
    // override would be a paraphrase-shaped loophole, so the contract has no
    // shape for one.
    expect(applyExcerptBudget.length).toBe(1);
    expect(Object.keys(EXCERPT_BUDGET).sort()).toEqual([
      'ellipsis',
      'maxChars',
      'maxSentences',
      'maxSourceShare',
      'maxWords',
      'minSourceWords',
    ]);
  });

  it('validates its own result shape at runtime', () => {
    expect(EXCERPT_RESULT_SCHEMA.safeParse({
      text: 'a short excerpt',
      truncated: false,
      rejection: null,
      wordCount: 3,
      charCount: 14,
      sentenceCount: 1,
      sourceShare: 0.01,
    }).success).toBe(true);

    expect(EXCERPT_RESULT_SCHEMA.safeParse({
      text: 'a short excerpt',
      truncated: false,
      rejection: 'not_a_real_rejection',
      wordCount: 3,
      charCount: 14,
      sentenceCount: 1,
      sourceShare: 0.01,
    }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */
/* Group B — the named budget cases                                           */
/* ------------------------------------------------------------------------- */

describe('applyExcerptBudget', () => {
  it('keeps a 49-word candidate unchanged', () => {
    const candidate = phrase(49);
    const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });

    expect(result.truncated).toBe(false);
    expect(result.wordCount).toBe(49);
    expect(result.text).toBe(candidate);
    expect(result.rejection).toBeNull();
  });

  it('cuts a 51-word candidate to 50 words with a visible ellipsis', () => {
    const candidate = phrase(51);
    const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });

    expect(result.truncated).toBe(true);
    expect(result.wordCount).toBe(50);
    expect(result.text?.endsWith(EXCERPT_BUDGET.ellipsis)).toBe(true);

    // The text before the ellipsis is a whole word, never a fragment of one.
    const body = result.text?.slice(0, -1) ?? '';
    expect(body.split(/\s+/)).toHaveLength(50);
    expect(body.endsWith(' ')).toBe(false);
  });

  it('cuts at a word boundary when the character cap binds first', () => {
    const words = synthWords(60, 12);
    const candidate = words.join(' ');
    const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });

    expect(result.charCount).toBeLessThanOrEqual(EXCERPT_BUDGET.maxChars);
    expect(result.text?.endsWith(EXCERPT_BUDGET.ellipsis)).toBe(true);

    // The cut landed on a word boundary: the body is a run of whole synthetic
    // words and the next word in the candidate begins after it.
    const body = result.text?.slice(0, -1) ?? '';
    expect(candidate.startsWith(body)).toBe(true);
    const last = body.split(/\s+/).pop() ?? '';
    expect(words).toContain(last);
    expect(candidate[body.length]).toBe(' ');
  });

  it('keeps at most two sentences', () => {
    const candidate = 'Alpha one. Beta two. Gamma three.';
    const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });

    expect(result.sentenceCount).toBe(2);
    expect(result.text?.startsWith('Alpha one. Beta two.')).toBe(true);
  });

  it('publishes no excerpt for a source shorter than 160 words', () => {
    const result = applyExcerptBudget({
      candidate: phrase(40),
      sourceVisibleText: sourceText(100),
    });

    expect(result.text).toBeNull();
    expect(result.rejection).toBe('source_too_short');
    expect(result.truncated).toBe(false);
  });

  it('publishes no excerpt when the source is absent', () => {
    const result = applyExcerptBudget({ candidate: phrase(40), sourceVisibleText: '' });

    expect(result.text).toBeNull();
    expect(result.rejection).toBe('source_absent');
  });

  it('caps the excerpt at thirty percent of the source', () => {
    // A 160-word source is the smallest source the budget accepts, and at that
    // size the share cap is the one that binds: 30 percent of 160 is 48 words,
    // which is below the 50-word cap. The word cap and the share cap are both
    // ceilings, and the excerpt satisfies the tighter of the two.
    const result = applyExcerptBudget({
      candidate: phrase(100),
      sourceVisibleText: sourceText(160),
    });

    expect(result.wordCount).toBe(48);
    expect(result.sourceShare).toBe(0.3);
    expect(result.wordCount).toBeLessThanOrEqual(EXCERPT_BUDGET.maxWords);
  });

  it('applies the fifty-word cap when it binds before the share cap', () => {
    // Thirty percent of a 200-word source is sixty words — more than the
    // fifty-word cap allows. CON-01 states every limit as a ceiling and the
    // tighter one binds, so the excerpt is fifty words and shares a quarter
    // of the source rather than breaching the word cap to reach the share.
    const result = applyExcerptBudget({
      candidate: phrase(100),
      sourceVisibleText: sourceText(200),
    });

    expect(result.wordCount).toBe(50);
    expect(result.sourceShare).toBe(0.25);
    expect(result.sourceShare).toBeLessThanOrEqual(EXCERPT_BUDGET.maxSourceShare);
  });

  it('leaves a short candidate untouched when it is inside every limit', () => {
    const candidate = phrase(40);
    const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });

    expect(result.truncated).toBe(false);
    expect(result.wordCount).toBe(40);
    expect(result.sourceShare).toBe(0.2);
    expect(result.text).toBe(candidate);
  });

  it('returns a verbatim prefix of the candidate', () => {
    const candidates = [
      phrase(49),
      phrase(51),
      phrase(120),
      'Alpha one. Beta two. Gamma three.',
      synthWords(60, 12).join(' '),
      'A single short sentence.',
    ];

    for (const candidate of candidates) {
      const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });
      expect(result.text).not.toBeNull();

      const body = (result.text ?? '').replace(new RegExp(`${EXCERPT_BUDGET.ellipsis}$`), '');
      expect(candidate.startsWith(body)).toBe(true);
    }
  });

  it('never emits a word count above the cap', () => {
    const random = createRandom(20261020);
    const source = sourceText(200);

    for (let iteration = 0; iteration < 200; iteration += 1) {
      const count = 1 + Math.floor(random() * 140);
      const wordLength = 1 + Math.floor(random() * 14);
      const parts: string[] = [];
      let remaining = count;

      while (remaining > 0) {
        const size = Math.min(remaining, 1 + Math.floor(random() * 12));
        parts.push(synthWords(size, wordLength, iteration * 13 + parts.length).join(' '));
        if (random() < 0.3) parts.push('.');
        remaining -= size;
      }

      const candidate = parts.join(' ');
      const result = applyExcerptBudget({ candidate, sourceVisibleText: source });

      expect(result.rejection).toBeNull();
      expect(result.wordCount).toBeLessThanOrEqual(EXCERPT_BUDGET.maxWords);
      expect(result.charCount).toBeLessThanOrEqual(EXCERPT_BUDGET.maxChars);
      expect(result.sentenceCount).toBeLessThanOrEqual(EXCERPT_BUDGET.maxSentences);
      expect(result.sourceShare).toBeLessThanOrEqual(EXCERPT_BUDGET.maxSourceShare);
    }
  });

  it('drops a word when the ellipsis would not fit inside the character cap', () => {
    // Four hundred-and-twenty-seven characters of body, cut at a word boundary
    // to exactly the character cap, so the visible ellipsis does not fit and
    // one more word has to go.
    const words = [synthWord(1, 106), synthWord(2, 106), synthWord(3, 106), synthWord(4, 106)];
    const candidate = words.join(' ');
    const result = applyExcerptBudget({ candidate, sourceVisibleText: sourceText(200) });

    expect(result.truncated).toBe(true);
    expect(result.charCount).toBeLessThanOrEqual(EXCERPT_BUDGET.maxChars);
    expect(result.text?.endsWith(EXCERPT_BUDGET.ellipsis)).toBe(true);
    expect(result.wordCount).toBe(2);
  });

  it('publishes nothing when there is nothing to quote', () => {
    const result = applyExcerptBudget({ candidate: '   ', sourceVisibleText: sourceText(200) });

    expect(result.text).toBeNull();
    expect(result.rejection).toBeNull();
    expect(result.wordCount).toBe(0);
  });

  it('correctly truncates Hindi candidate to two sentences on purna viram', () => {
    const candidate = 'यह पहला वाक्य है। यह दूसरा वाक्य है। यह तीसरा वाक्य है।';
    // 200 words of Hindi source
    const hindiWords = Array.from({ length: 200 }, () => 'समाचार').join(' ');
    const result = applyExcerptBudget({
      candidate,
      sourceVisibleText: hindiWords,
      language: 'hi',
    });

    expect(result.sentenceCount).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.text?.startsWith('यह पहला वाक्य है। यह दूसरा वाक्य है।')).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */
/* Group C — the assertion Phase 2 runs over every stored excerpt             */
/* ------------------------------------------------------------------------- */

describe('assertExcerptWithinBudget', () => {
  it('throws on an over-budget string', () => {
    const overlong = phrase(51);
    let thrown: unknown;

    try {
      assertExcerptWithinBudget(overlong, overlong, sourceText(200));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExcerptBudgetError);
    const error = thrown as ExcerptBudgetError;
    expect(error.violations.length).toBeGreaterThan(0);
    expect(error.violations.join(' ')).toMatch(/word/i);
    expect(error.message).toContain('word');
  });

  it('does not throw on a compliant string', () => {
    const candidate = phrase(40);
    expect(() => assertExcerptWithinBudget(candidate, candidate, sourceText(200))).not.toThrow();
  });

  it('lists every breached limit, not just the first', () => {
    let thrown: unknown;
    try {
      const candidate = phrase(80);
      assertExcerptWithinBudget(candidate, candidate, sourceText(200));
    } catch (error) {
      thrown = error;
    }

    const error = thrown as ExcerptBudgetError;
    expect(error.violations.length).toBeGreaterThan(0);
    expect(error.violations.some((violation) => /word/i.test(violation))).toBe(true);
    expect(error.violations.some((violation) => /character/i.test(violation))).toBe(true);
  });

  it('rejects an excerpt over a source that is too short to carry one', () => {
    const candidate = phrase(40);
    expect(() => assertExcerptWithinBudget(candidate, candidate, sourceText(100))).toThrow(ExcerptBudgetError);
  });

  it('validates a compliant Hindi excerpt within budget', () => {
    const hindiCandidate = 'भारत ने आज नया उपग्रह प्रक्षेपित किया। यह मिशन सफल रहा।';
    const hindiSource = Array.from({ length: 200 }, () => 'समाचार').join(' ');
    expect(() => assertExcerptWithinBudget(hindiCandidate, hindiCandidate, hindiSource, 'hi')).not.toThrow();
  });

  it('requires a candidate prefix while allowing the publisher candidate and article body to differ', () => {
    const candidate = 'Publisher summary leads with this verified account.';
    const source = sourceText(200);

    expect(() => assertExcerptWithinBudget(candidate, candidate, source)).not.toThrow();
    expect(() => assertExcerptWithinBudget(`${candidate.slice(0, 20)}${EXCERPT_BUDGET.ellipsis}`, candidate, source)).not.toThrow();
    expect(() => assertExcerptWithinBudget('Verified account leads this publisher summary.', candidate, source)).toThrow(/CON-04/);
    expect(() => assertExcerptWithinBudget('summary leads with', candidate, source)).toThrow(/CON-04/);
  });
});

/* ------------------------------------------------------------------------- */
/* Group D — the stored shape                                                 */
/* ------------------------------------------------------------------------- */

describe('toStoredExcerpt', () => {
  it('carries the stored excerpt into the shared schema', () => {
    const result = applyExcerptBudget({
      candidate: phrase(40),
      sourceVisibleText: sourceText(200),
    });

    expect(toStoredExcerpt(result)).toEqual({
      text: result.text,
      wordCount: 40,
      charCount: result.charCount,
      sentenceCount: result.sentenceCount,
      sourceShare: 0.2,
    });
  });

  it('stores nothing when there is no excerpt', () => {
    const result = applyExcerptBudget({ candidate: phrase(40), sourceVisibleText: '' });

    expect(toStoredExcerpt(result)).toBeNull();
  });
});
