// Startup Package — typed CRUD repo (server-only).
//
// All functions swallow Supabase absence (returns null / empty) so a
// mis-configured local dev environment does not crash the wizard. Real errors
// (constraint violation, network) surface as thrown exceptions so the caller
// can decide whether to retry or 500.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  PackagePurchaseSchema,
  PackageInterviewAnswerSchema,
  PackageReservedAllocationSchema,
  PackageProgressSchema,
  PackageInterviewAnswerInputSchema,
  PackageReservedAllocationInputSchema,
  PackageProgressInputSchema,
  PackagePurchaseInputSchema,
  type PackagePurchase,
  type PackageInterviewAnswer,
  type PackageReservedAllocation,
  type PackageProgress,
  type PackageInterviewAnswerInput,
  type PackageReservedAllocationInput,
  type PackageProgressInput,
  type PackagePurchaseInput,
} from "./types";

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/**
 * Read the latest active purchase for a project. Returns null when Supabase
 * is not configured, no row exists, or the row is refunded/disputed.
 */
export async function getPurchaseByProject(
  projectId: string,
): Promise<PackagePurchase | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("startup_package_purchases")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return PackagePurchaseSchema.parse(data);
}

/**
 * Read a purchase by its Stripe checkout session id. Powers the webhook
 * idempotency check — a duplicate delivery finds the existing row instead of
 * re-inserting.
 */
export async function getPurchaseByStripeSession(
  sessionId: string,
): Promise<PackagePurchase | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("startup_package_purchases")
    .select("*")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return PackagePurchaseSchema.parse(data);
}

/**
 * Insert a purchase row. Callers set stripe_session_id so the UNIQUE index
 * gives natural idempotency — repeat webhook deliveries return null (already
 * exists) instead of a duplicate row. Returns the inserted row, or null when
 * the session_id is already claimed.
 */
export async function insertPurchase(
  input: PackagePurchaseInput,
): Promise<PackagePurchase | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const parsed = PackagePurchaseInputSchema.parse(input);

  const { data, error } = await supabase
    .from("startup_package_purchases")
    .insert({
      user_id: parsed.user_id,
      project_id: parsed.project_id,
      stripe_session_id: parsed.stripe_session_id ?? null,
      stripe_price_id: parsed.stripe_price_id ?? null,
      seed_credits: parsed.seed_credits ?? 25,
      status: parsed.status ?? "active",
    })
    .select()
    .maybeSingle();

  // 23505 = unique_violation → session already recorded (idempotent path).
  if (error && (error as { code?: string }).code === "23505") return null;
  if (error) throw error;
  if (!data) return null;
  return PackagePurchaseSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Interview answers
// ---------------------------------------------------------------------------

/** Load every stored interview answer for a project (ordered by step index). */
export async function listInterviewAnswers(
  projectId: string,
): Promise<PackageInterviewAnswer[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("startup_package_interview")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data) return [];
  return data.map((row) => PackageInterviewAnswerSchema.parse(row));
}

/**
 * Upsert a single answer keyed by (project_id, step_key). The partial UNIQUE
 * index in migration 0118 lets us use ON CONFLICT via supabase-js `upsert()`.
 */
export async function upsertInterviewAnswer(
  input: PackageInterviewAnswerInput,
): Promise<PackageInterviewAnswer | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const parsed = PackageInterviewAnswerInputSchema.parse(input);

  const { data, error } = await supabase
    .from("startup_package_interview")
    .upsert(
      {
        project_id: parsed.project_id,
        user_id: parsed.user_id ?? null,
        step_key: parsed.step_key,
        answer_text: parsed.answer_text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,step_key" },
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return PackageInterviewAnswerSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Reserved allocations
// ---------------------------------------------------------------------------

/** Read the one-row reserved allocation for a project. */
export async function getReservedAllocation(
  projectId: string,
): Promise<PackageReservedAllocation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("startup_package_reserved_allocations")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return PackageReservedAllocationSchema.parse(data);
}

/**
 * Upsert the reservation row for a project. project_id is UNIQUE so a repeat
 * call from the UI updates pct_reserved / ticker_hint instead of inserting.
 */
export async function upsertReservedAllocation(
  input: PackageReservedAllocationInput,
): Promise<PackageReservedAllocation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const parsed = PackageReservedAllocationInputSchema.parse(input);

  const { data, error } = await supabase
    .from("startup_package_reserved_allocations")
    .upsert(
      {
        project_id: parsed.project_id,
        pct_reserved: parsed.pct_reserved,
        ticker_hint: parsed.ticker_hint ?? null,
        on_chain_token_id: parsed.on_chain_token_id ?? null,
        opt_in_at: parsed.opt_in_at ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return PackageReservedAllocationSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Per-phase progress
// ---------------------------------------------------------------------------

/** Load every progress row for a project, sorted by updated_at desc. */
export async function listProgress(
  projectId: string,
): Promise<PackageProgress[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("startup_package_progress")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];
  return data.map((row) => PackageProgressSchema.parse(row));
}

/** Upsert per-phase progress keyed by (project_id, phase_id). */
export async function upsertProgress(
  input: PackageProgressInput,
): Promise<PackageProgress | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const parsed = PackageProgressInputSchema.parse(input);

  const { data, error } = await supabase
    .from("startup_package_progress")
    .upsert(
      {
        project_id: parsed.project_id,
        phase_id: parsed.phase_id,
        status: parsed.status ?? "in_progress",
        completion_pct: parsed.completion_pct ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,phase_id" },
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return PackageProgressSchema.parse(data);
}
