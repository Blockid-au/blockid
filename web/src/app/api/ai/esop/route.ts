import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";

// POST /api/ai/esop — AI ESOP pool recommendation (0.50 credit)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const { stage, teamSize, plannedHires, currentPool } = body as Record<string, number | string | undefined>;

  try {
    const result = await callAI({
      system: "You are an expert ESOP advisor for Australian startups. Return ONLY valid JSON.",
      user: `Recommend ESOP pool for: Stage: ${stage ?? "pre-seed"}, Current team: ${teamSize ?? 1}, Planned hires (12mo): ${plannedHires ?? 3}, Current pool: ${currentPool ?? "none"}%. Return JSON: {"poolPercentage":10,"grantGuidelines":[{"role":"CTO","suggestedEquity":"2-4%","vestingMonths":48}],"rationale":"...","auTaxNotes":"..."}`,
      maxTokens: 600,
    });

    const recommendation = JSON.parse(result.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return NextResponse.json({ ok: true, recommendation });
  } catch (err) {
    console.error("[blockid:ai:esop]", err);
    return NextResponse.json({ ok: false, reason: "AI recommendation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
