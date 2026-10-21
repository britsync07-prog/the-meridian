/**
 * src/curation/guards.ts — Comprehensive Anti-Merge Guards.
 *
 * Implements CUR-04, CUR-05, D-02, D-03, D-05.
 * Core philosophy: "Conservative aggregation — when in doubt, do not merge."
 *
 * Enforces five defensive gates before semantic embeddings are evaluated:
 * 1. Time Window Guard: |pub_date_diff| <= 24h
 * 2. Disjoint Entity Guard (CUR-05): unconditional block if both stories have recognized
 *    entities and their intersection is empty.
 * 3. Shared Entity / Distinctive Token Guard (CUR-04): requires either a shared entity
 *    or a shared non-generic distinctive token (> 5 characters, non-stoplist).
 * 4. Round / Ordinal Conflict Guard (D-03): blocks items differing in ordinals or rounds
 *    (e.g., "Day 1" vs "Day 2", "Round 1" vs "Quarter-final").
 * 5. Aspect-Marker Conflict Guard (D-03): blocks items differing in temporal markers
 *    (e.g., "morning" vs "evening", "Friday" vs "Saturday", "today" vs "yesterday").
 */

import { isNoiseToken, isStopWord } from '../../config/stoplist.js';
import { tokenizeHeadline } from './simhash.js';

export interface CandidateStoryInput {
  headline: string;
  excerpt?: string | null;
  publishedAt: string; // ISO timestamp
  entities: string[];  // recognized entity slugs or canonical names
  language: 'en' | 'hi';
}

export interface GuardEvaluationResult {
  allowed: boolean;
  reason?: 'disjoint_entities' | 'no_shared_entity' | 'time_window_exceeded' | 'ordinal_conflict' | 'aspect_marker_conflict';
  details?: string;
}

/**
 * 1. Time Window Guard (D-05, CUR-04)
 * Returns false if publication dates differ by more than maxWindowHours (default 24h).
 */
export function checkTimeWindow(dateA: string, dateB: string, maxWindowHours = 24): boolean {
  const timeA = new Date(dateA).getTime();
  const timeB = new Date(dateB).getTime();

  if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
    return false;
  }

  const diffMs = Math.abs(timeA - timeB);
  const maxMs = maxWindowHours * 60 * 60 * 1000;
  return diffMs <= maxMs;
}

/**
 * 2. Disjoint Entity Guard (CUR-05, D-02)
 * If both stories have recognized entities, their intersection MUST NOT be empty.
 * If intersection is empty, returns false (unconditional block).
 */
export function checkDisjointEntities(entitiesA: string[], entitiesB: string[]): boolean {
  if (!entitiesA || !entitiesB || entitiesA.length === 0 || entitiesB.length === 0) {
    // If either side lacks recognized entities, disjoint-entity guard does not block.
    return true;
  }

  const setB = new Set(entitiesB.map((e) => e.trim().toLowerCase()));
  const hasOverlap = entitiesA.some((e) => setB.has(e.trim().toLowerCase()));
  return hasOverlap;
}

/**
 * 3. Shared Entity or Distinctive Token Guard (CUR-04)
 * Headline similarity is never evaluated without a shared non-generic entity or distinctive token.
 * A distinctive token must have > 5 characters and not be in the stoplist.
 */
export function checkSharedEntityOrStrongToken(
  entitiesA: string[],
  entitiesB: string[],
  tokensA: string[],
  tokensB: string[],
  language: 'en' | 'hi' = 'en'
): boolean {
  // Check shared recognized entities first
  if (entitiesA && entitiesB && entitiesA.length > 0 && entitiesB.length > 0) {
    const setB = new Set(entitiesB.map((e) => e.trim().toLowerCase()));
    if (entitiesA.some((e) => setB.has(e.trim().toLowerCase()))) {
      return true;
    }
  }

  // Check shared distinctive tokens (> 5 characters, not in stoplist)
  const setTokensB = new Set(tokensB);
  for (const token of tokensA) {
    if (token.length > 5 && setTokensB.has(token)) {
      if (!isNoiseToken(token, language) && !isStopWord(token, language)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Helper to extract numbered categories (e.g. Day 1, Part 2, Stage 3).
 */
function extractNumberedCategory(text: string, category: string): string | null {
  const wordMap: Record<string, string> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6',
    एक: '1', दो: '2', तीन: '3', चार: '4', पांच: '5',
    पहला: '1', पहले: '1', दूसरा: '2', दूसरे: '2', तीसरा: '3', तीसरे: '3',
    opening: '1', initial: '1', final: 'final',
  };

  let regex: RegExp;
  if (category === 'day') {
    regex = /(?<![\p{L}\p{N}])(?:day|दिन)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|एक|दो|तीन|चार|पांच)(?![\p{L}\p{N}])/iu;
  } else if (category === 'part') {
    regex = /(?<![\p{L}\p{N}])(?:part|भाग)\s*(\d+|one|two|three|four|five|i|ii|iii|iv|v|vi|एक|दो|तीन|चार)(?![\p{L}\p{N}])/iu;
  } else if (category === 'stage') {
    regex = /(?<![\p{L}\p{N}])(?:(?:stage|चरण)\s*(\d+|one|two|three|four|five|opening|initial|final|पहला|दूसरा|तीसरा|एक|दो|तीन|चार)|(पहला|पहले|दूसरा|दूसरे|तीसरा|तीसरे|opening|initial|final)\s+(?:stage|चरण))(?![\p{L}\p{N}])/iu;
  } else if (category === 'game') {
    regex = /(?<![\p{L}\p{N}])game\s*(\d+|one|two|three|four|five|six|seven)(?![\p{L}\p{N}])/iu;
  } else if (category === 'leg') {
    regex = /(?<![\p{L}\p{N}])(?:leg\s*(\d+|one|two)|(first|second|1st|2nd)\s+leg)(?![\p{L}\p{N}])/iu;
  } else if (category === 'test') {
    regex = /(?<![\p{L}\p{N}])(?:test\s*(\d+|one|two|three|four|five)|(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+test)(?![\p{L}\p{N}])/iu;
  } else {
    return null;
  }

  const match = text.match(regex);
  if (!match) return null;

  const captured = (match[1] || match[2] || '').toLowerCase();
  return wordMap[captured] || captured;
}

/**
 * Helper to extract tournament stages (Round 1, Round of 16, Quarter-final, Semi-final, Final).
 */
function extractTournamentRound(text: string): string | null {
  if (/(?<![\p{L}\p{N}])(?:quarter-?finals?|quarters?|क्वार्टर\s*फाइनल)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'quarter_final';
  }
  if (/(?<![\p{L}\p{N}])(?:semi-?finals?|semis?|सेमी\s*फाइनल)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'semi_final';
  }
  if (/(?<![\p{L}\p{N}])(?:preliminary\s+finals?|prelims?)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'preliminary_final';
  }
  if (/(?<![\p{L}\p{N}])(?:round\s*of\s*64|r64)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'round_of_64';
  }
  if (/(?<![\p{L}\p{N}])(?:round\s*of\s*32|r32)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'round_of_32';
  }
  if (/(?<![\p{L}\p{N}])(?:round\s*of\s*16|r16|last\s*16)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'round_of_16';
  }
  if (/(?<![\p{L}\p{N}])(?:league\s+stage|लीग\s+चरण)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'league_stage';
  }
  const roundNumMatch = text.match(/(?<![\p{L}\p{N}])round\s*(\d+)(?![\p{L}\p{N}])/iu);
  if (roundNumMatch) {
    return `round_${roundNumMatch[1]}`;
  }
  const ordinalRoundMatch = text.match(/(?<![\p{L}\p{N}])(first|second|third|fourth|1st|2nd|3rd|4th)\s+round(?![\p{L}\p{N}])/iu);
  if (ordinalRoundMatch) {
    const map: Record<string, string> = {
      first: '1', '1st': '1',
      second: '2', '2nd': '2',
      third: '3', '3rd': '3',
      fourth: '4', '4th': '4',
    };
    return `round_${map[ordinalRoundMatch[1].toLowerCase()] || ordinalRoundMatch[1]}`;
  }
  if (/(?<![\p{L}\p{N}])(?:grand\s+final|cup\s+final|world\s+cup\s+final|tournament\s+final|in\s+final|into\s+final|reaches?\s+final|clashes?\s+in\s+final|\bfinal\b)(?![\p{L}\p{N}])/iu.test(text)) {
    return 'final';
  }

  return null;
}

/**
 * 4. Round / Ordinal Conflict Guard (D-03)
 * Rejects items differing in rounds, days, parts, stages, or legs.
 */
export function checkOrdinalAndRoundConflict(headlineA: string, headlineB: string): boolean {
  const categories = ['day', 'part', 'stage', 'game', 'leg', 'test'];
  for (const cat of categories) {
    const valA = extractNumberedCategory(headlineA, cat);
    const valB = extractNumberedCategory(headlineB, cat);
    if (valA && valB && valA !== valB) {
      return false; // Conflict detected
    }
  }

  const roundA = extractTournamentRound(headlineA);
  const roundB = extractTournamentRound(headlineB);
  if (roundA && roundB && roundA !== roundB) {
    return false; // Conflict detected
  }

  return true;
}

/**
 * 5. Aspect-Marker Conflict Guard (D-03)
 * Rejects items differing in temporal aspects (e.g. morning vs evening, Friday vs Saturday).
 */
export function checkAspectMarkerConflict(headlineA: string, headlineB: string): boolean {
  const ub = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'iu');

  const aspectDimensions = [
    // Time of day
    {
      name: 'time_of_day',
      markers: [
        { key: 'morning', regex: ub('(?:morning|सुबह)') },
        { key: 'afternoon', regex: ub('(?:afternoon|दोपहर)') },
        { key: 'evening', regex: ub('(?:evening|शाम)') },
        { key: 'night', regex: ub('(?:night|tonight|रात)') },
      ],
    },
    // Days of the week
    {
      name: 'day_of_week',
      markers: [
        { key: 'mon', regex: ub('(?:monday|सोमवार)') },
        { key: 'tue', regex: ub('(?:tuesday|मंगलवार)') },
        { key: 'wed', regex: ub('(?:wednesday|बुधवार)') },
        { key: 'thu', regex: ub('(?:thursday|गुरुवार)') },
        { key: 'fri', regex: ub('(?:friday|शुक्रवार)') },
        { key: 'sat', regex: ub('(?:saturday|शनिवार)') },
        { key: 'sun', regex: ub('(?:sunday|रविवार)') },
      ],
    },
    // Relative days
    {
      name: 'relative_day',
      markers: [
        { key: 'yesterday', regex: ub('(?:yesterday|बीते कल)') },
        { key: 'today', regex: ub('(?:today|आज)') },
        { key: 'tomorrow', regex: ub('(?:tomorrow)') },
      ],
    },
  ];

  for (const dim of aspectDimensions) {
    const matchedA = dim.markers.filter((m) => m.regex.test(headlineA)).map((m) => m.key);
    const matchedB = dim.markers.filter((m) => m.regex.test(headlineB)).map((m) => m.key);

    if (matchedA.length > 0 && matchedB.length > 0) {
      const setB = new Set(matchedB);
      const overlap = matchedA.some((k) => setB.has(k));
      if (!overlap) {
        return false; // Conflicting temporal markers within the same aspect dimension
      }
    }
  }

  return true;
}

/**
 * Orchestrator: Evaluates all anti-merge guards in strict defensive sequence.
 */
export function evaluateAntiMergeGuards(
  storyA: CandidateStoryInput,
  storyB: CandidateStoryInput
): GuardEvaluationResult {
  // 1. Time Window Guard
  if (!checkTimeWindow(storyA.publishedAt, storyB.publishedAt, 24)) {
    return {
      allowed: false,
      reason: 'time_window_exceeded',
      details: 'Candidate stories were published more than 24 hours apart',
    };
  }

  // 2. Disjoint Entity Guard (CUR-05)
  if (!checkDisjointEntities(storyA.entities, storyB.entities)) {
    return {
      allowed: false,
      reason: 'disjoint_entities',
      details: 'Candidate stories have recognized entity sets that are completely disjoint',
    };
  }

  // 3. Shared Entity or Distinctive Token Guard (CUR-04)
  const tokensA = tokenizeHeadline(storyA.headline, storyA.language);
  const tokensB = tokenizeHeadline(storyB.headline, storyB.language);
  if (!checkSharedEntityOrStrongToken(storyA.entities, storyB.entities, tokensA, tokensB, storyA.language)) {
    return {
      allowed: false,
      reason: 'no_shared_entity',
      details: 'Candidate stories have no shared entity and no shared distinctive token (> 5 chars, non-stoplist)',
    };
  }

  // 4. Round / Ordinal Conflict Guard (D-03)
  if (!checkOrdinalAndRoundConflict(storyA.headline, storyB.headline)) {
    return {
      allowed: false,
      reason: 'ordinal_conflict',
      details: 'Candidate stories conflict in round, day, part, stage, or tournament marker',
    };
  }

  // 5. Aspect-Marker Conflict Guard (D-03)
  if (!checkAspectMarkerConflict(storyA.headline, storyB.headline)) {
    return {
      allowed: false,
      reason: 'aspect_marker_conflict',
      details: 'Candidate stories conflict in temporal aspect markers (e.g. morning vs evening, Friday vs Saturday)',
    };
  }

  return { allowed: true };
}
