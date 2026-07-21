# Chapter 7 — Growth & Analytics

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `07-growth`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 7 · Growth / Analytics**

Turn on the real analytics stream. GA4 connects to your live property;
the founder's own Stripe flips from test to live. A weekly SVI-refresh
cron starts writing SVI deltas so growth becomes visible on a sparkline,
not a spreadsheet.

## What the founder does

In Workspace → Integrations, connect GA4 (paste the property ID + grant
the service account viewer access) and switch Stripe from test-mode to
live-mode. Then open Workspace → SVI → Weekly refresh and set the
day-of-week + time-of-day for the recurring pull.

## Agents invoked

- **GA4 pull worker** — reads sessions + conversions + top-referrers
  weekly into `svi_signals`; no PII surfaces.
- **Stripe live pull worker** — reads MRR + churn + refunds weekly into
  `revenue_events` for the founder's own gateway.
- **CMO agent (growth playbook)** — produces a 12-week acquisition plan
  tied to the two highest-signal channels from GA4.
- **Referrals scaffold** — enables the existing referrals infra with a
  founder-branded referral link + reward config.

## Expected outputs & how to interpret

- `svi_signals` rows — one weekly bucket per week, populated from GA4 +
  Stripe live pulls; visible as a sparkline on the workspace dashboard.
- `growth-playbook.md` — CMO's 12-week plan with weekly hypotheses,
  budget guardrails and a fallback if any hypothesis dies at week two.
- `weekly-delta.pdf` — auto-emailed weekly delta summarising SVI change +
  top-3 movers, sent to the founder's inbox every Monday (or your chosen
  day).
- `referrals-config.md` — reward tier, terms, anti-abuse guardrails;
  ships disabled until you approve one final review.
- **How to read the weekly delta:** single-week jumps mean nothing
  (noise). Look at three consecutive weeks in the same direction — that
  is a trend the CMO agent will start iterating the growth playbook on.

## Common pitfalls

- Turning on GA4 without a measurement plan. If you cannot name your
  primary conversion event, the GA4 stream is just noise — write the
  plan first, wire the property second.
- Flipping Stripe live-mode without the Chapter 6 readiness checklist
  green. Live-mode with an unverified business account will queue the
  payout, not deliver it.
- Setting the weekly SVI refresh to Monday 09:00 (everyone does). Pick a
  day/time when you actually have thirty minutes to read the delta —
  otherwise it becomes an unread email.

## On BlockID.au's showcase workspace

BlockID.au's own weekly SVI cron fires Sunday 03:15 UTC (13:15 AEST).
Look at `/showcase/blockid` — the growth strip shows the three-week
trailing SVI slope, and the `/guide/reports` Phase 7 bucket carries the
last four growth-playbook revisions. Notice the playbook was rewritten
at week five when the accelerator channel out-performed content by 3x.

## Next step

Block a 90-minute Chapter 7 session: wire GA4, flip Stripe live, set the
SVI cron day. Then commit to reading the first three weekly deltas out
loud with a co-founder — the first three are where the pattern shows.
