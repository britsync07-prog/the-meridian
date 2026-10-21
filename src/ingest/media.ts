import { canonicalizeSourceUrl } from './url';

export interface ExtractedMedia {
  imageUrl: string | null;
  imageCredit: string | null;
}

const TRACKER_URL_PATTERNS = [
  /feedburner/i,
  /pixel\.gif/i,
  /stats\./i,
  /doubleclick/i,
  /beacon/i,
  /scorecardresearch/i,
  /\/track(?:er|\/|\.|$)/i,
];

function extractText(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    for (const item of val) {
      const text = extractText(item);
      if (text) return text;
    }
    return '';
  }
  if (typeof val === 'object') {
    if (val['#text'] != null) return extractText(val['#text']);
  }
  return '';
}

function isTrackingPixel(url: string, width?: number, height?: number): boolean {
  if (width !== undefined && width > 0 && width < 200) return true;
  if (height !== undefined && height > 0 && height < 200) return true;
  return TRACKER_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function sanitizeUrl(rawUrl: string): string | null {
  try {
    return canonicalizeSourceUrl(rawUrl);
  } catch {
    return null;
  }
}

interface ImageCandidate {
  url: string;
  width: number;
}

/**
 * Extracts candidate media enclosures according to D-20 to D-23:
 * Cascade:
 * 1. <media:content> or <media:thumbnail>: choose candidate with largest width.
 * 2. <enclosure type="image/*">: extract @_url.
 * 3. First inline <img> in description/content with width >= 400px or without explicit small width.
 * Discards tracking pixels (<200px or tracker domains).
 * Extracts credit from <media:credit>, <media:copyright>, or <dc:creator>.
 */
export function extractMediaEnclosure(item: any): ExtractedMedia {
  if (!item || typeof item !== 'object') {
    return { imageUrl: null, imageCredit: null };
  }

  let selectedUrl: string | null = null;

  // 1. Check media:content and media:thumbnail
  const mediaList: any[] = [];
  if (item['media:content']) {
    if (Array.isArray(item['media:content'])) {
      mediaList.push(...item['media:content']);
    } else {
      mediaList.push(item['media:content']);
    }
  }
  if (item['media:thumbnail']) {
    if (Array.isArray(item['media:thumbnail'])) {
      mediaList.push(...item['media:thumbnail']);
    } else {
      mediaList.push(item['media:thumbnail']);
    }
  }

  const mediaCandidates: ImageCandidate[] = [];
  for (const m of mediaList) {
    if (!m) continue;
    const url = m['@_url'] || m.url || (typeof m === 'string' ? m : undefined);
    if (!url || typeof url !== 'string') continue;

    const medium = m['@_medium'] || m.medium;
    const type = m['@_type'] || m.type;
    const widthStr = m['@_width'] || m.width;
    const heightStr = m['@_height'] || m.height;

    const width = widthStr ? parseInt(String(widthStr), 10) : undefined;
    const height = heightStr ? parseInt(String(heightStr), 10) : undefined;

    // Check if image medium or extension
    const isImage =
      medium === 'image' ||
      (type && String(type).startsWith('image/')) ||
      /\.(jpe?g|png|webp|avif)($|\?)/i.test(url) ||
      (!medium && !type);

    if (isImage && !isTrackingPixel(url, width, height)) {
      mediaCandidates.push({
        url,
        width: width && !isNaN(width) ? width : 0,
      });
    }
  }

  if (mediaCandidates.length > 0) {
    // Pick the candidate with largest width, or first
    mediaCandidates.sort((a, b) => b.width - a.width);
    const best = mediaCandidates[0];
    if (best) {
      selectedUrl = sanitizeUrl(best.url);
    }
  }

  // 2. Fall back to <enclosure>
  if (!selectedUrl && item.enclosure) {
    const enclosures = Array.isArray(item.enclosure) ? item.enclosure : [item.enclosure];
    for (const enc of enclosures) {
      if (!enc) continue;
      const url = enc['@_url'] || enc.url;
      if (!url || typeof url !== 'string') continue;

      const type = enc['@_type'] || enc.type;
      const isImage =
        (type && String(type).startsWith('image/')) ||
        /\.(jpe?g|png|webp|avif)($|\?)/i.test(url);

      if (isImage && !isTrackingPixel(url)) {
        selectedUrl = sanitizeUrl(url);
        if (selectedUrl) break;
      }
    }
  }

  // 3. Fall back to inline <img> in description or content
  if (!selectedUrl) {
    const htmlSources = [
      item.description,
      item['content:encoded'],
      item.content,
    ];

    for (const html of htmlSources) {
      if (!html || typeof html !== 'string') continue;

      const imgTagRegex = /<img\s+([^>]+)>/gi;
      let match: RegExpExecArray | null;

      while ((match = imgTagRegex.exec(html)) !== null) {
        const attrs = match[1] || '';
        const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(attrs);
        if (!srcMatch || !srcMatch[1]) continue;

        const src = srcMatch[1].trim();
        const widthMatch = /\bwidth=["']?(\d+)["']?/i.exec(attrs);
        const heightMatch = /\bheight=["']?(\d+)["']?/i.exec(attrs);

        const width = widthMatch && widthMatch[1] ? parseInt(widthMatch[1], 10) : undefined;
        const height = heightMatch && heightMatch[1] ? parseInt(heightMatch[1], 10) : undefined;

        if (isTrackingPixel(src, width, height)) continue;

        // If width is specified and < 400, skip unless no width is given and not small
        if (width !== undefined && width < 400) continue;

        const sanitized = sanitizeUrl(src);
        if (sanitized) {
          selectedUrl = sanitized;
          break;
        }
      }

      if (selectedUrl) break;
    }
  }

  // Credit extraction
  let imageCredit: string | null = null;
  const credit = extractText(item['media:credit']);
  if (credit) {
    imageCredit = credit;
  } else {
    const copyright = extractText(item['media:copyright']);
    if (copyright) {
      imageCredit = copyright;
    } else {
      const dcCreator = extractText(item['dc:creator']);
      if (dcCreator) {
        imageCredit = dcCreator;
      }
    }
  }

  return {
    imageUrl: selectedUrl,
    imageCredit,
  };
}
