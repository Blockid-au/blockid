# Mentor Console — Notes, Cadence & Engagement (CS design)

Author: Customer Success agent
Date: 2026-07-24
Track: 03 of the mentor-console-2026-07-24 plan
Sibling tracks: 01-attribution, 02-scope, 04-ui-roster (see /docs/plans/mentor-console-2026-07-24/)

---

## 1. Goal

Give a mentor (reseller admin OR accelerator cohort lead) a low-friction weekly
loop with each mentee so we can measure engagement instead of guessing at it.

Three primitives:
1. **Notes** — private-by-default rolling journal per mentee.
2. **Weekly check-in** — 3-field structured form the mentor fills (or invites the
   mentee to fill) once a week.
3. **Engagement score** — a single 0..100 number surfaced on the roster row so
   the mentor can triage 30+ founders at a glance.

All three respect the tier-of-access model already established for the reseller
attribution surface (see track 02). Founder-identifying data (name, email, SVI
detail) is only unlocked once the mentee has explicitly opted in.

---

## 2. Data model deltas

No new tables required for MVP — everything piggybacks on existing surfaces:

| Concern | Storage | Notes |
|--|--|--|
| Notes | `mentor_notes` (new table, mig 0093) | `(id, mentor_user_id, subject_user_id, body_md, visibility, created_at, updated_at, edited_by)` — `visibility` enum `private_to_mentor | shared_with_founder`. RLS: mentor sees own rows; founder sees only `shared_with_founder` rows where `subject_user_id = auth.uid()`. |
| Check-ins | `mentor_check_ins` (new table, mig 0094) | `(id, mentor_user_id, subject_user_id, iso_week, wins_md, blockers_md, next_focus_md, mood int, submitted_by, submitted_at)` UNIQUE `(mentor_user_id, subject_user_id, iso_week)`. |
| Engagement score | derived, cached in `mentor_engagement_cache` (mig 0095) | `(mentor_user_id, subject_user_id, score int, tier, formula_json, computed_at)` refreshed nightly by cron; UI can recompute inline via the pure lib for the roster page. |
| Draft notes | `localStorage` key `bid.mentor.note-draft.<subject_user_id>` | Never leaves the browser until publish; offline safe. |

All three tables consult `reseller_attributions` via `mentorScope()` to confirm
the mentor→mentee link is live BEFORE any read/write.

Migrations live under `web/supabase/migrations/` and are out-of-scope for this
design doc (delivered in track 01).

---

## 3. Modules

### 3.1 `web/src/lib/mentor/notes.ts`

```ts
export type NoteVisibility = "private_to_mentor" | "shared_with_founder";
export interface MentorNote { id, mentor_user_id, subject_user_id,
  body_md: string, visibility: NoteVisibility, created_at, updated_at, edited_by }

export function draftKey(subjectUserId: string): string;      // localStorage key
export function validateBody(md: string): { ok: boolean; reason?: string }; // <= 4000 chars, non-empty after trim
export function summarize(body_md: string, max=140): string;  // first-line, strip md
export function diffAudit(prev: MentorNote, next: Partial<MentorNote>): AuditLine[];
```

Pure — no DB. Callers (route handler / server action) do the actual insert but
call these to validate + build the `reseller_audit_log` payload.

### 3.2 `web/src/lib/mentor/check-ins.ts`

```ts
export interface CheckIn { iso_week, wins_md, blockers_md, next_focus_md, mood 1..5 }
export function currentIsoWeek(now = new Date()): string;      // "2026-W30"
export function isFresh(checkIn: CheckIn | null, now = new Date()): boolean; // within 7d
export function completeness(c: CheckIn): number;              // 0..1 — how filled-out
export function nudgeRequired(last: CheckIn | null, mentor_prefs): boolean;
```

`completeness` weights: wins 0.35, blockers 0.35, next_focus 0.25, mood 0.05.

### 3.3 `web/src/lib/mentor/engagement-score.ts`

```ts
export interface EngagementInputs {
  lastCheckInAt: string | null;      // ISO
  menteeLastLoginAt: string | null;  // ISO — from app_users.last_signin_at
  sviDelta30d: number | null;        // signed points, e.g. +4.2 or -1.1
  reportShippedAt: string | null;    // ISO — most recent assembled_report.created_at
  now?: Date;
}
export interface EngagementScore {
  score: number;                      // 0..100
  tier: "hot" | "warm" | "cool" | "cold";
  components: { freshness, login, svi, reports }; // 0..100 each
  formula: string;                    // human-readable for tooltip
}
export function computeEngagement(x: EngagementInputs): EngagementScore;
```

Formula (documented for the tooltip):

```
freshness  = clamp(100 - daysSinceCheckIn * 10, 0, 100)     // 0d=100, 10d+=0
login      = clamp(100 - daysSinceLogin * 6,   0, 100)     // 0d=100, ~17d+=0
svi        = clamp(50 + sviDelta30d * 8,      0, 100)      // flat=50, +6pts=98
reports    = clamp(100 - daysSinceReport * 3, 0, 100)     // 0d=100, ~33d+=0
score      = round(0.35*freshness + 0.30*login + 0.25*svi + 0.10*reports)
tier       = score >= 75 hot | >= 50 warm | >= 25 cool | else cold
```

Rationale: check-in freshness dominates because it's the mentor's own act; login
next because it proves the mentee is engaging with the platform; SVI delta is a
smoothed proxy for progress; reports is a slow-moving nice-to-have.

### 3.4 `web/src/lib/mentor/weekly-digest.ts`

```ts
export interface DigestInputs { mentor_user_id, weekStart, mentees: MenteeSnapshot[] }
export interface DigestOutput {
  must_act: MenteeSnapshot[];   // capped at 3 — cold tier + blocker text present
  wins: MenteeSnapshot[];       // top 3 by positive SVI delta
  quiet: MenteeSnapshot[];      // no login >14d (up to 3)
  markdown: string;             // ready-for-email body
  subject: string;              // "Weekly mentor digest — 3 need you, 2 wins"
}
export function assembleWeeklyDigest(i: DigestInputs): DigestOutput;
```

Hooks into existing reseller weekly-digest cron
(`web/src/lib/cron/reseller-weekly-digest.ts` — see track 04 for the wire-up
detail). Digest respects the 3/week notification cap by piggybacking on the
already-scheduled Monday 08:00 AEST send — mentor console adds a section, does
not add a new send.

---

## 4. Scope helper — `mentorScope()`

Added to `web/src/lib/reseller/scope.ts` (do not create a parallel file — mentor
role is a hat worn by a reseller admin OR cohort lead; the scoping mechanism is
the same table).

```ts
export interface MentorScope {
  mentor_user_id: string;
  source: "reseller" | "cohort";
  /** subject_user_ids the mentor is presently linked to */
  menteeIds: () => Promise<string[]>;
  /**
   * Per-mentee consent tier — determines what mentor sees in UI.
   * "identified" = full name/email/SVI; "pseudonymous" = display-name only; "revoked" = drop from list.
   */
  consentTier: (subject_user_id: string) => Promise<"identified" | "pseudonymous" | "revoked">;
}
export async function mentorScope(user: AppUser): Promise<MentorScope>;
```

Implementation notes:
- Delegates to `scopedReseller(user)` when the caller has a reseller_admins row;
  falls back to `accelerator_cohort_leads` lookup for cohort mentors.
- `consentTier` reads `reseller_attributions.consent_tier` (new column added by
  track 01 mig 0091b) with default `pseudonymous`.
- Every consumer route re-checks scope on each request — no server-side session cache
  beyond the per-request memoization already inside `scopedReseller`.

---

## 5. UI components

All under `web/src/components/mentor/` — client components where noted, server
otherwise. No new npm deps: `@/components/ui/*`, `tailwindcss`, `lucide-react`.

### 5.1 `note-composer.tsx` (client)
- `<textarea>` + toolbar (bold/italic/list — plain-markdown, no rich editor).
- Autosaves to `localStorage` on every keystroke (debounced 400ms) using `draftKey()`.
- Visibility toggle chip: `private` (default) / `share with founder`.
- Submit posts to `/api/mentor/notes` server action; on 2xx clears the draft.
- Offline-safe: if `navigator.onLine === false`, disables submit and shows
  "will save when you're back online"; keeps draft.

### 5.2 `check-in-form.tsx` (client)
- Three `<textarea>`s (wins / blockers / next focus) + mood picker (1–5 emoji).
- ISO week header + "last week's answers" collapsible below (server-fetched).
- Submits via server action; target p95 latency <500ms (single insert, no fanout).
- On success, invalidates the engagement badge for that mentee via
  `router.refresh()` — the badge is server-rendered from the cache table.

### 5.3 `engagement-score-badge.tsx` (server)
- Renders `<Badge>` with tier color:
  - hot = emerald, warm = amber, cool = slate, cold = rose.
- Wraps in `<Tooltip>` whose content is the `formula` string from
  `computeEngagement()` plus the four component bars.
- Zero JS unless the tooltip opens (tooltip is the only client sub-component).

### 5.4 `mentee-timeline.tsx` (server)
- Vertical timeline merging: check-ins, published notes (mentor's view sees all
  notes; the founder's view — if we ever expose this — sees only `shared_with_founder`),
  SVI snapshots, assembled reports, login events.
- Grouped by ISO week; collapsed by default beyond the current + prior week.
- Empty state: onboarding checklist ("Write your first note", "Book a check-in").

---

## 6. Notification cap (risk mitigation)

Cap = **3 mentor-console-originated notifications per mentee per rolling 7 days**,
enforced by `web/src/lib/mentor/notification-budget.ts` (helper, not a new file
in scope — hooks into existing `notification_ledger` table).

Kinds that count toward the cap:
- weekly digest to mentor (1/wk)
- "your mentee flagged a blocker" to mentor (up to 2/wk)
- "your mentor added a shared note" to mentee (up to 2/wk)

Digest and blocker alerts are the only mentor-originated pushes; everything else
(login prompts, SVI-drop alerts) belongs to CRO/CTO tracks.

---

## 7. Tests

All three lib modules ship with `.test.ts` siblings using the project's existing
vitest setup (see `web/vitest.config.ts` — no new deps).

- `notes.test.ts` — draftKey stability, validateBody boundaries (empty, 4001-char,
  markdown-only), summarize edge cases, diffAudit round-trip.
- `check-ins.test.ts` — currentIsoWeek across DST + year boundary, isFresh at
  exactly 7d, completeness weighting.
- `engagement-score.test.ts` — table-driven: 12+ scenarios covering null inputs,
  each tier boundary, negative SVI delta, missing report.

---

## 8. Delivery order

1. Ship `engagement-score.ts` + test — pure, unblocks roster row (track 04).
2. Ship `check-ins.ts` + `notes.ts` + tests — pure, no DB.
3. Ship `mentorScope()` add-on to `scope.ts` (depends on mig 0091b).
4. Ship UI components against those libs.
5. Wire `weekly-digest.ts` into the existing reseller cron (track 05).

---

## 9. Acceptance criteria (verbatim)

- Mentor can compose and edit notes offline; drafts survive page refresh
  (localStorage) and publish once online.
- Check-in form submits in <500ms p95 (single upsert, no fanout).
- Engagement score visible on every roster row with a tooltip showing the
  formula and the four component bars.
- Weekly digest email includes up to 3 "must act" mentees, deduped against the
  prior week's digest so the mentor doesn't see the same name twice in a row
  unless it's still cold.

---

## 10. Risks

- **Over-instrumentation** — hard-cap 3 mentor-originated notifications per
  mentee per 7d (see §6).
- **Score gaming** — engagement score is displayed to mentor only, never
  surfaced to the mentee, so there's no incentive to inflate.
- **Consent drift** — mentorScope re-reads consent tier on every request; no
  caching beyond the request boundary. If the mentee revokes, the next page
  load drops them from the roster.
- **Draft leakage on shared devices** — localStorage draft is namespaced by
  subject_user_id but is not encrypted. Documented in the composer's tooltip;
  auto-cleared 30d after last edit.
