# Chapter 6 — Revenue & Business Model

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `06-revenue`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 6 · Revenue / Business Model**

Turn provisional numbers into a defensible 3-year projection, a burn curve
and a break-even chart. The CFO agent runs the model; you approve or
challenge the assumptions. Australian GST and Stripe live-mode readiness
are checked here.

## What the founder does

Open Workspace → Financials → Projection. Review each assumption card
(pricing tiers, gross margin, churn, CAC, sales-cycle days) and either
approve or override with your own value + a note explaining why. Iterate
the pricing memo until the top-line makes sense against Chapter 3's
competitor pricing.

## Agents invoked

- **CFO agent** — 3-year projection (P&L + cash-flow + burn) as DOCX and
  XLSX via `web/src/lib/docx`.
- **CFO agent (break-even)** — computes months-to-break-even under three
  scenarios (base / bull / bear) with the assumption diff shown.
- **CFO agent (pricing memo)** — recommends a tier structure defensible
  against the Chapter 3 competitor matrix.
- **au-compliance agent** — GST-registration checklist (turnover
  threshold, quarterly BAS cycle, invoice format).

## Expected outputs & how to interpret

- `financial-model.xlsx` — 3-year P&L + cash-flow + burn, one sheet per
  scenario.
- `financial-model.docx` — narrative summary you can send to a mentor for
  review before Chapter 9.
- `pricing-memo.md` — proposed tier structure with per-tier target ARPU
  and expected mix.
- `gst-readiness.md` — au-compliance checklist with green/amber/red per
  line (ABN status, GST rego, BAS frequency, tax invoice format).
- `stripe-livemode-readiness.md` — pre-flight checklist for switching your
  own Stripe from test to live (business verification, bank account,
  statement descriptor, currency).
- **How to read the projection:** the base scenario is what happens if
  nothing surprises you. The bear scenario is what you plan for. If bear
  month-24 shows insolvency, you either shorten payback or raise sooner —
  the CFO agent will highlight that automatically.

## Common pitfalls

- Approving every CFO assumption without pushback. The CFO agent's
  default is credible-but-conservative; you know your niche better on at
  least three cards, so override them.
- Building the projection off a base scenario that assumes PMF has
  already been proven. If Chapter 5 says amber, the base scenario should
  reflect amber, not green.
- Skipping the GST-readiness checklist because turnover is under the
  A$75k threshold. Investors still ask; a green GST line by Chapter 9
  shortens diligence.

## On BlockID.au's showcase workspace

BlockID.au's Chapter 6 pack — `financial-model.xlsx`, `pricing-memo.md`,
`gst-readiness.md` — is in the `/guide/reports` gallery under Phase 6.
Notice the pricing memo recommends a reseller-wholesale tier (40% margin
share) that the CFO ran once for the base scenario and once assuming the
accelerator partner didn't sign. Both scenarios flow into the same
milestone `financials_v1`.

## Next step

Book two hours this week to sit with the CFO assumption cards. Override
at least three; approve the rest. The projection is only as strong as
your willingness to push back on the defaults.
