/**
 * The ten feeds S-2 and S-3 fetch.
 *
 * The list lives in one file, in one plain-JavaScript module, because the two
 * spikes are a **comparison**: the Worker fetches these feeds from Cloudflare's
 * edge and the CI runner fetches the same feeds from a GitHub Actions runner.
 * If the two sides had separate lists, or separate copies of a list that had
 * drifted, the comparison would measure the difference between two different
 * sets of publishers rather than the difference between two egress paths — and
 * it would report that difference as a finding about egress. The User-Agent is
 * shared for the same reason; the feed list has to be shared for the same
 * reason.
 *
 * It is a plain `.mjs` module rather than TypeScript because both sides have
 * to read it: the Worker bundles it, and the CI script imports it directly
 * under Node. A `.ts` file would force the CI script to depend on a type
 * stripper, and Node's own type stripping does not expose named exports to an
 * ESM importer.
 *
 * These are registry entries only. Phase 2 verifies each feed's availability
 * and terms of use before any of them is fetched for real; S-2 measures
 * blocking, it does not clear the legal gate.
 */

export const FEEDS = [
  { id: 'bbc', country: 'uk', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'guardian', country: 'uk', url: 'https://www.theguardian.com/uk/rss' },
  { id: 'skynews', country: 'uk', url: 'https://feeds.skynews.com/feeds/rss/uk.xml' },
  { id: 'independent', country: 'uk', url: 'https://www.independent.co.uk/news/uk/rss' },
  { id: 'ft', country: 'uk', url: 'https://www.ft.com/rss/home' },
  { id: 'nytimes', country: 'us', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { id: 'washingtonpost', country: 'us', url: 'https://feeds.washingtonpost.com/rss/world' },
  { id: 'cnn', country: 'us', url: 'https://rss.cnn.com/rss/edition.rss' },
  { id: 'aol', country: 'us', url: 'https://feeds.aol.com/news/rss19.rss' },
  { id: 'ap', country: 'us', url: 'https://apnews.com/hub/ap-top-news?output=rss' },
];
