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
    const raw = await fs.readFile(path.join(root, CHAIN_STATE_FILE), "utf8");
    const s = JSON.parse(raw) as Partial<ChainVerifyState>;
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
