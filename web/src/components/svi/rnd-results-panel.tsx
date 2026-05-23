"use client";

import * as React from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Globe,
  Lightbulb,
  Mail,
  PieChart,
  Rocket,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { RndPageLock } from "@/components/svi/rnd-page-lock";
import { RndLockedSection } from "@/components/svi/rnd-locked-section";
import type { RndReport, RndReportPage, ReportTier, ClientTechAuditResult } from "@/lib/rnd-types";
import { PAGE_DEFS } from "@/lib/rnd-types";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { InfoTooltip } from "@/components/ui/info-tooltip";

const DIMENSION_TOOLTIPS: Record<string, string> = {
  ftv: "Founder & Team Value: Evaluates founder experience, co-founder presence, advisory board, domain expertise, and team completeness. Weighted 15% of total SVI.",
  mpc: "Market & Problem Clarity: Assesses market size (TAM/SAM/SOM), problem validation, customer interviews, market timing, and competitive landscape. Weighted 18% — the highest dimension.",
  ptd: "Product & Technical: Measures product maturity, tech stack quality, demo availability, source code, website presence, and AI/ML capabilities. Weighted 12%.",
  tre: "Traction & Revenue: Tracks revenue band, customer count, analytics data, social proof, and growth trajectory. Weighted 20% — strongest signal for investors.",
  cgh: "Cap Table & Governance: Evaluates cap table cleanliness, vesting schedules, shareholder agreements, ESOP allocation, and board governance. Weighted 12%.",
  iri: "Investor Readiness: Checks pitch deck, financial model, data room, fundraise target, and investor materials completeness. Weighted 10%.",
  lco: "Legal & Compliance: Assesses ABN/ASIC registration, IP protection, contracts, legal documentation, and regulatory compliance. Weighted 8%.",
  svm: "Strategic Vision & Moat: Evaluates defensible moat, network effects, data advantage, switching costs, and long-term strategic positioning. Weighted 5%.",
};

const SVI_SCORE_TOOLTIP = "The Startup Value Index (SVI) is an open-ended index measuring your startup's overall strength across 8 dimensions. Like a stock market index, higher is better with no upper limit. The score grows as you add evidence, build products, gain traction, and structure your company.";

const PAGE_TOOLTIPS: Record<string, string> = {
  market: DIMENSION_TOOLTIPS.mpc,
  product: DIMENSION_TOOLTIPS.ptd,
  business: DIMENSION_TOOLTIPS.tre,
  competition: DIMENSION_TOOLTIPS.svm,
  traction: DIMENSION_TOOLTIPS.tre,
  team: DIMENSION_TOOLTIPS.ftv,
  financial: DIMENSION_TOOLTIPS.iri,
  risk: "Risk Assessment: Identifies key threats including market risk, execution risk, competitive risk, and regulatory risk. Each risk factor reduces the SVI score.",
};

/* ─── Page icon map ──────────────────────────────────────────────────── */

const PAGE_ICONS: Record<number, React.ElementType> = {
  1: FileText,
  2: Globe,
  3: Rocket,
  4: PieChart,
  5: Target,
  6: BarChart3,
  7: Users,
  8: Shield,
  9: TrendingUp,
  10: Lightbulb,
};

/* ─── Hook: Intersection Observer for scroll tracking ─────────────────── */

function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = React.useState(ids[0] ?? "");

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
        }
        if (best?.target.id) {
          setActiveId(best.target.id);
        }
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
    elements.forEach((el) => observer.observe(el!));

    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

/* ─── Simple markdown renderer ───────────────────────────────────────── */

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`list-${listKey++}`} className="space-y-1 my-3 ml-1">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  const inlineFormat = (text: string): React.ReactNode => {
    // Bold
    const parts: React.ReactNode[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={match.index} className="font-semibold text-ink-800">
          {match[1]}
        </strong>,
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold text-ink-800 mt-5 mb-2">
          {inlineFormat(trimmed.slice(4))}
        </h3>,
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      nodes.push(
        <h2 key={`h2-${i}`} className="text-lg font-bold text-ink-800 mt-6 mb-3">
          {inlineFormat(trimmed.slice(3))}
        </h2>,
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      nodes.push(
        <h1 key={`h1-${i}`} className="text-xl font-bold text-ink-800 mt-6 mb-4">
          {inlineFormat(trimmed.slice(2))}
        </h1>,
      );
      continue;
    }

    // Bullets
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(
        <li key={`li-${i}`} className="flex items-start gap-2 text-sm text-ink-600">
          <span className="mt-1.5 shrink-0 block w-1.5 h-1.5 rounded-full bg-brand-500" />
          <span className="leading-relaxed">{inlineFormat(trimmed.slice(2))}</span>
        </li>,
      );
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      listItems.push(
        <li key={`oli-${i}`} className="flex items-start gap-2 text-sm text-ink-600">
          <span className="text-brand-600 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">
            {olMatch[1]}.
          </span>
          <span className="leading-relaxed">{inlineFormat(olMatch[2])}</span>
        </li>,
      );
      continue;
    }

    // Regular paragraph
    flushList();
    nodes.push(
      <p key={`p-${i}`} className="text-sm text-ink-600 leading-relaxed my-2">
        {inlineFormat(trimmed)}
      </p>,
    );
  }

  flushList();
  return nodes;
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function ScoreGauge({ value, label }: { value: number; label?: string }) {
  const color =
    value >= 80
      ? "text-emerald-600"
      : value >= 60
        ? "text-brand-600"
        : value >= 40
          ? "text-amber-600"
          : "text-red-600";

  const bgColor =
    value >= 80
      ? "bg-emerald-500"
      : value >= 60
        ? "bg-brand-500"
        : value >= 40
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-end justify-center gap-1">
        <span
          className={cn(
            "font-mono text-6xl sm:text-7xl font-bold tabular-nums tracking-tight leading-none",
            color,
          )}
        >
          {value}
        </span>
        <span className="mb-2 text-sm text-ink-600 font-mono">/100</span>
      </div>
      {label && (
        <span className="text-sm font-medium text-ink-700">{label}</span>
      )}
      <div className="w-full max-w-48 h-2 rounded-full bg-surface-200 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", bgColor)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function LargeScoreGauge({
  value,
  stage,
  confidence,
  riskFlags,
  delta,
}: {
  value: number;
  stage: string;
  confidence: number;
  riskFlags: number;
  delta?: number | null;
}) {
  const color =
    value >= 80
      ? "text-emerald-600"
      : value >= 60
        ? "text-brand-600"
        : value >= 40
          ? "text-amber-600"
          : "text-red-600";

  const qualitative =
    value >= 80
      ? "Excellent"
      : value >= 60
        ? "Strong"
        : value >= 40
          ? "Average"
          : value >= 20
            ? "Below Average"
            : "Critical";

  return (
    <div className="text-center mb-8">
      <div className="flex items-baseline gap-3 justify-center mb-3">
        <div className="relative flex items-end justify-center gap-1">
          <span
            className={cn(
              "font-mono text-7xl sm:text-8xl font-bold tabular-nums tracking-tight leading-none",
              color,
            )}
          >
            {value}
          </span>
          <span className="mb-2 text-sm text-ink-600 font-mono flex items-center gap-1">
            /100
            <InfoTooltip text={SVI_SCORE_TOOLTIP} />
          </span>
        </div>
        {delta !== undefined && delta !== null && delta !== 0 && (
          <span className={cn(
            "flex items-center gap-1 text-lg font-semibold",
            delta > 0 ? "text-emerald-600" : "text-red-600"
          )}>
            {delta > 0 ? "\u25B2" : "\u25BC"} {Math.abs(delta).toFixed(1)}
            <span className="text-xs text-ink-500 ml-1">vs previous</span>
          </span>
        )}
      </div>
      <span className={cn("text-lg font-semibold", color)}>{qualitative}</span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <MetricCard label="Overall Score" value={value} color={color} />
        <MetricCard label="Stage" value={stage} />
        <MetricCard
          label="Confidence"
          value={`${Math.round(confidence * 100)}%`}
          color={confidence >= 0.5 ? "text-emerald-600" : "text-amber-600"}
        />
        <MetricCard
          label="Risk Flags"
          value={riskFlags}
          color={
            riskFlags > 3
              ? "text-red-600"
              : riskFlags > 0
                ? "text-amber-600"
                : "text-emerald-600"
          }
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtext,
  color = "text-ink-800",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium mb-1">
        {label}
      </p>
      <p className={cn("text-xl font-bold font-mono", color)}>{value}</p>
      {subtext && <p className="text-xs text-ink-600 mt-0.5">{subtext}</p>}
    </div>
  );
}

function PageHeader({
  num,
  title,
  icon: Icon,
  tooltip,
}: {
  num: number;
  title: string;
  icon: React.ElementType;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-200">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 border border-brand-200 text-sm font-bold text-brand-600 font-mono">
        {num}
      </span>
      <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-600 shrink-0" />
      <h2 className="text-lg font-semibold text-ink-800 tracking-tight">{title}</h2>
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  );
}

function PageNavigation({
  currentPage,
  totalPages,
  onNavigate,
}: {
  currentPage: number;
  totalPages: number;
  onNavigate: (page: number) => void;
}) {
  const prevDef = currentPage > 1 ? PAGE_DEFS[currentPage - 2] : null;
  const nextDef = currentPage < totalPages ? PAGE_DEFS[currentPage] : null;

  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-surface-200">
      {prevDef ? (
        <button
          type="button"
          onClick={() => onNavigate(prevDef.num)}
          className="flex items-center gap-2 text-sm text-ink-600 hover:text-brand-600 transition-colors cursor-pointer"
        >
          <ChevronLeft strokeWidth={1.75} className="h-4 w-4" />
          <span className="hidden sm:inline">{prevDef.title}</span>
          <span className="sm:hidden">Previous</span>
        </button>
      ) : (
        <div />
      )}
      <span className="text-xs text-ink-600 font-mono">
        {currentPage} / {totalPages}
      </span>
      {nextDef ? (
        <button
          type="button"
          onClick={() => onNavigate(nextDef.num)}
          className="flex items-center gap-2 text-sm text-ink-600 hover:text-brand-600 transition-colors cursor-pointer"
        >
          <span className="hidden sm:inline">{nextDef.title}</span>
          <span className="sm:hidden">Next</span>
          <ChevronRight strokeWidth={1.75} className="h-4 w-4" />
        </button>
      ) : (
        <div />
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  const barColor =
    pct >= 70
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-brand-500"
        : pct >= 35
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink-800">{label}</span>
        <span className="text-xs text-ink-600 font-mono">{pct}/100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-200 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Desktop TOC ────────────────────────────────────────────────────── */

function DesktopTOC({
  activeId,
  onNavigate,
  pageCount,
}: {
  activeId: string;
  onNavigate: (id: string) => void;
  pageCount: number;
}) {
  return (
    <nav className="hidden lg:block sticky top-24 w-56 shrink-0">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-600 font-medium mb-3 px-3">
        R&D Report
      </p>
      <ul className="space-y-0.5">
        {PAGE_DEFS.slice(0, pageCount).map((page) => {
          const isActive = activeId === page.id;
          const Icon = PAGE_ICONS[page.num] ?? FileText;
          return (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => onNavigate(page.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                  isActive
                    ? "bg-brand-50 text-brand-600 font-medium border border-brand-200"
                    : "text-ink-600 hover:bg-surface-100 hover:text-ink-800",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold font-mono shrink-0",
                    isActive ? "bg-brand-600 text-white" : "bg-surface-200 text-ink-600",
                  )}
                >
                  {page.num}
                </span>
                <span className="truncate">{page.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ─── Mobile progress dots ───────────────────────────────────────────── */

function MobileProgressDots({
  activeId,
  pageCount,
}: {
  activeId: string;
  pageCount: number;
}) {
  const pages = PAGE_DEFS.slice(0, pageCount);
  const activeIdx = pages.findIndex((p) => p.id === activeId);

  return (
    <div className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-surface-200 px-4 py-3">
      <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-1.5">
          {pages.map((page, idx) => (
            <button
              key={page.id}
              type="button"
              onClick={() => {
                document
                  .getElementById(page.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "h-2 rounded-full transition-all cursor-pointer",
                idx === activeIdx
                  ? "w-6 bg-brand-600"
                  : idx < activeIdx
                    ? "w-2 bg-brand-300"
                    : "w-2 bg-surface-300",
              )}
              aria-label={`Go to page ${page.num}: ${page.title}`}
            />
          ))}
        </div>
        <span className="text-xs text-ink-600 font-mono shrink-0">
          {activeIdx + 1}/{pageCount}
        </span>
      </div>
      <p className="text-xs font-medium text-ink-800 mt-1 text-center lg:hidden">
        {pages[activeIdx >= 0 ? activeIdx : 0]?.title}
      </p>
    </div>
  );
}

/* ─── Tech Audit Card (Page 3: Product & Technology) ────────────────── */

function GradeBadge({ grade, label }: { grade: string; label: string }) {
  const colors: Record<string, string> = {
    A: "bg-emerald-50 text-emerald-700 border-emerald-200",
    B: "bg-brand-50 text-brand-700 border-brand-200",
    C: "bg-amber-50 text-amber-700 border-amber-200",
    D: "bg-orange-50 text-orange-700 border-orange-200",
    F: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-center", colors[grade] ?? colors.C)}>
      <p className="text-[10px] uppercase tracking-[0.15em] font-medium mb-1 opacity-70">{label}</p>
      <p className="text-2xl font-bold font-mono">{grade}</p>
    </div>
  );
}

function SignalRow({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        active ? "text-emerald-700" : "text-ink-400",
      )}
    >
      {active ? (
        <CheckCircle2 strokeWidth={2} className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink-300 text-[8px] text-ink-400">x</span>
      )}
      {label}
    </span>
  );
}

function TechAuditCard({ audit }: { audit: ClientTechAuditResult }) {
  const ts = audit.techStack;
  const pm = audit.productMaturity;

  // Collect all tech stack badges
  const badges: { label: string; color: string }[] = [];
  for (const fw of ts.frameworks) badges.push({ label: fw, color: "bg-blue-50 text-blue-700 border-blue-200" });
  for (const css of ts.cssFrameworks) badges.push({ label: css, color: "bg-violet-50 text-violet-700 border-violet-200" });
  if (ts.cms) badges.push({ label: ts.cms, color: "bg-amber-50 text-amber-700 border-amber-200" });
  if (ts.cdn) badges.push({ label: ts.cdn, color: "bg-cyan-50 text-cyan-700 border-cyan-200" });
  if (ts.hosting && ts.hosting !== ts.cdn) badges.push({ label: ts.hosting, color: "bg-slate-50 text-slate-700 border-slate-200" });
  if (ts.serverTech) badges.push({ label: ts.serverTech, color: "bg-slate-50 text-slate-700 border-slate-200" });
  for (const a of ts.analytics) badges.push({ label: a, color: "bg-emerald-50 text-emerald-700 border-emerald-200" });
  for (const p of ts.payments) badges.push({ label: p, color: "bg-green-50 text-green-700 border-green-200" });
  for (const c of ts.customerTools) badges.push({ label: c, color: "bg-pink-50 text-pink-700 border-pink-200" });

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
        <h4 className="text-sm font-semibold text-ink-800">Deep Tech Audit</h4>
        <span className="text-[10px] uppercase tracking-wider text-brand-600 font-medium">Auto-Discovered</span>
      </div>

      {/* Grade cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <GradeBadge grade={audit.overallGrade} label="Overall" />
        <GradeBadge grade={audit.security.grade} label="Security" />
        <GradeBadge grade={audit.performance.grade} label="Performance" />
      </div>

      {/* Tech stack badges */}
      {badges.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Tech Stack</p>
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", b.color)}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Product signals */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Product Signals</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <SignalRow label="Login system" active={pm.hasLoginForm} />
          <SignalRow label="Dashboard" active={pm.hasDashboard} />
          <SignalRow label="PWA ready" active={pm.hasPWA} />
          <SignalRow label="Testimonials" active={pm.hasTestimonials} />
          <SignalRow label="Customer logos" active={pm.hasCustomerLogos} />
          <SignalRow label="Multi-language" active={pm.hasMultiLang} />
        </div>
      </div>

      {/* SEO signals */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">SEO & Discovery</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <SignalRow label="Sitemap" active={pm.hasSitemap} />
          <SignalRow label="robots.txt" active={pm.hasRobotsTxt} />
          <SignalRow label="Structured data" active={pm.hasStructuredData} />
          <SignalRow label="Open Graph" active={pm.hasOpenGraph} />
          <SignalRow label="Twitter Cards" active={pm.hasTwitterCards} />
          <SignalRow label="Mobile viewport" active={pm.hasViewportMeta} />
        </div>
      </div>

      {/* Performance metrics */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Performance</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-center">
            <p className="text-[10px] text-ink-400 uppercase">TTFB</p>
            <p className={cn(
              "text-sm font-bold font-mono",
              audit.performance.ttfbMs < 500 ? "text-emerald-600" :
              audit.performance.ttfbMs < 1000 ? "text-amber-600" : "text-red-600",
            )}>
              {audit.performance.ttfbMs >= 0 ? `${audit.performance.ttfbMs}ms` : "N/A"}
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-center">
            <p className="text-[10px] text-ink-400 uppercase">Page Size</p>
            <p className="text-sm font-bold font-mono text-ink-800">
              {Math.round(audit.performance.pageSizeBytes / 1024)}KB
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-center">
            <p className="text-[10px] text-ink-400 uppercase">Compression</p>
            <p className="text-sm font-bold font-mono text-ink-800">
              {audit.performance.compressionType ?? "None"}
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-center">
            <p className="text-[10px] text-ink-400 uppercase">SSL</p>
            <p className={cn(
              "text-sm font-bold font-mono",
              audit.security.ssl.valid ? "text-emerald-600" : "text-red-600",
            )}>
              {audit.security.ssl.valid ? "Valid" : "Invalid"}
            </p>
          </div>
        </div>
      </div>

      {/* Security headers */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">
          Security Headers ({audit.security.headerCount}/6)
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <SignalRow label="CSP" active={audit.security.headers.csp} />
          <SignalRow label="HSTS" active={audit.security.headers.hsts} />
          <SignalRow label="X-Frame-Options" active={audit.security.headers.xFrameOptions} />
          <SignalRow label="X-Content-Type" active={audit.security.headers.xContentType} />
          <SignalRow label="Referrer-Policy" active={audit.security.headers.referrerPolicy} />
          <SignalRow label="Permissions-Policy" active={audit.security.headers.permissionsPolicy} />
        </div>
      </div>

      {/* Social links */}
      {pm.socialLinks.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Social Presence</p>
          <div className="flex flex-wrap gap-1.5">
            {pm.socialLinks.map((s) => (
              <span key={s} className="inline-flex items-center rounded-full border border-surface-200 bg-white px-2.5 py-0.5 text-xs font-medium text-ink-600">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SVI signal boosts */}
      <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">SVI Score Impact</p>
        <div className="flex flex-wrap gap-3 text-xs font-mono">
          {(["ptdBoost", "svmBoost", "treBoost", "lcoBoost"] as const).map((key) => {
            const val = audit.signalBoosts[key];
            const label = key.replace("Boost", "").toUpperCase();
            return (
              <span
                key={key}
                className={cn(
                  "font-semibold",
                  val > 0 ? "text-emerald-600" : val < 0 ? "text-red-600" : "text-ink-400",
                )}
              >
                {label}: {val > 0 ? "+" : ""}{val}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export function RndResultsPanel({
  report,
  analysis,
  slug,
  email,
  isPaid,
  onReset,
  onUnlock,
  onUpgradeDeepDive,
  previousAnalysis,
  techAudit,
}: {
  report: RndReport;
  analysis: SVIAnalysis;
  slug: string;
  email?: string;
  isPaid: boolean;
  onReset: () => void;
  onUnlock: () => void;
  onUpgradeDeepDive?: () => void;
  previousAnalysis?: SVIAnalysis | null;
  techAudit?: ClientTechAuditResult | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const tierValue: ReportTier = report.tier ?? "standard";
  const pageCount = report.pages.length || PAGE_DEFS.length;
  const pageIds = PAGE_DEFS.slice(0, pageCount).map((p) => p.id);
  const activeId = useActiveSection(pageIds);

  React.useEffect(() => {
    trackEvent("rnd_analysis_complete", { svi_score: report.overallScore, slug });
  }, [report.overallScore, slug]);

  // Delta from previous analysis
  const sviDelta = previousAnalysis ? analysis.totalSVI - previousAnalysis.totalSVI : null;
  // R&D report uses report.overallScore (0-100), compute delta for that too
  const scoreDelta = previousAnalysis
    ? report.overallScore - (previousAnalysis.totalSVI ?? report.overallScore)
    : null;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/svi/${slug}`
      : `/svi/${slug}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    trackEvent("rnd_link_copied", { slug });
  };

  const navigateToPage = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const navigateToPageNum = (num: number) => {
    const page = PAGE_DEFS[num - 1];
    if (page) navigateToPage(page.id);
  };

  /** Render a single page's content block */
  const renderPageContent = (page: RndReportPage, pageDef: (typeof PAGE_DEFS)[number]) => {
    const Icon = PAGE_ICONS[pageDef.num] ?? FileText;

    return (
      <section
        id={pageDef.id}
        key={pageDef.id}
        className="scroll-mt-24 rounded-2xl border border-surface-200 bg-white px-6 py-8 shadow-sm md:px-8"
      >
        <PageHeader num={pageDef.num} title={page.title || pageDef.title} icon={Icon} tooltip={PAGE_TOOLTIPS[pageDef.id]} />

        {page.subtitle && (
          <p className="text-sm text-ink-500 -mt-4 mb-6">{page.subtitle}</p>
        )}

        {/* Page 1 special: large score gauge */}
        {pageDef.num === 1 && (
          <>
            <LargeScoreGauge
              value={report.overallScore}
              stage={analysis.stageLabel ?? SVI_STAGE_LABELS[analysis.stage] ?? "Concept"}
              confidence={analysis.confidenceMultiplier}
              riskFlags={analysis.riskPenalties.length}
              delta={scoreDelta}
            />
            {/* Tier badge + upgrade prompt */}
            <div className="flex items-center justify-center gap-3 mt-4 mb-4">
              <span className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                tierValue === "deep_dive" ? "bg-amber-100 text-amber-700" :
                tierValue === "standard" ? "bg-brand-100 text-brand-700" :
                "bg-surface-100 text-ink-500"
              )}>
                {tierValue === "deep_dive" ? "Deep Dive Report" :
                 tierValue === "standard" ? "Standard Report" : "Preview Report"}
              </span>
              {tierValue !== "deep_dive" && onUpgradeDeepDive && (
                <button
                  type="button"
                  onClick={onUpgradeDeepDive}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium underline cursor-pointer transition-colors"
                >
                  Upgrade to Deep Dive (1.50 credits)
                </button>
              )}
            </div>
          </>
        )}

        {/* Score bar if page has a score (not page 1) */}
        {pageDef.num !== 1 && page.score !== undefined && page.score !== null && (
          <div className="mb-6">
            <ScoreBar label={`${page.title} Score`} value={page.score} />
          </div>
        )}

        {/* Data points (e.g. TAM/SAM/SOM on page 2) */}
        {page.dataPoints && Object.keys(page.dataPoints).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {Object.entries(page.dataPoints).map(([label, value]) => (
              <MetricCard key={label} label={label} value={value} />
            ))}
          </div>
        )}

        {/* Tech hints badges (page 3 — product): derived from input type */}
        {pageDef.num === 3 && report.inputType === "url" && report.inputUrl && (
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <Zap strokeWidth={1.75} className="h-3 w-3" />
              URL Analyzed
            </span>
            {analysis.signals.hasWebsite && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 strokeWidth={1.75} className="h-3 w-3" />
                Website Live
              </span>
            )}
            {analysis.signals.hasSourceCode && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 strokeWidth={1.75} className="h-3 w-3" />
                Source Code
              </span>
            )}
          </div>
        )}

        {/* Deep Tech Audit card (page 3 — product): full audit results */}
        {pageDef.num === 3 && techAudit && (
          <TechAuditCard audit={techAudit} />
        )}

        {/* Markdown content */}
        {page.content && (
          <div className="prose-sm max-w-none">{renderMarkdown(page.content)}</div>
        )}

        {/* Highlights */}
        {page.highlights && page.highlights.length > 0 && (
          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium mb-2">
              Key Highlights
            </p>
            <ul className="space-y-1.5">
              {page.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-ink-600">
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* V2 Locked Section Preview — narrative report upsell */}
        {page.lockedPreview && page.lockedSections && page.lockedSections.length > 0 && !isPaid && (
          <RndLockedSection
            lockedPreview={page.lockedPreview}
            lockedSections={page.lockedSections}
            pageTitle={page.title}
            potentialSVI={report.potentialSVI}
            currentSVI={report.overallScore}
            onUnlock={onUnlock}
          />
        )}

        {/* Deep Dive extended sections */}
        {page.extendedSections?.map((section, i) => (
          <div key={i} className="mt-6 rounded-xl border border-amber-200/50 bg-amber-50/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h4 className="text-sm font-semibold text-ink-800">{section.title}</h4>
              <span className="text-[10px] uppercase tracking-wider text-amber-600 font-medium">Deep Dive</span>
            </div>
            <div className="text-sm text-ink-600 leading-relaxed prose-sm">
              {renderMarkdown(section.content)}
            </div>
            {section.dataPoints && Object.keys(section.dataPoints).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Object.entries(section.dataPoints).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-white px-3 py-2 border border-amber-100">
                    <span className="text-[10px] text-ink-400 uppercase">{k}</span>
                    <span className="block text-sm font-semibold text-ink-800">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <PageNavigation
          currentPage={pageDef.num}
          totalPages={pageCount}
          onNavigate={navigateToPageNum}
        />
      </section>
    );
  };

  /** Wrap page content with paywall if needed */
  const renderPage = (pageIndex: number) => {
    const pageDef = PAGE_DEFS[pageIndex];
    if (!pageDef) return null;

    const page: RndReportPage = report.pages[pageIndex] ?? {
      pageId: pageDef.id,
      pageNum: pageDef.num,
      title: pageDef.title,
      subtitle: pageDef.subtitle,
      content: "",
    };

    const content = renderPageContent(page, pageDef);

    // Pages 1-3 are always visible; pages 4-10 locked if not paid
    if (pageIndex >= 3 && !isPaid) {
      return (
        <RndPageLock key={pageDef.id} onUnlock={onUnlock}>
          {content}
        </RndPageLock>
      );
    }

    return content;
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Mobile progress bar */}
      <MobileProgressDots activeId={activeId} pageCount={pageCount} />

      <div className="flex gap-8 px-4 md:px-0">
        {/* Desktop sidebar TOC */}
        <DesktopTOC
          activeId={activeId}
          onNavigate={navigateToPage}
          pageCount={pageCount}
        />

        {/* Report pages */}
        <div className="flex-1 max-w-2xl mx-auto space-y-6 py-6">
          {Array.from({ length: pageCount }, (_, i) => renderPage(i))}

          {/* Bottom actions — always visible */}
          <div className="rounded-2xl border border-surface-200 bg-white px-6 py-8 shadow-sm md:px-8">
            {/* Upsell CTA */}
            <div className="rounded-2xl border border-brand-200 bg-brand-50 px-6 py-5 mb-6">
              <div className="flex items-start gap-3">
                <TrendingUp
                  strokeWidth={1.75}
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-ink-800">
                      Track your progress over time
                    </p>
                    <span className="rounded-full bg-brand-100 border border-brand-200 px-2 py-0.5 text-[10px] font-medium text-brand-600 uppercase tracking-wider">
                      50 spots only
                    </span>
                  </div>
                  <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                    Claim a Founding 50 account to build your SVI over time — cap table,
                    Evidence Vault, export packs, and a 30-day growth plan.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <Link href="/founding-50" className="block">
                <Button variant="primary" size="md" className="w-full gap-2">
                  <Rocket strokeWidth={1.75} className="h-4 w-4" />
                  Get Founding 50
                </Button>
              </Link>
              <Link href="/dashboard/svi" className="block">
                <Button variant="secondary" size="md" className="w-full gap-2">
                  <BarChart3 strokeWidth={1.75} className="h-4 w-4" />
                  View on Dashboard
                </Button>
              </Link>
              <Button
                variant="outline"
                size="md"
                className="w-full gap-2"
                onClick={handleCopy}
              >
                <Mail strokeWidth={1.75} className="h-4 w-4" />
                {copied ? "Link Copied!" : "Share via Email"}
              </Button>
            </div>

            {/* Share URL */}
            <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm mb-6">
              <span className="text-xs text-ink-600 truncate font-mono">{shareUrl}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="ml-3 shrink-0 flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 cursor-pointer transition-colors"
              >
                <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            {/* Analyze another */}
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={onReset} className="text-ink-600">
                Analyze another idea
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
