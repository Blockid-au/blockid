import { NextResponse } from "next/server";
import { authenticateAPIKey } from "@/lib/api-auth";
import { extractSignals, computeSVI } from "@/lib/svi-analysis";
import { canAfford, spendCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Authenticate via API key
  const auth = await authenticateAPIKey(request);
  if (!auth) {
    return NextResponse.json(
      {
        error: {
          code: "unauthorized",
          message:
            "Invalid or missing API key. Use 'Authorization: Bearer bk_live_...' header.",
        },
      },
      { status: 401 },
    );
  }

  // Credit check
  const affordCheck = await canAfford(auth.userId, "svi_analysis");
  if (!affordCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "insufficient_credits",
          message: "Not enough credits",
          balance: affordCheck.balance,
        },
      },
      { status: 402 },
    );
  }

  try {
    const body = await request.json();
    const description = body.description ?? body.rawText ?? body.text;

    if (!description?.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "description field is required",
          },
        },
        { status: 400 },
      );
    }

    // Run SVI analysis
    const signals = extractSignals({ rawText: description });
    const analysis = computeSVI(signals);

    // Spend credit
    await spendCredits(auth.userId, "svi_analysis", {
      source: "api",
      keyId: auth.keyId,
    });

    // Fetch updated balance
    const updatedAfford = await canAfford(auth.userId, "svi_analysis");

    return NextResponse.json({
      ok: true,
      data: {
        svi: analysis.totalSVI,
        stage: analysis.stage,
        stageLabel: analysis.stageLabel,
        confidence: Math.round(analysis.confidenceMultiplier * 100),
        summary: analysis.summary,
        dimensions: Object.fromEntries(
          analysis.subs.map((s) => [
            s.key,
            {
              score: Math.round(s.value),
              adjustment: s.adjustment,
              label: s.label,
            },
          ]),
        ),
        evidenceGaps: analysis.evidenceGaps.slice(0, 5).map((g) => ({
          priority: g.priority,
          label: g.label,
          action: g.action,
          impact: g.impact,
        })),
        riskFlags: analysis.riskPenalties.length,
      },
      meta: {
        version: analysis.version,
        creditsRemaining: updatedAfford.balance,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: { code: "analysis_failed", message: String(err) },
      },
      { status: 500 },
    );
  }
}
