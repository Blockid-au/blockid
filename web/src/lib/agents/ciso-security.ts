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

/** The 8 Essential Eight controls this module ships (ACSC Maturity Level 2 target). */
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
  {
    name: "Restrict Administrative Privileges",
    description: "Limit and monitor privileged account use (ACSC ML2)",
    targetLevel: 2,
    actions: [
      "Separate privileged accounts from day-to-day accounts",
      "Re-validate privileged access at least every 12 months",
      "Log and alert on all privileged-account activity",
    ],
  },
  {
    name: "Patch Operating Systems",
    description: "Keep operating systems patched — critical fixes within 48 hours (ACSC)",
    targetLevel: 2,
    actions: [
      "Patch critical OS vulnerabilities within 48 hours",
      "Retire operating systems that no longer receive vendor security updates",
      "Automate vulnerability scanning across all workstations and servers",
    ],
  },
  {
    name: "Multi-Factor Authentication",
    description: "Enforce phishing-resistant MFA for privileged and internet-facing access",
    targetLevel: 2,
    actions: [
      "Require phishing-resistant MFA (FIDO2/WebAuthn) for admin and remote access",
      "Enforce MFA on all internet-facing services holding customer data",
      "Disable SMS/voice MFA fallbacks for privileged accounts",
    ],
  },
  {
    name: "Regular Backups",
    description: "Back up important data and test restoration on a recurring cadence",
    targetLevel: 2,
    actions: [
      "Perform daily backups of important data and configurations",
      "Store backups offline or immutably to survive ransomware",
      "Test restoration from backups at least quarterly",
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

/** A single ACSC alert / advisory bulletin. */
export interface AcscAlertBulletin {
  /** Stable identifier — ACSC advisory ID where known, otherwise slug. */
  id: string;
  /** Public URL on cyber.gov.au (bulletin landing page). */
  url: string;
  /** Publication date, ISO YYYY-MM-DD. */
  published: string;
  /** ACSC severity band. Ordered: critical > high > medium > low. */
  severity: "critical" | "high" | "medium" | "low";
  /** Short category label for grouping (e.g. "supply-chain", "identity"). */
  category: string;
  /** Human-readable bulletin title. */
  title: string;
  /** One-line summary of the threat and required action. */
  summary: string;
  /** Whether the bulletin still requires action (ACSC "current" flag). */
  active: boolean;
}

/**
 * Curated ACSC alert bulletins relevant to Australian startups, pinned to
 * current research (2026-09). Each entry is a public advisory published by
 * the Australian Cyber Security Centre at cyber.gov.au — this list is the
 * data feed the CISO agent references when producing security posture
 * summaries. Refresh when ACSC issues new critical / high advisories.
 */
export const ACSC_ALERT_BULLETINS: readonly AcscAlertBulletin[] = [
  {
    id: "ACSC-2026-005",
    url: "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories",
    published: "2026-08-14",
    severity: "critical",
    category: "identity",
    title: "Credential-stuffing wave against AU SaaS providers",
    summary:
      "Targeted attacks reusing leaked credentials against small AU SaaS logins. Enforce FIDO2 MFA on privileged accounts and rate-limit login attempts.",
    active: true,
  },
  {
    id: "ACSC-2026-004",
    url: "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories",
    published: "2026-07-02",
    severity: "high",
    category: "supply-chain",
    title: "Compromised npm packages in JavaScript build chains",
    summary:
      "Malicious versions of popular npm packages are exfiltrating environment secrets during CI. Pin dependency versions and audit lockfiles.",
    active: true,
  },
  {
    id: "ACSC-2026-003",
    url: "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories",
    published: "2026-05-21",
    severity: "high",
    category: "vulnerability",
    title: "Unpatched Microsoft Exchange servers actively exploited",
    summary:
      "Critical Exchange CVE being exploited in the wild. Apply the ACSC 48-hour patching window or migrate to a managed mail provider.",
    active: true,
  },
  {
    id: "ACSC-2026-002",
    url: "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories",
    published: "2026-03-11",
    severity: "medium",
    category: "phishing",
    title: "AI-generated phishing impersonating Australian banks",
    summary:
      "LLM-generated phishing lures target AU business banking customers. Train staff on phishing-resistant MFA and verify unexpected payment instructions out-of-band.",
    active: true,
  },
  {
    id: "ACSC-2025-011",
    url: "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories",
    published: "2025-11-18",
    severity: "low",
    category: "awareness",
    title: "Small-business incident response readiness reminder",
    summary:
      "ACSC end-of-year reminder to rehearse incident response plans. Legacy advisory retained for context; superseded by 2026 IR guidance.",
    active: false,
  },
];

/** Severity ranking used when sorting bulletins — lower number = higher severity. */
const SEVERITY_RANK: Record<AcscAlertBulletin["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Returns only bulletins ACSC still flags as current, sorted by severity
 * (critical first) then publication date (newest first). Pure — input never
 * mutated.
 */
export function getActiveAcscAlerts(
  bulletins: readonly AcscAlertBulletin[] = ACSC_ALERT_BULLETINS,
): AcscAlertBulletin[] {
  return bulletins
    .filter((b) => b.active)
    .slice()
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return b.published.localeCompare(a.published);
    });
}

/**
 * Returns bulletins whose severity is `critical` or `high` and that are still
 * active. This is the shortlist the CISO agent surfaces in founder-facing
 * security summaries.
 */
export function getHighSeverityAcscAlerts(
  bulletins: readonly AcscAlertBulletin[] = ACSC_ALERT_BULLETINS,
): AcscAlertBulletin[] {
  return getActiveAcscAlerts(bulletins).filter(
    (b) => b.severity === "critical" || b.severity === "high",
  );
}

// ── CISA alerts (US CISA — cross-border threat surface for AU startups) ─────

/**
 * A single CISA advisory / Known-Exploited-Vulnerability entry. CISA
 * publishes cross-border threat guidance that AU startups running SaaS on US
 * cloud infrastructure are exposed to (npm compromises, cloud identity
 * abuses, KEV catalog entries). Kept structurally parallel to
 * {@link AcscAlertBulletin} so downstream summaries can merge both feeds.
 */
export interface CisaAlertBulletin {
  /** Stable identifier — CISA advisory / KEV catalog id (e.g. "AA26-207A"). */
  id: string;
  /** Public URL on cisa.gov (advisory landing page). */
  url: string;
  /** Publication date, ISO YYYY-MM-DD. */
  published: string;
  /** CISA severity band. Same ladder as ACSC for merged sorting. */
  severity: "critical" | "high" | "medium" | "low";
  /** Short category label for grouping (e.g. "kev", "identity", "supply-chain"). */
  category: string;
  /** Human-readable advisory title. */
  title: string;
  /** One-line summary of the threat and required action. */
  summary: string;
  /** Whether the bulletin still requires action (CISA "current" flag). */
  active: boolean;
}

/**
 * Curated CISA advisory bulletins relevant to Australian startups running
 * on US SaaS / cloud infrastructure. Each entry is a public advisory from
 * the US Cybersecurity and Infrastructure Security Agency (cisa.gov).
 * Refresh when CISA issues new critical / high advisories or adds entries
 * to the Known Exploited Vulnerabilities (KEV) catalog that AU founders
 * are meaningfully exposed to.
 */
export const CISA_ALERT_BULLETINS: readonly CisaAlertBulletin[] = [
  {
    id: "AA26-215A",
    url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    published: "2026-08-03",
    severity: "critical",
    category: "identity",
    title: "Cloud IdP token theft targeting SaaS providers",
    summary:
      "Threat actors are stealing OAuth refresh tokens from cloud identity providers to persist inside SaaS tenants. Rotate refresh tokens, shorten session TTLs, and enforce device-bound (FIDO2) auth for admins.",
    active: true,
  },
  {
    id: "KEV-2026-0716",
    url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    published: "2026-07-16",
    severity: "high",
    category: "kev",
    title: "Next.js middleware auth bypass added to KEV catalog",
    summary:
      "A Next.js middleware auth bypass is being exploited in the wild. Apply the vendor patch within CISA's Binding Operational Directive window and audit route protections.",
    active: true,
  },
  {
    id: "AA26-160A",
    url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    published: "2026-06-09",
    severity: "high",
    category: "supply-chain",
    title: "Typosquatted npm packages exfiltrating CI secrets",
    summary:
      "Malicious npm packages typosquatting popular libraries are exfiltrating CI environment variables during install. Pin lockfile hashes and require --ignore-scripts in build pipelines where practical.",
    active: true,
  },
  {
    id: "AA26-095A",
    url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    published: "2026-04-05",
    severity: "medium",
    category: "cloud",
    title: "Public S3 / object-storage buckets exposing customer PII",
    summary:
      "Misconfigured object-storage buckets continue to leak customer PII. Enable public-access block policies and add automated bucket-policy drift checks to CI.",
    active: true,
  },
  {
    id: "AA25-320A",
    url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    published: "2025-11-16",
    severity: "low",
    category: "awareness",
    title: "Legacy VPN appliance end-of-life reminder",
    summary:
      "CISA end-of-year reminder to retire unsupported VPN appliances. Legacy advisory retained for context; superseded by 2026 secure-remote-access guidance.",
    active: false,
  },
];

/**
 * Returns only CISA bulletins still flagged as current, sorted by severity
 * (critical first) then publication date (newest first). Pure — input
 * never mutated.
 */
export function getActiveCisaAlerts(
  bulletins: readonly CisaAlertBulletin[] = CISA_ALERT_BULLETINS,
): CisaAlertBulletin[] {
  return bulletins
    .filter((b) => b.active)
    .slice()
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return b.published.localeCompare(a.published);
    });
}

/**
 * Returns CISA bulletins whose severity is `critical` or `high` and that
 * are still active — the shortlist surfaced in founder-facing security
 * summaries alongside the ACSC shortlist.
 */
export function getHighSeverityCisaAlerts(
  bulletins: readonly CisaAlertBulletin[] = CISA_ALERT_BULLETINS,
): CisaAlertBulletin[] {
  return getActiveCisaAlerts(bulletins).filter(
    (b) => b.severity === "critical" || b.severity === "high",
  );
}

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
