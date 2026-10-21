/**
 * src/curation/sections.ts — Hierarchical 4-stage section resolver.
 *
 * Implements CUR-14, D-13, D-14.
 *
 * Resolves incoming story or cluster assignment among the 8 canonical broadsheet desks:
 *   - politics
 *   - business
 *   - technology
 *   - sport
 *   - health
 *   - world
 *   - weather
 *   - entertainment
 *
 * Cascade:
 *   Stage 1: Source Feed Prior (confidence >= 0.80 -> method: 'source', conf: 0.85)
 *   Stage 2: Weighted Lexicon (top score > 0 & margin >= 0.5 -> method: 'lexicon', conf: 0.60..0.95)
 *   Stage 3: Cloudflare Workers AI Tiebreak (ai confidence > 0.60 -> method: 'ai_tiebreak', conf: model)
 *   Stage 4: Default Fallback -> desk: 'world', method: 'fallback', conf: 0.10
 */

import { SECTION_KEYWORDS } from '../../config/lexicon.js';
import type { SectionId } from '../../shared/config/editions.js';

export interface SectionResolutionResult {
  sectionId: SectionId;
  method: 'source' | 'lexicon' | 'ai_tiebreak' | 'fallback';
  confidence: number;
}

export interface ResolveSectionInput {
  headline: string;
  excerpt?: string | null;
  language: 'en' | 'hi';
  feedPriorSection?: SectionId | null;
  feedPriorScore?: number;
}

export type AiSectionClassifier = (
  text: string,
) => Promise<{ sectionId: SectionId; confidence: number } | null>;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score text against the 8 canonical broadsheet desks using config/lexicon.ts keywords.
 * Returns a score mapping for each of the 8 desks.
 */
export function scoreHeadlineLexicon(
  text: string,
  language: 'en' | 'hi',
): Record<SectionId, number> {
  const scores: Record<SectionId, number> = {
    politics: 0,
    business: 0,
    technology: 0,
    sport: 0,
    health: 0,
    world: 0,
    weather: 0,
    entertainment: 0,
  };

  if (!text || text.trim().length === 0) {
    return scores;
  }

  const isHindi = language === 'hi';

  for (const desk of Object.keys(SECTION_KEYWORDS) as SectionId[]) {
    const keywords = SECTION_KEYWORDS[desk][language] ?? {};
    let deskScore = 0;

    for (const [kw, weight] of Object.entries(keywords)) {
      const escaped = escapeRegex(kw.trim());
      let regex: RegExp;

      if (isHindi || /[\u0900-\u097F]/.test(kw)) {
        regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, 'u');
      } else {
        regex = new RegExp(`\\b${escaped}\\b`, 'i');
      }

      if (regex.test(text)) {
        deskScore += weight;
      }
    }

    scores[desk] = deskScore;
  }

  return scores;
}

/**
 * Resolve cluster section via the 4-stage cascade (CUR-14).
 */
export async function resolveSection(
  input: ResolveSectionInput,
  aiClassifier?: AiSectionClassifier,
): Promise<SectionResolutionResult> {
  // ─── Stage 1: Feed Prior ────────────────────────────────────────────────
  if (input.feedPriorSection && (input.feedPriorScore ?? 0) >= 0.8) {
    return {
      sectionId: input.feedPriorSection,
      method: 'source',
      confidence: 0.85,
    };
  }

  // ─── Stage 2: Weighted Lexicon ──────────────────────────────────────────
  const fullText = input.excerpt
    ? `${input.headline} ${input.excerpt}`
    : input.headline;

  const scores = scoreHeadlineLexicon(fullText, input.language);
  const sortedDesks = (Object.keys(scores) as SectionId[]).sort(
    (a, b) => scores[b] - scores[a],
  );

  const topDesk = sortedDesks[0];
  const topScore = scores[topDesk] ?? 0;
  const runnerUpDesk = sortedDesks[1];
  const runnerUpScore = scores[runnerUpDesk] ?? 0;
  const margin = topScore - runnerUpScore;

  // Clear winner if topScore > 0 and margin >= 0.5
  if (topScore > 0 && margin >= 0.5) {
    const rawConf = Math.min(0.95, 0.6 + 0.1 * margin);
    return {
      sectionId: topDesk,
      method: 'lexicon',
      confidence: Number(rawConf.toFixed(2)),
    };
  }

  // ─── Stage 3: AI Tiebreaker ─────────────────────────────────────────────
  if (aiClassifier) {
    try {
      const aiResult = await aiClassifier(fullText);
      if (aiResult && aiResult.confidence > 0.6) {
        return {
          sectionId: aiResult.sectionId,
          method: 'ai_tiebreak',
          confidence: Number(aiResult.confidence.toFixed(2)),
        };
      }
    } catch {
      // If AI fails or throws, gracefully proceed to Stage 4 fallback
    }
  }

  // ─── Stage 4: World Fallback ────────────────────────────────────────────
  return {
    sectionId: 'world',
    method: 'fallback',
    confidence: 0.1,
  };
}
