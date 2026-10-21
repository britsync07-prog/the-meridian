/**
 * The edge Worker.
 *
 * Phase 1 ships this as a health endpoint and nothing more: the fetch-only
 * ingest path, the story tier and the API surface all arrive in later phases.
 * What exists now is the shape every later endpoint inherits — a `fetch`
 * handler that reaches the datastore only through the repository module, and
 * never through a statement of its own.
 */

import { resolveDatabaseId, type MeridianEnv } from './db/config';
import { createRepository } from './db/repository';
import { pollFeedPartition } from './fetcher';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: MeridianEnv): Promise<Response> {
    const repository = createRepository(env);
    const databaseId = resolveDatabaseId(env);
    const url = new URL(request.url);

    // A deliberate, explicit probe: it costs one D1 query and it is the only
    // path that does. The health endpoint itself reads nothing.
    if (url.pathname === '/api/db/tables') {
      const tables = await repository.countTables();
      return json({ ok: true, service: 'meridian-worker', databaseId, tables });
    }

    return json({
      ok: true,
      service: 'meridian-worker',
      databaseId,
      path: url.pathname,
    });
  },

  async scheduled(controller: ScheduledController, env: MeridianEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pollFeedPartition(env, controller.cron));
  },
} satisfies ExportedHandler<MeridianEnv>;
