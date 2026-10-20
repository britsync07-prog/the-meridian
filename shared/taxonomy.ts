import type { SectionId } from './config/editions';

export type { SectionId };

/** The seven countries the site publishes an edition for. */
export type CountryCode = 'GB' | 'US' | 'AU' | 'CA' | 'IE' | 'NZ' | 'IN';

/** The three kinds of taxonomy tag a story can carry. */
export type TaxonomyKind = 'topic' | 'entity' | 'country';

/**
 * How a tag was arrived at. Every decision records its method and its confidence
 * so a later phase can tell a gazetteer match from a model guess.
 */
export type TaxonomyMethod = 'gazetteer' | 'feed' | 'lexicon' | 'model';

/** One taxonomy tag attached to a story or a cluster. */
export interface TaxonomyTag {
  kind: TaxonomyKind;
  slug: string;
  label: string;
  confidence: number;
  method: TaxonomyMethod;
}

/** A topic tag. Topics are open — they may be created as the corpus grows. */
export interface Topic extends TaxonomyTag {
  kind: 'topic';
}

/**
 * An entity tag. Entities are closed: only gazetteer-matched entities ever become
 * an entity page, so a long tail of guessed names never accumulates as thin pages.
 */
export interface Entity extends TaxonomyTag {
  kind: 'entity';
}

/** A country tag, used for the cross-country flagging that drives multi-edition stories. */
export interface CountryTag extends TaxonomyTag {
  kind: 'country';
  code: CountryCode;
}

/**
 * Model-extracted entities NEVER create entity pages.
 *
 * Per the architecture of record, a model may propose an entity, but only a
 * gazetteer match may publish one. The rule is encoded here, in the contract, so
 * it is visible to every runtime that reads the taxonomy rather than living in a
 * comment inside one implementation.
 */
export const GENERATES_ENTITY_PAGE = false;
