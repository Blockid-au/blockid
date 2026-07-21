---
name: plan-review-cpo
role: cpo
verdict: approved_with_notes
ran_at: 2026-07-21
scope: p0.3_advisory
---

## Summary

The four shipped product surfaces (onboarding wizard with `?via=` carry, reseller Customer drawer, Share Management purchase drawer, and the 12-chapter guide + product-tour banner) form a coherent linear founder journey that maps 1:1 onto the U.9 phase matrix. Retail and wholesale journeys converge at the same workspace shell, and the add-on drawer keeps the user in-context (URL-controlled, slide-in, proration inline — no redirect). EN+VI parity is strong in the purchase and tour surfaces; the reseller-facing drawer is the one visible gap.

## Findings

- EN+VI parity is complete and idiomatic in `web/src/components/billing/share-mgmt-drawer.tsx:22-75` (both benefits, cadence, proration, cancel-hint copy translated) and `web/src/components/workspace/product-tour.tsx:34-52` (locale drives phase label + CTA). The 12 chapters at `web/src/lib/guide/startup-journey.ts:1-946` are dual-authored per `LocalisedText`/`LocalisedList` — no `t()`-lookup drift risk because copy is co-located.
- EN-only strings in `web/src/app/reseller/customers/customer-drawer.tsx:116-282` ("Customer", "Close drawer", tab labels rendered via CSS `capitalize` on English tokens, "Loading customer detail…", "SVI curve (monthly)", "Timeline (newest first)", "No reports generated yet"). Resellers are B2B/pro users so this is defensible short-term, but it breaks the EN+VI-everywhere promise in plan §C.4 and blocks any VI-speaking reseller (InfoVision cohort).
- Wholesale-provisioned magic-link founder does land in the same `onboarding-wizard.tsx` shell as retail — good — but there is no `step-reseller/` sub-route as the review brief anticipated; the wizard treats the `via` param as attribution-only (`onboarding-wizard.tsx:56-61`) and does not branch copy or skip the payment step for wholesale-billed users. Confirm intended behaviour: wholesale founders should either skip StepPayment or see a "sponsored by <Reseller>" confirmation panel rather than the retail payment CTA.
- Share Mgmt drawer's in-context affordance works well: URL-driven `openAddon=` mount, focus trap, escape-to-close, body-scroll lock (`share-mgmt-drawer.tsx:124-140`), live proration on cadence toggle, reseller pill auto-detected from `blockid_via` cookie (`:142-147`). No page navigation; the user returns to the billing page on close. This is the correct SaaS purchase pattern.
- 12-chapter journey lands linearly: `startup-journey.ts` orders 01-vision → 12-exit with `order: 1..12`, the product tour banner deep-links to `/workspace/guide/<slug>` for the current phase (`product-tour.tsx:164-169`), and the reseller Customer drawer's Progression tab surfaces a per-event "Guide chapter N →" link (`customer-drawer.tsx:239-250`). Three surfaces (founder tour, in-workspace chapter, reseller coaching link) resolve to one canonical chapter — the coaching-tool intent of U.8 point 5 is realised.
- Purchase drawer's `previewError` renders raw reason codes (`share-mgmt-drawer.tsx:327-329`) rather than a translated user-facing message. Low-severity UX polish, but the amber banner will show tokens like "no_customer" or "price_missing" verbatim to end users.

## Recommendations

- Wrap the reseller Customer drawer strings in the same `useLocale()` + COPY table pattern used by `ProductTour` and `ShareMgmtDrawer`; drop `capitalize` on the tab buttons in favour of localised labels. Small tick, closes the last EN-only surface in the shipped reseller module.
- Add an explicit wholesale branch in `StepPayment` (or a `WholesaleConfirm` variant) that reads a `provisioned_by_reseller` flag from the session and shows "Your workspace is sponsored by <Reseller> — no card required" instead of the Stripe form. Prevents the magic-link founder from bouncing at the payment step.
- Map `previewError` reason codes to translated messages inside `COPY.en.previewErrors` / `COPY.vi.previewErrors` so users never see raw enum tokens.
- Consider adding a "Chapter X of 12" progress ribbon on `/workspace/guide/[chapter]` (mirrors the tour banner idiom) so a founder reading a chapter directly still perceives the linear arc.

## Next-tick asks

- One QA + i18n tick to localise `customer-drawer.tsx` and land translated preview-error strings.
- One product tick to design + ship the wholesale-founder confirmation step in the onboarding wizard, gated by the `provisioned_by_reseller` server-side flag (H.8 magic-link path).
- Confirm with CTO whether `step-reseller/*` route mentioned in the review brief was descoped or renamed — plan and repo currently disagree.
