#!/usr/bin/env node
/** Run the live ingest and curation pipeline against the production D1 database. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRepository } from '../../apps/worker/src/db/repository.js';
import { SOURCES } from '../../config/sources.js';
import { LiveWorkersAiEmbeddingProvider } from '../../src/curation/embedding-provider.js';
import { processCurationPipeline } from '../../src/curation/pipeline.js';
import { runLocalIngest, type IngestSummary } from './run-local.js';

interface D1Result<T> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
  error?: string;
}

interface RemoteD1Options {
  accountId: string;
  apiToken: string;
  databaseId: string;
  fetcher?: typeof fetch;
}

interface RemoteStatement {
  sql: string;
  params: unknown[];
  bind(...values: unknown[]): RemoteStatement;
  all<T>(): Promise<D1Result<T>>;
  first<T>(column?: string): Promise<T | Record<string, T> | null>;
  run(): Promise<D1Result<unknown>>;
}

interface CapturedFeedOptions {
  accountId: string;
  apiToken: string;
  kvNamespaceId: string;
  bucketName: string;
  fetcher?: typeof fetch;
}

export function isCapturedFeedKey(sourceSlug: string, key: unknown): key is string {
  return typeof key === 'string'
    && new RegExp(`^raw/\\d{4}-\\d{2}-\\d{2}/${sourceSlug.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}_\\d+\\.xml$`).test(key);
}

export async function loadCapturedFeeds(options: CapturedFeedOptions): Promise<Map<string, string>> {
  const fetcher = options.fetcher ?? fetch;
  const feeds = new Map<string, string>();
  for (const source of SOURCES.filter((entry) => entry.isActive)) {
    try {
      const stateUrl = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/storage/kv/namespaces/${options.kvNamespaceId}/values/${encodeURIComponent(`feed_state:${source.slug}`)}`;
      const response = await fetcher(stateUrl, { headers: { Authorization: `Bearer ${options.apiToken}` } });
      if (response.status === 404) continue;
      if (!response.ok) {
        console.warn(`Could not read feed state for ${source.slug} (${response.status})`);
        continue;
      }
      const state = await response.json() as { latestRawKey?: unknown };
      if (!isCapturedFeedKey(source.slug, state.latestRawKey)) continue;

      const r2Url = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/r2/buckets/${options.bucketName}/objects/${state.latestRawKey}`;
      const r2Response = await fetcher(r2Url, { headers: { Authorization: `Bearer ${options.apiToken}` } });
      if (!r2Response.ok) {
        console.warn(`Could not read captured feed from R2 for ${source.slug} (${r2Response.status})`);
        continue;
      }
      const xml = await r2Response.text();
      feeds.set(source.slug, xml);
    } catch (err) {
      console.warn(`Feed capture fetch error for ${source.slug}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return feeds;
}

export function createRemoteD1Binding(options: RemoteD1Options): D1Database {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/query`;
  const fetcher = options.fetcher ?? fetch;

  async function query<T>(sql: string, params: unknown[]): Promise<D1Result<T>> {
    return request<T>({ sql, params });
  }

  async function request<T>(body: { sql: string; params: unknown[] } | { batch: { sql: string; params: unknown[] }[] }): Promise<D1Result<T>> {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { success?: boolean; errors?: { message?: string }[]; result?: D1Result<T>[] };
    const result = payload.result?.[0];
    if (!response.ok || !payload.success || !result?.success) {
      throw new Error(result?.error ?? payload.errors?.[0]?.message ?? `D1 request failed (${response.status})`);
    }
    return result;
  }

  async function queryBatch(statements: readonly RemoteStatement[]): Promise<D1Result<unknown>[]> {
    if (statements.length === 0) return [];
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: statements.map(({ sql, params }) => ({ sql, params })) }),
    });
    const payload = await response.json() as { success?: boolean; errors?: { message?: string }[]; result?: D1Result<unknown>[] };
    const results = payload.result ?? [];
    if (!response.ok || !payload.success || results.some((result) => !result.success)) {
      throw new Error(results.find((result) => !result.success)?.error ?? payload.errors?.[0]?.message ?? `D1 batch request failed (${response.status})`);
    }
    return results;
  }

  return {
    prepare(sql: string) {
      const statement = (params: unknown[] = []): RemoteStatement => ({
        sql,
        params,
        bind(...values: unknown[]) { return statement(values); },
        async all<T>() { const result = await query<T>(sql, params); return { results: result.results ?? [], success: true, meta: result.meta ?? {} }; },
        async first<T>(column?: string) {
          const result = await query<Record<string, T>>(sql, params);
          const row = result.results?.[0];
          return column ? row?.[column] ?? null : row ?? null;
        },
        async run() { const result = await query(sql, params); return { success: true, meta: result.meta ?? {} }; },
      });
      return statement();
    },
    async batch(statements: RemoteStatement[]) { return queryBatch(statements); },
  } as unknown as D1Database;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function isBootstrapLiveFetch(args: readonly string[]): boolean {
  return args.includes('--bootstrap-live-fetch');
}

export function assertPublishableIngest(ingest: IngestSummary): void {
  if (ingest.feedsProcessed === 0 || ingest.itemsNormalized === 0) {
    throw new Error(
      `No publishable feed content: ${ingest.feedsProcessed} feeds processed, ${ingest.itemsNormalized} items normalized`,
    );
  }
}

async function main() {
  const accountId = required('CF_ACCOUNT_ID');
  const apiToken = required('CF_API_TOKEN');
  const databaseId = required('CF_D1_DATABASE_ID');
  const bootstrapLiveFetch = isBootstrapLiveFetch(process.argv);
  const capturedXmlBySource = bootstrapLiveFetch ? undefined : await loadCapturedFeeds({
    accountId,
    apiToken,
    kvNamespaceId: required('CF_KV_NAMESPACE_ID'),
    bucketName: required('R2_BUCKET_NAME'),
  });
  const repository = createRepository({
    DB: createRemoteD1Binding({ accountId, apiToken, databaseId }),
    R2: {} as R2Bucket,
    KV: {} as KVNamespace,
  });

  // shortcut: bootstrap only, or graceful fallback if no captured feeds exist yet
  const useLiveFetch = bootstrapLiveFetch || !capturedXmlBySource || capturedXmlBySource.size === 0;
  if (useLiveFetch && !bootstrapLiveFetch) {
    console.log('No captured feeds found in R2/KV; falling back to live fetch to ensure publication.');
  }
  const ingest = await runLocalIngest({ repo: repository, ...(useLiveFetch ? { live: true } : { capturedXmlBySource }) });
  assertPublishableIngest(ingest);
  const curation = await processCurationPipeline(
    repository,
    new LiveWorkersAiEmbeddingProvider({ accountId, apiToken }),
    { batchSize: 5 * 10 ** 2 },
  );
  console.log(JSON.stringify({ ingest, curation }, null, 2));
}

if (process.argv[1]?.includes('publish-remote')) {
  main().catch(error => {
    console.error(`Production ingest failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
