// Price per share for a project scope — the server assembly behind
// GET /api/share-price (S26-B), lifted into a lib in S28-A so the dividend
// issue flow can price a DRIP allotment off the same blend.
//
//   SVI      the project's svi_accounts row (keyed on the OWNER's email via
//            scope.dataEmail) + latest snapshot dimension scores; absent is
//            fine — the price falls back to connected revenue or reports
//            `no_valuation`.
//   ARR      the freshest connected MRR (Stripe / Xero, ≤ 90 days —
//            lib/valuation-mrr-bridge.ts `selectConnectedRevenue`) × 12.
//   Shares   fully diluted = issued shares (`shareholders`) + the ESOP pool
//            (`esop_pool`) of the OWNER's cap table for this project.

import "server-only";
import { findSVIAccountWithFallback, type ProjectScope } from "@/lib/projects";
import { loadConnectedRevenueSignals } from "@/lib/connected-revenue";
import { selectConnectedRevenue } from "@/lib/valuation-mrr-bridge";
import { computeSharePrice, type SharePriceInput, type SharePriceResult } from "@/lib/share-price";
import { primeSectorMultiples } from "@/lib/valuation/sector-multiples";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Numeric SVI stage (0-7) → the valuation engine's stage key (same map as api/valuation). */
export function mapStage(numericStage: number | null | undefined): string {
  const s = typeof numericStage === "number" && Number.isFinite(numericStage) ? numericStage : 0;
  if (s <= 1) return "idea";
  if (s <= 2) return "validation";
  if (s <= 4) return "mvp";
  return "growth";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

export interface SharePriceForScope {
  sharePrice: SharePriceResult;
  inputs: {
    svi: number | null;
    stage: string;
    sector: string | null;
    arrAud: number | null;
    source: { provider: string; capturedAt: string | null; mrrAud: number } | null;
    issuedShares: number;
    esopPoolShares: number;
  };
}

type ScopeLike = Pick<ProjectScope, "projectId" | "ownerUserId" | "dataEmail"> & { project: { stage?: number | null; industry?: string | null } };

export async function loadSharePriceForScope(supabase: Db, scope: ScopeLike, caller: { email: string }): Promise<SharePriceForScope> {
  // S27-C: admin-approved sector-multiple overrides (cached 10 min) feed vcBenchmark().
  await primeSectorMultiples();
  const projectId = scope.projectId;
  const ownerId = scope.ownerUserId;

  // 1. SVI score + stage (may be absent).
  const account = await findSVIAccountWithFallback(scope.dataEmail, projectId, "id, current_svi, current_stage", { callerEmail: caller.email });
  const svi = account && typeof account.current_svi === "number" ? (account.current_svi as number) : null;
  const stage = mapStage((account?.current_stage as number | null | undefined) ?? scope.project.stage);

  let dimensions: SharePriceInput["dimensions"] = null;
  if (account?.id) {
    const { data: snapshot } = await supabase.from("svi_snapshots").select("dimension_scores").eq("account_id", account.id).order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
    const ds = (snapshot as { dimension_scores?: unknown } | null)?.dimension_scores;
    if (ds && typeof ds === "object") dimensions = ds as Record<string, number>;
  }

  // 2. Fully diluted shares of the owner's cap table for this project.
  const [{ data: holders }, { data: pools }] = await Promise.all([
    supabase.from("shareholders").select("shares_held, project_id, account_id").eq("account_id", ownerId).eq("project_id", projectId),
    supabase.from("esop_pool").select("total_pool_shares, project_id, account_id").eq("account_id", ownerId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
  ]);
  const holderRows = ((holders as Array<{ shares_held: unknown; project_id?: string | null; account_id?: string }> | null) ?? []).filter((h) => h && h.account_id === ownerId && (!h.project_id || h.project_id === projectId));
  const issuedShares = holderRows.reduce((sum, h) => sum + num(h.shares_held), 0);
  const poolRow = ((pools as Array<{ total_pool_shares: unknown; project_id?: string | null; account_id?: string }> | null) ?? []).find((p) => p && p.account_id === ownerId && (!p.project_id || p.project_id === projectId)) ?? null;
  const esopPoolShares = poolRow ? num(poolRow.total_pool_shares) : 0;

  // 3. Connected revenue — freshest usable signal.
  const signals = await loadConnectedRevenueSignals(supabase, { userId: ownerId, projectId, accountId: (account?.id as string | undefined) ?? null });
  const { signal } = selectConnectedRevenue(signals);
  const arrAud = signal ? Math.round(signal.mrrAud * 12) : null;

  const sector = scope.project.industry ?? null;
  const sharePrice = computeSharePrice({
    svi,
    stage,
    sector,
    dimensions,
    arrAud,
    fullyDilutedShares: issuedShares + esopPoolShares,
    revenueSource: signal ? { kind: signal.provider, takenAt: signal.capturedAt } : null,
  });

  return {
    sharePrice,
    inputs: {
      svi,
      stage,
      sector,
      arrAud,
      source: signal ? { provider: signal.provider, capturedAt: signal.capturedAt, mrrAud: signal.mrrAud } : null,
      issuedShares,
      esopPoolShares,
    },
  };
}

/** The mid price when the blend is usable, else null (no valuation / no shares → DRIP pays cash). */
export async function loadSharePriceMidForScope(supabase: Db, scope: ScopeLike, caller: { email: string }): Promise<number | null> {
  try {
    const { sharePrice } = await loadSharePriceForScope(supabase, scope, caller);
    const mid = sharePrice.pricePerShare.midAud;
    return sharePrice.ok && Number.isFinite(mid) && mid > 0 ? mid : null;
  } catch (err) {
    console.error("[share-price] mid lookup failed", err);
    return null;
  }
}
