// POST /api/svi/docx
//
// Generate and download a DOCX file from an existing assembled report
// or from the latest analysis.
//
// Body: { reportId: string } OR { analysisId: string } (+ optional
//       `legacy: true` to force the AssembledReport → DOCX builder for one
//       release, spec §F S-R4 rollback)
// Returns: DOCX binary with proper Content-Type header
//
// S-R4 (G13-W4-R4): the document is the Trusted Business Report v2 —
// `lib/docx/tbr-docx.ts` renders `ReportV2` (same chapters and order as
// the web / PDF, visuals as PNG). Source precedence, reported in the
// `X-TBR-Source` header:
//   stored   assembled_reports.report_json (migration 0395) validates
//   adapter  built on read from the AssembledReport (fromAssembledReport)
//   legacy   markdown-only saved report (no AssembledReport at all) or
//            `legacy: true` → svi-report-docx.ts

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canAfford, spendCredits } from "@/lib/credits";
import { generateSVIDocx } from "@/lib/docx/svi-report-docx";
import { generateTbrDocx } from "@/lib/docx/tbr-docx";
import { fromAssembledReport } from "@/lib/report-v2/adapter";
import { readAssembledReportJson } from "@/lib/report-v2/storage";
import type { ReportV2 } from "@/lib/report-v2/schema";
// Row → AssembledReport reconstruction is shared with the order-scoped
// delivery route (/api/reports/[orderId]) so both surfaces rebuild a
// stored report identically. Lifted verbatim out of this file.
import { reconstructAssembledReport } from "@/lib/paywall/report-delivery";
import type { AssembledReport, ReportSection } from "@/lib/report-pipeline/types";
import { findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import { loadAssessmentContext, assessmentCardOptionsFromContext } from "@/lib/svi/assessment-context";

export const dynamic = "force-dynamic";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function POST_handler(request: Request) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const limited = enforceRateLimit("svi-docx", user.email, request, 30, 60 * 60 * 1000);
  if (limited) return limited;

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { reportId?: string; analysisId?: string; legacy?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.reportId && !body.analysisId) {
    return NextResponse.json(
      { ok: false, error: "Provide either reportId or analysisId" },
      { status: 400 },
    );
  }

  // ── 2. Credit check ─────────────────────────────────────────────────────
  const affordCheck = await canAfford(user.id, "docx_export");
  if (!affordCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        balance: affordCheck.balance,
        cost: affordCheck.cost,
      },
      { status: 402 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 },
    );
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let report: AssembledReport;
  let startupName = "Unknown Startup";
  // S-R4: which ReportV2 path produced the document (null = markdown-only legacy).
  let reportV2: ReportV2 | null = null;
  let tbrSource: "stored" | "adapter" | "legacy" = "legacy";
  let assembledRowId: string | null = null;
  // G21 P1: the project behind the export (stored row → its project_id; live path → the scope).
  let exportProjectId: string | null = null;
  let adapterCtx: { industry?: string | null; stageLabel?: string | null; stage?: number | null; sviTotal?: number | null } = {};

  // ── 3. Load report data ─────────────────────────────────────────────────
  if (body.reportId) {
    // Load from assembled_reports table
    const { data: reportRaw, error: reportErr } = await supabase
      .from("assembled_reports")
      .select("*")
      .eq("id", body.reportId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (reportErr || !reportRaw) {
      return NextResponse.json(
        { ok: false, error: "Report not found or access denied" },
        { status: 404 },
      );
    }

    const reportRow = reportRaw as any;

    if (reportRow.status !== "complete") {
      return NextResponse.json(
        { ok: false, error: "Report is not complete yet — wait for generation to finish" },
        { status: 409 },
      );
    }

    startupName = String(reportRow.title ?? "Unknown Startup").replace(/^SVI Enhanced Report:\s*/i, "");

    // Reconstruct AssembledReport from stored data
    report = reconstructAssembledReport(reportRow);
    assembledRowId = String(reportRow.id ?? body.reportId);
    tbrSource = "adapter";
    exportProjectId = typeof reportRow.project_id === "string" ? reportRow.project_id : null;
  } else {
    // Load from latest analysis + existing report sections.
    // S18-A — member-aware: an export is a READ of the shared startup
    // record (viewer+); the account/analysis are resolved under the
    // OWNER's email and the export is charged to the caller's credits.
    const { scope, denied } = await projectScopeOrDeny("viewer");
    if (denied) return denied;
    const projectId = scope?.projectId ?? null;
    exportProjectId = projectId;
    const dataEmail = scope?.dataEmail ?? user.email;
    const reportOwnerIds = [...new Set([user.id, scope?.ownerUserId ?? user.id])];

    const account = await findSVIAccountWithFallback(
      dataEmail,
      projectId,
      "id, email, startup_name, current_svi, current_stage",
      { callerEmail: user.email },
    );
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No SVI account found" },
        { status: 404 },
      );
    }

    startupName = String(account.startup_name ?? "Unknown Startup");
    adapterCtx = {
      sviTotal: typeof account.current_svi === "number" ? account.current_svi : null,
      stage: typeof account.current_stage === "number" ? account.current_stage : null,
    };

    // Try to find the most recent assembled report for this account
    const { data: latestReportRaw } = await supabase
      .from("assembled_reports")
      .select("*")
      .eq("account_id", account.id as string)
      .in("user_id", reportOwnerIds)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReportRaw) {
      report = reconstructAssembledReport(latestReportRaw as any);
      assembledRowId = String((latestReportRaw as any).id ?? "");
      tbrSource = "adapter";
    } else {
      // Fallback: build a minimal report from the latest full_report content
      const latestAnalysis = await findLatestAnalysisWithFallback(
        dataEmail,
        projectId,
        "id, raw_input, total_svi, analysis_json",
        { callerEmail: user.email },
      );

      if (!latestAnalysis) {
        return NextResponse.json(
          { ok: false, error: "No analysis found — run an SVI analysis first" },
          { status: 404 },
        );
      }

      // Check for saved full report
      const { data: savedReportRaw } = await supabase
        .from("report_sections")
        .select("section_id, content, word_count, depth")
        .eq("analysis_id", latestAnalysis.id as string)
        .in("user_id", reportOwnerIds)
        .eq("depth", "full")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const savedReport = savedReportRaw as any;
      if (!savedReport || !savedReport.content) {
        return NextResponse.json(
          { ok: false, error: "No report content found — generate a report first" },
          { status: 404 },
        );
      }

      // Build a minimal AssembledReport from the saved markdown
      const markdown = String(savedReport.content);
      const wordCount = Number(savedReport.word_count ?? markdown.split(/\s+/).length);

      report = buildReportFromMarkdown(
        startupName,
        markdown,
        wordCount,
        Number(latestAnalysis.total_svi ?? 100),
      );
    }
  }

  // ── 4. Spend credits ────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, "docx_export", {
    reportId: body.reportId ?? null,
    analysisId: body.analysisId ?? null,
    startupName,
    wordCount: report.totalWords,
  });
  if (!spend.ok) {
    return NextResponse.json(
      { ok: false, error: "Credit spend failed" },
      { status: 402 },
    );
  }

  // ── 5. Generate DOCX ───────────────────────────────────────────────────
  try {
    if (body.legacy === true) tbrSource = "legacy";
    if (tbrSource !== "legacy") {
      const stored = assembledRowId ? await readAssembledReportJson(supabase, assembledRowId) : null;
      if (stored) {
        reportV2 = stored;
        tbrSource = "stored";
      } else {
        reportV2 = fromAssembledReport(report, {
          startupName,
          industry: adapterCtx.industry ?? null,
          stageLabel: adapterCtx.stageLabel ?? null,
          stage: adapterCtx.stage ?? null,
          sviTotal: adapterCtx.sviTotal ?? null,
        });
      }
    }
    const docxBuffer = reportV2
      ? await generateTbrDocx(reportV2, { assessment: assessmentCardOptionsFromContext(await loadAssessmentContext(exportProjectId, reportV2.cover.stage)) })
      : await generateSVIDocx(report);

    // Sanitise filename
    const safeName = startupName
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const filename = `BlockID-SVI-Report-${safeName}-${new Date().toISOString().slice(0, 10)}.docx`;

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(docxBuffer.length),
        "Cache-Control": "no-store",
        "X-TBR-Source": tbrSource,
      },
    });
  } catch (err) {
    console.error("[blockid:docx] generation failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "DOCX generation failed",
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReportFromMarkdown(
  startupName: string,
  markdown: string,
  wordCount: number,
  sviScore: number,
): AssembledReport {
  // Parse markdown headings into sections
  const sections: ReportSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  let match;
  const headings: Array<{ title: string; index: number }> = [];

  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push({ title: match[1].trim(), index: match.index + match[0].length });
  }

  for (let i = 0; i < headings.length; i++) {
    const startIdx = headings[i].index;
    const endIdx = i + 1 < headings.length
      ? markdown.lastIndexOf("\n## ", headings[i + 1].index)
      : markdown.length;
    const content = markdown.slice(startIdx, endIdx).trim();

    sections.push({
      id: headings[i].title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40),
      title: headings[i].title,
      agentRole: "ceo",
      content,
      visuals: [],
      wordCount: content.split(/\s+/).filter(Boolean).length,
    });
  }

  // If no sections parsed, treat entire markdown as one section
  if (sections.length === 0) {
    sections.push({
      id: "full_report",
      title: "Full Report",
      agentRole: "ceo",
      content: markdown,
      visuals: [],
      wordCount,
    });
  }

  return {
    id: `docx-${Date.now().toString(36)}`,
    title: `SVI Enhanced Report: ${startupName}`,
    tier: "standard",
    sections,
    charts: [],
    executiveSummary: sections[0]?.content.slice(0, 2000) ?? "",
    qualityScore: Math.min(100, Math.round(sviScore / 3)),
    totalWords: wordCount,
    consistencyIssues: [],
    agentContributions: {} as AssembledReport["agentContributions"],
    markdown,
    createdAt: new Date().toISOString(),
  };
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/svi/docx/route.ts", method: "POST" }, POST_handler);
