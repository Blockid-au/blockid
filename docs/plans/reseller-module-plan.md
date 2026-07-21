# BlockID.au — Reseller / Affiliate Module: Feature Plan

> **Plan-mode file.** Upon approval, move to `docs/plans/reseller-module-plan.md` (the founder-requested location). No code changes in this session; every citation is `path:line` for future execution.

---

## Context — why this change

BlockID.au has signed its first reseller agreement (InfoVision) and must ship a **multi-reseller** module — InfoVision is row #1, not the whole spec. The agreement fixes five economic requirements that constrain the design:

1. Money settles 100% into BlockID's Stripe (**no Stripe Connect**); reseller earnings are a ledger inside our app, paid off-Stripe.
2. Commission = **40% of list price − discount given**, recurring per paid invoice, never during trial, clawed back on 7-day money-back refunds. BlockID always nets 60% of list.
3. Five discount tiers per reseller (0/10/20/30/40 %); Stripe rejects 0-value coupons so the 0% "identification-only" code needs an app-native mechanism.
4. Reseller console must show **only operational data** about attributed customers (Australian Privacy Act 1988 / APPs); a collection notice is required at signup when a code is used.
5. Share Management (cap table, vesting, tokenization) is decoupled from base subscriptions and becomes a standalone add-on; existing subscribers grandfathered; reseller codes and commission apply to the add-on too.

Intended outcome: a reusable, multi-reseller attribution-and-commission surface that plugs into BlockID's existing Stripe, entitlement, and workspace patterns without introducing a parallel tenancy model.

---

## Update — 2026-07-22 founder clarifications (supersedes downstream sections where noted)

Five clarifications received after the first plan was approved. Each supersedes the earlier text in the section named. Downstream sections A–H remain valid except where explicitly overridden here.

### U.1 Stripe account identity — **Auschain PTY LTD**

The Stripe account is owned by **Auschain PTY LTD** (ACN 659 615 111, ABN 79 659 615 111). Single account, no Connect. All live price IDs in production share the account-namespace suffix `J7OAnXQ9sV` (evidence in [web/CFO-WEEK1-REPORT.md:31-43](web/CFO-WEEK1-REPORT.md)). Seller of record on every reseller-attributed invoice remains Auschain — this locks section C.3 Surface 3 and D.3.

**Gap to resolve out-of-repo before P3 goes live:** the repo does NOT record which email is the Stripe dashboard **login owner** (`info@blockid.au` vs `admin@blockid.au`). In-repo emails today: `info@blockid.au` is only outbound SMTP (`web/src/lib/email.ts:21`); `admin@blockid.au` is app-level super-admin (`web/src/lib/auth.ts:436`, `docs/ARCHITECTURE.md:901`). Verify at `dashboard.stripe.com → Settings → Team & Account → Account details`, and confirm:
1. Account owner email.
2. Business ABN inside Stripe matches `79 659 615 111`.
3. `statement_descriptor` reads `BLOCKID` or `AUSCHAIN` (not a placeholder).
4. Bank/payout account is Auschain's, not a founder's personal.

Add the answer to `docs/plans/reseller-module-goal.md` (P0 output — see U.5) as `stripe.account_owner_email`.

### U.2 A$99 / 200 credits maps 1:1 to **existing `founder_growth`** — no new SKU

Verified in [web/src/config/pricing/plans.csv:4](web/src/config/pricing/plans.csv):
- `founder_growth`, `price_aud_cents=9900`, `annual_price_aud_cents=99000`, `trial_days=7`, `usage_limits.monthly_credits=200`.
- Mirrored in `web/src/config/pricing/plans.generated.ts:65-66,80` and `web/src/config/pricing/stripe-seed.json:21-22`.
- Legacy fallback [web/src/lib/credits.ts:214-215](web/src/lib/credits.ts): `growth` and `growth_annual` → `{amount:200, recurring:true}` — matches.

**This resolves H.11 (credit-numbers discrepancy):** the earlier brief's "200/800/3000" was a mis-quote. Actual per-tier grants live in `plans.csv` `usage_limits.monthly_credits`: Starter=25, Growth=200, Scale=1000, Enterprise=unlimited. **The code wins.** No new SKU is required for reseller-attributed base subscriptions — attributed startups subscribe to `founder_growth` and receive its 200-credit grant automatically.

**Still missing (unchanged from the original plan):** no cron re-grants credits on `subscription_cycle`. Build in P3 alongside the webhook refactor.

### U.3 Two billing models — **`retail`** (original) + **`wholesale`** (InfoVision default)

Two economic flows are now supported, selectable per reseller via a new `resellers.billing_model` column (`text not null default 'retail' check (billing_model in ('retail','wholesale'))`):

| Model | Who pays Stripe | Reseller economics | Attribution mechanic |
|---|---|---|---|
| **`retail`** (original R1–R3) | The startup / founder | Reseller earns commission = 40% list − discount, off-Stripe monthly payout | Discount code applied at customer checkout |
| **`wholesale`** (new; InfoVision default) | The reseller | Reseller subscribes on behalf of each attributed startup at list ($99/mo Growth SKU); startup gets full access + 200 credits/mo without paying BlockID | Reseller creates the startup via `/reseller/create-startup` (C.1.5); Stripe customer + subscription are owned by the reseller's Stripe customer object |

**Data-model impact (supersedes D.1 `resellers` table row and D.2):**
- `resellers.billing_model` column added as above.
- In `wholesale` mode, `resellers.can_create_startups` is implicitly `true` and the create-startup form (C.1.5) becomes the primary funnel. Direct `?via=` self-signup is disabled for wholesale resellers unless explicitly enabled.
- Stripe customer for a wholesale-attributed startup is created with `metadata.paying_reseller_id=<uuid>` AND `metadata.subject_startup_user_id=<founder_uuid>`. Attribution row (`reseller_attributions`) uses `source='provisioned'` and `subject_user_id=<founder_uuid>`.
- `reseller_commissions` ledger still writes on `invoice.paid` for wholesale, with `commission_aud_cents=0` (the reseller keeps 100% of margin outside BlockID; ledger row exists purely for reconciliation and audit). The DB CHECK invariant `list − discount − commission = 0.60 × list` **must be relaxed for wholesale**: replace with a computed column check on `billing_model` — retail rows enforce the 60/40 split; wholesale rows enforce `commission_aud_cents = 0 AND list = amount_paid` (unless a promo code applied).
- Reseller pricing to the end-customer in wholesale is **off-Stripe** (bill-back arrangement between InfoVision and their startup); BlockID's role is just to collect A$99/mo per subscription and grant 200 credits/mo.

**Discount codes still work in wholesale.** If InfoVision uses their own `INFOVISION20` code at checkout to bring their COGS down 20%, the Stripe subscription discount applies and the ledger records the reduced `amount_paid`. Reseller commission remains 0 — the discount just reduces the reseller's payment to BlockID.

**Rationale.** InfoVision's flow ("we sell and manage, you serve") is a wholesale flow; retail-with-commission was designed for referral partners who will come next. Modeling both is one column and one CHECK branch, so we do it now instead of paying migration debt later.

### U.4 Reseller's own AI-credit usage — **Reseller Sandbox Workspace**

Problem: a reseller admin who wants to try the AI features themselves has no credit balance — credits attach to `app_users.id`, and reseller admins aren't billed customers. Founder asked for a "convenient" solution rather than forcing double-signup.

**Recommendation.** One hidden `projects` row per reseller org, owned by the reseller-admin `app_users` row, flagged with a new `projects.reseller_sandbox_id uuid → resellers(id) nullable`. Credits consumed inside a sandbox project draw from the reseller's `monthly_credit_budget` (D.1) instead of `credit_balances`.

Concrete mechanics (supersedes A.3 "Manual top-up hooks" and C.1.4):
- One-time creation on reseller org activation: `POST /reseller/setup-sandbox` provisions the workspace and stamps `reseller_sandbox_id`. Uses the same `createProject()` at [web/src/lib/projects.ts:398](web/src/lib/projects.ts); the sandbox project **does not count against `PLAN_PROJECT_LIMITS`** — bypass check when `reseller_sandbox_id IS NOT NULL`.
- `spendCredits()` at [web/src/lib/credits.ts:448](web/src/lib/credits.ts) grows one branch: if `metadata.project_id` maps to a sandbox project, debit `reseller_credit_grants` (as a `sandbox_spend` row with negative amount) instead of `credit_balances`. Over-budget → same admin-approval flow used for grants.
- Sandbox is **invisible** in the reseller's own "Customers" list (belongs to the org, not to an attributed customer), does not count in KPI reports (C.6), does not appear in the commission ledger.
- Instrumented in `/reseller/settings` under "Sandbox usage MTD" and in the monthly report as a separate line.

**Alternatives considered & rejected:**
1. *Reseller signs up as normal customer* — cleanest ledger but double logins, conflates reseller ≠ customer identity. Founder explicitly wants better.
2. *Dedicated free credit pool separate from the customer budget* — invites abuse, adds a ledger, harder to cap.
3. *Reseller consumes attributed customer's credits* — violates R6 privacy scoping.

Sandbox reuses the existing budget + audit trail, adds one column, and passes the "no cross-tenant leakage" test.

### U.5 Continuous autonomous delivery model (P0 + P11)

Founder direction: run the roadmap **without wall-clock time-boxing**, using the existing continuous-improvement infrastructure to spawn parallel agents that grind until each phase's exit criteria are met.

Anchors this to the existing project pattern in memory: *CEO Implementing Loop* (research → CEO plan → code → version/milestone/architecture) and *Cloud Routines* (7 Anthropic cloud C-Level routines running off-peak). Reference: `[[project_ceo_implementing_loop]]`, `[[project_cloud_routines]]`.

**Machine-readable goal file.** Add `docs/plans/reseller-module-goal.md` — the single source of truth the autonomous loop pulls from on each tick. Schema (YAML front-matter + body):

```yaml
goal_id: reseller-module-v1
status: in_progress                     # in_progress | done | paused
billing_model_default: wholesale        # per U.3
stripe:
  seller_of_record: "Auschain PTY LTD"
  abn: "79 659 615 111"
  account_owner_email: TBD              # fill after U.1 out-of-repo check
resellers_seeded:
  - code: INFOVISION
    display_name: InfoVision
    billing_model: wholesale
    allowed_tiers: [0,10,20,30,40]
    monthly_credit_budget: 20000
    can_create_startups: true
    can_grant_credits: true
phases:
  P0_goal_and_orchestration:  {status: pending, exit_criteria: [...]}
  P1_foundations:             {status: pending, exit_criteria: [...]}
  P2_redemption:              ...
  P3_ledger_webhooks:         ...
  P4_console:                 ...
  P5_cobranding:              ...
  P6_capabilities_sandbox:    ...      # sandbox from U.4 lands here
  P7_reports:                 ...
  P8_share_management_addon:  ...
  P9_admin_surface:           ...
  P10_hardening:              ...
  P11_ongoing:                {status: pending, exit_criteria: never}
current_focus: P0
open_questions:
  H.1_coupon_duration: "forever"
  H.2_addon_price: "AUD 49 mo / 490 yr"
  ...                                    # H.1-H.15 answers land here
kpi:
  eng_weeks_burned: 0
  phases_shipped: 0
  playwright_pass_pct: 0
  ledger_drift_events: 0
  attributed_startups: 0
  sandbox_credits_consumed_mtd: 0
```

**Agent parallelism model** — the loop reuses existing Claude Code primitives (see [[reference_ai_model_autorefresh]] for the cron pattern; existing crons under [web/src/app/api/cron/](web/src/app/api/cron/)):

- **CEO loop** (per off-peak tick, per `[[project_ceo_implementing_loop]]`): reads goal file, picks `current_focus`, spawns 4 subagents in parallel:
  - **CTO subagent** — implements the phase inside a git worktree (schemas, routes, UI). Worktree isolation prevents conflicts with concurrent phases.
  - **QA subagent** — runs Playwright + unit tests against the phase's exit criteria (the G.2/G.3 scenarios).
  - **CDO subagent** — verifies commission math invariants (`web/src/lib/reseller/commission.ts` truth table) and audit-log completeness (E.3).
  - **CFO subagent** — reconciles `reseller_commissions ↔ revenue_events` on `stripe_event_id`; alerts on drift.
- Loop tick cadence: off-peak windows only (memory: `code/deploy gated off-peak for 24/7 uptime`). Between ticks the harness re-invokes on notification; no polling.
- Exit criteria met → CEO marks phase `done`, sets `current_focus` to next phase. When all P0–P10 done, `current_focus` → `P11_ongoing`; loop keeps running for weekly KPI digest + drift auto-triage + onboarding subsequent resellers (row #2, #3…) with zero engineering time.

**New phases added to G.1:**

| # | Phase | Deps | Feature flag | What it delivers |
|---|---|---|---|---|
| **P0** | Goal file + agent orchestration (prep) | — | `RESELLER_AUTONOMOUS_LOOP` | Write `docs/plans/reseller-module-goal.md`; add cron `scripts/cron/reseller-goal-loop.mjs` that picks `current_focus`, invokes CEO agent, records tick in `web/content/reports/reseller-goal-history.jsonl`. Seeds InfoVision row in `resellers` (post-P1) or a stub row in Supabase pending schema. |
| **P11** | Ongoing loop | P0–P10 | (existing) | Weekly KPI digest to `admin@blockid.au`; auto-triage drift alerts (stripe-sync cron findings) into loop queue; onboards new resellers (`INSERT INTO resellers` + code minting) via `/admin/resellers` UI + auto-continuation. No exit criterion — designed to run forever. |

**Kill switch:** `RESELLER_AUTONOMOUS_LOOP=off` in env stops the cron immediately; goal file remains for manual replay.

---

## A. AS-IS Architecture Map (+ reuse-vs-build verdicts)

### A.1 Billing & Stripe

| Concern | Where it lives today | Reuse vs Build |
|---|---|---|
| Checkout session creation | [web/src/app/api/stripe/checkout/route.ts](web/src/app/api/stripe/checkout/route.ts) — `allow_promotion_codes: true` at L130; `discounts:[{coupon}]` pass-through at L161; when explicit coupon set, `allow_promotion_codes` is **deleted** at L163 (prevents stacking) | **Extend**: stamp reseller metadata + apply promotion_code from our own `reseller_promotion_codes` catalogue |
| Trial handling | Trial days from DB `plans.trial_days`; `payment_method_collection: "always"` (L136); `trial_settings.end_behavior.missing_payment_method: "cancel"` (L146). Card captured Day 1, charged Day 8 via `invoice.paid` with `billing_reason: subscription_create` | **Reuse verbatim** |
| SKU catalogue | 12 SKUs in [web/src/config/pricing/plans.csv](web/src/config/pricing/plans.csv) → generated `plans.generated.ts` → mirrored to Supabase `plans` table (migration 0074). Resolver [web/src/lib/plans-db.ts](web/src/lib/plans-db.ts) (`getPlanCached`, 60s TTL). Legacy env vars in [web/src/lib/stripe.ts:33](web/src/lib/stripe.ts) | **Extend**: add `reseller_share_pct`, `reseller_eligible`, `is_addon` columns |
| Stripe Tax / GST | **Not** using Stripe automatic tax. GST split post-hoc in webhook via [web/src/lib/gst.ts](web/src/lib/gst.ts) — `splitGst(gross) → {gross, gst = round(gross/11), net}`. Prices are AUD GST-inclusive | **Reuse verbatim**; commission is computed on the same `amount_paid` that GST is split from |
| Promotion codes / coupons | Stripe promotion codes ENABLED at checkout by default. Separate app-side `coupons` + `coupon_redemptions` (migration 0006) + `/api/coupon/validate` + `/api/coupon/redeem` + UI [web/src/components/landing/pricing-coupon.tsx](web/src/components/landing/pricing-coupon.tsx) | **Do not merge** — reseller codes are their own concept with commission economics; keep `coupons` for churn/marketing (`DOWNGRADE_STARTER50`, `COMEBACK30`) |
| Webhook handler | [web/src/app/api/stripe/webhook/route.ts](web/src/app/api/stripe/webhook/route.ts) handles `checkout.session.completed`, `customer.subscription.deleted/updated/trial_will_end`, `setup_intent.succeeded`, `invoice.payment_failed`, `invoice.paid` (guarded on `billing_reason ∈ {subscription_cycle, subscription_update, subscription_create}`). **Missing**: `charge.refunded`, `charge.dispute.*`, `credit_note.*`, `invoice.voided` | **Extend** with all five missing events |
| Idempotency | [web/src/lib/stripe/verify.ts](web/src/lib/stripe/verify.ts) — `claimWebhookEvent` inserts into `stripe_webhook_events(id UNIQUE, type)`; 23505 → short-circuit | **Reuse verbatim** |
| Revenue log | `revenue_events(stripe_event_id UNIQUE, gross_aud_cents, gst_aud_cents, net_aud_cents, kind)` written by `recordRevenueEvent` in webhook | **Extend** with `reseller_id`, `reseller_commission_aud_cents` (nullable) — keeps this table the SoT for BlockID net revenue |
| Refunds / money-back | Marketing copy only (7-day money-back in [web/src/components/landing/faq-v2.tsx:23](web/src/components/landing/faq-v2.tsx); [web/src/lib/pricing-data.ts:258](web/src/lib/pricing-data.ts)). **No code path.** No `charge.refunded` handler. No DB write path | **Build new** — required for R3 clawback anyway |

### A.2 Accounts, workspaces & roles

| Concern | Where it lives today | Reuse vs Build |
|---|---|---|
| User table | `app_users(id, email, role='user'|'admin', plan, referred_by, referral_code, account_type='founder'|'investor'|'journalist')`. Custom auth, no Supabase Auth. Migrations 0005/0006/0019/0035/0067 | **Extend** with `attribution_reseller_id` (nullable FK) and add `reseller` to `account_type` enum |
| Workspaces | `projects(user_id, name, slug, industry, stage, is_default, archived_at)` migration 0020; limit enforced in app code by [web/src/lib/projects.ts:32](web/src/lib/projects.ts) `PLAN_PROJECT_LIMITS = {free:1, founding50:3, founder:3, growth:10, unlimited:999}`, checked in `createProject()` at L398. **Not** a separate org/tenant | **Extend** with `attribution_reseller_id` for per-workspace override |
| Parent → child pattern | Two precedents. (a) `advisor_clients(advisor_id → app_users, client_id → app_users, status, linked_at)` migration 0058 — a **real user↔user link with status**; read at [/api/advisor/clients/route.ts:20](web/src/app/api/advisor/clients/route.ts). (b) `accelerator_cohorts` + `cohort_members` migration 0021 — admin-only; members are **email rows, orphan** until that email signs up. Admin UI at [/admin/accelerator](web/src/app/admin/accelerator/page.tsx) | **Reuse `advisor_clients` shape** for `reseller_admins` and `reseller_attributions` — it is the only real link table with status; cohorts are the wrong template because member rows are email-orphans |
| Roles | `app_users.role='user'|'admin'`. `ADMIN_EMAIL` constant at [web/src/lib/auth.ts:436](web/src/lib/auth.ts). Admin gate is **repeated inline** `user.email === ADMIN_EMAIL || user.role === 'admin'` in ~20 route files (e.g. [admin/page.tsx:20](web/src/app/admin/page.tsx), [/api/admin/accelerator/route.ts:9](web/src/app/api/admin/accelerator/route.ts)) | **Extract** a shared `requireAdmin()` middleware in the same PR as the reseller module — hostile-refactor optional but low-cost |
| Segments | Enum at [web/src/lib/segments.ts:17](web/src/lib/segments.ts) — `founder|investor_angel|investor_vc|advisor|accelerator|lp|admin`. Onboarding validates against `VALID_SEGMENTS` at [onboarding-wizard.tsx:38](web/src/app/onboarding/onboarding-wizard.tsx) | **Extend** with `reseller` |
| Entitlements | Central engine [web/src/lib/entitlements.ts](web/src/lib/entitlements.ts): `can(user, feature)` at L208 reads `plans.feature_flags`; `requireFeature` at L236; `LEGACY_FEATURE_FALLBACK` at L99. Client hook [web/src/hooks/useEntitlement.ts](web/src/hooks/useEntitlement.ts) polls `/api/entitlement/me` every 60 s. Feature union L27–L70 already includes `cap_table.write/read`, `data_room.access/read/write`, `esop.manage`, `blockchain.sync`, `advisor_portal`, `accelerator.cohort`, `cohort.view/manage`, `weekly_delta`, `lp_report`, `white_label` | **Reuse** — add new literals `reseller.console`, `reseller.create_startup`, `reseller.grant_credits`, `share_management`, `vesting.read/write` |
| Scattered gates that will need consolidation | Hard-coded `PRO_PLANS` in [/api/branding/route.ts:7](web/src/app/api/branding/route.ts); plan switches in [web/src/lib/api-keys.ts:45](web/src/lib/api-keys.ts) and [web/src/lib/projects.ts:32](web/src/lib/projects.ts); cap-table / data-room / vesting / token routes gate at nav-level only + `credit_cost:0` in [web/src/lib/credits.ts:124](web/src/lib/credits.ts) | **Consolidate** during Share-Management split (mandatory — see F.2) |
| RLS posture | Default-deny with service-role bypass ([supabase/migrations/0050_enable_rls_defense_in_depth.sql](web/supabase/migrations/0050_enable_rls_defense_in_depth.sql)). Route handlers do all scoping | **Continue the pattern** — introduce a `scopedReseller(user)` helper (analogue of the inline `requireAdmin` check) as the single choke point for every `/api/reseller/*` route |

### A.3 AI credits

| Concern | Where it lives today | Reuse vs Build |
|---|---|---|
| Storage | `credit_balances(user_id, balance, lifetime_earned, lifetime_spent)`, `credit_transactions(user_id, amount, balance_after, reason, metadata)`, `usage_logs(user_id, feature, credits_used)`. All in [web/src/lib/credits.ts](web/src/lib/credits.ts) | **Reuse** — extend `credit_transactions` with `granted_by_reseller_id` |
| Grant | `grantCredits(userId, amount, reason, metadata)` L537 | **Reuse verbatim** |
| Spend | `spendCredits(userId, feature, metadata)` L448 with race-guarded `.gte("balance", cost)` (L474) | **Reuse verbatim** |
| Monthly amounts | **DISCREPANCY vs brief**. Brief says 200 / 800 / 3000. Code says 25 / 200 / 1000 / unlimited in `plans.csv` L3–6; legacy `PLAN_CREDITS` in [credits.ts:211](web/src/lib/credits.ts). See B/H.11 | Reconcile with founder before P3 |
| Monthly reset | **Missing.** No cron grants recurring plan credits. `invoice.paid` for `subscription_cycle` writes emails + `revenue_events` only. Entitlement `usageRemaining("monthly_credits")` in `entitlements.ts:296–309` uses a rolling 30-day cap as a soft substitute | **Build new** — see F.2 / P3 (piggy-back on the webhook refactor) |
| Admin manual grant | [/api/admin/credits/route.ts:62](web/src/app/api/admin/credits/route.ts) — `grantCredits(target, amount, reason, {granted_by, admin_action:true})` | **Reuse** for over-budget reseller approvals |

### A.4 Onboarding & attribution capture

| Concern | Where it lives today | Reuse vs Build |
|---|---|---|
| Onboarding wizard | 5 steps — StepSegment → StepGoal → StepTier → StepTrial → StepPayment, reducer state in `localStorage["blockid_onboarding_v2"]` + POST `/api/onboarding/save-progress`. Accepts `trial, plan, step, segment` params at [onboarding-wizard.tsx:50](web/src/app/onboarding/onboarding-wizard.tsx) | **Extend** — add `via` param handling + collapsed "Have a reseller code?" field on StepTier (no new step) |
| `?ref=` referral capture (attribution template) | Written to cookie `blockid_ref` (30d, samesite=lax) + `localStorage` in [svi-entrance.tsx:213](web/src/components/svi/svi-entrance.tsx); consumed by [login-form.tsx:167](web/src/app/auth/login/login-form.tsx), [/api/auth/google/route.ts:114](web/src/app/api/auth/google/route.ts), [auth.ts:253,517,642](web/src/lib/auth.ts) → `processReferral()` writes `referred_by` | **Mirror end-to-end** for `?via=` → cookie `blockid_via` → same consumption sites |
| Existing coupon validator UX (component pattern to copy) | [pricing-coupon.tsx:29](web/src/components/landing/pricing-coupon.tsx) — POSTs `/api/coupon/validate`, caches in `sessionStorage["blockid_coupon"]` | **Copy pattern** for `/api/reseller/code/validate` |

### A.5 Theming, branding, i18n

| Concern | Where it lives today | Reuse vs Build |
|---|---|---|
| Workspace shell | Single layout at [workspace-layout.tsx](web/src/components/workspace/workspace-layout.tsx). Topbar `<header>` at L273; right-side flex container at L286 (contains `ConnectWalletButton`, `CreditBalance`, `ThemeToggle`, `NotificationBell`, avatar, logout) | **Extend** — insert co-branding pill at L287 before `ConnectWalletButton` |
| Nav resolution | [nav-groups.ts](web/src/components/workspace/nav-groups.ts) with `entitlement.can` gate at L188 | **Extend** — add "Reseller" nav group gated by `can(user, "reseller.console")` |
| Per-user branding | `brand_settings(user_id UNIQUE, logo_url, primary_color)` migration 0057, at [/api/branding/route.ts](web/src/app/api/branding/route.ts) with hardcoded `PRO_PLANS` check | **Do NOT merge with reseller branding.** Reseller branding is org-scoped — new columns on `resellers` table |
| i18n | Custom flat dictionary in [web/src/lib/translations.ts:189](web/src/lib/translations.ts) — `{en:{...}, vi:{...}}` + `tx(key, locale)`. No i18next / next-intl | **Extend** — append `reseller.*` prefixed keys (EN + VI) |
| Emails | Locale switching at [email.ts:164,232](web/src/lib/email.ts) | **Extend** with reseller footer strings |

### A.6 Admin tooling

| Concern | Where it lives today | Reuse vs Build |
|---|---|---|
| Admin layout | [/admin/layout.tsx](web/src/app/admin/layout.tsx) is a no-op; every page re-checks admin inline | Reuse pattern; extract shared middleware opportunistically |
| Route pair to mirror | [/admin/accelerator/{page.tsx, [slug]/page.tsx}](web/src/app/admin/accelerator) + [/api/admin/accelerator/{route.ts, [id]/route.ts}](web/src/app/api/admin/accelerator) — best structural template for `/admin/resellers/*` |
| Existing "flip a user" primitive | [/api/admin/users/manage/route.ts:97](web/src/app/api/admin/users/manage/route.ts) grants `PLAN_CREDITS[plan].amount` | Reuse for admin-manual attribution overrides |

### A.7 Framework constraint (from [web/AGENTS.md](web/AGENTS.md))

> "This is NOT the Next.js you know … Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."

Every implementation task in G must include a "consult the local Next.js doc" step; assumptions about App Router / Server Actions / route handlers must be verified against the project-local docs, not model memory.

---

## B. Gap Analysis vs R1–R10

For each requirement: **AS-IS**, **Gap**, **Smallest change**.

**R1 — Attribution only via code.**
* AS-IS: `?ref=` captured for existing referral program (`svi-entrance.tsx:213`). No `?via=`. `referred_by` is user→user only.
* Gap: `?via=` capture end-to-end, and a distinct `reseller` entity separate from `referred_by`.
* Smallest change: mirror `?ref=` mechanics into `?via=`/`blockid_via` cookie + `attribution_reseller_id` FK on `app_users`. Attribution is stamped once, on first successful signup or first checkout, whichever comes first; never overwritten.

**R2 — Five per-reseller tiers.**
* AS-IS: `plans.csv` has no tier concept for resellers; app-side `coupons` table has `discount_pct` (single value per code).
* Gap: N codes per reseller across an allowed subset of tiers.
* Smallest change: new `reseller_promotion_codes` table keyed by `(reseller_id, tier_pct)`; `resellers.allowed_tiers int[]` gates which tiers can be minted.

**R3 — Commission recurring / clawback.**
* AS-IS: `invoice.paid` handler writes `revenue_events` only. No commission table. No refund handler.
* Gap: commission ledger + refund/dispute/credit-note handlers.
* Smallest change: `reseller_commissions` ledger table sharing `stripe_event_id UNIQUE` with `revenue_events`; per-line iteration inside the existing `invoice.paid` branch (webhook route L578–L620 region); new handlers for `charge.refunded`, `charge.dispute.created/closed`, `credit_note.created`, `invoice.voided`; nightly `pending_clearance → cleared` cron. Reuse `claimWebhookEvent` idempotency.

**R4 — 100% into BlockID Stripe, off-Stripe payout.**
* AS-IS: single Stripe account, no Connect.
* Gap: none in Stripe wiring; payout is a manual monthly export.
* Smallest change: `/admin/resellers/[slug]/payouts` page that emits the CSV from `reseller_commissions WHERE status='cleared' AND cleared_at BETWEEN $month`.

**R5 — Codes stay in sync with Stripe; 0% needs app-layer.**
* AS-IS: Stripe promotion codes work at checkout (L130, L161); no 0-value coupon possible.
* Gap: An app-native `reseller_code` for the 0% tier that stamps metadata without a discount object.
* Smallest change: `reseller_promotion_codes` row for tier 0 with `stripe_coupon_id=NULL, stripe_promotion_code_id=NULL`; checkout branch: `if tier>0 → discounts:[{promotion_code}]`; **always** stamp `client_reference_id`, `subscription.metadata.reseller_code`, `customer.metadata.reseller_code`. Weekly `reseller-stripe-sync` cron reconciles drift.

**R6 — Console with operational data only.**
* AS-IS: RLS default-deny + service-role bypass; scoping is handler-side. `advisor_clients` join at `/api/advisor/clients/route.ts:20` returns exactly the shape we want (`email, displayName, startupName, startupStage, plan, svi, lastAnalysisAt`).
* Gap: `scopedReseller(user)` helper + per-reseller `allowedCustomerIds()`; audit log; explicit deny-list of workspace-content tables.
* Smallest change: single helper in `web/src/lib/reseller/scope.ts`; every reseller-console route calls it as first line; CI grep rule fails any `/api/reseller/*` file that touches `getSupabaseAdmin` without also importing `scopedReseller`.

**R7 — Co-branding, per-reseller data.**
* AS-IS: `brand_settings` is per-user only; no org-level branding.
* Gap: reseller-scoped `display_name`, `logo_url`, `primary_color`.
* Smallest change: those columns live directly on `resellers`. Badge rendered by a new `useResellerAttribution()` hook at `workspace-layout.tsx:287` (before `ConnectWalletButton`).

**R8 — Per-reseller capability flags.**
* AS-IS: capability bits do not exist for orgs; entitlement engine is per-user plan.
* Gap: `can_create_startups`, `can_grant_credits`, `monthly_credit_budget` on `resellers`.
* Smallest change: three columns on `resellers` plus the two dedicated routes (`/api/reseller/startups/invite`, `/api/reseller/credits/grant`) that check these flags before doing work. Over-budget grants call the existing `/api/admin/credits` path with `over_budget:true` metadata.

**R9 — Monthly KPI reporting, 12mo exportable history.**
* AS-IS: `revenue_events` retains all history; no reseller aggregation.
* Gap: monthly cron + CSV export + email delivery.
* Smallest change: `/api/cron/reseller-monthly-report/route.ts` aggregates `revenue_events` grouped by `reseller_id`; CSV persisted for in-console download; retention 24 months, exposed 12 rolling.

**R10 — Share Management standalone add-on; existing subs grandfathered; codes+commission apply.**
* AS-IS: cap-table / data-room / vesting / token / esop / blockchain routes gate only at nav-level + `credit_cost:0`; no server-side `requireFeature`.
* Gap: an add-on SKU + entitlement bundle + grandfather column + ~14 route-level `requireFeature("share_management")` insertions.
* Smallest change: see Section F. Stripe applies subscription-level percent-off discounts to every line item automatically, so reseller commission on the add-on works with no extra promotion code.

**Cross-cutting discrepancies flagged (codebase wins over the brief):**
* Brief says "200 / 800 / 3000 credits per tier"; code says **25 / 200 / 1000 / unlimited** and has **no monthly reset cron**. See H.11.
* Brief implies a single-item subscription; today it is single-item, but P8 changes that.
* Brief refers to "Setup Intent card capture"; code uses Checkout Session card capture with `payment_method_collection:"always"` and only recognises `setup_intent.succeeded` in the webhook — the Setup Intent flow does not exist as a distinct route. Not a blocker (behaviour is equivalent) — but any reference to "Setup Intent" in customer-facing docs should say "card capture at signup".

---

## C. Functional Specification

### C.1 Reseller Console

**Auth model.** Reseller admins are ordinary `app_users` rows with `account_type='reseller'` and one or more `reseller_admins` link rows. Nav is gated by the new entitlement `reseller.console`, resolved through the same `can()` pipeline the rest of the app uses — do not add another inline email check. A `scopedReseller(user)` helper returns `{reseller_id, allowedCustomerIds()}` — every `/api/reseller/*` route calls it first.

**Shell.** Reuse `WorkspaceLayout`. Add a "Reseller" sidebar group in `nav-groups.ts`, visible only when the entitlement resolves. Do not fork the shell — keeps parity with `advisor`, `accelerator`, `lp`.

**Pages** (all pages implement four states: skeleton loading, empty, error-with-retry, populated; tables paginate at 50, server-side sort):

1. **Dashboard `/reseller`** — KPI cards: attributed customers (all-time), active subscriptions, MRR (AUD), new-this-month, 30-day churn, credits granted vs monthly budget (progress bar), commissions cleared last 12 months. Time-series charts: monthly signups, MRR, commission owed. Data from `revenue_events` + `subscriptions` joined on `reseller_attributions`. Reuse chart primitives from `/admin/pricing-metrics`.
2. **Customers `/reseller/customers`** — table columns: company_name, contact_email (masked `first.***@domain`), plan, billing_status, subscription_started, trial_ends_at, mrr_aud, ai_credits_used_30d, ai_credits_balance, last_active_at. Filters: plan, status, month, code used. Row-click → drawer (operational only). Mirror the join at `/api/advisor/clients/route.ts:20`. Full email revealed only on explicit "Show email" click → writes `reseller_audit_log` entry.
3. **Codes `/reseller/codes`** — one row per tier code owned. Columns: code, tier_pct, `stripe_promotion_code_id` (or `— (attribution only)` for tier 0), redemptions_count, active_customers, status. CTA "Request new code" → tier picker constrained by `resellers.allowed_tiers`; submission creates a pending row in `/admin/resellers/requests`. Per-code redemption sparkline (last 6 months).
4. **Credits `/reseller/credits`** — top: monthly budget bar (`granted_this_month / monthly_budget`). History table. CTA "Grant credits" → modal (recipient dropdown scoped to `allowedCustomerIds()`, amount, reason ≥10 chars, cost preview, running remaining). Over-budget → CTA switches to "Submit for BlockID approval" with warning banner. Approved-over-budget grants execute via the existing admin credits endpoint under an admin session with metadata `{granted_by:'admin', reseller_id, over_budget:true}` — reseller never gets an escalated grant permission.
5. **Create Startup `/reseller/create-startup`** (only if `can_create_startups`) — form: founder email, company name, plan tier, discount tier (must map to one of the reseller's active codes). Submit **atomic transaction**: (a) create `app_users` (segment='founder', account_type='founder'), (b) `reseller_attributions(subject_user_id, reseller_id, source='provisioned', promotion_code_id)`, (c) if paid plan chosen, provision Stripe customer with `metadata.reseller_*`, (d) send magic-link invite email (locale-aware), (e) `reseller_audit_log` entry. Any failure rolls back. Workspace stays **provisional** until the founder verifies the magic-link — prevents KPI juking (H.8).
6. **Reports `/reseller/reports`** — list of past 12 monthly reports + current MTD. "Download CSV" per row and "Download all (12mo)". CSV schema in C.5.
7. **Settings `/reseller/settings`** — display name, logo upload, primary color, contact email, notification preferences. Persists to the `resellers` table (do NOT reuse `brand_settings`).

### C.2 Code redemption UX (customer flow — including the 0% code)

**Entry & capture.** URL `?via=INFOVISION20` (or `INFOVISION`, `INFOVISION10`, `INFOVISION30`, `INFOVISION40`) anywhere on the marketing site. Reuse the ref pattern verbatim: cookie `blockid_via` (max-age 30d, samesite=lax) + `localStorage["blockid_via"]`. Consumption sites to update alongside the existing `blockid_ref` reads: `login-form.tsx:167`, `google/route.ts:114`, `auth.ts:253/517/642`. Accept `via` at `onboarding-wizard.tsx:50` alongside `trial|plan|step|segment`.

**Onboarding.** Extend `StepTier` with a collapsed "Have a reseller code?" field. If `?via` was captured, the field is pre-populated and expanded. Field validates via `POST /api/reseller/code/validate` → `{ok, display_name, logo_url, tier_pct, stripe_promotion_code_id | null, code_id}`. Response drives a pill:

| tier_pct | Pill text (EN) |
|---|---|
| 10/20/30/40 | `InfoVision — {pct}% off forever` |
| 0 | `Introduced by InfoVision — no discount applied` |

The 0% pill is load-bearing: it teaches the user the code is real without a discount and prevents "code doesn't work" tickets.

**Consent modal.** As soon as a valid code is applied, open a modal with the APP 5.2 collection notice (E.1). Buttons: `[Accept and continue]` / `[Remove code]`. Removing clears `blockid_via` cookie + localStorage + reducer state. Accepting persists `reseller_code_accepted_at` in the onboarding reducer.

**Checkout server flow.** Server resolves `reseller_code` → **unconditionally** stamps:
- `client_reference_id = "reseller_attribution:<code_id>"`
- `subscription_data.metadata.reseller_id`, `.reseller_code`, `.tier_at_signup`
- `customer_creation="always"` (a change from L157 which currently sets `undefined` for recurring)

If `tier_pct > 0`, additionally set `discounts:[{promotion_code: <stripe_promotion_code_id>}]` and **delete `allow_promotion_codes`** (matches the guard at L163 that prevents stacking).

Post-`checkout.session.completed` webhook, `customers.update()` writes `metadata.reseller_code, reseller_id` as belt-and-braces so future invoices without a subscription context still attribute.

### C.3 Co-branding placement — three surfaces only

1. **Workspace topbar pill** — insert at `workspace-layout.tsx:287` (right-side flex container, before `ConnectWalletButton`). Structure: `[16px reseller logo] Introduced by <Reseller>`. Tooltip: "This affects who can see your operational data. Learn what is shared." Click opens a slide-over "Your reseller relationship" panel with display name, logo, exact field list, "Contact reseller" mailto link, "Remove reseller relationship" (flips `reseller_attributions.opted_out=true`). Rendered only when `useResellerAttribution()` returns a value (new hook, polls `/api/reseller/attribution/me` on the 60s `useEntitlement` cadence).
2. **Welcome & receipt email footer** — new block above the standard BlockID footer in `web/src/lib/email.ts` templates: "Introduced by <Reseller>. This does not change who you buy from — Auschain PTY LTD remains your service provider." Locale-switched.
3. **Stripe invoice** — set `invoice.description = "Introduced by <Reseller>"` and add `custom_fields:[{name:"Reseller", value:<display_name>}]`. Seller of record, From:, ABN remain BlockID / Auschain.

**Non-customisable by resellers:** BlockID logo, favicon, primary domain, email From:, product name, "Powered by BlockID" wordmark, Terms & Privacy links, error page branding.

### C.4 EN + VI strings

Append to `web/src/lib/translations.ts:189` under the `reseller.*` prefix:

| Key | EN | VI |
|---|---|---|
| `reseller.badge.introduced_by` | Introduced by {name} | Được giới thiệu bởi {name} |
| `reseller.badge.tooltip` | This affects who can see your operational data. Learn what is shared. | Điều này ảnh hưởng đến việc ai có thể xem dữ liệu vận hành của bạn. Xem chi tiết. |
| `reseller.panel.title` | Your reseller relationship | Mối quan hệ với đại lý của bạn |
| `reseller.panel.shared_heading` | What we share with {name} | Dữ liệu chia sẻ với {name} |
| `reseller.panel.not_shared_heading` | What we NEVER share | Dữ liệu KHÔNG BAO GIỜ chia sẻ |
| `reseller.panel.remove_cta` | Remove reseller relationship | Gỡ bỏ liên kết đại lý |
| `reseller.pill.discount` | {name} — {pct}% off forever | {name} — giảm {pct}% trọn đời |
| `reseller.pill.no_discount` | Introduced by {name} — no discount applied | Được giới thiệu bởi {name} — không có ưu đãi |
| `reseller.consent.title` | Data sharing with your reseller | Chia sẻ dữ liệu với đại lý |
| `reseller.consent.accept` | Accept and continue | Đồng ý và tiếp tục |
| `reseller.consent.remove` | Remove code | Gỡ mã |
| `reseller.email.footer` | Introduced by {name}. Auschain PTY LTD remains your service provider. | Được giới thiệu bởi {name}. Auschain PTY LTD vẫn là bên cung cấp dịch vụ. |
| `reseller.console.nav` | Reseller | Đại lý |
| `reseller.credits.over_budget` | Over budget — requires BlockID approval | Vượt ngân sách — cần BlockID duyệt |

### C.5 Admin approval flows

* **Reseller signup**: new route pair `/admin/resellers` + `/admin/resellers/[slug]` mirroring `/admin/accelerator` structurally. List, detail, activate/suspend, edit tiers & budget.
* **Code request**: sub-page `/admin/resellers/requests`. "Create Stripe coupon + promotion_code" action for tier > 0 (creates Stripe objects, writes `reseller_promotion_codes`); for tier 0, no Stripe call — direct DB write with NULL stripe ids.
* **Over-budget credit grant**: shows in the existing admin notifications inbox + email to `admin@blockid.au`. Approve action invokes the existing `/api/admin/credits` grant with `over_budget:true` metadata; deny writes a reason back to the reseller.
* **Reseller-created startups**: NOT gated at creation — creation IS the attribution. Every creation logs to `reseller_audit_log` for post-hoc review.

### C.6 R9 Monthly KPI report

CSV columns: `reseller_id, reseller_display_name, month (YYYY-MM), new_signups, active_customers_eom, attributed_mrr_aud, churned_customers, blockid_gross_revenue_aud, blockid_net_revenue_aud, commission_pct_effective, commission_owed_aud, ai_credits_granted, ai_credits_over_budget_count`.

Cron: `web/src/app/api/cron/reseller-monthly-report/route.ts`, runs 1st of month at 02:00 AEST. Aggregates `revenue_events` and `credit_transactions` grouped by `reseller_id`. Retention 24 months, 12 exposed. Delivered by locale-switched email + downloadable in `/reseller/reports` via signed URLs (24 h TTL).

---

## D. Data & Integration Design

### D.1 New tables

All tables assume `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, RLS default-deny + service-role bypass (posture matches `revenue_events`, `advisor_clients`, `credit_transactions`).

**`resellers`** — one row per reseller org.

| Column | Type | Notes |
|---|---|---|
| `code` | `text unique not null` | UPPERCASE slug (`INFOVISION`); family code. Per-tier codes derive as `INFOVISION`, `INFOVISION10`, … in `reseller_promotion_codes.code` |
| `display_name` | `text not null` | Shown in dashboards + invoices |
| `logo_url` | `text` | Mirrors `brand_settings.logo_url` shape |
| `primary_color` | `text` | Same |
| `allowed_tiers` | `int[] not null default '{0,10,20,30,40}'` | Gates code minting |
| `can_create_startups` | `bool not null default false` | R8 |
| `can_grant_credits` | `bool not null default false` | R8 |
| `monthly_credit_budget` | `int not null default 0` | Hard cap for `reseller_credit_grants` per calendar month |
| `status` | `text not null default 'active'` | `active|paused|terminated` — vocabulary from `advisor_clients` |
| `commission_share_pct` | `numeric(5,2) not null default 40.00` | Org-level default; per-SKU overrides via `plans.reseller_share_pct` |

Indexes: `unique(code)`, partial `where status='active'`.

**`reseller_promotion_codes`** — one row per `(reseller_id, tier)`.

| Column | Type | Notes |
|---|---|---|
| `reseller_id` | `uuid → resellers(id) on delete restrict` | |
| `tier_pct` | `int not null check (tier_pct in (0,10,20,30,40))` | |
| `code` | `text unique not null` | Customer-facing string |
| `stripe_coupon_id` | `text` **nullable** | Points at shared per-tier coupon; NULL when tier_pct=0 |
| `stripe_promotion_code_id` | `text` **nullable** | The `promo_*` object; NULL when tier_pct=0 |
| `active` | `bool not null default true` | |

Uniques: `(reseller_id, tier_pct)` and global `code`. **Rationale for per-tier not per-code**: 4 shared coupons (10/20/30/40, `duration:forever`) across all resellers; each reseller has up to 5 rows (0/10/20/30/40) with 4 pointing at those shared coupons and 1 (tier 0) purely app-native.

**`reseller_attributions`** — the "who owns this customer/workspace" link. Structural template: `advisor_clients` (migration 0058).

| Column | Type | Notes |
|---|---|---|
| `reseller_id` | `uuid → resellers(id)` | |
| `subject_type` | `text check (subject_type in ('user','project'))` | |
| `subject_user_id` | `uuid → app_users(id)` nullable | Populated when `subject_type='user'` |
| `subject_project_id` | `uuid → projects(id)` nullable | Populated when `subject_type='project'` |
| `status` | `text not null default 'active'` | `active|revoked` (verbatim from `advisor_clients`) |
| `opted_out` | `bool default false` | Set when customer clicks "Remove reseller relationship" |
| `opted_out_at` | `timestamptz` | |
| `attributed_at` | `timestamptz not null default now()` | Mirrors `advisor_clients.linked_at` |
| `source` | `text not null` | `code|provisioned|admin_manual` |
| `promotion_code_id` | `uuid → reseller_promotion_codes(id)` nullable | Tier live at attribution moment (audit) |

Partial uniques: `unique(subject_user_id) where subject_type='user' and status='active' and opted_out=false`; same for project. **User- + project-level attribution recommendation**: user-level is canonical; project-level is an override for the "Starter user with 3 workspaces, one attributed one not" case. At `invoice.paid`, resolve by looking at `subscription.metadata.project_id` if present, else fall back to user-level.

**`reseller_commissions`** — the ledger; shape mirrors `revenue_events`.

| Column | Type | Notes |
|---|---|---|
| `reseller_id` | `uuid not null → resellers(id)` | |
| `attribution_id` | `uuid not null → reseller_attributions(id)` | |
| `stripe_event_id` | `text unique not null` | Idempotency, verbatim reuse of `claimWebhookEvent` posture |
| `stripe_invoice_id` | `text not null` | |
| `stripe_subscription_id` | `text not null` | |
| `stripe_charge_id` | `text` | So `charge.refunded` can join |
| `list_price_aud_cents` | `int not null` | From `plans.price_aud_cents` |
| `discount_pct` | `int not null` | 0/10/20/30/40 |
| `discount_aud_cents` | `int not null` | `list * pct / 100` |
| `amount_paid_aud_cents` | `int not null` | Exactly `invoice.amount_paid` |
| `commission_aud_cents` | `int not null` | See G |
| `status` | `text not null` | `pending_clearance|cleared|clawed_back|voided` |
| `pending_until` | `timestamptz not null` | `invoice.created + 7 days` |
| `cleared_at` | `timestamptz` | Set by clearance cron |
| `metadata` | `jsonb not null default '{}'` | `{billing_reason, promotion_code, tier_at_charge, sku_id}` |

Indexes: `unique(stripe_event_id)`, `(reseller_id, status, pending_until)`, `(stripe_charge_id)`, `(stripe_invoice_id)`.

DB-level invariant (CHECK constraint on inserts):

```sql
ALTER TABLE reseller_commissions
  ADD CONSTRAINT ck_60_40_split
  CHECK (
    list_price_aud_cents - discount_aud_cents - commission_aud_cents
    = round(0.60 * list_price_aud_cents)::int
  );
```

**`reseller_credit_grants`** — mirror of `credit_transactions` scoped to reseller-initiated grants.

| Column | Type |
|---|---|
| `reseller_id` | `uuid → resellers(id)` |
| `target_user_id` | `uuid → app_users(id)` |
| `amount` | `int not null` |
| `credit_transaction_id` | `uuid → credit_transactions(id)` |
| `month_key` | `text not null` (`'2026-07'`) |
| `over_budget` | `bool default false` |

Uniques: `(reseller_id, target_user_id, credit_transaction_id)`. Index `(reseller_id, month_key)` for budget rollup.

**`reseller_admins`** — link many portal users per reseller org. Verbatim shape of `advisor_clients`.

| Column | Type |
|---|---|
| `reseller_id` | `uuid → resellers(id)` |
| `user_id` | `uuid → app_users(id)` |
| `role` | `text default 'admin'` — `owner|admin|viewer` |
| `status` | `text default 'active'` |
| `linked_at` | `timestamptz default now()` |

Unique `(reseller_id, user_id)`.

**`reseller_audit_log`** — R6 privacy trail. Columns: `id, reseller_admin_id, reseller_id, subject_user_id, action, fields text[], route, ip, user_agent, metadata jsonb, created_at`. Every reseller-console read of a subject's row writes one row; every write action logs. Retention 12 months hard-delete. Index `(reseller_id, created_at desc)`.

**`reseller_code_requests`** — small workflow table for admin approval (fields: `reseller_id, requested_by, tier_pct, suggested_suffix, status`).

### D.2 Extensions to existing tables

| Table | Column | Rationale (why not reuse existing) |
|---|---|---|
| `app_users` | `attribution_reseller_id uuid → resellers(id)` nullable | `referred_by` is user→user; reseller is a distinct entity |
| `projects` | `attribution_reseller_id uuid → resellers(id)` nullable | Per-workspace override; keeps `PLAN_PROJECT_LIMITS` at [projects.ts:32](web/src/lib/projects.ts) untouched |
| `plans` | `reseller_share_pct numeric(5,2) default 40.00`, `reseller_eligible bool default true`, `is_addon bool default false` | Per-SKU tuning for Enterprise custom deals; `is_addon` for R10 |
| `revenue_events` | `reseller_id uuid` nullable, `reseller_commission_aud_cents int` nullable | Keeps `revenue_events` the SoT for BlockID net = `sum(net_aud_cents) - sum(coalesce(reseller_commission_aud_cents,0))` |
| `credit_transactions` | `granted_by_reseller_id uuid → resellers(id)` nullable | Real FK enables budget rollups without JSON parsing |
| `brand_settings` | **no change** | Reseller carries its own logo/color on `resellers` |
| `app_users` | `grandfathered_share_management bool default false`, `grandfathered_at timestamptz` | See F.4 |

### D.3 Stripe object mapping

```
 URL  https://blockid.au/pricing?via=INFOVISION20
   │
   ▼  (mirror svi-entrance.tsx:213 mechanics)
 Cookie  blockid_via=INFOVISION20   (max-age 30d)
 LS      localStorage["blockid_via"]
   │
   ▼  onboarding wizard reads cookie, StepTier field pre-populated
 POST /api/stripe/checkout
   │
   ▼  web/src/app/api/stripe/checkout/route.ts (extend L119–L164)
 stripe.checkout.sessions.create({
   mode: "subscription",
   allow_promotion_codes: (tier>0 ? undefined : true),   // deleted when we apply promo
   discounts: tier>0 ? [{promotion_code: pc_xxx}] : undefined,
   client_reference_id: "reseller_attribution:<code_id>",
   customer_creation: "always",                          // change from L157
   subscription_data: {
     trial_period_days: 7,
     trial_settings: { end_behavior: { missing_payment_method: "cancel" }},
     metadata: {
       ...customerMetadata,
       reseller_code: "INFOVISION20",
       reseller_id: "<uuid>",
       tier_at_signup: "20",
       project_id: "<uuid>"
     }
   },
   payment_method_collection: "always"
 })
   │
   ▼  checkout.session.completed webhook
   customers.update(cus_xxx, { metadata: { reseller_code, reseller_id }})   // belt-and-braces
```

Coupon / promotion-code inventory:

```
COUPONS (shared across all resellers)          PROMOTION CODES (per reseller × tier)
─────────────────────────────────────────      ────────────────────────────────────────
cpn_bid_10   percent_off=10   duration=forever   INFOVISION10  → cpn_bid_10
cpn_bid_20   percent_off=20   duration=forever   INFOVISION20  → cpn_bid_20
cpn_bid_30   percent_off=30   duration=forever   INFOVISION30  → cpn_bid_30
cpn_bid_40   percent_off=40   duration=forever   INFOVISION40  → cpn_bid_40
                                                 INFOVISION    → (none — app-native)
(No 0-value coupon — Stripe rejects value=0)
```

Attribution priority at `invoice.paid` (first hit wins):

1. `invoice.discount.promotion_code` → lookup `reseller_promotion_codes.stripe_promotion_code_id`
2. `subscription.metadata.reseller_code` → lookup `reseller_promotion_codes.code`
3. `customer.metadata.reseller_code` → same
4. First-session `client_reference_id` recovered from the subscription → same
5. `app_users.attribution_reseller_id` → last-resort fallback

### D.4 Webhook additions

Reuse `claimWebhookEvent` verbatim ([verify.ts](web/src/lib/stripe/verify.ts)) for every new event.

| Event | New / Amend | Behaviour |
|---|---|---|
| `invoice.paid` | **Amend** [webhook/route.ts:578-620 region](web/src/app/api/stripe/webhook/route.ts) | After `recordRevenueEvent`, in the same DB transaction: resolve attribution via priority list, **iterate `invoice.lines.data`** (base + add-on), compute per-line commission, insert `reseller_commissions` rows sharing the same `stripe_event_id` suffixed with line index. `status='pending_clearance'`, `pending_until = invoice.created + interval '7 days'`. Update `revenue_events` with `reseller_id, reseller_commission_aud_cents`. Guard unchanged: `billing_reason ∈ {subscription_create, subscription_cycle, subscription_update}`. Trial (`amount_paid=0`) → no commission row |
| `charge.refunded` | **New** | Join `reseller_commissions` on `stripe_charge_id`. If `pending_clearance` → `status='voided'`. If `cleared` → insert compensating negative row with `metadata.clawback_of=<orig_id>`. Also write a negative `revenue_events` row (`kind='refund'`). Partial refund → prorate via credit-note path below |
| `charge.dispute.created` | **New** | Freeze linked commission: `status → pending_clearance`, extend `pending_until` by 120 days. Emit admin alert |
| `charge.dispute.closed` | **New** | If `status='lost'` → treat as `charge.refunded`. If `won` → restore `pending_until`, clearance cron sweeps |
| `credit_note.created` | **New** | Prorate clawback: `clawback = original_commission × (credit_note.amount / invoice.amount_paid)` |
| `invoice.voided` | **New** | Set commission `status='voided'` |
| `customer.subscription.updated` | **Amend** | Diff `previous_attributes.discount`; changed promotion code mid-cycle → append `{tier_change_event}` to `reseller_attributions.metadata` for audit. Do NOT retroactively adjust past commissions |
| `checkout.session.completed` | **Amend** | If `client_reference_id` starts `reseller_attribution:` — upsert `reseller_attributions`, `customers.update(metadata.reseller_*)`, `subscriptions.update(metadata.reseller_*)` |

### D.5 Reconciliation

* **Nightly `/api/cron/reseller-clear-commissions`**: `UPDATE reseller_commissions SET status='cleared', cleared_at=now() WHERE status='pending_clearance' AND pending_until < now()`. Batched, idempotent, per-reseller metric.
* **Weekly `/api/cron/reseller-stripe-sync`**: for each non-null `stripe_promotion_code_id`, retrieve and assert `active=true`. Drift → alert `admin@blockid.au`. Also verify the 4 shared coupons still exist.
* **Monthly reconciliation** (admin-triggered export): `sum(commission_aud_cents) FILTER (WHERE status='cleared') GROUP BY reseller_id` → CSV.
* **7-day window alignment**: trial → Day 8 charge → `invoice.paid` → `pending_until = Day 15`. Customer's money-back window also ends Day 15. Clearance cron promotes on Day 16.

---

## E. Privacy & Security Design

### E.1 APP 5 Collection Notice (redemption consent modal — EN & VI)

**EN (~175 words).**
> Auschain PTY LTD (ACN 659 615 111), trading as BlockID.au, collects information about your BlockID account when you apply an InfoVision reseller code. We share this data with InfoVision so they can operate the reseller relationship with you: company name, subscription plan, billing status (active / trial / past due / cancelled), subscription start and trial-end dates, month-to-date aggregate feature usage counts, AI credit balance and monthly credit consumption totals, and the reseller code used. We do NOT share: your uploaded documents, cap table, data room, SVI analysis and signals, ESOP or token records, notification content, session data, or any communications inside BlockID. Data may be accessed by InfoVision personnel in Australia; no overseas disclosure occurs by default. You can withdraw at any time by removing the reseller code (you keep full access to BlockID). Full details: `blockid.au/privacy`. Complaints: `privacy@blockid.au`, or the OAIC (`oaic.gov.au`).

**VI (~175 words).**
> Auschain PTY LTD (ACN 659 615 111), hoạt động dưới tên BlockID.au, thu thập thông tin về tài khoản BlockID của bạn khi bạn nhập mã đại lý InfoVision. Chúng tôi chia sẻ dữ liệu này với InfoVision để họ vận hành mối quan hệ đại lý với bạn: tên công ty, gói đăng ký, trạng thái thanh toán (đang hoạt động / dùng thử / quá hạn / đã hủy), ngày bắt đầu đăng ký và ngày kết thúc dùng thử, tổng lượt sử dụng tính năng trong tháng, số dư và mức tiêu thụ AI credit hàng tháng, và mã đại lý bạn đã dùng. Chúng tôi KHÔNG chia sẻ: tài liệu bạn tải lên, cap table, data room, phân tích và tín hiệu SVI, ESOP hoặc token, nội dung thông báo, phiên đăng nhập, hoặc bất kỳ tin nhắn nào trong BlockID. Dữ liệu do nhân sự InfoVision tại Úc truy cập; mặc định không chuyển ra nước ngoài. Bạn có thể rút lại bất cứ lúc nào bằng cách gỡ mã đại lý (vẫn dùng BlockID bình thường). Chi tiết: `blockid.au/privacy`. Khiếu nại: `privacy@blockid.au` hoặc OAIC (`oaic.gov.au`).

### E.2 RBAC allow/deny matrix

Every `/api/reseller/*` route calls `scopedReseller(user)` as its first line. `allowedCustomerIds()` = `SELECT subject_user_id FROM reseller_attributions WHERE reseller_id=$1 AND status='active' AND opted_out=false`.

**MAY read** (scoped to `allowedCustomerIds()`):
* `app_users`: `id, email, display_name, created_at, last_login_at`
* `projects`: `id, name, industry, stage, is_default, created_at`
* `plans`: `id, name` (join via `app_users.plan`)
* `credit_balances`: `balance, updated_at`
* `credit_transactions`: `amount, reason, created_at` **filtered** `reason NOT LIKE '%private%' AND reason NOT LIKE '%internal%'`
* `subscriptions`: `status, current_period_end, trial_end, plan_id`
* `usage_logs`: `COUNT(*)` grouped by feature + month — never individual rows
* `revenue_events`: `amount_aud, event_type, occurred_at` scoped to `allowedCustomerIds()`

**MUST NOT read** (no route exposes these to a reseller):
`svi_analyses.*`, `svi_signals.*`, `documents.*`, `data_room.*`, `equity_*`, `cap_table_*`, `esop_*`, `token_*`, message bodies, notification content, `sessions.*`, other resellers' rows, admin-only tables.

**Enforcement**: RLS is default-deny + service-role bypass, so scoping lives in route handlers. CI grep rule fails any `/api/reseller/*` file that references `getSupabaseAdmin` without importing `scopedReseller`.

### E.3 Audit logging

Every reseller-console read of a customer row appends one `reseller_audit_log` row per subject viewed, capturing `fields[]` and `route`. Every write (grant credits, request code, create startup, remove attribution) also logs. Weekly Monday-07:00 AEST digest to the reseller admin AND `admin@blockid.au`; > 200 subjects viewed/week → anomaly alert in `/admin/resellers/[slug]`. Retention 12 months, hard-delete.

### E.4 No impersonation

Reseller admins never impersonate customers. To help, they send email via a "Contact" mailto (customer's masked address is revealed only on explicit click, which logs). A compromised reseller admin cannot see workspace content because no route exposes it — blast radius is bounded by the allow-matrix.

### E.5 APP 6 secondary use

BlockID may use collected data for (a) billing/invoicing/tax, (b) product delivery/support, (c) aggregate anonymised analytics (`k≥20` per bucket). No cross-reseller mixing in analytics. Marketing to attributed customers by BlockID remains governed by the customer's own preferences — no marketing rights transfer.

### E.6 Data deletion & opt-out

Customer clicks "Remove reseller relationship" → `reseller_attributions.opted_out=true, opted_out_at=now()`. Next request: customer disappears from `allowedCustomerIds()`. Historical `reseller_commissions` and `reseller_audit_log` retained (financial/audit obligation) but display becomes `Former customer #<hash>`. Full account deletion → attribution rows hard-deleted; ledger keeps hashed reference.

---

## F. Share Management add-on split

### F.1 Feature scope

**Moved into `share_management` add-on**:

| Feature literal | Location today | Current base gate |
|---|---|---|
| `cap_table.read` / `cap_table.write` | [entitlements.ts:27–70](web/src/lib/entitlements.ts) | Growth+ |
| `data_room.access` / `data_room.read` / `data_room.write` | Same | Growth+ (access), Scale+ (write) |
| `esop.manage` | Same | Scale+ |
| `blockchain.sync` | Same | Scale+ |
| `token_create` | `credits.ts:124` (`credit_cost:0`) | Nav-only |
| `vesting.*` (new literal) | Route-level only (`/api/vesting`, `/api/ai/vesting*`, `/api/cron/vesting`) | Nav-only |
| `advisor_portal` | entitlements.ts | **stays base (Scale+)** — advisor collaboration is broader than cap table |

**Stays in base**: SVI reports, AI credits, `investor_links*`, `investor_data_room` (reader side), `term_sheet_ai` (Growth+), `api.access`, `sso`, `white_label` (Enterprise), team seats.

Rationale: everything used to **market to investors** stays in base; everything used to **manage equity ownership on-chain** moves to the add-on.

### F.2 Entitlement changes

New literals in the union: `share_management` (bundle), `vesting.read`, `vesting.write`, `reseller.console`, `reseller.create_startup`, `reseller.grant_credits`.

`can()` resolver update:
```
can(user, "share_management") :=
     plans.feature_flags.share_management === true
  OR user.grandfathered_share_management === true
  OR user has an active subscription_item on STRIPE_PRICE_ADDON_SHARE_MGMT_*
```

Primitives (`cap_table.*`, `esop.manage`, `blockchain.sync`, `token_create`, `vesting.*`) delegate to `can(user,"share_management")` — single SoT. `LEGACY_FEATURE_FALLBACK` at `entitlements.ts:99` gets a parallel edit lighting up all primitives when the bundle is true.

**Consolidation of scattered checks** (mandatory in the same PR to prevent drift):

| Location | Replace |
|---|---|
| `/api/branding/route.ts:7` `PRO_PLANS.has(plan)` | `requireFeature(user,"white_label")` |
| `web/src/lib/api-keys.ts:45` `getRateLimitForPlan(plan)` switch | Lookup via `plans.feature_flags.api_rate_limit` |
| `web/src/lib/projects.ts:32,40` `PLAN_PROJECT_LIMITS` | Lookup via `plans.feature_flags.project_limit` |

**Explicit `requireFeature("share_management")` insertions** — every mutation route below:
* `/api/cap-table/**` — all POST/PATCH/DELETE
* `/api/dataroom/**` and `/api/data-room/**` — write endpoints
* `/api/vesting/**` — schedule create, event write
* `/api/esop/**` — grant, exercise
* `/api/blockchain/create-token/**`, `/api/blockchain/token/**` — mint, transfer
* `/api/tokenization/**` — every mutation
* `/api/ai/vesting`, `/api/ai/vesting-review`, `/api/ai/esop` — AI drafters (read-side entitlement)

Cron routes (`/api/cron/blockchain-sync`, `/api/cron/vesting`) filter their working set to users where `can(u,"share_management")` — otherwise lapsed add-on subscribers keep getting their tokens synced.

Rationale: today these routes rely on nav-level hiding + `credit_cost:0`, which fails as soon as the URL is known. Splitting the SKU without inserting server-side checks would leak the paid feature.

### F.3 Stripe product structure

* Product: `prod_share_management` — "BlockID Share Management".
* Prices: monthly + annual, AUD. Env vars added to `web/src/lib/stripe.ts:33`: `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY`, `STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL`.
* `plans.csv` extension: `is_addon` column; two new rows (`addon_share_mgmt_monthly`, `addon_share_mgmt_annual`) with `is_addon=true`, `feature_flags:{"share_management":true}`. `plans-db.ts` resolver update: `getUserEntitlements()` OR-merges `feature_flags` across all active subscription items — the multi-item aggregation is the core resolver change.
* Coupon inheritance: Stripe applies percent-off discounts at subscription level to every line item automatically → reseller's existing promo code automatically discounts the add-on line. Caveat: if `reseller_share_pct` differs on the add-on SKU, the commission math uses the per-SKU field — no extra Stripe object required.

### F.4 Grandfathering strategy

* **Cutover T**: pick a fixed UTC timestamp (P8 release deploy time). Snapshot `subscriptions`; `UPDATE app_users SET grandfathered_share_management=true, grandfathered_at=now() WHERE id IN (SELECT user_id FROM subscriptions WHERE status IN ('active','trialing') AND plan_id IN ('founder_growth','founder_scale','founder_enterprise','growth','growth_annual'))`.
* **Duration**: forever for grandfathered users. Sunset only if subscription lapses 60+ days — a returning ex-customer signs up on the new SKU rules.
* **Communication**:
  * T−30 days: heads-up email.
  * T-day: dismissible in-app banner ("Share Management is now an add-on. Included on your legacy plan at no extra cost.").
  * New users: "Add Share Management from A$X/mo" CTA on the pricing page and in the empty state of cap-table / data-room pages.

### F.5 Upgrade UX from inside the app

* Sidebar: keep "Share Management" visible for all users. When `can(user,"share_management")===false`, append a small "Add-on" pill. Click opens a right-side purchase drawer (do NOT navigate away).
* Purchase drawer: benefit list; monthly/annual toggle with savings badge; reseller code auto-detected from `reseller_attributions` if present; primary CTA "Add to my subscription" → `POST /api/stripe/change-plan` with new payload key `add_item: { price_id }`. Route calls `stripe.subscriptions.update(sub_id, {items:[{id:existing},{price:addon_price_id}]})` with `proration_behavior:'always_invoice'`.
* Confirmation: proration preview via `stripe.invoices.retrieveUpcoming` before commit. On success, `revenue_events` records `kind='addon_purchase'`. Entitlement client refreshes on next 60 s poll — for immediate feedback, `router.refresh()` + manual `mutate()`.
* Cancel path: `/workspace/billing` "Manage add-ons" section, one-click remove. Default: end-of-cycle (`proration_behavior:'none'`, `cancel_at_period_end`-style on the item) — cleaner accounting, no mid-cycle commission clawback.

---

## G. Phased delivery roadmap

### G.1 Phase table

| # | Phase | Deps | ~Eng-weeks | Feature flag | Migrations | Key routes touched |
|---|---|---|---|---|---|---|
| P1 | Foundations (schemas + columns) | — | 1.5 | `RESELLER_MODULE_ENABLED` | 0075 (resellers, reseller_admins, reseller_attributions), 0076 (app_users/projects/plans/revenue_events extensions) | schema only |
| P2 | Redemption + Attribution | P1 | 2 | `RESELLER_MODULE_ENABLED` | 0077 (reseller_promotion_codes) | `/api/reseller/code/validate`, `/api/stripe/checkout` (stamp metadata + apply promo) |
| P3 | Commission Ledger + Webhooks | P1, P2 | 2.5 | `RESELLER_COMMISSIONS_ENABLED` | 0078 (reseller_commissions), plus monthly-credit-reset if H.11 approved | `/api/stripe/webhook` (invoice.paid rewrite to iterate `invoice.lines.data`; new `charge.refunded`, `charge.dispute.*`, `credit_note.*`, `invoice.voided` handlers); `/api/cron/reseller-clear-commissions` |
| P4 | Reseller Console | P1, P3 | 2.5 | `RESELLER_CONSOLE_ENABLED` | 0079 (reseller_audit_log) | `/reseller/*` pages, `scopedReseller` helper, `/api/reseller/*` |
| P5 | Co-branding | P1 | 1 | `RESELLER_MODULE_ENABLED` | — | workspace-layout topbar, email templates, Stripe invoice memo |
| P6 | Reseller Capabilities | P4 | 2 | `RESELLER_CAPABILITIES_ENABLED` | 0080 (reseller_credit_grants) | `/api/reseller/startups/invite`, `/api/reseller/credits/grant` |
| P7 | KPI Report + Monthly Cron | P3, P4 | 1 | `RESELLER_REPORTS_ENABLED` | — | `/api/reseller/report/csv`, `/api/cron/reseller-monthly-report` |
| P8 | Share Management Add-on (parallel with P4–P7) | P1 | 3 | `SHARE_MGMT_ADDON_ENABLED` | 0081 (plans.is_addon, grandfathered_share_management), 0082 (backfill) | new Stripe product, `plans-db.ts` multi-item aggregation, `useEntitlement` refactor, purchase drawer, ~14 route insertions |
| P9 | Admin surface | P4 | 1.5 | `ADMIN_RESELLERS_ENABLED` | — | `/admin/resellers/*`, approvals inbox |
| P10 | Hardening | P1–P9 | 2 | (existing) | — | audit-log digest, weekly reconciliation cron, Playwright E2E, EN+VI copy review |

**Total ~19 eng-weeks; parallel P4/P8 shave ~3 weeks off wall-clock.**

Entry criteria per phase: prior migrations on staging, prior flags default off in prod. Exit criteria: G.2 tests green + Playwright walkthrough recorded + rollback tested.

### G.2 Commission math — definitive test-scenario matrix

**Formulae** (all AUD, GST-inclusive prices; `splitGst` remains post-hoc; commission is computed on the GST-inclusive `list`, matching the agreement's "60% of list" invariant):

```
list                 = plans.price_aud_cents / 100          = 99.00
discount_amount      = list * discount_pct / 100
customer_paid_gross  = list - discount_amount               = invoice.amount_paid
commission           = (list * 0.40) - discount_amount      = 39.60 - discount_amount
blockid_gross        = customer_paid_gross - commission     ≡ 59.40   (invariant, every tier)
blockid_gst_remit    = blockid_gross / 11                   (splitGst — Auschain remits regardless)
```

**Truth table at list = A$99.00 (the agreement's exemplar)**:

| Tier | discount_amt | customer_paid_gross | commission_owed | BlockID gross (invariant) | GST Auschain remits |
|---:|---:|---:|---:|---:|---:|
| 0% | 0.00 | 99.00 | 39.60 | **59.40** | 5.40 |
| 10% | 9.90 | 89.10 | 29.70 | **59.40** | 5.40 |
| 20% | 19.80 | 79.20 | 19.80 | **59.40** | 5.40 |
| 30% | 29.70 | 69.30 | 9.90 | **59.40** | 5.40 |
| 40% | 39.60 | 59.40 | 0.00 | **59.40** | 5.40 |

BlockID's gross retention is column-constant at $59.40. GST remittance to the ATO is Auschain's obligation regardless — it does not come out of the reseller's cut. **See H.11 for confirmation that this reading of "BlockID nets 60% of list" (pre-GST-remit) is the agreement's intent.**

DB CHECK (mirrored in `web/src/lib/reseller/commission.ts` unit tests):
```sql
CHECK (
  list_price_aud_cents - discount_aud_cents - commission_aud_cents
  = round(0.60 * list_price_aud_cents)::int
)
```

**Rounding note**: at $99, all values are exact cents. For SKUs whose 60% is a fractional cent (e.g. $19.99), round-half-even on the BlockID-gross side and let commission absorb the ±1c residual — protects the invariant verbatim.

### G.3 Refund + edge-case scenarios (tier 20%, commission = $19.80)

| Day | Event | Commission status BEFORE | Action | Status AFTER | `revenue_events` |
|---:|---|---|---|---|---|
| 8 | `invoice.paid` (subscription_create, trial captured card) | — | Insert row, `pending_until=Day 15` | `pending_clearance` | +ve row |
| 11 (Day 3 post-charge) | `charge.refunded` full | `pending_clearance` | Void — no money moved yet | `voided` | –ve `refund` row |
| 16 | nightly cron | `pending_clearance` | Promote past `pending_until` | `cleared` | unchanged |
| 30 | `charge.refunded` full (goodwill, out-of-policy) | `cleared` | Compensating clawback row with `metadata.clawback_of=<id>` | `clawed_back` | –ve `refund` row |
| 30 | `charge.refunded` **partial** ($40 of $79.20) via credit note | `cleared` | Prorate: clawback = 19.80 × 40/79.20 = **$10.00**; original stays `cleared`, insert –ve $10.00 child | `cleared` + child clawback | –ve for $40 |
| 60 | `charge.dispute.created` | `cleared` | Flip to `pending_clearance`, extend `pending_until` +120 d, alert admin | `pending_clearance` | unchanged |
| 60+X | `dispute.closed` won | `pending_clearance` | Restore | `cleared` | unchanged |
| 60+X | `dispute.closed` lost | `pending_clearance` | Same as post-clearance refund | `clawed_back` | –ve `refund` row |

**Trial edge-case**:

| Day | Event | Amount | Commission |
|---|---|---:|---|
| 1 | `checkout.session.completed`, trial starts | 0 | Attribution row; no commission |
| 8 | `invoice.paid`, `billing_reason=subscription_create` | 99 or discounted | Commission row, `pending_until=Day 15` |
| 15 | 7-day money-back refund | refund | Commission voided; reseller net = $0 |
| 38 | Second cycle `invoice.paid`, `billing_reason=subscription_cycle` | 99 or discounted | New independent commission row |

Additional scenarios P3 must pass:
* Plan change mid-cycle — proration invoice's `invoice.paid` accrues commission on the paid delta only.
* Plan change to a `reseller_eligible=false` SKU — no commission on new lines; retained on prior lines.
* 0% code — attribution stamped, commission still accrues (39.60 on $99), zero discount applied to Stripe.
* Add-on purchase by attributed customer — separate commission line using the add-on plan's `reseller_share_pct`.

P8 must pass:
* Grandfathered user — no upsell banner; `can(user,"share_management")===true`; `advisor_portal` still gated on Scale+.
* New user on Growth without add-on — sidebar "Add-on" pill visible; `POST /api/cap-table` returns 402/403.
* Add-on removed at end-of-cycle — entitlement flips off next cycle; existing cap-table data preserved read-only.
* Attributed customer buys add-on — commission accrues on the add-on line at reseller's active tier %.

### G.4 Feature flags

| Env var | Default | Kill-switch |
|---|---|---|
| `RESELLER_MODULE_ENABLED` | off | Hides `?via=` capture, StepReseller field; validate endpoint 404 |
| `RESELLER_COMMISSIONS_ENABLED` | off | Webhook skips accrual; ledger writes suppressed |
| `RESELLER_CONSOLE_ENABLED` | off | `/reseller/*` returns 404 |
| `RESELLER_CAPABILITIES_ENABLED` | off | Invite + grant endpoints 403 |
| `RESELLER_REPORTS_ENABLED` | off | CSV endpoint + cron no-op |
| `SHARE_MGMT_ADDON_ENABLED` | off | Purchase drawer hidden; grandfather logic still active; add-on rows filtered from pricing page |
| `ADMIN_RESELLERS_ENABLED` | off | Admin nav item hidden |

### G.5 Rollback plan

* P1: schema-only — down-migration. Data loss = none.
* P2: flag off; attribution rows remain (safe).
* P3: flag off; webhook reverts behind flag; existing commissions preserved.
* P4/P5/P7/P9: flag off, no state change.
* P6: flag off; existing granted resources retained.
* P8: flag off; `plans-db.ts` multi-item aggregation is idempotent; grandfather column stays populated harmlessly.

---

## H. Open decisions (founder sign-off required)

**H.1 Coupon `duration`.** Recommend **`forever`**. Rationale: mirrors "20% off forever" marketing; simplifies mid-life plan changes. Caveat: coupon changes mid-life require Stripe API to swap on the subscription.

**H.2 Share Management add-on price.** Recommend **AUD 49/mo, 490/yr** as opening. Rationale: sits below Scale ($199) upgrade delta so grandfathered Growth users perceive the split as generous; anchors annual for cash-flow.

**H.3 Payout cadence.** Recommend **monthly, 15th, bank transfer + CSV**. Rationale: reseller UX outweighs ops cost at InfoVision scale; quarterly kills motivation.

**H.4 InfoVision monthly credit budget.** Recommend **20,000 credits/month soft cap; over-budget hard-gate → BlockID admin approval**. Rationale: caps blast radius while we observe actual usage; revisit at month 3.

**H.5 Multiple 0% codes per reseller for A/B tracking.** Recommend **one code per (reseller, tier); A/B handled via UTM params on the same code**. Rationale: keeps commission math and audit trail simple.

**H.6 Grandfathering horizon.** Recommend **forever for existing paying users; lapsed-then-returning (60+ days) treated as new signup**. Rationale: retention + goodwill; the returning-user carve-out prevents indefinite gaming.

**H.7 Deactivated reseller → attributed customer.** Recommend **freeze commission accrual; remove co-branding badge; preserve historical ledger + attribution row; single notification email to customer**. Rationale: honours past commitments without ongoing liability.

**H.8 Reseller-provisioned startup verification.** Recommend **magic-link verification before workspace becomes non-provisional**. Rationale: prevents reseller spam signups juking KPIs; matches accelerator invite pattern.

**H.9 Refund beyond 7-day window (day-100 dispute).** Recommend **reseller clawback via next payout**. Rationale: same invoice, same money — reseller carries the risk; must be spelled out in the reseller agreement.

**H.10 Reseller visibility of customer email.** Recommend **masked in list view; full reveal in detail view on explicit click; every reveal logs to `reseller_audit_log`**. Rationale: legitimate support need + minimum access + logged access.

**H.11 — RESOLVED (see U.2).** Credit numbers per tier live in `plans.csv usage_limits.monthly_credits`: Starter=25, Growth=200, Scale=1000, Enterprise=unlimited. Earlier brief's "200/800/3000" was a mis-quote. A$99 → `founder_growth` → 200 credits/mo. **The code wins.** Still open: build the missing monthly reset cron in P3 (piggy-back on webhook refactor). Confirm reading of "BlockID nets 60% of list" is **pre-GST-remit** ($59.40 constant across tiers) — Auschain remits GST regardless. Below preserved for history:
* Brief says 200 / 800 / 3000; code says **25 / 200 / 1000 / unlimited** with **no monthly reset cron**. Recommend: reconcile numbers with product; build the missing monthly reset cron in P3 (piggy-back on webhook refactor).
* Confirm reading of "BlockID nets 60% of list" is **pre-GST-remit** ($59.40 constant across tiers) — Auschain remits GST to the ATO regardless. Alternative reading (post-GST net constant) would require different commission math.

**H.12 Reseller user segment.** Recommend **new `reseller` segment** in `segments.ts:17`. Rationale: reusing `advisor` conflates dashboard experiences; new segment is 3 lines with no downstream cost.

**H.13 Stripe dashboard login owner (U.1).** Repo doesn't record it. Recommend **`admin@blockid.au` as the account owner login, `info@blockid.au` as a secondary team member** (mirrors how the two emails are used elsewhere — `admin@` = super-admin authority, `info@` = outbound comms). Confirm at `dashboard.stripe.com → Settings → Team & Account`, and if wrong, transfer ownership to `admin@blockid.au` before P3 goes live. Add `stripe.account_owner_email` to `docs/plans/reseller-module-goal.md` as the source of truth.

**H.14 Billing model default per new reseller (U.3).** Recommend **`wholesale` as the default for InfoVision-class deals** (reseller signs a partnership contract, provisions accounts, bills their own end-customer off-Stripe); **`retail` remains available** for future referral/affiliate partners who just want a link+commission model. Set `resellers.billing_model` at admin-create time; never auto-switch. Rationale: matches InfoVision's actual flow and doesn't force a UX branch on the reseller.

**H.15 Reseller sandbox credit ceiling (U.4).** Recommend **the sandbox draws from the same `monthly_credit_budget` used for granting credits to attributed startups** (single ceiling per reseller org). InfoVision starts at 20,000/mo (H.4); the sandbox spend is instrumented separately in the monthly report so we can see how much of the ceiling the reseller consumed for internal use vs customer grants. Rationale: one budget dial per reseller is simpler than two; separation-of-concerns lives in the reporting layer.

**H.16 Autonomous loop cadence and stop condition (U.5).** Recommend **off-peak tick, no wall-clock deadline, stop only when `current_focus === "done"` or `RESELLER_AUTONOMOUS_LOOP=off`**. P11 has no exit criterion — designed to run indefinitely for KPI digest, drift auto-triage, and onboarding new resellers. Rationale: matches founder's "continuous, no time-box" direction and reuses existing cloud-routine cadence.

---

## Verification Plan

**End-to-end validation each phase must pass before flag flip in prod:**

1. **Unit** — `web/src/lib/reseller/commission.ts` pure functions against the G.2 truth table; DB CHECK constraint fires on invalid rows.
2. **Integration** — Stripe test-mode: create session with `?via=INFOVISION20`, confirm `client_reference_id`, `subscription.metadata.reseller_*`, `discounts` populated. Simulate `invoice.paid` fixture (see Stripe CLI `stripe fixtures`), assert `reseller_commissions` row with the exact commission amounts from G.2.
3. **Refund path** — Stripe CLI trigger `stripe trigger charge.refunded` on the fixture invoice at Day 3 and Day 30; assert `status` transitions per G.3 table.
4. **Console scope** — write Playwright test as a reseller user attempting to fetch `/api/svi/*`, `/api/dataroom/*`, `/api/cap-table/*` for an attributed customer; expect 403 on every one.
5. **Audit** — Playwright: viewing customer detail writes an audit row; anomaly alert triggers at > 200 subject-reads/week (simulate).
6. **Co-branding** — Playwright: attributed workspace renders pill; non-attributed workspace does not; VI locale renders VI strings.
7. **Add-on split** — Playwright: new Growth user hits `POST /api/cap-table` → 402; grandfathered Growth user succeeds; add-on purchaser succeeds after webhook + 60 s.
8. **Framework local-doc check** — for each new API route or Server Component, engineer confirms compliance with the local `node_modules/next/dist/docs/` guide per [web/AGENTS.md](web/AGENTS.md).
9. **Rollback drill** — for each flag, flip off in staging under production-like load; observe no 5xx spike, no orphaned rows, no ledger drift.

---

## Executive Summary (one page)

**What we're building.** A multi-reseller module that lets partners like InfoVision introduce customers to BlockID under a co-branded relationship, earn recurring commission per paid invoice, and manage those customers through a scoped console — while all money continues to settle 100% into BlockID's own Stripe account.

**How it plugs in.** Attribution mirrors the existing `?ref=` referral capture (cookie + localStorage + magic-link resume) but writes to a new `attribution_reseller_id` FK because resellers are a distinct entity from user-to-user referrals. The console layout reuses `WorkspaceLayout` with a new sidebar group. Commission accrual extends the existing `invoice.paid` webhook and shares `stripe_event_id` with `revenue_events` — the same idempotency helper (`claimWebhookEvent`) handles both. Every design choice cites a live pattern in the codebase.

**Why five tiers survive Stripe's constraints.** Stripe rejects 0-value coupons, so tier 0 ("identification only, no discount") lives as an app-native `reseller_code` that stamps metadata without a Stripe discount object; tiers 10/20/30/40 use four shared `percent_off + duration:forever` coupons wrapped in one promotion code per (reseller, tier). Attribution resolution at invoice time checks promotion_code → subscription.metadata → customer.metadata → client_reference_id, first hit wins.

**Commission math is a single invariant.** `list − discount − commission = 0.60 × list` for every tier, backed by a DB CHECK. At A$99 list, BlockID's gross-before-GST-remit is $59.40 every time; commission owed is $39.60 / $29.70 / $19.80 / $9.90 / $0. Refunds within 7 days void a `pending_clearance` row; refunds and disputes afterward book a compensating clawback (dispute window: 120 days).

**Privacy is bounded by design.** Reseller admins see operational data only — company name, plan, billing status, dates, aggregate usage counters. They cannot see workspace content (cap tables, documents, SVI details) because no route exposes those to a reseller-scoped session, and a lint rule enforces it in CI. An APP 5.2 collection notice appears the moment a code is applied.

**Share Management becomes an add-on.** Growth/Scale/Enterprise subscribers on cutover day are grandfathered forever. New users see "Add Share Management from A$49/mo" in the cap-table empty state and pay a separate subscription line — which inherits the same reseller discount and accrues commission at a per-SKU rate. Splitting the SKU without inserting server-side `requireFeature("share_management")` at ~14 mutation routes would leak paid features once URLs are known, so consolidation is mandatory in the same PR.

**Delivery.** Ten phases behind seven independent feature flags; ~19 eng-weeks total, ~16 with P4/P8 in parallel. P3 (webhooks + commission ledger + missing monthly credit reset cron) is the load-bearing week; P10 (audit-log digest + Playwright + copy review) is the gate for going live with a real reseller.

**Open decisions to sign off (H.1–H.12).** Coupon duration (recommend `forever`); add-on price (recommend $49/mo, $490/yr); payout cadence (monthly, 15th, CSV + bank transfer); InfoVision credit ceiling (20,000/mo); grandfathering horizon (forever with lapse rule); commission-math semantics (pre-GST-remit constant); and the credit-numbers discrepancy between the brief (200/800/3000) and the code (25/200/1000/unlimited).
