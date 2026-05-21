import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";

// POST /api/ai/vesting-review — Comprehensive vesting audit (1.50 credit)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const { capTable, vestingSchedules, esopPool } = body as Record<string, unknown>;

  try {
    const result = await callAI({
      system: "You are a senior startup equity lawyer and advisor reviewing cap table and vesting for Australian startups. Return ONLY valid JSON.",
      user: `Review this startup's equity structure:\nCap Table: ${JSON.stringify(capTable)}\nVesting: ${JSON.stringify(vestingSchedules)}\nESOP: ${JSON.stringify(esopPool)}\n\nReturn JSON: {"overallScore":75,"redFlags":["..."],"improvements":["..."],"auCompliance":{"status":"compliant","notes":"..."},"vestingIssues":["..."],"esopIssues":["..."],"recommendations":["..."]}`,
      maxTokens: 1200,
    });

    const recommendation = JSON.parse(result.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return NextResponse.json({ ok: true, recommendation });
  } catch (err) {
    console.error("[blockid:ai:vesting-review]", err);
    return NextResponse.json({ ok: false, reason: "AI review failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
