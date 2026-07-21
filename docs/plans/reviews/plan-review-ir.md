---
name: plan-review-ir
role: investor-relations
verdict: approved_with_notes
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary

The reseller module is a genuine pitch-deck upgrade: the wholesale-vs-retail split (100% off-Stripe bill-back for InfoVision-style partners; 60/40 retail split for referral partners) is a clean, defensible dual-GTM story that maps directly onto the A$1B unicorn ladder in `memory/project_unicorn_goal.md`. Auschain PTY LTD staying seller-of-record on every invoice (plan §U.1, §H.13) is the right call for the data room — it preserves a single ATO GST remitter, a single revenue-recognition entity, and one clean bank-statement audit trail for due diligence. `/showcase/blockid` is functional as a founder-facing proof point (real reports, real phase strip, real agent activity, redacted-only metadata) and is now shippable as a live demo URL in any deck. Advisory notes below refine the narrative rather than block P0 execution.

## Findings

- Wholesale channel economics are unusually investor-friendly: BlockID collects A$99/mo/idea at 0% commission (plan §U.3, §G.2 truth-table, §H commission invariant) while the reseller carries CAC and support. That is a 100%-margin channel at the SaaS layer plus GST already netted by `splitGst`. This is the strongest single line-item for the "path to A$1M ARR" slide.
- Retail 60/40 (plan §G.2, `commission = list*0.40 − discount`, BlockID gross invariant $59.40 on the $99 SKU) is a healthy referral-partner economic and matches Xero/Canva partner benchmarks. Framed alongside wholesale it demonstrates channel-mix optionality — a category investors reward.
- Auschain seller-of-record decision (plan §U.1) removes the biggest data-room red flag we would otherwise have: no Stripe Connect, no split ledgers, no founder-personal-bank ambiguity, one ABN 79 659 615 111 on every invoice. Data-room checklist item: attach the InfoVision reseller agreement + the "Introduced by <Reseller>" invoice footer sample from plan §H so the seller-of-record story is evidenced, not just asserted.
- `/showcase/blockid` at `web/src/app/showcase/blockid/page.tsx` reads real on-disk artefacts (milestone timeline, phase strip, agent activity), enforces the §284 redaction rule, and is `robots: index` with canonical metadata. As a sales proof-point it works today; it is unique among Australian pre-seed startups and should be the hero link in the deck's "traction" slide.
- Unicorn-narrative fit is tight: `weekly_digest_kpis` in reseller-module-goal.md (attributed_mrr, contribution_margin_pct, commission_cleared_mtd, clawback_exposure, credit_budget_utilization) are exactly the ARR-quality metrics a Series-A partner will ask for. The A$1K→A$10K→A$100K MRR ladder from `project_unicorn_goal.md` becomes a credible "20 InfoVision-style resellers × ~50 wholesale seats" arithmetic — worth surfacing explicitly in the model.
- Missing data-room artefact: no consolidated one-pager yet that ties reseller economics to the 8-phase spiral. Deck currently references SVI and agents; the reseller module is not yet a bulleted GTM lever.

## Recommendations

1. Add a "Channel Economics" slide to the deck: side-by-side wholesale (100% gross retention, reseller-owned CAC) vs retail (60% gross retention, BlockID-owned CAC) with the $99 SKU worked example from plan §H.
2. Publish `/showcase/blockid` as the hero traction link in the deck and the data-room index; label it "live dogfood, updated by autonomous loop" — this is category-defining and should not be buried.
3. Draft a one-page GTM lever memo for the data room covering: seller-of-record rationale (Auschain), commission truth-table with the $59.40 invariant, InfoVision as design-partner reference, and forward pipeline of retail-partner categories (accelerators, incubators, VC scouts).
4. Extend the unicorn masterplan with an explicit reseller-channel row: target #resellers, avg seats/reseller, attributed MRR per phase — so IR can answer "how do you get from A$10K to A$100K MRR" with a channel number, not a hand-wave.
5. Preserve historical `reseller_commissions` and audit-log rows (plan §E.3, §U.9 point 4) as a permanent data-room artefact — auditability of the ledger is itself a diligence differentiator vs peers.

## Next-tick asks

- CFO tick: produce the "20 resellers × N seats → A$100K MRR" arithmetic against the wholesale/retail mix, cite `weekly_digest_kpis` as the reporting spine.
- CMO tick: land a shareable OG image on `/showcase/blockid` so the deck link previews well in email/LinkedIn.
- CEO tick: approve inclusion of the reseller module as a bulleted GTM lever in the master deck; if approved, IR will draft the one-pager in the next tick.
