// Startup Package — reservation helper (server-only).
//
// Thin insert-or-update wrapper around `startup_package_reserved_allocations`.
// Subgoal 1 (types + repo) may replace this with a shared helper — if so,
// merge conflicts should be resolved to prefer that canonical version.
// Keeping this scoped to the reservation route lets subgoals 6/7/8 compile
// in isolation.
//
// Contract:
//   - One reservation row per project. `pct_reserved` clamped [10, 100].
//   - `ticker_hint` normalised to uppercase 3-4 letters; validated against
//     the RESERVED_PACKAGE_TICKERS list below (mirrors the guard baked into
//     `lib/ai-equity.ts:aiSuggestTicker`).
//   - Also stamps `projects.package_ticker` so downstream surfaces (public
//     `/startup/[slug]`, showcase widgets) can find the ticker without a
//     second query.
//
// SUBGOAL 8 (spawn-agent-v-d-ng-cosmic-aho plan).

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Tickers that must NOT be picked as `ticker_hint`. Mirrors the list baked
 * into `lib/ai-equity.ts:aiSuggestTicker` so the human path can't circumvent
 * the AI guard.
 */
export const RESERVED_PACKAGE_TICKERS: readonly string[] = Object.freeze([
  "BID",
  "ETH",
  "BTC",
  "USDT",
  "USDC",
  "USD",
  "AUD",
]);

export interface ReservationInput {
  projectId: string;
  pct_reserved: number;
  ticker_hint: string;
}

export interface ReservationRow {
  id: string;
  project_id: string;
  pct_reserved: number;
  ticker_hint: string | null;
  on_chain_token_id: string | null;
  opt_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReservationResult =
  | { ok: true; row: ReservationRow }
  | { ok: false; error: string; field?: "pct_reserved" | "ticker_hint" };

/**
 * Validate + insert-or-update a reserved-allocation row for a project.
 * Also mirrors the ticker into `projects.package_ticker` so downstream
 * surfaces don't need a JOIN.
 */
export async function upsertReservedAllocation(
  input: ReservationInput,
): Promise<ReservationResult> {
  // ── validation ─────────────────────────────────────────────────────────
  if (!input.projectId || typeof input.projectId !== "string") {
    return { ok: false, error: "projectId is required" };
  }
  const pct = Math.round(input.pct_reserved);
  if (!Number.isFinite(pct) || pct < 10 || pct > 100) {
    return {
      ok: false,
      error: "pct_reserved must be between 10 and 100.",
      field: "pct_reserved",
    };
  }
  const ticker = (input.ticker_hint ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3,4}$/.test(ticker)) {
    return {
      ok: false,
      error: "ticker_hint must be 3-4 uppercase letters (A-Z).",
      field: "ticker_hint",
    };
  }
  if (RESERVED_PACKAGE_TICKERS.includes(ticker)) {
    return {
      ok: false,
      error: `Ticker "${ticker}" is reserved. Try a different symbol.`,
      field: "ticker_hint",
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Service unavailable" };
  }

  const now = new Date().toISOString();

  // ── upsert (natural key: project_id) ───────────────────────────────────
  const { data: existing } = await supabase
    .from("startup_package_reserved_allocations")
    .select("id")
    .eq("project_id", input.projectId)
    .maybeSingle();

  let row: ReservationRow | null = null;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("startup_package_reserved_allocations")
      .update({
        pct_reserved: pct,
        ticker_hint: ticker,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id, project_id, pct_reserved, ticker_hint, on_chain_token_id, opt_in_at, created_at, updated_at")
      .maybeSingle();
    if (error) {
      return { ok: false, error: `update_failed:${error.message}` };
    }
    row = (data as ReservationRow | null) ?? null;
  } else {
    const { data, error } = await supabase
      .from("startup_package_reserved_allocations")
      .insert({
        project_id: input.projectId,
        pct_reserved: pct,
        ticker_hint: ticker,
        created_at: now,
        updated_at: now,
      })
      .select("id, project_id, pct_reserved, ticker_hint, on_chain_token_id, opt_in_at, created_at, updated_at")
      .maybeSingle();
    if (error) {
      return { ok: false, error: `insert_failed:${error.message}` };
    }
    row = (data as ReservationRow | null) ?? null;
  }

  if (!row) {
    return { ok: false, error: "row_missing_after_write" };
  }

  // Mirror onto projects.package_ticker — fail-soft (best-effort).
  await supabase
    .from("projects")
    .update({ package_ticker: ticker })
    .eq("id", input.projectId);

  return { ok: true, row };
}
