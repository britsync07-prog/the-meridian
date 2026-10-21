# Spike results — the five architecture-changing measurements

Phase 1 ran five spikes, each of which answers a question that changes the
architecture. This file is the rollup: the question, the metric, the observed
value, the threshold it was measured against, the decision it drove, and
whether the delivery model changed.

**Every number here was observed.** The method that produced it, the raw
tables and the things each spike did *not* settle live in the spike's own
`RESULT.md`, linked from each section below. A spike that could not be run
would say so rather than carry a plausible guess; all five were run.

**The ceilings themselves are not restated here.** They live in
`config/free-tier-limits.json` and are read by id (OPS-01). The measurements
below are of platform behaviour and of this project's own timings, not of
budgets.

---

## The rollup

| Spike | Question | Metric | Observed | Threshold | Decision | Delivery-model change |
|---|---|---|---|---|---|---|
| **S-1** | Does a Durable Object on Workers Free inherit the Workers per-invocation CPU ceiling? | CPU consumed before the runtime terminates the invocation | The Durable Object completed **28.4 s** of CPU and was reset beyond it. The plain Worker, in the same runtime on the same day, was killed somewhere between **0.72 s and 1.44 s**. | Survives **2 s** of CPU | **Threshold met.** A Durable Object on the Free plan is a viable host for the ingest pipeline. | **No change.** The fetch-only Worker → R2 → CI path stays the design of record. The option is recorded in `docs/adr/0001-delivery-model.md`; Phase 2 owns the choice, against the real feed set rather than a sample. |
| **S-2** | Do real publishers serve a Cloudflare Worker? | Feeds answering **200** from the edge | **6 of 10** returned 200. The other four failed with 502, a TLS failure, a DNS failure and a 403 — and **all four failed identically from an ordinary client on an ordinary network.** | **80%** of feeds return 200 | **The threshold is not met, but not for the reason it was written for.** The threshold detects publishers refusing a Cloudflare egress, and that did not happen. The Worker is not blocked; four of the ten registry candidates are dead or refusing for everyone. | **No change.** The Worker remains the preferred fetch path. The four failures are a registry problem for Phase 2, not an egress problem. |
| **S-3** | Does a GitHub Actions runner get blocked where the Worker does not? | Publishers blocking the CI IP range | **1 of 10** — the same publisher that refused the Worker. The runner reached exactly the same six feeds and failed on exactly the same four. | **30%** or more block the CI range | **Threshold not met.** The spike detects a surprise and does not reopen the decision: the Worker remains the preferred fetch path, because a dedicated, auditable, rate-limited identity is a better citizen than a shared runner IP range. | **No change.** It also corrected a conclusion drawn in S-2: the conditional GET *is* honoured, inconsistently, and the mechanism is the publishers' cache state rather than the egress path. |
| **S-4** | How fast does the Astro 7 build run, and does `incrementalBuild` work? | Pages per second on a build of one shard's whole file allowance | At **20,001 pages**: **84.6 pages/second** on the realistic story-page arm (236.3 s) and **157.3 pages/second** on the minimal arm (127.1 s). The incremental build restored **20,000** pages and rendered **none**. | Below **60** pages per second → topic and entity pages move to the R2 tier before year 2 | **Threshold not met. The static tier stays as designed; topic and entity pages do not move.** The heavier page cost 1.9× the wall time, not several times it, because at this scale the build is bound by filesystem traffic rather than by rendering. | **No change.** The measurement is recorded in `docs/adr/0001-delivery-model.md` with its caveat: it was taken on a Windows workstation, not on the CI runner. |
| **S-5** | Does `wrangler deploy` re-upload unchanged assets on every deploy? | Files that actually went over the wire on a deploy with nothing changed | **0 of 506** assets on the second and third deploys of a 506-file project; **0 of 5,006** at the larger scale. The first deploy of each uploaded the whole set. | A **full re-upload** on the second deploy → the deploy step is budgeted at full size | **Threshold not met. Deploys are cheap and the shard count can grow.** Wrangler diffs the asset manifest: `No updated asset files to upload`, and `506 already uploaded`. | **No change.** The eight-shard model is confirmed. The measurement supplies the deploy half of the OPS-07 budget as a formula — a fixed cost plus a per-file manifest cost — not as a single number. |

---

## S-1 — Durable Object CPU on Workers Free

- **Question:** does a Durable Object on the Workers Free plan die at the
  Workers per-request CPU ceiling with `Error 1102`, or reach its own
  allowance?
- **Method:** two arms and a plan probe against the same account on the same
  day. The `do` arm forwards to the Durable Object; the **control** arm burns
  the same CPU in the plain Worker with no Durable Object involved, so that
  "the Durable Object survived" cannot be confused with "this account is not
  on the plan the spike assumed". A plan probe fired more subrequests than
  the Free plan permits to establish which plan the account is on.
- **Observed:** the Durable Object completed 28.4 s of CPU and was reset
  beyond that; the plain Worker was killed between 0.72 s and 1.44 s. The
  plan probe returned exactly the Free-plan subrequest allowance. The
  account is on the Free plan, and a Durable Object does not inherit the
  Workers per-invocation ceiling.
- **Threshold:** survives 2 s of CPU. **Met**, by roughly a factor of
  fourteen.
- **Decision:** a Durable Object is a viable ingest host on the plan the
  project is permanently committed to. **It is not adopted.** Phase 2 owns
  the choice, against every publisher in seven countries rather than a
  sample of ten, and a Durable Object is single-threaded per object.
- **Did NOT settle:** the delivery model; the concurrency profile of
  deduplication on a single object; the Durable Object's storage allowance;
  the plain Worker's real ceiling, which is fuzzy and undocumented and must
  not be designed against.
- **Detail:** [`spikes/s-1-do-cpu/RESULT.md`](s-1-do-cpu/RESULT.md)

---

## S-2 — Worker egress vs publisher blocking

- **Question:** do real publishers serve a Cloudflare Worker?
- **Method:** ten registry candidate feeds fetched one at a time from the
  edge with the shared descriptive User-Agent, in three passes — one to
  capture the ETags, one to replay them with `If-None-Match`, and one to
  establish that the failures are stable rather than transient. A fourth
  diagnostic fetched the four failing feeds from an ordinary client on an
  ordinary network, so a publisher failure could be told apart from an
  egress failure. **Nothing was parsed**; bodies were counted in bytes and
  discarded.
- **Observed:** six of ten feeds at 200, in between 13 and 1,068 ms, with no
  throttling and no `Retry-After` on any feed. The four failures reproduce
  with no Worker in the path. Exactly one feed refuses on status; the other
  three fail at the transport layer.
- **Threshold:** 80% of feeds at 200. **Not met at 60%** — but the threshold
  was written to detect publishers refusing a Cloudflare egress, and that did
  not occur.
- **Decision:** the Worker is not blocked by any publisher. The four failures
  are a **registry problem** for Phase 2 to replace, not an egress problem.
  The conditional GET is implemented because it is the correct mechanism, and
  a 200 with a full body is treated as the normal outcome — a bandwidth
  budget cannot be built on 304s.
- **Did NOT settle:** feed availability and terms of use, which remain
  Phase 2's legal gate; the other countries' and the Hindi-language
  publishers, which are entirely unmeasured; whether one successful request
  each says anything about a scheduled poll.
- **Detail:** [`spikes/s-2-worker-egress/RESULT.md`](s-2-worker-egress/RESULT.md)

---

## S-3 — CI egress comparison

- **Question:** does a GitHub Actions runner get blocked where the Worker
  does not?
- **Method:** the same ten feeds, from a `workflow_dispatch`-only workflow
  so the spike cannot fire spontaneously, in two passes mirroring S-2. Both
  sides of the comparison read the **same modules**: the feed list from the
  S-2 harness and the User-Agent out of the project's own shared config, so
  the comparison is like for like.
- **Observed:** six of ten at 200 — the same six — and the same four
  failures. One publisher blocks the CI IP range. Three of the four
  ETag-bearing feeds answered **304** on the conditional pass.
- **Threshold:** 30% or more blocking. **Not met at 10%.**
- **Decision:** the Worker remains the preferred fetch path. The spike
  **detects a surprise and does not reopen the decision** — a dedicated,
  auditable, rate-limited identity is a better citizen than a shared runner
  IP range.
- **Did NOT settle:** the other countries' publishers; whether a runner would
  be throttled after a day of hourly polls; the characterisation of the
  runner IP range; the rate-limit-withdrawal path, which no feed exercised;
  the operational shape of a scheduled CI fallback.
- **It corrected S-2.** The original reading of S-2 — that publishers ignore
  the conditional header — was wrong. The ETags had gone stale between the
  passes, and a publisher whose CDN copy is fresh serves that copy directly
  with a 200 without ever consulting the client's `If-None-Match`. The
  mechanism is the publishers' cache state, not the egress path.
- **Detail:** [`spikes/s-3-ci-egress/RESULT.md`](s-3-ci-egress/RESULT.md)

---

## S-4 — Astro build throughput

- **Question:** how fast does the Astro 7 build run, and does
  `experimental.incrementalBuild` actually work?
- **Method:** a synthetic Astro project in a gitignored scratch directory,
  built with the same three load-bearing settings as the real project
  (`compressHTML: true`, `build.concurrency: 1`,
  `experimental.incrementalBuild: true`). The page count is the
  `static_asset_files_per_project` limit read by id — one shard's whole file
  allowance, and the worst case the static tier can reach. **Two page
  complexities were measured**: a minimal page, and a realistic story page
  carrying the six required value elements, the metadata head and a
  structured-data block. Each arm ran the build twice with the cache
  preserved, and the harness counted the pages marked `(restored)` against
  the pages marked `(rendered)`.
- **Observed:** 84.6 pages/second on the realistic arm and 157.3 on the
  minimal arm, both at 20,001 pages. The incremental build restored every
  page and rendered none. The realistic page cost 1.9× the wall time, not
  several times it, because the build is bound by filesystem traffic at this
  scale.
- **Threshold:** below 60 pages per second → topic and entity pages move to
  the R2 tier before year 2. **Not met.**
- **Decision:** the static tier stays as designed and topic and entity pages
  do **not** move. The build-duration budget for OPS-07 must be written
  against the **full** build, not the incremental one — the incremental arm
  was not reliably faster, and in the heavy arm it was slower.
- **Did NOT settle:** the measurement was taken on a Windows workstation, not
  on the CI runner, and the build is I/O-bound; neither page is the real
  template; Tailwind's build is not included; the real static tier is far
  below the worst case measured here.
- **Detail:** [`spikes/s-4-astro-throughput/RESULT.md`](s-4-astro-throughput/RESULT.md)

---

## S-5 — wrangler asset-upload diffing

- **Question:** does `wrangler deploy` re-upload unchanged assets on every
  deploy?
- **Method:** an assets-only project with a deliberately varied asset set —
  markup, a stylesheet, a script, a long file name, a non-ASCII file name
  and a nested directory — deployed three times with no content change
  between the deploys, at two scale points (506 and 5,006 files) so the
  fixed cost of a deploy could be separated from the per-file cost. The
  counts are read out of wrangler's own output and recorded in
  `measurement.json`.
- **Observed:** 506 of 506 uploaded on the first deploy and **0 of 506** on
  the second and third. At the larger scale, 4,500 of 5,006 on the first
  deploy and **0 of 5,006** on the second and third. Wrangler says so in
  its own words: `No updated asset files to upload`, and `506 already
  uploaded`.
- **Threshold:** a full re-upload on the second deploy. **Not met.**
- **Decision:** deploys are cheap and the shard count can grow. The
  eight-shard model is confirmed. The deploy half of the OPS-07 budget is a
  **formula** — a fixed cost of roughly six to seven seconds plus roughly
  five milliseconds per file for the manifest pass, plus the upload of
  whatever changed — because the file count is the thing that varies.
- **Did NOT settle:** the measurement was taken on a Windows workstation, not
  on the CI runner; the asset payloads are tiny; the largest set measured is
  a few thousand files rather than a full shard's worth; the edge Worker's
  script upload was not measured; no upload rate limit was exercised; and
  the R2 story tier was not measured at all.
- **Detail:** [`spikes/s-5-wrangler-diffing/RESULT.md`](s-5-wrangler-diffing/RESULT.md)

---

## What all five spikes say together

**The delivery model is unchanged, and that is the finding rather than a
non-result.** Each spike tested a specific way the delivery model could have
had to change, and in every case the model survived the test:

| Spike | The way the model could have changed | What happened |
|---|---|---|
| S-1 | The ingest engine becomes a Durable Object | It **can**, and the option is now recorded in ADR 0001. The choice belongs to Phase 2, against the real feed set. |
| S-2 | The Worker cannot fetch publishers' feeds | It can. Four candidates are dead for everyone and must be replaced. |
| S-3 | Only the Worker can reach publishers | The runner can too. The Worker stays the preferred path anyway. |
| S-4 | Topic and entity pages must move to the R2 tier | They do not. The static tier stays as designed. |
| S-5 | Every deploy re-uploads the whole static tier | It does not. Deploys are cheap. |

**Three things the spikes did change.** They replaced an assumption about
the Durable Object with a measurement and an option. They corrected a
conclusion drawn in S-2, in the same repository, in the same week. And they
turned the OPS-07 build-duration and deploy budgets from guesses into
formulas with measured coefficients.

**And one thing they explicitly did not do:** none of them cleared the legal
gate on the feeds. S-2 and S-3 measured blocking. Availability and terms of
use remain Phase 2's gate, and no spike is permission to fetch any feed in
production.
