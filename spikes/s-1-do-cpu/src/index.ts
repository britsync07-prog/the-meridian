/**
 * S-1 — the Worker that drives the Durable Object CPU measurement.
 *
 * The spike has two arms, and both run on the same account, in the same
 * request path, against the same runtime:
 *
 * - **`mode=do`** (the default) forwards the request to the Durable Object and
 *   returns whatever the Durable Object managed to produce. If the Durable
 *   Object is terminated for exceeding its CPU allowance, the call fails and
 *   the failure is reported here — the Durable Object's own code never gets to
 *   report it, because it is gone.
 * - **`mode=control`** burns the CPU in the Worker itself, with no Durable
 *   Object involved. This is the control arm, and it is what makes the
 *   measurement interpretable: it establishes what this account's *Workers*
 *   per-request CPU allowance actually is, on the same day, on the same
 *   account, in the same process. Without it, "the Durable Object survived two
 *   seconds" cannot be told apart from "this account is not on the plan the
 *   spike assumed".
 *
 * The Durable Object class is re-exported from this module because Wrangler
 * discovers the class bound to the `DO` binding through the entrypoint module.
 */

import { CpuBurner, burnBlocks, burnCpu, elapsedAcrossYield, readBurnRequest } from './do';

export { CpuBurner };

export interface Env {
  DO: DurableObjectNamespace<CpuBurner>;
}

/** The mode the request asks for. Anything other than `control` uses the Durable Object. */
type Mode = 'durable-object' | 'control';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const plan = readBurnRequest(url.searchParams);
    const mode: Mode = url.searchParams.get('mode') === 'control' ? 'control' : 'durable-object';

    /*
     * The plan probe.
     *
     * The account's Workers plan is not readable through any API the OAuth
     * token carries, and the plan decides which documented limit applies to
     * this account in the first place. The subrequest allowance is the
     * cheapest discriminator Cloudflare offers: the Free plan allows a small
     * fixed number of outgoing requests per invocation, and the paid plan
     * allows three orders of magnitude more. Firing more subrequests than the
     * Free plan permits therefore either fails (Free) or succeeds (paid), and
     * the failure is unambiguous.
     *
     * The probe fetches this Worker's own `workers.dev` URL, so it puts no
     * traffic on a third party and hammers nobody.
     */
    const subrequests = url.searchParams.get('sub');

    if (subrequests !== null) {
      const count = Math.max(0, Math.min(Number.parseInt(subrequests, 10) || 0, 200));
      const target = 'https://meridian-spike-s1.mehedy303.workers.dev/?ms=none';

      const results = await Promise.allSettled(
        Array.from({ length: count }, () => fetch(target).then((response) => response.status)),
      );

      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => String(result.reason?.message ?? result.reason));

      return Response.json({
        mode: 'plan-probe',
        requested: count,
        succeeded,
        failed: count - succeeded,
        firstFailure: failures[0] ?? null,
      });
    }

    if (mode === 'control') {
      const startedAt = performance.now();
      let checksum = 0;
      let blocks = 0;

      if (plan.mode === 'time') {
        checksum = burnCpu(plan.targetMs);
      } else if (plan.mode === 'iterations') {
        const result = burnBlocks(plan.blocks);
        checksum = result.checksum;
        blocks = result.blocks;
      }

      const elapsedMsSync = performance.now() - startedAt;
      const elapsedMs = await elapsedAcrossYield(Date.now());

      return Response.json({
        mode,
        requestedMs: plan.mode === 'time' ? plan.targetMs : 0,
        requestedBlocks: plan.blocks,
        elapsedMs,
        elapsedMsSync,
        checksum,
        blocks,
        completed: true,
      });
    }

    try {
      const id = env.DO.idFromName('s1-cpu-burner');
      const stub = env.DO.get(id);
      const response = await stub.fetch(
        `https://cpu-burner.internal/?ms=${plan.mode === 'time' ? plan.targetMs : 'none'}&iter=${
          plan.mode === 'iterations' ? plan.blocks : 0
        }`,
      );
      const body = (await response.json()) as Record<string, unknown>;

      return Response.json({ ...body, mode, workerObserved: true });
    } catch (error) {
      /*
       * The Durable Object was terminated before it could answer.
       *
       * A runtime termination is not a JavaScript exception, so it arrives
       * here as a rejected call rather than as a thrown error inside the
       * Durable Object. Whatever shape it takes, it is the observation the
       * spike exists to make, so it is reported rather than swallowed.
       */
      return Response.json(
        {
          mode,
          requestedMs: plan.mode === 'time' ? plan.targetMs : 0,
          requestedBlocks: plan.blocks,
          completed: false,
          workerObserved: true,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : typeof error,
        },
        { status: 502 },
      );
    }
  },
} satisfies ExportedHandler<Env>;
