// Colocated vitest for the pure CLO-domain compliance helper.
//
// Pins the AU_COMPLIANCE_CHECKLIST registry, the assessStartupRisks branch
// matrix, calculateComplianceScore stage-gating + next-steps ordering, the
// four ResearchTopic constants (ESIC / IP AU / Privacy Act / ASIC) that feed
// CLO report deep-links, and the numeric helpers.
//
// Referenced by the Atlassian goal file (P0 reference_surfaces.clo_compliance
// + P10 s708 citation clo-compliance.ts:181-186). Contract:
// docs/plans/atlassian-standard-mapping-goal.md.

import { describe, it, expect } from "vitest";

import {
  AU_COMPLIANCE_CHECKLIST,
  ASIC_RESEARCH,
  ESIC_RESEARCH,
  IP_AU_RESEARCH,
  PRIVACY_ACT_RESEARCH,
  assessStartupRisks,
  averagePatentExaminationTime,
  calculateComplianceScore,
  estimateEsicTaxOffset,
  maxPrivacyPenalty,
  trademarkFeeRange,
  type ComplianceItem,
  type RiskItem,
} from "./clo-compliance";

const KNOWN_PRIORITIES: Array<ComplianceItem["priority"]> = ["critical", "high", "medium", "low"];

function riskInput(overrides: Partial<Parameters<typeof assessStartupRisks>[0]> = {}): Parameters<typeof assessStartupRisks>[0] {
  return {
    stage: 0,
    hasIP: true,
    hasLegalDocs: true,
    hasInsurance: true,
    employeeCount: 0,
    handlesUserData: false,
    ...overrides,
  };
}

describe("AU_COMPLIANCE_CHECKLIST registry", () => {
  it("is non-empty and stable", () => {
    expect(AU_COMPLIANCE_CHECKLIST.length).toBeGreaterThan(0);
  });

  it("has unique ids across every row", () => {
    const ids = AU_COMPLIANCE_CHECKLIST.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty id/category/requirement/description/authority on every row", () => {
    for (const row of AU_COMPLIANCE_CHECKLIST) {
      expect(row.id.trim()).not.toBe("");
      expect(row.category.trim()).not.toBe("");
      expect(row.requirement.trim()).not.toBe("");
      expect(row.description.trim()).not.toBe("");
      expect(row.authority.trim()).not.toBe("");
    }
  });

  it("uses a known priority tag on every row", () => {
    for (const row of AU_COMPLIANCE_CHECKLIST) {
      expect(KNOWN_PRIORITIES).toContain(row.priority);
    }
  });

  it("stage is a non-negative integer on every row", () => {
    for (const row of AU_COMPLIANCE_CHECKLIST) {
      expect(Number.isInteger(row.stage)).toBe(true);
      expect(row.stage).toBeGreaterThanOrEqual(0);
    }
  });

  it("populated links are http(s) URLs — no broken protocols", () => {
    for (const row of AU_COMPLIANCE_CHECKLIST) {
      if (row.link !== "") {
        expect(row.link).toMatch(/^https?:\/\//);
      }
    }
  });

  it("covers the canonical AU registration authorities on the critical/Registration row set", () => {
    const critReg = AU_COMPLIANCE_CHECKLIST.filter(
      (r) => r.category === "Registration" && r.priority === "critical",
    );
    const authorities = critReg.map((r) => r.authority);
    expect(authorities).toContain("ABR");
    expect(authorities).toContain("ASIC");
  });

  it("director_id row anchors to ABRS with an https link", () => {
    const dir = AU_COMPLIANCE_CHECKLIST.find((r) => r.id === "directors");
    expect(dir).toBeDefined();
    expect(dir!.authority).toBe("ABRS");
    expect(dir!.link).toMatch(/^https:\/\//);
  });

  it("privacy_policy row is critical + OAIC-anchored", () => {
    const p = AU_COMPLIANCE_CHECKLIST.find((r) => r.id === "privacy_policy");
    expect(p).toBeDefined();
    expect(p!.priority).toBe("critical");
    expect(p!.authority).toBe("OAIC");
  });
});

describe("assessStartupRisks", () => {
  it("all-clean input returns an empty risk list", () => {
    expect(assessStartupRisks(riskInput())).toEqual([]);
  });

  it("no-IP fires an IP risk with score 8", () => {
    const risks = assessStartupRisks(riskInput({ hasIP: false }));
    const ip = risks.find((r) => r.category === "IP");
    expect(ip).toBeDefined();
    expect(ip!.score).toBe(8);
    expect(ip!.impact).toBe("high");
  });

  it("no-legal-docs at stage 0 does NOT fire the Legal SHA risk", () => {
    const risks = assessStartupRisks(riskInput({ hasLegalDocs: false, stage: 0 }));
    expect(risks.find((r) => r.category === "Legal")).toBeUndefined();
  });

  it("no-legal-docs at stage 1 fires the Legal SHA risk", () => {
    const risks = assessStartupRisks(riskInput({ hasLegalDocs: false, stage: 1 }));
    expect(risks.find((r) => r.category === "Legal")).toBeDefined();
  });

  it("handles-user-data flips a Privacy risk with score 9", () => {
    const risks = assessStartupRisks(riskInput({ handlesUserData: true }));
    const priv = risks.find((r) => r.category === "Privacy");
    expect(priv).toBeDefined();
    expect(priv!.score).toBe(9);
    expect(priv!.likelihood).toBe("high");
  });

  it("employees without insurance fires an Employment risk", () => {
    const risks = assessStartupRisks(riskInput({ employeeCount: 3, hasInsurance: false }));
    expect(risks.find((r) => r.category === "Employment")).toBeDefined();
  });

  it("employees WITH insurance skips the Employment risk", () => {
    const risks = assessStartupRisks(riskInput({ employeeCount: 3, hasInsurance: true }));
    expect(risks.find((r) => r.category === "Employment")).toBeUndefined();
  });

  it("stage >= 3 without legal docs fires a Fundraise risk with score 9", () => {
    const risks = assessStartupRisks(riskInput({ stage: 3, hasLegalDocs: false }));
    const fr = risks.find((r) => r.category === "Fundraise");
    expect(fr).toBeDefined();
    expect(fr!.score).toBe(9);
  });

  it("stage 2 without legal docs does NOT fire the Fundraise risk", () => {
    const risks = assessStartupRisks(riskInput({ stage: 2, hasLegalDocs: false }));
    expect(risks.find((r) => r.category === "Fundraise")).toBeUndefined();
    expect(risks.find((r) => r.category === "Legal")).toBeDefined();
  });

  it("compound-worst-case emits all five risks sorted score-desc", () => {
    const risks = assessStartupRisks(
      riskInput({
        stage: 3,
        hasIP: false,
        hasLegalDocs: false,
        hasInsurance: false,
        employeeCount: 4,
        handlesUserData: true,
      }),
    );
    expect(risks.length).toBe(5);
    const scores = risks.map((r: RiskItem) => r.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
    expect(scores[0]).toBe(9);
  });

  it("every emitted risk carries a non-empty mitigation string", () => {
    const risks = assessStartupRisks(
      riskInput({ stage: 3, hasIP: false, hasLegalDocs: false, hasInsurance: false, employeeCount: 4, handlesUserData: true }),
    );
    for (const r of risks) {
      expect(r.mitigation.trim()).not.toBe("");
    }
  });
});

describe("calculateComplianceScore", () => {
  it("stage 0 with no completed items → score 0 and every critical stage-0 row surfaces as missing", () => {
    const r = calculateComplianceScore(0, []);
    expect(r.score).toBe(0);
    const stage0Critical = AU_COMPLIANCE_CHECKLIST.filter((x) => x.stage === 0 && x.priority === "critical");
    for (const row of stage0Critical) {
      expect(r.missingCritical.find((x) => x.id === row.id)).toBeDefined();
    }
  });

  it("filters items with item.stage > input.stage out of `items` slice", () => {
    const r = calculateComplianceScore(0, []);
    for (const row of r.items) {
      expect(row.stage).toBeLessThanOrEqual(0);
    }
  });

  it("marking every stage-0 row completed yields score 100 and empty missingCritical", () => {
    const stage0Ids = AU_COMPLIANCE_CHECKLIST.filter((x) => x.stage === 0).map((x) => x.id);
    const r = calculateComplianceScore(0, stage0Ids);
    expect(r.score).toBe(100);
    expect(r.missingCritical).toEqual([]);
  });

  it("ignores completed ids that are not in the stage-filtered slice", () => {
    // "rnd_tax" is stage 4 — passing it while asking for stage 0 must NOT count.
    const r = calculateComplianceScore(0, ["rnd_tax"]);
    expect(r.completed).toEqual([]);
  });

  it("nextSteps is capped at 5 and sorted critical → low", () => {
    const r = calculateComplianceScore(4, []);
    expect(r.nextSteps.length).toBeLessThanOrEqual(5);
    // First surfaced next-step must be a critical requirement (there are >= 5 critical items across stages 0..4).
    const criticalReqs = AU_COMPLIANCE_CHECKLIST.filter((x) => x.stage <= 4 && x.priority === "critical").map(
      (x) => x.requirement,
    );
    expect(criticalReqs.some((req) => r.nextSteps[0].startsWith(req))).toBe(true);
  });

  it("returns score 0 when the stage-filtered slice is empty (negative stage)", () => {
    const r = calculateComplianceScore(-1, []);
    expect(r.items).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.missingCritical).toEqual([]);
    expect(r.nextSteps).toEqual([]);
  });

  it("score is a rounded integer", () => {
    const r = calculateComplianceScore(4, ["abn", "acn"]);
    expect(Number.isInteger(r.score)).toBe(true);
  });
});

describe("ResearchTopic seed constants", () => {
  const topics = { ESIC_RESEARCH, IP_AU_RESEARCH, PRIVACY_ACT_RESEARCH, ASIC_RESEARCH };

  it("every topic has confidence in (0,1] and non-empty datapoint/finding lists", () => {
    for (const [, topic] of Object.entries(topics)) {
      expect(topic.confidence).toBeGreaterThan(0);
      expect(topic.confidence).toBeLessThanOrEqual(1);
      expect(topic.topic.trim()).not.toBe("");
      expect(topic.data_points.length).toBeGreaterThan(0);
      expect(topic.key_findings.length).toBeGreaterThan(0);
    }
  });

  it("every datapoint row has non-empty value/metric/source", () => {
    for (const [, topic] of Object.entries(topics)) {
      for (const dp of topic.data_points) {
        expect(dp.value.trim()).not.toBe("");
        expect(dp.metric.trim()).not.toBe("");
        expect(dp.source.trim()).not.toBe("");
      }
    }
  });

  it("ESIC_RESEARCH surfaces the 20% investor tax offset value + 10-year CGT anchor", () => {
    const values = ESIC_RESEARCH.data_points.map((d) => d.value).join(" | ");
    expect(values).toContain("20%");
    expect(values).toContain("10-year CGT");
  });

  it("ASIC_RESEARCH cites s708(1) small-scale cap + CSF s738G caps", () => {
    const sources = ASIC_RESEARCH.data_points.map((d) => d.source).join(" | ");
    expect(sources).toContain("Corporations Act 2001 s708(1)");
    expect(sources).toContain("ASIC Regulatory Guide 261");
  });

  it("PRIVACY_ACT_RESEARCH names the AU$50m/30%/3× penalty ladder + 30-day OAIC window", () => {
    const values = PRIVACY_ACT_RESEARCH.data_points.map((d) => d.value).join(" | ");
    expect(values).toContain("AU$50m");
    expect(values).toContain("30%");
    expect(values).toContain("3×");
    expect(values).toContain("30 days");
  });
});

describe("Numeric helpers", () => {
  it("estimateEsicTaxOffset applies the Div 360 20% statutory rate and rounds to integer AUD", () => {
    expect(estimateEsicTaxOffset(0)).toBe(0);
    expect(estimateEsicTaxOffset(100_000)).toBe(20_000);
    expect(estimateEsicTaxOffset(12_345)).toBe(2_469);
    expect(Number.isInteger(estimateEsicTaxOffset(999))).toBe(true);
  });

  it("maxPrivacyPenalty returns the max of A$50m / 30% turnover / 3× benefit", () => {
    expect(maxPrivacyPenalty(0)).toBe(50_000_000);
    expect(maxPrivacyPenalty(200_000_000)).toBe(60_000_000);
    expect(maxPrivacyPenalty(0, 25_000_000)).toBe(75_000_000);
    expect(maxPrivacyPenalty(200_000_000, 25_000_000)).toBe(75_000_000);
  });

  it("averagePatentExaminationTime returns the 9-12 month midpoint 10.5", () => {
    expect(averagePatentExaminationTime()).toBe(10.5);
  });

  it("trademarkFeeRange returns a monotone [low, high] AUD tuple within the IP Australia band", () => {
    const [low, high] = trademarkFeeRange();
    expect(low).toBe(250);
    expect(high).toBe(550);
    expect(low).toBeLessThan(high);
  });
});
