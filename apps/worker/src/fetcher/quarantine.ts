/**
 * Response sniffing, 2 MB body ceiling enforcement, and R2 key generation
 * for raw captures and quarantined payloads (ING-01, ING-07, D-06, D-07, D-08, D-09).
 */

export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB (D-08)

export interface SniffResult {
  isValidXml: boolean;
  reason?: 'bot_challenge' | 'invalid_prolog';
}

const BOT_CHALLENGE_SIGNATURES = [
  '<!doctype html',
  '<html',
  'cf-browser-verification',
  'challenge-platform',
  'turnstile',
  'perimeterx',
  'just a moment...',
];

const XML_PROLOG_SIGNATURES = [
  '<?xml',
  '<rss',
  '<feed',
  '<rdf:rdf',
];

/**
 * Sniffs Content-Type header and first 256 bytes of the response body.
 * Identifies valid XML vs HTML bodies and bot challenges (Cloudflare Turnstile, PerimeterX).
 */
export function sniffResponse(
  contentType: string | null,
  firstChunk: Uint8Array,
): SniffResult {
  const ct = contentType?.toLowerCase() ?? '';
  if (ct.includes('text/html')) {
    return { isValidXml: false, reason: 'bot_challenge' };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  const sample = decoder.decode(firstChunk.slice(0, 256)).trimStart();
  const lowerSample = sample.toLowerCase();

  for (const sig of BOT_CHALLENGE_SIGNATURES) {
    if (lowerSample.includes(sig)) {
      return { isValidXml: false, reason: 'bot_challenge' };
    }
  }

  for (const sig of XML_PROLOG_SIGNATURES) {
    if (lowerSample.includes(sig)) {
      return { isValidXml: true };
    }
  }

  return { isValidXml: false, reason: 'invalid_prolog' };
}

export interface ReadStreamResult {
  body: Uint8Array;
  bytes: number;
  isOversized: boolean;
  reason?: 'oversized';
}

export function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.byteLength > totalLength) {
      const needed = totalLength - offset;
      result.set(chunk.subarray(0, needed), offset);
      break;
    }
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Enforces a hard 2 MB streaming body ceiling via ReadableStreamDefaultReader.
 * If total bytes exceed 2 MB, immediately calls reader.cancel() and returns isOversized: true.
 */
export async function readStreamWithCeiling(
  bodyStream: ReadableStream<Uint8Array> | null,
  maxBytes = MAX_BODY_BYTES,
): Promise<ReadStreamResult> {
  if (!bodyStream) {
    return { body: new Uint8Array(0), bytes: 0, isOversized: false };
  }

  const reader = bodyStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel('Oversized body > 2MB');
          const truncated = concatChunks(chunks, maxBytes);
          return {
            body: truncated,
            bytes: totalBytes,
            isOversized: true,
            reason: 'oversized',
          };
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    if (totalBytes > maxBytes) {
      const truncated = concatChunks(chunks, maxBytes);
      return {
        body: truncated,
        bytes: totalBytes,
        isOversized: true,
        reason: 'oversized',
      };
    }
    throw err;
  }

  const complete = concatChunks(chunks, totalBytes);
  return {
    body: complete,
    bytes: totalBytes,
    isOversized: false,
  };
}

export function formatIsoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Generates R2 key pattern for valid XML snapshots:
 * raw/{YYYY-MM-DD}/{feedId}_{timestamp}.xml (D-06)
 */
export function getRawStorageKey(
  feedId: string,
  timestamp: number = Date.now(),
  date: Date = new Date(timestamp),
): string {
  return `raw/${formatIsoDate(date)}/${feedId}_${timestamp}.xml`;
}

/**
 * Generates R2 key pattern for quarantined payloads:
 * raw/quarantine/{YYYY-MM-DD}/{feedId}_{reason}_{timestamp}.xml
 */
export function getQuarantineStorageKey(
  feedId: string,
  reason: string,
  timestamp: number = Date.now(),
  date: Date = new Date(timestamp),
): string {
  return `raw/quarantine/${formatIsoDate(date)}/${feedId}_${reason}_${timestamp}.xml`;
}
