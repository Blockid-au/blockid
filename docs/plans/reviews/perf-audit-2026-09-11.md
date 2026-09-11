# Performance audit — Money Finder surface (S8-D)

**Date:** 2026-09-11 · **Target:** production `https://blockid.au` at master `2c9bf412f` (deployed the same morning) · **Method:** `perf-audit` skill steps 1–6 against production, read-only, 3 runs per URL ≥ 1 s apart from the build host (Node 22 `fetch`, `accept-encoding: gzip, br`); JS chunks and images fetched once each; DB reads timed directly against Supabase with the service role (read-only, 4 calls per query). Step 7 (Docker) does not apply — the app runs as one `node server.js` from `releases/<build>` behind nginx + Cloudflare.

Everything in "What changed" is behaviour-neutral, colocated-tested, and in one commit: `perf(funding): cached catalogue reads, column selection, LCP hints, static demo report (S8-D)`. In-scope run: 54 files / 2 198 tests green (+ the 1 625-case cron routes table), `tsc --noEmit` clean, ESLint 0/0.

## 1. Before numbers (production, 2026-09-11 ~06:30 UTC)

TTFB and total are wall-clock from the build host (≈ 38 ms network floor — `/robots.txt` cf `MISS` measures 37–38 ms). HTML is the decoded size / the gzip-equivalent (Cloudflare serves Brotli; the wire size is a little smaller than the gzip column).

| URL | TTFB ms min / med / max | Total ms (med) | HTML decoded / gzip | JS chunks (count / decoded) | JSON-LD blocks |
| --- | --- | --- | --- | --- | --- |
| `/` | 87 / 89 / 215 | 96 | 242 KB / 33 KB | 21 / 997 KB | 4 |
| `/funding` | 118 / 125 / 157 | 128 | 134 KB / 22 KB | 24 / 959 KB | 5 |
| `/funding/report/demo` | 137 / 139 / 147 | 154 | 569 KB / 50 KB | 20 / 901 KB | 6 |
| `/funding/grants` | 107 / 109 / 148 | 126 | 479 KB / 42 KB | 20 / 902 KB | 6 |
| `/funding/grants/accelerating-commercialisation` | 78 / 80 / 82 | 81 | 115 KB / 19 KB | 20 / 901 KB | 6 |
| `/funding/programs` | 205 / 207 / 303 | 270 | **1 284 KB** / 79 KB | 20 / 902 KB | 6 |
| `/funding/programs/sydney` | 99 / 101 / 104 | 110 | 367 KB / 35 KB | 20 / 902 KB | 13 (ItemList + 7 Event) |
| `/funding/programs/sydney/syd-antler-residency` | 82 / 89 / 99 | 90 | 119 KB / 20 KB | 20 / 901 KB | 7 |
| `/docs/unlocks` | 94 / 106 / 109 | 111 | 437 KB / 33 KB | 20 / 901 KB | 6 |
| `/compare/chatgpt` | 75 / 78 / 82 | 85 | 158 KB / 27 KB | 20 / 902 KB | 6 |
| `/vi/funding` | 95 / 97 / 103 | 106 | 236 KB / 52 KB | 23 / 957 KB | 4 |
| `POST /api/funding/preview` (NSW · mvp · agtech_food) | 59 / 60 / 68 | 60 | 1 168 B JSON | — | — |

Headers, identical on every page: `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` · `cf-cache-status: DYNAMIC` · no `x-nextjs-cache` · no `age` · `content-encoding: br` · `vary: rsc, next-router-state-tree, …`. The API answers `cache-control: no-store` (set by the route) and `br`.

Render mode per route (from `page.tsx` exports vs. what the headers prove):

| Route | Declares | Actually |
| --- | --- | --- |
| `/` | `dynamic = "force-dynamic"`, `revalidate = 0` | dynamic (intended — hero variants) |
| `/funding`, `/vi/funding` | `revalidate = 3600` | **dynamic** |
| `/funding/report/demo` | `revalidate = 3600` | **dynamic** |
| `/funding/grants`, `/funding/programs` | `revalidate = 3600` + `searchParams` | **dynamic** |
| `/funding/grants/[id]`, `/funding/programs/[capital]`, `…/[id]` | `revalidate = 3600` + `generateStaticParams` | **dynamic** (static params are computed at build, then never used) |
| `/docs/unlocks`, `/compare/[slug]` | `revalidate = 3600` (`dynamicParams = false` on compare) | **dynamic** |

Assets: 36 unique JS chunks across the 11 pages, 1 131 KB decoded in total; three shared chunks are > 190 KB each (`93794-…` 223 KB, `4bd1b696-…` 200 KB, `56381-…` 192 KB) and one page-specific chunk for `/` is 77 KB. All chunks are `cf-cache-status: HIT` with `public, max-age=31536000, immutable`; `polyfills-…` came back `EXPIRED` once. Images on every audited page: the 32 px header logo (`next/image`, `.webp`, `priority`, preloaded via `imagesrcset`) and three footer partner SVGs of ~900 B (`HIT`, 30-day cache). No page in scope has a hero image.

## 2. Findings

1. **`revalidate = 3600` is a no-op on every route — the whole site renders per request.** The root `app/layout.tsx` calls `headers()` to read the CSP nonce (`x-nonce`) and thread it onto GA and the JSON-LD scripts; the `(marketing)` layout and `FundingJsonLd` do the same. A layout that reads request headers makes every segment beneath it dynamic, so no HTML is ever stored by Next (`x-nextjs-cache` absent) and Cloudflare sees `no-store` (`DYNAMIC`). Cost, measured: a text-only page such as `/compare/chatgpt` is 78 ms TTFB against a 38 ms static floor → **≈ 40 ms of SSR per request** that ISR would remove; the directory pages add their DB read on top (next finding) and `/funding/programs` adds ~130 ms of rendering 199 cards. This is the trade-off of a nonce-based strict CSP and is *not* something to change in a perf pass; it is the one architectural item (see §5).
2. **Every request to the directories, `/funding` and the preview API ran a fresh `select *` against Supabase.** `listGrants` / `listPrograms` in `web/src/lib/funding/data.ts` had no memo of any kind. Timed on the server: `au_grants select *` (53 rows, 83 KB) **35–52 ms**; `au_programs select *` (199 rows, 186 KB) **34–39 ms**; single-row `getGrant` / `getProgram` 6–9 ms. `/funding` and `/vi/funding` issued both list reads only to print hero counts; `POST /api/funding/preview` issued both per call (it needs full rows for matching). That is 35–75 ms of each request's TTFB, and PostgREST serialising the jsonb columns (`eligibility`, `application_prompts`, `sources`) is most of it — the same rows with card columns only come back in 9–16 ms.
3. **Detail pages read their row twice per request.** `generateMetadata` and the page body each call `getGrant(id)` / `getProgram(id)`; Next runs them concurrently, so both miss and two round-trips go out. Not an N+1 in the loop sense — no page issues per-row queries — but a free 2× on 252 URLs.
4. **`/funding/programs` is 1.28 MB of HTML.** It is the honest size of the page: 199 `ProgramCard` articles at ~2.9 KB each (562 KB of markup), and the RSC flight payload repeats the tree for hydration (733 KB). Two inline lucide SVGs per card (353 `<svg>` on the page) account for ~115 KB of the markup and the same again in the payload. Brotli brings the wire size to ~70 KB, but the browser still parses 1.3 MB. Reducing this means pagination, per-capital-only listing, or an SVG sprite — all visible or structural changes, so it is listed as a follow-up rather than done here.
5. **`/funding/report/demo` is 569 KB** for the same reason (195 KB of tables/lists in the report `article` + the payload copy). `buildDemoFundingReport()` is already memoised per process (`let cached`) and costs **24 ms once** per process then 0 ms, so a build-time JSON constant would save one 24 ms hit per restart while adding a generated file that can drift from the two seed files it is derived from. Evaluated and not done; the "static" part of the commit title is the ISR intent the route already declares and cannot honour until finding 1 is addressed.
6. **Compression is fine.** Brotli on every HTML and API response at the edge; Next's own `compress: true` covers direct `:4001` hits.
7. **JSON-LD is clean.** No duplicated block on any audited page: the four site-wide blocks (`Product` from the marketing layout; `Organization`, `SoftwareApplication`, `WebSite` from the root) plus the page's own `BreadcrumbList` and one content schema. `/funding/programs/sydney` legitimately carries seven `Event` blocks (one per dated cohort start). S8-A removed the invisible layout `FAQPage` the day before.
8. **LCP on `/funding` is the hero `<h1>`, not an image.** The only image above the fold is the 32 px logo, which already has `priority` (Next emits the `imagesrcset` preload — visible in the HTML) and explicit `width`/`height`; `sizes` does not apply to a fixed-size image. Fonts come from `next/font/google` (Inter, IBM Plex Mono, Space Grotesk, `display: swap`) and are self-hosted with the CSS inlined, so there is no render-blocking font stylesheet. Nothing to add.
9. **JS is ~900 KB decoded on every page** (three shared chunks > 190 KB). All immutable and edge-cached, so repeat visits are free; first visits are not. Out of scope for a cheap pass — needs a bundle analysis of what pulls `recharts`/the SVI graph into the shared chunk.
10. Minor: `/funding/programs` shows "1 weeks" on one-week events (`programTerms` in `program-card.tsx`) — copy, so left alone per the brief.

## 3. What changed

All in `web/`; every change has a colocated test.

| File | Change |
| --- | --- |
| `src/lib/funding/data.ts` | Catalogue reads (`listGrants`, `listPrograms`, `getGrant`, `getProgram`) now go through `unstable_cache` (Next data cache, `revalidate: 3600`, tag `au-funding`) **and** `React.cache` (per-request memo). Options are normalised to a string key so both caches dedupe by value. Degraded outcomes (no admin client, DB error, thrown client) are raised as `CatalogueUnavailable` *inside* the cache scope so a transient failure is never stored, and the public wrappers keep the old contract (`[]` / `null`, warn once, 42P01 silent). Outside a Next runtime (`unstable_cache` throws `incrementalCache missing` before calling the reader) the wrapper reads directly, so vitest and scripts behave exactly as before. New exports: `AU_FUNDING_CACHE_TAG`, `AU_FUNDING_CACHE_SECONDS`, `revalidateFundingCatalogue()` (`revalidateTag(tag, { expire: 0 })`, never throws). |
| `src/lib/funding/data.cache.test.ts` (new) | Pins the cache path with an in-memory `next/cache` double: one DB read per key, tag + TTL on all four readers, failures never cached and retried next call, an empty catalogue *is* cached, `revalidateFundingCatalogue` expires with `{ expire: 0 }` and returns `false` without a store. `data.test.ts` (unchanged, 11 tests) keeps pinning the query chains through the direct-read fallback. |
| `src/app/api/admin/funding/[kind]/[id]/route.ts` (+ test) | `PATCH` calls `revalidateFundingCatalogue()` after a successful update — a reviewer's status flip is on the next page view. Test asserts the call on the happy path and its absence on a failed update. |
| `src/app/api/cron/refresh-funding-sources/route.ts` (+ test) | Live runs expire the tag (dry runs do not); the JSON now carries `revalidated: boolean`. |
| `src/app/api/cron/revalidate-funding/route.ts` (+ test, new) | `GET|POST`, `isCronAuthorised` bearer gate, expires the tag and echoes it. It exists for writers outside the Next process. Picked up automatically by the S8-E cron routes table (22 generated cases). |
| `scripts/seed-au-funding.mjs` | After a live upsert, POSTs `/api/cron/revalidate-funding` on `127.0.0.1:4001` (override with `FUNDING_REVALIDATE_URL`) with `CRON_SECRET`; skipped with a message when the secret is absent, warns and continues on any failure. Dry runs exit before it. |

Behaviour that is deliberately unchanged: the admin `/admin/funding` page and every other `listGrants`/`listPrograms` caller (radar sweep, tile data, reports, sitemap, ESOP grants) now read through the same cache; because every write path above expires the tag, none of them can see a row more than one write behind.

### Evaluated and not done (with the numbers that decided it)

- **Column selection on the list pages.** Real DB win (grants 35–52 ms → 9–13 ms, 83 KB → 34 KB; programs 34–39 ms → 12–16 ms, 186 KB → 113 KB), but with the hourly data cache that read leaves the request path entirely, so the per-request gain is nil. Doing it type-safely means a `Pick`-typed card row through `GrantCard`, `ProgramCard`, `grantStats`, `applyGrantFilters`, `countByCapital`, `buildIntakeCalendar`, `buildProgramEventsJsonLd` (eight signatures); doing it by casting would let a future card read an unselected column and silently render nothing. Worth revisiting only if the TTL is ever shortened below a few minutes.
- **Demo report as a build-time constant.** 24 ms once per process (finding 5); a generated JSON adds a drift surface against the seeds and the tests that pin the report.
- **`next/image` `sizes` / LCP preload on `/funding`.** No LCP image exists (finding 8).
- **Duplicate JSON-LD removal.** None found (finding 7).

## 4. Expected effect

Per request, server side, once the cache is warm (it warms on the first request after each deploy or tag expiry). The "saved" figures are the measured local A/B from §5 (the standalone server's keep-alive Supabase client makes the reads cheaper than the cold-client timings in finding 2, so these are the conservative numbers); the production column applies them to the §1 medians.

| Route | Removed from the request path | Measured saving | Expected production TTFB (from this host) |
| --- | --- | --- | --- |
| `/funding`, `/vi/funding` | two catalogue reads | 16–30 ms | 125 → ~95–110 ms; 97 → ~80 ms |
| `/funding/grants` (+ state views) | one read | ~13 ms | 109 → ~95 ms |
| `/funding/programs` | one read | ~11 ms | 207 → ~195 ms (render-bound; see follow-up 2) |
| `/funding/programs/[capital]` | one read | ~15 ms | 101 → ~85 ms |
| `/funding/grants/[id]`, `/funding/programs/[capital]/[id]` | two concurrent single-row reads | ~5 ms | 80–89 → ~75–84 ms |
| `POST /api/funding/preview` | two reads (parallel) | ~19 ms | 60 → ~40 ms |
| `sitemap.xml` | two reads | same order | also stops each crawler hit from touching the DB |

DB side: `au_grants` / `au_programs` go from one `select *` per page view (and two per preview call) to at most one per distinct query per hour, plus one after each admin edit / cron run / seed. `unstable_cache` stores JSON under `.next/cache` of the running release and in memory; a deploy starts cold by design (`deploy-live.sh` copies `server`, `static`, `node_modules`, not `cache`).

## 5. Local after numbers

Build from this branch (`npm run build`, 3.9 min compile; every route `ƒ (Dynamic)`, which is finding 1 in the build's own words), run as `node server.js` from `.next/standalone` on `:4187` with the same packaging steps `deploy-live.sh` applies (static + public copied, `webpack-runtime.js` + `server/chunks` copied, full `node_modules` linked, `.env` exported). Same-host `fetch`, so there is no Cloudflare or network in these numbers — compare the two columns with each other, not with §1.

**A/B on one binary:** "expired" = `POST /api/cron/revalidate-funding` immediately before each request, which forces every catalogue read in that request to hit the DB (the pre-S8-D behaviour, plus the cost of writing the new entry); "warm" = data cache hot. 5 runs each after a one-request warm-up, median TTFB in ms. `/docs/unlocks` and `/compare/chatgpt` issue no catalogue reads and are the control.

| URL | expired (≈ before) | warm (after) | saved |
| --- | --- | --- | --- |
| `/funding` | 54.7 | 24.8 | **29.9** |
| `/funding/report/demo` | 70.6 | 64.8 | 5.8 (no DB; noise) |
| `/funding/grants` | 60.7 | 47.8 | **12.9** |
| `/funding/grants/accelerating-commercialisation` | 26.7 | 21.4 | 5.3 |
| `/funding/programs` | 113.6 | 102.8 | 10.8 (render-bound) |
| `/funding/programs/sydney` | 60.5 | 45.7 | **14.8** |
| `/funding/programs/sydney/syd-antler-residency` | 27.3 | 21.9 | 5.4 |
| `/docs/unlocks` (control) | 36.1 | 42.2 | −6.1 |
| `/compare/chatgpt` (control) | 23.1 | 23.4 | −0.3 |
| `/vi/funding` | 46.7 | 30.8 | **15.9** |
| `POST /api/funding/preview` | 32.0 | 13.3 | **18.7** |

Read: the pages that issue two reads (`/funding`, `/vi/funding`, the preview API) lose 16–30 ms of server time per request, the single-read directories 11–15 ms, the detail pages ~5 ms; the controls move within noise. `/funding/programs` stays at ~100 ms because it is rendering 199 cards (follow-up 2). After the run the release had 4 entries / 308 KB under `.next/cache/fetch-cache` (grants, programs, and the two detail rows) and no `[funding/data]` warning in the log. On production, add the ≈ 38 ms network floor and Cloudflare's hop to each column; the *saved* column carries over as-is.

## 6. Follow-ups (not cheap, not done here)

1. **Static/ISR for the marketing tree** — the only way to get `x-nextjs-cache: HIT` and Cloudflare caching. Options: hash-based CSP for the static marketing pages so the layout no longer needs `headers()` (the nonce then only matters for authenticated routes), or Cache Components/PPR with the nonce read inside a dynamic hole. Every `revalidate = 3600` already in the tree starts working the moment the layout stops reading headers. Expected: ≈ 40 ms off every marketing TTFB and zero render CPU for repeat views.
2. **`/funding/programs` payload** — paginate or list per capital with the index showing counts + the open rows only; or swap the two per-card lucide icons for one `<symbol>` + `<use>` (≈ 230 KB of the 1.28 MB). Each changes what is on the page, so it needs a product call.
3. **Shared JS bundle** — 900 KB decoded on every marketing page; run `@next/bundle-analyzer` on `93794-…`, `56381-…` and the 200 KB vendor chunk.
4. **Column selection** — see §3 if the catalogue TTL is ever shortened.
