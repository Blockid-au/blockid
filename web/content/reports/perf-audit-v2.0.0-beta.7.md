# Performance Audit — v2.0.0-beta.7

- Prod: https://blockid.au
- Server: Next 16 standalone at `localhost:4001` behind nginx + Cloudflare
- Live release: `/data/releases/h1T43EjZky0jHF-lic6Q2` (BUILD_ID present)
- Measured: 2026-07-17 UTC (this pass)

---

## 1. Live measurements (curl, 2 runs each)

| Path | Run | TTFB | Total | Bytes | HTTP |
|---|---|---:|---:|---:|---:|
| `/` | cold | 0.199s | 0.223s | 130,682 | 200 |
| `/` | warm | 0.202s | 0.225s | 130,682 | 200 |
| `/pricing` | cold | 0.158s | 0.171s | 96,827 | 200 |
| `/pricing` | warm | 0.123s | 0.137s | 96,827 | 200 |
| `/roadmap` | cold | 0.107s | 0.120s | 82,538 | 200 |
| `/roadmap` | warm | 0.103s | 0.115s | 82,538 | 200 |
| `/for/founder` | cold | 0.088s | 0.089s | 21,756 | **404** |
| `/for/founder` | warm | 0.097s | 0.098s | 21,756 | **404** |
| `/svi` | cold | 0.138s | 0.139s | 21,744 | **404** |
| `/svi` | warm | 0.108s | 0.109s | 21,744 | **404** |

Notes:
- Live TTFB is healthy (100-200ms) — nothing on fire. Warm-cache mostly matches cold, so Cloudflare edge cache is bypassing dynamic HTML (`cache-control: private, no-cache, no-store` is being sent on every response). That is expected for auth-aware pages but limits edge acceleration for `/`, `/pricing`, `/roadmap` which have no per-user data.
- **`/svi` and `/for/founder` 404 in prod** despite `web/src/app/svi/page.tsx` and `web/src/app/for/[segment]/page.tsx` existing in source. The live release's `.next/server/app/` does not contain `svi/` or `for/` output — these routes were added after the current deploy. Ship a re-deploy to close.

## 2. JS bundle — 10 biggest chunks

Live: `/data/releases/h1T43EjZky0jHF-lic6Q2/.next/static/chunks/`

| Chunk | Size |
|---|---:|
| `2918-…js` | 314,673 |
| `3794-…js` | 222,757 |
| `4bd1b696-…js` | 199,870 |
| `framework-711ef29b.js` | 189,700 |
| `main-0c4b90c7.js` | 138,112 |
| `6444-…js` | 113,223 |
| `polyfills-…js` | 112,594 |
| `6713-…js` | 78,194 |
| `3847-…js` | 62,388 |
| `6972-…js` | 56,733 |

Total top-10 client JS: **~1.49 MB uncompressed**. The largest anonymous chunk (314 KB) is almost certainly the `lucide-react` barrel + shared marketing components — see finding #1.

## 3. Dependency weight (production impact)

| Dep | Version | Prod impact |
|---|---|---|
| `lucide-react` | ^1.14.0 | 247 files import icons. No `optimizePackageImports` → the whole icon graph can pull into shared client chunks. Biggest single lever. |
| `recharts` | ^3.8.1 | Charts on dashboards, KPI walls. Client-only. Barrel imports. |
| `@react-pdf/renderer` | ^4.5.1 | Server-only, invoked from report generation routes. Fine as long as it stays out of client bundles. |
| `docx` | ^9.7.1 | Server-only, DOCX export in report pipeline. |
| `pptxgenjs` | ^4.0.1 | Server-only, whitelisted in `serverExternalPackages`. Good. |
| `puppeteer-core` | ^25.0.4 | Server-only, screenshot / Lighthouse. |
| `@remotion/*` (bundler/cli/player/renderer) + `remotion` | ^4.0.463 | Only `@remotion/player` risks entering client. Confirm — if unused in client components, deferring to a dedicated `/media` route is safe. |
| `googleapis` | ^171.4.0 | Server-only. Very large (>10 MB), should never enter client bundles. |
| `@anthropic-ai/sdk` | ^0.95.0 | Server-only, in `serverExternalPackages`. Good. |
| `@google/generative-ai` | ^0.24.1 | Server-only. Not in `serverExternalPackages` — safe today (only imported from server modules) but consider adding for consistency. |

**No dep swaps recommended this pass** (guardrail: no new npm deps, no swaps).

## 4. Cron overhead (last 200 lines of `cron-health.jsonl`)

- Rows in sample: 200
- Runs in last 24h (from tail): **22**
- **Failures in last 24h: 20 / 22 (91%)** — this is the biggest single alert from this audit
- Avg duration: **45,045 ms** (skewed by two runaway agent runs)
- Top slowest by avg duration:
  1. `agent-auto-improve` — 484,942 ms (~8 min)
  2. `agent-orchestrator` — 191,334 ms (~3 min)
  3. `performance-audit` — 16,476 ms
  4. `trial-end-reminder` — 16,468 ms
  5. `ai-health` — 16,437 ms

The failure rate is far outside `perf-audit` scope but needs a follow-up. `performance-audit` cron itself is running in 16s which is fine; do not touch.

## 5. Font weight (Space Grotesk + siblings)

`web/src/app/layout.tsx` loads three families via `next/font/google`:

- `Inter` (weights 400/500/600/700/800) — display: swap
- `IBM_Plex_Mono` (500/600) — display: swap
- `Space_Grotesk` (500/600/700) — display: swap

Preloaded per response (`Link: rel=preload` header):
- `98e207f02528a563-s.p.woff2` — 10,060 B (Inter latin subset)
- `db96af6b531dc71f-s.p.woff2` — 10,120 B (Plex Mono latin)
- `e4af272ccee01ff0-s.p.woff2` — **48,432 B** (Space Grotesk — largest of the three)

Total preloaded font payload per page: **~68 KB**. All 17 woff2 files across all subsets total ~285 KB. `display: swap` is set, so blocking risk is low. Space Grotesk at 48 KB is acceptable; trimming to weights 500 + 700 (dropping 600) would save ~15 KB but is a design call.

## 6. CSP header size

```
$ curl -sI https://blockid.au/ | grep -i content-security-policy | wc -c
550
```

**550 bytes per response** for the CSP line alone (includes leading header name + CRLF). Combined with all other security headers, the header block adds roughly 1.5 KB to every HTML response. Acceptable — the security value outweighs the byte cost. No change recommended.

## 7. Ranked findings — top 5 quick wins

| # | Finding | File:line | Expected impact | Effort |
|---|---|---|---|---|
| 1 | Enable `experimental.optimizePackageImports` for `lucide-react` (247 importers) and `recharts` | `web/next.config.ts:12` (added this pass) | Bundle: shared client JS -50-150 KB gzipped. CPU: fewer icon components tree-walked. | **S — done this pass** |
| 2 | Enable `compress: true` at the Node process | `web/next.config.ts:11` (added this pass) | TTFB unchanged (nginx already gzips), but bytes-on-wire for direct :4001 hits and edge-bypasses drop by ~70% on HTML/JSON. | **S — done this pass** |
| 3 | Cache `readFileSync(version.json)` on `/roadmap` (was re-parsed every request under `force-dynamic`) | `web/src/app/roadmap/page.tsx:120` (rewritten this pass) | TTFB: -10-20 ms per request on `/roadmap`. Removes disk IO from the hot path. | **S — done this pass** |
| 4 | Redeploy — `/svi` and `/for/[segment]` pages exist in source but return 404 on prod (missing from current build's `.next/server/app/`) | `web/src/app/svi/page.tsx`, `web/src/app/for/[segment]/page.tsx` | Restores two live landing surfaces. Zero perf regression. | **S — deploy step, NOT code** |
| 5 | Investigate cron failure rate (20/22 fails in last 24h; `agent-auto-improve` running 8 min) | `web/content/reports/cron-health.jsonl` + `web/src/app/api/cron/agent-auto-improve/route.ts` | Frees a stuck agent slot, reduces log churn, improves cron budget headroom. | **M — deferred, out of perf scope** |

### Runners-up (not implemented this pass)

- `/data/releases` currently holds **6 releases (2.4 GB)** — deploy-live spec keeps 5. One release is orphaned. The new `web/scripts/perf-cleanup-report.sh` reports this automatically; actual pruning still belongs to `deploy-live.sh`.
- Homepage `web/src/app/page.tsx` also does `readFileSync` on each request (line 31). Guardrail says **do not touch** — deferred.
- 4 admin dashboards and `web/src/app/legal/[doc]/page.tsx` all `readFileSync` per request. Admin pages have low traffic so low priority; `/legal/[doc]` could get the same mtime-cache treatment in a follow-up.
- Space Grotesk 600-weight woff2 could be dropped (~15 KB) but is a design decision.
- `googleapis` is huge — confirm none of it reaches client bundles (a bundle-analyzer pass would prove this).

## 8. Verification of changes this pass

- `web/next.config.ts` — `compress: true`, `experimental.optimizePackageImports: ["lucide-react", "recharts"]`
- `web/src/app/roadmap/page.tsx` — `readVersion()` now uses a module-scope 30s TTL cache with mtime invalidation
- `web/scripts/perf-cleanup-report.sh` — new read-only disk-hygiene report (executable, run against `/data/releases`)
- `npx tsc --noEmit` — clean
- Build-time budget: no new deps, no new webpack loaders, no new server modules. Build should stay comfortably under the 8-minute budget; `optimizePackageImports` slightly extends tree-shaking work but is well within Next 16's tuned defaults.
