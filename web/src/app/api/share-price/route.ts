// GET /api/share-price — price per share for the active project (S26-B).
//
// Assembles the three inputs of `computeSharePrice` (lib/share-price.ts):
//   SVI      the project's svi_accounts row (viewer+, keyed on the OWNER's
//            email via scope.dataEmail) + latest snapshot dimension scores;
//            no SVI account is fine — the price falls back to connected
//            revenue or reports `no_valuation`.
//   ARR      the freshest connected MRR (Stripe / Xero, ≤ 90 days —
//            lib/valuation-mrr-bridge.ts `selectConnectedRevenue`) × 12,
//            with the provider + capture date for the "from Stripe, 3 Sep"
//            label.
//   Shares   fully diluted = issued shares (`shareholders`) + the ESOP pool
//            (`esop_pool`) of the OWNER's cap table for this project.
//
//   200 { ok, sharePrice: SharePriceResult, inputs: { svi, stage, sector, arrAud, source, issuedShares, esopPoolShares } }
//   401 / 403 / 404 scope   503 no db
//
// GET only — nothing mutates.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findSVIAccountWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { loadConnectedRevenueSignals } from "@/lib/connected-revenue";
import { selectConnectedRevenue } from "@/lib/valuation-mrr-bridge";
import { computeSharePrice, type SharePriceInput } from "@/lib/share-price";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const projectId = scope.projectId;
  const ownerId = scope.ownerUserId;

  // 1. SVI score + stage (may be absent).
  const account = await findSVIAccountWithFallback(scope.dataEmail, projectId, "id, current_svi, current_stage", { callerEmail: user.email });
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

  return NextResponse.json(
    {
      ok: true,
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
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
