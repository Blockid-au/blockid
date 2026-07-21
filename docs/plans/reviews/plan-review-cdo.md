---
name: CDO advisory review — reseller module P0.3
role: cdo
verdict: approved_with_notes
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary
k-anon and audit-log integrity are solid. Two gaps before P4/P7 sign-off:
(1) no reseller/showcase GA4 catalogue in `web/src/lib/analytics/events.ts`;
(2) phase + reviews aggregates bypass complementary suppression.

## Findings
- k>=5 enforced via one constant (`web/src/lib/reseller/portfolio-aggregates.ts:24
  K_ANONYMITY_THRESHOLD=5`), reused by `portfolio-phase-distribution.ts:31` +
  `reviews.ts:23`, rendered as `"<5"` in `web/src/app/reseller/page.tsx:65-72`.
- `applyComplementarySuppression` applied to weekly + SVI-bands
  (`page.tsx:66-67`) but NOT to `buildPhaseDistribution` or
  `buildReviewsSummary` (page.tsx:68,72). With 12 phase bins next to the
  exposed `attributed_total`, a single suppressed bin is recoverable by
  subtraction; reviews' two correlated buckets (`total_reviews`,
  `projects_with_reviews`) carry the same risk.
- Audit-log append-only DB-enforced: `0093_reseller_audit_log.sql:43-57`
  installs BEFORE UPDATE + BEFORE DELETE triggers that RAISE; RLS ON with
  no policies so only service-role writes. Missing: TRUNCATE guard and
  per-row `prev_row_sha256` chain (CISO P10 "audit-log digest" scope).
- `showcase_reviews` (`0100_showcase_reviews.sql`): `comment_hash` NOT NULL,
  reseller lens never selects `comment`, RLS default-deny + service-role
  policy. Good.
- GA4 catalogue for showcase (U.9) absent: `analytics/events.ts` (142
  lines) has zero reseller/showcase/tour/dataroom/phase matches. B5
  explicitly deferred download-tracking gtag.
- GST reconciliation tolerance A$1 (`reconciliation.ts:27
  GST_TOLERANCE_CENTS=100`), tested + drift-emailed (goal.md:295,301).
  Commission-ledger drift (`ledger_drift_events`, goal.md:420,587) has
  no exported code-constant — implicit "must be 0" should be explicit.

## Recommendations
1. Wrap `buildPhaseDistribution` and `buildReviewsSummary` outputs with
   `applyComplementarySuppression` before render (~2 LoC in page.tsx) +
   add vitest cases for the 11-visible/1-suppressed phase and the
   correlated (total, projects) reviews pair.
2. Land a first-pass GA4 catalogue in `events.ts`:
   `reseller_dashboard_view`, `reseller_customer_drawer_open`,
   `reseller_reveal_email`, `showcase_view`,
   `showcase_dataroom_download`, `showcase_review_submitted`,
   `phase_transition`, `integration_connected`. CPO/CMO finalise names.
3. Add TRUNCATE trigger + nightly `prev_row_sha256` digest to
   `reseller_audit_log` — fold into P10 hardening.
4. Export `COMMISSION_TOLERANCE_CENTS=0` and gate the P11 cron on it so
   the drift KPI is code-constant, not implicit.

## Next-tick asks
- Track A: fold rec #1 into a P4 hardening tick (~30 LoC).
- Track B: schedule the GA4 catalogue before B9 goes public so first
  showcase visits are measurable from day one.
- P10 hardening: pair audit-log digest with weekly-reconciliation cron.
