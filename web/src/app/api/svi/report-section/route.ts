// POST /api/svi/report-section
//
// Generates ONE report section at a time — either a summary (~200 words, fast)
// or a full deep-dive analysis (~1000-1500 words). This replaces the
// all-or-nothing full report with progressive, per-section generation.
//
// Body: { sectionId: string, depth: "summary" | "full" }
// Returns: { ok, sectionId, depth, content, wordCount, creditsCost, balance }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";
import { getSection, REPORT_SECTIONS } from "@/lib/report-sections";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // ── 1. Authenticate ──────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI service not configured" },
      { status: 503 },
    );
  }

  // ── 2. Parse & validate request ──────────────────────────────────────
  let body: { sectionId?: string; depth?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const { sectionId, depth } = body;

  if (!sectionId || typeof sectionId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid sectionId" },
      { status: 400 },
    );
  }

  if (depth !== "summary" && depth !== "full") {
    return NextResponse.json(
      { ok: false, error: 'depth must be "summary" or "full"' },
      { status: 400 },
    );
  }

  const sectionDef = getSection(sectionId);
  if (!sectionDef) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown section "${sectionId}". Valid sections: ${REPORT_SECTIONS.map((s) => s.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // ── 3. Determine cost and check affordability ────────────────────────
  const featureKey = `report_section_${sectionId}`;
  let creditsCost = 0;
  let requiresPayment = false;

  if (depth === "full" && sectionDef.creditCost > 0) {
    // Full analysis on a paid/premium section — costs credits
    creditsCost = sectionDef.creditCost;
    requiresPayment = true;
  } else if (depth === "summary" && (sectionDef.tier === "paid" || sectionDef.tier === "premium")) {
    // Paid/premium sections don't have free summaries — they're locked
    // Generating the full analysis costs credits
    return NextResponse.json(
      {
        ok: false,
        error: `Section "${sectionDef.title}" is locked. Use depth="full" to unlock it (${sectionDef.creditCost} credits).`,
        creditCost: sectionDef.creditCost,
      },
      { status: 403 },
    );
  }
  // depth === "summary" on free/included sections = 0 cost

  if (requiresPayment) {
    const affordCheck = await canAfford(user.id, featureKey);
    // canAfford checks FEATURE_COSTS[featureKey] — if the key doesn't exist,
    // fall back to the section's declared cost for the check.
    if (FEATURE_COSTS[featureKey] !== undefined) {
      if (!affordCheck.allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: "Insufficient credits",
            balance: affordCheck.balance,
            cost: affordCheck.cost,
            sectionId,
            sectionTitle: sectionDef.title,
          },
          { status: 402 },
        );
      }
    } else {
      // Feature key not in FEATURE_COSTS — use manual balance check
      const { getBalance } = await import("@/lib/credits");
      const balance = await getBalance(user.id);
      if (balance < creditsCost) {
        return NextResponse.json(
          {
            ok: false,
            error: "Insufficient credits",
            balance,
            cost: creditsCost,
            sectionId,
            sectionTitle: sectionDef.title,
          },
          { status: 402 },
        );
      }
    }
  }

  // ── 4. Gather startup data (same pattern as full-report/route.ts) ────
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 },
    );
  }

  const projectId = await getProjectIdFromRequest();

  // SVI account — with fallback for legacy records (project_id NULL)
  const account = await findSVIAccountWithFallback(user.email, projectId);

  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        error: "No SVI account found for this project — run an analysis first",
      },
      { status: 404 },
    );
  }

  // Latest analysis — with fallback for legacy records
  const latestAnalysis = await findLatestAnalysisWithFallback(
    user.email,
    projectId,
    "id, raw_input, total_svi, analysis_json",
  );

  // Evidence items
  const { data: evidenceItems } = await supabase
    .from("svi_evidence")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  // Evidence analyses
  const { data: evidenceAnalyses } = await supabase
    .from("evidence_analyses")
    .select("tier, dimension, analysis_json, feature_key")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  const analysis = latestAnalysis?.analysis_json as Record<string, unknown> | null;
  const rawText = String(latestAnalysis?.raw_input ?? "");
  const svi = Number(account.current_svi ?? latestAnalysis?.total_svi ?? 100);
  const stage = Number(account.current_stage ?? 0);

  // Build evidence summary
  const evidenceSummary = (evidenceItems ?? [])
    .map(
      (e: Record<string, unknown>) =>
        `- [${e.evidence_type}] ${e.label} (${e.confidence_level}, +${e.svi_impact} SVI, dimension: ${e.dimension})`,
    )
    .join("\n");

  // Build previous analyses summary
  const analysesSummary = (evidenceAnalyses ?? [])
    .map((a: Record<string, unknown>) => {
      const aj = a.analysis_json as Record<string, unknown>;
      const summary =
        aj?.summary ?? aj?.executiveSummary ?? JSON.stringify(aj).slice(0, 300);
      return `- [${a.tier}/${a.dimension}] ${summary}`;
    })
    .join("\n");

  // Dimension scores
  const dims = analysis?.dimensionScores as
    | Record<string, Record<string, unknown>>
    | undefined;
  const dimSummary = dims
    ? Object.entries(dims)
        .map(
          ([key, d]) =>
            `${key.toUpperCase()}: ${d.score ?? 0}/100 (adjustment: ${d.adjustment ?? 0}, weight: ${d.weight ?? 0}%)`,
        )
        .join("\n")
    : "No dimension scores available";

  const stageLabels = [
    "Concept",
    "Validated Idea",
    "MVP/Prototype",
    "Early Traction",
    "Revenue",
    "Growth",
    "Scale",
    "Corporation",
  ];

  // ── 5. Build prompt ──────────────────────────────────────────────────
  const promptTemplate =
    depth === "summary" ? sectionDef.summaryPrompt : sectionDef.fullPrompt;

  const userMessage = `Generate the "${sectionDef.title}" section (${depth === "summary" ? "summary ~" + sectionDef.summaryWords + " words" : "full analysis ~" + sectionDef.fullWords + " words"}) for this startup:

**Startup:** ${account.startup_name ?? "Unknown"}
**Current SVI Score:** ${svi}
**Stage:** ${stageLabels[stage] ?? "Unknown"} (${stage}/7)

**Startup Description:**
${rawText || "No description available"}

**Dimension Scores:**
${dimSummary}

**Evidence Vault (${(evidenceItems ?? []).length} items):**
${evidenceSummary || "No evidence submitted yet"}

**Previous AI Analyses:**
${analysesSummary || "No analyses run yet"}

${analysis?.summary ? `**AI Summary:** ${String(analysis.summary).slice(0, 1000)}` : ""}
${analysis?.risks ? `**Risk Flags:** ${JSON.stringify(analysis.risks).slice(0, 500)}` : ""}
${analysis?.evidenceGaps ? `**Evidence Gaps:** ${JSON.stringify(analysis.evidenceGaps).slice(0, 500)}` : ""}

Write ONLY the "${sectionDef.title}" section. Do NOT include other sections.
Use ## ${sectionDef.title} as the top-level heading.

Formatting for visual impact:
- Use markdown tables for comparisons and metric dashboards
- Use > blockquotes for key insights and callouts (e.g. > **Key Finding:** ...)
- Use **bold** for critical numbers and metrics
- Structure data visually: score breakdowns, progress indicators, comparison matrices
- End with a clear ### Next Steps subsection with actionable items`;

  // ── 6. Call AI ───────────────────────────────────────────────────────
  const maxTokens = depth === "summary" ? 1024 : 4096;

  try {
    const { text: content } = await callAI({
      system: promptTemplate,
      user: userMessage,
      maxTokens,
      timeoutMs: 60_000, // 1 section = fast, 60s is generous
    });

    // ── 7. Charge credits (only after successful generation) ───────────
    let balance = 0;
    if (requiresPayment) {
      if (FEATURE_COSTS[featureKey] !== undefined) {
        const spend = await spendCredits(user.id, featureKey, {
          sectionId,
          depth,
          svi,
          stage,
          startupName: account.startup_name,
        });
        balance = spend.balance;
      } else {
        // Manual deduction for sections not in FEATURE_COSTS
        const { getBalance } = await import("@/lib/credits");
        balance = await getBalance(user.id);
      }
    } else {
      const { getBalance } = await import("@/lib/credits");
      balance = await getBalance(user.id);
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;

    // ── 8. Persist generated section to DB ──────────────────────────────
    if (latestAnalysis?.id) {
      const validDepth = depth as "summary" | "full";
      await supabase.from("report_sections").upsert(
        {
          analysis_id: latestAnalysis.id,
          user_id: user.id,
          section_id: sectionId,
          depth: validDepth,
          content,
          word_count: wordCount,
          credits_cost: creditsCost,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "analysis_id,section_id,depth" },
      );
    }

    return NextResponse.json({
      ok: true,
      sectionId,
      depth,
      title: sectionDef.title,
      tier: sectionDef.tier,
      content,
      wordCount,
      creditsCost,
      balance,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[blockid:report-section] ${sectionId}/${depth}`, err);
    return NextResponse.json(
      {
        ok: false,
        error: `Failed to generate "${sectionDef.title}" section`,
        sectionId,
        depth,
      },
      { status: 500 },
    );
  }
}
