import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { callAI } from "@/lib/ai-client";
import { apiRoute } from "@/lib/audit/api-route";

// POST /api/ai/esop — AI ESOP pool recommendation (0.50 credit)
async function POST_handler(request: Request) {
  const gate = await gateRequireFeature("esop.manage");
  if (!gate.ok) return gate.response;

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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/ai/esop/route.ts", method: "POST" }, POST_handler);
