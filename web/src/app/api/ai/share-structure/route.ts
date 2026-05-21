import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";

// POST /api/ai/share-structure — AI share structure recommendation (0.75 credit)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const { currentSVI, stage, plannedRaise, teamSize } = body as Record<string, number | string | undefined>;

  try {
    const result = await callAI({
      system: "You are an expert startup share structure advisor for Australian startups. Return ONLY valid JSON.",
      user: `Recommend a share structure for: SVI Score: ${currentSVI ?? 100}, Stage: ${stage ?? "pre-seed"}, Planned raise: A$${plannedRaise ?? "not yet"}, Team size: ${teamSize ?? 1}. Return JSON: {"mode":"fixed_shares","authorizedShares":10000000,"initialSharePrice":0.01,"rationale":"...","dynamicAdvice":"..."}`,
      maxTokens: 500,
    });

    const recommendation = JSON.parse(result.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return NextResponse.json({ ok: true, recommendation });
  } catch (err) {
    console.error("[blockid:ai:share-structure]", err);
    return NextResponse.json({ ok: false, reason: "AI recommendation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
