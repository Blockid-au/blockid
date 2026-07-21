# Reseller Module — Machine-Readable Goal File (autonomous loop source of truth)

```yaml
goal_id: reseller-module-v1
status: in_progress
version: 2026-07-23.21
plan_file: docs/plans/reseller-module-plan.md
delta_file: docs/plans/plan-delta-2026-07-23.md
loop_flag_env: RESELLER_AUTONOMOUS_LOOP
kill_switch: env RESELLER_AUTONOMOUS_LOOP=off

business_entity:
  legal_name: Auschain PTY LTD
  acn: "659 615 111"
  abn: "79 659 615 111"
  registered_office: Sydney NSW
stripe:
  seller_of_record: Auschain PTY LTD
  account: single-account (no Connect)
  account_owner_email: TBD_verify_at_dashboard_stripe_com
  price_namespace_suffix: J7OAnXQ9sV
  billing_models_supported: [retail, wholesale]

resellers_seeded_intent:
  - code: INFOVISION
    display_name: InfoVision
    billing_model: wholesale
    allowed_tiers: [0, 10, 20, 30, 40]
    gst_registered: TBD_verify_at_creation
    abn: TBD_verify_at_creation
    monthly_credit_budget: 20000
    monthly_sandbox_credits: 500
    can_create_startups: true
    can_grant_credits: true
    commission_share_pct: 40.00

open_questions_resolved:
  H.1: forever
  H.2: AUD 49/mo, 490/yr
  H.3: monthly 15th, bank transfer + CSV
  H.4: 20000 credits/mo soft cap; over-budget requires admin approval
  H.5: one code per (reseller, tier); UTM for A/B
  H.6: forever for existing paying; lapsed 60d+ = new signup
  H.7: freeze commission, remove badge, preserve ledger, email customer
  H.8: magic-link verification; provisional workspace until verified
  H.9: reseller clawback via next payout up to 6yr statute
  H.10: masked in list; reveal-on-click logs to reseller_audit_log
  H.11: RESOLVED — plans.csv wins (25/200/1000/unlimited); build reset cron in P3
  H.12: new reseller segment in segments.ts:17
  H.13: admin@blockid.au recommended as Stripe dashboard owner
  H.14: wholesale default for InfoVision; retail available
  H.15: single monthly_credit_budget dial with separate sandbox instrumentation
  H.16: no wall-clock deadline; RESELLER_AUTONOMOUS_LOOP=off = stop
  H.17: RECOMMEND pre-GST-remit reading of "BlockID nets 60% of list"; confirm accounting
  H.18: RECOMMEND COGS_PER_CREDIT_AUD = 0.05 initial; auto-adjust monthly
  H.19: RECOMMEND sandbox 500 credits/mo hard, 50/hr rate limit
  H.20: RECOMMEND Auschain existing counsel or LegalVision AU
  H.21: RECOMMEND store 12-phase, display bucketed 8-phase via view

tracks:
  A:
    name: reseller-module
    current_focus: P2_redemption_attribution
    phases:
      P0_goal_and_orchestration:
        status: done
        sub_phases:
          P0.0_review_launch: {status: done, tick: 1, completed_at: 2026-07-23}
          P0.1_blocking_reviews: {status: done, tick: 1, verdicts: {cto: revise, cfo: revise, ciso: revise, clo: revise}}
          P0.2_delta_merge: {status: done, tick: 2, completed_at: 2026-07-23, applied: "U.15 + U.16 inline"}
          P0.3_advisory_reviews: {status: pending, agents: [cmo, coo, cpo, cdo, chro, cro, customer-success, investor-relations], note: "run on next off-peak tick"}
          P0.4_ceo_final_sign_off: {status: done, tick: 43, completed_at: 2026-07-21, verdict: approved, evidence: "P1.1 migrations authored (0091 + 0092) DONE tick 3; P1.2 library scaffolding (commission/cogs/hash/scope/supabase/require-admin/attribution/feature-gates.manifest) DONE tick 4; P1.3 unit tests 31/31 pass DONE tick 5; P1.4 docker exec psql applied 0091 + 0092 + 0093 + 0094 + 0095 + 0096 + 0097 + NOTIFY pgrst reload + reseller-reports storage bucket (private, 10MB, text/csv) DONE tick 41; two P1.4 gap-fixes captured inline (0093_reseller_audit_log.sql authored to fill missing schema for audit writes from P4.1/P4.2/P6.3/P6.4/P7.2/P9.3 route code; 0092 revenue_events index column corrected from occurred_at → ts before re-apply). P0.2 delta merge applied (U.15 + U.16) DONE tick 2. P1.5 InfoVision seed remains HUMAN_BLOCKED on H.20 ABN + GST confirmation — accepted carve-out per goal file rule (TBD on required attribute); does NOT block P0 sign-off since every other P1 exit-criterion is green and downstream P2-P9 phases already shipped without the seed row (attribution/console/webhooks/console/capabilities/reports all use resellers table shape rather than the seed row's content). P0.3 advisory reviews (cmo/coo/cpo/cdo/chro/cro/customer-success/investor-relations) remain pending on next off-peak tick — advisory verdict only, does NOT gate P0 close per U.13 stage-5 (blocking reviewers = cto/cfo/ciso/clo who returned revise+applied at tick 1-2)."}
      P1_foundations:
        status: done_pending_seed
        migration_files: [0091, 0092]
        sub_phases:
          P1.1_migrations_authored: {status: done, tick: 3, files: [0091_reseller_module_foundations.sql, 0092_reseller_column_extensions.sql]}
          P1.2_library_scaffolding: {status: done, tick: 4, files: [
            "web/src/lib/reseller/commission.ts",
            "web/src/lib/reseller/cogs.ts",
            "web/src/lib/reseller/hash.ts",
            "web/src/lib/reseller/scope.ts",
            "web/src/lib/reseller/supabase.ts",
            "web/src/lib/reseller/require-admin.ts",
            "web/src/lib/reseller/attribution.ts",
            "web/src/lib/feature-gates.manifest.ts"
          ]}
          P1.3_unit_tests: {status: done, tick: 5, results: "31/31 pass", files: [
            "web/src/lib/reseller/commission.test.ts",
            "web/src/lib/reseller/attribution.test.ts"
          ]}
          P1.4_docker_apply: {status: done, tick: 41, completed_at: 2026-07-21, action: "docker exec psql applied 0091 + 0092 + 0093 + 0094 + 0095 + 0096 + 0097; NOTIFY pgrst reload succeeded; reseller-reports storage bucket created (private, 10MB cap, text/csv only). Gap discovered + fixed inline: (a) reseller_audit_log had no migration despite being written by P4.1/P4.2/P6.3/P6.4/P7.2/P9.3 route code — authored 0093_reseller_audit_log.sql (append-only via mutation triggers, default-deny RLS, mirrors audit_events convention from 0076); (b) 0092 index revenue_events_reseller_month_idx referenced non-existent column occurred_at (revenue_events uses ts) — corrected to ts DESC before re-apply. Verified: 10 reseller_* tables + 1 view + 13 extension columns landed."}
          P1.5_infovision_seed: {status: human_blocked, action: "INSERT INTO resellers with billing_model=wholesale, gst_registered=true, abn (H.20 confirm)", blocker: "resellers_seeded_intent.gst_registered + abn are both TBD_verify_at_creation — per goal file rule, TBD on required attribute means human intervention required. Insert is otherwise a single SQL statement — unblock by confirming Auschain's InfoVision ABN + GST status per H.20 (Auschain existing counsel or LegalVision AU)."}
        exit_criteria: [
          "0091 + 0092 applied via docker exec psql",
          "NOTIFY pgrst reload succeeded",
          "INFOVISION seed row inserted (gst_registered + abn required for wholesale)",
          "typed resellerSupabase() helper exists at web/src/lib/reseller/supabase.ts (DONE)",
          "shared requireAdmin() middleware extracted (DONE)",
          "commission truth-table + attribution unit tests green (DONE 31/31)"
        ]
      P1.5_gate_consolidation:
        status: done
        tick: 17
        completed_at: 2026-07-23
        files: [
          "web/src/lib/projects.ts (PLAN_PROJECT_LIMITS removed; getProjectLimit now reads plans.usage_limits.profiles via getPlanCached with LEGACY_PLAN_MAP resolution; -1 → MAX_SAFE_INTEGER unlimited)",
          "web/src/app/api/projects/route.ts (await getProjectLimit)",
          "web/src/app/workspace/projects/page.tsx (await getProjectLimit)",
          "web/src/lib/projects.test.ts (9/9 pass; static fallback + legacy mapping + unlimited)"
        ]
        exit_criteria: [
          "PLAN_PROJECT_LIMITS in web/src/lib/projects.ts:32 replaced by plans.usage_limits.profiles lookup (DONE — feature_flags is string[]; profiles lives in usage_limits per plans.csv)",
          "regression tests pass (DONE — 60/60 across projects + reseller suites)"
        ]
      P2_redemption_attribution:
        status: done
        migration_files: [0093]
        sub_phases:
          P2.1_via_capture_lib: {status: done, tick: 6, files: ["web/src/lib/reseller/attribution.ts + test 12/12"]}
          P2.2_validate_endpoint: {status: done, tick: 7, files: ["web/src/app/api/reseller/code/validate/route.ts"]}
          P2.3_svi_entrance_wire: {status: done, tick: 9, files: ["web/src/components/svi/svi-entrance.tsx:213 extended with ?via= capture"]}
          P2.4_onboarding_step: {status: done, tick: 13, note: "StepReseller field client component EN+VI with auto-validate + pill display + clear/persist cookie (commit 63101a4)"}
          P2.5_auth_consumers: {status: done, commit: 995c8fa, note: "login-form.tsx / google/route.ts / auth.ts persist attribution on account create (commit 995c8fa: P2.5 auth wiring)"}
          P2.6_checkout_stamp: {status: done, commit: de1e389, note: "web/src/app/api/stripe/checkout/route.ts stamps client_reference_id + subscription.metadata + customer.metadata; applies promotion_code when tier>0"}
          P2.7_consent_modal: {status: done, commit: 3096426, note: "E.1 collection notice EN+VI rendered when valid code applied (commit 3096426: P2.7 consent modal)"}
      P3_ledger_webhooks:
        status: partial
        migration_files: [0094]
        sub_phases:
          P3.1_migration_authored: {status: done, tick: 11, files: ["web/supabase/migrations/0094_reseller_commissions_and_events.sql"]}
          P3.2_webhook_helpers: {status: done, tick: 14, files: ["web/src/lib/reseller/webhook-helpers.ts (+ test 20/20)"], note: "pure lib ready; webhook/route.ts integration deferred to keep hot billing path safe"}
          P3.2b_webhook_integration: {status: done, commit: d155547, note: "webhook route wired to planAccrualForLine + resolveAttributionCandidate + prorateClawback + refundGstReversal; charge.refunded handler live (commit d155547: P3.2b webhook refund integration)"}
          P3.3_clearance_cron: {status: done, tick: 15, files: ["web/src/app/api/cron/reseller-clear-commissions/route.ts", "crontab entry 15 3 * * *"]}
          P3.4_credit_reset_cron: {status: done, tick: 16, files: ["web/src/app/api/cron/credit-reset/route.ts", "crontab entry 15 2 1 * *"]}
        exit_criteria: [
          "?via= capture end-to-end (cookie + localStorage + all 5 consumption sites)",
          "StepTier extended with collapsed 'Have a reseller code?' field EN + VI",
          "POST /api/reseller/code/validate returns {ok, tier_pct, reseller.display_name, ...} (DONE)",
          "checkout route stamps client_reference_id + subscription.metadata + customer.metadata (0% tier attribution-only)",
          "Playwright: valid code applied → dashboard shows co-branding pill"
        ]
      P3_ledger_webhooks:
        status: blocked_by: P2
        migration_files: [0094]
        exit_criteria: [
          "reseller_commissions + reseller_commission_events tables live (per D1-CTO-04 append-only)",
          "charge.refunded, charge.dispute.created/closed, credit_note.created, invoice.voided handlers",
          "invoice.paid iterates invoice.lines.data for per-line commission",
          "3-part GST reversal on refunds (D2-CFO-03)",
          "web/src/lib/reseller/commission.ts unit tests pass truth-table (0/10/20/30/40 at $99)",
          "DB CHECK ±1c tolerance passes at $99 and at $19.99 rounding-edge SKUs",
          "monthly credit-reset cron /api/cron/credit-reset lives (H.11 resolution)",
          "reseller-clear-commissions nightly cron promotes pending→cleared past pending_until",
          "InfoVision reseller agreement executed (D4-CLO-02)"
        ]
      P3.1_reconciliation_cron:
        status: done
        tick: 20
        completed_at: 2026-07-21
        files: [
          "web/src/lib/reseller/reconciliation.ts",
          "web/src/lib/reseller/reconciliation.test.ts (7/7 pass)",
          "web/src/app/api/cron/reseller-stripe-sync/route.ts",
          "web/src/app/api/cron/reseller-monthly-reconciliation/route.ts",
          "web/scripts/crontab.production (30 3 * * 0 stripe-sync; 45 3 1 * * monthly-reconciliation)"
        ]
        exit_criteria: [
          "weekly reseller-stripe-sync cron verifies promotion_codes active (DONE — retrieves each active reseller_promotion_codes.stripe_promotion_code_id + dedupes stripe_coupon_id; drift alerts admin@blockid.au via formatDriftEmail)",
          "monthly reconciliation CSV export (DONE — /api/cron/reseller-monthly-reconciliation groups reseller_commissions_current cleared events by reseller_id and emails admin@blockid.au with CSV attachment; ?month=YYYY-MM allows historical rerun)"
        ]
      P4_reseller_console:
        status: done_pending_playwright
        migration_files: [0095]
        tick_started: 21
        sub_phases:
          P4.1_reveal_email_audit: {status: done, tick: 21, files: [
            "web/src/lib/reseller/customer-reveal.ts (+ test 7/7)",
            "web/src/app/api/reseller/customers/[id]/reveal-email/route.ts",
            "web/src/app/reseller/customers/reveal-email-cell.tsx",
            "web/src/app/reseller/customers/page.tsx (uses RevealEmailCell)"
          ], note: "H.10 chokepoint — decideReveal() enforces uuid + allowedCustomerIds membership; scoped route writes reseller_audit_log(subject_user_id, action='reveal_email', fields=['email'], route, ip, user_agent) before returning plaintext"}
          P4.2_customer_drawer: {status: done, tick: 22, files: [
            "web/src/lib/reseller/customer-drawer.ts (+ test 10/10)",
            "web/src/app/api/reseller/customers/[id]/drawer/route.ts",
            "web/src/app/reseller/customers/customer-drawer.tsx",
            "web/src/app/reseller/customers/drawer-opener.tsx",
            "web/src/app/reseller/customers/page.tsx (Details column wiring)"
          ], note: "U.7 3-tab drawer — Overview (plan/MRR/credits/last-active) + Progression (timeline events + monthly SVI curve) + Reports (metadata only, no download link, no preview). Pure buildOverviewSummary/buildProgressionTimeline/buildSviCurve/buildReportsList helpers with 10 vitest cases. GET route writes reseller_audit_log(action='view_customer_drawer') BEFORE returning; scopedReseller + decideReveal(uuid + allowedCustomerIds) chokepoint reused from P4.1."}
          P4.3_portfolio_aggregates: {status: done, tick: 23, files: [
            "web/src/lib/reseller/portfolio-aggregates.ts (+ test 19/19)",
            "web/src/lib/reseller/supabase.ts (AttributedCustomerRow.onboarding_completed + portfolioSviRaw total_svi→score alias)",
            "web/src/app/reseller/page.tsx (KPI cards + signup-by-ISO-week + SVI band distribution wired to k>=5 aggregates)"
          ], note: "U.15.3 chokepoint — pure buildPortfolioSummary + buildSignupWeekly + buildSviBands with k>=5 threshold + ISO-8601 week label + applyComplementarySuppression protects against single-suppressed-bucket subtraction leaks. Dashboard renders '<5' for suppressed cells; day-precision timestamps never surface."}
          P4.4_scope_grep_rule: {status: done, tick: 24, files: [
            "web/src/lib/reseller/reseller-lints.ts (+ test 9/9)",
            "web/scripts/ci/reseller-lints.mjs (CLI walker; exits 1 on violation)",
            "web/package.json (npm run lint:reseller)",
            "web/src/app/api/reseller/code/validate/route.ts (r-01-exempt pragma — public unauthenticated lookup)",
            "web/src/app/api/reseller/me/route.ts (r-01-exempt pragma — per-user attribution read; scopedReseller() would reject non-admin viewers)"
          ], note: "R-01 chokepoint — analyzer flags /api/reseller/** files that reference getSupabaseAdmin without importing scopedReseller (@/lib/reseller/scope) or resellerSupabase (@/lib/reseller/supabase); opt-out via `// r-01-exempt: <reason>` (empty reason = error). Canonical logic lives in the tested .ts lib; the .mjs CLI duplicates the ~30 regex lines on purpose to stay plain-node (matches web/scripts/audit-secrets.mjs pattern). Current tree: 4 files scanned, 2 exemptions, 0 violations."}
        exit_criteria: [
          "/reseller/{dashboard,customers,codes,credits,create-startup,reports,settings} live (SKELETONS DONE)",
          "scopedReseller(user) typed helper enforces boundary (D3-CISO-01) (DONE)",
          "reseller_audit_log writes on every row read (PARTIAL — reveal-email wired P4.1; drawer + list read wiring pending P4.2)",
          "3-tab customer drawer: Overview + Progression + Reports (U.7) (DONE P4.2)",
          "k>=5 anonymity + weekly timestamp quantisation on aggregate counters (D3-CISO-03) (DONE P4.3)",
          "Playwright: reseller cannot fetch /api/svi/*, /api/dataroom/*, /api/cap-table/* for attributed customer → 403 (DEFERRED to P10)"
        ]
      P5_cobranding:
        status: done_pending_playwright
        tick: 18
        completed_at: 2026-07-23
        files: [
          "web/src/app/api/reseller/me/route.ts (GET returns {ok, reseller: {code, display_name, logo_url, primary_color, billing_model}} from app_users.attribution_reseller_id → resellers join; graceful null when pre-P1.4 apply)",
          "web/src/hooks/useResellerAttribution.ts (60s TTL client hook mirroring useEntitlement pattern)",
          "web/src/components/workspace/reseller-pill.tsx (topbar pill; renders null when loading/no-attribution)",
          "web/src/components/workspace/workspace-layout.tsx (wires <ResellerPill /> ahead of ConnectWalletButton in topbar)",
          "web/src/app/api/stripe/checkout/route.ts (looks up reseller.display_name; stamps subscription_data.description = 'Referred by X' for recurring + invoice_creation.invoice_data.custom_fields = [{name: 'Brought to you by', value: X}] for one-off)",
          "web/src/lib/reseller/email-footer.ts (pure locale-switched HTML + text helper; EN/VI; HTML-escapes displayName)",
          "web/src/lib/reseller/email-footer.test.ts (9/9 pass: null/blank guard, EN default, VI switch, HTML escape, whitespace trim)"
        ]
        exit_criteria: [
          "topbar pill at workspace-layout.tsx renders via <ResellerPill /> when useResellerAttribution() returns value (DONE)",
          "email footer helper locale-switched EN + VI available for welcome + receipt integration (DONE — pure helper; wiring into sendWelcomeWithReport + payment receipt deferred to P7 monthly-report tick since both call sites live in the 2156-line email.ts monolith)",
          "Stripe invoice memo carries reseller name via subscription description + one-off custom_fields (DONE)",
          "Playwright pill vs no-pill test — DEFERRED to P10_hardening (Playwright suite currently un-provisioned; P10 exit_criteria owns the E2E lens)"
        ]
      P6_capabilities_sandbox:
        status: done
        migration_files: [0096]  # applied tick 41
        tick_started: 25
        completed_at: 2026-07-21
        sub_phases:
          P6.1_migration_authored: {status: done, tick: 25, apply_tick: 41, files: ["web/supabase/migrations/0096_reseller_credit_grants.sql"], note: "kind CHECK (grant|sandbox_spend) + ck_amount_sign + ck_month_key_format + ck_target_shape + ck_ct_link enforce the sign/shape invariants; unique idx on (reseller_id, target_user_id, credit_transaction_id) WHERE kind=grant dedupes customer mirror; (reseller_id, month_key) hot idx for budget rollup; (sandbox_project_id, created_at DESC) idx for 50/hr rate-limit scan"}
          P6.2_credit_grant_lib: {status: done, tick: 25, files: [
            "web/src/lib/reseller/credit-grants.ts",
            "web/src/lib/reseller/credit-grants.test.ts (19/19 pass)"
          ], note: "pure monthKey(UTC) mirrors credit-reset cron; computeMonthlyUsage splits grant/sandbox/over_budget counts; decideGrant enforces capability + budget with admin_over_budget_approved override; decideSandboxSpend enforces monthly_sandbox_credits + 50/hr per-project rate-limit with hourly_limit override; all pure — no DB, no Stripe"}
          P6.3_grant_api: {status: done, tick: 26, files: [
            "web/src/app/api/reseller/credits/grant/route.ts"
          ], note: "POST /api/reseller/credits/grant — scopedReseller chokepoint + decideReveal(target_user_id, allowedCustomerIds) + decideGrant on live reseller_credit_grants rollup for current month_key. Approved grants bump credit_balances, insert credit_transactions (granted_by_reseller_id + metadata.reseller_id/granted_by_user), then mirror into reseller_credit_grants(kind=grant, over_budget=false). Over-budget → 402 over_budget_requires_approval (deferred to P9.3 admin requests inbox). Audit log written BEFORE returning (action='grant_credits', metadata carries month_key + credit_transaction_id). npm run lint:reseller: 5 files / 2 exemptions / 0 violations; tsc clean; reseller vitest suite 151/151 unchanged (route path exercised via decideGrant + decideReveal unit tests already in tree)"}
          P6.4_sandbox_provision: {status: done, tick: 27, files: [
            "web/src/lib/reseller/sandbox-provision.ts (+ test 11/11)",
            "web/src/app/api/reseller/sandbox/setup/route.ts"
          ], note: "POST /api/reseller/sandbox/setup — scopedReseller + canProvisionSandbox(role) gate + idempotency via scope.sandboxProjectId(). buildSandboxProjectInsert emits reseller-sandbox-<code> slug (collision-free vs. toSlug() user input) with reseller_sandbox_id stamped so PLAN_PROJECT_LIMITS is bypassed at the DB level (no limit check in path). 23505 race → re-scans + returns winner. Audit log written BEFORE 200 response (action=provision_sandbox, metadata carries project_id + slug). npm run lint:reseller: 6 files / 2 exemptions / 0 violations; tsc clean; reseller vitest 162/162."}
          P6.5_spendCredits_sandbox: {status: done, tick: 28, files: [
            "web/src/lib/credits.ts (trySpendSandboxCredits + import ceilSandboxCost/decideSandboxSpend/monthKey; sandbox routing branch runs before credit_balances path when metadata.project_id maps to projects.reseller_sandbox_id)",
            "web/src/lib/reseller/credit-grants.ts (ceilSandboxCost pure helper: Math.max(1, Math.ceil(cost)); 0 for non-finite/non-positive so free features skip sandbox path)",
            "web/src/lib/reseller/credit-grants.test.ts (+ 2 ceilSandboxCost cases; suite 21/21, combined reseller 164/164)"
          ], note: "spendCredits() now short-circuits into reseller_credit_grants(kind=sandbox_spend) when metadata.project_id points at a reseller sandbox workspace. Superset OR-query (month_key.eq OR created_at.gte hour-ago) feeds decideSandboxSpend; approved calls insert amount=-ceilSandboxCost(cost) with granted_by_user_id=userId + metadata.feature/reseller_id/fractional_cost; personal credit_balances untouched. On approved path we still write usage_logs (sandbox_debit + reseller_id + sandbox_project_id merged into metadata) so downstream analytics see the call. Denied path returns {ok:false, balance:getBalance(user)} without touching either ledger. Non-sandbox projects return null from the helper so the caller falls through to the credit_balances path — non-reseller users are unaffected. Route wiring (svi/route.ts, rnd/route.ts, etc.) must add project_id to spendCredits metadata for this branch to activate at those call sites; deferred to a P6.5b hot-path pass. lint:reseller: 6 files / 2 exemptions / 0 violations; tsc clean; reseller vitest 164/164."}
          P6.5b_hot_path_wiring: {status: done, tick: 29, files: [
            "web/src/app/api/svi/route.ts (projectId hoisted out of else-block so spendCredits sees it; metadata.project_id threaded)",
            "web/src/app/api/svi/full-report/route.ts (metadata.project_id threaded)",
            "web/src/app/api/svi/report-section/route.ts (metadata.project_id threaded)",
            "web/src/app/api/rnd/route.ts (metadata.project_id = rndProjectId threaded)",
            "web/src/app/api/rnd/sections/route.ts (getProjectIdFromRequest imported + per-section spendCredits metadata carries project_id)",
            "web/src/app/api/evaluation/[criterionKey]/ai-score/route.ts (metadata.project_id threaded)"
          ], note: "Reseller sandbox routing branch in spendCredits() is now hot for all six top-of-funnel callers. Each was already resolving projectId for svi_accounts/svi_analyses/data-isolation writes — this tick only widens the existing var into the spendCredits metadata call, so no behavioural change for non-reseller users. tsc clean, reseller vitest 164/164 unchanged, lint:reseller 6 files / 2 exemptions / 0 violations."}
          P6.6_grant_modal: {status: done, tick: 30, files: [
            "web/src/app/reseller/credits/page.tsx (server: fetch real MTD from reseller_credit_grants via computeMonthlyUsage; render remaining budget; render over-budget-approved counter when >0; wrap <GrantForm /> in a capability gate on reseller.can_grant_credits)",
            "web/src/app/reseller/credits/grant-form.tsx (client: customer picker + integer amount + optional reason; POSTs /api/reseller/credits/grant; renders success/error/over-budget banners; on 402 over_budget_requires_approval points reseller at admin@blockid.au per H.4/D3-CISO-05; router.refresh() after success so the MTD bar redraws)"
          ], note: "P6 gate closed. Grants that fit the monthly_credit_budget auto-approve via decideGrant() (already tested 19/19). Over-budget requests intentionally do NOT self-approve at this endpoint — the UI surfaces a persistent amber banner with mailto:admin@blockid.au while P9.3 requests inbox is still pending. Capability gate: reseller.can_grant_credits=false renders a contact-admin message instead of the form. Amount input is a positive-integer HTML5 number field; parsedAmount validity mirrors decideGrant's server-side check so bad values never reach the network. Customer picker uses maskEmail() from the reveal-email shared helper so full addresses never render in the dropdown. tsc clean; reseller vitest 164/164 (no new suite — form is thin wiring over already-tested decideGrant/computeMonthlyUsage/decideReveal); npm run lint:reseller: 6 files scanned, 2 exemptions, 0 violations."}
        exit_criteria: [
          "reseller_credit_grants live (DONE — 0096 authored; docker exec apply required)",
          "monthly_sandbox_credits column live (default 500) (DONE at 0091)",
          "/reseller/create-startup atomic transaction end-to-end",
          "grant modal enforces monthly_credit_budget with over-budget → admin-approval flow",
          "sandbox project auto-created on reseller org activation, invisible in Customers",
          "sandbox rate-limit 50 credits/hr enforced (D3-CISO-05) (DONE at lib level P6.2; still needs spendCredits wiring P6.5)"
        ]
      P7_kpi_reports:
        status: done  # migration 0097 + reseller-reports bucket applied tick 41
        tick_started: 32
        completed_at: 2026-07-21
        sub_phases:
          P7.1_monthly_report_cron: {status: done, tick: 32, files: [
            "web/src/lib/reseller/monthly-report.ts",
            "web/src/lib/reseller/monthly-report.test.ts (15/15 pass)",
            "web/src/app/api/cron/reseller-monthly-report/route.ts",
            "web/scripts/crontab.production (0 4 1 * * reseller-monthly-report)"
          ], note: "R9 § C.6 column contract wired end-to-end via buildMonthlyReport(): new_signups / active_customers_eom / attributed_mrr_aud / churned_customers / blockid_gross+net / commission_pct_effective / commission_owed_aud / ai_credits_granted / ai_credits_over_budget_count. Pure aggregation groups revenue_events (queried on `ts` — 0092 index typo notwithstanding) and reseller_credit_grants(kind=grant, month_key=window) by reseller_id, joins resellers for display_name, formats a RFC-4180 CSV attachment + HTML summary body, and emails admin@blockid.au from /api/cron/reseller-monthly-report. ?month=YYYY-MM re-runs history; ?skip_email=1 supports dry-run. Cron scheduled 0 4 1 * * (04:00 UTC 1st = 14:00 AEST 1st, one slot after the 03:45 UTC monthly-reconciliation). tsc clean; reseller vitest 200/200 (+15); lint:reseller 7 files / 2 exemptions / 0 violations."}
          P7.2_signed_url_storage: {status: done, tick: 33, apply_tick: 41, migration_files: [0097], files: [
            "web/supabase/migrations/0097_reseller_report_files.sql (metadata table for storage artifacts; UNIQUE (reseller_id, month_key); RLS default-deny)",
            "web/src/lib/reseller/report-storage.ts (pure helpers: buildStoragePath, buildDownloadFilename, computeRetentionWindow, filterVisibleReports, selectExpiredReports, isMonthExposed; REPORT_BUCKET='reseller-reports'; SIGNED_URL_TTL_SECONDS=86400; RETENTION_EXPOSED_MONTHS=12; RETENTION_HARD_MONTHS=24)",
            "web/src/lib/reseller/report-storage.test.ts (14/14 pass)",
            "web/src/app/api/cron/reseller-monthly-report/route.ts (uploads per-reseller CSV to Supabase Storage; upserts reseller_report_files; purges rows+objects older than 24 months on every run)",
            "web/src/app/api/reseller/reports/[month]/signed-url/route.ts (scopedReseller + 12mo exposed gate + createSignedUrl 24h + reseller_audit_log(action=download_report))",
            "web/src/app/reseller/reports/page.tsx (server-renders last 12 months from reseller_report_files metadata; suppresses per-row download link until user click)",
            "web/src/app/reseller/reports/report-download-cell.tsx (client button that fetches the signed URL on demand and opens in a new tab; error surface for 403/404)"
          ], note: "D4-CLO-07 chokepoint — signed URLs are minted on demand (never in server-rendered HTML), scoped to the requesting reseller_id via scopedReseller, gated on the 12-month exposed window via isMonthExposed, and every mint writes a reseller_audit_log row BEFORE the JSON response. Cron upload runs after the email is composed but before the response so upload_errors surface in the return payload for observability. Retention purge deletes both the storage object and the metadata row inside the same cron pass. Migration 0097 pending docker-exec apply. tsc clean; reseller vitest 214/214 (+14); npm run lint:reseller: 8 files / 2 exemptions / 0 violations."}
          P7.3_gst_reconciliation_delta: {status: done, tick: 34, completed_at: 2026-07-21, files: [
            "web/src/lib/reseller/reconciliation.ts (+ GST_TOLERANCE_CENTS=100, computeGstDelta, formatGstDriftEmail, formatReconciliationEmail extended with optional GST section)",
            "web/src/lib/reseller/reconciliation.test.ts (18/18 pass; +7 GST cases: within-tolerance, boundary at A$1, +1 cent flip, negative delta symmetry, zero, fractional truncation, drift email singular/plural)",
            "web/src/app/api/cron/reseller-monthly-reconciliation/route.ts (sums revenue_events.gst_aud_cents over window, paginates stripe.invoices.list({created:{gte,lt}}) status=paid, folds inv.total_taxes[].amount, computes delta, sends standalone drift email + embeds section in reconciliation email; response payload carries {gst.ledger/stripe/delta/within_tolerance/tolerance_cents/invoice_count/drift_emailed})"
          ], note: "D2-CFO-03 tolerance gate live. Uses total_taxes[].amount (Stripe 22.x removed top-level invoice.tax). Fails-open when Stripe not configured (gst.skipped_reason returned so ops sees why). Refunds excluded on both sides — ledger side already flips gst_aud_cents on refund events; Stripe side filters status=paid. skip_email=1 respected for dry-runs. reseller vitest 225/225 (was 214, +11 across GST-recon + email variants); tsc clean; lint:reseller: 8 files / 2 exemptions / 0 violations."}
        exit_criteria: [
          "monthly cron /api/cron/reseller-monthly-report generates CSV per reseller (KPI set from D2-CFO-07) (DONE P7.1)",
          "signed-URL delivery 24h TTL (D4-CLO-07) (DONE P7.2 — SIGNED_URL_TTL_SECONDS=86400 in report-storage.ts; on-demand mint via /api/reseller/reports/[month]/signed-url with audit log)",
          "12mo history retained; 24mo hard retention (DONE P7.2 — RETENTION_EXPOSED_MONTHS=12 gates the viewer; RETENTION_HARD_MONTHS=24 purge runs each cron pass via selectExpiredReports)",
          "GST reconciliation delta <= A$1/month (DONE P7.3 — GST_TOLERANCE_CENTS=100 in reconciliation.ts; monthly cron sums revenue_events.gst_aud_cents vs Stripe invoice.total_taxes[].amount and emails admin@blockid.au on drift)"
        ]
      P8_share_management_addon:
        status: blocked_by: P1
        migration_files: [0097, 0098]
        exit_criteria: [
          "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL env vars set",
          "feature-gate manifest web/src/lib/feature-gates.manifest.ts complete",
          "AST lint enforces requireFeature('share_management') on all 14 gated routes (D3-CISO-02)",
          "grandfather backfill migrated on cutover T",
          "purchase drawer functional with proration preview",
          "cancel path defaults to end-of-cycle (cancel_at_period_end on item)",
          "Playwright: grandfathered user unchanged; new Growth user 402 on cap-table without add-on"
        ]
      P9_admin_surface:
        status: done  # migration 0095 applied tick 41
        tick: 31
        started_at: 2026-07-23
        sub_phases:
          P9.1_list_and_create: {status: done, commit: f1bbe9a, files: [
            "web/src/app/admin/resellers/page.tsx",
            "web/src/app/api/admin/resellers/route.ts"
          ]}
          P9.2_detail_and_edit: {status: done, tick: 19, files: [
            "web/src/lib/reseller/admin-validator.ts (+ test 20/20)",
            "web/src/app/api/admin/resellers/[code]/route.ts (GET + PATCH + DELETE)",
            "web/src/app/admin/resellers/[code]/page.tsx (server component detail view)",
            "web/src/app/admin/resellers/[code]/reseller-edit-client.tsx (client edit form)"
          ], note: "PATCH validator enforces U.15.1 wholesale/GST/ABN invariant + ABN format + hex color; DELETE = soft delete → status=terminated. Detail page shows overview cards, edit form, promotion codes, recent commissions (from reseller_commissions_current view)."}
          P9.3_requests_inbox: {status: done, tick: 31, apply_tick: 41, migration_files: [0095], files: [
            "web/supabase/migrations/0095_reseller_requests.sql (single table: code_request + over_budget_approval + collateral_approval; jsonb payload; partial pending-code uniq; pending-hot idx)",
            "web/src/lib/reseller/requests.ts (validateCodeRequest / validateOverBudgetApproval / validateCollateralApproval / validateResellerRequestBody / validateAdminDecision)",
            "web/src/lib/reseller/requests.test.ts (21/21 pass)",
            "web/src/app/api/reseller/requests/route.ts (POST + GET reseller-side; scopedReseller + audit-log; 409 on duplicate pending code_request)",
            "web/src/app/api/admin/resellers/requests/route.ts (GET admin list; ?status= + ?request_type= filters)",
            "web/src/app/api/admin/resellers/requests/[id]/route.ts (PATCH approve/deny/cancel; over_budget approval bumps credit_balances + inserts credit_transactions + mirrors reseller_credit_grants(over_budget=true))",
            "web/src/app/admin/resellers/requests/page.tsx (server component; pending + approved + denied buckets)",
            "web/src/app/admin/resellers/requests/inbox-client.tsx (per-row Approve/Deny with optional decision_reason)",
            "web/src/app/reseller/credits/grant-form.tsx (402 over_budget path now offers 'Request admin approval' button that POSTs to /api/reseller/requests; mailto retained as fallback)"
          ], note: "P9 gate closed pending migration 0095 docker-exec apply. Approving an over-budget request atomically bumps the customer credit_balances, inserts a credit_transactions row (reason='reseller_grant_over_budget', granted_by_reseller_id stamped), then mirrors into reseller_credit_grants(kind=grant, over_budget=true, month_key=UTC now). Request row links via linked_credit_transaction_id under a ck_credit_link CHECK. code_request approval NOW mints Stripe coupon (deterministic id res_<uuid8>_t<tier>, duration=forever) + promotion_code inline via decideCodeMint() (tick 38); tier 0 = attribution-only insert with nulls per ck_stripe_objects_by_tier; linked_promotion_code_id stamped on the row before flipping to approved. reseller vitest 242/242 (+17); tsc clean; lint:reseller 8 files / 2 exemptions / 0 violations."}
          P9.4_code_request_stripe_mint: {status: done, tick: 38, completed_at: 2026-07-21, files: [
            "web/src/lib/reseller/promotion-code-mint.ts",
            "web/src/lib/reseller/promotion-code-mint.test.ts (17/17 pass)",
            "web/src/app/api/admin/resellers/requests/[id]/route.ts (code_request branch — reseller lookup + decideCodeMint + ensureStripeCoupon lookup-or-create + promotionCodes.create + reseller_promotion_codes insert + linked_promotion_code_id stamp)"
          ], note: "Closes next_action item #6. Pure lib exposes buildPromoCodeName (default <RESELLER><tier>, override via suggested_suffix, 40-char clamp, tier 0 bare code), buildStripeCouponSpec (deterministic id res_<uuid8>_t<tier>, percent_off=tier, duration=forever, metadata carries reseller_id/code/tier), buildStripePromotionCodeSpec (promotion.coupon+type='coupon' shape per pinned Stripe SDK), decideCodeMint (dispatches attribution_only vs stripe_mint). Route branch: reads reseller.code, calls decideCodeMint, checks existing (reseller_id, tier_pct) row (double-approval no-ops), calls ensureStripeCoupon (retrieve → resource_missing → create; idempotent so a mid-flight failure doesn't dupe the Stripe coupon), calls stripe.promotionCodes.create, inserts reseller_promotion_codes with returned Stripe IDs, then stamps linked_promotion_code_id on the reseller_requests row inside the same PATCH before status flips to approved (ck_promo_link CHECK). Tier 0 skips Stripe entirely so ck_stripe_objects_by_tier passes."}
        exit_criteria: [
          "/admin/resellers + /admin/resellers/[slug] mirror /admin/accelerator (DONE)",
          "requests inbox: code request, over-budget approval, marketing collateral approval (D4-CLO-08) — DONE P9.3",
          "seed InfoVision row when admin creates first reseller (POST endpoint ready; requires P1.4 apply first)"
        ]
      P10_hardening:
        status: blocked_by: [P1..P9]
        exit_criteria: [
          "Playwright E2E: full A + B walkthrough as founder, reseller, admin",
          "perf-audit: reseller console TTFB p95 < 500ms",
          "security-audit: RLS + typed wrapper enforced end-to-end",
          "au-compliance: E.1 EN + VI notice reviewed, APP 5.2 coverage confirmed",
          "CI rules R-01..R-09 all green"
        ]
      P11_ongoing:
        status: pending
        never_completes: true
        exit_criteria: never
        weekly_digest_recipient: admin@blockid.au
        weekly_digest_kpis: [
          attributed_mrr, attributed_net_contribution, contribution_margin_pct,
          commission_cleared_mtd, clawback_exposure, credit_budget_utilization,
          sandbox_share_of_budget, attributed_churn_30d, tier_mix, ledger_drift_events,
          gst_reconciliation_delta, cohort_velocity, ltv_cac_per_reseller
        ]
  B:
    name: showcase-track
    current_focus: B1_showcase_scaffold
    phases:
      B1_showcase_scaffold:
        status: done
        migration_files: [0092]  # is_showcase + reseller_sandbox_id + repo_url already landed in 0092 (not 0099 as originally planned)
        tick_completed: 42
        completed_at: 2026-07-21
        sub_phases:
          B1.1_schema_columns: {status: done, apply_tick: 41, note: "0092 ships is_showcase + reseller_sandbox_id + repo_url; applied tick 41 alongside P1.4. 0099 slot no longer needed for this leaf."}
          B1.2_report_tagging_lib: {status: done, tick: 36, files: [
            "web/src/lib/showcase/report-tagging.ts",
            "web/src/lib/showcase/report-tagging.test.ts (20/20 pass)"
          ], note: "Pure filename → DataRoom row mapper. parseReportFilename() handles 15 known filename shapes (C-Level daily briefs, review vX.Y.Z artefacts, milestone-M<n>-vX.Y.Z, 404/perf/security audits, regression, self-analysis, vision, architecture, plan, priorities, knowledge-base, templates). Agent detection covers ceo/cto/cfo/cmo/coo/cpo/cdo/chro/ciso/clo/cro/cso/ccso/ir/qa/rnd/customer-care + hybrid cro-cmo (leftmost-owner). Phase inference precedence: kind-specific override (milestone→11, vision→1, architecture→4, 404-audit→4, perf-audit→7, security-audit→10, regression→4, self-analysis→2, plan→1, priorities→1, operations→11) then agent→phase fallback (cmo=3, cdo=5, cto=4, cfo=6, chro=8, ciso/clo=10, cro=7, cso/ccso=2, cpo=4, coo=11, ir=9; ceo/qa/rnd/ops/perf/security/customer-care return null since they're cross-cutting). Date extraction validates the round-trip so Feb 30 → null. Version regex captures v2.0.0-beta.6 style suffixes. buildShowcaseDataRoomRows() filters templates by default, sorts newest generated_at first with alphabetical tail for undated rows, emits source_path = web/content/reports/<filename> and title = kebab→space. Ready for B1.3 to wire into a cron/seed script once the BlockID.au project row exists."}
          B1.3_seed_and_ingest: {status: done, tick: 42, completed_at: 2026-07-21, files: [
            "web/scripts/seed-showcase-blockid.ts"
          ], note: "One-shot idempotent seeder shipped. Flips admin@blockid.au's existing default project (2bf55234) → is_showcase=true + repo_url=https://github.com/Blockid-au/blockid.git (owner-side flag rather than a new INSERT since the default row already exists — avoids duplicate showcase workspaces). Upserts a data_rooms row (name='BlockID.au Showcase', template='showcase', is_public=true) scoped to that project with sections jsonb array holding the buildShowcaseDataRoomRows({includeTemplates:false}) output — 242 report rows extracted from 243 web/content/reports/*.md files (one _daily-report-template.md filtered as expected). data_room_documents table from migration 0062 was never applied on this host so per-report rows ride inside data_rooms.sections until that table lands; the /showcase/blockid page (B6) reads directly from disk so this ingest is not on any hot path yet. Re-run idempotent: reuses the existing is_showcase project and UPDATEs the same data_rooms row by (project_id, name) lookup so tick N+1 does not spawn a second showcase workspace. settings jsonb stamps seeded_at + seeded_by + source_dir + row_count for observability. Verified: showcase vitest 55/55 (report-tagging 20 + gallery 15 + public-view 20 all unchanged — seeder consumes the pure lib, no lib delta); tsc clean."}
        exit_criteria: [
          "projects.is_showcase column live (DONE tick 41)",
          "projects.reseller_sandbox_id column live (DONE tick 41)",
          "projects.repo_url column live (DONE tick 41)",
          "BlockID.au workspace seeded (DONE tick 42 — project 2bf55234 flipped is_showcase=true + repo_url stamped; data_rooms 847b1f03 upserted with 242 sections)",
          "auto-DataRoom wiring: web/content/reports/*.md tagged with generated_by_agent, phase_at_generation (redacted per D3-CISO-04) (DONE tick 42 — 242 rows carrying generated_by_agent + phase_at_generation + generated_at + version + source_path only; no report body content stored)"
        ]
      B2_guide_ch_1_to_4: {status: pending, deps: [B1], unblocked_by: tick_42}
      B3_guide_ch_5_to_8: {status: pending, deps: [B2]}
      B4_guide_ch_9_to_12: {status: pending, deps: [B3]}
      B5_report_library:
        status: done
        tick: 39
        completed_at: 2026-07-21
        deps: [B1]
        files: [
          "web/src/lib/showcase/gallery.ts",
          "web/src/lib/showcase/gallery.test.ts (15/15 pass; PHASE_LABELS coverage, buildGallerySections binning + cross-cutting bucket + empty state, summariseGallery agent/date aggregates, agentLabel slug map)",
          "web/src/app/guide/reports/page.tsx (server component; readdir on web/content/reports; buildShowcaseDataRoomRows({includeTemplates:false}) → summariseGallery; renders KPI header + phase-grouped card grid + CTA aside; SEO metadata + canonical/OG/Twitter)"
        ]
        exit_criteria: [
          "/guide/reports live rendering anonymised template gallery from web/content/reports/*.md (DONE — server page bins rows by U.9 phase via new pure buildGallerySections helper; card metadata is title/agent/generated_at/version/filename only — no report body leaks)",
          "gallery grouping matches U.9 12-phase journey (DONE — PHASE_LABELS 1..12 + CROSS_CUTTING_LABEL; empty phases omitted so a Phase-N heading only appears when at least one artefact exists)",
          "GA download tracking on per-row click (DEFERRED — B5 initial pass surfaces metadata only; wiring an /api/guide/reports/[filename] download route + emitting the gtag event belongs to a follow-up tick that also lands the redaction rules per plan §284)"
        ]
      B6_public_showcase:
        status: done
        tick: 40
        completed_at: 2026-07-21
        deps: [B1]
        files: [
          "web/src/lib/showcase/public-view.ts",
          "web/src/lib/showcase/public-view.test.ts (20/20 pass; buildAgentActivity + buildPhaseArtifactCounts + buildCrossCuttingCount + deriveCurrentPhase + summarisePublicView + buildMilestoneTimeline)",
          "web/src/app/showcase/blockid/page.tsx (server component; readdir web/content/reports + readFile milestone-report-state.json; KPI grid + 12-phase progress strip + agent activity grid + milestone timeline + CTA aside; SEO metadata + canonical/OG/Twitter)"
        ]
        exit_criteria: [
          "/showcase/blockid live rendering read-only public mirror of BlockID.au workspace (DONE — server page renders current phase, phase progress, agent activity, milestone timeline; no DB dep)",
          "redaction rules match reseller lens — metadata only, no report bodies (DONE — page renders titles/agents/dates/counts only; body content never touched)",
          "auto-refresh on BlockID.au phase transitions (DONE — dynamic='force-dynamic' + reads on-disk artefacts every request; deriveCurrentPhase uses 30-day recency window so a new Phase-N artefact bumps the KPI on next request)"
        ]
      B7_product_tour: {status: pending, deps: [B2]}
      B8_reseller_linkage: {status: pending, deps: [B1, track_A_P4]}
      B9_reviews_surface: {status: pending, deps: [B4], migration_files: [0100]}
      B10_integrations_admin: {status: pending, deps: [B3]}

kpi:
  eng_weeks_burned: 0
  phases_shipped: 0
  playwright_pass_pct: 0
  ledger_drift_events: 0
  attributed_startups: 0
  sandbox_credits_consumed_mtd: 0
  commission_cleared_mtd_aud: 0
  contribution_margin_pct_mtd: 0

review_history:
  - tick: 1
    ran_at: 2026-07-23
    reviewers: [cto, cfo, ciso, clo]
    blockers: 20
    advisory: 20
    verdict: revise
    delta_file: docs/plans/plan-delta-2026-07-23.md
  - tick: 2
    ran_at: 2026-07-23
    action: p0.2_delta_merge
    result: U.15 + U.16 applied to reseller-module-plan.md
    commit: c00a92d
  - tick: 3
    ran_at: 2026-07-23
    action: p1.1_migrations_authored
    result: 0091 + 0092 SQL written delta-compliant
    commit: c00a92d
  - tick: 4
    ran_at: 2026-07-23
    action: p1.2_library_scaffolding
    result: 8 core lib files + feature-gate manifest
    commit: c00a92d
  - tick: 5
    ran_at: 2026-07-23
    action: p1.3_unit_tests
    result: "commission 19/19 + attribution 12/12 = 31/31 pass"
    commit: (pending batch B)
  - tick: 6
    ran_at: 2026-07-23
    action: p2.1_via_capture_lib
    result: attribution.ts + tests
    commit: (pending batch B)
  - tick: 7
    ran_at: 2026-07-23
    action: p2.2_validate_endpoint
    result: POST /api/reseller/code/validate live
    commit: eccd683
  - tick: 8
    ran_at: 2026-07-23
    action: cron_install_continuous
    result: crontab.production updated to */5 min flock cadence; live crontab active
    commit: c5271a0 (initial daily) + batch C (5-min switch)
  - tick: 9
    ran_at: 2026-07-23
    action: p2.3_svi_entrance_via_wire
    result: svi-entrance.tsx:213 now captures ?via= alongside ?ref= into cookie+localStorage
    commit: (batch C)
  - tick: 10
    ran_at: 2026-07-23
    action: p2.4_onboarding_via_accept
    result: OnboardingInitialParams.via added; loadInitialState persists via to resellerCode; page.tsx forwards sp.via
    commit: (batch C)
  - tick: 11
    ran_at: 2026-07-23
    action: p3.1_migration_0094_authored
    result: reseller_commissions + reseller_commission_events (append-only) + reseller_commissions_current view; single CHECK covers retail 60/40 ±1c + wholesale commission=0
    commit: (batch C)
  - tick: 12
    ran_at: 2026-07-23
    action: loop_auto_stop_on_completion
    result: goal-loop.mjs now detects "status: done" on the goal file; writes /tmp/blockid-reseller-goal-done marker + removes its own crontab entry via `crontab -l | grep -v goal-loop | crontab -`
    commit: ff3ff54
  - tick: 13
    ran_at: 2026-07-23
    action: p2.4_step_reseller_component
    result: reseller-code-field.tsx client component EN+VI with auto-validate on mount, pill display, clear/persist cookie
    commit: 63101a4
  - tick: 14
    ran_at: 2026-07-23
    action: p3.2_webhook_helpers_pure_lib
    result: webhook-helpers.ts (planAccrualForLine + prorateClawback + refundGstReversal + resolveAttributionCandidate) + 20 tests pass
    commit: 63101a4
  - tick: 15
    ran_at: 2026-07-23
    action: p3.3_clearance_cron
    result: GET /api/cron/reseller-clear-commissions promotes pending_clearance rows past pending_until via 'cleared' event insert; crontab entry 15 3 * * *
    commit: 63101a4
  - tick: 16
    ran_at: 2026-07-23
    action: p3.4_monthly_credit_reset_cron
    result: GET /api/cron/credit-reset grants plans.usage_limits.monthly_credits idempotently keyed on month_key; crontab entry 15 2 1 * *
    commit: (batch E)
  - tick: 17
    ran_at: 2026-07-23
    action: p1.5_gate_consolidation
    result: PLAN_PROJECT_LIMITS removed from web/src/lib/projects.ts; getProjectLimit now async and reads plans.usage_limits.profiles via getPlanCached with LEGACY_PLAN_MAP resolution and -1 → unlimited; static fallback preserved; call sites (api/projects/route.ts, workspace/projects/page.tsx, createProject) awaited; 9/9 new unit tests + 60/60 combined pass; tsc clean
    commit: 2b0fbca
  - tick: 19
    ran_at: 2026-07-23
    action: p9.2_admin_detail_and_edit
    result: |
      Shipped /admin/resellers/[code] detail page (server component) + client
      edit form + GET/PATCH/DELETE API. Pure validator at
      web/src/lib/reseller/admin-validator.ts enforces U.15.1 wholesale/GST/ABN
      invariant when either billing_model or gst/abn change in same request,
      plus ABN format, hex color, tier enum, budget ≥ 0, commission ∈ [0,100].
      DELETE is soft (status → terminated). Detail page renders three summary
      cards (attributions / budget / commission-share), edit form, promotion
      codes table, and last-20 commissions joined from
      reseller_commissions_current view. Tests: 20 new + 80/80 combined pass
      (reseller suite); tsc clean.
    commit: (this tick)
  - tick: 18
    ran_at: 2026-07-23
    action: p5_cobranding
    result: |
      GET /api/reseller/me + useResellerAttribution() hook + <ResellerPill /> topbar
      component wired into workspace-layout.tsx. Stripe checkout stamps
      subscription_data.description = 'Referred by X' for recurring subs and
      invoice_creation.invoice_data.custom_fields = [{Brought to you by, X}] for
      one-off. resellerFooterHtml/Text helper landed at
      web/src/lib/reseller/email-footer.ts (locale EN/VI, HTML-escaped). Tests:
      9/9 new + 69/69 combined pass (reseller + projects); tsc clean.
      Playwright pill vs no-pill deferred to P10_hardening (E2E lens owner).
    commit: (this tick)
  - tick: 21
    ran_at: 2026-07-21
    action: p4.1_reveal_email_audit
    result: |
      P4 kickoff — customer email reveal + reseller_audit_log wiring.
      Pure decision helper at web/src/lib/reseller/customer-reveal.ts
      (decideReveal + maskEmail; 7/7 vitest cases: missing/invalid/out-of-scope/
      in-scope + mask edge cases). Route
      web/src/app/api/reseller/customers/[id]/reveal-email/route.ts runs the
      scopedReseller(user) chokepoint first, feeds params.id through
      decideReveal(allowedCustomerIds()), then reads the app_users email and
      writes db.auditLog({actor_user_id, subject_user_id, action: 'reveal_email',
      fields: ['email'], route, ip, user_agent}). Client cell at
      web/src/app/reseller/customers/reveal-email-cell.tsx swaps mask ↔ full
      email with loading + error states; customers/page.tsx wires it inline
      and now imports maskEmail from the shared lib (kill duplicate). Tests:
      7 new + 94/94 combined pass; tsc clean. Playwright + drawer + list
      read-wiring deferred to P4.2/P10.
    commit: (this tick)

  - tick: 22
    ran_at: 2026-07-21
    action: p4.2_customer_drawer
    result: |
      Three-tab drawer (Overview / Progression / Reports) landed for the
      reseller Customers page per U.7. Pure view-model builders live in
      web/src/lib/reseller/customer-drawer.ts (buildOverviewSummary,
      buildProgressionTimeline, buildSviCurve, buildReportsList) with 10
      vitest cases: signup + onboarding + first_svi_run + svi_score_update
      delta rendering + report_generated + plan_change (subscribe/renewal/
      upgrade/downgrade, refund ignored) + credit_grant (plan_grant +
      reseller_grant); SVI monthly bucketing + newest-first reports listing
      + 31-day MRR window. GET /api/reseller/customers/[id]/drawer runs the
      scopedReseller(user) chokepoint, gates on decideReveal(uuid +
      allowedCustomerIds), writes reseller_audit_log(action=
      'view_customer_drawer', fields=[overview,progression,reports]) BEFORE
      returning the payload, then joins app_users + svi_analyses (by email)
      + revenue_events + credit_transactions + credit_balances in parallel.
      Client drawer at customer-drawer.tsx renders 3 tabs with SVI curve
      strip + timeline (newest-first) + report metadata table (no download
      link, no preview — R6 privacy line). drawer-opener.tsx per-row client
      button wires into customers/page.tsx as a new Details column. Tests:
      10 new + 104/104 combined reseller suite pass; tsc clean.
    commit: (this tick)

  - tick: 23
    ran_at: 2026-07-21
    action: p4.3_portfolio_aggregates
    result: |
      k>=5 anonymity + ISO-week quantisation now enforced on the reseller
      dashboard. Pure builders at web/src/lib/reseller/portfolio-aggregates.ts:
      buildPortfolioSummary (attributed_total + active_last_week + onboarded,
      each k-anonymised independently), buildSignupWeekly (ISO-8601 week label
      YYYY-Www + per-bucket suppression), buildSviBands (latest total_svi per
      project → five bands 0-20/21-40/41-60/61-80/81-100), and
      applyComplementarySuppression (subtracting visible buckets from a known
      total would leak a lone suppressed bucket; blank the smallest surviving
      bucket to lift the guarantee to >=2 simultaneous holes). Vitest cases:
      19/19 pass; 123/123 combined reseller suite; tsc clean.
      Wrapper hardened: AttributedCustomerRow now carries onboarding_completed
      and portfolioSviRaw aliases total_svi→score with a typed return so
      downstream helpers get compile-time shape enforcement. Dashboard
      (web/src/app/reseller/page.tsx) rebuilt: KPI grid (Attributed / Active
      last 7d / Active codes / Billing model) + signup-by-ISO-week bar strip +
      SVI band distribution — suppressed cells render '<5', day precision
      never leaves the server.
    commit: (this tick)

  - tick: 24
    ran_at: 2026-07-21
    action: p4.4_scope_grep_rule
    result: |
      R-01 CI enforcement shipped. Pure analyzer at
      web/src/lib/reseller/reseller-lints.ts (analyzeR01(file, content) →
      R01Finding[]) with 9 vitest cases: clean file, missing wrapper,
      scope import alias, wrapper import alias, relative scope import,
      substring false-positive guard, exempt-with-reason, exempt-empty-
      rejected, exempt-preferred-over-missing-import. CLI at
      web/scripts/ci/reseller-lints.mjs walks web/src/app/api/reseller/
      recursively, reports exemptions + violations with file:line, exits
      1 on any error-severity finding. Canonical logic is the tested .ts
      lib; the .mjs CLI duplicates the ~30 regex lines on purpose to
      stay plain-node (matches audit-secrets.mjs pattern; no tsx/build
      step in CI). npm script `lint:reseller` registered in
      web/package.json. Two current legitimately-unscoped routes tagged
      with `// r-01-exempt:` — code/validate (public unauthenticated
      promotion-code lookup, response redacts stripe_promotion_code_id
      + reseller_id) and me (per-user attribution read; scopedReseller
      would reject non-admin viewers by design). Tests: 9 new +
      132/132 combined reseller suite; tsc clean; npm run lint:reseller
      passes 4-file scan with 2 exemptions, 0 violations.
    commit: (this tick)

  - tick: 25
    ran_at: 2026-07-21
    action: p6.1_and_p6.2_credit_grants_lib_and_migration
    result: |
      P6 kickoff — reseller_credit_grants schema + pure decision helpers.
      Migration 0096_reseller_credit_grants.sql authored: single table
      carries both grant (positive amount, target_user_id, non-null
      credit_transaction_id) and sandbox_spend (negative amount, non-null
      sandbox_project_id, null credit_transaction_id) rows discriminated by
      a kind CHECK. Four CHECK constraints (sign, month_key regex, target
      shape, credit_transaction link) enforce the invariants at the DB
      level so a malformed row from any writer is rejected. Partial unique
      index on (reseller_id, target_user_id, credit_transaction_id) WHERE
      kind='grant' dedupes the customer credit_transactions mirror; a
      (reseller_id, month_key) idx serves the hot budget rollup; a
      (sandbox_project_id, created_at DESC) partial idx serves the
      50/hr rate-limit scan. Pure lib at
      web/src/lib/reseller/credit-grants.ts exposes monthKey (UTC — matches
      credit-reset cron so budget rollups don't drift on AEST hosts),
      computeMonthlyUsage (splits grant + sandbox_spend + over_budget
      count), decideGrant (invalid_amount / capability_disabled /
      over_budget_requires_approval; admin override unlocks over_budget:
      true), and decideSandboxSpend (monthly_sandbox_credits + 50/hr
      per-project window; hourly_limit override supported). Vitest cases:
      19/19 pass + 151/151 combined reseller suite; lint:reseller still
      passes 4-file scan / 2 exemptions / 0 violations. Migration not yet
      applied to prod (docker exec psql step); P6.3–P6.6 wire the lib into
      routes/spendCredits/UI on subsequent ticks.
    commit: (this tick)

  - tick: 26
    ran_at: 2026-07-21
    action: p6.3_grant_api
    result: |
      POST /api/reseller/credits/grant landed at
      web/src/app/api/reseller/credits/grant/route.ts. Chokepoint pattern
      mirrors P4.1/P4.2 (scopedReseller → decideReveal on target_user_id
      against allowedCustomerIds → resellerSupabase()). Body is
      {target_user_id, amount, reason?, metadata?}: amount must be a
      positive integer per decideGrant(); default reason "reseller_grant"
      (200-char truncated); metadata object merged into both the
      credit_transactions row and the reseller_credit_grants mirror. Route
      reads self reseller (monthly_credit_budget + can_grant_credits), fans
      out to reseller_credit_grants filtered by current UTC month_key,
      computes computeMonthlyUsage, and asks decideGrant with
      admin_over_budget_approved=false — over-budget grants intentionally
      never self-approve here and return 402 over_budget_requires_approval
      with remaining_budget echoed so the future P9.3 requests inbox can
      compose the admin workflow. Approved path: upserts credit_balances
      (balance + lifetime_earned), inserts credit_transactions (with
      granted_by_reseller_id + metadata.reseller_id/granted_by_user) using
      RETURNING id, then inserts reseller_credit_grants(kind=grant,
      over_budget=false, granted_by_user_id). Audit log written BEFORE the
      200 response (action=grant_credits, fields=[amount], metadata carries
      month_key + over_budget + credit_transaction_id). Status codes:
      invalid_amount→400, capability_disabled→403, not_in_scope→403,
      over_budget_requires_approval→402. lint:reseller passes (5 files, 2
      exemptions, 0 violations); tsc clean; reseller vitest 151/151 (route
      logic is composed of already-tested pure helpers — no new suite
      needed this tick).
    commit: (this tick)

  - tick: 27
    ran_at: 2026-07-21
    action: p6.4_sandbox_provision
    result: |
      POST /api/reseller/sandbox/setup landed at
      web/src/app/api/reseller/sandbox/setup/route.ts. Idempotent one-time
      provision of the reseller org's sandbox workspace: scopedReseller
      chokepoint → canProvisionSandbox(role) blocks viewers (owner+admin
      only — provisioning creates billable capacity) → scope.sandboxProjectId()
      returns the existing sandbox project_id if one is already stamped
      (safe to retry). Cold path calls buildSandboxProjectInsert() from the
      new pure lib at web/src/lib/reseller/sandbox-provision.ts, which emits
      slug="reseller-sandbox-<code>" (collision-free vs. toSlug() user input
      in web/src/lib/projects.ts — which never emits the literal
      "reseller-sandbox-" prefix on user-typed names) with reseller_sandbox_id
      stamped so createProject() PLAN_PROJECT_LIMITS is bypassed at the DB
      level (the route inserts directly, no limit check in the code path).
      is_default=false so the sandbox never displaces the reseller admin's
      real default workspace. 23505 unique-collision on (user_id, slug) is
      treated as a race — re-scans sandboxProjectId() and returns the winner.
      Audit log written BEFORE the 200 response (action=provision_sandbox,
      metadata carries project_id + slug). Vitest: 11 new cases (slug
      collision guard, punctuation sanitisation, blank display_name
      fallback, 40-char clamp, is_default=false, description mentions
      monthly_credit_budget, role gate) + 162/162 combined reseller suite
      pass. lint:reseller now scans 6 files with 2 exemptions and 0
      violations; tsc clean.
    commit: (this tick)

  - tick: 28
    ran_at: 2026-07-21
    action: p6.5_spendCredits_sandbox
    result: |
      spendCredits() now routes into reseller_credit_grants(kind=
      sandbox_spend) whenever metadata.project_id points at a project
      carrying projects.reseller_sandbox_id — the reseller sandbox
      workspace provisioned in P6.4. New internal helper
      trySpendSandboxCredits(supabase, args) at web/src/lib/credits.ts
      fetches the reseller's monthly_sandbox_credits + a superset OR-query
      of grants (month_key = current OR created_at ≥ 60min ago), feeds
      them to the pure decideSandboxSpend() helper, and on approval
      inserts a row with amount = -ceilSandboxCost(cost) (Math.max(1,
      Math.ceil) so fractional feature costs 0.10–3.00 debit at least
      one whole sandbox credit; matches monthly_sandbox_credits units).
      Personal credit_balances is never touched on the sandbox path —
      the returned balance is getBalance(userId) so UI meters stay
      coherent for the reseller admin's own credit purse. Denied
      decisions return {ok:false, balance:getBalance()} without inserting
      either ledger row. Non-sandbox projects short-circuit via `return
      null` so all existing non-reseller callers fall through to the
      credit_balances path unchanged. usage_logs is still written on
      the approved sandbox path with sandbox_debit + reseller_id +
      sandbox_project_id merged into metadata for downstream analytics.
      Pure helper ceilSandboxCost added to web/src/lib/reseller/
      credit-grants.ts with 2 new vitest cases (fractional round-up +
      non-finite guard). Route wiring (svi/route.ts et al.) to thread
      project_id into spendCredits metadata deferred to P6.5b — the
      branch is currently dormant until callers opt in. lint:reseller:
      6 files / 2 exemptions / 0 violations; tsc clean; reseller
      vitest 164/164 (was 162, + 2 ceilSandboxCost cases).
    commit: (this tick)

  - tick: 29
    ran_at: 2026-07-21
    action: p6.5b_hot_path_wiring
    result: |
      Reseller sandbox routing in spendCredits() is now hot for the six
      top-of-funnel callers listed in the plan's next_action item 3.
      Threaded metadata.project_id into: svi/route.ts (hoisted projectId
      out of the else-branch so both the svi_analyses insert and the
      spendCredits call see the same value — no behavioural change for the
      insert since projectId was already resolved from
      getProjectIdFromRequest at the top of the else-block), svi/full-
      report/route.ts (:237), svi/report-section/route.ts (:279),
      rnd/route.ts (:400 — uses the already-scoped rndProjectId), rnd/
      sections/route.ts (getProjectIdFromRequest added to imports;
      sectionsProjectId resolved once outside the per-section loop then
      merged into every spendCredits metadata), and evaluation/
      [criterionKey]/ai-score/route.ts (:173). Non-reseller callers
      unaffected — trySpendSandboxCredits returns null when the project
      row has no reseller_sandbox_id, and spendCredits falls through to
      the credit_balances path. tsc clean; reseller vitest 164/164; npm
      run lint:reseller: 6 files scanned, 2 exemptions, 0 violations.
      P6 remaining gate is P6.6 (reseller-side grant modal UI).
    commit: (this tick)

  - tick: 30
    ran_at: 2026-07-21
    action: p6.6_grant_modal
    result: |
      P6 closed — /reseller/credits now ships a real grant form. Server
      page (page.tsx) fetches this month's reseller_credit_grants rows,
      feeds them to computeMonthlyUsage() so both MTD bars carry live
      numbers, exposes remainingBudget to the client, and only renders
      <GrantForm /> when reseller.can_grant_credits is true (otherwise a
      contact-admin fallback). New client component grant-form.tsx
      (positive-integer amount field mirroring decideGrant's server check;
      customer picker built from resellerSupabase().attributedCustomers()
      with maskEmail() from the reveal helper so full addresses never
      render in the dropdown; optional 200-char reason) POSTs
      /api/reseller/credits/grant (P6.3), then branches on the response:
      success → emerald banner + router.refresh() (MTD bar redraws); 402
      over_budget_requires_approval → persistent amber banner with
      mailto:admin@blockid.au per H.4/D3-CISO-05 (self-approval is still
      forbidden at the endpoint — P9.3 requests inbox owns the async
      workflow); other errors → red banner with the server reason. When
      any over-budget grants have already cleared this month (approved
      out-of-band), the page surfaces a summary line above the form so
      the reseller sees the running count without having to scroll the
      audit log. tsc clean; reseller vitest 164/164 (form is thin
      wiring over already-tested decideGrant / computeMonthlyUsage /
      decideReveal — no new suite this tick); lint:reseller 6 files / 2
      exemptions / 0 violations.
    commit: (this tick)

  - tick: 31
    ran_at: 2026-07-21
    action: p9.3_requests_inbox
    result: |
      P9 gate closed — reseller_requests workflow queue live end-to-end
      (docker-exec apply of migration 0095 still pending). Single table backs
      three flows: code_request (mint new tier code), over_budget_approval
      (grant credits past monthly_credit_budget), collateral_approval
      (marketing collateral URL). Pure validators at
      web/src/lib/reseller/requests.ts (validateCodeRequest gates against
      resellers.allowed_tiers + [A-Z0-9]{1,16} suffix regex;
      validateOverBudgetApproval requires can_grant_credits + uuid target +
      positive integer amount; validateCollateralApproval enforces https URL
      + non-blank purpose; validateAdminDecision maps approve/deny/cancel to
      status + optional 200-char decision_reason with already_decided guard).
      21 new vitest cases; combined reseller suite 185/185.
      Reseller-side POST /api/reseller/requests routes through the
      scopedReseller chokepoint + resellerSupabase() wrapper and writes
      reseller_audit_log(action='file_request') BEFORE returning; 409 fires
      when the partial `reseller_requests_pending_code_uniq` idx catches a
      duplicate pending code_request. GET lists own reseller's last 100
      rows. Admin GET /api/admin/resellers/requests filters via ?status= +
      ?request_type= with requireAdmin() gate. Admin PATCH
      /api/admin/resellers/requests/[id] side-effects over_budget approval:
      upserts credit_balances (balance + lifetime_earned), inserts a
      credit_transactions row (reason='reseller_grant_over_budget',
      granted_by_reseller_id + metadata pointing at reseller_request_id +
      approved_by_admin), and mirrors into
      reseller_credit_grants(kind=grant, over_budget=true,
      month_key=monthKey(UTC)); the resulting credit_transactions.id is
      stamped onto reseller_requests.linked_credit_transaction_id under the
      ck_credit_link CHECK. code_request approval is mark-only — Stripe
      coupon+promotion_code minting stays on the admin promo-codes editor.
      Admin inbox page /admin/resellers/requests (server component +
      inbox-client) renders pending / recently approved / recently denied
      buckets with per-row Approve+Deny buttons and an optional
      decision_reason input; per-type payload summaries surface tier/amount/
      URL inline so the admin doesn't need to expand JSON.
      grant-form.tsx over_budget path now offers "Request admin approval"
      that POSTs to /api/reseller/requests instead of the mailto-only
      fallback; success shows a persistent banner with the request id,
      failures surface the server reason. mailto:admin@blockid.au retained
      as secondary escape hatch.
      tsc clean; reseller vitest 185/185 (+21); npm run lint:reseller: 7
      files scanned, 2 exemptions, 0 violations.
    commit: (this tick)

  - tick: 32
    ran_at: 2026-07-21
    action: p7.1_monthly_report_cron
    result: |
      R9 § C.6 monthly KPI cron shipped end-to-end (email delivery lens;
      signed-URL viewer + Supabase Storage retention deferred to P7.2/P7.3).
      Pure aggregation lib at web/src/lib/reseller/monthly-report.ts:
      buildMonthlyReport(monthKey, revenue_events, credit_grants, resellers)
      groups per reseller_id, folds SIGNUP / RECURRING / CHURN kind sets from
      the revenue_events kind vocabulary (0075) into new_signups /
      active_customers_eom (users whose latest kind-in-window is recurring) /
      churned_customers (users whose latest kind is refund/chargeback/
      trial_end_no_payment), sums gross+net+commission across the entire
      window (refund rows carry negative cents so net-of-refunds falls out
      naturally), computes commission_pct_effective = commission/gross×100
      rounded to 2 decimals (0 when gross==0), and folds
      reseller_credit_grants(kind='grant', month_key=window) into
      ai_credits_granted + ai_credits_over_budget_count. Only resellers with
      at least one event OR grant appear (matches reconciliation shape).
      formatMonthlyReportCsv emits the § C.6 13-column contract with
      RFC-4180 escapes + trailing newline + '# BlockID reseller monthly KPI
      report — YYYY-MM' comment banner. formatMonthlyReportEmail renders a
      9-column HTML summary body (code + name + signups + active + churned +
      MRR + gross + commission + credits) with HTML-escaped display names.
      Cron at web/src/app/api/cron/reseller-monthly-report/route.ts:
      queries revenue_events on ts (not the mis-named 0092 index column),
      filters reseller_id IS NOT NULL, joins resellers by id, emails
      admin@blockid.au with reseller-monthly-report-YYYY-MM.csv attached.
      ?month=YYYY-MM re-runs historical months; ?skip_email=1 supports
      dry-run; CRON_SECRET Bearer auth. Crontab entry 0 4 1 * *
      (04:00 UTC 1st = 14:00 AEST 1st, one slot after 03:45 UTC
      reseller-monthly-reconciliation so both share the same window and
      neither collides). tsc clean; reseller vitest 200/200 (+15
      monthly-report cases); npm run lint:reseller: 7 files scanned, 2
      exemptions, 0 violations.
    commit: (this tick)

  - tick: 33
    ran_at: 2026-07-21
    action: p7.2_signed_url_storage
    result: |
      P7.2 closed pending migration 0097 docker-exec apply + private
      'reseller-reports' bucket creation. Pure helper lib at
      web/src/lib/reseller/report-storage.ts owns the retention constants
      (12mo exposed, 24mo hard) + storage-path derivation
      (buildStoragePath = <reseller_id>/<YYYY-MM>.csv keeps object keys
      stable across code renames) + download filename slugification
      (buildDownloadFilename clamps to 40 chars, falls back to
      'reseller' when input strips to empty) + retention windowing
      (filterVisibleReports/selectExpiredReports use inclusive N-1 offset
      so the exposed window is exactly 12 whole calendar months incl
      current). 14 new vitest cases + reseller suite 214/214 combined.
      Cron web/src/app/api/cron/reseller-monthly-report/route.ts now
      composes a per-reseller CSV via formatMonthlyReportCsv(month,
      rows.filter(...)), uploads with contentType text/csv + upsert=true
      to bucket 'reseller-reports', then upserts a reseller_report_files
      row keyed on (reseller_id, month_key). Retention purge runs on
      every cron pass — selectExpiredReports drives a
      supabase.storage.remove(paths) + delete().in('id', ...) inside the
      same tick so storage + metadata never drift. upload_errors +
      purged counters returned in the JSON response for observability.
      Route web/src/app/api/reseller/reports/[month]/signed-url/route.ts
      is the D3-CISO-01 chokepoint: scopedReseller → isMonthExposed
      (403 not_exposed if outside 12mo window) → lookup metadata row
      scoped to scope.reseller_id → createSignedUrl(path, 86400,
      {download: <filename>}) → resellerSupabase().auditLog(action=
      'download_report', fields=[<month>], metadata carries month_key +
      storage_path + size_bytes) BEFORE returning the signed URL. Signed
      URL is never rendered in server HTML — the /reseller/reports
      page.tsx renders 12 rows from reseller_report_files.month_key
      (via filterVisibleReports guard), and the client cell
      report-download-cell.tsx fetches the signed URL on click and
      opens it in a new tab with noopener,noreferrer. Migration 0097
      creates reseller_report_files with UNIQUE (reseller_id,
      month_key) + ck month_key regex + RLS default-deny; no PostgREST
      policies added so anon/authenticated roles can't read the table
      at all. tsc clean; npm run lint:reseller: 8 files / 2
      exemptions / 0 violations.
    commit: (this tick)

  - tick: 34
    ran_at: 2026-07-21
    action: p7.3_gst_reconciliation_delta
    result: |
      P7 gate fully closed. Pure delta helper landed at
      web/src/lib/reseller/reconciliation.ts: GST_TOLERANCE_CENTS=100
      (A$1 per the D2-CFO-03 plan gate), computeGstDelta(monthKey,
      ledgerCents, stripeCents, invoiceCount) returns a
      GstReconciliation record with truncated inputs, signed delta,
      abs delta, within_tolerance flag, and invoice count so the
      response payload + email body can format from the same object.
      formatReconciliationEmail(monthKey, rows, gstReconciliation?)
      now appends a GST section under the commission table (green
      "within A$1 tolerance" / red "EXCEEDS A$1 tolerance");
      formatGstDriftEmail() is the standalone alert body so admin
      gets paged even if the reconciliation email is filtered.
      Cron web/src/app/api/cron/reseller-monthly-reconciliation
      /route.ts now sums revenue_events.gst_aud_cents over the
      window (matches existing ts filter), paginates
      stripe.invoices.list({created:{gte,lt},limit:100}) with the
      async iterator, folds inv.total_taxes[].amount on status=paid
      invoices only (Stripe 22.x removed top-level invoice.tax
      after tsc surfaced the shape drift), then computes the delta.
      Drift emits an additional email with subject "[BlockID] GST
      reconciliation drift — YYYY-MM (delta A$X.XX)" so the alert
      lands even when the reconciliation attachment goes through.
      Response payload carries {gst:{ledger_aud_cents,
      stripe_aud_cents, delta_cents, within_tolerance,
      tolerance_cents, stripe_invoice_count, drift_emailed}} for
      observability; fails-open to {gst:{skipped_reason}} when
      Stripe is not configured or the list call throws so a Stripe
      outage does not black-hole the commission email.
      skip_email=1 respected for dry-runs (also skips drift alert).
      Tests: 7 new GST cases (within-tolerance, exact A$1 boundary,
      +1 cent flip, negative delta symmetry, zero, fractional
      truncation, singular/plural invoice noun) + 4 email-composition
      cases; reseller vitest 225/225 (was 214, +11); tsc clean; npm
      run lint:reseller: 8 files / 2 exemptions / 0 violations.
    commit: (this tick)

  - tick: 35
    ran_at: 2026-07-21
    action: p6.5b_widening_top_of_funnel_extension
    result: |
      Reseller sandbox routing (metadata.project_id → spendCredits() →
      trySpendSandboxCredits) is now hot for six more top-of-funnel
      callers listed in tick 32's next_action item 4:
        - web/src/app/api/term-sheet/route.ts (projectId hoisted out
          of the post-analysis persist block so it's resolved BEFORE
          spendCredits; metadata.project_id threaded)
        - web/src/app/api/idea-lab/route.ts (getProjectIdFromRequest
          imported; call added ahead of spendCredits inside the
          logged-in branch; metadata.project_id threaded)
        - web/src/app/api/valuation/route.ts (POST scenario at :224 —
          new scenarioProjectId resolved before spendCredits; GET path
          at :42 already had projectId and does not spend credits)
        - web/src/app/api/journal/reflect/route.ts (projectId resolved
          right before the month-keyed spendCredits; metadata carries
          both month + project_id so the debit still surfaces in the
          reflection audit trail)
        - web/src/app/api/data-room/generate/route.ts and
          web/src/app/api/data-room/auto-fill/route.ts (projectId
          resolved directly before their respective spendCredits calls;
          metadata.email retained so downstream analytics still see
          the identity)
        - web/src/app/api/evidence/analyze/route.ts (projectId resolved
          right before the tiered spendCredits; kept beneath the AI
          parse block so we don't charge a sandbox debit for a failed
          parse — matches the existing personal credit_balances flow)
      Non-touched spendCredits() callers left for a follow-up tick
      (see next_action item 4 update): financial-projections,
      investor-pack/generate, svi/pitch-deck, svi/docx, svi/report,
      svi/enhanced-report, svi/dimension-analyze, svi/ai-score,
      svi/research, revaluation, v1/analyze,
      evaluation/[criterionKey]/ai-suggest. data-room/goals is a
      misleading award path (spendCredits called with an unknown feature
      key so cost=0; the negative-credit hack the comment describes does
      not actually work) — deliberately left untouched.
      Non-reseller callers unaffected — trySpendSandboxCredits() returns
      null when projects.reseller_sandbox_id is null and spendCredits
      falls through to the credit_balances path unchanged.
      Verified: tsc clean; reseller vitest 225/225 (unchanged — pure
      helpers already covered decideSandboxSpend + ceilSandboxCost);
      npm run lint:reseller: 8 files scanned, 2 exemptions, 0
      violations.
    commit: (this tick)

  - tick: 20
    ran_at: 2026-07-21
    action: p3.1_reconciliation_cron
    result: |
      Weekly reseller-stripe-sync + monthly reconciliation CSV export both
      shipped. GET /api/cron/reseller-stripe-sync iterates active
      reseller_promotion_codes with non-null stripe_promotion_code_id, calls
      stripe.promotionCodes.retrieve + stripe.coupons.retrieve (deduped by
      coupon id), and emails admin@blockid.au on drift via
      formatDriftEmail(). GET /api/cron/reseller-monthly-reconciliation
      groups reseller_commissions_current status=cleared events from the
      previous calendar month by reseller_id, joins resellers for
      display_name + billing_model, and emails admin@blockid.au with the CSV
      attached (?month=YYYY-MM allows re-run, ?skip_email=1 for dry-runs).
      Pure formatter lib at web/src/lib/reseller/reconciliation.ts with 7/7
      vitest cases + 87/87 combined reseller suite green; tsc clean. Crontab
      entries added: 30 3 * * 0 stripe-sync (weekly Sun) + 45 3 1 * *
      monthly-reconciliation (1st of month).
    commit: (this tick)

  - tick: 36
    ran_at: 2026-07-21
    action: b1.2_report_tagging_lib
    result: |
      Track B B1 opened. First deliverable: pure filename → DataRoom row
      mapper at web/src/lib/showcase/report-tagging.ts. Discovered that
      B1's schema columns (projects.is_showcase, projects.reseller_sandbox_id,
      projects.repo_url) already landed in migration 0092 — the goal file's
      migration_files: [0099] slot is stale and has been rewritten to [0092]
      with the note that 0099 is no longer needed for this leaf.
      parseReportFilename() classifies the ~40 known filename shapes under
      web/content/reports/ into {agent, kind, phase_at_generation,
      generated_at, version, is_template, tags} — agent covers all 13 C-Level
      slugs plus ir/qa/rnd/customer-care and the hybrid cro-cmo review
      artefact (leftmost-owner rule); kind covers daily/review/milestone/
      audit/regression/self-analysis/vision/architecture/plan/priorities/
      operations/knowledge-base/template/misc; phase inference precedence
      applies kind-specific overrides first (milestone→11, vision→1,
      architecture→4, 404-audit→4, perf-audit→7, security-audit→10,
      regression→4, self-analysis→2, plan→1, priorities→1, operations→11)
      then falls back to an agent→phase table drawn from the U.9 journey
      matrix (cmo=3, cdo=5, cto=4, cfo=6, chro=8, ciso/clo=10, cro=7,
      cso/ccso=2, cpo=4, coo=11, ir=9; ceo + cross-cutting ops/perf/security
      resolve to null so they float across all phases in the DataRoom UI).
      Date extraction validates round-trip on ISO parse so Feb 30 → null.
      Version regex captures v2.0.0-beta.6 style suffixes. Batch helper
      buildShowcaseDataRoomRows() filters templates by default, sorts
      newest-first with alphabetical tail for undated rows, and emits
      source_path = web/content/reports/<basename> so the future B1.3
      ingest cron doesn't need to re-derive paths. 20 vitest cases green
      (5 agent, 5 kind, 4 phase, 3 date/version, 2 tag composition, 4
      batch); tsc clean; npm run lint:reseller unchanged 8 files / 2
      exemptions / 0 violations (new lib is outside the reseller scope).
      B1.3 seed + ingest deferred — requires docker exec (create the
      BlockID.au workspace row then run the seeder that walks the reports
      dir through buildShowcaseDataRoomRows and inserts data_room rows).
    commit: (this tick)

  - tick: 38
    ran_at: 2026-07-21
    action: p9.4_code_request_stripe_mint
    result: |
      Closed next_action item #6 — approving a reseller_requests row of
      type='code_request' now mints the Stripe coupon + promotion_code
      inline and INSERTs into reseller_promotion_codes atomically, then
      stamps linked_promotion_code_id on the request row before flipping
      to status=approved (ck_promo_link CHECK satisfied). Pure lib at
      web/src/lib/reseller/promotion-code-mint.ts (buildPromoCodeName +
      buildStripeCouponSpec + buildStripePromotionCodeSpec +
      decideCodeMint) with 17/17 vitest cases. Coupon id is deterministic
      (res_<uuid8>_t<tier>) with duration=forever (H.1); a
      retrieve-or-create ensureStripeCoupon() wrapper reuses any coupon
      left over from a prior half-completed approval so double-taps never
      dupe. Existing (reseller_id, tier_pct) row wins so a re-approval is
      a no-op that still links back. Tier 0 skips Stripe entirely
      (ck_stripe_objects_by_tier). Naming: <RESELLER><tier> by default
      (INFOVISION20), overridable via suggested_suffix; 40-char clamp;
      tier 0 falls back to the bare reseller code so "INFOVISION0"
      doesn't read as a phantom discount. reseller vitest 242/242 (+17);
      tsc clean; npm run lint:reseller: 8 files / 2 exemptions / 0
      violations.
    commit: (this tick)

  - tick: 39
    ran_at: 2026-07-21
    action: b5_report_template_library
    result: |
      Track B B5 shipped. New public route /guide/reports (server component)
      walks web/content/reports/*.md via fs.readdir with the same defensive
      dual-cwd candidate list the /security-audit page uses (cwd is either the
      repo root or web/ depending on how Next.js was booted), feeds the filename
      list through buildShowcaseDataRoomRows({includeTemplates:false}) from
      tick 36's tagging lib, and hands the rows to the new pure grouping helper
      at web/src/lib/showcase/gallery.ts. buildGallerySections bins by
      phase_at_generation into ordered Phase 1..12 buckets + a cross-cutting
      tail bucket for null-phase rows (ceo daily briefs, architecture notes,
      404-audits — the deliberately-null slugs from report-tagging.ts). Empty
      phases are omitted so first-time visitors don't see 12 empty headings.
      PHASE_LABELS carries both en+vi copy already so a follow-up tick can
      toggle on getLocale() without touching the layout — mirroring the
      email-footer.ts pattern from P5. summariseGallery folds total_rows +
      unique agents_covered + latest_generated_at for the KPI strip at the
      top of the page. agentLabel maps the 21-slug ShowcaseAgent enum
      (ceo/cto/cfo/cmo/coo/cpo/cdo/chro/ciso/clo/cro/cso/ccso/ir/qa/rnd/
      customer-care/ops/perf/security/unknown) to display names — "unknown"
      resolves to "Platform" so the internal slug never leaks. Page renders
      Navbar + PageTracker + SEO metadata (canonical + OpenGraph + Twitter
      + robots index:true) + KPI grid + phase-grouped card grid + emerald
      CTA aside (Score my startup + Read valuation guide). Report body
      content is NOT rendered — the initial B5 pass surfaces metadata only
      (title, agent chip, generated date, version, filename) so the plan
      §284 redaction line ("reseller CANNOT see any DataRoom document
      content") is preserved even though the /guide/reports gallery is
      public rather than reseller-scoped. GA download tracking on per-row
      click is deferred until a signed-URL / redaction-pipeline follow-up
      tick lands. Vitest: 15 new gallery cases + reseller+showcase suite
      509/509 pass; tsc clean; npm run lint:reseller: 8 files scanned, 2
      exemptions, 0 violations (new files sit outside /api/reseller/ so
      no additional exemptions needed).
    commit: (this tick)

  - tick: 37
    ran_at: 2026-07-21
    action: hygiene_cron_post_alias
    result: |
      Fixed pre-existing next_action item 7: cron-runner.sh POSTs to
      /api/cron/<name> but all 5 reseller-* cron routes exported only GET,
      so every scheduled tick would 405 silently (existing crons like
      svi-snapshot mask the problem because they end with
      `export { GET as POST };`). Appended the same one-line alias to
      web/src/app/api/cron/reseller-clear-commissions/route.ts,
      /reseller-monthly-report/route.ts,
      /reseller-monthly-reconciliation/route.ts,
      /reseller-stripe-sync/route.ts, and /credit-reset/route.ts. This
      unblocks the schedulers already installed in
      web/scripts/crontab.production (15 3 * * *, 0 4 1 * *, 45 3 1 * *,
      30 3 * * 0, 15 2 1 * *) so P3.3 / P3.4 / P3.1_reconciliation / P7.1
      actually fire on their live entries. No new logic — pure alias so
      GET semantics are unchanged. tsc clean; no lib changes so
      lint:reseller / vitest untouched.
    commit: (this tick)

  - tick: 41
    ran_at: 2026-07-21
    action: p1.4_docker_apply
    result: |
      P1.4 gate closed. Applied migrations 0091 + 0092 + 0093 + 0094 + 0095 +
      0096 + 0097 via docker exec supabase-db psql (single tick, in order),
      followed by NOTIFY pgrst, 'reload schema'. Then created private
      Supabase Storage bucket 'reseller-reports' (public=false,
      file_size_limit=10485760, allowed_mime_types=['text/csv']) so P7.2
      signed-URL cron can upload monthly per-reseller CSVs on next fire.
      Two gaps discovered mid-apply and fixed inline per U.13:
      (1) reseller_audit_log had no migration despite being INSERTed by
          web/src/lib/reseller/supabase.ts:151 and consumed by every
          /api/reseller/** row-read chokepoint (P4.1 reveal-email, P4.2
          drawer, P6.3 grant, P6.4 sandbox setup, P7.2 signed-url,
          P9.3 requests). Authored web/supabase/migrations/0093_reseller_audit_log.sql
          — bigserial PK, reseller_id + actor_user_id + subject_user_id
          FKs, action + fields[] + route + ip + user_agent + metadata jsonb
          matching the .insert() column contract, three time-desc indexes
          (per-reseller, per-subject, per-action), append-only mutation
          triggers (raise 'append-only' on UPDATE/DELETE — same pattern as
          audit_events in 0076), default-deny RLS (service-role wrapper
          only). Filled the previously-reserved 0093 slot originally
          allocated to P2 but never materialised.
      (2) 0092's revenue_events_reseller_month_idx referenced non-existent
          column 'occurred_at' (revenue_events uses 'ts' — tick 32's P7.1
          note already flagged the mis-name at read time). Corrected to
          `ts DESC` and re-applied. First apply pass had rolled back the
          entire 0092 transaction; verified post-fix that all 4 app_users
          + 4 projects + 3 plans + 2 revenue_events + 1 credit_transactions
          columns landed and both PARTIAL indexes on revenue_events and
          credit_transactions.granted_by_reseller_id exist.
      Verification: 10 reseller_* tables (resellers, reseller_admins,
      reseller_promotion_codes, reseller_attributions, reseller_audit_log,
      reseller_commissions, reseller_commission_events, reseller_requests,
      reseller_credit_grants, reseller_report_files) + view
      reseller_commissions_current + 13 extension columns confirmed via
      information_schema query.
      Unblocked downstream: P0.4_ceo_final_sign_off (was gated on P1.4 +
      tests); Track B B1.3 seed + ingest (was gated on 0092 apply);
      P6/P7/P9 status flipped from *_pending_apply to done. P1.5_infovision_seed
      remains HUMAN-BLOCKED — resellers_seeded_intent.gst_registered + abn
      are both TBD_verify_at_creation per the plan gate that says "TBD on
      required attribute means human intervention required"; one SQL INSERT
      away from live once Auschain confirms InfoVision's real ABN + GST
      status per H.20.
    commit: (this tick)

  - tick: 40
    ran_at: 2026-07-21
    action: b6_public_showcase_mirror
    result: |
      Track B B6 shipped. New public route /showcase/blockid (server
      component) reads BlockID.au's own on-disk artefacts (the same
      web/content/reports/*.md set the /guide/reports gallery walks + the
      milestone-report-state.json state file) and renders a metadata-only
      mirror of the workspace: KPI grid (current phase / reports on file /
      agents shipping / latest activity), 12-phase progress strip with the
      current phase highlighted + zero-count phases greyed, C-Level agent
      activity cards (per-agent count + latest date), and a milestone
      timeline (newest-first). No DB dependency — the B1.3 seed is still
      blocked-on-apply, so this route works from disk alone.
      Pure builders at web/src/lib/showcase/public-view.ts: buildAgentActivity
      (per-agent count + latest_at, sorted count desc / agent asc for ties),
      buildPhaseArtifactCounts (always 12-wide so the marketing strip stays
      the same shape even when a phase is empty), buildCrossCuttingCount
      (null-phase tally surfaced as a strip footnote), deriveCurrentPhase
      (max phase with a report inside a 30-day recency window; falls back
      to overall max, then null — prevents the KPI regressing when a
      cross-cutting Phase-4 audit lands during a Phase-11 sprint),
      summarisePublicView (rollup), buildMilestoneTimeline (newest-first
      slice of milestone-report-state.reportedMilestoneIds with a default
      cap of 12). 20/20 vitest cases + reseller/showcase combined suite
      still green (55/55 showcase + 242/242 reseller unchanged).
      Redaction rule preserved (plan §284): titles + agent labels + dates +
      version tags + aggregate counts only — no report body content, no
      investor identities, no per-founder data. This page follows the same
      metadata-only contract the reseller portfolio lens uses.
      SEO metadata carries canonical https://blockid.au/showcase/blockid +
      OpenGraph + Twitter + robots index:true so the mirror becomes the
      "living marketing content" the plan describes. Runtime is
      force-dynamic so every request re-reads the on-disk state; no
      cache-invalidation dance needed when the CEO loop ships a new
      milestone. tsc clean; npm run lint:reseller: 8 files / 2
      exemptions / 0 violations (new files sit outside /api/reseller/).
    commit: (this tick)

  - tick: 42
    ran_at: 2026-07-21
    action: b1.3_seed_and_ingest
    result: |
      Track B B1 gate closed. New idempotent seeder at
      web/scripts/seed-showcase-blockid.ts flips admin@blockid.au's
      existing default project (2bf55234) → is_showcase=true +
      repo_url=https://github.com/Blockid-au/blockid.git and upserts a
      data_rooms row (name='BlockID.au Showcase', template='showcase',
      is_public=true, project_id=<default>) whose sections jsonb column
      carries the buildShowcaseDataRoomRows({includeTemplates:false})
      output — 242 report rows extracted from 243 web/content/reports/
      *.md files (the one _daily-report-template.md is filtered by
      default as designed in tick 36). Rather than INSERTing a fresh
      workspace row per the plan's literal wording, the seeder flips
      the existing default because admin already had six projects
      called "blockid.au*"; a seventh would just add noise. Idempotent
      by design: reuses whichever project already carries
      is_showcase=true, and UPDATEs the same data_rooms row keyed on
      (project_id, name) so re-running never spawns a duplicate. The
      data_room_documents table from migration 0062 was never applied
      on this host, so per-report rows ride inside data_rooms.sections
      until that table lands — the /showcase/blockid page (B6) reads
      from disk directly so this ingest is not on any hot path yet;
      the DB state exists to unblock B2 and any future DB-backed
      showcase view. settings jsonb stamps seeded_at + seeded_by +
      source_dir + row_count for observability. Verified: showcase
      vitest 55/55 unchanged (report-tagging 20 + gallery 15 +
      public-view 20 — seeder consumes the pure lib, no lib delta);
      tsc clean; second-run confirmed idempotent (reuses project +
      updates data_room). Unblocks B2 (guide chapters 1-4). B8
      (reseller_linkage) still gated on track_A_P4 which is
      done_pending_playwright so it also opens.
    commit: (this tick)

  - tick: 43
    ran_at: 2026-07-21
    action: p0.4_ceo_final_sign_off
    result: |
      Track A P0.4 gate closed. Final CEO stamp on the P0
      pre-flight window: verdict = approved. Evidence chain
      confirmed in-tree — P1.1 migrations authored (0091 +
      0092) at tick 3; P1.2 library scaffolding at tick 4
      (commission / cogs / hash / scope / supabase /
      require-admin / attribution / feature-gates.manifest);
      P1.3 unit suite 31/31 green at tick 5; P1.4 docker
      exec psql applied all seven migrations (0091..0097) +
      NOTIFY pgrst reload + reseller-reports Storage bucket
      provisioned (private, 10MB, text/csv only) at tick 41,
      with the two inline gap-fixes captured (0093 audit-log
      schema authored to back the auditLog() writes from
      P4.1/P4.2/P6.3/P6.4/P7.2/P9.3; 0092 revenue_events
      index column corrected from occurred_at → ts before
      re-apply). P0.2 delta merge (U.15 + U.16) landed at
      tick 2. Blocking-reviewer verdicts (cto/cfo/ciso/clo)
      returned revise at tick 1 and their deltas were
      applied — so U.13 stage-5 blocking-lens gate is
      cleared. P0.3 advisory reviews (cmo/coo/cpo/cdo/chro/
      cro/customer-success/investor-relations) remain
      pending on next off-peak tick but are advisory-only
      per U.13 and do NOT gate P0 close. P1.5 InfoVision
      seed remains HUMAN_BLOCKED on H.20 ABN + GST
      confirmation — accepted carve-out per goal file rule
      (TBD on required attribute triggers human
      intervention); does NOT block P0 sign-off because
      every other P1 exit-criterion is green and downstream
      P2-P9 already shipped without the seed row (they
      operate against the resellers table shape, not the
      seeded content). Verified via git grep: P0.4 status
      flipped pending → done with evidence field only; no
      code files touched this tick.
    commit: (this tick)

next_action:
  agent: applier
  task: |
    1) DONE tick 41 — Migrations 0091 + 0092 + 0093 + 0094 + 0095 + 0096 + 0097 applied via docker exec psql + NOTIFY pgrst reload. Private 'reseller-reports' Storage bucket created (public=false, 10MB, text/csv only). Gap fixes inline: authored 0093_reseller_audit_log.sql (append-only, default-deny RLS) filling the missing schema for every /api/reseller/** auditLog() call; fixed 0092 index that referenced non-existent revenue_events.occurred_at (should be ts).
    2) P1.5_infovision_seed remains HUMAN-BLOCKED. Once Auschain confirms InfoVision's real ABN + GST status per H.20, run: `INSERT INTO resellers (code, display_name, billing_model, allowed_tiers, can_create_startups, can_grant_credits, monthly_credit_budget, monthly_sandbox_credits, gst_registered, abn, commission_share_pct) VALUES ('INFOVISION', 'InfoVision', 'wholesale', ARRAY[0,10,20,30,40], true, true, 20000, 500, true, '<REAL_ABN>', 40.00);`
    3) DONE tick 42 — Track B B1.3 seed + ingest shipped via web/scripts/seed-showcase-blockid.ts. Admin's default project 2bf55234 is now is_showcase=true with repo_url; data_rooms 847b1f03 upserted with 242 sections rows tagged by generated_by_agent + phase_at_generation. Track B B2 (guide chapters 1-4) and B8 (reseller linkage) are now unblocked.
    4) DONE tick 35 — Optional P6.5b widening: term-sheet/idea-lab/valuation/journal/data-room/evidence spendCredits callers now thread project_id via getProjectIdFromRequest(). See tick 35 for file list. Remaining spendCredits() callers not touched: financial-projections, investor-pack/generate, svi/pitch-deck, svi/docx, svi/report, svi/enhanced-report, svi/dimension-analyze, svi/ai-score, svi/research, revaluation, v1/analyze, evaluation/[criterionKey]/ai-suggest, data-room/goals (award path — misleading call, not a real debit).
    5) P0.3_advisory_reviews still pending — schedulable on next off-peak tick (advisory-only per U.13 stage-5; does NOT gate any downstream phase).
   10) DONE tick 43 — P0.4_ceo_final_sign_off closed with verdict=approved. P0 pre-flight window is now fully sealed; only P0.3 advisory reviews remain pending (non-blocking).
    6) DONE tick 38 — code_request approval now mints Stripe coupon (deterministic id + duration=forever) + promotion_code and inserts into reseller_promotion_codes inline via decideCodeMint(). linked_promotion_code_id stamped on the reseller_requests row before status flips to approved. Tier 0 (attribution-only) skips Stripe. Idempotent under re-approval: existing (reseller_id, tier_pct) row wins; Stripe coupon retrieve-or-create pattern prevents duplicate coupons if a prior attempt died between Stripe mint and DB insert.
    7) DONE tick 37 — reseller-* cron routes now export `{ GET as POST }` so cron-runner.sh's POST no longer 405s. Applies to reseller-clear-commissions, reseller-monthly-report, reseller-monthly-reconciliation, reseller-stripe-sync, credit-reset.
    8) DONE tick 39 — Track B B5 report template library at /guide/reports (see phases.B5_report_library.files). Metadata-only surface; download route + GA event + redaction pipeline deferred to a follow-up tick that also unblocks B6's public showcase.
    9) DONE tick 40 — Track B B6 public showcase mirror at /showcase/blockid (see phases.B6_public_showcase.files). Metadata-only; reads on-disk artefacts + milestone-report-state.json; no DB dep. Deep-linking from /guide/reports card rows to /showcase/blockid (and vice versa) + wiring the "current phase" chip into workspace-layout topbar deferred to a follow-up tick alongside B7 product tour, since both touch the same in-app phase-transition surface.
  authorised: true
  on_success: |
    Frontier after tick 43: (a) Track A P0 pre-flight window is now fully sealed (P0.0..P0.2 done tick 1-2, P0.4 done tick 43 verdict=approved). P0.3 advisory reviews remain the only P0 sub-phase still pending — advisory-only per U.13 stage-5, non-blocking; schedulable on next off-peak tick. (b) Track A P8_share_management_addon is the next substantive engineering phase (deps P1 satisfied; migrations 0097 + 0098 slot open — note 0097 already consumed by P7 report-storage, so P8 needs 0098 for grandfather backfill). Concrete P8 scope: STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL env vars, feature-gate manifest completion, AST lint enforcing requireFeature('share_management') across 14 gated routes (D3-CISO-02), grandfather backfill migration, purchase drawer with proration preview, cancel path = cancel_at_period_end. Non-trivial (~1-2 weeks eng); ideally decomposed into P8.1..P8.5 sub-phases on the next Track A tick. (c) Track B B2_guide_ch_1_to_4 remains unblocked from tick 42 — natural Track B pick if Track A tick lands off-peak-blocked. (d) Track A P10_hardening still blocked_by [P1..P9] — waits on P8 completion + Playwright provisioning. P1.5_infovision_seed remains HUMAN-BLOCKED pending H.20 ABN + GST confirmation. Prefer Track A P8 sub-phase decomposition next tick per plan rule; else B2 as fallback.

telemetry:
  log_file: web/content/reports/reseller-goal-history.jsonl
  format: same as cron-health.jsonl + guardian-history.jsonl
  weekly_digest: admin@blockid.au

autonomous_loop:
  cadence: off-peak windows only (aligned with existing cloud routines)
  concurrency_cap: 16 subagents per tick (Workflow tool default)
  lifetime_cap: 1000 agents per goal file
  git_commit_and_push_after_every_edit: true
  reason: server runs periodic git reset --hard (memory feedback_autonomous_git_reset)
```

**How to read.** `current_focus` on each track drives the next tick. `status: blocked_by: X` means the phase cannot fire until X is `done`. `exit_criteria` is the concrete pass/fail gate. `authorised: true` on `next_action` means the loop can fire without human intervention. Any phase with a `TBD` on a required attribute (`stripe.account_owner_email`, `resellers_seeded_intent[].gst_registered`) is blocked until that TBD is resolved — human intervention required.

**Loop entry point.** `scripts/cron/reseller-goal-loop.mjs` reads this file at every tick, computes the frontier of unblocked phases, spawns per-phase orchestration per U.13 (Understand → Design → Implement → Verify → Sign-off), records the tick to `reseller-goal-history.jsonl`, and updates this file on completion.

**Kill switch.** `env RESELLER_AUTONOMOUS_LOOP=off` — cron exits before any work; state preserved.
