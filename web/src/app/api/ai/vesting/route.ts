import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { callAI } from "@/lib/ai-client";
import { apiRoute } from "@/lib/audit/api-route";

// POST /api/ai/vesting — AI vesting schedule recommendation (0.50 credit)
async function POST_handler(request: Request) {
  const gate = await gateRequireFeature("vesting.write");
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const { role, stage, contribution, existingTerms } = body as Record<string, string | undefined>;

  try {
    const result = await callAI({
      system: "You are an expert startup vesting advisor for Australian startups. Return ONLY valid JSON.",
      user: `Recommend a vesting schedule for: Role: ${role ?? "co-founder"}, Stage: ${stage ?? "pre-seed"}, Contribution: ${contribution ?? "full-time"}, Existing terms: ${existingTerms ?? "none"}. Return JSON: {"vestingType":"linear","cliffMonths":12,"totalMonths":48,"accelerationTerms":"double trigger recommended","rationale":"...","auCompliance":"..."}`,
      maxTokens: 500,
    });

    const recommendation = JSON.parse(result.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return NextResponse.json({ ok: true, recommendation });
  } catch (err) {
    console.error("[blockid:ai:vesting]", err);
    return NextResponse.json({ ok: false, reason: "AI recommendation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/ai/vesting/route.ts", method: "POST" }, POST_handler);
