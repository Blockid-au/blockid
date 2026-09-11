# API web-security review — routes shipped 2026-09-10/11 (S8-C)

Scope: the web-security surface of the G11 Money Finder + G12 Evaluator routes (funding, evaluations, quarterly report, dashboard layout, investor preferences, register-with-card, admin funding, the six new crons, `lib/funding/fetch-source.ts`). Money / access-path findings were handled in `money-paths-review-2026-09-10.md` and are not repeated. Paths relative to `web/`. Line numbers are pre-fix (master `3bf836a36`).

Every **Fixed** item ships with a colocated test in the same commit (`security(api): … (S8-C)`). Verification: `npx tsc --noEmit` clean, `npx eslint` 0 errors on the 69 changed files, `npx vitest run` over the scope = 129 files / 1 991 tests green.

## Summary

| Severity | Found | Fixed | Deferred / accepted |
| --- | --- | --- | --- |
| High | 3 | 3 | 0 |
| Medium | 7 | 7 | 0 |
| Low | 9 | 8 | 1 |
| Info (verified OK) | 12 | — | — |

New shared helpers (all under `src/lib/security/`, no new dependencies):

- `cron-auth.ts` — `isCronAuthorised(request)` / `safeEqualStrings()` (SHA-256 digest + `crypto.timingSafeEqual`).
- `request-guards.ts` — `readJsonBody(request, maxBytes)` (413 before parse, 400 on bad JSON), `rejectCrossSite(request)` (`Sec-Fetch-Site: cross-site` → 403), `isUuid()`, `isGrantId()` (`^[a-z0-9][a-z0-9-]{0,79}$`), `PRIVATE_JSON_HEADERS`.
- `outbound-url.ts` — `checkOutboundUrl(url, { resolve })`: http(s) only, no credentials, forbidden hostnames (`localhost`, `*.local`, `*.internal`, metadata names, single-label, decimal/hex/short-form IPv4), private / link-local / CGNAT / ULA / v4-mapped / NAT64 address ranges, DNS-resolved addresses checked too.
- `safe-redirect.ts` — `safeNextPath(raw, fallback)` for `?next=` params (client-safe).

## High

**H1. SSRF in the weekly source refresh: redirects followed blindly, no private-address guard** — Fixed
`src/lib/funding/fetch-source.ts:104-118` (`redirect: "follow"`, no host/IP check) via `src/lib/funding/refresh.ts:281,330,428`.
Targets are `au_grants.source_url / official_url` (seed-controlled; the admin PATCH whitelist in `lib/funding/admin-patch.ts` cannot write URL columns, confirmed by grep — only the seed script writes them), **but** a compromised or misconfigured portal could 302 the cron to `http://169.254.169.254/…` or an internal service, and `discoverFeedUrl()` fetched whatever RSS `<link>` the GrantConnect list page advertised. The response body (2 MB) landed in the review queue file.
Fix: `fetchText` now checks the start URL and **every redirect hop** through `checkOutboundUrl` (manual redirects, `MAX_REDIRECTS = 5`, refusal is final — never retried — and reported as `{ refused: true, error: "ssrf_refused:<reason>" }`); `refresh.ts` only follows an advertised feed on the same host as the configured feed (`isSameFeedHost`). Timeout (12 s) and 2 MB cap were already present — verified.
Tests: `fetch-source.test.ts` (metadata / loopback / `file:` / `ftp:` refused without a fetch; seed host → 302 → 169.254.169.254 refused; host resolving to 10.0.0.7 refused; hop limit; `redirect: "manual"` pinned), `refresh.test.ts` (off-host feed not followed), `security/outbound-url.test.ts` (36 cases incl. `0x7f000001`, `127.1`, `::ffff:169.254.169.254`, `64:ff9b::`).
Allow-list note: the task asked for "seed hosts only". That is what the loop does by construction (targets come from the rows); a static host list on top would break legitimate cross-host redirects (business.gov.au ↔ grants.gov.au) and is **deferred** — see L9.

**H2. Open redirect after login via `?next=`** — Fixed
`src/app/auth/login/login-form.tsx:572,45,478` — `window.location.href = nextUrl` with the raw query value, so `/auth/login?next=https://evil.example` (which every new `/workspace/funding`, `/workspace/evaluations`, `/admin/funding` page links into) sent the freshly-authenticated user off-site. The server-side magic-link path (`api/auth/request/route.ts:66`, `auth/verify/route.ts:149`) only checked `startsWith("/")`, which `//evil.example` passes (verify prefixes `siteUrl()` so it stayed on-host there, but the request route stored the value).
Fix: `safeNextPath()` in both the login form and `api/auth/request`; rejects absolute URLs, `//`, `/\`, backslashes, CR/LF/NUL, and anything that re-parses to another origin. Tests: `security/safe-redirect.test.ts`, `api/auth/request/route.test.ts` (new protocol-relative / backslash / CRLF cases).

**H3. Cron secret compared with `!==` (timing side channel) on all six new crons** — Fixed
`api/cron/{refresh-funding-sources,money-radar-sweep,evaluator-progress-weekly,analysis-refresh-quarterly,evaluation-batch-runner,funding-report-retry}/route.ts` — `authHeader !== \`Bearer ${CRON_SECRET}\``. V8 string equality exits on the first differing byte. The routes are reachable from the public origin and the secret is the only application-level gate (whether nginx additionally IP-restricts `/api/cron/*` was not verified here — treat the app gate as the boundary).
Fix: `isCronAuthorised()` — both sides hashed to 32 bytes, `timingSafeEqual`; unset/blank secret always 401. Tests: `security/cron-auth.test.ts` + each route test now pins prefix (`s3cre`), suffix (`s3cretX`) and scheme-less (`s3cret`) → 401.
Note: the other ~100 `/api/cron/*` routes use the same pattern (0 of 107 used `timingSafeEqual`); migrating them is a mechanical follow-up (`grep -rl 'Bearer \${process.env.CRON_SECRET}' src/app/api/cron`).

## Medium

**M1. No CSRF hardening beyond `SameSite=Lax` on cookie-auth mutations** — Fixed
Convention check: no route in the app checked `Origin` or `Sec-Fetch-Site`; the defence is the `SameSite=Lax; HttpOnly` session cookie (`lib/auth.ts:347`, `lib/supabase/server-anon.ts:48`), which browsers omit on cross-site POST/PUT/PATCH/DELETE. That holds, but Lax is a browser default that a future cookie change could silently drop.
Fix: `rejectCrossSite()` (refuses only an explicit `Sec-Fetch-Site: cross-site`; absent header = curl/cron/tests pass; `same-site` = our subdomains pass) on every cookie-auth mutation in scope: `funding/report POST`, `funding/draft POST+PATCH`, `funding/report/[id]/save-to-dataroom`, `evaluations POST`, `evaluations/[id] PATCH+DELETE`, `evaluations/[id]/report POST`, `evaluations/batch POST`, `evaluations/claim/[token] POST`, `dashboard/layout PUT`, `investor/preferences POST`, `admin/funding/[kind]/[id] PATCH`. Guest routes (`funding/preview`, `funding/checkout`, `register-with-card`) carry no cookie and are unchanged. An `Origin`-host comparison was rejected: the proxy's subdomain rewrite and `NEXT_PUBLIC_SITE_URL` make the expected host ambiguous. Tests in each route test (`403 cross_site_request_refused`, auth never consulted).

**M2. JSON bodies parsed with no size cap (`request.json()`)** — Fixed
`funding/preview`, `funding/checkout`, `funding/report`, `funding/draft`, `evaluations`, `evaluations/[id]`, `evaluations/[id]/report`, `evaluations/batch`, `investor/preferences`, `register-with-card`, `admin/funding`. `parseFundingIntake` capped `description` at 2 000 chars **after** parse, but a 50 MB `industry_tags` array was still parsed and iterated; only `dashboard/layout` measured bytes first.
Fix: `readJsonBody()` with per-route caps (4 KB report-run body … 4 MB draft PATCH which legitimately carries 50 × 20 000-char answers); 413 `payload_too_large` before `JSON.parse`, Content-Length not trusted. Tests: 413 case in every affected route test; `description` of 2 001 chars → 400 with `field: "description"` pinned on preview + report.

**M3. `evaluations/[id]/report` echoed the raw pipeline error to the client** — Fixed
`route.ts:243` `detail: err.message` — orchestrator / provider errors contain hostnames and ports (`ECONNREFUSED 10.0.0.9:11434`). Now only outside `NODE_ENV=production`. Test pins both branches.

**M4. Unbounded jsonb growth on grant-draft answers and investor prefs** — Fixed
`funding/draft PATCH` (`route.ts:190-196`): each answer was capped at 20 000 chars but the key set was not (any number of keys, any key length) — now ≤ 50 keys, key ≤ 64 chars. `lib/investor-portal.ts:510-523` `normalisePrefs`: `sectors`/`geos` were `.map(String)` (objects → `"[object Object]"`, strings unbounded), `stages` and `cheque_band` stored verbatim with a type cast (`"<script>"`, `{ $gt: 0 }` persisted). Now enum-validated (`STAGE_BANDS`, `CHEQUE_BANDS`), string-only tags ≤ 40 chars, de-duplicated, `min_svi` must be finite. Two old regression pins that said "bad values pass through — update when a guard lands" were updated on purpose. Tests: `funding/draft/route.test.ts`, `lib/investor-portal.test.ts`.

**M5. ICS `URL:` / `UID:` lines not sanitised (property injection)** — Fixed
`lib/compliance/calendar.ts:503,494` — `escapeIcsText` (review #19) covered TEXT values only; `URL:` is a URI value and was emitted raw, so a CR/LF inside `au_grants.official_url` (or a `uid`) still terminated the content line and injected `ATTENDEE:` etc. into subscribers' calendars. Now `safeIcsUri()` (control chars stripped, http(s) only, else the line is dropped) and `safeIcsUid()`. Test: `lib/funding/calendar.test.ts`.

**M6. Expensive / credential-bearing endpoints with no rate limit** — Fixed
`funding/report/[id]/pdf` (CPU-bound `@react-pdf` render, reachable with a guest `?t=`), `funding/report/[id]/save-to-dataroom` (render + a new storage object per call), `funding/calendar.ics` (32-char token is the only credential — brute-force surface), `evaluations POST` (sends a founder invite email per create), `evaluations/claim/[token]` (invite-token guessing), `funding/draft PATCH`, `investor/preferences POST`. All now use `enforceRateLimit` keyed on user id with IP fallback (pdf 20/10 min, save 10/h, ics 60/10 min per IP, create 30/h, claim 20/10 min, draft-patch 60/min, prefs 60/min). Tests assert the key, identity, limits and 429 pass-through.

**M7. Identifiers reaching Postgres unvalidated** — Fixed
`funding/report POST` `project_id`, `funding/draft POST` `grant_id` + `project_id`, `funding/draft PATCH` `id` — a non-UUID hit `uuid = 'p1'` (22P02) inside the lib and surfaced as a 403/404/500 depending on the catch; grant ids reached `getGrant()` with any string. Now `isUuid` → 400 `invalid_project_id` (404 for the draft id, matching "not found" semantics) and `isGrantId` → 400 `invalid_grant_id`, before any DB call (tests assert the lookup mock is not called). Test fixtures moved from `p1`/`d-1` to real UUIDs.

## Low

**L1. Per-user JSON without `Cache-Control: private`** — Fixed
`evaluations GET`, `evaluations/batch GET`, `evaluations/[id]/report GET`, `investor/preferences GET`, `funding/report POST` (200 carries `reportId`/url), `dashboard/layout GET` (`no-store` → `private, no-store`). `PRIVATE_JSON_HEADERS` applied; tests updated. Already correct: `funding/report GET/[id]`, `pdf`, `calendar-token`, `export.csv`, `reports/quarterly`, `funding/preview` (public, `no-store`).

**L2. `register-with-card` accepted any 4–128-char `payment_method_id`** — Fixed
Now `^pm_[A-Za-z0-9]{1,125}$` in the zod schema (→ 400 `payment_method_required`), so a `cus_…`/`pi_…` id never reaches `paymentMethods.attach`. Body capped at 16 KB.

**L3. CSV formula guard prefixed negative numbers** — Fixed (functional, not security)
`lib/evaluations/batch-shared.ts:293-300` `csvCell(-3)` → `'-3` (text in Excel). Finite numbers are now emitted bare; the `= + - @ \t \r` guard on strings is unchanged and re-pinned (`=cmd|' /C calc'!A0`, `@cmd`, `\tcmd`).

**L4. Founder email in cron log output** — Fixed
`lib/funding/radar-drips.ts:376` logged the subscriber address on a preference-lookup failure; now logs `user_id`. Grep of every `console.*` in scope found no other PII / token / secret: report access tokens, calendar tokens, `guest_email` and Stripe ids never reach a log (`lib/funding/reports.ts` logs `reportId` only).

**L5. Markdown links in the paid report had no `rel`** — Fixed
`components/funding/funding-report-view.tsx:186` — `react-markdown@10` with **no `rehype-raw`** (confirmed: 0 occurrences in `src/`) so raw HTML is escaped and `javascript:` hrefs are dropped by the default `urlTransform`; links rendered as plain `<a href>` (no `target`, so no tabnabbing) but carried no `rel`. Added `NARRATIVE_MD_COMPONENTS` (`target="_blank" rel="noopener noreferrer nofollow"`). Test renders `<script>`, `<img onerror>`, a `javascript:` link and a real link through the page and asserts escaping / dropping / `rel`.

**L6. `evaluations/[id]/report` POST without a 400 for a non-object body** — Fixed as part of M2 (arrays / scalars → 400 `invalid_json` / `invalid_kind`).

**L7. Admin PATCH returned raw Supabase `error.message`** — Accepted
`api/admin/funding/[kind]/[id]/route.ts:66,92` — admin-only (`requireAdmin`, verified), and the message is useful in the review drawer. Left as is.

**L8. Cron-runner GET alias** — Accepted
All six crons export `GET` (manual `?dry=1`) — gated by the same bearer, no CSRF exposure (no cookie auth). Fine.

**L9. Static outbound host allow-list for the refresh cron** — Deferred
See H1. Recommended follow-up: persist `allowed_hosts` derived from `content/data/grants-au.seed.json` + `FUNDING_GRANTCONNECT_RSS_URL` and pass it to `fetchText` as `allowHost`; needs a decision on how to treat legitimate cross-host redirects (log + queue rather than refuse). Not blocking — the private-address / redirect guard closes the exploitable path.

## Checked, OK (no change)

1. **Input validation** — `parseFundingIntake` (`lib/funding/intake.ts`): `description` 10–2 000 chars, enums for `state`/`stage`/`industry_tags` (≤ 6), `city` ≤ 80, numeric ranges; `lib/evaluations.ts` `parseCreate`: name ≤ 100, description ≤ 500, email regex + ≤ 254, website normalised, industry ≤ 60; `updateEvaluation`: label ≤ 120, notes ≤ 20 000; `evaluations/batch`: ≤ `BATCH_MAX_ITEMS`, de-duplicated, ownership via `ownedEvaluationIds`, `normaliseWeights`; `admin-patch.ts` whitelist + ISO date + `MAX_NOTE`; `dashboard/layout` 4 KB byte gate + `parseLayout` against `widget-ids.ts`; `register-with-card` zod schema with enum account types and plan allow-list.
2. **Report access tokens** — `lib/funding/reports.ts:385-397` `canViewFundingReport` uses a constant-time `safeEqual` for `?t=` and `?s=`; 404 (not 403) for unknown/unauthorised ids; `publicFundingReport` strips `access_token`, `guest_email`, Stripe ids (page test asserts `tok_secret|g@example.com` absent).
3. **Guest report id shape** — `^[0-9a-f-]{36}$` on all three `[id]` routes before any lookup.
4. **Calendar token** — 24 random bytes base64url, shape pre-filter `^[A-Za-z0-9_-]{32}$`, mint is race-safe (`.is("calendar_token", null)`), entitlement re-checked per fetch, `X-Robots-Tag: noindex`, `Cache-Control: private`.
5. **CSV export** — owner-only (`getBatchForUser` filters `user_id`), UTF-8 BOM + CRLF + RFC 4180 quoting, formula guard verified (L3 refinement only), filename slug `[a-z0-9-]` ≤ 40, `Content-Disposition: attachment`, `private, no-store`.
6. **Quarterly HTML** — `lib/evaluations/quarterly-report.ts` escapes every interpolation with `esc()` (incl. `href`), the single inline `<script>` carries the per-request `x-nonce` from `proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`), inline `<style>` is allowed by `style-src 'unsafe-inline'`; `reportUrl` is built server-side from the share token, not user input; `x-robots-tag: noindex, nofollow`, `private, no-store`; ownership by `getBatchForUser` / `manager_email` match.
7. **PDF** — `@react-pdf/renderer` (no HTML path, text nodes cannot inject); filename from the validated UUID; `Content-Disposition: attachment`.
8. **Security headers on non-HTML responses** — `proxy.ts` matcher includes `/api`, and `applySecurityHeaders()` puts `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`, `X-Frame-Options` on **every** response (429s included), so CSV / ICS / PDF / JSON all carry `nosniff`. Verified by reading `securityHeaders()` + the matcher.
9. **Admin gating** — `api/admin/funding/[kind]/[id]` uses `requireAdmin` (email or role) → 401; `(app)/(admin)/admin/funding/page.tsx:22-25` redirects non-admins; `kind` is an enum, `id` ≤ 200 chars, update columns whitelisted and `verified_by='human'` stamped.
10. **Cron routes** — no user input beyond `?dry=1` / `?force=1` booleans; Supabase errors mapped to 503/500 without leaking beyond `error.message` in the cron-health log (not user-facing); `evaluator-progress-weekly` logs `user_id` only.
11. **Rate limits already present** — `funding/preview` 30/10 min per IP, `funding/checkout` 10/h per IP + 3/day per email (+ disposable-domain block), `funding/report` 10/h per user, `funding/draft POST` 20/h, `evaluations/[id]/report` 12/h per email (after the cost preview, so previews are free — intentional), `dashboard/layout PUT` 60/min, `register-with-card` 5/15 min per IP, plus the proxy buckets.
12. **JSON parse errors** — every route in scope returned 400 (not 500) on malformed JSON before this review; `readJsonBody` preserves that and adds 413.

## Follow-ups (outside this task's scope)

- Migrate the remaining ~100 `/api/cron/*` routes to `isCronAuthorised()` (mechanical; one sed + test touch each).
- Consider `rejectCrossSite()` in `proxy.ts` for every cookie-auth non-GET under `/api/*` instead of per-route (one place, same semantics) — needs the Stripe webhook and OAuth callbacks exempted (they carry no `Sec-Fetch-Site`, so they already pass).
- L9 static host allow-list for `fetch-source.ts`.
- `lib/funding/refresh.ts` review-queue file: `entries[].url` is now guaranteed public, but the queue is rendered in `/admin/funding` — confirm the client escapes `evidence` snippets (it renders through React, so yes; noting for completeness).
