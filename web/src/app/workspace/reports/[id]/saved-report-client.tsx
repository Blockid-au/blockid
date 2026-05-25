"use client";

import * as React from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  Unlock,
  Sparkles,
  Loader2 as SpinnerIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Section Definitions ──────────────────────────────────────────────────── */

interface SectionDef {
  id: string;
  title: string;
  subtitle: string;
  tier: "free" | "included" | "premium";
  creditCost: number;
  fullWords: number;
}

// Sections organized by business phase — helps founders navigate logically
const SECTION_DEFS: SectionDef[] = [
  // ── Overview ──
  { id: "executive",       title: "Executive Summary",         subtitle: "Your startup snapshot — read this first",                 tier: "free",     creditCost: 0.50, fullWords: 1500 },
  // ── Foundation ──
  { id: "founder_team",    title: "Founder & Team",            subtitle: "Who's building this? Strengths, gaps, advisory needs",    tier: "included", creditCost: 0.50, fullWords: 1200 },
  { id: "cap_table",       title: "Cap Table & Governance",    subtitle: "Equity split, vesting — are you investor-ready?",        tier: "included", creditCost: 0.50, fullWords: 1000 },
  { id: "legal",           title: "Legal & Compliance",        subtitle: "ABN, ASIC, IP protection — essentials for AU startups",  tier: "included", creditCost: 0.50, fullWords: 1000 },
  // ── Product-Market Fit ──
  { id: "market",          title: "Market Opportunity",        subtitle: "Is the market big enough? TAM, competition, timing",     tier: "included", creditCost: 0.75, fullWords: 1500 },
  { id: "product",         title: "Product & Tech",            subtitle: "How mature is your product? Tech stack, demo readiness", tier: "included", creditCost: 0.50, fullWords: 1200 },
  { id: "traction",        title: "Traction & Revenue",        subtitle: "Do customers want this? Revenue, users, growth",         tier: "included", creditCost: 0.75, fullWords: 1500 },
  // ── Growth & Fundraise ──
  { id: "gtm",             title: "Go-to-Market",              subtitle: "How will you reach customers? Channels, CAC, strategy",  tier: "included", creditCost: 0.50, fullWords: 1200 },
  { id: "financial",       title: "Financial Projections",     subtitle: "Revenue forecast, unit economics, runway remaining",     tier: "included", creditCost: 0.75, fullWords: 1500 },
  { id: "investor_ready",  title: "Investor Readiness",        subtitle: "Pitch deck, data room — are you fundraise-ready?",       tier: "included", creditCost: 0.50, fullWords: 1200 },
  // ── Strategic ──
  { id: "vision_moat",     title: "Strategic Vision & Moat",   subtitle: "What makes you defensible? Network effects, data moat",  tier: "included", creditCost: 0.50, fullWords: 1200 },
  { id: "risk",            title: "Risk & Mitigation",         subtitle: "What could go wrong? Key risks and how to address them", tier: "included", creditCost: 0.50, fullWords: 1200 },
  // ── Deep Intelligence (Premium) ──
  { id: "competitive",     title: "Competitive Intelligence",  subtitle: "Named competitors, feature gaps, positioning",           tier: "premium",  creditCost: 0.75, fullWords: 1500 },
  { id: "roadmap",         title: "90-Day Roadmap",            subtitle: "Week-by-week action plan with milestones",               tier: "premium",  creditCost: 0.75, fullWords: 1500 },
  { id: "board_summary",   title: "Board-Ready Summary",       subtitle: "One-page brief for investors and board meetings",        tier: "premium",  creditCost: 1.00, fullWords: 1000 },
  { id: "au_market",       title: "AU Market Deep Dive",       subtitle: "ESIC, R&D grants, AU accelerators — local opportunities", tier: "premium",  creditCost: 1.00, fullWords: 1500 },
];

// Phase group labels for navigation
const PHASE_LABELS: Array<{ label: string; ids: string[] }> = [
  { label: "Overview", ids: ["executive"] },
  { label: "Foundation", ids: ["founder_team", "cap_table", "legal"] },
  { label: "Product-Market Fit", ids: ["market", "product", "traction"] },
  { label: "Growth", ids: ["gtm", "financial", "investor_ready"] },
  { label: "Strategic", ids: ["vision_moat", "risk"] },
  { label: "Premium", ids: ["competitive", "roadmap", "board_summary", "au_market"] },
];

const BUNDLE_DISCOUNT = 0.30;

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface SavedSection {
  sectionId: string;
  depth: string;
  content: string;
  wordCount: number | null;
  creditsCost: number | null;
  createdAt: string;
}

interface AnalysisInfo {
  id: string;
  totalSvi: number;
  createdAt: string;
  inputType: string;
  analysisJson: Record<string, unknown> | null;
}

interface SavedReportClientProps {
  analysis: AnalysisInfo;
  savedSections: SavedSection[];
  analysisId: string;
}

/* ─── Markdown prose classes ───────────────────────────────────────────────── */

const PROSE_CLASSES = [
  "prose prose-sm prose-brand max-w-none text-ink-700 leading-relaxed",
  "prose-headings:text-ink-900 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2",
  "prose-p:my-2 prose-li:my-0.5",
  "prose-strong:text-ink-800 prose-strong:font-semibold",
  "prose-ul:my-2 prose-ol:my-2",
  "prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline",
].join(" ");

/* ─── Component ────────────────────────────────────────────────────────────── */

export function SavedReportClient({ analysis, savedSections, analysisId }: SavedReportClientProps) {
  // Build a map of section states from saved data
  const [sections, setSections] = React.useState<
    Record<string, { content: string; depth: string; wordCount: number | null }>
  >(() => {
    const initial: Record<string, { content: string; depth: string; wordCount: number | null }> = {};
    for (const s of savedSections) {
      // If we already have this section, prefer "full" depth over "summary"
      if (initial[s.sectionId] && initial[s.sectionId].depth === "full") continue;
      initial[s.sectionId] = {
        content: s.content,
        depth: s.depth,
        wordCount: s.wordCount,
      };
    }
    return initial;
  });

  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(() => {
    // Auto-expand sections that have content
    const expanded = new Set<string>();
    for (const s of savedSections) {
      expanded.add(s.sectionId);
    }
    return expanded;
  });

  const [loadingSection, setLoadingSection] = React.useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = React.useState<string | null>(null);
  const [confirmUnlockAll, setConfirmUnlockAll] = React.useState(false);
  const [unlockAllLoading, setUnlockAllLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Counts
  const unlockedCount = SECTION_DEFS.filter((s) => sections[s.id]?.depth === "full").length;
  const summaryCount = SECTION_DEFS.filter(
    (s) => sections[s.id] && sections[s.id].depth !== "full"
  ).length;
  const remainingSections = SECTION_DEFS.filter((s) => sections[s.id]?.depth !== "full");
  const remainingCost = remainingSections.reduce((sum, s) => sum + s.creditCost, 0);
  const discountedCost = Math.round(remainingCost * (1 - BUNDLE_DISCOUNT) * 100) / 100;
  const remainingWords = remainingSections.reduce((sum, s) => sum + s.fullWords, 0);

  // Toggle section expansion
  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Unlock a single section
  const handleUnlock = React.useCallback(async (sectionId: string) => {
    setLoadingSection(sectionId);
    setError(null);
    setConfirmUnlock(null);

    try {
      const res = await fetch("/api/svi/report-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, depth: "full" }),
      });

      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        setError("Unexpected server response");
        setLoadingSection(null);
        return;
      }

      if (!data.ok) {
        let errMsg: string;
        if (res.status === 401) errMsg = "Please sign in to unlock sections.";
        else if (res.status === 402) errMsg = "Insufficient credits. Add credits to continue.";
        else errMsg = (data.error as string) ?? "Failed to generate section.";
        setError(errMsg);
        setLoadingSection(null);
        return;
      }

      setSections((prev) => ({
        ...prev,
        [sectionId]: {
          content: data.content as string,
          depth: "full",
          wordCount: (data.wordCount as number) ?? null,
        },
      }));
      setExpandedSections((prev) => new Set(prev).add(sectionId));
    } catch {
      setError("Network error. Please try again.");
    }

    setLoadingSection(null);
  }, []);

  // Unlock all remaining sections
  const handleUnlockAll = React.useCallback(async () => {
    setUnlockAllLoading(true);
    setError(null);

    const toUnlock = SECTION_DEFS.filter((s) => sections[s.id]?.depth !== "full");
    for (const s of toUnlock) {
      await handleUnlock(s.id);
    }

    setUnlockAllLoading(false);
    setConfirmUnlockAll(false);
  }, [sections, handleUnlock]);

  // Format date
  const formattedDate = new Date(analysis.createdAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const inputTypeLabel =
    analysis.inputType === "rnd"
      ? "R&D Analysis"
      : analysis.inputType === "url"
        ? "URL Analysis"
        : "Startup Analysis";

  return (
    <div className="max-w-4xl mx-auto px-6 pb-24 pt-6">
      {/* Back link */}
      <Link
        href="/dashboard/svi"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800 transition-colors mb-6"
      >
        <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {/* Analysis header */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-surface-50 to-surface-50 dark:from-surface-100 dark:via-surface-100 dark:to-surface-100 px-6 py-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink-900">SVI Analysis Report</h1>
            <p className="text-sm text-ink-600 mt-1">
              {formattedDate} &middot; {inputTypeLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 border border-brand-200">
              <span className="text-2xl font-bold text-brand-700">{analysis.totalSvi}</span>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wider">SVI Score</p>
              <p className="text-sm font-semibold text-ink-800">out of 200</p>
            </div>
          </div>
        </div>

        {/* Section stats */}
        <div className="flex items-center gap-3 mt-4 text-[11px] font-medium">
          {unlockedCount > 0 && (
            <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5">
              {unlockedCount} unlocked
            </span>
          )}
          {summaryCount > 0 && (
            <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5">
              {summaryCount} summary
            </span>
          )}
          {remainingSections.length > 0 && (
            <span className="rounded-full bg-surface-200 text-ink-500 px-2.5 py-0.5">
              {remainingSections.length} remaining
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Section cards */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm overflow-hidden">
        {/* Section navigation pills */}
        <div className="border-b border-surface-200 bg-gradient-to-r from-brand-50/50 to-surface-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-bold text-ink-900">Report Sections</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-600">
              {SECTION_DEFS.length} sections
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SECTION_DEFS.map((def, i) => {
              const state = sections[def.id];
              const isFull = state?.depth === "full";
              const hasSummary = !!state && state.depth !== "full";
              const isLocked = !state;

              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => {
                    setExpandedSections((prev) => new Set(prev).add(def.id));
                    setTimeout(() => {
                      document.getElementById(`section-${def.id}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }, 50);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                    isFull
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : hasSummary
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : isLocked
                          ? "bg-surface-100 text-ink-400 hover:bg-surface-200"
                          : "bg-surface-100 text-ink-600 hover:bg-brand-50"
                  )}
                >
                  <span className="text-[10px] opacity-60">{i + 1}</span>
                  {isLocked && <Lock strokeWidth={2} className="h-2.5 w-2.5 opacity-60" />}
                  {def.title.length > 18 ? def.title.slice(0, 18) + "\u2026" : def.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Individual sections */}
        <div className="divide-y divide-surface-200">
          {SECTION_DEFS.map((def, i) => {
            const state = sections[def.id];
            const isFull = state?.depth === "full";
            const hasSummary = !!state && state.depth !== "full";
            const hasContent = !!state;
            const isExpanded = expandedSections.has(def.id);
            const isLoading = loadingSection === def.id;

            return (
              <div key={def.id} id={`section-${def.id}`} className="scroll-mt-20">
                {/* Section header — always shown */}
                <button
                  type="button"
                  onClick={() => hasContent && toggleSection(def.id)}
                  className={cn(
                    "w-full px-5 py-4 text-left flex items-center justify-between transition-colors",
                    hasContent ? "hover:bg-surface-50 cursor-pointer" : "cursor-default"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-[11px] font-bold text-brand-600 shrink-0">
                      {i + 1}
                    </span>
                    {isFull ? (
                      <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : hasSummary ? (
                      <FileText strokeWidth={1.75} className="h-4 w-4 text-amber-500 shrink-0" />
                    ) : (
                      <Lock strokeWidth={1.75} className="h-4 w-4 text-ink-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-ink-900 block truncate">{def.title}</span>
                      <span className="text-[11px] text-ink-500 block">{def.subtitle}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isFull && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Full
                      </span>
                    )}
                    {hasSummary && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Summary
                      </span>
                    )}
                    {!hasContent && (
                      <span className="rounded-full bg-surface-200 px-2 py-0.5 text-[10px] font-medium text-ink-400">
                        Locked
                      </span>
                    )}
                    {hasContent && (
                      isExpanded
                        ? <ChevronUp strokeWidth={1.75} className="h-4 w-4 text-ink-400" />
                        : <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-ink-400" />
                    )}
                  </div>
                </button>

                {/* Loading state */}
                {isLoading && (
                  <div className="px-5 pb-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <SpinnerIcon strokeWidth={1.75} className="h-4 w-4 text-brand-600 animate-spin" />
                      <span className="text-xs font-medium text-brand-600">Generating full analysis...</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-3/4 rounded bg-surface-200 animate-pulse" />
                      <div className="h-3 w-full rounded bg-surface-200 animate-pulse" />
                      <div className="h-3 w-5/6 rounded bg-surface-200 animate-pulse" />
                      <div className="h-3 w-2/3 rounded bg-surface-200 animate-pulse" />
                    </div>
                  </div>
                )}

                {/* Content (expanded) */}
                {hasContent && isExpanded && !isLoading && (
                  <div className="px-5 pb-5">
                    <div className={PROSE_CLASSES}>
                      <Markdown>{state.content}</Markdown>
                    </div>

                    {/* Upgrade CTA — show when only summary is saved */}
                    {hasSummary && !isFull && (
                      <div className="mt-4">
                        {confirmUnlock === def.id ? (
                          <div className="rounded-xl border border-brand-200 bg-white dark:bg-surface-100 p-4">
                            <p className="text-xs text-ink-700 mb-3">
                              This will use{" "}
                              <span className="font-mono font-semibold text-brand-600">
                                {def.creditCost} cr
                              </span>{" "}
                              from your balance.
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleUnlock(def.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
                              >
                                <Unlock strokeWidth={1.75} className="h-3.5 w-3.5" />
                                Confirm Unlock
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmUnlock(null)}
                                className="rounded-lg border border-surface-300 px-3 py-2 text-xs text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmUnlock(def.id)}
                            className="w-full rounded-xl border border-brand-200 bg-white dark:bg-surface-100 hover:bg-brand-50 dark:hover:bg-surface-50 px-4 py-3 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Unlock strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
                              <span className="text-xs font-semibold text-brand-700">
                                Read full analysis{" "}
                                <span className="font-mono text-brand-500">
                                  ({def.creditCost} cr)
                                </span>
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-500 leading-relaxed">
                              ~{def.fullWords.toLocaleString()} words &middot; {def.subtitle}
                            </p>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Unlock CTA for sections with no content at all */}
                {!hasContent && !isLoading && (
                  <div className="px-5 pb-5">
                    {confirmUnlock === def.id ? (
                      <div className="rounded-xl border border-brand-200 bg-white dark:bg-surface-100 p-4">
                        <p className="text-xs text-ink-700 mb-3">
                          This will use{" "}
                          <span className="font-mono font-semibold text-brand-600">
                            {def.creditCost} cr
                          </span>{" "}
                          from your balance.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleUnlock(def.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
                          >
                            <Unlock strokeWidth={1.75} className="h-3.5 w-3.5" />
                            Confirm Unlock
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnlock(null)}
                            className="rounded-lg border border-surface-300 px-3 py-2 text-xs text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmUnlock(def.id)}
                        className="w-full rounded-xl border border-brand-200 bg-white dark:bg-surface-100 hover:bg-brand-50 dark:hover:bg-surface-50 px-4 py-3 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Unlock strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
                          <span className="text-xs font-semibold text-brand-700">
                            Unlock{" "}
                            <span className="font-mono text-brand-500">
                              ({def.creditCost} cr)
                            </span>
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500 leading-relaxed">
                          ~{def.fullWords.toLocaleString()} words &middot; {def.subtitle}
                        </p>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Unlock All banner */}
        {remainingSections.length > 0 && (
          <div className="border-t border-brand-200 bg-gradient-to-r from-brand-50 to-surface-50 px-5 py-5">
            {confirmUnlockAll ? (
              <div className="rounded-xl border border-brand-200 bg-white dark:bg-surface-100 p-5">
                <p className="text-sm font-semibold text-ink-800 mb-2">
                  Unlock All Remaining Sections
                </p>
                <p className="text-xs text-ink-600 mb-4">
                  {remainingSections.length} sections &middot; ~{remainingWords.toLocaleString()}{" "}
                  words &middot;{" "}
                  <span className="line-through text-ink-400">{remainingCost.toFixed(2)} cr</span>{" "}
                  <span className="font-mono font-semibold text-brand-600">
                    {discountedCost.toFixed(2)} cr
                  </span>{" "}
                  <span className="text-emerald-600 font-medium">
                    (Save {Math.round(BUNDLE_DISCOUNT * 100)}%)
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={unlockAllLoading}
                    onClick={() => void handleUnlockAll()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {unlockAllLoading ? (
                      <>
                        <SpinnerIcon strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                        Unlocking...
                      </>
                    ) : (
                      <>
                        <Unlock strokeWidth={1.75} className="h-4 w-4" />
                        Confirm Unlock All
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={unlockAllLoading}
                    onClick={() => setConfirmUnlockAll(false)}
                    className="rounded-lg border border-surface-300 px-4 py-2.5 text-sm text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmUnlockAll(true)}
                className="w-full rounded-xl border border-brand-200 bg-white dark:bg-surface-100 hover:bg-brand-50 dark:hover:bg-surface-50 px-5 py-4 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink-800">
                      Unlock All Remaining Sections
                    </p>
                    <p className="text-xs text-ink-500 mt-1">
                      {remainingSections.length} sections &middot; ~{remainingWords.toLocaleString()}{" "}
                      words &middot;{" "}
                      <span className="font-mono font-semibold text-brand-600">
                        {discountedCost.toFixed(2)} cr
                      </span>{" "}
                      <span className="text-emerald-600 font-medium">
                        (Save {Math.round(BUNDLE_DISCOUNT * 100)}%)
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 ml-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white">
                    <Unlock strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Unlock All
                  </div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* All sections unlocked */}
        {remainingSections.length === 0 && (
          <div className="border-t border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-700">All sections unlocked</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
