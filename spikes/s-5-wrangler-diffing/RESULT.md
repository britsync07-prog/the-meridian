# S-5 — does `wrangler deploy` re-upload unchanged assets?

- **Question:** does `wrangler deploy` re-upload unchanged assets on every
  deploy?
- **Threshold:** a full re-upload on the second deploy → the deploy step must
  be budgeted at full size and may need the shard split to stay under upload
  rate limits. Full diffing → deploys are cheap and the shard count can grow.
- **Harness:** `spikes/s-5-wrangler-diffing/` — an assets-only project and
  `measure.mjs`, which deploys it three times with no content change between
  the deploys and reads the upload counts out of wrangler's own output.
- **Project deployed:** `meridian-spike-s5`
  (`https://meridian-spike-s5.mehedy303.workers.dev`) — delete after the
  measurement.
- **Measured on:** 2026-10-21, wrangler 4.151.3, Node 24.12.0, on the local
  **Windows** workstation.

---

## Method

An assets-only project with no `main` key, so the measurement is of the
asset path and nothing else. Its asset set is deliberately not trivial: it
holds markup, a stylesheet, a script, a deliberately long file name, a
non-ASCII file name and a nested directory, so the manifest has to carry a
realistic spread of path shapes rather than a single trivial case.

**The scale set.** The *mechanism* — does the second deploy re-upload
anything — is settled by a handful of files. The *budget* the OPS-07
assertion needs is a per-file cost, and a per-file cost cannot be read off a
handful of files. So the harness generates a scale set of small probe files
before the measurement and removes it afterwards. The generated files are
gitignored and never committed. Two scale points were measured, so the fixed
cost of a deploy can be separated from the cost that grows with the file
count:

| Run | Asset files | How it was reached |
|---|---|---|
| A | 506 | A fresh project — 6 committed probe files plus a 500-file generated scale set. |
| B | 5,006 | The same project with the scale set grown to 5,000 files. |

**What is read out of the output.** Wrangler prints one
`Uploaded <n> of <total> assets` line per upload batch, so the **last** of
them carries the final total — the first is a partial count, and reading the
first is how the first run of this spike mis-read its own result. A deploy
with nothing to upload prints no such line at all; it prints
`No updated asset files to upload`, which is the zero. The harness reads both
forms, and the machine-readable record is in `measurement.json`.

**Two clocks are recorded.** The harness's own wall time includes Node
start-up and the wrangler CLI boot. Wrangler reports the deploy itself
(`Uploaded meridian-spike-s5 (21.03 sec)`), which excludes that boot. The
deploy's own number is the one a CI budget should be written against.

---

## Observed

### Run A — 506 asset files

| Deploy | Assets uploaded | Harness wall | Wrangler's own time | Upload phase |
|---|---|---|---|---|
| 1 (cold) | **506 of 506** | 34,994 ms | 21.03 s | 11.88 s |
| 2 (nothing changed) | **0 of 506** | 15,741 ms | 9.22 s | none |
| 3 (nothing changed) | **0 of 506** | 14,388 ms | 8.99 s | none |

Deploy 2 printed, verbatim:

> 🌀 Building list of assets...
> ✨ Read 510 files from the assets directory
> 🌀 Starting asset upload...
> 🌀 **No updated asset files to upload. Proceeding with deployment...**

Deploy 1 printed the inverse, and named the whole set:

> 🌀 Found 506 new or modified static assets to upload. Proceeding with upload...
> ✨ Success! Uploaded 506 files (11.88 sec)

### Run B — 5,006 asset files

| Deploy | Assets uploaded | Harness wall | Wrangler's own time | Upload phase |
|---|---|---|---|---|
| 1 (4,500 new, 506 unchanged) | **4,500 of 5,006** | 59,937 ms | 51.14 s | 19.16 s |
| 2 (nothing changed) | **0 of 5,006** | 43,348 ms | 34.98 s | none |
| 3 (nothing changed) | **0 of 5,006** | 37,031 ms | 29.12 s | none |

Deploy 1 of run B names the diff explicitly:

> ✨ Success! Uploaded 4500 files (**506 already uploaded**) (19.16 sec)

So wrangler read the previous deployment's manifest, recognised the 506 files
it already had, and uploaded only the 4,500 that were new.

### The two scale points, differenced

| Path | 506 files | 5,006 files |
|---|---|---|
| A deploy with nothing to upload | 9.22 s / 8.99 s | 34.98 s / 29.12 s |

A diffing deploy is **not** free, and its cost grows with the file count
because every file still has to be read and hashed to build the manifest.
Taking the two points:

- **Fixed cost** (CLI boot, API round trips, the worker script, the manifest
  itself): roughly **6–7 seconds**.
- **Marginal cost per file** of the manifest and hash pass: roughly
  **5 milliseconds**.

The two observations at 5,006 files differ by six seconds, so the
per-file figure is approximate. The fixed cost is the sturdier of the two
numbers, because it is the smaller and the difference between them is within
the run-to-run spread.

### The upload path is cheaper per file than the manifest path

Run B's cold deploy uploaded 4,500 new files in 19.16 s — about **4.3 ms per
new file**. Run A's cold deploy uploaded 506 files in 11.88 s, which is
23.5 ms per file; that figure includes the per-batch setup that a 506-file
set pays in full and a 4,500-file set amortises. **The upload path is
therefore not the expensive part. The manifest pass is.**

---

## Decision

**Wrangler diffs the asset manifest. The second and third deploys uploaded
zero files, at both scale points. The threshold is not met: the deploy step
does not have to be budgeted at full size, and the shard count can grow.**

The evidence is not an inference from a fast deploy. It is a **count**: 506
of 506 uploaded on the first deploy, 0 of 506 on the second and third; 4,500
of 5,006 on the first deploy of the second run, and 0 of 5,006 on the second
and third. Wrangler says so in its own words — `No updated asset files to
upload`, and `506 already uploaded`.

**The delivery model does not change.** ADR 0001's eight-shard model is
confirmed rather than overturned: eight deploys per build cost eight
manifest passes, not eight full uploads.

### The deploy-step budget that feeds OPS-07

OPS-07 fails the build rather than deploying when a file count or a build
duration exceeds budget. This measurement supplies the deploy half of that
budget, in the form of a formula rather than a single number, because the
file count is the thing that varies:

> **one shard's deploy ≈ 6–7 s of fixed cost + (that shard's file count ×
> ~5 ms), plus the upload of whatever changed (~4 ms per changed file).**

Two worked readings, with the inputs labelled:

| Case | Files in the shard | Deploy, from the measured formula | Eight shards, sequentially |
|---|---|---|---|
| A shard near the per-project file allowance | the full allowance | ≈ 1 min 45 s | ≈ 14 min |
| A shard at the static tier's projected year-one size | a few hundred | ≈ 8–9 s | ≈ 70 s |

The first row is the worst case, and it is the case the delivery model
already avoids: story pages are not in the static tier, so the static tier
never reaches the per-project file allowance. The second row is the realistic
one, and it puts the whole eight-shard deploy step at about a minute.

**This budget is a floor, not a ceiling, and it has to be re-measured on the
CI runner.** The numbers above come from a Windows workstation with Node's
file I/O; a Linux runner with a different filesystem will differ, probably
favourably, and the project should not budget against the slower of the two
without saying so.

### What this calibrates for Phase 5 and Phase 7

- **Deploys are cheap; the manifest pass is the cost.** The optimisation to
  make, if deploys ever became the bottleneck, is to reduce the number of
  files in a shard — not to change the upload strategy, which is already
  doing the right thing.
- **The shard count is not the constraint it was feared to be.** Eight shards
  pay eight manifest passes, and the per-project file allowance is what
  forces the split. Nothing here argues for collapsing the shards back into
  one project.
- **The story tier's move to R2 is what keeps the static tier small**, and
  this measurement is the second reason it matters: a smaller static tier is
  a cheaper manifest pass on every one of the eight deploys.

---

## What this does NOT settle

- **The measurement was taken on a Windows workstation, not on the Linux CI
  runner.** Both the fixed cost and the per-file cost are I/O-bound and will
  differ there. Phase 5 must re-measure before the budget is fixed.
- **The asset payloads are tiny.** Every probe file is a few bytes. Real
  story pages carry markup, and real sites carry fonts and images, so the
  per-file upload cost measured here is a floor. The *manifest* cost, which
  is the one that dominates, does not depend on payload size.
- **The largest measured set is a few thousand files, not a full shard's
  worth.** The per-file figure is extrapolated from two points; a shard at
  the per-project file allowance was not deployed.
- **Only the asset path was measured.** The worker script's own upload is in
  every deploy's fixed cost, but an assets-only project has almost no script,
  so the edge Worker's script — which is real code and a real bundle — was
  not measured.
- **Nothing was measured about the rate limits.** No deploy came close to
  one, so the upload rate limit was never exercised and no headroom against
  it can be claimed.
- **The R2 story tier was not measured at all.** The story tier's upload
  path is a different API with different behaviour, and it is a much larger
  part of a build than the static tier is.

---

## Notes

- The spike project is `meridian-spike-s5`. It was deployed three times in
  the first run and three times in the second, each replacing the previous
  version of a single project. Delete it after the measurement.
- The generated scale set is removed by the harness in a `finally` block, so
  a failed run does not leave five thousand files behind. It is gitignored
  as well, so it cannot be committed by accident.
- `Total Upload: 0.31 KiB / gzip: 0.22 KiB` appears on every deploy,
  including the ones that uploaded no assets at all. It is the size of the
  worker script, not of the assets, and it is not an asset-volume metric.
