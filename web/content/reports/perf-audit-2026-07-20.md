# Performance Audit — 2026-07-20

Prod: `https://blockid.au` (BUILD_ID `V9cTYG97xqmZbLchJ3bzZ`, PID via `last-good-build.json`).
Auditor: Performance agent.

## Baseline

### TTFB + payload (median of 3, `-A perf-audit`)

| Path | TTFB | Total | Bytes |
|---|---|---|---|
| `/` | 146ms | 148ms | 43,940 |
| `/svi` | 159ms | 173ms | 88,219 |
| `/dataset` | 149ms | 163ms | 83,514 |
| `/insights` | 168ms | 198ms | **241,520** |
| `/developers/api` | 104ms | 116ms | 65,817 |
| `/tools/idea-clarify` | 85ms | 87ms | 48,616 |
| `/tools/idea-lab` | 98ms | 100ms | 52,428 |
| `/tools/financial-projections` | 87ms | 90ms | 55,225 |
| `/workspace/projects` (302 → /auth/login) | 86ms | 88ms | 30,637 |

TTFB overall is healthy (85–170ms median). Total-page timings track TTFB
closely — HTTP/2 + CF edge. No page is server-slow.

### JS chunks (top of `.next-current/.next/static/chunks`)

| Size | Chunk | Notes |
|---|---|---|
| 308K | `62918-*.js` | Recharts bundle (LineChart / BarChart / ScatterChart / RTK / immer) |
| 236K | `13574-*.js` | Shared app framework code |
| 220K | `93794-*.js` | Shared vendor |
| 196K | `4bd1b696-*.js` | React runtime |
| 189K | `framework-*.js` | React 18/19 core |
| 138K | `main-*.js` | Next runtime |
| 113K | `76444-*.js` | Vendor split |
| 112K | `polyfills-*.js` | Polyfills |

`optimizePackageImports: ["lucide-react", "recharts"]` is already on. No
other barrel packages (`date-fns` / `framer-motion` / `@heroicons` /
`lodash`) are in `package.json` — nothing to add there.

### Server render log

`tail /tmp/blockid-production.log | grep -iE 'rendering|GET |POST '` returned
nothing (Next runtime does not log request timings in this build). TTFB
numbers above are the practical proxy — all sub-200ms.

### DB slow queries

`pg_stat_statements` shows only two rows > 100ms:

| calls | mean_exec_time | query |
|---|---|---|
| 1 | 220ms | migration `CREATE TABLE deploy_incidents` (one-shot, ignore) |
| 57 | 140ms | `SELECT name FROM pg_timezone_names` (Supabase internal) |

No slow application queries.

### Oversized public images

The heaviest raw PNGs:

| Bytes | Path | Referenced from |
|---|---|---|
| 1,458,732 | `images/blockid-hero-banner-original.png` | (unused source) |
| 878,037 | `images/blockid-hero-banner.png` | `landing/hero.tsx` (dead), `svi/svi-entrance.tsx` |
| 841,484 | `video-assets/01-homepage-hero.png` | Remotion only (not served) |
| 819,556 | `video-assets/helpnow-01-homepage.png` | Remotion only |
| 813,291 | `images/logo-full.png` (× 3 dupes: -new, -official) | OG image only (crawlers) |
| 670,163 | `video-assets/homepage-hero.png` | Remotion only |
| 389,288 | `images/logo-transparent-hires.png` | Unused |
| 274,154 | `video-assets/uc3-dashboard-svi.png` | Remotion only |

Verified: `next/image` on `svi-entrance` already serves `blockid-hero-banner.png`
as 48KB AVIF via `/_next/image?url=…` (checked with `Accept: image/webp`).
The raw 878KB PNG is only touched by social scrapers and Remotion. So the
runtime image path is already optimized — the raw files just sit on disk.

## Optimizations shipped

### 1. Long Cache-Control on public static image/icon assets
- **File:** `web/next.config.ts`
- **What:** New `headers()` entry matching `/:path*.(png|jpg|jpeg|webp|avif|svg|ico)`
  returning `Cache-Control: public, max-age=2592000, stale-while-revalidate=86400`.
- **Why:** Prod is currently emitting `max-age=14400` (4 h) for
  `/favicon-32x32.png`, `/icon.png` (103 KB), `/apple-touch-icon.png`,
  `/images/logo-*.png`. Every daily visitor was refetching them and CF
  cache was expiring quickly (`cf-cache-status: MISS` on `/icon.png`).
- **Expected:** 4× reduction in image / favicon egress. Better repeat-visit
  paints (no need to revalidate 100 KB `/icon.png`).

### 2. Truncate `/insights` card descriptions before RSC serialisation
- **File:** `web/src/app/insights/page.tsx`
- **What:** Descriptions are now trimmed to 160 chars (+ `...`) before being
  passed as props to the `"use client"` `InsightsCategoryFilter`.
- **Why:** `/insights` returns 241 KB of HTML — the largest page in the
  audit — because 83 article descriptions are serialised into the RSC
  payload (`\"description\":` appears 87× in the HTML). Descriptions are
  only rendered inside teaser cards; full text is not needed.
- **Expected:** ~10 KB (~4 %) drop in `/insights` HTML; smaller
  hydration payload for the filter tab UI.

### 3. Module-level cache for homepage `readVersionString()`
- **File:** `web/src/app/page.tsx`
- **What:** `version.json` is now read from disk once per process instead of
  on every request. `cachedVersion` is a module-scoped `let` that guards
  the `readFileSync`.
- **Why:** `/` is `force-dynamic` / `revalidate = 0`, so the disk read fires
  on every request. The file only changes on deploy and each deploy spawns
  a fresh Node process, so the cache never goes stale in practice.
- **Expected:** removes ~1 syscall + JSON parse per homepage hit (small,
  but the homepage is the busiest route).

## Optimizations deferred

- **Delete `blockid-hero-banner-original.png` (1.46 MB) and dupes
  `logo-new.png` / `logo-official.png` (813 KB each).** Real cleanup, but
  the task rules forbid file deletion without confirmation. Flag for a
  cleanup PR.
- **Remove `landing/hero.tsx`.** It is imported nowhere (only
  `landing/hero-search.tsx` is used on `/` and `/vi`), yet it is in the
  bundle graph and holds a `priority`-flagged duplicate image reference.
  `hero-search.tsx` is on the DO NOT MODIFY list — safer to leave it in
  place until CPO clears the removal.
- **Split Recharts chunk (308 KB) with `next/dynamic`.** `62918-*.js`
  contains the entire Recharts + immer + reselect graph. Splitting per
  chart component would meaningfully cut initial JS on chart-bearing
  pages, but it touches SVI / dashboard components on the DO NOT MODIFY
  list. Recommend a targeted CPO task.
- **`/dataset` sets both `dynamic = "force-dynamic"` and `revalidate = 300`
  (contradictory — `force-dynamic` wins).** Would benefit from switching
  to plain `revalidate = 300` for ISR, but `/dataset` is on the DO NOT
  MODIFY list.
- **Convert `icon.png` (103 KB, 512×512) to a smaller PNG or WebP.** The
  favicon manifest advertises it as `image/png sizes="512x512"`. Would
  save ~80 KB per cold page load but changing the manifest is a
  cross-cutting change; not in scope for a 3-win perf pass.

## Re-measured

- `npx tsc --noEmit` — exit 0.
- The three edits take effect after the next deploy. Cache-header change is
  invisible to the running process until Node reboots with the new
  `next.config.ts`. Insights truncation requires a rebuild (SSR route). The
  `readVersionString()` cache requires a fresh process. Re-run the TTFB /
  payload table after the next `deploy-live.sh` cycle to confirm
  `/insights` HTML drops and `/icon.png` returns the new `max-age=2592000`.
