# Reseller Module — Machine-Readable Goal File (autonomous loop source of truth)

```yaml
goal_id: reseller-module-v1
status: in_progress
version: 2026-07-23.8
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
          P0.4_ceo_final_sign_off: {status: pending, note: "fire after P1.4 tests + docker exec apply"}
      P1_foundations:
        status: done_pending_apply
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
          P1.4_docker_apply: {status: pending, action: "docker exec psql -f 0091_*.sql + 0092_*.sql; NOTIFY pgrst, 'reload schema';"}
          P1.5_infovision_seed: {status: blocked_by: P1.4, action: "INSERT INTO resellers with billing_model=wholesale, gst_registered=true, abn (H.20 confirm)"}
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
        status: in_progress
        migration_files: [0096]
        tick_started: 25
        sub_phases:
          P6.1_migration_authored: {status: done, tick: 25, files: ["web/supabase/migrations/0096_reseller_credit_grants.sql"], note: "kind CHECK (grant|sandbox_spend) + ck_amount_sign + ck_month_key_format + ck_target_shape + ck_ct_link enforce the sign/shape invariants; unique idx on (reseller_id, target_user_id, credit_transaction_id) WHERE kind=grant dedupes customer mirror; (reseller_id, month_key) hot idx for budget rollup; (sandbox_project_id, created_at DESC) idx for 50/hr rate-limit scan"}
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
          P6.6_grant_modal: {status: pending, note: "/reseller/credits UI — grant form + over-budget approval flow + monthly usage bar"}
        exit_criteria: [
          "reseller_credit_grants live (DONE — 0096 authored; docker exec apply required)",
          "monthly_sandbox_credits column live (default 500) (DONE at 0091)",
          "/reseller/create-startup atomic transaction end-to-end",
          "grant modal enforces monthly_credit_budget with over-budget → admin-approval flow",
          "sandbox project auto-created on reseller org activation, invisible in Customers",
          "sandbox rate-limit 50 credits/hr enforced (D3-CISO-05) (DONE at lib level P6.2; still needs spendCredits wiring P6.5)"
        ]
      P7_kpi_reports:
        status: blocked_by: P3
        exit_criteria: [
          "monthly cron /api/cron/reseller-monthly-report generates CSV per reseller (KPI set from D2-CFO-07)",
          "signed-URL delivery 24h TTL (D4-CLO-07)",
          "12mo history retained; 24mo hard retention",
          "GST reconciliation delta <= A$1/month"
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
        status: partial
        tick: 19
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
          P9.3_requests_inbox: {status: pending, note: "code request + over-budget approval + collateral approval queue (D4-CLO-08); waits on request-table migration"}
        exit_criteria: [
          "/admin/resellers + /admin/resellers/[slug] mirror /admin/accelerator (DONE)",
          "requests inbox: code request, over-budget approval, marketing collateral approval (D4-CLO-08) — PENDING P9.3",
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
    current_focus: waiting_on_track_A_P1
    phases:
      B1_showcase_scaffold:
        status: blocked_by: track_A_P1
        migration_files: [0099]
        exit_criteria: [
          "projects.is_showcase column live",
          "projects.reseller_sandbox_id column live",
          "projects.repo_url column live",
          "BlockID.au workspace seeded",
          "auto-DataRoom wiring: web/content/reports/*.md tagged with generated_by_agent, phase_at_generation (redacted per D3-CISO-04)"
        ]
      B2_guide_ch_1_to_4: {status: pending, deps: [B1]}
      B3_guide_ch_5_to_8: {status: pending, deps: [B2]}
      B4_guide_ch_9_to_12: {status: pending, deps: [B3]}
      B5_report_library: {status: pending, deps: [B1]}
      B6_public_showcase: {status: pending, deps: [B1]}
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

next_action:
  agent: applier
  task: |
    1) Apply migrations 0091 + 0092 + 0094 + 0096 via docker exec psql (P1.4 + P6.1) — infra step, requires DB access.
    2) Seed INFOVISION reseller row (P1.5_infovision_seed) once P1.4 lands.
    3) P6.6 grant modal UI at /reseller/credits (grant form + over-budget approval flow + monthly usage bar) — final P6 sub-phase.
    4) Optional P6.5b widening: term-sheet/idea-lab/valuation/journal/data-room/evidence spendCredits callers — none of them currently resolve projectId, so wiring cost is one getProjectIdFromRequest() per route. Deferred until P6.6 lands.
    5) Track B B1_showcase_scaffold still unblocked; parallel candidate if a tick prefers track B ordering.
    6) P9.3_requests_inbox pending — waits on a request-table migration; feasible on next tick if we author 0095 alongside.
    7) P0.3_advisory_reviews still pending — schedulable on next off-peak tick.
  authorised: true
  on_success: continue P6 sub-phases (P6.6 grant modal is the last P6 gate) — track A P6 in_progress; keep momentum before switching to B1

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
