# CDO Plan: GA4 → In-App Daily Dashboard

Owner: CDO agent
Date: 2026-07-24
Area: Analytics / Growth Intelligence

## Problem

- GA4 (gtag.js) is initialised client-side via `web/src/components/analytics/google-analytics.tsx` (`NEXT_PUBLIC_GA_MEASUREMENT_ID`) — events flow *to* Google, but nothing flows back into the app.
- `web/src/app/admin/growth/page.tsx` renders funnel + AI recs from `growth_insights` (Supabase view), but the "GA4 Dashboard" quick action just external-links to analytics.google.com.
- Founders need traffic tiles (sessions, users, top pages, top events, conversions, source/medium) rendered inside `/admin/growth` without leaving the app.
- `googleapis` is already installed; a service-account JSON in env unlocks the GA4 Data API.

## Solution — Pull-Snapshot Architecture

1. **Nightly cron** hits GA4 Data API for *yesterday* + 7-day trend, writes rows to `web/content/reports/ga4-daily.jsonl` (append-only, one JSON per line).
2. **`/admin/growth`** page renders a new `<GA4DailyTiles/>` **RSC** section that reads the JSONL at request time (SSR, `force-dynamic` already set).
3. **`POST /api/admin/ga4-refresh`** (admin-gated) triggers an on-demand pull (used by a Refresh button next to the existing one).
4. **Graceful degradation**: when `GA4_PROPERTY_ID` / `GOOGLE_APPLICATION_CREDENTIALS_JSON` are absent, tiles render placeholder cards with a "GA4 API not configured" hint plus a link to the env-setup section of the runbook. No crash.

Why JSONL (not Supabase table): matches the pattern already used by other daily reports in `web/content/reports/*.jsonl` (deploy-log, cron-health, reseller-monitor, guardian-history…). Cheap, git-tracked, replay-safe, no migration required.

## Data model — `ga4-daily.jsonl`

Each line = one snapshot:

```json
{
  "captured_at": "2026-07-24T14:00:00.000Z",
  "date": "2026-07-23",
  "range_days": 1,
  "property_id": "properties/xxx",
  "totals": {
    "sessions": 1234,
    "activeUsers": 987,
    "newUsers": 300,
    "screenPageViews": 4321,
    "conversions": 42,
    "engagementRate": 0.61,
    "averageSessionDuration": 92.3
  },
  "topPages": [{ "path": "/svi", "sessions": 340, "views": 512 }, ...],
  "topEvents": [{ "name": "svi_start", "count": 210 }, ...],
  "sourceMedium": [{ "source": "google", "medium": "organic", "sessions": 540 }, ...],
  "trend7d": [
    { "date": "2026-07-17", "sessions": 800, "users": 610, "conversions": 22 },
    ...
  ]
}
```

Reader picks the **latest line** for today's tiles, uses `trend7d` for sparklines.

## Files to change

### `web/src/app/admin/growth/page.tsx`
Add a new section between "Live Stats Bar" and "AI Growth Recommendations":

```tsx
<GA4DailyTiles />
```

- Import: `import { GA4DailyTiles } from "@/components/admin/ga4-daily-tiles";`
- Update the "GA4 Dashboard" quick-action card to scroll to `#ga4-tiles` instead of external-linking (keep external link as secondary "Open GA4 →").
- Add small `<Ga4RefreshButton />` client component next to existing `RefreshButton` — POSTs to `/api/admin/ga4-refresh`, then `router.refresh()`.

## New files

### 1. `web/src/lib/ga4/data-api-client.ts`
- Uses `googleapis` (`analyticsdata_v1beta`) — `googleapis` is already a dep, no new install.
- Auth via `google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!), scopes: ["https://www.googleapis.com/auth/analytics.readonly"] })`.
- Exports:
  - `isGa4Configured(): boolean` — env check helper (used by tiles for fallback).
  - `getGa4PropertyId(): string | null`.
  - `runReport(params): Promise<...>` — thin wrapper around `analyticsdata.properties.runReport`.
  - `fetchDailySnapshot(): Promise<Ga4Snapshot>` — orchestrates 4 report calls: (a) totals for yesterday, (b) top pages, (c) top events, (d) source/medium; plus one 7-day trend report. Returns the JSON shape above.
- **No throws for missing env** — caller decides. Wraps upstream errors with `{ error, hint }` context (quota, auth).
- No client-only APIs — safe for both cron (Node) and route handler.

### 2. `scripts/cron/ga4-daily-pull.mjs`
- Node ESM entrypoint (matches sibling `atlassian-goal-loop.mjs`, `goal-loop.mjs` style).
- Loads env from `.env.local` via `dotenv/config`.
- Dynamic-imports the compiled `data-api-client` (via `web/dist` if present) OR — simpler — re-implements the fetch in plain JS using `googleapis` directly (avoiding the TS build step). Recommended: **plain JS, self-contained** to match existing cron style.
- Appends `JSON.stringify(snapshot) + "\n"` to `web/content/reports/ga4-daily.jsonl`.
- Skips duplicate if a line for the same `date` already exists today (idempotent for cron retries).
- Also emits a `cron-health.jsonl` heartbeat line (`{ cron: "ga4-daily-pull", ok: true, at: ... }`) matching existing convention.
- Cron entry (add to system crontab / cloud routine): `15 2 * * * cd /home/dovanlong/blockid.au && node scripts/cron/ga4-daily-pull.mjs >> web/content/reports/ga4-daily.log 2>&1` (02:15 UTC = 12:15 AEST, off-peak per project rules).

### 3. `web/src/components/admin/ga4-daily-tiles.tsx`
- **RSC** (no `"use client"`) — reads `web/content/reports/ga4-daily.jsonl` synchronously via `fs.promises.readFile`.
- Parses last line; if file missing or empty or env unconfigured → renders a single "GA4 API not configured" placeholder card with setup hint.
- Otherwise renders a `<section id="ga4-tiles">` with grid of **6 tiles**:
  1. **Sessions** (yesterday) + 7-day sparkline.
  2. **Active Users** + delta vs prior day.
  3. **Top Pages** — top-5 list with path + sessions.
  4. **Top Events** — top-5 list with name + count.
  5. **Conversions** — count + engagement-rate sub-metric.
  6. **Top Source / Medium** — top-5 with `source / medium` and sessions.
- Reuses existing card styling from `page.tsx` (`rounded-2xl border border-surface-200 bg-white`).
- Small badge shows `captured_at` timestamp + "GA4 property xxx" label.

### 4. `web/src/app/api/admin/ga4-refresh/route.ts`
- `POST` handler. Admin-only: `const user = await getCurrentUser(); if (!user || (user.email !== ADMIN_EMAIL && user.role !== "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });`
- Calls `fetchDailySnapshot()` from `@/lib/ga4/data-api-client`; on success appends to `ga4-daily.jsonl`; returns `{ ok: true, date, sessions }` or `{ ok: false, error }` with 500.
- Rate-limit: naive in-memory guard — max 1 call / 60s / process — enough to prevent double-clicks blowing quota.
- Uses `export const runtime = "nodejs"` (needs `fs`).
- Uses `export const dynamic = "force-dynamic"`.

## Env vars

Add to `.env.local` (and document in runbook):

```
GA4_PROPERTY_ID=properties/123456789
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account", ...}
```

Service account must be added as a **Viewer** on the GA4 property (Admin → Property Access Management).

## Acceptance criteria

1. `/admin/growth` shows today's + 7-day trend GA4 tiles rendered SSR from `ga4-daily.jsonl`.
2. `ga4-daily.jsonl` is appended once per day by the `ga4-daily-pull.mjs` cron.
3. If `GA4_PROPERTY_ID` or `GOOGLE_APPLICATION_CREDENTIALS_JSON` are missing, the tile section renders a single placeholder card with "GA4 API not configured" plus a link to the setup docs — page must not crash.
4. Admin can hit `POST /api/admin/ga4-refresh` to trigger an ad-hoc pull; non-admin gets 403.
5. Duplicate cron runs on the same UTC day do not double-append the same date snapshot.

## Risks & mitigations

- **GA4 API quota** (50k tokens/day, 25k concurrent). Mitigation: one snapshot per day + rate-limited refresh endpoint + batch multiple dimensions in a single `runReport` where possible (topPages, topEvents combined via `dimensionFilter`).
- **Service-account key rotation**. Mitigation: pull key JSON from env (no on-disk file), document 90-day rotation in the CDO runbook.
- **Missing env in dev** → build-time crashes. Mitigation: `isGa4Configured()` guard in the tiles component; **no top-level Google auth calls**, all deferred to request time.
- **JSONL growth**. Mitigation: `_daily-report-template.md` pattern already used; monthly rotate script can trim files > 30d if size becomes an issue.
- **Timezone mismatch**. GA4 property TZ vs our reports (UTC). Snapshot always uses UTC "yesterday"; caveat noted on the tile subtitle.

## Out of scope

- Real-time GA4 events (would need Realtime API + long-poll).
- Writing GA4 metrics into Supabase `growth_insights` (JSONL is sufficient for tiles; join can come later).
- Sparkline charts beyond a tiny inline SVG — full charts land in a later CDO ticket.
