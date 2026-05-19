// R&D Agent — Report types for the Startup R&D Analysis
// These types define the structure of the 10-page R&D report returned by /api/rnd

import type { SVIAnalysis } from "@/lib/svi-analysis";

export interface RndDataPoint {
  label: string;
  value: string;
}

export interface RndReportPage {
  id: string;
  title: string;
  subtitle?: string;
  score?: number;          // 0–100, optional per page
  content: string;         // Markdown content
  highlights?: string[];   // Key bullet highlights
  dataPoints?: RndDataPoint[];
}

export interface RndReport {
  slug: string;
  pages: RndReportPage[];
  overallScore: number;
  stage: string;
  confidence: number;
  riskFlags: number;
  summary: string;
  techHints?: string[];
  generatedAt: string;
}

export const PAGE_DEFS = [
  { id: "executive-summary",    num: 1,  title: "Executive Summary" },
  { id: "market-analysis",      num: 2,  title: "Market Analysis" },
  { id: "product-assessment",   num: 3,  title: "Product Assessment" },
  { id: "business-model",       num: 4,  title: "Business Model" },
  { id: "competition",          num: 5,  title: "Competitive Landscape" },
  { id: "financials",           num: 6,  title: "Financial Assessment" },
  { id: "team-evaluation",      num: 7,  title: "Team Evaluation" },
  { id: "risk-analysis",        num: 8,  title: "Risk Analysis" },
  { id: "growth-strategy",      num: 9,  title: "Growth Strategy" },
  { id: "recommendations",      num: 10, title: "Recommendations & Next Steps" },
] as const;

/** SSE event payloads from /api/rnd */
export interface RndSSEStatus {
  message: string;
}

export interface RndSSEComplete {
  ok: boolean;
  slug: string;
  totalSVI: number;
  analysis: SVIAnalysis;
  report: RndReport;
  persisted: boolean;
}

export interface RndSSEError {
  error: string;
}
