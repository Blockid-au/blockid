"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { computeThreeCaseValuation, formatAud } from "@/lib/svi/three-case-valuation";
import {
  selectValuationMethod,
  inferTractionFromTreScore,
  METHOD_META,
} from "@/lib/svi/valuation-method-selector";
import {
  Users,
  Target,
  Cog,
  TrendingUp,
  Landmark,
  Briefcase,
  Scale,
  Sparkles,
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  type LucideIcon,
} from "lucide-react";

// ── Dimension metadata ────────────────────────────────────────────────────────

const DIMS: Record<string, { label: string; Icon: LucideIcon; weight: number; section: string }> = {
  ftv: { label: "Founder & Team Value",      Icon: Users,       weight: 15, section: "Founding Team" },
  mpc: { label: "Market & Problem Clarity",  Icon: Target,      weight: 18, section: "Market & Problem" },
  ptd: { label: "Product & Tech Depth",      Icon: Cog,         weight: 12, section: "Product & Technology" },
  tre: { label: "Traction & Revenue",        Icon: TrendingUp,  weight: 20, section: "Traction & Revenue" },
  cgh: { label: "Cap Table & Governance",    Icon: Landmark,    weight: 12, section: "Cap Table & Governance" },
  iri: { label: "Investor Readiness",        Icon: Briefcase,   weight: 10, section: "Investor Readiness" },
  lco: { label: "Legal & Compliance",        Icon: Scale,       weight: 8,  section: "Legal & Compliance" },
  svm: { label: "Strategic Vision & Moat",   Icon: Sparkles,    weight: 5,  section: "Strategic Vision" },
};

const DIM_ORDER = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DimState {
  status: string;
  score: number | null;
  markdown: string | null;
  insights: string[];
  priority: "high" | "medium" | "low" | null;
  marketBenchmark: string | null;
}

interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
}

const STORAGE_PREFIX = "svi-stream:";
const STORAGE_MAX_AGE_MS = 30 * 60_000;

function loadPersisted(projectId: string): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreBand(score: number | null): "strong" | "developing" | "early" | "pending" {
  if (score === null) return "pending";
  if (score >= 70) return "strong";
  if (score >= 40) return "developing";
  return "early";
}

function bandColor(band: "strong" | "developing" | "early" | "pending"): string {
  if (band === "strong") return "text-emerald-700 dark:text-emerald-300";
  if (band === "developing") return "text-amber-700 dark:text-amber-300";
  if (band === "early") return "text-red-700 dark:text-red-300";
  return "text-ink-400 dark:text-ink-500";
}

function bandBg(band: "strong" | "developing" | "early" | "pending"): string {
  if (band === "strong") return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800";
  if (band === "developing") return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
  if (band === "early") return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
  return "bg-ink-50 border-ink-200 dark:bg-ink-900 dark:border-ink-800";
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split(/\n\n+/);
  return (
    <div className="space-y-2.5">
      {lines.map((block, i) => {
        const headingMatch = block.match(/^\*\*([^*]+)\*\*/);
        if (headingMatch) {
          const heading = headingMatch[1];
          const rest = block.slice(headingMatch[0].length).replace(/^:\s*/, "");
          return (
            <div key={i}>
              <p className="text-xs font-bold text-ink-700 dark:text-ink-200 uppercase tracking-wide">{heading}</p>
              {rest && (
                <p className="text-sm text-ink-600 dark:text-ink-400 mt-1 leading-relaxed">{rest}</p>
              )}
            </div>
          );
        }
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="space-y-1.5">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-ink-600 dark:text-ink-400">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-400" />
                  <span>{item.slice(2)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed">{block}</p>
        );
      })}
    </div>
  );
}

// ── Sticky TOC ────────────────────────────────────────────────────────────────

const TOC_SECTIONS = [
  { id: "tbr-executive", label: "Executive Summary" },
  { id: "tbr-svi", label: "SVI Score" },
  { id: "tbr-valuation", label: "Valuation" },
  ...DIM_ORDER.map((k) => ({ id: `tbr-dim-${k}`, label: DIMS[k].section })),
  { id: "tbr-risk", label: "Risk Register" },
  { id: "tbr-roadmap", label: "Improvement Roadmap" },
];

function TocNav({ activeId }: { activeId: string }) {
  return (
    <nav
      aria-label="Report sections"
      className="hidden xl:block sticky top-24 self-start w-56 shrink-0"
    >
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-500 dark:text-ink-400 mb-2">
        Contents
      </p>
      <ul className="space-y-0.5">
        {TOC_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "block rounded px-2 py-1 text-[12px] transition-colors leading-snug",
                activeId === s.id
                  ? "bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold"
                  : "text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function ReportSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 space-y-4", className)}
      aria-labelledby={`${id}-heading`}
    >
      <h2
        id={`${id}-heading`}
        className="text-lg font-bold text-ink-800 dark:text-ink-100 border-b border-ink-200 dark:border-ink-800 pb-2"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BusinessReportClient({ projectId }: { projectId: string }) {
  const [data, setData] = useState<PersistedState | null>(null);
  const [activeId, setActiveId] = useState("tbr-executive");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadPersisted(projectId);
    setData(saved);
  }, [projectId]);

  // Intersection observer for active TOC item
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    const els = document.querySelectorAll("section[id^='tbr-']");
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data]);

  if (!data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-6 text-center space-y-3">
          <FileText className="h-10 w-10 mx-auto text-amber-500 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            No recent analysis found
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Run a full SVI dimension analysis first — results are available for 30 minutes.
          </p>
          <Link
            href="/workspace/pitchdeck-analyze"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            Analyse my pitchdeck <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const { dimStates, industry, totalMs, done } = data;

  const scored = DIM_ORDER
    .map((k) => ({ key: k, ...DIMS[k], state: dimStates[k] ?? null }))
    .filter((d) => d.state?.score !== null && d.state !== null) as Array<{
      key: string;
      label: string;
      Icon: LucideIcon;
      weight: number;
      section: string;
      state: DimState & { score: number };
    }>;

  if (scored.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 p-6 text-center space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-400">
            Analysis cached but no scores found. Re-run the dimension analysis.
          </p>
          <Link href="/workspace/pitchdeck-analyze" className="text-brand-600 hover:underline text-sm">
            Go to Pitchdeck Analyze →
          </Link>
        </div>
      </div>
    );
  }

  const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
  const totalSvi = Math.round(
    scored.reduce((acc, d) => acc + (d.state.score * d.weight) / totalWeight, 0),
  );
  const overallBand = scoreBand(totalSvi);

  // Valuation
  const treState = dimStates["tre"];
  const traction = inferTractionFromTreScore(treState?.score ?? null);
  const normStage = (s: string | null | undefined): "idea" | "pre_seed" | "seed" | "series_a" | "series_b" | "growth" => {
    if (!s) return "seed";
    const l = s.toLowerCase().replace(/[-\s]/g, "_");
    if (l.startsWith("idea") || l === "pre_launch") return "idea";
    if (l.startsWith("pre_seed") || l === "preseed") return "pre_seed";
    if (l.startsWith("seed")) return "seed";
    if (l === "a" || l.includes("series_a")) return "series_a";
    if (l === "b" || l.includes("series_b")) return "series_b";
    return "growth";
  };
  const methodSel = selectValuationMethod(normStage(null), totalSvi, traction);
  const valuation = computeThreeCaseValuation(totalSvi, null, industry);

  // Risk register: high-priority dims sorted by weight × gap (1 - score/100)
  const riskItems = scored
    .filter((d) => d.state.priority === "high" || d.state.score < 50)
    .sort((a, b) => {
      const riskA = a.weight * (1 - a.state.score / 100);
      const riskB = b.weight * (1 - b.state.score / 100);
      return riskB - riskA;
    });

  // Improvement roadmap: sorted by potential SVI lift = weight × (70 - score) / 100
  // Only dims below 70 (not already "strong")
  const roadmapItems = scored
    .filter((d) => d.state.score < 70)
    .sort((a, b) => {
      const liftA = a.weight * (70 - a.state.score) / 100;
      const liftB = b.weight * (70 - b.state.score) / 100;
      return liftB - liftA;
    })
    .slice(0, 5);

  // Executive summary band description
  const execVerdict =
    overallBand === "strong"
      ? `This business scores ${totalSvi}/100 on the BlockID Startup Value Index — placing it in investor-ready territory. The analysis identified ${scored.filter((d) => d.state.score >= 70).length} dimensions above the 70-point threshold with strong evidence.`
      : overallBand === "developing"
      ? `This business scores ${totalSvi}/100 on the BlockID Startup Value Index — developing, with meaningful gaps to close before Series A or significant angel capital. ${riskItems.length} dimension${riskItems.length !== 1 ? "s" : ""} flagged as high-priority focus areas.`
      : `This business scores ${totalSvi}/100 on the BlockID Startup Value Index — early-stage, indicating significant evidence gaps that will limit fundraising options at this point. Concrete evidence-building actions are recommended before approaching investors.`;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100">
            Trusted Business Report
          </h1>
          <span className="inline-flex items-center rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            BlockID SVI™
          </span>
        </div>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {scored.length} of 8 dimensions · {done ? `completed in ${((totalMs ?? 0) / 1000).toFixed(1)}s` : "partial analysis"}
          {industry && ` · ${industry}`}
        </p>
      </div>

      <div className="flex gap-8 items-start">
        {/* Sticky TOC */}
        <TocNav activeId={activeId} />

        {/* Report body */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* ── Executive Summary ──────────────────────────────────────────── */}
          <ReportSection id="tbr-executive" title="Executive Summary">
            <div className={cn("rounded-xl border p-5 space-y-3", bandBg(overallBand))}>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className={cn("text-4xl font-bold tabular-nums", bandColor(overallBand))}>
                  {totalSvi}
                  <span className="text-xl text-ink-400 dark:text-ink-500 font-normal">/100</span>
                </span>
                <span className={cn("text-sm font-semibold", bandColor(overallBand))}>
                  {overallBand === "strong" ? "Investor-Ready" : overallBand === "developing" ? "Developing" : "Early-Stage"}
                </span>
              </div>
              <p className="text-sm text-ink-700 dark:text-ink-300 leading-relaxed">{execVerdict}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {scored.slice(0, 4).map((d) => (
                  <div key={d.key} className="rounded-lg bg-white/60 dark:bg-ink-900/40 border border-ink-200/60 dark:border-ink-800/60 p-2.5">
                    <p className="text-[10px] text-ink-500 dark:text-ink-400 uppercase tracking-wide">{d.section}</p>
                    <p className={cn("text-lg font-bold tabular-nums mt-0.5", bandColor(scoreBand(d.state.score)))}>
                      {d.state.score}/100
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </ReportSection>

          {/* ── SVI Score breakdown ────────────────────────────────────────── */}
          <ReportSection id="tbr-svi" title="Business SVI — Weighted Score Breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-ink-200 dark:border-ink-700">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">Dimension</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-16">Weight</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-20">Score</th>
                    <th className="text-center py-2 pl-2 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-20">Priority</th>
                    <th className="text-right py-2 pl-4 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-24">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {DIM_ORDER.map((k) => {
                    const meta = DIMS[k];
                    const state = dimStates[k];
                    const contrib = state?.score !== null && state?.score !== undefined
                      ? Math.round((state.score * meta.weight) / totalWeight)
                      : null;
                    return (
                      <tr key={k} className="border-b border-ink-100 dark:border-ink-800/60 hover:bg-ink-50/60 dark:hover:bg-ink-900/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <meta.Icon className="h-4 w-4 text-brand-500 dark:text-brand-400 shrink-0" aria-hidden="true" />
                            <a
                              href={`#tbr-dim-${k}`}
                              className="font-medium text-ink-700 dark:text-ink-200 hover:text-brand-600 dark:hover:text-brand-300"
                            >
                              {meta.label}
                            </a>
                          </div>
                        </td>
                        <td className="text-center py-2.5 px-2 text-ink-600 dark:text-ink-400 tabular-nums">{meta.weight}%</td>
                        <td className="text-center py-2.5 px-2">
                          {state?.score != null ? (
                            <span className={cn("font-bold tabular-nums", bandColor(scoreBand(state.score)))}>
                              {state.score}
                            </span>
                          ) : (
                            <span className="text-ink-400 dark:text-ink-600">—</span>
                          )}
                        </td>
                        <td className="text-center py-2.5 pl-2">
                          {state?.priority && (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              state.priority === "high" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                              state.priority === "medium" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                              state.priority === "low" && "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400",
                            )}>
                              {state.priority}
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2.5 pl-4 tabular-nums text-ink-600 dark:text-ink-400">
                          {contrib !== null ? `${contrib} pts` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-ink-50/60 dark:bg-ink-900/40">
                    <td className="py-2.5 pr-4 font-bold text-ink-800 dark:text-ink-100">Total SVI</td>
                    <td className="text-center py-2.5 px-2 font-semibold text-ink-600 dark:text-ink-300">{totalWeight}%</td>
                    <td className="text-center py-2.5 px-2">
                      <span className={cn("text-lg font-bold tabular-nums", bandColor(overallBand))}>{totalSvi}</span>
                    </td>
                    <td />
                    <td className="text-right py-2.5 pl-4 font-bold text-ink-800 dark:text-ink-100 tabular-nums">{totalSvi} pts</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ReportSection>

          {/* ── Valuation ─────────────────────────────────────────────────── */}
          <ReportSection id="tbr-valuation" title="Directional Pre-Money Valuation">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/30 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {methodSel.meta.shortLabel}
                </span>
                <p className="text-sm text-ink-600 dark:text-ink-400">{methodSel.rationale}</p>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-500">{methodSel.meta.description}</p>
              <p className="text-xs text-ink-500 dark:text-ink-500">{methodSel.meta.auBenchmark}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["worst", "average", "best"] as const).map((c) => (
                  <div
                    key={c}
                    className={cn(
                      "rounded-xl border p-4",
                      c === "worst" && "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20",
                      c === "average" && "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30",
                      c === "best" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20",
                    )}
                  >
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-600 dark:text-ink-400">
                      {c === "worst" ? "Worst Case" : c === "average" ? "Average Case" : "Best Case"}
                    </p>
                    <p className={cn(
                      "mt-1 text-2xl font-bold tabular-nums",
                      c === "worst" && "text-red-700 dark:text-red-300",
                      c === "average" && "text-brand-700 dark:text-brand-300",
                      c === "best" && "text-emerald-700 dark:text-emerald-300",
                    )}>
                      {formatAud(valuation[c].mid)}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-500 tabular-nums mt-0.5">
                      {formatAud(valuation[c].low)}–{formatAud(valuation[c].high)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-500 leading-snug">{valuation.disclaimer}</p>
            </div>
          </ReportSection>

          {/* ── Per-dimension sections ─────────────────────────────────────── */}
          {DIM_ORDER.map((k) => {
            const meta = DIMS[k];
            const state = dimStates[k];
            if (!state || state.score === null) return null;
            const band = scoreBand(state.score);
            return (
              <ReportSection
                key={k}
                id={`tbr-dim-${k}`}
                title={`${meta.section} (${meta.label})`}
              >
                <div className={cn("rounded-xl border p-5 space-y-4", bandBg(band))}>
                  {/* Score row */}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <meta.Icon className="h-5 w-5 text-brand-500 dark:text-brand-400" aria-hidden="true" />
                    <span className={cn("text-3xl font-bold tabular-nums", bandColor(band))}>
                      {state.score}/100
                    </span>
                    <span className="text-xs text-ink-500 dark:text-ink-400">{meta.weight}% of total SVI</span>
                    {state.priority && (
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        state.priority === "high" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800",
                        state.priority === "medium" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
                        state.priority === "low" && "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400 border border-ink-200 dark:border-ink-700",
                      )}>
                        {state.priority} priority
                      </span>
                    )}
                  </div>

                  {/* Insights */}
                  {state.insights.length > 0 && (
                    <div className="space-y-1.5">
                      {state.insights.map((ins, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
                          <p className="text-sm text-ink-700 dark:text-ink-200">{ins}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AU market benchmark */}
                  {state.marketBenchmark && (
                    <div className="rounded-lg bg-white/50 dark:bg-ink-900/30 border border-brand-200/60 dark:border-brand-800/40 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-500 dark:text-ink-400 mb-0.5">AU Market Benchmark</p>
                      <p className="text-sm text-ink-600 dark:text-ink-300">{state.marketBenchmark}</p>
                    </div>
                  )}

                  {/* Full markdown */}
                  {state.markdown && (
                    <div className="border-t border-ink-200/60 dark:border-ink-700/40 pt-4">
                      <SimpleMarkdown text={state.markdown} />
                    </div>
                  )}
                </div>
              </ReportSection>
            );
          })}

          {/* ── Risk Register ─────────────────────────────────────────────── */}
          {riskItems.length > 0 && (
            <ReportSection id="tbr-risk" title="Risk Register">
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Dimensions that represent the highest investment risk — sorted by impact × gap.
              </p>
              <div className="space-y-3">
                {riskItems.map((d, i) => (
                  <div
                    key={d.key}
                    className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20 p-4"
                  >
                    <span className="flex-none w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 flex items-center justify-center text-[11px] font-bold text-red-700 dark:text-red-300">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`#tbr-dim-${d.key}`}
                          className="font-semibold text-sm text-ink-800 dark:text-ink-100 hover:text-brand-600 dark:hover:text-brand-300"
                        >
                          {d.label}
                        </a>
                        <span className={cn("tabular-nums text-sm font-bold", bandColor(scoreBand(d.state.score)))}>
                          {d.state.score}/100
                        </span>
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                        {d.weight}% weight · estimated {Math.round(d.weight * (1 - d.state.score / 100))} pts drag on total SVI
                      </p>
                      {d.state.insights[0] && (
                        <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">{d.state.insights[0]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          {/* ── Improvement Roadmap ────────────────────────────────────────── */}
          {roadmapItems.length > 0 && (
            <ReportSection id="tbr-roadmap" title="Improvement Roadmap">
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Top {roadmapItems.length} actions ranked by expected SVI lift (weight × gap to 70-point threshold).
              </p>
              <div className="space-y-3">
                {roadmapItems.map((d, i) => {
                  const lift = Math.round(d.weight * (70 - d.state.score) / 100);
                  return (
                    <div
                      key={d.key}
                      className="flex items-start gap-3 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 p-4"
                    >
                      <span className="flex-none w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-300 dark:border-brand-700 flex items-center justify-center text-[11px] font-bold text-brand-700 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`#tbr-dim-${d.key}`}
                            className="font-semibold text-sm text-ink-800 dark:text-ink-100 hover:text-brand-600 dark:hover:text-brand-300"
                          >
                            {d.label}
                          </a>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                            <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            +{lift} pts potential lift
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                          Current: {d.state.score}/100 · Target: 70+ · {d.weight}% weight
                        </p>
                        <a
                          href={`/workspace/svi-evidence?dim=${d.key}`}
                          className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          Add evidence for {d.section} <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
          )}

          {/* Footer */}
          <div className="border-t border-ink-200 dark:border-ink-800 pt-4 pb-8 flex items-center justify-between gap-4 text-xs text-ink-500 dark:text-ink-500">
            <p>
              BlockID Startup Value Index™ — AI-assisted analysis.
              Not a formal valuation or investment advice.
            </p>
            <Link
              href="/workspace/pitchdeck-analyze"
              className="text-brand-600 dark:text-brand-400 hover:underline shrink-0"
            >
              Re-analyse →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
