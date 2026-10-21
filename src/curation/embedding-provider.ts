/**
 * src/curation/embedding-provider.ts — Vector embedding abstraction for curation.
 *
 * Implements CUR-01, CUR-06, D-04, D-20, and STRIDE T-03-06.
 *
 * Provides:
 * 1. `cosineSimilarity(a, b)`: exact cosine similarity between vector embeddings.
 * 2. `EmbeddingProvider`: standard interface for single and batch embedding lookups.
 * 3. `FixtureEmbeddingProvider`: offline deterministic provider backed by pre-computed
 *    BGE-M3 vectors from `tests/fixtures/curation/headline-embeddings.json`.
 * 4. `LiveWorkersAiEmbeddingProvider`: production provider targeting `@cf/baai/bge-m3`
 *    via Cloudflare Workers AI binding or REST API with 32-item batching.
 */

import { fnv1a64, tokenizeHeadline } from './simhash.js';

export interface EmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
  getBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns a value in [-1.0, 1.0]. Returns 0 for mismatched lengths or zero vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA <= 0 || normB <= 0) {
    return 0;
  }

  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Clamp potential IEEE floating point inaccuracies into [-1.0, 1.0]
  if (sim > 1.0) return 1.0;
  if (sim < -1.0) return -1.0;
  return sim;
}

/**
 * Generates a deterministic normalized 1024-dimensional pseudo-embedding
 * based on token hashes, ensuring zero network calls and deterministic behavior
 * when a headline is not present in the static fixture.
 */
export function generateDeterministicPseudoEmbedding(text: string, dimensions = 1024): number[] {
  const vec = new Float64Array(dimensions);
  const tokens = tokenizeHeadline(text);
  const effectiveTokens = tokens.length > 0 ? tokens : [text.trim().toLowerCase()];

  for (const token of effectiveTokens) {
    let h = fnv1a64(token);
    for (let d = 0; d < dimensions; d++) {
      h = (h * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      const val = Number((h >> 32n) & 0xffffffffn) / 0x80000000 - 1.0;
      vec[d] += val;
    }
  }

  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);

  const result = new Array<number>(dimensions);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      result[i] = Number((vec[i] / norm).toFixed(6));
    }
  } else {
    result[0] = 1;
    for (let i = 1; i < dimensions; i++) {
      result[i] = 0;
    }
  }

  return result;
}

/**
 * Offline Fixture Embedding Provider (D-20).
 * Serves pre-computed 1024-d BGE-M3 vectors from memory or fixture file,
 * with deterministic pseudo-embedding fallback.
 */
export class FixtureEmbeddingProvider implements EmbeddingProvider {
  private fixtureVectors: Map<string, number[]> = new Map();

  constructor(embeddingsRecord?: Record<string, number[]>) {
    if (embeddingsRecord) {
      for (const [headline, vec] of Object.entries(embeddingsRecord)) {
        this.fixtureVectors.set(headline.trim(), vec);
      }
    } else {
      this.loadDefaultFixtureIfAvailable();
    }
  }

  private loadDefaultFixtureIfAvailable(): void {
    try {
      // Dynamic import / require guard for Node test environments
      if (typeof process !== 'undefined' && process.versions?.node) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require('node:path');
        const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', 'curation', 'headline-embeddings.json');
        if (fs.existsSync(fixturePath)) {
          const raw = fs.readFileSync(fixturePath, 'utf8');
          const data = JSON.parse(raw) as Record<string, number[]>;
          for (const [h, v] of Object.entries(data)) {
            this.fixtureVectors.set(h.trim(), v);
          }
        }
      }
    } catch {
      // Non-fatal if running outside Node filesystem environment
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const trimmed = text.trim();
    const stored = this.fixtureVectors.get(trimmed);
    if (stored) {
      return stored;
    }
    return generateDeterministicPseudoEmbedding(trimmed);
  }

  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.getEmbedding(t)));
  }
}

export interface LiveWorkersAiOptions {
  ai?: {
    run: (model: string, inputs: { text: string | string[] }) => Promise<any>;
  };
  accountId?: string;
  apiToken?: string;
  model?: string;
}

/**
 * Live Cloudflare Workers AI provider targeting `@cf/baai/bge-m3` (CUR-01).
 * Batches calls up to 32 texts per invocation (T-03-06).
 */
export class LiveWorkersAiEmbeddingProvider implements EmbeddingProvider {
  private readonly model: string;
  private readonly ai?: LiveWorkersAiOptions['ai'];
  private readonly accountId?: string;
  private readonly apiToken?: string;

  constructor(options: LiveWorkersAiOptions = {}) {
    this.model = options.model ?? '@cf/baai/bge-m3';
    this.ai = options.ai;
    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const results = await this.getBatchEmbeddings([text]);
    return results[0] ?? [];
  }

  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const BATCH_SIZE = 32;
    const allResults: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      const batchResult = await this.fetchBatch(chunk);
      allResults.push(...batchResult);
    }

    return allResults;
  }

  private async fetchBatch(chunk: string[]): Promise<number[][]> {
    // Path 1: Worker runtime binding env.AI
    if (this.ai) {
      const res = await this.ai.run(this.model, { text: chunk });
      if (res && Array.isArray(res.data)) {
        return res.data as number[][];
      }
      throw new Error(`Workers AI binding returned unexpected response shape: ${JSON.stringify(res)}`);
    }

    // Path 2: Cloudflare REST API (CI / Node scripts)
    if (this.accountId && this.apiToken) {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: chunk }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Workers AI REST API error (${response.status}): ${errorText}`);
      }

      const json = (await response.json()) as any;
      if (json.success && json.result && Array.isArray(json.result.data)) {
        return json.result.data as number[][];
      }
      throw new Error(`Workers AI REST API returned unexpected payload: ${JSON.stringify(json)}`);
    }

    throw new Error(
      'LiveWorkersAiEmbeddingProvider requires either env.AI binding or accountId + apiToken configuration.'
    );
  }
}
