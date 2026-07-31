"use client";

import * as React from "react";
import {
  ArrowRight,
  BarChart3,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientSummary {
  id: string;
  email: string;
  displayName: string | null;
  startupName: string | null;
  startupStage: string | null;
  svi: number | null;
  lastAnalysisAt: string | null;
  plan: string | null;
}

interface InviteState {
  open: boolean;
  email: string;
  sending: boolean;
  sent: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stageBadge(stage: string | null) {
  const COLORS: Record<string, string> = {
    idea: "bg-purple-100 text-purple-700",
    validated: "bg-blue-100 text-blue-700",
    mvp: "bg-cyan-100 text-cyan-700",
    traction: "bg-green-100 text-green-700",
    revenue: "bg-emerald-100 text-emerald-700",
    growth: "bg-amber-100 text-amber-700",
    scale: "bg-orange-100 text-orange-700",
  };
  const label = stage ?? "unknown";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        COLORS[label] ?? "bg-surface-100 text-ink-500",
      )}
    >
      {label}
    </span>
  );
}

function sviBar(svi: number | null) {
  if (svi === null) return <span className="text-xs text-ink-300">—</span>;
  const pct = Math.min(100, Math.max(0, svi));
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-200 max-w-[80px]">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-ink-700">
        {svi}
      </span>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffDays = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdvisorClient() {
  const [clients, setClients] = React.useState<ClientSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [invite, setInvite] = React.useState<InviteState>({
    open: false,
    email: "",
    sending: false,
    sent: false,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/advisor/clients");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.ok) setClients(json.clients ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendInvite() {
    setInvite((prev) => ({ ...prev, sending: true, error: null }));
    try {
      const res = await fetch("/api/advisor/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite.email }),
      });
      const json = await res.json();
      if (json.ok) {
        setInvite((prev) => ({ ...prev, sending: false, sent: true, email: "" }));
        setTimeout(
          () => setInvite({ open: false, email: "", sending: false, sent: false, error: null }),
          2500,
        );
      } else {
        setInvite((prev) => ({
          ...prev,
          sending: false,
          error: json.error ?? "Failed to send invite",
        }));
      }
    } catch {
      setInvite((prev) => ({
        ...prev,
        sending: false,
        error: "Network error",
      }));
    }
  }

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.displayName ?? "").toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.startupName ?? "").toLowerCase().includes(q)
    );
  });

  const avgSvi =
    clients.filter((c) => c.svi !== null).length > 0
      ? Math.round(
          clients
            .filter((c) => c.svi !== null)
            .reduce((s, c) => s + (c.svi ?? 0), 0) /
            clients.filter((c) => c.svi !== null).length,
        )
      : null;

  const analysedThisMonth = clients.filter((c) => {
    if (!c.lastAnalysisAt) return false;
    const ago =
      (new Date().getTime() - new Date(c.lastAnalysisAt).getTime()) /
      86_400_000;
    return ago <= 30;
  }).length;

  const summaryStats = [
    { icon: Users, label: "Total clients", value: clients.length.toString() },
    {
      icon: TrendingUp,
      label: "Avg SVI score",
      value: avgSvi !== null ? avgSvi.toString() : "—",
    },
    {
      icon: BarChart3,
      label: "Analysed this month",
      value: analysedThisMonth.toString(),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        {summaryStats.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-200 bg-white p-5"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon strokeWidth={1.75} className="h-4 w-4 text-brand-500" />
              <span className="text-xs text-ink-500">{label}</span>
            </div>
            <span className="text-2xl font-bold text-ink-800">{value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-surface-200 bg-white pl-9 pr-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            setInvite((prev) => ({ ...prev, open: true }))
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add client
        </button>
      </div>

      {/* Invite modal */}
      {invite.open && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-bold text-ink-800">
              Invite a client to BlockID
            </h3>
            <button
              type="button"
              onClick={() =>
                setInvite({
                  open: false,
                  email: "",
                  sending: false,
                  sent: false,
                  error: null,
                })
              }
              className="text-ink-400 hover:text-ink-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="founder@startup.com.au"
              value={invite.email}
              onChange={(e) =>
                setInvite((prev) => ({ ...prev, email: e.target.value }))
              }
              className="flex-1 rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              type="button"
              disabled={!invite.email || invite.sending}
              onClick={sendInvite}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              {invite.sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : invite.sent ? (
                "Sent!"
              ) : (
                "Send invite"
              )}
            </button>
          </div>
          {invite.error && (
            <p className="mt-2 text-xs text-red-600">{invite.error}</p>
          )}
        </div>
      )}

      {/* Client table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-surface-200 bg-white p-10 text-center">
          <Users
            strokeWidth={1.5}
            className="h-10 w-10 text-ink-300 mx-auto mb-3"
          />
          <p className="text-sm text-ink-500">
            {search
              ? "No clients match your search."
              : "No clients yet — invite a founder to get started."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Founder
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Stage
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  SVI Score
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Last Analysis
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-50">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-surface-50/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink-800">
                      {c.displayName ?? c.email}
                    </p>
                    {c.startupName && (
                      <p className="text-xs text-ink-400">{c.startupName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {stageBadge(c.startupStage)}
                  </td>
                  <td className="px-4 py-3">{sviBar(c.svi)}</td>
                  <td className="px-4 py-3 text-xs text-ink-400">
                    {formatRelative(c.lastAnalysisAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800"
                    >
                      View
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-400 text-center">
        Advisor portal — manage client startups and track their SVI progress.{" "}
        <Link
          href="/tools"
          className="text-brand-600 hover:underline"
          target="_blank"
          rel="noopener"
        >
          Free tools <ExternalLink className="inline h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}
