// /api/data-room/auto-fill — AI Template Auto-Fill (T0098)
//
//   POST /api/data-room/auto-fill
//   body: { documentId, templateSlug, startupProfile? }
//
//   1. Load startup data (SVI analysis, metrics, cap table, evidence)
//   2. Call AI to fill template variables with actual startup data
//   3. Save filled template to data_room_documents.template_content
//   4. Update document status to 'complete'
//   5. Award 0.25 credits
//   Returns: { ok, filledContent, documentId }
//
// Cost: 0.25 credits

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { spendCredits } from "@/lib/credits";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const AUTO_FILL_COST = 0.25;

// ---------------------------------------------------------------------------
// POST /api/data-room/auto-fill
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 }
    );
  }

  let body: {
    documentId?: string;
    templateSlug?: string;
    startupProfile?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.documentId && !body.templateSlug) {
    return NextResponse.json(
      { ok: false, error: "documentId or templateSlug required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin()!;

  // ── Charge credits ─────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, "data_room_auto_fill", {
    email: user.email,
  });
  if (!spend.ok) {
    return NextResponse.json(
      { ok: false, error: "Insufficient credits", balance: spend.balance, cost: AUTO_FILL_COST },
      { status: 402 }
    );
  }

  // ── Load document + template content ──────────────────────────────────
  let templateContent: string | null = null;
  let documentName = "Template";

  if (body.documentId) {
    const { data: doc } = await supabase
      .from("data_room_documents")
      .select("id, document_name, template_content, account_id")
      .eq("id", body.documentId)
      .eq("account_id", user.id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }
    templateContent = doc.template_content as string | null;
    documentName = doc.document_name as string;
  }

  // ── Load startup data ──────────────────────────────────────────────────
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("id, current_svi, current_stage, startup_name")
    .eq("email", user.email)
    .maybeSingle();

  let startupName = (sviAccount?.startup_name as string) ?? "Our Startup";
  let sviScore = (sviAccount?.current_svi as number) ?? 0;
  let stage = (sviAccount?.current_stage as number) ?? 0;

  // Override with passed profile if provided
  if (body.startupProfile) {
    if (body.startupProfile.startup_name) startupName = body.startupProfile.startup_name as string;
    if (body.startupProfile.svi_score) sviScore = body.startupProfile.svi_score as number;
    if (body.startupProfile.stage) stage = body.startupProfile.stage as number;
  }

  // Fetch latest SVI analysis
  let analysisData: unknown = null;
  if (sviAccount) {
    const { data: analysis } = await supabase
      .from("svi_analyses")
      .select("total_svi, analysis_json, summary")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    analysisData = analysis?.analysis_json ?? null;
  }

  // Fetch metrics
  let metricsData: Record<string, number> = {};
  if (sviAccount) {
    const { data: metrics } = await supabase
      .from("startup_metrics")
      .select("mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months")
      .eq("account_id", sviAccount.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metrics) {
      metricsData = {
        mrr: Number(metrics.mrr_aud ?? 0),
        arr: Number(metrics.arr_aud ?? 0),
        revenueGrowth: Number(metrics.revenue_growth_pct ?? 0),
        churn: Number(metrics.monthly_churn_pct ?? 0),
        burnRate: Number(metrics.burn_rate_aud ?? 0),
        runway: Number(metrics.runway_months ?? 0),
      };
    }
  }

  // Fetch cap table
  const { data: shareholders } = await supabase
    .from("shareholders")
    .select("name, role, shares_held")
    .eq("account_id", user.id)
    .order("created_at", { ascending: true });

  // Fetch recent evidence
  let evidenceSummary = "";
  if (sviAccount) {
    const { data: evidence } = await supabase
      .from("svi_evidence")
      .select("evidence_type, label, value_or_url, dimension")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (evidence && evidence.length > 0) {
      evidenceSummary = evidence
        .slice(0, 20)
        .map((e) => `- [${e.dimension}] ${e.label}: ${e.value_or_url}`)
        .join("\n");
    }
  }

  // ── Build AI prompt ────────────────────────────────────────────────────
  const stageNames = ["Idea", "Validation", "MVP", "Early Revenue", "Growth", "Scale"];
  const stageName = stageNames[Math.min(stage, stageNames.length - 1)];

  const contextBlock = `
STARTUP CONTEXT:
- Startup Name: ${startupName}
- SVI Score: ${sviScore}/1000
- Stage: ${stageName} (stage ${stage})
- MRR: A$${metricsData.mrr?.toLocaleString("en-AU") ?? "N/A"}
- ARR: A$${metricsData.arr?.toLocaleString("en-AU") ?? "N/A"}
- Revenue Growth: ${metricsData.revenueGrowth ?? "N/A"}% MoM
- Burn Rate: A$${metricsData.burnRate?.toLocaleString("en-AU") ?? "N/A"}/month
- Runway: ${metricsData.runway ?? "N/A"} months
- Monthly Churn: ${metricsData.churn ?? "N/A"}%

CAP TABLE SHAREHOLDERS:
${shareholders && shareholders.length > 0
  ? shareholders.map((s) => `- ${s.name} (${s.role}): ${Number(s.shares_held).toLocaleString("en-AU")} shares`).join("\n")
  : "No shareholders recorded yet."}

EVIDENCE VAULT (recent entries):
${evidenceSummary || "No evidence recorded yet."}

ANALYSIS DATA:
${analysisData ? JSON.stringify(analysisData, null, 2).slice(0, 2000) : "No SVI analysis available."}
`.trim();

  const templateToFill = templateContent
    ?? `# ${documentName}\n\nThis document has not been populated with template content yet. Please generate a professional investor-ready version based on the startup context provided.`;

  const systemPrompt = `You are an expert Australian startup advisor helping founders prepare investor-ready documents.
You will be given a document template with [VARIABLE_NAME] placeholders and real startup data.
Your job is to fill in every placeholder with accurate, specific data from the startup context.
If data is missing for a placeholder, write a plausible placeholder that the founder can update.
Keep the document professional, concise, and investor-appropriate.
Format output as clean Markdown. Do not add extra commentary — just the filled document.`;

  const userPrompt = `Fill in this data room document template with the startup's real data:

${contextBlock}

TEMPLATE TO FILL:
${templateToFill}

Replace ALL [VARIABLE_NAME] placeholders with real data from the startup context above.
If a value isn't available, write "[NEEDS UPDATE: description of what's needed]".
Return ONLY the filled document in Markdown format.`;

  // ── Call Claude AI ─────────────────────────────────────────────────────
  let filledContent: string;

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const firstContent = response.content[0];
    filledContent =
      firstContent.type === "text"
        ? firstContent.text
        : "Failed to generate content";
  } catch (aiErr) {
    console.error("AI auto-fill error:", aiErr);
    // Fall back to contextual placeholder content
    filledContent = templateToFill.replace(
      /\[([A-Z_]+)\]/g,
      (_match, varName) => {
        const varMap: Record<string, string> = {
          STARTUP_NAME: startupName,
          SVI_SCORE: String(sviScore),
          STAGE: stageName,
          MRR: `A$${(metricsData.mrr ?? 0).toLocaleString("en-AU")}`,
          ARR: `A$${(metricsData.arr ?? 0).toLocaleString("en-AU")}`,
          RUNWAY_MONTHS: String(metricsData.runway ?? ""),
          BURN_RATE: `A$${(metricsData.burnRate ?? 0).toLocaleString("en-AU")}`,
          REPORT_DATE: new Date().toLocaleDateString("en-AU"),
        };
        return varMap[varName] ?? `[${varName}]`;
      }
    );
  }

  // ── Save to document ───────────────────────────────────────────────────
  if (body.documentId) {
    const { error: saveErr } = await supabase
      .from("data_room_documents")
      .update({
        template_content: filledContent,
        status: "complete",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.documentId)
      .eq("account_id", user.id);

    if (saveErr) {
      console.error("Failed to save filled content:", saveErr);
    }
  }

  return NextResponse.json({
    ok: true,
    filledContent,
    documentId: body.documentId ?? null,
    templateSlug: body.templateSlug ?? null,
    creditsUsed: AUTO_FILL_COST,
    balance: spend.balance,
    startupName,
    wordsGenerated: filledContent.split(/\s+/).length,
  });
}
