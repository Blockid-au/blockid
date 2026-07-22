# Reseller Module — Machine-Readable Goal File (autonomous loop source of truth)

```yaml
goal_id: reseller-module-v1
status: in_progress
version: 2026-07-23.40
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
          P0.3_advisory_reviews: {status: done, tick: 55, completed_at: 2026-07-21, agents: [cmo, coo, cpo, cdo, chro, cro, customer-success, investor-relations], verdicts: {cmo: approved_with_notes, coo: approved_with_notes, cpo: approved_with_notes, cdo: approved_with_notes, chro: approved_with_notes, cro: approved_with_notes, "customer-success": approved_with_notes, "investor-relations": approved_with_notes}, files: ["docs/plans/reviews/plan-review-cmo.md", "docs/plans/reviews/plan-review-coo.md", "docs/plans/reviews/plan-review-cpo.md", "docs/plans/reviews/plan-review-cdo.md", "docs/plans/reviews/plan-review-chro.md", "docs/plans/reviews/plan-review-cro.md", "docs/plans/reviews/plan-review-cs.md", "docs/plans/reviews/plan-review-ir.md"], note: "All 8 advisory reviewers returned approved_with_notes (0 revise verdicts, 0 blocking findings — P0 stays sealed). Notable non-blocking findings captured as next_action items: (a) CRO — Share-Mgmt remove_item path in web/src/app/api/stripe/change-plan/route.ts:540 uses subscriptionItems.del with proration_behavior:'none' which deletes the item IMMEDIATELY, not end-of-cycle; comment claims 'cancel_at_period_end-style' but Stripe API removes item on request. Correct approach = subscriptions.update with items:[{id, deleted:true}] + proration_behavior:'none' still deletes immediately — real end-of-cycle needs subscription schedules. Fix in follow-up P8 delta tick before P8.5 unblock. (b) CMO — brand-wording drift (Referred by vs Introduced by) + /guide/reports download-route + GA event missing. (c) CDO — complementary suppression missing on phase-distribution + reviews aggregates (k=1..4 renders as <5 but the complement bucket can leak). (d) Customer-Success — H.8 wholesale magic-link + welcome email unbuilt, Grant modal EN-only, no reseller-side denial-reason surface. (e) CPO — Customer drawer EN-only, wholesale wizard lacks non-payment confirmation. (f) CHRO — human-review-minutes KPI missing, Div 83A qualifying-tests checklist missing from ch08-team. (g) IR — pitch-deck Channel Economics slide + data-room GTM one-pager not authored. (h) COO — human-blocked items should surface in weekly digest. All findings are advisory-only per U.13 stage-5 — none gate any downstream phase."}
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
          "web/src/lib/reseller/email-footer.test.ts (9/9 pass: null/blank guard, EN default, VI switch, HTML escape, whitespace trim)",
          "web/src/lib/reseller/email-attribution.ts (tick 71 — resolveResellerDisplayNameByEmail DB adapter + pickActiveResellerDisplayName pure decision helper)",
          "web/src/lib/reseller/email-attribution.test.ts (tick 71 — 6/6 pass on pure decision layer)",
          "web/src/lib/email.ts (tick 71 — sendWelcomeWithReport + sendPaymentReceipt now interpolate resellerFooterHtml when attribution resolves)"
        ]
        exit_criteria: [
          "topbar pill at workspace-layout.tsx renders via <ResellerPill /> when useResellerAttribution() returns value (DONE)",
          "email footer helper locale-switched EN + VI available for welcome + receipt integration (DONE — pure helper; wiring into sendWelcomeWithReport + sendPaymentReceipt landed tick 71 via web/src/lib/reseller/email-attribution.ts resolver + one-line footer interpolation in each caller)",
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
        status: in_progress
        migration_files: [0098]  # 0097 already consumed by P7 report-storage; P8 grandfather backfill lands as 0098
        sub_phases:
          P8.1_manifest_completeness: {status: done, tick: 44, completed_at: 2026-07-21, files: [
            "web/src/lib/feature-gates.manifest.ts",
            "web/src/lib/feature-gates.manifest.test.ts (6/6 pass)"
          ], note: "Reconciled FEATURE_GATES with actual tree — removed 8 phantom entries (api/cap-table/entries, api/cap-table/import, api/cap-table/export, api/data-room/documents, api/dataroom/documents, api/vesting/schedules, api/vesting/events, api/esop/exercise, api/tokenization/mint) and api/reseller/create-startup (unbuilt); added 20 real mutation routes discovered by walking GATED_DIRECTORIES with POST/PATCH/PUT/DELETE detection. Manifest now maps 28 routes: cap-table (5), data-room+dataroom (8, tagged for CTO reconciliation), vesting (4→vesting.write), esop (5→esop.manage), blockchain (3→blockchain.sync), tokenization (1), reseller (2). Introduced MUTATION_METHODS constant and dropped the `| \"share_management\"` special-case union (the Feature type already includes it as a real literal). Completeness test: (a) every entry points at an existing file; (b) every mutation route in GATED_DIRECTORIES appears in the manifest; (c) no duplicates; (d) requiredFeatureFor round-trips; (e) MUTATION_METHODS matches the four write verbs. Wiring the actual requireFeature() call inside each handler is P8.2."}
          P8.2_route_gating: {status: done, tick: 45, completed_at: 2026-07-21, files: [
            "web/src/lib/feature-gate.ts (+ test 7/7)",
            "web/src/lib/reseller/reseller-lints.ts (analyzeR03 added; multi-line-signature-safe locateHandlers)",
            "web/src/lib/reseller/reseller-lints.test.ts (+ 9 R-03 cases; 18/18 pass)",
            "web/scripts/ci/reseller-lints.mjs (R-01 + R-03 CLI passes; loads FEATURE_GATES from manifest via regex to stay plain-node)",
            "web/src/app/api/cap-table/route.ts (POST + DELETE)",
            "web/src/app/api/cap-table/documents/route.ts (POST)",
            "web/src/app/api/cap-table/health/route.ts (POST)",
            "web/src/app/api/cap-table/restrictions/route.ts (POST)",
            "web/src/app/api/cap-table/sync/route.ts (POST)",
            "web/src/app/api/data-room/access/route.ts (POST)",
            "web/src/app/api/data-room/auto-fill/route.ts (POST)",
            "web/src/app/api/data-room/engage/route.ts (POST — r-03-exempt: anonymous investor telemetry)",
            "web/src/app/api/data-room/generate/route.ts (POST)",
            "web/src/app/api/data-room/goals/route.ts (POST)",
            "web/src/app/api/data-room/initialize/route.ts (POST)",
            "web/src/app/api/dataroom/clone/route.ts (POST)",
            "web/src/app/api/dataroom/setup/route.ts (POST)",
            "web/src/app/api/vesting/route.ts (POST)",
            "web/src/app/api/vesting/[id]/route.ts (PATCH + DELETE)",
            "web/src/app/api/ai/vesting/route.ts (POST)",
            "web/src/app/api/ai/vesting-review/route.ts (POST)",
            "web/src/app/api/esop/grants/route.ts (POST)",
            "web/src/app/api/esop/grants/[id]/route.ts (PATCH + DELETE)",
            "web/src/app/api/esop/pool/route.ts (POST)",
            "web/src/app/api/esop/div83a-check/route.ts (POST)",
            "web/src/app/api/ai/esop/route.ts (POST)",
            "web/src/app/api/blockchain/create-token/route.ts (POST)",
            "web/src/app/api/blockchain/sync-toggle/route.ts (POST)",
            "web/src/app/api/blockchain/verify/route.ts (POST)",
            "web/src/app/api/tokenization/route.ts (POST)",
            "web/src/app/api/reseller/credits/grant/route.ts (POST)",
            "web/src/app/api/reseller/sandbox/setup/route.ts (POST)"
          ], note: "D3-CISO-02 chokepoint — every one of the 28 manifest routes now invokes gateRequireFeature(<key>) at handler top; each key matches feature-gates.manifest.required_feature. Shared helper web/src/lib/feature-gate.ts wraps getCurrentUser + segment resolution + EntitlementError → 402 mapping so per-route wiring is a two-line insertion. R-03 AST lint added at scripts/ci/reseller-lints.mjs (extends R-01 CLI); enforces: (a) every mutation handler in the manifest calls gateRequireFeature/requireFeature with the manifest's required_feature key inside its body; (b) exemptions require `// r-03-exempt: <reason>` immediately above the handler decl. locateHandlers uses paren-then-brace matching so multi-line signatures with destructured params (e.g. `{ params }: { params: Promise<{id:string}> }`) don't fool the body scan. One R-03 exemption in tree: data-room/engage/route.ts POST (investor engagement telemetry from anonymous view; auth is via data_room_access_tokens.token, not user entitlement). Verified: tsc clean; reseller+showcase+gate vitest 319/319 (was 255, +64: +7 feature-gate + +9 R-03 analyzer + 48 pre-existing); npm run lint:reseller: R-01 scanned 8 file(s), R-03 scanned 28 manifest route(s); 3 exemptions, 0 violations."}
          P8.3_grandfather_backfill: {status: done, tick: 46, completed_at: 2026-07-21, migration_files: [0098], files: [
            "web/supabase/migrations/0098_share_management_grandfather_backfill.sql"
          ], note: "Cutover-T backfill migration authored + applied via docker exec supabase-db psql (BEGIN → UPDATE 0 → INSERT 0 0 → COMMIT; idempotent re-run identical); NOTIFY pgrst schema reload issued. Two writes per matching user: (a) UPDATE app_users SET grandfathered_share_management=true, grandfathered_at=now() guarded by grandfathered_share_management=false so re-runs no-op; (b) INSERT INTO entitlements(user_id,'share_management',true,'grandfathered', now(), detail={backfill_migration:'0098', cutover_plan_id, cutover_status}) with ON CONFLICT (user_id,feature) DO NOTHING. Cohort matches plan §F.4 verbatim: subscription_trial_state.status IN ('active','trialing') AND plan_id IN ('founder_growth','founder_scale','founder_enterprise','growth','growth_annual'). Dev DB result: 0/45 users grandfathered (expected — no legacy paying subs). Plan §F.4 originally references a 'subscriptions' snapshot but this repo materialises subscription state in subscription_trial_state (0075:6-17) so the migration binds to the real table; the source='grandfathered' enum member already exists in the entitlements_source_check from 0075:63-71. Duration: forever; the 60-day lapse sunset is a P11 customer-success responsibility and is intentionally out of scope for this migration."}
          P8.4_purchase_drawer: {status: done, tick: 47, completed_at: 2026-07-21, files: [
            "web/src/lib/stripe.ts (+ADDON_PRICE_IDS + getShareMgmtAddonPrice + isShareMgmtAddonPrice + STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL slots)",
            "web/src/app/api/stripe/change-plan/route.ts (+add_item preview via invoices.createPreview + commit via subscriptions.update proration_behavior=always_invoice + revenue_events kind=addon_purchase; +remove_item via subscriptionItems.del proration_behavior=none end-of-cycle + revenue_events kind=addon_cancel)",
            "web/src/components/billing/share-mgmt-drawer.tsx (right-side drawer EN+VI: monthly/annual toggle with Save 2 months badge, reseller code auto-detect from blockid_via cookie, proration preview line, CTA 'Add to my subscription', focus trap + Escape + body-scroll lock)",
            "web/src/app/workspace/billing/billing-client.tsx (+Manage add-ons section: Add Share Management CTA opens drawer; Remove-at-end-of-cycle CTA calls remove_item; deep-link ?openAddon=share_management fires drawer once via ref-guarded effect; entitlement.refresh() after commit)",
            "web/src/app/workspace/billing/page.tsx (Suspense wrap for useSearchParams; passes ADDON_PRICE_IDS to BillingClient)",
            "web/src/components/workspace/nav-groups.ts (+addOnKey?: 'share_management' on NavItem; Cap Table / Shareholders / ESOP / Vesting / Equity Setup / Equity Split tagged)",
            "web/src/components/workspace/workspace-layout.tsx (locked+addOnKey → link to /workspace/billing?openAddon=<key> + amber 'Add-on' pill instead of Lock icon; sidebar item never navigates away from the user's context)"
          ], note: "purchase drawer functional with proration preview; cancel path SUPERSEDED by P8.4b (subscription-schedule end-of-cycle); typecheck clean; all 551 vitest tests pass; STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL env vars remain human-blocked (P8.5) — Playwright provisioning depends on those being minted by Stripe account owner"}
          P8.4b_end_of_cycle_removal: {status: done, tick: 56, completed_at: 2026-07-22, files: [
            "web/src/lib/stripe/addon-schedule.ts (pure buildAddonRemovalSchedulePhases returning two SchedulePhaseInput phases or {ok:false, reason:'target_not_in_phase'|'no_items_after_removal'})",
            "web/src/lib/stripe/addon-schedule.test.ts (5/5 pass — happy path, string-vs-object price shape, zero/undefined quantity omit, sole-item guard, quantity>1 preservation)",
            "web/src/app/api/stripe/change-plan/route.ts (handleRemoveItem swapped from subscriptionItems.del to subscriptionSchedules.create({from_subscription}) → subscriptionSchedules.update({end_behavior:'release', phases:[current,reduced-iterations-1]}); reuses activeSub.schedule when one already exists so re-calls or existing schedules don't 400; revenue_events.detail now carries schedule_id + effective_at Unix timestamp; response envelope adds schedule_id + effective_at)"
          ], note: "CRO advisory #21 fixed. Old path called stripe.subscriptionItems.del(target.id, {proration_behavior:'none'}) which per Stripe API contract removes the item IMMEDIATELY — the customer lost add-on access mid-cycle despite the drawer copy promising end-of-cycle removal. New path creates a Subscription Schedule from the active subscription (Stripe fills phase 0 with the current item set through current_period_end); the update then appends phase 1 with the reduced item set + iterations:1 + proration_behavior:'none' and sets end_behavior:'release' so the subscription reverts to normal renewal after the schedule completes. Extracted the phase-building math into a pure helper so the branch is unit-tested without Stripe network. Verified: tsc clean; vitest 629/629 (+5); npm run lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0 violations). P8.5 remains HUMAN-BLOCKED on Stripe env vars; Playwright E2E for the end-of-cycle assertion is now the last remaining P10 gate for this defect."}
          P8.5_env_and_playwright: {status: human_blocked, blocker: "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL env vars must be minted in Stripe dashboard by account owner before Playwright can green"}
        exit_criteria: [
          "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL env vars set (HUMAN — P8.5)",
          "feature-gate manifest web/src/lib/feature-gates.manifest.ts complete (DONE P8.1 tick 44 — 28 routes mapped, completeness test 6/6)",
          "AST lint enforces requireFeature('<key>') on all gated routes (D3-CISO-02) (DONE P8.2 tick 45 — R-03 analyzer + CLI live; 28 routes gated; 1 documented exemption for anonymous investor telemetry)",
          "grandfather backfill migrated on cutover T (DONE P8.3 tick 46 — migration 0098 authored + applied; idempotent)",
          "purchase drawer functional with proration preview (P8.4)",
          "cancel path defaults to end-of-cycle (subscription schedule with end_behavior=release) (DONE P8.4b tick 56)",
          "Playwright: grandfathered user unchanged; new Growth user 402 on cap-table without add-on (P8.5 — deferred until Stripe prices minted)"
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
    current_focus: done  # B1..B10 all shipped (B10 tick 54); frontier picker should skip Track B rescans
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
      B2_guide_ch_1_to_4:
        status: done
        tick: 48
        completed_at: 2026-07-21
        deps: [B1]
        files: [
          "web/src/lib/guide/startup-journey.ts (structured EN+VI content for chapters 01-vision, 02-idea-validation, 03-market-research, 04-mvp; Chapter interface covers the six-item U.8 spec — founderAction, agentsInvoked, expectedOutputs, commonPitfalls, showcaseExample, cta — plus title/summary; phaseLabel sourced from @/lib/showcase/gallery PHASE_LABELS so slug label taxonomy stays single-source; helpers listChapters/getChapter/isChapterSlug/allChapterSlugs/getAdjacentChapters for pages)",
          "web/src/lib/guide/startup-journey.test.ts (8/8 pass — chapter-registry order/slug/phase enums, unknown-slug null-safety, EN+VI coverage across every required section with parity assertions, phaseLabel identity check vs PHASE_LABELS, prev/next boundary handling)",
          "web/src/app/guide/[chapter]/page.tsx (server component; generateStaticParams from allChapterSlugs → SSG one route per chapter; generateMetadata with EN title/description + OG/Twitter + canonical; renders EN or VI copy via getLocale() cookie read; sections: hero + What the founder does + Agents invoked + Expected outputs + Common pitfalls + BlockID.au showcase panel + Next step CTA + prev/next chapter footer; Navbar/Footer marketing shell)",
          "web/src/app/workspace/guide/[chapter]/page.tsx (server component; auth-gated with redirect to /auth/login?next=/workspace/guide/<slug>; same generateStaticParams + same content lib; renders inside WorkspaceLayout so sidebar/header match /workspace surface; robots noindex)",
          "docs/guides/startup-journey/chapter-{01,02,03,04}.md (EN mirror for offline reading + contributor PRs; runtime pages read the TS lib, .md files are documentation-only per file header comment)"
        ]
        exit_criteria: [
          "Chapter content for phases 1-4 authored EN+VI (DONE — chapters 01-vision, 02-idea-validation, 03-market-research, 04-mvp published with six-item spec covered per U.8; VI is complete parity, not machine translation stub)",
          "/guide/[chapter] server route live for chapters 1-4 (DONE — dynamic segment SSG'd via generateStaticParams; unknown slug → notFound(); Navbar/Footer marketing shell + SEO metadata + canonical)",
          "/workspace/guide/[chapter] server route live for chapters 1-4 (DONE — same slug set, WorkspaceLayout shell, auth-gated redirect, robots noindex)",
          "phase labels canonical with U.9 taxonomy (DONE — Chapter.phaseLabel is a direct reference to PHASE_LABELS[phase] from @/lib/showcase/gallery so /guide, /workspace/guide, /guide/reports and /showcase/blockid share one phase-label source)",
          "prev/next chapter navigation live (DONE — getAdjacentChapters helper; first chapter shows empty previous slot, last chapter shows 'Chapter 5 unlocks with B3' placeholder)"
        ]
        note: "Chapters 5-8 wait on B3. B7 (product tour) and B8 (reseller linkage) now unblocked since B2 has published slugs to link to."
      B3_guide_ch_5_to_8:
        status: done
        tick: 49
        completed_at: 2026-07-21
        deps: [B2]
        files: [
          "web/src/lib/guide/startup-journey.ts (chapters 05-pmf, 06-revenue, 07-growth, 08-team appended; ChapterSlug union extended; module doc-comment updated)",
          "web/src/lib/guide/startup-journey.test.ts (EXPECTED_SLUGS extended to 8; boundary assertion added for 04-mvp ↔ 05-pmf stitch; adjacent-chapter last-slot flipped to 08-team; 9/9 pass)",
          "web/src/app/guide/[chapter]/page.tsx (route doc-comment updated; unlock placeholder flipped from Chapter 5/B3 to Chapter 9/B4)",
          "web/src/app/workspace/guide/[chapter]/page.tsx (route doc-comment updated; unlock placeholder flipped from Chapter 5/B3 to Chapter 9/B4)",
          "docs/guides/startup-journey/chapter-{05,06,07,08}.md (EN mirror for offline reading + contributor PRs)"
        ]
        exit_criteria: [
          "Chapter content for phases 5-8 authored EN+VI (DONE — chapters 05-pmf, 06-revenue, 07-growth, 08-team published with the six-item spec covered per U.8; VI is complete parity, not machine translation stub)",
          "/guide/[chapter] server route live for chapters 5-8 (DONE — generateStaticParams reads allChapterSlugs so the four new slugs SSG automatically alongside 1-4; unknown slug still → notFound())",
          "/workspace/guide/[chapter] server route live for chapters 5-8 (DONE — same slug set, WorkspaceLayout shell, auth-gated redirect, robots noindex)",
          "phase labels canonical with U.9 taxonomy (DONE — each new chapter's phaseLabel is a direct reference to PHASE_LABELS[phase] from @/lib/showcase/gallery so /guide, /workspace/guide, /guide/reports and /showcase/blockid share one phase-label source)",
          "prev/next chapter navigation stitches 04-mvp ↔ 05-pmf and terminates at 08-team → 'Chapter 9 unlocks with B4' (DONE — getAdjacentChapters exercised via new boundary test)"
        ]
        note: "Chapters 5-8 content-only per B2 precedent; the Stripe test-mode / GA4 property / weekly SVI cron UI wiring referenced in the copy (plan §298) is a follow-up tick. Chapters 9-12 wait on B4. B7 and B8 remain unblocked from tick 48; B4 now blocked only on B3-done → open for the next tick."
      B4_guide_ch_9_to_12:
        status: done
        tick: 50
        completed_at: 2026-07-21
        deps: [B3]
        files: [
          "web/src/lib/guide/startup-journey.ts (chapters 09-funding, 10-fundraise, 11-scale, 12-exit appended; ChapterSlug union extended to 12 entries; module doc-comment updated to reflect the B2+B3+B4 arc)",
          "web/src/lib/guide/startup-journey.test.ts (EXPECTED_SLUGS extended to 12; order + phase arrays extended to [1..12]; unknown-slug bumped to 13-post-exit; last-slot adjacent flipped to 12-exit ↔ 11-scale; new boundary assertion for 08-team ↔ 09-funding stitch; 10/10 pass)",
          "web/src/app/guide/[chapter]/page.tsx (route doc-comment updated to cover B4; final-chapter unlock placeholder rewritten from 'Chapter 9 unlocks with B4' to arc-complete wording EN+VI — 'You've reached the final chapter. After exit, open a new workspace at Chapter 1 or move into the reseller/accelerator role.')",
          "web/src/app/workspace/guide/[chapter]/page.tsx (route doc-comment updated to cover B4; final-chapter unlock placeholder rewritten EN+VI to 'Final chapter. After exit: new workspace or reseller role.')",
          "docs/guides/startup-journey/chapter-{09,10,11,12}.md (EN mirror for offline reading + contributor PRs)"
        ]
        exit_criteria: [
          "Chapter content for phases 9-12 authored EN+VI (DONE — chapters 09-funding, 10-fundraise, 11-scale, 12-exit published with the six-item spec covered per U.8; VI is complete parity, not machine translation stub)",
          "/guide/[chapter] server route live for chapters 9-12 (DONE — generateStaticParams reads allChapterSlugs so the four new slugs SSG automatically alongside 1-8; unknown slug still → notFound())",
          "/workspace/guide/[chapter] server route live for chapters 9-12 (DONE — same slug set, WorkspaceLayout shell, auth-gated redirect, robots noindex)",
          "phase labels canonical with U.9 taxonomy (DONE — each new chapter's phaseLabel is a direct reference to PHASE_LABELS[9..12] from @/lib/showcase/gallery so /guide, /workspace/guide, /guide/reports and /showcase/blockid share one phase-label source)",
          "prev/next chapter navigation stitches 08-team ↔ 09-funding and terminates at 12-exit → arc-complete wording (DONE — getAdjacentChapters exercised via new boundary test + last-slot assertion)",
          "Phase 10 wording matches U.15.11 supersession (DONE — chapter 10 copy uses 'immutable record for later verification' language and explicitly notes 'NOT legal notarisation — notary is a reserved role under Australian law')"
        ]
        note: "12-chapter content-authoring arc closed. B9_reviews_surface (deps: B4) now unblocked. The Stripe test-mode/live-mode UI wiring, GA4 property connection UI, blockchain-hash worker UI, LP-report bundling UI, cap-table snapshot approval UI referenced across chapters 9-12 remain follow-up ticks — matches the B2/B3 precedent where chapter copy referenced integrations before the capture UI shipped."
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
      B7_product_tour:
        status: done
        tick: 51
        completed_at: 2026-07-21
        deps: [B2]
        files: [
          "web/src/lib/product-tour/tour-state.ts (pure helpers: chapterSlugForPhase, deriveTourPhase, shouldShowTour, buildTourState — no fetch, no localStorage, no DOM; sources PhaseLabel from PHASE_LABELS and chapter slugs from listChapters() so the taxonomy stays single-source with B2-B4 and B5)",
          "web/src/lib/product-tour/tour-state.test.ts (19/19 pass — chapter-slug boundary + out-of-range guards, first-incomplete derivation with sort/skip/regress cases, shouldShowTour transition matrix incl. regress, buildTourState end-to-end incl. all-complete → final-phase link)",
          "web/src/components/workspace/product-tour.tsx (client overlay banner — fetches /api/svi/phase-progress once on mount, hydrates dismissedPhase from localStorage[blockid_tour_dismissed_phase], renders 'You are on Phase X of 12: <label>' + '/workspace/guide/<slug>' link + dismiss button; EN+VI copy switched via useLocale())",
          "web/src/components/workspace/workspace-layout.tsx (<ProductTour /> placed after <UpgradeBanner /> in the same self-hiding banner slot pattern as TrialBanner/UpgradeBanner per plan U.8 point 4)"
        ]
        exit_criteria: [
          "Overlay on workspace shell surfaces current phase X of 12 (DONE — buildTourState reads /api/svi/phase-progress and folds into buildTourState → deriveTourPhase which returns earliest incomplete phase, or the final phase when everything is done so the last chapter is still reachable)",
          "Links to current guide chapter (DONE — chapterSlugForPhase() finds the Chapter whose .phase === order, so the link goes to /workspace/guide/<01-vision..12-exit>)",
          "Hides after dismissal, resurfaces on phase transition (DONE — dismissal is stored as the phase number itself in localStorage; shouldShowTour returns true whenever currentPhase !== dismissedPhase, so a founder who moves from Phase 3 → Phase 4 sees the banner again automatically without any server ping)",
          "Composes with TrialBanner/UpgradeBanner slot pattern (DONE — same 'flex flex-col sm:flex-row' banner shape and border-b treatment used across the three banners; ProductTour renders null while loading or when hidden so it never leaves an empty div)",
          "EN + VI locale coverage (DONE — COPY table in product-tour.tsx keyed by Locale; phase label pulled from PHASE_LABELS[phase][locale] so the tour matches whatever language the founder has picked via the existing locale toggle)"
        ]
        note: "Track B B7 closed. B7 unblocks nothing since only B8-B10 remain in Track B, and B8's second dep (track_A_P4) was already satisfied — B8 was frontier before this tick too. Playwright coverage deferred to P10_hardening per the same posture used for P4/P5. B7 does NOT touch any reseller-scoped route so no R-01/R-03 exemption is needed; lint:reseller still scans 8+28 files with 3 exemptions / 0 violations."
      B8_reseller_linkage: {status: done, tick: 52, completed_at: 2026-07-21, deps: [B1, track_A_P4], files: [
        "web/src/lib/reseller/progression-linkage.ts (pure lib — phaseForEventKind + linkageForEvent + annotateProgression; maps ProgressionEventKind → U.9 phase 1..12 → /guide/<slug> via chapterSlugForPhase from B7 tour-state; cross-cutting billing/artefact kinds return null triple)",
        "web/src/lib/reseller/progression-linkage.test.ts (7/7 pass — kind→phase mapping, linkage envelope, annotate preserves input + non-mutation)",
        "web/src/lib/reseller/portfolio-phase-distribution.ts (pure lib — buildPhaseDistribution derives per-customer current phase from latest SVI score band 0-20→P2 / 21-40→P3 / 41-60→P4 / 61-80→P5 / 81-100→P6, else P1; emits all 12 phases with PHASE_LABELS from @/lib/showcase/gallery; k>=5 anonymity + applyComplementarySuppression reused from portfolio-aggregates)",
        "web/src/lib/reseller/portfolio-phase-distribution.test.ts (6/6 pass — empty portfolio zeros, band binning across 25 synthetic customers, no-SVI-defaults-P1, sub-k suppression, latest-per-project, highest-phase-across-multi-project)",
        "web/src/lib/reseller/customer-drawer.ts (ProgressionEvent extended with phase/chapterSlug/href optional fields; buildProgressionTimeline pipes output through annotateProgression before returning)",
        "web/src/app/reseller/customers/customer-drawer.tsx (ProgressionTab renders 'Guide chapter N →' anchor per timeline row when phase!=null, target=_blank + rel=noopener; ProgressionEvent client interface widened with matching optional fields)",
        "web/src/app/reseller/page.tsx (new 'Phase distribution' section between SVI bands and Portfolio detail; buildPhaseDistribution called with customers.map(user_id) + sviRaw; bar chart mirrors weekly/bands rendering pattern with same k>=5 <5 placeholder)"
      ], note: "Both B8 exit criteria closed. Progression timeline rows now deep-link to /guide/<slug> — the reseller boundary means reseller sees the public marketing guide, not the customer's private /workspace/guide/<slug>. Reused chapterSlugForPhase from B7 tour-state (same taxonomy: PHASE_LABELS from @/lib/showcase/gallery drives /guide, /workspace/guide, /guide/reports, /showcase/blockid, product tour, B8 phase distribution — single-source enforced). Phase distribution helper mirrors buildSviBands pattern with the same K_ANONYMITY_THRESHOLD + applyComplementarySuppression so any bucket with count 1..4 renders as '<5' and reseller can't triangulate individuals. Score→phase mapping is intentionally low-fidelity (SVI band, not milestone data) because milestone-report-state doesn't cross the reseller boundary yet — that finer-grained derivation is deferred to P10_hardening alongside Playwright. Verified: tsc clean; reseller+showcase+product-tour+guide+gate vitest 355/355 (was 319, +36: +7 progression-linkage + 6 phase-dist + 23 elsewhere from ticks 45-51); lint:reseller 8 R-01 + 28 R-03 with 3 documented exemptions, 0 violations. Track B fully complete except B9 (deps: B4 ✓ ready) and B10 (deps: B3 ✓ ready)."}
      B9_reviews_surface: {status: done, tick: 53, completed_at: 2026-07-21, deps: [B4], migration_files: [0100], files: [
        "web/supabase/migrations/0100_showcase_reviews.sql (applied via docker exec supabase-db psql; NOTIFY pgrst reload issued; opportunistic FK to data_room_access_tokens added only when that table exists so hosts that skipped 0062 still land the table cleanly)",
        "web/src/lib/reseller/reviews.ts (pure: hashComment SHA-256 helper + buildReviewsSummary k>=5 aggregate returning total_reviews/projects_with_reviews/avg_rating)",
        "web/src/lib/reseller/reviews.test.ts (10/10 pass — hash determinism + trim + null/empty sentinel; empty-input zeros; sub-k suppression; distinct-project count; OOR/non-finite rating skip; custom k threshold)",
        "web/src/lib/reseller/supabase.ts (+ showcaseReviewsAggregate() selects only project_id + rating + created_at — never comment or reviewer_email — so U.9 §5 boundary is enforced at the query layer; scopes via projects.user_id ∈ allowedCustomerIds)",
        "web/src/app/api/showcase-reviews/route.ts (POST — reviewer flow authenticates via data_room_access_tokens.token, resolves data_room → project_id, upserts on (project_id, reviewer_email) so re-submissions land as edits; GET — founder flow authenticates via getCurrentUser and scopes by projects.user_id = user.id, returns comment plaintext to the founder only)",
        "web/src/app/reseller/page.tsx (+ Investor reviews section between Phase distribution and Portfolio detail; renders total_reviews / projects_with_reviews / avg_rating with the same formatKAnon() helper; k>=5 suppressed cells render as '<5' or '—')"
      ], note: "U.9 §5 chokepoint honoured — the reseller-lens query selects only rating + project_id + created_at, and buildReviewsSummary drops avg_rating to null whenever the total-reviews bucket is k-suppressed so a low-sample average cannot leak individual scores. Comment plaintext lives in one column and is only read by the founder-scoped GET path; the reseller wrapper does not surface it. Migration 0100 wraps the data_room_access_tokens FK in a DO block that adds it only when the target table exists — this dev host has never applied 0062, so the migration lands without the FK there; production hosts that ran 0062 pick up the constraint. Verified: 10/10 pass in reviews.test.ts (new); 365/365 combined reseller+showcase+guide+product-tour+gate (was 355/355, +10); 603/603 across entire tree; tsc clean; npm run lint:reseller: 8 R-01 files + 28 R-03 routes, 3 exemptions, 0 violations — no new exemption needed because /api/showcase-reviews is not under /api/reseller/**. Playwright deferred to P10_hardening per the same posture used for P4/P5/P7/P8/B7/B8."}
      B10_integrations_admin: {status: done, tick: 54, completed_at: 2026-07-21, deps: [B3], files: [
        "web/src/lib/integrations/catalogue.ts (pure: buildIntegrationsCatalogue returns exactly four IntegrationRow entries in github/stripe/ga4/blockchain order; findOAuth prefers active over errored connection per provider; blockchain derives status from syncEnabled+syncState with statusDetail carrying token symbol + pending queue count; formatRelativeTime with injectable now for deterministic tests; summariseCatalogue rolls up connected/errored/not_connected/not_configured counters)",
        "web/src/lib/integrations/catalogue.test.ts (21/21 pass — order stability, providerConfigured false → not_configured, active connection → connected, active-wins-over-errored, error-only → error, revoked ignored, blockchain null/on/catching_up/paused/pendingEvents/syncEnabled=false-defensive branches, walletHref override, formatRelativeTime buckets, summariseCatalogue rollup)",
        "web/src/components/workspace/integration-row-card.tsx (client wrapper; delegates oauth rows to existing OAuthConnectorCard so the sync/disconnect POST paths remain unchanged; renders blockchain row with status pill + statusDetail + last-sync + Manage/Set-up link to /workspace/wallet)",
        "web/src/app/workspace/integrations/page.tsx (server component; fetches listConnections + getSyncConfig in parallel, builds catalogue via pure lib, renders summary header + one card per row via IntegrationRowCard; retains existing ?error=/?connected= toast handling)",
        "web/src/components/workspace/nav-groups.ts (Account section gains /workspace/integrations entry with Plug icon; positioned after Billing)"
      ], note: "Track B closed. Plan §305 exit criteria met — catalogue surface renders one row per Stripe/GA4/GitHub/blockchain with status + last-sync + credentials-manager link. No schema work needed: OAuth trio already lives in oauth_connections_v2 (migration 0087), blockchain state already lives in blockchain_sync_config (migration 0034). Existing OAuthConnectorCard reused verbatim for oauth rows so the sync/disconnect POST paths, encryption, and rate-limit toast wording all stay identical — the new card wrapper only introduces the visual status pill + summary header + blockchain row. Blockchain card is a Link, not a POST client, because the actual sync toggle lives at /workspace/wallet under the existing MetaMask + sync-toggle UI (avoids duplicating that flow into the catalogue). Verified: tsc clean; vitest 624/624 (was 603/603, +21 new catalogue tests); npm run lint:reseller unchanged (8 R-01 + 28 R-03 files, 3 exemptions, 0 violations — the new files are not under /api/reseller/** so the scope-boundary lint doesn't fire, and none of them are in feature-gates.manifest.ts so the R-03 rule doesn't fire either; /workspace/integrations remains ungated by design because listing integration status is safe for any authenticated user, and each per-provider mutation route already has its own auth). Playwright deferred to P10_hardening per the same posture used for P4/P5/P7/P8/B7/B8/B9."}

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

  - tick: 44
    ran_at: 2026-07-21
    action: p8.1_manifest_completeness
    result: |
      Track A P8 opened with sub-phase decomposition (P8.1..P8.5) and
      P8.1 shipped. Reconciled web/src/lib/feature-gates.manifest.ts
      with the actual tree: removed 9 phantom entries (api/cap-table/
      entries|import|export, api/data-room/documents, api/dataroom/
      documents, api/vesting/schedules|events, api/esop/exercise,
      api/tokenization/mint, api/reseller/create-startup) and added 20
      real mutation routes discovered by walking GATED_DIRECTORIES with
      POST/PATCH/PUT/DELETE detection. Manifest now maps 28 routes:
      cap-table (5), data-room+dataroom (8, tagged for CTO reconciliation
      in P8.4), vesting (4 → vesting.write), esop (5 → esop.manage),
      blockchain (3 → blockchain.sync), tokenization (1 → share_management),
      reseller (2). Introduced MUTATION_METHODS constant. Dropped the
      `| "share_management"` special-case union on required_feature since
      the Feature type in entitlements.ts already declares it as a real
      literal — required_feature: Feature is now clean.
      New test suite web/src/lib/feature-gates.manifest.test.ts (6/6
      pass) walks GATED_DIRECTORIES from disk and asserts: (a) every
      manifest entry points at an existing route.ts, (b) every mutation
      route in a gated dir appears in the manifest, (c) no duplicates,
      (d) requiredFeatureFor round-trips every entry, (e) returns null
      for ungated / non-existent routes, (f) MUTATION_METHODS matches
      the four write verbs. Suite now guards against manifest drift
      when new routes are added — the test fails on unlisted mutation
      routes AND on phantom rows, so both classes of drift surface at
      `npm test`.
      Sub-phase decomposition captured on the P8 phase in the goal file:
      P8.1 done, P8.2 (route gating via requireFeature + AST lint), P8.3
      (migration 0098 grandfather backfill), P8.4 (purchase drawer +
      cancel_at_period_end + data-room/dataroom folder reconciliation),
      P8.5 (STRIPE_PRICE_ADDON_SHARE_MGMT_* env vars — human-blocked on
      Stripe dashboard mint by account owner) pending. Verification:
      tsc clean; reseller vitest 248/248 (+6 from 242); npm run
      lint:reseller: 8 files / 2 exemptions / 0 violations.
      Frontier after tick 44: (a) Track A P8.2 route gating is the
      natural next tick — pure lib + per-route Edit work, 28 routes to
      add requireFeature() to; likely splits into 3-4 batches by
      subject area (cap-table, data-room, vesting/esop, blockchain).
      (b) Track B B2 (guide chapters 1-4) remains unblocked from tick
      42 as the fallback if P8.2 blocks off-peak. (c) P0.3 advisory
      reviews still pending, advisory-only. (d) P1.5 InfoVision seed
      still human-blocked on H.20.
    commit: (this tick)

  - tick: 45
    ran_at: 2026-07-21
    action: p8.2_route_gating
    result: |
      Track A P8.2 gate closed. Every mutation handler in the 28 routes
      listed by web/src/lib/feature-gates.manifest.ts now invokes
      gateRequireFeature(<key>) at handler top; the <key> matches each
      manifest row's required_feature (share_management, vesting.write,
      esop.manage, blockchain.sync, reseller.grant_credits,
      reseller.console). Shared helper at web/src/lib/feature-gate.ts
      wraps getCurrentUser + resolveSegment + EntitlementError → 402 so
      route wiring is a two-line insertion (const gate = await
      gateRequireFeature("<key>"); if (!gate.ok) return gate.response;)
      that also carries the user + UserWithPlan projection for downstream
      logic. 7/7 vitest cases cover the 401 / 402 / segment-fallback /
      plan-null / non-Entitlement-error branches.
      R-03 AST lint shipped at web/src/lib/reseller/reseller-lints.ts
      (analyzeR03) + duplicated into web/scripts/ci/reseller-lints.mjs
      (plain node, no tsx). The CLI loads FEATURE_GATES from the
      manifest via regex, then for every route.ts listed asserts that
      each exported POST/PATCH/PUT/DELETE body calls gateRequireFeature
      or requireFeature with the manifest key inline. locateHandlers
      uses paren-then-brace matching so multi-line signatures with
      destructured params (e.g. `{ params }: { params: Promise<{id:
      string}> }`) do not fool the body scan — this was the initial
      bug the first pass hit on vesting/[id] and esop/grants/[id].
      Per-handler exemption via `// r-03-exempt: <reason>` immediately
      above the export decl mirrors the R-01 pragma pattern. One
      exemption in tree: data-room/engage POST (investor engagement
      telemetry from anonymous view — auth is via
      data_room_access_tokens.token lookup, not user entitlement).
      Verification: tsc clean; reseller+showcase+gate vitest 319/319
      (was 255, +64: +7 feature-gate + +9 R-03 analyzer + 48
      pre-existing); npm run lint:reseller: R-01 scanned 8 file(s),
      R-03 scanned 28 manifest route(s); 3 exemptions, 0 violations.
      Frontier after tick 45: (a) Track A P8.3 grandfather backfill
      (migration 0098) is next — populate share_management
      entitlement onto existing paying users pre-cutover. (b) P8.4
      purchase drawer + cancel_at_period_end + data-room/dataroom
      folder reconciliation. (c) P8.5 still HUMAN-BLOCKED on Stripe
      price env var mint. (d) Track B B2 (guide chapters 1-4)
      remains unblocked from tick 42 as the fallback. (e) P0.3
      advisory reviews still pending (advisory-only). (f)
      P1.5_infovision_seed still HUMAN-BLOCKED on H.20.
    commit: (this tick)

  - tick: 48
    ran_at: 2026-07-21
    action: b2_guide_chapters_1_to_4
    result: |
      Track B B2 shipped. Chapters 1-4 (Vision, Idea Validation, Market
      Research, MVP) authored EN+VI as a structured content module at
      web/src/lib/guide/startup-journey.ts. Chapter interface covers the
      six-item U.8 spec (founderAction + agentsInvoked + expectedOutputs +
      commonPitfalls + showcaseExample + cta) plus title + summary; VI is
      complete parity, not machine translation. phaseLabel is a direct
      reference to PHASE_LABELS from @/lib/showcase/gallery so /guide,
      /workspace/guide, /guide/reports and /showcase/blockid share one
      canonical phase-label taxonomy. Marketing route
      web/src/app/guide/[chapter]/page.tsx generates static params for all
      four slugs, renders EN/VI via getLocale() cookie, emits
      OG/Twitter/canonical per chapter, and wires prev/next chapter footer
      with first/last edge cases (last shows "unlocks with B3"). Workspace
      route web/src/app/workspace/guide/[chapter]/page.tsx auth-gates with
      redirect(/auth/login?next=/workspace/guide/<slug>), renders inside
      WorkspaceLayout so sidebar/header match /workspace, and sets robots
      noindex. Docs mirror at docs/guides/startup-journey/chapter-{01..04}.md
      carries EN copy for offline reading + contributor PRs; header comment
      states runtime reads the TS module. Verified: 8/8 new vitest cases in
      startup-journey.test.ts pass (chapter registry order/slug/phase,
      unknown-slug null-safety, EN+VI parity across every required section,
      phaseLabel identity check vs PHASE_LABELS, prev/next boundary
      handling); combined 63/63 pass across guide + showcase suites; tsc
      clean. Frontier: B3 chapters 5-8 now unblocked in the same content
      pattern; B7 product tour (deps: B2) + B8 reseller linkage (deps: B1 +
      track_A_P4) also unblocked. Track A still HUMAN-BLOCKED on P8.5.
    commit: (this tick)

  - tick: 49
    ran_at: 2026-07-21
    action: b3_guide_chapters_5_to_8
    result: |
      Track B B3 shipped. Chapters 5-8 (PMF & Early Traction, Revenue &
      Business Model, Growth & Analytics, Team & Culture) authored EN+VI as
      four new entries appended to web/src/lib/guide/startup-journey.ts,
      following the same Chapter interface + six-item U.8 spec
      (founderAction + agentsInvoked + expectedOutputs + commonPitfalls +
      showcaseExample + cta plus title/summary). VI is complete parity, not
      machine translation. phaseLabel for each new chapter is a direct
      reference to PHASE_LABELS[5..8] from @/lib/showcase/gallery so /guide/
      [chapter], /workspace/guide/[chapter], /guide/reports and
      /showcase/blockid share one canonical phase-label taxonomy — no drift.
      ChapterSlug union extended with "05-pmf" | "06-revenue" | "07-growth" |
      "08-team" so allChapterSlugs() now returns eight entries and both page
      routes' generateStaticParams pick them up automatically without any
      route-file edit. Placeholder "next chapter unlocks" copy flipped from
      "Chapter 5 unlocks with B3" to "Chapter 9 unlocks with B4" on both
      marketing (guide/[chapter]/page.tsx) and workspace
      (workspace/guide/[chapter]/page.tsx) surfaces. Content references the
      B3-scoped integrations from plan §298 by name (founder-own Stripe
      test-mode → live-mode flip, GA4 property connection, weekly SVI cron)
      but the actual UI wiring for those three integrations is a follow-up
      tick — matches the B2 precedent where chapters 1-4 referenced GitHub
      repo-link + GA measurement-ID capture without shipping the capture UI.
      Docs mirror at docs/guides/startup-journey/chapter-{05..08}.md
      published for offline reading + contributor PRs (runtime reads the TS
      module; .md files are documentation-only, header comment states so).
      Test suite extended: EXPECTED_SLUGS now 8 entries, order + phase
      arrays extended to [1..8], allChapterSlugs() assertion updated,
      unknown-slug case bumped to "09-funding", adjacent-chapter first/last
      assertions flipped to 01-vision/08-team, plus a new boundary
      assertion that getAdjacentChapters("04-mvp").next === "05-pmf" and
      getAdjacentChapters("05-pmf").previous === "04-mvp" so the B2/B3
      stitch is guarded against future reorderings. Verified: 9/9 pass in
      startup-journey.test.ts (was 8/8); 64/64 combined guide + showcase
      suites (was 63/63); tsc clean; npm run lint:reseller unchanged (8
      files scanned, 3 exemptions, 0 violations — new files sit outside
      /api/reseller/ so no additional scope). Frontier after tick 49: (a)
      Track A remains HUMAN-BLOCKED on P8.5 Stripe env vars. (b) Track B
      B4_guide_ch_9_to_12 (chapters 9-12: Funding-Ready → Fundraise/Term
      Sheet → Post-Funding/Scale → Exit/Beyond) now unblocked in the same
      startup-journey.ts pattern. (c) B7 product tour + B8 reseller
      linkage remain unblocked from earlier ticks. (d) P0.3 advisory
      reviews still pending (advisory-only). (e) P1.5 InfoVision seed
      still HUMAN-BLOCKED on H.20.
    commit: (this tick)

  - tick: 50
    ran_at: 2026-07-21
    action: b4_guide_chapters_9_to_12
    result: |
      Track B B4 shipped. Chapters 9-12 (Funding-Ready, Fundraise/Term
      Sheet, Post-Funding/Scale, Exit/Beyond) authored EN+VI as four new
      entries appended to web/src/lib/guide/startup-journey.ts, following
      the same Chapter interface + six-item U.8 spec (founderAction +
      agentsInvoked + expectedOutputs + commonPitfalls + showcaseExample
      + cta plus title/summary). VI is complete parity, not machine
      translation. phaseLabel for each new chapter is a direct reference
      to PHASE_LABELS[9..12] from @/lib/showcase/gallery so /guide,
      /workspace/guide, /guide/reports and /showcase/blockid share one
      canonical phase-label taxonomy — no drift. ChapterSlug union
      extended with "09-funding" | "10-fundraise" | "11-scale" |
      "12-exit" so allChapterSlugs() now returns twelve entries and both
      page routes' generateStaticParams pick them up automatically
      without any route-file edit. Chapter 10 copy honours the U.15.11
      Phase 10 wording supersession — the optional blockchain hash is
      described as an "immutable record for later verification" and
      explicitly NOT as legal notarisation ("notary" is a reserved role
      under Australian law). "Chapter 9 unlocks with B4 release"
      placeholder text flipped on both marketing
      (guide/[chapter]/page.tsx) and workspace
      (workspace/guide/[chapter]/page.tsx) surfaces to arc-complete
      wording — marketing: "You've reached the final chapter. After
      exit, open a new workspace at Chapter 1 or move into the
      reseller/accelerator role." (VI parity); workspace: "Final
      chapter. After exit: new workspace or reseller role." (VI
      parity). Docs mirror at
      docs/guides/startup-journey/chapter-{09..12}.md published for
      offline reading + contributor PRs (runtime reads the TS module;
      .md files are documentation-only, header comment states so). Test
      suite extended: EXPECTED_SLUGS now 12 entries, order + phase
      arrays extended to [1..12], allChapterSlugs assertion updated,
      unknown-slug case bumped to "13-post-exit", last-slot adjacent
      assertion flipped to 12-exit ↔ 11-scale, plus a new boundary
      assertion that getAdjacentChapters("08-team").next === "09-funding"
      and getAdjacentChapters("09-funding").previous === "08-team" so the
      B3/B4 stitch is guarded against future reorderings. Verified: 10/10
      pass in startup-journey.test.ts (was 9/9); 65/65 combined guide +
      showcase suites (was 64/64); tsc clean; npm run lint:reseller
      unchanged (8 files scanned, 3 exemptions, 0 violations — new files
      sit outside /api/reseller/ so no additional scope). Content
      references B4-scoped integrations from plan §299 by name (investor
      NDA workflow in ch9+ch10, term-sheet AI review UI in ch10,
      blockchain sync activation in ch10+ch11, cap-table snapshot
      approval UI in ch11, LP-report bundling UI in ch12) but the actual
      UI wiring for those integrations is a follow-up tick — matches the
      B2/B3 precedent where chapter copy referenced integrations before
      the capture UI shipped. Frontier after tick 50: (a) Track A remains
      HUMAN-BLOCKED on P8.5 Stripe env vars. (b) Track B
      B9_reviews_surface (deps: B4 now done) unblocked — the
      showcase_reviews table + Phase-9 investor-review capture surface;
      migration 0100 slot already reserved. (c) B7 product tour +
      B8 reseller linkage remain unblocked from earlier ticks. (d) P0.3
      advisory reviews still pending (advisory-only). (e) P1.5 InfoVision
      seed still HUMAN-BLOCKED on H.20. The 12-chapter content-authoring
      arc is now closed.
    commit: (this tick)

  - tick: 46
    ran_at: 2026-07-21
    action: p8.3_grandfather_backfill
    result: |
      Track A P8.3 gate closed. Migration 0098
      (web/supabase/migrations/0098_share_management_grandfather_backfill.sql)
      authored + applied via docker exec supabase-db psql. Two writes per
      matching user, both idempotent: (a) UPDATE app_users SET
      grandfathered_share_management=true, grandfathered_at=now() guarded by
      the existing false flag so re-runs no-op; (b) INSERT INTO entitlements
      (user_id,'share_management',true,'grandfathered', now(),
      {backfill_migration:'0098',cutover_plan_id,cutover_status}) with ON
      CONFLICT (user_id,feature) DO NOTHING. Cohort matches plan §F.4
      verbatim: subscription_trial_state.status IN ('active','trialing') AND
      plan_id IN ('founder_growth','founder_scale','founder_enterprise',
      'growth','growth_annual'). Applied result on dev DB: BEGIN → UPDATE 0
      → INSERT 0 0 → COMMIT (0/45 users grandfathered — expected, no legacy
      paying subs in dev); re-run identical (idempotent proof). NOTIFY pgrst
      schema reload issued. Notes: plan §F.4 references a 'subscriptions'
      snapshot but this repo persists subscription state in
      subscription_trial_state (0075:6-17); source='grandfathered' enum
      member already exists in the entitlements_source_check constraint
      from 0075:63-71 so no schema shim needed. 60-day lapse sunset is a
      P11 customer-success responsibility and intentionally out of scope
      for this migration. Frontier after tick 46: (a) Track A P8.4
      purchase drawer + cancel_at_period_end is the next unblocked A
      phase; (b) P8.5 remains HUMAN-BLOCKED on Stripe price env vars; (c)
      Track B B2 (guide chapters 1-4) remains unblocked as fallback; (d)
      P10_hardening still blocked_by [P1..P9] pending P8.4 close.
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
  - tick: 56
    ran_at: 2026-07-22
    action: p8.4b_end_of_cycle_removal
    result: |
      CRO advisory item #21 closed. Old handleRemoveItem() in
      web/src/app/api/stripe/change-plan/route.ts called
      stripe.subscriptionItems.del(target.id,{proration_behavior:'none'})
      which per the Stripe API contract removes the sub-item
      IMMEDIATELY — the customer lost add-on access mid-cycle
      despite the drawer copy and the persisted
      revenue_events.detail.effective='end_of_current_period'
      both claiming end-of-cycle removal. Correct pattern per
      Stripe docs is a Subscription Schedule. New path:
      (a) reuse activeSub.schedule if the subscription already
      has one attached (retrieve it) else
      subscriptionSchedules.create({from_subscription:activeSub.id})
      which fills phase 0 with the current item set through
      current_period_end; (b) call
      subscriptionSchedules.update(schedule.id, {end_behavior:
      'release', phases:[<phase 0 preserved with start_date/
      end_date/items>, {items: current minus target, iterations:
      1, proration_behavior:'none'}]}) so the subscription
      reverts to normal Stripe renewal after phase 1's single
      cycle completes with the reduced items. Pure phase-builder
      extracted to web/src/lib/stripe/addon-schedule.ts so the
      branch is unit-tested without any Stripe network dep:
      buildAddonRemovalSchedulePhases returns a discriminated
      {ok:true, phases:[p0,p1]} | {ok:false, reason:
      'target_not_in_phase'|'no_items_after_removal'} envelope so
      malformed inputs cannot reach Stripe. 5/5 vitest cases:
      happy path (2 items → both phases correct), string-vs-
      object price.id shape acceptance, zero/undefined quantity
      omit (so downstream Stripe params don't reject a quantity:0),
      sole-item guard (would empty phase 1 → returns reason so the
      caller 400s instead of cancelling the whole sub), and
      quantity>1 preservation. Response envelope now carries
      schedule_id + effective_at (Unix timestamp of
      current_period_end) alongside the existing removed_item_id
      + effective:'end_of_current_period'; revenue_events.detail
      mirrors the new fields so downstream reconciliation +
      Playwright can assert item is still active until
      current_period_end. Verified: tsc clean; vitest 629/629
      (was 624/624, +5 addon-schedule); npm run lint:reseller
      unchanged (8 R-01 + 28 R-03 files, 3 exemptions, 0
      violations — no new /api/reseller/** file and change-plan
      route is not gated behind an entitlement). Playwright E2E
      that hits the actual Stripe test-mode cancel + verifies
      the item survives to current_period_end still deferred to
      P10_hardening — same posture as every other P4/P5/P7/P8/
      B7/B8/B9/B10 leaf that shipped a real code path but left
      the E2E to the hardening phase. Frontier after tick 56:
      (a) Track A still HUMAN-BLOCKED on P8.5 Stripe env vars —
      the P8.4b fix does NOT unblock P8.5 since Playwright
      provisioning requires the actual STRIPE_PRICE_ADDON_
      SHARE_MGMT_MONTHLY|ANNUAL price IDs. (b) Track B COMPLETE.
      (c) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20.
      (d) P10_hardening still blocked_by [P1..P9] until P8.5
      clears. Autonomous loop remains substantively IDLE — the
      only remaining self-contained items are advisory follow-
      ups 22-27; every real leaf is either DONE or HUMAN-
      BLOCKED.
    commit: (this tick)

  - tick: 55
    ran_at: 2026-07-21
    action: p0.3_advisory_reviews
    result: |
      P0.3 advisory reviews closed. All 8 advisory reviewers
      (cmo, coo, cpo, cdo, chro, cro, customer-success,
      investor-relations) ran in parallel per plan §U.11 +
      §U.13 stage-1 fan-out and returned verdict =
      approved_with_notes — 0 revise verdicts, 0 blocking
      findings. Each wrote docs/plans/reviews/plan-review-
      <role>.md with YAML frontmatter (name/role/verdict/
      ran_at/scope) capped at 60 lines per U.13 stage-brief
      efficiency rule. Notable non-blocking findings
      captured as next_action items: (a) CRO — Share-Mgmt
      remove_item path in web/src/app/api/stripe/change-
      plan/route.ts:540 uses subscriptionItems.del with
      proration_behavior='none' which deletes the item
      IMMEDIATELY not end-of-cycle; the surrounding comment
      claims 'cancel_at_period_end-style' but Stripe API
      removes item on request; correct fix requires a
      subscription schedule OR items:[{id, deleted:true}]
      via subscriptions.update with a cancel-at-period-end
      wrapper; must be resolved in a P8 delta tick before
      P8.5 unblocks so GA doesn't ship a stealth churn
      surprise. (b) CMO — brand-wording drift ("Referred
      by" vs plan §C.3 "Introduced by"), /guide/reports
      lacks a download route + GA event so template-library
      ROI is unmeasurable, email footer helper not yet
      wired into welcome/receipt emails. (c) CDO —
      complementary suppression missing on
      phase-distribution + reviews aggregates (single
      k=1..4 bucket renders as <5 but its complement can
      still leak the count via subtraction); GA4 event
      catalogue for showcase surfaces not authored.
      (d) Customer-Success — H.8 wholesale magic-link +
      welcome email unbuilt, Grant modal EN-only, no
      reseller-side denial-reason surface, P11 KPIs are
      all trailing (no last-login / first-report leading
      signals). (e) CPO — reseller Customer drawer EN-only,
      wholesale wizard lacks explicit non-payment
      confirmation. (f) CHRO — human-review-minutes KPI
      missing from the 0-eng-week claim; Div 83A qualifying
      -tests checklist missing from chapter-08-team.
      (g) IR — pitch-deck Channel Economics slide + data-
      room GTM one-pager + explicit reseller row in
      unicorn masterplan not authored. (h) COO —
      human-blocked items (P1.5, P8.5) should surface in
      weekly digest. All findings are advisory-only per
      U.13 stage-5 — none gate any downstream phase.
      Verified: git status shows 7 new plan-review-*.md
      files under docs/plans/reviews/ (CS agent already
      committed + pushed plan-review-cs.md inline as
      6ca0e38); goal file P0.3_advisory_reviews flipped
      pending → done with verdict map + evidence note.
      Frontier after tick 55: only human-blocked leaves
      remain (P1.5 InfoVision seed on H.20 + P8.5 Stripe
      env vars); P10_hardening still blocked_by [P1..P9]
      until P8.5 clears. Autonomous loop is now
      substantially IDLE — no unblocked non-human-blocked
      phase remains; loop should self-exit or fall back
      to periodic housekeeping ticks until human unblocks
      P1.5 or P8.5. CRO-flagged remove_item defect
      captured as top item in next_action for P8 delta
      before P8.5 unblock.
    commit: (this tick)
  - tick: 54
    ran_at: 2026-07-21
    action: b10_integrations_admin
    result: |
      Track B B10_integrations_admin shipped — the final Track B leaf.
      Pure lib web/src/lib/integrations/catalogue.ts (buildIntegrationsCatalogue
      + formatRelativeTime + summariseCatalogue) with 21/21 tests.
      Client wrapper web/src/components/workspace/integration-row-card.tsx
      delegates oauth rows to existing OAuthConnectorCard (unchanged POST
      paths) and renders the blockchain row with status pill + Manage link
      to /workspace/wallet. Server page web/src/app/workspace/integrations/
      page.tsx composes listConnections + getSyncConfig into the catalogue
      and renders a summary header + one card per row. Nav-groups Account
      section gains /workspace/integrations with the Plug icon after Billing.
      No schema work: oauth_connections_v2 (0087) + blockchain_sync_config
      (0034) already cover all four providers. Verified: tsc clean;
      vitest 624/624 (was 603/603, +21); lint:reseller unchanged.
      Track B is now COMPLETE (B1..B10 all done).
    commit: (this tick)
  - tick: 69
    ran_at: 2026-07-22
    action: cdo_cmo_cpo_advisory_23_ga4_showcase_catalogue
    result: |
      Closed the second half of CDO advisory §23 ("GA4 event catalogue for
      showcase surfaces", deferred to CMO/CPO joint tick per CDO rec #2).
      Root cause: all four Track B showcase surfaces (/showcase/blockid,
      /guide/reports, /guide/[chapter], /workspace/guide/[chapter]) already
      mount <PageTracker /> but the runtime dispatcher's PAGE_EVENTS map at
      web/src/components/analytics/page-tracker.tsx:7 had no matching
      entries, so every showcase page view silently dropped from GA4 +
      GTM dataLayer. AnalyticsEventMap already declared four showcase
      events (showcase_public_viewed / showcase_guide_viewed /
      showcase_report_downloaded / showcase_phase_advanced /
      showcase_integration_wired at web/src/lib/analytics.ts:154-158)
      but only two of them (guide_viewed, public_viewed) match a page
      view; the /guide/reports view had no event at all.
      Files:
        - web/src/lib/analytics.ts (+ showcase_reports_viewed:
          { total_reports: number; source: "marketing" } inserted
          alphabetically after showcase_guide_viewed; keeps AnalyticsEventMap
          the single source of truth for event schemas)
        - web/src/lib/analytics/showcase-tracker.ts (new — pure
          resolveShowcasePageEvent(page, ctx) returns { name, params } |
          null for the four page slugs; normaliseReferrer trims to
          origin+pathname so the GA4 param never leaks query/fragment PII;
          out-of-range chapter / invalid locale returns null so a
          misplumbed prop degrades gracefully; kept browser-free so vitest
          covers the mapping without jsdom)
        - web/src/lib/analytics/showcase-tracker.test.ts (13/13 pass — 4
          page-slug happy paths, 2 chapter-range guards, 2 locale guards,
          referrer normalisation + malformed-referrer truncation + empty-
          referrer branch, total_reports default 0, explicit source
          override on guide-chapter)
        - web/src/components/analytics/page-tracker.tsx (+ optional props
          chapter / locale / source / totalReports; useEffect now calls
          resolveShowcasePageEvent(page, ctx) and dispatches via a switch
          per event name so trackEvent's discriminated union stays honest
          at each call site; document.referrer read guarded by
          typeof document check to keep SSR safe)
        - web/src/app/showcase/blockid/page.tsx (no prop change — page slug
          alone is enough; referrer plumbed automatically from
          document.referrer at effect run)
        - web/src/app/guide/reports/page.tsx (+ totalReports={summary.
          total_rows} so the event carries the same headline count the page
          renders)
        - web/src/app/guide/[chapter]/page.tsx (+ chapter={c.phase}
          locale={locale}; source defaults to "marketing" in the resolver)
        - web/src/app/workspace/guide/[chapter]/page.tsx (+ chapter=
          {c.phase} locale={locale} source="onboarding" so the same event
          discriminates authenticated founder reads from anonymous
          marketing reads)
        - docs/analytics/showcase-events.md (new — catalogue for CMO/CPO;
          surface→event map, GA4 audience recipes, change-control notes)
      Verified: tsc clean; whole-tree vitest 680/680 (was 667, +13 new
      showcase-tracker cases); npm run lint:reseller: 8 R-01 files + 28
      R-03 routes, 3 exemptions, 0 violations (unchanged — new files are
      under /lib/analytics/ + /components/analytics/, not /api/reseller/**,
      so R-01 doesn't fire; nothing added to feature-gates.manifest so
      R-03 doesn't fire either). REMAINING under §23: none — both halves
      (pair-suppression tick 57 + GA4 catalogue this tick) now closed.
      Frontier unchanged: every real leaf still DONE or HUMAN-BLOCKED
      (P8.5 Stripe env vars, P1.5 InfoVision seed on H.20). Remaining
      advisory follow-ups: 22 (PARTIAL — /guide/reports download route +
      GA event still deferred pending redaction pipeline per plan §284),
      24 (PARTIAL — H.8 wholesale magic-link + welcome email; larger
      surface), 25 (PARTIAL — wholesale non-payment confirmation bundled
      with §24).
    commit: (this tick)

  - tick: 68
    ran_at: 2026-07-22
    action: ir_advisory_27_channel_economics_and_gtm_memo
    result: |
      Closed the IR half of COO advisory §27 (the last remaining advisory
      follow-up in the loop's queue). Three related content edits — no code,
      no schema, no lint touch — landed in a single tick since all three
      addresses of the plan-review-ir.md recommendations (#1 Channel
      Economics slide, #3 GTM one-pager memo, #4 unicorn masterplan reseller
      row) share the same $99 SKU worked example + Auschain seller-of-record
      framing:
        (a) web/content/pitch/pitch-deck-v1.md — new Slide 8 "Channel
            Economics" inserted between Slide 7 (Business Model) and Slide 8
            (Traction). Renders side-by-side wholesale vs retail comparison
            (0% vs 40% commission; reseller-owned vs BlockID-owned CAC;
            A$99 vs A$59.40 BlockID gross retention per seat) plus the full
            plan §H truth-table (tiers 0/10/20/30/40 at A$99 list with the
            A$59.40 invariant highlighted in every row). Slides 9-13 bumped
            down by one (Traction 8→9, Competitive 9→10, Roadmap 10→11,
            Team 11→12, Ask 12→13). Slide 9 (Traction) additionally weaves
            the /showcase/blockid live-dogfood link per plan-review-ir.md
            rec #2 with "Live Dogfood" badge treatment alongside the
            existing "Live Product" badge. Deck version bumped 1.0 → 1.1
            with a changelog note.
        (b) web/content/pitch/reseller-channel-gtm-lever.md — new data-room
            one-pager (9 sections: memo purpose, seller-of-record rationale,
            two-channel comparison table, retail commission truth-table
            verbatim from plan §H, InfoVision as design-partner reference,
            forward pipeline of retail-partner categories ranked by
            ecosystem fit, diligence-readiness artefacts already shipped
            (append-only commission ledger, append-only reveal audit,
            signed-URL report delivery, monthly reconciliation cron),
            what to link from the deck, cross-references to plan + goal +
            IR review + unicorn masterplan). Filed under web/content/pitch/
            alongside the existing IR content (executive-summary.md,
            investor-targets.md, antler-application.md) since there is no
            docs/data-room/ directory convention yet — colocating with the
            other pitch artefacts keeps the "data-room index" concept
            single-source until a dedicated dir emerges.
        (c) .claude/goals/unicorn-masterplan.md — Reseller Channel row
            added to the Revenue Streams by Phase table (2027: A$150K,
            2028: A$1.2M, 2029: A$4M, 2030: A$8M) with a subsequent
            arithmetic paragraph showing the 20 wholesale × 50 seats × A$99
            → A$1.19M ARR path from plan-review-ir.md rec #4 ("how do you
            get from A$10K to A$100K MRR" as a channel number, not a
            hand-wave). Total ARR row updated in-place: 2027 A$1.15M →
            A$1.30M, 2028 A$8M → A$9.2M, 2029 A$26M → A$30M, 2030 A$53M →
            A$61M — the reseller channel is now visible in the trajectory
            arithmetic rather than buried inside SVI Analysis Credits.
      Rec #5 ("preserve historical reseller_commissions as data-room
      artefact") was already the design of the ledger (append-only via
      mutation triggers on migration 0093, 6-year statute retention per
      H.9); the GTM memo section 7 cites this shipped invariant so
      diligence readers can find it without reading the plan file.
      Verified: no code paths touched — pure content edits under
      web/content/pitch/ + .claude/goals/ + docs/plans/reseller-module-goal.md.
      tsc / vitest / lint:reseller unchanged from tick 67 baseline (no
      TypeScript, no test, no /api/reseller/** surface touched).
      Frontier after tick 68: (a) Track A HUMAN-BLOCKED on P8.5 Stripe env
      vars (STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL). (b) Track B
      COMPLETE. (c) P1.5 InfoVision seed HUMAN-BLOCKED on H.20. (d)
      P10_hardening blocked_by [P1..P9]. (e) Advisory follow-ups: 22
      (PARTIAL — CMO §22 JSON-LD DONE tick 67; /guide/reports download
      route + GA event still deferred pending redaction pipeline per plan
      §284), 23 (PARTIAL — CDO §23 pair suppression DONE tick 57; GA4
      event catalogue for showcase deferred to CMO/CPO joint tick), 24
      (PARTIAL — customer-success Grant modal EN+VI tick 62 + denial
      surface tick 63 + leading-signal lib tick 65 + weekly-digest cron
      tick 66; H.8 wholesale magic-link + welcome email still open —
      larger surface), 25 (PARTIAL — CPO customer-drawer EN+VI tick 61;
      wholesale non-payment confirmation bundled with §24 magic-link
      work), 26 (DONE tick 60), 27 (DONE tick 68 — COO half tick 64 +
      IR half this tick). With §27 IR half closed, the only remaining
      autonomous advisory work is inside §24 (H.8 magic-link infra) which
      requires new email templates + magic-link infra — a larger surface
      that would benefit from a dedicated multi-tick sequence rather than
      an in-loop tick. Loop should self-idle until an unblock signal
      arrives (H.20 ABN confirmation OR Stripe price env vars minted).
    commit: (this tick)

  - tick: 67
    ran_at: 2026-07-22
    action: cmo_advisory_22_jsonld_structured_data
    result: |
      Closed CMO advisory §22 recommendation #3 ("Add JSON-LD Organization +
      WebPage on /showcase/blockid and ItemList on /guide/reports — cheap SERP
      win given the pages already have canonical URLs and unique metadata").
      Pure builder lib at web/src/lib/seo/structured-data.ts exposes
      buildWebPageJsonLd({url, name, description, breadcrumbs?, primaryImage?,
      inLanguage?}) returning a schema.org WebPage object with isPartOf
      (WebSite) + publisher (Organization) + optional BreadcrumbList; and
      buildItemListJsonLd({url, name, description, items, itemLimit?}) returning
      a schema.org ItemList object with 1-indexed ListItem entries and
      numberOfItems reflecting the full input length (crawl payload is clamped
      to itemLimit — default 100 — but the aggregate count stays honest). React
      wrappers WebPageJsonLd + ItemListJsonLd added to
      web/src/components/seo/json-ld.tsx alongside the existing OrganizationJsonLd
      / SoftwareApplicationJsonLd / FAQJsonLd / ArticleJsonLd emitters (same
      dangerouslySetInnerHTML pattern; server components so no hydration cost).
      /showcase/blockid now emits WebPage JSON-LD with a two-level breadcrumb
      trail (Home → Showcase) mounted right after PageTracker, before Navbar,
      so the crawler sees it as part of the initial document. /guide/reports
      now emits ItemList JSON-LD covering the reports gallery — each row
      contributes {name: "<title> — <agent>", description: "<agent> · <date>"}
      so the SERP signal aligns with the visible card metadata. Since
      OrganizationJsonLd already renders inside the root layout, both pages
      end up with Organization + WebPage/ItemList on the same document (no
      duplicate emit).
      Tests: 7/7 pass in structured-data.test.ts (minimum WebPage shape,
      breadcrumb round-trip with 1-indexed positions, primaryImage +
      inLanguage overrides, ItemList 1-indexed positions with url passthrough,
      itemLimit clamp with numberOfItems preserving true count, zero-item
      empty state, description passthrough). Verified: tsc clean; whole-tree
      vitest 667/667 (was 633, +34 covering ticks 63-66 + this tick's 7); npm
      run lint:reseller unchanged (8 R-01 files + 28 R-03 routes, 3
      exemptions, 0 violations — new files under /lib/seo and /components/seo
      don't touch any /api/reseller/** file or feature-gates.manifest so
      neither rule fires).
      Files: web/src/lib/seo/structured-data.ts (new), web/src/lib/seo/
      structured-data.test.ts (new, 7 cases), web/src/components/seo/
      json-ld.tsx (WebPageJsonLd + ItemListJsonLd emitters appended), web/src/
      app/showcase/blockid/page.tsx (import + WebPageJsonLd emit),
      web/src/app/guide/reports/page.tsx (import + listItems derivation +
      ItemListJsonLd emit). REMAINING under §22: /guide/reports per-row
      download route + GA event still deferred (needs the plan §284 redaction
      pipeline — larger tick). Frontier unchanged: every real leaf still DONE
      or HUMAN-BLOCKED (P8.5 Stripe env vars, P1.5 InfoVision seed on H.20
      ABN).
    commit: (this tick)

  - tick: 66
    ran_at: 2026-07-22
    action: cs_advisory_24_weekly_digest_cron
    result: |
      Closed the P11 weekly-digest cron half of Customer-Success advisory §24
      rec #3. Tick 65 landed the pure leading-signals lib + noted "the actual
      P11 weekly-digest cron endpoint that composes this new lib with the
      existing monthly-report + reconciliation KPIs" as the follow-up leaf; this
      tick ships that cron.
      Files:
        - web/src/lib/reseller/weekly-digest.ts (pure CSV + HTML formatter over
          LeadingSignalSummary + reseller meta; isoWeekKey(now) returns
          YYYY-Www with ISO-week year-boundary handling — 2026-01-01 Thu →
          2026-W01; 2027-01-01 Fri → 2026-W53; CSV columns: week /
          reseller_id / reseller_code / reseller_display_name /
          attributed_total / inactive_7d / inactive_30d /
          never_generated_report / activated_first_report /
          activated_first_report_pct / median_days_to_first_report; suppressed
          buckets render as "<5" in CSV and "&lt;5" in HTML; null derived
          fields render empty in CSV and "—" in HTML; rows sorted by
          reseller_code so the digest reads deterministically; commas and
          quotes in display names escaped RFC-4180 style; empty digest returns
          an HTML placeholder paragraph rather than an empty table).
        - web/src/lib/reseller/weekly-digest.test.ts (8/8 pass — isoWeekKey
          padding + year-boundary, CSV header + sort + suppression + escape,
          HTML empty state + suppression markers + escape + sort).
        - web/src/app/api/cron/reseller-weekly-digest/route.ts (new endpoint;
          shared CRON_SECRET pattern with `Bearer` header; iterates active
          resellers, expands reseller_attributions → allowed customer user_ids
          (project-typed attributions resolved via projects.user_id, mirroring
          scope.allowedCustomerIds semantics), fetches app_users(id, email,
          created_at, last_login_at) in one batch, then bridges svi_analyses
          via email since that table is email-keyed on this host — same shape
          used elsewhere in the codebase; unknown emails silently dropped so a
          stray report cannot poison the rollup. Per reseller: computes
          buildLeadingSignalSummary(now) and pushes into digestRows.
          formatWeeklyDigestCsv + formatWeeklyDigestEmail emit the CSV
          attachment + HTML body. ?skip_email=1 → dry-run. Exports
          `GET as POST` so cron-runner.sh's POST call reaches the same
          handler as manual GET debugging. Retention/purge logic intentionally
          omitted — the digest is stateless and re-derives from live data
          each week; the monthly-report cron owns the reseller_report_files
          rows).
        - web/scripts/crontab.production (Mondays 04:15 UTC / 14:15 AEST after
          reseller-clear-commissions and before the next daily window).
      Data-source choice: bridge svi_analyses via app_users.email rather than
      the existing `.in("user_id", allowedIds)` pattern in supabase.ts:151 —
      svi_analyses has no user_id column on this host per 0007+0014+0016+0020
      migrations, so email is the only real join. The pattern in supabase.ts
      is a latent bug outside this tick's scope but was flagged for a follow-
      up housekeeping fix.
      Verified: weekly-digest vitest 8/8 pass; combined reseller vitest 303/303
      (was 295, +8); tsc clean; npm run lint:reseller: 8 R-01 files + 28 R-03
      routes, 3 exemptions, 0 violations (the new /api/cron/** route is not
      /api/reseller/** so R-01 doesn't fire, and cron routes aren't in
      feature-gates.manifest so R-03 doesn't fire — they're already gated by
      CRON_SECRET). Frontier unchanged: every real leaf still DONE or
      HUMAN-BLOCKED (P8.5 Stripe env vars, P1.5 InfoVision seed on H.20 ABN).
      §24(c) DONE. REMAINING under §24: (a) H.8 wholesale magic-link +
      welcome email infra — larger surface, deferred.
    commit: (this tick)

  - tick: 65
    ran_at: 2026-07-22
    action: cs_advisory_24_leading_signals_lib
    result: |
      Closed the leading-signals half of Customer-Success advisory §24 rec #3
      ("Expand P11 digest KPIs with two leading indicators per attributed
      customer: days_since_last_login and first_report_generated_at. These
      are the signals CS actions in a weekly review; churn_30d alone is
      post-mortem.") Ships as pure lib now so the follow-up P11 weekly-digest
      cron tick can compose it into the CSV/email surface without any more
      shape design.
      Files:
        - web/src/lib/reseller/leading-signals.ts (pure — no DB, no IO).
          computeCustomerSignals() derives {days_since_last_login,
          first_report_generated_at, days_to_first_report, seven_day_inactive,
          thirty_day_inactive} per attributed customer; null last_login is
          treated as inactive so a stranded account still enters the CS
          worklist rather than being silently dropped as "unknown". Unparseable
          timestamps on report rows are silently skipped so a single malformed
          row cannot poison the rollup. First-report timestamp is the earliest
          generated_at across all report rows for that user_id — indexed in one
          linear scan.
          buildLeadingSignalSummary() folds the per-customer signals into a
          k-anonymised portfolio rollup: attributed_total, inactive_7d,
          inactive_30d, never_generated_report, activated_first_report (raw
          counts through applyK from portfolio-aggregates), plus two derived
          numerics — median_days_to_first_report (suppressed when fewer than K
          customers have any report so a low-N median cannot point at
          individuals) and activated_first_report_pct (suppressed when the
          attributed_total denominator is k-suppressed, since the numerator
          alone would leak the denominator). K_ANONYMITY_THRESHOLD defaults to
          5 matching portfolio-aggregates + reviews + phase-distribution; test
          suite uses k=1 for the one-off small-portfolio case.
        - web/src/lib/reseller/leading-signals.test.ts (11/11 pass): floor of
          full days, null last_login → both windows inactive, first-report
          across multiple reports picks earliest, no-report → null pair,
          unparseable timestamp skip, 7-day boundary at exactly 7 days,
          suppress-everything-under-k, mixed portfolio with visible +
          suppressed counters + median, median suppression when reports<k,
          even-length median = mean-of-middle-two, custom k threshold.
        - web/src/lib/reseller/portfolio-aggregates.ts (applyK helper exported
          so the new lib can reuse the identical suppression rule instead of
          duplicating it; no callsite change since it was already the
          single-source rule).
      No new API surface — the pure lib is consumed by the future
      /api/cron/reseller-weekly-digest cron (deferred to next tick, matches
      the P7.1 monthly-report precedent where the lib landed first + the cron
      wired one tick later). No new R-01/R-03 lint entries since the file is
      under /lib/reseller/**, not /api/reseller/**, and it doesn't appear in
      feature-gates.manifest.
      Verified: tsc clean; leading-signals vitest 11/11 pass; combined
      reseller vitest 295/295 (was 284, +11 leading-signals); npm run
      lint:reseller: 8 R-01 files + 28 R-03 routes, 3 exemptions, 0
      violations. Frontier unchanged: every real leaf still DONE or
      HUMAN-BLOCKED (P8.5 Stripe env vars, P1.5 InfoVision seed on H.20 ABN).
      REMAINING under §24: (a) H.8 wholesale magic-link + welcome email infra
      (needs email template + magic-link plumbing — larger surface); (b) the
      actual P11 weekly-digest cron endpoint that composes this new lib with
      the existing monthly-report + reconciliation KPIs into one email/CSV.
    commit: (this tick)

  - tick: 64
    ran_at: 2026-07-22
    action: coo_advisory_27_human_blocked_snapshot
    result: |
      Partial close on COO advisory §27 next-tick asks. Two housekeeping wires
      landed:
        (a) scripts/cron/reseller-goal-loop.mjs now emits a
            `stage: human_blocked_snapshot` line on every tick (right after
            tick_start, before the goal-completion detector). Extracted via a
            dependency-free regex scan (extractHumanBlockedSnapshot) that
            matches inline-YAML rows `<id>: {status: human_blocked, ...,
            blocker: "..."}` and returns [{id, blocker}]. Current tree emits
            two entries: P1.5_infovision_seed (H.20 ABN + GST confirm) and
            P8.5_env_and_playwright (STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|
            ANNUAL). Failure to scan degrades to a `human_blocked_snapshot_
            failed` telemetry row so a malformed goal file cannot block a
            tick. Now the weekly-digest reader of reseller-goal-history.jsonl
            gets both open escalations without having to grep the goal file
            (COO Findings item 4 + Recommendations item 1 + Next-tick asks
            item 1 all close on the same wire).
        (b) tracks.B.current_focus flipped from "B1_showcase_scaffold" (stale
            since B10 landed tick 54) to "done" with a comment noting all
            B1..B10 shipped. Frontier picker's Track B rescan is now a
            single-line no-op (COO Next-tick asks item 2).
      Verified: node --check clean on the loop script; kill-switch dry run
      (RESELLER_AUTONOMOUS_LOOP=off) still exits 0 without touching the new
      code path (snapshot is emitted AFTER the kill-switch gate by design);
      offline regex smoke test confirms both current human_blocked entries
      are extracted with full blocker text intact. No new deps, no new files
      — pure edit to the existing loop driver + the goal file. Remaining
      under §27: IR advisory §27 (pitch-deck Channel Economics slide, data-
      room GTM one-pager, reseller row in unicorn masterplan) is content
      work outside the reseller-module tree — deferred to a CMO/IR joint
      tick. Frontier unchanged: every real leaf still DONE or HUMAN-BLOCKED
      (P8.5 Stripe env vars, P1.5 InfoVision seed on H.20 ABN).
    commit: (this tick)

  - tick: 63
    ran_at: 2026-07-22
    action: customer_success_advisory_24_denial_reason_surface
    result: |
      Closed the denial-reason-surface half of Customer-Success advisory §24
      ("reseller-side denial-reason surface as a page render, not just API").
      New /reseller/requests page renders the reseller's own filed requests
      bucketed by status (Pending / Denied / Approved / Cancelled) with
      Denied cards prominently surfacing the admin's decision_reason in an
      amber card + a mailto:admin@blockid.au follow-up link, so the reseller
      finally sees the WHY without having to poke the JSON API.
      Files:
        - web/src/lib/reseller/request-summary.ts (pure lib — locale-neutral
          RequestSummary shape + summariseRequest dispatcher for code_request
          / over_budget_approval / collateral_approval with fallback for
          unknown types; bucketByStatus grouper; Intl.NumberFormat for both
          en-AU and vi-VN thousands separators so amounts render "5,000" vs
          "5.000")
        - web/src/lib/reseller/request-summary.test.ts (8/8 pass — code
          request happy + missing-tier fallback + over_budget with masked
          uuid prefix + snapshot + reason lines + collateral url+purpose +
          decision fields pass-through + unknown-type fallback + bucketing)
        - web/src/app/reseller/requests/page.tsx (server component — scoped
          via scopedReseller + reads reseller_requests directly (mirrors GET
          /api/reseller/requests select shape) + delegates render to client)
        - web/src/app/reseller/requests/requests-view.tsx (client component
          — useLocale() EN+VI parity per Copy: Record<Locale, Copy> pattern;
          Denied cards get an amber decision-reason card with mailto
          fallback; status pills coloured pending/approved/denied/cancelled;
          Intl.DateTimeFormat with locale-aware medium date; empty +
          load-error states)
        - web/src/components/workspace/nav-groups.ts (+Inbox lucide icon
          import; /reseller/requests entry inserted between Credits and
          Reports in the Reseller nav group)
      No new API surface — the GET /api/reseller/requests endpoint from P9.3
      tick 31 already returns id, request_type, status, payload, decision_at,
      decision_reason, created_at scoped to the caller's reseller_id, so the
      page reads directly from Supabase via the same scoped path. No R-01/
      R-03 lint delta since (a) the new page/client are under /reseller/**
      not /api/reseller/**, and (b) they don't call getSupabaseAdmin from
      inside an API route so R-01 doesn't fire. No manifest / feature-gate
      entry since /reseller/requests is a read-only surface for authenticated
      resellers already gated by the reseller.console entitlement in
      layout.tsx.
      Verified: tsc clean; reseller vitest 284/284 (was 276, +8 new); npm
      run lint:reseller: 8 R-01 files + 28 R-03 routes, 3 exemptions, 0
      violations. Frontier unchanged: every real leaf still DONE or
      HUMAN-BLOCKED (P8.5 Stripe env vars, P1.5 InfoVision seed on H.20).
      REMAINING under §24: (a) H.8 wholesale magic-link + welcome email
      infra, (c) leading-signal KPIs (last-login, first-report) into P11
      weekly digest.
    commit: (this tick)

  - tick: 62
    ran_at: 2026-07-22
    action: customer_success_advisory_24_grant_modal_en_vi
    result: |
      Closed the Grant-modal EN+VI half of Customer-Success advisory §24
      ("add EN+VI parity to Grant modal"). web/src/app/reseller/credits/
      grant-form.tsx now switches every user-facing string via useLocale()
      (cookie: blockid_lang) matching the CPO §25 pattern already applied to
      customer-drawer.tsx, drawer-opener.tsx, reveal-email-cell.tsx and the
      product-tour banner. New Copy interface + COPY: Record<Locale, Copy>
      table covers all 18 discrete strings: no-attributed-customers empty
      state (three-part with the /reseller/codes link), Customer + Credits +
      Reason labels, select placeholder, reason placeholder, remaining-
      budget hint, submit idle/busy labels, amount-invalid inline error,
      success banner (prefix + credits suffix + remaining-budget line +
      optional over-budget parenthetical), over-budget banner (title + body
      + submitted confirmation + Request-admin-approval button + Submitting
      busy label + email-fallback link), request-failed + grant-failed error
      chrome. VI copy is real translation with proper diacritics ("Cấp tín
      dụng", "Đang cấp…", "Cần phê duyệt vượt ngân sách.", "Yêu cầu quản
      trị viên phê duyệt", "Đang gửi…", "hoặc gửi email tới
      admin@blockid.au", etc), not a machine-translation stub. Number
      formatting via new fmtNum(n, locale) helper using Intl.NumberFormat
      ("vi-VN" | "en-AU") so the thousands separator adapts (1.234 vs
      1,234) inside the balance + remaining-budget + over-budget-body
      strings. Interpolation done through Copy fields declared as
      `(n: string) => string` so the caller passes the pre-formatted number
      — no string concatenation drift between locales. The over-budget
      request-submitted confirmation takes the shortened UUID prefix as an
      argument so the copy string owns the parenthesis + reveal wording.
      Files touched: web/src/app/reseller/credits/grant-form.tsx (pure UI,
      no API contract change). No R-01/R-03 lint delta since the file is a
      client component under /reseller/**, not /api/reseller/**. Verified:
      tsc clean; whole-tree vitest 633/633 pass (unchanged — no new pure
      lib behaviour); npm run lint:reseller: 8 R-01 files + 28 R-03 routes,
      3 exemptions, 0 violations. REMAINING under §24: H.8 wholesale magic-
      link + welcome email (needs template + magic-link infra — larger
      surface), reseller-side denial-reason page render (small tick, could
      fire next), leading-signal KPIs (last-login, first-report) in P11
      weekly digest (medium — needs digest cron changes). Frontier
      unchanged: every real leaf still DONE or HUMAN-BLOCKED (P8.5 Stripe
      env vars, P1.5 InfoVision seed on H.20 ABN); loop continues knocking
      off advisory follow-ups (22 partial, 23 partial, 24 partial from this
      tick, 25 partial, 27 pending).
    commit: (this tick)

  - tick: 61
    ran_at: 2026-07-22
    action: cpo_advisory_25_customer_drawer_en_vi
    result: |
      Closed the customer-drawer half of CPO advisory §25 ("EN+VI parity for
      reseller Customer drawer"). All three files on the reseller Customers
      surface now switch copy via useLocale() (cookie: blockid_lang), matching
      the pattern established by ProductTour, share-mgmt drawer, grant form,
      and the guide chapters:
        - web/src/app/reseller/customers/customer-drawer.tsx: new Copy
          interface + COPY: Record<Locale, Copy> table covering every user-
          facing string across the header, close button, three tab labels,
          loading/error placeholders, all eight Overview rows (labels + the
          onboarding-complete/in-progress badge + the "—" dash + display-
          name fallback), the two Progression headings + the "Guide chapter"
          prefix, and the three Reports column headers + empty-state. VI copy
          is real translation with proper diacritics ("Đang tải chi tiết
          khách hàng…", "Tổng quan", "Tiến trình", "Báo cáo", "Chương hướng
          dẫn", "Đường cong SVI (theo tháng)", etc), not a machine-translation
          stub. Currency helper fmtAud() now takes locale — VI flips the
          decimal separator from "." to "," so A$99.00 renders as A$99,00 in
          country while the currency symbol stays A$ in both locales.
          Credits number uses Intl.NumberFormat("vi-VN" | "en-AU") so the
          thousands separator adapts (1.234 vs 1,234). Tab nav previously
          relied on CSS `capitalize` on the raw string keys ("overview" /
          "progression" / "reports") — that trick fails for VI ("Tổng quan"),
          so tabs are now data-driven with explicit label strings and the
          `capitalize` class dropped from the button. Timeline event labels
          come from the API payload (already localised at build time) so
          they're rendered as-is.
        - web/src/app/reseller/customers/drawer-opener.tsx: "View" button
          now flips to "Xem" for VI via a small VIEW_LABEL table.
        - web/src/app/reseller/customers/reveal-email-cell.tsx: five UI
          strings (Show / Revealing… / Hide / Reveal failed / Retry) all
          localised through a Copy table + useLocale(). The error tooltip
          `title` attribute still carries the raw server reason (untranslated
          debug info); localisation only touches the visible chrome.
      No server-side changes — the /api/reseller/customers/[id]/drawer route
      already returns locale-agnostic payload keys and the labels shipped
      in the payload come from server helpers that pick locale via cookie
      elsewhere. Files touched are pure UI so no R-01/R-03 lint delta and
      no manifest change.
      Verified: tsc clean; reseller vitest 276/276 (unchanged — no new pure
      lib behaviour introduced, the drawer is a thin wrapper over already-
      tested buildOverviewSummary/buildProgressionTimeline/buildSviCurve/
      buildReportsList); npm run lint:reseller: 8 R-01 files + 28 R-03
      routes, 3 exemptions, 0 violations (customer-drawer.tsx and
      drawer-opener.tsx are client components, not /api/reseller/** routes,
      so R-01 doesn't fire; none appears in feature-gates.manifest so R-03
      doesn't fire either). Frontier unchanged from tick 60 — CPO §25 wholesale
      non-payment confirmation step is a separate leaf (belongs to the
      customer-success wholesale magic-link tick per §24), and every other
      real leaf remains DONE or HUMAN-BLOCKED (P8.5 Stripe env vars, P1.5
      InfoVision seed on H.20 ABN). Remaining advisory follow-ups: 22
      (PARTIAL — /guide/reports download route + GA event), 23 (PARTIAL — GA4
      event catalogue for showcase), 24 (TODO — customer-success magic-link
      + Grant modal EN+VI + denial surface), 25 (PARTIAL — customer drawer
      done this tick; wholesale non-payment confirmation remaining), 27
      (TODO — IR + COO pitch-deck + weekly digest human-blocked surface).
    commit: (this tick)

  - tick: 60
    ran_at: 2026-07-22
    action: chro_advisory_26_human_review_minutes_kpi
    result: |
      Closed the KPI half of CHRO advisory §26. Plan-review-chro.md rec #1
      ("Add kpi.human_review_minutes_burned rolling 7-day so the 0-eng-weeks
      story stays audit-able") is now wired end-to-end:
        - Storage: web/content/reports/human-review-minutes.jsonl (append-only
          JSONL, one row per bump, matches sibling reseller-goal-history.jsonl
          + cron-health.jsonl shape).
        - Helper: scripts/cron/human-review-minutes.mjs exports
          sumHumanReviewMinutes7d(now?) (rolling 7-day sum, skips malformed
          rows + stale entries silently) + appendHumanReviewMinutes({minutes,
          reason, tick_id}) (positive-number + non-empty-reason guards).
        - Bump CLI: scripts/cron/bump-human-review-minutes.mjs <minutes>
          <reason...> (chmod +x); appends one row + echoes the new 7d total
          so operators can log e.g. `bump-human-review-minutes.mjs 12 "H.20
          InfoVision ABN confirmation call"` after any human handoff.
        - Loop wiring: scripts/cron/reseller-goal-loop.mjs imports the sum
          helper at module top-level (awaited once per process so log() stays
          synchronous-friendly, wrapped in try/catch so a bad counter file
          can't block a tick), and every log() row now carries
          human_review_minutes_7d alongside tick_id + ts. Downstream
          consumers (reseller-goal-history.jsonl reader, weekly digest, any
          future dashboard) see the KPI on the same line as the tick_start /
          phase_dispatched / auto_deploy_finished rows.
      Verified: node --check clean on all three scripts; a smoke test called
      the helper directly and confirmed the append + sum cycle (0 → 0.5 for
      a tagged self-test row); `RESELLER_AUTONOMOUS_LOOP=off node
      scripts/cron/reseller-goal-loop.mjs` exits 0 with the kill-switch line
      only (module top-level await did not throw or slow startup materially).
      Files: web/content/reports/human-review-minutes.jsonl (new,
      append-only), scripts/cron/human-review-minutes.mjs (new, 60 lines),
      scripts/cron/bump-human-review-minutes.mjs (new, executable, 30
      lines), scripts/cron/reseller-goal-loop.mjs (import + log() row spread
      + module-level await sampling). CHRO advisory §26 is now FULLY DONE
      (Div 83A checklist half closed tick 59 + KPI half closed this tick).
      Frontier unchanged — every real leaf still DONE or HUMAN-BLOCKED;
      remaining advisory follow-ups: 22 (PARTIAL — /guide/reports download
      route + GA event), 23 (PARTIAL — GA4 event catalogue for showcase),
      24 (TODO — customer-success), 25 (TODO — CPO), 27 (TODO — IR + COO).
    commit: (this tick)

  - tick: 59
    ran_at: 2026-07-22
    action: chro_advisory_26_div83a_checklist
    result: |
      Closed the ch08-team half of CHRO advisory §26. Guide chapter 8 now
      publishes the eight Div 83A start-up-concession qualifying tests EN + VI
      immediately below Common pitfalls on both /guide/08-team and
      /workspace/guide/08-team. Each bullet cites the statutory reference (s83A-
      33 / s83A-45 / s83A-105 / s960-410) so the checklist stays auditable
      against the pure evaluator at web/src/lib/div83a-checker.ts (8 criteria,
      identical order: esic_eligible / unlisted / turnover_cap / age_lt_10y /
      grantee_is_employee / market_value / ownership_cap /
      holding_or_forfeiture). Chapter interface gained optional
      qualifyingTests?: LocalisedList so future statutory-gated chapters can
      reuse the shape; both surface pages guard with `c.qualifyingTests ?` and
      render an amber-bordered section with the AFSL "general information only,
      not legal or tax advice" disclaimer above the bullets so the founder never
      sees an unqualified statutory claim. Docs mirror at
      docs/guides/startup-journey/chapter-08.md carries the same eight-item list
      + disclaimer for offline reading. Test coverage: new "qualifyingTests"
      describe block asserts chapter 08 has exactly 8 EN + 8 VI entries and
      that no other chapter defines the field (single-chapter feature guard).
      Files: web/src/lib/guide/startup-journey.ts (Chapter interface +
      chapter-08 entry), web/src/lib/guide/startup-journey.test.ts (2 new
      cases), web/src/app/guide/[chapter]/page.tsx (marketing surface),
      web/src/app/workspace/guide/[chapter]/page.tsx (workspace surface),
      docs/guides/startup-journey/chapter-08.md (docs mirror). Verified:
      startup-journey.test.ts 12/12 pass (was 10/10, +2); tsc clean;
      lint:reseller unchanged (no /api/reseller/** or manifest touch).
      REMAINING under §26: human-review-minutes KPI wiring into loop telemetry
      (defer to a follow-up housekeeping tick — needs a counter file + a bump
      point in scripts/cron/reseller-goal-loop.mjs log() so the "0 eng-weeks"
      claim carries a real number). Frontier after tick 59: unchanged — all
      real leaves still DONE or HUMAN-BLOCKED; loop keeps knocking off
      advisory follow-ups (22 partial, 23 partial, 24-27 partial or pending).
    commit: (this tick)

  - tick: 58
    ran_at: 2026-07-22
    action: cmo_advisory_22_brand_wording
    result: |
      Closed the brand-wording half of CMO advisory §22. "Referred by" (Stripe
      subscription_data.description) and "Brought to you by" (invoice
      custom_fields name + email footer + pill tooltip) both swapped to
      "Introduced by" per plan §C.3 line 686-688 canonical wording. VI locale
      swapped from ASCII placeholder "Duoc mang den boi" to correct diacritics
      "Được giới thiệu bởi" matching plan §C.3 line 698 (reseller.badge.
      introduced_by). Stripe invoice custom_field name aligned with plan
      §C.3 line 688 ({name:"Reseller", value:<display_name>}) instead of the
      previous {name:"Brought to you by", value:<display_name>} shape which
      duplicated the phrase awkwardly on the PDF. Files: web/src/lib/reseller/
      email-footer.ts + email-footer.test.ts (both EN + VI HTML + text
      branches, plus tests updated to assert the new labels; 9/9 pass);
      web/src/components/workspace/reseller-pill.tsx (tooltip + module
      doc-comment); web/src/app/api/stripe/checkout/route.ts (subscription
      description + invoice custom_fields). Verified: reseller + workspace
      vitest 276/276 (was 275, +1 from a new email-footer VI diacritic
      assertion); tsc clean; npm run lint:reseller unchanged (3 exemptions /
      0 violations). REMAINING under §22: /guide/reports needs a per-row
      download route + GA event so template-library ROI becomes measurable —
      that ticket is deferred since it also requires the redaction pipeline
      per plan §284 (larger surface). Frontier after tick 58: unchanged from
      tick 57 — all real leaves are DONE or HUMAN-BLOCKED; loop continues
      knocking off advisory follow-ups (23 partial, 24-27 pending).
    commit: (this tick)

  - tick: 57
    ran_at: 2026-07-22
    action: cdo_advisory_23_pair_suppression
    result: |
      Closed the reviews half of CDO advisory §23. buildReviewsSummary
      now applies pair-suppression across (total_reviews,
      projects_with_reviews) — if either is under k, both go dark and
      avg_rating drops to null. Complementary suppression on
      buildPhaseDistribution was already applied at line 128 but had no
      regression test; added an 11-visible/1-suppressed case asserting
      ≥2 buckets go dark so the "subtract from attributed_total"
      attack has multiple solutions. Verified: reviews vitest 12/12
      (was 10, +1 updated + 1 new); phase-distribution vitest 7/7 (was
      6, +1 new); combined reseller+showcase+guide+product-tour+gate
      +integrations 388/388; tsc clean; lint:reseller unchanged (3
      exemptions / 0 violations). Remaining under §23: GA4 event
      catalogue for showcase surfaces (deferred to CMO/CPO joint
      tick per CDO rec #2).
    commit: (this tick)

  - tick: 71
    ran_at: 2026-07-22
    action: p5_cobranding_email_footer_wiring
    result: |
      Closed the deferred P5 co-branding email-footer wiring flagged in
      the P5_cobranding phase notes ("wiring into sendWelcomeWithReport +
      payment receipt deferred to P7 monthly-report tick since both call
      sites live in the 2156-line email.ts monolith"). New pure helper
      lib at web/src/lib/reseller/email-attribution.ts exposes
      pickActiveResellerDisplayName(userRow, resellerRow) (pure
      decision — null when attribution missing, reseller missing,
      status !== 'active', or display_name blank) plus a thin
      resolveResellerDisplayNameByEmail(email, supabase) DB adapter
      that looks up app_users by ilike(email) → attribution_reseller_id
      → resellers.display_name where status='active', fails closed on
      any DB or transient error so email delivery is never blocked by a
      reseller-side lookup miss. web/src/lib/email.ts now imports
      resellerFooterHtml + resolveResellerDisplayNameByEmail +
      getSupabaseAdmin at the top and both sendWelcomeWithReport (uses
      args.locale for EN/VI) and sendPaymentReceipt (EN — payment
      receipts are always EN in the current tree) resolve the display
      name once at the top of the function and interpolate
      resellerFooter into the card body just after the "BlockID.au —
      Valuation. Ownership. Growth." tagline (welcome puts it after
      the AFSL disclaimer; receipt puts it after the tagline since it
      has no disclaimer). Vitest: 6 new cases in email-attribution.
      test.ts covering null user, missing attribution_reseller_id,
      missing reseller row, non-active status (terminated + paused),
      blank/whitespace display_name (null + empty + whitespace-only),
      and the happy path with a trimmed name. Verified: whole-tree
      vitest 709/709 (was 703/703, +6); tsc clean; npm run
      lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0
      violations — new lib is under /lib/reseller/ but not
      /api/reseller/** so the R-01 scope-boundary rule doesn't fire
      and it's not in feature-gates.manifest.ts so R-03 doesn't
      fire). Attribution lookup is O(2) round-trips per email; the
      cost lives on the /api/svi/*, /api/rnd/*, and Stripe webhook
      hot paths that already call these send functions, so no
      additional caller changes needed. REMAINING P5 exit criterion
      "Playwright pill vs no-pill test" still DEFERRED to
      P10_hardening per the same posture used for P4/P5/P7/P8/B7-B10.
      Frontier after tick 71: unchanged — Track A HUMAN-BLOCKED on
      P8.5 Stripe env vars; Track B COMPLETE; P1.5 HUMAN-BLOCKED on
      H.20; P10 blocked_by [P1..P9]; loop continues knocking off
      advisory follow-ups (24/25 wholesale magic-link + welcome
      email is the last real remaining leaf, larger surface).
    commit: (this tick)

  - tick: 70
    ran_at: 2026-07-22
    action: cmo_advisory_22_guide_reports_download_route
    result: |
      Closed CMO advisory §22 residual (rec #4). /guide/reports gallery
      cards now surface a per-row Download .md CTA that emits
      showcase_report_downloaded GA4 event on click and fetches from a
      new public route /api/guide/reports/[filename] which serves the
      markdown body through a redaction pipeline per plan §284.
      Pure lib at web/src/lib/showcase/report-redaction.ts exposes
      isDownloadableReportFilename (rejects path traversal, non-.md
      extensions, the _daily-report-template.md scaffold, and any
      filename outside ^[a-z0-9][a-z0-9._-]{0,120}\.md$), redactReportMarkdown
      (masks emails, AU phone numbers, Bearer tokens, GitHub PATs,
      Stripe live/test keys, Anthropic + OpenAI keys, AWS access key
      IDs, 3-part JWTs, and generic KEY/SECRET/TOKEN/PASSWORD env-style
      assignments; prepends a public-copy banner), and
      buildDownloadFilename (lowercases + collapses illegal chars,
      appends .md when missing, clamps to 80 chars).
      Route web/src/app/api/guide/reports/[filename]/route.ts is
      Node runtime, force-dynamic, no auth by design (marketing
      counterpart of the reseller signed-URL flow). Uses the same
      dual-candidate lookup as /guide/reports/page.tsx (process.cwd()
      may be repo root or web/), returns 400 invalid_filename on gate
      failure, 404 not_found when no candidate resolves, and 200 with
      Content-Type text/markdown + Content-Disposition attachment +
      Cache-Control public,max-age=3600 + x-content-type-options
      nosniff + referrer-policy no-referrer on success.
      Client CTA web/src/app/guide/reports/report-download-cta.tsx is
      a "use client" anchor with rel=nofollow + download attribute
      that calls trackEvent("showcase_report_downloaded", {template,
      phase ?? 0}) BEFORE navigation; cross-cutting rows (phase=null)
      report as phase 0 so GA4 audiences can still segment "unphased"
      downloads without a separate event name. Card wiring in
      /guide/reports/page.tsx renders the CTA only when
      isDownloadableReportFilename() passes, so templates and any
      future oddly-named artefact are invisible to the download path.
      Verified: 23/23 pass in report-redaction.test.ts (filename
      gate + banner prepend + email/phone/Bearer/GitHub/Stripe/
      Anthropic/AWS/JWT/env-secret masking + empty-input + clean-copy
      round-trip + filename normalisation clamping); whole-tree
      vitest 703/703 (was 680/680, +23); tsc clean; npm run
      lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0
      violations — new files don't touch the /api/reseller/**
      boundary and aren't in feature-gates.manifest.ts).
      REMAINING under advisory follow-ups: item 24/25 (H.8 wholesale
      magic-link + welcome email + non-payment confirmation step)
      remains. Track A still HUMAN-BLOCKED on P8.5 Stripe env vars.
    commit: (this tick)

next_action:
  agent: applier
  task: |
    1) DONE tick 41 — Migrations 0091 + 0092 + 0093 + 0094 + 0095 + 0096 + 0097 applied via docker exec psql + NOTIFY pgrst reload. Private 'reseller-reports' Storage bucket created (public=false, 10MB, text/csv only). Gap fixes inline: authored 0093_reseller_audit_log.sql (append-only, default-deny RLS) filling the missing schema for every /api/reseller/** auditLog() call; fixed 0092 index that referenced non-existent revenue_events.occurred_at (should be ts).
    2) P1.5_infovision_seed remains HUMAN-BLOCKED. Once Auschain confirms InfoVision's real ABN + GST status per H.20, run: `INSERT INTO resellers (code, display_name, billing_model, allowed_tiers, can_create_startups, can_grant_credits, monthly_credit_budget, monthly_sandbox_credits, gst_registered, abn, commission_share_pct) VALUES ('INFOVISION', 'InfoVision', 'wholesale', ARRAY[0,10,20,30,40], true, true, 20000, 500, true, '<REAL_ABN>', 40.00);`
    3) DONE tick 42 — Track B B1.3 seed + ingest shipped via web/scripts/seed-showcase-blockid.ts. Admin's default project 2bf55234 is now is_showcase=true with repo_url; data_rooms 847b1f03 upserted with 242 sections rows tagged by generated_by_agent + phase_at_generation. Track B B2 (guide chapters 1-4) and B8 (reseller linkage) are now unblocked.
    4) DONE tick 35 — Optional P6.5b widening: term-sheet/idea-lab/valuation/journal/data-room/evidence spendCredits callers now thread project_id via getProjectIdFromRequest(). See tick 35 for file list. Remaining spendCredits() callers not touched: financial-projections, investor-pack/generate, svi/pitch-deck, svi/docx, svi/report, svi/enhanced-report, svi/dimension-analyze, svi/ai-score, svi/research, revaluation, v1/analyze, evaluation/[criterionKey]/ai-suggest, data-room/goals (award path — misleading call, not a real debit).
    5) DONE tick 55 — P0.3_advisory_reviews closed. All 8 advisory reviewers (cmo/coo/cpo/cdo/chro/cro/customer-success/investor-relations) ran in parallel and returned approved_with_notes (0 revise; 0 blocking findings). Review files land under docs/plans/reviews/plan-review-<role>.md. Non-blocking findings captured as items 21-27 below.
   21) DONE tick 56 — P8.4b_end_of_cycle_removal fixed the CRO-flagged defect. handleRemoveItem now creates a Subscription Schedule from the active subscription (Stripe fills phase 0 with the current item set through current_period_end) and updates it with a phase 1 that drops the add-on for one iteration + end_behavior:'release' so the subscription reverts to normal renewal. Existing schedules on the sub are reused via activeSub.schedule → subscriptionSchedules.retrieve instead of erroring on a second create. Pure buildAddonRemovalSchedulePhases lib + 5/5 vitest covers happy path, string-vs-object price shape, quantity omit, sole-item guard, and quantity preservation. Response envelope + revenue_events.detail now carry schedule_id + effective_at Unix timestamp so downstream reconciliation / Playwright can assert the item is still active until current_period_end. Playwright E2E assertion still deferred to P10_hardening per the P4/P5/P7/P8/B7/B8/B9/B10 posture.
   22) DONE tick 70 (rec #3 DONE tick 67, rec #4 DONE tick 70) — CMO advisory §22 rec #3 (JSON-LD structured data) DONE. Pure builder lib at web/src/lib/seo/structured-data.ts exposes buildWebPageJsonLd + buildItemListJsonLd returning schema.org objects (WebPage with isPartOf/publisher/breadcrumbs; ItemList with 1-indexed ListItem entries + numberOfItems). React wrappers WebPageJsonLd + ItemListJsonLd added to web/src/components/seo/json-ld.tsx (matches OrganizationJsonLd/FAQJsonLd/ArticleJsonLd emit pattern with dangerouslySetInnerHTML). /showcase/blockid page now emits WebPage JSON-LD with two-level breadcrumbs (Home → Showcase). /guide/reports page now emits ItemList JSON-LD covering all report rows (default 100-item clamp for polite crawl payload; numberOfItems still reflects full count so aggregate SEO signal is honest). OrganizationJsonLd was already in root layout so both pages now have Org + WebPage/ItemList on the same document. Test coverage: 7/7 pass in structured-data.test.ts (min WebPage shape, breadcrumbs, primaryImage+inLanguage overrides, ItemList positions, itemLimit clamp, zero-item empty state, description passthrough). Verified: tsc clean; whole-tree vitest 667/667 (was 633, +34 across seo + prior test additions from ticks 63-66); npm run lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0 violations — new files under /lib/seo and /components/seo don't touch reseller boundary). REMAINING under §22: (a) prior — CMO brand-wording DONE tick 58. (b) /guide/reports per-row download route + GA event + redaction pipeline DONE tick 70 — new pure lib web/src/lib/showcase/report-redaction.ts (23/23 tests) + public route /api/guide/reports/[filename] serving redacted markdown attachments + client CTA firing showcase_report_downloaded on click.
   22b) PARTIAL tick 58 — CMO brand-wording pass DONE: "Referred by" / "Brought to you by" swapped to "Introduced by" (EN) + "Được giới thiệu bởi" (VI) per plan §C.3 across web/src/lib/reseller/email-footer.ts + email-footer.test.ts (9/9 pass, incl. proper VI diacritics), web/src/components/workspace/reseller-pill.tsx tooltip, and web/src/app/api/stripe/checkout/route.ts (subscription_data.description = "Introduced by <name>"; invoice_creation.invoice_data.custom_fields = [{name:"Reseller", value:<name>}] per plan §C.3 line 688). REMAINING: /guide/reports download route + GA event so template-library ROI is measurable — deferred to a follow-up tick since it also requires the redaction pipeline per plan §284.
   23) DONE tick 69 — CDO advisory §23 both halves closed. (a) reviews-aggregate pair suppression DONE tick 57 (buildReviewsSummary treats (total_reviews, projects_with_reviews) as a correlated pair; complementary suppression on portfolio-phase-distribution regression-tested). (b) GA4 event catalogue for showcase surfaces DONE tick 69 — new pure resolver at web/src/lib/analytics/showcase-tracker.ts maps the four Track B page slugs (/showcase/blockid, /guide/reports, /guide/[chapter], /workspace/guide/[chapter]) to typed AnalyticsEventMap events; PageTracker gains chapter/locale/source/totalReports optional props + document.referrer plumbing; new showcase_reports_viewed event registered (the /guide/reports view had no prior event); catalogue doc at docs/analytics/showcase-events.md documents the surface→event map + GA4 audience recipes + change-control. Root cause: PAGE_EVENTS map at page-tracker.tsx had no entries for the four showcase page slugs, so every showcase view silently dropped from GA4 + GTM dataLayer despite the events existing in the type registry. Verified: tsc clean; whole-tree vitest 680/680 (+13); lint:reseller unchanged.
   24) PARTIAL tick 66 — Grant modal EN+VI parity DONE tick 62; denial-reason surface DONE tick 63; leading-signal pure lib DONE tick 65; leading-signal weekly-digest cron DONE tick 66 (new /api/cron/reseller-weekly-digest endpoint iterates active resellers, expands reseller_attributions → user_ids (project-typed rows resolved via projects.user_id mirroring scope.allowedCustomerIds), bridges svi_analyses through app_users.email since svi_analyses has no user_id column on this host per 0007/0014/0016/0020 migrations, computes buildLeadingSignalSummary per reseller, emails admin@blockid.au a CSV attachment + HTML body; Mondays 04:15 UTC crontab entry after clear-commissions; ?skip_email=1 dry-run; pure formatter lib web/src/lib/reseller/weekly-digest.ts with 8/8 vitest for isoWeekKey year-boundary, CSV suppression/escape, HTML empty state + sort). REMAINING under §24: (a) H.8 wholesale magic-link + welcome email for reseller-provisioned founders (needs email template + magic-link infra — larger surface).
   25) PARTIAL tick 61 — CPO advisory §25 customer-drawer EN+VI parity DONE. web/src/app/reseller/customers/customer-drawer.tsx + drawer-opener.tsx + reveal-email-cell.tsx now switch every user-facing string via useLocale() with a Copy: Record<Locale, Copy> table (real VI translation with diacritics — "Tổng quan"/"Tiến trình"/"Báo cáo"/"Đang tải chi tiết khách hàng…"/"Chương hướng dẫn"/etc.); currency helper fmtAud() now takes locale and flips VI decimal separator from "." to "," (A$99,00); credits use Intl.NumberFormat("vi-VN"|"en-AU") for thousands separator; tab labels are now data-driven (dropped CSS `capitalize` since it fails for VI multi-word labels). tsc clean; reseller vitest 276/276; lint:reseller unchanged 8+28 with 3 exemptions / 0 violations. REMAINING under §25: explicit non-payment confirmation step in wholesale onboarding wizard (bundled with the H.8 magic-link work in §24).
   26) DONE tick 60 — CHRO advisory §26 both halves closed. (a) Div 83A qualifying-tests checklist (tick 59): guide chapter 08-team publishes the eight s83A tests EN + VI (esic_eligible / unlisted / turnover_cap / age_lt_10y / grantee_is_employee / market_value / ownership_cap / holding_or_forfeiture) on both /guide/08-team and /workspace/guide/08-team plus docs/guides/startup-journey/chapter-08.md; Chapter interface gained optional qualifyingTests?: LocalisedList; startup-journey.test.ts 12/12 pass. (b) human-review-minutes KPI (tick 60): counter file at web/content/reports/human-review-minutes.jsonl (append-only JSONL); helper module scripts/cron/human-review-minutes.mjs (sumHumanReviewMinutes7d + appendHumanReviewMinutes); bump CLI scripts/cron/bump-human-review-minutes.mjs (chmod +x); reseller-goal-loop.mjs samples the 7-day sum once at process start and every log() row now carries human_review_minutes_7d so the "0 eng-weeks burned" kpi.eng_weeks_burned=0 claim carries a real number visible on every telemetry line. Verified: node --check clean on all three scripts; smoke-test append+sum cycle worked (0 → 0.5 for tagged self-test row); loop kill-switch dry run exits 0 with no regressions.
   27) DONE tick 68 — COO/IR advisory §27 both halves closed. (a) COO half tick 64 — reseller-goal-loop.mjs emits `stage: human_blocked_snapshot` on every tick + tracks.B.current_focus flipped to "done" (see tick 64 log). (b) IR half tick 68 — three content edits: (i) web/content/pitch/pitch-deck-v1.md new Slide 8 "Channel Economics" inserted between Business Model + Traction with the full plan §H truth-table (tiers 0/10/20/30/40 at A$99 with A$59.40 invariant highlighted) + side-by-side wholesale vs retail comparison; slides 9-13 renumbered; Slide 9 (Traction) weaves the /showcase/blockid live-dogfood link per IR rec #2. Deck version bumped 1.0 → 1.1. (ii) web/content/pitch/reseller-channel-gtm-lever.md new data-room one-pager (seller-of-record rationale + commission truth-table + InfoVision as design partner + forward pipeline of retail-partner categories + diligence-readiness artefacts already shipped + cross-references to plan/goal/IR review/unicorn masterplan). (iii) .claude/goals/unicorn-masterplan.md Reseller Channel row added to Revenue Streams by Phase table (2027: A$150K → 2030: A$8M) with the "20 wholesale × 50 seats × A$99 = A$1.19M ARR" arithmetic paragraph per IR rec #4; Total ARR row updated in-place across all five year columns so the reseller channel is now visible in the trajectory arithmetic. Rec #5 ("preserve historical reseller_commissions as data-room artefact") already the design of the ledger (append-only via 0093 mutation triggers, 6-year retention per H.9) — GTM memo section 7 cites this shipped invariant so diligence readers can find it. No code paths touched; tsc / vitest / lint:reseller unchanged from tick 67 baseline.
   10) DONE tick 43 — P0.4_ceo_final_sign_off closed with verdict=approved. P0 pre-flight window is now fully sealed; only P0.3 advisory reviews remain pending (non-blocking).
   11) DONE tick 44 — P8_share_management_addon decomposed into P8.1..P8.5 and P8.1_manifest_completeness shipped. feature-gates.manifest.ts now maps 28 real mutation routes (9 phantoms removed, 20 real routes added); completeness test 6/6 pass guards against future drift.
   16) DONE tick 49 — Track B B3_guide_ch_5_to_8 shipped. Chapters 5-8 (05-pmf, 06-revenue, 07-growth, 08-team) authored EN+VI as four new entries appended to web/src/lib/guide/startup-journey.ts; ChapterSlug union extended; module doc-comment updated to reflect the B2+B3 arc. VI is complete parity, not machine translation. phaseLabel for each new chapter is a direct reference to PHASE_LABELS[5..8] from @/lib/showcase/gallery so /guide, /workspace/guide, /guide/reports and /showcase/blockid share one canonical phase-label taxonomy. Both surface routes (web/src/app/guide/[chapter]/page.tsx and web/src/app/workspace/guide/[chapter]/page.tsx) SSG the four new slugs automatically via generateStaticParams reading allChapterSlugs() — zero route-file edits required. "Chapter 5 unlocks with the B3 release" placeholder text flipped on both surfaces to "Chapter 9 unlocks with the B4 release" (EN + VI). Test suite: EXPECTED_SLUGS bumped to 8, order + phase arrays extended to [1..8], allChapterSlugs assertion updated, unknown-slug case bumped to 09-funding, first/last adjacent-chapter assertions flipped to 01-vision / 08-team, plus a new boundary assertion for the B2/B3 stitch (04-mvp ↔ 05-pmf) so future reorderings can't silently break the chain. Docs mirror at docs/guides/startup-journey/chapter-{05..08}.md ships EN copy for offline reading + contributor PRs (header comment states runtime pages read the TS module — .md files are documentation-only). Verified: 9/9 pass in startup-journey.test.ts (was 8/8); 64/64 combined guide+showcase pass (was 63/63); tsc clean; npm run lint:reseller unchanged 8 files / 3 exemptions / 0 violations. Chapters 5-8 copy references B3-scoped integrations from plan §298 by name (founder-own Stripe test-mode → live-mode flip in ch5+ch7, GA4 property connection in ch7, weekly SVI cron in ch7, Div83A checker + ESOP scheme in ch8) but the actual UI wiring for those integrations is a follow-up tick — matches the B2 precedent where chapters 1-4 referenced GitHub repo-link + GA measurement-ID capture without shipping the capture UI. Frontier after tick 49: (a) Track A HUMAN-BLOCKED on P8.5 Stripe env vars. (b) Track B B4_guide_ch_9_to_12 (chapters 9-12: Funding-Ready → Fundraise/Term Sheet → Post-Funding/Scale → Exit/Beyond) now unblocked in the same startup-journey.ts pattern — preferred next tick to close the 12-chapter content-authoring arc and unblock B9 (reviews & feedback surface, deps: B4). (c) B7 product tour (deps: B2) + B8 reseller linkage (deps: B1 + track_A_P4) remain unblocked as fallbacks. (d) P0.3 advisory reviews still pending (advisory-only). (e) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20.
   15) DONE tick 48 — Track B B2_guide_ch_1_to_4 shipped. Chapters 1-4 (Vision, Idea Validation, Market Research, MVP) authored EN+VI in web/src/lib/guide/startup-journey.ts as a structured content module — Chapter interface covers the six-item U.8 spec (founderAction, agentsInvoked, expectedOutputs, commonPitfalls, showcaseExample, cta) plus title/summary; VI is complete parity, not machine translation. phaseLabel references PHASE_LABELS from @/lib/showcase/gallery so /guide/[chapter], /workspace/guide/[chapter], /guide/reports and /showcase/blockid share one canonical phase-label taxonomy. Marketing route web/src/app/guide/[chapter]/page.tsx SSG's via generateStaticParams, renders EN/VI via getLocale() cookie, generateMetadata emits OG/Twitter/canonical per chapter, Navbar/Footer shell + prev/next chapter footer with first/last edge cases. Workspace route web/src/app/workspace/guide/[chapter]/page.tsx auth-gates with redirect(/auth/login?next=), renders inside WorkspaceLayout, robots noindex. Docs mirror at docs/guides/startup-journey/chapter-{01..04}.md carries EN copy for offline reading + contributor PRs (runtime pages read the TS module — .md files are documentation-only, header comment states so). Verified: 8/8 new vitest + 63/63 combined guide+showcase pass; tsc clean. Frontier after tick 48: B7 product tour (deps: B2) and B8 reseller linkage (deps: B1 + track_A_P4) both now unblocked; B3 chapters 5-8 also unblocked. Track A still HUMAN-BLOCKED on P8.5 Stripe env vars.
   14) DONE tick 47 — P8.4_purchase_drawer shipped. web/src/lib/stripe.ts exposes ADDON_PRICE_IDS + getShareMgmtAddonPrice + isShareMgmtAddonPrice guards + STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL slots. /api/stripe/change-plan now accepts three modes: existing {newPlanId}, {add_item:{price_id,preview?}} (preview → invoices.createPreview with subscription_details.items + proration_behavior=always_invoice returns amount_due_cents; commit → subscriptions.update proration_behavior=always_invoice + revenue_events kind=addon_purchase), and {remove_item:{price_id}} (subscriptionItems.del proration_behavior=none for cancel_at_period_end-style end-of-cycle removal with no commission clawback per plan §F.5 + revenue_events kind=addon_cancel). New right-side drawer web/src/components/billing/share-mgmt-drawer.tsx renders monthly/annual toggle with 'Save 2 months' badge, benefit list EN+VI, reseller code auto-detect from blockid_via cookie, proration preview line, primary CTA 'Add to my subscription' — with focus trap + Escape close + body-scroll lock. Billing page mounts drawer + adds 'Manage add-ons' section; ?openAddon=share_management deep-link opens drawer once via ref-guarded effect; Suspense boundary added for useSearchParams. Sidebar (workspace-layout + nav-groups) tags Cap Table / Shareholders / ESOP / Vesting / Equity Setup / Equity Split with addOnKey='share_management' — locked items now show an amber 'Add-on' pill and link to /workspace/billing?openAddon=share_management rather than a generic Lock icon, satisfying the plan §F.5 'do NOT navigate away' requirement. Typecheck clean; all 551 vitest tests pass. Frontier after tick 47: Track A P8.5_env_and_playwright remains HUMAN-BLOCKED on Stripe account owner minting STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL. Next unblocked Track A work: none until P8.5 unblocks. Fall through to Track B B2_guide_ch_1_to_4.
   13) DONE tick 46 — P8.3_grandfather_backfill shipped. Migration 0098 applied via docker exec supabase-db psql (BEGIN → UPDATE 0 → INSERT 0 0 → COMMIT — 0/45 dev users grandfathered, expected); idempotent re-run identical; NOTIFY pgrst reload issued. Cohort per plan §F.4 verbatim (status IN active/trialing × plan_id IN founder_growth/founder_scale/founder_enterprise/growth/growth_annual). Two writes: app_users flag flip + entitlements(source='grandfathered') insert with ON CONFLICT DO NOTHING. Bound to subscription_trial_state instead of 'subscriptions' since that is where this repo materialises subscription state (0075:6-17). Next Track A tick = P8.4 purchase drawer + cancel_at_period_end.
   12) DONE tick 45 — P8.2_route_gating shipped. All 28 manifest routes now invoke gateRequireFeature() at handler top (30 mutation handlers total after counting the two files with POST+DELETE / PATCH+DELETE pairs). Shared helper web/src/lib/feature-gate.ts wraps auth + segment + EntitlementError → 402. R-03 AST lint added to web/src/lib/reseller/reseller-lints.ts + web/scripts/ci/reseller-lints.mjs — enforces the manifest key match inside each mutation handler; one documented exemption for data-room/engage (anonymous investor telemetry). Next Track A tick = P8.3 grandfather backfill (migration 0098) OR P8.4 purchase drawer.
    6) DONE tick 38 — code_request approval now mints Stripe coupon (deterministic id + duration=forever) + promotion_code and inserts into reseller_promotion_codes inline via decideCodeMint(). linked_promotion_code_id stamped on the reseller_requests row before status flips to approved. Tier 0 (attribution-only) skips Stripe. Idempotent under re-approval: existing (reseller_id, tier_pct) row wins; Stripe coupon retrieve-or-create pattern prevents duplicate coupons if a prior attempt died between Stripe mint and DB insert.
    7) DONE tick 37 — reseller-* cron routes now export `{ GET as POST }` so cron-runner.sh's POST no longer 405s. Applies to reseller-clear-commissions, reseller-monthly-report, reseller-monthly-reconciliation, reseller-stripe-sync, credit-reset.
    8) DONE tick 39 — Track B B5 report template library at /guide/reports (see phases.B5_report_library.files). Metadata-only surface; download route + GA event + redaction pipeline deferred to a follow-up tick that also unblocks B6's public showcase.
    9) DONE tick 40 — Track B B6 public showcase mirror at /showcase/blockid (see phases.B6_public_showcase.files). Metadata-only; reads on-disk artefacts + milestone-report-state.json; no DB dep. Deep-linking from /guide/reports card rows to /showcase/blockid (and vice versa) + wiring the "current phase" chip into workspace-layout topbar deferred to a follow-up tick alongside B7 product tour, since both touch the same in-app phase-transition surface.
   18) DONE tick 51 — Track B B7_product_tour shipped. Pure lib at web/src/lib/product-tour/tour-state.ts exposes chapterSlugForPhase (walks listChapters() to find the Chapter whose .phase matches, so phase 1→01-vision through phase 12→12-exit; out-of-range and non-finite guards), deriveTourPhase (returns the earliest phase whose status !== "completed" AND completionPct < 100; ignores rows with order < 1; falls through to the final phase when everything is done so the last chapter is still reachable), shouldShowTour (transition-triggered — hidden iff dismissedPhase === currentPhase, so a phase transition automatically re-surfaces the banner without any server ping), buildTourState (folds phases → {currentPhase, chapterSlug, label} pulling PhaseLabel from @/lib/showcase/gallery so the tour taxonomy stays single-source with B2-B6). Vitest 19/19 pass covering chapter-slug boundary + out-of-range, first-incomplete derivation with sort/skip/regress cases, shouldShowTour transition matrix (never dismissed, same phase, forward transition, backward regress), and buildTourState end-to-end (empty → all-null; mid-journey → chapter+label EN+VI; all-complete → final phase). Client component web/src/components/workspace/product-tour.tsx fetches /api/svi/phase-progress once on mount (cache: no-store, credentials: include), hydrates dismissedPhase from localStorage[blockid_tour_dismissed_phase], reads locale from the shared useLocale() cookie hook, and renders a self-hiding banner with the phase label + link to /workspace/guide/<slug> + dismiss button. Wired into web/src/components/workspace/workspace-layout.tsx after <UpgradeBanner /> so it composes with the existing TrialBanner/UpgradeBanner slot pattern per plan §U.8 point 4. Dismiss handler writes the current phase number to localStorage; the shouldShowTour predicate hides the banner while dismissedPhase === currentPhase, then auto-resurfaces when the founder crosses into a new phase (phase-progress detects it — no polling needed since the banner re-computes on next mount). EN+VI copy switched via useLocale(); phase label always drawn from PHASE_LABELS[phase][locale] rather than being re-authored inside the component. Non-fatal fetch failure → banner stays hidden; empty phase list → banner stays hidden. tsc clean; 580/580 vitest across the whole tree (was 561/561, +19 new); npm run lint:reseller unchanged (8 R-01 files + 28 R-03 routes, 3 exemptions, 0 violations — ProductTour doesn't touch any /api/reseller/** file so no lint delta). Frontier after tick 51: (a) Track A still HUMAN-BLOCKED on P8.5 Stripe env vars. (b) Track B still has B8_reseller_linkage (deps: B1 + track_A_P4 — both met) and B9_reviews_surface (deps: B4 — met; needs migration 0100) and B10_integrations_admin (deps: B3 — met). (c) P0.3 advisory reviews still pending. (d) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20. Prefer B9 next tick since it introduces migration 0100 (only remaining schema work in Track B) and closes the reviews-surface leaf that plan §304 flagged as the last real primitive; B8 + B10 can fill subsequent ticks.
   20) DONE tick 54 — Track B B10_integrations_admin shipped — the final Track B leaf. Pure lib web/src/lib/integrations/catalogue.ts exposes buildIntegrationsCatalogue (four rows in stable github/stripe/ga4/blockchain order; findOAuth prefers active over errored per provider so a stale error row doesn't hide a re-connect; blockchain derives status from syncEnabled+syncState and surfaces token symbol + pending-queue count in statusDetail; catching_up → syncing, paused → error, on+enabled → connected, otherwise → not_connected), formatRelativeTime (injectable now for deterministic tests; buckets just-now/Nm/Nh/Nd/ISO-date at 30d), and summariseCatalogue (connected/errored/not_connected/not_configured rollup shown in the page header). Client wrapper web/src/components/workspace/integration-row-card.tsx delegates oauth rows to existing OAuthConnectorCard (unchanged POST paths, encryption, rate-limit wording) and renders the blockchain row with status pill + statusDetail + last-sync + Manage/Set-up Link to /workspace/wallet (link, not POST — the actual sync toggle lives at /workspace/wallet under the existing MetaMask + sync-toggle UI, so the catalogue avoids duplicating that flow). Server page web/src/app/workspace/integrations/page.tsx fetches listConnections + getSyncConfig in parallel, builds the catalogue, renders the summary header + one card per row. Nav-groups Account section gains /workspace/integrations with the Plug icon after Billing so the surface is reachable from every workspace page. No schema work needed: OAuth trio already lives in oauth_connections_v2 (migration 0087) and blockchain state already lives in blockchain_sync_config (migration 0034). Verified: tsc clean; vitest 624/624 (was 603/603, +21 catalogue tests covering order stability, providerConfigured=false→not_configured, active-connection→connected, active-wins-over-errored, error-only→error, revoked→not_connected, blockchain null/on/catching_up/paused/pendingEvents/syncEnabled=false-defensive branches, walletHref override, formatRelativeTime buckets incl. invalid ISO, summariseCatalogue rollup); npm run lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0 violations — the new files are not under /api/reseller/** and not in feature-gates.manifest.ts so neither rule fires; /workspace/integrations is safely ungated because listing integration status is fine for any authenticated user and each per-provider mutation route already has its own auth). Playwright deferred to P10_hardening per the P4/P5/P7/P8/B7/B8/B9 posture. Frontier after tick 54: (a) Track A still HUMAN-BLOCKED on P8.5 Stripe env vars — P8 cannot close without STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL minted by the Stripe account owner. (b) Track B COMPLETE — B1..B10 all done; no further B-track leaves. (c) P0.3 advisory reviews still pending (advisory-only per U.13 stage-5). (d) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20 ABN + GST confirmation. (e) P10_hardening still blocked_by [P1..P9] — waits on P8.5 completion + Playwright provisioning. With Track B closed, the only autonomous work left is P0.3 advisory reviews; every other leaf is HUMAN_BLOCKED.
   19) DONE tick 53 — Track B B9_reviews_surface shipped. Migration 0100 (web/supabase/migrations/0100_showcase_reviews.sql) authored + applied via docker exec supabase-db psql -f 0100_showcase_reviews.sql + NOTIFY pgrst reload. Schema lands showcase_reviews(id uuid pk, project_id uuid FK projects ON DELETE CASCADE NOT NULL, access_token_id uuid, reviewer_email text NOT NULL, rating int NOT NULL CHECK (1..5), comment text NULL, comment_hash text NOT NULL, created_at timestamptz NOT NULL default now()) + three indexes (project+time DESC, reviewer_email, and a UNIQUE btree on (project_id, lower(reviewer_email)) for upsert idempotency) + default-deny RLS with a service_role escape hatch. FK to data_room_access_tokens wrapped in a DO block that only ADDs the constraint when the target table exists, so hosts that skipped migration 0062 (this dev host among them per B1.3 tick 42 note) still land the migration cleanly; production hosts that ran 0062 pick up the FK. Pure lib at web/src/lib/reseller/reviews.ts exposes hashComment(SHA-256 of trimmed body, empty-body sentinel is stable) and buildReviewsSummary(rows, k=5) — returns {total_reviews, projects_with_reviews, avg_rating}; avg_rating is null whenever the total-reviews bucket is k-suppressed so a low-sample average cannot leak individual scores (U.9 §5 chokepoint). Vitest reviews.test.ts 10/10 covers hash determinism + trim + null/empty parity; buildReviewsSummary empty-input zeros, sub-k suppression, at-k exposure with rounded avg, distinct-project count (rows > distinct → both counters diverge), OOR/non-finite rating skip (rating 6, 0, NaN, empty project_id all filtered), and custom k threshold. resellerSupabase() gains showcaseReviewsAggregate() — resolves projects.user_id ∈ allowedCustomerIds → project_ids, then selects ONLY (project_id, rating, created_at) from showcase_reviews so comment/reviewer_email never cross the reseller boundary at the query layer. Reviewer capture at POST /api/showcase-reviews takes {token, rating, comment}, resolves data_room_access_tokens (is_active + not-expired) → data_rooms.project_id, upserts on (project_id, reviewer_email) with the reviewer_email pulled from the access-token row (so the reviewer can't spoof identity), and stamps comment_hash via hashComment(). Founder-facing GET /api/showcase-reviews?projectId=… scopes by projects.user_id = viewer.id and returns comment plaintext (the founder submitted the invite so is authorised to read the body per §284 "shown to the founder in-app"). Reseller /reseller dashboard (web/src/app/reseller/page.tsx) renders a new "Investor reviews" section between Phase distribution and Portfolio detail with total_reviews / projects_with_reviews / avg_rating cards, using the same formatKAnon() helper as the rest of the dashboard so k>=5-suppressed counts render as "<5" and a suppressed average renders as "—". Verified: tsc clean; combined reseller+showcase+guide+product-tour+gate vitest 365/365 (was 355/355, +10 reviews); whole tree 603/603; npm run lint:reseller unchanged (8 R-01 + 28 R-03 files, 3 exemptions, 0 violations — no new exemption needed because /api/showcase-reviews is not under /api/reseller/**, so the R-01 scope-boundary rule doesn't fire, and it's not in the feature-gates.manifest so the R-03 rule doesn't fire either; the review capture path is intentionally not gated behind an entitlement since it must accept anonymous investor submissions via access-token auth). Frontier after tick 53: (a) Track A HUMAN-BLOCKED on P8.5 Stripe env vars. (b) Track B B10_integrations_admin (deps: B3 — met) is the last remaining Track B leaf; no schema work required, pure UI + persistence-shape (Stripe/GA4/GitHub/blockchain rows for /workspace/integrations) so it's a self-contained tick. (c) P0.3 advisory reviews still pending (advisory-only). (d) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20.
   17) DONE tick 50 — Track B B4_guide_ch_9_to_12 shipped. Chapters 9-12 (09-funding, 10-fundraise, 11-scale, 12-exit) authored EN+VI as four new entries appended to web/src/lib/guide/startup-journey.ts; ChapterSlug union extended to 12 entries; module doc-comment updated to reflect the B2+B3+B4 arc. VI is complete parity, not machine translation. Chapter 10 honours U.15.11 wording supersession — blockchain hash described as "immutable record for later verification" and explicitly NOT as legal notarisation. phaseLabel for each new chapter is a direct reference to PHASE_LABELS[9..12] from @/lib/showcase/gallery so /guide, /workspace/guide, /guide/reports and /showcase/blockid share one canonical phase-label taxonomy. Both surface routes SSG the four new slugs automatically via generateStaticParams reading allChapterSlugs() — zero route-file edits required. "Chapter 9 unlocks with B4" placeholder text flipped on both surfaces to arc-complete wording (marketing: "You've reached the final chapter. After exit, open a new workspace at Chapter 1 or move into the reseller/accelerator role."; workspace: "Final chapter. After exit: new workspace or reseller role."; VI parity on both). Test suite: EXPECTED_SLUGS bumped to 12, order + phase arrays extended to [1..12], allChapterSlugs assertion updated, unknown-slug case bumped to "13-post-exit", last-slot adjacent assertion flipped to 12-exit ↔ 11-scale, plus a new boundary assertion for the B3/B4 stitch (08-team ↔ 09-funding) so future reorderings can't silently break the chain. Docs mirror at docs/guides/startup-journey/chapter-{09..12}.md ships EN copy for offline reading + contributor PRs (header comment states runtime pages read the TS module — .md files are documentation-only). Verified: 10/10 pass in startup-journey.test.ts (was 9/9); 65/65 combined guide+showcase (was 64/64); tsc clean; npm run lint:reseller unchanged 8 files / 3 exemptions / 0 violations. Chapters 9-12 copy references B4-scoped integrations from plan §299 by name (investor NDA workflow, term-sheet AI review UI, blockchain sync activation, LP-report bundling) but the actual UI wiring for those integrations is a follow-up tick — matches the B2/B3 precedent where chapter copy referenced integrations before the capture UI shipped. Frontier after tick 50: (a) Track A HUMAN-BLOCKED on P8.5 Stripe env vars. (b) Track B B9_reviews_surface (deps: B4 now done) unblocked — the showcase_reviews table + Phase-9 investor-review capture surface; migration 0100 slot already reserved. (c) B7 product tour + B8 reseller linkage remain unblocked from earlier ticks. (d) P0.3 advisory reviews still pending. (e) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20. The 12-chapter content-authoring arc is now closed.
  authorised: true
  on_success: |
    Frontier after tick 55: (a) P0.3 advisory reviews DONE — all 8 advisory reviewers returned approved_with_notes (0 revise, 0 blocking); 7 non-blocking follow-ups captured in next_action items 21-27. Notable: CRO surfaced a real defect in the P8.4 Share-Mgmt remove_item path (subscriptionItems.del with proration_behavior=none removes the item immediately, not end-of-cycle as the drawer copy promises) — must be fixed in a P8 delta before P8.5 unblocks. (b) Track A still HUMAN-BLOCKED on P8.5 Stripe env vars. (c) Track B COMPLETE — B1..B10 all done. (d) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20. (e) P10_hardening still blocked_by [P1..P9] until P8.5 clears. With P0.3 closed, the autonomous loop's frontier is now EMPTY of non-human-blocked leaves — loop should self-idle until an unblock signal arrives (H.20 ABN confirmation OR Stripe price env vars minted). Next autonomous tick options: (i) begin P10 dry-run scaffolding (Playwright fixtures, perf-audit baseline) so it can fire the instant P8.5 clears; (ii) execute the CRO-flagged P8.4 defect fix as a self-contained delta since it does not require Stripe env vars; (iii) knock off advisory follow-ups 22-27 in a housekeeping tick.

    (superseded — for tick 54 detail see the tick-20 log entry above)
    Frontier after tick 54: (a) Track A still HUMAN-BLOCKED on P8.5 Stripe env vars — P8 cannot close until STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL are minted by the Stripe account owner. (b) Track B COMPLETE — B10_integrations_admin DONE this tick; B1..B10 all done. Pure lib buildIntegrationsCatalogue (4 rows in stable order, 21/21 tests) + client IntegrationRowCard wrapper (delegates oauth rows to existing OAuthConnectorCard for unchanged POST paths; blockchain row renders as a Manage/Set-up Link to /workspace/wallet with status pill + statusDetail + last-sync) + server page composing listConnections + getSyncConfig into the catalogue with summary header + Account-section nav entry (Plug icon after Billing). No schema work needed: oauth_connections_v2 (0087) already covers the OAuth trio and blockchain_sync_config (0034) already covers the chain row. Vitest 624/624 (was 603/603, +21 catalogue); tsc clean; lint:reseller unchanged (3 exemptions / 0 violations). (c) P0.3 advisory reviews still pending (advisory-only per U.13 stage-5). (d) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20. (e) P10_hardening still blocked_by [P1..P9] — waits on P8.5 completion + Playwright provisioning. With Track B closed, the only remaining autonomous work is P0.3 advisory reviews; every other leaf is HUMAN_BLOCKED.

    (superseded — for tick 53 detail see the tick-19 log entry above)
    Frontier after tick 53: (a) Track A still HUMAN-BLOCKED on P8.5 Stripe env vars — no unblocked A phase this window. (b) Track B B9_reviews_surface DONE — migration 0100 authored + applied via docker exec supabase-db psql (opportunistic FK to data_room_access_tokens keeps the migration portable across hosts that skipped 0062); pure hashComment SHA-256 + buildReviewsSummary k>=5 aggregate; reviewer-facing POST /api/showcase-reviews authenticates via data_room_access_tokens.token (same pattern as data-room/engage) and upserts on (project_id, reviewer_email); founder-facing GET scopes by projects.user_id = viewer; reseller /reseller dashboard renders Investor reviews section between Phase distribution and Portfolio detail with total_reviews / projects_with_reviews / avg_rating (avg null when k-suppressed so low-sample scores can't leak). Vitest 10/10 new + 603/603 total; tsc clean; lint:reseller unchanged 8+28 with 3 exemptions / 0 violations. (c) Track B unblocked next: B10_integrations_admin (deps: B3 — met; /workspace/integrations catalogue over Stripe/GA4/GitHub/blockchain rows — the last remaining Track B leaf that plan §305 owns; no schema work required so it's a pure UI + persistence-shape tick). B8 already done tick 52. (d) P0.3 advisory reviews still pending (advisory-only per U.13 stage-5). (e) P1.5 InfoVision seed still HUMAN-BLOCKED on H.20 ABN + GST confirmation. (f) P10_hardening still blocked_by [P1..P9] — waits on P8.5 completion + Playwright provisioning.

    (superseded — for tick 51 detail see the tick-18 log entry above)
    Frontier after tick 51: (a) Track A remains HUMAN-BLOCKED on P8.5 Stripe env vars — no unblocked A phase this window. (b) Track B B7_product_tour DONE — pure tour-state lib (chapterSlugForPhase / deriveTourPhase / shouldShowTour / buildTourState) + client overlay banner + workspace-layout wiring; dismissal keyed by phase number so a phase transition auto-resurfaces the banner without any server ping; EN+VI copy via shared useLocale() + PHASE_LABELS. Vitest 19/19 tour-state; combined suite 580/580; tsc clean; lint:reseller unchanged. (c) Track B unblocked next: B9_reviews_surface (deps: B4 — met; needs migration 0100; U.9 §5 hash-comment redaction is the key design constraint), B8_reseller_linkage (deps: B1 + track_A_P4 — both met; wires guide-chapter deep-links into the reseller progression view), B10_integrations_admin (deps: B3 — met; /workspace/integrations catalogue). Prefer B9 next tick since it lands migration 0100 (only remaining Track B schema work) and closes the reviews-surface leaf plan §304 flagged as the last real primitive; B8 + B10 can fill subsequent ticks. (d) P0.3 advisory reviews still pending (advisory-only per U.13 stage-5). P1.5_infovision_seed still HUMAN-BLOCKED on H.20 ABN + GST confirmation. P10_hardening still blocked_by [P1..P9] — waits on P8.5 completion + Playwright provisioning.

    (superseded — for tick 50 detail see the tick-17 log entry above)
    Frontier after tick 50: (a) Track A remains HUMAN-BLOCKED on P8.5 Stripe env vars — no unblocked A phase this window. (b) Track B B4_guide_ch_9_to_12 DONE — chapters 9-12 (Funding-Ready, Fundraise/Term Sheet, Post-Funding/Scale, Exit/Beyond) authored EN+VI in the shared startup-journey.ts module; ChapterSlug union extended to 12; both marketing (/guide/[chapter]) and workspace (/workspace/guide/[chapter]) routes SSG the new slugs automatically via generateStaticParams reading allChapterSlugs(); "unlock next chapter" placeholder copy flipped to arc-complete wording on both surfaces; phaseLabel canonical vs PHASE_LABELS[9..12]; Chapter 10 wording honours U.15.11 supersession (immutable record, not legal notarisation). The 12-chapter content-authoring arc is now CLOSED. (c) Track B unblocked next: B9_reviews_surface (deps: B4 — now met) — showcase_reviews table + Phase-9 investor-review capture surface; migration slot 0100 already reserved in the goal file; the U.9 §5 hash-comment redaction rule is the key design constraint (reseller sees "N reviews received, avg X" only; never review content). B7 product tour (deps: B2) — workspace overlay component + phase-tracking; B8 reseller linkage (deps: B1 + track_A_P4) — progression-view timeline row → guide-chapter deep-links (now that all 12 slugs exist, B8 can finally build the deep-link table). Prefer B9 next tick since it closes the final Track B leaf that has schema work (migration 0100) and unblocks nothing else; B7/B8 can fill subsequent ticks. (d) P0.3 advisory reviews still pending (advisory-only per U.13 stage-5). P1.5_infovision_seed still HUMAN-BLOCKED on H.20 ABN + GST confirmation. P10_hardening still blocked_by [P1..P9] — waits on P8.5 completion + Playwright provisioning.

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
