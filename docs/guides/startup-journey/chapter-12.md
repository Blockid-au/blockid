# Chapter 12 — Exit & Beyond

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `12-exit`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 12 · Exit / Beyond**

The final chapter — either you are preparing for the next round with
a stronger position, exploring an acquisition, or (if your reseller is
an accelerator segment) rolling up into an LP-report bundle. Chapter 12
turns the workspace into a portfolio-view artefact that anyone
downstream — LPs, acquirers, next-round investors — can read without
you narrating.

## What the founder does

Open Workspace → Exit-readiness. Pick the path: (a) next-round prep
(Chapter 9 loop with the new numbers), (b) acquisition exploration
(uploads NDAs + LOIs into the exit-readiness DataRoom section), or (c)
LP-roll-up (if your reseller is an accelerator, opt in to the
`lp_report` bundling so the reseller can include you in their quarterly
LP update — you still control what fields surface). Whichever path,
run the comparable-exits benchmark once so you know the market context.

## Agents invoked

- **Exit-readiness agent** — packages the last two years of SVI curve
  + KPI trend + cap-table history + on-chain hashes into a single
  exit-readiness PDF, ready for a data-room-of-record.
- **AU-comparable-exits agent** — benchmarks against public AU exits in
  your segment (recent 24 months); flags the two or three metrics
  acquirers weighted most heavily.
- **CFO agent (valuation model)** — recomputes the current valuation
  under acquisition scenarios (strategic vs financial buyer) with
  sensitivity bands.
- **IR agent (portfolio bundling)** — if the reseller is an
  accelerator, prepares the anonymised metrics slot that will fold into
  the reseller's quarterly LP report (`lp_report` entitlement, per plan
  §U.9 phase 12).
- **CLO agent** — flags any equity-cleanup work needed before an
  acquisition (unexercised options, unresolved SAFE conversions,
  ambiguous drag-along language).

## Expected outputs & how to interpret

- `exit-readiness.pdf` — self-contained pack an acquirer or next-round
  lead can read without a live founder walkthrough; covers vision arc,
  traction, cap-table history (with on-chain receipts), team, unit
  economics, risks.
- `au-comparable-exits-benchmark.md` — most recent 5–10 AU exits in
  your segment with headline multiples + structure (all-cash / stock /
  earn-out); your position marked inside the range.
- `valuation-model-exit.xlsx` — two-scenario acquisition model
  (strategic + financial), with the CFO's sensitivity bands and a
  fair-value corridor.
- `equity-cleanup.md` (CLO agent) — punchlist of tidy-ups needed before
  signing; each item marked P1 (blocking) / P2 (fixable during
  diligence) / P3 (nice-to-have).
- `lp-report-slot.md` (if reseller is accelerator + opted in) —
  anonymised metrics contribution slot; you review + approve before the
  reseller's quarterly LP report locks.
- **How to read the exit-readiness pack:** the "risks" section is the
  first thing an acquirer's diligence lead reads. Naming your own three
  biggest risks + how you are managing them beats letting them find
  surprises during Q&A — surprises kill more deals than known risks.

## Common pitfalls

- Treating exit prep as an event, not a state. The best exits look
  inevitable in hindsight because the workspace has looked exit-ready
  since Chapter 9 — turning it on the week before signing is the tell
  that says "we scrambled".
- Opting into the accelerator LP-report bundle without reviewing the
  anonymised slot. Even anonymised, the shape of your revenue curve is
  recognisable to peers — read what fields surface before you approve,
  every quarter.
- Skipping equity cleanup because "diligence will surface it anyway".
  It will — and every P1 item that surfaces during diligence costs you
  a percentage point of valuation. Do the cleanup once, cite it in the
  exit-readiness pack, and diligence becomes verification instead of
  discovery.
- Believing there is a "Chapter 13". There isn't — Chapter 12 is
  intentionally the final chapter of the guided journey. After exit,
  you either start a new workspace (Chapter 1 with the compounded
  advantage of everything you learned) or transition into the reseller
  / accelerator role and help the next cohort walk the same 12
  chapters.

## On BlockID.au's showcase workspace

BlockID.au keeps Phase 12 in "planned" state on `/showcase/blockid` —
deliberately, because exit prep for the platform itself is a Phase-11
monthly cadence question, not a one-shot event. What you can look at
today is the shape of the exit-readiness template: the same 6-section
PDF that a real Phase-12 startup would generate, with placeholders
where your live data would sit. The reseller-lens LP-report slot is
also mocked so you can preview exactly what an accelerator partner
would see in their quarterly bundle.

## Next step

Regardless of your exit path, run the exit-readiness pack once per
quarter starting today. Even if the exit is three years away, quarterly
rehearsals mean you never scramble — and every rehearsal produces a
snapshot you can compare against later to see how the story has
strengthened.
