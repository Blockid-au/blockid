/**
 * Mentor console — Zod row shapes.
 *
 * Each schema mirrors a table declared in
 * web/supabase/migrations/0115_mentor_console.sql. Line references cite the
 * exact SQL definition so drift can be spotted at review time.
 *
 * A follow-up e2e test SHOULD SELECT one real row per table via
 * resellerSupabase() and .parse() it against these schemas — that check will
 * catch column adds/renames landed in later migrations that were not mirrored
 * here (risk R4).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tier constants — mirror 0115 column CHECK (tier IN (0,1,2,3)).
// ---------------------------------------------------------------------------

export const MENTOR_TIER = {
  NONE: 0,
  OVERVIEW: 1,
  PROGRESSION: 2,
  FULL: 3,
} as const;

export type MentorTier = (typeof MENTOR_TIER)[keyof typeof MENTOR_TIER];

/** 0..3 exact tier — matches 0115 mentor_access_grants.tier smallint check. */
export const MentorTierZ = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

// ---------------------------------------------------------------------------
// SubjectRef — founder_user_id XOR project_id
// (0115 ck_mentor_grants_subject_xor / ck_mentor_notes_subject_xor).
// ---------------------------------------------------------------------------

export const SubjectRefZ = z
  .object({
    founder_user_id: z.string().uuid().nullable().optional(),
    project_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => Boolean(v.founder_user_id) !== Boolean(v.project_id),
    { message: "SubjectRef: exactly one of founder_user_id or project_id must be set" },
  );

export type SubjectRef = z.infer<typeof SubjectRefZ>;

// ---------------------------------------------------------------------------
// mentor_access_grants — 0115_mentor_console.sql lines 37-56
// ---------------------------------------------------------------------------

export const MentorGrantSourceZ = z.enum([
  "reseller_admin",
  "founder_invite",
  "cohort_auto",
  "system",
]);

export const MentorGrantRowZ = z.object({
  id: z.string().uuid(),
  reseller_id: z.string().uuid(),
  founder_user_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  tier: MentorTierZ,
  granted_by: z.string().uuid(),
  granted_at: z.string(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  source: MentorGrantSourceZ,
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string(),
});

export type MentorGrantRow = z.infer<typeof MentorGrantRowZ>;

// ---------------------------------------------------------------------------
// mentor_notes — 0115_mentor_console.sql lines 86-104
// ---------------------------------------------------------------------------

export const MENTOR_NOTE_BODY_MAX = 20_000;

export const MentorNoteRowZ = z.object({
  id: z.string().uuid(),
  reseller_id: z.string().uuid(),
  mentor_id: z.string().uuid(),
  founder_user_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  body: z.string().max(MENTOR_NOTE_BODY_MAX),
  shared_with_founder: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type MentorNoteRow = z.infer<typeof MentorNoteRowZ>;

// ---------------------------------------------------------------------------
// mentor_check_ins — 0115_mentor_console.sql lines 123-137
// ---------------------------------------------------------------------------

export const MentorCheckInRowZ = z.object({
  id: z.string().uuid(),
  reseller_id: z.string().uuid(),
  mentor_id: z.string().uuid(),
  founder_user_id: z.string().uuid(),
  /** ISO Monday date (YYYY-MM-DD). */
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wins: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  focus: z.array(z.string()).default([]),
  submitted_at: z.string(),
  created_at: z.string(),
});

export type MentorCheckInRow = z.infer<typeof MentorCheckInRowZ>;

// ---------------------------------------------------------------------------
// mentor_engagement_snapshots — 0115_mentor_console.sql lines 155-170
// ---------------------------------------------------------------------------

export const MentorEngagementSnapshotRowZ = z.object({
  id: z.string().uuid(),
  reseller_id: z.string().uuid(),
  founder_user_id: z.string().uuid(),
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  svi_score: z.number().nullable(),
  svi_delta_7d: z.number().nullable(),
  phase_slug: z.string().nullable(),
  last_login_at: z.string().nullable(),
  engagement_score: z.number().int().min(0).max(100).nullable(),
  metrics: z.record(z.unknown()).default({}),
  created_at: z.string(),
});

export type MentorEngagementSnapshotRow = z.infer<typeof MentorEngagementSnapshotRowZ>;
