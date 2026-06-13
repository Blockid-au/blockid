import { NextResponse } from "next/server";
import {
  renderFundraisingReport,
  type FundraisingReportData,
} from "@/lib/pdf/fundraising-report-pdf";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { SVI_VERSION, type SVISubScore } from "@/lib/svi-analysis";

// GET /s/[slug]/report
// Streams a full Fundraising Readiness Report as application/pdf.
// Falls back to demo data when Supabase is not configured or slug is "demo-*".

export const dynamic = "force-dynamic";

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_DIMS: SVISubScore[] = [
  {
    label: "Founder & Team Value",
    key: "ftv",
    value: 78,
    adjustment: 4,
    rationale: "Co-founder team with relevant sector experience and clear role separation.",
    evidence: ["Co-founder team", "Experienced founder"],
    gaps: ["Add named advisors"],
  },
  {
    label: "Market & Problem Clarity",
    key: "mpc",
    value: 72,
    adjustment: 4,
    rationale: "Problem is clearly stated with a medium addressable market. Customer validation underway.",
    evidence: ["Clear problem statement", "Medium addressable market"],
    gaps: ["Add customer validation data"],
  },
  {
    label: "Product & Technical Depth",
    key: "ptd",
    value: 68,
    adjustment: 2,
    rationale: "Demo available and website present. Source code not linked.",
    evidence: ["Demo available", "Website present"],
    gaps: ["Link GitHub repository"],
  },
  {
    label: "Traction & Revenue",
    key: "tre",
    value: 55,
    adjustment: 1,
    rationale: "Early revenue traction. Not yet at $100k ARR milestone.",
    evidence: ["Early revenue traction"],
    gaps: ["Scale to $100k ARR"],
  },
  {
    label: "Cap Table & Governance",
    key: "cgh",
    value: 65,
    adjustment: 2,
    rationale: "Cap table referenced with vesting schedule. Shareholders agreement not yet confirmed.",
    evidence: ["Cap table referenced", "Vesting schedule"],
    gaps: ["Create shareholders agreement"],
  },
  {
    label: "Investor Readiness",
    key: "iri",
    value: 48,
    adjustment: -0.2,
    rationale: "Raise target mentioned. Pitch deck and financial model not yet uploaded.",
    evidence: ["Raise target mentioned"],
    gaps: ["Upload pitch deck", "Add financial model"],
  },
  {
    label: "Legal & Compliance",
    key: "lco",
    value: 60,
    adjustment: 1,
    rationale: "ABN registered. Trademark and standard contracts not yet filed.",
    evidence: ["ABN registered"],
    gaps: ["File trademark", "Draft ToS"],
  },
  {
    label: "Strategic Vision & Moat",
    key: "svm",
    value: 45,
    adjustment: -0.3,
    rationale: "Vision is present but competitive moat has not been clearly articulated.",
    evidence: [],
    gaps: ["Articulate defensible advantage"],
  },
];

const DEMO: Omit<FundraisingReportData, "slug" | "shareUrl"> = {
  companyName: "Acme Co Pty Ltd",
  email: "founder@acme.au",
  createdAt: new Date().toISOString(),
  totalSVI: 112,
  sviVersion: SVI_VERSION,
  confidenceMultiplier: 0.5,
  stage: 2,
  stageLabel: "MVP / Prototype",
  percentileRank: 50,
  dimensions: DEMO_DIMS,
  nextActions: [
    {
      priority: "P0",
      title: "Upload pitch deck",
      detail: "Investors expect a current pitch deck before they take a meeting. Upload it to your BlockID data room.",
      impact: "+8 SVI pts",
    },
    {
      priority: "P0",
      title: "Confirm shareholders agreement",
      detail: "Investors will check founder rights, transfer controls, vesting, drag/tag and dispute mechanics.",
      impact: "+6 SVI pts",
    },
    {
      priority: "P1",
      title: "Add financial model",
      detail: "A 3-year model showing revenue assumptions, burn, and break-even signals investor-grade planning.",
      impact: "+5 SVI pts",
    },
    {
      priority: "P1",
      title: "Articulate your competitive moat",
      detail: "Clearly state the defensible advantage — network effects, data advantage, switching costs, or IP.",
      impact: "+4 SVI pts",
    },
    {
      priority: "P2",
      title: "Add named advisors",
      detail: "Advisors with sector credibility increase confidence in the founding team signal.",
      impact: "+3 SVI pts",
    },
  ],
  evidenceGaps: [
    {
      priority: "P0",
      label: "Pitch Deck",
      action: "Upload a current investor pitch deck to your data room",
      impact: 8,
      evidenceType: "document_uploaded",
    },
    {
      priority: "P0",
      label: "Financial Model",
      action: "Upload a 3-year financial model (spreadsheet or PDF)",
      impact: 5,
      evidenceType: "document_uploaded",
    },
  ],
  evidenceCount: 5,
  riskPenalties: [],
  capTableData: {
    founders: 2,
    esopAllocated: 10,
    hasShareholdersAgreement: false,
    targetRaiseAud: 1_500_000,
    valuationCapAud: 8_000_000,
  },
  proofHash: null,
  summary:
    "This is a seed-stage SaaS company with a co-founder team, early revenue traction, and a clear problem statement. The cap table and governance foundations are in place. Key areas to strengthen include investor readiness materials (pitch deck, financial model) and articulating a clearer competitive moat.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const shareUrl = `${siteUrl()}/s/${slug}`;

  let reportData: FundraisingReportData;

  if (slug.startsWith("demo-") || !isSupabaseConfigured()) {
    reportData = { ...DEMO, slug, shareUrl };
  } else {
    const supabase = getSupabaseAdmin();

    // Try svi_analyses table first (newer records)
    const { data: sviRow, error: sviErr } = await supabase!
      .from("svi_analyses")
      .select(
        "id, email, total_svi, analysis_json, rnd_report_json, created_at",
      )
      .eq("id", slug)
      .maybeSingle();

    if (sviErr) {
      console.error("[blockid:report] svi_analyses fetch failed", sviErr);
      return NextResponse.json(
        { ok: false, error: "Internal error" },
        { status: 500 },
      );
    }

    if (sviRow) {
      // Build from svi_analyses
      const analysis = sviRow.analysis_json ?? {};
      const dims: SVISubScore[] =
        Array.isArray(analysis.subs) && analysis.subs.length > 0
          ? (analysis.subs as SVISubScore[])
          : DEMO_DIMS;

      const nextActions = Array.isArray(analysis.nextActions)
        ? (
            analysis.nextActions as {
              priority: "P0" | "P1" | "P2";
              title: string;
              detail: string;
              impact: string;
            }[]
          )
        : [];

      const evidenceGaps = Array.isArray(analysis.evidenceGaps)
        ? (
            analysis.evidenceGaps as {
              priority: "P0" | "P1" | "P2";
              label: string;
              action: string;
              impact: number;
              evidenceType: string;
            }[]
          )
        : [];

      const riskPenalties = Array.isArray(analysis.riskPenalties)
        ? (
            analysis.riskPenalties as {
              label: string;
              points: number;
              reason: string;
            }[]
          )
        : [];

      reportData = {
        slug,
        shareUrl,
        companyName: "Your Company",
        email: sviRow.email ?? "",
        createdAt: sviRow.created_at,
        totalSVI: sviRow.total_svi ?? 100,
        sviVersion: (analysis.version as string) ?? SVI_VERSION,
        confidenceMultiplier:
          (analysis.confidenceMultiplier as number) ?? 0.5,
        stage: (analysis.stage as number) ?? 0,
        stageLabel:
          (analysis.stageLabel as string) ?? "Concept",
        percentileRank: (analysis.percentileRank as number) ?? undefined,
        dimensions: dims,
        nextActions,
        evidenceGaps,
        evidenceCount: 0,
        riskPenalties,
        capTableData: undefined,
        proofHash: null,
        summary: (analysis.summary as string) ?? null,
      };
    } else {
      // Fall back to scores table
      const { data: scoreRow, error: scoreErr } = await supabase!
        .from("scores")
        .select("*")
        .eq("id", slug)
        .maybeSingle();

      if (scoreErr) {
        console.error("[blockid:report] scores fetch failed", scoreErr);
        return NextResponse.json(
          { ok: false, error: "Internal error" },
          { status: 500 },
        );
      }
      if (!scoreRow) {
        return NextResponse.json(
          { ok: false, error: "Not found" },
          { status: 404 },
        );
      }

      const subs = (scoreRow.sub_scores ?? {}) as Record<string, number>;
      const inputs = (scoreRow.inputs ?? {}) as Record<string, unknown>;
      const actionPlan = (scoreRow.action_plan ?? []) as Array<{
        title: string;
        detail: string;
        impact: "high" | "medium" | "low";
      }>;

      // Map legacy sub_scores to SVISubScore shape
      const legacyDims: SVISubScore[] = [
        {
          label: "Financials",
          key: "financials",
          value: subs.financials ?? 0,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
        {
          label: "Cap Table Hygiene",
          key: "capTable",
          value: subs.capTable ?? 0,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
        {
          label: "Governance",
          key: "governance",
          value: subs.governance ?? 0,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
        {
          label: "Founder Background",
          key: "founder",
          value: subs.founder ?? 0,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
        {
          label: "Documentation",
          key: "documentation",
          value: subs.documentation ?? 0,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
      ];

      // Map legacy action plan to nextActions shape
      const mappedActions = actionPlan.map((a) => ({
        priority:
          a.impact === "high"
            ? ("P0" as const)
            : a.impact === "medium"
              ? ("P1" as const)
              : ("P2" as const),
        title: a.title,
        detail: a.detail,
        impact: a.impact,
      }));

      reportData = {
        slug,
        shareUrl,
        companyName: scoreRow.company_name ?? "Your Company",
        email: scoreRow.email ?? "",
        createdAt: scoreRow.created_at,
        totalSVI: scoreRow.total_score,
        sviVersion: scoreRow.score_version ?? "1.0.0",
        confidenceMultiplier: (scoreRow.confidence_score ?? 70) / 100,
        stage: 0,
        stageLabel: "Concept",
        percentileRank: undefined,
        dimensions: legacyDims,
        nextActions: mappedActions,
        evidenceGaps: [],
        evidenceCount: 0,
        riskPenalties: [],
        capTableData: {
          founders:
            typeof inputs.founders === "number" ? inputs.founders : undefined,
          esopAllocated:
            typeof inputs.esopAllocated === "number"
              ? inputs.esopAllocated
              : undefined,
          hasShareholdersAgreement:
            typeof inputs.hasShareholdersAgreement === "boolean"
              ? inputs.hasShareholdersAgreement
              : undefined,
          targetRaiseAud:
            typeof inputs.targetRaiseAud === "number"
              ? inputs.targetRaiseAud
              : undefined,
          valuationCapAud:
            typeof inputs.valuationCapAud === "number"
              ? inputs.valuationCapAud
              : undefined,
        },
        proofHash: null,
        summary: null,
      };
    }
  }

  try {
    const buffer = await renderFundraisingReport(reportData);
    const filename = `blockid-fundraising-report-${slug}.pdf`;
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
  } catch (err) {
    console.error("[blockid:report] PDF render failed", err);
    return NextResponse.json(
      { ok: false, error: "PDF render failed" },
      { status: 500 },
    );
  }
}
