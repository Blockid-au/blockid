// POST /api/svi/docx
//
// Generate and download a DOCX file from an existing assembled report
// or from the latest analysis.
//
// Body: { reportId: string } OR { analysisId: string }
// Returns: DOCX binary with proper Content-Type header

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canAfford, spendCredits } from "@/lib/credits";
import { generateSVIDocx } from "@/lib/docx/svi-report-docx";
import type { AssembledReport, ReportSection, VisualSpec, ConsistencyIssue } from "@/lib/report-pipeline/types";
import { getProjectIdFromRequest, findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";

export const dynamic = "force-dynamic";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request) {
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
  let body: { reportId?: string; analysisId?: string };
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
    report = reconstructReport(reportRow);
  } else {
    // Load from latest analysis + existing report sections
    const projectId = await getProjectIdFromRequest();

    const account = await findSVIAccountWithFallback(
      user.email,
      projectId,
      "id, email, startup_name, current_svi, current_stage",
    );
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No SVI account found" },
        { status: 404 },
      );
    }

    startupName = String(account.startup_name ?? "Unknown Startup");

    // Try to find the most recent assembled report for this account
    const { data: latestReportRaw } = await supabase
      .from("assembled_reports")
      .select("*")
      .eq("account_id", account.id as string)
      .eq("user_id", user.id)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReportRaw) {
      report = reconstructReport(latestReportRaw as any);
    } else {
      // Fallback: build a minimal report from the latest full_report content
      const latestAnalysis = await findLatestAnalysisWithFallback(
        user.email,
        projectId,
        "id, raw_input, total_svi, analysis_json",
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
        .eq("user_id", user.id)
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
    const docxBuffer = await generateSVIDocx(report);

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

function reconstructReport(row: Record<string, unknown>): AssembledReport {
  const sectionsJson = row.sections_json as Array<Record<string, unknown>> | null;
  const fullMarkdown = String(row.full_markdown ?? "");

  // Reconstruct sections from stored JSON + markdown
  const sections: ReportSection[] = (sectionsJson ?? []).map((s) => {
    // Try to extract section content from the full markdown
    const sectionTitle = String(s.title ?? "");
    const sectionContent = extractSectionContent(fullMarkdown, sectionTitle);

    return {
      id: String(s.id ?? ""),
      title: sectionTitle,
      agentRole: String(s.agentRole ?? "ceo") as ReportSection["agentRole"],
      criterion: (s.criterion as ReportSection["criterion"]) ?? undefined,
      content: sectionContent,
      score: typeof s.score === "number" ? s.score : undefined,
      visuals: [] as VisualSpec[],
      wordCount: Number(s.wordCount ?? sectionContent.split(/\s+/).length),
    };
  });

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "SVI Report"),
    tier: String(row.tier ?? "standard") as AssembledReport["tier"],
    sections,
    charts: (row.charts_json as VisualSpec[]) ?? [],
    executiveSummary: String(row.executive_summary ?? ""),
    qualityScore: Number(row.quality_score ?? 0),
    totalWords: Number(row.total_words ?? 0),
    consistencyIssues: (row.consistency_issues as ConsistencyIssue[]) ?? [],
    agentContributions: (row.agent_contributions as AssembledReport["agentContributions"]) ?? {},
    markdown: fullMarkdown,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function extractSectionContent(markdown: string, sectionTitle: string): string {
  if (!markdown || !sectionTitle) return "";

  // Escape regex special chars in the title
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(
    `^##\\s+${escaped}\\s*$`,
    "mi",
  );

  const match = headingPattern.exec(markdown);
  if (!match) return "";

  const startIdx = match.index + match[0].length;
  // Find the next ## heading or end of string
  const nextHeading = markdown.indexOf("\n## ", startIdx);
  const endIdx = nextHeading === -1 ? markdown.length : nextHeading;

  return markdown.slice(startIdx, endIdx).trim();
}

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
