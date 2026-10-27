import { describe, expect, it } from 'vitest';

import { assertPublishableIngest, createRemoteD1Binding, isBootstrapLiveFetch, isCapturedFeedKey } from '../publish-remote.js';

describe('createRemoteD1Binding', () => {
  it('uses the D1 query API and returns result rows', async () => {
    const calls: RequestInit[] = [];
    const binding = createRemoteD1Binding({
      accountId: 'account', apiToken: 'token', databaseId: 'database',
      fetcher: async (_url, init) => {
        calls.push(init!);
        return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [{ id: 7 }], meta: {} }] }));
      },
    });

    const rows = await binding.prepare('SELECT id FROM sources WHERE id = ?').bind(7).all<{ id: number }>();
    expect(rows.results).toEqual([{ id: 7 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toBe(JSON.stringify({ sql: 'SELECT id FROM sources WHERE id = ?', params: [7] }));
  });

  it('keeps each batch bind independent', async () => {
    const calls: RequestInit[] = [];
    const binding = createRemoteD1Binding({
      accountId: 'account', apiToken: 'token', databaseId: 'database',
      fetcher: async (_url, init) => {
        calls.push(init!);
        return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [], meta: { changes: 1 } }] }));
      },
    });

    const statement = binding.prepare('INSERT INTO sources (slug) VALUES (?)');
    await binding.batch([statement.bind('first'), statement.bind('second')]);

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toBe(JSON.stringify({ batch: [
      { sql: 'INSERT INTO sources (slug) VALUES (?)', params: ['first'] },
      { sql: 'INSERT INTO sources (slug) VALUES (?)', params: ['second'] },
    ] }));
  });
});

describe('assertPublishableIngest', () => {
  it('refuses to publish when no live feed content was normalized', () => {
    expect(() => assertPublishableIngest({ feedsProcessed: 0, itemsNormalized: 0, storiesAdded: 0, errorsCount: 30 }))
      .toThrow(/No publishable feed content/);
    expect(() => assertPublishableIngest({ feedsProcessed: 3, itemsNormalized: 0, storiesAdded: 0, errorsCount: 0 }))
      .toThrow(/No publishable feed content/);
  });

  it('allows an unchanged but healthy live feed run', () => {
    expect(() => assertPublishableIngest({ feedsProcessed: 3, itemsNormalized: 18, storiesAdded: 0, errorsCount: 0 }))
      .not.toThrow();
  });
});

describe('publish mode', () => {
  it('keeps live publisher fetching behind the explicit bootstrap flag', () => {
    expect(isBootstrapLiveFetch(['node', 'publish-remote.ts'])).toBe(false);
    expect(isBootstrapLiveFetch(['node', 'publish-remote.ts', '--bootstrap-live-fetch'])).toBe(true);
  });
});

describe('isCapturedFeedKey', () => {
  it('only accepts the Worker raw object for the source being ingested', () => {
    expect(isCapturedFeedKey('bbc-uk', 'raw/2026-10-26/bbc-uk_1793012400000.xml')).toBe(true);
    expect(isCapturedFeedKey('bbc-uk', 'media/2026-10-26/bbc-uk.jpg')).toBe(false);
    expect(isCapturedFeedKey('bbc-uk', 'raw/2026-10-26/guardian-uk_1793012400000.xml')).toBe(false);
  });
});
