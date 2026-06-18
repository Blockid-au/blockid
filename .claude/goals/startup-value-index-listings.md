# Goal: Startup Value Index Listings — the "Markets" view of startupvalueindex.com

> **Created:** 2026-06-18 · **Owner:** CEO · **Status:** in_progress · **Target ship:** v2.15 / 2026-06-19

## Why this exists

v2.14 shipped the BSI-AU index hero + sector heatmap + top movers — investing.com's homepage. The next layer is investing.com's "Markets" tab: a full ranked listing of every tradable instrument with current value, change %, sparkline, and a click-through to the detail page.

For BlockID, that translates to:
- **Listing exchange**: every startup BlockID has analysed, ranked by SVI
- **Per-startup tickers**: anonymous by default, opt-in public name
- **Detail pages**: SVI history chart, blended valuation, phase, sector, accelerator readiness, growth curve
- **Live update**: re-running SVI moves the rank, updates the sparkline

This positions BlockID as the de-facto exchange for AU startup valuation — Crunchbase is static (rounds), PitchBook is paywalled, AngelList is a feed. None of them publish a rolling, source-cited valuation index per company.

## Information architecture

```
startupvalueindex.com
├── /index          ← v2.14 hero (BSI-AU, heatmap, top movers)
├── /index/listings ← v2.15 RANKED TABLE (the "Markets" view)
│      Table columns: rank · ticker · sector · stage · SVI · 7d Δ · valuation · sparkline · link
│      Sort: SVI desc (default) · 7d Δ desc · valuation desc · stage · sector
│      Filter: sector · stage · "show only public" · "show only revenue-bearing"
│      Pagination: 50 per page · server-side
└── /index/listings/[ticker]  ← v2.15 DETAIL PAGE per startup
       Hero: ticker · public-name-if-consent · current SVI · valuation · phase chip
       SVI HISTORY CHART: line chart over last 90 days (one analysis = one point)
       SCN snapshot: stage · sector · maturity
       ANTLER SIGNALS strip: 5-signal radar mini
       ACCELERATOR READINESS: heatmap mini
       VALUATION COMPONENTS: 4-lens table from deep valuation
       INVESTOR CONTACT: link to /s/[slug] for the full report
       UPDATE BANNER: "Last updated: 2 hours ago · n analyses this month"
```

## Data sources

All in existing tables — no new schema.

| Source | What we pull |
|---|---|
| `svi_analyses` | history (per email hash → ticker), total_svi, analysis_json (sector, stage, deepValuation, antlerSignals, acceleratorReadiness) |
| `founder_profiles` | `public_visible` toggle, full_name (when consent) |
| `svi_accounts` | startup_name (when set) |

Ticker scheme remains: `<SECTOR>-<slug-tail-3>` from the LATEST analysis per identity hash. When the same identity submits a new analysis (improved info), the ticker keeps the SECTOR prefix but the slug-tail updates to the newest analysis.

## Deliverables (v2.15)

1. **`lib/startup-index-listings.ts`** — aggregator returning:
   - `computeListings({ filter, sort, page, pageSize })` → `{ rows, total, page, totalPages }`
   - Each row: `ticker, slug, sector, stage, stageLabel, svi, deltaWeek, valuationAud, sparkline, publicName?, lastAnalysisAt`
   - `computeListingDetail(ticker)` → full detail incl. SVI history (last 90 days, daily resolution), Antler signals snapshot, accelerator readiness summary, deep valuation perspectives, public_visible flag
   - Anonymous-by-default: only surface `publicName` when founder profile has `public_visible: true`

2. **`/api/index/listings`** — paginated GET with query params:
   - `?sort=svi|delta|valuation|stage&order=desc|asc`
   - `?sector=saas|fintech|…|all`
   - `?stage=0..7|all`
   - `?public_only=true|false`
   - `?revenue_only=true|false`
   - `?page=1&pageSize=50`
   - Cached 5 min stale-while-revalidate 10

3. **`/api/index/listing/[ticker]`** — GET for detail page

4. **`/index/listings` page** (Beta) — investing.com Markets aesthetic:
   - Filter bar (sector / stage / public-only / revenue-only)
   - Sortable column headers
   - Sparkline column (SVG, 7-day)
   - Pagination footer
   - "Updated XX ago" stamp
   - Citation snippet at footer

5. **`/index/listings/[ticker]` page** (Beta):
   - Hero: ticker + (optionally) public name + SVI value + delta + valuation + sector/stage chips
   - 90-day SVI history chart (SVG line chart, daily aggregation)
   - Stage timeline pill
   - Antler signals 5-bar mini
   - Accelerator readiness 8-source mini-heatmap
   - 4-lens valuation summary
   - "Read full report" CTA → `/s/[slug]` if public, else investor contact form
   - Methodology + citation

6. **Cross-link** from v2.14 `/index` hero: add a "View all N listings →" button to the BSI-AU stats row

## C-Level assignment

- **CDO**: aggregator logic + sparkline math + identity-hash → ticker mapping
- **CTO**: API routes + caching + pagination
- **CPO**: investing.com Markets-style table layout + detail-page IA
- **CFO**: valuation column display + 4-lens summary on detail page
- **CMO**: page copy + citation snippet for the listings index
- **CRO**: A/B test "View all listings" button placement on /index
- **CLO**: privacy review — confirm anonymous-by-default is enforced everywhere
- **CISO**: confirm ticker scheme + sparkline math doesn't leak PII
- **IR**: outreach plan to AU VCs — invite them to bookmark the Markets view

## Success criteria (v2.15)

- `/index/listings` shows every analysis-bearing identity hash, ranked by SVI desc
- Anonymous tickers everywhere; public names ONLY when `founder_profiles.public_visible = true`
- Detail page renders a real SVI history chart with ≥2 data points when available
- Pagination + filter + sort all server-side
- Mobile-responsive — usable on a phone
- All v2.14 surfaces still work (BSI-AU hero unaffected)
- API cached 5 minutes

## Anti-patterns

- **Don't** show company names without explicit `public_visible = true` opt-in
- **Don't** fake history — if a startup has 1 analysis, show 1 data point, don't extrapolate
- **Don't** publish individual valuations >A$1B without manual review (cap until vetted)
- **Don't** mix Phase 2 features in (investor messaging, watchlist, alerts) — ship the ranked table + detail page only

## Phase 2 (after v2.15 ships)

- Watchlist (signed-in users save tickers)
- Email alerts on SVI movement
- Investor outreach CRM (paid feature)
- Public API tier (rate-limited) for journalists
- Sector-deep-dive pages (`/index/sector/saas`)
- Embeddable "BSI-AU widget" for partner sites
