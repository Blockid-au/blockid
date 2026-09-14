# Public-page caching — hash-mode CSP + edge cache (S31-D, 2026-09-14)

**Status: shipped behind `CSP_PUBLIC_HASH_MODE`, default OFF.** With the flag
unset the site behaves exactly as before this change (per-request nonce CSP,
every route dynamic, `cache-control: private, no-store`). Turning it on makes
the public marketing / SEO pages static (ISR) and shared-cacheable at
Cloudflare and, optionally, an nginx micro-cache. Origin of the work:
`docs/plans/reviews/capacity-audit-2026-09-13.md` §3 + action 11 — the single
`headers()` call in the root layout (CSP nonce) pinned the box at ~50 public
page renders/s.

## 1. Why a nonce could never be cached, and what replaced it

A CSP nonce is per request; the HTML that carries it is therefore per request.
Next.js documents this bluntly: *"When you use nonces in your CSP, all pages
must be dynamically rendered … Pages cannot be cached by CDNs"*
(`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
Next's own `self.__next_f.push(…)` flight-data script is inline and different
for every page and every regeneration, so no build-time hash list can cover
it either — that is why "hash-based CSP" in Next normally means `'unsafe-inline'`.

The approach here keeps `script-src` free of `'unsafe-inline'` / `'unsafe-eval'`
on cacheable pages:

| Mode | `script-src` | When |
| --- | --- | --- |
| **nonce** (unchanged) | `'self' 'nonce-…' 'strict-dynamic' <first-party hashes> <hosts>` | every per-request render; everything when the flag is off |
| **hash** (new) | `'self' <document hashes> <first-party hashes> <hosts>` | flag on **and** a prerendered / ISR document exists for the route |

*Document hashes* are SHA-256 sources of every executable inline `<script>` in
the exact HTML Next will serve. Next's file-system incremental cache keeps
every static / ISR app page at `.next/server/app/<route>.html`
(`index.html` for `/`), written by `next build` and rewritten in place on each
background regeneration. The proxy (`web/src/proxy.ts` → `planPageResponse()`)
`stat`s that file per request (µs), re-hashes only when mtime/size change, and
keeps the previous hash sets in the policy for 10 minutes after a change so a
request that straddles a regeneration is never blocked
(`web/src/lib/security/prerender-script-hashes.ts`). No `'strict-dynamic'` in
hash mode: a static document's `/_next/static` chunks carry no nonce, so they
are allowed by `'self'` and third parties by host, as in the CSP2 fallback list.

*First-party hashes* (theme restore, consent-mode default, GA / GTM
bootstraps) come from one module, `web/src/lib/security/inline-scripts.ts`,
rendered verbatim by `app/layout.tsx` and `components/analytics/google-analytics.tsx`
and hashed by `lib/security/inline-script-hashes.ts`. They ride in **both**
modes, which is what let every `headers()` read for the nonce be deleted
(root layout, `(marketing)/layout.tsx`, the three JSON-LD components — JSON-LD
data blocks are never CSP-checked and never needed one). Next still threads
the nonce onto its own scripts on dynamic pages by parsing the request's
CSP header; no layout code is involved.

Debug header on every page response: `x-blockid-csp: nonce | hash`.

## 2. What the flag does, exactly

`CSP_PUBLIC_HASH_MODE=1` is read in two places:

1. **`web/src/app/layout.tsx` at render time.** Flag off → the layout reads
   the proxy-resolved locale from `headers()` (today's behaviour; keeps every
   route dynamic). Flag on → the layout touches nothing request-scoped, so
   every page without its own dynamic API use is prerendered at `next build`
   / regenerated per its `revalidate`. The locale is then resolved on the
   client (`components/i18n/translation-provider.tsx`: `blockid_locale`
   cookie, else `/vi` prefix) and `<html lang>` is synced there; the server
   always emits the English document, which is what the DOM-walking
   translator translated at runtime anyway.
   **Because prerendering happens at build, the flag is effectively a
   build-time + runtime setting: set it in `web/.env` (deploy-live.sh
   `load_env` exports that file for both the build and `node server.js`) and
   deploy.** Do not flip it at runtime alone: a build made with the flag on
   serves prerendered documents that need the hash policy, and a build made
   with it off has none.
2. **`web/src/proxy.ts` per request.** Decision table
   (`web/src/lib/security/public-cacheable-routes.ts` is the allow-list):

| Flag | Document on disk | On allow-list | Visitor | CSP | `Cache-Control` from proxy |
| --- | --- | --- | --- | --- | --- |
| off | — | — | — | nonce | (none — Next emits `private, no-store` for dynamic renders, as today) |
| on | yes | yes | anonymous | hash | `public, s-maxage=<ttl>, stale-while-revalidate=<swr>` |
| on | yes | yes | any identity cookie | hash | `private, no-cache, no-store, max-age=0, must-revalidate` |
| on | yes | no | any | hash | `private …` (never let Next's `s-maxage=31536000` for a static page reach the edge) |
| on | no (dynamic route, or ISR route not rendered yet) | yes | any | nonce | `private …` (a nonce'd render must never be shared-cached) |
| on | no | no | any | nonce | (none) |
| on | — | `/api/*` | — | nonce | (none) |

"Anonymous" = none of: `blockid_session`, `blockid_locale`, `sb-access-token`,
`sb:token`, `sb-*-auth-token*`. On a shared-cacheable response the proxy also
skips the `bid_jur` cookie seed and the SSO refresh (a `Set-Cookie` would
make Cloudflare and nginx refuse to cache it; the jurisdiction cookie is
seeded on the next dynamic page or API call instead).

Note on signed-in visitors of a static page: the document Next serves is the
same static one for everyone (it cannot read cookies), so the CSP has to be
its hash policy — a nonce policy would block every script on it. What the
proxy guarantees is the cache-control: `private`, so a signed-in user never
gets a shared-cache hit and never puts one there. Signed-in state on public
pages is client-rendered (nav), unaffected.

The mode is decided by the **served** route — `/funding/grants?state=NSW` is
rewritten by the proxy onto the static `/funding/grants/state/NSW`
(`lib/funding/grants-route.ts`), any other filter combination onto the
dynamic `/funding/grants/view`; the public URLs, canonicals and the sitemap
are unchanged.

## 3. Allow-list (`PUBLIC_CACHEABLE_ROUTES`)

| Route(s) | `s-maxage` / swr | Page `revalidate` |
| --- | --- | --- |
| `/` | 300 / 600 | 300 |
| `/pricing` | 300 / 600 | 300 (the `?segment=` deep link is resolved client-side) |
| `/about` | 3600 / 3600 | static |
| `/funding` | 600 / 600 | 3600 |
| `/funding/grants`, `/funding/grants/state/<STATE>` (= `?state=`) | 600 / 600 | 3600, per-state `generateStaticParams` |
| `/funding/grants/<id>` | 600 / 600 | 3600 |
| `/funding/programs/<capital>[/<id>]` (`/funding/programs` itself reads `searchParams` — dynamic) | 600 / 600 | 3600 |
| `/startup-index`, `/startup-index/listings/<ticker>` (`/listings` list reads `searchParams` — dynamic) | 300 / 300 | 300 (data behind 300 s `unstable_cache`) |
| `/compare[/<slug>]`, `/insights[/<slug>]`, `/showcase/**`, `/solutions[/<x>]`, `/docs/**`, `/legal[/<doc>]` | 3600 / 3600 | 3600 / static |

`s-maxage` never exceeds the page's own `revalidate`, so the edge never holds
a document longer than the origin would. Adding a route: add the entry (with
its `src/app`-relative page files) and run `npx vitest run
src/lib/security/public-cacheable-routes.test.ts` — the guard walks each
listed page's server import tree (layouts included, `@/` and relative
imports, stopping at `"use client"`) and fails on `next/headers`,
`connection()`, `unstable_noStore()`, `searchParams`,
`dynamic = "force-dynamic"` or `revalidate = 0`. A page that trips it is
dynamic and would silently stay on the nonce path.

Not on the list on purpose: `/vi/*`, `/es`, `/ja` (locale trees), `/register`
and the other `force-static` pages (they get the hash policy for correctness
but stay `private`), every `(app)` / auth / admin route.

## 4. Enabling it — operator steps

1. In `web/.env` add `CSP_PUBLIC_HASH_MODE=1` (the deploy exports `web/.env`
   for build and runtime). Deploy with `scripts/deploy-live.sh` as usual —
   the build output now lists the allow-listed pages as `○` / `●` (static /
   SSG) instead of `ƒ`.
2. Verify at the origin (headers only; nothing is cached yet):
   ```sh
   for p in / /pricing /funding/grants '/funding/grants?state=NSW'; do
     curl -sI "http://127.0.0.1:4001$p" | grep -iE '^(cache-control|x-blockid-csp|x-nextjs-cache):'
   done
   # expect: x-blockid-csp: hash · cache-control: public, s-maxage=… · x-nextjs-cache: HIT
   curl -sI -H 'cookie: blockid_session=x' http://127.0.0.1:4001/pricing | grep -i '^cache-control'
   # expect: private, no-cache, no-store, …
   ```
   and in a browser: no CSP errors in the console on `/`, `/pricing`,
   `/funding/grants`; the Founder | Evaluator switch on `/pricing` works
   (hydration). The Playwright spec does the same and skips itself when the
   server is not in hash mode:
   `PLAYWRIGHT_BASE_URL=https://blockid.au npx playwright test tests/e2e/smoke/public-hash-csp.spec.ts`.
3. **Cloudflare cache rule** (dashboard → Caching → Cache Rules), only
   after step 2 is green:
   * Name: `blockid public pages (no session)`
   * When incoming requests match — custom filter expression:
     ```
     (http.host in {"blockid.au" "www.blockid.au"})
     and not starts_with(http.request.uri.path, "/api/")
     and not starts_with(http.request.uri.path, "/_next/")
     and not (http.cookie contains "blockid_session=")
     and not (http.cookie contains "blockid_locale=")
     and not (http.cookie contains "sb-")
     ```
   * Cache eligibility: **Eligible for cache**.
   * Edge TTL: **Use cache-control header if present, bypass cache if not**
     ("respect origin"). Do **not** set an override TTL: the origin sends
     `private` for everything that must not be shared and `public,
     s-maxage` for the allow-list, so the rule is safe even for routes
     the expression lets through.
   * Browser TTL: respect origin. Cache key: default (URL + query — Next's
     RSC fetches carry `?_rsc=` so they never collide with the document).
   * Cloudflare ignores `Vary` (and Next overwrites any `Vary` the proxy
     adds with its own RSC vary list), so cookie absence **must** be in the
     rule expression as above — that is what keeps a signed-in visitor on the
     origin. A `Set-Cookie` response is never cached by Cloudflare anyway
     (the proxy emits none on shared-cacheable responses).
   Then `curl -sI https://blockid.au/pricing | grep -iE 'cf-cache-status|cache-control|age:'` twice: `MISS` → `HIT`.
4. Optional nginx micro-cache in front of Node (origin-side, keeps Cloudflare
   MISSes and any direct traffic off the render path). Add to the `http{}`
   block and the `blockid.au` server block in `/etc/nginx/sites-enabled/blockid-live`
   (the audit's §10.4 upstream/timeouts already applied):
   ```nginx
   # http{}
   proxy_cache_path /var/cache/nginx/blockid levels=1:2 keys_zone=blockid_html:20m max_size=500m inactive=1h;
   map $http_cookie $blockid_bypass_cache {
       default 0;
       "~*blockid_session=" 1;
       "~*blockid_locale="  1;
       "~*sb-"              1;
   }

   # server{} — before `location /`
   location ~ ^/(|pricing|about|funding(/.*)?|startup-index(/.*)?|compare(/.*)?|insights(/.*)?|showcase(/.*)?|solutions(/.*)?|docs(/.*)?|legal(/.*)?)$ {
       proxy_cache            blockid_html;
       proxy_cache_key        "$scheme$host$request_uri";   # ?_rsc= keeps RSC payloads apart
       proxy_cache_valid      200 10s;                       # micro-cache; origin s-maxage is the real TTL
       proxy_cache_use_stale  updating error timeout;
       proxy_cache_lock       on;
       proxy_cache_bypass     $blockid_bypass_cache $http_rsc;
       proxy_no_cache         $blockid_bypass_cache $http_rsc;
       proxy_ignore_headers   Set-Cookie;   # the proxy sends none on cacheable responses; belt and braces
       add_header             X-Cache $upstream_cache_status;
       proxy_pass             http://blockid_app;
       proxy_http_version     1.1;
       proxy_set_header       Connection "";
       proxy_set_header       Host $host;
       proxy_set_header       X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header       X-Forwarded-Proto $scheme;
   }
   ```
   nginx honours `Cache-Control: private` / `no-store` from the origin, so
   the same header discipline protects it; `proxy_cache_valid 200 10s` only
   caps how long one MISS is reused before the next origin hit.

## 5. Rollback

* **Cloudflare / nginx misbehaving:** disable the cache rule (or the nginx
  location) — the origin is unaffected.
* **Origin misbehaving (CSP errors, unhydrated pages):** remove
  `CSP_PUBLIC_HASH_MODE=1` from `web/.env` and redeploy (or
  `scripts/deploy-live.sh --rollback` to the previous release). The proxy
  falls back to the nonce policy on the next request; the layout falls back
  to `headers()` at the next build. Purge the Cloudflare cache after either.

## 6. Measured (local standalone build, flag on, 2026-09-14)

See the S31-D hand-off in the commit message of `docs/ops/public-page-caching.md`
and the numbers below — origin only, no Cloudflare in the loop:

| Check | Result |
| --- | --- |
| `curl -I /`, `/pricing`, `/funding/grants` | `x-blockid-csp: hash`, `cache-control: public, s-maxage=300/300/600, stale-while-revalidate=…`, `x-nextjs-cache: HIT` |
| same with `cookie: blockid_session=x` | `cache-control: private, no-cache, no-store, …` |
| `/dashboard` | `x-blockid-csp: nonce` |
| Playwright `public-hash-csp.spec.ts` | see hand-off |
| autocannon 20 conn × 30 s on `/pricing` (origin, hash mode) | see hand-off — vs. the audit's ~50 renders/s |

Note the origin number is a floor: with the Cloudflare rule in place the
allow-listed pages are served from the edge and the origin sees one request
per `s-maxage` window per page.

## 7. Known trade-offs / follow-ups

* `/vi/*` pages: `<html lang>` is now set client-side (`vi-VN`) instead of
  in the server document — the body was always the English document
  translated at runtime; hreflang / canonical metadata is unchanged.
* `/funding/programs` (index with `?` filters) and `/startup-index/listings`
  (list with `?` filters) stay dynamic; the same base/state/view split used
  for grants would make their indexable shapes cacheable too.
* `/register`, `/legal-templates`, `/tbr/demo`, `/reports/samples`,
  `/guide/reports`, `/docs/design-system`, `/sample-business-report` were
  already `force-static` and — with the flag off — are served under the
  nonce policy with **no nonce on any script**, i.e. they do not hydrate in
  production today (verified: `curl -sI /legal-templates` → `x-nextjs-cache:
  HIT`, scripts without `nonce=`). Turning the flag on fixes them (hash
  policy for any prerendered document).
* Hash mode has no `'strict-dynamic'`; `https://www.googletagmanager.com`
  and `https://www.google-analytics.com` in `script-src` are the same CSP2
  fallback hosts the nonce policy already listed, now load-bearing on cached
  pages. Moving GA/GTM to server-side tagging would let both go.
* The prerender file lookup couples the proxy to Next's file-system cache
  layout (`.next/server/app/*.html`). If a future Next release changes it,
  every route degrades to the nonce path + `private` (the audit's status
  quo), never to a broken page; `x-blockid-csp: nonce` on `/pricing` with
  the flag on is the signal.
