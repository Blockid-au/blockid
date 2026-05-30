"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  SECTION_DEPTH_CONFIG,
  REPORT_BUNDLES,
  calculateSectionCost,
  type SectionDepth,
} from "@/lib/credits-shared";
import {
  X, ChevronDown, ChevronUp, Loader2, Package,
  BarChart3, Target, Settings, DollarSign, Trophy, TrendingUp,
  Users, Banknote, AlertTriangle, CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The 10 report sections
const SECTIONS: readonly { id: string; name: string; Icon: LucideIcon }[] = [
  { id: "executive", name: "Executive Summary", Icon: BarChart3 },
  { id: "market", name: "Market & Problem", Icon: Target },
  { id: "product", name: "Product & Technology", Icon: Settings },
  { id: "business", name: "Business Model", Icon: DollarSign },
  { id: "competition", name: "Competition & Moat", Icon: Trophy },
  { id: "traction", name: "Traction & Growth", Icon: TrendingUp },
  { id: "team", name: "Team & Execution", Icon: Users },
  { id: "financial", name: "Financial Projections", Icon: Banknote },
  { id: "risk", name: "Risk Assessment", Icon: AlertTriangle },
  { id: "recommendations", name: "Recommendations", Icon: CheckCircle2 },
];

const DEPTH_KEYS = Object.keys(SECTION_DEPTH_CONFIG) as SectionDepth[];

export type SectionSelection = Array<{ sectionId: string; depth: SectionDepth }>;

interface SectionPickerProps {
  onConfirm: (selections: SectionSelection) => void;
  onClose: () => void;
  credits: number;
  loading?: boolean;
}

const PICKER_STATUS_MESSAGES = [
  "Processing your startup data...",
  "AI agents analyzing selected sections...",
  "Computing benchmarks and scores...",
  "Generating recommendations...",
  "Formatting your report...",
];

export function SectionPicker({ onConfirm, onClose, credits, loading }: SectionPickerProps) {
  const [selections, setSelections] = React.useState<Record<string, SectionDepth>>({});
  const [showBundles, setShowBundles] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(false);
  const [statusIdx, setStatusIdx] = React.useState(0);

  React.useEffect(() => {
    if (!loading) { setStatusIdx(0); return; }
    const timer = setInterval(() => {
      setStatusIdx((i) => (i + 1) % PICKER_STATUS_MESSAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [loading]);

  const toggleSection = (sectionId: string) => {
    setSelections((prev) => {
      if (sectionId in prev) {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }
      return { ...prev, [sectionId]: "standard" };
    });
  };

  const setDepth = (sectionId: string, depth: SectionDepth) => {
    setSelections((prev) => ({ ...prev, [sectionId]: depth }));
  };

  const selectBundle = (depth: SectionDepth) => {
    const bundled: Record<string, SectionDepth> = {};
    for (const s of SECTIONS) {
      bundled[s.id] = depth;
    }
    setSelections(bundled);
    setShowBundles(false);
  };

  const selectAll = () => {
    if (Object.keys(selections).length === SECTIONS.length) {
      setSelections({});
    } else {
      const bundled: Record<string, SectionDepth> = {};
      for (const s of SECTIONS) bundled[s.id] = "standard";
      setSelections(bundled);
    }
  };

  const selectedItems: SectionSelection = Object.entries(selections).map(
    ([sectionId, depth]) => ({ sectionId, depth }),
  );
  const cost = calculateSectionCost(selectedItems);
  const canAfford = cost.totalCredits <= credits;
  const allSelected = Object.keys(selections).length === SECTIONS.length;
  const selectedCount = Object.keys(selections).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — full-height sheet on mobile, centered card on desktop */}
      <div className="relative w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] flex flex-col bg-white sm:rounded-2xl sm:border sm:border-surface-200 sm:shadow-2xl overflow-hidden">

        {/* ── Header (compact on mobile) ─────────────────────────────── */}
        <div className="shrink-0 border-b border-surface-200 px-4 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-4 bg-white">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-brand-600 font-medium">
                Custom Report Builder
              </p>
              <h3 className="text-base sm:text-lg font-bold text-ink-900 mt-0.5 leading-tight">
                Choose Report Sections
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-surface-100 cursor-pointer transition-colors -mt-0.5"
              aria-label="Close"
            >
              <X strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>

          {/* Action row — bundles toggle + select all + count */}
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBundles((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  showBundles
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-300 text-ink-600 hover:border-brand-400",
                )}
              >
                <Package strokeWidth={1.75} className="h-3.5 w-3.5" />
                Bundles
                {showBundles ? <ChevronUp strokeWidth={2} className="h-3 w-3" /> : <ChevronDown strokeWidth={2} className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer transition-colors"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <span className="text-xs text-ink-500 tabular-nums shrink-0">
              {selectedCount}/{SECTIONS.length}
            </span>
          </div>

          {/* Collapsible bundles panel */}
          {showBundles && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(REPORT_BUNDLES).map(([key, bundle]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectBundle(bundle.depth)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer",
                    allSelected &&
                      Object.values(selections).every((d) => d === bundle.depth)
                      ? "border-brand-500 bg-brand-50"
                      : "border-surface-200 hover:border-brand-300",
                  )}
                >
                  <p className="text-xs font-semibold text-ink-800 leading-tight">{bundle.label}</p>
                  <p className="text-[10px] text-ink-500 mt-0.5">{bundle.credits} cr &middot; {bundle.savingsPercent}% off</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Scrollable section list ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 space-y-2">
          {SECTIONS.map((section) => {
            const isSelected = section.id in selections;
            const depth = selections[section.id];

            return (
              <div
                key={section.id}
                className={cn(
                  "rounded-xl border transition-all",
                  isSelected
                    ? "border-brand-500 bg-brand-50/50 shadow-sm"
                    : "border-surface-200 hover:border-brand-300",
                )}
              >
                {/* Section toggle row */}
                <div
                  className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer"
                  onClick={() => toggleSection(section.id)}
                >
                  <section.Icon strokeWidth={1.75} className="h-5 w-5 shrink-0 text-brand-600" />
                  <span className="flex-1 min-w-0 font-medium text-sm sm:text-base text-ink-800 truncate">
                    {section.name}
                  </span>
                  {isSelected && depth && (
                    <span className="text-[10px] sm:text-xs font-mono text-brand-600 shrink-0">
                      {SECTION_DEPTH_CONFIG[depth].credits} cr
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="h-4 w-4 sm:h-5 sm:w-5 rounded border-surface-300 text-brand-600 pointer-events-none shrink-0"
                  />
                </div>

                {/* Depth selector — horizontal scroll on mobile */}
                {isSelected && (
                  <div className="px-3 pb-3 sm:px-4 sm:pb-4 -mt-1">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                      {DEPTH_KEYS.map((d) => {
                        const config = SECTION_DEPTH_CONFIG[d];
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDepth(section.id, d)}
                            className={cn(
                              "shrink-0 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                              depth === d
                                ? "bg-brand-600 text-white"
                                : "bg-surface-100 text-ink-600 hover:bg-surface-200",
                            )}
                          >
                            {config.label}
                            <span className="hidden sm:inline"> ({config.credits})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Depth tier legend — at the bottom of the list, out of the way */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-600 cursor-pointer transition-colors"
            >
              {showLegend ? <ChevronUp strokeWidth={1.75} className="h-3 w-3" /> : <ChevronDown strokeWidth={1.75} className="h-3 w-3" />}
              Depth tier guide
            </button>
            {showLegend && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {DEPTH_KEYS.map((d) => {
                  const config = SECTION_DEPTH_CONFIG[d];
                  return (
                    <div
                      key={d}
                      className="rounded-lg border border-surface-200 bg-surface-50 px-2 py-1.5"
                    >
                      <p className="text-[10px] sm:text-[11px] font-semibold text-ink-800">
                        {config.label}{" "}
                        <span className="font-mono text-ink-500">{config.credits} cr</span>
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-ink-500 mt-0.5 leading-tight">
                        ~{config.words} words
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer (cost + confirm) ────────────────────────────────── */}
        <div className="shrink-0 border-t border-surface-200 bg-ink-950 px-4 sm:px-6 py-3 sm:py-4 safe-pb">
          {/* Bundle recommendation */}
          {cost.bestBundle && (
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-emerald-900/40">
              <Package strokeWidth={1.5} className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] sm:text-xs text-emerald-300">
                <span className="font-semibold">{cost.bestBundle.label}</span> — {cost.bestBundle.credits} cr ({cost.bestBundle.savingsPercent}% off)
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {/* Cost info */}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-2xl font-bold text-white tabular-nums">
                  {cost.totalCredits.toFixed(2)}
                </span>
                <span className="text-xs sm:text-sm text-slate-400">credits</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500">
                <span>~{cost.totalWords.toLocaleString()} words</span>
                <span>&middot;</span>
                <span>Balance: {credits.toFixed(1)}</span>
              </div>
            </div>

            {/* Confirm button */}
            <button
              type="button"
              disabled={!canAfford || selectedItems.length === 0 || loading}
              onClick={() => onConfirm(selectedItems)}
              className={cn(
                "shrink-0 h-10 sm:h-11 px-4 sm:px-6 rounded-xl text-sm font-semibold transition-colors cursor-pointer",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                canAfford && selectedItems.length > 0
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-slate-700 text-slate-400",
              )}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin shrink-0" />
                  <span className="hidden sm:inline text-xs truncate">{PICKER_STATUS_MESSAGES[statusIdx]}</span>
                  <span className="sm:hidden text-xs truncate">{PICKER_STATUS_MESSAGES[statusIdx].slice(0, 20)}...</span>
                </span>
              ) : !canAfford && selectedItems.length > 0 ? (
                <span className="text-xs">Low credits</span>
              ) : selectedItems.length === 0 ? (
                "Select"
              ) : (
                <span>
                  Confirm
                  <span className="hidden sm:inline"> — {cost.totalCredits.toFixed(2)} cr</span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
