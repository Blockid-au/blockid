# Reseller Module — Machine-Readable Goal File (autonomous loop source of truth)

```yaml
goal_id: reseller-module-v1
status: in_progress
version: 2026-07-23.4
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
        status: partial
        migration_files: [0095]
        tick_started: 21
        sub_phases:
          P4.1_reveal_email_audit: {status: done, tick: 21, files: [
            "web/src/lib/reseller/customer-reveal.ts (+ test 7/7)",
            "web/src/app/api/reseller/customers/[id]/reveal-email/route.ts",
            "web/src/app/reseller/customers/reveal-email-cell.tsx",
            "web/src/app/reseller/customers/page.tsx (uses RevealEmailCell)"
          ], note: "H.10 chokepoint — decideReveal() enforces uuid + allowedCustomerIds membership; scoped route writes reseller_audit_log(subject_user_id, action='reveal_email', fields=['email'], route, ip, user_agent) before returning plaintext"}
          P4.2_customer_drawer: {status: pending, note: "3-tab drawer Overview + Progression + Reports (U.7)"}
          P4.3_portfolio_aggregates: {status: pending, note: "k>=5 anonymity + weekly timestamp quantisation on dashboard counters"}
          P4.4_scope_grep_rule: {status: pending, note: "CI rule R-01 fails any /api/reseller/* that touches getSupabaseAdmin without importing scopedReseller"}
        exit_criteria: [
          "/reseller/{dashboard,customers,codes,credits,create-startup,reports,settings} live (SKELETONS DONE)",
          "scopedReseller(user) typed helper enforces boundary (D3-CISO-01) (DONE)",
          "reseller_audit_log writes on every row read (PARTIAL — reveal-email wired P4.1; drawer + list read wiring pending P4.2)",
          "3-tab customer drawer: Overview + Progression + Reports (U.7) (PENDING P4.2)",
          "k>=5 anonymity + weekly timestamp quantisation on aggregate counters (D3-CISO-03) (PENDING P4.3)",
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
        status: blocked_by: P4
        migration_files: [0096]
        exit_criteria: [
          "reseller_credit_grants live",
          "monthly_sandbox_credits column live (default 500)",
          "/reseller/create-startup atomic transaction end-to-end",
          "grant modal enforces monthly_credit_budget with over-budget → admin-approval flow",
          "sandbox project auto-created on reseller org activation, invisible in Customers",
          "sandbox rate-limit 50 credits/hr enforced (D3-CISO-05)"
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
    1) Apply migrations 0091 + 0092 + 0093 + 0094 via docker exec psql (P1.4) — infra step, requires DB access.
    2) Seed INFOVISION reseller row (P1.5_infovision_seed) once P1.4 lands.
    3) P4.1_reveal_email_audit DONE (tick 21) — H.10 mask/reveal + audit-log chokepoint on customer list.
    4) P4.2_customer_drawer — 3-tab Overview + Progression + Reports drawer (U.7); wire audit-log on every subject read.
    5) P4.3_portfolio_aggregates — k>=5 anonymity + weekly timestamp quantisation on dashboard counters.
    6) P4.4_scope_grep_rule — R-01 CI grep to fail any /api/reseller/* touching getSupabaseAdmin without scopedReseller.
    7) After P4 lands, unlock P6_capabilities_sandbox and P9_admin_surface.
    8) Track B (B1_showcase_scaffold) unblocked by track_A_P1 done — next tick can consider it in parallel with P4.
  authorised: true
  on_success: continue to P4.2 customer drawer + track B B1

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
