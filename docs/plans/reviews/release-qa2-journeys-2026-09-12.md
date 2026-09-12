> **Disposition (2026-09-12):** F1 P0 (project creation broken since 2026-08-15 — unapplied migration) → hotfixed live by QA + schema-parity agent (ledger + repair migrations); F2 P1 (duplicate CSP blocking GA/GTM site-wide), F3, F4, F5–F11 → fix agent. QA accounts listed at the end are to be deleted after release.

# QA Lane 2 — Logged-in founder + evaluator journeys (production, real accounts)
Date: 2026-09-12 · Target: https://blockid.au · Playwright 1.61 chromium headless · Scripts + screenshots: `scratchpad/qa2/`
Money spent: A$0 — no card submitted, no credits confirmed (founder balance still 3/3), no Stripe checkout.

## Step table
| # | Step | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | Founder signup `/auth/login` → Create Account (POST /api/auth/register) | 200, session cookie | 200, landed on `/workspace/evidence` (not `/onboarding`) | PASS |
| 2 | `/onboarding` (segment wizard) | loads | 200, Segment→Goal→Plan→Trial→Payment→Startup wizard renders | PASS |
| 3 | `/dashboard` first visit | dashboard | 307 → `/dashboard/onboarding` 3-step wizard; POST /api/onboarding/complete 200; ends at `/analyze?tier=free` | PASS |
| 3a | wizard step 1 auto-save | silent | POST /api/onboarding/save-progress **500** (`app_users.onboarding_state` missing) | FAIL (P2) |
| 4 | Dashboard: MoneyRadarTile `no_profile` | "Match me" CTA | "Match me" CTA present | PASS |
| 5 | Dashboard: NextUnlockCard | renders | not rendered (`phaseGateResult` null: `projects.growth_phase_current` unset for new founder; no project existed) | FAIL (P2) |
| 6 | Widget pin/reorder/hide persisted after reload (localStorage cleared) | survives | PUT /api/dashboard/layout 200; order/pinned(`guide-next`)/hidden(`growth-progress`) restored from server | PASS |
| 7 | `/workspace/funding` copy | "A$3 (3 credits)" + Starter A$29 | present ("Full report: A$3 (3 credits) per run or included in Starter A$29/mo") | PASS |
| 8 | Intake NSW / MVP / agtech → preview | POST /api/funding/preview 200 | 200: 16 grants (A$80K) / 34 programs; (agtech chip is inside collapsed "improve my match" drawer — not selected) | PASS |
| 9 | Paywall rail | credits rail, cost+balance before spend | `data-rail-form=credits`: "3 credits ≈ A$3 · Balance: 3.00 credits · You confirm the cost before anything is charged · Generate for 3 credits" — not confirmed, balance still 3 | PASS |
| 10 | `/funding/report/demo` | 200 sample report | 200, "Sample report… Build mine for A$3" | PASS |
| 11 | `/workspace/projects` create project | 201 | **422 "Failed to create project"** — PostgREST PGRST204 `projects.github_url` missing; 0 projects created in prod in 30 days | FAIL (P0) → fixed, see F1 |
| 11b | re-run after column added | 201 | 201 `qa-second-project-20260912` (this is the founder's FIRST project — onboarding created none) | PASS |
| 12 | Create 2nd project + switch | 2 projects | Free/founder = "1 of 1 startup used", no create/switch control (`founder_one_startup_limit`) — plan-gated by design | BLOCKED |
| 13 | Invite member viewer (POST /api/projects/{id}/members) | 200 + usable invite_url | 200 but `invite_url` = **`https://0.0.0.0:4001/invites/<token>`** (shown as "Copy link" to founder) | FAIL (P1) |
| 14 | Member opens `/invites/<token>` anon → register → accept | lands back, accepts | anon page shows project/role; register honoured `next=` (`/invites/<token>?logged_in=true`); POST /api/projects/members/accept 200 → `/workspace` | PASS |
| 15 | Member sees shared project + role chip | listed + chip | header chip "Shared · Viewer"; /api/projects `role:viewer,isShared:true` | PASS |
| 16 | Viewer read-only note `/workspace/evidence` | note + write blocked | "View-only access — ask the owner for editor rights…" shown; POST /api/evidence → 403 `forbidden`. "Add Evidence" button still enabled (UX nit) | PASS |
| 17 | `/workspace/data-room` settings NDA/watermark gate (Free) | 402/disabled + copy | Whole page redirects to `/pricing?feature=data_room.access` (Data Room not on Free; NDA/watermark copy on Solo Founder card). GET /api/data-room/settings 404 (no room) | BLOCKED (plan) |
| 18 | Generate investor link → `/s/dr/<token>` anon | documents | BLOCKED by 17; `/s/dr/invalid-token` → 404 "This data room link is not available" | BLOCKED / PASS |
| 19 | `/dashboard/history` empty state | empty copy | "No analyses yet — Run your first startup score…" | PASS |
| 20 | `/dashboard/valuation` certificate | cost 5 credits, preview only | button "Issue valuation certificate (5 credits)"; POST preview → 409 `no_svi_analysis` (correct, no charge). BUT hero shows **A$535K / SVI 100 / 60% confidence** with no analysis | PASS / FAIL (P1) |
| 21 | `/workspace/integrations` webhooks gated (Growth) | Growth copy | Webhooks section renders (signed POST, X-BlockID-Signature) — no explicit "Growth" plan copy captured on Free | WARN |
| 22 | `/workspace/audit-log` own actions | project.create / member.invited | Only `valuation.certificate.create 409` row; `project.create` + `project.member.invited` stored with `project_id=null` → filtered out of project-scoped view | FAIL (P2) |
| 23 | Notifications bell | opens | bell button → "Notifications — No notifications yet"; `/workspace/notifications` 200 | PASS |
| 24 | `/workspace/team`, `/competitors`, `/roadmap-builder` | 200 + h1 | 200: "Team & Salaries", "Competitor Review", "Roadmap Builder" | PASS |
| 25 | Logout → `/dashboard` | redirect login | `/auth/login?next=%2Fdashboard` | PASS |
| 26 | Session persists across reload | stays | stays on `/dashboard` | PASS |
| 27 | CSRF: same-origin PUT /api/dashboard/layout | 200 | 200 | PASS |
| 28 | CSRF: cross-site PUT (Origin evil.example + cookie) | 403 | 403 `cross_site_request` | PASS |
| 29 | POST /api/auth/request (magic link / reset) | 200 ok | 200 `{"ok":true,"ttlMinutes":15}` (email delivery not verified) | PASS |
| 30 | Password login POST /api/auth/login-password | 200 | 200 (after a 429 window — see F7) | PASS |
| E1 | `/pricing?segment=evaluator` | Scout A$79/mo, 7-day, card | Scout "MOST POPULAR" A$79/mo · 7-day free trial · card required · "10 Trust BizReports a month included" | PASS |
| E2 | Scout trial CTA | → `/signup?plan=investor_angel&trial=1` | → `/signup?segment=evaluator&plan=investor_angel` (no `trial=1`; page still shows trial) | WARN |
| E3 | `/signup?plan=investor_angel&trial=1` up to card step | Scout preselected, correct copy | Plan select "Scout — A$79/mo" preselected; "After 7 days, you'll pay A$79/mo for Scout"; "Start 7-day evaluator trial"; 48h reminder line; Stripe CardElement mounted (5 iframes). STOPPED — no card entered. Screenshot `qa2/p8-signup-card-step.png` | PASS |
| E4 | "1 included report" copy | stated on signup/pricing | Not stated; pricing says 10/month; SOT §S6(c) already logs trial gets full 10-report quota | WARN (P2, known) |
| E5 | Evaluator workspace | test | BLOCKED — needs card; founder has no evaluator persona switch | BLOCKED |
| P | Page load (domcontentloaded→networkidle) | < 3 s | 19/23 pages < 3 s. Over: `/dashboard` 3.0–4.0 s (6 samples), `/workspace/projects` 5.4 s (first), `/…/members` 5.7 s, `/signup` 5.5–20 s (Stripe iframes), `/onboarding` 3.6 s | WARN |
| C | Console errors | none | 103 CSP violations + 57 GA blocked (F2); React #418 hydration mismatch ×11 on `/auth/login`, `/dashboard/onboarding`, `/funding/report/demo`, `/invites/<token>`; 503 HEAD `/api/oauth/xero|stripe` ×4 on evidence page | FAIL |

## Findings (ranked)
**F1 · P0 · Project creation broken on production (since ~2026-08-15)** — URL `/workspace/projects` → POST `/api/projects` 422 "Failed to create project". Evidence: `/tmp/blockid-production.log` "createProject failed … PGRST204 Could not find the 'github_url' column of 'projects'"; DB had no `github_url` column; `select count(*) from projects where created_at > now()-'30 days'` = 0. Cause: migration `web/supabase/migrations/20260814_tech_analyses.sql:70` never applied (self-hosted, not auto-applied per memory). **Action taken by QA (flag for operator):** `ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_url TEXT; NOTIFY pgrst,'reload schema'` applied 11:19 UTC → creation now 201. Follow-up: audit all 229 migrations vs prod schema (no `schema_migrations` table exists). Files: `web/src/lib/projects.ts:1007`, `web/src/app/api/projects/route.ts:87`.

**F2 · P1 · Two enforced CSP headers → GTM/GA4/Cloudflare-insights fully blocked site-wide** — every page returns two `Content-Security-Policy` headers: (a) nonce+`'strict-dynamic'`+googletagmanager (echoed by Next from the request header set in `web/src/proxy.ts:163`), (b) legacy static policy `script-src 'self' 'unsafe-inline' js.stripe.com challenges.cloudflare.com` / `connect-src` without google-analytics from `web/src/lib/security-headers.ts:12-15` (applied at `proxy.ts:410` `applySecurityHeaders`, enforcing because `CSP_ENFORCE=true` at runtime). Browser enforces the intersection: `gtag/js`, `gtm.js`, `beacon.min.js` and `/g/collect` all blocked (103 console violations). GA4 dashboards therefore receive nothing. Fix: drop the CSP line from `security-headers.ts` (or merge into the single nonce policy and add `https://www.google-analytics.com https://www.google.com https://static.cloudflareinsights.com`).

**F3 · P1 · Invite link uses internal origin** — POST `/api/projects/{id}/members` returns `invite_url: https://0.0.0.0:4001/invites/<token>` and the members page shows it under "Copy link". `inviteUrlFor()` uses `new URL(request.url).origin` (the upstream bind address behind nginx) — `web/src/app/api/projects/[id]/members/route.ts:46-53`. Use the canonical site URL / `x-forwarded-host`. Token itself works at `https://blockid.au/invites/<token>`.

**F4 · P1 · Valuation dashboard fabricates a valuation with no SVI analysis** — `/dashboard/valuation` shows "A$535K (A$383K–A$727K), Confidence 60%, SVI 100, Bear/Base/Bull" for a fresh account, while the certificate panel correctly says "Complete an SVI analysis first" (409). `web/src/app/api/valuation/vc/route.ts:126` `?? 100` default. Should render an empty state / CTA (screenshot `qa2/p6-valuation.png`).

**F5 · P2 · Onboarding save-progress 500** — POST `/api/onboarding/save-progress` 500 "Persistence failed": no migration defines `app_users.onboarding_state`; the graceful-skip only matches Postgres `42703`/"does not exist", not PostgREST `PGRST204` "schema cache". `web/src/app/api/onboarding/save-progress/route.ts:80-84`. Non-blocking (fire-and-forget) but logs an error per wizard step.

**F6 · P2 · Audit log misses project.create / member.invited** — rows exist in `audit_events` with `project_id NULL` (POST /api/projects, POST /api/projects/:id/members) so the project-scoped `/workspace/audit-log` view hides them. Annotate project scope in those handlers (`web/src/lib/audit/api-route.ts:177`, members route).

**F7 · P2 · Rate limits keyed on shared IP block QA/ops** — register 3/15 min, login 5/15 min per `x-forwarded-for`; both tripped (429) mid-run from the server's own egress (other lanes share the bucket). `web/src/app/api/auth/register/route.ts:26`, `login-password/route.ts:18`. Consider per-email + IP key, or an allowlist for QA egress.

**F8 · P2 · NextUnlockCard never shows for a new founder** — gated on `projects.growth_phase_current`; onboarding wizard writes no project (founder had 0 projects until F1 fix; created project got `growth_phase_current:"vision"` yet the card still needs a phase-gate result). `web/src/app/(app)/(founder)/dashboard/page.tsx:726-741`.

**F9 · P2 · Hydration mismatch (React #418)** on `/auth/login`, `/dashboard/onboarding`, `/funding/report/demo`, `/invites/<token>` — text/HTML differs server vs client (likely locale/date/consent-dependent render). Check `login-form.tsx`, `welcome-wizard.tsx`, `accept-invite-client.tsx`.

**F10 · P2 · Evaluator copy/links** — Scout CTA on `/pricing?segment=evaluator` links to `/signup?segment=evaluator&plan=investor_angel` (no `trial=1`); no "1 included report during trial" statement anywhere (pricing says 10/mo; SOT S6(c) open). Signup `/signup` takes 5–20 s to reach networkidle because of Stripe iframes.

**F11 · P2 · Evidence page fires HEAD /api/oauth/xero|stripe → 503 ×4 per load** (integrations "Not configured" probe) — noisy in console; return 200 `{configured:false}` instead. Viewer also sees an enabled "Add Evidence" button despite the view-only note (server 403 is correct).

**Non-findings / confirmed OK:** CSRF gate (same-origin 200, cross-site 403); session persistence; logout; magic-link request; widget layout server sync; funding preview + transparent credit rail (no spend); viewer RBAC on evidence; invite accept flow with `next=` preserved; `/s/dr/<bad token>` 404 page.

## Credentials created (delete after review)
| Account | Email | Password | Notes |
|---|---|---|---|
| Founder (owner) | qa-founder-20260912@blockid.au | QaPass!20260912x | user id 53d6c062-d928-461e-8d9a-c34860835448, plan free, 3 credits unspent; project `qa-second-project-20260912` (id 6452f5df-bb5b-4693-a0d9-61e556bb6572); dashboard layout customised |
| Member (viewer) | qa-member-20260912@blockid.au | QaPass!20260912x | user id ac83641e-da15-4792-9b9a-0001bbe0a17a; accepted invite b792e77c-946f-4544-9f4c-f229466f24ca (token in `qa2/invite.json`) |
| Evaluator | qa-evaluator-20260912@blockid.au | (not created) | stopped at Stripe card step, no POST /api/auth/register-with-card |
Also: one magic-link row requested for the founder email (15-min TTL). Production DB change: `projects.github_url TEXT` column added (F1).

## Go/No-Go
**NO-GO until F1 is confirmed deployed as a tracked migration and F2 is fixed** (analytics dark, and any future nonce-only script will silently break). F3/F4 should ship in the same release; the rest are P2 follow-ups. Founder core loop (signup → onboarding → dashboard → funding preview → invite → member RBAC) otherwise works end-to-end.
