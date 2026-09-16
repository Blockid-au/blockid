// The "Prepared with …" provenance line every fixed-layout surface prints
// (PDF cover + appendix, DOCX cover + appendix). Callers that know the
// model / provider of the run pass their own line verbatim ("Prepared with
// DeepSeek-V4-Flash via DeepInfra."); this default names the pipeline
// version and the auditor's grounded share so a document never claims a
// model it cannot prove. Pure; client-safe.

import type { ReportV2 } from "./schema";

export function defaultPreparedWith(report: ReportV2): string {
  const grounded = Math.round((report.quality.groundedShare ?? 0) * 100);
  const src = report.source === "pipeline" ? "the BlockID C-level agent pipeline" : report.source === "fixture" ? "demo data" : "the stored snapshot (adapter)";
  return `Prepared with ${src} · ${report.pipelineVersion} · llm-auditor grounded ${grounded}%.`;
}
