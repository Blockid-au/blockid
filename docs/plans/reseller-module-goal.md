# Reseller Module — Machine-Readable Goal File (autonomous loop source of truth)

```yaml
goal_id: reseller-module-v1
status: in_progress
version: 2026-07-23.1
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
        status: blocked_by: P1
        exit_criteria: [
          "PLAN_PROJECT_LIMITS in web/src/lib/projects.ts:32 replaced by plans.feature_flags.project_limit lookup",
          "regression tests pass"
        ]
      P2_redemption_attribution:
        status: in_progress
        migration_files: [0093]
        sub_phases:
          P2.1_via_capture_lib: {status: done, tick: 6, files: ["web/src/lib/reseller/attribution.ts + test 12/12"]}
          P2.2_validate_endpoint: {status: done, tick: 7, files: ["web/src/app/api/reseller/code/validate/route.ts"]}
          P2.3_svi_entrance_wire: {status: pending, note: "extend web/src/components/svi/svi-entrance.tsx:213 pattern to also read ?via="}
          P2.4_onboarding_step: {status: pending, note: "extend web/src/app/onboarding/onboarding-wizard.tsx:50 to accept via; add StepTier collapsed reseller-code field"}
          P2.5_auth_consumers: {status: pending, note: "wire login-form.tsx:167, google/route.ts:114, auth.ts:517/642 to persist attribution on account create"}
          P2.6_checkout_stamp: {status: pending, note: "extend web/src/app/api/stripe/checkout/route.ts to stamp client_reference_id + subscription.metadata + customer.metadata; apply promotion_code if tier>0"}
          P2.7_consent_modal: {status: pending, note: "render E.1 collection notice EN+VI when valid code applied"}
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
        status: blocked_by: P3
        exit_criteria: [
          "weekly reseller-stripe-sync cron verifies promotion_codes active",
          "monthly reconciliation CSV export"
        ]
      P4_reseller_console:
        status: blocked_by: P3
        migration_files: [0095]
        exit_criteria: [
          "/reseller/{dashboard,customers,codes,credits,create-startup,reports,settings} live",
          "scopedReseller(user) typed helper enforces boundary (D3-CISO-01)",
          "reseller_audit_log writes on every row read",
          "3-tab customer drawer: Overview + Progression + Reports (U.7)",
          "k>=5 anonymity + weekly timestamp quantisation on aggregate counters (D3-CISO-03)",
          "Playwright: reseller cannot fetch /api/svi/*, /api/dataroom/*, /api/cap-table/* for attributed customer → 403"
        ]
      P5_cobranding:
        status: blocked_by: P1
        exit_criteria: [
          "topbar pill at workspace-layout.tsx:287 renders when useResellerAttribution() returns value",
          "welcome + receipt email footer includes reseller name (locale-switched)",
          "Stripe invoice memo carries reseller name via custom_fields",
          "attributed workspace + non-attributed workspace Playwright: pill vs no-pill"
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
        status: blocked_by: P4
        exit_criteria: [
          "/admin/resellers + /admin/resellers/[slug] mirror /admin/accelerator",
          "requests inbox: code request, over-budget approval, marketing collateral approval (D4-CLO-08)",
          "seed InfoVision row when admin creates first reseller"
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
    commit: (pending batch B)

next_action:
  agent: applier
  task: |
    1) Apply migrations 0091 + 0092 via docker exec psql (P1.4).
    2) Fire tick 8: 4 blocking reviewers re-verify against amended plan + 8 advisory in parallel.
    3) On approved: seed INFOVISION row (P1.5), then advance to P2.3 svi-entrance ?via= wiring.
    4) P2.3-P2.7 remain: onboarding StepTier extension, auth consumer wiring, checkout stamping, consent modal.
  authorised: true
  on_success: continue to P2 completion + P3 ledger webhooks

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
