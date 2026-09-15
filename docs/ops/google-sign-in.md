# Google sign-in — two flows, console settings, error codes, checks

Runbook for "login Google bị lỗi" (founder report 2026-09-15). Code:
`web/src/app/auth/login/login-form.tsx` (client), `web/src/app/api/auth/google/`
(`route.ts` POST, `start/route.ts`, `callback/route.ts`),
`web/src/lib/auth/google-login.ts` (shared back half),
`web/src/lib/auth/google-oauth.ts` (state / PKCE), `web/src/lib/auth/google-sign-in-errors.ts`
(code → copy).

## 1. The two flows

| | GIS pop-up ("Sign in with Google" button) | Server-side redirect ("Continue with Google (redirect)") |
| --- | --- | --- |
| Entry | `accounts.google.com/gsi/client` renders the button; account pick happens in a pop-up | `GET /api/auth/google/start?next=/path` → 302 to Google's account chooser |
| Credential | Google hands an **ID token** to the page (pop-up → opener) → `POST /api/auth/google {credential}` | Google 302s back to `GET /api/auth/google/callback?code=&state=`; server exchanges the code (PKCE S256 + `GOOGLE_CLIENT_SECRET`) → ID token |
| Verification | `google-auth-library` `verifyIdToken` (signature, expiry, audience = `GOOGLE_CLIENT_ID`) | same |
| Back half | `completeGoogleLogin`: `loginWithGoogle` → `setSessionCookie` → `claimForCurrentBrowser` → `/onboarding` or `/dashboard` | same function |
| Needs | pop-ups allowed, third-party cookies / FedCM working, consent screen accepting the account | none of those — plain top-level navigation |
| When it fails | usually **silently in the browser**: the server sees nothing (this is what happened 9–15 Sep: no `POST /api/auth/google` in nginx/audit_events) | every failure lands on the server as an `error=` code, is logged, and comes back to `/auth/login?google_error=<code>` |

The redirect button is always shown under the GIS button. It becomes the
emphasised option as soon as the GIS script fails to load, the credential
callback throws, or the POST returns non-2xx.

State cookie: `blockid_google_oauth` — HttpOnly, SameSite=Lax, Secure (prod),
`Path=/api/auth/google`, 10 min, HMAC-SHA256 sealed (`GOOGLE_OAUTH_STATE_SECRET`
if set, else derived from `GOOGLE_CLIENT_SECRET`). It carries the `state`
nonce, the PKCE verifier and the same-origin `next`. Cleared by the callback.

## 2. Google Cloud console — exact settings

Project: the one that owns `GOOGLE_CLIENT_ID` (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`
must be the same value). **APIs & Services → Credentials → OAuth 2.0 Client
IDs → (Web application)**:

| Field | Value |
| --- | --- |
| Authorised JavaScript origins | `https://blockid.au`<br>`https://www.blockid.au` |
| Authorised redirect URIs | `https://blockid.au/api/auth/google/callback`<br>(plus `https://dev.blockid.au/api/auth/google/callback` if dev uses Google sign-in; the GA4 connector's `…/api/oauth/ga4/callback` stays) |

**APIs & Services → OAuth consent screen** (Google Auth Platform → Audience):

| Setting | Required |
| --- | --- |
| Publishing status | **In production**. In **Testing** only the ≤100 listed test users can sign in; **everyone else sees "Access blocked: blockid.au has not completed the Google verification process"** — and the GIS pop-up shows that only to the user, never to us. This is the most likely cause of the founder's report. |
| User type | External |
| App name / support email / developer contact | filled in (Google refuses to publish otherwise) |
| Scopes | `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile` only — non-sensitive, so "In production" needs **no verification review** |
| Authorised domains | `blockid.au` |
| App logo | optional; adding one triggers brand verification — leave it off unless you want the review |

Env (server, `web/.env*` — never committed): `GOOGLE_CLIENT_ID`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` (== the former), `GOOGLE_CLIENT_SECRET`,
`NEXT_PUBLIC_SITE_URL=https://blockid.au` (the redirect URI is built from it,
never from the request host). Optional: `GOOGLE_OAUTH_STATE_SECRET`.

## 3. Reading the error codes

Server log: one line per failure, `[auth:google] <stage> <code> {json}` —
never the token, the code or the email. `journalctl -u blockid -f | grep
'\[auth:google\]'` (or the PM2/stdout log the service writes). Client: browser
console `[auth:google] client <flow> <code>` + GA4 events `login_google_start`
/ `login_google_success` / `login_google_error {flow, reason}`.

| Code (`?google_error=` / log) | Stage | Meaning → fix |
| --- | --- | --- |
| `access_denied`, `interaction_required`, `consent_required` | google | user cancelled / closed the chooser. Nothing to fix. |
| `org_internal`, `admin_policy_enforced`, `access_blocked`, `unauthorized_client` | google | **consent screen refused the account** — Testing mode + non-test user, or app set to Internal, or a Workspace admin policy. Publish the consent screen (§2). |
| `redirect_uri_mismatch` | exchange | the callback URI is not in *Authorised redirect URIs*. The log line and the login page print the exact URI to add. |
| `invalid_client` | exchange | client ID / secret pair wrong or rotated. Re-copy both from the console. |
| `invalid_grant` | exchange | code already used or expired (user hit back / refreshed the callback). Retry. |
| `state_mismatch` (HTTP 400 on the callback) | callback | cookie missing / tampered / >10 min / different nonce: cookies blocked, link reused, or a cross-browser paste. Retry from the button. |
| `missing_code` | callback | Google returned without `code` and without `error` — retry; if persistent, check `response_type=code` was not altered. |
| `token_invalid`, `email_unverified`, `exchange_failed`, `network` | verify / exchange | ID token failed signature/audience/expiry, unverified Google address, or Google's token endpoint unreachable. Check `GOOGLE_CLIENT_ID` equals the public one; check outbound network. |
| `login_failed` | login | Google vouched, our DB write failed (`reason: db_error \| not_configured`). Check Supabase. |
| `not_configured` | start / callback | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` unset on the server. |
| client-side: `gis_script_blocked`, `gis_init_failed`, `no_credential`, `http_<status>`, `one_tap_unregistered_origin`, `one_tap_invalid_client` | client | GSI script blocked (CSP / ad-blocker), widget threw, pop-up returned no credential, POST failed, or the page origin is not in *Authorised JavaScript origins*. |

`unregistered_origin` under One Tap = the current origin (e.g. `https://www.blockid.au`)
is missing from *Authorised JavaScript origins*.

## 4. Checks

Shape check (no Google account needed):

```sh
# start: 302 to accounts.google.com with PKCE + state, HttpOnly cookie
curl -sI 'https://blockid.au/api/auth/google/start?next=/dashboard' | grep -iE '^(HTTP|location|set-cookie)'
#   HTTP/2 302
#   location: https://accounts.google.com/o/oauth2/v2/auth?client_id=…&redirect_uri=https%3A%2F%2Fblockid.au%2Fapi%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=openid+email+profile&state=…&code_challenge=…&code_challenge_method=S256&prompt=select_account…
#   set-cookie: blockid_google_oauth=…; Path=/api/auth/google; Max-Age=600; HttpOnly; Secure; SameSite=lax

# callback without the cookie → 400 (state guard), never a 500
curl -s -o /dev/null -w '%{http_code}\n' 'https://blockid.au/api/auth/google/callback?code=x&state=y'   # 400

# Google-side refusal → back to the login page with the code
curl -sI 'https://blockid.au/api/auth/google/callback?error=access_denied' | grep -i '^location'
#   location: https://blockid.au/auth/login?google_error=access_denied

# login page renders the fallback button + copy
curl -s 'https://blockid.au/auth/login?google_error=redirect_uri_mismatch' | grep -o 'Continue with Google (redirect)\|https://blockid.au/api/auth/google/callback' | sort -u
```

End-to-end (a real Google account, once per console change): open
`https://blockid.au/auth/login`, click **Continue with Google (redirect)**, pick
the account → you must land on `/dashboard?logged_in=true` (or `/onboarding`).
If you land back on `/auth/login?google_error=…`, read §3. Then repeat with the
GIS button; on failure the page now shows the code and the redirect button.

Playwright (`web/tests/live-qa` style, unauthenticated shape only):

```ts
test("google redirect start", async ({ request }) => {
  const res = await request.get("/api/auth/google/start?next=/dashboard", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const loc = res.headers()["location"];
  expect(loc).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  expect(loc).toContain("code_challenge_method=S256");
  expect(loc).toContain("redirect_uri=https%3A%2F%2Fblockid.au%2Fapi%2Fauth%2Fgoogle%2Fcallback");
  expect(res.headers()["set-cookie"]).toMatch(/blockid_google_oauth=.*HttpOnly/);
});
test("login page always offers the redirect button", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByTestId("google-redirect-button")).toHaveAttribute("href", "/api/auth/google/start");
});
```

Unit suites: `npx vitest run src/app/api/auth/google src/app/auth/login src/lib/auth`.

## 5. Founder checklist (do once, in this order)

1. Google Cloud → OAuth consent screen → **Publish app** (status must read *In production*). Scopes are non-sensitive, so no review is required.
2. Credentials → the Web client → confirm the two JavaScript origins and add `https://blockid.au/api/auth/google/callback` to redirect URIs. Save (takes up to 5 min to propagate).
3. On the server confirm `GOOGLE_CLIENT_ID` == `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` is the current secret of *that* client.
4. Run the four curl lines in §4, then sign in once with **Continue with Google (redirect)** and once with the GIS button from a normal (non-test-user) Google account.
5. Watch `grep '\[auth:google\]'` for 24 h; a code from §3 tells you what is left.
