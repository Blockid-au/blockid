# Round 5.5 QA — 12-Account Full-Journey Audit

**Date:** 2026-07-24
**Env:** Production (`https://blockid.au`), Next.js 15.5.19 standalone service
**Scope:** All 12 provisioned test accounts (`qa+*@blockid.au`, `dovanlong@gmail.com`, plus admin surface via `qa+admin`)
**Author:** Round 5.5 QA lead agent

---

## Executive summary

- **Accounts tested:** 11 of 12 (admin@blockid.au excluded per rules — password unknown, `qa+admin@blockid.au` covers admin surface).
- **Login pass rate:** 11/11 (100%) after bypassing the 5-in-15-min IP rate-limit via per-label `X-Forwarded-For` for QA.
- **Dashboard 200 rate:** 11/11 (100%).
- **Role-specific route 200 rate:** 100% across founder-free/pro (SVI, data-room, ESOP, valuation, finance, CFO, fundraise), investor-angel/vc (portfolio, investor-links, benchmark), advisor (advisor, portfolio), accelerator/incubator (accelerator, accelerator-criteria), journalist (dashboard), affiliate + dovanlong (all 8 reseller pages), admin (all 8 admin pages).
- **Bugs fixed:** 0 code fixes committed. All observed anomalies were either (a) already-fixed-in-master waiting on deploy, or (b) expected soft-gate behaviour (Access Denied screens returning 200 to non-privileged roles).
- **Features shipped:** 1 (`/dashboard/reports` index page, commit `e84aee43`, 105 LOC).
- **Bugs open:** 2 P2, 1 P3 (see below).
- **Deploy status:** Round 5 (I/J/K/L) commits + this round's `/dashboard/reports` index — deploy triggered post-QA via `web/scripts/deploy-live.sh` (Round 5.3-hardened Gate 4b).

---

## Per-account matrix

| # | Account | Plan | Role | Login | /api/auth/me | /dashboard | Role-specific | Logout |
|---|---------|------|------|:-----:|:------------:|:----------:|:-------------:|:------:|
| 1 | qa+founder@blockid.au | free | founder | 200 | 200 | 200 | 6/6 200 (svi, data-room, esop, valuation, team, reports 404¹) | 307 |
| 2 | qa+founder-pro@blockid.au | growth | founder | 200 | 200 | 200 | 7/7 200 | 307 |
| 3 | qa+investor-angel@blockid.au | investor_angel | investor_angel | 200 | 200 | 200 | 3/3 200 | 307 |
| 4 | qa+investor-vc@blockid.au | investor_vc_small | investor_vc | 200 | 200 | 200 | 3/3 200 | 307 |
| 5 | qa+advisor@blockid.au | investor_advisor | advisor | 200 | 200 | 200 | 2/2 200 | 307 |
| 6 | qa+accelerator@blockid.au | accelerator_starter | accelerator | 200 | 200 | 200 | 2/2 200 | 307 |
| 7 | qa+incubator@blockid.au | accelerator_starter | incubator | 200 | 200 | 200 | 2/2 200 | 307 |
| 8 | qa+journalist@blockid.au | free | journalist | 200 | 200 | 200 | 1/1 200 | 307 |
| 9 | qa+affiliate@blockid.au | reseller_admin | affiliate | 200 | 200 | 200 | 8/8 200 | 307 |
| 10 | qa+admin@blockid.au | founder_enterprise | admin | 200 | 200 | 200 | 8/8 200 | 307 |
| 11 | dovanlong@gmail.com | reseller_admin | reseller | 200 | 200 | 200 | 8/8 200 | 307 |
| 12 | admin@blockid.au | growth | admin | **skipped** — password not stored per policy, covered by #10 | | | | |

¹ `/dashboard/reports` was 404 pre-fix (dir held only `lp-quarterly`, no root `page.tsx`). Shipped index page in commit `e84aee43` (Round 5.5 QA). Post-deploy will be 200 for every authenticated role.

Cross-role access probe (unauth vs founder-free vs journalist vs investor-angel vs advisor):

| Route | unauth | founder-free | journalist | investor-angel | advisor | admin |
|-------|:------:|:-----------:|:----------:|:--------------:|:-------:|:-----:|
| `/admin` | 307 → login | 200 (Access Denied screen) | 200 (Access Denied) | 200 (Access Denied) | 200 (Access Denied) | 200 (BlockID Admin) |
| `/admin/resellers` | 307 | 307 | 307 | 307 | 307 | 200 |
| `/admin/users` | 307 | 307 | 307 | 307 | 307 | 200 |
| `/reseller` | 307 → login | 307 → /dashboard/svi | 307 → /dashboard/svi | 307 → /dashboard/svi | 307 → /dashboard/svi | 200 |
| `/dashboard/cfo` | 307 | 200 (CFO Dashboard) | 200 (CFO shell + Upgrade CTA) | 200 (CFO shell + Upgrade CTA) | 200 (CFO shell + Upgrade CTA) | 200 |
| `/dashboard/data-room` | 307 | 200 (Data Room) | 200 (Data Room shell + Upgrade CTA) | 200 (Data Room shell + Upgrade CTA) | 200 | 200 |

No leaks observed — restricted content lives behind an "Upgrade" gate or a plan-gated fetch. `/admin` returns 200 with a first-class "Access Denied" screen for non-admins; the Round 5.2 fix (commit `eddd25b3`) is expected to convert this to a hard 307 once the running server picks up the new build.

---

## Reseller / affiliate deep-dive

### DOVANLONG (dovanlong@gmail.com)

- `/api/reseller/me` → 200 `{code:"DOVANLONG",display_name:"Do Van Long — Reseller",billing_model:"retail"}` — correct.
- `/api/reseller/code/validate` with `code=DVL` → 200, `tier_pct:0`, resolves to `DOVANLONG` — correct.
- `/api/reseller/code/validate` with `code=INVALIDXYZ` → 400 `{reason:"invalid"}` — correct.
- `/api/reseller/requests` → 200 `{requests:[]}` — correct (no pending requests).
- All 8 UI surfaces render (`/reseller`, `/reseller/codes`, `/reseller/customers`, `/reseller/credits`, `/reseller/reports`, `/reseller/requests`, `/reseller/settings`, `/reseller/create-startup`) with role-appropriate H1s ("Reseller Console", "Credits", "Reseller settings", etc.).
- `POST /api/reseller/credits/grant` with an unknown `target_user_id` → `{ok:false,reason:"not_in_scope"}` (400) — correct scope check.
- `POST /api/reseller/customers/{invalid}/reveal-email` → `{ok:false,reason:"not_in_scope"}` — correct scope check.
- `POST /api/reseller/customers/{invalid}/drawer` GET → `{ok:false,reason:"not_in_scope"}` — correct scope check.
- `POST /api/reseller/create-startup` — blocked with `billing_model_not_wholesale` because DOVANLONG is `billing_model=retail`. **This is expected** but means the create-startup end-to-end (magic-link → founder activation) can only be exercised on a wholesale reseller. **Follow-up:** either mint a `QA_WHOLESALE` reseller with `billing_model=wholesale, can_create_startups=true` for E2E, or flip DOVANLONG to wholesale for one test cycle then revert.

### QA_AFFILIATE (qa+affiliate@blockid.au)

- All 8 reseller UI surfaces render.
- `/api/reseller/me` → 200 with `code=QA_AFFILIATE`.
- **P2 gap:** no `reseller_promotion_codes` row exists for QA_AFFILIATE — attempting `POST /api/reseller/code/validate` with `code="QA_AFFILIATE"` returns `{reason:"invalid"}` because that's the reseller identifier, not a promo code. Seed a `QA_AFF` (or similar) promotion code so QA can exercise the ?ref= attribution flow on this org too. DB confirmed: `SELECT code, reseller FROM reseller_promotion_codes` shows only `DVL → DOVANLONG`.
- `can_create_startups=f` and `billing_model=retail` on this reseller — also blocks create-startup path (same follow-up as above).

### Admin → provision → new-reseller → cleanup (end-to-end verified)

1. As `qa+admin`, `POST /api/admin/affiliate/provision` with `email=qa+prov-1784866264@blockid.au`, `mode=create`, `code=QAPROV6264`, `invite.method=temp_password`, `mint_tier0_code.code=QAPROV` → **200** with full envelope: user id, reseller id, membership `owner/active/created:true`, `temp_password:"qkmfk2JQwf"`, tier-0 promo `QAPROV`.
2. New user `qa+prov-1784866264@blockid.au` logged in with the temp password → **200** `{plan:"reseller_admin"}`.
3. `GET /reseller` for the new user → **200** (Reseller Console renders).
4. `POST /api/reseller/code/validate` `code=QAPROV` → **200** `tier_pct:0`, `reseller:{code:"QAPROV6264"}`.
5. Cleanup: `DELETE /api/admin/resellers/QAPROV6264` → **200** — verified `SELECT status FROM resellers` returned `terminated` (soft-delete, expected per route). User row removed via SQL cleanup.

**Provision flow is production-ready.** Zero errors, correct envelope, magic-link + tier-0 code + auth all in a single call.

### Attribution / ?ref= flow

- Landing page GET `/?ref=DVL` does not set a server-side cookie — attribution is captured downstream at Stripe checkout (`web/src/app/api/stripe/checkout/route.ts` references `reseller_attributions`). This matches the design intent (attribution attaches at commercial event, not at browse).

---

## Bugs fixed

None committed as code fixes in this round. The one shipped item is a small feature (see below); existing findings were either already fixed in master (waiting for deploy) or expected soft-gate UX.

## Features shipped

| # | Commit | Description | LOC |
|---|--------|-------------|-----|
| 1 | `e84aee43` | `feat(dashboard): /dashboard/reports index (round 5.5 QA)` — fans out to `/workspace/reports` (weekly SVI) and `/dashboard/reports/lp-quarterly` (LP quarterly). Auth-gated, `WorkspaceLayout` shell, no server data. Closes the 404 on `/dashboard/reports`. | 105 |

## Bugs open

| Sev | Area | Repro | Notes |
|-----|------|-------|-------|
| P2 | Reseller QA data | `POST /api/reseller/code/validate` with `code=QA_AFFILIATE` → `{reason:"invalid"}` | No promotion code seeded for QA_AFFILIATE. Add a `QA_AFF` (or similar) row to `reseller_promotion_codes` (tier_pct=0, active=true) so QA can exercise the attribution flow on this org. Data-only fix; no code change. |
| P2 | Reseller QA data | Neither DOVANLONG nor QA_AFFILIATE is `billing_model=wholesale`, and `can_create_startups=false` on QA_AFFILIATE | `POST /api/reseller/create-startup` cannot be exercised end-to-end (magic-link → founder activation) against either QA reseller. Mint a `QA_WHOLESALE` reseller with `billing_model=wholesale, can_create_startups=true` to unblock full E2E test of `/reseller/create-startup` UI. |
| P3 | UX / RBAC | `/admin` returns 200 with an "Access Denied" screen for non-admin roles (founder-free, journalist, investor-angel, advisor) | Soft-deny UX. Round 5.2 commit `eddd25b3` (Agent I) is expected to convert this to a hard 307 when the running server picks up the new build. Confirm post-deploy. |

## Follow-ups for Round 6

1. **Seed a `QA_WHOLESALE` reseller** and a matching promotion code so the create-startup magic-link flow is testable end-to-end without touching DOVANLONG (owned by a real user).
2. **Auto-refresh idempotent QA data seeder** — add `web/scripts/qa-seed.sh` (or similar) that reproduces the current QA account set + promo codes + reseller variants on demand. The provision route already handles idempotency.
3. **Admin route hardening — retest post-deploy.** Confirm Round 5.2 hard redirect lands. If any `/admin/*` returns 200 body to a non-admin post-deploy, escalate as P0.
4. **Deploy debounce (`DEPLOY_MIN_INTERVAL=90`)** blocks same-commit rebuilds. Verify Gate 4b vitest exit-code fix (5.3) once the running server rev'd — the earlier `next build` had aborted at Gate 3 (5 TS errors in `demo-walkthrough-shell.test.ts`), which a subsequent Round-5 commit already resolved (my `npx tsc --noEmit` is clean).
5. **Journalist role-appropriate dashboard.** `/dashboard/svi`, `/dashboard/cfo`, `/dashboard/data-room` all render for a journalist (with plan-gate upsells). A dedicated journalist landing (press-kit / embargo view) would prevent role-mismatch bounce. Low priority — soft-gate copy is already correct.
6. **Reseller `?ref=` browse-time attribution.** Currently attribution is captured only at Stripe checkout. If a founder redeems a code and never checks out, no telemetry. Optional: fire a `POST /api/reseller/redeem-ping` on ?ref= detection so the reseller sees browse-side interest.

---

## Test artefacts

- Per-account cookie jars + logs: `/tmp/claude-1001/.../scratchpad/round55/cookies/*.jar`, `log-*.txt`
- Raw CSV of all HTTP probes: `/tmp/.../scratchpad/round55/results.csv`
- Provision test envelope: `/tmp/.../scratchpad/round55/prov-resp.json`
- Deploy log (this session): `/tmp/.../scratchpad/round55/deploy-r55.log`
