// CISO Domain: Security Posture Assessment
//
// Essential Eight maturity assessment, vulnerability categories,
// security scoring, and incident response framework.

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

// ── Essential Eight Framework ──────────────────────────────────────────

export const ESSENTIAL_EIGHT_TEMPLATE: Omit<EssentialEightItem, "maturityLevel" | "gap">[] = [
  {
    name: "Application Control",
    description: "Prevent execution of unapproved programs",
    targetLevel: 2,
    actions: ["Implement allow-listing for executables", "Block script execution from user-writable directories", "Log blocked execution attempts"],
  },
  {
    name: "Patch Applications",
    description: "Keep applications up to date with security patches",
    targetLevel: 2,
    actions: ["Enable automatic updates for all applications", "Patch critical vulnerabilities within 48 hours", "Remove unsupported applications"],
  },
  {
    name: "Configure Microsoft Office Macros",
    description: "Block or restrict Office macro execution",
    targetLevel: 2,
    actions: ["Block macros from the internet", "Only allow vetted macros in trusted locations", "Log macro execution events"],
  },
  {
    name: "User Application Hardening",
    description: "Harden web browsers and applications",
    targetLevel: 2,
    actions: ["Disable Flash, Java, and ads in browsers", "Block untrusted browser extensions", "Use content security policy headers"],
  },
  {
    name: "Restrict Administrative Privileges",
    description: "Minimize admin access to reduce attack surface",
    targetLevel: 2,
    actions: ["Implement least privilege access", "Use separate admin accounts", "Review admin access quarterly"],
  },
  {
    name: "Patch Operating Systems",
    description: "Keep OS up to date with security patches",
    targetLevel: 2,
    actions: ["Enable automatic OS updates", "Patch critical OS vulnerabilities within 48 hours", "Replace end-of-life operating systems"],
  },
  {
    name: "Multi-Factor Authentication",
    description: "Require MFA for all remote and privileged access",
    targetLevel: 2,
    actions: ["Enable MFA for all user accounts", "Use phishing-resistant MFA where possible", "Enforce MFA for admin and VPN access"],
  },
  {
    name: "Regular Backups",
    description: "Maintain and test backups of critical data",
    targetLevel: 2,
    actions: ["Automate daily backups", "Store backups offline or in separate environment", "Test backup restoration quarterly"],
  },
];

// ── Web Security Headers Check ─────────────────────────────────────────

export const REQUIRED_HEADERS: { header: string; recommendation: string }[] = [
  { header: "strict-transport-security", recommendation: "Add HSTS with max-age >= 31536000 and includeSubDomains" },
  { header: "content-security-policy", recommendation: "Implement CSP to prevent XSS and data injection" },
  { header: "x-content-type-options", recommendation: "Set to 'nosniff' to prevent MIME type sniffing" },
  { header: "x-frame-options", recommendation: "Set to 'DENY' or 'SAMEORIGIN' to prevent clickjacking" },
  { header: "referrer-policy", recommendation: "Set to 'strict-origin-when-cross-origin' or stricter" },
  { header: "permissions-policy", recommendation: "Restrict browser features (camera, microphone, geolocation)" },
];

// ── Security Score Calculation ─────────────────────────────────────────

export function calculateSecurityScore(input: {
  essentialEightLevels: number[];
  headersPresent: number;
  totalHeaders: number;
  hasMFA: boolean;
  hasBackups: boolean;
  hasIncidentPlan: boolean;
  lastPatchDays: number;
}): { score: number; grade: string; level: number } {
  let score = 0;

  // Essential Eight: 50 points (6.25 per item × maturity level)
  const e8Score = input.essentialEightLevels.reduce((s, l) => s + Math.min(3, l) * 2.08, 0);
  score += Math.min(50, e8Score);

  // Headers: 15 points
  score += (input.headersPresent / Math.max(1, input.totalHeaders)) * 15;

  // MFA: 10 points
  if (input.hasMFA) score += 10;

  // Backups: 10 points
  if (input.hasBackups) score += 10;

  // Incident plan: 5 points
  if (input.hasIncidentPlan) score += 5;

  // Patch freshness: 10 points
  if (input.lastPatchDays <= 7) score += 10;
  else if (input.lastPatchDays <= 30) score += 7;
  else if (input.lastPatchDays <= 90) score += 3;

  score = Math.round(Math.min(100, score));

  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const level = score >= 90 ? 3 : score >= 70 ? 2 : score >= 40 ? 1 : 0;

  return { score, grade, level };
}

// ── OWASP Top 10 Risk Categories ───────────────────────────────────────

export const OWASP_TOP_10 = [
  { id: "A01", name: "Broken Access Control", description: "Restrictions on authenticated users not properly enforced" },
  { id: "A02", name: "Cryptographic Failures", description: "Failures related to cryptography or lack thereof" },
  { id: "A03", name: "Injection", description: "SQL, NoSQL, OS, or LDAP injection flaws" },
  { id: "A04", name: "Insecure Design", description: "Missing or ineffective security controls by design" },
  { id: "A05", name: "Security Misconfiguration", description: "Improperly configured permissions, default settings" },
  { id: "A06", name: "Vulnerable Components", description: "Using components with known vulnerabilities" },
  { id: "A07", name: "Auth Failures", description: "Broken authentication and session management" },
  { id: "A08", name: "Data Integrity Failures", description: "Code and infrastructure that doesn't protect against integrity violations" },
  { id: "A09", name: "Security Logging Failures", description: "Insufficient logging, detection, monitoring" },
  { id: "A10", name: "SSRF", description: "Server-Side Request Forgery" },
];
