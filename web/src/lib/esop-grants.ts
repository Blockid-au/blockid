// ESOP grant CRUD (server-only) for the new project-scoped tracker at
// /workspace/esop/grants. Backed by `esop_option_grants` (migration 0089).
//
// Distinct from the legacy `esop_grants` table referenced by
// /api/esop/pool + /api/esop/score which is scoped by esop_pool_id.

import "server-only";
import { getSupabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrantStatus = "active" | "exercised" | "lapsed" | "cancelled";
export type Div83AStatus = "eligible" | "ineligible" | "unsure";

export interface Grant {
  id: string;
  projectId: string | null;
  userId: string;
  granteeName: string;
  granteeEmail: string | null;
  grantDate: string; // ISO date
  sharesUnderOption: number;
  strikePriceAud: number;
  vestingYears: number;
  cliffMonths: number;
  status: GrantStatus;
  div83aStatus: Div83AStatus | null;
  div83aLastCheckedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewGrant {
  userId: string;
  projectId: string | null;
  granteeName: string;
  granteeEmail?: string | null;
  grantDate: string;
  sharesUnderOption: number;
  strikePriceAud?: number;
  vestingYears?: number;
  cliffMonths?: number;
  notes?: string | null;
}

const VALID_STATUSES: readonly GrantStatus[] = [
  "active",
  "exercised",
  "lapsed",
  "cancelled",
];

// ---------------------------------------------------------------------------
// Row mapping (raw supabase row → domain type)
// ---------------------------------------------------------------------------

interface GrantRow {
  id: string;
  project_id: string | null;
  user_id: string;
  grantee_name: string;
  grantee_email: string | null;
  grant_date: string;
  shares_under_option: number | string;
  strike_price_aud: number | string;
  vesting_years: number;
  cliff_months: number;
  status: GrantStatus;
  div83a_status: Div83AStatus | null;
  div83a_last_checked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

function mapGrant(row: GrantRow): Grant {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    granteeName: row.grantee_name,
    granteeEmail: row.grantee_email,
    grantDate: row.grant_date,
    sharesUnderOption: toNumber(row.shares_under_option),
    strikePriceAud: toNumber(row.strike_price_aud),
    vestingYears: row.vesting_years,
    cliffMonths: row.cliff_months,
    status: row.status,
    div83aStatus: row.div83a_status,
    div83aLastCheckedAt: row.div83a_last_checked_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listGrants(
  userId: string,
  projectId: string | null,
): Promise<Grant[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from("esop_option_grants")
    .select("*")
    .eq("user_id", userId)
    .order("grant_date", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  } else {
    query = query.is("project_id", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[esop-grants] listGrants failed", error.message);
    return [];
  }
  return ((data ?? []) as GrantRow[]).map(mapGrant);
}

export async function createGrant(input: NewGrant): Promise<Grant | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("esop_option_grants")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      grantee_name: input.granteeName.trim(),
      grantee_email: input.granteeEmail?.trim() || null,
      grant_date: input.grantDate,
      shares_under_option: input.sharesUnderOption,
      strike_price_aud: input.strikePriceAud ?? 0,
      vesting_years: input.vestingYears ?? 4,
      cliff_months: input.cliffMonths ?? 12,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[esop-grants] createGrant failed", error?.message);
    return null;
  }
  return mapGrant(data as GrantRow);
}

export async function getGrant(id: string, userId: string): Promise<Grant | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("esop_option_grants")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[esop-grants] getGrant failed", error.message);
    return null;
  }
  return data ? mapGrant(data as GrantRow) : null;
}

export async function updateGrantStatus(
  id: string,
  userId: string,
  status: GrantStatus,
): Promise<boolean> {
  if (!VALID_STATUSES.includes(status)) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase
    .from("esop_option_grants")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[esop-grants] updateGrantStatus failed", error.message);
    return false;
  }
  return true;
}

export async function updateDiv83AStatus(
  id: string,
  userId: string,
  status: Div83AStatus,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase
    .from("esop_option_grants")
    .update({
      div83a_status: status,
      div83a_last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[esop-grants] updateDiv83AStatus failed", error.message);
    return false;
  }
  return true;
}

export function isValidStatus(v: unknown): v is GrantStatus {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}
