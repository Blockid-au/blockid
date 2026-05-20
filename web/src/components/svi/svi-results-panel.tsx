"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  LayoutDashboard,
  Lightbulb,
  Lock,
  Mail,
  PieChart,
  Rocket,
  Shield,
  Target,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { ResearchPanel } from "@/components/svi/research-panel";
import type { SVIAction } from "@/lib/svi-actions";
import {
  getActionsForDimension,
  getActionForGap,
  getActionForNextAction,
} from "@/lib/svi-actions";
import { InfoTooltip } from "@/components/ui/info-tooltip";

/* ─── Constants ───────────────────────────────────────────────────────────── */

const DIMENSION_ACTIONS: Record<string, { label: string; action: string; link?: string; uploadType?: string }> = {
  ftv: { label: "Add team profiles", action: "Upload LinkedIn profiles, CVs, or advisor agreements", link: "/workspace/evidence" },
  mpc: { label: "Add market research", action: "Upload TAM/SAM analysis, customer interviews, or survey data", link: "/workspace/evidence" },
  ptd: { label: "Connect GitHub", action: "Link your repository or upload product demo/screenshots", link: "/workspace/evidence" },
  tre: { label: "Add revenue proof", action: "Connect Stripe, upload invoices, or add analytics screenshots", link: "/workspace/evidence" },
  cgh: { label: "Upload cap table", action: "Upload shareholder agreement, vesting schedule, or equity split", link: "/workspace/evidence" },
  iri: { label: "Upload pitch deck", action: "Add your investor deck, financial model, or data room docs", link: "/workspace/evidence" },
  lco: { label: "Add legal docs", action: "Upload ABN/ASIC registration, IP assignment, or contracts", link: "/workspace/evidence" },
  svm: { label: "Define your moat", action: "Document competitive advantages, network effects, or data moat", link: "/workspace/evidence" },
};

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  self_declared: "Self-declared (20%)",
  public_url: "Public URL (35%)",
  document_uploaded: "Document uploaded (50%)",
  connected_source: "Connected source (75%)",
  transaction_data: "Transaction data (90%)",
  third_party_verified: "Third-party verified (100%)",
};

const DIMENSION_WEIGHTS: Record<string, string> = {
  ftv: "15%",
  mpc: "18%",
  ptd: "12%",
  tre: "20%",
  cgh: "12%",
  iri: "10%",
  lco: "8%",
  svm: "5%",
};

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

const PAGES = [
  { id: "executive-summary", num: 1, title: "Executive Summary", icon: FileText },
  { id: "value-breakdown", num: 2, title: "Startup Value Breakdown", icon: BarChart3 },
  { id: "market-validation", num: 3, title: "Market & Problem Validation", icon: Globe },
  { id: "product-assessment", num: 4, title: "Product & Technical Assessment", icon: Rocket },
  { id: "traction-revenue", num: 5, title: "Traction & Revenue Analysis", icon: TrendingUp },
  { id: "cap-table", num: 6, title: "Cap Table & Governance", icon: PieChart },
  { id: "investor-readiness", num: 7, title: "Investor Readiness", icon: Target },
  { id: "risk-assessment", num: 8, title: "Risk Assessment", icon: Shield },
  { id: "evidence-gaps", num: 9, title: "Evidence Gaps & Action Plan", icon: ClipboardList },
  { id: "next-steps", num: 10, title: "Next Steps & Recommendations", icon: Lightbulb },
] as const;

/* ─── Hook: Intersection Observer for scroll tracking ─────────────────── */

function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = React.useState(ids[0] ?? "");

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with highest intersection ratio that is intersecting
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

/* ─── Sub-components ──────────────────────────────────────────────────── */

function PageHeader({ num, title, icon: Icon }: { num: number; title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-200">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 border border-brand-200 text-sm font-bold text-brand-600 font-mono">
        {num}
      </span>
      <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-600 shrink-0" />
      <h2 className="text-lg font-semibold text-ink-800 tracking-tight">{title}</h2>
    </div>
  );
}

function PageSection({
  id,
  num,
  title,
  icon,
  children,
}: {
  id: string;
  num: number;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-surface-200 bg-white px-6 py-8 shadow-sm md:px-8"
    >
      <PageHeader num={num} title={title} icon={icon} />
      {children}
    </section>
  );
}

function PageNavigation({
  currentPage,
  onNavigate,
}: {
  currentPage: number;
  onNavigate: (page: number) => void;
}) {
  const prevPage = currentPage > 1 ? PAGES[currentPage - 2] : null;
  const nextPage = currentPage < 10 ? PAGES[currentPage] : null;

  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-surface-200">
      {prevPage ? (
        <button
          type="button"
          onClick={() => onNavigate(prevPage.num)}
          className="flex items-center gap-2 text-sm text-ink-600 hover:text-brand-600 transition-colors cursor-pointer"
        >
          <ChevronLeft strokeWidth={1.75} className="h-4 w-4" />
          <span className="hidden sm:inline">{prevPage.title}</span>
          <span className="sm:hidden">Previous</span>
        </button>
      ) : (
        <div />
      )}
      <span className="text-xs text-ink-600 font-mono">
        {currentPage} / 10
      </span>
      {nextPage ? (
        <button
          type="button"
          onClick={() => onNavigate(nextPage.num)}
          className="flex items-center gap-2 text-sm text-ink-600 hover:text-brand-600 transition-colors cursor-pointer"
        >
          <span className="hidden sm:inline">{nextPage.title}</span>
          <span className="sm:hidden">Next</span>
          <ChevronRight strokeWidth={1.75} className="h-4 w-4" />
        </button>
      ) : (
        <div />
      )}
    </div>
  );
}

function SVIGauge({
  value,
  stage,
  stageLabel,
  delta,
}: {
  value: number;
  stage?: number;
  stageLabel?: string;
  delta?: number | null;
}) {
  const label =
    value >= 300
      ? "Exceptional"
      : value >= 200
        ? "Elite"
        : value >= 170
          ? "Outstanding"
          : value >= 140
            ? "Strong"
            : value >= 120
              ? "Above Average"
              : value >= 100
                ? "Average"
                : value >= 80
                  ? "Below Average"
                  : value >= 60
                    ? "Early Stage"
                    : "Critical";

  const color =
    value >= 200
      ? "text-emerald-600"
      : value >= 140
        ? "text-emerald-600"
        : value >= 120
          ? "text-brand-600"
          : value >= 100
            ? "text-amber-600"
            : "text-red-600";

  const resolvedStageLabel = stageLabel ?? (stage !== undefined ? SVI_STAGE_LABELS[stage] : undefined);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-baseline gap-3 justify-center">
        <div className="relative flex items-end justify-center gap-1">
          <span className={cn("font-mono text-7xl sm:text-8xl font-bold tabular-nums tracking-tight leading-none", color)}>
            {value}
          </span>
          <span className="mb-2 text-sm text-ink-600 font-mono flex items-center gap-1">
            SVI
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
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-700 font-medium">Base</span>
        <span className="text-xs text-ink-700 font-mono">100</span>
        <span className="text-ink-600">&rarr;</span>
        <span className={cn("text-sm font-semibold", color)}>{label}</span>
      </div>
      {resolvedStageLabel && (
        <span className="mt-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-brand-600">
          Stage {stage ?? "?"} &mdash; {resolvedStageLabel}
        </span>
      )}
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
      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium mb-1">{label}</p>
      <p className={cn("text-xl font-bold font-mono", color)}>{value}</p>
      {subtext && <p className="text-xs text-ink-600 mt-0.5">{subtext}</p>}
    </div>
  );
}

function ActionButton({ action, onUpload, email, dimension }: { action: SVIAction; onUpload?: () => void; email?: string; dimension?: string }) {
  if (action.type === "upload") {
    return (
      <button
        type="button"
        onClick={() => {
          if (email) void trackAction(email, { label: action.label, type: action.type, dimension, href: action.href });
          onUpload?.();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
      >
        <Upload className="h-3 w-3" />
        {action.label}
      </button>
    );
  }

  const isExternal = action.type === "external" || action.type === "guide";
  return (
    <a
      href={action.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      onClick={() => {
        if (email) void trackAction(email, { label: action.label, type: action.type, dimension, href: action.href });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        isExternal
          ? "border-surface-300 bg-surface-50 text-ink-700 hover:bg-surface-100"
          : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100",
      )}
    >
      {isExternal ? <ExternalLink className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
      {action.label}
    </a>
  );
}

function DimensionBar({
  label,
  keyName,
  value,
  adjustment,
  evidence,
  gaps,
  onUpload,
  email,
  previousValue,
}: {
  label: string;
  keyName: string;
  value: number;
  adjustment: number;
  evidence: string[];
  gaps: string[];
  onUpload?: () => void;
  email?: string;
  previousValue?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(value);
  const adjColor = adjustment >= 0 ? "text-emerald-600" : "text-red-600";
  const weight = DIMENSION_WEIGHTS[keyName] ?? "";
  const dimDelta = previousValue !== undefined ? Math.round(value) - Math.round(previousValue) : undefined;

  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600 font-mono uppercase shrink-0">
              {keyName}
            </span>
            <span className="text-sm font-medium text-ink-800 truncate">{label}</span>
            {DIMENSION_TOOLTIPS[keyName] && (
              <InfoTooltip text={DIMENSION_TOOLTIPS[keyName]} />
            )}
            {weight && (
              <span className="text-[10px] text-ink-600 font-mono shrink-0">({weight})</span>
            )}
            {dimDelta !== undefined && dimDelta !== 0 && (
              <span className={cn(
                "text-xs font-medium shrink-0",
                dimDelta > 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {dimDelta > 0 ? `+${dimDelta}` : `${dimDelta}`}
              </span>
            )}
            {dimDelta !== undefined && dimDelta === 0 && (
              <span className="text-xs font-medium text-ink-500 shrink-0">unchanged</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-xs font-mono font-semibold", adjColor)}>
              {adjustment >= 0 ? "+" : ""}
              {adjustment}
            </span>
            <span className="text-xs text-ink-600 font-mono">{pct}/100</span>
            <Link
              href={DIMENSION_ACTIONS[keyName]?.link ?? "/workspace/evidence"}
              onClick={(e) => e.stopPropagation()}
              className="ml-1 sm:ml-2 shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand-50 border border-brand-200 px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-medium text-brand-600 hover:bg-brand-100 transition-colors"
            >
              <ArrowUpRight className="h-3 w-3" /> <span className="hidden sm:inline">{DIMENSION_ACTIONS[keyName]?.label ?? "Improve"}</span><span className="sm:hidden">Fix</span>
            </Link>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 text-ink-600" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ink-600" strokeWidth={1.75} />
            )}
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-200 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-surface-200 space-y-2">
          {evidence.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-teal-600 font-medium mb-1.5">
                Evidence
              </p>
              <ul className="space-y-1">
                {evidence.map((e) => (
                  <li key={e} className="flex items-start gap-2 text-xs text-ink-600">
                    <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-1.5">
                Gaps
              </p>
              <ul className="space-y-1">
                {gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-xs text-ink-600">
                    <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Quick-fix action buttons for this dimension */}
          {gaps.length > 0 && (() => {
            const actions = getActionsForDimension(keyName);
            return actions.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {actions.map((a) => (
                  <ActionButton key={a.label} action={a} onUpload={onUpload} email={email} dimension={keyName} />
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

function SignalIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2">
      {active ? (
        <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-600 shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-surface-300 shrink-0" />
      )}
      <span className={cn("text-sm", active ? "text-ink-800" : "text-ink-600")}>{label}</span>
    </div>
  );
}

function RiskCard({ label, points, reason }: { label: string; points: number; reason: string }) {
  const severity =
    points >= 12 ? "critical" : points >= 8 ? "high" : points >= 5 ? "medium" : "low";
  const severityColors: Record<string, string> = {
    critical: "border-red-300 bg-red-50",
    high: "border-red-200 bg-red-50",
    medium: "border-amber-200 bg-amber-50",
    low: "border-surface-200 bg-surface-50",
  };
  const severityBadge: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-red-50 text-red-600",
    medium: "bg-amber-50 text-amber-600",
    low: "bg-surface-100 text-ink-600",
  };

  return (
    <div className={cn("rounded-xl border px-4 py-3", severityColors[severity])}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2">
          <AlertTriangle strokeWidth={1.75} className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm font-semibold text-ink-800">{label}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", severityBadge[severity])}>
            {severity}
          </span>
          <span className="font-mono text-sm font-bold text-red-600">-{points}</span>
        </div>
      </div>
      <p className="text-xs text-ink-600 leading-relaxed ml-6">{reason}</p>
    </div>
  );
}

function StageJourney({ currentStage }: { currentStage: number }) {
  return (
    <div className="space-y-1">
      {SVI_STAGE_LABELS.map((label, idx) => {
        const isCurrent = idx === currentStage;
        const isPast = idx < currentStage;
        const isFuture = idx > currentStage;
        return (
          <div key={label} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0",
                isCurrent
                  ? "bg-brand-600 text-white"
                  : isPast
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : "bg-surface-100 text-ink-600 border border-surface-300",
              )}
            >
              {isPast ? (
                <CheckCircle2 strokeWidth={2} className="h-4 w-4" />
              ) : (
                idx
              )}
            </div>
            <span
              className={cn(
                "text-sm",
                isCurrent ? "font-semibold text-brand-600" : isPast ? "text-emerald-700" : "text-ink-600",
              )}
            >
              {label}
              {isCurrent && (
                <span className="ml-2 text-[10px] uppercase tracking-[0.15em] bg-brand-50 border border-brand-200 text-brand-600 px-2 py-0.5 rounded-full font-medium">
                  Current
                </span>
              )}
            </span>
            {isFuture && idx === currentStage + 1 && (
              <span className="text-[10px] text-ink-600 font-mono ml-auto">Next target</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Signup Nudge Banner (shown to unauthenticated users) ───────────── */

function SignupNudgeBanner() {
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { if (!cancelled) setIsLoggedIn(false); return; }
        const data = await res.json();
        if (!cancelled) setIsLoggedIn(data.ok && !!data.user);
      } catch {
        if (!cancelled) setIsLoggedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Don't render while checking, or if user is logged in
  if (isLoggedIn === null || isLoggedIn) return null;

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 sm:px-6 py-5">
      <div className="flex items-start gap-3">
        <Lock strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-800">
            Save your SVI score and track your progress over time
          </p>
          <p className="text-xs text-ink-600 mt-1 leading-relaxed">
            Create your free account to unlock your dashboard, evidence vault, and growth roadmap.
            Your score will be saved permanently.
          </p>
          <a
            href="/auth/login?next=/dashboard/svi"
            onClick={() => {
              trackEvent("cta_clicked", { cta_id: "signup_nudge_banner", location: "svi_results_top" });
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Create Free Account
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Evidence Upload Prompt (shown to unauthenticated users on page 9) ─ */

function EvidenceUploadPrompt() {
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { if (!cancelled) setIsLoggedIn(false); return; }
        const data = await res.json();
        if (!cancelled) setIsLoggedIn(data.ok && !!data.user);
      } catch {
        if (!cancelled) setIsLoggedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isLoggedIn === null || isLoggedIn) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 sm:px-6 py-5 mt-6">
      <div className="flex items-start gap-3">
        <Upload strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-800">
            Boost your SVI by up to +20 points
          </p>
          <p className="text-xs text-ink-600 mt-1 leading-relaxed">
            Upload your pitch deck or financial model to start building your Evidence Vault.
            Verified evidence directly increases your score and investor readiness.
          </p>
          <a
            href="/auth/login?next=/workspace/evidence"
            onClick={() => {
              trackEvent("cta_clicked", { cta_id: "evidence_upload_prompt", location: "svi_results_evidence_gaps" });
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Upload Evidence
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Sidebar Table of Contents ───────────────────────────────────────── */

function DesktopTOC({
  activeId,
  onNavigate,
}: {
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="hidden lg:block sticky top-24 w-56 shrink-0">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-600 font-medium mb-3 px-3">
        Report Contents
      </p>
      <ul className="space-y-0.5">
        {PAGES.map((page) => {
          const isActive = activeId === page.id;
          const Icon = page.icon;
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

function MobileProgressDots({ activeId }: { activeId: string }) {
  const activeIdx = PAGES.findIndex((p) => p.id === activeId);
  return (
    <div className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-surface-200 px-4 py-3">
      <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-1.5">
          {PAGES.map((page, idx) => (
            <button
              key={page.id}
              type="button"
              onClick={() => {
                document.getElementById(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          {activeIdx + 1}/10
        </span>
      </div>
      <p className="text-xs font-medium text-ink-800 mt-1 text-center lg:hidden">
        {PAGES[activeIdx]?.title}
      </p>
    </div>
  );
}

/* ─── Helper: find sub-score by key ───────────────────────────────────── */

function findSub(analysis: SVIAnalysis, key: string) {
  return analysis.subs.find((s) => s.key === key);
}

/* ─── Action tracking (fire-and-forget) ─────────────────────────────── */

async function trackAction(email: string, action: { label: string; type: string; dimension?: string; href?: string }) {
  try {
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        actionType: action.type === "upload" ? "evidence_uploaded" : action.type === "tool" ? "tool_used" : "guide_visited",
        actionLabel: action.label,
        dimension: action.dimension,
        toolSlug: action.href?.replace(/^\/tools\//, "") ?? null,
      }),
    });
  } catch { /* fire and forget */ }
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export function SVIResultsPanel({
  analysis,
  slug,
  onReset,
  rawText,
  email,
  previousAnalysis,
}: {
  analysis: SVIAnalysis;
  slug: string;
  onReset: () => void;
  rawText?: string;
  email?: string;
  previousAnalysis?: SVIAnalysis | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const pageIds = PAGES.map((p) => p.id);
  const activeId = useActiveSection(pageIds);

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/svi/${slug}` : `/svi/${slug}`;

  const handleUploadAction = React.useCallback(() => {
    // Track the action before navigating (fire-and-forget)
    if (email) {
      void trackAction(email, { label: "Upload evidence", type: "upload", href: "/workspace/evidence" });
    }
    // Navigate to evidence upload — workspace/evidence if logged in, otherwise prompt login
    if (typeof window !== "undefined") {
      window.location.href = "/workspace/evidence";
    }
  }, [email]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    trackEvent("investor_link_copied", { slug });
  };

  const navigateToPage = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const navigateToPageNum = (num: number) => {
    const page = PAGES[num - 1];
    if (page) navigateToPage(page.id);
  };

  const activePageNum = (PAGES.findIndex((p) => p.id === activeId) ?? 0) + 1;

  // Pre-extract commonly used dimension sub-scores
  const mpc = findSub(analysis, "mpc");
  const ptd = findSub(analysis, "ptd");
  const tre = findSub(analysis, "tre");
  const cgh = findSub(analysis, "cgh");
  const iri = findSub(analysis, "iri");
  const signals = analysis.signals;

  // Delta from previous analysis
  const sviDelta = previousAnalysis ? analysis.totalSVI - previousAnalysis.totalSVI : null;

  // Build a map of previous dimension scores for diff highlights
  const previousSubScores: Record<string, number> = {};
  if (previousAnalysis?.subs) {
    for (const sub of previousAnalysis.subs) {
      previousSubScores[sub.key] = sub.value;
    }
  }

  // Build "analysis changes" summary for the Executive Summary page
  const analysisChanges: { label: string; key: string; delta: number; reason?: string }[] = [];
  if (previousAnalysis?.subs) {
    for (const sub of analysis.subs) {
      const prevSub = previousAnalysis.subs.find((s) => s.key === sub.key);
      if (prevSub) {
        const d = Math.round(sub.value) - Math.round(prevSub.value);
        if (d !== 0) {
          // Try to derive a reason from evidence differences
          const newEvidence = sub.evidence.filter((e) => !prevSub.evidence.includes(e));
          const reason = newEvidence.length > 0 ? newEvidence[0] : undefined;
          analysisChanges.push({ label: sub.label, key: sub.key, delta: d, reason });
        }
      }
    }
  }

  // Sorted evidence gaps
  const sortedGaps = [...analysis.evidenceGaps].sort((a, b) => {
    const order: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
  });

  const p0Gaps = sortedGaps.filter((g) => g.priority === "P0");
  const p1Gaps = sortedGaps.filter((g) => g.priority === "P1");
  const p2Gaps = sortedGaps.filter((g) => g.priority === "P2");

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Signup nudge banner — only shown to unauthenticated users */}
      <div className="mx-4 md:mx-0 mb-4">
        <SignupNudgeBanner />
      </div>

      {/* Mobile progress bar */}
      <MobileProgressDots activeId={activeId} />

      <div className="flex gap-8 px-4 md:px-0">
        {/* Desktop sidebar TOC */}
        <DesktopTOC activeId={activeId} onNavigate={navigateToPage} />

        {/* Report pages */}
        <div className="flex-1 max-w-2xl mx-auto space-y-6 py-6">
          {/* ─── Page 1: Executive Summary ──────────────────────────────── */}
          <PageSection id="executive-summary" num={1} title="Executive Summary" icon={FileText}>
            <div className="text-center mb-8">
              <SVIGauge value={analysis.totalSVI} stage={analysis.stage} stageLabel={analysis.stageLabel} delta={sviDelta} />
            </div>

            <p className="text-sm text-ink-600 leading-relaxed text-center max-w-lg mx-auto mb-8">
              {analysis.summary}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="SVI Score"
                value={analysis.totalSVI}
                color={
                  analysis.totalSVI >= 140
                    ? "text-emerald-600"
                    : analysis.totalSVI >= 100
                      ? "text-brand-600"
                      : "text-red-600"
                }
              />
              <MetricCard
                label="Confidence"
                value={`${Math.round(analysis.confidenceMultiplier * 100)}%`}
                subtext={EVIDENCE_LEVEL_LABELS[signals.evidenceLevel]?.split(" (")[0]}
              />
              <MetricCard
                label="Percentile"
                value={analysis.percentileRank ? `P${analysis.percentileRank}` : "P50"}
                subtext={`For ${analysis.stageLabel} stage`}
              />
              <MetricCard
                label="Risk Flags"
                value={analysis.riskPenalties.length}
                color={analysis.riskPenalties.length > 3 ? "text-red-600" : analysis.riskPenalties.length > 0 ? "text-amber-600" : "text-emerald-600"}
              />
            </div>

            {analysis.weeklyDelta !== undefined && analysis.weeklyDelta !== 0 && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <TrendingUp strokeWidth={1.75} className={cn("h-4 w-4", analysis.weeklyDelta > 0 ? "text-emerald-600" : "text-red-600")} />
                <span className={cn("font-mono font-semibold", analysis.weeklyDelta > 0 ? "text-emerald-600" : "text-red-600")}>
                  {analysis.weeklyDelta > 0 ? "+" : ""}{analysis.weeklyDelta}
                </span>
                <span className="text-ink-600">from last week</span>
              </div>
            )}

            {/* Analysis Changes section — only shown when there is a previous analysis */}
            {analysisChanges.length > 0 && (
              <div className="mt-6 rounded-xl border border-surface-200 bg-surface-50 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-700 font-medium mb-3">
                  What changed since your last analysis
                </p>
                <div className="space-y-1.5">
                  {analysisChanges.map((change) => (
                    <div key={change.key} className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        "font-mono font-semibold text-xs w-8 text-right shrink-0",
                        change.delta > 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {change.delta > 0 ? "\u25B2" : "\u25BC"}
                      </span>
                      <span className="text-ink-800 font-medium">{change.label}:</span>
                      <span className={cn(
                        "font-mono text-xs font-semibold",
                        change.delta > 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {change.delta > 0 ? `+${change.delta}` : `${change.delta}`}
                      </span>
                      {change.reason && (
                        <span className="text-xs text-ink-500 truncate">({change.reason})</span>
                      )}
                    </div>
                  ))}
                  {/* Show unchanged dimensions */}
                  {previousAnalysis?.subs && analysis.subs
                    .filter((sub) => {
                      const prev = previousAnalysis.subs.find((s) => s.key === sub.key);
                      return prev && Math.round(sub.value) === Math.round(prev.value);
                    })
                    .map((sub) => (
                      <div key={sub.key} className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-xs w-8 text-right shrink-0 text-ink-500">=</span>
                        <span className="text-ink-600">{sub.label}:</span>
                        <span className="text-xs text-ink-500">unchanged</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            <PageNavigation currentPage={1} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 2: Startup Value Breakdown ────────────────────────── */}
          <PageSection id="value-breakdown" num={2} title="Startup Value Breakdown" icon={BarChart3}>
            <p className="text-sm text-ink-600 mb-4 leading-relaxed">
              Your SVI is composed of 8 weighted dimensions. Each dimension scores 0-100 and contributes a
              weighted adjustment to your base score of 100.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <MetricCard label="Base Score" value={100} />
              <MetricCard
                label="Net Adjustment"
                value={`${analysis.netAdjustment >= 0 ? "+" : ""}${analysis.netAdjustment}`}
                color={analysis.netAdjustment >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <MetricCard
                label="Stage Bonus"
                value={`+${analysis.stageBonus}`}
                color="text-brand-600"
              />
            </div>

            <div className="space-y-2">
              {analysis.subs.map((sub) => (
                <DimensionBar
                  key={sub.key}
                  label={sub.label}
                  keyName={sub.key}
                  value={sub.value}
                  adjustment={sub.adjustment}
                  evidence={sub.evidence}
                  gaps={sub.gaps}
                  onUpload={handleUploadAction}
                  email={email}
                  previousValue={previousSubScores[sub.key]}
                />
              ))}
            </div>

            <PageNavigation currentPage={2} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 3: Market & Problem Validation ────────────────────── */}
          <PageSection id="market-validation" num={3} title="Market & Problem Validation" icon={Globe}>
            {mpc && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-ink-800">MPC Dimension Score</p>
                  <span className="font-mono text-2xl font-bold text-brand-600">
                    {Math.round(mpc.value)}/100
                  </span>
                </div>
                <p className="text-sm text-ink-600 mb-6 leading-relaxed">{mpc.rationale}</p>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <SignalIndicator label="Customer Interviews" active={signals.hasCustomerInterviews} />
              <SignalIndicator label="Network Effect" active={signals.hasNetworkEffect} />
              <SignalIndicator label="Data Advantage" active={signals.hasDataAdvantage} />
              <SignalIndicator label="Switching Costs" active={signals.hasSwitchingCosts} />
              <SignalIndicator label="Moat Identified" active={signals.hasMoat} />
              <SignalIndicator label="AI Wrapper Risk" active={signals.isAIWrapper} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium mb-1">Market Size</p>
                <p className="text-sm font-semibold text-ink-800 capitalize">
                  {signals.marketSize === "unknown" ? "Not defined" : signals.marketSize}
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium mb-1">Problem Clarity</p>
                <p className="text-sm font-semibold text-ink-800 capitalize">{signals.problemClarity}</p>
              </div>
            </div>

            {mpc && (
              <div className="space-y-3">
                {mpc.evidence.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium mb-2">
                      Validated Evidence
                    </p>
                    <ul className="space-y-1.5">
                      {mpc.evidence.map((e) => (
                        <li key={e} className="flex items-start gap-2 text-sm text-ink-600">
                          <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {mpc.gaps.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-2">
                      Gaps to Address
                    </p>
                    <ul className="space-y-1.5">
                      {mpc.gaps.map((g) => (
                        <li key={g} className="flex items-start gap-2 text-sm text-ink-600">
                          <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <PageNavigation currentPage={3} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 4: Product & Technical Assessment ─────────────────── */}
          <PageSection id="product-assessment" num={4} title="Product & Technical Assessment" icon={Rocket}>
            {ptd && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-ink-800">PTD Dimension Score</p>
                  <span className="font-mono text-2xl font-bold text-brand-600">
                    {Math.round(ptd.value)}/100
                  </span>
                </div>
                <p className="text-sm text-ink-600 mb-6 leading-relaxed">{ptd.rationale}</p>
              </>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <SignalIndicator label="Product Built" active={signals.hasProduct} />
              <SignalIndicator label="Demo / Prototype" active={signals.hasDemo} />
              <SignalIndicator label="Source Code Linked" active={signals.hasSourceCode} />
              <SignalIndicator label="Website Live" active={signals.hasWebsite} />
              <SignalIndicator label="Mobile App" active={signals.hasApp} />
            </div>

            {ptd && (
              <div className="space-y-3">
                {ptd.evidence.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium mb-2">Evidence</p>
                    <ul className="space-y-1.5">
                      {ptd.evidence.map((e) => (
                        <li key={e} className="flex items-start gap-2 text-sm text-ink-600">
                          <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ptd.gaps.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-2">Gaps</p>
                    <ul className="space-y-1.5">
                      {ptd.gaps.map((g) => (
                        <li key={g} className="flex items-start gap-2 text-sm text-ink-600">
                          <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <PageNavigation currentPage={4} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 5: Traction & Revenue Analysis ────────────────────── */}
          <PageSection id="traction-revenue" num={5} title="Traction & Revenue Analysis" icon={TrendingUp}>
            {tre && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-ink-800">TRE Dimension Score</p>
                  <span className="font-mono text-2xl font-bold text-brand-600">
                    {Math.round(tre.value)}/100
                  </span>
                </div>
                <p className="text-sm text-ink-600 mb-6 leading-relaxed">{tre.rationale}</p>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium mb-1">Revenue Band</p>
                <p className="text-sm font-semibold text-ink-800 capitalize">
                  {signals.revenueBand.replace(/-/g, " ")}
                </p>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium mb-1">Has Revenue</p>
                <p className={cn("text-sm font-semibold", signals.hasRevenue ? "text-emerald-600" : "text-red-600")}>
                  {signals.hasRevenue ? "Yes" : "No"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <SignalIndicator label="Paying Customers" active={signals.hasCustomers} />
              <SignalIndicator label="Analytics Connected" active={signals.hasAnalytics} />
              <SignalIndicator label="Social Proof" active={signals.hasSocialProof} />
              <SignalIndicator label="Revenue Proof" active={signals.hasRevenue} />
            </div>

            {tre && (
              <div className="space-y-3">
                {tre.evidence.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium mb-2">Evidence</p>
                    <ul className="space-y-1.5">
                      {tre.evidence.map((e) => (
                        <li key={e} className="flex items-start gap-2 text-sm text-ink-600">
                          <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tre.gaps.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-2">Gaps</p>
                    <ul className="space-y-1.5">
                      {tre.gaps.map((g) => (
                        <li key={g} className="flex items-start gap-2 text-sm text-ink-600">
                          <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <PageNavigation currentPage={5} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 6: Cap Table & Governance ─────────────────────────── */}
          <PageSection id="cap-table" num={6} title="Cap Table & Governance" icon={PieChart}>
            {cgh && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-ink-800">CGH Dimension Score</p>
                  <span className="font-mono text-2xl font-bold text-brand-600">
                    {Math.round(cgh.value)}/100
                  </span>
                </div>
                <p className="text-sm text-ink-600 mb-6 leading-relaxed">{cgh.rationale}</p>
              </>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <SignalIndicator label="Cap Table" active={signals.hasCapTable} />
              <SignalIndicator label="Vesting Schedule" active={signals.hasVesting} />
              <SignalIndicator label="Shareholders Agreement" active={signals.hasShareholdersAgreement} />
              <SignalIndicator label="ESOP Allocated" active={signals.esopAllocated} />
              <SignalIndicator label="Board Cadence" active={signals.hasBoardCadence} />
              <SignalIndicator label="Financial Audit" active={signals.hasFinancialAudit} />
            </div>

            {cgh && (
              <div className="space-y-3">
                {cgh.evidence.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium mb-2">Evidence</p>
                    <ul className="space-y-1.5">
                      {cgh.evidence.map((e) => (
                        <li key={e} className="flex items-start gap-2 text-sm text-ink-600">
                          <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {cgh.gaps.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-2">Gaps</p>
                    <ul className="space-y-1.5">
                      {cgh.gaps.map((g) => (
                        <li key={g} className="flex items-start gap-2 text-sm text-ink-600">
                          <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <PageNavigation currentPage={6} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 7: Investor Readiness ─────────────────────────────── */}
          <PageSection id="investor-readiness" num={7} title="Investor Readiness" icon={Target}>
            {iri && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-ink-800">IRI Dimension Score</p>
                  <span className="font-mono text-2xl font-bold text-brand-600">
                    {Math.round(iri.value)}/100
                  </span>
                </div>
                <p className="text-sm text-ink-600 mb-6 leading-relaxed">{iri.rationale}</p>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <SignalIndicator label="Pitch Deck" active={signals.hasPitchDeck} />
              <SignalIndicator label="Financial Model" active={signals.hasFinancialModel} />
              <SignalIndicator label="Data Room" active={signals.hasDataRoom} />
              <SignalIndicator label="Raise Target Stated" active={signals.targetRaiseMentioned} />
            </div>

            {iri && (
              <div className="space-y-3">
                {iri.evidence.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium mb-2">Evidence</p>
                    <ul className="space-y-1.5">
                      {iri.evidence.map((e) => (
                        <li key={e} className="flex items-start gap-2 text-sm text-ink-600">
                          <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {iri.gaps.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-2">Gaps</p>
                    <ul className="space-y-1.5">
                      {iri.gaps.map((g) => (
                        <li key={g} className="flex items-start gap-2 text-sm text-ink-600">
                          <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Competitive Research panel integrated here */}
            <div className="mt-6">
              <ResearchPanel
                description={rawText ?? analysis.summary}
                keywords={signals.marketSize ? `${signals.marketSize} market` : undefined}
              />
            </div>

            <PageNavigation currentPage={7} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 8: Risk Assessment ────────────────────────────────── */}
          <PageSection id="risk-assessment" num={8} title="Risk Assessment" icon={Shield}>
            {analysis.riskPenalties.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-ink-600">
                    {analysis.riskPenalties.length} risk{analysis.riskPenalties.length !== 1 ? "s" : ""} detected,
                    totalling{" "}
                    <span className="font-mono font-bold text-red-600">
                      -{analysis.riskPenalties.reduce((s, r) => s + r.points, 0)}
                    </span>{" "}
                    SVI points.
                  </p>
                </div>

                <div className="space-y-3">
                  {analysis.riskPenalties
                    .sort((a, b) => b.points - a.points)
                    .map((risk) => (
                      <RiskCard key={risk.label} label={risk.label} points={risk.points} reason={risk.reason} />
                    ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 strokeWidth={1.75} className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-ink-800">No risk flags detected</p>
                <p className="text-xs text-ink-600 mt-1">Your startup has no critical risk penalties.</p>
              </div>
            )}

            <PageNavigation currentPage={8} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 9: Evidence Gaps & Action Plan ────────────────────── */}
          <PageSection id="evidence-gaps" num={9} title="Evidence Gaps & Action Plan" icon={ClipboardList}>
            {sortedGaps.length > 0 ? (
              <>
                <p className="text-sm text-ink-600 mb-6 leading-relaxed">
                  Address these evidence gaps to increase your SVI. Items are ordered by priority and impact.
                </p>

                {p0Gaps.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs uppercase tracking-[0.15em] text-red-600 font-semibold mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Critical (P0)
                    </p>
                    <div className="space-y-2">
                      {p0Gaps.map((gap) => {
                        const gapAction = getActionForGap(gap.label);
                        return (
                          <Link
                            key={gap.label}
                            href="/workspace/evidence"
                            className="block rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:border-red-300 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600">
                                P0
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                                <p className="text-xs text-ink-600 mt-0.5">{gap.action}</p>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-semibold text-teal-600">+{gap.impact}</span>
                            </div>
                            {gapAction && (
                              <div className="mt-2 ml-8">
                                <ActionButton action={gapAction} onUpload={handleUploadAction} email={email} />
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {p1Gaps.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs uppercase tracking-[0.15em] text-amber-600 font-semibold mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Important (P1)
                    </p>
                    <div className="space-y-2">
                      {p1Gaps.map((gap) => {
                        const gapAction = getActionForGap(gap.label);
                        return (
                          <Link
                            key={gap.label}
                            href="/workspace/evidence"
                            className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:border-amber-300 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-600">
                                P1
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                                <p className="text-xs text-ink-600 mt-0.5">{gap.action}</p>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-semibold text-teal-600">+{gap.impact}</span>
                            </div>
                            {gapAction && (
                              <div className="mt-2 ml-8">
                                <ActionButton action={gapAction} onUpload={handleUploadAction} email={email} />
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {p2Gaps.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs uppercase tracking-[0.15em] text-ink-600 font-semibold mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-surface-400" />
                      Nice to Have (P2)
                    </p>
                    <div className="space-y-2">
                      {p2Gaps.map((gap) => {
                        const gapAction = getActionForGap(gap.label);
                        return (
                          <Link
                            key={gap.label}
                            href="/workspace/evidence"
                            className="block rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 hover:border-surface-300 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-surface-200 text-ink-600">
                                P2
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                                <p className="text-xs text-ink-600 mt-0.5">{gap.action}</p>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-semibold text-teal-600">+{gap.impact}</span>
                            </div>
                            {gapAction && (
                              <div className="mt-2 ml-8">
                                <ActionButton action={gapAction} onUpload={handleUploadAction} email={email} />
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Next Actions */}
                {analysis.nextActions.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-brand-600 font-semibold mb-3 flex items-center gap-2">
                      <Zap strokeWidth={1.75} className="h-3.5 w-3.5" />
                      Recommended Actions
                    </p>
                    <div className="space-y-2">
                      {analysis.nextActions.map((action) => {
                        const nextAction = getActionForNextAction(action.title);
                        return (
                          <div
                            key={action.title}
                            className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <Zap
                                  strokeWidth={1.75}
                                  className={cn(
                                    "mt-0.5 h-4 w-4 shrink-0",
                                    action.priority === "P0"
                                      ? "text-red-600"
                                      : action.priority === "P1"
                                        ? "text-amber-600"
                                        : "text-ink-600",
                                  )}
                                />
                                <div>
                                  <p className="text-sm font-medium text-ink-800">{action.title}</p>
                                  <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">{action.detail}</p>
                                </div>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-semibold text-teal-600 mt-0.5">
                                {action.impact}
                              </span>
                            </div>
                            {nextAction && (
                              <div className="mt-2 ml-7">
                                <ActionButton action={nextAction} onUpload={handleUploadAction} email={email} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 strokeWidth={1.75} className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-ink-800">No evidence gaps</p>
                <p className="text-xs text-ink-600 mt-1">Your evidence base is comprehensive.</p>
              </div>
            )}

            {/* Evidence Upload CTA — only shown to unauthenticated users */}
            <EvidenceUploadPrompt />

            <PageNavigation currentPage={9} onNavigate={navigateToPageNum} />
          </PageSection>

          {/* ─── Page 10: Next Steps & Recommendations ──────────────────── */}
          <PageSection id="next-steps" num={10} title="Next Steps & Recommendations" icon={Lightbulb}>
            {/* Stage Journey */}
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-4">
                Stage Journey
              </p>
              <StageJourney currentStage={analysis.stage} />
            </div>

            {/* Quick Wins */}
            {analysis.nextActions.length > 0 && (
              <div className="mb-8">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">
                  Top Actions to Advance
                </p>
                <div className="space-y-2">
                  {analysis.nextActions.slice(0, 3).map((action, idx) => {
                    const nextAction = getActionForNextAction(action.title);
                    return (
                      <div
                        key={action.title}
                        className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-brand-600 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-ink-800">{action.title}</p>
                            <p className="text-xs text-ink-600 mt-0.5">{action.detail}</p>
                          </div>
                          <span className="shrink-0 font-mono text-xs font-semibold text-teal-600 mt-0.5">
                            {action.impact}
                          </span>
                        </div>
                        {nextAction && (
                          <div className="mt-2 ml-9">
                            <ActionButton action={nextAction} onUpload={handleUploadAction} email={email} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upsell CTA */}
            <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 sm:px-6 py-5 mb-6">
              <div className="flex items-start gap-3">
                <TrendingUp strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                    <p className="text-sm font-semibold text-ink-800">Track your SVI over time</p>
                    <span className="self-start rounded-full bg-brand-100 border border-brand-200 px-2 py-0.5 text-[10px] font-medium text-brand-600 uppercase tracking-wider">
                      50 spots only
                    </span>
                  </div>
                  <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                    Claim a Founding 50 account to build your SVI over time — cap table, Evidence Vault,
                    export packs, and a 30-day growth plan.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <a
                href="/founding-50"
                className="block"
                onClick={() => {
                  if (email) void trackAction(email, { label: "Get Founding 50", type: "guide", href: "/founding-50" });
                }}
              >
                <Button variant="primary" size="md" className="w-full gap-2">
                  <Rocket strokeWidth={1.75} className="h-4 w-4" />
                  Get Founding 50
                </Button>
              </a>
              <a
                href="/dashboard/svi"
                className="block"
                onClick={() => {
                  if (email) void trackAction(email, { label: "View on Dashboard", type: "guide", href: "/dashboard/svi" });
                }}
              >
                <Button variant="secondary" size="md" className="w-full gap-2">
                  <LayoutDashboard strokeWidth={1.75} className="h-4 w-4" />
                  View on Dashboard
                </Button>
              </a>
              <Button variant="outline" size="md" className="w-full gap-2" onClick={handleCopy}>
                <Mail strokeWidth={1.75} className="h-4 w-4" />
                {copied ? "Link Copied!" : "Share via Email"}
              </Button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/svi/pdf", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ analysis, email }),
                    });
                    if (!res.ok) throw new Error("PDF failed");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `BlockID-SVI-Report-${analysis.totalSVI}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch { /* silently fail */ }
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-surface-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </button>
            </div>

            {/* Share URL */}
            <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-white px-3 sm:px-4 py-3 shadow-sm mb-6 min-w-0">
              <span className="text-[11px] sm:text-xs text-ink-600 truncate font-mono min-w-0">{shareUrl}</span>
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
          </PageSection>
        </div>
      </div>
    </div>
  );
}
