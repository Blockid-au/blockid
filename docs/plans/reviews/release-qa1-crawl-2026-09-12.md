> **Disposition (2026-09-12):** no P0. P1 #1 mitigated at origin (`email_off` live; `__cf_email__` gone from `/contact`); P1 #2 needs the Cloudflare dashboard (Web Analytics auto-install off — API token lacks Zone Settings); #3–#17 code items → fix agent.

# QA Lane 1 — Crawl / Console / A11y / Forms / Mobile — blockid.au (2026-09-12)

Read-only against production; only writes = 2 allowed POSTs. Raw data: `scratchpad/qa1/` (crawl-results.json, ext-results.json, pw-results.json, pa11y/*.json, shots/).

## Summary counts
| Check | Result |
|---|---|
| Sitemap URLs | 461 (single sitemap, no index) |
| Pages crawled (sitemap + ≤2 hops, internal) | 526 — 519×200, 7×404, 0×5xx, 0 timeouts |
| Redirect chains | 8 (all single-hop 301/307/308, aliases → canonical route) |
| Canonical mismatches | 34 (1 loop, 24 listings + 9 others pointing at homepage) |
| noindex but in sitemap | 1 (/showcase/sprocketbay) |
| HTML > 1.5 MB | 0 (max 0.9 MB) |
| TTFB > 1.5 s | 5 (p50 361 ms, p95 884 ms, max 5.8 s) |
| Duplicate `<title>` | 1 real (2 insight articles); 7 others are redirect aliases |
| Missing `<h1>` | 2 (/auth/login, /verify/valuation/VC-AAAAA-AAAAA) · multiple h1: /legal/disclaimers (6), /legal/privacy, /legal/terms (2) |
| Mixed content | 2 pages (http://www.kilnincubator.com) |
| `<img>` checked | 9 unique — all 200 image/* |
| External hrefs | 364 checked (HEAD→GET fallback, Chrome UA): 281×200, 5 confirmed 404, 54×403 + 7×429 tolerated as bot-blocks, 13 timeouts (gov.au/edu) |
| Playwright 40 pages × 2 viewports | 42 URLs; 0 blank pages, 0 horizontal overflow @400 px, CLS ≤ 0.068 everywhere; React #418 on 37/42; 2 enforced CSP violations on 42/42; email-decode blocked on 36/42 |
| pa11y WCAG2AA | 101 errors on 12/42 pages (89 contrast, 8 unnamed controls, 3 unlabeled inputs, 1 iframe title) |
| Forms | `POST /api/funding/preview` → 200 ok, grant_count 16 / program_count 31 / timeline 46 (88 ms). `POST /api/auth/request` (qa+release@blockid.au) → 200 `{ok:true,ttlMinutes:15}` (142 ms) |
| Mobile nav sheet | Opens (`aria-expanded` → true, 4 links) and closes on Escape on all 38 pages with header |

## P0 — none
No 5xx, no blank pages, both core POST flows succeed, no page fails to render at 400 px or 1280 px.

## P1
1. **Cloudflare Email Obfuscation + strict CSP ⇒ visitors see `[email protected]` instead of support@blockid.au** on 36/42 sampled pages (/funding, /pricing, /contact, /legal/*, /tools/*, /insights/*, /auth/login…). CF rewrites the mailto to `/cdn-cgi/l/email-protection#…` + `<span class="__cf_email__">` and injects `email-decode.min.js`, which the nonce/strict-dynamic CSP blocks (console: `Loading the script 'https://blockid.au/cdn-cgi/scripts/…/email-decode.min.js' violates CSP`, 36 pages). Crawler also records `/cdn-cgi/l/email-protection` → 404 from /developers. Fix: Cloudflare dashboard → Scrape Shield → Email Address Obfuscation = OFF (or wrap emails in `<!--email_off-->`). Not fixable in repo; CSP lives at `web/src/proxy.ts:334`.
2. **React hydration mismatch (`Minified React error #418`) on 37/42 pages** — 34× `args[]=text` (pages with an obfuscated email, see #1) and 3× `args[]=HTML` (/, /tools/cap-table, /tools/funding-plan). Server HTML fetched in-browser contains CF-injected `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/…">` (not present for curl) → React re-renders the whole tree client-side and real hydration bugs are masked. Fix: Cloudflare → Analytics → Web Analytics "automatic setup" OFF (add the beacon manually with the nonce in `web/src/app/layout.tsx` if wanted) + fix #1. Pages without CF injection (/showcase/*, /vi, /verify/*) hydrate cleanly, confirming the cause.
3. **Sitemap lists 4 URLs that 404**: /api-pricing, /company, /founding-50, /live — `web/src/app/sitemap.ts:655, 662, 669, 694` (no matching route under `web/src/app/`). Remove or ship the routes.
4. **Broken internal links to non-existent tools** `/tools/valuation-calculator` and `/tools/pre-money-valuation-calculator` (both 404) from 8 articles: `web/content/insights/{valuation-cap-table-impact-fundraising, startup-valuation-for-secondary-sales-australia, startup-valuation-impact-on-tax-australia, startup-valuation-for-seed-extension-bridge-rounds, startup-valuation-for-employee-share-schemes-australia, startup-valuation-for-seed-round-australia, startup-valuation-cap-table-impact-calculator, startup-valuation-for-employee-equity-grants}.md` (+ `manifest.json`, `topic-queue.json`). Nearest live route: /tools/idea-valuation.
5. **Canonical loop + self-deindexing canonicals**: `/index` declares canonical `https://blockid.au/startup-index`, which 301s back to `/index` (`web/src/app/startup-index/page.tsx:21 path: "/startup-index"`; rewrite in `next.config.ts:41`). `/index/listings` and all 24 `/index/listings/{TICKER}` pages, `/showcase/sprocketbay`, `/auth/login`, `/s/4GmrFM7TPJZr` inherit the root default `alternates.canonical = SITE_URL` (`web/src/app/layout.tsx:113-115`) → they tell Google "the homepage is the canonical". Add per-route `alternates.canonical` in `web/src/app/startup-index/listings/page.tsx` and `listings/[ticker]/page.tsx`; drop the root-level canonical default.
6. **A11y errors on conversion pages** (WCAG2AA, pa11y):
   - /auth/login: email and password inputs have no accessible name (`H91.InputEmail.Name`, `H91.InputPassword.Name`, `F68`) — `web/src/app/auth/login/login-form.tsx:539` (placeholder-only). Also no `<h1>` on the page.
   - /signup: Stripe card `<iframe>` has no `title` (`H64.1`) — signup form label:nth-child(6); card-required trial form.
   - /tools/esic: 5 `<button>` without name + 3 `<input type=range>` without label (`H91.Button.Name`, `H91.InputRange.Name`) — `web/src/app/tools/esic/esic-checker.tsx:270-300` (no `aria-label`).
7. **Colour contrast fails site-wide**: `--color-ink-400: #94a3b8` on white = 2.56:1 (59 hits: tools/cap-table 25, dilution 11, funding-plan 11, esic 10, insights meta/dates, showcase "·" separators) and `--color-gold-600: #d97706` eyebrow text = 3.19:1 (11 hits, "Free tool · No login" on every /tools/* hero) — `web/src/app/globals.css:20, :51`. pa11y recommends #68778c / #b46100. Also `text-surface-400` "or continue with email" 1.48:1 (/auth/login) and `text-line` "·" 1.39:1 (home section 9).

## P2
8. **2 enforced CSP violations on every page**: two inline scripts `(function(w,i,g){…` / `(function(w,d,s,l){…` injected by the GTM container (GTM-TRHH4MH2 Custom-HTML tags via innerHTML → not covered by `strict-dynamic`). Those tags never execute. GA4 itself loads fine (gtag present, dataLayer populated). Fix in GTM (convert to native tags) or add hashes in `web/src/proxy.ts:334`.
9. **Stale `Content-Security-Policy-Report-Only` header** (no googletagmanager / google-analytics / accounts.google) emits 6–8 report-only violations per page view → noise in any CSP report sink. `web/src/proxy.ts` (report-only block).
10. **Google Sign-In partially blocked** on /auth/login: `Framing 'https://accounts.google.com/' violates frame-src https://js.stripe.com https://hooks.stripe.com` (enforced) and `gsi/style` blocked by `style-src`. The visible button iframe renders (402×44) but a secondary GSI frame is refused — add `https://accounts.google.com` to `frame-src` (and `style-src`) in `web/src/proxy.ts`, then verify One Tap / popup flow.
11. **Invalid SVG `rx="12 12 0 0"`** (console error, attribute takes one length) in 37 insight articles, e.g. `web/content/insights/{cap-table-template-australian-startups, startup-metrics-investors-care-about, startup-data-room-checklist-2026, ai-startup-valuation-how-it-works}.md`. Header bar renders square; use a `<path>` or `clip-path`.
12. **Duplicate article** with identical `<title>` "Optimise Cap Table for M&A Exit…": `content/insights/optimise-startup-cap-table-for-acquisition-exit.md` and `optimising-startup-cap-table-for-acquisition-exit.md` — keep one, 301 the other.
13. **noindex page in sitemap**: /showcase/sprocketbay (`robots: { index:false }` at `web/src/app/showcase/sprocketbay/page.tsx:53`) but listed in `sitemap.ts`.
14. **Mixed-content / broken external links** (confirmed with GET, Chrome UA):
    - `https://spacecubed.com/labs/` → 404, linked from the partner badge on ~500 pages (`web/config/marketing-partners.json:26`).
    - `https://twitter.com/blockid_au` → 404 (also 404 on x.com) — `web/src/app/(marketing)/contact/page.tsx:108`.
    - `https://asic.gov.au/for-business/director-duties/` → 404 — `content/insights/startup-board-first-meeting-australia.md`.
    - `https://en.wikipedia.org/wiki/SafetyCulture` → 404 — `web/src/lib/showcase/safetyculture/fixture.ts`.
    - `https://braindump.maxoxo.me/posts/…atlassian…` → 404 — `web/src/lib/showcase/atlassian/fixture.ts`.
    - `http://www.kilnincubator.com/` (plain http, 429) on /funding/programs/canberra and /cbr-kiln-incubator — `web/content/data/programs-au.seed.json`.
    - 13 gov.au/edu timeouts (asca, dewr, nrf, defence, health, avcal, xero media) — likely WAF; spot-check manually.
15. **TTFB > 1.5 s**: /index/listings/FINT-QNF, FINT-FPI, FINT-BPU 2.2–2.3 s (`web/src/app/startup-index/listings/[ticker]/page.tsx` — uncached aggregate); /s/4GmrFM7TPJZr/report 5.8 s (on-demand PDF); /insights/startup-salary-benchmarks-australia-2026 1.5 s.
16. **Heading structure**: /auth/login and /verify/valuation/VC-AAAAA-AAAAA (invalid-code state) have no `<h1>`; /legal/disclaimers has 6 `<h1>`, /legal/privacy and /legal/terms 2 each (`web/src/app/(marketing)/legal/*`).
17. **Mobile (400 px)** — no overflow on any of 42 pages, nav works. Findings:
    - /funding "improve my match" demographic checkboxes are 13×13 px (< 24 px target) — `web/src/app/(marketing)/funding/*` intake form; wrap in a ≥24 px label hit-area.
    - Text < 12 px: /docs/unlocks matrix uses 11 px on 777 nodes (`web/src/app/(marketing)/docs/unlocks/page.tsx:105,117` + `th.px-3`), /insights category badges 10 px (107 nodes, `text-[10px]`), showcase stage chips 10 px (`web/src/components/showcase/public-record-showcase.tsx:85-88`), home mono labels 11 px (52 nodes, `font-mono text-[11px]`).
    - Inline text links 16–20 px tall are the bulk of "small target" hits; exempt under WCAG 2.5.8 inline exception, not counted.
18. /developers: contact mailto rewritten by CF to `/cdn-cgi/l/email-protection` (404 for non-JS UAs / crawlers) — resolves with P1 #1.
19. /signup never reaches `networkidle` on desktop (Stripe telemetry `r.stripe.com/b` ×19 in 12 s) — not a defect, but post-deploy smoke must not wait on networkidle for this page (`web/scripts/deploy-live.sh` Gate 11).

## Passed / no action
- 519/526 internal URLs 200; all 8 redirects single hop to the right target; no 5xx, no timeouts, no >1.5 MB pages.
- All `<img>` OK; no mixed-content assets (only the 1 http anchor above).
- CLS ≤ 0.068 on both viewports (worst /vi/id/blockid-demo); no layout-shift screenshots needed.
- 30/42 pages pass pa11y WCAG2AA with 0 errors, incl. /, /pricing (both tabs), /funding, /contact, /compare/*, /solutions/*, /legal/*, /vi/*.
- Both form endpoints return correct shapes; no Stripe / paid objects touched.

## Recommendation
**GO with conditions**: fix P1 #1–#2 in the Cloudflare dashboard today (5-minute change, removes the hydration error and the `[email protected]` text on every marketing page), ship a small PR for #3–#5 (sitemap, 8 md links, canonicals) before the next SEO crawl, and schedule #6–#7 (login labels, esic controls, ink-400/gold-600 tokens) in the a11y sprint.
