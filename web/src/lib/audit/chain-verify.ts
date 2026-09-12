// S20-A — audit_events hash-chain verification.
//
// The chain is computed in Postgres (trigger `audit_events_hash_chain`,
// 0076 + 0335). Verification also runs in Postgres — the
// `audit_events_verify_chain(p_from_id, p_limit)` RPC recomputes each
// row's curr_hash with the trigger's own expression and checks prev_hash
// linkage — so this module only pages through the RPC, folds the result,
// and persists a small state file that /api/status reads as
// `audit_chain: ok | broken | unknown`.
//
// Trust boundary — `AUDIT_CHAIN_VERIFY_FROM` / `?from=<id>`:
//   The default run is a full scan from id 0, so every row is recomputed
//   and nothing is trusted. A windowed run (from > 0) verifies rows
//   id >= from and seeds the linkage from the DB row at from-1: rows
//   BEFORE `from` are trusted as stored, and a consistent rewrite of the
//   whole prefix (tamper + recompute every hash up to and including the
//   seed row) would pass. That is why the cron cross-checks the previous
//   run's persisted checkpoint (`last_id` / `last_hash` in
//   content/reports/audit-chain-verify.json) against the live row before
//   verifying: `crossCheckCheckpoint()` fails the run as `broken` when
//   that row's curr_hash no longer equals what the last run saw. When an
//   operator advances FROM to `last_id + 1` (the incremental use), the
//   checkpoint row IS the seed row at from-1. Rotating or deleting the
//   state file resets the checkpoint — the next windowed run trusts the
//   DB prefix again; only a full scan needs no checkpoint.
//
// Pure with respect to the database: pass any object with `.rpc()`.

import { promises as fs } from "node:fs";
import path from "node:path";

export type AuditChainStatus = "ok" | "broken" | "unknown";

export interface ChainVerifyResult {
  ok: boolean;
  status: AuditChainStatus;
  /** Rows checked in this run. */
  checked: number;
  from_id: number;
  first_broken_id: number | null;
  reason: string | null;
  last_id: number | null;
  last_hash: string | null;
  pages: number;
  error?: string;
}

export interface ChainVerifyState extends ChainVerifyResult {
  ts: string;
  dry: boolean;
  duration_ms: number;
  /** Cross-check of the previous run's checkpoint (windowed runs only). */
  checkpoint?: CheckpointCheck;
}

export type CheckpointReason =
  | "checkpoint_mismatch"
  | "checkpoint_missing"
  | "checkpoint_rpc_error"
  | "no_previous_checkpoint"
  | "full_scan";

export interface CheckpointCheck {
  /** True when a comparison actually happened. */
  compared: boolean;
  /** True when not compared, or compared and matching. */
  ok: boolean;
  checkpoint_id: number | null;
  expected_hash: string | null;
  actual_hash: string | null;
  reason: CheckpointReason | null;
}

interface RpcRow {
  checked: number | null;
  first_broken_id: number | string | null;
  reason: string | null;
  last_id: number | string | null;
  last_hash: string | null;
}

export interface RpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export const CHAIN_STATE_FILE = path.join("content", "reports", "audit-chain-verify.json");
export const CHAIN_HISTORY_FILE = path.join("content", "reports", "audit-chain-history.jsonl");

/** How stale a state file may be before /api/status reports `unknown`. */
export const CHAIN_STATE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const PAGE = 5000;

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Walk the chain from `fromId` in pages of 5000 until the RPC returns a
 * short page, a break is found, or `maxRows` is reached. Never throws.
 */
export async function verifyAuditChain(opts: {
  db: RpcClient | null | undefined;
  fromId?: number;
  maxRows?: number;
}): Promise<ChainVerifyResult> {
  const fromId = Math.max(0, Math.floor(opts.fromId ?? 0));
  const maxRows = Math.max(PAGE, Math.min(opts.maxRows ?? 2_000_000, 10_000_000));
  const base: ChainVerifyResult = {
    ok: false,
    status: "unknown",
    checked: 0,
    from_id: fromId,
    first_broken_id: null,
    reason: null,
    last_id: null,
    last_hash: null,
    pages: 0,
  };
  if (!opts.db) return { ...base, error: "supabase_unavailable" };

  let cursor = fromId;
  let checked = 0;
  let lastId: number | null = null;
  let lastHash: string | null = null;
  let pages = 0;

  try {
    while (checked < maxRows) {
      const { data, error } = await opts.db.rpc("audit_events_verify_chain", {
        p_from_id: cursor,
        p_limit: PAGE,
      });
      if (error) {
        // 42883 = function does not exist (migration 0335 not applied yet).
        return { ...base, checked, last_id: lastId, last_hash: lastHash, pages, error: error.message };
      }
      pages++;
      const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined;
      if (!row) break;
      const pageChecked = row.checked ?? 0;
      checked += pageChecked;
      const broken = num(row.first_broken_id);
      if (broken !== null) {
        return {
          ok: false,
          status: "broken",
          checked,
          from_id: fromId,
          first_broken_id: broken,
          reason: row.reason ?? "unknown",
          last_id: num(row.last_id) ?? lastId,
          last_hash: row.last_hash ?? lastHash,
          pages,
        };
      }
      const pageLast = num(row.last_id);
      if (pageLast !== null) {
        lastId = pageLast;
        lastHash = row.last_hash ?? lastHash;
      }
      if (pageChecked < PAGE || pageLast === null) break;
      cursor = pageLast + 1;
    }
  } catch (err) {
    return {
      ...base,
      checked,
      last_id: lastId,
      last_hash: lastHash,
      pages,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: true,
    status: "ok",
    checked,
    from_id: fromId,
    first_broken_id: null,
    reason: null,
    last_id: lastId,
    last_hash: lastHash,
    pages,
  };
}

/**
 * Compare the previous run's persisted checkpoint (`last_id`, `last_hash`)
 * with the live row. Only meaningful for a windowed run (`fromId > 0`):
 * a full scan recomputes everything and needs no checkpoint. Uses the
 * same RPC with `p_limit = 1`, which also recomputes that one row's
 * curr_hash. Never throws; an RPC failure is reported as
 * `checkpoint_rpc_error` and treated as NOT ok (fail closed — the run
 * cannot prove the prefix is intact).
 */
export async function crossCheckCheckpoint(opts: {
  db: RpcClient | null | undefined;
  fromId: number;
  previous: Partial<Pick<ChainVerifyState, "last_id" | "last_hash" | "status">> | null | undefined;
}): Promise<CheckpointCheck> {
  const skip = (reason: CheckpointReason): CheckpointCheck => ({
    compared: false,
    ok: true,
    checkpoint_id: null,
    expected_hash: null,
    actual_hash: null,
    reason,
  });
  if (!(opts.fromId > 0)) return skip("full_scan");
  const prev = opts.previous;
  const id = prev ? num(prev.last_id) : null;
  const expected = prev?.last_hash ?? null;
  // A previous `broken` run's checkpoint is not evidence of anything.
  if (!prev || id === null || id <= 0 || !expected || prev.status === "broken") {
    return skip("no_previous_checkpoint");
  }
  const base = { compared: true, checkpoint_id: id, expected_hash: expected };
  if (!opts.db) return { ...base, ok: false, actual_hash: null, reason: "checkpoint_rpc_error" };
  try {
    const { data, error } = await opts.db.rpc("audit_events_verify_chain", { p_from_id: id, p_limit: 1 });
    if (error) return { ...base, ok: false, actual_hash: null, reason: "checkpoint_rpc_error" };
    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined;
    const rowId = row ? num(row.last_id) : null;
    const broken = row ? num(row.first_broken_id) : null;
    // The RPC returns the first row with id >= checkpoint; a different id
    // (or none, or that row failing its own recompute) means the
    // checkpoint row is gone.
    if (!row || rowId !== id || broken !== null) {
      return { ...base, ok: false, actual_hash: row?.last_hash ?? null, reason: "checkpoint_missing" };
    }
    const actual = row.last_hash ?? null;
    if (actual !== expected) return { ...base, ok: false, actual_hash: actual, reason: "checkpoint_mismatch" };
    return { ...base, ok: true, actual_hash: actual, reason: null };
  } catch {
    return { ...base, ok: false, actual_hash: null, reason: "checkpoint_rpc_error" };
  }
}

/** Fold a failed checkpoint into the run result: the chain is `broken` at the checkpoint row. */
export function applyCheckpoint(result: ChainVerifyResult, checkpoint: CheckpointCheck): ChainVerifyResult {
  if (checkpoint.ok || result.status === "broken") return result;
  return {
    ...result,
    ok: false,
    status: "broken",
    first_broken_id: checkpoint.checkpoint_id,
    reason: checkpoint.reason ?? "checkpoint_mismatch",
  };
}

/** The last persisted run, or `null` when missing / unparsable. Never throws. */
export async function readChainState(root: string = process.cwd()): Promise<Partial<ChainVerifyState> | null> {
  try {
    const raw = await fs.readFile(path.join(root, CHAIN_STATE_FILE), "utf8");
    const s = JSON.parse(raw) as unknown;
    return s && typeof s === "object" ? (s as Partial<ChainVerifyState>) : null;
  } catch {
    return null;
  }
}

/** Persist the run for /api/status + history. Never throws. */
export async function persistChainState(
  state: ChainVerifyState,
  root: string = process.cwd(),
): Promise<boolean> {
  try {
    const file = path.join(root, CHAIN_STATE_FILE);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(state, null, 2) + "\n");
    await fs.appendFile(path.join(root, CHAIN_HISTORY_FILE), JSON.stringify(state) + "\n");
    return true;
  } catch (err) {
    console.error("[blockid:audit] chain state write failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Read the last persisted run and reduce it to the status /api/status
 * shows. `unknown` when missing, unparsable, or older than 48h.
 */
export async function readChainStatus(
  root: string = process.cwd(),
  now: number = Date.now(),
): Promise<{ status: AuditChainStatus; ts: string | null; checked: number | null; first_broken_id: number | null }> {
  try {
    const s = await readChainState(root);
    if (!s) return { status: "unknown", ts: null, checked: null, first_broken_id: null };
    const t = s.ts ? new Date(s.ts).getTime() : Number.NaN;
    if (!Number.isFinite(t) || now - t > CHAIN_STATE_MAX_AGE_MS) {
      return { status: "unknown", ts: s.ts ?? null, checked: null, first_broken_id: null };
    }
    const status: AuditChainStatus =
      s.status === "ok" || s.status === "broken" ? s.status : "unknown";
    return {
      status,
      ts: s.ts ?? null,
      checked: typeof s.checked === "number" ? s.checked : null,
      first_broken_id: typeof s.first_broken_id === "number" ? s.first_broken_id : null,
    };
  } catch {
    return { status: "unknown", ts: null, checked: null, first_broken_id: null };
  }
}
