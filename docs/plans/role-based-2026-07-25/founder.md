# Founder / Startup Member — Role Design

Owner: CPO
Date: 2026-07-25
Scope: `app_users.account_type = 'founder'` (default overlay). Applies to primary
founder + invited startup members with `project_members.role in (editor,admin)`.

---

## 1. Persona

An early-stage Australian founder (typically solo or a 2-3 person team, pre-seed
to Series A) who joined blockid.au to answer three questions: *where do I stand*,
*what am I worth*, and *what should I do next*. They live between building the
product and raising capital, are time-poor, and measure success in weekly SVI
delta, dataroom completeness, and getting the next investor meeting. They will
abandon the tool the moment it feels like busywork — every screen has to either
push their SVI up, unlock a piece of the raise, or teach them something a
mentor would charge for.

## 2. Top Goals

1. Get a defensible SVI score they can quote to investors and improve weekly.
2. Build a Day-0 data room with the 10 seeded templates and grow it through
   the 12 growth phases without hiring a corporate lawyer.
3. Set up a clean cap table + ESOP + vesting so a lead investor can DD in an
   afternoon.
4. Land an intro to a matched investor / accelerator via the platform, then
   track the raise from term sheet to close.
5. Reach exit-readiness (or Series B parity) with dividends, revenue tracking,
   and blockchain-synced equity — without switching tools.

## 3. First 7 Days (onboarding journey)

| Day | Goal | Actions |
|-----|------|---------|
| 1 | Get a real SVI score | Complete onboarding wizard (segment = founder); run first analysis at `/`; open `/dashboard/svi` |
| 2 | Understand the map | Take the `dashboard-nav` feature tour; open `/workspace/roadmap` to see 12 growth phases; pin current phase |
| 3 | Fill the 13 criteria | Open `/workspace/evaluation`; auto-fill missing fields; upload 2-3 evidence artefacts to `/workspace/evidence` |
| 4 | Prove the market | Run `/dashboard/market-size`; export TAM/SAM/SOM chart; attach to Data Room |
| 5 | Seed the data room | Initialize `/workspace/data-room` (10 Day-0 templates auto-seed); complete company one-pager + team bios |
| 6 | Lock the equity story | Run Equity Setup wizard `/workspace/equity-setup`; publish first cap table; issue founder vesting schedules |
| 7 | Ask for the meeting | Open `/dashboard/valuation`; generate investor pack `/workspace/investor-pack`; grant view-only Data Room access to first 3 investors from `/dashboard/investor-links` |

## 4. Daily Workflow (typical day)

- Land on `/dashboard` — check SVI delta since yesterday and the top-1
  next-step recommendation on the Home tile.
- Open the "Action Plan" (`/workspace/roadmap`) — 2-3 tasks queued by the
  current growth phase; tick the one that unblocks the raise.
- Update one metric in `/workspace/metrics` (MRR, active users, pipeline) so
  the weekly digest reflects reality.
- Drop new evidence (deck slide, investor email, contract) into
  `/workspace/evidence` or `/workspace/data-room`.
- Skim `/dashboard/fundraise` for readiness gaps flagged red; click through
  to fix (usually a missing dataroom doc or an unsigned SAFE).
- Check `/dashboard/investor-links` for outbound investor click activity;
  reply to any interest inbound.
- End-of-week: run the CFO advisor (`/dashboard/cfo`), export the
  weekly-digest PDF, send to advisors and lead investor.

## 5. Menu Groups (sidebar — founder only)

Four top-level groups. Everything else is hidden. Account utilities are
reachable via the top-bar avatar menu; nothing else appears in the sidebar.

### Home
- SVI Score — `/dashboard/svi`
- My Startups — `/workspace/projects`
- Action Plan — `/workspace/roadmap`
- New Analysis — `/`

### Build
- Market Size — `/dashboard/market-size`
- Evaluation (13) — `/workspace/evaluation`
- Cap Table — `/workspace/cap-table` (`share_management`)
- ESOP & Vesting — `/workspace/esop` (`share_management`)

### Fundraise
- Valuation — `/dashboard/valuation`
- Data Room — `/workspace/data-room` (`share_management`)
- Investor Pack — `/workspace/investor-pack`
- Fundraise Readiness — `/dashboard/fundraise`

### Scale & Exit
- Revenue — `/workspace/revenue`
- Dividends — `/workspace/dividends`
- Exit Readiness — `/dashboard/exit-readiness`
- Exit Modeling — `/workspace/exit`

HIDDEN for founder: Roles subgroup (investor/advisor/accelerator/reseller/
mentor), any admin panel, journalist read-only shell, LP report.

## 6. Feature Map

See structured output. Every founder-relevant capability maps to an existing
BlockID surface; gaps are enumerated in section 7.

## 7. Missing Features

1. **In-app investor CRM** — inbound-interest tracker with stages
   (contacted → meeting → term sheet → wired); today `/dashboard/investor-links`
   only tracks outbound clicks.
2. **SAFE / convertible note generator** — Australian-law templates with
   e-sign; today the founder exports a term sheet stub but has to leave the
   product to execute.
3. **Weekly investor update sender** — one-click composer that pulls SVI
   delta + metrics + asks and emails saved investor list; the digest exists
   but is founder-facing only.
4. **Milestone-triggered ESOP vesting acceleration** — no UI to model
   "double-trigger" acceleration on change-of-control despite vesting engine
   supporting it.
5. **Warm intro requests** — button to ask a matched accelerator/advisor for
   an intro to a portfolio investor; the deal-flow surface exists for
   investors but there is no reciprocal request path for founders.
6. **Board pack builder** — quarterly board-meeting export bundling SVI +
   P&L + cap table + roadmap; today founders assemble this manually.
7. **Runway alerts** — proactive Slack/email when cash × burn <90 days; the
   CFO advisor computes runway but only on demand.
8. **Grant & R&D-tax matcher** — Australian grants (AusIndustry, R&D Tax
   Incentive, EMDG) recommender tied to SVI/industry; nothing exists.

## 8. Onboarding Tour (first-run)

Six steps anchored to real DOM selectors on `/dashboard`. Reuses the
`dashboard-nav` feature-tour slug and extends with founder-specific stops.

See structured output for tour JSON.

## 9. Guiding Copy

- **Landing hero:** "Know where you stand. Prove what you're worth. Get the next round done — from one workspace."
- **Empty state (no startup yet):** "Start with one question: what are you building? Run a free analysis and we'll seed your SVI, roadmap and data room in 60 seconds."
- **Next-step recommender pattern:** `Your SVI is {score}. The single biggest lift right now is {action} — {impact_points} points. Open {surface} →`
