# Role Design — Mentor (program-attached)

Date: 2026-07-25
Scope: Full role experience design for the Mentor persona (reseller- or program-attached).

## 1. Persona

Program mentors are experienced operators, ex-founders, or domain experts who
mentor founders as part of an accelerator, incubator, community program, or
reseller relationship — not as a paid 1:1 advisory engagement. They log in for
short weekly sessions, want to see which founders are stuck, leave a note or a
next-step, and roll up cohort progress for their program lead. Success is
measured by **founder engagement heat** (are mentees active?), **check-in
cadence adherence** (weekly Monday touchpoint), and **SVI phase progression
across the cohort** — not by billing, credits, or GMV.

## 2. Top Goals

1. See at a glance which of my mentees are cold, stalled, or overdue for a
   check-in — with a one-click "next step" recommendation.
2. Log a weekly check-in (wins / blockers / focus) per founder in under 60s.
3. Read the founder's latest SVI report + evidence trail (when consent tier
   allows) to prepare for a session.
4. Leave a private note (tier 2) or a founder-visible note (tier 3) tied to a
   specific check-in or report.
5. Roll up cohort progress (phase distribution, engagement heat map, week-over-
   week SVI delta) for the program lead / accelerator partner.

## 3. First 7 Days

| Day | Goal                        | Actions                                                                                                                         |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Land in the mentor console  | Sign in via reseller/program invite; open /reseller/mentor; complete the 4-step MentorEmptyState onboarding checklist.          |
| 2   | Meet the roster             | Sort by heat=cold; open the top 3 founders' Overview tabs; read the auto-recommended next step from `recommendForFounder()`.    |
| 3   | Request higher consent      | For 2-3 priority mentees, request `reports_shared` tier via /api/mentor/access-request; email is sent to the founder.           |
| 4   | Set a check-in cadence      | Bookmark /reseller/mentor?filter=overdue; block a recurring Monday slot; submit first check-in (wins/blockers/focus jsonb).      |
| 5   | Add first notes             | Add a private note on 3 founders; if grant tier hits `full_mentor`, toggle one note `shared_with_founder=true`.                 |
| 6   | Set a goal per mentee       | Open Goals tab; add one 30-day target with `target_date`; verify it renders on the founder's dashboard as read-only.            |
| 7   | Cohort roll-up review       | Open /reseller/mentor/cohort; screenshot the phase distribution; send weekly digest to program lead.                            |

## 4. Daily Workflow

- Open `/reseller/mentor` — glance at heat column, filter by `overdue`.
- Scan `mentor_engagement_snapshots` deltas: any founder with `svi_delta_7d < 0`
  or `heat=cold` gets triaged first.
- Open a founder's Overview tab → read `suggestedNextStep` → open SVI & Reports.
- Draft a note in the Notes tab (private by default; share only if tier 3).
- On Mondays: submit weekly check-in (wins/blockers/focus) per active mentee.
- Update Goals tab if a target date is met or slipped.
- End of week: open `/reseller/mentor/cohort`, copy the phase distribution + heat
  map into the program-lead digest.
- Never touch `/reseller/customers` (billing view), `/reseller/credits`, or
  `/reseller/codes` — those are for reseller admins, not mentors.

## 5. Menu Groups (the ONLY groups Mentor sees)

Mentor is a scoped lens on top of the reseller console — the reseller sidebar
should be replaced by this 3-group menu when `role=mentor`. Everything else
(customers, credits, codes, create-startup, settings) is HIDDEN.

### Group 1 — Mentoring

- Roster → `/reseller/mentor` (feature: `reseller.console`)
- Overdue check-ins → `/reseller/mentor?filter=overdue` (feature: `reseller.console`)
- Cohort roll-up → `/reseller/mentor/cohort` (feature: `reseller.console`)

### Group 2 — This Week

- Weekly check-ins queue → `/reseller/mentor?filter=overdue&tab=checkins` (feature: `reseller.console`)
- Access requests (pending) → `/reseller/requests` (feature: `reseller.console`)

### Group 3 — Reference

- Consent tiers explained → `/reseller/mentor#tiers` (feature: `reseller.console`)
- Mentor playbook → `/docs/mentor` (feature: `reseller.console`)

## 6. Feature Map

| Feature                            | Surface                                                                                            | Status  | Notes                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| Roster with engagement heat        | `web/src/app/reseller/mentor/page.tsx`                                                             | exists  | Just built; filter chips for phase/heat/consent/cohort still stubbed.            |
| Founder Overview tab               | `web/src/app/reseller/mentor/[founderId]/overview/page.tsx`                                        | exists  | Reads consent + phase + heat + sparkline.                                        |
| SVI & Reports tab                  | `web/src/app/reseller/mentor/[founderId]/reports/page.tsx`                                         | exists  | Per-report toggle gated by `canViewReport()`; needs founder toggle UI on their side. |
| Notes tab                          | `web/src/app/reseller/mentor/[founderId]/notes/page.tsx` + `api/mentor/notes/route.ts`             | exists  | Private/shared toggle bound to tier 2 vs 3.                                      |
| Check-ins tab                      | `web/src/app/reseller/mentor/[founderId]/checkins/page.tsx` + `api/mentor/check-ins/route.ts`      | exists  | ISO-Monday week bucket; unique per (mentor, founder, week).                      |
| Goals tab                          | `web/src/app/reseller/mentor/[founderId]/goals/page.tsx`                                           | partial | Read-only render; write form + POST `/api/reseller/mentor/[id]/goals` deferred.  |
| Cohort roll-up (list)              | `web/src/app/reseller/mentor/cohort/page.tsx`                                                      | partial | List renders; founders x weeks heat-map + phase distribution still stubbed.      |
| Access-tier request                | `api/mentor/access-request/route.ts` + `access-request-banner.tsx`                                 | exists  | Banner appears when tier < required for a section.                               |
| Founder-side approve / revoke      | `api/mentor/access-grant/[grantId]/route.ts`                                                       | exists  | Not gated by `reseller.console` — actor is the founder.                          |
| Engagement snapshot cron           | `mentor_engagement_snapshots` table                                                                | partial | Table + upsert exist; nightly cron writer not confirmed in `crontab.json`.       |
| Weekly digest email                | `web/src/lib/mentor/weekly-digest.ts`                                                              | partial | Digest builder exists (tested); mailer wiring TBD.                               |
| Mentor tour                        | `feature-tours.ts` — no `mentor` slug yet                                                          | missing | Registry lacks `mentor` slug; anchors on `.mentor-*` selectors not added.        |
| Consent-expiry warning cron        | `EXPIRY_WARN_DAYS = [30, 7]` in `access-tiers.ts`                                                  | missing | Constants set; cron job that fires reminders + writes `reminder_*_sent_at` TBD.  |
| Onboarding wizard mentor path      | `onboarding-wizard.tsx`                                                                            | missing | `step-segment.tsx` offers only 5 personas — mentors must be provisioned by reseller. |
| Role-menu overlay `mentor` key     | `web/src/lib/nav/role-menu-overlay.ts`                                                             | missing | 12 keys present; no `mentor`. Currently a mentor inherits the reseller sidebar.  |
| Cohort founders x weeks heat-map   | `mentor_weekly_heat` materialized view                                                             | missing | Design doc mentions it; view + SQL + renderer all TBD.                           |
| Mentor playbook doc                | `/docs/mentor` route or `public/docs/mentor.pdf`                                                   | missing | Referenced from menu group 3; content not yet written.                           |

## 7. Missing Features (concrete)

1. Goals-tab write UI + `POST /api/reseller/mentor/[founderId]/goals` handler with Zod schema + tier-2 gate.
2. Cohort founders x weeks engagement heat-map, backed by a nightly `mentor_weekly_heat` materialized view.
3. `mentor` tour slug in `feature-tours.ts` with anchors on `.mentor-roster-heat`, `.mentor-tabs`, `.mentor-checkins-form`, `.mentor-consent-badge`.
4. `mentor` key in `role-menu-overlay.ts` that hides `/reseller/customers`, `/reseller/credits`, `/reseller/codes`, `/reseller/create-startup`, `/reseller/settings` and injects the 3 mentor groups above.
5. Consent-expiry reminder cron that fires 30d / 7d warning emails and stamps `reminder_30d_sent_at` / `reminder_7d_sent_at`.
6. Founder-side `/dashboard/settings/mentor-access` page rendering `loadAllGrantsForFounder()` with revoke button + per-report toggle grid.
7. Weekly digest email dispatcher (`weekly-digest.ts` builder exists; SES/Postmark send + `cron-health.jsonl` entry missing).
8. Nightly writer for `mentor_engagement_snapshots` (table + unique index exist; cron job not registered).
9. Mentor playbook markdown at `web/src/app/docs/mentor/page.tsx` covering the 3-tier consent model + weekly cadence + escalation to advisor.
10. Onboarding wizard `mentor` segment path (or explicit "invited by program" flow) so mentors don't land on the founder wizard.

## 8. Onboarding Tour Steps (first-run for Mentor)

1. `mentor-tour-welcome` — Welcome to the Mentor console. This is an engagement view — never a billing view. (anchor `body`, cta `/reseller/mentor`)
2. `mentor-tour-roster` — Each row is one attributed founder. Heat = last-30-day activity. Click a name to open their console. (anchor `[data-tour="mentor-roster"]`, cta `/reseller/mentor?filter=overdue`)
3. `mentor-tour-consent` — Consent tiers gate what you see. Request `reports_shared` to unlock SVI numbers; `full_mentor` to leave founder-visible notes. (anchor `[data-tour="mentor-consent-badge"]`, cta `/reseller/mentor#tiers`)
4. `mentor-tour-checkin` — Log a weekly check-in in under 60 seconds. Monday-ISO week bucket, one per founder. (anchor `[data-tour="mentor-checkin-form"]`, cta `/reseller/mentor`)
5. `mentor-tour-cohort` — Cohort roll-up gives your program lead a phase-distribution + heat-map snapshot. (anchor `[data-tour="mentor-cohort-link"]`, cta `/reseller/mentor/cohort`)
6. `mentor-tour-boundaries` — Mentor is program-attached (light-touch). For paid 1:1 advisory, use the Advisor role instead. (anchor `body`, cta `/docs/mentor`)

## 9. Guiding Copy

- **Landing hero:** "Your mentees, ranked by who needs you this week — with the next step already suggested."
- **Empty state:** "No mentees attributed yet. Ask your program lead to attribute founders to your reseller code, or invite one directly. You will see roster, heat, and next-step recommendations here as soon as attribution is confirmed."
- **Next-step recommender pattern:** "{FounderName} is in {phase} and has been {heat} for {days} days — {suggestedNextStep}."

## 10. Boundaries vs Advisor

| Aspect             | Mentor (this role)                               | Advisor                                       |
| ------------------ | ------------------------------------------------ | --------------------------------------------- |
| Relationship       | Program-attached (reseller / accelerator / community) | Formal 1:1 engagement                    |
| Billing            | Never — belongs to reseller admin                | Advisor's own workspace / retainer            |
| Data access        | Consent-tiered: 0→3 via `mentor_access_grants`   | Full advisor-notes + client roster            |
| Write surface      | Notes (private/shared) + check-ins + goals       | Advisor notes + client tasks                  |
| Cadence            | Weekly Monday check-in                           | On-demand / retainer meeting                  |
| Surface            | `/reseller/mentor/*`                             | `/dashboard/advisor` + `/workspace/advisor/*` |

Do not overlap: a user with both roles should see BOTH menu groups (advisor
group + mentor group), never a merged one.
