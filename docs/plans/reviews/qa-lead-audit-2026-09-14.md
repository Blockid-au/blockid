# QA lead production audit — 2026-09-14

**Date:** 2026-09-14 02:20–03:00 UTC · **Target:** https://blockid.au (v3.12.0, last deploy 01:33 UTC, 12/12 gates) · **Scope:** breadth + edge cases the 157-test `tests/live-qa` suite does not cover (that suite was green and NOT re-run). Source read-only; nothing under `src/` was changed. Throwaway account `qa-audit-20260914@blockid.au` created, exercised and erased (see § Erasure).
**Method:** node/curl sitemap crawl (concurrency 5), Playwright 1.60 headless Chromium (console, CSP `securitypolicyviolation`, hydration probes, 390 px mobile), `@axe-core/playwright` 4.12 (WCAG 2.x A/AA + best-practice), curl API probes, Stripe read-only price retrieval (amounts only, no secrets printed), `/api/status` with Bearer from `.env.runtime` held in a shell var.

## Verdict

**GO for the trial wave with two fixes first**: (1) rotate/replace the invalid Anthropic API key so customer reports are not running on a personal CLI credential + US$1.55 of OpenRouter; (2) the `<title>` inside SVG `<figure>`s renders empty on the server and throws a React #418 hydration mismatch on `/` and five other public pages. Everything money-, auth- and CSRF-related passed.

## Summary counts

| Lane | Checks | PASS | FAIL / findings |
| --- | --- | --- | --- |
| 1 Crawl | 452 sitemap URLs + robots + 10 variant URLs | 452/452 HTTP 200, 0 redirects, 0 5xx, 0 soft-404, 452/452 title + canonical, 0 pages > 3 s TTFB (p50 119 ms, p90 162 ms, max 834 ms `/status`) | 1 × P2 (plain-HTTP served without redirect), 3 × P3 |
| 2 Console + CSP | 15 key pages (+6 follow-up pages) | 0 application console errors; 0 network failures other than aborted GA beacons; hydration interaction PASS on `/pricing` and `/analyze` | 1 × P2 (React #418 on 6 public pages); Cloudflare tag-gateway CSP blocks counted separately: **30** (2 per page, every page) |
| 3 Auth + edge cases | 34 probes | 33 | 1 × P3 (`/api/*` unknown route returns HTML 404, not JSON) |
| 4 Money paths | 22 probes | 22 | 0 (1 × P3 hygiene: credit-pack Stripe prices have `tax_behavior: unspecified`) |
| 5 A11y + mobile | 5 pages × (axe desktop + 390 px) | 4/5 axe clean; 5/5 no horizontal scroll, no clipped header/H1 | 1 × P3 axe serious (`.au` logo span contrast 3.68:1 on `/auth/login`); 1 × P2 UX (`/analyze` has no nav/footer) |
| 6 Ops signals | status, crons, disk, mem, nginx, backups | disk 19 %, mem 30 %, uptime guardian healthy, 96 cron entries, local backup OK | 1 × P1 (AI provider posture), 2 × P2 (off-site backup, bq-export), 2 × P3 (`audit_chain: unknown`, 8 GA4 events never seen) |

**Totals: P0 0 · P1 1 · P2 5 · P3 11.**

## Findings (P0–P3)

| # | Sev | Lane | Route / area | Finding | Repro / evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | **P1** | 6 | AI providers (`/api/status` auth view, `content/reports/ai-provider-status.json` 02:30 UTC) | `anthropic: invalid_key` (HTTP 401). The only valid Claude path is `claude-oauth`, self-described as "personal CLI credential — not a product licence"; `openrouter: low_credit` US$1.55 < US$2 floor (16/33 free models healthy, 5 `not_found`). A trial-user wave will run customer reports on a credential not licensed for product use, plus free-tier Groq/Cerebras/SambaNova/DeepInfra. | `curl -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/status \| jq .ai_providers` | Issue a fresh Anthropic API key (org account) into `.env.runtime` + restart; top up OpenRouter ≥ US$20 before the wave; keep `claude-oauth` as dev-only. |
| F2 | **P2** | 2 | `/`, `/showcase/atlassian/svi-report`, `/showcase/atlassian/valuation`, `/showcase/atlassian/growth-phases`, `/tools/funding-plan`, `/tools/cap-table` | React error #418 (hydration mismatch, "HTML") on every load; the whole root is regenerated client-side. Root cause: SVG `<title>` with **array** children (`Eight scoring dimensions for a {stage} run`) — React 19 renders `<title id="radar-title-revenue"></title>` (empty) on the server, then the client renders the text. Server HTML also loses the SVG's accessible name (`aria-labelledby` → empty title). Server HTML of the showcase pages contains 13/16/20 empty `<title>` elements; `/tools/funding-plan` 3. Cloudflare tag-gateway scripts were stripped in a controlled run and the error persisted, so it is app-side. | Playwright `page.on('pageerror')` on `/` → `Minified React error #418; …args[]=HTML` 3/3 runs; `curl https://blockid.au/ \| grep -o '<title id="radar-title-revenue"></title>'`. Not reproduced on `/pricing`, `/vi`, `/startup-index`, `/analyze`, `/id/blockid-demo`. | Make every SVG `<title>`/`<desc>` child a single template-literal string: `web/src/components/marketing/homepage/dimension-radar.tsx:99`, `web/src/app/showcase/atlassian/{growth-phases:156, svi-report:223, valuation:224}/page.tsx`, `web/src/app/tools/funding-plan/funding-plan-tool.tsx:953`, `web/src/app/tools/term-sheet/term-sheet-tool.tsx:1343`, `web/src/app/tools/cap-table/cap-table-diff.tsx:734`, `web/src/components/workspace/{svi-chart:150, metrics-dashboard:195}.tsx`. Add a live-qa assertion `pageerror.length === 0` on `/`. |
| F3 | **P2** | 1 | `http://blockid.au/` (any path) | Plain HTTP is served as a full 200 page — no 301 to HTTPS. HSTS (`max-age=63072000; includeSubDomains; preload`) protects returning browsers, but first-visit / non-browser clients get cleartext content. | `curl -sI http://blockid.au/pricing` → `HTTP/1.1 200 OK` (Cloudflare) | Cloudflare → SSL/TLS → Edge Certificates → **Always Use HTTPS = On** (or a redirect rule `http://*blockid.au/*` → 301 https). No code change. |
| F4 | **P2** | 5 | `/analyze` | The main conversion page (hero search hands off here; `/score` 301s here) ships **no header, nav or footer** — the only link in the server HTML is `/tbr/demo`. A trial user who lands here has no path to Sign in / Pricing / Home / Privacy except the in-flow panels or browser back. `/analyze` sits outside the `(marketing)` route group so it never gets `NavV2` + footer. | `curl https://blockid.au/analyze \| grep -c '<header\|<nav'` → 0; 390 px probe `header: null`. | Render `NavV2` (compact variant) + the marketing footer in `web/src/app/analyze/page.tsx`, or move the route under `(marketing)`. |
| F5 | **P2** | 6 | `db-backup-offsite` cron | Off-site copy has failed every run: "Service account has no Drive quota — founder action: run `scripts/db-backup-offsite-auth.mjs` once (adds `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`) or move the folder to a Shared Drive". Local dump OK (17.1 MB, sha256 recorded, 02:20 UTC). Only one copy of the DB exists, on the same disk as production. | `tail -1 web/content/reports/backup-health.jsonl` → `"job":"offsite","status":"fail"` | Founder runs the one-off OAuth script before the wave (known item; escalating because the wave adds data). |
| F6 | **P2** | 6 | `/api/cron/bq-export` | Fails with exit 127 `sh: 1: tsx: not found` — the route spawns `npx tsx` from the standalone release cwd (`/data/releases/<id>`), which has no `node_modules/.bin/tsx`. GA4/BigQuery event export has not run today. | `web/content/reports/cron-health.jsonl` 02:15 UTC `bq-export … exit_code 127` | Spawn the repo's absolute `node_modules/.bin/tsx` (or precompile the script into the release); `web/src/app/api/cron/bq-export/route.ts:46`. |
| F7 | P3 | 1 | 9 program records (`web/content/data/programs-au/*.json`) | Editorial placeholders leak into public pages **and meta/og descriptions**: "2026 theme not found — verify.", "No 2026 news — verify.", "Program URLs 404 — verify intake.", "FI warrant (verify)", "Dates sparse — verify.", "(verify year)", "Entered administration 2025 … — verify membership terms." e.g. `/funding/programs/sydney/syd-x15-xccelerate` `<meta name="description" content="… 2026 theme not found…">`. These were the only "soft-404" text hits in the crawl (false positives otherwise). | `grep -rhoE '"[^"]*verify[^"]*"' web/content/data/programs-au/*.json` | Move `— verify` notes into a non-rendered `editor_notes` field; add a seed test that public strings never contain `verify`/`TBC`. |
| F8 | P3 | 1 | `/vi/*` (12 sitemap URLs) | With `CSP_PUBLIC_HASH_MODE` (S31-D, enabled 02:01 UTC) the server always emits `<html lang="en-AU">` — even on `/vi/pricing`, which is still dynamic (`x-blockid-csp: nonce`, `private, no-store`) and whose `<title>` is Vietnamese. Client syncs `lang` after hydration; crawlers/AT see the wrong language in the document. Documented S31-D trade-off, recorded so it is a conscious one. | `curl -s https://blockid.au/vi/pricing \| grep -o '<html lang="[^"]*"'` → `en-AU` | For routes that are dynamic anyway (`/vi`, `/vi/pricing`, `/vi/id/*`), derive `lang` from the URL prefix instead of `headers()`. |
| F9 | P3 | 1 | `https://www.blockid.au/` | Serves 200 (duplicate host) instead of 301 → apex; canonical is correct so SEO impact is limited. | `curl -sI https://www.blockid.au/` → 200 | Cloudflare redirect rule www → apex 301. |
| F10 | P3 | 3 | `/api/<unknown>`, `/api/auth/<unknown>`, `/api/v1/<unknown>` | Unknown API routes return the HTML 404 shell (`text/html`, 164 KB) instead of `{ ok:false, error:"not_found" }` JSON. SDK/partner callers parse HTML. | `curl -s -o /dev/null -w '%{content_type}' https://blockid.au/api/no-such` → `text/html` | Add `web/src/app/api/[...404]/route.ts` returning JSON 404 (`Cache-Control: no-store`). |
| F11 | P3 | 4 | Stripe prices `STRIPE_PRICE_CREDITS_5/10/25/50/100` | Amounts match code exactly (500/900/2000/3500/6000 AUD, live, active, one_time) but `tax_behavior: unspecified`; checkout relies on the account default `inferred_by_currency` (→ inclusive for AUD). Trust Report (300) and Startup Package (14900) are explicitly `inclusive`. | Stripe `prices.retrieve` (read-only) | Set `tax_behavior=inclusive` on the five credit prices so a future default change cannot add GST on top. |
| F12 | P3 | 5 | `/auth/login` | axe: `.text-brand-500` "`.au`" wordmark span, `rgb(59,130,246)` on white, 18 px → 3.68:1 (< 4.5:1, serious). Heading order: page H1 then footer `<h4>` column titles (moderate). | lane 5 `results.json` | Use `text-brand-600` for the wordmark (or `aria-hidden` + full-name alt); footer headings → `<h2 class="sr-only">` + `<h3>`. |
| F13 | P3 | 6 | `/api/status` (auth) `audit_chain: "unknown"` | Cron `audit-chain-verify` ran OK 2026-09-13 03:40 UTC (1083 rows, no break), but `content/reports/audit-chain-verify.json` does not exist in any `/data/releases/*` content dir, so the status endpoint reports `unknown` (> 48 h rule) while the anon `services[]` row says `ok` (that one is the EVM RPC probe). | `ls /data/releases/*/content/reports/audit-chain-verify.json` → none | Persist the state file the same way `cron-health.jsonl` is (hard-linked shared `content/reports`). |
| F14 | P3 | 6 | `ga4_events` | `missing: hero_variant_shown, funding_preview, funding_paywall_hit, funding_report_paid, evaluator_pricing_viewed, evaluator_checklist_viewed, compare_viewed, funding_directory_viewed` — 8 instrumented events have never been seen by GA4. Every beacon captured in lane 2 carried consent-mode `gcs=G100` (analytics denied), which is the likely reason. | `/api/status` auth view | Fire one consented session per event before the wave; verify consent-update wiring. |
| F15 | P3 | 3 | `/api/auth/reset-password` | Per-IP limit is 3 requests / 15 min keyed on the first `x-forwarded-for` hop. A cohort behind one NAT (accelerator office, university) hits 429 on the 4th reset; the 429 body has no `Retry-After`. Login lockout (5 / 15 min per e-mail+IP) is fine. | 4th POST in this audit → 429 | Raise to 10 / 15 min per IP + per-e-mail 3 / 15 min; add `Retry-After`. |
| F16 | P3 | 2 | `/auth/login` | `/api/auth/me` is fetched 3× on one page load and the page never reaches Playwright `networkidle` (GSI + GA keep-alive). Not user-visible. | lane 2 request timeline | Share one `me` result via a provider. |
| F17 | P3 | 3 | Session cookie | `blockid_session` is `Secure; HttpOnly; SameSite=Lax` (PASS) with `Max-Age=7776000` (90 days), no idle timeout. | `Set-Cookie` on register | Consider 30 days + sliding renewal. |

**Counted separately (documented founder item):** Cloudflare tag gateway (`google_tags_first_party`, `GTM-TRHH4MH2`) injects two inline scripts at lines 1–2 of every HTML document; both are blocked by the hash CSP → exactly 2 `script-src-elem` violations + 2 console errors on all 15 pages (30 total). No other CSP violation and no application console error was recorded on any page.

## Lane 1 — crawl (452 URLs)

| Check | Result |
| --- | --- |
| Status | 452 × 200; redirect hops 0 (sitemap URLs are all final); `/pricing/` → 308 `/pricing`; `/PRICING`, `/no-such`, `/vi/no-such` → real 404 (`noindex` shell) |
| `x-blockid-csp` | hash 435 · nonce 17 (`/vi`, `/vi/pricing`, `/analyze`, `/status`, `/changelog`, `/roadmap`, `/team`, `/investor`, `/listings`, `/one-click-report`, `/tools/cofounder-match`, `/security-audit`, `/funding/programs`, `/id/*-demo`, `/vi/id/*-demo`) |
| `cache-control` | `public, s-maxage=600, swr=600` 272 · `s-maxage=3600` 123 · `s-maxage=300` 3 · `private, no-store` 54 (the 17 nonce pages + `/tools/*` calculators, `/demo`, `/contact`, `/vi/solutions/*`, `/features`, `/developers`, `/how-it-works`, `/sample*`, `/tbr/demo`, `/funding/report/demo`, `/business-id`) |
| Cloudflare | `cf-cache-status: DYNAMIC` on all 452 (HTML is not edge-cached; origin ISR does the work — TTFB is fine so this is informational) |
| Title / canonical / H1 | 452/452 present; 0 canonical ≠ URL; 0 duplicate titles; 0 pages < 5 KB |
| Soft-404 | 0 (5 text hits inspected: all legitimate content, 1 is F7) |
| TTFB | p50 119 ms · p90 162 ms · p99 307 ms · max 834 ms (`/status`); 0 > 1.5 s |
| Locale twins | 12 `/vi/*` URLs, all 200 with Vietnamese titles, `x-blockid-locale: vi`; hreflang pairs present in sitemap; `<html lang>` see F8 |
| robots.txt | Cloudflare managed AI-crawler block + `Disallow: /api/ /admin/ /workspace/ /dashboard/ /auth/verify /unsubscribe`; sitemap declared |
| Auth-gated | `/workspace`, `/admin`, `/dashboard` → 307 `/auth/login?next=…` |

## Lane 2 — console, CSP, hydration (15 pages)

All 15 loaded 200 in 1.6–2.1 s to `networkidle`; `document.scrollWidth === innerWidth` at 1280 px on all; `window.next.router` present on all (hydrated).

| Probe | Result |
| --- | --- |
| Application console errors | 0 |
| Page errors | `/` → React #418 (F2). Follow-up sweep found the same on 5 more public pages; `/pricing`, `/vi`, `/startup-index`, `/id/blockid-demo` clean |
| CSP violations | 30, all Cloudflare tag gateway (2 per page) — no first-party violation |
| Failed requests | only `net::ERR_ABORTED` on GA `g/collect` beacons and RSC prefetches during navigation (benign); 0 HTTP ≥ 400 |
| `/pricing` interaction | tablist `Founder / Evaluator`; click Evaluator → `data-active-tab` founder→evaluator, `evaluator-ladder` visible, URL `?segment=evaluator` — PASS |
| `/analyze` interaction | CTA disabled when empty → enabled after typing (label "Classify my idea", chip "Idea · 14 words — more detail sharpens it") → disabled again when cleared — PASS |

## Lane 3 — auth and edge cases (API)

| Probe | Expected | Got | Result |
| --- | --- | --- | --- |
| Register weak password (`short`) | 400 generic | 400 `Password must be at least 8 characters` | PASS |
| Register malformed JSON | 400 | 400 `Invalid request body` | PASS |
| Register wrong content-type (`text/plain` form body) | 400 | 400 `Invalid request body` | PASS |
| Register missing / invalid e-mail | 400 | 400 `Valid email is required` | PASS |
| Register 1 MB body | 4xx, no 5xx | **413** from nginx (HTML) in 0.45 s | PASS (HTML body acceptable at the edge) |
| Register real account (`displayName` with `<script>`) | 200 + session | 200, name stored as `QA Audit alert(1)` (tags stripped), 3 welcome credits | PASS |
| Register duplicate e-mail | same generic 200 as fresh | 200 `{ok:true,pending:true,"Check your email…"}` — no enumeration | PASS |
| Login wrong password ×7 | 401 ×5 then 429 | 401 ×5 (generic body), 429 ×2 with `Retry-After: 896` | PASS |
| Login unknown e-mail | same 401 body/timing | identical body, 207 ms | PASS |
| Reset unknown vs known e-mail | identical 200 | identical `{ok:true,"If an account exists…"}`; 182 vs 275 ms | PASS |
| Reset malformed body | 400 | 400 `invalid_json` | PASS |
| Session cookie flags | HttpOnly; Secure; SameSite | `Secure; HttpOnly; SameSite=lax; Path=/; Max-Age=7776000` | PASS (F17 note) |
| Logout invalidates | replayed token → anon | 307 `/`, cookie expired; replayed token → `/api/auth/me` `{user:null}`, `/api/credits` 401 | PASS |
| Logout GET | 405 | 405 | PASS |
| CSRF: cross-site POST with session → `/api/credits`, `/api/projects`, `/api/analyses` | 403 | 403 `cross_site_request` ×3; same-origin control → normal 400 | PASS |
| CSRF on `/api/auth/logout` cross-site | 403 | 403 | PASS |
| `/api/*` unknown route | 404 JSON | 404 **HTML** | FAIL (F10) |
| Trailing slash `/api/credits/`, `/api/auth/me/` | redirect or same | 308 → canonical | PASS |
| Uppercase `/API/credits`, `/api/CREDITS` | 404 | 404 | PASS |
| HEAD `/api/auth/me`, `/api/credits`, `/api/status`, `/pricing` | 200/401/200/200 | 200/401/200/200 | PASS |
| OPTIONS same 4 | 204 + Allow / 405 | 204 `Allow: GET, HEAD, OPTIONS[, POST]` ×3; `/pricing` 405 | PASS |
| `/pricing?feature[]=a&feature[]=<script>…&segment[]=x&tab=__proto__&coupon=%00` | 200, no reflection | 200, 0 reflections | PASS |
| `/analyze?claimed[]=x&claimed=<b>&id[]=1` | 200, no reflection | 200, 0 reflections | PASS |

## Lane 4 — money paths (no spend)

| Probe | Result |
| --- | --- |
| `CREDIT_PACKS` (`web/src/lib/credit-packs.ts`) 5/A$5 · 10/A$9 · 25/A$20 · 50/A$35 · 100/A$60 vs Stripe live prices (`STRIPE_PRICE_CREDITS_*`, `.env` == `.env.runtime`) | 5/5 MATCH (unit_amount, AUD, active, one_time, livemode) — F11 on `tax_behavior` |
| Same ladder vs `/workspace/billing#credits` SSR | 5/5 labels, prices, per-credit rates (A$1.00→A$0.60) and "Save 10–40 %" badges match |
| Same ladder vs `/pricing` Evaluator tab PAYG note | "Credit packs run from A$5 (5 credits) to A$60 (100 credits)"; Trust BizReport A$3 — matches `TRUST_REPORT_5AUD` (300 c, inclusive) |
| Founder / Evaluator ladders vs `plans-v2.ts` | A$29 / A$69 (founder), A$79 / A$149 / A$349 (evaluator) — match `monthly_aud` |
| `GET /api/credits` (auth) | `{balance:3, plan:"free", transactions:[plan_grant 3]}` |
| `POST /api/credits {amount:5}` | 200 `{ok:true,url:"https://checkout.stripe.com/c/pay/cs_live_…"}` — Checkout Session created, nothing charged |
| `POST /api/credits` amount 7 / "10" / -5 / 1e3 / null | 400 `Invalid credit pack. Choose one of: 5, 10, 25, 50, 100` ×5 |
| Preview shape — `listing/readiness/pdf` (asx, nasdaq) | 200 `{preview:true, cost:1, listedCost:1, included:false, includedVia:null, alreadyCharged:false, balance:3, creditNote:"Charged to your credits."}` — consistent |
| Preview shape — `dividends/tax-statements` GET | 200 `{cost:2, listedCost:2, included:false, includedVia:null, …}`; POST preview with no statements → 409 `no_statements` (correct) |
| Preview shape — `expenses/categorise` | 409 `nothing_to_categorise` on an empty project (correct; the live-qa suite covers the seeded path) |
| `board-resolutions/dividend/<uuid>`, `dividends/<uuid>/statements` | 404 `not_found` for foreign ids; 404 `project_required` without a project cookie; 400 `exchange must be asx or nasdaq`, 400 `bad_fy` on bad input |
| `POST /api/reports/checkout` invalid SKU / wrong field / numeric / non-JSON | 400 `businessId must be a uuid` ×3, 400 `Invalid JSON body` |
| `POST /api/stripe/webhook` no signature / bad signature / GET | 400 `Missing stripe-signature header` / 400 `Invalid signature` / 405 |

## Lane 5 — accessibility and mobile

| Page | axe serious/critical (desktop) | 390 px | Notes |
| --- | --- | --- | --- |
| `/` | 0 | no h-scroll; header 390 w; H1 within 16–374 px; mobile menu button present | — |
| `/pricing` | 0 | no h-scroll; header OK | — |
| `/analyze` | 0 | no h-scroll | no header/footer at all (F4) |
| `/funding/grants` | 0 | no h-scroll; header OK | — |
| `/auth/login` | 1 serious (`.au` wordmark contrast), 1 moderate (heading order) | no h-scroll; header 86 px OK | F12 |

Programmatic clip check on all 5: 0 elements outside the viewport, 0 nowrap text clipped (only `sr-only` skip links / landmark H2s, by design), 0 header tap targets < 24 px. Screenshots (390 × 844 @2x, viewport + full page) were captured to the session scratchpad (`lane5/m390_*.png`), not committed.

## Lane 6 — ops snapshot (02:54 UTC)

| Signal | Value |
| --- | --- |
| `/api/status` anon | trimmed: version v3.12.0, services db/stripe/audit_chain/ga4 all `ok`, uptime 24 h 100 %, last deploy 01:33 UTC 12/12 gates — no internal fields leaked |
| `/api/status` auth | `backups: ok` · `schema_migrations: ok` · `audit_chain: unknown` (F13) · `oauth_tokens_sealed: ok` · `ai_queue_depth: {queued:0, running:0, max_concurrent:120}` · `ga4_events: missing 8` (F14) |
| AI providers | anthropic **invalid_key** · claude-oauth valid (personal) · openrouter **low_credit US$1.55** · groq / cerebras / sambanova / deepinfra valid · claude-proxy / ollama not configured (F1); model health 16/33 healthy |
| Crons | `crontab -l` 669 lines / 96 active entries; 820 cron-health rows in 24 h, **4 failures**: `svi-snapshot` 500 (09-13 16:00), `growth-insights` 500 after 129 s (09-13 18:00), `bq-export` exit 127 (F6), `db-backup-offsite` Drive quota (F5); all `crons[]` rows report 100 % ok-rate (the two 500s were single misses) |
| Disk / memory | `/` 276 G, 48 G used (19 %); RAM 50 G, 15 G used, 35 G available, swap 0 |
| Uptime guardian | healthy=1, http_local 200, load 0.85 / 8 cores, fail_count 0, uptime 43 d |
| Backups | local `db-20260914T022001Z.dump.gz` 17.1 MB OK (keep 14 daily / 8 weekly); off-site FAIL (F5) |
| nginx error log (last 200) | 1 × `connect() failed (111) upstream 127.0.0.1:4001` at 02:01:01 UTC = the S31-D restart window; 0 upstream timeouts; 0 5xx otherwise |
| Services | `blockid-anvil`, `blockid-explorer`, `blockid-upload` active; `next-server` pid on :4001 from `/data/releases/Zv7USIh9b-69T28YP8Dv0` |

## Erasure confirmation

`qa-audit-20260914@blockid.au` (user `cdf42c8b-d10a-437d-baf7-25866940f20f`, project `qa-audit-startup-2026-09-14`) — dry-run showed 8 tables / 7 deletes / 3 anonymise / no Stripe customer; `--write` completed; post-check `no app_users row`; login now 401. One Stripe Checkout Session (`cs_live_…`, A$5 pack) was opened and never completed — it expires on its own in 24 h with no customer object. The session-cookie files were deleted from the scratchpad. Side effects to be aware of: an "existing account" notice and a password-reset e-mail were sent to the throwaway address (non-existent mailbox), and the audit tripped the per-IP reset limit for this server's egress IP for 15 min.

## Not covered here (already green elsewhere)

`tests/live-qa` 157/157 (workspace flows, seeded previews, gates) · unit/integration suites · S31-D header verification in the SOT.
