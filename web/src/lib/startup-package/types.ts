// Startup Package — row shapes + Zod schemas.
//
// Types + validators for the four Package tables landed by migration 0118.
// Everything here is pure data — no I/O, no imports from server-only modules.
// Both the client wizard (interview UI) and the server repo import from here
// so parse errors on either side yield identical error messages.

import { z } from "zod";

/**
 * Interview step keys — one per major growth-phase question in Ship 1.
 *
 * Kept as a discriminated union so a typo in the wizard reducer cannot silently
 * create an orphaned row. Order matches the `WIZARD_STEPS` declaration in the
 * Ship-3 UI cluster.
 */
export const INTERVIEW_STEP_KEYS = [
  "vision",
  "problem",
  "solution",
  "customer",
  "market",
  "revenue_model",
  "team",
  "traction",
] as const;

export type InterviewStepKey = (typeof INTERVIEW_STEP_KEYS)[number];

export const InterviewStepKeySchema = z.enum(INTERVIEW_STEP_KEYS);

/** Purchase status column values — mirrors the SQL CHECK constraint. */
export const PURCHASE_STATUSES = ["active", "refunded", "disputed"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Progress status column values — mirrors the SQL CHECK constraint. */
export const PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "review",
  "completed",
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

// ---------------------------------------------------------------------------
// Row schemas
// ---------------------------------------------------------------------------

export const PackagePurchaseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  project_id: z.string().uuid(),
  stripe_session_id: z.string().nullable(),
  stripe_price_id: z.string().nullable(),
  purchased_at: z.string(),
  seed_credits: z.number().int().nonnegative(),
  status: z.enum(PURCHASE_STATUSES),
});
export type PackagePurchase = z.infer<typeof PackagePurchaseSchema>;

export const PackageInterviewAnswerSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  step_key: InterviewStepKeySchema,
  answer_text: z.string(),
  char_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PackageInterviewAnswer = z.infer<
  typeof PackageInterviewAnswerSchema
>;

export const PackageReservedAllocationSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  pct_reserved: z.number().min(10).max(100),
  ticker_hint: z
    .string()
    .min(3)
    .max(4)
    .nullable(),
  on_chain_token_id: z.string().nullable(),
  opt_in_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PackageReservedAllocation = z.infer<
  typeof PackageReservedAllocationSchema
>;

export const PackageProgressSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  phase_id: z.string().min(1),
  status: z.enum(PROGRESS_STATUSES),
  completion_pct: z.number().int().min(0).max(100),
  updated_at: z.string(),
});
export type PackageProgress = z.infer<typeof PackageProgressSchema>;

// ---------------------------------------------------------------------------
// Upsert-input helpers — narrower shapes for repo write functions.
// ---------------------------------------------------------------------------

export const PackageInterviewAnswerInputSchema = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  step_key: InterviewStepKeySchema,
  answer_text: z.string(),
});
export type PackageInterviewAnswerInput = z.infer<
  typeof PackageInterviewAnswerInputSchema
>;

export const PackageReservedAllocationInputSchema = z.object({
  project_id: z.string().uuid(),
  pct_reserved: z.number().min(10).max(100),
  ticker_hint: z.string().min(3).max(4).nullable().optional(),
  on_chain_token_id: z.string().nullable().optional(),
  opt_in_at: z.string().nullable().optional(),
});
export type PackageReservedAllocationInput = z.infer<
  typeof PackageReservedAllocationInputSchema
>;

export const PackageProgressInputSchema = z.object({
  project_id: z.string().uuid(),
  phase_id: z.string().min(1),
  status: z.enum(PROGRESS_STATUSES).optional(),
  completion_pct: z.number().int().min(0).max(100).optional(),
});
export type PackageProgressInput = z.infer<typeof PackageProgressInputSchema>;

export const PackagePurchaseInputSchema = z.object({
  user_id: z.string().uuid(),
  project_id: z.string().uuid(),
  stripe_session_id: z.string().nullable().optional(),
  stripe_price_id: z.string().nullable().optional(),
  seed_credits: z.number().int().nonnegative().optional(),
  status: z.enum(PURCHASE_STATUSES).optional(),
});
export type PackagePurchaseInput = z.infer<typeof PackagePurchaseInputSchema>;
