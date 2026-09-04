"use client";

// Wave 27C — client component for the notification hub feed at
// /workspace/notifications. Renders filter chips (all / unread / by kind)
// and a scrollable list. "Mark all read" hits the read endpoint with
// { all: true }.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Eye, MessageSquare, Users, Share2, CheckCircle2, TrendingUp, Loader2 } from "lucide-react";
import Link from "next/link";

interface Notification {
  id: number;
  user_id: string;
  project_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

interface ApiResponse {
  ok?: boolean;
  notifications?: Notification[];
  unread_count?: number;
}

type FilterKey = "all" | "unread" | "tbr_view" | "tbr_qa_asked" | "tbr_lead" | "report_shared" | "analysis_done";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "tbr_lead", label: "Leads" },
  { key: "tbr_view", label: "Views" },
  { key: "tbr_qa_asked", label: "Questions" },
  { key: "report_shared", label: "Shared" },
  { key: "analysis_done", label: "Analyses" },
];

const KIND_META: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  tbr_view: { icon: Eye, color: "text-sky-600", label: "Report viewed" },
  tbr_qa_asked: { icon: MessageSquare, color: "text-violet-600", label: "Question asked" },
  tbr_lead: { icon: Users, color: "text-emerald-600", label: "New investor lead" },
  report_shared: { icon: Share2, color: "text-brand-600", label: "Report shared" },
  analysis_done: { icon: CheckCircle2, color: "text-emerald-600", label: "Analysis complete" },
  svi_trend_alert: { icon: TrendingUp, color: "text-amber-600", label: "SVI trend alert" },
};

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function summary(n: Notification): string {
  const p = n.payload ?? {};
  switch (n.kind) {
    case "tbr_view": {
      const country = typeof p.country === "string" ? p.country : null;
      const device = typeof p.device === "string" ? p.device : null;
      const bits = [country, device].filter(Boolean).join(" · ");
      return bits ? `Someone opened your shared report (${bits})` : "Someone opened your shared report";
    }
    case "tbr_qa_asked": {
      const q = typeof p.question === "string" ? p.question : null;
      return q ? `Reader asked: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}"` : "A reader asked a question";
    }
    case "tbr_lead": {
      const name = typeof p.name === "string" ? p.name : null;
      const firm = typeof p.firm === "string" ? p.firm : null;
      const interest = typeof p.interest === "string" ? p.interest : null;
      const label = interest === "ready_to_talk" ? "Ready to talk" : interest === "warm" ? "Warm" : "Exploring";
      const who = [name, firm].filter(Boolean).join(", ") || "An investor";
      return `${who} — ${label}`;
    }
    case "report_shared": {
      return `Report share link minted`;
    }
    case "analysis_done": {
      const cached = p.fromCache === true;
      return cached ? "Analysis complete (from cache)" : "Analysis complete";
    }
    case "svi_trend_alert": {
      return `SVI trend alert`;
    }
    default:
      return n.kind;
  }
}

function actionFor(n: Notification): { href: string; label: string } | null {
  switch (n.kind) {
    case "tbr_view":
    case "tbr_qa_asked":
    case "report_shared":
    case "analysis_done":
      return { href: "/workspace/business-report", label: "View report" };
    case "tbr_lead": {
      const email = typeof n.payload?.email === "string" ? n.payload.email : null;
      return email
        ? { href: `mailto:${email}?subject=${encodeURIComponent("Following up on your interest in our startup")}`, label: "Reply to lead" }
        : { href: "/workspace/business-report", label: "View report" };
    }
    case "svi_trend_alert":
      return { href: "/workspace/svi-trend", label: "Open SVI trend" };
    default:
      return null;
  }
}

export function NotificationFeedClient() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: FilterKey) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (f === "unread") params.set("unread_only", "1");
      else if (f !== "all") params.set("kind", f);
      const res = await fetch(`/api/founder-notifications?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError("Couldn't load notifications.");
        setItems([]);
        return;
      }
      const body = (await res.json()) as ApiResponse;
      setItems(body.notifications ?? []);
    } catch {
      setError("Couldn't load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function markAllRead() {
    if (marking) return;
    setMarking(true);
    try {
      await fetch("/api/founder-notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
        credentials: "same-origin",
      });
      // Optimistic — flip local read_at.
      const now = new Date().toISOString();
      setItems((prev) => (prev ?? []).map((n) => (n.read_at ? n : { ...n, read_at: now })));
    } finally {
      setMarking(false);
    }
  }

  async function markOneRead(id: number) {
    try {
      await fetch("/api/founder-notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
        credentials: "same-origin",
      });
      const now = new Date().toISOString();
      setItems((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    } catch {
      /* ignore */
    }
  }

  const unread = useMemo(() => (items ?? []).filter((n) => !n.read_at).length, [items]);

  return (
    <div>
      {/* Filter chips + mark-all */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                filter === f.key
                  ? "rounded-full px-3 py-1 text-xs font-semibold bg-brand-600 text-white"
                  : "rounded-full px-3 py-1 text-xs font-medium bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ink-500 dark:text-ink-400 tabular-nums">
            {unread} unread
          </span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={marking || unread === 0}
            className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline disabled:text-ink-400 dark:disabled:text-ink-600 disabled:no-underline"
          >
            Mark all read
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-500 dark:text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : (items ?? []).length === 0 ? (
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-8 text-center">
          <Bell className="h-8 w-8 mx-auto text-ink-300 dark:text-ink-600 mb-3" />
          <p className="text-sm text-ink-700 dark:text-ink-200 font-medium">No notifications yet</p>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
            Share your Trusted Business Report to start seeing investor activity here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800 border border-ink-200 dark:border-ink-800 rounded-xl bg-white dark:bg-ink-900 overflow-hidden">
          {(items ?? []).map((n) => {
            const meta = KIND_META[n.kind] ?? { icon: Bell, color: "text-ink-500", label: n.kind };
            const Icon = meta.icon;
            const action = actionFor(n);
            const isUnread = !n.read_at;
            return (
              <li
                key={n.id}
                className={
                  isUnread
                    ? "flex items-start gap-3 p-4 bg-brand-50/40 dark:bg-brand-950/10"
                    : "flex items-start gap-3 p-4"
                }
              >
                <div className={`shrink-0 rounded-full h-8 w-8 flex items-center justify-center bg-ink-100 dark:bg-ink-800 ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-semibold text-ink-800 dark:text-ink-100 truncate">
                      {meta.label}
                    </p>
                    <span className="text-[11px] text-ink-500 dark:text-ink-400 tabular-nums shrink-0">
                      {timeAgo(n.created_at)}
                    </span>
                    {isUnread && (
                      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" aria-label="unread" />
                    )}
                  </div>
                  <p className="text-sm text-ink-700 dark:text-ink-300 mt-0.5 leading-snug">
                    {summary(n)}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {action &&
                      (action.href.startsWith("mailto:") ? (
                        <a
                          href={action.href}
                          onClick={() => void markOneRead(n.id)}
                          className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          {action.label} →
                        </a>
                      ) : (
                        <Link
                          href={action.href}
                          onClick={() => void markOneRead(n.id)}
                          className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          {action.label} →
                        </Link>
                      ))}
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => void markOneRead(n.id)}
                        className="text-xs text-ink-500 dark:text-ink-400 hover:text-ink-800 dark:hover:text-ink-200"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
