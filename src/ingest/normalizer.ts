import type { RawItem, SourceRegistryEntry } from '../../shared/types';
import { buildSanitizedExcerpt, extractExcerptCandidate } from './excerpt';
import { resolveItemIdentity } from './identity';
import { extractMediaEnclosure } from './media';
import { parseXmlFeed } from './parser';
import { cleanCandidateText } from './text';
import { canonicalizeSourceUrl } from './url';

function parseTimestamp(
  dateStr: string | undefined,
  snapshotTimestamp: string,
  nowMs: number
): number {
  if (dateStr) {
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  const snapshotParsed = Date.parse(snapshotTimestamp);
  if (!isNaN(snapshotParsed)) {
    return snapshotParsed;
  }

  return nowMs;
}

interface ItemWithTimestamp {
  itemTime: number;
  rawItem: RawItem;
}

/**
 * Normalizes raw XML feed snapshots into canonical RawItem records:
 * - Parses multi-dialect XML feeds (RSS 2.0, Atom 1.0, RDF).
 * - Strips markup and decodes entities in titles and descriptions.
 * - Extracts and enforces the hard excerpt budget via buildSanitizedExcerpt (CON-01 - CON-05).
 * - Resolves dual-identity deduplication (stable GUID vs SHA-256 of canonical URL).
 * - Extracts candidate media enclosures with photographer credits.
 * - Filters items older than 48 hours (D-24).
 * - Clamps future timestamps (>1 hour ahead) to current system time (D-25).
 * - Sorts by publishedAt descending and caps to top 25 newest items (D-24).
 */
export function normalizeFeed(
  xmlText: string,
  source: SourceRegistryEntry,
  snapshotTimestamp: string,
  nowMs: number = Date.now()
): RawItem[] {
  const parsedItems = parseXmlFeed(xmlText);
  const cutoffMs = nowMs - 48 * 60 * 60 * 1000;
  const futureThresholdMs = nowMs + 60 * 60 * 1000;

  const validItems: ItemWithTimestamp[] = [];

  for (const item of parsedItems) {
    if (!item.link && !item.guid) continue;

    // Canonicalize link
    let canonicalUrl = '';
    try {
      canonicalUrl = canonicalizeSourceUrl(item.link || item.guid || '');
    } catch {
      continue;
    }

    // Resolve identity
    const externalGuid = resolveItemIdentity(
      { guid: item.guid, link: item.link || canonicalUrl },
      { forceUrlIdentity: source.slug.includes('unstable') }
    );

    // Timestamp parsing & clamping
    let itemTime = parseTimestamp(item.pubDate, snapshotTimestamp, nowMs);

    // Discard items older than 48 hours
    if (itemTime < cutoffMs) {
      continue;
    }

    // Clamp future dates (>1 hour ahead) to now
    if (itemTime > futureThresholdMs) {
      itemTime = nowMs;
    }

    const title = cleanCandidateText(item.title);
    const author = item.author ? cleanCandidateText(item.author) : null;
    const media = extractMediaEnclosure(item);

    const { candidate, sourceVisibleText } = extractExcerptCandidate(item);
    const excerpt = buildSanitizedExcerpt({
      candidateText: candidate,
      sourceVisibleText,
      language: source.language,
    });

    const description = excerpt?.text ?? candidate;

    const rawItem: RawItem = {
      sourceId: source.slug,
      externalGuid,
      canonicalUrl,
      title,
      description,
      excerpt,
      author: author || null,
      publishedAt: new Date(itemTime).toISOString(),
      imageUrl: media.imageUrl,
      imageCredit: media.imageCredit,
      sectionHint: source.defaultSection ?? null,
    };

    validItems.push({ itemTime, rawItem });
  }

  // Sort descending by publication time
  validItems.sort((a, b) => b.itemTime - a.itemTime);

  // Cap at 25 newest items
  const capped = validItems.slice(0, 25);

  return capped.map((entry) => entry.rawItem);
}
