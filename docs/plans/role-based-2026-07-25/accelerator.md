# Role Design — Accelerator Program Manager

_Owner surface family: `/workspace/accelerator/*`, `/dashboard/accelerator*`, `/reseller/*` (they are a Reseller too), `/reseller/mentor/*` (they hold mentor access to cohort founders)._

## 1. Persona

An Accelerator Program Manager runs a fixed-duration cohort of 10–30 early-stage startups (Antler / Startmate / YC-style batches or corporate/regional programs). Their days are spent triaging applicants, keeping founders unblocked, and writing LP-ready quarterly reports that justify the fund. They are motivated by cohort-level outcomes — graduation rate, average follow-on funding raised, median SVI lift from Day 0 to Demo Day — and by making their program look credible next to peer programs. Success is measured by LP retention, next-cohort application volume, and portfolio markups.

## 2. Top 5 goals

1. Onboard the full cohort in <7 days with one intake link that opens branded startup profiles.
2. See a real-time collective SVI trend + funnel across the cohort, filterable by batch.
3. Produce a quarterly LP report (PDF, branded) in <10 minutes.
4. Give every founder a mentor and read/comment on that mentor's notes without breaking privacy.
5. Benchmark cohort vs. Australian industry baseline (SVI band, capital raised, graduation).

## 3. First 7 days

| Day | Goal | Actions |
|---|---|---|
| 1 | Get the workspace configured | (a) Confirm role = Accelerator in `/onboarding`; (b) upload program logo + colours at `/workspace/branding`; (c) name the active cohort. |
| 2 | Set up the intake channel | (a) Generate reseller code at `/reseller/codes`; (b) copy intake URL + QR; (c) invite co-manager teammates from `/workspace/team`. |
| 3 | Import existing cohort | (a) Bulk-add founders at `/workspace/accelerator/cohort/add`; (b) tag each with batch + stage; (c) trigger initial SVI auto-fill per startup. |
| 4 | Assign mentors | (a) Invite mentors via `/dashboard/mentor-invite`; (b) map mentors ↔ founders; (c) let founders approve access grants. |
| 5 | Set program criteria + goals | (a) Configure evaluation rubric at `/dashboard/accelerator-criteria`; (b) set target SVI lift; (c) set graduation milestone list. |
| 6 | Preview the LP report | (a) Open `/workspace/accelerator/quarterly-report`; (b) generate draft PDF; (c) share preview link with a friendly LP. |
| 7 | Publish public cohort page | (a) Toggle a public showcase URL; (b) enable weekly digest emails to LPs; (c) schedule a 90-day review checkpoint. |

## 4. Daily workflow

- Open `/workspace/accelerator` — glance cohort SVI avg, WoW trend, funnel counts.
- Triage `Applicant pipeline` — move Submitted → Reviewing → Accepted with a note.
- Drill into a slipping founder card at `/workspace/accelerator/cohort` → open their startup profile in a scoped read-only view.
- Read mentor notes at `/reseller/mentor/cohort` and flag founders needing a partner intro.
- Check `/dashboard/exit-readiness` tile for founders approaching Demo Day threshold.
- Grant top-up credits at `/reseller/credits` when a founder runs out mid-program.
- End of day: skim `/workspace/weekly-digest` draft and clear notifications.

## 5. Menu groups (this role sees ONLY these)

| Group | Item | Href | Feature |
|---|---|---|---|
| Cohort | Overview | `/workspace/accelerator` | `accelerator.cohort` |
| Cohort | Founders | `/workspace/accelerator/cohort` | `accelerator.cohort` |
| Cohort | Applicants | `/dashboard/accelerator` | `accelerator.cohort` |
| Cohort | Evaluation criteria | `/dashboard/accelerator-criteria` | `accelerator.cohort` |
| Reporting | Quarterly LP report | `/workspace/accelerator/quarterly-report` | `lp_report` |
| Reporting | Cohort benchmarks | `/workspace/reports` | `lp_report` |
| Reporting | Weekly digest | `/workspace/weekly-digest` | `lp_report` |
| Program ops | Reseller console | `/reseller` | `reseller.console` |
| Program ops | Intake codes | `/reseller/codes` | `reseller.console` |
| Program ops | Credit grants | `/reseller/credits` | `reseller.grant_credits` |
| Program ops | Mentor pool | `/reseller/mentor/cohort` | `reseller.console` |
| Account | Branding | `/workspace/branding` | `pdf_branding` |
| Account | Team | `/workspace/team` | `reseller.console` |
| Account | Settings | `/reseller/settings` | `reseller.console` |

Everything else in the founder / investor / advisor navigation is hidden.

## 6. Feature map

| Feature | Surface | Status | Notes |
|---|---|---|---|
| Cohort dashboard | `/workspace/accelerator/page.tsx` | exists | Batch SVI avg, WoW trend, funnel, KPIs |
| Founders grid + filters | `/workspace/accelerator/cohort/page.tsx` | exists | Batch filter, SVI badge, weeks-in |
| Bulk-add founders | `/workspace/accelerator/cohort/add` | partial | Needs CSV/paste import mode |
| Applicant funnel + tracker | `/workspace/accelerator/page.tsx` + `/dashboard/accelerator` | partial | Read-only table; needs move/approve actions |
| Evaluation rubric | `/dashboard/accelerator-criteria/page.tsx` | exists | Editable criteria browser |
| Quarterly LP report | `/workspace/accelerator/quarterly-report/page.tsx` | exists | Export → `/api/reports/quarterly` |
| LP report composer | `/workspace/lp-report/page.tsx` | exists | Reusable narrative composer |
| PDF branding | `/workspace/branding` + `api/branding` | exists | Gated on `pdf_branding` |
| Intake code (reseller) | `/reseller/codes/page.tsx` | exists | Same reseller code powers cohort intake |
| Startup provisioning | `/reseller/create-startup/page.tsx` | exists | Onboards a founder+startup atomically |
| Credit grants | `/reseller/credits/page.tsx` + `api/reseller/credits/grant` | exists | Feature-gated |
| Mentor console | `/reseller/mentor/{page,cohort,[founderId]}` | exists | Notes, check-ins, access-request flow |
| Mentor invite | `/dashboard/mentor-invite` | exists | Invite mentors into the mentor pool |
| Cohort collective SVI trend | — | missing | Only WoW delta shown; no historical line/area chart |
| Cohort vs. industry benchmark | `/workspace/reports` | missing | Reports directory exists but no benchmark visual per cohort |
| Public showcase page | — | missing | No public cohort page (`/programs/[slug]`) |
| Demo Day scheduler | — | missing | No time-boxed event / recording surface |
| Weekly digest (accelerator variant) | `/workspace/weekly-digest` | partial | Founder digest exists; needs cohort-manager digest |
| Applicant intake form (branded) | — | missing | Intake happens via reseller code + generic onboarding; no per-program branded form |
| Exit-readiness cohort tile | `/dashboard/exit-readiness` | partial | Founder tile exists (`P12b-tile`); no cohort roll-up |
| Team seat management | `/workspace/team` | exists | Co-managers per cohort |
| Settings / payment method | `/reseller/settings/page.tsx` | exists | Reseller billing — the accelerator IS the reseller |

## 7. Missing features (concrete)

1. **Cohort collective-SVI line chart** — daily / weekly average SVI for the whole cohort with per-founder overlay, replacing the single WoW number on `/workspace/accelerator`.
2. **Cohort-vs-industry benchmark card** — compare cohort avg SVI, capital raised, graduation rate against Australian sector baselines pulled from analytics.
3. **Branded applicant intake form** — per-program short-URL (e.g. `blockid.au/apply/antler-2026`) with the program's logo, custom questions, and auto-scoring.
4. **Applicant kanban actions** — move Submitted → Reviewing → Accepted with a note, and auto-provision an accepted applicant into the cohort.
5. **Public cohort showcase page** — `/programs/[slug]` renders logo, batch, alumni, aggregate metrics — an LP/press-facing snapshot.
6. **Demo Day mode** — a scheduled event surface with pitch order, recording links, LP RSVPs, and a shared scoresheet.
7. **Cohort exit-readiness roll-up tile** — extend the founder `exit-readiness` tile to a cohort roll-up on the accelerator dashboard.
8. **Mentor coverage heatmap** — matrix of founders × mentors showing check-in cadence gaps.
9. **LP distribution list + one-click share** — save LP emails, send the quarterly PDF from BlockID, log opens.

## 8. Onboarding tour (first-run, this role)

| # | id | title | body | anchor | cta_href |
|---|---|---|---|---|---|
| 1 | cohort-overview | This is your cohort at a glance | Batch SVI average, week-over-week trend and applicant funnel — the first three numbers your LPs will ask about. | `header h1` on `/workspace/accelerator` | `/workspace/accelerator` |
| 2 | add-founders | Add your first founders | Paste your accepted list or share your intake code. Every founder gets a scoped startup profile. | `a[href="/workspace/accelerator/cohort/add"]` | `/workspace/accelerator/cohort/add` |
| 3 | intake-code | One intake link for the whole batch | Founders self-onboard through your code. Credits are pre-loaded from your reseller wallet. | `a[href="/reseller/codes"]` | `/reseller/codes` |
| 4 | mentor-pool | Assign mentors to founders | Invite mentors, map them to founders, and read every check-in from one place. | `a[href="/reseller/mentor/cohort"]` | `/reseller/mentor/cohort` |
| 5 | criteria | Publish your evaluation rubric | The same rubric drives applicant scoring and graduation milestones. | `header h1` on `/dashboard/accelerator-criteria` | `/dashboard/accelerator-criteria` |
| 6 | quarterly | Ship a report to your LPs | One click — a PDF of cohort size, average SVI, capital raised and top performers, branded with your program. | `a[href="/workspace/accelerator/quarterly-report"]` | `/workspace/accelerator/quarterly-report` |

## 9. Guiding copy

- **Landing hero**: _"Run your cohort, unblock every founder, and ship LP-ready reports without spreadsheets."_
- **Empty state**: _"No founders in the cohort yet. Share your intake code, paste an accepted list, or add founders one by one — SVI backfills automatically."_
- **Next-step recommender**: _"Next: {X} founders still missing a mentor — assign now."_ (falls back to "Next: preview this quarter's LP report" once coverage is full).
