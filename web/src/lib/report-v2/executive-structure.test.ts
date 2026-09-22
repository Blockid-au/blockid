// G19-S47 — markdown → structured executive (the BlockID showcase text as
// stored on 2026-09-20), the headless deterministic-summary shape, the
// no-structure fallback built from the chapters, the CEO-JSON finaliser and
// the document helper every reader calls.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { TBR_STRINGS } from "@/lib/i18n/tbr-strings";
import { DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { ensureExecutiveStructured, executiveThesisFromStructured, finaliseExecutiveStructured, hasValidExecutiveStructured, structureExecutive } from "./executive-structure";
import { demoReportV2, demoSnapshotInput } from "./fixtures";
import { fromSnapshot } from "./adapter";
import { assertReportV2, EXECUTIVE_CAPS, executiveStructuredSchema, hasMarkdownSyntax, type ExecutiveStructured } from "./schema";

const BLOCKID = readFileSync(path.join(process.cwd(), "test-fixtures", "report-v2", "blockid-executive-2026-09-20.md"), "utf8");
const MD = /\*\*|<!--|(^|\n)\s*#|(^|\n)\s*>\s/;

function everyString(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => everyString(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => everyString(v, out));
  return out;
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

describe("structureExecutive — the BlockID showcase text (markdown headings, bold items, blockquote, verdict line, HTML comment)", () => {
  const report = demoReportV2();
  const s = structureExecutive(BLOCKID, report.dimensions, report.valuation, report.executive.phaseNow, {
    locale: "en",
    cover: { startupName: "BlockID.au", svi: { total: 135, band: "strong", cohortPercentile: null, cohortN: null, deltaVsLast: null } },
    actionPlan: report.actionPlan.steps,
    confidence: 0.5,
  });

  it("parses the H1 into a ≤ 14-word headline without the 'Executive Summary —' prefix", () => {
    expect(s.headline).toBe("BlockID.au: The Audit-Grade Valuation Engine for Australia's Startup Ecosystem");
    expect(words(s.headline)).toBeLessThanOrEqual(EXECUTIVE_CAPS.headlineWords);
  });

  it("turns the intro into 2–3 paragraphs of ≤ 60 words each, and the blockquote into the key insight", () => {
    expect(s.summary.length).toBeGreaterThanOrEqual(2);
    expect(s.summary.length).toBeLessThanOrEqual(3);
    for (const p of s.summary) expect(words(p)).toBeLessThanOrEqual(EXECUTIVE_CAPS.paragraphWords);
    expect(s.summary[0]).toMatch(/^BlockID\.au is a pre-revenue/);
    expect(s.summary.join(" ")).toContain("182 startups");
    expect(s.keyInsight).toMatch(/^BlockID\.au has built a category-defining moat/);
    expect(s.keyInsight).not.toMatch(/^Key Insight/i);
  });

  it("3 reasons and 3 gaps with titles / bodies from the numbered bold items and an inferred dim; gaps carry the chapter lift", () => {
    expect(s.reasonsToBack.map((r) => r.title)).toEqual(["Regulatory Tailwind Creates a Captive Market", "Unfair Advantage in Data & Moat", "Capital-Efficient Foundation"]);
    expect(s.reasonsToBack.map((r) => r.dim)).toEqual(["mpc", "svm", "cgh"]);
    expect(s.criticalGaps.map((g) => g.title)).toEqual(["Zero Revenue — The Monetisation Chasm", "Solo Founder Key-Person Risk", "Investor Readiness Gaps"]);
    expect(s.criticalGaps.map((g) => g.dim)).toEqual(["tre", "ftv", "iri"]);
    for (const g of s.criticalGaps) expect(g.lift).toBeGreaterThan(0);
    expect(s.criticalGaps[0].body).toContain("Stripe shows $0 MRR");
    // ≥ 1 gap names the lowest dimension in the text (Traction).
    expect(s.criticalGaps.some((g) => g.dim === "tre")).toBe(true);
  });

  it("verdict 'BUY — with a revenue milestone condition' → back_with_conditions, the condition kept, confidence 0.65", () => {
    expect(s.verdict).toEqual({ label: "back_with_conditions", condition: "With a revenue milestone condition.", confidence: 0.65 });
  });

  it("phase now: the blocker sentence and what it takes come from the 'Phase Now' section; the label is the gate's phase", () => {
    expect(s.phaseNow.phaseId).toBe(report.executive.phaseNow.currentPhase);
    expect(s.phaseNow.label).toBe("Investor Progress Review");
    expect(s.phaseNow.blocker).toContain("Traction score of 46 must improve");
    expect(s.phaseNow.whatItTakes).toMatch(/^This requires converting free users into paid subscriptions/);
  });

  it("5 recommended actions with windows and dims; benchmarks are the 8 chapters in DIM_ORDER", () => {
    expect(s.actions).toHaveLength(5);
    expect(s.actions[0]).toMatchObject({ title: "Activate the pricing ladder immediately", window: "this_week", dim: "tre" });
    expect(s.actions[1]).toMatchObject({ title: "Hire a part-time or fractional CRO/Head of Sales", dim: "ftv" });
    expect(s.actions[1].detail).toMatch(/^Hire a part-time/);
    expect(s.actions[4]).toMatchObject({ title: "Set a 6-month revenue milestone of A$5k MRR", window: "90d" });
    expect(s.benchmarks.map((b) => b.dim)).toEqual([...DIM_ORDER]);
    expect(s.benchmarks.every((b) => b.score >= 0 && b.score <= 100)).toBe(true);
  });

  it("no '#', '**', '<!--' or blockquote marker survives anywhere; the result validates against the schema", () => {
    for (const str of everyString(s)) {
      expect(str, str).not.toMatch(MD);
      expect(hasMarkdownSyntax(str)).toBe(false);
    }
    expect(JSON.stringify(s)).not.toContain("SCORE: 135");
    expect(executiveStructuredSchema.safeParse(s).success).toBe(true);
  });
});

describe("structureExecutive — headless deterministic summary (no H1, '## Executive Summary' + chapter bullets)", () => {
  const report = demoReportV2();
  const text = [
    "## Executive Summary",
    "",
    "**Acme** — SVI 88 (Seed). Deterministic summary (deadline); the chapter verdicts below are the owner agents' own words.",
    "",
    ...report.dimensions.map((c) => `- **${c.dim.toUpperCase()}** ${c.score}/100 (${c.band}): ${c.verdict}`),
    "",
    "**Phase now:** Investor Progress Review — 67% of the exit gate cleared; next phase co_founders.",
    "- TRE scores 46 — Investor Progress Review needs 55.",
  ].join("\n");
  const s = structureExecutive(text, report.dimensions, report.valuation, report.executive.phaseNow, { locale: "en", cover: { startupName: "Acme", svi: report.cover.svi }, actionPlan: report.actionPlan.steps, confidence: 0.75 });

  it("derives the headline, keeps the intro paragraph, and fills reasons / gaps / actions from the chapters and the plan", () => {
    expect(s.headline).toBe("Acme: SVI 74, strong for its stage");
    expect(s.summary[0]).toMatch(/^Acme — SVI 88 \(Seed\)\. Deterministic summary/);
    expect(s.summary.length).toBeGreaterThanOrEqual(2);
    expect(s.reasonsToBack).toHaveLength(3);
    expect(s.criticalGaps).toHaveLength(3);
    expect(s.actions.length).toBeGreaterThanOrEqual(3);
    expect(s.actions.length).toBeLessThanOrEqual(5);
    // Reasons come from the strongest chapters (never a score restatement), gaps from the highest lift.
    for (const r of [...s.reasonsToBack, ...s.criticalGaps]) {
      expect(r.dim).toBeDefined();
      expect(r.title).not.toMatch(/\d{1,3}\s*\/\s*100/);
      expect(r.title).not.toMatch(/below the (strong|developing) band/);
    }
    expect(s.verdict.label).toBe("back");
    expect(s.verdict.confidence).toBe(0.75);
    for (const str of everyString(s)) expect(str, str).not.toMatch(MD);
  });
});

describe("structureExecutive — no structure at all (one plain sentence) and empty input", () => {
  const report = demoReportV2();

  it("plain prose becomes paragraph one, the worth / phase sentences fill to two, and every section is deterministic", () => {
    const s = structureExecutive("Investor-ready SaaS with a clean register.", report.dimensions, report.valuation, report.executive.phaseNow, { locale: "en", cover: report.cover, actionPlan: report.actionPlan.steps, confidence: 0.75 });
    expect(s.summary[0]).toBe("Investor-ready SaaS with a clean register.");
    expect(s.summary[1]).toContain("A$6M and A$9.8M");
    expect(s.summary[1]).toContain("confidence 85%");
    expect(s.reasonsToBack).toHaveLength(3);
    expect(s.criticalGaps).toHaveLength(3);
    expect(s.criticalGaps[0].lift).toBeGreaterThan(0);
    expect(s.phaseNow.label).toBe("Investor Progress Review");
    expect(s.phaseNow.blocker.length).toBeGreaterThan(0);
    expect(s.phaseNow.whatItTakes.length).toBeGreaterThan(0);
    expect(s.actions).toHaveLength(Math.min(5, report.actionPlan.steps.length));
    expect(s.actions[0].window).toBe("30d");
    expect(s.verdict.label).toBe("back");
    expect(executiveStructuredSchema.safeParse(s).success).toBe(true);
  });

  it("empty thesis + nothing scored → pending headline, 'not_yet' verdict, still schema-valid", () => {
    const empty = assertReportV2(fromSnapshot({ dimStates: {} }));
    const s = structureExecutive("", empty.dimensions, empty.valuation, empty.executive.phaseNow, { locale: "en", cover: empty.cover, confidence: empty.executive.confidence });
    expect(s.headline).toBe("Your startup: evidence still pending");
    expect(s.verdict.label).toBe("not_yet");
    expect(s.summary.length).toBeGreaterThanOrEqual(1);
    expect(executiveStructuredSchema.safeParse(s).success).toBe(true);
  });

  it("locale vi: the deterministic copy has diacritics and the phase label is Vietnamese", () => {
    const s = structureExecutive("Một câu mở đầu.", report.dimensions, report.valuation, report.executive.phaseNow, { locale: "vi", cover: report.cover, actionPlan: report.actionPlan.steps, confidence: 0.75 });
    expect(s.summary[1]).toBe(TBR_STRINGS.vi.v2.s47.worthParagraph("A$6M", "A$9.8M", 85));
    expect(s.phaseNow.label).toBe(GROWTH_PHASE_LABELS.investor_review.vi);
    expect(JSON.stringify(s)).toMatch(/[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/);
  });
});

describe("finaliseExecutiveStructured — the CEO JSON path", () => {
  const report = demoReportV2();
  const ctx = { chapters: report.dimensions, phase: report.executive.phaseNow, locale: "en" as const, confidence: 0.75, actionPlan: report.actionPlan.steps, cover: report.cover };

  it("strips markdown, caps words by whole sentences, drops unknown dims, clamps confidence given as a percentage, caps list lengths", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is exactly seven words long.`).join(" ");
    const out = finaliseExecutiveStructured(
      {
        headline: "# **Acme** — the compliance layer for SME lending in Australia today and tomorrow and beyond",
        summary: [long, "Second.", "Third.", "Fourth."],
        keyInsight: "> **Key Insight:** gap is pricing.",
        reasonsToBack: [
          { title: "**Moat**", body: "Proprietary dataset.", dim: "svm" },
          { title: "Team", body: "Two exits.", dim: "nope" as never },
          { title: "", body: "" },
          { title: "Fourth", body: "Too many." },
        ],
        criticalGaps: [{ title: "Revenue", body: "MRR is flat.", lift: 4.4 }],
        benchmarks: [{ dim: "tre", score: 78, band: "strong", note: "above p75" }],
        phaseNow: { phaseId: "bogus" as never, label: "", blocker: "", whatItTakes: "" },
        verdict: { label: "back", confidence: 65 },
        actions: Array.from({ length: 7 }, (_, i) => ({ title: `Action ${i}`, detail: "do it immediately", window: "never" as never })),
      },
      ctx,
    );
    expect(words(out.headline)).toBeLessThanOrEqual(EXECUTIVE_CAPS.headlineWords);
    expect(out.headline.startsWith("Acme — the compliance layer")).toBe(true);
    expect(out.summary).toHaveLength(3);
    expect(words(out.summary[0])).toBeLessThanOrEqual(EXECUTIVE_CAPS.paragraphWords);
    expect(out.keyInsight).toBe("gap is pricing.");
    expect(out.reasonsToBack).toHaveLength(3);
    expect(out.reasonsToBack[0]).toEqual({ title: "Moat", body: "Proprietary dataset.", dim: "svm" });
    expect(out.reasonsToBack[1].dim).toBe("ftv");
    expect(out.criticalGaps).toHaveLength(3);
    expect(out.criticalGaps[0]).toMatchObject({ title: "Revenue", dim: "tre", lift: 4 });
    expect(out.benchmarks).toHaveLength(8);
    expect(out.benchmarks.find((b) => b.dim === "tre")?.note).toBe("above p75");
    expect(out.phaseNow.phaseId).toBe(report.executive.phaseNow.currentPhase);
    expect(out.phaseNow.label).toBe("Investor Progress Review");
    expect(out.verdict.confidence).toBe(0.65);
    expect(out.actions).toHaveLength(5);
    expect(out.actions[0].window).toBe("this_week");
    expect(executiveStructuredSchema.safeParse(out).success).toBe(true);
    for (const str of everyString(out)) expect(str, str).not.toMatch(MD);
  });

  it("a conditional verdict without a condition gets one from the top gap; an unknown label falls back to the band", () => {
    const out = finaliseExecutiveStructured({ verdict: { label: "back_with_conditions", confidence: 0.5 } }, ctx);
    expect(out.verdict.condition).toMatch(/^Subject to: /);
    const bad = finaliseExecutiveStructured({ verdict: { label: "maybe" as never, confidence: 0.5 } }, ctx);
    expect(bad.verdict.label).toBe("back");
  });
});

describe("ensureExecutiveStructured / hasValidExecutiveStructured / executiveThesisFromStructured", () => {
  it("adds a valid block to a document without one, keeps a valid stored block untouched (same reference), and replaces an invalid stored block", () => {
    // The adapter now stores the block (fromSnapshot → ensureExecutiveStructured); a pre-S47 row has none.
    const demo = demoReportV2();
    expect(hasValidExecutiveStructured(demo)).toBe(true);
    delete demo.executive.structured;
    expect(hasValidExecutiveStructured(demo)).toBe(false);
    const ensured = ensureExecutiveStructured(demo);
    expect(hasValidExecutiveStructured(ensured)).toBe(true);
    expect(assertReportV2(ensured).executive.structured).toBeDefined();
    expect(ensureExecutiveStructured(ensured)).toBe(ensured);
    const broken = { ...ensured, executive: { ...ensured.executive, structured: { ...(ensured.executive.structured as ExecutiveStructured), headline: "**bold**" } } };
    expect(hasValidExecutiveStructured(broken)).toBe(false);
    const fixed = ensureExecutiveStructured(broken);
    expect(fixed.executive.structured?.headline).not.toContain("**");
  });

  it("the adapter document keeps validating with structured present and the thesis twin is plain text", () => {
    const r = ensureExecutiveStructured(fromSnapshot(demoSnapshotInput()));
    expect(() => assertReportV2(r)).not.toThrow();
    const thesis = executiveThesisFromStructured(r.executive.structured!);
    expect(thesis.startsWith(r.executive.structured!.headline)).toBe(true);
    expect(thesis).not.toMatch(MD);
  });
});

describe("V01 stale valuation prose", () => {
  it("replaces old valuation paragraphs while retaining separate revenue and raise facts", async () => {
    const { unavailableValuation } = await import("./schema");
    const { withoutUnavailableValuationProse } = await import("./executive-structure");
    const text = "The consensus valuation sits between A$6M and A$9.8M.\n\nRevenue is A$1.2M ARR.\n\nThe stated raise is A$500k.\n\nFounder-stated pre-money ask: A$8M.";
    const safe = withoutUnavailableValuationProse(text);
    expect(safe).not.toContain("A$6M");
    expect(safe).toContain("A$1.2M ARR");
    expect(safe).toContain("A$500k");
    expect(safe).toContain("Founder-stated pre-money ask: A$8M");
    const original = demoReportV2();
    const report = { ...original, valuation: unavailableValuation("valuation_failed", new Date(0).toISOString()), executive: { ...original.executive, thesis: text } };
    const cleaned = ensureExecutiveStructured(report);
    expect(cleaned.executive.thesis).not.toContain("A$6M");
    expect(cleaned.executive.thesis).toContain("A$1.2M ARR");
    expect(cleaned.executive.audit).toEqual(original.executive.audit);
    const coverStrip = cleaned.cover.visuals.find((visual) => visual.kind === "three_questions_strip");
    expect(JSON.stringify(coverStrip)).not.toContain("A$6");
    expect(coverStrip?.svg).toContain("Business valuation unavailable");
    expect(cleaned.executive.visuals).toEqual(original.executive.visuals.filter((visual) => !/valuation|định giá/i.test(visual.title)));
    expect(JSON.stringify(cleaned.executive.structured)).not.toContain("The consensus valuation sits between");
  });
});
