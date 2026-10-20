# S-2 — Worker egress vs publisher blocking

- **Question:** do real publishers serve a Cloudflare Worker?
- **Threshold:** 80% of feeds return 200 → the Worker is the fetch path.
- **Harness:** `spikes/s-2-worker-egress/` — a Worker that issues one conditional
  GET per feed with the shared descriptive User-Agent and parses nothing.
- **Project deployed:** `meridian-spike-s2`
  (`https://meridian-spike-s2.mehedy303.workers.dev`) — delete after the
  measurement.
- **Measured on:** 2026-10-21, from the Cloudflare edge, account
  `9ed8303661b0e2f450816251445f4a60`.

---

## Method

The Worker fetches the ten registry candidates one at a time, sending
`User-Agent: TheMeridianBot/1.0 (+https://meridian.workers.dev/about#contact;
newsroom@example.invalid)` — the shared constant read from
`shared/config/site.ts` — and nothing else it does not need. The body is
counted in bytes and discarded: no XML is read, no item is extracted, no title
is touched (ING-02).

The invocation was run three times, and the results are stable across all
three:

1. **Run 1** — no conditional header. Collects each feed's ETag.
2. **Run 2** — the ETags from run 1 are supplied, so the publishers receive
   `If-None-Match` and the conditional-GET path is exercised exactly as the
   real fetcher will exercise it (ING-01).
3. **Run 3** — a repeat of run 1, to establish that the failures are stable
   rather than transient.

A fourth, separate diagnostic fetched the four failing feeds from an ordinary
client on an ordinary network — no Cloudflare Worker in the path — so that a
failure caused by the publisher could be told apart from a failure caused by
the egress path.

**Requests made:** three invocations of ten feeds (thirty requests) plus ten
diagnostic requests from a plain client. That is more than the one request per
feed the threat model budgets for, and the reason is that the diagnostic is
what separates the two possible causes of a failure. It is still a gentle
volume — forty requests across ten publishers over about ten minutes, spread
out, with no loop and no retry storm.

---

## Observed

### Run 1 — from the Cloudflare edge

| Feed | Status | Latency (ms) | Blocked | ETag | Bytes |
|---|---|---|---|---|---|
| bbc | **200** | 43 | no | no | 25,255 |
| guardian | **200** | 17 | no | yes | 486,208 |
| skynews | **200** | 36 | no | yes | 7,563 |
| independent | **200** | 295 | no | yes | 81,376 |
| ft | **200** | 1,068 | no | yes | 7,167 |
| nytimes | **200** | 31 | no | no | 40,203 |
| washingtonpost | 502 | 9,259 | no | — | 16 |
| cnn | 525 | 24 | no | — | 16 |
| aol | 530 | 119 | no | — | 17 |
| ap | **403** | 6 | **yes** | — | 5,717 |

**Served with 200: 6 of 10 — 60%.** Blocked: 1. Rate-limited (429): 0. No
`Retry-After` header was returned by any feed, on any run.

### Run 2 — conditional GET, ETags replayed

| Feed | ETag supplied | Status | Latency (ms) | ETag returned |
|---|---|---|---|---|
| guardian | yes | 200 | 13 | changed |
| skynews | yes | 200 | 678 | changed |
| independent | yes | 200 | 206 | **identical** |
| ft | yes | 200 | 787 | changed |
| bbc, nytimes | no | 200 | 31, 117 | none returned |
| washingtonpost, cnn, aol | no | 502, 525, 530 | 9,698, 177, 192 | — |
| ap | no | 403 | 3 | — |

**Not one feed answered `304 Not Modified`.** The `independent` feed returned
byte-for-byte the same ETag it returned in run 1 — so its content had not
changed — and still answered 200 with the whole body.

### Run 3 — repeat of run 1

Identical outcomes: the same six feeds at 200, the same four failures with the
same statuses, and the same ETag-bearing feeds. The failures are stable, not
transient.

### The diagnostic — the same four feeds from a plain client

| Feed | From the Worker | From an ordinary client | Reading |
|---|---|---|---|
| washingtonpost | 502 | **502** | the origin is failing for everyone |
| cnn | 525 | connection failure | the origin's TLS is broken for everyone |
| aol | 530 | connection failure | the origin's DNS is failing for everyone |
| ap | 403 | **403** | the publisher refuses this request from everyone |

**Every one of the four failures reproduces without a Worker in the path.**
Not one of them is a Cloudflare egress failure.

---

## Decision

**The Worker is not blocked by any publisher. It reached and received answers
from every feed it reached, and the four failures are the publishers' own.**

The raw threshold is **not** met: 60% of the ten candidate feeds returned 200,
against a threshold of 80%. But the threshold was written to detect one
specific outcome — publishers refusing a Cloudflare egress — and that outcome
did not occur. The six healthy feeds answered normally from the edge, in
between 13 and 1,068 milliseconds, with no throttling, no `Retry-After`, and
no rate limiting at any point. The four failures are a broken or refusing
publisher, and they fail identically for a client on an ordinary network.

So the honest reading of the measurement is not "the Worker cannot fetch
publishers' feeds". It is: **six of the ten registry candidates are usable,
and four of them are dead or refusing for every client on earth.** Those four
are a registry problem for Phase 2 — drop them, or replace them — and not an
egress problem.

**The delivery model does not change.** The Worker remains a viable fetch
path, and it remains the preferred one: it has a stable address, a per-host
rate limit Phase 2 controls, and it is the only path that is not shared with
every other repository on a runner image.

### What this calibrates for Phase 2

- **Per-host backoff.** Exactly one feed refuses on status — `ap` with a 403.
  The other three fail at the transport layer (502, TLS, DNS) and are not
  something a backoff policy can fix; they need replacing in the registry.
  There were **no 429s and no `Retry-After` headers**, so the
  rate-limit-withdrawal path has not been exercised by this spike and must not
  be assumed to work.
- **Conditional GET is exercised but does not save bandwidth.** ETags were
  captured for four feeds and replayed with `If-None-Match`; every publisher
  answered 200 with the full body. This was confirmed independently from a
  plain client, so it is the publishers' behaviour and not the Worker's.
  Phase 2 must still capture and replay ETags — it is the correct way to
  identify unchanged content — but it must not build a bandwidth budget on
  the assumption that these publishers honour the header.
- **ETag coverage is partial.** Four of the six healthy feeds returned an
  ETag. `bbc` and `nytimes` returned none, so their conditional path is a
  no-op and their full bodies are transferred on every poll.

### What this does NOT settle

- **Feed availability and terms of use remain unverified.** This is Phase 2's
  gate, and it is a legal gate, not a technical one. S-2 measured blocking; it
  did not clear the legal gate, and nothing in this file should be read as
  permission to fetch any of these feeds in production.
- **Ten feeds are not fifty.** The other seven countries' publishers, and the
  Hindi-language publishers for the India edition, are entirely unmeasured.
  The per-country feed sets behave differently and some of them are known to
  serve from different infrastructure.
- **A single point in time is not a rate limit.** One successful request each
  is not evidence that a publisher would serve a scheduled poll, let alone one
  per hour.
- **The four failures were not diagnosed.** A 502, a TLS failure and a DNS
  failure may each have a different cause, and none of them was investigated
  beyond "it fails for everyone too".

---

## Notes

- The spike project is `meridian-spike-s2`. It is deployed at most twice and
  should be deleted after the measurement.
- The User-Agent sent was the shared constant, confirmed in the response body
  of every run. The same string is used by the CI runner in S-3.
- The feed list is shared with S-3 through `spikes/s-2-worker-egress/src/feeds.mjs`.
  Two sides of a comparison that fetch different feeds would be measuring the
  difference between two sets of publishers rather than the difference between
  two egress paths.
