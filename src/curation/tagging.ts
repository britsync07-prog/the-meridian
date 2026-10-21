/**
 * src/curation/tagging.ts — Bilingual gazetteer entity matching, topic tagging,
 * and cross-country edition flagging.
 *
 * Implements CUR-11, CUR-12, CUR-13, CUR-15, D-15.
 *
 * CRITICAL INVARIANT (CUR-12, shared/taxonomy.ts):
 * Only entities matched against the curated gazetteer (config/gazetteer.ts)
 * may generate landing pages (generatesPage: true). Model-extracted entities
 * MUST NEVER generate landing pages (generatesPage: false).
 */

import { GAZETTEER_ENTITIES, type GazetteerEntity } from '../../config/gazetteer.js';
import type { EditionId } from '../../shared/config/editions.js';
import type { CountryCode } from '../../shared/taxonomy.js';

export interface MatchedGazetteerEntity {
  entity: GazetteerEntity;
  confidence: number;
  generatesPage: true;
}

export interface ModelEntityResult {
  name: string;
  generatesPage: false;
}

export interface EditionFlag {
  editionId: EditionId;
  reason: 'source' | 'entity' | 'gazetteer' | 'wire';
  confidence: number;
}

export const COUNTRY_TO_EDITION: Record<CountryCode, EditionId> = {
  GB: 'uk',
  US: 'us',
  AU: 'au',
  CA: 'ca',
  IE: 'ie',
  NZ: 'nz',
  IN: 'in',
};

export const ENGLISH_EDITIONS: readonly EditionId[] = [
  'uk',
  'us',
  'au',
  'ca',
  'ie',
  'nz',
  'in',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build boundary-aware regular expression for entity matching.
 * Handles both Latin script (\b word boundaries) and Devanagari script.
 */
function buildEntityRegex(name: string): RegExp {
  const isDevanagari = /[\u0900-\u097F]/.test(name);
  const escaped = escapeRegex(name.trim());

  if (isDevanagari) {
    // Unicode letter boundary for Devanagari
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, 'u');
  }

  // If short uppercase acronym (e.g. "UN", "EU", "AP"), match case-sensitively
  if (name.length <= 2 && name === name.toUpperCase()) {
    return new RegExp(`\\b${escaped}\\b`);
  }

  return new RegExp(`\\b${escaped}\\b`, 'i');
}

/**
 * Scans text for canonical names, Hindi names, and aliases from GAZETTEER_ENTITIES.
 * Returns matches with generatesPage: true (CUR-12).
 */
export function matchGazetteerEntities(
  text: string,
  _language?: 'en' | 'hi',
): MatchedGazetteerEntity[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const results: MatchedGazetteerEntity[] = [];
  const seenSlugs = new Set<string>();

  for (const entity of GAZETTEER_ENTITIES) {
    let matched = false;
    let confidence = 0;

    // 1. Try canonical name
    const canonicalRegex = buildEntityRegex(entity.canonicalName);
    if (canonicalRegex.test(text)) {
      matched = true;
      confidence = 1.0;
    }

    // 2. Try Hindi name if available
    if (!matched && entity.hindiName) {
      const hindiRegex = buildEntityRegex(entity.hindiName);
      if (hindiRegex.test(text)) {
        matched = true;
        confidence = 1.0;
      }
    }

    // 3. Try aliases
    if (!matched && entity.aliases && entity.aliases.length > 0) {
      for (const alias of entity.aliases) {
        if (!alias.trim()) continue;
        const aliasRegex = buildEntityRegex(alias);
        if (aliasRegex.test(text)) {
          matched = true;
          confidence = 0.95;
          break;
        }
      }
    }

    if (matched && !seenSlugs.has(entity.slug)) {
      seenSlugs.add(entity.slug);
      results.push({
        entity,
        confidence,
        generatesPage: true,
      });
    }
  }

  return results;
}

/**
 * Enforces the CUR-12 / shared/taxonomy.ts invariant:
 * Model-extracted entities NEVER generate landing pages.
 */
export function enrichModelEntities(entities: string[]): ModelEntityResult[] {
  return entities.map((name) => ({
    name: name.trim(),
    generatesPage: false,
  }));
}

/**
 * Determine which edition front pages should carry a cluster.
 * Based on outlet country ('source'), entity country ('entity'),
 * supranational relevance ('gazetteer'), or global breaking ('wire') (CUR-13).
 *
 * Deduplicates per editionId, retaining the flag with highest confidence.
 */
export function determineEditionFlags(cluster: {
  outletCountries: string[];
  matchedEntities: GazetteerEntity[];
  isWireBreaking?: boolean;
}): EditionFlag[] {
  const flagsByEdition = new Map<EditionId, EditionFlag>();

  function addFlag(editionId: EditionId, reason: EditionFlag['reason'], confidence: number) {
    const existing = flagsByEdition.get(editionId);
    if (!existing || confidence > existing.confidence) {
      flagsByEdition.set(editionId, { editionId, reason, confidence });
    }
  }

  // 1. Outlet countries ('source') — confidence 1.0
  for (const country of cluster.outletCountries) {
    const upperCountry = country.toUpperCase() as CountryCode;
    const editionId = COUNTRY_TO_EDITION[upperCountry];
    if (editionId) {
      addFlag(editionId, 'source', 1.0);
    }
  }

  // 2. Matched entities with country code ('entity') — confidence 0.90
  for (const entity of cluster.matchedEntities) {
    if (entity.countryCode) {
      const editionId = COUNTRY_TO_EDITION[entity.countryCode];
      if (editionId) {
        addFlag(editionId, 'entity', 0.9);
      }
    }

    // 3. Supranational entities ('gazetteer') — flag all 7 English editions with confidence 0.85
    if (entity.isSupranational) {
      for (const editionId of ENGLISH_EDITIONS) {
        addFlag(editionId, 'gazetteer', 0.85);
      }
    }
  }

  // 4. Global breaking wire ('wire') — flag all 7 English editions with confidence 0.95
  if (cluster.isWireBreaking) {
    for (const editionId of ENGLISH_EDITIONS) {
      addFlag(editionId, 'wire', 0.95);
    }
  }

  return Array.from(flagsByEdition.values());
}
