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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  // Accept both legacy field names and the new partner API fields
  const startupName = (body.startupName ?? body.name ?? "") as string;
  const description = (body.description ?? body.rawText ?? body.text ?? "") as string;
  const websiteUrl = (body.websiteUrl ?? body.website ?? "") as string;
  const industry = (body.industry ?? "") as string;
  const stage = (body.stage ?? "") as string;

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

  try {
    // Enrich the text with partner-supplied metadata for better signal extraction
    const enrichedParts = [description];
    if (startupName) enrichedParts.push(`Company: ${startupName}`);
    if (websiteUrl) enrichedParts.push(`Website: ${websiteUrl}`);
    if (industry) enrichedParts.push(`Industry: ${industry}`);
    if (stage) enrichedParts.push(`Stage: ${stage}`);
    const enrichedText = enrichedParts.join("\n");

    // Run SVI analysis
    const signals = extractSignals({ rawText: enrichedText });
    const analysis = computeSVI(signals);

    // Spend credit
    await spendCredits(auth.userId, "svi_analysis", {
      source: "api",
      keyId: auth.keyId,
      startupName: startupName || undefined,
    });

    // Fetch updated balance
    const updatedAfford = await canAfford(auth.userId, "svi_analysis");

    // Build dimension array for the response
    const dimensions = analysis.subs.map((s) => ({
      key: s.key,
      label: s.label,
      score: Math.round(s.value),
    }));

    // Build top 3 gaps sorted by impact (descending)
    const topGaps = analysis.evidenceGaps
      .slice()
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3)
      .map((g) => ({
        label: g.label,
        impact: g.impact,
      }));

    return NextResponse.json({
      ok: true,
      sviScore: analysis.totalSVI,
      stage: analysis.stage,
      stageLabel: analysis.stageLabel,
      dimensions,
      topGaps,
      creditsRemaining: updatedAfford.balance,
      // Extended data for partners who want more detail
      meta: {
        version: analysis.version,
        confidence: Math.round(analysis.confidenceMultiplier * 100),
        summary: analysis.summary,
        riskFlags: analysis.riskPenalties.length,
        allGaps: analysis.evidenceGaps.slice(0, 5).map((g) => ({
          priority: g.priority,
          label: g.label,
          action: g.action,
          impact: g.impact,
        })),
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
