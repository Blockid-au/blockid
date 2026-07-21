# Chapter 5 — PMF & Early Traction

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `05-pmf`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 5 · PMF / Early Traction**

Move from "people click" to "people come back". PMF is a retention story,
not a traffic story — Chapter 5 is where you log real users, first revenue
and cohort retention, then let the CDO agent audit whether the signal is
real.

## What the founder does

Log first users, first revenue and retention data. Connect the founder's
own Stripe account in test-mode (this is separate from BlockID's own
Auschain Stripe — it wires your future gateway). Feed at least two
consecutive weeks of retention numbers so a cohort curve becomes possible.

## Agents invoked

- **CDO agent** — runs a data-quality audit on the numbers you logged;
  flags cohorts too small to conclude anything.
- **CDO agent (PMF pass)** — computes a PMF signal (retention slope +
  revenue slope + qualitative "would-be-very-disappointed %").
- **CFO agent (light)** — updates the unit-economics doc with the first
  CAC and LTV estimate, tagged as provisional.
- **Retention-cohort chart** — auto-drawn from the weekly buckets into the
  DataRoom under `traction/`.

## Expected outputs & how to interpret

- `pmf-signal.md` — retention slope + revenue slope + qualitative PMF
  percentage, with a colour band (red/amber/green).
- `cohort-retention.pdf` — weekly cohort curve for the last eight weeks
  (or as many as you have).
- `unit-economics-provisional.md` — CAC + LTV + gross margin, tagged
  "provisional" until Chapter 6 CFO run.
- `stripe-founder-testmode.md` — checklist confirming your own Stripe
  test-mode account is wired and a $1 test charge succeeded.
- **How to read the PMF band:** amber is the honest answer for most
  Phase-5 startups. Green with fewer than 30 real users is almost always a
  small-sample illusion — the CDO agent will label it "insufficient
  sample" rather than green.

## Common pitfalls

- Claiming PMF from a single week of retention. The cohort curve needs at
  least four weekly buckets before the slope becomes readable — the CDO
  agent will refuse to grade sooner.
- Confusing paid trials with retention. A paid trial user who never
  returns after trial-end is a churned user, not a retained one — the
  cohort chart correctly ignores them.
- Skipping the founder's own Stripe test-mode connection because "we
  don't sell yet". Wiring it in Chapter 5 (even to a dummy price) gets
  the schema ready so Chapter 7 growth wiring is a one-click flip, not a
  two-week project.

## On BlockID.au's showcase workspace

BlockID.au's own Chapter 5 was tricky — "PMF for a startup-scoring
startup" is a chicken-and-egg problem. The showcase workspace at
`/showcase/blockid` shows how CDO agent labelled the first four weeks
"insufficient sample" before finally flipping to amber at week six on the
reseller-funnel cohort. That honest amber, not a fake green, is what the
plan expects.

## Next step

Open the workspace Traction tab and log week-1 to week-N retention for the
users you have today, however few. Two rows is enough to start — the CDO
agent will tell you honestly how much more data it needs.
