import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url).href);
const WORKER_ROOT = join(REPO_ROOT, 'apps', 'worker');
const WORKER_SRC = join(WORKER_ROOT, 'src');
const WRANGLER_JSONC = join(WORKER_ROOT, 'wrangler.jsonc');
const CONFIG_TS = join(WORKER_SRC, 'db', 'config.ts');

const FORBIDDEN_PARSER_IMPORTS = [
  'fast-xml-parser',
  'xmldom',
  '@xmldom/xmldom',
  'cheerio',
  'htmlparser2',
  'sax',
  'xml2js',
];

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.wrangler',
  '.git',
]);

interface SourceFile {
  absolute: string;
  relative: string;
}

function collectTsFiles(directory: string): SourceFile[] {
  if (!existsSync(directory)) return [];
  const found: SourceFile[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...collectTsFiles(join(directory, entry.name)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    found.push({
      absolute: join(directory, entry.name),
      relative: relative(REPO_ROOT, join(directory, entry.name)).replace(/\\/g, '/'),
    });
  }

  return found;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier) specifiers.push(specifier);
  }

  return specifiers;
}

describe('Worker configuration and purity (ING-02, D-01, D-02)', () => {
  it('wrangler.jsonc declares 3 cron triggers for partitioned feed polling (D-01)', () => {
    expect(existsSync(WRANGLER_JSONC)).toBe(true);
    const content = readFileSync(WRANGLER_JSONC, 'utf8');
    // Strip simple comments for JSON parsing
    const cleaned = content.replace(/\/\/.*$/gm, '');
    const config = JSON.parse(cleaned);

    expect(config.triggers).toBeDefined();
    expect(config.triggers.crons).toBeDefined();
    expect(Array.isArray(config.triggers.crons)).toBe(true);
    expect(config.triggers.crons.length).toBe(3);
  });

  it('wrangler.jsonc binds KV namespace KV for feed polling state (D-02)', () => {
    const content = readFileSync(WRANGLER_JSONC, 'utf8');
    const cleaned = content.replace(/\/\/.*$/gm, '');
    const config = JSON.parse(cleaned);

    expect(config.kv_namespaces).toBeDefined();
    expect(Array.isArray(config.kv_namespaces)).toBe(true);
    const kvBinding = config.kv_namespaces.find((b: { binding: string }) => b.binding === 'KV');
    expect(kvBinding).toBeDefined();
  });

  it('MeridianEnv includes KV: KVNamespace in config.ts', () => {
    expect(existsSync(CONFIG_TS)).toBe(true);
    const content = readFileSync(CONFIG_TS, 'utf8');
    expect(content).toMatch(/KV\s*:\s*KVNamespace/);
  });

  it('asserts apps/worker/src contains NO imports of fast-xml-parser or XML DOM parsers (ING-02)', () => {
    const srcFiles = collectTsFiles(WORKER_SRC);
    expect(srcFiles.length).toBeGreaterThan(0);

    const hits: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file.absolute, 'utf8');
      const specifiers = importSpecifiers(content);

      for (const specifier of specifiers) {
        for (const forbidden of FORBIDDEN_PARSER_IMPORTS) {
          if (specifier === forbidden || specifier.startsWith(forbidden + '/')) {
            hits.push(`${file.relative} imports forbidden XML parser "${specifier}"`);
          }
        }
      }

      // Check for DOMParser usage
      if (/\bDOMParser\b/.test(content)) {
        hits.push(`${file.relative} uses DOMParser`);
      }
    }

    expect(hits).toEqual([]);
  });
});
