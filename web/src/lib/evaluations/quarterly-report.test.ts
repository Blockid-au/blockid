// Colocated vitest for quarterly-report (T0272). Pins the cohort summary
// (n, scored, median SVI, movers up/down, stage mix), the per-startup
// one-liners, the approved doctoral sentence (DBA — never "PhD"), the
// evaluator disclaimer text byte-identical to DISCLAIMER_SURFACES.
// evaluator_report, the legal/billing entity line (Auschain, never the
// marketing PPL Food entity), HTML escaping, and the nonced print script.

import { describe, expect, it } from "vitest";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { normaliseWeights } from "./batch-shared";
import {
  DOCTORAL_SENTENCE,
  LEGAL_ENTITY_LINE,
  evaluatorDisclaimerText,
  quarterLabelFor,
  renderQuarterlyReportHtml,
  summariseQuarterly,
  type QuarterlyReportData,
  type QuarterlyReportStartup,
} from "./quarterly-report";

const STARTUPS: QuarterlyReportStartup[] = [
  { name: "Acme <Robotics>", svi: 71, weighted: 64.5, stage: 3, delta: 9, topStrength: "Founder & Team", topGap: "Traction & Revenue", reportUrl: "/tbr/tok-a", status: "done" },
  { name: "Beta Health", svi: 58, weighted: 58, stage: 2, delta: -4, topStrength: "Market & Problem", topGap: "Legal & Compliance", reportUrl: "/tbr/tok-b", status: "done" },
  { name: "Gamma & Co", svi: 63, weighted: 60, stage: 3, delta: null, topStrength: null, topGap: null, reportUrl: null, status: "done" },
  { name: "Delta", svi: null, weighted: null, stage: 1, delta: null, topStrength: null, topGap: null, reportUrl: null, status: "failed" },
];

function data(over: Partial<QuarterlyReportData> = {}): QuarterlyReportData {
  return {
    cohortName: "Cohort 4 intake",
    programName: "Plus Eight",
    quarterLabel: "Q3 2026",
    generatedAt: "2026-09-10T10:00:00.000Z",
    source: "batch",
    weights: null,
    startups: STARTUPS,
    ...over,
  };
}

describe("summariseQuarterly", () => {
  it("counts, medians and movers", () => {
    const s = summariseQuarterly(STARTUPS);
    expect(s.n).toBe(4);
    expect(s.scored).toBe(3);
    expect(s.medianSvi).toBe(63);
    expect(s.medianWeighted).toBe(60);
    expect(s.moversUp.map((m) => m.name)).toEqual(["Acme <Robotics>"]);
    expect(s.moversDown.map((m) => m.name)).toEqual(["Beta Health"]);
    expect(s.stageMix).toEqual([{ stage: "MVP", count: 2 }, { stage: "Validation", count: 1 }]);
  });

  it("quarterLabelFor uses UTC quarters", () => {
    expect(quarterLabelFor(new Date("2026-09-10T00:00:00Z"))).toBe("Q3 2026");
    expect(quarterLabelFor(new Date("2026-01-01T00:00:00Z"))).toBe("Q1 2026");
  });
});

describe("renderQuarterlyReportHtml", () => {
  it("renders cover, summary tiles, movers and per-startup one-liners with escaping", () => {
    const html = renderQuarterlyReportHtml(data(), "https://blockid.au");
    expect(html).toContain("<title>Cohort 4 intake — Sponsor / LP report Q3 2026</title>");
    expect(html).toContain("Prepared by Plus Eight");
    expect(html).toContain("4 startups");
    expect(html).toContain("3 scored on one rubric");
    expect(html).toContain('<div class="v">63</div><div class="l">Median SVI</div>');
    expect(html).toContain("Acme &lt;Robotics&gt; ▲ 9 → SVI 71");
    expect(html).toContain("Beta Health ▼ 4 → SVI 58");
    expect(html).toContain("<strong>Acme &lt;Robotics&gt;</strong> — SVI 71 · weighted 64.5 · MVP · ▲ 9 — strongest on Founder &amp; Team, biggest gap Traction &amp; Revenue");
    expect(html).toContain('<a href="https://blockid.au/tbr/tok-a">report</a>');
    expect(html).toContain("<strong>Gamma &amp; Co</strong> — SVI 63 · weighted 60 · MVP · new");
    expect(html).toContain("<strong>Delta</strong> — scoring failed");
    expect(html).not.toContain("<Robotics>");
  });

  it("carries the doctoral sentence (DBA, never PhD), the evaluator disclaimer and the Auschain entity line", () => {
    const html = renderQuarterlyReportHtml(data());
    expect(DOCTORAL_SENTENCE).toContain("grounded in the founder's doctoral research (DBA) on startup valuation");
    expect(html).toContain("grounded in the founder&#39;s doctoral research (DBA) on startup valuation");
    expect(html).not.toMatch(/PhD/);
    expect(evaluatorDisclaimerText()).toBe(DISCLAIMER_SURFACES.evaluator_report.body_md.replace(/\*\*/g, ""));
    expect(html).toContain('data-surface="evaluator_report"');
    expect(html).toContain("General information only — not financial, investment, or legal advice.");
    expect(html).toContain("does not hold an Australian Financial Services Licence (AFSL)");
    expect(LEGAL_ENTITY_LINE).toBe("Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)");
    expect(html).toContain("Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)");
    expect(html).not.toContain("PPL Food");
  });

  it("explains custom rubric weights and keeps the SVI unweighted", () => {
    const html = renderQuarterlyReportHtml(data({ weights: normaliseWeights({ ftv: 50, tre: 50 }) }));
    expect(html).toContain("Weighted score uses this program&#39;s rubric weights: Founder &amp; Team 50%");
    expect(html).toContain("Traction &amp; Revenue 50%");
    expect(html).toContain("The SVI itself is unweighted");
    const equal = renderQuarterlyReportHtml(data({ weights: normaliseWeights({}) }));
    expect(equal).toContain("equal weights across the 8 dimensions");
  });

  it("binds the print button through a nonced script only when a nonce is given (CSP)", () => {
    const plain = renderQuarterlyReportHtml(data());
    expect(plain).not.toContain("<script");
    expect(plain).not.toContain("onclick=");
    const nonced = renderQuarterlyReportHtml(data(), "https://blockid.au", "abc123");
    expect(nonced).toContain('<script nonce="abc123">');
    expect(nonced).toContain("window.print()");
  });
});
