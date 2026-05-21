"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  SECTION_DEPTH_CONFIG,
  REPORT_BUNDLES,
  calculateSectionCost,
  type SectionDepth,
} from "@/lib/credits-shared";
import { X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

// The 10 report sections
const SECTIONS = [
  { id: "executive", name: "Executive Summary", icon: "\u{1F4CA}" },
  { id: "market", name: "Market & Problem", icon: "\u{1F3AF}" },
  { id: "product", name: "Product & Technology", icon: "\u2699\uFE0F" },
  { id: "business", name: "Business Model", icon: "\u{1F4B0}" },
  { id: "competition", name: "Competition & Moat", icon: "\u{1F3C6}" },
  { id: "traction", name: "Traction & Growth", icon: "\u{1F4C8}" },
  { id: "team", name: "Team & Execution", icon: "\u{1F465}" },
  { id: "financial", name: "Financial Projections", icon: "\u{1F4B5}" },
  { id: "risk", name: "Risk Assessment", icon: "\u26A0\uFE0F" },
  { id: "recommendations", name: "Recommendations", icon: "\u2705" },
] as const;

export type SectionSelection = Array<{ sectionId: string; depth: SectionDepth }>;

interface SectionPickerProps {
  onConfirm: (selections: SectionSelection) => void;
  onClose: () => void;
  credits: number;
  loading?: boolean;
}

export function SectionPicker({ onConfirm, onClose, credits, loading }: SectionPickerProps) {
  const [selections, setSelections] = React.useState<Record<string, SectionDepth>>({});
  const [expandedTips, setExpandedTips] = React.useState(false);

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
  };

  const selectAll = () => {
    if (Object.keys(selections).length === SECTIONS.length) {
      setSelections({});
    } else {
      selectBundle("standard");
    }
  };

  const selectedItems: SectionSelection = Object.entries(selections).map(
    ([sectionId, depth]) => ({ sectionId, depth }),
  );
  const cost = calculateSectionCost(selectedItems);
  const canAfford = cost.totalCredits <= credits;
  const allSelected = Object.keys(selections).length === SECTIONS.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-surface-200 px-6 pt-6 pb-4 rounded-t-2xl">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-brand-600 font-medium">
                Custom Report Builder
              </p>
              <h3 className="text-lg font-bold text-ink-900 mt-1">
                Choose Your Report Sections
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-surface-100 cursor-pointer transition-colors"
              aria-label="Close"
            >
              <X strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-ink-500">
            Select sections and depth. Pay only for what you need.
          </p>

          {/* Bundle quick-select buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(REPORT_BUNDLES).map(([key, bundle]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectBundle(bundle.depth)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  allSelected &&
                    Object.values(selections).every((d) => d === bundle.depth)
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-300 bg-white text-ink-600 hover:border-brand-400 hover:text-brand-700",
                )}
              >
                {bundle.label} — {bundle.credits} cr ({bundle.savingsPercent}% off)
              </button>
            ))}
          </div>

          {/* Depth tier legend (collapsible) */}
          <button
            type="button"
            onClick={() => setExpandedTips((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700 cursor-pointer transition-colors"
          >
            {expandedTips ? (
              <ChevronUp strokeWidth={1.75} className="h-3 w-3" />
            ) : (
              <ChevronDown strokeWidth={1.75} className="h-3 w-3" />
            )}
            What do the depth tiers mean?
          </button>
          {expandedTips && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(
                Object.entries(SECTION_DEPTH_CONFIG) as [
                  SectionDepth,
                  (typeof SECTION_DEPTH_CONFIG)[SectionDepth],
                ][]
              ).map(([d, config]) => (
                <div
                  key={d}
                  className="rounded-lg border border-surface-200 bg-surface-50 px-2.5 py-2"
                >
                  <p className="text-[11px] font-semibold text-ink-800">
                    {config.label}{" "}
                    <span className="font-mono text-ink-500">
                      {config.credits} cr
                    </span>
                  </p>
                  <p className="text-[10px] text-ink-500 mt-0.5">
                    ~{config.words} words — {config.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Select all toggle */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer transition-colors"
            >
              {allSelected ? "Deselect All" : "Select All (10 sections)"}
            </button>
            <span className="text-xs text-ink-500">
              {Object.keys(selections).length} / {SECTIONS.length} selected
            </span>
          </div>
        </div>

        {/* Section grid */}
        <div className="px-6 py-4 space-y-3">
          {SECTIONS.map((section) => {
            const isSelected = section.id in selections;
            const depth = selections[section.id];

            return (
              <div
                key={section.id}
                className={cn(
                  "rounded-xl border p-4 transition-all",
                  isSelected
                    ? "border-brand-500 bg-brand-50/50 shadow-sm"
                    : "border-surface-200 hover:border-brand-300",
                )}
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection(section.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{section.icon}</span>
                    <div>
                      <span className="font-medium text-ink-800">
                        {section.name}
                      </span>
                      {isSelected && depth && (
                        <span className="ml-2 text-xs font-mono text-brand-600">
                          {SECTION_DEPTH_CONFIG[depth].credits} cr
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="h-5 w-5 rounded border-surface-300 text-brand-600 pointer-events-none"
                  />
                </div>

                {/* Depth selector (only when selected) */}
                {isSelected && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      Object.entries(SECTION_DEPTH_CONFIG) as [
                        SectionDepth,
                        (typeof SECTION_DEPTH_CONFIG)[SectionDepth],
                      ][]
                    ).map(([d, config]) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDepth(section.id, d)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                          depth === d
                            ? "bg-brand-600 text-white"
                            : "bg-surface-100 text-ink-600 hover:bg-surface-200",
                        )}
                      >
                        {config.label} ({config.credits} cr)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Cost summary — sticky bottom */}
        <div className="sticky bottom-0 border-t border-surface-200 bg-ink-950 px-6 py-4 rounded-b-2xl">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm text-slate-400">Total cost</span>
              <span className="block text-2xl font-bold text-white">
                {cost.totalCredits.toFixed(2)} credits
              </span>
              <span className="text-xs text-slate-500">
                ~{cost.totalWords.toLocaleString()} words
              </span>
            </div>
            {cost.bestBundle && (
              <div className="text-right">
                <span className="text-xs text-emerald-400">
                  Bundle available!
                </span>
                <span className="block text-sm font-semibold text-emerald-300">
                  {cost.bestBundle.label}: {cost.bestBundle.credits} credits (
                  {cost.bestBundle.savingsPercent}% off)
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-400">
              Your balance: {credits.toFixed(1)} credits
            </span>
            <button
              type="button"
              disabled={
                !canAfford ||
                selectedItems.length === 0 ||
                loading
              }
              onClick={() => onConfirm(selectedItems)}
              className={cn(
                "h-10 px-6 rounded-xl text-sm font-semibold transition-colors cursor-pointer",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                canAfford && selectedItems.length > 0
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-slate-700 text-slate-400",
              )}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                  Analyzing...
                </span>
              ) : !canAfford && selectedItems.length > 0 ? (
                "Not enough credits"
              ) : selectedItems.length === 0 ? (
                "Select sections"
              ) : (
                `Confirm — ${cost.totalCredits.toFixed(2)} credits`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
