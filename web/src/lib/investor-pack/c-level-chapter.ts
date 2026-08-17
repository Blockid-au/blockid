/**
 * src/lib/investor-pack/c-level-chapter.ts
 *
 * Chapter X — "C-Level Financial Advisory" (v3.8.0).
 *
 * Pulls the latest CFO DCF valuation report + CEO funding roadmap + CDO
 * compliance summary and renders a Markdown chapter fragment for the
 * investor-pack PDF assembler.
 *
 * COMPLIANCE — output is scanned with `scanForRealNames` before it is
 * returned. If a real company name slips through, the fragment is
 * replaced with a compliance-blocked stub instead of being sent to the PDF.
 */

import type { CFOValuationReport } from "@/lib/c-level/compute-c-level-dcf";
import { scanForRealNames } from "@/lib/c-level/compute-c-level-dcf";

export interface CLevelChapterInput {
  cfoReport: CFOValuationReport | null;
  ceoRoadmapMarkdown?: string | null;
  cdoComplianceMarkdown?: string | null;
}

export interface CLevelChapter {
  title: string;
  markdown: string;
  complianceOk: boolean;
  complianceViolations: string[];
}

export function buildCLevelChapter(input: CLevelChapterInput): CLevelChapter {
  const title = "Chapter X — C-Level Financial Advisory";

  const parts: string[] = [`# ${title}`, ""];

  if (input.cfoReport) {
    parts.push("## CFO — DCF Valuation & Sensitivity");
    parts.push("");
    parts.push(input.cfoReport.narrativeMarkdown);
  } else {
    parts.push("_CFO nightly report unavailable — will populate on next cron cycle._");
  }

  if (input.ceoRoadmapMarkdown) {
    parts.push("");
    parts.push("## CEO — Funding Roadmap & 5-Year Milestones");
    parts.push("");
    parts.push(input.ceoRoadmapMarkdown);
  }

  if (input.cdoComplianceMarkdown) {
    parts.push("");
    parts.push("## CDO — Compliance & Governance");
    parts.push("");
    parts.push(input.cdoComplianceMarkdown);
  }

  parts.push("");
  parts.push(
    "> NFA — general information only. Not financial advice under Corporations Act 2001 (Cth).",
  );

  const combined = parts.join("\n");

  const scan = scanForRealNames(combined);
  if (!scan.ok) {
    // Fail-closed: rather than shipping a leak, replace with a compliance-blocked stub.
    return {
      title,
      markdown: `# ${title}\n\n_This chapter was blocked by the compliance scanner because it contained references to real company / VC / founder names (${scan.violations.join(", ")}). Regenerate with anonymised labels only._`,
      complianceOk: false,
      complianceViolations: scan.violations,
    };
  }

  return {
    title,
    markdown: combined,
    complianceOk: true,
    complianceViolations: [],
  };
}
