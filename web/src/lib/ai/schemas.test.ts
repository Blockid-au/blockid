import { describe, it, expect } from "vitest";

import {
  Action30_60_90,
  AreaEnum,
  AssessmentFinding,
  Citation,
  EvidenceExtraction,
  ReportSection,
  RiskFinding,
} from "./schemas";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const goodCitation = (): { evidence_id: string; quote: string } => ({
  evidence_id: UUID_A,
  quote: "revenue of $1.2M in FY24",
});

const goodFinding = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  area_id: "financials",
  title: "Revenue trending up",
  detail: "MRR grew 18% MoM over the last two quarters.",
  proposed_score: 72,
  confidence: 0.8,
  hallucination_risk: "low",
  citations: [goodCitation()],
  actions: [],
  ...overrides,
});

describe("AreaEnum", () => {
  it("accepts each of the 12 §6 areas", () => {
    for (const a of [
      "identity",
      "governance",
      "financials",
      "product",
      "traction",
      "market",
      "team",
      "tech",
      "risk",
      "ip",
      "compliance",
      "esg",
    ]) {
      expect(AreaEnum.safeParse(a).success).toBe(true);
    }
  });

  it("rejects an unknown area", () => {
    expect(AreaEnum.safeParse("branding").success).toBe(false);
  });
});

describe("Citation", () => {
  it("accepts an evidence_id + non-empty quote", () => {
    expect(Citation.safeParse(goodCitation()).success).toBe(true);
  });

  it("rejects a missing evidence_id", () => {
    expect(
      Citation.safeParse({ quote: "hello" }).success,
    ).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(
      Citation.safeParse({ evidence_id: UUID_A, quote: "" }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid evidence_id", () => {
    expect(
      Citation.safeParse({ evidence_id: "not-a-uuid", quote: "q" }).success,
    ).toBe(false);
  });
});

describe("Action30_60_90", () => {
  it("accepts a well-formed action", () => {
    expect(
      Action30_60_90.safeParse({
        window: "60d",
        title: "Hire a CFO",
        effort: "high",
        owner: "CEO",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown window", () => {
    expect(
      Action30_60_90.safeParse({
        window: "180d",
        title: "x",
        effort: "low",
        owner: "y",
      }).success,
    ).toBe(false);
  });
});

describe("AssessmentFinding", () => {
  it("accepts a happy finding", () => {
    expect(AssessmentFinding.safeParse(goodFinding()).success).toBe(true);
  });

  it("rejects citations array with zero entries (min 1)", () => {
    const bad = goodFinding({ citations: [] });
    expect(AssessmentFinding.safeParse(bad).success).toBe(false);
  });

  it("rejects an out-of-range proposed_score (>100)", () => {
    expect(
      AssessmentFinding.safeParse(goodFinding({ proposed_score: 105 })).success,
    ).toBe(false);
  });

  it("rejects a negative proposed_score", () => {
    expect(
      AssessmentFinding.safeParse(goodFinding({ proposed_score: -1 })).success,
    ).toBe(false);
  });

  it("rejects confidence > 1", () => {
    expect(
      AssessmentFinding.safeParse(goodFinding({ confidence: 1.5 })).success,
    ).toBe(false);
  });

  it("rejects hallucination_risk outside the closed enum", () => {
    expect(
      AssessmentFinding.safeParse(goodFinding({ hallucination_risk: "unknown" }))
        .success,
    ).toBe(false);
  });

  it("rejects an area_id outside the 12 §6 areas", () => {
    expect(
      AssessmentFinding.safeParse(goodFinding({ area_id: "branding" })).success,
    ).toBe(false);
  });

  it("accepts multiple citations and actions", () => {
    const finding = goodFinding({
      citations: [
        goodCitation(),
        { evidence_id: UUID_B, quote: "second source" },
      ],
      actions: [
        { window: "30d", title: "Audit books", effort: "low", owner: "COO" },
        { window: "90d", title: "Raise Series A", effort: "high", owner: "CEO" },
      ],
    });
    expect(AssessmentFinding.safeParse(finding).success).toBe(true);
  });
});

describe("RiskFinding", () => {
  it("accepts a happy risk finding", () => {
    const risk = {
      area_id: "compliance",
      title: "Missing modern-slavery statement",
      severity: "high",
      likelihood: "medium",
      impact: "high",
      mitigation: "Publish a statement by end of Q3.",
      confidence: 0.6,
      hallucination_risk: "low",
      citations: [goodCitation()],
    };
    expect(RiskFinding.safeParse(risk).success).toBe(true);
  });

  it("rejects severity outside the closed enum", () => {
    const risk = {
      area_id: "compliance",
      title: "x",
      severity: "urgent",
      likelihood: "high",
      impact: "high",
      mitigation: "y",
      confidence: 0.5,
      hallucination_risk: "low",
      citations: [goodCitation()],
    };
    expect(RiskFinding.safeParse(risk).success).toBe(false);
  });
});

describe("EvidenceExtraction", () => {
  it("accepts a happy extraction", () => {
    expect(
      EvidenceExtraction.safeParse({
        area_id: "identity",
        fact: "ABN 79 659 615 111 is registered to Auschain PTY LTD",
        raw_snippet: "ABN 79 659 615 111 — Auschain PTY LTD",
        confidence: 0.95,
        hallucination_risk: "low",
        evidence_id: UUID_A,
      }).success,
    ).toBe(true);
  });

  it("rejects a negative confidence", () => {
    expect(
      EvidenceExtraction.safeParse({
        area_id: "identity",
        fact: "x",
        raw_snippet: "y",
        confidence: -0.1,
        hallucination_risk: "low",
        evidence_id: UUID_A,
      }).success,
    ).toBe(false);
  });
});

describe("ReportSection", () => {
  it("accepts a happy section with citations", () => {
    expect(
      ReportSection.safeParse({
        area_id: "market",
        heading: "Market opportunity",
        body_markdown: "The Australian SMB market is worth AUD 12B.",
        citations: [goodCitation()],
        confidence: 0.7,
        hallucination_risk: "medium",
      }).success,
    ).toBe(true);
  });

  it("rejects a section with no citations (min 1)", () => {
    expect(
      ReportSection.safeParse({
        area_id: "market",
        heading: "Market opportunity",
        body_markdown: "…",
        citations: [],
        confidence: 0.7,
        hallucination_risk: "low",
      }).success,
    ).toBe(false);
  });
});
