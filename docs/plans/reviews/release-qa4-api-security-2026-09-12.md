> **Disposition (2026-09-12):** no P0. P1-1 IDOR + P1-2 deps, P2-a/b/d/e/f → fix agent; P2-c done by ops (10 `.env.bak-*` moved to `~/.blockid-vault/` 0600, outside the web root).

# QA Lane 4 — API contract, edge cases & security sweep (blockid.au)

Date 2026-09-12 · prod https://blockid.au · read-only + harmless probes · Next.js 16.2.5

## Counts
- Route files inventoried: **548** `route.ts` (GET 316, POST 330, PATCH 22, DELETE 34, PUT 8, OPTIONS 8, HEAD 5).
- Probe requests sent to prod: **1927** (≤5 req/s). Skipped: stripe/webhook, webhook/github, webhooks/*; cron probed wrong-secret only; admin unauth-only.
- Status mix: 401×927, 405×418, 413×264, 400×176, 200×39(public), 404×29, 403×22, 307×21, 204×11, 500×**10**, 429×2, 503×1, 422×1, 303×1. (5 status-0 = probe HEAD-with-body bug, ignore.)
- **5xx: 10, on 5 routes. Response bodies leaking stack traces / internal paths / Supabase msgs / secrets: 0.**
- Data-isolation review: 83 dynamic routes, 1 P1 IDOR, 4 broken-but-fail-closed, 0 PII-to-public.
- npm audit --omit=dev: 1 critical, 9 high, 8 moderate. gitleaks history: clean (rewritten 2026-09-10); working-tree 709 hits, all in gitignored/untracked/local files (see P2-c). .env & /_next/*.map & docs not served (404).

## Verified GOOD (regression baseline)
- CSP enforced: `script-src 'self' 'nonce-…' 'strict-dynamic'` + Stripe/GTM, no `unsafe-inline` in enforced policy (report-only variant has it, harmless); `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. All 4 of HSTS(preload,63072000)/nosniff/referrer-policy/CSP present on 20 pages **and** 20 API responses. permissions-policy locked.
- Session cookie: `HttpOnly; SameSite=Lax; Secure(prod unconditional); Path=/` (src/lib/auth.ts:349). Only public `Set-Cookie` is `bid_jur` consent/jurisdiction — Secure, SameSite=lax. OK.
- CORS `/api/v1/*`: `ACAO:*` + `Allow-Methods: GET,OPTIONS`, **no** Allow-Credentials → safe for key-in-header public API. Mutating v1 revoke uses cookie auth shielded by SameSite=lax.
- `next=` open-redirect guarded by `safeNextPath` (src/lib/security/safe-redirect.ts) — blocks `//`, `/\`, backslash, CRLF, cross-origin. Login/dashboard 307→`/auth/login?next=…` re-sanitised.
- Magic-link (`/api/auth/request`) & reset always 200/generic — no existence disclosure there. Rate-limit buckets (auth-login/register/reset) enforce 429 (login 429 after 5, identity = cookie-or-IP incl. cf-connecting-ip, so XFF spoof doesn't reset).
- Wrong-method→405, malformed/empty JSON→400 on the vast majority; oversized 3MB body→413 (264×). authed JSON `Cache-Control: no-store, no-cache, must-revalidate`.
- Crons: wrong-secret→401 (milestone-report/credit-reset/security-posture), cron-health all `ok` within <15 min. `/api/cron/performance-audit` 404 = documented never-existed (crontab:467), not a gap. /api/status payload minimal-ish. .env/.env.bak/_next .map → 404.

---

## Findings

### P1-1 — IDOR: cross-tenant SVI snapshot read `/api/svi/report/[projectId]` (GET)
File `src/app/api/svi/report/[projectId]/route.ts:129-156`. Ownership filter is **optional**: `if (accountId) query = query.eq("account_id", accountId)`. `accountId` comes from `svi_accounts.select("id").eq("user_id", user.id)` but no migration adds `svi_accounts.user_id` (accounts are keyed by email via `findSVIAccountWithFallback`); the column error is swallowed (`{ data: account }`), forcing `accountId=null` → filter dropped → query becomes `svi_snapshots WHERE project_id=<victim>` (or newest row for `project_id="default"`), returning another tenant's full `analysis_json`, criterion_results, dim_results.
Request: authed `GET /api/svi/report/default` (or any victim projectId).
Fix: resolve via `assertProjectScope(user, projectId, "viewer")` and **always** `.eq("project_id", scope.projectId).eq("account_id", <account via scope.dataEmail>)`; 404 when no account resolves — never drop the filter.

### P1-2 — Next.js 16.2.5 critical advisory + vulnerable deps
`npm audit --omit=dev`: **critical** = Next.js "Middleware/Proxy bypass in App Router"; 9 high (nodemailer CRLF, ws mem-disclosure, postcss XSS, sharp/libvips CVE-2026-33327, image-size DoS, fast-uri, nanoid, browserslist, pptxgenjs). `src/proxy.ts` is the sole edge hook and enforces rate-limit buckets + injects CSP/security headers; a proxy bypass strips those (per-route `getCurrentUser()` still gates auth, so not full auth bypass → P1 not P0).
Fix: `npm update next` to the patched 16.2.x; bump nodemailer/ws/postcss/sharp. Re-run gate-6 secret scan after.

### P2-a — Login/register user + auth-method enumeration
`src/app/api/auth/login-password/route.ts:58-61`: unknown email → `"Invalid email or password"` (invalid_credentials) but a **known** password-less account → `"This account uses Google or magic link login…"` (no_password); register → 409 `"An account with this email already exists"`. Lets an attacker enumerate which emails exist and their auth method. Verified live (admin@blockid.au vs nobody@… differ).
Fix: collapse `no_password`/`invalid_credentials` to one 401 message; make register 409 generic or gate behind the same rate bucket + timing-equalise.

### P2-b — 500 (not 400) on empty/malformed POST body; upload 500 pre-auth
10 of 10 5xx are `await request.json()` unguarded inside a try→generic 500 catch: `POST /api/auth/reset-password`, `/api/index/waitlist`, `/api/unsubscribe/feedback`, `/api/website-tech-audit`, `/api/upload` (empty+malformed). `/api/upload` also 500s on **unauth** POST — formData parsed before `getCurrentUser()`, so it never returns 401. No stack leak (generic bodies) but violates 400-not-500 contract, pollutes logs, aids cheap error-amplification.
Fix: wrap body parse in its own try→400 (pattern already in login-password:33-36); in upload call `getCurrentUser()` → 401 **before** parsing the body.

### P2-c — 10 live-secret `.env.bak-*` files on the production disk
`web/.env.bak-{2026-09-10-s3,-11-addon,-12-oauthkey,-12-webhook,pricing}` + `.env.runtime.bak-*` each contain real telegram-bot-token, private-key, gcp-api-key, stripe-access-token, JWT, linkedin creds (gitleaks). Gitignored (not committed) and **not served** (`/.env*`→404), so not remotely exploitable — but 10 plaintext secret copies widen blast radius on any disk/backup access and defeat rotation hygiene.
Fix: delete the `.env*.bak-*` files (keep secrets only in `.env`/secret store); have the deploy/rotate script write to a mode-0600 vault dir outside web root instead of `web/*.bak`.

### P2-d — Unauthenticated password reset overwrites password_hash (forced-reset/lockout)
`src/lib/auth.ts` `resetWithTempPassword` does `.update({ password_hash: hash })` immediately, so any caller who knows a victim email can invalidate their current password (DoS/lockout), rate-limited only 3/15min/IP. Standard-ish but risky.
Fix: store a time-boxed reset token and only rotate the hash when the user consumes it, leaving the existing password valid until then.

### P2-e — Broken (fail-closed) owner checks — fix before someone "repairs" them by deleting the check
Query non-existent columns → always deny, feature dead: `src/app/api/evidence/dim/[id]/route.ts:74` (`projects.owner_id`), `src/app/api/financial/forecast/[modelId]/{route(GET),fetch,export}` (`projects.created_by`). Fix: select `user_id` / route through `assertProjectAccess`.

### P2-f (minor) — `/api/status` leaks internal telemetry
Public payload includes `slo.uptime_pct_24h`, `oauth_tokens_sealed`, `audit_chain`, and a full `ga4_events: missing:…` list. Not exploitable; trim to `{ok,version}` for anon callers.

## Informational / accepted
- `/api/guest-analysis/status/[id]` returns a 30-day signed PDF URL by uuid (capability-token pattern; consider binding `?s=<stripe session>` like funding/report). Token routes (tbr/data-room/investor-pack) use 126-192-bit random tokens via `.eq("token",…)` equality — acceptable (no timing risk at that entropy).
- authed JSON uses `no-store, no-cache` (spec asked `private, no-store`) — cosmetic.
- `docs/API-REFERENCE.md:113`, `chain/**` genesis/gentx, `web/.next/cache/*` gitleaks hits = doc example JWT, private dev-chain (Anvil 420) keys, build cache — all false positives, none served.
