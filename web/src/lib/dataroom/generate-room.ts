// One-click data room compilation — the shared worker (S26-A).
//
// Until S26-A this lived inline in `api/data-room/generate` (the manual
// "Generate data room" click). Activating a fundraise round now attaches a
// data room to the round and must produce EXACTLY the room the button
// would, so the compile + persist steps moved here and both callers use
// them. The callers keep their own concerns: the route gates the feature
// flag and charges the caller's credits before calling `compileDataRoom`;
// the activation path checks for an existing room first (`findRoomForScope`)
// and never regenerates one.
//
// The Supabase read order here is the order the route's colocated FIFO
// stub replays — keep it when editing:
//   svi_accounts → svi_analyses → startup_metrics → svi_snapshots →
//   shareholders → svi_evidence → data_rooms (upsert) → data_room_documents.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateDataRoom,
  composeRoomDocuments,
  documentCompleteness,
  type DataRoom,
} from "@/lib/data-room";
import { computeValuation, type ValuationInput } from "@/lib/valuation";

export interface CompileDataRoomScope {
  /** The caller — shown as the compiler on the company summary. */
  user: { email: string; displayName: string | null };
  /** The project OWNER (data_rooms.user_id, shareholders.account_id). */
  ownerUserId: string;
  /** The owner's email — the svi_accounts key. */
  dataEmail: string;
  projectId: string | null;
}

export interface CompileDataRoomResult {
  dataRoomId: string | null;
  dataRoom: DataRoom;
  documents: {
    total: number;
    complete: number;
    pending: number;
    missing: number;
    completeness: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

function mapStage(numericStage: number): string {
  if (numericStage <= 1) return "idea";
  if (numericStage <= 2) return "validation";
  if (numericStage <= 4) return "mvp";
  return "growth";
}

/**
 * The project's existing room, if any — keyed the way the generator upserts
 * (`user_id` = owner, `project_id` = active project, null for the legacy
 * pre-project row). Returns the id or null; never creates.
 */
export async function findRoomForScope(
  supabase: Db,
  scope: Pick<CompileDataRoomScope, "ownerUserId" | "projectId">,
): Promise<{ id: string; name: string | null } | null> {
  const q = supabase.from("data_rooms").select("id, name").eq("user_id", scope.ownerUserId);
  if (scope.projectId) q.eq("project_id", scope.projectId);
  else q.is("project_id", null);
  const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const row = data as { id: string; name: string | null } | null;
  return row?.id ? { id: row.id, name: row.name ?? null } : null;
}

/**
 * Compile the room from everything BlockID already holds for the scope and
 * persist it: upsert `data_rooms` on (user_id, project_id) and replace only
 * the `origin='generated'` documents — anything the founder uploaded is
 * never touched. Persistence failures are logged, not thrown: the caller
 * may already have charged for the compile and still gets the in-memory
 * room back (`dataRoomId` null tells it nothing was written).
 */
export async function compileDataRoom(supabase: Db, scope: CompileDataRoomScope): Promise<CompileDataRoomResult> {
  const { user, ownerUserId, dataEmail, projectId } = scope;

  // ── Section 1: Company — svi_accounts keyed on (owner email, project) ──
  const sviAccountQuery = supabase
    .from("svi_accounts")
    .select("id, current_svi, current_stage, startup_name")
    .eq("email", dataEmail);
  if (projectId) sviAccountQuery.eq("project_id", projectId);
  else sviAccountQuery.is("project_id", null);
  const { data: sviAccount } = await sviAccountQuery.maybeSingle();

  // ── Section 2: Product — latest SVI analysis ──────────────────────────
  let latestAnalysis: { totalSvi: number; analysisJson: unknown } | null = null;
  if (sviAccount) {
    const { data: analysis } = await supabase
      .from("svi_analyses")
      .select("total_svi, analysis_json")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analysis) {
      latestAnalysis = {
        totalSvi: analysis.total_svi as number,
        analysisJson: analysis.analysis_json,
      };
    }
  }

  // ── Section 3: Financial — startup_metrics ────────────────────────────
  let metrics: Array<{ metricType: string; value: number }> | null = null;
  if (sviAccount) {
    const { data: metricsRow } = await supabase
      .from("startup_metrics")
      .select("mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months")
      .eq("account_id", sviAccount.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metricsRow) {
      metrics = [];
      if (metricsRow.mrr_aud != null) metrics.push({ metricType: "mrr", value: Number(metricsRow.mrr_aud) });
      if (metricsRow.arr_aud != null) metrics.push({ metricType: "arr", value: Number(metricsRow.arr_aud) });
      if (metricsRow.burn_rate_aud != null) metrics.push({ metricType: "burn_rate", value: Number(metricsRow.burn_rate_aud) });
      if (metricsRow.runway_months != null) metrics.push({ metricType: "runway", value: Number(metricsRow.runway_months) });
      if (metricsRow.revenue_growth_pct != null) {
        metrics.push({ metricType: "revenue_growth", value: Number(metricsRow.revenue_growth_pct) });
      }
    }
  }

  // ── Valuation ─────────────────────────────────────────────────────────
  let valuation: { low: number; mid: number; high: number } | null = null;
  if (sviAccount) {
    let dimensions: Record<string, number> | undefined;
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("dimension_scores")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshot?.dimension_scores) {
      dimensions = snapshot.dimension_scores as Record<string, number>;
    }

    const input: ValuationInput = {
      sviScore: (sviAccount.current_svi as number) ?? 100,
      stage: mapStage((sviAccount.current_stage as number) ?? 0),
      mrrAud: metrics?.find((m) => m.metricType === "mrr")?.value,
      arrAud: metrics?.find((m) => m.metricType === "arr")?.value,
      revenueGrowthPct: metrics?.find((m) => m.metricType === "revenue_growth")?.value,
      burnRateAud: metrics?.find((m) => m.metricType === "burn_rate")?.value,
      runwayMonths: metrics?.find((m) => m.metricType === "runway")?.value,
      dimensions: dimensions
        ? {
            ftv: dimensions.ftv,
            mpc: dimensions.mpc,
            ptd: dimensions.ptd,
            tre: dimensions.tre,
            cgh: dimensions.cgh,
            iri: dimensions.iri,
            lco: dimensions.lco,
            svm: dimensions.svm,
          }
        : undefined,
    };

    try {
      const result = computeValuation(input);
      valuation = { low: result.lowAud, mid: result.midAud, high: result.highAud };
    } catch {
      // Valuation computation failed — continue without it
    }
  }

  // ── Section 5: Team — cap table shareholders (owner + project) ────────
  let capTable: { shareholders: Array<{ name: string; role: string; shares_held: number }> } | null = null;
  const holderQuery = supabase.from("shareholders").select("name, role, shares_held").eq("account_id", ownerUserId);
  if (projectId) holderQuery.eq("project_id", projectId);
  const { data: holders } = await holderQuery.order("created_at", { ascending: true });

  if (holders && holders.length > 0) {
    capTable = {
      shareholders: holders.map((h) => ({
        name: h.name as string,
        role: h.role as string,
        shares_held: Number(h.shares_held),
      })),
    };
  }

  // ── Section 6: Legal — evidence vault ─────────────────────────────────
  let evidence: Array<{ evidenceType: string; label: string; valueOrUrl: string; dimension?: string }> | null = null;
  if (sviAccount) {
    const { data: evidenceRows } = await supabase
      .from("svi_evidence")
      .select("evidence_type, label, value_or_url, dimension")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (evidenceRows && evidenceRows.length > 0) {
      evidence = evidenceRows.map((e) => ({
        evidenceType: e.evidence_type as string,
        label: e.label as string,
        valueOrUrl: (e.value_or_url as string) ?? "",
        dimension: (e.dimension as string) ?? undefined,
      }));
    }
  }

  // ── Compile ───────────────────────────────────────────────────────────
  const composeParams = {
    user: { email: user.email, displayName: user.displayName ?? null },
    sviAccount: sviAccount
      ? {
          startupName: sviAccount.startup_name as string | null,
          currentStage: (sviAccount.current_stage as number) ?? 0,
          currentSvi: (sviAccount.current_svi as number) ?? 0,
        }
      : null,
    latestAnalysis,
    metrics,
    capTable,
    evidence,
    valuation,
  };
  const dataRoom = generateDataRoom(composeParams);
  const documents = composeRoomDocuments(composeParams);
  const documentScore = documentCompleteness(documents);

  // ── Persist: upsert on (user_id, project_id) so a regenerate updates the
  //    founder's room rather than accumulating duplicates. ───────────────
  let dataRoomId: string | null = null;
  try {
    const { data: saved, error: saveErr } = await supabase
      .from("data_rooms")
      .upsert(
        {
          user_id: ownerUserId,
          project_id: projectId,
          name: sviAccount?.startup_name ?? "Data room",
          sections: dataRoom.sections,
          completeness_score: documentScore,
          startup_name: (sviAccount?.startup_name as string | null) ?? null,
          stage: (sviAccount?.current_stage as number) ?? 0,
          last_generated_at: dataRoom.generatedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id" },
      )
      .select("id")
      .maybeSingle();

    if (saveErr) {
      console.error("[blockid:data-room] generate persist failed", saveErr);
    } else {
      dataRoomId = (saved?.id as string | null) ?? null;
    }
  } catch (err) {
    console.error("[blockid:data-room] generate persist threw", err);
  }

  // Replace only rows this generator owns (origin='generated').
  if (dataRoomId) {
    try {
      await supabase.from("data_room_documents").delete().eq("data_room_id", dataRoomId).eq("origin", "generated");

      await supabase.from("data_room_documents").insert(
        documents.map((d) => ({
          data_room_id: dataRoomId,
          account_id: ownerUserId,
          section: d.section,
          folder: d.folder,
          document_name: d.documentName,
          document_type: d.documentType,
          status: d.status,
          priority: d.priority,
          template_content: d.templateContent,
          notes: d.notes,
          origin: "generated",
          completed_at: d.status === "complete" ? new Date().toISOString() : null,
        })),
      );
    } catch (err) {
      console.error("[blockid:data-room] document write failed", err);
    }
  }

  return {
    dataRoomId,
    dataRoom,
    documents: {
      total: documents.length,
      complete: documents.filter((d) => d.status === "complete").length,
      pending: documents.filter((d) => d.status === "pending").length,
      missing: documents.filter((d) => d.status === "missing").length,
      completeness: documentScore,
    },
  };
}
