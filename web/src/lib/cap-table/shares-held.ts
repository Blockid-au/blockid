// S29-hardening (S28 post-ship review #12) — atomic `shareholders.shares_held`.
//
// Both issue paths (cap-table `issue_shares`, DRIP `recordDripAllocation`)
// used to read the holding, add the new shares in JS and write the sum
// back, so a register edit and a DRIP run in the same second lost one of
// the two increments. `incrementSharesHeld` calls the one-statement
// Postgres function `increment_shares_held(p_shareholder_id, p_delta)`
// (migration 0381 — SECURITY DEFINER, service_role only, rejects a result
// below zero). When the function is not deployed yet (42883 / PGRST202) it
// warns ONCE and falls back to the old read-modify-write with the holding
// the caller already read, so deploying the code before applying 0381
// cannot break production — it just keeps the race until applied.

import "server-only";

export interface SharesHeldDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Absent on a bare query-builder fake → treated as "function missing". */
  rpc?(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export interface IncrementSharesHeldArgs {
  shareholderId: string;
  /** Shares to add (negative to remove); must be a finite integer ≠ 0. */
  delta: number;
  /**
   * Holding the caller already read — used ONLY by the legacy fallback when
   * the RPC is missing (`currentSharesHeld + delta`).
   */
  currentSharesHeld: number;
  /** Extra columns the fallback UPDATE must also set (e.g. `share_class_id`). */
  fallbackExtra?: Record<string, unknown>;
  /** Extra `.eq()` guards for the fallback UPDATE (e.g. `account_id`). */
  fallbackWhere?: Record<string, unknown>;
}

export type IncrementSharesHeldResult =
  | { ok: true; newSharesHeld: number; via: "rpc" | "update" }
  | { ok: false; reason: "invalid_delta" | "below_zero" | "not_found" | "db_error"; error?: unknown };

/**
 * S29-review: the largest |delta| one call may apply (1e12 — far above any
 * real register, far below bigint and Number.MAX_SAFE_INTEGER so the value
 * survives the JSON round-trip to the RPC intact). Migration 0383 enforces
 * the same bound inside `increment_shares_held`.
 */
export const MAX_SHARES_DELTA = 1_000_000_000_000;

/** Postgres "function does not exist" / PostgREST "could not find function". */
const RPC_MISSING_CODES = new Set(["42883", "PGRST202"]);
let rpcState: "unknown" | "available" | "missing" = "unknown";

/** Test hook — forget the feature-detect result. */
export function __resetIncrementSharesHeldDetection(): void {
  rpcState = "unknown";
}

function isMissingFn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (RPC_MISSING_CODES.has(error.code ?? "")) return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}

export async function incrementSharesHeld(db: SharesHeldDb, args: IncrementSharesHeldArgs): Promise<IncrementSharesHeldResult> {
  const delta = Number(args.delta);
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_SHARES_DELTA) return { ok: false, reason: "invalid_delta" };

  if (rpcState !== "missing" && typeof db.rpc === "function") {
    let res: { data: unknown; error: { code?: string; message?: string } | null };
    try {
      res = await db.rpc("increment_shares_held", { p_shareholder_id: args.shareholderId, p_delta: delta });
    } catch (err) {
      console.error("[cap-table:shares-held] increment_shares_held threw", err);
      return { ok: false, reason: "db_error", error: err };
    }
    if (!res.error) {
      rpcState = "available";
      const n = res.data == null ? Number.NaN : Number(res.data);
      if (!Number.isFinite(n)) {
        console.error("[cap-table:shares-held] increment_shares_held returned no number", res.data);
        return { ok: false, reason: "db_error", error: res.data };
      }
      return { ok: true, newSharesHeld: n, via: "rpc" };
    }
    if (isMissingFn(res.error)) {
      // Detected once per process: later calls skip straight to the fallback.
      console.warn("[cap-table:shares-held] increment_shares_held missing — apply migration 0381; falling back to read-modify-write");
      rpcState = "missing";
    } else {
      // The function raised: below zero (check_violation 23514) or unknown
      // shareholder (no_data_found P0002) — never fall back, the write was
      // refused on purpose.
      const code = res.error.code ?? "";
      const msg = res.error.message ?? "";
      if (code === "23514" || /below zero/i.test(msg)) return { ok: false, reason: "below_zero", error: res.error };
      if (code === "P0002" || /not found/i.test(msg)) return { ok: false, reason: "not_found", error: res.error };
      console.error("[cap-table:shares-held] increment_shares_held failed", res.error);
      return { ok: false, reason: "db_error", error: res.error };
    }
  }

  // Legacy read-modify-write (pre-0381) with the holding the caller read.
  const current = Number(args.currentSharesHeld);
  const newTotal = (Number.isFinite(current) ? Math.floor(current) : 0) + delta;
  if (newTotal < 0) return { ok: false, reason: "below_zero" };
  let q = db.from("shareholders").update({ shares_held: newTotal, ...(args.fallbackExtra ?? {}) }).eq("id", args.shareholderId);
  for (const [col, val] of Object.entries(args.fallbackWhere ?? {})) q = q.eq(col, val);
  const { error } = await q;
  if (error) return { ok: false, reason: "db_error", error };
  return { ok: true, newSharesHeld: newTotal, via: "update" };
}
