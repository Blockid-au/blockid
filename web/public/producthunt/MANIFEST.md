# ProductHunt gallery — capture manifest (S10-B)

Captured 2026-09-11 against `http://127.0.0.1:4001` (production build, git `020975296`)
with `web/scripts/producthunt-capture.mjs`: Playwright Chromium, viewport 1440×900,
light theme, `prefers-reduced-motion: reduce`, `document.fonts.ready` + network idle
(3 s cap), analytics consent banner rejected/hidden, sticky trial CTA hidden, then the
top 1440×862 cropped and resized to 1270×760 with `sharp` (palette PNG, quality 90).
No auth session, no URL bar — page content only.

| File | Route | Captured (UTC) | Dimensions | Bytes | Shows |
|---|---|---|---|---|---|
| `gallery-01-home.png` | `/?hero=F1` | 2026-09-11T07:55:48Z | 1270×760 | 98,938 | F1 hero ("See your startup the way an investor will…"), omnibox with Upload/Analyse, Free / A$3 / A$29 tiles, "A recent run" 58/100 score card |
| `gallery-02-funding.png` | `/funding` | 2026-09-11T07:55:50Z | 1270×760 | 66,345 | "Do you need money?" hero with the live A$67M total, 127 programs, "Match me" + "Browse open grants" CTAs, top of the three-question preview |
| `gallery-03-funding-report-demo.png` | `/funding/report/demo` | 2026-09-11T07:55:52Z | 1270×760 | 54,872 | Sample Money Finder report: "Sample report — a real one is built from your answers" banner + "Build mine for A$3", 16 grants / 31 programs, next-3 actions, first ranked grant |
| `gallery-04-pricing.png` | `/pricing?segment=evaluator` (scrolled to plan cards) | 2026-09-11T07:55:54Z | 1270×760 | 80,151 | Evaluator tab: Scout A$79 / Firm A$149 / Program A$349 cards, monthly/annual switch, 7-day trial buttons |
| `gallery-05-compare-chatgpt.png` | `/compare/chatgpt` (scrolled to table) | 2026-09-11T07:55:56Z | 1270×760 | 79,603 | "Nine things that decide whether an evaluation holds up" — BlockID vs ChatGPT vs independent valuer table (7 of 9 rows fit at 760 px) |
| `gallery-06-program-sydney.png` | `/funding/programs/sydney` | 2026-09-11T07:55:58Z | 1270×760 | 71,861 | Free directory: 37 Sydney accelerators/incubators, city chips, "Next twelve months" intake calendar |
| `thumb-240.png` | — (composed) | 2026-09-11 | 240×240 | 16,273 | Octagon-spark brand mark (`images/logo-icon-light.png`) centred on brand navy `#1B2A5E` |

## Substitutions and notes

- **#3** — the kit/README listed `/funding/grants` because "no demo funding report exists"; `/funding/report/demo` now exists (200, "Sample startup funding report") and was captured instead, with the sample banner visible. File name `gallery-03-funding-report-demo.png` replaces the README's `gallery-03-grants.png`.
- **#6** — `/workspace/evaluations` is auth-gated (307 → `/auth/login`) and no seeded evaluator session was available, so `/funding/programs/sydney` (public program directory) was captured as the sixth/spare image: `gallery-06-program-sydney.png` replaces `gallery-06-evaluations.png`.
- **Thumbnail** — the kit describes "the B mark"; no such asset exists in `web/public/`. The real brand mark used in the nav is the octagon-spark, so `thumb-240.png` uses that on brand navy. File name follows the README (`thumb-240.png`).
- **#4 / #5** are scrolled captures (not the top of the page) so the plan cards / comparison table are in frame; the nav header is therefore not visible in those two.
- No cookie/consent UI, dev overlays, emails, tokens or real founder names appear in any image; all routes are public marketing pages.
- Re-capture: `cd web && node scripts/producthunt-capture.mjs` (refuses any `blockid.au` base URL).
