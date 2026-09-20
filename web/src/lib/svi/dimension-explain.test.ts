// G21-P1-B — per-dimension explainability data (report chapter + workspace sub-score).

import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { hasMarkdownSyntax } from "@/lib/report-v2/schema";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import type { DimensionEvidenceItem } from "@/lib/evidence/dimension-evidence";
import { EXPLAIN_MAX_EVIDENCE, EXPLAIN_MAX_MISSING, EXPLAIN_MAX_WHY, actionFromMissing, dimensionExplainFromChapter, dimensionExplainFromSubScore, missingFor, whySentences } from "./dimension-explain";

describe("whySentences", () => {
  it("keeps ≤ 3 plain sentences, markdown stripped", () => {
    const out = whySentences("**Strong** team. Serial founder with e.g. two exits. Co-founder on board. Advisors named. Fifth sentence.");
    expect(out).toHaveLength(EXPLAIN_MAX_WHY);
    expect(out[0]).toBe("Strong team.");
    expect(out[1]).toBe("Serial founder with e.g. two exits.");
    for (const s of out) expect(hasMarkdownSyntax(s)).toBe(false);
    expect(whySentences(null)).toEqual([]);
  });
});

describe("missingFor", () => {
  it("lists catalogue items not yet present, strongest lift first, max 3, each with an internal href", () => {
    const present = new Set(["revenue_proof"]);
    const missing = missingFor("tre", present);
    expect(missing).toHaveLength(EXPLAIN_MAX_MISSING);
    expect(missing.map((m) => m.code)).not.toContain("revenue_proof");
    expect(missing[0].code).toBe("mrr_dashboard");
    expect(missing[0].lift).toBe(8);
    for (const m of missing) expect(m.href.startsWith("/workspace/")).toBe(true);
    // Sorted by lift descending.
    for (let i = 1; i < missing.length; i++) expect(missing[i - 1].lift).toBeGreaterThanOrEqual(missing[i].lift);
  });

  it("is empty when the whole catalogue is on file, and for an unknown dimension", () => {
    expect(missingFor("cgh", new Set(EVIDENCE_CATALOG.cgh.map((e) => e.code)))).toEqual([]);
    expect(missingFor("xyz", new Set())).toEqual([]);
  });

  it("actionFromMissing phrases the first item as one action", () => {
    const action = actionFromMissing(missingFor("cgh", new Set()));
    expect(action?.title).toMatch(/^Add /);
    expect(action?.href).toBe("/workspace/equity");
    expect(action?.lift).toBe(8);
    expect(actionFromMissing([])).toBeNull();
  });
});

describe("dimensionExplainFromChapter", () => {
  it("builds score · confidence · why · evidence · missing · next action from a demo chapter", () => {
    const ch = demoReportV2().dimensions.find((d) => d.dim === "tre")!;
    const x = dimensionExplainFromChapter(ch);
    expect(x.dim).toBe("tre");
    expect(x.pending).toBe(false);
    expect(x.score).toBe(ch.score);
    expect(x.band).toBe(ch.band);
    expect(x.confidence).toBe(Math.round(ch.scoreBreakdown!.confidenceMultiplier * 100));
    expect(x.why.length).toBeGreaterThan(0);
    expect(x.why.length).toBeLessThanOrEqual(EXPLAIN_MAX_WHY);
    expect(x.evidence.length).toBeGreaterThan(0);
    expect(x.evidence.length).toBeLessThanOrEqual(EXPLAIN_MAX_EVIDENCE);
    // Strongest first: the demo TRE chapter carries a transaction_data (L5) signal.
    expect(x.evidence[0].level).toBe("L5");
    expect(x.missing.length).toBeLessThanOrEqual(EXPLAIN_MAX_MISSING);
    expect(x.nextAction?.title).toBe(ch.nextAction.title);
    expect(x.nextAction?.window).toBe(ch.nextAction.window);
    expect(x.benchmark).toBeUndefined();
  });

  it("a pending chapter keeps only Missing + Next action", () => {
    const ch = demoReportV2().dimensions.find((d) => d.dim === "svm")!;
    ch.scoreBreakdown = { ...ch.scoreBreakdown!, assessed: false, signals: [] };
    const x = dimensionExplainFromChapter(ch);
    expect(x.pending).toBe(true);
    expect(x.score).toBeNull();
    expect(x.band).toBe("pending");
    expect(x.confidence).toBeNull();
    expect(x.why).toEqual([]);
    expect(x.evidence).toEqual([]);
    expect(x.missing.length).toBeGreaterThan(0);
    expect(x.nextAction?.href).toBeDefined();
  });

  it("extra hub items are merged (strongest kept), their catalogue codes leave Missing, and the benchmark prop is passed through verbatim", () => {
    const ch = demoReportV2().dimensions.find((d) => d.dim === "cgh")!;
    const hub: DimensionEvidenceItem[] = [{ id: "h1", statement: "Cap table (current equity register)", level: "L6", verified: true, code: "cap_table_spreadsheet" }];
    const x = dimensionExplainFromChapter(ch, { evidence: hub, benchmark: { median: 48, n: 12, label: "indicative" } });
    expect(x.evidence[0]).toMatchObject({ id: "h1", level: "L6", verified: true });
    expect(x.missing.map((m) => m.code)).not.toContain("cap_table_spreadsheet");
    expect(x.benchmark).toEqual({ median: 48, n: 12, label: "indicative" });
  });
});

describe("dimensionExplainFromSubScore", () => {
  it("builds from a computeSVI() sub-score with the analysis-wide confidence", () => {
    const analysis = computeSVI(extractSignals({ rawText: "Serial founder with two exits. Co-founder team. MRR A$12,000 with 40 paying customers." }));
    const sub = analysis.subs.find((s) => s.key === "ftv")!;
    const x = dimensionExplainFromSubScore(sub, analysis);
    expect(x.dim).toBe("ftv");
    expect(x.title).toBe("Founder & Team Value");
    expect(x.weight).toBe(15);
    expect(x.score).toBe(sub.value);
    expect(x.confidence).toBe(Math.round(analysis.confidenceMultiplier * 100));
    expect(x.why.length).toBeGreaterThan(0);
    expect(x.evidence.every((e) => /^L[1-6]$/.test(e.level))).toBe(true);
    expect(x.nextAction).not.toBeNull();
  });

  it("pending sub-score (assessed:false) → pending band, Missing + Next action only", () => {
    const analysis = computeSVI(extractSignals({ rawText: "An idea." }));
    const sub = { ...analysis.subs.find((s) => s.key === "cgh")!, assessed: false };
    const x = dimensionExplainFromSubScore(sub, analysis);
    expect(x.pending).toBe(true);
    expect(x.score).toBeNull();
    expect(x.evidence).toEqual([]);
    expect(x.missing.length).toBeGreaterThan(0);
    // The analysis' own evidence gap for the dimension wins when it names a catalogue code (here: the cap table).
    expect(x.nextAction?.href).toBe("/workspace/equity");
    expect(x.nextAction?.lift).toBeGreaterThan(0);
  });
});
