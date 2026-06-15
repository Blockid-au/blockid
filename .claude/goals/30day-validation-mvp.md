# 30-Day Validation MVP — BlockID.au

**Source:** `blockid_clevel_agent_prompts_30day.md` (CEO operating system, merged 2026-06-15)
**Layer above:** [[unicorn-masterplan]] (A$1B by 2030 via 8 spirals)
**Layer below:** project-state.json `plan.tasks` (the orchestrator's working queue)

## North Star (this layer)

> **Paying Customers + Verified Company Profiles + Monthly Recurring Revenue**

The Unicorn masterplan is the destination. The 30-day plan is *Spiral 0* — prove someone will pay before scaling anything. Until the 30-day scoreboard is green, every agent prioritises tasks that move it.

## 30-Day Targets (CEO Scoreboard)

| Metric | Target |
|---|---:|
| Paying customers | 10 |
| Revenue (AUD) | $1,000 – $3,000 |
| MRR (AUD) | $1,000 |
| Company profiles collected | 100 |
| Completed SVI / health assessments | 50 |
| Founder / SME interviews | 30 |
| Email subscribers | 100 |
| LinkedIn / community leads | 100 |
| Validated pricing model | 1 |
| Repeatable sales process | 1 |

These metrics flow into `/dashboard/30day` (T0200) and the daily CEO summary email.

## CEO Filter — accept work only if it supports

1. Getting paying customers
2. Learning willingness to pay
3. Collecting company valuation data
4. Improving free → paid conversion
5. Delivering customer value
6. Reducing operational friction

If a queued task fails this filter, the CEO loop downgrades it (status `pending` → moved out of the active set) at the next plan stage.

## Offers under test

| Offer | Price (AUD) | Owner |
|---|---:|---|
| Free Startup Value Score | $0 | CRO |
| AI Valuation Report | $99 | CFO |
| Business Health Check | $299–$499 | CPO |
| Investor Readiness Review | $999 | CRO |

## C-Level mission cards (30-day scope)

- **CPO** — ship usable MVP that collects data + generates a useful paid report; 4 funnel iterations.
- **CRO** — 50 outreach / week, close 10 paid customers, discover best-paying segment.
- **CDO** — 100 structured profiles, SVI v1 scoring model, 5 benchmark categories.
- **CMO** — 100 email subs, 100 LinkedIn leads, 12 posts, 4 newsletters, 1 lead magnet.
- **CCSO** *(rolled into CRO daily here)* — 10 feedback calls, 3 testimonials, 5 referrals, NPS > 50.
- **CSO** *(strategy cell within CEO)* — 10 competitor analyses, 5 pricing tests, identify wedge.
- **CTO** — 5 MVP flows shipped, 0 critical bugs, 3 deploys/week, Stripe + admin dashboard live.
- **CFO** — track revenue/expense/CAC/AOV/margin weekly; surface break-even path.
- **COO** — all C-Level routines run daily; milestone reports emit after every release.

Detailed daily/weekly prompt skeletons live in `blockid_clevel_agent_prompts_30day.md`.

## Wired into the existing CEO loop

The orchestrator (`/api/cron/agent-orchestrator`) already runs research → plan → code → deploy → update_artifacts → milestone. This goal doc adds:

1. **New seeded P0 tasks** in `project-state.json` (T0200–T0205) — milestone reporter, 30-day scoreboard, CRO pipeline, CCSO NPS, CMO pillar tracker, CFO founder finance.
2. **Milestone report** — `/api/cron/milestone-report` fires after every `update_artifacts` that creates a new milestone, producing a per-C-Level breakdown at `content/reports/milestone-<id>-<version>.md` + Telegram + email.
3. **CEO daily summary** continues to email at 10:00 AEST, now scoring against the table above.

## Stop conditions

The 30-day layer retires when, in the same week:
- ≥10 paying customers
- ≥AUD $1,000 MRR
- ≥100 company profiles
- ≥1 testimonial + ≥1 referral converted

…then the CEO loop graduates to *Spiral 1* targets (next layer up toward Unicorn).
