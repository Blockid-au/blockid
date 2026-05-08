import { NextResponse } from "next/server";
import { renderScorePdf, type ScorePdfData } from "@/lib/pdf/score-pdf";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// GET /s/[slug]/pdf
// Streams an application/pdf rendering of the Investor-Ready Score.
// If Supabase isn't configured (or the slug starts with `demo-`), we render
// a baked-in demo so the dev / preview UX still works.

export const dynamic = "force-dynamic";

const DEMO: Omit<ScorePdfData, "slug" | "shareUrl"> = {
  totalScore: 82,
  scoreVersion: "2.0.0",
  confidenceScore: 78,
  companyName: "Acme Co Pty Ltd",
  email: "founder@acme.au",
  subScores: [
    { label: "Financials", value: 78 },
    { label: "Cap Table Hygiene", value: 86 },
    { label: "Governance", value: 72 },
    { label: "Founder Background", value: 88 },
    { label: "Documentation", value: 80 },
  ],
  missingInputs: ["Audited financials not confirmed"],
  actionPlan: [
    {
      title: "Complete diligence inputs",
      detail:
        "Connect accounting data and confirm audited financials before sharing with institutional investors.",
      impact: "high",
    },
    {
      title: "Prepare runway narrative",
      detail:
        "Explain the bridge plan and burn reduction path before the first investor meeting.",
      impact: "medium",
    },
  ],
  benchmark: {
    label: "seed · SAAS",
    medianScore: 71,
    band: "within current AU founder benchmark",
    rationale:
      "Benchmark is an internal heuristic until BlockID has enough verified AU company outcomes.",
  },
  inputs: {
    sector: "saas",
    yearsTrading: 3,
    monthlyRevenue: 85000,
    monthlyBurn: 110000,
    runwayMonths: 14,
    founders: 2,
    esopAllocated: 12,
    hasShareholdersAgreement: true,
    hasBoardMeetings: true,
    hasFinancialAudit: false,
  },
  createdAt: new Date().toISOString(),
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const shareUrl = `${siteUrl()}/s/${slug}`;

  let data: ScorePdfData;

  if (slug.startsWith("demo-") || !isSupabaseConfigured()) {
    data = { ...DEMO, slug, shareUrl };
  } else {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase!
      .from("scores")
      .select("*")
      .eq("id", slug)
      .maybeSingle();
    if (error) {
      console.error("[blockid:pdf] supabase fetch failed", error);
      return NextResponse.json(
        { ok: false, error: "Internal error" },
        { status: 500 },
      );
    }
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 },
      );
    }
    const subs = row.sub_scores as Record<string, number>;
    data = {
      slug,
      shareUrl,
      totalScore: row.total_score,
      scoreVersion: row.score_version ?? "1.0.0",
      confidenceScore: row.confidence_score ?? null,
      companyName: row.company_name,
      email: row.email,
      subScores: [
        { label: "Financials", value: subs.financials ?? 0 },
        { label: "Cap Table Hygiene", value: subs.capTable ?? 0 },
        { label: "Governance", value: subs.governance ?? 0 },
        { label: "Founder Background", value: subs.founder ?? 0 },
        { label: "Documentation", value: subs.documentation ?? 0 },
      ],
      missingInputs: row.missing_inputs ?? [],
      actionPlan: row.action_plan ?? [],
      benchmark: row.benchmark ?? null,
      inputs: row.inputs as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }

  const buffer = await renderScorePdf(data);
  const filename = `blockid-score-${slug}.pdf`;
  // Convert Node Buffer to Uint8Array for the Web Response body. Both have a
  // BodyInit-compatible binary view; Uint8Array is the safest cross-runtime
  // representation under Next.js' Edge/Node abstraction.
  const body = new Uint8Array(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(buffer.length),
    },
  });
}
