"use client";

// T_REPORT_ARCHIVE — displays the founder's generated report history.
//
// Two sections:
//   1. Investor Packs — from investor_pack_shares (with Active/Expired badge +
//      Download PDF button or "Regenerate" hint when expired)
//   2. Assembled Reports — from assembled_reports (tier badge + word count +
//      view link to /workspace/reports/:id)
//
// Props are fetched server-side and passed in; this component has no data
// fetching of its own so it renders instantly with no loading state.

import * as React from "react";
import { Download, FileText, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvestorPackRow {
  id: string;
  share_id: string;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
  download_url: string;
}

export interface AssembledReportRow {
  id: string;
  order_id: string;
  tier: string;
  created_at: string;
  word_count: number;
  startup_name: string;
}

export interface ReportArchiveProps {
  investorPacks: InvestorPackRow[];
  assembledReports: AssembledReportRow[];
  /** When true shows only the last `limit` packs (compact mode for investor-pack page) */
  compact?: boolean;
  limit?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const TIER_STYLES: Record<string, { label: string; className: string }> = {
  standard: {
    label: "Standard",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  premium: {
    label: "Premium",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "investor-memo": {
    label: "Investor Memo",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  preview: {
    label: "Preview",
    className: "bg-slate-50 text-slate-600 border-slate-200",
  },
};

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier] ?? {
    label: tier.charAt(0).toUpperCase() + tier.slice(1),
    className: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

function StatusBadge({ isExpired }: { isExpired: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
        isExpired
          ? "bg-red-50 text-red-600 border-red-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200",
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          isExpired ? "bg-red-500" : "bg-emerald-500",
        )}
      />
      {isExpired ? "Expired" : "Active"}
    </span>
  );
}

// ── Investor Packs section ────────────────────────────────────────────────────

function InvestorPacksSection({
  packs,
}: {
  packs: InvestorPackRow[];
}) {
  if (packs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-200 bg-white px-5 py-8 text-center">
        <FileText
          strokeWidth={1.25}
          className="mx-auto h-8 w-8 text-ink-700 mb-2"
        />
        <p className="text-sm text-ink-600">No investor packs generated yet.</p>
        <p className="text-xs text-ink-700 mt-0.5">
          Generate your first pack from the{" "}
          <a
            href="/workspace/investor-pack"
            className="text-brand-600 hover:underline"
          >
            Investor Pack
          </a>{" "}
          page.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200 bg-surface-50">
            <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Generated
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Expires
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Status
            </th>
            <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {packs.map((pack) => (
            <tr
              key={pack.id}
              className="border-b border-surface-200 last:border-0 hover:bg-surface-50 transition-colors"
            >
              <td className="px-4 py-2.5 text-ink-600 font-mono text-xs whitespace-nowrap">
                {formatDateTime(pack.created_at)}
              </td>
              <td className="px-4 py-2.5 text-ink-700 text-xs whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <Clock strokeWidth={1.5} className="h-3 w-3 text-ink-700" />
                  {formatDate(pack.expires_at)}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge isExpired={pack.is_expired} />
              </td>
              <td className="px-4 py-2.5 text-right">
                {pack.is_expired ? (
                  <a
                    href="/workspace/investor-pack"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw strokeWidth={1.75} className="h-3 w-3" />
                    Regenerate
                  </a>
                ) : (
                  <a
                    href={pack.download_url}
                    download
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <Download strokeWidth={1.75} className="h-3 w-3" />
                    Download PDF
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Assembled Reports section ─────────────────────────────────────────────────

function AssembledReportsSection({
  reports,
}: {
  reports: AssembledReportRow[];
}) {
  if (reports.length === 0) return null;

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200 bg-surface-50">
            <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Startup
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Tier
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Generated
            </th>
            <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              Words
            </th>
            <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-700 font-medium">
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr
              key={report.id}
              className="border-b border-surface-200 last:border-0 hover:bg-surface-50 transition-colors"
            >
              <td className="px-4 py-2.5 text-ink-800 font-medium text-xs max-w-[140px] truncate">
                {report.startup_name}
              </td>
              <td className="px-4 py-2.5">
                <TierBadge tier={report.tier} />
              </td>
              <td className="px-4 py-2.5 text-ink-600 font-mono text-xs whitespace-nowrap">
                {formatDate(report.created_at)}
              </td>
              <td className="px-4 py-2.5 text-right text-ink-700 font-mono text-xs">
                {report.word_count > 0
                  ? report.word_count.toLocaleString("en-AU")
                  : "—"}
              </td>
              <td className="px-4 py-2.5 text-right">
                <a
                  href={`/workspace/reports/${report.order_id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-slate-50 transition-colors"
                >
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReportArchive({
  investorPacks,
  assembledReports,
  compact = false,
  limit = 20,
}: ReportArchiveProps) {
  const displayedPacks = compact
    ? investorPacks.slice(0, limit)
    : investorPacks;
  const hasAssembled = assembledReports.length > 0;

  if (compact) {
    // Compact mode: used on the investor-pack page (last 3 packs, no assembled reports)
    if (displayedPacks.length === 0) return null;
    return (
      <section aria-labelledby="archive-compact-heading" className="mt-4">
        <h2
          id="archive-compact-heading"
          className="text-sm font-semibold text-ink-800 dark:text-slate-100 mb-2"
        >
          Previously generated
        </h2>
        <InvestorPacksSection packs={displayedPacks} />
      </section>
    );
  }

  return (
    <section aria-labelledby="archive-heading" className="mt-10">
      <div className="mb-5">
        <h2
          id="archive-heading"
          className="text-base font-bold text-ink-800"
        >
          Your Generated Reports
        </h2>
        <p className="text-xs text-ink-700 mt-0.5">
          Re-download past investor packs or view assembled SVI reports.
        </p>
      </div>

      {/* Investor Packs */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-700 mb-2">
          Investor Packs
        </h3>
        <InvestorPacksSection packs={displayedPacks} />
        {investorPacks.length > limit && (
          <p className="text-xs text-ink-700 mt-2 text-right">
            Showing latest {limit} of {investorPacks.length} packs.
          </p>
        )}
      </div>

      {/* Assembled Reports (only if they exist) */}
      {hasAssembled && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-700 mb-2">
            Assembled SVI Reports
          </h3>
          <AssembledReportsSection reports={assembledReports} />
        </div>
      )}
    </section>
  );
}
