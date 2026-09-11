import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { spendCredits } from "@/lib/credits";
import { getProjectScope, creditChargeNote } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import {
  generateDataRoom,
  composeRoomDocuments,
  documentCompleteness,
} from "@/lib/data-room";
import { computeValuation, type ValuationInput } from "@/lib/valuation";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapStage(numericStage: number): string {
  if (numericStage <= 1) return "idea";
  if (numericStage <= 2) return "validation";
  if (numericStage <= 4) return "mvp";
  return "growth";
}

// ---------------------------------------------------------------------------
// POST /api/data-room/generate — One-click Data Room Generator
//
// Compiles a structured data room from user's existing data across
// SVI accounts, analyses, metrics, cap table, and evidence vault.
// Costs 3.00 credits.
// ---------------------------------------------------------------------------

export async function POST() {
  const gate = await gateRequireFeature("data_room.access");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  // ── Project scope (S17-A) ─────────────────────────────────────────────
  // editor+ on the active project (owner always passes). The room is the
  // OWNER's (ownerUserId / dataEmail) so a co-founder regenerates the same
  // room; the 3 credits come out of the CALLER's wallet — `creditNote`.
  let scope;
  try {
    scope = await getProjectScope("editor");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;
  const ownerUserId = scope?.ownerUserId ?? user.id;
  const creditNote = creditChargeNote(scope);

  // ── Charge credits ────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, "data_room_generate", {
    email: user.email,
    project_id: projectId,
  });
  if (!spend.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        balance: spend.balance,
        cost: 3.0,
        creditNote,
      },
      { status: 402 },
    );
  }

  // ── Section 1: Company — Pull from app_users + svi_accounts ───────────
  // S17-A review (P2-2): keyed on (email, project_id) — not email alone —
  // so a member of project A compiles A's record, never whichever of the
  // owner's other startups happens to match by email.
  const sviAccountQuery = supabase
    .from("svi_accounts")
    .select("id, current_svi, current_stage, startup_name")
    .eq("email", dataEmail);
  if (projectId) sviAccountQuery.eq("project_id", projectId);
  else sviAccountQuery.is("project_id", null);
  const { data: sviAccount } = await sviAccountQuery.maybeSingle();

  // ── Section 2: Product — Pull latest SVI analysis ─────────────────────
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

  // ── Section 3: Financial — Pull from startup_metrics ──────────────────
  let metrics: Array<{ metricType: string; value: number }> | null = null;
  if (sviAccount) {
    const { data: metricsRow } = await supabase
      .from("startup_metrics")
      .select(
        "mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months",
      )
      .eq("account_id", sviAccount.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metricsRow) {
      metrics = [];
      if (metricsRow.mrr_aud != null)
        metrics.push({ metricType: "mrr", value: Number(metricsRow.mrr_aud) });
      if (metricsRow.arr_aud != null)
        metrics.push({ metricType: "arr", value: Number(metricsRow.arr_aud) });
      if (metricsRow.burn_rate_aud != null)
        metrics.push({
          metricType: "burn_rate",
          value: Number(metricsRow.burn_rate_aud),
        });
      if (metricsRow.runway_months != null)
        metrics.push({
          metricType: "runway",
          value: Number(metricsRow.runway_months),
        });
      if (metricsRow.revenue_growth_pct != null)
        metrics.push({
          metricType: "revenue_growth",
          value: Number(metricsRow.revenue_growth_pct),
        });
    }
  }

  // ── Valuation ─────────────────────────────────────────────────────────
  let valuation: { low: number; mid: number; high: number } | null = null;
  if (sviAccount) {
    // Fetch dimension scores for valuation input
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
      revenueGrowthPct: metrics?.find((m) => m.metricType === "revenue_growth")
        ?.value,
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
      valuation = {
        low: result.lowAud,
        mid: result.midAud,
        high: result.highAud,
      };
    } catch {
      // Valuation computation failed — continue without it
    }
  }

  // ── Section 5: Team — Pull from cap table shareholders ────────────────
  let capTable: {
    shareholders: Array<{ name: string; role: string; shares_held: number }>;
  } | null = null;

  const { data: holders } = await supabase
    .from("shareholders")
    .select("name, role, shares_held")
    .eq("account_id", ownerUserId)
    .order("created_at", { ascending: true });

  if (holders && holders.length > 0) {
    capTable = {
      shareholders: holders.map((h) => ({
        name: h.name as string,
        role: h.role as string,
        shares_held: Number(h.shares_held),
      })),
    };
  }

  // ── Section 6: Legal — Pull from evidence vault ───────────────────────
  let evidence: Array<{
    evidenceType: string;
    label: string;
    valueOrUrl: string;
    dimension?: string;
  }> | null = null;

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

  // ── Generate the data room ────────────────────────────────────────────
  const dataRoom = generateDataRoom({
    user: {
      email: user.email,
      displayName: user.displayName,
    },
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
  });

  // ── What "auto" actually produces ────────────────────────────────────
  //
  // A generated room used to be a checklist: 34 rows with status='complete',
  // no file_url and no template_content behind a single one of them. An
  // investor opening that sees a full checklist and empty files, which is
  // worse than an honest gap list. So the generator now writes real prose for
  // the documents BlockID can genuinely produce from data it already holds
  // (company summary, SVI breakdown, valuation, cap table, traction, evidence
  // index) and marks everything it cannot produce — signed shareholders
  // agreement, ASIC extract, accountant-prepared statements, deck, customer
  // contracts — as missing, with a concrete "what to upload" prompt.
  const composeParams = {
    user: { email: user.email, displayName: user.displayName },
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
  const documents = composeRoomDocuments(composeParams);
  const documentScore = documentCompleteness(documents);

  // Persist before returning. This endpoint charged 3 credits and then threw
  // the result away — the caller got JSON, nothing was written, and a page
  // refresh meant the founder had paid three credits for something that no
  // longer existed. Charging for a result we discard is not acceptable, so the
  // room is now saved and the row id is returned with it.
  //
  // Keyed on (user_id, project_id) so regenerating updates the founder's room
  // rather than accumulating duplicates.
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
      // Do not fail the request — the founder has already been charged and the
      // room is in the response. Log loudly so the persistence gap is visible.
      console.error("[blockid:data-room] generate persist failed", saveErr);
    } else {
      dataRoomId = (saved?.id as string | null) ?? null;
    }
  } catch (err) {
    console.error("[blockid:data-room] generate persist threw", err);
  }

  // Replace only rows this generator owns (origin='generated'). Anything the
  // founder uploaded or hand-created is origin='manual' and is never touched.
  if (dataRoomId) {
    try {
      await supabase
        .from("data_room_documents")
        .delete()
        .eq("data_room_id", dataRoomId)
        .eq("origin", "generated");

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

  return NextResponse.json({
    ok: true,
    dataRoomId,
    dataRoom,
    documents: {
      total: documents.length,
      complete: documents.filter((d) => d.status === "complete").length,
      pending: documents.filter((d) => d.status === "pending").length,
      missing: documents.filter((d) => d.status === "missing").length,
      completeness: documentScore,
    },
    creditsUsed: 3.0,
    creditNote,
    role: scope?.role ?? "owner",
    balance: spend.balance,
  });
}
