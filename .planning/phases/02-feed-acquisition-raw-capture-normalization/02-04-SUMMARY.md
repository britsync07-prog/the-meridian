# Plan 02-04: Hard Excerpt Budget Integration & Language Segmentation — Summary

**Execution Status:** Complete  
**Phase:** 02 (Feed Acquisition, Raw Capture & Normalization)  
**Plan:** 04  
**Requirements Addressed:** CON-01, CON-02, CON-03, CON-04, CON-05, D-11, D-12, D-13, D-14, D-15  

---

## Executive Overview

Plan 02-04 enforced the legal content and excerpt budget across all normalized feed items. Google strictly categorizes synonymizing, translating, or paraphrasing excerpts as scaled-content abuse. In accordance with the Meridian project mandates (CON-01 to CON-05, D-11 to D-15), publisher excerpts are strictly quoted verbatim or omitted, truncated at word boundaries with typographic ellipsis, and never generated for wire/stub articles shorter than 160 words.

Furthermore, unicode-aware segmentation with `Intl.Segmenter` was introduced for both English editions and Hindi Devanagari text (respecting the purna viram `।` punctuation mark), fully integrated with `shared/contract/excerpt-budget.ts` and the CI normalization pipeline.

---

## Completed Tasks

### Task 1: HTML Tag Stripping, Script Removal, and Entity Decoding
- **Created:** `src/ingest/text.ts` implementing `decodeHtmlEntities` and `cleanCandidateText`:
  - Completely strips `<script>...</script>` and `<style>...</style>` blocks.
  - Strips all HTML markup tags while preserving block-element boundary whitespace (`p`, `div`, `h1`-`h6`, `li`, `br`, etc.).
  - Decodes named HTML entities (`&amp;`, `&quot;`, `&apos;`, `&#39;`, `&nbsp;`, `&ndash;`, `&mdash;`, `&hellip;`).
  - Decodes decimal (`&#(\d+);`) and hexadecimal (`&#x([0-9a-fA-F]+);`) numeric entities.
  - Collapses consecutive whitespace to a single space and trims edges.
  - Handles null, undefined, or empty strings safely.
- **Verified:** `tests/text-cleaner.test.ts` (7 passing tests).
- **Git Commit:** `f0a4077` - `feat(ingest): implement HTML tag stripping, script removal, and entity decoding`

### Task 2: Unicode-Aware Language Segmentation with `Intl.Segmenter` for English and Hindi
- **Created:** `shared/contract/segmenter.ts`:
  - `countWordsUnicode(text, lang)`: Uses `Intl.Segmenter(lang, { granularity: 'word' })`, counting segments where `isWordLike === true`.
  - `countSentencesUnicode(text, lang)`: Uses `Intl.Segmenter(lang, { granularity: 'sentence' })`, filtering out punctuation-only or ellipsis segments via `[\p{L}\p{N}]/u` check. Accurately splits on standard English punctuation (`.`, `!`, `?`) and Hindi purna viram (`।` - U+0964).
  - `getWordEndOffsets(text, lang)`: Returns word-like token end boundaries for truncation.
- **Updated:** `shared/contract/excerpt-budget.ts`:
  - Updated `ExcerptInput` to support optional `language?: 'en' | 'hi'`.
  - Updated `assertExcerptWithinBudget` to support optional `language: 'en' | 'hi' = 'en'`.
  - Delegated `countWords`, `countSentences`, and `wordEndOffsets` to unicode segmentation while maintaining 100% backward compatibility for existing contract callers.
- **Verified:** `shared/contract/__tests__/segmenter.test.ts` (10 tests) and `shared/contract/__tests__/excerpt-budget.test.ts` (24 tests, including Hindi Devanagari purna viram truncation).
- **Git Commit:** `b0c9cf0` - `feat(contract): implement unicode-aware language segmentation with Intl.Segmenter for English and Hindi`

### Task 3: Excerpt Budget Integration into Normalizer & Ceiling Unit Assertions
- **Created:** `src/ingest/excerpt.ts`:
  - `extractExcerptCandidate(item)`: Implements the candidate cascade (D-11): `description` > `content:encoded` / `summary` > `content`, with clean source visible text extraction.
  - `buildSanitizedExcerpt(options)`: Invokes `applyExcerptBudget`, enforces `assertExcerptWithinBudget` (CON-05) on any non-null result, and returns `StoryExcerpt | null`.
- **Updated:** `shared/types.ts`:
  - Added optional `excerpt?: StoryExcerpt | null;` property on `RawItem`.
- **Updated:** `src/ingest/normalizer.ts`:
  - Integrated `extractExcerptCandidate` and `buildSanitizedExcerpt` into the feed item loop.
  - Populates `rawItem.excerpt` with the sanitized excerpt and sets `rawItem.description` from the excerpt text (falling back to candidate text if excerpt is null).
- **Created:** `tests/excerpt-pipeline.test.ts`:
  - Tested candidate extraction cascade.
  - Tested 160-word floor producing null excerpt (CON-02).
  - Tested 50-word cap with word boundary cut and ellipsis (CON-01, CON-03).
  - Tested 320-character ceiling with word boundary cut and ellipsis (CON-01, CON-03).
  - Tested 2-sentence maximum ceiling (CON-01).
  - Tested 30% source share ceiling (CON-01).
  - Tested Hindi Devanagari sentence truncation on purna viram `।` (D-14).
  - Tested `assertExcerptWithinBudget` rejection on over-budget excerpts.
  - Tested normalizer feed integration.
- **Verified:** `tests/excerpt-pipeline.test.ts` (12 tests) and `npm run typecheck`.
- **Git Commit:** `132d01b` - `feat(ingest): integrate excerpt budget into normalizer with strict unit assertions`

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Text Cleaner Tests | `npm test -- --run tests/text-cleaner.test.ts` | 7 passed |
| Segmenter Tests | `npm test -- --run shared/contract/__tests__/segmenter.test.ts` | 10 passed |
| Excerpt Budget Contract Tests | `npm test -- --run shared/contract/__tests__/excerpt-budget.test.ts` | 24 passed |
| Excerpt Pipeline Tests | `npm test -- --run tests/excerpt-pipeline.test.ts` | 12 passed |
| TypeScript Typecheck | `npm run typecheck` | Passed (0 errors) |
| Full Test Suite | `npm test -- --run` | 22 test files, 217 tests passed |
| Local D1 Verification | `npm run db:verify:local` | 24/24 assertions passed |
| R2 Bucket Lifecycle | `npm run r2:lifecycle:verify` | Verified 2 rules (raw/ 7d, media/ 365d) |

---

## Artifacts Produced & Modified

- `src/ingest/text.ts`: HTML tag stripping, script/style removal, and entity decoding
- `shared/contract/segmenter.ts`: Unicode-aware word and sentence tokenizer using `Intl.Segmenter` for English and Hindi
- `shared/contract/excerpt-budget.ts`: Language-aware budget enforcement and unit assertion
- `src/ingest/excerpt.ts`: Excerpt candidate extraction cascade and budget-sanitizer
- `src/ingest/normalizer.ts`: Integrated excerpt budget into feed normalization loop
- `shared/types.ts`: Added `excerpt?: StoryExcerpt | null;` to `RawItem`
- `tests/text-cleaner.test.ts`: Unit tests for HTML and entity decoding
- `shared/contract/__tests__/segmenter.test.ts`: Unit tests for English and Hindi segmentation
- `shared/contract/__tests__/excerpt-budget.test.ts`: Updated tests with Hindi purna viram coverage
- `tests/excerpt-pipeline.test.ts`: Comprehensive suite validating all CON-01 - CON-05 budget ceilings
