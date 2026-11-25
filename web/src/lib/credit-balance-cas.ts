// credit-balance-cas — compare-and-set adjustments of credit_balances (G36-B).
//
// Several writers did read → compute → write the ABSOLUTE balance
// (`update({ balance: read + delta })` / `upsert`), so a concurrent spend or
// grant between the read and the write was silently overwritten: a grant
// racing a debit erased the debit (free credits), two grants lost one, and a
// "reversal" that restored `balance: <value read before the debit>` erased
// every change made in between. This helper writes the new value only while
// the row still holds the balance it read (`.eq("balance", read)`), and
// re-reads on contention.
//
// Use spend_credits_atomic (lib/credits.ts) for ordinary debits — it is one
// SQL statement. This helper is for the paths that cannot use that RPC
// (grants, reversals, the report-redeem debit that books its own ledger).

/** Minimal PostgREST surface the helper needs (supabase-js and the test fakes both satisfy it). */
type Res = { data: unknown; error: { code?: string; message?: string } | null };
interface Q extends PromiseLike<Res> {
  eq(col: string, val: unknown): Q;
  select(cols?: string): Q;
  maybeSingle(): PromiseLike<Res>;
}
export interface CasDb {
  from(table: string): {
    select(cols: string): Q;
    update(patch: Record<string, unknown>): Q;
    insert(row: Record<string, unknown>): Q;
  };
}

export type LifetimeColumn = "lifetime_earned" | "lifetime_spent";

export interface AdjustOptions {
  /** Which lifetime counter moves with the balance, and by how much (may be negative; floored at 0). */
  lifetime?: { column: LifetimeColumn; delta: number };
  /** Refuse (no write) when the new balance would drop below zero. */
  requireNonNegative?: boolean;
  /**
   * Clamp the new balance at zero instead of refusing (admin revoke: take
   * whatever is left). The applied change is `balance - before`.
   */
  clampAtZero?: boolean;
  /** Contention retries before giving up (default 5). */
  maxAttempts?: number;
}

export type AdjustResult =
  | { ok: true; before: number; balance: number }
  | { ok: false; reason: "insufficient" | "contention" | "db_error"; balance: number; error?: string };

/** numeric(10,2) — keep JS float noise out of the stored value and the CAS comparison. */
export function roundCredits(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Add `delta` (negative = debit) to a user's balance with compare-and-set.
 * Creates the row when none exists and delta >= 0.
 */
export async function adjustCreditBalance(
  db: CasDb,
  userId: string,
  delta: number,
  opts: AdjustOptions = {},
): Promise<AdjustResult> {
  const attempts = Math.max(1, opts.maxAttempts ?? 5);
  const lifeCol = opts.lifetime?.column;
  const cols = lifeCol ? `balance, ${lifeCol}` : "balance";
  let last = 0;

  for (let i = 0; i < attempts; i++) {
    const read = await db.from("credit_balances").select(cols).eq("user_id", userId).maybeSingle();
    if (read.error) return { ok: false, reason: "db_error", balance: last, error: read.error.message };
    const row = read.data as Record<string, unknown> | null;
    const now = new Date().toISOString();

    if (!row) {
      if (delta < 0 && opts.requireNonNegative) return { ok: false, reason: "insufficient", balance: 0 };
      if (delta < 0 && opts.clampAtZero) return { ok: true, before: 0, balance: 0 }; // nothing to take
      const insertRow: Record<string, unknown> = { user_id: userId, balance: roundCredits(delta), updated_at: now };
      if (lifeCol) insertRow[lifeCol] = roundCredits(Math.max(0, opts.lifetime!.delta));
      const ins = await db.from("credit_balances").insert(insertRow);
      if (!ins.error) return { ok: true, before: 0, balance: roundCredits(delta) };
      if (ins.error.code === "23505") continue; // a concurrent first write created the row — re-read
      return { ok: false, reason: "db_error", balance: 0, error: ins.error.message };
    }

    const before = Number(row.balance ?? 0);
    last = before;
    const raw = roundCredits(before + delta);
    const next = opts.clampAtZero ? Math.max(0, raw) : raw;
    if (opts.requireNonNegative && next < 0) return { ok: false, reason: "insufficient", balance: before };

    const patch: Record<string, unknown> = { balance: next, updated_at: now };
    if (lifeCol) patch[lifeCol] = roundCredits(Math.max(0, Number(row[lifeCol] ?? 0) + opts.lifetime!.delta));
    const upd = await db
      .from("credit_balances")
      .update(patch)
      .eq("user_id", userId)
      .eq("balance", row.balance ?? 0)
      .select("balance");
    if (upd.error) return { ok: false, reason: "db_error", balance: before, error: upd.error.message };
    if (Array.isArray(upd.data) && upd.data.length > 0) return { ok: true, before, balance: next };
    // Zero rows: another writer moved the balance since our read — retry on the fresh value.
  }
  return { ok: false, reason: "contention", balance: last };
}
