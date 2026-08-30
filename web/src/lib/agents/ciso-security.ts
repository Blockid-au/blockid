// src/lib/agents/ciso-security.ts
export interface SecurityAssessment {
  overallScore: number;
  maturityLevel: number;
  essentialEight: EssentialEightItem[];
  webSecurityHeaders: SecurityHeader[];
  risks: SecurityRisk[];
  vulnerabilities: VulnerabilityCategory[];
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
export const ESSENTIAL_EIGHT_TEMPLATE: Omit<EssentialEightItem, "maturityLevel" | "gap">[] = [
  {
    name: "Application Control",
    description: "Prevent execution of unapproved programs",
    targetLevel: 2,
    actions: [
      "Implement allow-listing for executables",
      "Block script execution from user-writable directories",
      "Log blocked execution attempts"
    ]
  },
  {
    name: "Patch Applications",
    description: "Keep applications up to date with security patches",
    targetLevel: 2,
    actions: [
      "Enable automatic updates for all applications",
      "Patch critical vulnerabilities within 48 hours",
      "Remove unsupported applications"
    ]
  },
  {
    name: "Configure Microsoft Office Macros",
    description: "Block or restrict Office macro execution",
    targetLevel: 2,
    actions: [
      "Block macros from the internet",
      "Only allow vetted macros in trusted locations",
      "Log macro execution events"
    ]
  },
  {
    name: "User Application Hardening",
    description: "Harden web browsers and applications",
    targetLevel: 2,
    actions: [
      "Disable Flash, Java, and ads in browsers",
      "Restrict installation of unnecessary plugins",
      "Enforce secure configuration baselines"
    ]
  },
  {
    name: "Restrict Administrative Privileges",
    description: "Limit admin rights to essential personnel",
    targetLevel: 2,
    actions: [
      "Implement least‑privilege principle",
      "Review admin accounts quarterly",
      "Require MFA for privileged access"
    ]
  },
  {
    name: "Patch Operating Systems",
    description: "Apply OS security updates promptly",
    targetLevel: 2,
    actions: [
      "Automate OS patch deployment",
      "Prioritise critical patches within 24 hours",
      "Maintain an inventory of OS versions"
    ]
  },
  {
    name: "Multi‑Factor Authentication",
    description: "Add MFA to all remote access",
    targetLevel: 2,
    actions: [
      "Deploy MFA for VPN and cloud services",
      "Enforce hardware token or authenticator app",
      "Monitor MFA failures for suspicious activity"
    ]
  },
  {
    name: "Daily Backups",
    description: "Ensure regular, tested backups",
    targetLevel: 2,
    actions: [
      "Automate daily backups of critical data",
      "Test restore procedures monthly",
      "Store backups offline and geographically separate"
    ]
  }
];
/** @type {Omit<VulnerabilityCategory, "occurrenceRate">[]} */
export const VULNERABILITY_TEMPLATES = [
  {
    name: "Supply Chain Compromise",
    description: "Third‑party software or services introduce malicious code",
    severity: "high",
    mitigation: "Conduct supplier security assessments and enforce code signing"
  },
  {
    name: "Cloud Misconfiguration",
    description: "Incorrect settings expose data or services",
    severity: "critical",
    mitigation: "Implement automated configuration checks and remediate drift"
  },
  {
    name: "Credential Stuffing",
    description: "Automated login attempts using leaked credentials",
    severity: "medium",
    mitigation: "Enforce rate limiting and monitor for anomalous login patterns"
  },
  {
    name: "API Abuse",
    description: "Exploitation of insecure APIs",
    severity: "high",
    mitigation: "Apply strict schema validation and authentication for all endpoints"
  }
];
export const AU_MARKET_BENCHMARKS = {
  avgEssentialEightMaturity: 2.2,
  avgRiskScore: 12,
  highRiskScoreThreshold: 15,
  commonVulnerabilities: ["Cloud Misconfiguration", "Supply Chain Compromise"]
} as const;
export function calculateMaturityGap(item: EssentialEightItem): number {
  return item.targetLevel - item.maturityLevel;
}
export function aggregateRiskScore(risks: SecurityRisk[]): number {
  const weights: Record<SecurityRisk["severity"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };
  return risks.reduce((sum, r) => sum + weights[r.severity], 0);
}
export function aggregateVulnerabilityScore(vulns: VulnerabilityCategory[]): number {
  const weights: Record<VulnerabilityCategory["severity"], number> = {
    critical: 5,
    high: 4,
    medium: 2,
    low: 1
  };
  return vulns.reduce((sum, v) => sum + weights[v.severity] * v.occurrenceRate, 0);
}
export function calculateOverallScore(assessment: SecurityAssessment): number {
  const essentialScore = assessment.essentialEight.reduce((sum, i) => sum + i.maturityLevel / i.targetLevel, 0) / assessment.essentialEight.length * 100;
  const riskScore = aggregateRiskScore(assessment.risks);
  const vulnScore = aggregateVulnerabilityScore(assessment.vulnerabilities);
  const weighted = essentialScore * 0.5 + riskScore * 0.3 + vulnScore * 0.2;
  return Math.round(weighted * 100) / 100;
}
export function generateRecommendations(assessment: SecurityAssessment): string[] {
  const recs: string[] = [];
  assessment.essentialEight.forEach(item => {
    if (item.maturityLevel < item.targetLevel) {
      recs.push(`Improve ${item.name}: ${item.actions.join("; ")}`);
    }
  });
  assessment.risks.forEach(r => {
    if (r.severity === "critical" || r.severity === "high") {
      recs.push(`Address high severity risk in ${r.category}: ${r.mitigation}`);
    }
  });
  assessment.vulnerabilities.forEach(v => {
    if (v.severity === "critical" || v.severity === "high") {
      recs.push(`Mitigate ${v.name}: ${v.mitigation}`);
    }
  });
  return recs;
}
export function assessSecurity(data: Omit<SecurityAssessment, "overallScore" | "maturityLevel" | "recommendations">): SecurityAssessment {
  const overallScore = calculateOverallScore({ ...data, overallScore: 0, maturityLevel: 0, recommendations: [] });
  const maturityLevel = Math.round(data.essentialEight.reduce((sum, i) => sum + i.maturityLevel, 0) / data.essentialEight.length);
  const recommendations = generateRecommendations({ ...data, overallScore, maturityLevel, recommendations: [] });
  return { ...data, overallScore, maturityLevel, recommendations };
}
