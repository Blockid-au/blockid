# Reseller Module — Plan Delta 2026-07-23 (P0 pre-flight aggregation)

> **Status: P1 BLOCKED** — 4 C-Level blocking reviewers (CTO, CFO, CISO, CLO) returned `verdict: revise`. This delta consolidates their findings into concrete plan-file amendments that must be merged before P1.1 (migrations 0091+) is authorised to fire.

**Reviewers.** Ran 2026-07-23 (autonomous P0 tick 1):

| Role | Verdict | Blockers | Advisory |
|---|---|---:|---:|
| CTO | revise | 5 | 5 |
| CFO | revise | 5 | 5 |
| CISO | revise | 5 | 5 |
| CLO | revise | 5 | 5 |

Blocking count: **20**. Advisory: **20**. Not yet run (advisory + non-blocking): CMO, COO, CPO, CDO, CHRO, CRO, CS, IR — deferred to next tick since blockers dominate.

---

## D. Delta — plan-file amendments to apply

### D.1 CTO fixes (structural)

- **D1-CTO-01 — Denormalise `billing_model` onto `reseller_commissions`.** Postgres CHECK cannot reference another table. Add `billing_model text not null` to `reseller_commissions`; stamp at insert from the parent `resellers` row. Rewrite the single CHECK as:
    ```sql
    CHECK (
      (billing_model = 'retail'
         AND ABS(list_price_aud_cents - discount_aud_cents - commission_aud_cents
                 - round(0.60 * list_price_aud_cents)::int) <= 1)
      OR
      (billing_model = 'wholesale'
         AND commission_aud_cents = 0
         AND amount_paid_aud_cents = list_price_aud_cents - discount_aud_cents)
    )
    ```
  This resolves the wholesale-with-promo contradiction in U.3 by making `amount_paid = list − discount` cover both wholesale/no-promo and wholesale/promo cases.
- **D1-CTO-02 — Drop the user-level partial unique on `reseller_attributions`.** Current spec `unique(subject_user_id) where subject_type='user' and status='active' and opted_out=false` forbids U.6's legal case (same founder, two ideas, two resellers). Keep only the project-level partial unique. Remove `app_users.attribution_reseller_id` uniqueness; treat as cache field.
- **D1-CTO-03 — CHECK tolerance ±1c already applied in D1-CTO-01.** The rounding note in G.2 is now consistent with the DB constraint.
- **D1-CTO-04 — Ledger append-only.** Replace status-mutation flow in D.4 (`charge.dispute.created` mutating `status` back to `pending_clearance`) with an append-only event table:
    ```sql
    CREATE TABLE reseller_commission_events (
      id uuid pk,
      commission_id uuid references reseller_commissions(id),
      event_type text check (event_type in (
        'accrued','cleared','refund_full','refund_partial',
        'dispute_opened','dispute_lost','dispute_won','void'
      )),
      delta_aud_cents int not null,
      stripe_event_id text unique,
      metadata jsonb,
      created_at timestamptz default now()
    );
    ```
  Current status derives from a view: `reseller_commissions_current(commission_id, status, net_cents)` folds events in order. This preserves CFO reconciliation and audit trail.
- **D1-CTO-05 — Seed InfoVision at P1 exit, not P0.** Remove the "post-P1 or stub" wording from U.5. Goal file's `resellers_seeded` block is intent-only until P1's exit criterion "INSERT INTO resellers passes" fires. Cron won't crash on cold-start because P0 doesn't touch DB.

### D.2 CFO fixes (economics + math)

- **D2-CFO-01 — Add `reseller.gst_registered bool default true` + `reseller.abn text`.** Wholesale bill-back invariant "Auschain nets 60% of list" only holds when the reseller is GST-registered AND issues a compliant tax invoice for the commission. Reject reseller creation without both fields populated; document the ATO chain in the reseller agreement (CLO clause 5).
- **D2-CFO-02 — CHECK tolerance ±1c.** Already applied in D1-CTO-01. Pin rounding mode in the pure function `web/src/lib/reseller/commission.ts` to half-to-even matching Postgres `round()`.
- **D2-CFO-03 — Three-part GST split on refunds.** `refund_full` and `refund_partial` event rows must write three-part `revenue_events` reversal: `gross_aud_cents`, `gst_aud_cents`, `net_aud_cents` all as negatives, proportionally. Update G.3 refund table.
- **D2-CFO-04 — Add `COGS_PER_CREDIT_AUD` constant.** New file `web/src/lib/reseller/cogs.ts` (or environment variable) with the per-credit COGS. Starting value **A$0.05** (memory `[[reference_ai_model_autorefresh]]` — free-model rotation drives this down). Add `credit_budget_cost_aud = monthly_credit_budget × COGS_PER_CREDIT_AUD` derived column on `resellers` for immediate visibility.
- **D2-CFO-05 — Explicit 3-state wholesale CHECK.** Resolved in D1-CTO-01 (retail / wholesale-no-promo / wholesale-promo).
- **D2-CFO-06 (new open decision H.17)** — GST invariant reading. The plan's "BlockID gross retained = $59.40 constant" refers to *retained portion*, not *taxable supply*. Auschain's ATO liability = `amount_paid / 11` per tier, i.e. **$9.00 / $8.10 / $7.20 / $6.30 / $5.40**, NOT $5.40 flat. Update G.2 table caption + G.2 math prose accordingly.
- **D2-CFO-07 — Monthly KPI expanded set** (implements CFO §5). Update C.6 CSV schema and P7 exit criteria to include: attributed_net_contribution, contribution_margin_pct, ledger_drift_events, gst_reconciliation_delta, sandbox_share_of_budget, tier_mix_distribution, cohort_velocity_median_days, ltv_cac_per_reseller.
- **D2-CFO-08 — Sandbox hard-cap 10% of budget** (echoes CISO D3-CISO-05). Enforced at grant/spend time, alarm at 8%.

### D.3 CISO fixes (enforcement primitives)

- **D3-CISO-01 — Typed `resellerSupabase(user)` wrapper** replaces `scopedReseller` grep-CI. Return a client where every `.from()` call auto-injects `.eq('reseller_id', user.reseller_id)` or the parent join. Grep-CI stays as belt-and-braces. Add RLS policies specifically for reseller-role JWTs so a route bypass still hits RLS. Blocks P4.
- **D3-CISO-02 — Feature-gate manifest** at `web/src/lib/feature-gates.manifest.ts` — single source of truth listing every mutation route + its required feature. Unit test enumerates all files under `cap-table/`, `dataroom/`, `data-room/`, `vesting/`, `esop/`, `blockchain/`, `tokenization/`, `ai/vesting*`, and fails if any route is absent from the manifest OR fails an AST check that `requireFeature` is called before any `await`. Blocks P8.
- **D3-CISO-03 — k≥5 anonymity for aggregate counters in U.7.** Rewrite the progression queries to return `count: null` (or bucketed labels like `<5`) for any bucket below k. Timestamps quantised to weekly resolution. Update C.1.2 Progression tab spec.
- **D3-CISO-04 — Redact U.9 auto-DataRoom tags for reseller view.** Exclude `credits_consumed`; coarsen `phase_at_generation` to the 12-phase enum only; hash-partition `generated_by_agent` into role families (research / financial / legal / product). Update U.9 §1 auto-DataRoom section.
- **D3-CISO-05 — Sandbox separate cap + rate-limit.** Add `resellers.monthly_sandbox_credits int default 500` (separate from `monthly_credit_budget`) and enforce hourly rate-limit 50 credits/hr with anomaly alert at 3× 7-day median. Update U.4.
- **D3-CISO-06 (advisory but urgent)** — Gate off Stripe customer portal for wholesale-provisioned founders. Add server-side check in `/api/stripe/portal/route.ts`: if the customer's subscription belongs to a reseller Stripe customer object, return 403.
- **D3-CISO-07 — Hash `subject_startup_user_id` before writing to Stripe metadata.** New helper `hashUserId(uuid)` in `web/src/lib/reseller/hash.ts`. Update D.3 diagram.
- **D3-CISO-08 — CI rules R-01…R-09** as listed in CISO §4. Add to `.claude/settings.local.json` hooks + a new `web/scripts/ci/reseller-lints.mjs`.

### D.4 CLO fixes (APP + contract)

- **D4-CLO-01 — Rewrite E.1 APP 5.2 notice** covering all ten paragraphs. Additions: (c) "not required by law", (e) consequences (nothing changes for BlockID access), (g) express access/correction reference, (i)/(j) truthful overseas transfer statement (Stripe US, AI providers as sub-processors), and add contact_email to the shared field list to close the H.10 gap. Update EN + VI in-place.
- **D4-CLO-02 — Signed reseller agreement gate on P3 go-live.** Add exit criterion "InfoVision-Auschain deed executed" to P3. Draft the 5 clauses (CLO §5) as separate `docs/legal/reseller-agreement-template.md` — outside code scope, handed to CLO agent + human counsel.
- **D4-CLO-03 — Wholesale two-contract chain documented.** Add subsection U.3.1 to the plan: Auschain→InfoVision (B2B tax invoice for A$99 GST-inc); InfoVision→Startup (separate off-Stripe supply). Auschain's invoice descriptor must not purport to bill the startup.
- **D4-CLO-04 — Replace "notarisation" language in U.9 Phase 10.** Use "cryptographic tamper-evidence" or "immutable hash record". No customer-facing use of "notary" or "notarised".
- **D4-CLO-05 — AUSTRAC pre-flight before Share Management add-on tokens become transferable.** Add exit criterion to P8: "confirm tokens are non-transferable off-platform OR enrol as reporting entity."
- **D4-CLO-06 — Sandbox banner + acceptable-use clause.** In-sandbox banner: "This is a test workspace. Do not paste real customer PI unless you have consent." Update U.4.
- **D4-CLO-07 — KPI CSV delivery via authenticated signed URL, not email attachment.** Already specified (24h TTL), reaffirm in C.6.
- **D4-CLO-08 — Reseller marketing pre-approval workflow.** Add to `/admin/resellers/[slug]` a "Approve collateral" tab; unapproved marketing violates C.3 co-branding rules and the agreement.

### D.5 New / updated open decisions

Extends Section H (existing H.1–H.16):

- **H.17 GST invariant reading** (D2-CFO-06). Recommend: "BlockID gross retained" = pre-GST-remit constant $59.40; ATO liability varies per tier. Confirm accounting-team reading before P3.
- **H.18 COGS_PER_CREDIT_AUD starting value** (D2-CFO-04). Recommend A$0.05 initial; auto-adjust monthly from actual AI provider bills.
- **H.19 Sandbox monthly cap** (D3-CISO-05). Recommend 500 credits/mo hard cap, 50/hr rate limit.
- **H.20 Reseller agreement counsel** (D4-CLO-02). Recommend Auschain's existing counsel or a specialist (LegalVision AU / K&L Gates AU privacy team). Sign before InfoVision paying customer #1.
- **H.21 8-phase display over 12-phase storage** (CTO §6). Recommend store 12, display bucketed 8 via a view. Update `[[platform_roadmap]]` memory note.

---

## E. Migration numbering correction

Latest migration is **0090** (`0090_svi_index_populate_state.sql`), not 0074 as the plan assumed. Renumber:

| Plan reference | Actual migration | Delivers |
|---|---|---|
| 0075 (resellers etc.) | **0091** | resellers, reseller_admins, reseller_attributions, reseller_promotion_codes |
| 0076 (extensions) | **0092** | app_users/projects/plans/revenue_events/credit_transactions column additions |
| 0077 (codes seed) | **0093** | seed InfoVision + shared coupons (post-Stripe seed) |
| 0078 (ledger) | **0094** | reseller_commissions + reseller_commission_events + view + CHECK per D1-CTO-01 |
| 0079 (audit log) | **0095** | reseller_audit_log |
| 0080 (grants) | **0096** | reseller_credit_grants + sandbox_credits column |
| 0081 (addon flags) | **0097** | plans.is_addon + app_users.grandfathered_share_management |
| 0082 (backfill) | **0098** | grandfather backfill |

Track B:

| Plan reference | Actual migration |
|---|---|
| B1 showcase scaffold | **0099** (projects.is_showcase, projects.reseller_sandbox_id, projects.repo_url) |
| B9 reviews | **0100** (showcase_reviews) |

Update the Plan's `path:line` references + G.1 phase table + U.5 goal file schema.

---

## F. Reviewers to run in the next P0 tick (advisory + non-blocking)

The 4 blocking reviewers dominated tick 1. Tick 2 should run in parallel:

- **CMO** — SEO strategy for `/showcase/blockid`, `?via=` funnel, VI marketing coverage, competitor landscape for wholesale-reseller offering
- **COO** — dependency graph across A + B tracks; sprint sequencing given autonomous loop; blocker-detection rules
- **CPO** — UX consistency of StepReseller, Console 3-tab drawer, Purchase drawer; wholesale vs retail founder journey coherence
- **CDO** — GA4 event catalogue for U.9; audit-log integrity; aggregation query analytics; monitoring gaps
- **CHRO** — team-capacity impact of ~19 + ~6–8 eng-weeks via autonomous loop
- **CRO** — conversion funnel changes from StepReseller; churn implications of Share-Management split; win-rate wholesale vs self-signup
- **Customer Success** — onboarding UX for wholesale-provisioned startups; support-request routing on-behalf-of
- **Investor Relations** — pitch-deck impact of reseller economics; unicorn-goal storyline

These 8 will fan out in parallel on tick 2 (goal-loop iteration 2).

---

## G. Merge instructions for the plan file

The autonomous loop applies this delta to `docs/plans/reseller-module-plan.md` via the following edits (each with a stable anchor from the current plan for `Edit` tool):

1. **Section D.1 `reseller_commissions` table** — add `billing_model text not null` column, replace CHECK with the D1-CTO-01 form.
2. **Section D.1 `reseller_attributions` table** — remove user-level partial unique.
3. **Section D.4 event handling** — refactor into event-sourced `reseller_commission_events` per D1-CTO-04.
4. **Section D.1 `resellers` table** — add `gst_registered bool`, `abn text`, `monthly_sandbox_credits int default 500`.
5. **Section U.4 sandbox** — add hard cap 500/mo, rate limit 50/hr, hourly anomaly alert.
6. **Section U.7 progression queries** — add k≥5 bucketing, weekly timestamp quantisation.
7. **Section U.9 auto-DataRoom** — redact `credits_consumed`, coarsen `phase_at_generation`, hash-partition `generated_by_agent`.
8. **Section G.2 GST caption** — clarify pre-GST-remit reading; add per-tier ATO liability column.
9. **Section G.3 refund table** — three-part GST reversal.
10. **Section E.1 EN + VI notice** — rewrite covering APP 5.2 (a)–(j) fully; add contact_email to shared list.
11. **Section H** — append H.17–H.21.
12. **Section U.5 migration numbering** — 0075→0091, etc.
13. **Section U.3 wholesale bill-back** — add U.3.1 two-contract chain subsection; drop "notarisation" from U.9 Phase 10.
14. **New section U.15** — CI enforcement rules R-01…R-09 catalogue + typed `resellerSupabase()` wrapper spec + feature-gate manifest schema.
15. **New file `docs/legal/reseller-agreement-template.md`** — clause skeleton per D4-CLO-02.

After merge, P1.1 (0091 migration) is authorised IFF a fresh reviewer tick returns `verdict: approved` from all 4 blocking reviewers on the amended plan.

---

## H. Verdict

**P1 NOT AUTHORISED.** Loop must re-tick after this delta is merged. Autonomous loop's next action (goal-file `current_focus`): remain on **P0.2 (delta merge)** until this file's items 1–15 are applied to `docs/plans/reseller-module-plan.md`. On successful merge + re-tick of the 4 blocking reviewers with `approved`, advance `current_focus` to **P1.1** and fire migration 0091.

Nothing in this delta requires human decision except H.17–H.21 (recommendations provided).
