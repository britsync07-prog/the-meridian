# S-5 — the raw measurement record

Every row below was read out of wrangler's own deploy output by
`measure.mjs`. The analysis is in `RESULT.md`.

## Run 1 — 506 asset files

| Deploy | Assets uploaded | Harness wall (ms) | Wrangler's own time (s) |
|---|---|---|---|
| 1 | 506 of 506 | 34994 | 21.03 |
| 2 | 0 of 506 | 15741 | 9.22 |
| 3 | 0 of 506 | 14388 | 8.99 |

Full re-upload on the second deploy: **NO**

## Run 2 — 5006 asset files

| Deploy | Assets uploaded | Harness wall (ms) | Wrangler's own time (s) |
|---|---|---|---|
| 1 | 4500 of 5006 | 59937 | 51.14 |
| 2 | 0 of 5006 | 43348 | 34.98 |
| 3 | 0 of 5006 | 37031 | 29.12 |

Full re-upload on the second deploy: **NO**
