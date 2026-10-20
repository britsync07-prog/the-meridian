/**
 * The eight editions and the eight sections.
 *
 * D-13: all editions share ONE site name. Edition identity lives in the page
 * title, the meta description, the `<h1>` and the visible masthead — never in a
 * second site name. Reading the edition identity from this one list is what keeps
 * a new edition from inventing its own.
 *
 * Edition paths are locale path prefixes on ONE hostname. Subdomains are never used.
 */

export const EDITIONS = [
  {
    id: 'uk',
    slug: 'uk',
    countryName: 'United Kingdom',
    countryCode: 'GB',
    language: 'en',
    htmlLang: 'en-GB',
    path: '/uk/',
  },
  {
    id: 'us',
    slug: 'us',
    countryName: 'United States',
    countryCode: 'US',
    language: 'en',
    htmlLang: 'en-US',
    path: '/us/',
  },
  {
    id: 'au',
    slug: 'au',
    countryName: 'Australia',
    countryCode: 'AU',
    language: 'en',
    htmlLang: 'en-AU',
    path: '/au/',
  },
  {
    id: 'ca',
    slug: 'ca',
    countryName: 'Canada',
    countryCode: 'CA',
    language: 'en',
    htmlLang: 'en-CA',
    path: '/ca/',
  },
  {
    id: 'ie',
    slug: 'ie',
    countryName: 'Ireland',
    countryCode: 'IE',
    language: 'en',
    htmlLang: 'en-IE',
    path: '/ie/',
  },
  {
    id: 'nz',
    slug: 'nz',
    countryName: 'New Zealand',
    countryCode: 'NZ',
    language: 'en',
    htmlLang: 'en-NZ',
    path: '/nz/',
  },
  {
    id: 'in',
    slug: 'in',
    countryName: 'India',
    countryCode: 'IN',
    language: 'en',
    htmlLang: 'en-IN',
    path: '/in/',
  },
  {
    id: 'in-hi',
    slug: 'in-hi',
    countryName: 'India',
    countryCode: 'IN',
    language: 'hi',
    htmlLang: 'hi-IN',
    path: '/in-hi/',
  },
] as const;

/** Derived from the data so the union can never drift from the edition list. */
export type EditionId = (typeof EDITIONS)[number]['id'];

/** The two document languages the site publishes in. */
export type EditionLanguage = (typeof EDITIONS)[number]['language'];

/** The published shape of one edition. */
export interface Edition {
  id: EditionId;
  slug: EditionId;
  countryName: string;
  countryCode: string;
  language: EditionLanguage;
  htmlLang: string;
  path: string;
}

export type SectionId =
  | 'politics'
  | 'business'
  | 'technology'
  | 'sport'
  | 'health'
  | 'world'
  | 'weather'
  | 'entertainment';

/** The published shape of one section. */
export interface Section {
  id: SectionId;
  name: string;
  sortOrder: number;
}

export const SECTIONS: readonly Section[] = [
  { id: 'politics', name: 'Politics', sortOrder: 1 },
  { id: 'business', name: 'Business', sortOrder: 2 },
  { id: 'technology', name: 'Technology', sortOrder: 3 },
  { id: 'sport', name: 'Sport', sortOrder: 4 },
  { id: 'health', name: 'Health', sortOrder: 5 },
  { id: 'world', name: 'World', sortOrder: 6 },
  { id: 'weather', name: 'Weather', sortOrder: 7 },
  { id: 'entertainment', name: 'Entertainment', sortOrder: 8 },
];

/**
 * Compile-time proof that the literal edition data satisfies the published shape.
 * If a field is renamed or dropped, this line stops compiling.
 */
const _editionsSatisfyEdition: readonly Edition[] = EDITIONS;
void _editionsSatisfyEdition;
