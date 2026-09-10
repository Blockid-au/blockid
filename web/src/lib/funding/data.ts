// Server-only read helpers for the AU funding catalogue (migration
// 0311_au_funding.sql). Used by /admin/funding, the /funding directory pages
// (T0241) and the grant-advisor agent (T0240).
//
// Contract (mirrors accelerator-portal.ts):
//   * admin client null / missing tables (42P01) / any DB error → [] or null,
//     never throws to the page.
//   * `capitalForCity` is re-exported from seed-map.ts so pages and the seed
//     script agree on the city → capital grouping (G11-5).
//
// Colocated tests: data.test.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AuGrantRow, AuProgramRow, Capital, FundingStatus } from "./seed-map";

export { capitalForCity, CAPITALS, AU_STATES, FUNDING_STATUSES, STATUS_CONFIDENCES } from "./seed-map";
export type { AuGrantRow, AuProgramRow, Capital, AuState, FundingStatus, StatusConfidence, VerifiedBy } from "./seed-map";

export interface AuGrant extends AuGrantRow {
  created_at: string;
  updated_at: string;
}

export interface AuProgram extends AuProgramRow {
  created_at: string;
  updated_at: string;
}

export interface ListGrantsOptions {
  state?: string | null;
  status?: FundingStatus | null;
  /** Drop rows flagged exclude_from_matching (registry / council-only rows). Default true. */
  excludeNonMatching?: boolean;
  limit?: number;
}

export interface ListProgramsOptions {
  capital?: Capital | string | null;
  status?: FundingStatus | null;
  limit?: number;
}

const DEFAULT_LIMIT = 500;

function warn(scope: string, err: { code?: string; message?: string } | null | undefined) {
  if (!err) return;
  // 42P01 = relation does not exist → migration 0311 not applied yet. Degrade quietly.
  if (err.code === "42P01") return;
  console.warn(`[funding/data] ${scope}: ${err.message ?? "unknown error"}`);
}

/**
 * Grants, optionally narrowed to a state (`national` rows are always included
 * alongside a specific state so federal schemes show on every state page).
 */
export async function listGrants(opts: ListGrantsOptions = {}): Promise<AuGrant[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const excludeNonMatching = opts.excludeNonMatching ?? true;
  try {
    let q = supabase.from("au_grants").select("*");
    if (opts.state && opts.state !== "national") q = q.in("state", ["national", opts.state]);
    if (opts.state === "national") q = q.eq("state", "national");
    if (opts.status) q = q.eq("status", opts.status);
    if (excludeNonMatching) q = q.eq("exclude_from_matching", false);
    const { data, error } = await q
      .order("name", { ascending: true })
      .limit(opts.limit ?? DEFAULT_LIMIT);
    warn("listGrants", error);
    return (data ?? []) as AuGrant[];
  } catch (err) {
    warn("listGrants", { message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** Programs, optionally narrowed to one capital page (Sydney, Brisbane, …, Remote). */
export async function listPrograms(opts: ListProgramsOptions = {}): Promise<AuProgram[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    let q = supabase.from("au_programs").select("*");
    if (opts.capital) q = q.eq("capital", opts.capital);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q
      .order("capital", { ascending: true })
      .order("name", { ascending: true })
      .limit(opts.limit ?? DEFAULT_LIMIT);
    warn("listPrograms", error);
    return (data ?? []) as AuProgram[];
  } catch (err) {
    warn("listPrograms", { message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export async function getGrant(id: string): Promise<AuGrant | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("au_grants").select("*").eq("id", id).maybeSingle();
    warn("getGrant", error);
    return (data as AuGrant | null) ?? null;
  } catch (err) {
    warn("getGrant", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function getProgram(id: string): Promise<AuProgram | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("au_programs").select("*").eq("id", id).maybeSingle();
    warn("getProgram", error);
    return (data as AuProgram | null) ?? null;
  } catch (err) {
    warn("getProgram", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
