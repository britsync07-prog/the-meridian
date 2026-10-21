# S-3 — CI egress comparison

- **Question:** does a GitHub Actions runner get blocked where the Worker does
  not?
- **Threshold:** 30% or more of publishers block the CI IP range → the Worker
  is definitively the only fetch path.
- **Harness:** `spikes/s-3-ci-egress/run.mjs` plus
  `.github/workflows/spike-s3-egress.yml`.
- **Run:** [GitHub Actions run 39505614934](https://github.com/britsync07-prog/the-meridian/actions/runs/39505614934),
  `workflow_dispatch` on `main`, 2026-10-21.
- **Measured from:** a GitHub Actions runner on `ubuntu-latest`, Node 24.

---

## Method

The workflow is `workflow_dispatch` only, so it cannot fire spontaneously and
cannot hammer a publisher at a moment nobody chose. It asks for one
permission — `contents: read` — reads no secrets and writes nothing back to
the repository.

Two passes, mirroring S-2 exactly:

1. **Pass 1** fetches the ten feeds with no conditional header and captures
   each feed's ETag.
2. **Pass 2** replays those ETags with `If-None-Match`, so the conditional-GET
   path is exercised from the runner as well.

Both sides of the comparison read the **same modules**: the feed list comes
from `spikes/s-2-worker-egress/src/feeds.mjs`, and the User-Agent is read out
of the project's own `shared/config/site.ts`. The value the runner sent was
`TheMeridianBot/1.0 (+https://meridian.workers.dev/about#contact;
newsroom@example.invalid)` — byte-for-byte what the Worker sent. A comparison
in which the two sides identify themselves differently would measure the
difference between two identifiers, not the difference between two egress
paths.

The body of each feed is counted in bytes and discarded. Nothing is parsed.

---

## Observed

### Pass 1 — from the GitHub Actions runner

| Feed | Status | Latency (ms) | Blocked | ETag |
|---|---|---|---|---|
| bbc | **200** | 115 | no | no |
| guardian | **200** | 27 | no | yes |
| skynews | **200** | 168 | no | yes |
| independent | **200** | 66 | no | yes |
| ft | **200** | 705 | no | yes |
| nytimes | **200** | 26 | no | no |
| washingtonpost | 502 | 9,124 | no | — |
| cnn | fetch failed | 98 | no | — |
| aol | fetch failed | 11 | no | — |
| ap | **403** | 53 | **yes** | — |

**Served with 200: 6 of 10 — 60%.** Blocked: 1. Rate-limited: 0. No
`Retry-After` on any feed.

### Pass 2 — conditional GET, ETags replayed

| Feed | Status | Latency (ms) | Note |
|---|---|---|---|
| guardian | **304** | 15 | the ETag was honoured |
| skynews | **304** | 166 | the ETag was honoured |
| independent | **304** | 39 | the ETag was honoured |
| ft | 200 | 680 | the feed had changed |
| bbc | 200 | 91 | no ETag was returned in pass 1 |
| nytimes | 200 | 21 | no ETag was returned in pass 1 |
| washingtonpost | 502 | 9,047 | — |
| cnn | fetch failed | 15 | — |
| aol | fetch failed | 66 | — |
| ap | 403 | 25 | — |

**Three of the four ETag-bearing feeds answered `304 Not Modified`.**

---

## Decision

**Ten per cent of publishers block the CI IP range, against a threshold of
thirty per cent. The threshold is not met, and the Worker remains the
preferred fetch path.**

This spike **detects a surprise; it does not reopen the decision.** Two
things were found, and neither one changes the architecture.

### Surprise 1 — the two egress paths reach exactly the same publishers

| | Worker (S-2) | CI runner (S-3) |
|---|---|---|
| Feeds answering 200 | 6 of 10 | 6 of 10 |
| The same six | bbc, guardian, skynews, independent, ft, nytimes | the same six |
| The same four failures | washingtonpost (502), cnn (TLS), aol (DNS), ap (403) | the same four |
| Blocked | 1 | 1 |

**The Worker and the runner fail on exactly the same four feeds and succeed
on exactly the same six.** There is no publisher in this set that serves one
and refuses the other. Whatever is wrong with `washingtonpost`, `cnn`, `aol`
and `ap`, it is not the egress path — S-2 confirmed it by reproducing all
four failures from an ordinary client on an ordinary network.

So the twenty per cent of feeds that do not answer is a **registry problem**,
not an egress problem, and Phase 2 inherits a task of replacing four dead
candidates rather than a task of choosing between two fetch paths.

### Surprise 2 — the conditional GET is honoured inconsistently

The runner got three `304`s. The Worker, in an earlier run whose ETags had
gone stale between the two passes, got none. A follow-up run of the Worker
with the two passes seconds apart got one `304`.

The mechanism was then pinned down by looking at the response headers
directly. The Guardian's feed is served with `Cache-Control: max-age=60,
stale-while-revalidate=6, stale-if-error=864000, private` and `Age: 0`. When
the CDN's copy is fresh, it is **served directly with a 200 and the client's
`If-None-Match` is never consulted** — the ETag comes back identical and the
status is still 200. When the copy is stale, the CDN revalidates and answers
304.

So the 304 depends on the publisher's cache state at that instant, not on the
client's request, and not on the egress path. The consequence for Phase 2 is
the same on either side: **the conditional GET is the correct mechanism to
implement, but a 200 with a full body is the normal outcome, and a bandwidth
budget cannot be built on 304s.** (This corrected a conclusion drawn in S-2,
which had read the stale-ETag run as evidence that publishers ignore the
header altogether.)

---

## What this does NOT settle

- **Ten feeds are not fifty.** The other countries' publishers and the
  Hindi-language publishers for the India edition are unmeasured, and the
  India set is the one with the least certainty behind it.
- **One scheduled poll is not a scheduled poll.** A single fetch from a
  runner says nothing about whether the same runner would be throttled after
  a day of hourly polls, or whether the shared runner IP range changes
  between one run and the next.
- **The runner's IP range is not characterised.** A single runner's address is
  one point in a range that GitHub allocates dynamically. The ten per cent
  blocking figure is a measurement of one runner at one moment.
- **No rate limiting was exercised.** No feed returned 429 and no
  `Retry-After` header was seen on any path, so the withdrawal path remains
  unverified.
- **The CI fallback's operational shape is unmeasured.** Whether a scheduled
  workflow could be made a reliable fallback — runner image, timeouts, retry
  budget, politeness delay — is Phase 2's work, and it is only worth doing if
  the Worker path proves unreliable in production.

---

## Notes

- The workflow ran to completion on the repository and its artefacts
  (`results.json`, `pass-1.md`, `pass-2.md`) are attached to the run for seven
  days.
- The spike is complete. It was **not** run locally in place of the CI run:
  the local run exists only as a pre-flight check of the script.
- No publisher was contacted more than twice per feed by this spike, and the
  workflow cannot run without a human dispatching it.
