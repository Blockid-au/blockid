# ProductHunt assets — naming and capture

Target folder for the media-studio step of the launch kit
(`docs/marketing/traction-kit-2026-09/producthunt-launch-kit.md` §5).
Nothing in this folder is referenced by the app; it exists so the files have
one home and one naming scheme before the listing is built. Commit PNGs as
soon as they are captured (the autonomous `git reset --hard` loop discards
uncommitted files).

## Files

| File | Size | Source | Notes |
|---|---|---|---|
| `thumb-240.png` | 240×240, PNG, static | octagon-spark mark (`images/logo-icon-light.png`) on brand navy `#1B2A5E` | ProductHunt thumbnail; no animation |
| `gallery-01-home.png` | 1270×760 | `/?hero=F1` | F1 hero + omnibox |
| `gallery-02-funding.png` | 1270×760 | `/funding` | "Do you need money?" hero; the A$ total is live — do not overwrite it |
| `gallery-03-funding-report-demo.png` | 1270×760 | `/funding/report/demo` | public sample Money Finder report with the "Sample report" banner (replaces the earlier `/funding/grants` plan) |
| `gallery-04-pricing.png` | 1270×760 | `/pricing` (Evaluator tab) | Scout A$79 / Firm A$149 / Program A$349 visible |
| `gallery-05-compare-chatgpt.png` | 1270×760 | `/compare/chatgpt` | nine-row table |
| `gallery-06-program-sydney.png` | 1270×760 | `/funding/programs/sydney` | spare / sixth image — stands in for `/workspace/evaluations`, which is auth-gated (needs a seeded evaluator session) |
| `video-60s.mp4` (optional) | 1920×1080, ≤ 60 s | media-studio screen recording of one free run → report | captions only, no voice-over |

Ship five of the six gallery images; keep the sixth as the spare.

Captured files and per-image notes: see `MANIFEST.md`. Direct route capture:
`cd web && node scripts/producthunt-capture.mjs` (Playwright + sharp, crops to 1270×760).

## Capture

Run against **`http://localhost:4001`** — the driver refuses `blockid.au`
(production sits behind nginx on 4001; see the `screenshot-tour` skill).

```bash
cd web
npm run tour:capture -- --tour=<tour-id> --baseUrl=http://localhost:4001
```

The driver captures at 1440×900 and the app-registry normaliser drops per-step
`viewport`, so crop to the ProductHunt size afterwards:

```bash
convert web/public/tour/<tour-id>/step-<n>.png \
  -resize 1270x -gravity north -crop 1270x760+0+0 +repage \
  web/public/producthunt/gallery-0<n>-<slug>.png
```

Blur any real founder or startup name with the step's `mask` selectors before
shipping. Never capture from production.
