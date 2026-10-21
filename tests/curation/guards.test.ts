import { describe, it, expect } from 'vitest';
import {
  checkTimeWindow,
  checkDisjointEntities,
  checkSharedEntityOrStrongToken,
  checkOrdinalAndRoundConflict,
  checkAspectMarkerConflict,
  evaluateAntiMergeGuards,
  CandidateStoryInput,
} from '../../src/curation/guards.js';

describe('Anti-Merge Guards (CUR-04, CUR-05, D-02, D-03, D-05)', () => {
  describe('checkTimeWindow', () => {
    it('allows items published within 24 hours', () => {
      const d1 = '2026-10-21T10:00:00Z';
      const d2 = '2026-10-21T22:30:00Z'; // 12.5h apart
      expect(checkTimeWindow(d1, d2)).toBe(true);
    });

    it('rejects items published more than 24 hours apart', () => {
      const d1 = '2026-10-20T08:00:00Z';
      const d2 = '2026-10-21T09:00:00Z'; // 25h apart
      expect(checkTimeWindow(d1, d2)).toBe(false);
    });

    it('handles invalid dates gracefully', () => {
      expect(checkTimeWindow('not-a-date', '2026-10-21T09:00:00Z')).toBe(false);
    });
  });

  describe('checkDisjointEntities (CUR-05, D-02)', () => {
    it('unconditionally rejects candidate merge if both have entities and intersection is empty', () => {
      const entitiesA = ['rishi-sunak', 'conservative-party'];
      const entitiesB = ['keir-starmer', 'labour-party'];

      expect(checkDisjointEntities(entitiesA, entitiesB)).toBe(false);
    });

    it('allows candidate merge if recognized entities overlap', () => {
      const entitiesA = ['rishi-sunak', 'downing-street'];
      const entitiesB = ['rishi-sunak', 'hm-treasury'];

      expect(checkDisjointEntities(entitiesA, entitiesB)).toBe(true);
    });

    it('does not reject if one or both stories lack recognized entities', () => {
      expect(checkDisjointEntities([], ['keir-starmer'])).toBe(true);
      expect(checkDisjointEntities(['keir-starmer'], [])).toBe(true);
      expect(checkDisjointEntities([], [])).toBe(true);
    });
  });

  describe('checkSharedEntityOrStrongToken (CUR-04)', () => {
    it('allows merge when stories share a recognized entity', () => {
      expect(
        checkSharedEntityOrStrongToken(['modi'], ['modi'], [], [], 'en')
      ).toBe(true);
    });

    it('allows merge when stories share a distinctive token (> 5 chars, non-stoplist)', () => {
      const tokensA = ['earthquake', 'shakes', 'central', 'california'];
      const tokensB = ['magnitude', 'earthquake', 'strikes', 'county'];

      // "earthquake" has 10 characters (> 5 chars)
      expect(
        checkSharedEntityOrStrongToken([], [], tokensA, tokensB, 'en')
      ).toBe(true);
    });

    it('rejects merge when stories share only short or generic tokens', () => {
      const tokensA = ['fire', 'hits', 'dock']; // "fire", "hits", "dock" are <= 5 chars
      const tokensB = ['blaze', 'near', 'dock'];

      expect(
        checkSharedEntityOrStrongToken([], [], tokensA, tokensB, 'en')
      ).toBe(false);
    });
  });

  describe('checkOrdinalAndRoundConflict (D-03)', () => {
    it('rejects headlines with conflicting days', () => {
      expect(
        checkOrdinalAndRoundConflict(
          'G7 Summit: Leaders gather for Day 1 talks in Rome',
          'G7 Summit: Climate targets agreed on Day 2 in Rome'
        )
      ).toBe(false);
    });

    it('rejects headlines with conflicting parts or stages', () => {
      expect(
        checkOrdinalAndRoundConflict(
          'Special Investigation Part 1: NHS funding challenges',
          'Special Investigation Part 2: Hospital waiting times'
        )
      ).toBe(false);
      expect(
        checkOrdinalAndRoundConflict(
          'Tour de France: Stage 1 winner crowned in Lille',
          'Tour de France: Sprinters battle on Stage 2'
        )
      ).toBe(false);
    });

    it('rejects headlines with conflicting tournament rounds', () => {
      expect(
        checkOrdinalAndRoundConflict(
          'Wimbledon: Alcaraz storms through Round 1',
          'Wimbledon: Alcaraz secures place in Quarter-final'
        )
      ).toBe(false);

      expect(
        checkOrdinalAndRoundConflict(
          'Champions League: Arsenal in Quarter-final clash',
          'Champions League: Arsenal through to Semi-final'
        )
      ).toBe(false);
    });

    it('allows headlines sharing the same round or ordinal', () => {
      expect(
        checkOrdinalAndRoundConflict(
          'G7 Summit Day 1: Leaders arrive in Rome',
          'Day 1 of G7 Summit kicks off with trade discussions'
        )
      ).toBe(true);

      expect(
        checkOrdinalAndRoundConflict(
          'Wimbledon: Alcaraz triumphs in Quarter-final',
          'Quarter-final victory for Alcaraz on Centre Court'
        )
      ).toBe(true);
    });

    it('allows headlines where only one has a round or ordinal', () => {
      expect(
        checkOrdinalAndRoundConflict(
          'G7 Summit Day 1: Leaders arrive in Rome',
          'G7 Summit opens in Rome with high security'
        )
      ).toBe(true);
    });
  });

  describe('checkAspectMarkerConflict (D-03)', () => {
    it('rejects headlines with conflicting times of day', () => {
      expect(
        checkAspectMarkerConflict(
          'London transport disrupted following Friday morning power failure',
          'London commuters face travel chaos after Friday evening outage'
        )
      ).toBe(false);
    });

    it('rejects headlines with conflicting days of the week', () => {
      expect(
        checkAspectMarkerConflict(
          'Protest march planned for Friday across central London',
          'Massive crowds gather for Saturday protest in London'
        )
      ).toBe(false);
    });

    it('rejects headlines with conflicting relative days', () => {
      expect(
        checkAspectMarkerConflict(
          'Government to unveil new energy policy today',
          'Ministers faced backlash over energy plan announced yesterday'
        )
      ).toBe(false);
    });

    it('allows headlines with matching or non-conflicting temporal markers', () => {
      expect(
        checkAspectMarkerConflict(
          'London underground halted on Friday morning',
          'Friday morning rush hour halted by track fault'
        )
      ).toBe(true);

      expect(
        checkAspectMarkerConflict(
          'President speaks on Friday in Washington',
          'White House outlines new budget proposals'
        )
      ).toBe(true);
    });
  });

  describe('evaluateAntiMergeGuards (Comprehensive Orchestrator)', () => {
    it('fails with time_window_exceeded when published > 24 hours apart', () => {
      const storyA: CandidateStoryInput = {
        headline: 'Boeing 737 makes emergency landing at Heathrow',
        publishedAt: '2026-10-20T08:00:00Z',
        entities: ['boeing', 'heathrow-airport'],
        language: 'en',
      };
      const storyB: CandidateStoryInput = {
        headline: 'Emergency landing for Boeing jet at Heathrow',
        publishedAt: '2026-10-21T09:30:00Z', // 25.5 hours later
        entities: ['boeing', 'heathrow-airport'],
        language: 'en',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('time_window_exceeded');
    });

    it('fails with disjoint_entities (CUR-05) regardless of headline similarity', () => {
      const storyA: CandidateStoryInput = {
        headline: 'Election campaign rally draws massive crowd in capital',
        publishedAt: '2026-10-21T10:00:00Z',
        entities: ['donald-trump'],
        language: 'en',
      };
      const storyB: CandidateStoryInput = {
        headline: 'Election campaign rally draws massive crowd in capital',
        publishedAt: '2026-10-21T11:00:00Z',
        entities: ['kamala-harris'], // Disjoint entities!
        language: 'en',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('disjoint_entities');
    });

    it('fails with no_shared_entity (CUR-04) when tokens and entities do not match', () => {
      const storyA: CandidateStoryInput = {
        headline: 'Stock markets see turbulent session amid tech selloff',
        publishedAt: '2026-10-21T10:00:00Z',
        entities: [],
        language: 'en',
      };
      const storyB: CandidateStoryInput = {
        headline: 'Oil prices drop sharply as supply concerns ease',
        publishedAt: '2026-10-21T10:30:00Z',
        entities: [],
        language: 'en',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no_shared_entity');
    });

    it('fails with ordinal_conflict (D-03) on Day 1 vs Day 2', () => {
      const storyA: CandidateStoryInput = {
        headline: 'Ashes Series: Australia dominates England on Day 1 at Lord’s',
        publishedAt: '2026-10-21T10:00:00Z',
        entities: ['australia-cricket', 'england-cricket'],
        language: 'en',
      };
      const storyB: CandidateStoryInput = {
        headline: 'Ashes Series: England fights back strongly on Day 2 at Lord’s',
        publishedAt: '2026-10-21T12:00:00Z',
        entities: ['australia-cricket', 'england-cricket'],
        language: 'en',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('ordinal_conflict');
    });

    it('fails with aspect_marker_conflict (D-03) on Friday vs Saturday', () => {
      const storyA: CandidateStoryInput = {
        headline: 'Heathrow flights delayed following Friday thunderstorm',
        publishedAt: '2026-10-21T10:00:00Z',
        entities: ['heathrow-airport'],
        language: 'en',
      };
      const storyB: CandidateStoryInput = {
        headline: 'Heathrow flight delays continue into Saturday',
        publishedAt: '2026-10-21T12:00:00Z',
        entities: ['heathrow-airport'],
        language: 'en',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('aspect_marker_conflict');
    });

    it('allows merge for items covering the same event within 24h and matching entities', () => {
      const storyA: CandidateStoryInput = {
        headline: 'Bank of England cuts base interest rate to 4.75 percent',
        publishedAt: '2026-10-21T11:00:00Z',
        entities: ['bank-of-england'],
        language: 'en',
      };
      const storyB: CandidateStoryInput = {
        headline: 'Interest rates reduced to 4.75% by Bank of England in monetary policy shift',
        publishedAt: '2026-10-21T11:45:00Z',
        entities: ['bank-of-england'],
        language: 'en',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('allows merge for Hindi items covering the same event with shared entities within 24h', () => {
      const storyA: CandidateStoryInput = {
        headline: 'नरेंद्र मोदी ने दिल्ली में नई मेट्रो लाइन का उद्घाटन किया',
        publishedAt: '2026-10-21T06:00:00Z',
        entities: ['narendra-modi', 'delhi'],
        language: 'hi',
      };
      const storyB: CandidateStoryInput = {
        headline: 'प्रधानमंत्री नरेंद्र मोदी द्वारा दिल्ली मेट्रो के नए रूट की शुरुआत',
        publishedAt: '2026-10-21T08:30:00Z',
        entities: ['narendra-modi', 'delhi'],
        language: 'hi',
      };

      const result = evaluateAntiMergeGuards(storyA, storyB);
      expect(result.allowed).toBe(true);
    });
  });
});
