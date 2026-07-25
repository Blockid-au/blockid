// src/lib/agents/ciso-security.ts
export interface SecurityAssessment {
  overallScore: number;
  maturityLevel: number;
  essentialEight: EssentialEightItem[];
  webSecurityHeaders: SecurityHeader[];
  risks: SecurityRisk[];
  recommendations: string[];
}

export interface EssentialEightItem {
  name: string;
  description: string;
  maturityLevel: 0 | 1 | 2 | 3;
  targetLevel: number;
  gap: number;
  actions: string[];
}

/** @type {SecurityHeader[]} */
export interface SecurityHeader {
  header: string;
  present: boolean;
  value: string;
  recommendation: string;
}

/** @type {SecurityRisk[]} */
export interface SecurityRisk {
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  mitigation: string;
}

/** @type {Omit<EssentialEightItem, "maturityLevel" | "gap">[]} */
export const ESSENTIAL_EIGHT_TEMPLATE: Omit<EssentialEightItem, "maturityLevel" | "gap">[] = [
  {
    name: "Application Control",
    description: "Prevent execution of unapproved programs",
    targetLevel: 2,
    actions: [
      "Implement allow-listing for executables",
      "Block script execution from user-writable directories",
      "Log blocked execution attempts",
    ],
  },
  {
    name: "Patch Applications",
    description: "Keep applications up to date with security patches",
    targetLevel: 2,
    actions: [
      "Enable automatic updates for all applications",
      "Patch critical vulnerabilities within 48 hours",
      "Remove unsupported applications",
    ],
  },
  {
    name: "Configure Microsoft Office Macros",
    description: "Block or restrict Office macro execution",
    targetLevel: 2,
    actions: [
      "Block macros from the internet",
      "Only allow vetted macros in trusted locations",
      "Log macro execution events",
    ],
  },
  {
    name: "User Application Hardening",
    description: "Harden web browsers and applications",
    targetLevel: 2,
    actions: [
      "Disable Flash, Java, and ads in browsers",
      "Enforce secure configuration baselines",
      "Apply sandboxing where possible",
    ],
  },
];

/** @type {Record<string, number>} */
export const VULNERABILITY_BENCHMARKS = {
  criticalPatchingWindowHours: 48,
  avgRemediationDaysCloudNative: 62,
  avgBreachCostAUD: 4_030_000,
};

/** @type {Record<string, string>} */
export const LLM_VULNERABILITY_RANKING = {
  LLM01: "Ranked #1 (LLM01) - Prompt Injection Criticality",
};

/** @type {Record<string, string>} */
export const MFA_REQUIREMENT = {
  default: "Phishing-resistant (FIDO2)",
};

/** @type {Record<string, number>} */
export const ACSC_ALERTS = {
  avgDetectionDaysSME: 200,
  compromisedCredsPct: 60,
  targetPatchWindowHours: 48,
};

/** @type {Record<string, number>} */
export const COMPLIANCE_GAP = {
  ml1BaselineFailPctAU: 60,
};

/** @type {(assessment: SecurityAssessment) => number} */
export function calculateOverallScore(assessment: SecurityAssessment): number {
  const weightMaturity = 0.4;
  const weightRisks = 0.3;
  const weightRecommendations = 0.3;
  const maturityScore = assessment.maturityLevel / 3;
  const riskScore = 1 - assessment.risks.reduce((acc, r) => acc + severityWeight(r.severity), 0) / assessment.risks.length;
  const recScore = assessment.recommendations.length > 0 ? 1 : 0;
  return Number(((maturityScore * weightMaturity + riskScore * weightRisks + recScore * weightRecommendations) * 100).toFixed(2));
}

/** @type {(severity: SecurityRisk["severity"]) => number} */
function severityWeight(severity: "critical" | "high" | "medium" | "low"): number {
  switch (severity) {
    case "critical":
      return 0.0;
    case "high":
      return 0.25;
    case "medium":
      return 0.5;
    case "low":
      return 0.75;
  }
}

/** @type {(patchHours: number) => boolean} */
export function isWithinCriticalPatchingWindow(patchHours: number): boolean {
  return patchHours <= VULNERABILITY_BENCHMARKS.criticalPatchingWindowHours;
}

/** @type {(remediationDays: number) => string} */
export function remediationTimeCategory(remediationDays: number): string {
  if (remediationDays <= VULNERABILITY_BENCHMARKS.avgRemediationDaysCloudNative) return "on‑track";
  return "delayed";
}

/** @type {() => number} */
export function getAverageBreachCostAU(): number {
  return VULNERABILITY_BENCHMARKS.avgBreachCostAUD;
}

/** @type {(assessment: EssentialEightItem[]) => EssentialEightItem[]} */
export function enrichEssentialEight(assessment: EssentialEightItem[]): EssentialEightItem[] {
  return assessment.map(item => ({
    ...item,
    gap: item.targetLevel - item.maturityLevel,
    actions: item.actions.length ? item.actions : ["Review controls", "Implement baseline measures"],
  }));
}

/** @type {(assessment: SecurityAssessment) => SecurityAssessment} */
export function applyResearchUpdates(assessment: SecurityAssessment): SecurityAssessment {
  const updatedEssential = enrichEssentialEight(assessment.essentialEight);
  const updatedRisks = assessment.risks.map(risk => {
    if (risk.category === "Credential Compromise") {
      const newSeverity = COMPLIANCE_GAP.ml1BaselineFailPctAU > 50 ? "critical" : risk.severity;
      return { ...risk, severity: newSeverity as any };
    }
    return risk;
  });
  const newRecommendations = [
    ...assessment.recommendations,
    `Adopt ${MFA_REQUIREMENT.default} for all privileged accounts`,
    `Implement LLM prompt‑injection monitoring (${LLM_VULNERABILITY_RANKING.LLM01})`,
  ];
  const overallScore = calculateOverallScore({ ...assessment, essentialEight: updatedEssential, risks: updatedRisks, recommendations: newRecommendations });
  return {
    ...assessment,
    overallScore,
    essentialEight: updatedEssential,
    risks: updatedRisks,
    recommendations: newRecommendations,
  };
}
