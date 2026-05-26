"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────────── */

export interface Competitor {
  name: string;
  url: string;
  focus: string;
  pricing: string;
  target: string;
  geo: string;
  freeTier: boolean;
  hasScoring: boolean;
  hasValuation: boolean;
  hasCapTable: boolean;
  hasFundraising: boolean;
  hasAI: boolean;
  hasTokenization: boolean;
  hasCompliance: boolean;
  weakness: string;
}

const FEATURE_COLS: { key: keyof Competitor; label: string }[] = [
  { key: "hasScoring", label: "Scoring" },
  { key: "hasValuation", label: "Valuation" },
  { key: "hasCapTable", label: "Cap Table" },
  { key: "hasFundraising", label: "Fundraise" },
  { key: "hasAI", label: "AI" },
  { key: "hasTokenization", label: "Token" },
  { key: "hasCompliance", label: "Compliance" },
];

const TOTAL_FEATURES = FEATURE_COLS.length;

function countFeatures(c: Competitor): number {
  return FEATURE_COLS.reduce((sum, col) => sum + (c[col.key] ? 1 : 0), 0);
}

/* ── Table component ──────────────────────────────────────────────────── */

export function CompetitorsTable({ competitors }: { competitors: Competitor[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleRow(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider sticky left-0 bg-surface-50 z-10 min-w-[160px]">
                Platform
              </th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider min-w-[140px]">
                Focus
              </th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider min-w-[100px]">
                Pricing
              </th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider min-w-[90px]">
                Geo
              </th>
              <th className="text-center px-2 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider">
                Free
              </th>
              {FEATURE_COLS.map((col) => (
                <th key={col.key} className="text-center px-2 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              <th className="text-center px-3 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider">
                Total
              </th>
              <th className="px-3 py-3 text-xs font-semibold text-ink-600 uppercase tracking-wider min-w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp) => {
              const isBlockID = comp.name === "BlockID.au";
              const isOpen = expanded.has(comp.name);
              const featureCount = countFeatures(comp);

              const rowBg = isBlockID
                ? "bg-brand-50/60 border-b border-brand-100"
                : "border-b border-surface-200/60 hover:bg-surface-50/50";

              const stickyBg = isBlockID
                ? "bg-brand-50/60"
                : "bg-white group-hover:bg-surface-50/50";

              return (
                <CompetitorRowGroup
                  key={comp.name}
                  comp={comp}
                  isBlockID={isBlockID}
                  isOpen={isOpen}
                  featureCount={featureCount}
                  rowBg={rowBg}
                  stickyBg={stickyBg}
                  onToggle={() => toggleRow(comp.name)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Row group ────────────────────────────────────────────────────────── */

function CompetitorRowGroup({
  comp,
  isBlockID,
  isOpen,
  featureCount,
  rowBg,
  stickyBg,
  onToggle,
}: {
  comp: Competitor;
  isBlockID: boolean;
  isOpen: boolean;
  featureCount: number;
  rowBg: string;
  stickyBg: string;
  onToggle: () => void;
}) {
  const colSpan = FEATURE_COLS.length + 6;

  return (
    <>
      {/* Main row */}
      <tr
        className={`group cursor-pointer ${rowBg} ${isBlockID ? "font-medium" : ""}`}
        onClick={onToggle}
      >
        {/* Name */}
        <td className={`px-4 py-3 sticky left-0 z-10 ${stickyBg}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isBlockID ? "text-brand-700 font-bold" : "text-ink-800 font-semibold"}`}>
              {comp.name}
            </span>
            <a
              href={`https://${comp.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-400 hover:text-brand-600 transition-colors"
              aria-label={`Visit ${comp.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
            </a>
          </div>
          <p className="text-[10px] text-ink-500 mt-0.5">{comp.target}</p>
        </td>

        {/* Focus */}
        <td className="px-3 py-3 text-xs text-ink-700 leading-snug">{comp.focus}</td>

        {/* Pricing */}
        <td className="px-3 py-3">
          <span className={`text-xs font-mono ${isBlockID ? "text-brand-700 font-bold" : "text-ink-700"}`}>
            {comp.pricing}
          </span>
        </td>

        {/* Geo */}
        <td className="px-3 py-3 text-xs text-ink-600">{comp.geo}</td>

        {/* Free Tier */}
        <td className="px-2 py-3 text-center">
          <FeatureIcon has={comp.freeTier} />
        </td>

        {/* Feature columns */}
        {FEATURE_COLS.map((col) => (
          <td key={col.key} className="px-2 py-3 text-center">
            <FeatureIcon has={comp[col.key] as boolean} />
          </td>
        ))}

        {/* Total */}
        <td className="px-3 py-3 text-center">
          <span
            className={`text-xs font-bold font-mono ${
              featureCount === TOTAL_FEATURES
                ? "text-brand-700"
                : featureCount >= 3
                  ? "text-amber-600"
                  : "text-ink-500"
            }`}
          >
            {featureCount}/{TOTAL_FEATURES}
          </span>
        </td>

        {/* Expand icon */}
        <td className="px-3 py-3 text-center">
          <span className="inline-flex text-ink-400 group-hover:text-ink-600 transition-colors">
            {isOpen ? (
              <ChevronUp strokeWidth={1.75} className="h-4 w-4" />
            ) : (
              <ChevronDown strokeWidth={1.75} className="h-4 w-4" />
            )}
          </span>
        </td>
      </tr>

      {/* Expandable weakness row */}
      {isOpen && (
        <tr className={isBlockID ? "bg-brand-50/40" : "bg-surface-50"}>
          <td colSpan={colSpan} className="px-6 py-3 text-xs text-ink-700">
            <strong className="text-ink-800">Key weakness:</strong> {comp.weakness}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */

function FeatureIcon({ has }: { has: boolean }) {
  return has ? (
    <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 p-1">
      <Check strokeWidth={2.5} className="h-3 w-3 text-emerald-600" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center rounded-full bg-red-50 p-1">
      <X strokeWidth={2.5} className="h-3 w-3 text-red-400" />
    </span>
  );
}
