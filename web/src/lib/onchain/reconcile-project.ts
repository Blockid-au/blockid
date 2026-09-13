// S27-B — run a chain → register reconciliation for ONE project and persist
// it. Shared by POST /api/cap-table/chain-reconcile (editor+ "Run now") and
// the weekly /api/cron/chain-reconcile sweep.
//
// Inputs are the PROJECT and its OWNER's user id (the register rows —
// `shareholders` — are keyed on `account_id` = owner user id + `project_id`,
// see /api/cap-table). The token comes from `blockchain_sync_config`
// (project_id first, then the SVI account id the create-token route stored
// it under). An RPC failure is recorded as status `unreachable` with the
// error text and is never a drift.
//
// "Push register to chain" reuses the existing one-way queue
// (lib/blockchain-sync.ts `queueSyncEvent`): one `mint` per short wallet,
// one `burn` per over-credited wallet. Unknown on-chain wallets are reported
// only — removing tokens from a wallet the register does not know is a
// human decision, not a button.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queueSyncEvent } from "@/lib/blockchain-sync";
import {
  ChainUnreachableError,
  isAddress,
  readTokenHolders,
  reconcileCapTable,
  type OffChainHolder,
  type ReconcileResult,
  type RpcFetch,
} from "./read-back";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type ReconcileStatus = "in_sync" | "drift" | "unreachable";

export interface ReconciliationRow {
  id: string;
  project_id: string;
  taken_at: string;
  token_address: string | null;
  status: ReconcileStatus;
  drift_count: number;
  summary: Record<string, unknown>;
  source: "route" | "cron";
}

export interface TokenConfig {
  accountId: string;
  projectId: string | null;
  tokenAddress: string;
  tokenSymbol: string | null;
  syncEnabled: boolean;
}

export async function resolveTokenConfig(
  db: Db,
  projectId: string,
  sviAccountId?: string | null,
): Promise<TokenConfig | null> {
  const cols = "account_id, project_id, token_address, token_symbol, sync_enabled";
  const { data: byProject } = await db.from("blockchain_sync_config").select(cols).eq("project_id", projectId).maybeSingle();
  let row = byProject as Record<string, unknown> | null;
  if (!row && sviAccountId) {
    const { data } = await db.from("blockchain_sync_config").select(cols).eq("account_id", sviAccountId).maybeSingle();
    row = data as Record<string, unknown> | null;
  }
  if (!row || !isAddress(row.token_address)) return null;
  return {
    accountId: String(row.account_id),
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    tokenAddress: String(row.token_address).toLowerCase(),
    tokenSymbol: typeof row.token_symbol === "string" ? row.token_symbol : null,
    syncEnabled: Boolean(row.sync_enabled),
  };
}

export async function loadRegister(db: Db, ownerUserId: string, projectId: string): Promise<OffChainHolder[]> {
  const { data, error } = await db
    .from("shareholders")
    .select("id, name, shares_held, evm_address")
    .eq("account_id", ownerUserId)
    .eq("project_id", projectId);
  if (error) throw new Error(error.message ?? "register read failed");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    shareholderId: String(r.id),
    name: String(r.name ?? "Shareholder"),
    address: isAddress(r.evm_address) ? String(r.evm_address).toLowerCase() : null,
    shares: Number(r.shares_held ?? 0),
  }));
}

export interface RunReconcileArgs {
  projectId: string;
  ownerUserId: string;
  sviAccountId?: string | null;
  source: "route" | "cron";
  /** `true` → compute but write nothing (cron `?dry=1`). */
  dryRun?: boolean;
  fetchImpl?: RpcFetch;
}

export interface RunReconcileOutcome {
  status: ReconcileStatus | "no_token";
  tokenAddress: string | null;
  driftCount: number;
  result: ReconcileResult | null;
  error: string | null;
  row: ReconciliationRow | null;
}

export async function runProjectReconciliation(db: Db, args: RunReconcileArgs): Promise<RunReconcileOutcome> {
  const config = await resolveTokenConfig(db, args.projectId, args.sviAccountId);
  if (!config) {
    return { status: "no_token", tokenAddress: null, driftCount: 0, result: null, error: null, row: null };
  }

  const register = await loadRegister(db, args.ownerUserId, args.projectId);
  const knownAddresses = register.map((r) => r.address).filter((a): a is string => Boolean(a));

  let status: ReconcileStatus;
  let result: ReconcileResult | null = null;
  let error: string | null = null;
  let summary: Record<string, unknown>;
  try {
    const snapshot = await readTokenHolders(config.tokenAddress, { knownAddresses, fetchImpl: args.fetchImpl });
    result = reconcileCapTable(register, snapshot.holders);
    status = result.status;
    summary = { ...result, chain: { decimals: snapshot.decimals, totalSupplyShares: snapshot.totalSupplyShares, blockNumber: snapshot.blockNumber } };
  } catch (err) {
    status = "unreachable";
    error = err instanceof Error ? err.message : String(err);
    const kind = err instanceof ChainUnreachableError ? "rpc" : "read";
    summary = { error, kind, registerRows: register.length };
  }
  const driftCount = result?.totals.driftCount ?? 0;

  let row: ReconciliationRow | null = null;
  if (!args.dryRun) {
    const { data, error: insErr } = await db
      .from("cap_table_chain_reconciliations")
      .insert({
        project_id: args.projectId,
        token_address: config.tokenAddress,
        status,
        drift_count: driftCount,
        summary,
        source: args.source,
      })
      .select("id, project_id, taken_at, token_address, status, drift_count, summary, source")
      .single();
    if (insErr) throw new Error(insErr.message ?? "reconciliation insert failed");
    row = data as ReconciliationRow;
  }

  return { status, tokenAddress: config.tokenAddress, driftCount, result, error, row };
}

export async function latestReconciliation(db: Db, projectId: string): Promise<ReconciliationRow | null> {
  const { data } = await db
    .from("cap_table_chain_reconciliations")
    .select("id, project_id, taken_at, token_address, status, drift_count, summary, source")
    .eq("project_id", projectId)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ReconciliationRow | null) ?? null;
}

export interface PushOutcome {
  queued: number;
  skipped: number;
  events: Array<{ type: "mint" | "burn"; address: string; amount: number; shareholder: string }>;
}

/**
 * Queue the register → chain corrections a reconciliation result calls for.
 * Only wallet-backed rows can be pushed: `no_wallet` rows are skipped (the
 * holder needs an address first) and unknown on-chain wallets are never
 * touched. Uses the existing push queue, so the every-15-minutes
 * blockchain-sync cron executes them with the usual retries.
 */
export async function pushRegisterToChain(config: TokenConfig, result: ReconcileResult): Promise<PushOutcome> {
  const out: PushOutcome = { queued: 0, skipped: 0, events: [] };
  const plan: PushOutcome["events"] = [];
  for (const d of result.driftRows) {
    if (d.delta > 0) plan.push({ type: "mint", address: d.address, amount: d.delta, shareholder: d.shareholder });
    else if (d.delta < 0) plan.push({ type: "burn", address: d.address, amount: -d.delta, shareholder: d.shareholder });
  }
  for (const m of result.missingOnChain) {
    if (m.address && m.reason === "zero_balance" && m.shares > 0) {
      plan.push({ type: "mint", address: m.address, amount: m.shares, shareholder: m.shareholder });
    } else out.skipped += 1;
  }
  out.skipped += result.unknownOnChain.length;

  for (const ev of plan) {
    const payload = ev.type === "mint"
      ? { to: ev.address, amount: ev.amount, reason: "chain_reconcile", shareholder: ev.shareholder }
      : { from: ev.address, amount: ev.amount, reason: "chain_reconcile", shareholder: ev.shareholder };
    const r = await queueSyncEvent(config.accountId, ev.type, payload, 5);
    if (r.ok) {
      out.queued += 1;
      out.events.push(ev);
    } else out.skipped += 1;
  }
  return out;
}
