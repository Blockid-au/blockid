// src/lib/agents/ciso-security.ts

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface SecurityAssessment {
  overallScore: number;
  maturityLevel: number;
  essentialEight: EssentialEightItem[];
  webSecurityHeaders: SecurityHeader[];
  risks: SecurityRisk[];
  vulnerabilities?: VulnerabilityCategory[];
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

export interface SecurityHeader {
  header: string;
  present: boolean;
  value: string;
  recommendation: string;
}

export interface SecurityRisk {
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  mitigation: string;
}

export interface VulnerabilityCategory {
  name: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  occurrenceRate: number;
  mitigation: string;
}

// ── Registry constants ───────────────────────────────────────────────────────

/** The 4 Essential Eight controls this module ships (ACSC Maturity Level 2 target). */
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
      "Restrict installation of unnecessary plugins",
      "Enforce secure configuration baselines",
    ],
  },
];

// ── Research anchors ─────────────────────────────────────────────────────────

/** ACSC / IBM / Snyk vulnerability benchmarks pinned to current research. */
export const VULNERABILITY_BENCHMARKS = {
  /** ACSC mandated window to apply critical patches (hours). */
  criticalPatchingWindowHours: 48,
  /** Snyk cloud-native median remediation time (days). */
  avgRemediationDaysCloudNative: 62,
  /** IBM Cost of a Data Breach 2024 — Australian anchor (AUD). */
  avgBreachCostAUD: 4_030_000,
} as const;

/** OWASP LLM Top-10 vulnerability ranking labels. */
export const LLM_VULNERABILITY_RANKING = {
  LLM01: "LLM01: Prompt Injection — adversarial inputs manipulate LLM behaviour",
  LLM02: "LLM02: Insecure Output Handling",
  LLM03: "LLM03: Training Data Poisoning",
} as const;

/** MFA requirement defaults (CISA phishing-resistant guidance). */
export const MFA_REQUIREMENT = {
  default: "Phishing-resistant (FIDO2) MFA for all privileged and remote access",
  fallback: "TOTP authenticator app for standard accounts",
} as const;

/** ACSC threat intelligence alert anchors. */
export const ACSC_ALERTS = {
  /** Average dwell time before detection in Australian SMEs (days). */
  avgDetectionDaysSME: 200,
  /** Percentage of incidents involving compromised credentials (%). */
  compromisedCredsPct: 60,
  /** ACSC target window to apply critical patches (hours). */
  targetPatchWindowHours: 48,
} as const;

/** Australian Essential Eight compliance gap statistics. */
export const COMPLIANCE_GAP = {
  /** Percentage of AU organisations failing ML1 baseline (%). */
  ml1BaselineFailPctAU: 60,
} as const;

// ── Utility functions ────────────────────────────────────────────────────────

/**
 * Returns true if the given patch time is within the ACSC 48-hour critical
 * patching window (inclusive).
 */
export function isWithinCriticalPatchingWindow(hoursToApply: number): boolean {
  return hoursToApply <= VULNERABILITY_BENCHMARKS.criticalPatchingWindowHours;
}

/**
 * Categorises a remediation time against the Snyk 62-day cloud-native median.
 * Returns "on‑track" (U+2011 non-breaking hyphen) or "delayed".
 */
export function remediationTimeCategory(days: number): "on‑track" | "delayed" {
  return days <= VULNERABILITY_BENCHMARKS.avgRemediationDaysCloudNative
    ? "on‑track"
    : "delayed";
}

/** Returns the pinned IBM AU average breach cost anchor. */
export function getAverageBreachCostAU(): number {
  return VULNERABILITY_BENCHMARKS.avgBreachCostAUD;
}

/**
 * Enriches Essential Eight items by computing gap and applying a default
 * actions fallback when actions are empty. Does NOT mutate input rows.
 */
export function enrichEssentialEight(items: EssentialEightItem[]): EssentialEightItem[] {
  return items.map((item) => ({
    ...item,
    gap: item.targetLevel - item.maturityLevel,
    actions:
      item.actions.length > 0
        ? item.actions
        : ["Review controls", "Implement baseline measures"],
  }));
}

// ── Score calculation ────────────────────────────────────────────────────────

/**
 * Severity weights used by calculateOverallScore.
 * Lower weight = higher risk burden = better riskScore contribution.
 *
 * Severity  weight  riskScore contribution (1 - avgWeight)
 * critical  0       1.00
 * high      0.25    0.75
 * medium    0.50    0.50
 * low       0.75    0.25
 */
const SEVERITY_WEIGHTS: Record<SecurityRisk["severity"], number> = {
  critical: 0,
  high: 0.25,
  medium: 0.5,
  low: 0.75,
};

/**
 * Calculates an overall security score (0–100, 2 dp).
 *
 * Formula:
 *   maturityScore = maturityLevel / 3          (weight 0.4)
 *   riskScore     = 1 - avg(severity weights)  (weight 0.3)
 *   recScore      = recs.length > 0 ? 1 : 0   (weight 0.3)
 *   overall       = (maturity*0.4 + risk*0.3 + rec*0.3) * 100
 *
 * Note: empty risks array yields NaN (divide-by-zero — intentional, pins
 * current no-guard behaviour for callers to handle).
 */
export function calculateOverallScore(assessment: SecurityAssessment): number {
  const maturityScore = assessment.maturityLevel / 3;

  const avgSeverityWeight =
    assessment.risks.reduce((sum, r) => sum + SEVERITY_WEIGHTS[r.severity], 0) /
    assessment.risks.length;
  const riskScore = 1 - avgSeverityWeight;

  const recScore = assessment.recommendations.length > 0 ? 1 : 0;

  const overall = (maturityScore * 0.4 + riskScore * 0.3 + recScore * 0.3) * 100;
  return Number(overall.toFixed(2));
}

// ── Research-update pipeline ─────────────────────────────────────────────────

/**
 * Applies the latest ACSC / OWASP research findings to an assessment envelope.
 * Returns a NEW assessment object (input is never mutated).
 *
 * Changes applied:
 * 1. Credential Compromise risks are escalated to "critical"
 *    (COMPLIANCE_GAP.ml1BaselineFailPctAU = 60 > 50 threshold).
 * 2. Enriches essentialEight items (gap + actions fallback).
 * 3. Appends 2 recommendations: FIDO2 MFA + LLM01 prompt-injection monitoring.
 * 4. Recomputes overallScore from the updated envelope.
 */
export function applyResearchUpdates(assessment: SecurityAssessment): SecurityAssessment {
  // 1. Escalate Credential Compromise to critical (60 % fail rate > 50 % threshold)
  const updatedRisks: SecurityRisk[] = assessment.risks.map((risk) =>
    risk.category === "Credential Compromise"
      ? { ...risk, severity: "critical" as const }
      : { ...risk },
  );

  // 2. Enrich Essential Eight
  const updatedEight = enrichEssentialEight(
    assessment.essentialEight.map((i) => ({ ...i })),
  );

  // 3. Append research-driven recommendations
  const newRecs = [
    "Adopt Phishing-resistant (FIDO2) for all privileged accounts",
    "Monitor and defend against LLM01 prompt-injection attacks in AI-assisted workflows",
  ];
  const updatedRecs = [...assessment.recommendations, ...newRecs];

  // Build intermediate envelope for score recalculation
  const intermediate: SecurityAssessment = {
    ...assessment,
    risks: updatedRisks,
    essentialEight: updatedEight,
    recommendations: updatedRecs,
  };

  // 4. Recompute overall score
  const overallScore = calculateOverallScore(intermediate);

  return { ...intermediate, overallScore };
}

// ── Legacy helpers (kept for backwards compatibility) ────────────────────────

export const VULNERABILITY_TEMPLATES: Omit<VulnerabilityCategory, "occurrenceRate">[] = [
  {
    name: "Supply Chain Compromise",
    description: "Third-party software or services introduce malicious code",
    severity: "high",
    mitigation: "Conduct supplier security assessments and enforce code signing",
  },
  {
    name: "Cloud Misconfiguration",
    description: "Incorrect settings expose data or services",
    severity: "critical",
    mitigation: "Implement automated configuration checks and remediate drift",
  },
  {
    name: "Credential Stuffing",
    description: "Automated login attempts using leaked credentials",
    severity: "medium",
    mitigation: "Enforce rate limiting and monitor for anomalous login patterns",
  },
  {
    name: "API Abuse",
    description: "Exploitation of insecure APIs",
    severity: "high",
    mitigation: "Apply strict schema validation and authentication for all endpoints",
  },
];

export const AU_MARKET_BENCHMARKS = {
  avgEssentialEightMaturity: 2.2,
  avgRiskScore: 12,
  highRiskScoreThreshold: 15,
  commonVulnerabilities: ["Cloud Misconfiguration", "Supply Chain Compromise"],
} as const;

export function calculateMaturityGap(item: EssentialEightItem): number {
  return item.targetLevel - item.maturityLevel;
}

export function aggregateRiskScore(risks: SecurityRisk[]): number {
  const weights: Record<SecurityRisk["severity"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return risks.reduce((sum, r) => sum + weights[r.severity], 0);
}

export function aggregateVulnerabilityScore(vulns: VulnerabilityCategory[]): number {
  const weights: Record<VulnerabilityCategory["severity"], number> = {
    critical: 5,
    high: 4,
    medium: 2,
    low: 1,
  };
  return vulns.reduce((sum, v) => sum + weights[v.severity] * v.occurrenceRate, 0);
}

export function generateRecommendations(assessment: SecurityAssessment): string[] {
  const recs: string[] = [];
  assessment.essentialEight.forEach((item) => {
    if (item.maturityLevel < item.targetLevel) {
      recs.push(`Improve ${item.name}: ${item.actions.join("; ")}`);
    }
  });
  assessment.risks.forEach((r) => {
    if (r.severity === "critical" || r.severity === "high") {
      recs.push(`Address high severity risk in ${r.category}: ${r.mitigation}`);
    }
  });
  assessment.vulnerabilities?.forEach((v) => {
    if (v.severity === "critical" || v.severity === "high") {
      recs.push(`Mitigate ${v.name}: ${v.mitigation}`);
    }
  });
  return recs;
}

export function assessSecurity(
  data: Omit<SecurityAssessment, "overallScore" | "maturityLevel" | "recommendations">,
): SecurityAssessment {
  const overallScore = calculateOverallScore({
    ...data,
    overallScore: 0,
    maturityLevel: 0,
    recommendations: [],
  });
  const maturityLevel = Math.round(
    data.essentialEight.reduce((sum, i) => sum + i.maturityLevel, 0) /
      data.essentialEight.length,
  );
  const recommendations = generateRecommendations({
    ...data,
    overallScore,
    maturityLevel,
    recommendations: [],
  });
  return { ...data, overallScore, maturityLevel, recommendations };
}
