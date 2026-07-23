---
name: plan-review-cro
role: cro
verdict: approved_with_notes (P8 GA remove-path RESOLVED at tick 56)
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary
Funnel additions (ResellerCodeField, Share-Mgmt drawer) are appropriately non-mandatory and low-friction. ~~However, the "cancel add-on end-of-cycle" story in `/api/stripe/change-plan` remove_item path does NOT actually preserve access through the paid period — this is a churn/UX landmine that must be fixed before P8 GA.~~ **P8 GA remove-path RESOLVED at tick 56 (P8.4b)** — Subscription Schedules with `end_behavior='release'` now preserve access through `current_period_end`. Wholesale-provisioned engagement risk is acknowledged in H.8 but needs an activation SLA before we can claim parity.

## Findings
- **Retail funnel friction — LOW/OK.** `reseller-code-field.tsx` is collapsed by default ("Have a reseller code?" link); it only auto-expands when `initialCode` from `?via=` capture is present (L93). No blocking validation, no required field, no wizard-step insertion — the "StepReseller" naming in the plan is misleading, it's a subfield inside StepTier not a full wizard step. Good for organic onboarding; no measurable friction added. Recommend renaming the plan reference from `StepReseller` → `ResellerCodeField` to prevent future contributors from bloating it into a real step.
- > **RESOLVED at tick 56 (P8.4b, commit refs in reseller-module-goal.md:360-364):** immediate-delete path replaced with Subscription Schedule end_behavior='release'; customer retains access through current_period_end. See web/src/app/api/stripe/change-plan/route.ts:540-616 + web/src/lib/stripe/addon-schedule.ts:4-8. — Verified 2026-07-23.

  **Remove-item path is NOT `cancel_at_period_end`.** [web/src/app/api/stripe/change-plan/route.ts:540](web/src/app/api/stripe/change-plan/route.ts) calls `stripe.subscriptionItems.del(target.id, {proration_behavior:'none'})`. That removes the item immediately from the active subscription — entitlement checks (`can(user,'share_management')`) will flip to false at next `useEntitlement` poll (~60s), and the customer forfeits the unused portion of the month WITHOUT a credit note. The comment on L536 and the plan §F.5 both promise "cancel_at_period_end-style, customer keeps access through paid period." Stripe does not support per-item cancel-at-period-end directly; this requires a `subscription_schedules` phase transition OR a `cancel_at` timestamp on a schedule. As shipped, this is a "cancel now, lose access now, no refund" surprise — high churn-blame risk when users test-remove and lose data-room access instantly.
- > **RESOLVED at tick 56 (P8.4b, commit refs in reseller-module-goal.md:360-364):** immediate-delete path replaced with Subscription Schedule end_behavior='release'; customer retains access through current_period_end. See web/src/app/api/stripe/change-plan/route.ts:540-616 + web/src/lib/stripe/addon-schedule.ts:4-8. — Verified 2026-07-23.

  **No addon_cancel undo window.** Once `subscriptionItems.del` fires there is no soft-delete / grace period. Combined with the above, a mis-click on "Remove" costs the customer up to 29 days of paid access. Retail-plan cancellations by contrast use Stripe's native period-end via `cancel_at_period_end=true`, which the codebase handles elsewhere — inconsistency will surface in support tickets.
- **Wholesale magic-link activation risk — MEDIUM.** Wholesale founders never see the pricing → checkout → success dopamine loop (plan L60, L718). H.8 mandates magic-link verification before workspace goes non-provisional (plan L1193), which prevents spam-signup KPI juking, but does not measure engagement. Retail self-signups have demonstrated intent (they typed a card); wholesale founders have demonstrated only that a reseller entered their email. Expect 30-50% lower D7 activation without a compensating nudge sequence.
- **Reseller pill on Share-Mgmt drawer reads cookie post-attribution.** `share-mgmt-drawer.tsx:144` reads `readCachedVia()` for display, but the actual reseller-attribution-of-the-addon uses the customer's stored `metadata.reseller_*` on the Stripe subscription (per plan §D webhook amend). If the founder was originally attributed to Reseller A and then clears the cookie / gets a Reseller B cookie later, the pill shows B but commission still routes to A. Low incidence, but a support-ticket footgun. Recommend the drawer read attribution from `/api/reseller/attribution/current` (server-side) not the cookie.

## Recommendations
1. > **RESOLVED at tick 56 (P8.4b, commit refs in reseller-module-goal.md:360-364):** immediate-delete path replaced with Subscription Schedule end_behavior='release'; customer retains access through current_period_end. See web/src/app/api/stripe/change-plan/route.ts:540-616 + web/src/lib/stripe/addon-schedule.ts:4-8. — Verified 2026-07-23.

   ~~**BLOCK P8 GA on fixing the remove path.**~~ Either (a) switch to `stripe.subscriptionSchedules` and schedule item removal at `current_period_end`, keeping the item live until then; or (b) if immediate removal is preferred for accounting cleanliness, change UX copy to "Remove immediately (no refund for unused days)" + require an explicit "I understand" confirmation, and drop the `cancel_at_period_end-style` framing from plan §F.5 and code comments. **→ Path (a) shipped at tick 56.**
2. **Add a `preview_remove` mode** mirroring the add_item preview, showing "$X of unused period will be forfeit / credited" so the customer sees the cost before clicking Remove.
3. **Wholesale activation SLA.** Add a Customer-Success trigger: if a `source='provisioned'` founder hasn't hit magic-link within 72h, ping the reseller admin console. Measure wholesale-vs-retail D7/D30 activation as a first-class metric on `/reseller/[slug]` KPI cards.
4. **Rename plan references** `StepReseller` → `ResellerCodeField` (subfield, not a wizard step). Update U.11 CRO row and P2.4 note in reseller-module-goal.md accordingly.
5. **Attribution source-of-truth for drawer pill.** Have `share-mgmt-drawer.tsx` fetch from a server endpoint that returns the *committed* attribution reseller, not the possibly-stale cookie.

## Next-tick asks
- CTO/backend: implement subscription-schedule-based end-of-cycle removal OR reword the UX + comments (choose one, don't ship as-is).
- CPO: decide whether add-on remove should default to "end-of-cycle" (safer, matches user mental model of "I paid till the 30th") or "immediate + no refund" (accounting-cleaner, matches current code). Document the decision in H.5.
- Customer-Success: draft the 72h wholesale-activation nudge template (EN + VI) for the next tick.
- Analytics: instrument `addon_remove_intent` (drawer opened on removal) vs `addon_remove_committed` so we can measure the mis-click / surprise-refund rate after ship.

## Resolution log
- **2026-07-23 — Share-Mgmt remove-path finding RESOLVED.** The tick-56 (P8.4b) shipment replaced the immediate `subscriptionItems.del` call with Stripe Subscription Schedules using `end_behavior='release'`. Customer retains entitlement through `current_period_end`; no forfeit of unused paid days. UX copy in `billing-client.tsx:119-148` (`handleRemoveShareMgmt`) now reads "Remove Share Management add-on at end of current cycle?" — consistent with implementation. Evidence: `web/src/app/api/stripe/change-plan/route.ts:540-616` (subscriptionSchedules.create/.update), `web/src/lib/stripe/addon-schedule.ts:4-8` (documented fix). Commit refs in `reseller-module-goal.md:360-364`. Findings above are retained for audit trail; verdict header updated to reflect resolution.
