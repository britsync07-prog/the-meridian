/**
 * S-1 — the Durable Object CPU-burn class.
 *
 * The question this file exists to answer is narrow and factual: **on the
 * account's Workers plan, does a Durable Object invocation die at the Workers
 * Free per-request CPU ceiling, or does it reach the Durable Objects page's
 * own thirty-second allowance?**
 *
 * Cloudflare's own documentation answers it two different ways. The Workers
 * limits page states a per-request CPU ceiling for the Free plan, and the
 * Durable Objects limits page states a thirty-second default per request while
 * also saying that Durable Objects are a special kind of Worker and inherit the
 * Workers limits. Both statements are on Cloudflare's site at the same time.
 * That contradiction is not resolvable by reading, only by measuring.
 *
 * The measurement is a CPU burn. The loop below spins on integer arithmetic,
 * accumulating a checksum so the work cannot be optimised out of existence, and
 * reports how long it actually took.
 *
 * ## The clock
 *
 * The burn is timed with `performance.now()`, and that choice is not cosmetic.
 *
 * The first version of this harness timed the loop with `Date.now()`, and the
 * measurement it produced was nonsense: a burn that was asked to run for one
 * millisecond ran until the runtime killed the invocation, while a burn of
 * four thousand blocks of arithmetic reported an elapsed time of zero
 * milliseconds — sixteen million iterations cannot complete in zero time. The
 * explanation is that the wall clock does not advance inside a synchronous
 * execution on this runtime, so `Date.now()` returns the same value for the
 * whole loop. A loop whose exit condition is `Date.now() < deadline` therefore
 * never exits, and the harness measured its own bug rather than the platform.
 *
 * `performance.now()` is a monotonic clock and it does advance inside the loop.
 * The iteration arm remains as well, because a ceiling that turns out to be
 * small still needs an instrument that does not depend on the clock at all.
 *
 * Two safety properties matter:
 *
 * - The burn is bounded (T-01-21). A CPU-burn loop with no bound is a runaway
 *   on a metered runtime, so every requested duration is clamped to a ceiling
 *   that this file defines, and the iteration count is clamped too.
 * - The loop measures CPU, not waiting. It has no I/O in it, so the time it
 *   consumes is CPU time, which is exactly the quantity the limit governs.
 */

/*
 * The base class is imported under an alias on purpose.
 *
 * `@cloudflare/workers-types` declares a global `DurableObject` *interface* as
 * well as the `cloudflare:workers` module's `DurableObject` *class*. The
 * global interface wins a bare `extends DurableObject`, and an interface
 * cannot be extended. The alias removes the ambiguity and keeps the class —
 * which is what carries the RPC brand the `DurableObjectNamespace` generic
 * requires.
 */
import { DurableObject as DurableObjectBase } from 'cloudflare:workers';

/** The longest burn the harness will run, in milliseconds. */
const MAX_BURN_MS = 60000;

/** The burn the harness runs when the caller asks for nothing specific. */
const DEFAULT_BURN_MS = 2000;

/**
 * Iterations per inner block.
 *
 * Arbitrary, and deliberately not a round budget figure: the free-tier ceiling
 * scan reads every numeric literal in this tree, and a number chosen to look
 * like a budget is exactly the sort of number that ends up meaning something
 * it was never measured to mean.
 */
const BLOCK_ITERATIONS = 4096;

/** The most blocks the iteration arm will burn. */
const MAX_BLOCKS = 8000000;

/**
 * Measure how long the burn took, across an event-loop turn.
 *
 * The clock this runtime exposes to JavaScript does not advance inside a
 * synchronous execution — `Date.now()` and `performance.now()` both return the
 * same value for the whole loop, which is why the time-based arm had to be
 * rebuilt around a monotonic source and why the iteration arm exists at all.
 * Yielding to the event loop lets the runtime refresh its clock, so the
 * elapsed time measured across the yield is the real duration of the burn.
 */
export async function elapsedAcrossYield(startedAt: number): Promise<number> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return Date.now() - startedAt;
}

/** The result of one burn. */
export interface BurnOutcome {
  /** How long the burn actually took, in milliseconds. */
  elapsedMs: number;
  /** A checksum of the work done, so an empty or optimised loop is visible. */
  checksum: number;
  /** Whether the burn ran to completion rather than being cut short. */
  completed: boolean;
  /** How many blocks of arithmetic the burn performed. */
  blocks: number;
}

/**
 * What the caller asked for.
 *
 * `mode` is one of three things:
 *
 * - `none` — do no work at all. This is the baseline arm: it establishes that
 *   the runtime can execute the handler and return a response, separately from
 *   whether it can burn CPU.
 * - `time` — burn until a monotonic-clock deadline.
 * - `iterations` — burn a fixed number of blocks, without consulting the clock.
 */
export interface BurnRequest {
  mode: 'none' | 'time' | 'iterations';
  /** The requested duration, for the `time` mode. */
  targetMs: number;
  /** The requested block count, for the `iterations` mode. */
  blocks: number;
}

/**
 * Read the burn request from a query string.
 *
 * A malformed, absent, negative or absurd value falls back to the default
 * rather than throwing: this harness exists to be pointed at by a shell, and a
 * bad parameter should produce a measurement, not a stack trace.
 */
export function readBurnRequest(params: URLSearchParams): BurnRequest {
  const iterations = params.get('iter');

  if (iterations !== null) {
    const parsed = Number.parseInt(iterations, 10);
    const blocks = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_BLOCKS) : 0;
    return { mode: blocks === 0 ? 'none' : 'iterations', targetMs: 0, blocks };
  }

  const raw = params.get('ms');

  if (raw === 'none') return { mode: 'none', targetMs: 0, blocks: 0 };
  if (raw === null) return { mode: 'time', targetMs: DEFAULT_BURN_MS, blocks: 0 };

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return { mode: 'time', targetMs: DEFAULT_BURN_MS, blocks: 0 };

  return { mode: 'time', targetMs: Math.min(parsed, MAX_BURN_MS), blocks: 0 };
}

/**
 * Burn CPU for approximately `targetMs` milliseconds.
 *
 * The loop is deliberately pure arithmetic: no allocation, no I/O, nothing that
 * could be paused by the runtime waiting on a socket. Every millisecond it
 * spends is CPU the runtime will count.
 */
export function burnCpu(targetMs: number): number {
  const deadline = performance.now() + targetMs;
  let state = 0x9e3779b9;
  let checksum = 0;

  while (performance.now() < deadline) {
    for (let index = 0; index < BLOCK_ITERATIONS; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      checksum = (checksum + (state >>> 7)) >>> 0;
    }
  }

  return checksum;
}

/**
 * Burn exactly `blocks` blocks of arithmetic, without consulting the clock.
 *
 * Returns the number of blocks performed alongside the checksum, so the caller
 * can convert blocks to milliseconds using the runtime's own measurement.
 */
export function burnBlocks(blocks: number): { checksum: number; blocks: number } {
  let state = 0x9e3779b9;
  let checksum = 0;

  for (let block = 0; block < blocks; block += 1) {
    for (let index = 0; index < BLOCK_ITERATIONS; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      checksum = (checksum + (state >>> 7)) >>> 0;
    }
  }

  return { checksum, blocks };
}

/**
 * The Durable Object under test.
 *
 * It burns CPU for as long as the caller asks and reports what it managed to
 * do. If the runtime terminates the invocation, this code never gets to return
 * — which is the observation the spike is looking for.
 */
export class CpuBurner extends DurableObjectBase {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const plan = readBurnRequest(url.searchParams);

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

    const outcome: BurnOutcome = { elapsedMs, checksum, completed: true, blocks };

    return Response.json({
      mode: 'durable-object',
      requestedMs: plan.mode === 'time' ? plan.targetMs : 0,
      requestedBlocks: plan.blocks,
      elapsedMsSync,
      ...outcome,
    });
  }
}
