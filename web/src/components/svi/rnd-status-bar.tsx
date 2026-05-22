"use client";

import React from "react";
import { cn } from "@/lib/utils";

/* ── Step metadata — icon + label for each SSE step ─────────────────── */
const STEP_META: Record<string, { icon: string; label: string }> = {
  detecting:          { icon: "🔍", label: "Analyzing input type" },
  scraping:           { icon: "🌐", label: "Scraping website data" },
  scraped:            { icon: "📄", label: "Website data collected" },
  scrape_failed:      { icon: "⚠️", label: "Scrape skipped" },
  tech_audit_complete:{ icon: "🛡️", label: "Tech audit complete" },
  svi:                { icon: "📊", label: "Computing SVI score" },
  svi_complete:       { icon: "✅", label: "SVI score computed" },
  rnd_start:          { icon: "🧪", label: "AI research streams" },
  rnd_progress:       { icon: "🤖", label: "Generating report" },
  persisting:         { icon: "💾", label: "Saving your report" },
};

export interface StatusEntry {
  step: string;
  message: string;
  ts: number;
}

interface RndStatusBarProps {
  entries: StatusEntry[];
  isActive: boolean;
}

/* ── Animated search globe icon ─────────────────────────────────────── */
function SearchGlobe() {
  return (
    <div className="relative h-5 w-5 shrink-0">
      {/* Outer rotating ring */}
      <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" style={{ animationDuration: "3s" }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 40" className="text-brand-400" />
      </svg>
      {/* Inner search icon */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 h-5 w-5 text-brand-600">
        <circle cx="11" cy="11" r="6" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </div>
  );
}

/* ── Animated dots "..." ────────────────────────────────────────────── */
function AnimatedDots() {
  return (
    <span className="inline-flex gap-0.5 ml-0.5">
      <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

/* ── Check icon for completed steps ─────────────────────────────────── */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-emerald-500 shrink-0">
      <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RndStatusBar({ entries, isActive }: RndStatusBarProps) {
  const [expanded, setExpanded] = React.useState(true);

  if (!isActive || entries.length === 0) return null;

  const current = entries[entries.length - 1];
  const completed = entries.slice(0, -1);
  const meta = STEP_META[current.step];

  return (
    <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-2xl border border-brand-200/70 bg-gradient-to-b from-brand-50/80 to-white overflow-hidden shadow-sm">
        {/* Active status header */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/50 transition-colors cursor-pointer"
        >
          <SearchGlobe />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-brand-700">
                Searching & analyzing
              </span>
              <AnimatedDots />
            </div>
            <p className="text-xs text-brand-600/80 mt-0.5 truncate">
              {current.message}
            </p>
          </div>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={cn(
              "h-3.5 w-3.5 text-brand-400 transition-transform duration-200 shrink-0",
              expanded ? "rotate-180" : "",
            )}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>

        {/* Completed steps list (collapsible) */}
        {expanded && completed.length > 0 && (
          <div className="border-t border-brand-100/60 px-4 py-2 space-y-1.5 bg-white/60">
            {completed.map((entry, i) => {
              const eMeta = STEP_META[entry.step];
              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 animate-in fade-in slide-in-from-left-2 duration-200"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <CheckIcon />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-ink-600">
                      {eMeta?.icon ?? "•"} {eMeta?.label ?? entry.step}
                    </span>
                    <p className="text-[11px] text-ink-500 truncate leading-tight mt-0.5">
                      {entry.message}
                    </p>
                  </div>
                  <span className="text-[10px] text-ink-400 tabular-nums shrink-0 mt-0.5">
                    {formatElapsed(entries[0].ts, entry.ts)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Current active step with pulsing indicator */}
        {expanded && (
          <div className="border-t border-brand-100/60 px-4 py-2.5 bg-brand-50/30">
            <div className="flex items-start gap-2.5">
              <span className="relative flex h-3.5 w-3.5 mt-0.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-500" />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-brand-700">
                  {meta?.icon ?? "🔄"} {meta?.label ?? current.step}
                </span>
                <p className="text-[11px] text-brand-600 mt-0.5 leading-snug">
                  {current.message}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function formatElapsed(startTs: number, currentTs: number): string {
  const diff = Math.round((currentTs - startTs) / 1000);
  if (diff < 1) return "<1s";
  return `${diff}s`;
}
