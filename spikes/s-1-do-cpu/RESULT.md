# S-1 — Durable Object CPU on Workers Free

- **Question:** does a Durable Object on the Workers Free plan die at the
  Workers per-request CPU ceiling with `Error 1102`, or reach its own
  thirty-second allowance?
- **Threshold:** survives two seconds of CPU → the Durable Object becomes the
  ingest engine. Dies at the Workers ceiling → the fetch-only Worker to R2 to
  CI default is confirmed.
- **Harness:** `spikes/s-1-do-cpu/` — a Worker with a SQLite-backed Durable
  Object bound to it.
- **Project deployed:** `meridian-spike-s1`
  (`https://meridian-spike-s1.mehedy303.workers.dev`) — delete after the
  measurement.
- **Measured on:** 2026-10-21, account `9ed8303661b0e2f450816251445f4a60`.

---

## Method

The spike has two arms and a plan probe, all against the same account, on the
same day, in the same runtime.

**The `do` arm** forwards the request to the Durable Object and returns
whatever the Durable Object produced. **The `control` arm** burns the CPU in
the Worker itself with no Durable Object involved. The control is what makes
the measurement interpretable: without it, "the Durable Object survived" cannot
be told apart from "this account is not on the plan the spike assumed".

**The plan probe** (`?sub=N`) fires N parallel subrequests at the spike
Worker's own `workers.dev` URL and counts how many succeed. The subrequest
allowance is the cheapest plan discriminator Cloudflare offers: the Free plan
permits a small fixed number of outgoing requests per invocation and the paid
plan permits three orders of magnitude more. The account's plan is not
readable through any API endpoint the project's OAuth token carries — the
account and subscription endpoints both refuse it — so it was measured rather
than assumed.

**The burn** is pure integer arithmetic with a checksum, so the work cannot be
optimised away, and it has no I/O in it, so the time it consumes is CPU time.

### The instrument had to be rebuilt once

The first version of the harness timed the burn with `Date.now()` and used it
as the loop's exit condition. That measurement was wrong, and the way it was
wrong matters:

- A burn asked to run for **one millisecond** ran until the runtime killed the
  invocation, and
- A burn of four thousand blocks of arithmetic — sixteen million iterations —
  reported an elapsed time of **zero milliseconds**.

Sixteen million iterations cannot complete in zero time. The explanation is
that the wall clock this runtime exposes to JavaScript does not advance inside
a synchronous execution: `Date.now()` returns the same value for the whole
loop, so a loop whose exit condition is `Date.now() < deadline` never exits.
The harness was measuring its own bug, and the first reading of the spike —
"the Durable Object is killed even by a one-millisecond burn" — was an
artefact.

The harness was rebuilt around a fixed **block count** (`?iter=N`), which does
not consult the clock at all, with the elapsed time measured by the client
from outside the runtime. `performance.now()` was also tried and is frozen by
the same mechanism (`elapsedMsSync` reads zero in every response). The clock
does refresh across an event-loop turn, which is why `elapsedMs` is sometimes
non-zero, but it is not a dependable instrument here.

One block is 4,096 iterations, and the in-runtime measurement of 600,000
blocks — 10,811 ms — gives a rate of **18.02 µs per block**. Every block count
below is converted to CPU time at that rate.

---

## Observed

### The account is on the Workers Free plan

| Subrequests fired | Succeeded | Failed | First failure |
|---|---|---|---|
| 10 | 10 | 0 | — |
| 60 | **50** | 10 | `Too many subrequests by single Worker invocation.` |
| 120 | **50** | 70 | `Too many subrequests by single Worker invocation.` |

The allowance is exactly the Free-plan figure of fifty subrequests per
invocation. On the paid plan the same probe would have succeeded at 120. The
account is on the Workers Free plan, which is the plan the whole project is
budgeted against (D-05).

### The plain Worker's CPU allowance (control arm)

| Blocks of arithmetic | Approx. CPU | Outcome over four runs |
|---|---|---|
| none (baseline) | — | 4 of 4 succeeded |
| 40,000 | 0.72 s | 4 of 4 succeeded |
| 60,000 | 1.08 s | 1 of 4 succeeded |
| 80,000 | 1.44 s | 0 of 4 succeeded |
| 100,000 and above | 1.80 s and above | 0 of 4 succeeded, `error code: 1102` |

The Worker's effective per-request CPU allowance on this account is therefore
**between 0.72 and 1.44 seconds** — and the enforcement point is *fuzzy*: at
60,000 blocks one run in four survived, and the neighbouring values flipped
between runs.

This is far larger than the ten milliseconds the Workers limits page states
for the Free plan, and it is larger than the platform's documented "built-in
flexibility" for isolates that occasionally run over the limit. The observed
margin is **not** a number the project should design against: the documented
ceiling is the contract, and an undocumented enforcement margin is not
something to spend.

### The Durable Object's CPU allowance

| Blocks of arithmetic | Approx. CPU | Wall time | Outcome |
|---|---|---|---|
| none (baseline) | — | 0.14 s | succeeded — the Durable Object can execute and answer |
| 600,000 | 10.8 s | 13.6 s | succeeded, in-runtime elapsed **10,811 ms** |
| 1,500,000 | 27.0 s | 30.8 s | succeeded, in-runtime elapsed **28,421 ms** |
| 2,000,000 | 36.0 s | 34.3 s | **reset** — `Durable Object exceeded its CPU time limit and was reset.` |
| 3,000,000 | 54.0 s | 31.8 s | **reset** — same error |

**The Durable Object's CPU allowance is about thirty seconds**, and it is
roughly **twenty times** the plain Worker's allowance on the same account, in
the same runtime, on the same day.

### Which documented number reality matches

The two Cloudflare pages contradict each other, and the measurement picks a
side:

| Claim | Source | Matches reality? |
|---|---|---|
| A Durable Object gets a thirty-second default CPU allowance per request | Durable Objects limits page | **Yes.** The Durable Object completed 28.4 s and was reset beyond that. |
| A Durable Object inherits the Workers plan's per-invocation CPU limits | Durable Objects limits page, FAQ | **No.** The Durable Object ran 28.4 s where the plain Worker was killed at 0.72 s. |
| A Worker gets ten milliseconds of CPU per request on the Free plan | Workers limits page | The *nominal* figure is not what is enforced, but it is not contradicted either — the measured enforcement point is a margin above it, and the margin is undocumented. |

**The Durable Objects page is right about the Durable Object.** A Durable
Object on the Workers Free plan does **not** inherit the Workers Free
per-request CPU ceiling. It gets its own thirty-second allowance.

---

## Decision

**The Durable Object survives two seconds of CPU by a factor of roughly
fourteen. S-1's threshold is met, and the Durable Object is a viable ingest
engine on the Workers Free plan.**

This is the finding the spike was built to look for, and it is materially
good news: a SQLite-backed Durable Object can host the ingest pipeline —
parsing, deduplication, clustering and scoring — inside a single request
without an R2 raw-staging hop, on a plan the project is permanently committed
to (D-05). That is exactly the simplification the research anticipated.

**What this does NOT settle:**

- **It does not change the delivery model.** The fetch-only Worker to R2 to
  CI default is still the design of record. Phase 2 must choose between the
  two against the real feed set — fifty publishers, not ten — and the choice
  belongs to the phase that owns the ingest, not to a spike. The
  `docs/adr/0001-delivery-model.md` update this plan makes records the
  measurement and the option; it does not adopt the Durable Object.
- **It does not validate the Durable Object for production ingest.** A
  Durable Object is single-threaded per object, and fifty feeds with
  deduplication is a workload whose concurrency profile has not been
  measured. The spike answers one question — how much CPU a single Durable
  Object invocation may consume — and that is the only question it answers.
- **It does not measure the Workers request allowance.** The spike consumed a
  handful of requests. The Durable Object's *storage* allowance (five
  gigabytes per account on the Free plan) and its per-request cost against the
  hundred-thousand daily request ceiling are untouched by this measurement.
- **It does not settle what the plain Worker's real ceiling is.** The measured
  enforcement point (0.72–1.44 s) is fuzzy and far above the documented
  figure. The project must be designed against the documented figure, not
  against the measured margin.

---

## Notes

- The spike project is `meridian-spike-s1`. It was deployed more times than
  the threat model anticipated (six, because the instrument had to be rebuilt
  once and the plan probe added), each deploy replacing the previous version of
  a single project. Delete it after the measurement.
- The account's Workers request allowance was not touched in any material way:
  the whole spike is a few hundred requests against a per-day allowance of
  five figures.
- No publisher was contacted. The plan probe fetches the spike Worker's own
  `workers.dev` URL, so it puts no traffic on a third party.
