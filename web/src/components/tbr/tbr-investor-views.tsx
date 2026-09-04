"use client";

// Wave 26A — founder-facing "Investor Views" panel embedded in the TBR.
// Fetches /api/svi/report/views?projectId=<pid>. Anonymised — country +
// device only. Never renders raw IPs.

import { useEffect, useState } from "react";
import { Eye, Globe, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Totals {
  views: number;
  uniqueCountries: number;
  totalReadMs: number;
  firstAt: string | null;
  lastAt: string | null;
}

interface RecentView {
  viewedAt: string;
  country: string | null;
  device: string;
  readSeconds: number;
}

interface Props {
  projectId: string;
}

// Minimal ISO-3166-alpha-2 → flag emoji converter. Country is null when the
// upstream Cloudflare `cf-ipcountry` header isn't present.
function countryFlag(cc: string | null): string {
  if (!cc || cc.length !== 2) return "🌐";
  const base = 0x1f1e6;
  const codePoints = [...cc.toUpperCase()].map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (!Number.isFinite(diff)) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function TbrInvestorViews({ projectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasShareToken, setHasShareToken] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [recent, setRecent] = useState<RecentView[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/svi/report/views?projectId=${encodeURIComponent(projectId)}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          if (!cancelled) setError("fetch_failed");
          return;
        }
        const body = (await res.json()) as {
          ok?: boolean;
          hasShareToken?: boolean;
          totals?: Totals | null;
          recent?: RecentView[];
        };
        if (cancelled) return;
        if (!body.ok) {
          setError("fetch_failed");
          return;
        }
        setHasShareToken(!!body.hasShareToken);
        setTotals(body.totals ?? null);
        setRecent(body.recent ?? []);
      } catch {
        if (!cancelled) setError("network");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">Loading investor view analytics…</p>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Couldn&apos;t load view analytics right now.
      </p>
    );
  }
  if (!hasShareToken) {
    // Section is only rendered when a shareToken exists, so this is a safety net.
    return null;
  }
  if (!totals) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        No investor views yet. Share your <code className="text-xs">/tbr/&lt;token&gt;</code> link
        to start tracking.
      </p>
    );
  }

  const readMinutes = Math.round(totals.totalReadMs / 60_000);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 dark:text-ink-400">
        Anonymised open events on your shared /tbr link. Country and device class only — no PII
        leaves the server.
      </p>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Eye} label="Total views" value={String(totals.views)} />
        <StatCard
          icon={Globe}
          label="Countries"
          value={totals.uniqueCountries > 0 ? String(totals.uniqueCountries) : "—"}
        />
        <StatCard
          icon={Clock}
          label="Total read time"
          value={readMinutes > 0 ? `${readMinutes}m` : "—"}
        />
        <StatCard
          icon={Users}
          label="Last view"
          value={totals.lastAt ? relTime(totals.lastAt) : "—"}
        />
      </div>

      {/* Recent list */}
      {recent.length > 0 && (
        <div className="rounded-lg border border-ink-200 dark:border-ink-800 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-ink-50 dark:bg-ink-900/60 text-[10px] uppercase tracking-wide font-semibold text-ink-500 dark:text-ink-400">
            <span>When</span>
            <span>From</span>
            <span>Device</span>
            <span className="text-right">Read</span>
          </div>
          <ul>
            {recent.map((v, i) => (
              <li
                key={`${v.viewedAt}-${i}`}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-xs items-center border-t border-ink-100 dark:border-ink-800/60",
                )}
              >
                <span className="text-ink-500 dark:text-ink-400 tabular-nums">
                  {relTime(v.viewedAt)}
                </span>
                <span className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
                  <span className="text-base leading-none" aria-hidden="true">
                    {countryFlag(v.country)}
                  </span>
                  <span>{v.country ?? "Unknown"}</span>
                </span>
                <span className="text-ink-500 dark:text-ink-400 capitalize">{v.device}</span>
                <span className="text-right tabular-nums text-ink-700 dark:text-ink-200 font-medium">
                  {fmtDuration(v.readSeconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-900/40 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-semibold text-ink-500 dark:text-ink-400">
        <Icon className="h-3 w-3" aria-hidden={true} />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold text-ink-800 dark:text-ink-100 tabular-nums">{value}</p>
    </div>
  );
}
