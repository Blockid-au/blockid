# Mentor Console — Information Architecture & User Journey

**Author:** CPO agent
**Date:** 2026-07-24
**Status:** Draft v1 (design-only; no code changes yet)
**Related recon:** reseller_attributions (mig 0091), app_users.attribution_reseller_id / projects.attribution_reseller_id (mig 0092), advisor_clients (mig 0058), accelerator_cohorts, assembled_reports (mig 0047), svi_snapshots/svi_analyses (0007/0008/0090).

---

## 1. Why a Mentor Console (not just re-using /reseller/customers)

`/reseller/customers` today answers the reseller's **commercial** questions: who did I refer, are they on a paid plan, how many credits did I earn, when was the last invoice. Its per-founder drawer (`customer-drawer.tsx`) surfaces Overview / Progression / Reports but is modal, one-founder-at-a-time, and framed around attribution.

Resellers who act as **mentors** (accelerator leads, angel-club coaches, ecosystem partners) need a different job-to-be-done:

> "For each founder I'm mentoring, tell me where they are, what changed since I last checked, what I should do next, and let me record the conversation."

That is an **engagement** view, not an attribution view. It should:

- default to a longitudinal, cross-founder roster (SVI phase, engagement heat, days-since-check-in), not a billing table;
- live inside the reseller portal shell so nav / theme / auth reuse works;
- reuse the existing `reseller_attributions` graph (no new join table) plus a small `mentor_*` extension for notes, check-ins, goals, consent grants;
- deep-link into `/reseller/customers` for the commercial side and into founder reports (read-only, consent-gated) for the substantive side, without ever handing the mentor an "admin" or service-role view.

---

## 2. Information Architecture

```
/reseller
  /customers             (existing — billing/attribution)
  /mentor                (NEW landing = roster)
    /cohort              (NEW optional — cohort roll-up for accelerator resellers)
    /[founderId]         (NEW founder console shell w/ 5 tabs)
      /overview          (default tab)
      /reports           (SVI snapshots + assembled reports, consent-gated)
      /notes             (private mentor notes, versioned)
      /checkins          (scheduled + past 1:1s w/ agenda template)
      /goals             (mentor-set goals + founder self-reported status)
```

### 2.1 Roster page `/reseller/mentor`

Purpose: "Who needs me this week?"

Columns (desktop table; mobile stacked cards):

| Column | Source |
|---|---|
| Founder + startup | `app_users.full_name` + `projects.name` (first project attributed to reseller) |
| SVI phase | latest `svi_snapshots.phase` |
| SVI score Δ (30d) | delta of latest vs 30-day prior snapshot |
| Engagement heat | derived: (# reports last 30d × 2) + (# check-ins last 30d × 3) + (# notes last 30d) — bucketed Cold / Warm / Hot |
| Days since last check-in | `mentor_checkins.completed_at` desc |
| Consent tier | `mentor_consent.tier` (see §5) — chip: Basic / Reports / Full |
| Next step | derived from `journey-stages.ts` given phase + heat |
| Row action | "Open console" → `/reseller/mentor/[founderId]` |

Filter chips (sticky top bar):
- Phase: Idea · Validate · Build · Launch · Scale · Exit
- Heat: Cold · Warm · Hot
- Overdue check-in (> 14d)
- Consent: Full only / Any
- Cohort (only shown if reseller has ≥1 cohort)

Empty state: **`mentor-empty-state.tsx`** — friendly onboarding checklist rendered by `mentor-onboarding-checklist.tsx`:
1. Invite your first mentee (link to `/reseller/create-startup` in mentee mode)
2. Ask for consent tier (link opens consent template)
3. Schedule first check-in (opens `/reseller/mentor/[id]/checkins` with template)
4. (Optional) Create a cohort (link to `/reseller/mentor/cohort`)

Perf budget: 300ms server-render for 100 mentees. Achieved by a single materialised query joining `reseller_attributions ← app_users/projects ← latest svi_snapshot ← last-30d mentor activity aggregates`. All mentor_* tables get an index on `(reseller_id, subject_user_id, created_at desc)`.

### 2.2 Founder console `/reseller/mentor/[founderId]`

Shell = `mentor-header.tsx` + `mentor-tabs.tsx` + `{children}`.

**mentor-header.tsx** shows: avatar, name, startup, phase pill, SVI trend sparkline (last 6 snapshots), consent-tier chip w/ "Request higher tier" button, next-step banner ("You said you'd review the pitch deck — 3 days ago"), quick actions: **Log check-in** / **Add note** / **Set goal** / **Open in Customers** (deep-link to attribution view).

**mentor-tabs.tsx** — 5 tabs, rendered as segmented control:

1. **Overview** — phase-aware dashboard: "where they are now, what changed, what to do next" cards. Uses `journey-stages.ts` mapping. Also renders a compact timeline (last 10 events across notes/check-ins/reports).
2. **SVI & Reports** — chronological list of `svi_snapshots` + `assembled_reports` links. If consent-tier < Reports, shows locked cards with "Request access" CTA that emails founder and writes to `reseller_audit_log` with action `mentor.consent_request`.
3. **Notes** — private markdown notes (mentor-only visibility; NOT shared with founder). Versioned, tagged.
4. **Check-ins** — upcoming + past. Each has agenda template pre-filled from phase (`journey-stages.ts` → suggested talking points). Post-check-in prompt writes a follow-up "next step" that surfaces in the header banner.
5. **Goals** — mentor sets a goal ("Get to 5 design-partner LOIs by Sep 30"); founder can self-report progress via a founder-side widget (out of scope for this doc — dependency called out in §7).

Every tab-load and every "reveal" action writes `reseller_audit_log(reseller_id, subject_user_id, action, meta)` — action names: `mentor.tab.overview`, `mentor.tab.reports`, `mentor.report.open`, `mentor.note.create`, `mentor.checkin.log`, `mentor.goal.set`, `mentor.consent_request`.

### 2.3 Cohort roll-up `/reseller/mentor/cohort`

Visible only if the reseller owns at least one `accelerator_cohorts` row. Groups mentees by cohort, shows a **cohort heat map**: rows = founders, cols = weeks, cell = engagement heat colour. Click a cell → jump to that check-in on the founder console. Click a row → open the founder console.

---

## 3. User Journey (mentor's week)

```
Mon 9am  → /reseller/mentor  (roster, "Overdue check-in" chip on)
          → sees 3 red rows
Mon 9:05 → click first row → /reseller/mentor/[a]
          → header banner: "You said: 'review pricing page' 8 days ago"
          → click "Log check-in" → agenda pre-filled (phase=Validate → suggests problem-solution fit qs)
          → after call, mentor types 2-line follow-up + new next-step "intro to 2 pilot customers"
          → save → returns to roster; row a moves to green
Wed 3pm  → roster filter "Hot" → see 2 mentees on a tear
          → open Reports tab on one → consent tier=Reports → opens latest assembled_report inline
          → adds private note "capital efficiency looks strong — nudge toward pre-seed"
Fri 4pm  → /reseller/mentor/cohort  (accelerator reseller)
          → heat map shows one dark row → click through → set a goal "book 5 discovery calls by Fri"
```

Key IA principle: **the mentor never leaves the mentor namespace**. Deep-links out (to `/reseller/customers/[id]` or the founder's assembled report) always open with a "← Back to mentor console" affordance and never dump the mentor into an admin surface.

---

## 4. Data model additions (for downstream CTO agent)

Not this doc's scope to write migrations, but the IA assumes these tables (all keyed by `(reseller_id, subject_user_id)` — reuses attribution graph):

- `mentor_consent(reseller_id, subject_user_id, tier ENUM('basic','reports','full'), granted_at, expires_at, granted_by)`
- `mentor_notes(id, reseller_id, subject_user_id, body_md, tags text[], created_at, updated_at)`
- `mentor_checkins(id, reseller_id, subject_user_id, scheduled_at, completed_at, agenda_md, followup_next_step text)`
- `mentor_goals(id, reseller_id, subject_user_id, title, target_date, status, created_at)`

All get RLS: reseller sees only rows where `reseller_id = auth.uid()`'s reseller_id via the existing `resellerSupabase(scope)` wrapper.

---

## 5. Consent tiers (CROSS-CUTTING RULE compliance)

| Tier | What mentor sees | Founder's opt-in step |
|---|---|---|
| **Basic** (default on attribution) | Name, startup name, phase, engagement heat | none — implicit on attribution |
| **Reports** | + latest SVI snapshot summary, assembled reports read-only | founder clicks "Share reports with mentor" on their dashboard |
| **Full** | + notes visibility (founder can read mentor's notes), meeting recordings if any | founder toggles "Full transparency" |

Every reveal of a Reports/Full-only field writes to `reseller_audit_log`. Any attempt to load a locked tab returns the locked-card UI, never the raw data.

---

## 6. Navigation surface changes

### `web/src/components/workspace/nav-groups.ts`

Under `pillar:"role"`, next to the existing **Reseller** group, ADD a **Mentor** group:

```ts
{
  id: "mentor",
  pillar: "role",
  label: "Mentor",
  items: [
    { href: "/reseller/mentor",         label: "Roster",         icon: "Users" },
    { href: "/reseller/mentor?filter=overdue", label: "Check-in inbox", icon: "Inbox" },
    { href: "/reseller/mentor?tab=reports",    label: "Reports feed",   icon: "FileText" },
    { href: "/reseller/mentor/cohort",  label: "Cohort view",    icon: "LayoutGrid", showWhen: "hasCohort" },
  ],
}
```

### Reseller layout left-nav

Add a single **Mentor** entry between Customers and Reports, using `GraduationCap` from `lucide-react`.

---

## 7. Dependencies / out-of-scope

- Founder-side UI to grant consent tiers and view mentor goals — separate CPO ticket for founder dashboard.
- Data migrations for the four `mentor_*` tables — CTO ticket.
- Roster query materialisation (view or triggered summary) — DBA ticket; falls back to on-the-fly join for MVP.
- Meeting recording ingestion (Full tier) — future.

---

## 8. Acceptance criteria (design-level; engineering-level lives in ticket)

1. Roster loads in **< 300ms** server-render for a reseller with 100 attributed founders (tested via `reseller-monitor.jsonl` synthetic).
2. Every drill-down keeps the user in `/reseller/mentor/**`; there are **zero jumps** to `/admin/*`, `/team/*`, or service-role surfaces.
3. Every mentee card and every tab surfaces a **"next step"** — the mentor never sees a bare data view without a recommended action.
4. Every reveal of Reports- or Full-tier data writes to `reseller_audit_log` with a `mentor.*` action name.
5. `/reseller/customers` and `/reseller/mentor` cross-link both ways with a "Switch view" affordance.
6. Empty state teaches onboarding in ≤ 4 steps; no dead-end empty tables.
7. Cohort page only appears in nav when the reseller has at least one cohort — no ghost menu items.
8. All new components are theme-aware (light + dark) and reuse `@/components/ui/*` + `lucide-react` only — zero new npm deps.

---

## 9. Risks

- **Overlap with `/reseller/customers` drawer.** Mitigation: explicit copy — "This is the engagement view; for billing & attribution use Customers." Add a "Open in Customers" button on the mentor header, and a "Open in Mentor" button on the customer drawer.
- **Overlap with parallel advisor portal (`/dashboard/advisor` + `advisor_clients`).** Mitigation: mentor console is reseller-role only; advisor portal is advisor-role only; they never share nav. If a user has both roles, both entries appear. Long-term consolidation is a separate CPO decision — do NOT collapse here.
- **Consent creep.** Mentors may pressure founders for Full tier. Mitigation: consent UI on the founder side must explain trade-offs; audit log surfaces to the founder on their privacy page.
- **Performance at cohort scale.** A 200-founder cohort heat map with 12 weeks of cells is 2,400 aggregates. Mitigation: precompute weekly heat into a `mentor_weekly_heat` materialised view refreshed nightly; fall back to a "load more weeks" pattern.
- **Duplication with growth-phase navigation.** `nav-groups.ts` already has role-pillar entries for Advisor, Accelerator, Investor. Mentor becomes the 5th; keep icons and colour treatment consistent.
