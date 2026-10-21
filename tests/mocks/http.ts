/**
 * HTTP mocking layer for feed ingest integration tests (ING-01, ING-07, ING-10).
 * Simulates status codes (200, 304, 429 Retry-After, 500), AbortSignal timeouts,
 * and serves static test fixtures from tests/fixtures/feeds/.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'feeds');

export interface MockRouteConfig {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  fixture?: string; // name of file in tests/fixtures/feeds/
  delayMs?: number;
  hang?: boolean; // simulates network hang / socket timeout
  networkError?: string; // simulates immediate network socket error
}

export class MockHttpDispatcher {
  private routes = new Map<string, MockRouteConfig>();
  private defaultRoute: MockRouteConfig = {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: 'Not Found',
  };

  /**
   * Registers a mock route by exact URL or URL prefix.
   */
  register(url: string, config: MockRouteConfig): this {
    this.routes.set(url, config);
    return this;
  }

  /**
   * Loads raw fixture content from tests/fixtures/feeds/.
   */
  loadFixture(fixtureName: string): Uint8Array {
    const filePath = path.join(FIXTURES_DIR, fixtureName);
    return new Uint8Array(readFileSync(filePath));
  }

  /**
   * Clears all registered routes.
   */
  reset(): void {
    this.routes.clear();
  }

  /**
   * Fetch function implementation compatible with standard fetch API.
   */
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Find route config
    let config = this.routes.get(urlStr);
    if (!config) {
      for (const [pattern, cfg] of this.routes.entries()) {
        if (urlStr.startsWith(pattern)) {
          config = cfg;
          break;
        }
      }
    }
    config = config || this.defaultRoute;

    // Simulate immediate network connection error
    if (config.networkError) {
      throw new TypeError(`NetworkError: ${config.networkError}`);
    }

    // Check signal already aborted
    if (init?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // Simulate socket timeout / hang
    if (config.hang) {
      return new Promise<Response>((_, reject) => {
        if (init?.signal) {
          const onAbort = () => {
            init.signal?.removeEventListener('abort', onAbort);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          };
          init.signal.addEventListener('abort', onAbort);
        }
        // If no signal, this would hang until test timeout
      });
    }

    // Optional delay
    if (config.delayMs && config.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, config!.delayMs);
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }
      });
    }

    const status = config.status ?? 200;
    const headers = new Headers(config.headers || {});

    // Determine body
    let responseBody: Uint8Array | null = null;
    if (status !== 304 && status !== 204) {
      if (config.fixture) {
        responseBody = this.loadFixture(config.fixture);
        if (!headers.has('Content-Type')) {
          if (config.fixture.endsWith('.html')) {
            headers.set('Content-Type', 'text/html; charset=utf-8');
          } else {
            headers.set('Content-Type', 'application/rss+xml; charset=utf-8');
          }
        }
      } else if (config.body !== undefined) {
        if (typeof config.body === 'string') {
          responseBody = new TextEncoder().encode(config.body);
        } else {
          responseBody = config.body;
        }
      } else {
        responseBody = new Uint8Array(0);
      }
    }

    return new Response(responseBody, {
      status,
      statusText: config.statusText || (status === 200 ? 'OK' : status === 304 ? 'Not Modified' : 'Error'),
      headers,
    });
  };
}
