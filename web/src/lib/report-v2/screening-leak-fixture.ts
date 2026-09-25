// G34 D24-b leak probe (test fixture). The free fixture with every
// card-rendered (locked) chapter carrying grounded criteria whose verdicts,
// strengths, gaps, citations and evidence rows are distinctive strings. If
// detail were not gated, these would be promoted into the page-1 investor
// screening (criteria findings, evidence links, cited strengths / gaps).
// Page 1 on web, PDF, DOCX and e-mail must contain none of `secrets`.

import { freeFixtureReportV2 } from "./fixtures";
import type { EvidenceRow, ReportV2 } from "./schema";

export const LEAK_PROBE_MARK = "LEAKPROBE";

export function freeScreeningLeakProbe(): { report: ReportV2; secrets: string[] } {
  const report = freeFixtureReportV2();
  const secrets: string[] = [];
  const source = report.appendix.evidenceRegister[0]?.source ?? "upload";
  for (const ch of report.dimensions) {
    if (ch.renderAs !== "card") continue;
    const id = `leakprobe-ev-${ch.dim}`;
    const row: EvidenceRow = { evidence_id: id, source, label: `LEAKPROBE evidence label ${ch.dim}`, status: "evidenced", confidence: "third_party_verified", observedAt: "2026-01-02T00:00:00Z", dims: [ch.dim] };
    ch.evidence = [...ch.evidence, row];
    report.appendix.evidenceRegister = [...report.appendix.evidenceRegister, row];
    ch.criteria = ch.criteria.map(c => ({
      ...c, grounded: true,
      verdict: `LEAKPROBE finding ${ch.dim} ${c.key}`,
      strengths: [`LEAKPROBE strength ${ch.dim} ${c.key} [ev:${id}]`],
      gaps: [`LEAKPROBE gap ${ch.dim} ${c.key} [ev:${id}]`],
      citations: [{ evidence_id: id, quote: `LEAKPROBE quote ${ch.dim}` }],
    }));
    secrets.push(id, row.label, `LEAKPROBE quote ${ch.dim}`, ...ch.criteria.flatMap(c => [c.verdict, ...c.strengths, ...c.gaps]));
  }
  return { report, secrets };
}
