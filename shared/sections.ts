import type { SectionId } from './config/editions';

export { SECTIONS } from './config/editions';
export type { Section, SectionId } from './config/editions';

/**
 * The seed of the section lexicon priors.
 *
 * Every section starts at the same neutral prior. Track E (lexicon curation) and
 * Phase 3's section resolver replace these with measured weights; nothing reads a
 * prior from anywhere else.
 */
export const SECTION_LEXICON_PRIORS: Record<SectionId, number> = {
  politics: 0.25,
  business: 0.25,
  technology: 0.25,
  sport: 0.25,
  health: 0.25,
  world: 0.25,
  weather: 0.25,
  entertainment: 0.25,
};
