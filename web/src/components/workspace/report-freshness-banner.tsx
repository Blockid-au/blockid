"use client";

// ReportFreshnessBanner — AF13 (2026-09-25). The workspace report page shows
// the project's saved report; a founder who has just run /analyze could read
// it as the new result. This line says WHEN the report on screen is from, and
// points at a newer /analyze run when one exists (the full project link is
// G34 DC01 — `analyses` has no project yet, so this is by account + date).

import * as React from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { savedAnalysisPath } from "@/lib/analyses/summary";

export interface AnalysisListItem {
  id: string;
  created_at: string;
  input_filename?: string | null;
  input_url?: string | null;
  full_report_status?: string | null;
}

/** The newest /analyze run strictly newer than the report on screen, or null. Pure — exported for the test. */
export function newerAnalysis(list: AnalysisListItem[], asOf: string | null): AnalysisListItem | null {
  const asOfMs = asOf ? Date.parse(asOf) : Number.NaN;
  if (!Number.isFinite(asOfMs)) return null;
  let best: AnalysisListItem | null = null;
  let bestMs = asOfMs;
  for (const a of list) {
    const t = Date.parse(a.created_at);
    if (Number.isFinite(t) && t > bestMs) {
      best = a;
      bestMs = t;
    }
  }
  return best;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ReportFreshnessBanner({ asOf, newer }: { asOf: string | null; newer: AnalysisListItem | null }) {
  if (!asOf) return null;
  const label = newer?.input_filename || newer?.input_url || "your latest input";
  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-1 rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary print:hidden"
      data-testid="tbr-report-freshness"
    >
      <p className="flex items-center gap-2 text-primary">
        <CalendarClock aria-hidden strokeWidth={1.75} className="h-4 w-4 shrink-0 text-tertiary" />
        <span>
          Report as of <span className="font-mono tabular-nums">{fmt(asOf)}</span>
        </span>
      </p>
      {newer && (
        <p data-testid="tbr-report-newer">
          You have a newer analysis from <span className="font-mono tabular-nums">{fmt(newer.created_at)}</span> ({label}).{" "}
          <Link href={savedAnalysisPath(newer.id)} className="font-medium text-action underline-offset-2 hover:underline">
            Open the newer analysis
          </Link>
        </p>
      )}
    </div>
  );
}

export default ReportFreshnessBanner;
