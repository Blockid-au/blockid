import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/ai/equity-split — AI-suggested equity split (1.00 credit)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const { founders } = body as { founders?: Array<{ name: string; role: string; cashContribution?: number; timeCommitment?: string; ipContribution?: string; experienceYears?: number }> };
  if (!founders?.length) return NextResponse.json({ ok: false, reason: "At least 1 founder required" }, { status: 400 });

  const founderDesc = founders.map((f, i) =>
    `${i + 1}. ${f.name} (${f.role}): Cash A$${f.cashContribution ?? 0}, Time ${f.timeCommitment ?? "full-time"}, IP: ${f.ipContribution ?? "none"}, Experience: ${f.experienceYears ?? 0} years`
  ).join("\n");

  try {
    const result = await callAI({
      system: "You are an expert startup equity advisor for Australian startups. Return ONLY valid JSON.",
      user: `Given these founders:\n${founderDesc}\n\nSuggest a fair equity split using Slicing Pie methodology for AU startups. Return JSON: {"splits":[{"name":"...","percentage":X,"rationale":"..."}],"vestingRecommendation":"...","esopRecommendation":"...","warnings":["..."],"benchmarkComparison":"..."}`,
      maxTokens: 1000,
    });

    const recommendation = JSON.parse(result.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());

    if (isSupabaseConfigured()) {
      await getSupabaseAdmin()!.from("ai_equity_recommendations").insert({
        recommendation_type: "equity_split",
        input_context: { founders },
        recommendation,
        credits_charged: 1.0,
      });
    }

    return NextResponse.json({ ok: true, recommendation });
  } catch (err) {
    console.error("[blockid:ai:equity-split]", err);
    return NextResponse.json({ ok: false, reason: "AI recommendation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
