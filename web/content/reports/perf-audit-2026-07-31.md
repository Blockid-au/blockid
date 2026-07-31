# Performance audit — blockid.au, 2026-07-31

Audit of production `https://blockid.au` immediately after the
`v3.0.0-phase6-core` unblock. Every number below is measured, not estimated.
Timings are 6 samples per route via `curl -w` from the origin host through
nginx + Cloudflare; Lighthouse runs are mobile emulation (4x CPU throttle,
slow-4G) using the local `/usr/bin/chromium` via `npx lighthouse@12`.

Production returned HTTP 200 before, between and after every deploy in this
audit. Two deploys were run, both through `scripts/deploy-live.sh`, both
11/11 gates green.

---

## 1. Baseline (before)

### Response times and payloads

Brotli negotiated on every HTML route (`Accept-Encoding: br, gzip` →
`content-encoding: br`). Sizes are compressed wire bytes.

| Route | TTFB med | TTFB p95 | Total med | Wire KB (br) |
| --- | --- | --- | --- | --- |
| `/` | 104 ms | 176 ms | 105 ms | 11.5 |
| `/pricing` | 114 ms | 120 ms | 114 ms | 14.9 |
| `/solutions/founder` | 103 ms | 118 ms | 103 ms | 11.4 |
| `/solutions/vn-sme` | 109 ms | 139 ms | 109 ms | 11.3 |
| `/solutions/investor` | 102 ms | 104 ms | 103 ms | 11.4 |
| `/solutions/accelerator` | 103 ms | 113 ms | 104 ms | 11.3 |
| `/business-id` | 103 ms | 107 ms | 103 ms | 13.5 |
| `/vi` | 104 ms | 113 ms | 104 ms | 22.2 |
| `/roadmap` | 105 ms | 112 ms | 106 ms | 17.3 |
| `/changelog` | 120 ms | 126 ms | 131 ms | 57.5 |

Server response is already healthy — ~103 ms median TTFB, tight p95, and
HTML is small. **There was no server-side latency problem to fix.**

### Caching

- **Static assets** (`/_next/static/**`): `cache-control: public, max-age=31536000, immutable`,
  `content-encoding: br`, `cf-cache-status: HIT`. Correct; nothing to do.
- **HTML routes**: all ten return
  `private, no-cache, no-store, max-age=0, must-revalidate`.
  This is *not* an accident to be "fixed" — it is Next's signature for a
  dynamically rendered route, and these pages opt in explicitly
  (`export const dynamic = "force-dynamic"` in `src/app/(marketing)/page.tsx`).
  Only 8 routes are prerendered. See §4 for why this was left alone.

### Render-blocking and fonts

- 2 stylesheets, both `data-precedence="next"`.
- The only non-`async`/`defer` script is the `noModule` polyfill bundle,
  which modern browsers skip entirely.
- **All 54 `@font-face` rules already carry `font-display: swap`.** No fix
  needed — this was a listed candidate that the measurement ruled out.
- LCP element on `/` is a text `<span>`, not an image. The only eager image
  is a 32x32 webp logo; the rest are below-the-fold lazy SVGs. So the
  "missing `priority` on the LCP image" candidate does not apply either.

### First Load JS (the actual problem)

Measured by parsing the real `<script src>` set out of the live HTML and
summing those chunk files on disk from the served release — not from
manifests, which over-count because they list the whole module graph rather
than what is actually sent.

| Route | First Load JS | Script tags | recharts | SVI panel | react-markdown |
| --- | --- | --- | --- | --- | --- |
| `/` | **1597 KB** | 25 | yes | yes | yes |
| `/pricing` | 868 KB | 15 | no | no | no |
| `/changelog` | 848 KB | 14 | no | no | no |
| `/business-id` | 848 KB | 14 | no | no | no |

The homepage carried **645 KB that no other marketing route did**:

| Chunk | Size | Contents |
| --- | --- | --- |
| `20342-*.js` | 307 KB | recharts 3.8.1 (+ immer, decimal.js-light, inlined d3) |
| `13574-*.js` | 228 KB | SVI / idea-analysis feature UI |
| `76444-*.js` | 110 KB | react-markdown 10 + remark/micromark |

**Root cause.** `src/app/(marketing)/page.tsx` picks one of three heroes by
feature flag. Production runs `NEXT_PUBLIC_UPGRADE_V2=true` (confirmed in
`.env`, and the live HTML renders `hero-search-heading`), so the legacy
`<SVIEntrance />` branch **never renders**. But a *static* import of a Client
Component from a Server Component registers it in the route's
client-reference manifest regardless of whether the branch is taken, so its
entire subtree shipped in First Load JS:

```
svi-entrance.tsx
  → rnd-results-panel.tsx → svi-radar-chart.tsx → recharts      (307 KB)
  → svi-results-panel.tsx → react-markdown                      (110 KB)
```

### Server-only leak audit

Checked the built client chunks for libraries that must never reach the
browser. Verified by library-distinctive internals, not bare substrings.

| Dependency | In client bundle? |
| --- | --- |
| `@react-pdf/renderer` | **No** — correctly confined to `src/lib/pdf/` + API routes. The only hit is the marketing string "Server-side @react-pdf rendering". |
| `docx` | **No** — hits are the `accept=".pdf,.doc,.docx"` file-input attribute and marketing copy. |
| `stripe` (server SDK) | **No** — only `@stripe/stripe-js`, which is correct. |
| `@anthropic-ai` / `openai` | **No** — hits are dropdown option values in the admin AI-keys UI. |
| `nodemailer` / `puppeteer` / `playwright` / `jsonwebtoken` / `bcrypt` | **No** |
| `src/lib/agents/**` | **Yes, one** — see §4. |

### Lighthouse

Not installed and not installed globally; run on demand via `npx lighthouse@12`
against local `/usr/bin/chromium`.

| | `/` | `/business-id` |
| --- | --- | --- |
| Performance | 46 | 52 |
| Accessibility | 100 | 96 |
| Best Practices | 93 | 93 |
| SEO | 92 | 92 |
| FCP | 3.2 s | 3.4 s |
| LCP | 6.2 s | 6.2 s |
| TBT | 1280 ms | 760 ms |
| CLS | 0 | 0 |

Top opportunities: *Reduce unused JavaScript* (233 KB / 650 ms) and
*Preconnect to required origins* (300 ms). Third-party summary attributes
**635 ms of blocking time and 284 KB to Google Tag Manager** — roughly half
of the homepage's total blocking time.

---

## 2. What changed

### Fix 1 — lazy-load the dead `SVIEntrance` branch off the homepage

`439fbd4e` · `src/components/svi/svi-entrance-lazy.tsx` (new),
`src/app/(marketing)/page.tsx`

Next 16's lazy-loading guide
(`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`) states:
"When a Server Component dynamically imports a Client Component, automatic
code splitting is currently **not** supported." So calling `dynamic()` inside
the server `page.tsx` would have split nothing. The `dynamic()` call was
hoisted into a `"use client"` boundary module, which is what actually
produces a separately-fetched chunk.

`ssr` is left at its default (`true`), so when the flags are off the legacy
hero still server-renders. This is purely a code-splitting change, not a
rendering change.

**Before → after, homepage First Load JS: 1597 KB → 854 KB (−743 KB, −46.5%).**
Script tags 25 → 15. recharts, the SVI panel and react-markdown are all gone
from the homepage. Control routes were unchanged (`/changelog` 848→848,
`/business-id` 848→848, `/pricing` 868→869), confirming the change was
targeted and caused no collateral movement.

### Fix 2 — preconnect to the GA/GTM origins

`dca9f149` · `src/app/layout.tsx`

Lighthouse flagged `https://www.google-analytics.com` at a 300 ms estimated
saving. Next already preloads the googletagmanager gtag script, but
google-analytics.com is first reached from *inside* gtag.js, so DNS + TCP +
TLS to it lands on the critical path. Added `preconnect` + `dns-prefetch`
hints for both origins.

Connection hints only — no bytes, no script execution, and **no CSP change**
(`connect-src` already allows google-analytics.com, `script-src` already
allows googletagmanager.com).

---

## 3. After

TTFB is statistically unchanged, which is the expected and honest result:
both fixes remove client-side download/parse/execute work and connection
setup, not server render time. Differences below are within run-to-run noise
(note `/` p95 improved 176→126 ms, but the medians moved the other way by a
similar margin — do not read a trend into either).

| Route | TTFB med | TTFB p95 | Total med | Wire KB (br) |
| --- | --- | --- | --- | --- |
| `/` | 115 ms | 126 ms | 116 ms | 11.2 |
| `/pricing` | 110 ms | 122 ms | 111 ms | 14.9 |
| `/solutions/founder` | 112 ms | 115 ms | 113 ms | 11.4 |
| `/solutions/vn-sme` | 107 ms | 114 ms | 107 ms | 11.3 |
| `/solutions/investor` | 110 ms | 114 ms | 111 ms | 11.4 |
| `/solutions/accelerator` | 108 ms | 116 ms | 108 ms | 11.3 |
| `/business-id` | 110 ms | 121 ms | 111 ms | 13.4 |
| `/vi` | 103 ms | 124 ms | 104 ms | 21.8 |
| `/roadmap` | 103 ms | 112 ms | 105 ms | 17.3 |
| `/changelog` | 120 ms | 130 ms | 130 ms | 57.5 |

The real, unambiguous win:

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| `/` First Load JS | 1597 KB | **854 KB** | **−743 KB (−46.5%)** |
| `/` script tags | 25 | **15** | −10 |
| recharts on `/` | 307 KB | **0** | eliminated |
| SVI feature UI on `/` | 228 KB | **0** | eliminated |
| react-markdown on `/` | 110 KB | **0** | eliminated |

Compression, cache headers and status codes were byte-identical before and
after on all ten routes. The homepage still renders the V2 `HeroSearch` hero
with its correct `<title>`, and shows no error markers.

---

## 4. Deliberately NOT fixed

Ordered by estimated win.

1. **Google Tag Manager costs 635 ms of blocking time and 284 KB** — the
   single largest remaining item, roughly half the homepage's 1280 ms TBT.
   Not fixed because it is a business/analytics decision, not a code defect:
   deferring or self-hosting GTM changes analytics fidelity and attribution,
   which is out of scope for a perf pass. *Estimated win: up to ~600 ms TBT,
   which would likely move Lighthouse Performance from 46 into the 60s.*
   Recommended next step: load GTM after hydration / on first interaction.

2. **`@supabase/supabase-js` (186 KB) is in the root-layout First Load**, so
   anonymous marketing visitors download the full auth client via
   `src/components/providers.tsx` / `src/components/auth/AuthSyncClient.tsx`.
   Not fixed because splitting the auth provider out of the root layout is a
   cross-cutting refactor touching every authenticated route, and the brief
   explicitly forbids speculative refactors. *Estimated win: ~186 KB off
   every public route (~22% of the remaining 854 KB).*

3. **React ships twice** — `framework-*.js` (185 KB) and `4bd1b696-*.js`
   (195 KB) both contain `createRoot`/`hydrateRoot`. This is Next's own
   chunking, not application code; changing it means fighting the bundler
   splitChunks config, with real risk and no guaranteed win. *Estimated win:
   up to ~185 KB, low confidence.*

4. **`src/lib/agents/cro-experiments.ts` leaks into a public client chunk.**
   `src/app/(app)/(admin)/admin/funnel/page.tsx` is `"use client"` and does a
   **value** import at line 6:
   `import { getTopHypothesisForStep, type ABTestHypothesis } from "@/lib/agents/cro-experiments";`
   This puts the whole 13.8 KB A/B-test hypothesis catalogue — internal
   growth strategy — into a fetchable chunk. This is the only
   `src/lib/agents/**` leak; every other agent module is clean.
   Not fixed in this pass because the perf impact is nil (admin-only route,
   not in any public route's First Load), and the fix is a structural change:
   `page.tsx` is itself the client component, so it needs to be split into a
   server page that computes the hypothesis map and passes it as props.
   **Tracked as an information-disclosure issue rather than a perf issue —
   it should still be fixed.** *Estimated perf win: 0 KB for public users.*
   Note the correct pattern already exists next door:
   `dashboard/valuation/vc-valuation-dashboard.tsx:10` uses `import type`,
   which is erased at compile time.

5. **HTML routes are `no-store` / `force-dynamic`.** Tempting to make the
   marketing pages static and CDN-cacheable, but they are dynamic on purpose:
   `page.tsx` reads a signed-in hint and the deploy version at request time,
   and the proxy performs per-request Supabase session refresh and locale
   detection. Converting them to static would break the signed-in CTA swap
   and locale handling. With TTFB already at ~103 ms median, the win does not
   justify the risk. *Estimated win: ~80 ms TTFB on cache hits; high
   regression risk.*

6. **`/changelog` ships 57.5 KB of compressed HTML**, 4-5x the other routes.
   It renders the full changelog inline. Paginating it is a product decision,
   not a perf defect. *Estimated win: ~40 KB HTML on one low-traffic route.*

Candidates from the brief that the measurements **ruled out**, so no change
was made: fonts already use `font-display: swap`; HTML compression (brotli)
is already negotiated; static assets already carry `immutable` + 1-year
max-age and hit the Cloudflare edge; the LCP element is text, so
`priority`/`next/image` does not apply.

---

## Method notes

- Manifest-derived First Load JS numbers are misleading — `*_client-reference-manifest.js`
  lists a route's whole client module graph, which suggested every marketing
  route carried recharts. Parsing the actual `<script src>` set from live
  HTML showed only `/` did. All figures here use the latter.
- `.next/app-build-manifest.json` is pruned by the deploy, so route
  composition was derived from the served release under
  `web/releases/<BUILD_ID>/.next/`.
- Chunk sizes are uncompressed on-disk bytes; HTML wire sizes are brotli.
