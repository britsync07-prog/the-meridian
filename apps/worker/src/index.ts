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
import { handleStoryRequest } from './story-router.js';
import { handleSubscribe } from './newsletter.js';
import { handleFlagRequest, handleErrorRequest } from './reports.js';
import { runAudit } from './audit.js';
import { runPrune } from './prune.js';

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

    // Story tier: serve /story/* from R2 (OPS-11)
    if (url.pathname.startsWith('/story/')) {
      return handleStoryRequest(url.pathname, env);
    }

    // Newsletter subscription endpoints (GRO-01, GRO-04)
    if (url.pathname === '/api/newsletter/subscribe') {
      if (request.method === 'POST') {
        return handleSubscribe(request, env);
      }
      return new Response('Method not allowed', { status: 405 });
    }

    // Report endpoints (OPS-22, OPS-23)
    if (url.pathname === '/api/reports/flag') {
      if (request.method === 'POST') {
        return handleFlagRequest(request, env);
      }
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/api/reports/error') {
      if (request.method === 'POST') {
        return handleErrorRequest(request, env);
      }
      return new Response('Method not allowed', { status: 405 });
    }

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
    // OPS-15: Prune raw items daily at 02:00 UTC
    if (controller.cron === '0 2 * * *') {
      ctx.waitUntil(runPrune(env));
    }

    // OPS-02/03: Daily audit at 03:00 UTC
    if (controller.cron === '0 3 * * *') {
      ctx.waitUntil(runAudit(env));
    }

    // Feed polling on the existing schedule
    ctx.waitUntil(pollFeedPartition(env, controller.cron));
  },
} satisfies ExportedHandler<MeridianEnv>;
