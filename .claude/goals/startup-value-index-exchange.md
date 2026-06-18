# Goal: Startup Value Index Exchange (startupvalueindex.com)

> **Created:** 2026-06-18 · **Owner:** CEO · **Status:** in_progress · **Target ship:** v2.14 / 2026-06-19

## Why this exists

Investing.com works because it makes the abstract (stock prices) feel concrete: live numbers, color-coded deltas, sparklines, sector heatmaps, top movers. Founders and investors don't have an equivalent for *startup* valuation — Crunchbase is static, PitchBook is paywalled, and AngelList is a feed.

BlockID already runs the SVI engine on every founder who submits an analysis. We have the data to make startup valuation feel like an exchange. **startupvalueindex.com is BlockID's discovery + brand layer** — separate from the founder dashboard, public-facing, designed to make AU startup valuation discoverable.

Done right, this becomes the entry point for two cohorts:
1. **Founders** browsing peers → "where do I sit?" → land on the SVI tool
2. **Investors / accelerators / journalists** tracking the AU market → cite our indices

## Information architecture (copy investing.com)

```
─────────────────────────────────────────────────────────
HERO ROW — BSI-AU index banner (like Dow Jones / S&P 500)
  • BSI-AU value (median SVI across cohort)
  • Δ vs yesterday + 7-day sparkline
  • # companies tracked · total valuation under coverage
─────────────────────────────────────────────────────────
SECTOR HEATMAP — 7 sector indices, color by 7d delta
  SaaS · Fintech · AI · Healthtech · Marketplace · Deeptech · eCommerce
─────────────────────────────────────────────────────────
TOP MOVERS — 5 winners + 5 losers (SVI delta over 7 days)
  Anonymous ticker + sector + score + delta
─────────────────────────────────────────────────────────
STAGE INDICES — Pre-seed / Seed / Series A / Growth
  Median SVI + cohort size per band
─────────────────────────────────────────────────────────
LIVE COUNTERS — Analyses run today · Sectors active ·
                Largest single-startup valuation under coverage
─────────────────────────────────────────────────────────
EXPLAINER ROW — How the index works (methodology link)
                + CTA to /score
─────────────────────────────────────────────────────────
FOOTER — Updated XX:XX UTC · Cite as "BSI-AU 2026-06-18"
```

## Data model

All data is aggregated server-side from existing tables — no new schema required.

| Source field | Aggregation |
|---|---|
| `svi_analyses.total_svi` | BSI-AU = median over last 90d |
| `svi_analyses.analysis_json.sector` | Sector indices = median per sector |
| `svi_analyses.analysis_json.stage` | Stage indices = median per stage |
| `svi_analyses.analysis_json.deepValuation.blendedValuation.midAud` | Total valuation under coverage = sum |
| `svi_analyses.email` (hashed) + `total_svi` window | Top movers = biggest WoW Δ per identity hash |

Anonymous ticker scheme: `<SECTOR>-<slug-tail-3>` (e.g. `SAAS-w4D`).
Ticker links to `/s/[slug]` when public; otherwise resolves to `/score?ref=ticker-{xxx}`.

## Deliverables (v2.14)

1. **`lib/startup-index-aggregator.ts`** — pure-data layer:
   - `computeBsiAu(windowDays)` → `{ value, deltaDay, deltaWeek, sparkline7d, totalCompanies, totalCoverageAud }`
   - `computeSectorIndices(windowDays)` → `Array<{ sector, label, value, deltaWeek, count }>`
   - `computeStageIndices(windowDays)` → `Array<{ stage, label, value, count }>`
   - `computeTopMovers(windowDays)` → `Array<{ ticker, slug, sector, svi, deltaWeek }>`

2. **`/api/index/headlines`** — GET-only public endpoint returning the full snapshot. Cached 5 min.

3. **`/index` page redesigned** (the file already exists, gut + rebuild):
   - Hero with BSI-AU + sparkline
   - 7-sector heatmap (Tailwind grid, color from `deltaWeek`)
   - Top movers table (winners left, losers right)
   - Stage indices strip
   - Live counters row
   - Methodology accordion at the bottom

4. **No new sidebar item** — `/index` is a public surface, not a dashboard route.

5. **Server-rendered** for SEO + open graph. Daily SSR is fine; we don't need real-time.

6. **Citation snippet** at the bottom: `BSI-AU as of {date}: {value} (n={count} companies)` — copy-paste ready for journalists.

## C-Level assignment (per CEO routine)

- **CDO**: owns the aggregation logic + index math (median vs mean choice, outlier trimming).
- **CMO**: writes the public methodology page + "as cited by" footer.
- **CTO**: builds the API route + page + caches.
- **CPO**: designs the layout per the IA above + responsive grid.
- **CFO**: verifies the "total valuation under coverage" sum methodology + outlier capping.
- **CRO**: A/B test the hero CTA placement (above vs below sector heatmap).
- **CLO**: review citation language for legal accuracy.
- **CISO**: confirm ticker scheme doesn't expose PII.
- **IR**: pitch indices to AU VCs (Cut Through Venture, AVCAL newsletter).

## Success criteria (definition of done for v2.14)

- Page loads `<400ms` p95 from production
- Sparklines + heatmap render correctly on mobile (responsive)
- Methodology citation copy-paste ready
- All numbers must come from real `svi_analyses` rows — no placeholders
- nginx routing `startupvalueindex.com → /index` already shipped in v2.4 (T0212)
- Beta tag on the brand banner — this is shipping, expect iteration
- `/api/index/headlines` returns sample JSON for journalists to embed

## Anti-patterns

- Don't fake any number — if a sector has < 5 companies, hide it (or label "n<5")
- Don't expose company names without consent — anonymous tickers only
- Don't promise real-time — daily SSR is enough; over-promising is worse than under
- Don't over-style the hero — investing.com works because numbers are huge and bare

## Phase 2 (after first ship)

- Sector detail pages: `/index/sector/saas` with per-sector top 20 + methodology
- "Compare against the index" widget embeddable on founder share pages
- Daily Telegram post auto-generated from BSI-AU snapshot
- Newsletter-grade weekly digest email
