# CRO Design — Mentor Consent Flow + Engagement Conversion
Date: 2026-07-24
Owner: CRO agent
Related: 01-cto-schema.md (mentor_access_grants schema), 03-cpo-ux.md (founder consent screens)

## 1. Objective

Convert **passive reseller attribution** into **active mentor engagement** through a tiered consent model, mirroring how Atlassian for Startups partners graduate from "referred me" to "trusted advisor" over the course of a founder's growth journey. Every reveal of founder data must be founder-authorised, dated, revocable, and audit-logged.

## 2. Three-tier access model

| Tier | Slug | What the mentor sees | How they get it |
|------|------|----------------------|-----------------|
| **A** Attributed-only | `attributed_only` | Founder name (or pseudonymous handle if founder chooses), current phase (Vision → Funding), SVI band (bucketed: Low / Mid / High — never raw score), last-active month | Automatic once `reseller_attributions` row exists. No founder action required. |
| **B** Reports-shared | `reports_shared` | Everything in A + read-only access to `assembled_reports` the founder has explicitly shared (per-report toggle, not blanket) + raw SVI numeric score + snapshot history chart | Founder accepts mentor invite AND toggles reports individually. Consent dated. |
| **C** Full mentor | `full_mentor` | Everything in B + SVI evidence trail (`svi_analyses`), cap-table shape (roles + %, no PII of other founders), exit-readiness lenses (from `lib/exits/`), ability to leave mentor notes visible to founder | Founder issues a fresh, tier-C consent from `/dashboard/mentor-invite`. Requires re-confirmation every 12 months. |

**Rule:** downgrade is unilateral (founder can revoke any tier instantly). Upgrade requires a fresh consent event with new timestamp — a tier-B consent does not "carry over" to tier C.

## 3. Conversion funnel

Tracked in `mentor_conversion_events` table + fired to GA4 for realtime dashboarding:

```
attributed          (auto — reseller_attributions insert)
  ↓  ~40% target
invite_sent         (mentor triggers /reseller/customers/[id] → "Request mentor access")
  ↓  ~55% target
invite_accepted     (founder clicks approve on /dashboard/mentor-invite)
  ↓  ~70% target
tier_a_confirmed    (founder confirms basic access — usually same click as accept)
  ↓  ~50% target
tier_b_upgraded     (founder shares at least one report)
  ↓  ~35% target
tier_c_upgraded     (founder grants full mentor tier)
  ↓  ongoing
check_in_completed  (mentor leaves a note; founder replies OR opens it)
```

GA4 event names (snake_case, all fired both server-side via `lib/analytics/ga4-server.ts` and client-side via `lib/mentor/conversion-events.ts`):
- `mentor_invite_sent`
- `mentor_invite_accepted`
- `mentor_invite_declined`
- `mentor_tier_upgraded` (with `tier` param)
- `mentor_tier_revoked` (with `tier` param + `reason`)
- `mentor_check_in_completed`
- `mentor_consent_expired` (fired by cron 30d before + at expiry)

Each event writes a row to `reseller_audit_log` (existing table used by `drawer-opener.tsx`) with `event_type='mentor.*'` — no new audit table.

## 4. Consent record shape

New table `mentor_access_grants` (CTO owns schema; CRO owns UX contract):

```
mentor_access_grants
  id uuid pk
  reseller_id uuid  -- always set (mentor is a reseller-type user)
  founder_user_id uuid
  founder_project_id uuid  -- optional; grant can be founder-wide or project-scoped
  tier text check in ('attributed_only','reports_shared','full_mentor')
  granted_at timestamptz
  expires_at timestamptz  -- default now() + interval '12 months' for tier B/C; null for tier A
  revoked_at timestamptz
  consent_evidence jsonb  -- {ip, ua, screen, click_id, wording_version}
  created_by uuid  -- founder user id who clicked approve
```

Application-layer gate lives in `web/src/lib/mentor/access-tiers.ts`:

```ts
export const MENTOR_ACCESS_TIERS = ['attributed_only','reports_shared','full_mentor'] as const
export type MentorAccessTier = typeof MENTOR_ACCESS_TIERS[number]

export function tierAtLeast(have: MentorAccessTier, need: MentorAccessTier): boolean
export function canViewReport(grant: MentorAccessGrant, report: AssembledReport): boolean
export function canViewSviEvidence(grant: MentorAccessGrant): boolean
export function canLeaveNote(grant: MentorAccessGrant): boolean
export function isExpiringSoon(grant: MentorAccessGrant, days=30): boolean
export async function loadActiveGrant(resellerId, founderId): Promise<MentorAccessGrant|null>
```

## 5. UI surfaces

### 5.1 Founder side — /dashboard/mentor-invite (NEW)
- Landing page reached from: (a) invite email link, (b) in-app banner in `/dashboard`, (c) settings deep-link.
- Shows: mentor name + logo, what tier is being requested, plain-language bullet list of what mentor will/won't see, checkbox "I understand this consent lasts 12 months and I can revoke anytime".
- Approve / Decline buttons. Approve → writes `mentor_access_grants` row + fires GA4 + emails mentor.
- If a lower-tier grant already exists and mentor is asking for upgrade, show side-by-side diff of "what mentor sees today" vs "what will change".

### 5.2 Founder side — /dashboard/settings "Mentor access" section (EDIT)
Add a card under existing settings sections:
- List all active mentors + tier badge + granted date + expiry date + green/amber/red dot for freshness.
- Per-row actions: **Change tier** (opens `/dashboard/mentor-invite?upgrade=…`), **Revoke** (confirmation modal — immediate effect, fires `mentor_tier_revoked`).
- Empty state: "No mentors have access. Attributed mentors see only your growth phase — nothing else."

### 5.3 Mentor side — reseller/customers/[id] drawer (banner + badge)
- **`access-tier-badge.tsx`** — small pill in the drawer header + roster cards (`Tier A/B/C` with color mapping matching existing shadcn `Badge` variants).
- **`access-request-banner.tsx`** — appears above the drawer tabs whenever mentor's current tier is less than what they need for the current view. CTA: "Request tier B access → founder will get an approval prompt." Fires `mentor_invite_sent`.
- Tabs that need higher tiers are shown but content is masked with a "Request access" call-to-action (mirrors `paywall-nudge.tsx` pattern — same visual language, different copy).

### 5.4 Mentor side — /mentor/roster (NEW, out of scope for this doc; covered by CPO 03)
Grid of attributed founders styled like `/team` page. Each card shows tier badge + last-check-in date + quick "request upgrade" affordance for tier-A rows.

### 5.5 Reseller-side paywall-nudge reuse
`web/src/components/sales/paywall-nudge.tsx` is currently a pattern for "you need to upgrade the plan". Refactor it to accept a `variant: 'plan_upgrade' | 'mentor_access_upgrade'` prop so the mentor-console can reuse the shell + typography without a fork. No behavioural change for existing callers (default variant = `plan_upgrade`).

## 6. Consent expiry policy

- **Tier A**: no expiry — attribution is a factual record, not personal data of the founder beyond what they typed into `/reseller/create-startup`.
- **Tier B / C**: 12-month expiry from `granted_at`.
- **Reminder cadence** (new cron `cron-mentor-consent-check`, hourly):
  - 30 days before expiry → email founder + email mentor + in-app banner on both sides + fires `mentor_consent_expiring_soon` GA4 event.
  - 7 days before → second reminder.
  - At expiry → auto-downgrade to `attributed_only`, fire `mentor_consent_expired`, log to `reseller_audit_log`.
- Renewal is one-click: founder gets a pre-filled `/dashboard/mentor-invite?renew=<grant_id>` link that creates a fresh grant (new `granted_at`, new expiry).

## 7. Cohort mentors (accelerator superset)

Cohort mentors are just reseller-type users whose `reseller_attributions` row was inserted via the cohort onboarding flow. The consent model is **per-founder, not per-cohort** — a mentor in a cohort of 20 still needs 20 separate consent grants. This is deliberate: (a) matches Atlassian for Startups reality where accelerator mentors don't automatically get founder data, (b) avoids blanket-consent dark patterns, (c) protects the platform from bulk-scraping via cohort membership.

Convenience: `/dashboard/mentor-invite?cohort=<id>` renders a compact "approve for this whole cohort's lead mentor" screen — but still writes N separate grant rows so each is individually revocable.

## 8. Audit + privacy notes

- Every reveal (drawer open, report view, note left) writes to `reseller_audit_log` with a stable `event_type` prefix `mentor.*` so CDO agent can build data-request exports quickly.
- Mentor notes stored in `mentor_notes` table (separate doc — CTO owns). Founder can read all mentor notes about them; mentor cannot see other mentors' notes.
- PII exposed at each tier is documented in `web/content/legal/mentor-access-policy.md` (new legal doc, au-compliance owned) — the `/dashboard/mentor-invite` page renders the tier-specific extract inline via MDX.

## 9. File map (see StructuredOutput for canonical list)

New files, edits to existing files, and acceptance criteria are enumerated in the JSON returned to the orchestrator. This markdown is the human-readable narrative; JSON is the machine-actionable plan.
