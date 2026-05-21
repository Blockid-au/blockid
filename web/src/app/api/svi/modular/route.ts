// POST /api/svi/modular
//
// Modular section-based analysis. Users choose which report sections they want
// and at what depth (word-count tier). Returns only the requested sections.
//
// Body: { email, rawText, sections: [{ sectionId, depth }] }
// Returns: { ok, sections: { [sectionId]: { markdown, wordCount } }, totalCredits, balance }

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { getBalance, SECTION_DEPTH_CONFIG, calculateSectionCost, type SectionDepth } from "@/lib/credits";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Valid section IDs
const VALID_SECTIONS = new Set([
  "executive", "market", "product", "business", "competition",
  "traction", "team", "financial", "risk", "recommendations",
]);

// Section metadata for AI prompt construction
const SECTION_PROMPTS: Record<string, { title: string; focus: string }> = {
  executive: {
    title: "Executive Summary",
    focus: "Overall assessment, key strengths, critical gaps, investment thesis, and headline metrics.",
  },
  market: {
    title: "Market & Problem",
    focus: "TAM/SAM/SOM, problem clarity, market timing, demand validation, and competitive landscape positioning.",
  },
  product: {
    title: "Product & Technology",
    focus: "Tech stack maturity, product-market fit signals, architecture scalability, build vs buy, and roadmap gaps.",
  },
  business: {
    title: "Business Model",
    focus: "Revenue model clarity, unit economics (ARPU, CAC, LTV), pricing strategy, monetization path, and margin projections.",
  },
  competition: {
    title: "Competition & Moat",
    focus: "Named competitors, feature-by-feature comparison, moat durability, switching costs, network effects, and defensibility.",
  },
  traction: {
    title: "Traction & Growth",
    focus: "Revenue trajectory, user growth, retention/churn, channel analysis, viral coefficient, and growth milestones.",
  },
  team: {
    title: "Team & Execution",
    focus: "Founder backgrounds, team gaps, advisory quality, domain expertise, hiring plan, and execution velocity.",
  },
  financial: {
    title: "Financial Projections",
    focus: "Revenue forecast, burn rate, runway, break-even timeline, funding requirements, and financial model assumptions.",
  },
  risk: {
    title: "Risk Assessment",
    focus: "Market risk, execution risk, technology risk, regulatory risk, financial risk, and mitigation strategies.",
  },
  recommendations: {
    title: "Recommendations",
    focus: "Top 5 priorities, 30/60/90-day action plan, quick wins, strategic pivots, and investor readiness checklist.",
  },
};

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    // Try session-based auth for non-logged-in users with email
    return NextResponse.json(
      { ok: false, error: "Authentication required. Please sign in to use modular analysis." },
      { status: 401 },
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { email?: string; rawText?: string; sections?: Array<{ sectionId?: string; depth?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = body.rawText?.trim();
  if (!rawText) {
    return NextResponse.json({ ok: false, error: "rawText is required" }, { status: 400 });
  }

  if (!Array.isArray(body.sections) || body.sections.length === 0) {
    return NextResponse.json({ ok: false, error: "At least one section is required" }, { status: 400 });
  }

  // Validate sections
  const validatedSections: Array<{ sectionId: string; depth: SectionDepth }> = [];
  for (const s of body.sections) {
    if (!s.sectionId || !VALID_SECTIONS.has(s.sectionId)) {
      return NextResponse.json(
        { ok: false, error: `Invalid section: ${s.sectionId}. Valid: ${[...VALID_SECTIONS].join(", ")}` },
        { status: 400 },
      );
    }
    const depth = (s.depth ?? "standard") as SectionDepth;
    if (!SECTION_DEPTH_CONFIG[depth]) {
      return NextResponse.json(
        { ok: false, error: `Invalid depth: ${s.depth}. Valid: ${Object.keys(SECTION_DEPTH_CONFIG).join(", ")}` },
        { status: 400 },
      );
    }
    validatedSections.push({ sectionId: s.sectionId, depth });
  }

  // ── Credit check ────────────────────────────────────────────────────────
  const cost = calculateSectionCost(validatedSections);
  const currentBalance = await getBalance(user.id);

  if (currentBalance < cost.totalCredits) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        balance: currentBalance,
        cost: cost.totalCredits,
        breakdown: cost.items,
      },
      { status: 402 },
    );
  }

  // ── Locale ──────────────────────────────────────────────────────────────
  const localeStore = await cookies();
  const locale = localeStore.get("blockid_lang")?.value === "vi" ? "vi" : "en";

  // ── Gather existing data for context (if available) ─────────────────────
  const supabase = getSupabaseAdmin();
  let startupName = "Unknown";
  let svi = 100;
  let stage = 0;
  let dimSummary = "";
  let evidenceSummary = "";

  if (supabase) {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id, startup_name, current_svi, current_stage")
      .eq("email", user.email)
      .order("last_active_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (account) {
      startupName = account.startup_name ?? "Unknown";
      svi = account.current_svi ?? 100;
      stage = account.current_stage ?? 0;

      // Dimension scores from latest analysis
      const { data: latestAnalysis } = await supabase
        .from("svi_analyses")
        .select("analysis_json")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const analysis = latestAnalysis?.analysis_json as Record<string, unknown> | null;
      const dims = analysis?.dimensionScores as Record<string, Record<string, unknown>> | undefined;
      if (dims) {
        dimSummary = Object.entries(dims)
          .map(([key, d]) => `${key.toUpperCase()}: ${d.score ?? 0}/100`)
          .join(", ");
      }

      // Evidence items
      const { data: evidenceItems } = await supabase
        .from("svi_evidence")
        .select("evidence_type, label, dimension, svi_impact, confidence_level")
        .eq("account_id", account.id)
        .limit(30);

      if (evidenceItems && evidenceItems.length > 0) {
        evidenceSummary = evidenceItems
          .map((e: Record<string, unknown>) => `- [${e.evidence_type}/${e.dimension}] ${e.label} (+${e.svi_impact} SVI)`)
          .join("\n");
      }
    }
  }

  const stageLabels = ["Concept", "Validated Idea", "MVP/Prototype", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"];

  // ── Generate each requested section ─────────────────────────────────────
  const sectionResults: Record<string, { markdown: string; wordCount: number }> = {};
  const errors: string[] = [];

  // Build all sections in a single AI call for efficiency
  const sectionInstructions = validatedSections
    .map((s) => {
      const info = SECTION_PROMPTS[s.sectionId];
      const depthConfig = SECTION_DEPTH_CONFIG[s.depth];
      return `## ${info.title}
Focus: ${info.focus}
Target length: ~${depthConfig.words} words (${depthConfig.label} depth)
Write this section to be ${depthConfig.description.toLowerCase()}.`;
    })
    .join("\n\n");

  const totalTargetWords = cost.totalWords;
  const maxTokens = Math.min(Math.max(Math.ceil(totalTargetWords * 2), 1024), 8192);

  try {
    const systemPrompt = `You are a senior startup analyst at BlockID.au writing a modular startup analysis report.

Write in a ${locale === "vi" ? "Vietnamese" : "friendly, encouraging mentor"} tone with Australian startup context (ABN, ASIC, R&D Tax Incentive, ASX, etc.).
Be specific with numbers, benchmarks, and actionable recommendations.
Format each section in clean Markdown with proper headings, bullet points, and bold text for key insights.

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "sections": {
    "<sectionId>": "<markdown content for that section>",
    ...
  }
}

Do NOT include any text before or after the JSON. Each section value should be a markdown string.`;

    const userMessage = `Generate the following report sections for this startup:

**Startup:** ${startupName}
**Current SVI Score:** ${svi}
**Stage:** ${stageLabels[stage] ?? "Unknown"} (${stage}/7)

**Startup Description:**
${rawText.slice(0, 5000)}

${dimSummary ? `**Dimension Scores:** ${dimSummary}` : ""}
${evidenceSummary ? `**Evidence:**\n${evidenceSummary}` : ""}

---

Write these sections (match the sectionId exactly in your JSON response):

${validatedSections.map((s) => {
  const info = SECTION_PROMPTS[s.sectionId];
  const depthConfig = SECTION_DEPTH_CONFIG[s.depth];
  return `**${s.sectionId}** — ${info.title}
Focus: ${info.focus}
Target: ~${depthConfig.words} words (${depthConfig.label} depth — ${depthConfig.description})`;
}).join("\n\n")}

Return as JSON: { "sections": { "sectionId": "markdown content", ... } }`;

    const { text } = await callAI({
      system: systemPrompt,
      user: userMessage,
      maxTokens,
    });

    // Parse AI response
    let parsed: { sections: Record<string, string> };
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    // Map results
    for (const s of validatedSections) {
      const content = parsed.sections?.[s.sectionId];
      if (content) {
        sectionResults[s.sectionId] = {
          markdown: content,
          wordCount: content.split(/\s+/).length,
        };
      } else {
        errors.push(`Section "${s.sectionId}" was not generated`);
      }
    }
  } catch (err) {
    console.error("[blockid:modular]", err);
    return NextResponse.json({ ok: false, error: "Analysis generation failed" }, { status: 500 });
  }

  // ── Charge credits ──────────────────────────────────────────────────────
  let newBalance = currentBalance;
  if (supabase && isSupabaseConfigured()) {
    const now = new Date().toISOString();

    // Deduct balance
    const { data: row } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_spent")
      .eq("user_id", user.id)
      .maybeSingle();

    const balance = row?.balance ?? currentBalance;
    const lifetimeSpent = row?.lifetime_spent ?? 0;
    newBalance = balance - cost.totalCredits;

    const { error: balErr } = await supabase
      .from("credit_balances")
      .upsert(
        {
          user_id: user.id,
          balance: newBalance,
          lifetime_spent: lifetimeSpent + cost.totalCredits,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );

    if (balErr) {
      console.error("[blockid:modular] balance upsert failed", balErr);
    }

    // Transaction log
    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -cost.totalCredits,
      balance_after: newBalance,
      reason: "modular_report",
      metadata: {
        sections: validatedSections,
        totalWords: cost.totalWords,
      },
    });

    // Usage log
    await supabase.from("usage_logs").insert({
      user_id: user.id,
      feature: "modular_report",
      credits_used: cost.totalCredits,
      metadata: {
        sectionCount: validatedSections.length,
        sections: validatedSections.map((s) => `${s.sectionId}:${s.depth}`),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    sections: sectionResults,
    totalCredits: cost.totalCredits,
    totalWords: cost.totalWords,
    balance: newBalance,
    breakdown: cost.items,
    ...(errors.length > 0 && { warnings: errors }),
  });
}
