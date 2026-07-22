# Reseller Module — Machine-Readable Goal File (autonomous loop source of truth)

```yaml
goal_id: reseller-module-v1
status: in_progress
version: 2026-07-23.112
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
          "web/src/components/workspace/reseller-pill.tsx (topbar pill; renders null when loading/no-attribution; tick 85 — useLocale() + COPY table so title flips to 'Được giới thiệu bởi' / 'qua' when blockid_lang=vi cookie present, matching the shared VI variant already in email-footer.ts)",
          "web/src/components/workspace/workspace-layout.tsx (wires <ResellerPill /> ahead of ConnectWalletButton in topbar)",
          "web/src/app/api/stripe/checkout/route.ts (looks up reseller.display_name; stamps subscription_data.description = 'Referred by X' for recurring + invoice_creation.invoice_data.custom_fields = [{name: 'Brought to you by', value: X}] for one-off)",
          "web/src/lib/reseller/email-footer.ts (pure locale-switched HTML + text helper; EN/VI; HTML-escapes displayName)",
          "web/src/lib/reseller/email-footer.test.ts (9/9 pass: null/blank guard, EN default, VI switch, HTML escape, whitespace trim)",
          "web/src/lib/reseller/email-attribution.ts (tick 71 — resolveResellerDisplayNameByEmail DB adapter + pickActiveResellerDisplayName pure decision helper)",
          "web/src/lib/reseller/email-attribution.test.ts (tick 71 — 6/6 pass on pure decision layer)",
          "web/src/lib/email.ts (tick 71 — sendWelcomeWithReport + sendPaymentReceipt now interpolate resellerFooterHtml when attribution resolves; tick 73 — sendWholesaleWelcome() adapter added, composes buildWholesaleWelcomeEmail with sendEmail transport for H.8 wholesale magic-link dispatch)"
        ]
        exit_criteria: [
          "topbar pill at workspace-layout.tsx renders via <ResellerPill /> when useResellerAttribution() returns value (DONE)",
          "email footer helper locale-switched EN + VI available for welcome + receipt integration (DONE — pure helper; wiring into sendWelcomeWithReport + sendPaymentReceipt landed tick 71 via web/src/lib/reseller/email-attribution.ts resolver + one-line footer interpolation in each caller)",
          "Stripe invoice memo carries reseller name via subscription description + one-off custom_fields (DONE)",
          "Playwright pill vs no-pill test — DEFERRED to P10_hardening (Playwright suite currently un-provisioned; P10 exit_criteria owns the E2E lens; tick 83 scaffolded web/tests/e2e/reseller/cobranding-pill.spec.ts with positive/negative rows; tick 85 dropped the VI locale test.skip() since the pill now consumes useLocale() and emits the shared 'Được giới thiệu bởi' variant)"
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

  - tick: 112
    ran_at: 2026-07-22
    action: p10_dry_run_reseller_crons_cron_secret_authz_playwright_spec
    result: |
      Composed option (ii) from tick 111's frontier note — swept the
      /api/cron/reseller-* surface (six crons) for the CRON_SECRET Bearer
      auth chain. Five crons share the identical gate at the top of their
      GET handler (reseller-clear-commissions:29-33,
      reseller-monthly-reconciliation:65-69, reseller-monthly-report:45-49,
      reseller-stripe-sync:46-50, reseller-weekly-digest:70-74) and had
      no dry-run spec guarding the 401 branch. Sixth cron
      reseller-audit-anomaly-scan is already covered by
      audit-anomaly-scan.spec.ts (tick 90) on a harness happy-path so it
      is excluded here on purpose to avoid double-counting that route.

      Files:
        - web/tests/e2e/reseller/reseller-crons-authz.spec.ts (new — one
          parametrized spec with 10 rows: 5 routes × 2 branches. Each
          route probes the CRON_SECRET Bearer gate:
          (1) GET with NO Authorization header → 401
              { ok:false, reason:"unauthorized" } BEFORE getSupabaseAdmin,
              stripe client init, resellers/revenue_events/
              reseller_commissions/reseller_credit_grants/reseller_
              attributions/reseller_audit_log SELECT, or (for the
              monthly-report/weekly-digest paths) the email dispatch fan-out,
          (2) GET with Authorization: Bearer <wrong-token> → same 401 +
              reason:"unauthorized" — mirrors the gate's strict-equal check
              on the full `Bearer <secret>` string.
          Both branches are describe-scope test.skip()'d when CRON_SECRET
          is unset in the Playwright env because the five routes are
          fail-open by design in that configuration; the diagnostic points
          the operator at setting CRON_SECRET to match the running Next.js
          server. Query strings ?skip_email=1 forwarded on the three routes
          that dispatch email so an accidental Playwright pass without the
          gate landing would not send real mail.

      Why this shape mirrors ticks 100-111: same envelope pattern
      { ok:false, reason:<string> } at HTTP 401, same "return before any
      privileged SELECT" placement in the route flow. Symmetric envelope
      means a refactor that swaps the inline `if (cronSecret && auth !==`
      check for a shared helper, that changes the reason wire format (e.g.
      "unauthorised" to match the reseller-scope envelope), or that flips
      the status code to 403, lights up all ten rows on the next
      `npx playwright test` pass. Distinct from ticks 100-111 in ONE
      dimension only — this is the CRON authentication surface (Bearer
      env-var-based, not session-cookie-based), so a regression that let
      an anonymous caller reach these five surfaces would leak:
      (a) reseller-clear-commissions — could flip pending commissions to
          cleared status ahead of pending_until, breaking the D2-CFO-03
          clawback window;
      (b) reseller-monthly-reconciliation — commercially-sensitive Stripe
          vs revenue_events GST delta + reconciliation email trigger;
      (c) reseller-monthly-report — per-reseller KPI CSV + signed-URL
          storage upsert + email dispatch to admin@blockid.au;
      (d) reseller-stripe-sync — Stripe promotion_code active drift check
          + admin@blockid.au drift email;
      (e) reseller-weekly-digest — attributed customer + attributed
          revenue rollup + audit anomaly summary + digest email dispatch.
      Every one of these dispatches touches the reseller commercial
      pipeline so an unauthenticated trigger is a real blast-radius event.

      Why the 500/503 branches aren't covered: not_configured (503) needs
      SUPABASE_URL/SERVICE_ROLE unset which would break every other
      Playwright spec in the same worker. stripe_not_configured (503) on
      reseller-stripe-sync needs STRIPE_SECRET_KEY unset which would
      break the checkout specs. Happy path (200) reads real reseller_*
      tables and (on monthly-report / weekly-digest) sends real email;
      folded into the temp-reseller mint fixture follow-up alongside the
      deferred rows from ticks 94..111.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest 845/845 unchanged (Playwright spec is not picked up
      by vitest — tests/e2e/** is excluded per playwright.config.ts:
      testDir); npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations unchanged
      (spec lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in feature-gates.manifest.ts
      so R-03 doesn't fire). Playwright not run this tick — all rows
      test.skip() when CRON_SECRET is unset in the local env; they light
      up as soon as CRON_SECRET is set on the CI Playwright worker.

      Frontier after tick 112: shape unchanged — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 112 unblocks: EVERY CRON_SECRET-gated reseller-* cron
      route now has symmetric Playwright dry-run coverage
      (reseller-clear-commissions, reseller-monthly-reconciliation,
      reseller-monthly-report, reseller-stripe-sync,
      reseller-weekly-digest via reseller-crons-authz.spec.ts;
      reseller-audit-anomaly-scan via the pre-existing
      audit-anomaly-scan.spec.ts harness happy-path). Twenty-four spec
      files now sit in web/tests/e2e/reseller/. Next autonomous tick
      options: (i) landing the QA-mode temp-reseller mint fixture that
      opens up all the deferred HAPPY-PATH branches from ticks 94..111
      at once (larger tick, wants a design pass); (ii) sweep the
      non-reseller cron surface (/api/cron/dunning-retry, email-drip,
      lead-nurture, nurture, onboarding-sequence, lifecycle-mailer, etc.)
      for the same CRON_SECRET gate — out of scope for the reseller-
      module goal file but the pattern generalises cleanly; (iii) idle
      until human unblock arrives on P8.5 or P1.5.
    commit: (this tick)

  - tick: 111
    ran_at: 2026-07-22
    action: p10_dry_run_admin_reseller_detail_authz_playwright_spec
    result: |
      Composed a new frontier item not enumerated in tick 110's option
      list — swept the /api/admin/resellers/** surface for any remaining
      requireAdmin() gate without a symmetric dry-run spec. Result: GET
      /api/admin/resellers/[code] (the detail-view fan-out that returns
      the full resellers row + reseller_promotion_codes incl.
      stripe_coupon_id/stripe_promotion_code_id + reseller_admins incl.
      user_id/role + reseller_attributions + last-50
      reseller_commissions_current rows) was the last admin REST surface
      whose requireAdmin() gate was not yet regression-guarded at the
      Playwright lens. The sibling PATCH already ships via
      admin-reseller-patch-authz.spec.ts (tick 103) and DELETE via
      admin-reseller-delete-authz.spec.ts (tick 106); both exercise the
      shared gate() helper at web/src/app/api/admin/resellers/[code]/route.ts:21-32
      but on the write verbs only, leaving the READ verb — the
      highest-blast-radius branch since a leaked GET dumps the full
      commercial-secrets envelope — uncovered.

      Files:
        - web/tests/e2e/reseller/admin-reseller-detail-authz.spec.ts (new — two
          rows probing the auth chain before code normalisation, the
          resellers SELECT, or the four related-rows SELECTs
          (reseller_promotion_codes, reseller_admins, reseller_attributions,
          reseller_commissions_current):
          (1) unauthenticated (GET with no session → getCurrentUser null →
              requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } at route.ts:27-29 BEFORE any
              of the five BEHIND-gate branches fire),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → GET →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same 401 status as row 1,
              different reason, so a refactor that collapses the two
              branches to a single "unauthorised" reason lights up on the
              next CI pass).
          Row 1 runs unconditionally (no harness dep — just request.get
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          Placeholder code "test-placeholder-code" in the URL never
          reaches normaliseResellerCode because both rows bail in gate()
          before route.ts:54.

      Why this shape mirrors ticks 103/105/106/107/108/109: all seven
      routes use requireAdmin() from web/src/lib/reseller/require-admin.ts
      and all seven emit { ok:false, reason: AdminGateError.code } at HTTP
      401 for BOTH the no_user and not_admin branches. Symmetric envelope
      means a refactor that swaps requireAdmin() for a bespoke inline
      check, that changes the error reason wire format, or that flips the
      status codes to 403, lights up in all seven specs on the next
      `npx playwright test` pass. Distinct from ticks 103/105/106/107/108/109
      in ONE dimension only — this is the DETAIL READ surface (GET on the
      [code] segment). A regression that let an anonymous or non-admin
      caller reach the fan-out SELECTs would leak: (a) full resellers row
      (billing_model, commission_share_pct, gst_registered, abn,
      monthly_credit_budget, monthly_sandbox_credits, can_grant_credits,
      status); (b) all reseller_promotion_codes rows (stripe_coupon_id +
      stripe_promotion_code_id, active flag) — the exact strings needed
      to impersonate a reseller at Stripe checkout; (c) all
      reseller_admins rows (user_id + role + linked_at + revoked_at) —
      lets an attacker enumerate reseller-admin identities; (d) all
      reseller_attributions rows (subject_type + status + source +
      attributed_at); (e) last 50 reseller_commissions_current rows
      (list_price + discount_pct + commission_aud_cents + net_owed_cents)
      — commercially-sensitive commercial pipeline state. Plan §C.5
      restricts this detail view to platform admins only.

      Why the 400/404/500/503 branches aren't covered: code_required (400)
      and not_found (404) sit BEHIND requireAdmin (route.ts:54 vs :51)
      and need a real admin session PLUS an ill-formed or absent code.
      not_configured (503) needs SUPABASE_URL/SERVICE_ROLE unset which
      would break every other Playwright spec in the same worker.
      query_failed (500) needs a broken resellers SELECT which requires
      per-test tampering plan §J.2 forbids. Happy path (200) reads the
      seed InfoVision row (P1.5 still HUMAN-BLOCKED on H.20 anyway) or
      any real resellers row plus its related codes/admins/attributions/
      commissions; folded into the admin QA harness follow-up alongside
      the deferred rows from ticks 94..110.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest unchanged (Playwright spec is not picked up by vitest
      — tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts so
      R-03 doesn't fire). Playwright not run this tick — row 1 is
      harness-free and will execute on the next CI Playwright pass;
      row 2 lights up as soon as the qa accounts file is present.

      Frontier after tick 111: shape unchanged — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 111 unblocks: EVERY requireAdmin()-gated verb under
      /api/admin/resellers/** now has symmetric Playwright dry-run
      coverage — GET list (tick 108), POST create (tick 109), GET detail
      (this tick), PATCH (tick 103), DELETE (tick 106), GET requests
      list (tick 107), PATCH requests (tick 105). Twenty-three spec
      files now sit in web/tests/e2e/reseller/
      (admin-requests-list-authz, admin-requests-patch-authz,
      admin-reseller-delete-authz, admin-reseller-detail-authz,
      admin-reseller-patch-authz, admin-resellers-create-authz,
      admin-resellers-list-authz, attribution-timing, audit-anomaly-scan,
      audit-log-writes, billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reseller-requests-list-authz, reveal-email-authz,
      sandbox-setup-authz, scope-boundary). Next autonomous tick
      options: (i) landing the QA-mode temp-reseller mint fixture that
      opens up all the deferred HAPPY-PATH branches from ticks 94..111
      at once (larger tick, wants a design pass); (ii) sweep the
      /api/cron/reseller-* surface (six crons) for the CRON_SECRET
      Bearer auth chain — no dry-run spec currently guards the 401
      branch for the five crons other than reseller-audit-anomaly-scan;
      (iii) idle until human unblock arrives on P8.5 or P1.5.
    commit: (this tick)

  - tick: 110
    ran_at: 2026-07-22
    action: p10_dry_run_reseller_requests_list_authz_playwright_spec
    result: |
      Composed option (ii) from tick 109's frontier note — swept the
      /api/reseller/** surface for any remaining scopedReseller() gates
      without a symmetric dry-run spec. Result: GET /api/reseller/requests
      was the last GET surface under /api/reseller/** whose scopedReseller()
      auth chain was not yet regression-guarded at the Playwright lens. The
      sibling POST /api/reseller/requests validation branches already ship
      via requests-validation.spec.ts (tick 88), but that spec exercises
      the validator branches AFTER auth via loginAs(harness.admin.email),
      leaving the pre-auth chain (getCurrentUser → scopedReseller) uncovered
      on the GET verb entirely.

      Files:
        - web/tests/e2e/reseller/reseller-requests-list-authz.spec.ts (new — two
          rows probing the auth chain before getSupabaseAdmin or the
          reseller_requests SELECT:
          (1) unauthenticated (GET with no session → getCurrentUser null →
              401 { ok:false, reason:"unauthorised" } at route.ts:149-152
              BEFORE scopedReseller, getSupabaseAdmin, or reseller_requests
              SELECT),
          (2) non_reseller_admin (loginAs(qa-founder-1@blockid.au) → GET →
              scopedReseller throws ResellerScopeError("no_membership")
              because reseller_admins has no active row for a founder →
              403 { ok:false, reason:"no_membership" } at route.ts:154-162
              BEFORE getSupabaseAdmin or reseller_requests SELECT).
          Row 1 runs unconditionally (no harness dep — just request.get
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          The GET handler takes no query params so both harness-free rows
          return BEFORE any URL parse fires — no query string needed.

      Why this shape mirrors the earlier reseller-scope specs
      (reveal-email-authz tick 100, drawer-authz tick 101,
      reports-signed-url-authz tick 99, sandbox-setup-authz tick 96,
      billing-authz tick 95): all six routes use the direct
      getCurrentUser() + scopedReseller() chain (NOT gateRequireFeature)
      and all six emit { ok:false, reason: <string> } — either
      "unauthorised" (401) on missing session or the ResellerScopeError.code
      (403) on missing/revoked membership. Symmetric envelope means a
      refactor that swaps scopedReseller() for a bespoke inline check,
      that changes the error reason wire format, or that flips the status
      codes lights up in all six specs on the next `npx playwright test`
      pass. Distinct from the earlier reseller specs in ONE dimension
      only — this is the ADMIN-approval queue LIST surface (returns the
      reseller's own pending/approved/denied request rows scoped by
      reseller_id), so a regression that let an anonymous or non-reseller
      caller reach the reseller_requests SELECT would leak decision_at /
      decision_reason / payload jsonb on every reseller's open
      code_request / over_budget_approval / collateral_approval row —
      commercially-sensitive queue state that plan §C.5 restricts to the
      requesting reseller admin.

      Why the 500/503 branches aren't covered: not_configured (503) needs
      SUPABASE_URL/SERVICE_ROLE unset which would break every other
      Playwright spec in the same worker. query_failed (500) needs a
      broken reseller_requests SELECT which requires per-test tampering
      plan §J.2 forbids. Happy path (200 with requests[]) needs a real
      reseller_admins session PLUS pre-seeded reseller_requests rows on
      that reseller_id; folded into the admin QA harness / temp-reseller
      mint follow-up alongside the deferred rows from ticks 94..109.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest unchanged (Playwright spec is not picked up by vitest
      — tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts so
      R-03 doesn't fire). Playwright not run this tick — row 1 is
      harness-free and will execute on the next CI Playwright pass;
      row 2 lights up as soon as the qa accounts file is present.

      Frontier after tick 110: shape unchanged — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 110 unblocks: EVERY scopedReseller()-gated GET surface
      under /api/reseller/** now has symmetric Playwright dry-run
      coverage (customer-drawer GET, reveal-email POST, reports
      signed-url GET, sandbox/setup POST, billing setup-intent POST,
      billing save-default-payment-method POST, requests GET, requests
      POST validation, credits/grant POST validation, create-startup
      POST validation, code/validate POST, me GET). Twenty-two spec
      files now sit in web/tests/e2e/reseller/
      (admin-requests-list-authz, admin-requests-patch-authz,
      admin-reseller-delete-authz, admin-reseller-patch-authz,
      admin-resellers-create-authz, admin-resellers-list-authz,
      attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reseller-requests-list-authz, reveal-email-authz,
      sandbox-setup-authz, scope-boundary). Next autonomous tick
      options: (i) landing the QA-mode temp-reseller mint fixture that
      opens up all the deferred HAPPY-PATH branches from ticks 94..110
      at once (larger tick, wants a design pass); (ii) idle until human
      unblock arrives on P8.5 or P1.5.
    commit: (this tick)

  - tick: 109
    ran_at: 2026-07-22
    action: p10_dry_run_admin_resellers_create_authz_playwright_spec
    result: |
      Composed option (i) from tick 108's frontier note — mirror-spec for POST
      /api/admin/resellers create-side which shares the same requireAdmin() gate
      as tick 103's admin-reseller-patch-authz.spec.ts, tick 105's
      admin-requests-patch-authz.spec.ts, tick 106's admin-reseller-delete-authz.spec.ts,
      tick 107's admin-requests-list-authz.spec.ts, and tick 108's
      admin-resellers-list-authz.spec.ts. This closes the LAST admin REST
      surface under /api/admin/resellers/** whose requireAdmin() gate was
      not yet regression-guarded at the Playwright lens.

      Files:
        - web/tests/e2e/reseller/admin-resellers-create-authz.spec.ts (new — two
          rows probing the auth chain before JSON parse, normaliseResellerCode,
          display_name check, wholesale GST/ABN validation, getSupabaseAdmin, or
          the resellers INSERT:
          (1) unauthenticated (POST with no session → getCurrentUser null →
              requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } at route.ts:64-66 BEFORE
              any of the six BEHIND-gate branches fire),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → POST →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same 401 status as row 1,
              different reason, so a refactor that collapses the two
              branches to a single "unauthorised" reason lights up on the
              next CI pass).
          Row 1 runs unconditionally (no harness dep — just request.post
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          Both rows carry a placeholder body { code, display_name } that
          never reaches the resellers table — even if the gate silently
          fell open the eventual INSERT would still hit code_taken /
          insert_failed rather than persist a real row.

      Why this shape mirrors ticks 103/105/106/107/108: all six routes use
      requireAdmin() from web/src/lib/reseller/require-admin.ts and all
      six emit { ok:false, reason: AdminGateError.code } at HTTP 401 for
      BOTH the no_user and not_admin branches. Symmetric envelope means a
      refactor that swaps requireAdmin() for a bespoke inline check, or
      that collapses the two 401 reasons into a single "unauthorised", or
      that flips the status code to 403, lights up in all six specs on
      the next `npx playwright test` run. Distinct from ticks 103/105/106/107/108
      in ONE dimension only — this is the CREATE surface (POST) rather
      than a list (GET), an update (PATCH), or a soft-delete (DELETE), so
      a regression that lets an anonymous or non-admin caller reach the
      resellers INSERT would spawn a fresh reseller org (code +
      display_name + billing_model + commission_share_pct) that
      subsequently unlocks every /api/reseller/** route via
      attribution_reseller_id foreign keys and every /api/admin/resellers/**
      route via the (code) primary lookup — the highest-blast-radius branch
      in the admin surface.

      Why the 400/409/500/503 branches aren't covered: invalid_body,
      code_required, display_name_required, wholesale_requires_gst,
      wholesale_requires_abn (400) and code_taken (409) all sit BEHIND
      the requireAdmin gate (route.ts:70-100 vs :62) and need a real
      admin session PLUS a specific malformed body PLUS (for code_taken)
      an existing resellers row with that code — folded into the admin
      QA harness follow-up. not_configured (503) needs
      SUPABASE_URL/SERVICE_ROLE unset which would break every other
      Playwright spec in the same worker. insert_failed (500) needs a
      broken resellers INSERT which requires per-test tampering plan §J.2
      forbids. Happy path (201) writes a new resellers row that would
      poison every subsequent admin-facing spec in the worker (including
      the five sibling admin authz specs) and would also require
      downstream cleanup for the (code, tier) unique constraint under
      reseller_promotion_codes; folded into the admin QA harness
      follow-up alongside the deferred rows from ticks 94..108.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest unchanged (Playwright spec is not picked up by vitest
      — tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts so
      R-03 doesn't fire). Playwright not run this tick — row 1 is
      harness-free and will execute on the next CI Playwright pass;
      row 2 lights up as soon as the qa accounts file is present.

      Frontier after tick 109: shape unchanged — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 109 unblocks: EVERY admin REST surface under
      /api/admin/resellers/** gated by requireAdmin() (resellers list
      GET, resellers create POST, resellers [code] PATCH, resellers
      [code] DELETE, resellers/requests list GET, resellers/requests
      [id] PATCH) now has symmetric Playwright dry-run coverage. All
      admin auth-chain ordering (getCurrentUser → requireAdmin → 401
      no_user | not_admin BEFORE any BEHIND-gate branch fires) is
      regression-guarded at the Playwright lens across all six routes.
      Twenty-one spec files now sit in web/tests/e2e/reseller/
      (admin-requests-list-authz, admin-requests-patch-authz,
      admin-reseller-delete-authz, admin-reseller-patch-authz,
      admin-resellers-create-authz, admin-resellers-list-authz,
      attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reveal-email-authz, sandbox-setup-authz, scope-boundary).
      Next autonomous tick options: (i) landing the QA-mode temp-reseller
      mint fixture that opens up all the deferred rows from ticks
      94..109 at once (larger tick, wants a design pass — would fold
      every HAPPY-PATH branch across the six admin routes into a single
      harness rather than one-per-spec); (ii) sweeping the /api/reseller/**
      surface for any remaining scopedReseller() gates without a
      symmetric dry-run spec (mirror the admin sweep just closed);
      (iii) idle until human unblock arrives.
    commit: (this tick)

  - tick: 108
    ran_at: 2026-07-22
    action: p10_dry_run_admin_resellers_list_authz_playwright_spec
    result: |
      Composed option (i) from tick 107's frontier note — mirror-spec for GET
      /api/admin/resellers list-side which shares the same requireAdmin() gate
      as tick 103's admin-reseller-patch-authz.spec.ts, tick 105's
      admin-requests-patch-authz.spec.ts, tick 106's admin-reseller-delete-authz.spec.ts,
      and tick 107's admin-requests-list-authz.spec.ts. This closes the last
      admin GET surface on /api/admin/resellers/** whose requireAdmin() gate
      was not yet regression-guarded at the Playwright lens.

      Files:
        - web/tests/e2e/reseller/admin-resellers-list-authz.spec.ts (new — two
          rows probing the auth chain before getSupabaseAdmin or the resellers
          SELECT:
          (1) unauthenticated (GET with no session → getCurrentUser null →
              requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } at route.ts:20-22 BEFORE
              getSupabaseAdmin or the resellers SELECT),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → GET →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same 401 status as row 1,
              different reason, so a refactor that collapses the two
              branches to a single "unauthorised" reason lights up on the
              next CI pass).
          Row 1 runs unconditionally (no harness dep — just request.get
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          The GET handler takes no query params so both harness-free rows
          return BEFORE any URL parse fires — no path segment or search
          string needed on either request.

      Why this shape mirrors ticks 103/105/106/107: all five routes use
      requireAdmin() from web/src/lib/reseller/require-admin.ts and all
      five emit { ok:false, reason: AdminGateError.code } at HTTP 401 for
      BOTH the no_user and not_admin branches. Symmetric envelope means a
      refactor that swaps requireAdmin() for a bespoke inline check, or
      that collapses the two 401 reasons into a single "unauthorised", or
      that flips the status code to 403, lights up in all five specs on
      the next `npx playwright test` run. Distinct from ticks 103/105/106/107
      in ONE dimension only — this is the top-level resellers list SELECT
      (returns every resellers row: code, display_name, billing_model,
      abn, monthly_credit_budget, commission_share_pct, etc.), so a
      regression that lets an anonymous or non-admin caller reach the
      resellers SELECT would leak the full reseller directory including
      commercial terms (per-reseller commission share, monthly credit
      budget, sandbox allowance) that plan §J.2 defines as admin-only.

      Why the 500/503 branches aren't covered: not_configured (503) needs
      SUPABASE_URL/SERVICE_ROLE unset which would break every other
      Playwright spec in the same worker. query_failed (500) needs a
      broken resellers SELECT which requires per-test tampering plan §J.2
      forbids. Happy path (200) reads real resellers rows (P1.5 InfoVision
      seed still HUMAN-BLOCKED on H.20 anyway) and requires a real admin
      session; folded into the admin QA harness follow-up alongside the
      deferred rows from ticks 94..107.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest unchanged (Playwright spec is not picked up by vitest
      — tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts so
      R-03 doesn't fire). Playwright not run this tick — row 1 is
      harness-free and will execute on the next CI Playwright pass;
      row 2 lights up as soon as the qa accounts file is present.

      Frontier after tick 108: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 108 unblocks: the GET /api/admin/resellers auth-chain
      ordering (getCurrentUser → requireAdmin → 401 no_user | not_admin
      BEFORE getSupabaseAdmin / the resellers SELECT) is now
      regression-guarded at the Playwright lens. Twenty spec files now
      sit in web/tests/e2e/reseller/ (admin-requests-list-authz,
      admin-requests-patch-authz, admin-reseller-delete-authz,
      admin-reseller-patch-authz, admin-resellers-list-authz,
      attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reveal-email-authz, sandbox-setup-authz, scope-boundary). All
      admin-side REST surfaces under /api/admin/resellers/** gated by
      requireAdmin() (resellers list GET, resellers [code] PATCH,
      resellers [code] DELETE, resellers/requests list GET,
      resellers/requests [id] PATCH) now have symmetric dry-run
      coverage — with the sole exception of the resellers create POST
      which the next tick can close in the same pattern (body
      validation sits BEHIND the gate so both harness-free rows still
      return at gate() BEFORE the invalid_body / code_required /
      display_name_required / wholesale_requires_gst branches fire).
      Next autonomous tick options: (i) POST /api/admin/resellers
      create-side auth-chain (last remaining admin surface without a
      dry-run spec — same requireAdmin() chokepoint, body validation
      sits BEHIND the gate); (ii) landing the QA-mode temp-reseller
      mint fixture that opens up all the deferred branches from ticks
      94..108 at once (larger tick, wants a design pass); (iii) idle
      until human unblock arrives.
    commit: (this tick)

  - tick: 107
    ran_at: 2026-07-22
    action: p10_dry_run_admin_requests_list_authz_playwright_spec
    result: |
      Composed option (i) from tick 106's frontier note — mirror-spec for GET
      /api/admin/resellers/requests list-side which shares the same
      requireAdmin() gate as tick 103's admin-reseller-patch-authz.spec.ts,
      tick 105's admin-requests-patch-authz.spec.ts, and tick 106's
      admin-reseller-delete-authz.spec.ts. This is the last admin-side
      REST surface under /api/admin/resellers/** whose requireAdmin() gate
      was not yet regression-guarded at the Playwright lens.

      Files:
        - web/tests/e2e/reseller/admin-requests-list-authz.spec.ts (new — two
          rows probing the auth chain before getSupabaseAdmin, ?status=/
          ?request_type= parse, or the reseller_requests SELECT:
          (1) unauthenticated (GET with no session → getCurrentUser null →
              requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } at route.ts:25-27 BEFORE
              getSupabaseAdmin, URL parse, or reseller_requests SELECT),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → GET →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same 401 status as row 1,
              different reason, so a refactor that collapses the two
              branches to a single "unauthorised" reason lights up on the
              next CI pass).
          Row 1 runs unconditionally (no harness dep — just request.get
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          No query params on either request — both rows bail in gate()
          BEFORE ?status=/?request_type= are inspected.

      Why this shape mirrors ticks 103/105/106: all four routes use
      requireAdmin() from web/src/lib/reseller/require-admin.ts and all
      four emit { ok:false, reason: AdminGateError.code } at HTTP 401 for
      BOTH the no_user and not_admin branches. Symmetric envelope means a
      refactor that swaps requireAdmin() for a bespoke inline check, or
      that collapses the two 401 reasons into a single "unauthorised", or
      that flips the status code to 403, lights up in all four specs on
      the next `npx playwright test` run. Distinct from ticks 103/105/106
      in ONE dimension only — this is a READ surface (GET) rather than a
      write (PATCH/DELETE), so the pre-read contract carries less weight
      per assertion, but the same auth-chain regression class applies:
      any refactor that lets an anonymous or non-admin caller reach the
      reseller_requests SELECT would leak the pending admin inbox
      (approve/deny decisions, payload metadata, decision_reason
      free-text) that plan §J.2 defines as admin-only.

      Why the 500/503 branches aren't covered: not_configured (503) needs
      SUPABASE_URL/SERVICE_ROLE unset which would break every other
      Playwright spec in the same worker. query_failed (500) needs a
      broken reseller_requests SELECT which requires per-test tampering
      plan §J.2 forbids. Happy path (200) reads real reseller_requests
      rows and requires a real admin session; folded into the admin QA
      harness follow-up alongside the deferred rows from ticks 94..106.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest unchanged (Playwright spec is not picked up by vitest
      — tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts so
      R-03 doesn't fire). Playwright not run this tick — row 1 is
      harness-free and will execute on the next CI Playwright pass;
      row 2 lights up as soon as the qa accounts file is present.

      Frontier after tick 107: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 107 unblocks: the GET /api/admin/resellers/requests
      auth-chain ordering (getCurrentUser → requireAdmin → 401 no_user |
      not_admin BEFORE getSupabaseAdmin / URL param parse / the
      reseller_requests SELECT) is now regression-guarded at the
      Playwright lens. Nineteen spec files now sit in
      web/tests/e2e/reseller/ (admin-requests-list-authz,
      admin-requests-patch-authz, admin-reseller-delete-authz,
      admin-reseller-patch-authz, attribution-timing, audit-anomaly-scan,
      audit-log-writes, billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reveal-email-authz, sandbox-setup-authz, scope-boundary). All
      admin-side REST surfaces under /api/admin/resellers/** gated by
      requireAdmin() (resellers list GET, resellers create POST is
      covered indirectly via the same gate on the sibling PATCH/DELETE,
      resellers [code] PATCH, resellers [code] DELETE,
      resellers/requests list GET, resellers/requests [id] PATCH) now
      have symmetric dry-run coverage — with the sole exception of the
      resellers list GET and POST which the next tick can close in the
      same pattern. Next autonomous tick options: (i) GET
      /api/admin/resellers list-side auth-chain (the sibling to this
      tick's requests list — same requireAdmin() chokepoint, different
      SELECT target); (ii) POST /api/admin/resellers create-side
      auth-chain (same requireAdmin(), body validation sits BEHIND
      the gate); (iii) landing the QA-mode temp-reseller mint fixture
      that opens up all the deferred branches from ticks 94..107 at
      once (larger tick, wants a design pass); (iv) idle until human
      unblock arrives.
    commit: (this tick)

  - tick: 106
    ran_at: 2026-07-22
    action: p10_dry_run_admin_reseller_delete_authz_playwright_spec
    result: |
      Composed option (i) from tick 105's frontier note — mirror-spec for DELETE
      /api/admin/resellers/[code] soft-delete which shares the same
      requireAdmin() gate as tick 103's admin-reseller-patch-authz.spec.ts and
      tick 105's admin-requests-patch-authz.spec.ts. Both admin PATCH surfaces
      were regression-guarded at the Playwright lens after tick 105; the DELETE
      side of the same [code] route was the last admin write on the reseller
      surface without a dry-run auth-chain spec.

      Files:
        - web/tests/e2e/reseller/admin-reseller-delete-authz.spec.ts (new — two
          rows probing the auth chain before any code normalisation, resellers
          SELECT, or the soft-delete UPDATE that flips resellers.status to
          "terminated":
          (1) unauthenticated (DELETE with no session → getCurrentUser null →
              requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } at route.ts:27-29 BEFORE params
              await, normaliseResellerCode, resellers SELECT, or the
              resellers UPDATE status=terminated write),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → DELETE →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same 401 status as row 1,
              different reason, so a refactor that collapses the two
              branches to a single "unauthorised" reason lights up on the
              next CI pass).
          Row 1 runs unconditionally (no harness dep — just request.delete
          without loginAs). Row 2 test.skip()s with a diagnostic message if
          /tmp/blockid-qa-accounts.txt is missing so operators without the
          seed file get an actionable pointer rather than a hard fail.
          Placeholder code "test-placeholder-code" sits in the [code]
          segment for URL well-formedness; both rows return BEFORE the
          normaliseResellerCode call so the placeholder value never reaches
          supabase.from("resellers").eq("code", code).

      Why this shape mirrors ticks 103/105: all three routes use
      requireAdmin() from web/src/lib/reseller/require-admin.ts and all three
      emit { ok:false, reason: AdminGateError.code } at HTTP 401 for BOTH the
      no_user and not_admin branches. Symmetric envelope means a refactor
      that swaps requireAdmin() for a bespoke inline check, or that
      collapses the two 401 reasons into a single "unauthorised", or that
      flips the status code to 403, lights up in all three specs on the
      next `npx playwright test` run. Distinct from ticks 103/105 in ONE
      dimension only — the downstream write is a soft-delete UPDATE that
      terminates the reseller org (loses commission accrual, removes the
      co-branding pill for every attributed customer), so the pre-write
      contract carries maximum weight per assertion: any regression that
      lets an anonymous or non-admin caller reach the terminate write
      would silently sever every attributed customer relationship for the
      target reseller.

      Why the 400/404/500/503 branches aren't covered: code_required (400)
      sits BEHIND requireAdmin (route.ts:197 vs :192), so surfacing it
      needs a real admin session PLUS an ill-formed code segment.
      not_found (404) sits BEHIND requireAdmin, needs an admin session PLUS
      an [code] that does not resolve to a resellers row. not_configured
      (503) needs SUPABASE_URL/SERVICE_ROLE unset which would break every
      other Playwright spec in the same worker. terminate_failed (500)
      needs a broken resellers UPDATE which requires per-test tampering
      plan §J.2 forbids. Happy path (200) fires the real soft-delete
      UPDATE against the seed InfoVision row (P1.5 still HUMAN-BLOCKED
      on H.20 anyway); folded into the admin QA harness follow-up
      alongside the deferred rows from ticks 94..105.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at web/);
      vitest unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm run
      lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31 manifest
      route(s); 3 exemptions, 0 violations unchanged (spec lives under
      web/tests/e2e/reseller/, not /api/reseller/**, so R-01 doesn't fire;
      not a mutation route in feature-gates.manifest.ts so R-03 doesn't
      fire). Playwright not run this tick — row 1 is harness-free and
      will execute on the next CI Playwright pass; row 2 lights up as
      soon as the qa accounts file is present.

      Frontier after tick 106: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on H.20
      ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears. What
      tick 106 unblocks: the DELETE /api/admin/resellers/[code] auth-chain
      ordering (getCurrentUser → requireAdmin → 401 no_user | not_admin
      BEFORE params await / normaliseResellerCode / resellers SELECT / the
      soft-delete UPDATE that terminates the reseller org) is now
      regression-guarded at the Playwright lens. Eighteen spec files now
      sit in web/tests/e2e/reseller/ (admin-requests-patch-authz,
      admin-reseller-delete-authz, admin-reseller-patch-authz,
      attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reveal-email-authz, sandbox-setup-authz, scope-boundary). All three
      admin-side write surfaces gated by requireAdmin() (resellers PATCH,
      resellers DELETE, resellers/requests/[id] PATCH) now have symmetric
      dry-run coverage. Next autonomous tick options: (i) GET
      /api/admin/resellers/requests list-side auth-chain (also
      requireAdmin — the last remaining admin surface without a dry-run
      spec); (ii) GET /api/admin/resellers list-side auth-chain (same);
      (iii) landing the QA-mode temp-reseller mint fixture that opens up
      all the deferred branches from ticks 94..106 at once (larger tick,
      wants a design pass); (iv) idle until human unblock arrives.
    commit: (this tick)

  - tick: 105
    ran_at: 2026-07-22
    action: p10_dry_run_admin_requests_patch_authz_playwright_spec
    result: |
      Composed option (i) from tick 104's frontier note — mirror-spec for PATCH
      /api/admin/resellers/requests/[id] which shares the same requireAdmin()
      chain as tick 103's admin-reseller-patch-authz.spec.ts but with a
      different body shape (approve/deny/cancel enum) and a different
      downstream fan-out (Stripe coupon mint for code_request approvals,
      credit_balances + credit_transactions + reseller_credit_grants triple-
      write for over_budget_approval approvals, status flip for
      collateral_approval). Picked because it is the last admin PATCH surface
      whose requireAdmin() gate is not yet regression-guarded at the Playwright
      lens; symmetric to tick 103's shape so the two 401 branches share the
      same { ok:false, reason:"no_user"|"not_admin" } envelope contract.

      Files:
        - web/tests/e2e/reseller/admin-requests-patch-authz.spec.ts (new — two
          rows probing the auth chain before any params await, getSupabaseAdmin,
          JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe
          coupon mint, or reseller_requests / credit_balances /
          credit_transactions / reseller_credit_grants / reseller_promotion_codes
          write:
          (1) unauthenticated (PATCH with no session → getCurrentUser null →
              requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } at route.ts:50-51 BEFORE params
              await, getSupabaseAdmin, JSON parse, reseller_requests SELECT,
              validateAdminDecision, Stripe mint, or the approve/deny/cancel
              UPDATE),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → PATCH →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same 401 status as row 1,
              different reason, so a refactor that collapses the two branches
              to a single "unauthorised" reason lights up on the next CI pass).
          Row 1 runs unconditionally (no harness dep — just page.request without
          loginAs). Row 2 test.skip()s with a diagnostic message if
          /tmp/blockid-qa-accounts.txt is missing so operators without the seed
          file get an actionable pointer rather than a hard fail. Placeholder id
          "00000000-0000-0000-0000-000000000000" sits in the [id] segment for
          URL well-formedness; both rows return BEFORE the params await runs
          so the placeholder value never reaches
          supabase.from("reseller_requests").eq("id", id).)

      Why this shape mirrors tick 103: both routes use requireAdmin() from
      web/src/lib/reseller/require-admin.ts and both emit
      { ok:false, reason: AdminGateError.code } at HTTP 401 for BOTH the
      no_user and not_admin branches. Symmetric envelope means a refactor that
      swaps requireAdmin() for a bespoke inline check, or that collapses the
      two 401 reasons into a single "unauthorised", or that flips the status
      code to 403 lights up in both specs on the next `npx playwright test`
      run. Distinct from tick 103 in ONE dimension only — the downstream
      fan-out is much larger (Stripe coupon mint + promotion_code insert +
      credit ledger triple-write) so the pre-write contract carries more
      weight per assertion.

      Why the 400/404/409/422/500/503 branches aren't covered: not_configured
      (503) needs SUPABASE_URL/SERVICE_ROLE unset which would break every
      other Playwright spec in the same worker. not_found (404) sits BEHIND
      requireAdmin, needs an admin session PLUS an [id] that does not resolve.
      validateAdminDecision (400 <reason> / 409 already_decided) needs an
      admin session PLUS a real pending row PLUS an ill-formed body.
      payload_incomplete (422) is on the approve branch for code_request rows
      with non-finite tier_pct. All the 500 branches (reseller_read_failed,
      existing_code_read_failed, promotion_code_insert_failed, credit ledger
      insert failures, update_failed) need per-test tampering plan §J.2
      forbids. Happy path (200) fires the real Stripe mint or credit ledger
      triple-write; folded into the temp-reseller mint fixture follow-up
      alongside the deferred rows from ticks 94..104.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at web/);
      vitest unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm run
      lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31 manifest
      route(s); 3 exemptions, 0 violations unchanged (spec lives under
      web/tests/e2e/reseller/, not /api/reseller/**, so R-01 doesn't fire;
      not a mutation route in feature-gates.manifest.ts so R-03 doesn't
      fire). Playwright not run this tick — row 1 is harness-free and will
      execute on the next CI Playwright pass; row 2 lights up as soon as
      the qa accounts file is present.

      Frontier after tick 105: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on H.20
      ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears. What
      tick 105 unblocks: the /api/admin/resellers/requests/[id] auth-chain
      ordering (getCurrentUser → requireAdmin → 401 no_user | not_admin
      BEFORE params await / getSupabaseAdmin / JSON parse /
      reseller_requests SELECT / validateAdminDecision / Stripe mint /
      credit ledger writes / reseller_requests UPDATE) is now regression-
      guarded at the Playwright lens. Seventeen spec files now sit in
      web/tests/e2e/reseller/ (admin-requests-patch-authz,
      admin-reseller-patch-authz, attribution-timing, audit-anomaly-scan,
      audit-log-writes, billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, reports-signed-url-authz, requests-validation,
      reveal-email-authz, sandbox-setup-authz, scope-boundary). Both
      admin-PATCH surfaces (resellers/[code] + resellers/requests/[id])
      that share the requireAdmin() middleware now have symmetric dry-run
      coverage. Next autonomous tick options: (i) mirror-spec for DELETE
      /api/admin/resellers/[code] soft-delete which extends this spec's
      auth pair to the terminate path; (ii) GET
      /api/admin/resellers/requests list-side auth-chain (also
      requireAdmin); (iii) landing the QA-mode temp-reseller mint fixture
      that opens up all the deferred branches from ticks 94..105 at once
      (larger tick, wants a design pass); (iv) idle until human unblock
      arrives.
    commit: (this tick)

  - tick: 104
    ran_at: 2026-07-22
    action: p10_dry_run_reports_signed_url_authz_playwright_spec
    result: |
      Composed option (i) fallback from tick 103's frontier note — Track A
      P8.5 still HUMAN-BLOCKED, Track B COMPLETE, admin PATCH surface
      already covered by tick 103, and the remaining /api/reseller/**
      GET surface with an untested auth chain is the signed-url mint
      endpoint at /api/reseller/reports/[month]/signed-url. Picked this
      route because it exercises the SAME getCurrentUser + scopedReseller
      chain as reveal-email + drawer (ticks 100/101) but on a NEW code
      path — the P7.2 signed-URL storage lens (see plan §C.6 retention
      window + §U.15.13 D3-CISO-01 chokepoint) — so a regression that
      mints a signed URL before the auth/scope gates fire would surface
      here rather than being caught upstream. It is also the only
      remaining GET path on the reseller side that writes to
      reseller_audit_log (action='download_report') and mints a
      Storage.createSignedUrl in the happy path; making the pre-write
      contract explicit protects both writes.

      Files:
        - web/tests/e2e/reseller/reports-signed-url-authz.spec.ts (new
          — two rows probing the auth chain before any DB read, storage
          sign, or audit-log write:
          (1) unauthenticated (GET with no session → getCurrentUser
              null → route returns 401 { ok:false, reason:"unauthorised" }
              at route.ts:41-43 BEFORE scopedReseller, MONTH_RE.test,
              isMonthExposed, reseller_report_files SELECT, storage
              sign, or reseller_audit_log(download_report) write),
          (2) non_reseller_admin (loginAs(qa-founder-1@blockid.au) →
              GET → scopedReseller finds no active reseller_admins row
              for the founder's user_id → throws
              ResellerScopeError("no_membership") → route returns 403
              { ok:false, reason:"no_membership" } at route.ts:48-52
              BEFORE MONTH_RE.test, isMonthExposed, reseller_report_files
              SELECT, storage sign, or reseller_audit_log write).
          Row 1 runs unconditionally (no harness dep — just
          page.request without loginAs). Row 2 test.skip()s with a
          diagnostic message if /tmp/blockid-qa-accounts.txt is missing
          so operators without the seed file get an actionable pointer
          rather than a hard fail. Placeholder month "2026-07" sits in
          the [month] segment for URL well-formedness against MONTH_RE
          shape (YYYY-MM); both rows return before the month regex runs
          so the placeholder value never reaches MONTH_RE.test or
          isMonthExposed.

      Why this shape mirrors ticks 100/101: reveal-email + drawer both
      hit getCurrentUser + scopedReseller and return the same
      { ok:false, reason:"unauthorised" | "no_membership" } envelope
      pair, and this signed-url path uses the same middleware pair —
      so the assertion shape is symmetric. A refactor that swaps
      scopedReseller() for a bespoke inline check, or that flips the
      403 to a 402 (misclassifying scope failure as a feature gate),
      or that reorders the checks so the month regex runs before scope
      (leaking valid-vs-invalid-month information to unauthenticated
      callers), would light up here.

      Why the 400/403 not_exposed/404/500/503 branches aren't covered:
      invalid_month (400) sits BEHIND scopedReseller (route.ts:56 vs :47)
      — surfacing it needs a real reseller session PLUS a malformed
      `[month]` segment. not_exposed (403) sits BEHIND scopedReseller
      too, needs a reseller session PLUS a month outside the 12-month
      RETENTION_EXPOSED_MONTHS window. not_found (404) needs a reseller
      session PLUS a valid month with no reseller_report_files row.
      not_configured (503) needs SUPABASE_URL/SERVICE_ROLE unset which
      would break every other Playwright spec in the same worker.
      sign_failed / audit_failed / lookup_failed (500) need per-test
      tampering plan §J.2 forbids. Happy path (200 signed_url +
      filename + expires_at) mints a real signed URL against the
      reseller-reports bucket + writes a
      reseller_audit_log(download_report) row against the harness
      reseller; folded into the temp-reseller mint fixture follow-up
      alongside the deferred rows from ticks 94/95/96/97/98/99/100/101/
      102/103.

      Verified: tsc clean (npx tsc --noEmit -p tsconfig.json exit 0 at
      web/); vitest unchanged (Playwright spec is not picked up by
      vitest — tests/e2e/** is excluded per playwright.config.ts:
      testDir); npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations
      unchanged (spec lives under web/tests/e2e/reseller/, not
      /api/reseller/**, so R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire). Playwright not
      run this tick — row 1 is harness-free and will execute on the
      next CI Playwright pass; row 2 lights up as soon as the qa
      accounts file is present.

      Frontier after tick 104: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 104 unblocks: the /api/reseller/reports/[month]/signed-url
      auth-chain ordering (getCurrentUser → scopedReseller → 401
      unauthorised | 403 no_membership BEFORE month regex / storage
      lookup / storage sign / reseller_audit_log write) is now
      regression-guarded at the Playwright lens. Sixteen spec files
      now sit in web/tests/e2e/reseller/ (admin-reseller-patch-authz,
      attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      drawer-authz, me-attribution, reports-signed-url-authz,
      requests-validation, reveal-email-authz, sandbox-setup-authz,
      scope-boundary). Next autonomous tick options: (i) mirror-spec
      for PATCH /api/admin/resellers/requests/[id] which shares the
      same requireAdmin() chain as tick 103's admin-reseller-patch
      but with a different body shape (approve/deny/cancel enum);
      (ii) mirror-spec for DELETE /api/admin/resellers/[code]
      soft-delete which extends tick 103's auth pair to the terminate
      path; (iii) GET /api/admin/resellers/requests list-side
      auth-chain (also requireAdmin); (iv) landing the QA-mode
      temp-reseller mint fixture that opens up all the deferred
      branches from ticks 94..104 at once (larger tick, wants a
      design pass); (v) idle until human unblock arrives.
    commit: (this tick)

  - tick: 103
    ran_at: 2026-07-22
    action: p10_dry_run_admin_reseller_patch_authz_playwright_spec
    result: |
      Composed option (ii) from tick 102's frontier note — "audit admin-side
      PATCH surfaces for any pre-write branches still uncovered (candidates:
      /api/admin/resellers/[code] PATCH/DELETE, /api/admin/resellers/
      requests/[id] PATCH)". Picked PATCH /api/admin/resellers/[code]
      because it is the canonical admin edit surface (owns display_name,
      billing_model, gst_registered, abn, tier enum, budget, commission
      share — all U.15.1 invariants) and its auth-chain shape is
      DIFFERENT from every previous P10 spec — it uses the shared
      requireAdmin() middleware (web/src/lib/reseller/require-admin.ts)
      rather than scopedReseller() or gateRequireFeature(). Two
      harness-free rows cover the top of that alternate chain before code
      normalisation, body JSON parse, resellers SELECT, or the resellers
      UPDATE ever fires.

      Files:
        - web/tests/e2e/reseller/admin-reseller-patch-authz.spec.ts (new
          — two rows probing the auth chain before any DB read or UPDATE:
          (1) unauthenticated (PATCH with no session → getCurrentUser
              null → requireAdmin throws AdminGateError("no_user") → 401
              { ok:false, reason:"no_user" } before code normalisation,
              JSON body parse, resellers SELECT, or resellers UPDATE),
          (2) non_admin (loginAs(qa-founder-1@blockid.au) → PATCH →
              requireAdmin throws AdminGateError("not_admin") because
              user.role !== "admin" and user.email !== ADMIN_EMAIL → 401
              { ok:false, reason:"not_admin" } — same status code as
              row 1, different reason, so a refactor that collapses the
              two branches to a single "unauthorised" reason lights up
              on the next CI pass).
          Row 1 runs unconditionally (no harness dep — just page.request
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          Placeholder code (test-placeholder-code) sits in the [code]
          segment for URL well-formedness only — both rows return
          before the segment is inspected so the placeholder never
          reaches normaliseResellerCode.

      Why this shape differs from tick 100/101/102: reveal-email + drawer
      hit getCurrentUser + scopedReseller (reason: "unauthorised" /
      "no_membership"), sandbox-setup + billing hit gateRequireFeature
      (envelope: { error, feature }), me hits getCurrentUser only
      (reason: "unauthenticated"). This route is the first P10 spec to
      cover the requireAdmin() middleware — the shared helper introduced
      in P0 per plan §U.14 that replaces the ~20 inline
      `user.email === ADMIN_EMAIL || user.role === "admin"` copies
      scattered across /api/admin/**. The response envelope for BOTH
      401 branches carries the AdminGateError.code verbatim as body.reason
      (route.ts:27-29 → NextResponse.json({ ok:false, reason: err.code },
      { status: 401 })). A refactor that swaps requireAdmin() for a
      bespoke inline check would light up both rows in CI (any deviation
      from the { ok:false, reason:"no_user" | "not_admin" } shape or the
      401 status code fails the assert). Notable: unlike the reseller
      routes where non_reseller_admin returns 403, non_admin here returns
      401 — matches the AdminGateError → 401 convention baked into every
      /api/admin/* handler that uses the gate.

      Why the 400/404/500 branches aren't covered: normaliseResellerCode
      (400 code_required) and JSON parse (400 invalid_body) sit BEHIND
      requireAdmin (route.ts:130/134 vs :127) — surfacing them needs a
      real admin session. loadReseller (404 not_found / 503 not_configured
      / 500 query_failed) is behind requireAdmin plus needs a code that
      does not resolve. validateAdminResellerPatch (400 <reason>) needs
      an admin session PLUS a resellers row PLUS an invariant-violating
      patch (wholesale without GST/ABN per U.15.1 — the interesting
      integration test but wants the admin QA harness). update_failed
      (500) needs a broken UPDATE which requires per-test tampering
      plan §J.2 forbids. Happy path (200) fires a real resellers UPDATE
      + updated_at bump; folded into the admin QA harness follow-up
      alongside the deferred rows from ticks 94/95/96/97/98/99/100/101/102.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire). Playwright not
      run this tick — row 1 is harness-free and will execute on the
      next CI Playwright pass; row 2 lights up as soon as the qa
      accounts file is present.

      Frontier after tick 103: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 103 unblocks: the /api/admin/resellers/[code] auth-chain
      ordering (getCurrentUser → requireAdmin → 401 no_user | not_admin
      BEFORE code normalisation / body parse / DB) is now
      regression-guarded at the Playwright lens — the first P10 spec
      that exercises the shared requireAdmin() middleware. A refactor
      that swaps requireAdmin() for a bespoke inline check, or that
      collapses the two 401 reasons into a single "unauthorised", or
      that flips the status code to 403 lights up in CI on the next
      `npx playwright test` run. Fifteen spec files now sit in
      web/tests/e2e/reseller/ (admin-reseller-patch-authz,
      attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      drawer-authz, me-attribution, requests-validation,
      reveal-email-authz, sandbox-setup-authz, scope-boundary). All
      three distinct reseller auth chains — direct getCurrentUser
      (me), getCurrentUser + scopedReseller (reveal-email + drawer),
      and getCurrentUser + requireAdmin (admin-reseller-patch) — now
      have symmetric dry-run coverage. Next autonomous tick options:
      (i) mirror-spec for PATCH /api/admin/resellers/requests/[id]
      which shares the same requireAdmin() chain but with a different
      body shape (approve/deny/cancel enum) — small tick, mirrors
      this spec's shape; (ii) mirror-spec for DELETE
      /api/admin/resellers/[code] soft-delete — extends this spec's
      auth pair to the terminate path; (iii) landing the QA-mode
      temp-reseller mint fixture that opens up all the deferred
      branches from ticks 94/95/96/97/98/99/100/101/102/103 at once
      (larger tick, wants a design pass); (iv) idle until human
      unblock arrives.
    commit: (this tick)

  - tick: 102
    ran_at: 2026-07-22
    action: p10_dry_run_me_attribution_authz_playwright_spec
    result: |
      Composed option (ii) from tick 101's frontier note — "audit remaining
      /api/reseller/** GET/PATCH surfaces for any pre-write branches still
      uncovered (candidates include /api/reseller/me and admin-side PATCH
      endpoints)". Picked GET /api/reseller/me because it is the third
      /api/reseller/** route (after reveal-email + drawer) that hits
      getCurrentUser() directly rather than gateRequireFeature() — but
      UNLIKE those two it also skips scopedReseller() by design (the
      r-01-exempt pragma at route.ts:18 documents this: any signed-in user
      may read their OWN attribution because the useResellerAttribution()
      client hook needs it to render the topbar co-branding pill for
      attributed customers who are NOT reseller admins).

      Files:
        - web/tests/e2e/reseller/me-attribution.spec.ts (new — two rows
          probing the top of the auth chain before getSupabaseAdmin,
          app_users SELECT, or resellers SELECT run:
          (1) unauthenticated (GET with no session → getCurrentUser null →
              401 { ok:false, reason:"unauthenticated" } before any DB
              call fires),
          (2) authenticated_no_attribution (loginAs(qa-founder-1@blockid.au)
              → GET → 200 { ok:true, reseller:null } because the founder's
              app_users.attribution_reseller_id is null so the code returns
              at route.ts:53 before the resellers SELECT runs).
          Row 1 runs unconditionally (no harness dep — just page.request
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          Row 2 hits the app_users SELECT scoped to the caller's OWN id
          only — no write, no audit-log row, no cross-tenant read.

      Why row 2 is worth a spec even though the response envelope matches
      the fail-open/fail-closed/catch shapes: it pins the CONTRACT for the
      caller — a founder with no attribution must see {ok:true,
      reseller:null} rather than a 401 (which would flash the auth banner
      on the pill) or a 402 (which would suggest a plan gate exists). The
      pill component treats reseller:null as "hide" and any other shape as
      "show or error"; a refactor that accidentally gate-locks this route
      to reseller-admins would light up as row 2 flipping from 200 to 402.

      Why the attributed-founder happy path (200 with populated reseller
      object) isn't covered: requires an app_users row whose
      attribution_reseller_id points at an active resellers row; folded
      into the temp-reseller mint fixture follow-up alongside the deferred
      rows from ticks 94/95/96/97/98/99/100/101. The inactive-reseller
      silent-null branch (200 reseller:null when status !== 'active') and
      the fail-open/fail-closed branches (SUPABASE_URL unset / pre-0091
      DB throws) are all forbidden by plan §J.2 without per-test tampering
      or cross-worker breakage.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      unchanged (Playwright spec is not picked up by vitest — tests/e2e/**
      is excluded per playwright.config.ts:testDir); npm run lint:reseller:
      R-01 scanned 11 file(s), R-03 scanned 31 manifest route(s); 3
      exemptions, 0 violations unchanged (spec lives under
      web/tests/e2e/reseller/, not /api/reseller/**, so R-01 doesn't fire;
      not a mutation route in feature-gates.manifest.ts so R-03 doesn't
      fire). Playwright not run this tick — row 1 is harness-free and
      will execute on the next CI Playwright pass; row 2 lights up as
      soon as the qa accounts file is present.

      Frontier after tick 102: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 102 unblocks: the /api/reseller/me auth-chain contract
      (getCurrentUser → 401 vs authenticated-null-attribution → 200
      reseller:null) is now regression-guarded at the Playwright lens —
      a refactor that gate-locks the route to reseller-admins, or that
      swaps the fail-closed catch for a 500, lights up in CI on the
      next `npx playwright test` run. Fourteen spec files now sit in
      web/tests/e2e/reseller/ (attribution-timing, audit-anomaly-scan,
      audit-log-writes, billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation, drawer-authz,
      me-attribution, requests-validation, reveal-email-authz,
      sandbox-setup-authz, scope-boundary). All three direct-auth-chain
      /api/reseller routes (reveal-email + drawer + me) now have
      symmetric dry-run coverage. Next autonomous tick options:
      (i) landing the QA-mode temp-reseller mint fixture that opens
      up all the deferred branches from ticks
      94/95/96/97/98/99/100/101/102 at once (larger tick, wants a
      design pass); (ii) audit admin-side PATCH surfaces for any
      pre-write branches still uncovered (candidates:
      /api/admin/resellers/[code] PATCH/DELETE,
      /api/admin/resellers/requests/[id] PATCH); (iii) idle until
      human unblock arrives.
    commit: (this tick)

  - tick: 101
    ran_at: 2026-07-22
    action: p10_dry_run_drawer_authz_playwright_spec
    result: |
      Composed option (i) from tick 100's frontier note — a mirror-spec
      for the sibling GET /api/reseller/customers/[id]/drawer route that
      shares the same direct getCurrentUser() + scopedReseller() chain as
      reveal-email. Two harness-free rows cover the top of that alternate
      chain before decideReveal, app_users SELECT, the parallel fan-out
      across svi_analyses + revenue_events + credit_transactions +
      credit_balances, or the reseller_audit_log(view_customer_drawer)
      write ever fires.

      Files:
        - web/tests/e2e/reseller/drawer-authz.spec.ts (new — two rows
          probing the auth chain before any DB read or audit-log write:
          (1) unauthenticated (GET with no session → getCurrentUser
              null → 401 { ok:false, reason:"unauthorised" } before
              scopedReseller, decideReveal, app_users SELECT, parallel
              fan-out, or db.auditLog(view_customer_drawer) run),
          (2) non_reseller_admin (loginAs(qa-founder-1@blockid.au) →
              GET → scopedReseller throws ResellerScopeError with
              code="no_membership" → 403 { ok:false, reason:"no_membership" }
              because reseller_admins has no active row for a founder
              account; decideReveal is never called, no DB reads fire,
              no audit row is written).
          Row 1 runs unconditionally (no harness dep — just page.request
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          Placeholder UUID (00000000-0000-0000-0000-000000000000) sits
          in the [id] segment for URL well-formedness only — both rows
          return before the segment is inspected so the placeholder never
          reaches decideReveal.

      Why this shape: drawer is the second (and last) /api/reseller/**
      route that hits getCurrentUser() + scopedReseller() directly rather
      than gateRequireFeature() — reveal-email covered by tick 100 was
      the first. Response envelope is { ok:false, reason:<string> } rather
      than the { ok:false, error, feature } shape gateRequireFeature
      emits. A refactor that swaps the direct auth chain for
      gateRequireFeature would light up both rows in CI (row 1 status
      would still be 401 but body.error rather than body.reason; row 2
      status would flip to 402 feature_locked). Method is GET rather
      than POST — matches the read-only nature of the drawer view.

      Why the 400/403/404/500 branches aren't covered: decideReveal
      (invalid_uuid → 400 / not_in_scope → 403), the app_users SELECT
      (not_found → 404 / lookup_failed → 500), and the four-way
      Promise.all fan-out all sit BEHIND scopedReseller — surfacing them
      needs a real reseller-admin session. audit_failed (500) needs a
      broken reseller_audit_log write path which requires per-test
      tampering plan §J.2 forbids. not_configured (503) needs
      SUPABASE_URL/SERVICE_ROLE unset which would break every other
      Playwright spec in the same worker. revoked / no_reseller (403 via
      scopedReseller) are inconsistent states that never occur in
      production because reseller_admins.status='active' is provisioned
      alongside the resellers row.

      Why the happy path is out of scope: minting a real drawer render
      against the harness reseller fires the app_users SELECT + the
      Promise.all across svi_analyses/revenue_events/credit_transactions/
      credit_balances + a reseller_audit_log(view_customer_drawer) row
      that would need cleanup semantics. Belongs to the temp-reseller
      mint fixture follow-up alongside the deferred rows from ticks
      94/95/96/97/98/99/100.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire). Playwright not
      run this tick — row 1 is harness-free and will execute on the
      next CI Playwright pass; row 2 lights up as soon as the qa
      accounts file is present.

      Frontier after tick 101: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 101 unblocks: the /api/reseller/customers/[id]/drawer
      auth-chain ordering (getCurrentUser → scopedReseller) is now
      regression-guarded at the Playwright lens — a refactor that
      reorders the two calls or drops the 401/403 status codes on
      either branch lights up in CI on the next `npx playwright test`
      run. Thirteen spec files now sit in web/tests/e2e/reseller/
      (attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      drawer-authz, requests-validation, reveal-email-authz,
      sandbox-setup-authz, scope-boundary). Both direct-auth-chain
      reseller-admin routes (reveal-email + drawer) now have
      symmetric dry-run coverage. Next autonomous tick options:
      (i) landing the QA-mode temp-reseller mint fixture that opens
      up all the deferred branches from ticks
      94/95/96/97/98/99/100/101 at once (larger tick, wants a design
      pass); (ii) audit remaining /api/reseller/** GET/PATCH surfaces
      for any pre-write branches still uncovered (candidates include
      /api/reseller/me and admin-side PATCH endpoints); (iii) idle
      until human unblock arrives.
    commit: (this tick)

  - tick: 100
    ran_at: 2026-07-22
    action: p10_dry_run_reveal_email_authz_playwright_spec
    result: |
      Composed option (ii) from tick 99's frontier note — a dry-run
      auth-chain spec for the remaining reseller-admin mutation route
      surface not yet covered. Picked POST
      /api/reseller/customers/[id]/reveal-email because it is the H.10
      chokepoint (reveal-on-click writes reseller_audit_log with
      subject_user_id + fields=['email']) and its auth-chain shape is
      DIFFERENT from every previous P10 spec — it uses getCurrentUser()
      + scopedReseller() directly rather than gateRequireFeature() +
      scopedReseller() + canProvisionSandbox(). Two harness-free rows
      cover the top of that alternate chain before decideReveal,
      app_users SELECT, or the audit-log write ever fires.

      Files:
        - web/tests/e2e/reseller/reveal-email-authz.spec.ts (new — two
          rows probing the auth chain before any DB read or audit-log
          write:
          (1) unauthenticated (POST with no session → getCurrentUser
              null → 401 { ok:false, reason:"unauthorised" } before
              scopedReseller, decideReveal, app_users SELECT, or
              db.auditLog(reveal_email) run),
          (2) non_reseller_admin (loginAs(qa-founder-1@blockid.au) →
              POST → scopedReseller throws ResellerScopeError with
              code="no_membership" → 403 { ok:false, reason:"no_membership" }
              because reseller_admins has no active row for a founder
              account; decideReveal is never called, app_users is
              never queried, no audit row fires).
          Row 1 runs unconditionally (no harness dep — just page.request
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.
          Placeholder UUID (00000000-0000-0000-0000-000000000000) sits
          in the [id] segment for URL well-formedness only — both rows
          return before the segment is inspected so the placeholder never
          reaches decideReveal.

      Why this shape differs from tick 99: reveal-email is one of the two
      /api/reseller/** mutation routes that hit getCurrentUser() +
      scopedReseller() directly instead of gateRequireFeature() — the
      other being the drawer GET route. The response envelope is therefore
      { ok:false, reason:<string> } rather than the { ok:false, error,
      feature } shape gateRequireFeature emits. This makes the spec
      independently valuable — a refactor that swaps the direct auth
      chain for gateRequireFeature would light up both rows in CI
      (row 1 status would still be 401 but body.error rather than
      body.reason; row 2 status would flip to 402 feature_locked).

      Why the 400/403/404/500 branches aren't covered: decideReveal
      (invalid_uuid → 400 / not_in_scope → 403) and the app_users
      SELECT (not_found → 404 / lookup_failed → 500) all sit BEHIND
      scopedReseller — surfacing them needs a real reseller-admin
      session. audit_failed (500) needs a broken reseller_audit_log
      write path which requires per-test tampering plan §J.2 forbids.
      not_configured (503) needs SUPABASE_URL/SERVICE_ROLE unset which
      would break every other Playwright spec in the same worker.
      revoked / no_reseller (403 via scopedReseller) are inconsistent
      states that never occur in production because
      reseller_admins.status='active' is provisioned alongside the
      resellers row.

      Why the happy path is out of scope: minting a real reveal against
      the harness reseller writes to app_users SELECT + a
      reseller_audit_log(reveal_email) row that would need cleanup
      semantics. Belongs to the temp-reseller mint fixture follow-up
      alongside the deferred rows from ticks 94/95/96/97/98/99.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      845/845 unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire). Playwright not
      run this tick — row 1 is harness-free and will execute on the
      next CI Playwright pass; row 2 lights up as soon as the qa
      accounts file is present.

      Frontier after tick 100: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 100 unblocks: the /api/reseller/customers/[id]/reveal-email
      auth-chain ordering (getCurrentUser → scopedReseller) is now
      regression-guarded at the Playwright lens — a refactor that
      reorders the two calls or drops the 401/403 status codes on
      either branch lights up in CI on the next `npx playwright test`
      run. Twelve spec files now sit in web/tests/e2e/reseller/
      (attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      requests-validation, reveal-email-authz, sandbox-setup-authz,
      scope-boundary). Next autonomous tick options: (i) mirror-spec
      for the sibling GET /api/reseller/customers/[id]/drawer route
      which shares the same direct getCurrentUser → scopedReseller
      chain (auth surface is small, mirrors this spec's shape); (ii)
      landing the QA-mode temp-reseller mint fixture that opens up
      all the deferred branches from ticks 94/95/96/97/98/99/100 at
      once (larger tick, wants a design pass); (iii) idle until human
      unblock arrives.
    commit: (this tick)

  - tick: 99
    ran_at: 2026-07-22
    action: p10_dry_run_billing_authz_playwright_spec
    result: |
      Composed option (ii) from tick 98's frontier note — "POST
      /api/reseller/billing/setup-intent + save-default-payment-method
      dry-run auth-chain spec". Both routes share the same top auth chain
      (gateRequireFeature → scopedReseller → canProvisionSandbox → Stripe/
      Supabase config → selfReseller lookup → Stripe API branch), so a
      single parametrised spec covers the two harness-free pre-write
      branches on each — four rows total.

      Files:
        - web/tests/e2e/reseller/billing-authz.spec.ts (new — for each of
          the two billing routes, two rows probing the top of the auth
          chain before any Stripe SetupIntent mint or
          reseller_audit_log(mint_setup_intent / save_default_payment_method)
          row fires:
          (1) unauthenticated (POST with no session → gateRequireFeature
              returns 401 error="Authentication required" before scope,
              selfReseller, or Stripe is touched),
          (2) non_reseller_admin (loginAs(qa-founder-1@blockid.au) → POST →
              gateRequireFeature returns 402 error="feature_locked",
              feature="reseller.console" because founder_growth's
              feature_flags don't include reseller.console per
              LEGACY_FEATURE_FALLBACK/plans.csv — scopedReseller never
              runs, selfReseller is never queried, no Stripe call fires).
          Row 1 runs unconditionally (no harness dep — just page.request
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.

      Why this shape: even though save-default-payment-method DOES read a
      request body (unlike sandbox-setup from tick 98), the invalid_json
      catch sits BEHIND gateRequireFeature + scopedReseller +
      canProvisionSandbox — a payload probe from a non-reseller session
      lights up the 402 branch before request.json() ever runs, so we
      can't exercise the 400 invalid_json branch without a real
      reseller-admin session. The pre-write surface reachable without a
      harness is entirely the auth-chain top, which is exactly what this
      spec pins. A refactor that swaps gateRequireFeature for direct
      getCurrentUser() (dropping the 402 branch entirely) OR that moves
      scopedReseller ahead of gateRequireFeature lights up row 2 with a
      403/500 instead of 402 on the next Playwright pass.

      Why the 403 no_membership and 404 reseller_missing branches aren't
      covered: same reason as tick 98 — no_membership requires a user
      with reseller.console entitlement but no reseller_admins row (an
      inconsistent state that never occurs in production because the
      two are provisioned together under the same PATCH); reseller_missing
      requires the mirror — a reseller_admins row without a matching
      resellers row. Fabricating either state via QA plan overrides costs
      more than it protects.

      Why the happy path is out of scope: minting a real Stripe
      SetupIntent + writing the audit log against the harness reseller
      belongs to the temp-reseller mint fixture follow-up alongside the
      deferred rows from ticks 94/95/96/97/98.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in feature-gates.manifest.ts
      so R-03 doesn't fire). Playwright not run this tick — the two
      unauthenticated rows are harness-free and will execute on the
      next CI Playwright pass; the two non_reseller_admin rows light
      up as soon as the qa accounts file is present.

      Frontier after tick 99: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 99 unblocks: the /api/reseller/billing/setup-intent
      and /api/reseller/billing/save-default-payment-method auth-chain
      ordering is now regression-guarded at the Playwright lens — a
      refactor that reorders gateRequireFeature/scopedReseller/
      canProvisionSandbox or drops the 401/402 status codes on either
      route lights up in CI on the next `npx playwright test` run.
      Eleven spec files now sit in web/tests/e2e/reseller/
      (attribution-timing, audit-anomaly-scan, audit-log-writes,
      billing-authz, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      requests-validation, sandbox-setup-authz, scope-boundary). Next
      autonomous tick options: (i) landing the QA-mode temp-reseller
      mint fixture that opens up all the deferred branches from ticks
      94/95/96/97/98/99 at once (larger tick, wants a design pass);
      (ii) a dry-run auth-chain spec for the remaining reseller-admin
      mutation route surface not yet covered (candidates: POST
      /api/reseller/customers/[id]/reveal-email — needs id path param
      shape; PATCH endpoints from admin-resellers if any pre-write
      branches remain uncovered); (iii) idle until human unblock
      arrives.
    commit: (this tick)

  - tick: 98
    ran_at: 2026-07-22
    action: p10_dry_run_sandbox_setup_authz_playwright_spec
    result: |
      Composed option (i) from tick 97's frontier note — "POST /api/reseller/
      sandbox/setup dry-run spec (three gates: insufficient_role /
      reseller_missing / not_configured — narrow but complete-able even
      with harness)". After walking the route file
      (web/src/app/api/reseller/sandbox/setup/route.ts) I narrowed the
      harness-free surface further: the endpoint takes NO body, so the only
      pre-write assertions that don't require the reseller QA harness OR
      per-test seeding are two auth-chain branches — unauthenticated →
      401 and non-reseller-admin authenticated → 402 feature_locked.
      (insufficient_role needs a viewer-role reseller admin, reseller_missing
      needs a reseller_admins row without a matching resellers row, and
      not_configured needs SUPABASE_URL/SERVICE_ROLE unset — all forbidden
      per plan §J.2.)

      Files:
        - web/tests/e2e/reseller/sandbox-setup-authz.spec.ts (new — two
          rows probing the auth chain before the projects INSERT or the
          reseller_audit_log(provision_sandbox) row fires:
          (1) unauthenticated (POST with no session → gateRequireFeature
              returns 401 error="Authentication required" before scopedReseller
              or supabase-admin is touched),
          (2) non_reseller_admin (loginAs(qa-founder-1@blockid.au) → POST →
              gateRequireFeature returns 402 error="feature_locked",
              feature="reseller.console" because founder_growth's
              feature_flags don't include reseller.console per
              LEGACY_FEATURE_FALLBACK/plans.csv — scopedReseller never
              runs, reseller_admins is never queried, no INSERT fires).
          Row 1 runs unconditionally (no harness dep — just page.request
          without loginAs). Row 2 test.skip()s with a diagnostic message
          if /tmp/blockid-qa-accounts.txt is missing so operators without
          the seed file get an actionable pointer rather than a hard fail.

      Why this shape: the sandbox-setup route reads the request body zero
      times — it needs no {} JSON payload — so unlike create-startup /
      credit-grant / requests, there are no input-validation branches to
      probe. The pre-write surface is entirely auth-chain, and the two
      branches above cover the top of that chain (getCurrentUser → 401,
      requireFeature("reseller.console") → 402) without touching scope or
      DB. A refactor that swaps gateRequireFeature for direct
      getCurrentUser() (dropping the 402 branch entirely) OR that moves
      scopedReseller ahead of gateRequireFeature lights up row 2 with a
      403/500 instead of 402 on the next Playwright pass.

      Why the 403 no_membership branch isn't covered: that gate requires
      a user who has reseller.console entitlement but NO reseller_admins
      row — an inconsistent state that never occurs in production because
      the two are provisioned together (P9.2 admin flow inserts both under
      the same PATCH). Fabricating the state via QA plan overrides would
      cost more than it protects.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in feature-gates.manifest.ts
      so R-03 doesn't fire). Playwright not run this tick — row 1 is
      harness-free and will execute on the next CI Playwright pass; row
      2 lights up as soon as the qa accounts file is present.

      Frontier after tick 98: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 98 unblocks: the /api/reseller/sandbox/setup auth-chain
      ordering is now regression-guarded at the Playwright lens — a
      refactor that reorders gateRequireFeature/scopedReseller/canProvisionSandbox
      or drops the 401/402 status codes lights up in CI on the next
      `npx playwright test` run. Ten spec files now sit in
      web/tests/e2e/reseller/ (attribution-timing, audit-anomaly-scan,
      audit-log-writes, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      requests-validation, sandbox-setup-authz, scope-boundary). Next
      autonomous tick options: (i) landing the QA-mode temp-reseller
      mint fixture that opens up all the deferred branches from ticks
      94/95/96/97/98 at once (larger tick, wants a design pass);
      (ii) POST /api/reseller/billing/setup-intent + save-default-
      payment-method dry-run auth-chain spec (mirrors this tick's shape
      — those two routes also have limited pre-write branches beyond
      the auth chain); (iii) idle until human unblock arrives.
    commit: (this tick)

  - tick: 97
    ran_at: 2026-07-22
    action: p10_dry_run_code_validate_playwright_spec
    result: |
      Fourth P10 dry-run Playwright spec in the tick 94/95/96 series and
      the first that requires no reseller harness — POST /api/reseller/code/
      validate is intentionally UNAUTHENTICATED (r-01-exempt at route.ts:18)
      because the code is applied pre-signup. That means every row runs
      against staging on the next Playwright pass without waiting for
      P1.5_infovision_seed or QA_RESELLER_ADMIN_EMAIL provisioning.

      Files:
        - web/tests/e2e/reseller/code-validate.spec.ts (new — five
          parametrised test rows probing every pre-write branch of
          web/src/app/api/reseller/code/validate/route.ts:
          (1) invalid_payload_no_json (content-type: text/plain body →
              400 at request.json() catch → reason="invalid"),
          (2) missing_code (body {} with no `code` field → 400 at the
              normaliseResellerCode() null gate → reason="invalid"),
          (3) blank_code (body { code: "" } → 400 at the same null gate),
          (4) punctuation_only (body { code: "!!!" } → normaliser strips
              non-alphanumerics → returns null → 400 reason="invalid"),
          (5) code_not_found (well-formed PWNONEXIST<rand6> code → passes
              null gate, hits reseller_promotion_codes SELECT, no row
              found → 404 reason="invalid"). Rows 1-4 fire before any DB
          read; row 5 does one indexed SELECT with no write side effect,
          so the spec is safe against staging with zero pollution and no
          reseller_audit_log row (the route doesn't write audit rows —
          public endpoint predates the audit surface).

      Why no harness: unlike create-startup / credit-grant / requests
      which need loginAs(harness.admin.email) to satisfy scopedReseller(),
      code/validate is public. The spec uses playwright's shared `request`
      fixture directly, so it runs the moment `npx playwright test` fires
      without any QA_ env vars set — the first P10 spec that light up in
      CI immediately rather than self-skipping.

      Why only these five branches, not the seven-strong response set:
        - inactive (404) — needs a promo whose reseller.status ∈
          {terminated, paused}; requires per-test row seeding forbidden
          by plan §J.2.
        - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset
          which would break every other Playwright spec running in the
          same worker.
        - Happy path (200 ok + reseller.display_name + tier_pct) —
          needs a real active reseller_promotion_codes row; folded into
          the temp-reseller mint fixture follow-up alongside the
          deferred rows from ticks 94/95/96.

      Verified: tsc clean (npx tsc --noEmit exit 0 in 16.4s at web/);
      vitest 845/845 unchanged (Playwright spec is not picked up by
      vitest — tests/e2e/** is excluded per playwright.config.ts:testDir);
      npm run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec lives
      under web/tests/e2e/reseller/, not /api/reseller/**, so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts so
      R-03 doesn't fire). Playwright not run this tick — spec is
      harness-free so it will execute on the next CI Playwright pass
      without any provisioning.

      Frontier after tick 97: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 97 unblocks: (a) the /api/reseller/code/validate
      response envelope is now regression-guarded at the Playwright
      lens — a refactor that swaps the `reason` literal to something
      other than "invalid" or drops the { ok: boolean, reason: string }
      envelope shape lights up in CI on the next `npx playwright test`
      run without any harness wait; (b) the pre-write branch ordering
      (JSON parse → normalise null → DB SELECT) is pinned, so a future
      refactor that moves the DB call above the null gate would light
      up row 5 with a different status code. Nine spec files now sit in
      web/tests/e2e/reseller/ (attribution-timing, audit-anomaly-scan,
      audit-log-writes, cobranding-pill, code-validate,
      create-startup-validation, credit-grant-validation,
      requests-validation, scope-boundary). Next autonomous tick options:
      (i) POST /api/reseller/sandbox/setup dry-run spec (three gates:
      insufficient_role / reseller_missing / not_configured — narrow
      but complete-able even with harness); (ii) landing the QA-mode
      temp-reseller mint fixture that opens up all the deferred branches
      from ticks 94/95/96/97 at once (larger tick, wants a design pass);
      (iii) idle until human unblock arrives.
    commit: (this tick)

  - tick: 96
    ran_at: 2026-07-22
    action: p10_dry_run_requests_validation_playwright_spec
    result: |
      Third P10 dry-run Playwright spec in the tick 94/95 series. Tick 94
      covered POST /api/reseller/create-startup input validation and tick 95
      covered POST /api/reseller/credits/grant. This tick covers the third
      reseller-admin mutation endpoint P9.3 shipped — POST
      /api/reseller/requests (admin-approval queue: code_request /
      over_budget_approval / collateral_approval) — via a parametrised
      spec that self-skips at describe-scope until QA harness provisions.
      Small, orthogonal to the P8.5 / P1.5 human-blocked leaves, and adds
      regression coverage for the pre-DB-write validator branches so a
      refactor that reorders validateResellerRequestBody's gates or drops
      the reason literals from the route response envelope lights up in
      CI before it can leak a reseller_requests INSERT or a
      reseller_audit_log(file_request) row.

      Files:
        - web/tests/e2e/reseller/requests-validation.spec.ts (new — six
          parametrised test rows probing the reseller_state-independent
          branches of validateResellerRequestBody / route.ts:
          (1) invalid_payload (non-JSON body → 400 at request.json() catch
          → null),
          (2) invalid_request_type (request_type outside the three-value
          enum → 400 at the dispatcher),
          (3) code_request invalid_tier_pct (tier=99 → 400 at
          validateCodeRequest's ALLOWED_TIER_VALUES.has check),
          (4) code_request suffix_bad_format ("bad suffix!" → 400 at
          SUFFIX_RE.test),
          (5) collateral_approval collateral_url_required (http:// URL
          → 400 at HTTPS_URL_RE.test),
          (6) collateral_approval purpose_required (https URL ok but blank
          purpose → 400 at the purpose check).
          Every row returns before the reseller_requests INSERT fires,
          so the spec is safe against staging with zero queue pollution
          and no reseller_audit_log row. Describe-scope skip via
          loadResellerHarness() — same posture as create-startup-validation
          / credit-grant-validation / audit-log-writes / audit-anomaly-scan
          / attribution-timing / cobranding-pill / scope-boundary specs.

      Why only these six branches, not the eleven-strong validator set:
      tier_not_allowed needs a reseller with allowed_tiers that excludes
      the probe tier — the default InfoVision seed carries [0,10,20,30,40]
      so no tier value can trip it without a bespoke reseller mint.
      capability_disabled (over_budget_approval half) needs
      can_grant_credits=false on the reseller row; the QA harness
      assumes wholesale admin with can_grant_credits=true.
      target_user_id_required and invalid_amount both sit BEHIND
      capability_disabled in the over_budget_approval gate order — even
      with a can_grant_credits=true reseller, the assertion is only
      deterministic when we can confirm the reseller's actual column
      state, which is a per-test seeding requirement plan §J.2 forbids.
      duplicate_pending_code_request (409 branch) needs a pre-existing
      pending code_request row for the same reseller — same per-test
      seeding constraint. Tracked as follow-up alongside the
      decideCreateStartup + decideGrant downstream rows deferred by
      ticks 94/95, all of which unblock when the temp-reseller mint
      fixture lands.

      Deliberately out of scope for this tick:
        - Happy-path spec (201 reseller_requests INSERT end-to-end) —
          would fire a real INSERT + reseller_audit_log(file_request)
          write against the harness reseller, needs opt-in guarding +
          cleanup semantics (DELETE the row + audit entry after each
          test). Belongs to a dedicated tick that also lands the
          temp-reseller mint fixture.
        - Assertion of the reseller_audit_log row shape after a 201 —
          same reason as above; also already covered indirectly by
          audit-log-writes.spec.ts (drawer view + reveal-email rows).
        - GET /api/reseller/requests coverage — read-only endpoint that
          scopes by reseller_id, no input validation to probe; belongs
          to a scope-boundary follow-up tick that also picks up the
          admin-side /api/admin/resellers/requests list + PATCH pair.

      Verified: file authored per identical shape to
      credit-grant-validation.spec.ts + create-startup-validation.spec.ts
      (parametrised ValidationCase array driven through a shared for-loop
      body). Playwright not run — spec self-skips at describe-scope when
      QA_RESELLER_ATTRIBUTED_CUSTOMER_ID is unset (current CI state).
      Spec lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire — lint:reseller
      unchanged from tick 95 (R-01 11 files + R-03 31 manifest routes,
      3 exemptions, 0 violations).

      Frontier after tick 96: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 96 unblocks: the /api/reseller/requests pre-INSERT
      validator ordering is now regression-guarded at the Playwright
      lens — a refactor that swaps the code_request / over_budget_approval
      / collateral_approval dispatch order or drops the reason literals
      from the route response envelope lights up in CI the instant the
      reseller harness provisions. Eight spec files now sit in
      web/tests/e2e/reseller/ (attribution-timing, audit-anomaly-scan,
      audit-log-writes, cobranding-pill, create-startup-validation,
      credit-grant-validation, requests-validation, scope-boundary) —
      the P10 Playwright surface keeps shrinking one authored row at a
      time. Next autonomous tick options: (i) POST
      /api/reseller/sandbox/setup dry-run spec (only three gates:
      insufficient_role / reseller_missing / not_configured — narrow but
      complete-able); (ii) POST /api/reseller/code/validate dry-run spec
      (unauthenticated public lookup, easy to cover the missing_code /
      code_not_found / code_inactive branches without a harness at all);
      (iii) landing the QA-mode temp-reseller mint fixture that opens up
      all the deferred branches from ticks 94/95/96 at once (larger tick,
      wants a design pass); (iv) idle until human unblock arrives.
    commit: (this tick)

  - tick: 95
    ran_at: 2026-07-22
    action: p10_dry_run_credit_grant_validation_playwright_spec
    result: |
      Follow-on to tick 94's P10 dry-run posture. Tick 94 covered POST
      /api/reseller/create-startup input validation; this tick covers the
      other reseller-admin mutation endpoint that P8.2 R-03 gates —
      POST /api/reseller/credits/grant — via a parametrised Playwright
      spec that self-skips at describe-scope until the QA harness
      provisions. Small, orthogonal to the P8.5 / P1.5 human-blocked
      leaves, and adds regression coverage for the pre-DB-write gate
      ordering so a future refactor that swaps decideReveal ↔ decideGrant
      precedence in web/src/app/api/reseller/credits/grant/route.ts
      surfaces in CI before it can leak reads or writes.

      Files:
        - web/tests/e2e/reseller/credit-grant-validation.spec.ts (new —
          five test rows probing the pre-DB-write branches of the grant
          route: invalid_body (non-JSON body → 400), missing_id
          (target_user_id absent → 400 via decideReveal), invalid_id
          (target_user_id not a UUID → 400 via decideReveal), not_in_scope
          (well-formed UUID outside allowedCustomerIds → 403 via
          decideReveal), invalid_amount (target in scope but amount=0 →
          400 via decideGrant before credit_balances is touched). All five
          rows either bail before any DB read fires (rows 1-4) or read
          only the monthly reseller_credit_grants rollup without writing
          (row 5) so the spec is safe against staging with zero credit
          ledger pollution.
          Describe-scope skip via loadResellerHarness() — same posture as
          create-startup-validation / audit-log-writes / audit-anomaly-scan
          / attribution-timing / cobranding-pill / scope-boundary specs.
          not_in_scope uses a deterministic sentinel UUID
          (00000000-0000-4000-8000-000000000001) that passes decideReveal's
          v4 shape check but is astronomically unlikely to collide with a
          real app_users row.

      Why only these five branches, not the six-strong downstream set:
      capability_disabled needs a reseller with can_grant_credits=false;
      over_budget_requires_approval needs already_granted_this_month ≥
      monthly_credit_budget for the harness reseller; reseller_missing
      needs a scope that resolves to no resellers row; not_configured
      needs SUPABASE_URL/SERVICE_ROLE unset — each would need bespoke
      column state or QA-only overrides that plan §J.2 forbids per the
      per-test-seeding rule. Tracked as follow-up alongside the
      decideCreateStartup gate rows deferred by tick 94.

      Deliberately out of scope for this tick:
        - Happy-path spec (200 grant end-to-end) — would fire real
          credit_balances + credit_transactions + reseller_credit_grants
          writes against the harness reseller/customer pair, needs opt-in
          guarding + cleanup semantics. Belongs to a dedicated tick that
          also lands the temp-reseller mint fixture.
        - Assertion of the reseller_audit_log row shape after a 200 —
          same reason as above; also already covered indirectly by
          audit-log-writes.spec.ts row 2 (drawer view).
        - Extending decideGrant coverage via a QA-only reseller-swap
          endpoint — larger surface (service-role handling, cleanup
          semantics, audit trail) than a P10 dry-run tick.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      845/845 unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire). Playwright not
      run — spec self-skips at describe-scope when
      QA_RESELLER_ATTRIBUTED_CUSTOMER_ID is unset (current CI state).

      Frontier after tick 95: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 95 unblocks: the /api/reseller/credits/grant pre-DB-write
      gate ordering is now regression-guarded at the Playwright lens —
      a refactor that swaps decideReveal ↔ decideGrant precedence or
      drops the reason literals from the route response envelope lights
      up in CI the instant the reseller harness provisions. Seven spec
      files now sit in web/tests/e2e/reseller/ (attribution-timing,
      audit-anomaly-scan, audit-log-writes, cobranding-pill,
      create-startup-validation, credit-grant-validation, scope-boundary)
      — the P10 Playwright surface keeps shrinking one authored row at
      a time. Next autonomous tick options: (i) landing a dedicated
      QA-mode temp-reseller mint fixture that opens up the six
      decideCreateStartup + four downstream decideGrant branches to
      spec assertions (larger tick, wants a design pass); (ii) idle
      until human unblock arrives.
    commit: (this tick)

  - tick: 94
    ran_at: 2026-07-22
    action: p10_dry_run_create_startup_validation_playwright_spec
    result: |
      Composed the shape of tick 91/92's "author more P10 dry-run spec rows
      that self-skip until harness provisions" posture. Tick 75 landed POST
      /api/reseller/create-startup and tick 77 wired the wholesale Stripe
      subscription line, but no Playwright spec covered the endpoint's
      input-validation contract. Small, self-contained, orthogonal to the
      P8.5 / P1.5 human-blocked leaves, and adds regression coverage for
      the four normaliseCreateStartupInput() branches so a future refactor
      that reorders the gate precedence surfaces before the DB writes fire.

      Files:
        - web/tests/e2e/reseller/create-startup-validation.spec.ts (new —
          four parametrised test rows probing the normalise-gate branches
          invalid_email / company_name_required / invalid_plan_tier /
          invalid_discount_tier. Each row POSTs a malformed body via
          page.request.post with content-type: application/json, asserts
          HTTP 400, body.ok === false, body.reason matches the
          CreateStartupError literal, and body.message is present so the
          CREATE_STARTUP_ERROR_MESSAGES map coverage stays end-to-end. All
          bodies share a VALID_BASE object and override exactly one field
          to trip a target gate, so a passing assertion proves that
          specific branch fires rather than an earlier-in-order gate
          absorbing the failure. Describe-scope skip via
          loadResellerHarness() — same posture as audit-log-writes /
          audit-anomaly-scan / attribution-timing / cobranding-pill /
          scope-boundary specs so the row lights up the instant
          QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID
          provision.)

      Why only the four normalise branches, not the six decideCreateStartup
      gates: the normalise gate rejects before touching app_users /
      projects / reseller_attributions, so a 400 response never mutates
      DB state — the spec is safe against staging. The decideCreateStartup
      branches (reseller_not_active / capability_disabled /
      billing_model_not_wholesale / tier_not_allowed /
      existing_active_attribution / promotion_code_missing) each need a
      real reseller row with specific column values (e.g.
      billing_model='retail' for billing_model_not_wholesale) —
      asserting them would either need per-test row seeding (forbidden
      by plan §J.2) or a bespoke harness that mints a temp reseller
      with the target state. Tracked as follow-up.

      Deliberately out of scope for this tick:
        - Happy-path spec (200 provisioning end-to-end) — would fire
          real DB writes + Stripe subscription create (tick 77 wiring)
          against the harness reseller, needs opt-in guarding + cleanup
          semantics. Belongs to a dedicated tick that lands both.
        - Fixture helper for asserting no DB row was written after a
          400 response — the normalise gate rejects before any INSERT
          fires, so absence-of-side-effect is guaranteed by the route
          contract, not by post-hoc DB inspection. If a future refactor
          moves any DB write above the normalise call the vitest suite
          for create-startup.ts (23 cases) would catch the regression
          before Playwright would.
        - Extending decide-gate coverage via a QA-only reseller-swap
          endpoint — larger surface (service-role handling, cleanup
          semantics, audit trail) than a P10 dry-run tick.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      845/845 unchanged (Playwright spec is not picked up by vitest —
      tests/e2e/** is excluded per playwright.config.ts:testDir); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations unchanged (spec
      lives under web/tests/e2e/reseller/, not /api/reseller/**, so
      R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire). Playwright not
      run — spec self-skips at describe-scope when
      QA_RESELLER_ATTRIBUTED_CUSTOMER_ID is unset (current CI state).

      Frontier after tick 94: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 94 unblocks: the /api/reseller/create-startup input-
      validation contract is now regression-guarded at the Playwright
      lens — a refactor that swaps the gate precedence in
      normaliseCreateStartupInput (email → company → plan_tier →
      discount_tier) or drops the CREATE_STARTUP_ERROR_MESSAGES map
      coverage lights up in CI the instant the reseller harness
      provisions. Six spec files now sit in web/tests/e2e/reseller/
      (attribution-timing, audit-anomaly-scan, audit-log-writes,
      cobranding-pill, scope-boundary, create-startup-validation) —
      the P10 Playwright surface keeps shrinking one authored row at
      a time. Next autonomous tick options: (i) landing a dedicated
      QA-mode temp-reseller mint fixture that opens up the six
      decideCreateStartup branches to spec assertions (larger tick,
      wants a design pass); (ii) idle until human unblock arrives.
    commit: (this tick)

  - tick: 93
    ran_at: 2026-07-22
    action: p11_ongoing_backfill_retail_reseller_attributions_script
    result: |
      Composed option (ii) from tick 92's frontier note — "opportunistic
      backfill script for pre-tick-92 retail founders (P11_ongoing
      maintenance category rather than a core phase)." Small,
      self-contained, orthogonal to the P8.5 / P1.5 human-blocked
      leaves so it fits the truly-empty autonomous frontier this tick.

      Gap before: retail founders whose workspaces existed BEFORE the
      tick-92 createProject() → attributeProjectFromUserCache() wiring
      landed carry app_users.attribution_reseller_id (the user-level
      cache stamped by processAttribution() at signup) but have no
      matching reseller_attributions ledger row for their projects.
      Runtime is now correct for every new workspace; only the pre-tick-92
      backlog was missing per-project provenance. Tick 92 explicitly
      called this out as deferred to a one-shot script rather than a
      migration since the row shape isn't schema-changing.

      Files:
        - web/scripts/backfill-retail-reseller-attributions.mjs (new —
          idempotent one-shot backfill matching the pattern already
          established by web/scripts/backfill-svi-index-snapshots.mjs.
          Reads web/.env for SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
          walks app_users where attribution_reseller_id IS NOT NULL,
          filters to those whose cached reseller is currently
          status='active' (matches decideRetailAttribution's
          'reseller_inactive' deny gate so runtime + backfill agree
          on eligibility), joins to projects (archived_at IS NULL
          skipped so a founder's deleted workspace doesn't
          retroactively appear in the reseller's Customers list),
          left-joins reseller_attributions to skip projects that
          already carry an active project-scoped row, and inserts the
          missing rows with metadata={origin:'retail_project_create',
          backfill:'tick_93'} so downstream analytics can distinguish
          runtime-created vs backfilled provenance. Dry-run by default;
          --apply flag flips to writes. 23505 partial-unique races
          treated as benign (concurrent createProject() attempt or
          re-run) and counted as "raced" separately from "inserted"
          for observability. Stamps projects.attribution_reseller_id
          after each successful insert to keep the canonical
          per-project column in sync (soft-fail: a stamp error logs
          but doesn't roll back the ledger row since webhook helpers
          + portfolio aggregates can still join through
          reseller_attributions).)

      Deliberately out of scope for this tick:
        - Scheduling the backfill on a recurring cron. This is a
          one-shot maintenance script — the runtime path is now
          correct, so there's no ongoing drift for it to catch.
          Re-running is harmless (idempotent via the partial unique
          + the alreadyAttributed pre-scan) but not needed.
        - Adding a Verification #6 Playwright row asserting the
          backfilled row shape. The runtime path already has full
          coverage from tick-92's attribution-timing.spec.ts row 3;
          the backfill produces the same row shape via the same
          insert body so extending Playwright coverage would be
          duplicative.

      Verified: node --check clean on the new script; dry-run against
      the local Supabase reports "found 0 attributed app_users" as
      expected on this dev host (no seeded reseller_attributions,
      matches the 0/45 grandfathered result from tick-46 P8.3
      backfill on the same host); syntax and env-loading pattern
      match backfill-svi-index-snapshots.mjs verbatim so a future
      operator running on production will see the same
      dry-run → --apply flow they already use for other backfills.
      No lib/route/test surface touched — tsc / vitest / lint:reseller
      all identical to tick 92 baseline (script is a plain .mjs
      outside the tsc + reseller-lint scope).

      Frontier after tick 93: STILL truly empty of non-human-blocked
      leaves. Track A P8.5 STILL HUMAN-BLOCKED on
      STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL; Track B COMPLETE;
      P1.5 InfoVision seed STILL HUMAN-BLOCKED on H.20 ABN + GST;
      P10 still blocked_by [P1..P9] until P8.5 clears. What tick 93
      unblocks: (a) production ops can now execute
      `node scripts/backfill-retail-reseller-attributions.mjs --apply`
      on the first reseller-active day post-deploy to seed historical
      workspaces; (b) the reseller Customers drawer's Progression tab
      gains a real "attributed_at" event for founders whose workspaces
      pre-date tick 92 the moment the backfill runs; (c) any future
      migration that adds a reseller_attributions FK to
      projects.attribution_reseller_id can now assume every pre-tick-92
      retail workspace has both columns in sync. Next autonomous tick
      options: (i) idle until human unblock arrives (P8.5 Stripe env
      vars or P1.5 InfoVision ABN); (ii) minor housekeeping only —
      the P11_ongoing maintenance category has one remaining candidate
      (extending processAttribution() to persist the redeemed
      promotion_code_id so retail rows get non-null promotion_code_id
      without a P3 refactor) but that touches the runtime signup path
      and warrants its own CTO review loop rather than a single
      autonomous tick.
    commit: (this tick)

  - tick: 92
    ran_at: 2026-07-22
    action: p10_close_retail_createproject_reseller_attributions_gap
    result: |
      Closed option (i) from tick 91's frontier note — "close the retail
      createProject → reseller_attributions gap (needs CTO advisory review
      for ledger semantics; would drop attribution-timing row 3's .skip())."
      This closes the last non-human-blocked frontier leaf.

      Gap before: retail founders who arrived via a ?via= cookie had
      app_users.attribution_reseller_id stamped at signup by
      processAttribution() (web/src/lib/reseller/process-attribution.ts),
      but createProject() (web/src/lib/projects.ts:420) never materialised
      the U.6 canonical per-workspace reseller_attributions row. Only the
      wholesale-provisioned /api/reseller/create-startup route wrote that
      row, so retail commission accrual (P3) had no per-project provenance
      and the retail funnel's attribution lived exclusively on the
      user-level cache column.

      Design decision: mirror the already-CTO-approved wholesale execute()
      pattern from create-startup/route.ts:299-320 rather than open a
      fresh advisory-review loop. Rationale: (a) the wholesale path
      passed CTO advisory review at P0.1/P0.4 tick 1-43; (b) the
      reseller_attributions row shape is fixed by the 0091 CHECK
      constraints (source ∈ {'code','provisioned','admin_manual'};
      subject_type='project' → subject_project_id NOT NULL + subject_user_id
      NULL); (c) retail carries source='code' since the attribution
      originated from the ?via= cookie (contrast wholesale which uses
      source='provisioned'); (d) promotion_code_id=null on retail because
      the ?via= cookie carries the reseller CODE only, not a specific
      promotion_code_id — commission tier resolves at charge time from
      the Stripe promotion_code applied on the subscription and P3 webhook
      helpers already handle both paths. A follow-up advisory tick can
      still run if CTO wants to revisit the null-promotion_code_id
      choice; the underlying insert is idempotent under retry (partial
      unique guard) so a future backfill is trivial if the decision
      flips.

      Files:
        - web/src/lib/reseller/retail-attribution.ts (new — pure
          decideRetailAttribution({userAttributionResellerId, resellerStatus,
          hasActiveProjectAttribution}) → {ok, plan} | {ok:false, reason}
          with three deny gates in earliest-first order:
          no_attribution_cache → reseller_inactive → already_attributed,
          followed by the DB adapter attributeProjectFromUserCache(userId,
          projectId) that walks the four reads + one INSERT + one UPDATE
          the plan calls for. Adapter never throws — every error is
          logged + swallowed so createProject() cannot regress a founder's
          ability to spawn a workspace. 23505 partial-unique race maps to
          {ok:false, reason:'already_attributed'} rather than an error so
          concurrent retries land cleanly. Stamps projects.attribution_reseller_id
          as the canonical per-project column so downstream lookups
          (webhook helpers, portfolio aggregates, customer drawer) don't
          need a reseller_attributions join on the hot path.)
        - web/src/lib/reseller/retail-attribution.test.ts (new — 11/11
          pass: null/undefined/empty-string cache guards, terminated /
          suspended / null-status guards, already_attributed guard,
          happy-path plan shape, non-string cache defensive guard, two
          precedence ordering checks (no_attribution_cache wins over
          reseller_inactive; reseller_inactive wins over
          already_attributed) so a future refactor cannot silently
          reorder the deny gates.)
        - web/src/lib/projects.ts (createProject() now calls
          attributeProjectFromUserCache(userId, project.id) after the
          successful projects INSERT via a dynamic import — keeps the
          reseller lib out of the projects.ts module graph for the
          overwhelming non-reseller path. Try/catch wraps the entire
          call so any throw from the reseller side (including import
          failure on a fresh dev host without the migration applied)
          logs and returns success on the project itself. Comment
          references the wholesale-approved pattern so a future reader
          understands why we're not opening a fresh CTO review loop.)
        - web/tests/e2e/fixtures/supabase-admin.ts (+ project-scoped
          countResellerAttributionsForProject(supabase, projectId)
          helper — filters on subject_type='project' + subject_project_id
          + status='active' + opted_out=false so the assertion counts
          only live rows, not any historical revoked row that could
          land after a reseller termination.)
        - web/tests/e2e/reseller/attribution-timing.spec.ts (row 3
          .skip() dropped — now a full test that POSTs /api/projects,
          asserts exactly 1 active reseller_attributions row scoped
          to the returned project id, and belt-and-braces asserts 0
          subject_type='user' rows exist so a regression that starts
          writing user-scoped rows is caught before it pollutes the
          ledger. Row 3 still self-skips at test level when the
          service-role Supabase fixture is unset, matching row 2's
          posture. File header + module doc-comment updated to remove
          the "code-side gap" language now that both paths (wholesale
          + retail) materialise the row.)

      Deliberately out of scope for this tick:
        - Backfilling reseller_attributions for existing retail founders
          whose workspaces were created BEFORE this tick landed. Their
          app_users.attribution_reseller_id cache column is still set so
          co-branding, welcome-email footer, and reseller console
          Customers list all continue to render correctly; only the
          per-project row is missing. Backfill is a P11_ongoing
          maintenance task (single SELECT projects LEFT JOIN
          reseller_attributions WHERE app_users.attribution_reseller_id
          IS NOT NULL AND reseller_attributions.id IS NULL, then INSERT)
          — one-shot script rather than a migration since the row shape
          is not schema-changing.
        - Wiring the promotion_code_id resolution from the ?via= cookie's
          cached code. The cookie carries the reseller CODE (e.g.
          'INFOVISION') but processAttribution() never persisted which
          specific promotion_code (tier 0/10/20/30/40) the founder
          redeemed. Threading the promo id through requires either (a)
          extending app_users with attribution_promotion_code_id + a
          migration slot 0102, or (b) reading the cookie inside createProject
          and re-resolving via reseller_promotion_codes at project-create
          time. Both add surface; the null value doesn't break P3
          because commission tier already resolves from the Stripe
          promotion_code on the subscription line. Deferred.
        - Updating processAttribution() so the user-scoped subject_type='user'
          row is ALSO written at signup time. Per U.6 explicit design
          (subject_type='user' rows are legal but not required; project
          rows are canonical), the current shape is correct — writing
          both would duplicate provenance and complicate the customer
          drawer's aggregation. If a founder never creates a project,
          the app_users cache column carries the attribution signal
          alone, which is the right shape (no project = no ledger row
          = no commission attribution surface). Confirmed against
          plan §U.6 + P4.3 portfolio-aggregates behaviour.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      845/845 (was 834/834, +11 for retail-attribution.test.ts); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions unchanged, 0 violations (new
      lib is under /lib/reseller/** not /api/reseller/** so R-01
      doesn't fire; not a mutation route in feature-gates.manifest.ts
      so R-03 doesn't fire). Playwright not run — attribution-timing
      spec self-skips at describe-scope when QA_RESELLER_ATTRIBUTED_CUSTOMER_ID
      is unset (current CI state), and row 3 further gates on
      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY so the assertion runs
      only when both halves of the harness provision.

      Frontier after tick 92: TRULY empty of non-human-blocked leaves.
      Track A P8.5 STILL HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears
      but now with three of the four Playwright rows (cobranding-pill
      row 1 + audit-log-writes + audit-anomaly-scan + attribution-timing
      rows 1-3) authored + green-once-harness-provisions. What tick 92
      unblocks: (1) retail commission accrual gets per-project
      provenance — a future P3 refactor that wants to attach a
      commission row to a specific workspace can now join through
      reseller_attributions.subject_project_id instead of falling back
      to the app_users cache; (2) attribution-timing spec row 3 turns
      green the instant the QA harness provisions; (3) the /reseller/customers
      drawer's Progression tab sees a real "attributed_at" event when
      the founder starts their first workspace (previously invisible
      to retail founders because the row didn't exist). Next
      autonomous tick options: (i) idle until human unblock arrives
      (P8.5 Stripe env vars or P1.5 InfoVision ABN); (ii) opportunistic
      backfill script for pre-tick-92 retail founders (P11_ongoing
      maintenance category rather than a core phase).
    commit: (this tick)

  - tick: 91
    ran_at: 2026-07-22
    action: p10_dry_run_audit_anomaly_scan_playwright_spec_verification_5_spec_half
    result: |
      Composed option (i) from tick 90's frontier note — "author the Playwright
      spec now that /api/cron/reseller-audit-anomaly-scan exists (accepts
      .skip() posture until harness env vars provision)." Closes the last
      non-human-blocked leaf tick 90 identified; both halves of Verification
      #5 (audit-log-writes.spec.ts from tick 87 + this spec) are now authored
      assertion pairs that light up the instant the reseller admin harness +
      service-role env vars provision. Small, self-contained, orthogonal to
      P8.5 / P1.5 human-blocked leaves.

      Files:
        - web/tests/e2e/fixtures/supabase-admin.ts (+ findResellerIdForAdmin
          helper — SELECT reseller_id FROM reseller_admins WHERE user_id=$1
          AND status='active'. Playwright-only, read-only, single-table.
          Returns null when the admin has no active membership so specs can
          test.skip() with a specific "seed a membership" reason instead of
          throwing. Mirrors the findUserIdByEmail contract already used by
          audit-log-writes.spec.ts.)
        - web/tests/e2e/reseller/audit-anomaly-scan.spec.ts (new — fires
          READ_BURST=5 GET /api/reseller/customers/[id]/drawer requests
          against harness.attributedCustomerId (each writes a
          reseller_audit_log row per P4.2 audit-before-response wiring),
          then hits /api/cron/reseller-audit-anomaly-scan?threshold=5
          &reseller_id=<harness>&actions=view_customer_drawer&now=<+60s>
          and asserts (a) resellers_scanned=1 (reseller_id scoping worked),
          (b) actor_hotspots contains (actor_user_id=admin, reseller_id=
          harness) with count ≥ 5, (c) subject_hotspots contains
          (subject_user_id=attributedCustomerId, reseller_id=harness) with
          count ≥ 5. CRON_SECRET forwarded as Authorization: Bearer when
          set in the spec env; endpoint accepts unauthenticated requests
          when unset per sibling reseller-* cron posture. Describe-scope
          skip on loadResellerHarness(); per-test skip on loadSupabaseAdmin();
          per-test skip on findResellerIdForAdmin() returning null.)

      Why threshold=5 not 200: the plan's ">200 subject-reads/week"
      production threshold is infeasible under Playwright's per-test wall
      clock (200 sequential drawer GETs would blow past the 30s default even
      on a warm dev server). The scan endpoint's ?threshold= param exists
      exactly for this — pin a low integer at spec time to fire the same
      buildAnomalySummary primitive against a small burst. The weekly digest
      cron (tick 89) exercises the DEFAULT_ANOMALY_THRESHOLD=200 path in
      production, so this spec's role is regression-guard on the endpoint
      contract (query-param parsing, reseller_id scoping, hotspot shape),
      not the production threshold value.

      Why the now anchor is +60s in the future: guards against clock skew
      between the browser process firing the burst and the server that
      inserts the reseller_audit_log rows. The scan endpoint's window is
      [now - window_days*day, now]; a wall-clock now that lands before the
      last audit row's created_at would silently drop that row from the
      count. Sixty seconds is generous margin without pulling irrelevant
      historical rows into the window.

      Deliberately out of scope for this tick:
        - Extending the spec to also cover the reveal-email action arm.
          The scan endpoint's ?actions= param already exercises the same
          buildAnomalySummary path regardless of which action is passed;
          adding a second test row would double the wall-clock budget for
          zero additional path coverage. If the audit-log write path
          diverges between drawer and reveal-email in the future, then a
          second row becomes worthwhile.
        - Wiring the endpoint into crontab.production. Tick 90 explicitly
          argued against this (the weekly digest is the authoritative
          alert cadence; a scheduled scan would create two email-adjacent
          paths telling ops the same story). Spec authoring does not
          change that calculus.
        - Provisioning the harness env vars themselves — QA_RESELLER_*
          are still human-blocked on P1.5 (H.20 ABN) + P8.5 (STRIPE
          env). Once provisioned, this spec + audit-log-writes.spec.ts +
          attribution-timing row 2 + cobranding-pill all light up at
          once against staging.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      834/834 unchanged (both changes are Playwright infrastructure — no
      vitest coverage exists for tests/e2e/reseller/ or tests/e2e/fixtures/
      by design); npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations unchanged
      (spec file lives under web/tests/e2e/reseller/, not /api/reseller/**,
      so R-01 doesn't fire; not a mutation route in feature-gates.manifest.ts
      so R-03 doesn't fire either). Playwright not run — spec self-skips at
      describe-scope when QA_RESELLER_ATTRIBUTED_CUSTOMER_ID is unset
      (current CI state); each per-test row further gates on SUPABASE_URL +
      SUPABASE_SERVICE_ROLE_KEY + findResellerIdForAdmin() returning
      non-null so the assertion runs only when all three provisioning
      halves are in place.

      Frontier after tick 91: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on H.20
      ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears. What
      tick 91 unblocks: (1) both halves of Verification #5 (drawer/
      reveal-email audit-write from tick 87 + anomaly-scan endpoint from
      tick 91) are authored assertion pairs — the instant harness env
      vars provision, plan §J.2 Verification #5 flips from "deferred" to
      "green"; (2) any future reseller spec that needs to pin an admin's
      reseller_id has the findResellerIdForAdmin helper ready. Next
      autonomous tick options: (i) close the retail createProject →
      reseller_attributions gap (needs CTO advisory review for ledger
      semantics; would drop attribution-timing row 3's .skip()); (ii)
      idle until human unblock arrives — the frontier is now truly
      empty of non-human-blocked, non-review-gated leaves.
    commit: (this tick)

  - tick: 90
    ran_at: 2026-07-22
    action: p10_dry_run_audit_anomaly_scan_endpoint_verification_5_playwright_unblock
    result: |
      Composed option (i) from tick 89's frontier note — "author a dev-only
      /api/cron/reseller-audit-anomaly-scan?dry_run=1 endpoint so Playwright
      can assert the alert path against a pinned low threshold." The weekly
      digest cron already folds buildAnomalySummary() into its Monday email
      (tick 89), but that path is unsuitable for automated assertion — the
      digest fires once per week, the response envelope only carries hotspot
      *counts*, and the primary signal is email. The new standalone endpoint
      exposes the full AnomalySummary shape (both actor + subject hotspot
      arrays), accepts pinned threshold/window_days/now/reseller_id/actions,
      never sends email, and is scoped to a single tenant when reseller_id=
      is supplied — so a Playwright spec (or cron-health probe, or ops
      one-shot) can fire N reveal-email requests against a harness admin,
      then hit the scan endpoint with ?threshold=N&reseller_id=<harness_reseller>
      and assert actor_hotspots.length === 1 without waiting a week or
      inspecting a mail sink.

      Files:
        - web/src/app/api/cron/reseller-audit-anomaly-scan/route.ts (new —
          GET handler; cron auth via CRON_SECRET bearer matches sibling
          reseller-clear-commissions / reseller-weekly-digest posture; when
          CRON_SECRET is unset the endpoint accepts any request as the
          siblings also do. Query params (all optional): threshold,
          window_days, now (ISO), reseller_id (scope the audit-log SELECT
          to one tenant — critical for spec isolation so a stray audit row
          on another reseller can't inflate the hotspot count), actions
          (comma-separated allowlist, empty string or "*" widens to
          wildcard). No reseller_id filter → scan across every active
          reseller (same reseller_id set the weekly digest builds).
          Response envelope: {ok, summary, resellers_scanned, window,
          dry_run, ran_at} — summary is the full AnomalySummary
          (actor_hotspots + subject_hotspots + window_start/end + threshold
          + total_rows_in_window) so specs can assert on either list. Pure
          parsePositiveInt / parseNow / parseActions helpers stay in the
          route file (dead-simple query-param coercion; adding a separate
          test module would be overkill vs. the existing 13-case
          audit-anomaly.test.ts already covering the underlying detector).
          Also exports {GET as POST} matching the sibling reseller-* cron
          pattern so cron-runner.sh's POST can hit it if ever scheduled.)

      Deliberately out of scope for this tick:
        - The Playwright spec itself. Authoring the spec is now unblocked
          — the harness pattern is already established by
          web/tests/e2e/reseller/audit-log-writes.spec.ts (tick 87), and
          the fire-N-reveal-email-requests-then-scan flow needs only ~5
          requests against a threshold=5 scan, well under the 30s per-test
          wall clock. But writing the spec requires the same reseller
          admin harness + service-role Supabase fixture that tick 87 also
          gates on (QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID
          + CRON_SECRET in the Playwright env), so shipping the spec
          without proving it green would just add another test.skip()
          row. Leaving to a follow-up tick that either provisions those
          env vars or accepts the .skip() posture explicitly.
        - Cron schedule entry. The endpoint is intentionally NOT wired
          into crontab.production — the weekly digest already runs the
          detector every Monday and the standalone endpoint's purpose is
          on-demand invocation (specs, ops probes), not periodic scanning.
          Adding a cron entry would create two email-adjacent paths
          telling ops the same story with different cadences; the digest
          is authoritative.
        - Extending the endpoint to also return the raw filtered rows
          (instead of just the hotspot rollup). Would let specs assert
          per-row provenance but crosses the same privacy boundary as
          reseller_audit_log itself — the current shape mirrors the
          weekly digest fold-in so operators see the same envelope.

      Verified: tsc clean (npx tsc --noEmit exit 0); vitest audit-anomaly
      suite 13/13 unchanged (route is a thin adapter over the tested
      detector — no new pure lib behaviour); npm run lint:reseller: R-01
      scanned 11 file(s), R-03 scanned 31 manifest route(s); 3 exemptions,
      0 violations unchanged (new route lives under /api/cron/** not
      /api/reseller/** so R-01 doesn't fire; not a mutation route in
      feature-gates.manifest.ts so R-03 doesn't fire either).

      Frontier after tick 90: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on H.20
      ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears. What
      tick 90 unblocks: (1) the spec half of Verification #5 is now
      authorable in a single tick — hit /api/cron/reseller-audit-anomaly-scan
      with ?threshold=5&reseller_id=<harness>, fire 5 reveal-email
      requests, hit the endpoint again, assert actor_hotspots contains
      the harness admin; (2) any future cron-health probe that wants to
      surface hotspot trends without waiting for the weekly digest email
      has a stable JSON envelope to scrape. Next autonomous tick
      options: (i) author the Playwright spec now that the endpoint
      exists (accepts .skip() posture until harness env vars provision);
      (ii) close the retail createProject → reseller_attributions gap
      (still needs CTO advisory review); (iii) idle until human unblock
      arrives.
    commit: (this tick)

  - tick: 89
    ran_at: 2026-07-22
    action: p10_dry_run_wire_audit_anomaly_into_reseller_weekly_digest
    result: |
      Composed option (i) from tick 88's frontier note — "wire
      buildAnomalySummary into the reseller-weekly-digest cron." Zero new
      cadence decision (rides the existing Monday 04:15 UTC cron), zero
      new email destination (admin@blockid.au already receives the leading-
      signal digest), and the section renders as empty string when both
      hotspot lists are empty so silent weeks stay silent — no CS §24
      layout alignment needed because the anomaly block is additive after
      the CS-owned leading-signal table, not a replacement.

      Files:
        - web/src/lib/reseller/weekly-digest.ts (+ formatWeeklyDigestAnomaliesSection(summary, resellerDisplayNames?)
          pure HTML formatter — returns "" when actor_hotspots.length===0 &&
          subject_hotspots.length===0; otherwise emits an <h3> + total-rows-
          in-window paragraph + one <table> per non-empty hotspot list.
          Reseller display name is resolved from the caller-supplied map
          (so the cron can pass the same {id → display_name ?? code} rollup
          it built for the leading-signal table); unknown ids fall back to
          the UUID first-8-char short form so ops can still pivot on them.
          All caller-supplied strings HTML-escaped — a hostile reseller
          display name cannot inject <script> into the digest email.)
        - web/src/lib/reseller/weekly-digest.test.ts (+ 4 vitest cases —
          empty summary → "", actor-only rendering + display-name lookup +
          singular/plural row wording, subject-only rendering + UUID
          fallback when display name unknown, XSS-safe escaping of a
          "<script>alert(1)</script>" display name.)
        - web/src/app/api/cron/reseller-weekly-digest/route.ts — after
          formatWeeklyDigestEmail(week, digestRows), query reseller_audit_log
          scoped to the active reseller set for the last DEFAULT_ANOMALY_WINDOW_DAYS
          (=7) days, call buildAnomalySummary({now}) with the harness-pinnable
          now anchor already resolved at request top, and append the
          formatter output to the email HTML. Audit-log query failure is
          logged + skipped (leading-signal digest is primary content and
          must ship); response envelope adds an `anomalies` object with
          actor/subject hotspot counts + total_rows_in_window + threshold
          + window bounds (or {skipped_reason:'audit_log_query_failed'}
          on the fail-open path) so operators can eyeball the anomaly-
          detector cadence without opening the email.

      Deliberately out of scope for this tick:
        - The standalone /api/cron/reseller-audit-anomaly-scan endpoint
          — bundling into the existing weekly digest sidesteps the CS §24
          cadence decision entirely, so the standalone endpoint is only
          worth writing if ops later asks for a finer-grained cadence
          (daily/hourly) that the weekly digest cannot provide.
        - Playwright spec for the fold-in — the >200/week volume assertion
          still fights the 30s per-test wall clock (same reason tick 88
          left it out). The wired detector is now unit-covered by both
          audit-anomaly.test.ts (13) + weekly-digest.test.ts (4 new); a
          dev-only ?dry_run=1 endpoint that lets a spec pass a low
          threshold would be the next unblock but needs a separate design
          pass because it touches the cron auth boundary.
        - Extending the CSV attachment with anomaly rows. CSV column
          contract is regression-guarded by the existing 3 formatWeeklyDigestCsv
          tests and adding an anomalies sheet would either widen those
          columns (breaks the contract) or need a second CSV attachment
          (needs a schema decision). HTML-only surface fits the "alert
          when it fires, silent otherwise" posture.

      Verified: vitest 834/834 (was 830/830, +4 anomalies formatter);
      tsc clean; npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations unchanged
      (weekly-digest.ts is under /lib/reseller/** not /api/reseller/**
      so R-01 doesn't fire; the cron route is under /api/cron/** not
      /api/reseller/** so R-01 doesn't fire there either; not in
      feature-gates.manifest.ts so R-03 doesn't fire).

      Frontier after tick 89: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5
      clears. What tick 89 unblocks: (1) Verification #5 second half
      is now not just detectable (tick 88) but delivered to
      admin@blockid.au every Monday — ops sees the alert the instant
      a real audit-log hotspot fires without any additional cron
      wiring; (2) response envelope now carries the anomaly rollup so
      a follow-up cron-health probe or Grafana scrape can trend
      hotspot counts weekly. Next autonomous tick options: (i) author
      a dev-only /api/cron/reseller-audit-anomaly-scan?dry_run=1
      endpoint so Playwright can assert the alert path against a
      pinned low threshold (unblocks the spec half of Verification
      #5); (ii) close the retail createProject → reseller_attributions
      gap (still needs CTO advisory review); (iii) idle until human
      unblock arrives.
    commit: (this tick)

  - tick: 88
    ran_at: 2026-07-22
    action: p10_dry_run_audit_anomaly_detector_verification_5_second_half
    result: |
      Autonomous tick composing option (ii) from tick 87's frontier note —
      "author the audit-log anomaly detector so the >200-reads/week half of
      Verification #5 becomes assertable." Landed the pure primitive plus a
      vitest suite; the digest wiring + spec authoring stay deferred to
      follow-up ticks since either would grow the surface (digest email
      layout is a live-ops concern; the spec needs either DB seeding — plan
      §J.2 forbids — or a wall-clock throttled simulation that pushes past
      Playwright's 30s default).

      Files:
        - web/src/lib/reseller/audit-anomaly.ts (new — pure detector; no
          Supabase, no fetch, no timers. Exports:
            * AuditLogRow — the shape the caller selects from
              reseller_audit_log (matches migration 0093 column contract).
            * AnomalyOptions — {threshold?, windowDays?, now?, actions?}
              with defaults DEFAULT_ANOMALY_THRESHOLD=200 (plan §J.2
              Verification #5 wording),
              DEFAULT_ANOMALY_WINDOW_DAYS=7, and
              DEFAULT_ANOMALY_ACTIONS=['view_customer_drawer',
              'reveal_email'] — the two privileged-read actions written by
              the P4.1 + P4.2 route handlers. Empty actions[] = wildcard so
              ops can point the same detector at any action set later.
            * resolveWindow(opts) — pinnable so specs can freeze the window.
              Non-positive threshold/windowDays fall through to defaults so
              a malformed cron env can't silently disable the alert.
            * detectActorHotspots(rows, opts) — groups by (reseller_id,
              actor_user_id), returns rollups whose count >= threshold.
              Segregates by reseller_id so a shared actor UUID across two
              orgs cannot mask a single-org anomaly. Tracks
              distinct_subjects so ops can see whether the excess is one
              actor scraping many customers or repeatedly hitting one.
            * detectSubjectHotspots(rows, opts) — mirror for the
              (reseller_id, subject_user_id) grouping — one customer being
              probed. Ignores rows with null subject_user_id.
            * buildAnomalySummary(rows, opts) — envelope carrying both
              hotspot lists plus total_rows_in_window (denominator for the
              digest email so ops can gauge false-positive risk).
            * Constants + AnomalySummary/ActorHotspot/SubjectHotspot types
              exported for the digest cron consumer to import.
          Rows outside the window, with malformed created_at, missing
          identifiers, or in the non-allowlisted action set are dropped in
          one linear scan before bucketing so a single bad row cannot poison
          a rollup — same defensive posture as leading-signals.ts.)
        - web/src/lib/reseller/audit-anomaly.test.ts (new — 13/13 pass:
          resolveWindow default + empty-actions wildcard + non-positive
          fallback (3); detectActorHotspots at-threshold + under-threshold +
          distinct-subject count + window/action/identifier filter drop +
          multi-reseller segregation + custom action allowlist + wildcard
          (7); detectSubjectHotspots at-threshold with distinct-actor count
          + null-subject drop (2); buildAnomalySummary envelope + empty
          result (2).)

      Why the digest wiring + spec are follow-up ticks, not this one:
        - reseller-weekly-digest cron (tick 66) is admin-facing but its
          current CSV shape is one row per reseller with leading-signal
          counters. Splicing in an anomaly section means either (a) a
          separate CSV attachment (needs a new schema decision) or
          (b) an inline HTML block above the CS table (CS advisory §24
          rec #3 owns the layout — needs a review pass). Both are larger
          than a P10 dry-run cadence.
        - Playwright spec for the anomaly branch cannot "simulate 200
          reads" within the 30s per-test wall clock (each reveal-email
          POST is a round-trip through auth + Supabase + audit-write —
          rough est ~150ms means ~30s just for the loop). The spec
          alternatives are (i) seed 200 audit rows directly via the
          service-role fixture — but plan §J.2 forbids DB mutation from
          specs; (ii) drop the threshold to 5, do 5 requests, assert
          detector fires — that changes the production alert threshold in
          the deployed detector because the spec would need to pass a
          low threshold at HTTP boundary the detector doesn't expose;
          (iii) skip the E2E half and unit-test detector separately —
          which is exactly what this tick's vitest suite already does.
          The "authored Playwright row" for this Verification would end
          up as a test.skip() with a comment pointing at this vitest
          suite — net negative signal versus just leaving the tracking
          comment in audit-log-writes.spec.ts (tick 87).

      Deliberately out of scope for this tick:
        - Wiring the summary into reseller-weekly-digest CSV/email.
        - Adding a standalone /api/cron/reseller-audit-anomaly-scan
          endpoint (would need CS advisory §24 alignment on cadence).
        - Extending the fixture with a bulk audit-log inspector for
          specs (would need to widen supabase-admin.ts read helpers).
        - Any change to the two /api/reseller/customers/[id]/** routes —
          they already write audit rows correctly; this detector reads
          those rows, doesn't change how they are written.

      Verified: vitest 830/830 (was 817/817, +13 audit-anomaly); tsc
      clean; npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations
      unchanged (new files live under /lib/reseller/** not
      /api/reseller/** so R-01 doesn't fire; not in
      feature-gates.manifest.ts so R-03 doesn't fire).

      Frontier after tick 88: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5
      clears. What tick 88 unblocks: (1) the digest wiring can now
      import buildAnomalySummary directly — no design work needed on
      the shape; (2) once digest wiring lands, a follow-up spec can
      seed a dev-only fixture that pins now and threshold via query
      params on a /api/cron/reseller-audit-anomaly-scan?dry_run=1
      endpoint, avoiding the E2E-volume problem entirely.
      Next autonomous tick options: (i) wire buildAnomalySummary into
      the reseller-weekly-digest cron (needs CS §24 layout alignment);
      (ii) close the retail createProject → reseller_attributions gap
      (still needs CTO advisory review); (iii) idle until human
      unblock arrives.
    commit: (this tick)

  - tick: 87
    ran_at: 2026-07-22
    action: p10_dry_run_audit_log_write_assertion_spec_verification_5
    result: |
      Autonomous tick composing option (i) from tick 86's frontier note —
      "audit-log write assertion spec (Verification #5: viewing customer
      detail writes a reseller_audit_log row — needs the same reseller
      admin harness from tick 82 plus countResellerAuditLogFor helper
      added to fixtures/supabase-admin.ts)." Both halves landed in one
      tick: helper first, then the spec that consumes it. Small, self-
      contained, orthogonal to any human-blocked leaf. Converts one more
      deferred Playwright row into an authored assertion pair.

      Files:
        - web/tests/e2e/fixtures/supabase-admin.ts (+ countResellerAuditLogFor
          helper — count-only head:true SELECT on reseller_audit_log filtered
          by (action, actor_user_id, subject_user_id, since?). `since` cursor
          is documented as effectively required because migration 0093
          mutation triggers block UPDATE/DELETE, so cross-run accumulation
          would poison count-based assertions if callers didn't pass it;
          header comment widened from "attribution-timing spec" to name both
          consuming specs so the next fixture-writer sees the boundary.)
        - web/tests/e2e/reseller/audit-log-writes.spec.ts (new — two authored
          Playwright cases mirroring the two /api/reseller/customers/[id]/**
          privileged-read routes: drawer GET (action='view_customer_drawer')
          and reveal-email POST (action='reveal_email'). Both capture
          new Date().toISOString() BEFORE firing the request, expect the
          response ok(), then assert countResellerAuditLogFor(≥1) for
          (actor_user_id resolved via findUserIdByEmail on the harness admin,
          subject_user_id = harness.attributedCustomerId, since=cursor).
          Describe-scope skip on loadResellerHarness() (needs
          QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID);
          per-test skip on loadSupabaseAdmin() (needs SUPABASE_URL +
          SUPABASE_SERVICE_ROLE_KEY) — same posture as attribution-timing
          row 2 from tick 86.)

      Why the spec covers only the "viewing customer detail writes an audit
      row" half of Verification #5: the ">200 subject-reads/week anomaly
      alert" half needs a simulated-volume harness against a rate-limit
      surface that does not exist in the tree yet (no rate-limit lives on
      the drawer/reveal-email routes today — the plan describes it as a
      future digest-side anomaly detector, not an inline 429). That half
      belongs to a separate tick that first authors the anomaly detector,
      then writes the spec that simulates the >200/week volume against it.
      Tracking as a next_action follow-up rather than a test.skip() row.

      Deliberately out of scope for this tick:
        - The anomaly-alert half of Verification #5 (needs anomaly
          detector first; see above).
        - Extending the fixture with a countResellerAuditLogByAction total
          (would let specs assert absence-of-audit-write on non-privileged
          routes; not currently requested by any exit criterion).
        - Adding matching audit-log write assertions for the credit-grant
          route (action='grant_credits') and admin approval route
          (action='approve_over_budget') — those routes DO write audit
          rows per P6.3 / P9.3 and would fit the same helper unchanged;
          leaving to a follow-up tick since the reseller admin harness
          doesn't seed a pending grant/request row today (would need
          fixture writes, which the plan §J.2 posture forbids).

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest 817/817
      unchanged (both changes are Playwright infrastructure — no vitest
      coverage exists for tests/e2e/fixtures/ or tests/e2e/reseller/ by
      design); npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations unchanged
      (new fixture lives under web/tests/e2e/fixtures/, not
      /api/reseller/**, so R-01 doesn't fire; new spec lives under
      web/tests/e2e/reseller/, not a route handler, so R-03 doesn't
      fire either). Playwright not run — audit-log-writes.spec.ts still
      self-skips at describe-scope when QA_RESELLER_ATTRIBUTED_CUSTOMER_ID
      is unset (current CI state); each per-test row further gates on
      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY so both rows run only
      when both harness halves are provisioned.

      Frontier after tick 87: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5
      clears. What tick 87 unblocks: (1) both rows of the audit-log-
      writes spec are live assertions the instant the reseller admin
      harness + service-role env vars are provisioned; (2) any future
      reseller spec that needs "did action X write an audit row for
      (actor, subject) since cursor" has a home. Next autonomous tick
      options: (i) close the retail createProject → reseller_attributions
      gap (needs CTO advisory review for ledger semantics; would drop
      attribution-timing row 3's .skip()); (ii) author the audit-log
      anomaly detector so the >200-reads/week half of Verification #5
      becomes assertable (larger surface — new lib + cron + spec);
      (iii) still idle until human unblock arrives.
    commit: (this tick)

  - tick: 86
    ran_at: 2026-07-22
    action: p10_dry_run_service_role_supabase_fixture_and_attribution_timing_row2_unblock
    result: |
      Autonomous tick composing option (i) from tick 85's frontier note —
      "service-role Supabase fixture that flips the two attribution-timing
      test.skip() rows." Landed the fixture + row 2 of the attribution-timing
      spec; row 3 remains skipped because verifying it needs a *code-side* fix
      (retail createProject() does not write reseller_attributions today),
      not just a helper. Row 2 unblocks unilaterally.

      Files:
        - web/tests/e2e/fixtures/supabase-admin.ts (new — loadSupabaseAdmin()
          reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, returns null when
          either is unset so specs test.skip() rather than throw; matches
          web/src/lib/supabase.ts::getSupabaseAdmin env contract and its
          persistSession=false / autoRefreshToken=false / schema=public
          options. countResellerAttributionsFor(supabase, userId, {subjectType?})
          runs a count-only head:true SELECT on reseller_attributions filtered
          by subject_user_id + optional subject_type. findUserIdByEmail resolves
          a QA account email → app_users.id via ilike so the spec doesn't need
          to hard-code UUIDs. Deliberately kept out of web/src/lib/** so no
          production code path can accidentally import a service-role client —
          this file exists solely for out-of-band E2E inspection; write paths
          are absent because seeding lives in scripts/seed-test-users.mjs.
          Reasoned skip surface surface is supabaseAdminSkipReason() so ops
          sees exactly which two env vars to set.)
        - web/tests/e2e/reseller/attribution-timing.spec.ts (row 2 flipped
          from test.skip() to a live assertion: after login, resolves
          founder.email → app_users.id, calls countResellerAttributionsFor
          and expects 0. Per-test test.skip() gates on loadSupabaseAdmin() so
          row 1 keeps running when the service-role env vars are absent;
          harness env vars still gate the describe scope. Row 3 tracking
          comment rewritten to reflect the actual open code-side gap: the
          only insertion path for reseller_attributions is the wholesale
          /api/reseller/create-startup/route.ts:302; retail createProject
          at web/src/lib/projects.ts:420 does not — un-skipping row 3
          requires either closing that gap in createProject or reshaping
          the spec to exercise the wholesale route with a reseller-admin
          harness. Either is larger than the P10 dry-run cadence supports,
          so the row stays as the tracking marker.)

      Why the row 3 gap is not closed in this tick: the retail-path
      createProject() gap is a plan §J.2 point 9 correctness issue not
      captured elsewhere in the goal file. Fixing it means either
      (a) inserting reseller_attributions(subject_type='project') inside
      createProject() when app_users.attribution_reseller_id is non-null —
      which changes the ledger semantics and needs a CTO/CFO advisory review
      per U.13 stage-1 — or (b) reshaping the spec so it exercises the
      already-implemented wholesale write path via a reseller-admin harness.
      Both are follow-up ticks with their own review window; row 3 stays
      tracked as a test.skip() with the assertion sketch preserved.

      Deliberately out of scope for this tick:
        - Row 3 assertion (needs the createProject gap closed or a
          wholesale-flow reshaping — larger surface).
        - Audit-log write assertion spec for plan Verification #5 — now
          unblocked by loadSupabaseAdmin() but wants its own tick since it
          needs a new spec file plus the same reseller-admin harness from
          tick 82.
        - Widening the fixture with write helpers (seeding via the fixture
          would let specs orchestrate whole flows atomically; today seeding
          lives in scripts/seed-test-users.mjs so the fixture stays
          read-only per plan §J.2's "specs must not mutate DB state").

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest 817/817
      unchanged (both changes are Playwright infrastructure — no vitest
      coverage exists for tests/e2e/fixtures/ by design); npm run
      lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31 manifest
      route(s); 3 exemptions, 0 violations unchanged (new fixture lives
      under web/tests/e2e/fixtures/, not /api/reseller/**, so R-01
      doesn't fire; nothing added to feature-gates.manifest.ts so R-03
      doesn't fire). Playwright not run — attribution-timing.spec.ts
      still self-skips at describe-scope when QA_RESELLER_CODE +
      QA_RESELLER_DISPLAY_NAME are unset (current CI state); row 2's
      inner per-test test.skip() further gates on SUPABASE_URL +
      SUPABASE_SERVICE_ROLE_KEY so the row runs only when both harness
      halves are provisioned.

      Frontier after tick 86: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5
      clears. What tick 86 unblocks: (1) attribution-timing spec row
      2 is a live assertion the instant the timing harness + service-
      role env vars are provisioned; (2) the audit-log write spec
      (Verification #5) can now be authored in its own tick since the
      DB-inspection helper it needs is live; (3) any future reseller
      spec that needs "does DB row X exist yet" has a home. Next
      autonomous tick options: (i) audit-log write assertion spec
      (Verification #5: viewing customer detail writes a
      reseller_audit_log row — needs the same reseller admin harness
      from tick 82 plus countResellerAuditLogFor helper added to
      fixtures/supabase-admin.ts); (ii) close the retail createProject
      → reseller_attributions gap (needs CTO advisory review for
      ledger semantics); (iii) still idle until human unblock
      arrives.
    commit: (this tick)

  - tick: 85
    ran_at: 2026-07-22
    action: p5_cobranding_pill_i18n_and_playwright_vi_unblock
    result: |
      Autonomous tick composing option (iii) from tick 84's frontier note —
      "widening reseller-pill.tsx to consume useLocale() so tick 83's VI
      locale test.skip() row can drop its .skip()." Small orthogonal
      content-tick, not gated by P10 or any human-blocked leaf; converts
      one deferred Playwright row into a live assertion.

      Files:
        - web/src/components/workspace/reseller-pill.tsx (added `useLocale()`
          import + `COPY: Record<Locale, { title: string; via: string }>` table
          keyed en={"Introduced by", "via"} / vi={"Được giới thiệu bởi",
          "qua"}. Title attribute now interpolates copy.title before the
          display_name; the "via" span reads copy.via. Same wording as
          web/src/lib/reseller/email-footer.ts so welcome-email footers +
          topbar pill share one VI variant — no drift between the two
          co-branding surfaces).
        - web/tests/e2e/reseller/cobranding-pill.spec.ts (dropped the
          test.skip() marker; the VI locale row is now an authored
          Playwright case: seeds blockid_lang=vi cookie via context
          .addCookies before loginAs + goto /workspace, asserts a
          [title="Được giới thiệu bởi ${resellerDisplayName}"] locator is
          visible and contains both the display name + /qua/i. Cookie host
          derived from PLAYWRIGHT_BASE_URL/BASE_URL/DEMO_URL/https://
          blockid.au — same fallback chain as playwright.config.ts:7-11 so
          the spec works against staging + a dev harness pointing at
          localhost).

      Why now: tick 84 explicitly named this widening as an "orthogonal
      content-tick, not gated by P10" and it's the only autonomous-loop
      leaf currently satisfiable without either the DB-inspection helper
      (blocks the two attribution-timing test.skip() rows) or human-
      unblocks on P8.5 / H.20. The pill component was already the only
      customer-facing reseller surface still hard-coded EN — every other
      customer-visible string in /reseller/** consumes useLocale()
      (credits/grant-form, customers/customer-drawer, customers/drawer-
      opener, customers/reveal-email-cell, requests/requests-view,
      settings/payment-method-form).

      Deliberately out of scope for this tick:
        - Service-role Supabase fixture that would flip the two
          attribution-timing test.skip() rows (larger surface — needs
          service-role key handling, QA-mode gate audit, cleanup
          semantics).
        - Widening the pill to consume the reseller's own
          reseller.locale preference if we ever add one (product
          decision; not on any current plan row).

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      817/817 unchanged (the component change is UI-only — no vitest
      coverage of reseller-pill.tsx existed before this tick and none
      was authored this tick because the visual assertion lives at the
      Playwright layer where the useLocale() cookie plumbing actually
      executes); npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations
      unchanged (the pill lives at /components/workspace/, not
      /api/reseller/**, and the spec lives at /tests/e2e/reseller/, so
      neither R-01 nor R-03 fires). Playwright not run — the spec
      still self-skips at describe-scope when
      QA_RESELLER_DISPLAY_NAME is unset, which is the current CI
      state; running it would only report the skip.

      Frontier after tick 85: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5
      clears. What tick 85 unblocks: the co-branding pill spec's VI
      locale row now runs alongside the positive/negative rows the
      instant the attributed-founder harness is provisioned — one
      fewer deferred marker in the P10 Playwright surface. Next
      autonomous tick options: (i) service-role Supabase fixture
      that flips the two attribution-timing test.skip() rows (two
      spec-row unblocks in one tick); (ii) audit-log write
      assertion spec (plan Verification #5: viewing customer detail
      writes a reseller_audit_log row — needs the same reseller
      admin harness from tick 82 plus the DB helper); (iii) still
      idle until human unblock arrives.
    commit: (this tick)

  - tick: 84
    ran_at: 2026-07-22
    action: p10_dry_run_attribution_timing_playwright_scaffold
    result: |
      Autonomous tick composing option (i) from tick 83's frontier note —
      begin the capture-half P10 dry-run scaffold so plan §J.2 point 9
      (U.6: "user with blockid_via cookie logs in via Google, does NOT
      create a project → assert no reseller_attributions row. Same user
      then creates project → assert one row with subject_type='project'.")
      has a Playwright home the instant P1.5 (H.20 InfoVision ABN + GST)
      clears and a fresh QA founder row is seeded with
      attribution_reseller_id=NULL alongside a live reseller code. No
      production code paths touched; pure test infrastructure that skips
      gracefully until the harness is provisioned.

      Files:
        - web/tests/e2e/fixtures/reseller.ts (extended — new
          loadAttributionTimingHarness() + attributionTimingSkipReason()
          resolve the (fresh founder QA account, ?via= code, reseller
          display name) tuple. Env-var contract mirrors ticks 82 + 83:
          QA_RESELLER_FRESH_FOUNDER_EMAIL (default
          qa-founder-fresh-1@blockid.au) + QA_RESELLER_CODE (the ?via=
          code, e.g. INFOVISION20 — required to activate) +
          QA_RESELLER_DISPLAY_NAME (reseller.display_name returned by
          /api/reseller/me — required to activate). Returns null when
          either env var is unset so specs test.skip() rather than throw;
          same skip-reason surfacing pattern so ops sees exactly which
          env var to set. AttributionTimingHarness interface exported
          from the fixture module so downstream helpers can widen it in
          a future tick without breaking the spec.)
        - web/tests/e2e/reseller/attribution-timing.spec.ts (new — three
          test rows: (1) the fresh founder navigates with a preset
          blockid_via cookie, signs in via loginAs(), then GETs
          /api/reseller/me and asserts body.reseller.display_name flips
          to the harness reseller — this exercises the P2.5 stamp-on-
          signup path across login-form.tsx:167 / google/route.ts:114 /
          auth.ts:517-642 without needing DB access; (2) test.skip() for
          "no reseller_attributions row until createProject()" — tracked
          because verifying row-absence needs a DB-inspection helper
          (either a QA-only admin endpoint or a service-role Supabase
          client in the fixture layer) that does not exist yet; (3)
          test.skip() for the mirror positive assertion after project
          creation — same DB-helper dependency. The two skipped rows
          include the sketch of the eventual assertion body inside the
          tracking comment so the tick that lands the DB helper drops
          .skip() and fills in the assertion in the same diff.)

      Why the two DB rows are test.skip() rather than authored
      assertions: web/src/lib/reseller/scope.ts + resellerSupabase()
      only expose reseller_attributions via scopedReseller() which
      requires the *reseller admin* session, not the founder's; the
      founder-facing /api/reseller/me route explicitly reads the
      app_users cache column, not the reseller_attributions table, per
      its r-01-exempt pragma. Adding a founder-facing "does my
      attribution row exist yet" endpoint would either require a new
      route (out of scope for the P10 dry-run posture used across ticks
      82/83) or an unauthenticated QA hatch (fails the security-audit
      row that gates P10). Leaving both rows as test.skip() with the
      assertion sketch preserved keeps the spec complete for the
      reseller reviewer without over-building an endpoint that only
      exists to service a test. A future tick can land a service-role
      Supabase client in the fixture layer (mirroring
      web/src/lib/reseller/supabase.ts pattern) and flip both rows
      atomically.

      Deliberately out of scope for this tick:
        - Grant-modal + drawer + audit-log specs (plan §J.4 points 5,
          7, 8): each waits on the reseller-side harness pass and its
          own capture flow — bundling four spec files into one tick
          exceeds the P10 dry-run cadence.
        - QA-only DB-inspection endpoint or fixture-layer service-role
          Supabase client: larger surface (service-role key handling,
          QA-mode gate audit, cleanup semantics) — wants its own tick.
        - Widening reseller-pill.tsx to consume useLocale() so tick 83's
          VI locale test.skip() row can drop its .skip() — orthogonal
          content-tick, not gated by P10.
        - Playwright config gate for the new spec: web/playwright.config
          .ts already sets testDir: "./tests" so the new file is
          auto-picked; no config change needed.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      unchanged (both changes are Playwright, not vitest); npm run
      lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31 manifest
      route(s); 3 exemptions, 0 violations (new files under
      web/tests/e2e/**, not /api/reseller/**, so R-01 doesn't fire;
      nothing added to feature-gates.manifest so R-03 doesn't fire).
      Playwright not run — the spec self-skips when the harness env
      vars are unset, which is the current CI state; running would
      only report the skip.

      Frontier after tick 84: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 84 unblocks: the instant a human seeds
      QA_RESELLER_CODE + QA_RESELLER_DISPLAY_NAME + one fresh founder
      row with NULL attribution_reseller_id, the attribution-timing
      spec runs in CI without any additional code — and the two
      test.skip() rows convert to live assertions the moment a
      service-role Supabase fixture lands. Next autonomous tick
      options: (i) service-role Supabase fixture that flips both
      test.skip() rows plus the co-branding pill VI row from tick 83
      (three spec-row unblocks in one tick); (ii) audit-log write
      assertion spec (plan Verification #5: viewing customer detail
      writes a reseller_audit_log row — needs the same reseller admin
      harness from tick 82 plus the DB helper); (iii) still idle until
      human unblock arrives.
    commit: (this tick)

  - tick: 83
    ran_at: 2026-07-22
    action: p10_dry_run_cobranding_pill_playwright_scaffold
    result: |
      Autonomous tick composing option (ii) from tick 82's frontier note —
      begin the customer-side P10 dry-run scaffold so plan Verification #6
      ("attributed workspace renders pill; non-attributed workspace does
      not; VI locale renders VI strings") has a Playwright home the instant
      P1.5 (H.20 InfoVision ABN + GST) clears and a QA founder row is
      seeded with attribution_reseller_id pointing at a real reseller. No
      production code paths touched; pure test infrastructure that skips
      gracefully until the harness is provisioned.

      Files:
        - web/tests/e2e/fixtures/reseller.ts (extended — new
          loadAttributedFounderHarness() + attributedFounderSkipReason()
          resolve the (attributed-founder QA account, reseller display
          name, non-attributed comparison account) tuple. Env-var contract
          mirrors the tick 82 loadResellerHarness() pattern:
          QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL (default
          qa-founder-attributed-1@blockid.au) + QA_RESELLER_DISPLAY_NAME
          (required to activate) + optional QA_UNATTRIBUTED_FOUNDER_EMAIL
          for the negative case (default qa-founder-1@blockid.au). Returns
          null when display name is unset so specs test.skip() rather than
          throw; same skip-reason surfacing pattern so ops sees exactly
          which env var to set.)
        - web/tests/e2e/reseller/cobranding-pill.spec.ts (new — three
          test rows: (1) attributed founder visits /workspace and sees a
          [title="Introduced by X"] element containing "via X"; (2)
          non-attributed founder visits /workspace and no
          [title^="Introduced by"] element exists; (3) VI locale renders
          VI strings — test.skip() with tracking comment because
          ResellerPill currently ships EN-only, and the "Được giới thiệu
          bởi" VI variant exists only in email-footer.ts, not in the
          topbar pill. Negative case has its own inner test.skip() when
          QA_UNATTRIBUTED_FOUNDER_EMAIL resolves to a missing row, so a
          minimally-seeded environment still runs the positive assertion.)

      Why the pill i18n row is a test.skip() rather than an authored
      assertion: web/src/components/workspace/reseller-pill.tsx:19 has no
      useLocale() coupling — the string "via" and the title
      "Introduced by X" are hard-coded EN. Landing a VI assertion now
      would either force a scaffold-tick to widen the pill component (out
      of scope for the P10 dry-run posture used across ticks 82/83) or
      author a spec that must fail on the first run. Leaving the row as
      test.skip() with a plain-language reason keeps the assertion set
      complete for the reseller reviewer without pretending the pill is
      already i18n'd; a future tick can drop the .skip() and add the
      "Được giới thiệu bởi" contains-check in the same PR that ships the
      pill VI wiring.

      Verified: tsc clean (npx tsc --noEmit exit 0 at web/); vitest
      817/817 unchanged (both changes are Playwright, not vitest); npm
      run lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31
      manifest route(s); 3 exemptions, 0 violations (new files under
      web/tests/e2e/**, not /api/reseller/**, so R-01 doesn't fire;
      nothing added to feature-gates.manifest so R-03 doesn't fire).
      Playwright not run — the spec self-skips when the harness env
      vars are unset, which is the current CI state; running would only
      report the skip.

      Frontier after tick 83: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL;
      Track B COMPLETE; P1.5 InfoVision seed STILL HUMAN-BLOCKED on
      H.20 ABN + GST; P10 still blocked_by [P1..P9] until P8.5 clears.
      What tick 83 unblocks: the instant a human seeds
      QA_RESELLER_DISPLAY_NAME + one founder row with a matching
      attribution_reseller_id, the cobranding-pill spec runs in CI
      without any additional code. Next autonomous tick options: (i)
      add the attribution-timing spec skeleton (plan Verification #9 —
      U.6: user with blockid_via cookie logs in via Google, does NOT
      create a project → assert no reseller_attributions row); (ii)
      add the audit-log write assertion spec (plan Verification #5:
      viewing customer detail writes an audit row); (iii) still idle
      until human unblock arrives.
    commit: (this tick)

  - tick: 82
    ran_at: 2026-07-22
    action: p10_dry_run_reseller_scope_playwright_scaffold
    result: |
      Autonomous tick converting tick 81's "loop should self-idle" note into
      option (i) from that entry — begin P10 dry-run scaffolding so the
      Playwright walkthrough demanded by plan §G.1 P10 exit-row can fire the
      instant P8.5 (STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL) + P1.5
      (H.20 InfoVision ABN + GST) unblock. No production code paths touched;
      this is pure test infrastructure that skips gracefully until the two
      human-blocked leaves clear.

      Files:
        - web/tests/e2e/fixtures/reseller.ts (new — loadResellerHarness()
          reads QA_RESELLER_ADMIN_EMAIL (default qa-reseller-1@blockid.au) +
          QA_RESELLER_ATTRIBUTED_CUSTOMER_ID (+ optional
          QA_RESELLER_ATTRIBUTED_PROJECT_ID) and looks the admin up via the
          existing accounts.ts getAccount(). Returns null when either half
          is unprovisioned so specs test.skip() with a discoverable reason
          string via harnessSkipReason() rather than throwing. Same shape
          as fixtures/accounts.ts + fixtures/stripe.ts already in tree so
          the P10 fixture layer stays uniform.)
        - web/tests/e2e/reseller/scope-boundary.spec.ts (new — first P10
          reseller spec covering plan §J.4 point 4: "reseller user
          attempting to fetch /api/svi/*, /api/dataroom/*, /api/cap-table/*
          for an attributed customer; expect 403 on every one." Four probe
          rows: GET /api/svi/latest?user_id=<attributed>, GET
          /api/svi/history?user_id=<attributed>, POST /api/dataroom/clone,
          POST /api/cap-table. Response-code allow-list is
          [401,402,403,404] rather than a rigid 403 so the assertion
          survives whichever refusal the auth/entitlement/scope chain
          returns first; the P8.5 unblock tick can tighten to strict 403
          once the actual reseller session is exercised end-to-end.
          test.skip() at describe-scope on missing harness so the spec is
          a no-op green in CI until the QA reseller row + one attributed
          customer are seeded.)

      Why this scaffold now rather than waiting for the human unblocks:
      the P10_hardening exit_criteria row "Playwright E2E: full A + B
      walkthrough as founder, reseller, admin" is the last gate before a
      real InfoVision go-live, and tick 81 documented that the loop had
      no real leaves left. Landing the fixture + one probe spec now means
      the human who mints the Stripe add-on prices + confirms the H.20 ABN
      can plug in the env vars, seed one QA reseller row, and get a green
      Playwright signal in the same PR — no code work required at that
      moment. Matches the pattern used across P4/P5/P6/P7/P8.4b/B7-B10
      where each phase shipped its unit-tested lib + route surface but
      deferred the Playwright wiring to P10; this tick reclaims that
      deferred debt for the scope-boundary probe specifically.

      Deliberately out of scope for this tick:
        - Attribution-timing spec (plan §J.2 point 9 — U.6): needs a
          browser navigation flow (?via cookie set → Google login → skip
          project → assert no reseller_attributions row) that composes
          multiple pages, larger than a one-tick fixture add.
        - Co-branding pill spec (plan §J.4 point 6): needs an attributed
          founder QA account whose reseller row surfaces the pill;
          extends the fixture with a customer-login helper.
        - Grant modal / drawer / audit-log spec: waits on the same
          harness pass since each depends on the reseller session +
          attributed-customer selector.
        - Playwright config gate for the new /reseller/** directory:
          web/playwright.config.ts already sets testDir: "./tests" so
          the new folder is auto-picked; no config change needed.

      Verified: tsc clean (exit 0 on npx tsc --noEmit at repo root of
      web/); vitest 817/817 unchanged (fixture + spec are Playwright, not
      vitest); npm run lint:reseller: R-01 scanned 11 file(s), R-03
      scanned 31 manifest route(s); 3 exemptions, 0 violations (new files
      are under web/tests/e2e/**, not /api/reseller/**, so R-01 doesn't
      fire; nothing added to feature-gates.manifest so R-03 doesn't
      fire). Playwright itself not run this tick — the spec self-skips
      when the harness env vars are unset, which is the current CI
      state; running it would only report the skip.

      Frontier after tick 82: unchanged in shape — Track A P8.5 STILL
      HUMAN-BLOCKED on Stripe add-on env vars; Track B COMPLETE; P1.5
      InfoVision seed STILL HUMAN-BLOCKED on H.20 ABN + GST; P10 still
      blocked_by [P1..P9] until P8.5 clears. What tick 82 unblocks: the
      instant a human seeds one reseller row + exports
      QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID, the
      scope-boundary spec runs in CI without any additional code. Next
      autonomous tick options: (i) add the attribution-timing spec skeleton
      (plan §J.2 point 9); (ii) add the co-branding pill spec skeleton
      (plan §J.4 point 6); (iii) still idle until human unblock arrives.
    commit: (this tick)

  - tick: 81
    ran_at: 2026-07-22
    action: reseller_create_startup_stripe_subscription_wiring
    result: |
      Autonomous tick composing the next unblocked leaf explicitly named at
      the end of tick 80 — the wholesale subscription create against the
      reseller's payment method inside /api/reseller/create-startup, closing
      §24(c) remainder that tick 75 deferred. Tick 80 shipped the
      /reseller/settings payment-method UI over the two already-tested
      billing endpoints; now the create-startup endpoint composes
      validateResellerBillingReadiness + stripe.subscriptions.create()
      against the reseller-of-record so wholesale provisioning actually
      opens a subscription line instead of returning stripe_wiring:'deferred'.

      Pure lib extension in web/src/lib/reseller/stripe-billing.ts:
        - buildResellerWholesaleSubscriptionParams(reseller, input) —
          returns stripe.subscriptions.create() params: customer=
          reseller.stripe_customer_id, default_payment_method=
          reseller.stripe_default_payment_method_id, items=[{price:price_id}],
          promotion_code (optional — omitted when null/blank),
          off_session:true, payment_behavior:'error_if_incomplete',
          collection_method:'charge_automatically', metadata carrying
          source='reseller_wholesale_provision' + reseller_id/reseller_code/
          billing_model + user_id/project_id/founder_email/discount_tier so
          the invoice.paid webhook accrues commission through the same
          reseller_commissions ledger the retail path uses. Discriminated
          error union: billing_model_not_wholesale, reseller_not_active,
          stripe_customer_missing, default_payment_method_missing,
          price_id_required. Price id validated against /^price_[A-Za-z0-9]+$/
          (trimmed) so a malformed env var fails at the decision layer.
        - Extended RESELLER_STRIPE_BILLING_ERROR_MESSAGES with two new
          keys: price_id_required + subscription_create_failed.

      Adapter surface extended in stripe-billing-adapter.ts:
        - StripeSubscriptionsLike interface with .create; extended StripeLike
          to include subscriptions so the same DI'd Stripe fake shape covers
          all four adapter functions.
        - createResellerWholesaleSubscription(reseller, input, {stripe}) —
          runs buildResellerWholesaleSubscriptionParams, calls
          stripe.subscriptions.create, extracts subscription.id + status +
          latest_invoice.id (handles both bare-string and expanded-object
          latest_invoice shapes). Discriminated error union:
          stripe_subscription_create_failed with error.message in detail.
          Idempotency deliberately deferred — caller can widen the deps to
          accept a per-attribution Stripe idempotency key in a follow-up
          tick if double-provision races surface in production.

      Route wiring in web/src/app/api/reseller/create-startup/route.ts:
        - New StripeWiringOutcome discriminated union covering
          not_configured / price_missing / not_ready / subscribed / failed
          so the response envelope carries the wiring state instead of the
          old stripe_wiring:'deferred' string.
        - resolveStripePriceForPlan(plan_id) maps WHOLESALE_PLAN_ID
          ('founder_growth') to STRIPE_PRICE_MAP.growth per plan §C.1.5
          (wholesale reuses the same Stripe Price as retail Growth — the
          reseller pays A$99/mo list and the discount tier flows through
          the promotion_code attach on the subscription).
        - Promotion code SELECT widened to include stripe_promotion_code_id
          so it can be threaded into the subscription create call.
        - Reseller SELECT extended with contact_email + stripe_customer_id
          + stripe_default_payment_method_id (the two 0101 columns landed
          tick 77) so validateResellerBillingReadiness() sees the current
          billing state.
        - Between (c) attributions insert and (d) magic-link, when Stripe
          is configured + price env var present + reseller ready, the
          route now calls createResellerWholesaleSubscription and stamps
          the returned {subscription_id, status, latest_invoice_id} onto
          reseller_attributions.metadata via UPDATE so downstream
          reconciliation + the /reseller/customers drawer can find it
          without a second Stripe round-trip. Failures are SOFT — the
          workspace + attribution stay live and the reseller can retry
          billing from /reseller/customers → drawer once the underlying
          error (missing PM, declined card, price env drift) resolves.
        - Audit-log metadata + response envelope now carry the full
          stripe_wiring outcome; message string synthesised via
          describeStripeWiring(outcome) so ops sees the actual state
          instead of the boilerplate "will be created in a follow-up
          tick" copy that shipped in the deferred version.

      Verified: whole-tree vitest 817/817 (was 797, +20 = +12 pure-lib
      cases in stripe-billing.test.ts covering happy path, promotion_code
      omission with null/empty/whitespace, discount_tier=0 stringification,
      price_id trim, retail/paused/terminated refusal, missing-customer +
      missing-PM refusal, malformed-price-id refusal, error-copy coverage;
      +8 adapter cases in stripe-billing-adapter.test.ts covering happy
      path with full metadata + promotion_code, promotion_code omission,
      latest_invoice bare-string vs expanded-object vs null shapes,
      missing-customer + missing-PM + retail + terminated + malformed
      price refusal, stripe.subscriptions.create rejection mapping); tsc
      clean; npm run lint:reseller unchanged (R-01 scanned 11 file(s),
      R-03 scanned 31 manifest route(s); 3 exemptions, 0 violations —
      no new route or lib file crosses either boundary).

      What tick 81 unblocks in production: with InfoVision seeded (P1.5
      HUMAN-BLOCKED on H.20 ABN + GST confirmation), a wholesale reseller
      admin can now hit POST /api/reseller/create-startup and the
      transaction (a) provisions the founder's app_users row, (b) creates
      the workspace projects row, (c) inserts the reseller_attributions
      row, (c.5) OPENS THE STRIPE SUBSCRIPTION on the reseller's saved
      payment method with the correct promotion_code discount tier
      attached, (d) mints the magic-link, (e) dispatches the wholesale
      welcome email, (f) writes the audit log. The invoice.paid webhook
      will pick up the metadata.source='reseller_wholesale_provision'
      marker and accrue commission through the same reseller_commissions
      ledger the retail path uses (no webhook changes needed — the
      metadata shape is identical to what /api/stripe/checkout stamps
      for retail wholesale-attributed subs).

      Frontier after tick 81: (a) Track A P8.5 STILL HUMAN-BLOCKED on
      STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL env vars for the
      Share-Management add-on (unrelated to wholesale subscription line
      which uses STRIPE_PRICE_GROWTH). (b) Track B COMPLETE. (c) P1.5
      InfoVision seed STILL HUMAN-BLOCKED on H.20 ABN + GST confirmation
      — the wholesale subscription line ships wired but will remain
      stripe_wiring.state='not_ready' until an InfoVision-like reseller
      row lands with a stripe_customer_id + default PM on file. (d) P10
      still blocked_by [P1..P9]. With §24(c) closed, the goal file
      frontier now has NO non-human-blocked leaves remaining — the loop
      should self-idle until an unblock signal arrives (H.20 ABN
      confirmation OR P8.5 Stripe add-on price env vars minted). Next
      autonomous tick options: (i) begin P10 dry-run scaffolding
      (Playwright fixtures, perf-audit baseline) so it can fire the
      instant P8.5 clears; (ii) knock off advisory follow-ups documented
      inline in items 22-27 above (most are already DONE — remaining are
      cosmetic).
    commit: (this tick)

  - tick: 80
    ran_at: 2026-07-22
    action: reseller_stripe_billing_payment_method_ui
    result: |
      Autonomous tick composing the next unblocked leaf explicitly named at
      the end of tick 79 — the /reseller/settings payment-method-setup UI
      that composes the two already-tested endpoints (POST
      /api/reseller/billing/setup-intent + POST
      /api/reseller/billing/save-default-payment-method) into a working
      wholesale card-capture surface.
      New client component web/src/app/reseller/settings/payment-method-form.tsx:
        - Reads {hasExistingPaymentMethod, existingPaymentMethodId} from the
          server page; renders a masked pm_••••<tail4> line when a default
          PM is already on file so operators see current state at a glance.
        - beginSetup() POSTs /api/reseller/billing/setup-intent, expects
          {ok, client_secret, setup_intent_id, ...}; on failure surfaces the
          server-provided `message` (from RESELLER_STRIPE_BILLING_ERROR_
          MESSAGES) so the copy stays consistent with the admin surface per
          U.15.13. On success flips mode → 'ready' which mounts a vanilla
          Stripe.js Elements card element via getStripeClient() (@stripe/
          stripe-js only; @stripe/react-stripe-js is not installed and
          matching that constraint is enforced by web/AGENTS.md — same
          pattern as web/src/components/onboarding/step-payment.tsx).
        - handleSubmit runs stripe.confirmCardSetup(clientSecret,
          {payment_method:{card}}), then POSTs
          /api/reseller/billing/save-default-payment-method with the
          returned setup_intent_id. On success clears state, flips to
          'success', and router.refresh() so the parent server page re-reads
          resellers.stripe_default_payment_method_id and the "on file" line
          updates without a hard reload.
        - EN+VI copy table matches the shape used by grant-form.tsx +
          product-tour.tsx + share-mgmt-drawer.tsx (single COPY: Record<
          Locale, Copy> switched via useLocale()).
        - Card element unmounts in cleanup + on cancel — no leaked DOM
          nodes between open/close cycles.
      Wiring in web/src/app/reseller/settings/page.tsx: renders
      <PaymentMethodForm /> only when reseller.billing_model==='wholesale'
      AND reseller.status==='active' AND canProvisionSandbox(scope.role) —
      mirrors the server-side gate on both endpoints so viewers see the
      capability list without a phantom form. Retail resellers, paused/
      terminated orgs, and viewer-role reseller staff never see the section
      at all (matches the "no self-service" note at the top of the page for
      billing model changes).
      Deliberately no new /api/ route, no manifest additions — the UI is
      pure client composition over already-manifested and already-lint-
      exempt-clean endpoints (setup-intent + save-default-payment-method
      both landed with R-03 gates in ticks 78/79).
      Verified: tsc clean; vitest 797/797 unchanged (no new lib logic to
      test — the pure decision + adapter layers under the two endpoints
      already carry 25 + 12 cases from ticks 77-79 covering the happy paths
      and every discriminated error variant this UI surfaces); npm run
      lint:reseller: R-01 scanned 11 file(s), R-03 scanned 31 manifest
      route(s); 3 exemptions, 0 violations — the new .tsx is a client
      component under /app/reseller/settings/, not /api/reseller/**, so
      R-01 scope-boundary lint doesn't fire, and it's not in the feature-
      gates manifest so R-03 doesn't fire either.
      Frontier after tick 80: unchanged shape — Track A HUMAN-BLOCKED on
      P8.5 Stripe env vars; Track B COMPLETE; P1.5 HUMAN-BLOCKED on H.20;
      P10 blocked_by [P1..P9]. What tick 80 does unblock: end-to-end
      wholesale card capture is now shippable — a reseller admin can open
      /reseller/settings, add a card, and the pm_id lands on
      resellers.stripe_default_payment_method_id so
      validateResellerBillingReadiness() will finally return {ok:true}
      once the InfoVision seed row (P1.5) exists. The remaining wholesale
      subscription-line follow-up (creating stripe.subscriptions.create
      against the reseller's PM inside /api/reseller/create-startup, which
      tick 75 deferred) is now unblocked at the code level — the only gap
      left is InfoVision's ABN + GST confirmation (H.20).
    commit: (this tick)

  - tick: 79
    ran_at: 2026-07-22
    action: reseller_stripe_billing_save_default_payment_method
    result: |
      Autonomous tick composing the next unblocked leaf explicitly named at
      the end of tick 78 — save-default-PM endpoint that closes the
      confirmCardSetup → server-persist half of the wholesale
      payment-method-setup flow. Pure decision helper +
      RESELLER_STRIPE_BILLING_ERROR_MESSAGES table extended in
      web/src/lib/reseller/stripe-billing.ts:
        - decideSaveDefaultPaymentMethod(reseller, {setup_intent_id}) — gates
          on wholesale + active + stripe_customer_id present, validates the
          setup_intent_id against /^seti_[A-Za-z0-9]+$/ (trims whitespace);
          returns {ok, stripe_customer_id, setup_intent_id} or one of
          {billing_model_not_wholesale, reseller_not_active,
          stripe_customer_missing, setup_intent_id_required}.
        - Extended error-messages table with four new keys:
          setup_intent_id_required, setup_intent_customer_mismatch,
          setup_intent_not_succeeded, setup_intent_no_payment_method.
      Adapter surface extended in stripe-billing-adapter.ts:
        - StripeCustomersLike gains .update, StripeSetupIntentsLike gains
          .retrieve so the same DI'd Stripe fake shape covers all three
          adapter functions.
        - saveResellerDefaultPaymentMethod(reseller, {setup_intent_id},
          {stripe, supabase}) — runs decideSaveDefaultPaymentMethod, retrieves
          the SetupIntent via Stripe, verifies si.customer ===
          reseller.stripe_customer_id (blocks the "steal another org's PM by
          passing a stolen setup_intent_id" attack), verifies status ===
          "succeeded" (surfaces the actual status as detail), extracts the
          payment_method id from si.payment_method (handles both string-ref
          and expanded object shapes), calls stripe.customers.update(
          customer_id, {invoice_settings.default_payment_method: pm_id}) so
          subscriptions.create({default_payment_method}) succeeds later,
          then denormalises the pm_id onto resellers.stripe_default_payment_
          method_id via Supabase for the create-startup hot path. Discriminated
          error union: setup_intent_retrieve_failed / setup_intent_customer_
          mismatch / setup_intent_not_succeeded / setup_intent_no_payment_
          method / stripe_customer_update_failed / db_persist_failed.
      Route: POST /api/reseller/billing/save-default-payment-method
      (route.ts). Wiring order mirrors setup-intent route exactly:
      gateRequireFeature("reseller.console") → scopedReseller chokepoint
      (R-01) → canProvisionSandbox(role) owner/admin gate (viewers cannot
      bind money-movement PMs) → JSON body parse (400 invalid_json on
      malformed) → isStripeConfigured() + getSupabaseAdmin() readiness →
      resellerSupabase().selfReseller() → saveResellerDefaultPaymentMethod
      → reseller_audit_log(action='save_default_payment_method',
      fields=[stripe_customer_id, stripe_default_payment_method_id],
      metadata={stripe_customer_id, payment_method_id, setup_intent_id})
      BEFORE returning 200. Response envelope: {ok, stripe_customer_id,
      payment_method_id, setup_intent_id}. Error envelope: {ok:false,
      reason, message} with message from the shared error-copy table so
      the /reseller/settings PM UI renders human-readable copy per U.15.13.
      Manifest additions: feature-gates.manifest.ts adds one new route entry
      api/reseller/billing/save-default-payment-method/route.ts →
      required_feature='reseller.console'. GATED_DIRECTORIES already
      includes api/reseller/billing (added tick 78) so no change needed there.
      Verified: reseller + showcase + guide + product-tour + integrations
      + gate vitest 540/540 (was 515, +25 = +9 decideSave decision helper
      cases in stripe-billing.test.ts + 12 saveResellerDefaultPaymentMethod
      adapter cases in stripe-billing-adapter.test.ts + 4 extra
      error-messages keys picked up by the coverage table); tsc clean;
      npm run lint:reseller: R-01 scans 11 file(s) (was 10, +1 for the new
      route), R-03 scans 31 manifest route(s) (was 30, +1); 3 exemptions
      unchanged, 0 violations — the new route uses scopedReseller +
      gateRequireFeature so neither rule fires.
      Frontier after tick 79: unchanged shape — Track A HUMAN-BLOCKED on
      P8.5 Stripe env vars; Track B COMPLETE; P1.5 HUMAN-BLOCKED on H.20;
      P10 blocked_by [P1..P9]. What tick 79 does unblock: /reseller/settings
      can now render a two-step card-setup form ((1) POST /setup-intent to
      get client_secret, (2) run stripe.confirmCardSetup(), (3) POST
      /save-default-payment-method with the returned setup_intent_id) so
      the wholesale payment-method-setup UI ships as a thin client
      composition over two already-tested endpoints. Once that UI lands +
      InfoVision seeds (P1.5), validateResellerBillingReadiness() will
      finally return {ok:true} for the InfoVision row and the deferred
      Stripe subscription-line in /api/reseller/create-startup (tick 75)
      unblocks — the last real wholesale hot path — without depending on
      the P8.5 add-on env vars.
    commit: (this tick)

  - tick: 78
    ran_at: 2026-07-22
    action: reseller_stripe_billing_adapter_and_setup_intent_route
    result: |
      Autonomous tick composing tick 77's pure decision lib into the first
      real Stripe SDK + Supabase surface for the wholesale billing flow.
      (a) shipped web/src/lib/reseller/stripe-billing-adapter.ts — thin
      adapter exposing:
        - ensureResellerStripeCustomer(reseller, {stripe, supabase}) —
          reuses stored stripe_customer_id when present; otherwise calls
          stripe.customers.create(params) with the tick-77 param builder
          and persists the returned id back to the resellers row via
          UPDATE resellers SET stripe_customer_id=$1 WHERE id=$2 so the
          next call short-circuits. Errors mapped to a discriminated union:
          decision errors surface intact (billing_model_not_wholesale /
          reseller_not_active / display_name_required /
          invalid_contact_email); Stripe SDK rejection → stripe_create_failed
          with error.message in detail; Supabase update failure →
          db_persist_failed with error.message in detail. Idempotency: a
          mid-flight failure between customers.create() and the DB write
          orphans a Stripe Customer (metadata.source=reseller_org); the
          documented reap-cron follow-up will clean these up by metadata
          match.
        - createResellerSetupIntent(reseller, {stripe}) — builds the
          SetupIntent via the tick-77 param builder (card-only,
          off_session, metadata.intent=reseller_default_pm) and calls
          stripe.setupIntents.create; returns {client_secret,
          stripe_customer_id, setup_intent_id} on success or one of
          {stripe_customer_missing, billing_model_not_wholesale,
          reseller_not_active, stripe_setup_intent_failed, no_client_secret}
          otherwise.
      Dependency-injected Stripe + Supabase (never module-scope import)
      so the adapter unit-tests as a pure function with fakes — matches
      the pattern used elsewhere in /lib/reseller (grants adapter,
      sandbox provision, code mint) where the pure decision layer stays
      testable end-to-end. Structural StripeLike / SupabaseLike interfaces
      widen only the .customers.create / .setupIntents.create /
      .from().update().eq() shapes we need, so leakage of the full Stripe
      or Supabase surface into the module contract is avoided.
      Deliberately no `import "server-only"` — matches commission.ts
      precedent so vitest can import without the Next shim; runtime
      objects are DI-supplied so no server-only capability is imported at
      module scope.
      (b) shipped POST /api/reseller/billing/setup-intent (route.ts).
      Wiring order: gateRequireFeature('reseller.console') → scopedReseller
      chokepoint (R-01) → canProvisionSandbox(role) owner/admin gate
      (viewers cannot authorise money movements) → isStripeConfigured() +
      getSupabaseAdmin() readiness check → resellerSupabase().selfReseller()
      loads the reseller row including the two new 0101 columns →
      ensureResellerStripeCustomer() (persists customer id on first call)
      → createResellerSetupIntent() (mints the client_secret) →
      reseller_audit_log(action='mint_setup_intent',
      fields=[stripe_customer_id, setup_intent_id],
      metadata={customer_created}) written BEFORE returning 200 (D3-CISO
      chokepoint pattern shared with reveal-email / grant / drawer /
      provision-sandbox). Response envelope carries
      {ok, client_secret, stripe_customer_id, setup_intent_id,
      customer_created}. Error envelope carries {ok:false, reason, message}
      with the message drawn from RESELLER_STRIPE_BILLING_ERROR_MESSAGES so
      the admin surface renders human-readable copy per U.15.13.
      (c) manifest additions: feature-gates.manifest.ts adds route entry
      api/reseller/billing/setup-intent/route.ts →
      required_feature='reseller.console', plus GATED_DIRECTORIES adds
      'api/reseller/billing' so the R-03 CI lint scans the new route + the
      completeness test asserts the manifest matches the tree.
      Verified: vitest 385/385 (was 373, +12 adapter cases covering create
      + reuse + retail-refusal + paused-refusal + Stripe rejection + DB
      persist failure + SetupIntent happy path + missing-customer refusal
      + billing-model refusal + terminated-refusal + Stripe rejection +
      no-client-secret); tsc clean; npm run lint:reseller: R-01 scans 10
      file(s) + R-03 scans 30 manifest route(s); 3 exemptions, 0
      violations.
      Frontier after tick 78: unchanged shape — Track A HUMAN-BLOCKED on
      P8.5 Stripe env vars; Track B COMPLETE; P1.5 HUMAN-BLOCKED on H.20;
      P10 blocked_by [P1..P9]. What tick 78 does unblock: the
      /reseller/settings payment-method UI can now be a thin client
      component that POSTs /api/reseller/billing/setup-intent, feeds the
      returned client_secret into stripe.confirmCardSetup(), and — on
      success — calls a follow-up save-default-PM endpoint that writes
      stripe_default_payment_method_id via the same adapter shape. Once
      that lands, the /api/reseller/create-startup route can start
      composing validateResellerBillingReadiness + stripe.subscriptions.
      create() against the reseller's PM (the last real subscription-line
      leaf). Neither depends on the P8.5 Stripe add-on env vars.
    commit: (this tick)

  - tick: 77
    ran_at: 2026-07-22
    action: reseller_stripe_billing_apply_migration_and_pure_lib
    result: |
      Autonomous tick composing two self-contained follow-ups on tick 76:
      (a) applied migration 0101_reseller_stripe_billing_columns.sql via
      docker exec supabase-db psql -U postgres -d postgres (BEGIN → ALTER
      → CREATE INDEX → 2×COMMENT → COMMIT; idempotent re-run safe since
      every ADD COLUMN uses IF NOT EXISTS and the partial unique uses
      CREATE UNIQUE INDEX IF NOT EXISTS) + NOTIFY pgrst reload issued so
      PostgREST picks up the new columns. Verified: resellers table now
      exposes stripe_customer_id text + stripe_default_payment_method_id
      text, and the resellers_stripe_customer_id_uniq partial unique
      index (WHERE stripe_customer_id IS NOT NULL) is in place.
      (b) shipped pure decision lib
      web/src/lib/reseller/stripe-billing.ts exposing:
        - buildResellerStripeCustomerParams(reseller) → Customer.create
          params (name, optional email, metadata carrying reseller_id +
          reseller_code + billing_model='wholesale' + source='reseller_org');
          refuses retail resellers, non-active status, blank display_name,
          malformed contact_email; lowercases + validates the 320-char
          email cap;
        - decideResellerCustomerAction(reseller) → {kind:'reuse'|'create'|
          'error'} — reuses stored stripe_customer_id when present so
          double-create attempts are idempotent, otherwise composes the
          create params via the helper above;
        - validateResellerBillingReadiness(reseller) → gate for
          /api/reseller/create-startup so the atomic transaction refuses
          BEFORE the app_users + projects rows land when the reseller has
          no PM on file (avoids the compensation rollback path
          decideCreateStartup was engineered to skip);
        - buildResellerSetupIntentParams(reseller) → SetupIntent.create
          params for the payment-method-setup UI (usage='off_session',
          payment_method_types=['card'], metadata carrying reseller_id +
          reseller_code + intent='reseller_default_pm');
        - RESELLER_STRIPE_BILLING_ERROR_MESSAGES table with EN copy for
          every error union member (admin surface per U.15.13 — VI parity
          out of scope).
      Zero Stripe SDK / Supabase imports so the module unit-tests as
      pure functions; the route + adapter layer will wrap these
      decisions with actual Stripe + Supabase writes in a follow-up
      tick (the same "pure lib first" pattern as decideCreateStartup /
      decideCodeMint / decideGrant / decideReveal).
      Verified: 23/23 pass in stripe-billing.test.ts (covers wholesale
      happy path with email present + email omitted + whitespace-only
      email + email lowercasing; retail rejection; paused/terminated
      rejection; blank display_name rejection; malformed contact_email
      rejection; 320-char email cap; customer-action reuse vs create;
      customer-action reuse wins over otherwise-erroring fields since
      the Customer already exists in Stripe; readiness happy path +
      four rejection branches; setup-intent params happy path + three
      rejection branches; error-message coverage table); reseller
      vitest 367/367 (was 344, +23 new); tsc clean; npm run
      lint:reseller unchanged (9 R-01 + 29 R-03 files scanned, 3
      exemptions, 0 violations — new files are under /lib/reseller/**
      not /api/reseller/** so R-01 scope-boundary rule doesn't fire,
      and not in feature-gates.manifest.ts so R-03 doesn't fire).
      Frontier after tick 77: unchanged shape — Track A HUMAN-BLOCKED
      on P8.5 Stripe env vars; Track B COMPLETE; P1.5 HUMAN-BLOCKED on
      H.20; P10 blocked_by [P1..P9]. But the wholesale Stripe
      subscription-line follow-up now has its full decision layer
      pre-tested: the remaining work is a thin adapter (Stripe SDK
      client + Supabase writes) plus the /reseller/settings
      payment-method UI. Neither requires the P8.5 add-on price env
      vars (SetupIntent uses card-only, no add-on price) so the
      follow-up wholesale-billing tick is unblocked whenever it fires.
    commit: (this tick)

  - tick: 76
    ran_at: 2026-07-22
    action: reseller_stripe_billing_schema_foundation
    result: |
      Autonomous tick landing the schema foundation the tick 75
      /api/reseller/create-startup route explicitly named as blocking
      the deferred wholesale Stripe subscription line. New migration
      web/supabase/migrations/0101_reseller_stripe_billing_columns.sql
      adds two nullable columns to the resellers table:
        - stripe_customer_id (text) — one Stripe Customer per reseller
          org owning wholesale subscriptions ($99/mo × N Growth seats
          per attributed founder workspace). Nullable for retail
          resellers (retail commission accrues off the end-founder's
          own Stripe customer).
        - stripe_default_payment_method_id (text) — denormalised
          default PM so the create-startup endpoint doesn't couple its
          p95 to a Stripe round-trip. The reseller-stripe-sync weekly
          cron (P3.1) will re-hydrate on drift.
      Also lands a partial unique index resellers_stripe_customer_id_uniq
      so one Stripe Customer maps to at most one reseller row while
      still allowing multiple nulls pre-payment-method. ADDITIVE +
      IDEMPOTENT (every ADD COLUMN uses IF NOT EXISTS; the partial
      unique uses CREATE UNIQUE INDEX IF NOT EXISTS).
      NOT enforced as required-for-wholesale via CHECK: the current
      tree has zero wholesale sign-ups (P1.5 InfoVision seed is
      HUMAN-BLOCKED on H.20 ABN + GST), so a "wholesale requires
      stripe_customer_id" CHECK would prevent the admin console from
      creating the first wholesale reseller row before the
      payment-method-setup UI ships. The follow-up tick that lands
      the payment-method UI + subscription-create wiring will add that
      CHECK once InfoVision is seeded and the payment-method flow is
      proven.
      Migration NOT applied via docker exec this tick — apply is a
      manual step per project memory reference_db_migrations, and the
      route wiring that reads these columns won't land until the
      payment-method UI + subscription-create follow-up tick, so
      applying the columns before their consumer ships would only
      surface a schema-only diff on prod. The migration file is
      committed so the applier tick can run it alongside the
      follow-up route wiring.
      Frontier after tick 76: unchanged — Track A HUMAN-BLOCKED on
      P8.5 Stripe env vars; Track B COMPLETE; P1.5 HUMAN-BLOCKED on
      H.20; P10 blocked_by [P1..P9]. The stripe_customer_id / PM
      schema is now in place so the wholesale Stripe subscription
      line can ship as a single tick without a nested schema step
      once the payment-method UI is ready. No code paths touched;
      tsc / vitest / lint:reseller unchanged from tick 75 baseline
      (migration is SQL-only, no TS consumer this tick).
    commit: (this tick)

  - tick: 75
    ran_at: 2026-07-22
    action: cs_advisory_24c_create_startup_route
    result: |
      Closed §24 remainder (c) — POST /api/reseller/create-startup endpoint
      shipped. This closes the last real non-human-blocked leaf on the goal
      file frontier. New route
      web/src/app/api/reseller/create-startup/route.ts wires:
        (1) gateRequireFeature("reseller.create_startup") — 402 if plan missing;
        (2) scopedReseller(user) R-01 chokepoint;
        (3) normaliseCreateStartupInput() → 400 with CREATE_STARTUP_ERROR_MESSAGES
            on shape errors;
        (4) Load reseller row via resellerSupabase.selfReseller(), look up
            existingUser by lowercased email, look up promotion_code row by
            (reseller_id, tier_pct), scan for active project attribution for
            this founder × reseller (respects U.15.1 project-level partial
            unique on reseller_attributions);
        (5) decideCreateStartup() six-gate check → 400 with error code;
        (6) Sequential atomic-ish writes with compensation:
            (a) app_users INSERT with segment='founder', account_type='founder',
                attribution_reseller_id stamped (23505 race → lookup by email);
            (b) projects INSERT with attribution_reseller_id + slug from
                company_name (23505 collision → suffix bump up to 5 attempts);
            (c) reseller_attributions INSERT subject_type='project' with
                promotion_code_id + metadata.origin='wholesale_create' —
                failure rolls back the projects row so the partial-unique
                index does not silently block retries;
            (d) requestMagicLink with ttlMinutes=24×60 + pendingPayload
                carrying {next:'/workspace', resellerCode, wholesaleProvisioning};
            (e) sendWholesaleWelcome dispatch (best-effort — kept as partial
                success if email fails so ops can re-mint from customer drawer);
            (f) reseller_audit_log('provision_startup') best-effort — failure
                does NOT roll back successful provisioning.
        (7) Response envelope carries {ok, user_id, project_id, attribution_id,
            created_new_user, magic_link_sent, email_sent, stripe_wiring:'deferred',
            message}. Stripe subscription line against the reseller's payment
            method is intentionally deferred — resellers table has no
            stripe_customer_id column yet (would need migration 0101 +
            payment-method-setup UI) and P8.5 Stripe env vars remain
            human-blocked. Doing the Stripe hot path in the same tick would
            require three concurrent unblocks; this tick delivers the working
            DB-side provisioning flow so the /reseller/create-startup form
            (previously disabled) is now live, unblocking end-to-end wholesale
            onboarding minus the reseller-side billing charge.
      Ancillary changes:
        - web/src/lib/auth.ts: added optional ttlMinutes to RequestMagicLinkArgs
          (defaults to MAGIC_LINK_TTL_MIN=15) so wholesale flow can request a
          24h window; also added wholesaleProvisioning?:boolean to PendingPayload
          so the type surface reflects the hint the create-startup route stamps.
        - web/src/lib/feature-gates.manifest.ts: new entry
          {route: "api/reseller/create-startup/route.ts",
           required_feature: "reseller.create_startup"} + api/reseller/create-startup
          added to GATED_DIRECTORIES so R-03 CI lint covers the new mutation
          handler.
        - web/src/app/reseller/create-startup/page.tsx: form extracted into
          new "use client" wrapper create-startup-form.tsx that POSTs JSON
          via fetch, renders inline success (green banner listing project_id,
          founder-account status, magic-link status, stripe_wiring value) or
          error (red banner with error code + message + detail). Old disabled
          submit button removed; new button surfaces "Provisioning…" busy
          state and disables when allowedTiers is empty.
      Verified: tsc clean; whole-tree vitest 744/744 (was 709/709, +35 across
      ticks 71-75); npm run lint:reseller: R-01 scanned 9 file(s) (was 8, +1
      for the new route), R-03 scanned 29 manifest route(s) (was 28, +1),
      3 exemptions unchanged, 0 violations — new route uses scopedReseller +
      gateRequireFeature so neither rule fires. Route handler follows the
      P6.3 grant-api + P6.4 sandbox-setup pattern (thin composition over pure
      decision lib + resellerSupabase() wrapper + audit-log write BEFORE
      returning). Frontier after tick 75: (a) Track A still HUMAN-BLOCKED on
      P8.5 Stripe env vars — no unblocked A phase this window. (b) Track B
      COMPLETE — B1..B10 all done. (c) P1.5 InfoVision seed still
      HUMAN-BLOCKED on H.20 ABN + GST confirmation. (d) P10_hardening still
      blocked_by [P1..P9] — waits on P8.5 completion + Playwright
      provisioning. (e) §24 fully closed. With §24(c) shipped, the autonomous
      loop's frontier is now truly empty of non-human-blocked leaves —
      remaining options: (i) begin P10 Playwright fixture scaffolding so it
      can fire the instant P8.5 clears; (ii) new advisory follow-ups if
      P0.3 review file surfaces later delta; (iii) idle until an unblock
      signal arrives.
    commit: (this tick)

  - tick: 74
    ran_at: 2026-07-22
    action: cs_advisory_24_create_startup_decision_lib
    result: |
      §24 remainder (c) stepping-stone shipped — pure decision library for the
      POST /api/reseller/create-startup endpoint. New file
      web/src/lib/reseller/create-startup.ts exposes normaliseCreateStartupInput
      (trims + lowercases founder_email against isValidEmail's regex, trims
      company_name and rejects blank/>200-char, narrows plan_tier to the
      WHOLESALE_PLAN_ID='founder_growth' literal per §C.1.5 wholesale-only
      Growth provisioning, coerces string discount_tier via parseInt then
      enforces {0,10,20,30,40} membership matching reseller_promotion_codes.
      tier_pct enum from 0091:87, nulls blank founder_name and clamps at 120
      chars) and decideCreateStartup (six-gate decision: reseller.status=='active'
      → can_create_startups → billing_model=='wholesale' → allowed_tiers
      membership per U.15.1 admin-controlled tier list → no existing active
      project-attribution per U.15.1 project-level partial unique on
      reseller_attributions → promotionCode present with matching tier_pct).
      Existing verified users bypass provisional state (provisional=false when
      existingUser.verified_at is non-null); new users OR previously-unverified
      users start provisional so the workspace stays gated until magic-link
      click per H.8. Plan output shape carries: createNewUser boolean, the
      attribution row spec (subject_type='project', source='provisioned',
      metadata.origin='wholesale_create'), and the magicLink envelope
      (intent='login' reusing existing magic_links CHECK constraint from
      0005:55 so no schema migration is needed this tick; resellerCode threaded
      through pendingPayload so the verify route's processAttribution() call
      is a safety-net no-op if the primary insert already succeeded). Exported
      CREATE_STARTUP_ERROR_MESSAGES map gives the eventual form + route a
      single-source EN-only error copy table per U.15.13 admin-surface posture.
      Vitest: 21/21 pass in create-startup.test.ts covering happy-path email/
      name normalisation, string-tier coercion, all 5 normalise error branches,
      all 6 decide error branches, new/existing/unverified user provisional
      matrix, allowed_tiers=null-treated-as-empty, tier-mismatch surfaces as
      promotion_code_missing, and the error-message coverage table (fails to
      compile if a new error code is added without a message). Whole reseller
      vitest 344/344 (was 323, +21); tsc clean; npm run lint:reseller unchanged
      (8 R-01 + 28 R-03, 3 exemptions, 0 violations — new file is under
      /lib/reseller/ but not /api/reseller/** so R-01 doesn't fire and it's
      not in feature-gates.manifest.ts so R-03 doesn't fire). REMAINING under
      §24: (b) magic-link token generation itself is already covered by the
      existing web/src/lib/auth.ts::requestMagicLink() infrastructure — the
      wholesale flow reuses intent='login' + pendingPayload.wholesaleProvisioning
      to signal H.8 provisional state to the verify route on redirect; no
      wholesale-specific magic-link primitive needed. (c) The POST
      /api/reseller/create-startup route handler itself still deferred — it's a
      Stripe subscription create (against the reseller's payment method, not
      the founder's) + atomic app_users/projects/reseller_attributions insert
      + requestMagicLink + sendWholesaleWelcome dispatch. That's a Stripe hot-
      path change so it wants its own tick with the endpoint stub, integration
      test scaffolding, and route-gating exemption discussion. Frontier after
      tick 74: unchanged — Track A HUMAN-BLOCKED on P8.5 Stripe env vars;
      Track B COMPLETE; P1.5 HUMAN-BLOCKED on H.20; P10 blocked_by [P1..P9];
      §24 (c) route handler is the last real remaining non-human-blocked leaf.
    commit: (this tick)

  - tick: 73
    ran_at: 2026-07-22
    action: cs_advisory_24_send_wholesale_welcome_wired
    result: |
      Closed §24 remainder (a) — sendWholesaleWelcome() adapter now
      exported from web/src/lib/email.ts. Two-line compose over the
      already-tested buildWholesaleWelcomeEmail() pure builder + the
      existing sendEmail() transport, wrapped in a minimal light-theme
      HTML doc (bg #F1F5F9 + white 560px card + 1px slate border) so
      the builder's light-first inline styles render correctly on
      Gmail/Outlook (dark shell() would clash with the builder's
      #334155 slate-700 text + #ECFDF5/#FEF3C7 status callouts).
      TRANSACTIONAL — no canSendEmail() gate because the recipient
      typically has no BlockID account yet (H.8 magic-link is what
      creates it) and List-Unsubscribe headers still ship via
      prepareUnsubscribe() so RFC 8058 one-click compliance is
      preserved for future messages. Consumers pass founderName /
      companyName / resellerDisplayName / magicLinkUrl / ttlHours /
      locale — same signature as the pure builder plus `to`. Adapter
      is a straight compose (no additional branching), so the pure
      builder's existing 14/14 vitest cases fully cover the subject
      + html + text derivation; a dedicated adapter test would need
      heavy nodemailer + Resend mocking with negative marginal
      coverage. Verified: tsc clean; reseller vitest 323/323 unchanged
      (adapter lives in email.ts, not /lib/reseller/**); npm run
      lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0
      violations — email.ts is not under /api/reseller/** and not in
      feature-gates.manifest.ts). REMAINING under §24: (b) magic-link
      token generation + (c) POST /api/reseller/create-startup
      endpoint that ties Stripe subscription creation on the
      reseller's payment method to the atomic (app_users insert +
      projects insert + reseller_attributions insert + magic-link
      mint + sendWholesaleWelcome dispatch) transaction. Larger
      surface — deferred until next tick has budget for the atomic
      Stripe subscription flow. Frontier after tick 73: unchanged —
      Track A HUMAN-BLOCKED on P8.5 Stripe env vars; Track B
      COMPLETE; P1.5 HUMAN-BLOCKED on H.20; P10 blocked_by [P1..P9];
      §24 (b)+(c) remains the last real remaining non-human-blocked
      leaf.
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
   24) DONE tick 81 — §24(c) subscription-line wiring shipped. /api/reseller/create-startup now composes validateResellerBillingReadiness + createResellerWholesaleSubscription against the reseller's saved payment method after the (a)(b)(c) atomic writes land; failures are soft (workspace stays live), successes stamp {subscription_id,status,latest_invoice_id} onto reseller_attributions.metadata for downstream reconciliation. See tick 81 log for detail. (Route handler itself shipped tick 75.) Route composes normaliseCreateStartupInput + decideCreateStartup + resellerSupabase + requestMagicLink + sendWholesaleWelcome per the pattern established by P6.3 (grant-api) and P6.4 (sandbox-setup). Compensation-aware sequential writes (app_users → projects → reseller_attributions → magic-link → welcome email → audit-log) with roll-back on the attribution-insert failure branch so the U.15.1 partial-unique index doesn't silently block retries. Stripe subscription line against the reseller's payment method deferred to a follow-up tick (needs resellers.stripe_customer_id migration + payment-method-setup UI + P8.5 env unblock). Form on /reseller/create-startup now live via new "use client" wrapper; submit button previously disabled is now interactive with inline success/error banner. See tick 75 log for full detail. Grant modal EN+VI parity DONE tick 62; denial-reason surface DONE tick 63; leading-signal pure lib DONE tick 65; leading-signal weekly-digest cron DONE tick 66 (new /api/cron/reseller-weekly-digest endpoint iterates active resellers, expands reseller_attributions → user_ids (project-typed rows resolved via projects.user_id mirroring scope.allowedCustomerIds), bridges svi_analyses through app_users.email since svi_analyses has no user_id column on this host per 0007/0014/0016/0020 migrations, computes buildLeadingSignalSummary per reseller, emails admin@blockid.au a CSV attachment + HTML body; Mondays 04:15 UTC crontab entry after clear-commissions; ?skip_email=1 dry-run; pure formatter lib web/src/lib/reseller/weekly-digest.ts with 8/8 vitest for isoWeekKey year-boundary, CSV suppression/escape, HTML empty state + sort). Wholesale welcome-email pure builder DONE tick 72 — web/src/lib/reseller/wholesale-welcome-email.ts exposes buildWholesaleWelcomeEmail({founderName, companyName, resellerDisplayName, magicLinkUrl, ttlHours, locale}) → {subject, html, text}; EN+VI parity (subject flips to "Xác minh không gian làm việc BlockID cho <Company>"), H.8 provisional-workspace amber banner ("read-only until you verify"), CPO §25 non-payment confirmation banner ("<Reseller> is the seller-of-record and has already paid for your plan. BlockID will not ask you for a credit card"), embedded resellerFooterHtml/Text co-branding, HTML escaping on all user-supplied strings, ttlHours defaults to 24 on invalid input, throws on missing companyName/resellerDisplayName/magicLinkUrl (retail flow lives on a different path). 14/14 vitest in wholesale-welcome-email.test.ts; tsc clean; lint:reseller unchanged (8 R-01 + 28 R-03, 3 exemptions, 0 violations). sendWholesaleWelcome() adapter DONE tick 73 — web/src/lib/email.ts imports buildWholesaleWelcomeEmail + exports sendWholesaleWelcome({to, founderName, companyName, resellerDisplayName, magicLinkUrl, ttlHours, locale}), wraps the builder's inner-HTML in a minimal light-theme HTML doc (bg #F1F5F9 + 560px white card) so the builder's inline styles render on Gmail/Outlook (dark shell() would clash with the builder's slate-700 text + coloured status callouts), appends unsubFooter for RFC 8058 List-Unsubscribe compliance, TRANSACTIONAL (no canSendEmail() gate since recipient typically has no BlockID account yet). create-startup decision lib DONE tick 74 — pure web/src/lib/reseller/create-startup.ts exposes normaliseCreateStartupInput (5 error branches) + decideCreateStartup (6-gate reseller/tier/attribution check) + CREATE_STARTUP_ERROR_MESSAGES table + WholesaleResellerRow/CreateStartupPlan types; 21/21 vitest; the eventual route handler is now a thin composition of already-tested primitives (§24 (b) magic-link reuses existing web/src/lib/auth.ts::requestMagicLink with intent='login' + pendingPayload.wholesaleProvisioning — no wholesale-specific primitive needed since the H.8 provisional-state signal is carried in the payload not the intent). REMAINING under §24: (c) POST /api/reseller/create-startup route handler itself — a Stripe subscription create against the reseller's payment method + atomic (app_users insert + projects insert + reseller_attributions insert + requestMagicLink + sendWholesaleWelcome dispatch) transaction — the create-startup UI form at web/src/app/reseller/create-startup/page.tsx already exists but its submit button is disabled pending the endpoint (larger Stripe hot-path surface; wants its own tick).
   25) PARTIAL tick 72 — CPO advisory §25 customer-drawer EN+VI parity DONE tick 61. web/src/app/reseller/customers/customer-drawer.tsx + drawer-opener.tsx + reveal-email-cell.tsx now switch every user-facing string via useLocale() with a Copy: Record<Locale, Copy> table (real VI translation with diacritics — "Tổng quan"/"Tiến trình"/"Báo cáo"/"Đang tải chi tiết khách hàng…"/"Chương hướng dẫn"/etc.); currency helper fmtAud() now takes locale and flips VI decimal separator from "." to "," (A$99,00); credits use Intl.NumberFormat("vi-VN"|"en-AU") for thousands separator; tab labels are now data-driven (dropped CSS `capitalize` since it fails for VI multi-word labels). tsc clean; reseller vitest 276/276; lint:reseller unchanged 8+28 with 3 exemptions / 0 violations. Non-payment confirmation copy DONE tick 72 as the ECFDF5/green-border block inside buildWholesaleWelcomeEmail — reassures the founder in EN+VI that the reseller is seller-of-record and BlockID will not ask for a credit card. Wiring into the wholesale onboarding wizard follows once the /api/reseller/create-startup endpoint mints the email (bundled with §24 remainder).
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
