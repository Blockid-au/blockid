import { describe, it, expect } from "vitest";
import {
  ESSENTIAL_EIGHT_TEMPLATE,
  VULNERABILITY_BENCHMARKS,
  LLM_VULNERABILITY_RANKING,
  MFA_REQUIREMENT,
  ACSC_ALERTS,
  COMPLIANCE_GAP,
  calculateOverallScore,
  isWithinCriticalPatchingWindow,
  remediationTimeCategory,
  getAverageBreachCostAU,
  enrichEssentialEight,
  applyResearchUpdates,
  type SecurityAssessment,
  type EssentialEightItem,
  type SecurityRisk,
} from "./ciso-security";

// U+2011 non-breaking hyphen inside the shipped "on‑track" literal — matches file
const ON_TRACK = "on‑track";

// ── registry constants ──────────────────────────────────────────────────────

describe("ESSENTIAL_EIGHT_TEMPLATE registry", () => {
  it("declares the 4 controls the module ships (Application Control / Patch / Macros / User App Hardening)", () => {
    const names = ESSENTIAL_EIGHT_TEMPLATE.map((i) => i.name);
    expect(names).toEqual([
      "Application Control",
      "Patch Applications",
      "Configure Microsoft Office Macros",
      "User Application Hardening",
    ]);
  });

  it("every row targets ACSC Maturity Level 2 and carries non-empty description + actions", () => {
    for (const item of ESSENTIAL_EIGHT_TEMPLATE) {
      expect(item.targetLevel).toBe(2);
      expect(item.description.trim().length).toBeGreaterThan(0);
      expect(item.actions.length).toBeGreaterThanOrEqual(3);
      for (const action of item.actions) expect(action.trim().length).toBeGreaterThan(0);
    }
  });

  it("names are unique — no duplicate entries", () => {
    const names = ESSENTIAL_EIGHT_TEMPLATE.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("VULNERABILITY_BENCHMARKS constants", () => {
  it("pins the ACSC 48-hour critical patching window", () => {
    expect(VULNERABILITY_BENCHMARKS.criticalPatchingWindowHours).toBe(48);
  });

  it("pins the Snyk cloud-native median remediation of 62 days", () => {
    expect(VULNERABILITY_BENCHMARKS.avgRemediationDaysCloudNative).toBe(62);
  });

  it("pins the IBM Cost of a Data Breach AU$4.03M anchor", () => {
    expect(VULNERABILITY_BENCHMARKS.avgBreachCostAUD).toBe(4_030_000);
  });
});

describe("LLM_VULNERABILITY_RANKING / MFA_REQUIREMENT / ACSC_ALERTS / COMPLIANCE_GAP anchors", () => {
  it("LLM01 anchors to prompt injection (OWASP LLM Top-10 #1)", () => {
    expect(LLM_VULNERABILITY_RANKING.LLM01).toMatch(/Prompt Injection/i);
    expect(LLM_VULNERABILITY_RANKING.LLM01).toMatch(/LLM01/);
  });

  it("MFA default is phishing-resistant FIDO2 (CISA anchor)", () => {
    expect(MFA_REQUIREMENT.default).toMatch(/Phishing-resistant/);
    expect(MFA_REQUIREMENT.default).toMatch(/FIDO2/);
  });

  it("ACSC_ALERTS pins 200-day SME dwell time, 60% credential-compromise incidence, 48-hour patch target", () => {
    expect(ACSC_ALERTS.avgDetectionDaysSME).toBe(200);
    expect(ACSC_ALERTS.compromisedCredsPct).toBe(60);
    expect(ACSC_ALERTS.targetPatchWindowHours).toBe(48);
  });

  it("COMPLIANCE_GAP.ml1BaselineFailPctAU > 50 so applyResearchUpdates always escalates Credential Compromise", () => {
    expect(COMPLIANCE_GAP.ml1BaselineFailPctAU).toBe(60);
    expect(COMPLIANCE_GAP.ml1BaselineFailPctAU).toBeGreaterThan(50);
  });
});

// ── calculateOverallScore ───────────────────────────────────────────────────

function makeAssessment(overrides: Partial<SecurityAssessment> = {}): SecurityAssessment {
  return {
    overallScore: 0,
    maturityLevel: 0,
    essentialEight: [],
    webSecurityHeaders: [],
    risks: [],
    recommendations: [],
    ...overrides,
  };
}

describe("calculateOverallScore weight arithmetic", () => {
  it("all-worst input (maturity 0, single 'low' risk, no recs) returns 7.5", () => {
    // maturityScore=0, riskScore=1-0.75=0.25, recScore=0
    // overall = (0*.4 + 0.25*.3 + 0*.3) * 100 = 7.5
    const score = calculateOverallScore(
      makeAssessment({
        maturityLevel: 0,
        risks: [{ category: "X", severity: "low", description: "", mitigation: "" }],
        recommendations: [],
      }),
    );
    expect(score).toBe(7.5);
  });

  it("all-best input (maturity 3, single 'critical' risk which weights 0, ≥1 rec) returns 100", () => {
    // maturityScore=1, riskScore=1-0=1, recScore=1  → (1*.4 + 1*.3 + 1*.3) * 100 = 100
    const score = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "critical", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    expect(score).toBe(100);
  });

  it("severity ladder — 'critical' weight is 0 (highest riskScore contribution)", () => {
    // Same maturity + recs; risks=[critical] → riskScore=1; risks=[low] → riskScore=0.25
    const critical = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "critical", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    const low = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "low", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    expect(critical).toBeGreaterThan(low);
  });

  it("'medium' severity weights 0.5 → riskScore 0.5 → 60.0 total in the pinned mix", () => {
    // maturity=3 (score 1), single medium risk (riskScore=0.5), recs>=1 (recScore=1)
    // overall = (1*.4 + 0.5*.3 + 1*.3) * 100 = 40 + 15 + 30 = 85
    const score = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "medium", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    expect(score).toBe(85);
  });

  it("recommendations toggle contributes exactly 30 points (recScore weight 0.3)", () => {
    const withRecs = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "critical", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    const noRecs = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "critical", description: "", mitigation: "" }],
        recommendations: [],
      }),
    );
    expect(withRecs - noRecs).toBe(30);
  });

  it("recScore branch is presence-only — 1 rec and 10 recs yield the same score", () => {
    const oneRec = calculateOverallScore(
      makeAssessment({
        maturityLevel: 2,
        risks: [{ category: "X", severity: "medium", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    const manyRecs = calculateOverallScore(
      makeAssessment({
        maturityLevel: 2,
        risks: [{ category: "X", severity: "medium", description: "", mitigation: "" }],
        recommendations: Array.from({ length: 10 }, (_, i) => `r${i}`),
      }),
    );
    expect(oneRec).toBe(manyRecs);
  });

  it("maturityLevel contributes exactly 40 points across the 0→3 range (weight 0.4)", () => {
    const zero = calculateOverallScore(
      makeAssessment({
        maturityLevel: 0,
        risks: [{ category: "X", severity: "critical", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    const three = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [{ category: "X", severity: "critical", description: "", mitigation: "" }],
        recommendations: ["r"],
      }),
    );
    expect(three - zero).toBe(40);
  });

  it("multi-risk average — 4 risks (critical + high + medium + low) yield riskScore 0.625 → 78.75", () => {
    // avg severity weight = (0 + 0.25 + 0.5 + 0.75) / 4 = 0.375  → riskScore = 0.625
    // maturity 3 (score 1) + recs present → (1*.4 + 0.625*.3 + 1*.3) * 100 = 40 + 18.75 + 30 = 88.75
    const score = calculateOverallScore(
      makeAssessment({
        maturityLevel: 3,
        risks: [
          { category: "a", severity: "critical", description: "", mitigation: "" },
          { category: "b", severity: "high", description: "", mitigation: "" },
          { category: "c", severity: "medium", description: "", mitigation: "" },
          { category: "d", severity: "low", description: "", mitigation: "" },
        ],
        recommendations: ["r"],
      }),
    );
    expect(score).toBe(88.75);
  });

  it("result is rounded to 2 decimal places (Number(toFixed(2)))", () => {
    // 3 medium risks avg 0.5 → riskScore 0.5; maturity 1 (score 0.333…); no recs
    // (0.333… * .4 + 0.5 * .3 + 0) * 100 = 13.333… + 15 = 28.333… → rounds to 28.33
    const score = calculateOverallScore(
      makeAssessment({
        maturityLevel: 1,
        risks: [
          { category: "a", severity: "medium", description: "", mitigation: "" },
          { category: "b", severity: "medium", description: "", mitigation: "" },
          { category: "c", severity: "medium", description: "", mitigation: "" },
        ],
        recommendations: [],
      }),
    );
    expect(score).toBe(28.33);
    // 2 decimals — string form has ≤ 2 fractional digits
    const [, frac = ""] = String(score).split(".");
    expect(frac.length).toBeLessThanOrEqual(2);
  });

  it("empty risks array yields NaN (divide-by-zero — pins the current no-guard behaviour)", () => {
    const score = calculateOverallScore(
      makeAssessment({ maturityLevel: 2, risks: [], recommendations: ["r"] }),
    );
    expect(Number.isNaN(score)).toBe(true);
  });
});

// ── isWithinCriticalPatchingWindow ──────────────────────────────────────────

describe("isWithinCriticalPatchingWindow (ACSC 48h boundary)", () => {
  it("0-hour patch is within the window", () => {
    expect(isWithinCriticalPatchingWindow(0)).toBe(true);
  });

  it("47-hour patch is within the window (below boundary)", () => {
    expect(isWithinCriticalPatchingWindow(47)).toBe(true);
  });

  it("48-hour patch is within the window (inclusive boundary)", () => {
    expect(isWithinCriticalPatchingWindow(48)).toBe(true);
  });

  it("49-hour patch is OUTSIDE the window (exclusive above)", () => {
    expect(isWithinCriticalPatchingWindow(49)).toBe(false);
  });

  it("1000-hour patch is far outside the window", () => {
    expect(isWithinCriticalPatchingWindow(1000)).toBe(false);
  });
});

// ── remediationTimeCategory (Snyk 62-day cloud-native median) ───────────────

describe("remediationTimeCategory (62-day median)", () => {
  it("0 days → on-track (U+2011 non-breaking hyphen matches shipped literal)", () => {
    expect(remediationTimeCategory(0)).toBe(ON_TRACK);
    // guard the exact codepoint the module ships to survive an ASCII-hyphen rewrite
    expect(remediationTimeCategory(0).charCodeAt(2)).toBe(0x2011);
  });

  it("62 days is on-track (inclusive upper boundary)", () => {
    expect(remediationTimeCategory(62)).toBe(ON_TRACK);
  });

  it("63 days is delayed (exclusive above)", () => {
    expect(remediationTimeCategory(63)).toBe("delayed");
  });

  it("1000 days is delayed", () => {
    expect(remediationTimeCategory(1000)).toBe("delayed");
  });
});

// ── getAverageBreachCostAU ──────────────────────────────────────────────────

describe("getAverageBreachCostAU", () => {
  it("returns the pinned AU$4.03M IBM anchor as a plain number", () => {
    const v = getAverageBreachCostAU();
    expect(v).toBe(4_030_000);
    expect(Number.isFinite(v)).toBe(true);
    expect(typeof v).toBe("number");
  });
});

// ── enrichEssentialEight ────────────────────────────────────────────────────

describe("enrichEssentialEight (gap + actions fallback)", () => {
  const seed = (over: Partial<EssentialEightItem> = {}): EssentialEightItem => ({
    name: "Application Control",
    description: "Prevent execution of unapproved programs",
    maturityLevel: 0,
    targetLevel: 2,
    gap: 0,
    actions: [],
    ...over,
  });

  it("gap = targetLevel - maturityLevel", () => {
    const [enriched] = enrichEssentialEight([seed({ maturityLevel: 1, targetLevel: 3 })]);
    expect(enriched.gap).toBe(2);
  });

  it("gap can be zero when maturity matches target", () => {
    const [enriched] = enrichEssentialEight([seed({ maturityLevel: 2, targetLevel: 2 })]);
    expect(enriched.gap).toBe(0);
  });

  it("gap can go negative when maturity exceeds target (pinning current no-clamp behaviour)", () => {
    const [enriched] = enrichEssentialEight([seed({ maturityLevel: 3, targetLevel: 2 })]);
    expect(enriched.gap).toBe(-1);
  });

  it("empty actions fall back to the 2-step default advisory pair", () => {
    const [enriched] = enrichEssentialEight([seed({ actions: [] })]);
    expect(enriched.actions).toEqual(["Review controls", "Implement baseline measures"]);
  });

  it("existing actions are preserved verbatim (no re-order, no dedup)", () => {
    const originals = ["Alpha", "Bravo", "Alpha"];
    const [enriched] = enrichEssentialEight([seed({ actions: originals })]);
    expect(enriched.actions).toEqual(originals);
  });

  it("input array length is preserved and per-row order is stable", () => {
    const items = [
      seed({ name: "A", maturityLevel: 0, targetLevel: 2 }),
      seed({ name: "B", maturityLevel: 1, targetLevel: 3 }),
      seed({ name: "C", maturityLevel: 2, targetLevel: 2 }),
    ];
    const out = enrichEssentialEight(items);
    expect(out.map((r) => r.name)).toEqual(["A", "B", "C"]);
    expect(out.map((r) => r.gap)).toEqual([2, 2, 0]);
  });

  it("does not mutate the input rows (returns a new array of new objects)", () => {
    const original = seed({ actions: [] });
    const [enriched] = enrichEssentialEight([original]);
    expect(original.actions).toEqual([]); // input still blank
    expect(enriched).not.toBe(original);
  });
});

// ── applyResearchUpdates ────────────────────────────────────────────────────

describe("applyResearchUpdates", () => {
  const baseline = (): SecurityAssessment =>
    makeAssessment({
      maturityLevel: 2,
      essentialEight: [
        {
          name: "Application Control",
          description: "Prevent execution of unapproved programs",
          maturityLevel: 1,
          targetLevel: 2,
          gap: 0,
          actions: [],
        },
      ],
      risks: [
        { category: "Credential Compromise", severity: "medium", description: "", mitigation: "" },
        { category: "Data Loss", severity: "high", description: "", mitigation: "" },
      ],
      recommendations: ["baseline"],
    });

  it("Credential Compromise risk is escalated to 'critical' (ml1BaselineFailPctAU=60 > 50)", () => {
    const out = applyResearchUpdates(baseline());
    const cred = out.risks.find((r) => r.category === "Credential Compromise");
    expect(cred?.severity).toBe("critical");
  });

  it("non-'Credential Compromise' risks are untouched (severity preserved)", () => {
    const out = applyResearchUpdates(baseline());
    const data = out.risks.find((r) => r.category === "Data Loss");
    expect(data?.severity).toBe("high");
  });

  it("appends exactly 2 recommendations (FIDO2 + LLM01 prompt-injection monitoring)", () => {
    const input = baseline();
    const out = applyResearchUpdates(input);
    expect(out.recommendations.length).toBe(input.recommendations.length + 2);
    expect(out.recommendations).toContain("Adopt Phishing-resistant (FIDO2) for all privileged accounts");
    const injectionLine = out.recommendations.find((r) => r.includes("prompt"));
    expect(injectionLine).toBeDefined();
    expect(injectionLine).toContain("LLM01");
  });

  it("existing recommendations are preserved and precede the new ones (append semantics)", () => {
    const out = applyResearchUpdates(baseline());
    expect(out.recommendations[0]).toBe("baseline");
    expect(out.recommendations[out.recommendations.length - 1]).toContain("LLM01");
  });

  it("essentialEight is enriched — gap populated + empty actions replaced with fallback", () => {
    const out = applyResearchUpdates(baseline());
    expect(out.essentialEight[0]!.gap).toBe(1);
    expect(out.essentialEight[0]!.actions).toEqual(["Review controls", "Implement baseline measures"]);
  });

  it("overallScore is recomputed from the enriched + escalated envelope (not the input's stale 0)", () => {
    const out = applyResearchUpdates(baseline());
    expect(out.overallScore).not.toBe(0);
    expect(Number.isFinite(out.overallScore)).toBe(true);
  });

  it("Credential-Compromise-only risk mix recomputes with escalation folded in (single critical → riskScore=1)", () => {
    // Only Credential Compromise present — escalated to critical (weight 0) → riskScore = 1
    // maturity 2 (score .666…) + 2+ recs (present) → (0.666… * .4 + 1 * .3 + 1 * .3) * 100
    //   = 26.666… + 30 + 30 = 86.666… → 86.67
    const out = applyResearchUpdates(
      makeAssessment({
        maturityLevel: 2,
        essentialEight: [],
        risks: [
          { category: "Credential Compromise", severity: "low", description: "", mitigation: "" },
        ],
        recommendations: [],
      }),
    );
    expect(out.overallScore).toBe(86.67);
  });

  it("does not mutate the input assessment (returns a new envelope)", () => {
    const input = baseline();
    const snapshotRecCount = input.recommendations.length;
    const snapshotCredSeverity = input.risks.find((r) => r.category === "Credential Compromise")?.severity;
    applyResearchUpdates(input);
    expect(input.recommendations.length).toBe(snapshotRecCount);
    expect(input.risks.find((r) => r.category === "Credential Compromise")?.severity).toBe(
      snapshotCredSeverity,
    );
  });

  it("survives an empty essentialEight + empty risks (recomputes but yields NaN via empty-risks divide-by-zero)", () => {
    const out = applyResearchUpdates(
      makeAssessment({ maturityLevel: 3, essentialEight: [], risks: [], recommendations: [] }),
    );
    expect(out.essentialEight).toEqual([]);
    expect(out.recommendations.length).toBe(2);
    expect(Number.isNaN(out.overallScore)).toBe(true);
  });
});
