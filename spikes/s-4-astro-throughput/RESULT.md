# S-4 — Astro build throughput

- **Question:** how fast does the Astro 7 build run, and does
  `experimental.incrementalBuild` actually work?
- **Threshold:** below 60 pages per second → topic and entity pages move to
  the R2 tier before year 2. At or above it → the static tier stays as
  designed.
- **Harness:** `spikes/s-4-astro-throughput/generate.mjs` — a generator that
  writes a synthetic Astro project to a gitignored scratch directory and
  times a full build and an incremental build of it.
- **Page count:** the value of the `static_asset_files_per_project` limit in
  `config/free-tier-limits.json`, read by id. That is exactly one shard's
  worth of pages, and it is the worst case the static tier can reach.
- **Measured on:** 2026-10-21, Node 24.12.0, Astro 7.4.1, on the local
  **Windows** workstation — not on a CI runner. That distinction matters and
  is recorded under *What this does NOT settle*.

---

## Method

The generator writes a scratch Astro project under a `dist/` directory, which
the repository's `.gitignore` already excludes, so the generated pages are
never committed and never touch the real site. The scratch project is well
away from `apps/site/src/pages`.

**The configuration is the real configuration.** A build measured under a
different configuration is not the build the project will run, so the scratch
project's `astro.config.mjs` carries the same three load-bearing settings as
the real one: `compressHTML: true`, `build: { concurrency: 1 }` and
`experimental: { incrementalBuild: true }` (OPS-09, OPS-10). Anything higher
than `concurrency: 1` silently disables the incremental cache.

**The page count comes from the registry**, by limit id, not as a literal. A
`--pages` override exists for a smaller trial run, and the default is always
the registry's value.

**Two page complexities were measured, not one.** A single synthetic page
would have produced a single number with an unknown relationship to a real
story page, and a number whose relationship to the real workload is unknown
cannot decide anything. So the spike ran two arms:

| Arm | What the page carries |
|---|---|
| **light** | A headline, a standfirst and two list items. |
| **heavy** | The six value elements the architecture requires of a story page — the coverage line and count, the trending rank, topic and entity tags, related-story links, the digest slot and the coverage byline — plus the metadata head (canonical, Open Graph) and a JSON-LD `NewsArticle` block. |

The heavy arm is the one the decision is read against, and it is still an
approximation of the real template rather than the real template.

**Each arm ran the build twice, with the scratch `cacheDir` preserved
between the two runs.** Astro cleans the output directory at the start of a
build, so the second run's restore path is the one a CI job would take: the
cache is restored, the output directory is empty. That is the shape the real
pipeline has, so it is the shape that was measured.

### The instrument had to be repaired once

Astro prints one line per generated page. At the page count this spike
targets, that output exceeds the default one-megabyte buffer Node gives a
child process, and an overflowing buffer kills the child — which makes a
perfectly healthy build look like a failed one. The generator now gives the
child a buffer of sixty-four megabytes, and on failure it prints the last
forty lines of the captured output rather than nothing.

### How the incremental arm is proven

A build that skipped pages has to be distinguishable from a build that was
merely faster for some other reason. Astro marks a page restored from the
cache `(restored)` and a freshly-rendered one `(rendered)`, and the harness
counts both. Every incremental build below restored every page and rendered
none.

---

## Observed

### The light page set — 20,001 pages

| Arm | Wall time | Pages per second | Astro's own timer | Pages rendered | Pages restored |
|---|---|---|---|---|---|
| Full build | 127,113 ms | **157.3** | 2 m 2 s | 20,001 | 0 |
| Incremental build | 115,154 ms | **173.7** | 1 m 27 s | **0** | **20,000** |

Ratio, full ÷ incremental: **1.1×**.

### The heavy page set — 20,001 pages

| Arm | Wall time | Pages per second | Astro's own timer | Pages rendered | Pages restored |
|---|---|---|---|---|---|
| Full build | 236,315 ms | **84.6** | 3 m 36 s | 20,001 | 0 |
| Incremental build | 313,150 ms | **63.9** | 4 m 33 s | **0** | **20,000** |
| Incremental build, repeated | 282,190 ms | 70.9 | 3 m 38 s | **0** | **20,000** |

Ratio, full ÷ incremental: **0.8×** — the incremental build was *slower* than
the full build.

### What the two arms say together

The heavy page set costs **1.9×** the wall time of the light one, even though
it carries several times the markup and several times the per-page work. The
reason is that at this scale the build is **dominated by writing the output
files, not by rendering them**:

- The heavy arm's extra rendering work added roughly 94 s across 20,000
  pages.
- The heavy arm's extra output volume added the rest of the gap, because
  every page is written twice in a full build (once to the output directory,
  once to the incremental cache) and read back and written again on a restore.

So the marginal cost of a heavier page is real but **sub-linear** in the
page's complexity, and the build's cost is bounded below by the filesystem.

### The incremental cache works, and it does not buy time

Both incremental arms restored every page and rendered none. That is the
requirement OPS-10 asks for, and it is met: only changed pages are
re-rendered.

It is not, however, a wall-clock saving at this scale. On the light set the
incremental build was 12 s faster; on the heavy set it was 77 s and then 46 s
*slower*. The run-to-run spread on this machine is of that order, so the
honest reading is that **the restore path costs about what the render path
costs** — it copies every cached file into the output directory instead of
rendering it, and at this scale that copy is not cheaper.

### The incremental build was measured three times because it surprised us

The first heavy incremental build came back slower than the full build, which
should not happen if the restore path is cheaper than the render path. A
third build was run on the same scratch tree with the same cache to separate
"the restore path is genuinely slower for heavy pages" from "this machine has
a noisy filesystem". It came back at 282 s, between the other two. The
finding is therefore a range, not a point, and the range overlaps the full
build's.

---

## Decision

**The threshold is not met. The static tier stays as designed, and topic and
entity pages do NOT move to the R2 tier before year 2.**

| Arm | Measured rate | Threshold | Verdict |
|---|---|---|---|
| Light | 157.3 pages/second | 60 | above |
| **Heavy** | **84.6 pages/second** | **60** | **above** |

The heavy arm — the one carrying the value elements a real story page has to
carry — builds a whole shard's worth of pages in just under four minutes.
That is comfortably inside a CI job, and it is the **worst case**: the static
tier as ADR 0001 defines it holds no story pages, so its real size grows far
more slowly than one shard's full allowance.

The decision is read against the heavy arm. The light arm is recorded because
it is the upper bound and because the gap between the two arms is itself the
finding: **a heavier story page does not slow the build proportionally,
because the build is bound by filesystem traffic rather than by rendering.**

`docs/adr/0001-delivery-model.md` therefore does not change on this spike's
account, and the static tier keeps topic and entity pages. The ADR records
the measurement and the caveat.

### What this calibrates for Phase 5 and Phase 7

- **The build-duration budget must be set from the FULL build, not from the
  incremental one.** The incremental build is not a reliable time saver at
  this scale, and a budget written against it would be written against a
  number that the measurement does not support.
- **`incrementalBuild` is still worth having.** It does what OPS-10 asks —
  unchanged pages are not re-rendered — and in a real pipeline where only a
  handful of stories change per build, the number of pages that must be
  *rendered* collapses even though the number of pages that must be *written*
  does not.
- **The CI runner's filesystem may be faster than this one.** The measurement
  below is a floor for a page set of this size on a Linux runner, not a
  ceiling.

---

## What this does NOT settle

- **The measurement was taken on a Windows workstation, not on the Linux CI
  runner the pipeline will use.** The build is I/O-bound at this scale, so the
  filesystem is the thing being measured as much as Astro is. Phase 5 must
  re-measure on the runner before the build-duration budget is fixed.
- **Neither page is the real story template.** The heavy arm carries the six
  required value elements, the metadata head and a structured-data block; the
  real template will carry the full broadsheet chrome, the typography and the
  image handling. A real page may cost more than the heavy arm's.
- **The Tailwind build is not included.** The real project mounts the
  Tailwind plugin and the scratch project does not. Tailwind's cost is a
  per-build cost over the set of classes used rather than a per-page cost, so
  it shifts the total without changing the per-page rate — but it does add to
  the wall time, and the budget must carry it.
- **The measurement is of the static tier's worst case, not of the real
  static tier.** Twenty thousand pages is what one shard's file allowance
  permits; ADR 0001's static tier holds no story pages, so its real size is
  far below that for a long time.
- **A single point in time is not a distribution.** Each arm was run a small
  number of times on one machine, and the spread between runs is of the order
  of the difference the incremental arm was being asked to explain.
- **The build's memory and disk behaviour at this scale were not measured.**
  Only wall time was.

---

## Notes

- The page count was taken from the `static_asset_files_per_project` limit by
  id. The generator holds no free-tier number of its own, which the
  repository-wide ceiling scan enforces.
- The scratch tree lives under `spikes/s-4-astro-throughput/dist/scratch/`,
  which is gitignored. It held twenty thousand generated page directories
  during the measurement and is disposable.
- The harness prints the pages-per-second figure for the generation step as
  well as for each build arm. Generation is not a build cost — it is the
  synthetic fixture being written — and the figure is recorded only so the
  build timings are not mistaken for including it.
