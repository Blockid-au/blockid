// R&D Agent — Client-side types
// Mirror of the server-side types in rnd-analysis.ts (which has "server-only").
// This file can be imported from client components.

import type { SVIAnalysis } from "@/lib/svi-analysis";

export interface RndExtendedSection {
  title: string;
  content: string;          // Markdown
  type: "competitor_profile" | "financial_model" | "action_plan" | "market_data" | "growth_tactics";
  dataPoints?: Record<string, string>;
}

export interface RndReportPage {
  pageId: string;
  pageNum: number;
  title: string;
  subtitle: string;
  content: string;  // Markdown narrative essay
  lockedPreview?: string;   // Preview text of locked deeper analysis
  lockedSections?: string[]; // Titles of sections behind paywall
  score?: number;   // 0-100 dimension score
  highlights?: string[];
  dataPoints?: Record<string, string>;
  extendedSections?: RndExtendedSection[];  // Deep Dive extras
}

export type ReportTier = "preview" | "standard" | "deep_dive";

export interface RndReport {
  version: "1.0.0" | "2.0.0";
  inputType: string;
  inputUrl?: string;
  pages: RndReportPage[];
  overallScore: number;
  createdAt: string;
  tier?: ReportTier;  // defaults to "standard" when absent
  potentialSVI?: number;  // Projected SVI after improvements
  wordCount?: number;     // Actual total word count across all pages
  creditCost?: number;    // Actual credit cost based on word count
}

export const PAGE_DEFS = [
  { id: "executive", num: 1, title: "Executive Summary", subtitle: "Overall startup assessment" },
  { id: "market", num: 2, title: "Market & Problem", subtitle: "Market size, timing, validation" },
  { id: "product", num: 3, title: "Product & Technology", subtitle: "Tech stack, AI usage, maturity" },
  { id: "business", num: 4, title: "Business Model", subtitle: "Revenue, pricing, unit economics" },
  { id: "competition", num: 5, title: "Competition & Moat", subtitle: "Competitors, differentiation" },
  { id: "traction", num: 6, title: "Traction & Growth", subtitle: "Users, traffic, SEO, social proof" },
  { id: "team", num: 7, title: "Team & Execution", subtitle: "Founder signals, domain expertise" },
  { id: "financial", num: 8, title: "Financial Projections", subtitle: "Revenue potential, funding needs" },
  { id: "risk", num: 9, title: "Risk Assessment", subtitle: "Key risks, red flags, mitigation" },
  { id: "recommendations", num: 10, title: "Recommendations", subtitle: "Prioritized action plan" },
] as const;

/** SSE event payloads from /api/rnd */
export interface RndSSEStatus {
  step: string;
  message: string;
}

export interface RndSSEComplete {
  slug: string;
  report: RndReport;
  analysis: SVIAnalysis;
  totalSVI: number;
  tier?: ReportTier;
}

export interface RndSSEError {
  error: string;
}

// ── Client-safe Tech Audit types (mirrors server-only rnd-input.ts) ─────────

export interface ClientSecurityAudit {
  ssl: { valid: boolean; issuer: string; protocol: string; expiresAt: string | null };
  headers: {
    csp: boolean;
    hsts: boolean;
    xFrameOptions: boolean;
    xContentType: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
  };
  headerCount: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface ClientPerformanceAudit {
  ttfbMs: number;
  pageSizeBytes: number;
  compressed: boolean;
  compressionType: string | null;
  cacheControl: boolean;
  etag: boolean;
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface ClientTechStackAudit {
  frameworks: string[];
  cssFrameworks: string[];
  cms: string | null;
  cdn: string | null;
  analytics: string[];
  payments: string[];
  customerTools: string[];
  hosting: string | null;
  serverTech: string | null;
}

export interface ClientProductMaturityAudit {
  hasSitemap: boolean;
  sitemapPageCount: number;
  hasRobotsTxt: boolean;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
  hasTwitterCards: boolean;
  hasPWA: boolean;
  hasViewportMeta: boolean;
  hasMultiLang: boolean;
  hasLoginForm: boolean;
  hasDashboard: boolean;
  hasTestimonials: boolean;
  hasCustomerLogos: boolean;
  socialLinks: string[];
  githubLink: string | null;
}

export interface ClientTechAuditResult {
  url: string;
  auditedAt: string;
  security: ClientSecurityAudit;
  performance: ClientPerformanceAudit;
  techStack: ClientTechStackAudit;
  productMaturity: ClientProductMaturityAudit;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  signalBoosts: {
    ptdBoost: number;
    svmBoost: number;
    treBoost: number;
    lcoBoost: number;
  };
  evidenceLabels: string[];
}
