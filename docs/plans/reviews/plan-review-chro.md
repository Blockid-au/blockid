---
name: plan-review-chro
role: chro
verdict: approved_with_notes
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary
Autonomous-loop delivery of the ~19 eng-week Track A plus ~6–8 wk Track B has, per the goal file, burned 0 human eng-weeks across 50 recorded ticks — a genuine people-cost saving, not an accounting fiction, because implementer/verifier work is fully agent-delegated per U.12/U.13. The Phase 8 ESOP guidance in `docs/guides/startup-journey/chapter-08.md` correctly points founders at the `div83a-checker.ts` module and calls out the classic Div 83A traps (grant-date-before-valuation, missing scheme rules). Two people-side gaps remain: no explicit upskilling plan for the CS + admin team that will inherit reseller support, and the ESOP guide doesn't yet spell out the four Div 83A qualifying tests a founder should self-check before granting.

## Findings
- kpi.eng_weeks_burned=0 is defensible: history shows 50 ticks with implementer + verifier skills doing the work; no human dev handoff appears in `review_history`. The hidden human cost is reviewer + founder sign-off attention (~minutes/tick), which is not tracked. Recommend a `human_review_minutes_burned` companion KPI so the "0 eng-weeks" claim stays honest as complexity grows.
- Chapter 8 references Div83A correctly and the checker library exists (`web/src/lib/div83a-checker.ts` + tests), but the guide never enumerates the four qualifying tests (unlisted co, <10yr, aggregated turnover <$50M, Australian-resident issuer). A CHRO-agent output that just runs the checker without founder-visible criteria risks a "green tick, no understanding" failure mode.
- Phase 8 exit says `ESOP scheme created` but there is no gate that the scheme has been legal-reviewed before first grant — the guide correctly says "ready for legal review" but the milestone `team_v1` can be marked done without that step. Div 83A concessions are lost silently on defective scheme rules.
- Reseller rollout will land ~19 wks of new surface (commissions ledger, coupon flow, wholesale ceiling, integrations catalogue) on a CS + admin team of effectively 1 (founder). No onboarding runbook, escalation matrix, or "who owns a reseller dispute" doc exists in the plan.
- Autonomous loop cadence is off-peak-only with a 16-agent concurrency cap and hard kill-switch — healthy for founder wellbeing and avoids the always-on-call anti-pattern; no burnout risk flagged.
- No ESOP touchpoint for the (future) reseller-support hire themselves. Once resellers onboard, the first CS hire is a Phase 8 event for BlockID — worth pre-drafting their grant terms now while the CHRO agent is warm on the plan.

## Recommendations
1. Add `kpi.human_review_minutes_burned` (rolling 7-day) to the goal file so the 0-eng-weeks story stays audit-able.
2. Extend `chapter-08.md` "What the founder does" with the four Div 83A qualifying tests as an explicit self-check checklist; keep the checker as the automated pass.
3. Add an exit-criterion sub-flag on Phase 8: `esop_scheme.legal_reviewed: bool` — cannot mark `team_v1` done without it, or explicitly waive with a founder-signed override note.
4. Draft `docs/runbooks/reseller-support.md` before P10 (audit-log digest) — escalation matrix, dispute template, on-call expectations for CS + admin.
5. Pre-draft CS-hire ESOP terms (pool %, cliff, vesting) as an artifact under Phase 8 so the first reseller-driven hire is not a scramble.

## Next-tick asks
- COO: sequence recommendation #4 (support runbook) into P10, non-blocking for go-live but pre-first-reseller.
- CFO: confirm CS-hire ESOP pool sizing fits the current cap-table headroom (recommendation #5).
- CLO: opinion on whether recommendation #3 (legal-review sub-flag) is a hard gate or advisory for the founder-only phase.
