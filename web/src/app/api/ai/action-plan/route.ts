import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SVIAnalysis, SVISubScore } from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";

interface ActionPlanItem {
  title: string;
  why: string;
  how: string;
  dimension: string;
  link: { label: string; href: string };
  impact: "high" | "medium" | "low";
}

interface ActionPlanPayload {
  generatedAt: string;
  totalSVI: number;
  actions: ActionPlanItem[];
}

function fallbackPlan(analysis: SVIAnalysis): ActionPlanPayload {
  const sorted = [...(analysis.subs ?? [])].sort((a, b) => a.value - b.value);
  const weakest = sorted.slice(0, 3);
  const actions: ActionPlanItem[] = weakest.map((s, i) => ({
    title: `Lift ${s.label}`,
    why: s.gaps?.[0] ?? `${s.label} is your lowest-scoring dimension at ${s.value}/100.`,
    how: actionFor(s),
    dimension: s.label,
    link: linkFor(s),
    impact: i === 0 ? "high" : i === 1 ? "medium" : "low",
  }));
  return {
    generatedAt: new Date().toISOString(),
    totalSVI: analysis.totalSVI,
    actions,
  };
}

function actionFor(s: SVISubScore): string {
  const k = s.label.toLowerCase();
  if (k.includes("traction") || k.includes("revenue"))
    return "Connect Stripe or upload 3 paid invoices to evidence early revenue.";
  if (k.includes("cap table") || k.includes("governance"))
    return "Use the BlockID cap-table tool to model founder splits + ESOP.";
  if (k.includes("investor"))
    return "Upload your pitch deck and 3-year financial model to the data room.";
  if (k.includes("product") || k.includes("technical"))
    return "Link your GitHub repo or live product URL as proof of build velocity.";
  if (k.includes("legal") || k.includes("compliance"))
    return "Add ABN/ACN, IP register, and trademark status to legal evidence.";
  if (k.includes("market"))
    return "Capture 5 customer interviews + a one-page TAM/SAM/SOM brief.";
  if (k.includes("moat") || k.includes("strategic"))
    return "Document your defensible advantage in a 1-page moat memo.";
  if (k.includes("founder") || k.includes("team"))
    return "Add named advisors and link founder LinkedIn profiles.";
  return "Add structured evidence to lift this dimension.";
}

function linkFor(s: SVISubScore): { label: string; href: string } {
  const k = s.label.toLowerCase();
  if (k.includes("cap table") || k.includes("governance"))
    return { label: "Open Cap Table", href: "/workspace/cap-table" };
  if (k.includes("traction") || k.includes("revenue"))
    return { label: "Add Revenue", href: "/workspace/revenue" };
  if (k.includes("investor"))
    return { label: "Open Data Room", href: "/workspace/data-room" };
  if (k.includes("legal") || k.includes("compliance"))
    return { label: "Add Legal Docs", href: "/workspace/documents" };
  if (k.includes("product") || k.includes("technical"))
    return { label: "Add Product Evidence", href: "/workspace/evidence" };
  if (k.includes("market"))
    return { label: "Add Market Evidence", href: "/workspace/evaluation" };
  if (k.includes("founder") || k.includes("team"))
    return { label: "Add Team Evidence", href: "/workspace/shareholders" };
  return { label: "Open Evidence Vault", href: "/workspace/evidence" };
}

function parsePlan(text: string, analysis: SVIAnalysis): ActionPlanPayload | null {
  try {
    const clean = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.actions)) return null;
    const actions: ActionPlanItem[] = parsed.actions.slice(0, 3).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => ({
        title: String(a.title ?? "").slice(0, 120),
        why: String(a.why ?? "").slice(0, 280),
        how: String(a.how ?? "").slice(0, 280),
        dimension: String(a.dimension ?? "Overall"),
        link: a.link?.href
          ? { label: String(a.link.label ?? "Open"), href: String(a.link.href) }
          : linkFor({ label: String(a.dimension ?? "") } as SVISubScore),
        impact:
          a.impact === "high" || a.impact === "medium" || a.impact === "low"
            ? a.impact
            : "medium",
      }),
    );
    if (actions.length === 0) return null;
    return {
      generatedAt: new Date().toISOString(),
      totalSVI: analysis.totalSVI,
      actions,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );

  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "Storage unavailable" },
      { status: 500 },
    );
  }

  const { data: latest } = await supabase
    .from("svi_analyses")
    .select("id, analysis_json, total_svi, created_at")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.analysis_json) {
    return NextResponse.json({ ok: false, reason: "No SVI yet" }, { status: 404 });
  }

  const analysis = latest.analysis_json as SVIAnalysis;

  if (!force) {
    const { data: cached } = await supabase
      .from("report_sections")
      .select("content, created_at")
      .eq("analysis_id", latest.id)
      .eq("section_id", "ai_action_plan")
      .eq("depth", "summary")
      .maybeSingle();
    if (cached?.content) {
      try {
        const parsed = JSON.parse(cached.content as string) as ActionPlanPayload;
        return NextResponse.json({ ok: true, plan: parsed, cached: true });
      } catch {
        // fall through to regenerate
      }
    }
  }

  let plan: ActionPlanPayload | null = null;
  try {
    const dimSummary = (analysis.subs ?? [])
      .map((s) => `- ${s.label}: ${s.value}/100. Evidence: ${s.evidence?.slice(0, 2).join("; ") || "none"}. Gaps: ${s.gaps?.slice(0, 2).join("; ") || "none"}`)
      .join("\n");
    const result = await callAI({
      system:
        "You are an Australian startup investor and advisor. Reply ONLY with valid JSON. No prose.",
      user: `Founder current SVI: ${analysis.totalSVI}. Stage: ${analysis.stageLabel}.\n\nDimensions:\n${dimSummary}\n\nReturn the top 3 highest-leverage actions this Australian founder should take this week to lift their SVI. Each action must be specific, AU-relevant (e.g. ASIC, ESIC, R&D Tax Incentive, AusIndustry, ESVCLP, AU SAFE/MFN, Series A norms), and link to one of these tools: /workspace/evidence, /workspace/cap-table, /workspace/data-room, /workspace/revenue, /workspace/documents, /workspace/shareholders, /tools/safe-calculator, /tools/dilution, /tools/cap-table, /tools/esic, /tools/rnd-tax, /tools/term-sheet, /tools/idea-valuation.\n\nReturn JSON: {"actions":[{"title":"...","why":"...","how":"...","dimension":"...","impact":"high|medium|low","link":{"label":"...","href":"/workspace/..."}}]}.`,
      maxTokens: 900,
      timeoutMs: 30000,
    });
    plan = parsePlan(result.text, analysis);
  } catch (err) {
    console.error("[blockid:ai:action-plan] AI failed", err);
  }

  if (!plan) plan = fallbackPlan(analysis);

  await supabase.from("report_sections").upsert(
    {
      analysis_id: latest.id,
      user_id: user.id,
      section_id: "ai_action_plan",
      depth: "summary",
      content: JSON.stringify(plan),
      word_count: plan.actions.length,
      credits_cost: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "analysis_id,section_id,depth" },
  );

  return NextResponse.json({ ok: true, plan, cached: false });
}
