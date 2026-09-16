// Cap table → computeSVI `capTableInput` (G13-W5-R5 / S-R5, spec §C.7
// "Cap table → CGH: computeSVI gains capTableInput (founder %, ESOP %,
// investor %, vesting flag, SHA flag) from the equity register").
//
// Reads the same register GATHER reads (report-pipeline/gather.ts
// `loadCapTableSummary`: shareholders + esop_pool for the owner + project)
// and adds the SHA flag from `onchain_documents` (document_type
// shareholders_agreement, any non-failed status) — the closest "SHA on
// file" fact the schema has. Never throws: no register → null, and
// computeSVI without capTableInput is the keyword score it always was.

import type { CapTableInput } from "@/lib/svi-analysis";
import { loadCapTableSummary, type GatherDb } from "@/lib/report-pipeline/gather";

export interface CapTableInputDeps {
  loadSummary?: typeof loadCapTableSummary;
  loadShaFlag?: (db: GatherDb, ownerUserId: string) => Promise<boolean>;
}

async function defaultLoadShaFlag(db: GatherDb, ownerUserId: string): Promise<boolean> {
  try {
    const { data } = await db.from("onchain_documents").select("id, status").eq("user_id", ownerUserId).eq("document_type", "shareholders_agreement").limit(5);
    return (data ?? []).some((r) => String(r.status ?? "") !== "failed");
  } catch {
    return false;
  }
}

/** Register → CapTableInput, or null when the project has no register rows. */
export async function loadCapTableInput(db: GatherDb | null | undefined, ownerUserId: string | null | undefined, projectId: string | null | undefined, deps: CapTableInputDeps = {}): Promise<CapTableInput | null> {
  if (!db || !ownerUserId || !projectId) return null;
  try {
    const [summary, shaFlag] = await Promise.all([(deps.loadSummary ?? loadCapTableSummary)(db, ownerUserId, projectId), (deps.loadShaFlag ?? defaultLoadShaFlag)(db, ownerUserId)]);
    if (!summary) return null;
    return {
      founderPct: summary.founderPct,
      esopPct: summary.esopPct,
      investorPct: summary.investorPct,
      vestingFlag: summary.vestingFlag,
      shaFlag,
      holders: summary.holders,
    };
  } catch (err) {
    console.warn("[svi:cap-table-input] register read failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
