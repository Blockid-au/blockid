---
name: plan-review-cs
role: customer-success
verdict: approved_with_notes
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary
P6 credit-grant + P9.3 requests-inbox flows are in good shape for reseller-facing
operations, but the wholesale-provisioned founder onboarding path (H.8 magic-link
+ first-run help) and CS-actionable leading indicators in the P11 digest are not
yet implemented — both are the CS-critical gaps for advisory sign-off.

## Findings
- No `/api/reseller/startups/invite` route exists yet (`web/src/app/api/reseller/`
  only has code, credits, customers, me, reports, requests, sandbox). H.8
  (plan:1193) magic-link + provisional workspace contract is unbuilt — a
  wholesale founder today lands cold in the dashboard with no welcome email.
- Grant modal over-budget copy (grant-form.tsx:223-306) offers both self-serve
  "Request admin approval" AND mailto fallback — good affordance. But strings
  are hardcoded EN only; no `getLocale()` read, no VI parallel copy. §H EN+VI
  review is deferred to P10 — should be flagged before InfoVision go-live.
- Requests inbox (inbox-client.tsx:77-141) captures `decision_reason` from
  admin; reseller-side GET returns it (requests/route.ts:169-186) but no page
  renders it. Founder-visible "why denied" affordance is missing end-to-end.
- Over-budget payload captures `remaining_budget_snapshot` at submit
  (grant-form.tsx:257) — admin sees exact context, CS-friendly for triage.
- P11 digest KPIs (goal.md:417-422) list `attributed_churn_30d` (trailing)
  but zero leading indicators CS can action: no last-login-recency, no
  first-report-generated, no 7-day-inactive flag per attributed customer. By
  the time churn_30d fires, the customer is already gone.
- No routing for "reseller admin emails on behalf of a startup" (§U.11 CS
  scope). Only channel is `mailto:admin@blockid.au` — no ticket-id, no
  reseller_id tagging, no SLA. Support bridge is informal today.

## Recommendations
1. Land P6.x `startups/invite` + first-login welcome email BEFORE first
   wholesale customer onboards (InfoVision P1.5 unblock is the natural gate).
   Email template must carry the E.1 attribution notice (plan:687) and a
   "You're on Phase 1 of 12" first-run pointer to `/guide/01-vision`.
2. Add `decision_reason` render to a reseller-side `/reseller/requests` page in
   P9.4 or P10 — closes the "why denied" loop for the reseller admin.
3. Expand P11 digest KPIs with two leading indicators per attributed customer:
   `days_since_last_login` and `first_report_generated_at`. These are the
   signals CS actions in a weekly review; churn_30d alone is post-mortem.
4. Move Grant modal + inbox strings into an `i18n/reseller.{en,vi}.ts` bundle
   in P10 hardening rather than after go-live; the wholesale + VI overlap is
   InfoVision-shaped.

## Next-tick asks
- File a P6.x sub-phase: `startups/invite` route + welcome email template
  (EN+VI) + magic-link verification per H.8; owner CTO, reviewer CS.
- Add `support_ticket` as a fourth `request_type` on `reseller_requests` so
  reseller admin can route founder-support issues through the same inbox with
  reseller_id + target_user_id already scoped, no new table needed.
