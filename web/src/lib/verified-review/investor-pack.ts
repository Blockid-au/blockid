// G35 Pricing v5 P4 — the Investor Pack a reviewed Verified report ships with
// (plan §6.1 "+ Investor Pack PDF", §6.6). Built from the REVIEWED ReportV2
// itself — the same numbers the buyer reads — not from live workspace state
// (that is what the paid /api/investor-pack/one-click route assembles). The
// Verified price already includes it, so nothing here touches credits.
//
// `investorPackDataFromReport` is pure; `renderVerifiedInvestorPack` renders
// through lib/pdf/investor-pack.tsx (react-pdf).

import type { InvestorPackData } from "@/lib/pdf/investor-pack";
import { DIM_ORDER, type ReportV2 } from "@/lib/report-v2/schema";
import type { ReviewItem } from "./detail";

/** The 13-criteria table the pack prints — the 8 SVI dimensions carry scores; the other 5 read "no data". */
const PACK_CRITERIA: ReadonlyArray<{ id: string; label: string }> = [
  { id: "ftv", label: "Founder & Team Value" },
  { id: "mpc", label: "Market & Problem Clarity" },
  { id: "ptd", label: "Product & Technical Depth" },
  { id: "tre", label: "Traction & Revenue" },
  { id: "cgh", label: "Cap Table & Governance" },
  { id: "iri", label: "Investor Readiness" },
  { id: "lco", label: "Legal & Compliance" },
  { id: "svm", label: "Strategic Vision & Moat" },
  { id: "gtm", label: "Go-to-Market Strategy" },
  { id: "fin", label: "Financial Projections & Unit Economics" },
  { id: "rsk", label: "Risk Landscape" },
  { id: "brd", label: "Brand & Storytelling" },
  { id: "esg", label: "Ethics, Sustainability & Governance" },
];

const BAND_GRADE: Record<string, string> = { strong: "Strong", developing: "Developing", early: "Early", pending: "Pending" };

function firstSentence(text: string | null | undefined, max = 260): string | undefined {
  const t = (text ?? "").replace(/\[ev:[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  const cut = t.match(/^(.{20,}?[.!?])(\s|$)/)?.[1] ?? t;
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}

function sydneyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Evidence completeness per dimension from the reviewer's decisions (accepted / decided). */
export function reviewCompleteness(items: readonly ReviewItem[], asOfDate: string): InvestorPackData["evidenceCompleteness"] | undefined {
  const decided = items.filter((i) => i.kind !== "claim" && i.decision);
  if (decided.length === 0) return undefined;
  const rows = DIM_ORDER.map((dim) => {
    const mine = decided.filter((i) => i.dims.includes(dim));
    const accepted = mine.filter((i) => i.decision === "accept").length;
    const pct = mine.length ? Math.round((accepted / mine.length) * 100) : 0;
    const status: "Strong" | "Developing" | "Needs Work" = pct >= 75 ? "Strong" : pct >= 40 ? "Developing" : "Needs Work";
    return { dimension: dim, label: PACK_CRITERIA.find((c) => c.id === dim)?.label ?? dim.toUpperCase(), completenessPercent: pct, presentCount: accepted, totalCount: mine.length, status };
  }).filter((r) => r.totalCount > 0);
  const totalAccepted = rows.reduce((a, r) => a + r.presentCount, 0);
  const total = rows.reduce((a, r) => a + r.totalCount, 0);
  return {
    overallPercent: total ? Math.round((totalAccepted / total) * 100) : 0,
    rows,
    interpretation: `A BlockID reviewer checked ${total} evidence item${total === 1 ? "" : "s"} behind this report and accepted ${totalAccepted}. Percentages show accepted items over items reviewed per dimension.`,
    disclosure: "Reviewed evidence is checked for authenticity and relevance; it is not an audit and not financial advice.",
    asOfDate,
  };
}

export function investorPackDataFromReport(
  report: ReportV2,
  opts: { reviewBadge?: string | null; reviewedAt: string; items?: readonly ReviewItem[] },
): InvestorPackData {
  const asOfDate = sydneyDate(opts.reviewedAt);
  const c = report.cover;
  const dimScore = (id: string): number => {
    const d = (c.dims as Record<string, { score?: number; band?: string } | undefined>)[id];
    return d && d.band !== "pending" && typeof d.score === "number" ? d.score : Number.NaN;
  };
  const view = report.investmentView;
  const opportunity = firstSentence(view?.reasons?.[0]?.text ?? report.executive.strengths?.[0]);
  const risk = firstSentence(view?.risks?.[0]?.text ?? report.executive.gaps?.[0]);
  const thesis = firstSentence(report.executive.thesis, 400);
  return {
    startup: { name: c.startupName || "Untitled startup", sector: c.sector || undefined, tagline: c.stageLabel || undefined, asOfDate },
    svi: {
      grade: BAND_GRADE[c.svi.band] ?? "—",
      score: Number.isFinite(c.svi.total) ? c.svi.total : 0,
      ...(typeof c.svi.deltaVsLast === "number" && Number.isFinite(c.svi.deltaVsLast) ? { delta30d: c.svi.deltaVsLast } : {}),
      criteria: PACK_CRITERIA.map((k) => ({ id: k.id, label: k.label, score: dimScore(k.id) })),
      scoreSuffix: "SVI",
    },
    traction: { mrrHistory: [] },
    teaser: {
      headline: c.startupName || "Untitled startup",
      oneliner: thesis ?? `${c.startupName} — Trusted Business Report reviewed by BlockID.`,
      ...(opportunity ? { opportunity } : {}),
      ...(risk ? { risk } : {}),
    },
    evidenceCompleteness: reviewCompleteness(opts.items ?? [], asOfDate),
    cLevelChapter: null,
    ...(opts.reviewBadge ? { reviewBadge: opts.reviewBadge } : {}),
  };
}

/** Render the pack (react-pdf). Lazy import keeps @react-pdf out of callers that never render. */
export async function renderVerifiedInvestorPack(data: InvestorPackData): Promise<Buffer> {
  const { renderInvestorPack } = await import("@/lib/pdf/investor-pack");
  return renderInvestorPack(data);
}
