# Chapter 8 — Team & Culture

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `08-team`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 8 · Team & Culture**

Add co-founders, first hires and an ESOP scheme. The CHRO agent produces
an org-chart and role definitions; if the Share Management add-on is
active the cap table and vesting schedules populate here — Div83A
tax-concession checklist runs so early ESOP grants qualify.

## What the founder does

Add each co-founder and hire in Workspace → Team. Draft the ESOP scheme
rules (pool size, vesting schedule, cliff, exercise window). If you have
the Share Management add-on, review the cap table draft the CHRO produces
and approve or override each row before it becomes the source of truth
for Chapter 11 blockchain sync.

## Agents invoked

- **CHRO agent** — org-chart with roles, seniority bands, expected
  90/180-day hires.
- **CHRO agent (role definitions)** — a JD-style doc per open role,
  tuned for the AU tech market.
- **CHRO agent (ESOP scheme)** — scheme rules doc: pool size, vesting,
  cliff, exercise, tag-along, drag-along.
- **Div83A checker** — runs `web/src/lib/div83a-checker.ts` against each
  early grant; flags any at risk of losing the tax concession.
- **Cap-table draft** — populated only if Share Management add-on is
  active; otherwise a sample layout doc explains what would be produced.

## Expected outputs & how to interpret

- `org-chart.pdf` — visual org tree with expected next-6-month hires
  shown as dashed nodes.
- `role-definitions/*.md` — one JD per open role; each references the
  Chapter 6 unit-economics pack so salary bands are defensible.
- `esop-scheme.md` — full scheme rules doc, ready for legal review before
  you issue the first grant.
- `div83a-check.md` — per-grant checklist with green/amber/red, plus the
  fix suggested for any amber/red row (usually valuation timing).
- `cap-table-draft.csv` (if add-on active) — one row per shareholder +
  option holder, ready for the Chapter 11 blockchain sync.
- **How to read the org-chart:** dashed nodes are hires you plan; solid
  nodes are people who exist. Solid-to-dashed ratio tells you whether
  the plan is realistic — three dashed per solid is aggressive, five per
  solid needs Chapter 9 funding first.

## Common pitfalls

- Issuing ESOP grants before running the Div83A checker. A late
  valuation or the wrong grant date can disqualify the tax concession —
  un-doing that requires a re-issue at the correct valuation, and rare
  early hires walk when they see the swap.
- Building an org-chart with only present hires. The dashed-hire layer is
  what makes the chart useful for Chapter 9 investor conversations —
  leaving it blank makes the team look understaffed.
- Populating the cap table without the Share Management add-on. The
  draft doc explains what you would get, but the actual populated table
  needs the add-on active — trying to keep the cap table in a side
  spreadsheet defeats the Chapter 11 blockchain-sync pipeline.

## On BlockID.au's showcase workspace

BlockID.au's Chapter 8 milestone `team_v1` and its ESOP scheme doc live
in the `/guide/reports` Phase 8 bucket. The Div83A check flagged one
early grant amber (grant date pre-dated the first valuation by three
weeks); the fix — a re-grant at the first-valuation date — is documented
in the follow-up note. Investors read that trail and take it as evidence
of good governance, not as a red flag.

## Next step

Draft the ESOP scheme this week; run the Div83A checker on any grants
already made. If you have the Share Management add-on, walk the CHRO's
cap-table draft with a co-founder before approving each row — three eyes
catch what two miss.
