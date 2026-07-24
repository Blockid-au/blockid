# CLO — Mentor Console: Permission Model + DB Migration Design

**Author:** CLO agent
**Date:** 2026-07-24
**Scope:** Migration 0115 + reseller/scope.ts extension + lib/mentor/{types,access-guards} + unit tests.
**Related recon:** existing `reseller_attributions` (0091), denormalized `attribution_reseller_id` cols (0092), `reseller_audit_log` (0093), advisor portal (0058), accelerator cohorts.

---

## 1. Design philosophy

The mentor console is **NOT** a new isolation domain — it is a **consent layer** stacked on top of the existing reseller/founder attribution seed.

```
reseller_attributions  (mig 0091)   ← SEED  — "who is billed to which reseller"
        │
        ▼
mentor_access_grants   (mig 0115)   ← CONSENT — "and the founder said yes to mentorship at TIER=X"
        │
        ▼
mentor_notes / check_ins / snapshots (mig 0115)  ← ACTIVITY — every read/write is scoped by a grant
```

Design corollaries:

- **Do NOT duplicate the seed.** A `mentor_access_grants` row is only ever created for a `(reseller_id, founder_id)` pair that already exists (as user or via project) in `reseller_attributions`. The grant is the *consent* layer, attribution is the *billing* layer.
- **RLS is enabled on all four new tables, but the app-layer gate remains the primary chokepoint** — `resellerSupabase(scope)` + new `mentorScope()` helper. This preserves the existing pattern (service-role bypass, per-request audit-log write, single choke).
- **Cohort-scoped mentorship is a superset** — a single grant row can point at either a `founder_user_id` OR a `project_id`. The `access-guards.ts` resolver handles both shapes so `/workspace/accelerator/cohort` and 1:1 reseller drawers hit the same guard.

---

## 2. Access tiers

Four monotonic tiers. Higher tier implies all lower-tier rights.

| Tier          | Reveals                                     | Writes                       | Written by                     |
|---------------|---------------------------------------------|------------------------------|--------------------------------|
| `none`        | Nothing beyond the attribution existence    | —                            | (default, no row)              |
| `overview`    | Founder name/company/stage/SVI headline     | —                            | Auto on first attribution      |
| `progression` | + phase progression + SVI curve             | `mentor_notes` (private)     | Founder consent (in-app modal) |
| `full`        | + email/PII + full reports + data room list | `notes.shared_with_founder`, `mentor_check_ins` | Founder consent |

Tier ordering is enforced as `SMALLINT` (`0..3`) with a check-constraint + a Zod enum in `types.ts`; `access-guards.ts` throws **`MENTOR_ACCESS_DENIED`** (stable error `code`) when the request tier > grant tier or grant is `revoked_at IS NOT NULL` / `expires_at < now()`.

Service-role clients (nightly `mentor-engagement-snapshots` cron, admin recovery) **bypass** the guard by taking a distinct entry-point (`serviceRoleMentorClient()`) that never calls `enforceGrant()`.

---

## 3. Migration 0115_mentor_console.sql — table shapes

All four tables:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `ENABLE ROW LEVEL SECURITY` + default-deny (no policy for `authenticated`; service-role bypass by role convention already used in 0093).
- Foreign keys `ON DELETE CASCADE` from `public.resellers`, `public.app_users`, `public.projects` so a founder-account delete purges every mentor artifact.

### 3.1 mentor_access_grants

```sql
CREATE TABLE IF NOT EXISTS public.mentor_access_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id       uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_user_id   uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  tier              smallint NOT NULL CHECK (tier BETWEEN 0 AND 3),
  granted_by        uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,       -- NULL = perpetual until revoked
  revoked_at        timestamptz,
  revoked_reason    text,
  source            text NOT NULL DEFAULT 'reseller_console'
                    CHECK (source IN ('reseller_console','cohort_bulk','founder_invite','admin_backfill')),
  CHECK (founder_user_id IS NOT NULL OR project_id IS NOT NULL)
);
```

**Partial-unique indexes** — one active grant per (reseller,founder) pair *of each shape*:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS mentor_grants_active_user_uidx
  ON public.mentor_access_grants (reseller_id, founder_user_id)
  WHERE revoked_at IS NULL AND founder_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mentor_grants_active_project_uidx
  ON public.mentor_access_grants (reseller_id, project_id)
  WHERE revoked_at IS NULL AND project_id IS NOT NULL;
```
A re-grant (after revoke) inserts a NEW row so we keep full history; the app-layer sort picks `MAX(granted_at) WHERE revoked_at IS NULL`.

### 3.2 mentor_notes

```sql
CREATE TABLE IF NOT EXISTS public.mentor_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id           uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  reseller_id         uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_user_id     uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  body                text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  shared_with_founder boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (founder_user_id IS NOT NULL OR project_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mentor_notes_founder_time_idx
  ON public.mentor_notes (founder_user_id, created_at DESC)
  WHERE founder_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_notes_project_time_idx
  ON public.mentor_notes (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
```

- Notes are **default-private** to the mentor. `shared_with_founder=true` flips them into the founder's dashboard read-view via a future `/api/mentor/notes/[id]/share`.
- Writes require **tier >= 2 (progression)**; toggling `shared_with_founder` requires **tier >= 3 (full)** — enforced in `access-guards.ts`, NOT in a DB trigger (keeps the tier logic co-located with TS Zod schema).

### 3.3 mentor_check_ins

```sql
CREATE TABLE IF NOT EXISTS public.mentor_check_ins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id       uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  reseller_id     uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_user_id uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  week_start      date NOT NULL,   -- ISO Monday, floored in TS before insert
  wins            jsonb NOT NULL DEFAULT '[]'::jsonb,
  blockers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  focus           jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (founder_user_id IS NOT NULL OR project_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS mentor_check_ins_week_user_uidx
  ON public.mentor_check_ins (mentor_id, founder_user_id, week_start)
  WHERE founder_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mentor_check_ins_week_project_uidx
  ON public.mentor_check_ins (mentor_id, project_id, week_start)
  WHERE project_id IS NOT NULL;
```

### 3.4 mentor_engagement_snapshots

Nightly cron output — one row per active grant per day.

```sql
CREATE TABLE IF NOT EXISTS public.mentor_engagement_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id       uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_user_id   uuid REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_date     date NOT NULL,
  svi_score         numeric(6,2),
  svi_delta_7d      numeric(6,2),
  phase_slug        text,
  last_login_at     timestamptz,
  notes_count_7d    int NOT NULL DEFAULT 0,
  check_ins_count_7d int NOT NULL DEFAULT 0,
  engagement_score  smallint NOT NULL DEFAULT 0 CHECK (engagement_score BETWEEN 0 AND 100),
  computed_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (founder_user_id IS NOT NULL OR project_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS mentor_engagement_snap_daily_user_uidx
  ON public.mentor_engagement_snapshots (reseller_id, founder_user_id, snapshot_date)
  WHERE founder_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mentor_engagement_snap_daily_project_uidx
  ON public.mentor_engagement_snapshots (reseller_id, project_id, snapshot_date)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_engagement_snap_reseller_date_idx
  ON public.mentor_engagement_snapshots (reseller_id, snapshot_date DESC);
```

---

## 4. RLS policies (mig 0115 tail)

Pattern used for all 4 tables — default-deny + service-role by convention (matches `reseller_audit_log` 0093 and `reseller_attributions` 0091):

```sql
ALTER TABLE public.mentor_access_grants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_notes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_check_ins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_engagement_snapshots   ENABLE ROW LEVEL SECURITY;
```

No `CREATE POLICY … FOR authenticated` — access is exclusively via the service-role client after the app-layer guard. This mirrors the reseller pattern.

**Idempotency notes (lesson from mig 0114):**
- Every `CREATE TABLE` / `CREATE INDEX` / `CREATE FUNCTION` uses `IF NOT EXISTS` or `CREATE OR REPLACE`.
- Every `ALTER TABLE … ADD COLUMN` uses `IF NOT EXISTS`.
- `COMMENT ON` uses a single string literal — **no `||` concatenation** (the 0114 lesson: string concat in COMMENT ON silently broke re-apply).
- Policies wrapped in `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;` — Postgres has no `CREATE POLICY IF NOT EXISTS` before 15.4.

Wrap in `BEGIN; … COMMIT;` and finish with `NOTIFY pgrst, 'reload schema';` (invoked after `docker exec supabase-db psql -f …`).

---

## 5. File changes

### 5.1 `web/src/lib/reseller/scope.ts` (MODIFY)

Extend the existing `ScopedResellerSession` with a `mentor` sub-object (does NOT change existing callers — additive):

```ts
export interface ScopedResellerSession {
  reseller_id: string;
  role: "owner" | "admin" | "viewer";
  allowedCustomerIds(): Promise<string[]>;
  sandboxProjectId(): Promise<string | null>;
  // NEW:
  mentor: {
    /** Resolve current tier for a founder or project (0..3). 0 if no active grant. */
    tierFor(subject: { founder_user_id?: string; project_id?: string }): Promise<0 | 1 | 2 | 3>;
    /** Throws MentorAccessDenied if the current tier < required. */
    gateNoteRead(subject: { founder_user_id?: string; project_id?: string }): Promise<void>;
    gateNoteWrite(subject: { founder_user_id?: string; project_id?: string; sharedWithFounder: boolean }): Promise<void>;
    gateCheckInWrite(subject: { founder_user_id?: string; project_id?: string }): Promise<void>;
  };
}
```

The new helpers **delegate to `web/src/lib/mentor/access-guards.ts`** — scope.ts is the reseller-side entry, access-guards.ts is the pure logic (which lets us unit-test guards without mocking Supabase auth).

`mentorScope(user)` — thin wrapper that calls `scopedReseller(user)` and returns just `session.mentor` (used by `/api/mentor/**` routes so they don't accidentally leak reseller-only helpers).

### 5.2 `web/src/lib/mentor/types.ts` (NEW)

Zod schemas exported for row shapes:

```ts
export const MentorTierZ = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type MentorTier = z.infer<typeof MentorTierZ>;
export const MENTOR_TIER = { NONE: 0, OVERVIEW: 1, PROGRESSION: 2, FULL: 3 } as const;

export const MentorGrantRowZ = z.object({
  id: z.string().uuid(),
  reseller_id: z.string().uuid(),
  founder_user_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  tier: MentorTierZ,
  granted_at: z.string(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
// + MentorNoteRowZ, MentorCheckInRowZ, MentorEngagementSnapshotRowZ
```

### 5.3 `web/src/lib/mentor/access-guards.ts` (NEW)

```ts
export const MENTOR_ACCESS_DENIED = "MENTOR_ACCESS_DENIED" as const;

export class MentorAccessDenied extends Error {
  readonly code = MENTOR_ACCESS_DENIED;
  constructor(
    public readonly required: MentorTier,
    public readonly actual: MentorTier,
    public readonly subject: { founder_user_id?: string; project_id?: string },
  ) {
    super(`mentor access denied: required tier ${required}, actual ${actual}`);
    this.name = "MentorAccessDenied";
  }
}

export function assertTier(actual: MentorTier, required: MentorTier, subject: SubjectRef): void {
  if (actual < required) throw new MentorAccessDenied(required, actual, subject);
}

export async function loadActiveTier(
  supabase: SupabaseClient,
  resellerId: string,
  subject: SubjectRef,
): Promise<MentorTier> {
  // SELECT tier FROM mentor_access_grants
  //  WHERE reseller_id=$1 AND (founder_user_id=$2 OR project_id=$3)
  //    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
  //  ORDER BY granted_at DESC LIMIT 1
}

export function serviceRoleBypass(): { tier: MentorTier } { return { tier: 3 }; }
```

Nightly cron uses `serviceRoleBypass()` to avoid the guard entirely (writes only to `mentor_engagement_snapshots`).

### 5.4 `web/src/lib/mentor/access-guards.test.ts` (NEW)

Cases:
1. `assertTier(3, 2, …)` — no throw.
2. `assertTier(1, 2, …)` — throws, `err.code === MENTOR_ACCESS_DENIED`.
3. `loadActiveTier` returns 0 when no rows.
4. `loadActiveTier` returns 0 when only revoked row exists.
5. `loadActiveTier` returns highest tier when multiple non-revoked rows exist (shouldn't happen — partial unique index — but defense in depth).
6. `loadActiveTier` returns 0 when `expires_at < now()`.
7. `serviceRoleBypass()` always returns tier 3.
8. `gateNoteWrite({ sharedWithFounder: true })` at tier 2 throws (needs tier 3).
9. `gateNoteWrite({ sharedWithFounder: false })` at tier 2 passes.

Uses the existing in-file Supabase mock pattern (see `web/src/lib/reseller/attributions.test.ts` for template).

---

## 6. Audit hooks

Every guard **pass** writes to `reseller_audit_log` (existing 0093 table) with:

- `action` — one of `mentor.note.read`, `mentor.note.write`, `mentor.check_in.write`, `mentor.grant.create`, `mentor.grant.revoke`, `mentor.engagement.view`.
- `subject_user_id` — resolved founder user id (via `projects.user_id` if only project_id given).
- `metadata` — `{ tier, subject_project_id?, note_id?, check_in_id? }`.

Guard **denials** also write (`action='mentor.access.denied'`, `metadata.required` + `metadata.actual`) — critical for CISO alert rules on repeated denials.

---

## 7. Acceptance criteria

1. **Migration applies cleanly** via `docker exec supabase-db psql -U postgres -d postgres -f /home/dovanlong/blockid.au/web/supabase/migrations/0115_mentor_console.sql` on a DB with mig 0114 already applied — no errors, no warnings.
2. **Re-apply is a no-op** — running it twice produces zero changes (all `IF NOT EXISTS` + policy `DO $$` blocks swallow duplicates).
3. **Duplicate active grant is blocked** — `INSERT` of a second `(reseller_id, founder_user_id)` row with `revoked_at IS NULL` raises `unique_violation` on `mentor_grants_active_user_uidx`.
4. **Duplicate weekly check-in is blocked** — `INSERT` with matching `(mentor_id, founder_user_id, week_start)` raises `unique_violation`.
5. **`assertTier` throws `MentorAccessDenied`** with `err.code === "MENTOR_ACCESS_DENIED"` when required > actual — stable string exposed to API-route callers for structured JSON responses.
6. **Service-role client bypasses guards** — the nightly cron writes engagement snapshots without instantiating a `mentorScope`.
7. **Cascading delete works** — deleting an `app_users` row purges all associated grants, notes, check-ins, snapshots (no orphans).
8. **`resellerSupabase` unit tests still pass** — the additive `mentor` sub-object doesn't break existing scope.ts callers.
9. **PostgREST schema reload** — `NOTIFY pgrst, 'reload schema'` is documented in the migration trailer.

---

## 8. Risks & mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | `reseller_attributions` already provides project-level attribution — mentor_access_grants duplicates the join. | Grants are the **consent** layer, not the seed. Grant creation must FIRST verify an `active + !opted_out` attribution row exists; a helper `assertAttributionExists()` in access-guards.ts enforces this at grant time. |
| R2 | Founder revokes attribution — grants become dangling. | `reseller_attributions` triggers a soft-revoke of any dependent grant (add a `ON UPDATE` trigger `set_grant_revoked_on_attribution_optout` in a **later** migration; this migration flags the coupling in a `COMMENT ON TABLE`). |
| R3 | Cohort-scoped grants may want a `cohort_id` FK. | Deferred — first pass keeps `mentor_access_grants` cohort-agnostic (cohort membership is resolvable via `accelerator_cohort_members` → app_user → grant). Adding `cohort_id` later is a non-breaking column add. |
| R4 | Zod schemas drift from SQL types. | `types.ts` includes a doc-comment linking each schema to the exact migration line; a follow-up e2e test can `SELECT` a real row and `.parse()` it. |
| R5 | Advisor portal (mig 0058) has `advisor_clients` — perceived duplication. | Deliberate. Advisor portal = pre-existing internal advisor UI, no reseller attribution required. Mentor console = reseller-driven, tier-gated, cohort-aware. Both can coexist; `/mentor/**` routes never touch `advisor_clients`. |
| R6 | JSONB `wins/blockers/focus` are unvalidated at DB. | Zod validation in `types.ts` — every insert path parses through `MentorCheckInRowZ.parse()` before writing. Follow-up mig could add a `CHECK (jsonb_typeof(wins) = 'array')` if we see corruption. |
| R7 | RLS enabled but no policies = every non-service-role query returns 0 rows silently. | Documented in the migration comment; the CI grep enforcement in `web/src/lib/reseller/supabase.ts` already forbids anon-key queries against `mentor_*` tables. |

---

## 9. Not in this migration (explicitly deferred)

- `/api/mentor/**` route handlers — separate CTO deliverable.
- `/mentor/roster`, `/mentor/founders/[id]` pages — separate CPO/UI deliverable.
- Cron job spec for `mentor_engagement_snapshots` — separate COO deliverable.
- Founder-side "share with founder" note read view — separate CPO deliverable.
- ADD `cohort_id` FK on grants — deferred (see R3).
- Automatic grant-revoke trigger on attribution opt-out — deferred to a follow-up migration (see R2).
