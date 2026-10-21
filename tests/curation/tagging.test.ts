import { describe, it, expect } from 'vitest';
import { GAZETTEER_ENTITIES } from '../../config/gazetteer.js';
import { SECTION_KEYWORDS } from '../../config/lexicon.js';
import { SECTIONS, SectionId } from '../../shared/config/editions.js';
import { GENERATES_ENTITY_PAGE } from '../../shared/taxonomy.js';
import {
  matchGazetteerEntities,
  enrichModelEntities,
  determineEditionFlags,
} from '../../src/curation/tagging.js';

describe('Bilingual Entity Gazetteer & Lexicons (CUR-12, CUR-15, Task 1)', () => {
  it('contains curated entities across UK, US, AU, CA, IE, NZ, IN with English and Hindi aliases', () => {
    expect(GAZETTEER_ENTITIES.length).toBeGreaterThanOrEqual(40);

    const countryCodes = new Set(
      GAZETTEER_ENTITIES.map((e) => e.countryCode).filter(Boolean),
    );
    expect(countryCodes.has('GB')).toBe(true);
    expect(countryCodes.has('US')).toBe(true);
    expect(countryCodes.has('AU')).toBe(true);
    expect(countryCodes.has('CA')).toBe(true);
    expect(countryCodes.has('IE')).toBe(true);
    expect(countryCodes.has('NZ')).toBe(true);
    expect(countryCodes.has('IN')).toBe(true);

    // Narendra Modi
    const modi = GAZETTEER_ENTITIES.find((e) => e.slug === 'narendra-modi');
    expect(modi).toBeDefined();
    expect(modi?.hindiName).toBe('नरेंद्र मोदी');
    expect(modi?.aliases).toContain('मोदी');

    // London
    const london = GAZETTEER_ENTITIES.find((e) => e.slug === 'london');
    expect(london).toBeDefined();
    expect(london?.hindiName).toBe('लंदन');

    // Bank of England
    const boe = GAZETTEER_ENTITIES.find((e) => e.slug === 'bank-of-england');
    expect(boe).toBeDefined();

    // NASA
    const nasa = GAZETTEER_ENTITIES.find((e) => e.slug === 'nasa');
    expect(nasa).toBeDefined();

    // Reserve Bank of India
    const rbi = GAZETTEER_ENTITIES.find((e) => e.slug === 'reserve-bank-of-india');
    expect(rbi).toBeDefined();
    expect(rbi?.hindiName).toBe('भारतीय रिजर्व बैंक');
  });

  it('defines keyword weights mapped strictly to the 8 canonical broadsheet desks in English and Hindi', () => {
    const canonicalDeskIds = SECTIONS.map((s) => s.id) as SectionId[];
    const lexiconKeys = Object.keys(SECTION_KEYWORDS) as SectionId[];

    // Lexicon must have exact keys of canonical broadsheet desks
    expect(lexiconKeys.sort()).toEqual(canonicalDeskIds.sort());

    for (const desk of canonicalDeskIds) {
      const entry = SECTION_KEYWORDS[desk];
      expect(entry).toBeDefined();
      expect(Object.keys(entry.en).length).toBeGreaterThanOrEqual(10);
      expect(Object.keys(entry.hi).length).toBeGreaterThanOrEqual(8);

      for (const [kw, weight] of Object.entries(entry.en)) {
        expect(typeof kw).toBe('string');
        expect(weight).toBeGreaterThan(0);
      }
      for (const [kw, weight] of Object.entries(entry.hi)) {
        expect(typeof kw).toBe('string');
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  describe('Landing-Page Gate (CUR-12, D-15)', () => {
    it('marks gazetteer-matched entities eligible for landing pages (generatesPage: true)', () => {
      const text = 'Prime Minister Keir Starmer arrived in London today for bilateral talks.';
      const matches = matchGazetteerEntities(text, 'en');

      expect(matches.length).toBeGreaterThanOrEqual(2);
      const starmer = matches.find((m) => m.entity.slug === 'keir-starmer');
      const london = matches.find((m) => m.entity.slug === 'london');

      expect(starmer).toBeDefined();
      expect(starmer?.generatesPage).toBe(true);
      expect(london).toBeDefined();
      expect(london?.generatesPage).toBe(true);
    });

    it('enforces GENERATES_ENTITY_PAGE = false for model-extracted entities', () => {
      expect(GENERATES_ENTITY_PAGE).toBe(false);

      const rawModelEntities = ['Local Council Member John Doe', 'Springfield Elementary'];
      const enriched = enrichModelEntities(rawModelEntities);

      expect(enriched.length).toBe(2);
      expect(enriched[0].generatesPage).toBe(false);
      expect(enriched[1].generatesPage).toBe(false);
      expect(enriched[0].name).toBe('Local Council Member John Doe');
    });
  });

  describe('Bilingual Gazetteer Matching (CUR-15)', () => {
    it('matches entities in Latin English text', () => {
      const text = 'US President Joe Biden met with Federal Reserve officials in Washington.';
      const matches = matchGazetteerEntities(text, 'en');
      const slugs = matches.map((m) => m.entity.slug);

      expect(slugs).toContain('joe-biden');
      expect(slugs).toContain('federal-reserve');
      expect(slugs).toContain('washington');
    });

    it('matches entities in Devanagari Hindi text', () => {
      const text = 'प्रधानमंत्री नरेंद्र मोदी ने नई दिल्ली में भारतीय रिजर्व बैंक के अधिकारियों से मुलाकात की।';
      const matches = matchGazetteerEntities(text, 'hi');
      const slugs = matches.map((m) => m.entity.slug);

      expect(slugs).toContain('narendra-modi');
      expect(slugs).toContain('new-delhi');
      expect(slugs).toContain('reserve-bank-of-india');
    });

    it('matches via Hindi alias or Devanagari translation', () => {
      const text = 'लंदन में भारतीय समुदाय ने गर्मजोशी से स्वागत किया';
      const matches = matchGazetteerEntities(text, 'hi');
      const slugs = matches.map((m) => m.entity.slug);

      expect(slugs).toContain('london');
    });

    it('avoids false substring matches on short abbreviations', () => {
      // "unemployment" should not match UN ("united-nations")
      const text = 'Under unprecedented economic pressure, unemployment rises in rural sector.';
      const matches = matchGazetteerEntities(text, 'en');
      const slugs = matches.map((m) => m.entity.slug);

      expect(slugs).not.toContain('united-nations');
    });

    it('correctly matches standalone short acronyms', () => {
      const text = 'UN Security Council votes on urgent resolution regarding border treaty';
      const matches = matchGazetteerEntities(text, 'en');
      const slugs = matches.map((m) => m.entity.slug);

      expect(slugs).toContain('united-nations');
    });
  });

  describe('Cross-Country Edition Flagging (CUR-13, Task 3)', () => {
    it('flags edition based on outlet country with reason "source"', () => {
      const flags = determineEditionFlags({
        outletCountries: ['GB'],
        matchedEntities: [],
      });

      expect(flags).toHaveLength(1);
      expect(flags[0]).toEqual({
        editionId: 'uk',
        reason: 'source',
        confidence: 1.0,
      });
    });

    it('flags edition based on matched entity country with reason "entity"', () => {
      const usEntity = GAZETTEER_ENTITIES.find((e) => e.slug === 'joe-biden')!;
      expect(usEntity).toBeDefined();

      const flags = determineEditionFlags({
        outletCountries: [],
        matchedEntities: [usEntity],
      });

      expect(flags).toHaveLength(1);
      expect(flags[0]).toEqual({
        editionId: 'us',
        reason: 'entity',
        confidence: 0.9,
      });
    });

    it('flags all 7 English editions when cluster mentions supranational entity', () => {
      const unEntity = GAZETTEER_ENTITIES.find((e) => e.slug === 'united-nations')!;
      expect(unEntity.isSupranational).toBe(true);

      const flags = determineEditionFlags({
        outletCountries: [],
        matchedEntities: [unEntity],
      });

      expect(flags).toHaveLength(7);
      const editionIds = flags.map((f) => f.editionId).sort();
      expect(editionIds).toEqual(['au', 'ca', 'ie', 'in', 'nz', 'uk', 'us']);
      for (const flag of flags) {
        expect(flag.reason).toBe('gazetteer');
        expect(flag.confidence).toBe(0.85);
      }
    });

    it('flags all 7 English editions when cluster is marked wire breaking', () => {
      const flags = determineEditionFlags({
        outletCountries: [],
        matchedEntities: [],
        isWireBreaking: true,
      });

      expect(flags).toHaveLength(7);
      for (const flag of flags) {
        expect(flag.reason).toBe('wire');
        expect(flag.confidence).toBe(0.95);
      }
    });

    it('prioritizes source reason (conf 1.0) over supranational gazetteer reason (conf 0.85)', () => {
      const unEntity = GAZETTEER_ENTITIES.find((e) => e.slug === 'united-nations')!;

      const flags = determineEditionFlags({
        outletCountries: ['GB'], // 'uk' will have 'source'
        matchedEntities: [unEntity], // all 7 will have 'gazetteer'
      });

      expect(flags).toHaveLength(7);
      const ukFlag = flags.find((f) => f.editionId === 'uk');
      expect(ukFlag).toEqual({
        editionId: 'uk',
        reason: 'source',
        confidence: 1.0,
      });

      const usFlag = flags.find((f) => f.editionId === 'us');
      expect(usFlag).toEqual({
        editionId: 'us',
        reason: 'gazetteer',
        confidence: 0.85,
      });
    });
  });
});
