"use client";

// Nav bell. T0245 repointed it from the legacy `notifications` table
// (/api/notifications — email/toast messages) to the founder activity feed
// (`founder_notifications`, /api/founder-notifications) so Money Radar
// alerts (grant_deadline · program_intake · event_match · new_matches …)
// show where founders look. The legacy endpoint stays as a fallback when
// the founder feed is unavailable (404 / 5xx / network), so nothing that
// still writes to `notifications` goes dark.
//
//   badge : GET /api/founder-notifications?count_only=1   → { unread_count }
//   list  : GET /api/founder-notifications?limit=20       → { notifications, unread_count }
//   read  : POST /api/founder-notifications/read { ids | all }
//
// Pure helpers (`normaliseFounderRows`, `normaliseLegacyRows`, `loadBell`)
// are exported for the colocated test.

import * as React from "react";
import { Bell, X, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KIND_LABELS,
  describeNotification,
  notificationAction,
  isNotificationKind,
  type FounderNotificationRow,
} from "@/lib/notification-kinds";

export interface BellItem {
  id: string;
  /** "founder" rows mark read via /api/founder-notifications/read; "legacy" via /api/notifications/:id/read. */
  source: "founder" | "legacy";
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

interface LegacyRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export function normaliseFounderRows(rows: FounderNotificationRow[]): BellItem[] {
  return rows.map((n) => ({
    id: String(n.id),
    source: "founder",
    type: n.kind,
    title: isNotificationKind(n.kind) ? KIND_LABELS[n.kind] : n.kind,
    body: describeNotification(n),
    href: notificationAction(n)?.href ?? null,
    read: Boolean(n.read_at),
    created_at: n.created_at,
  }));
}

export function normaliseLegacyRows(rows: LegacyRow[]): BellItem[] {
  return rows.map((n) => ({
    id: String(n.id),
    source: "legacy",
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    href: null,
    read: Boolean(n.read),
    created_at: n.created_at,
  }));
}

export interface BellState {
  items: BellItem[];
  unreadCount: number;
  source: "founder" | "legacy" | "none";
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Founder feed first (badge + list in one round-trip), legacy on failure.
 * Never throws — an empty bell is the failure mode.
 */
export async function loadBell(fetchFn: FetchLike = fetch): Promise<BellState> {
  try {
    const res = await fetchFn("/api/founder-notifications?limit=20", { credentials: "same-origin" });
    if (res.ok) {
      const d = (await res.json()) as { notifications?: FounderNotificationRow[]; unread_count?: number };
      return {
        items: normaliseFounderRows(d.notifications ?? []),
        unreadCount: typeof d.unread_count === "number" ? d.unread_count : 0,
        source: "founder",
      };
    }
    if (res.status === 401) return { items: [], unreadCount: 0, source: "none" };
  } catch {
    /* fall through to legacy */
  }
  try {
    const res = await fetchFn("/api/notifications", { credentials: "same-origin" });
    if (!res.ok) return { items: [], unreadCount: 0, source: "none" };
    const d = (await res.json()) as { notifications?: LegacyRow[]; unreadCount?: number };
    return {
      items: normaliseLegacyRows(d.notifications ?? []),
      unreadCount: typeof d.unreadCount === "number" ? d.unreadCount : 0,
      source: "legacy",
    };
  } catch {
    return { items: [], unreadCount: 0, source: "none" };
  }
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<BellItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [source, setSource] = React.useState<BellState["source"]>("none");
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    void loadBell().then((s) => {
      if (cancelled) return;
      setNotifications(s.items);
      setUnreadCount(s.unreadCount);
      setSource(s.source);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markRead(item: BellItem) {
    try {
      if (item.source === "founder") {
        await fetch("/api/founder-notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [Number(item.id)] }),
          credentials: "same-origin",
        });
      } else {
        await fetch(`/api/notifications/${item.id}/read`, { method: "POST" });
      }
    } catch {
      /* optimistic below */
    }
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    try {
      if (source === "founder") {
        await fetch("/api/founder-notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ all: true }),
          credentials: "same-origin",
        });
      } else {
        await fetch("/api/notifications/read-all", { method: "POST" });
      }
    } catch {
      /* optimistic below */
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell strokeWidth={1.75} className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-surface-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 bg-surface-50">
            <span className="text-sm font-semibold text-ink-800">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-brand-600 transition-colors"
                >
                  <CheckCheck className="h-3 w-3" />
                  All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="ml-2 text-ink-400 hover:text-ink-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-surface-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-400">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={`${n.source}:${n.id}`}
                  className={cn(
                    "px-4 py-3 cursor-pointer hover:bg-surface-50 transition-colors",
                    !n.read && "bg-brand-50 hover:bg-brand-50/80",
                  )}
                  onClick={() => !n.read && markRead(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
                    )}
                    <div className={cn("min-w-0", n.read && "pl-3.5")}>
                      <p className="text-xs font-semibold text-ink-800 leading-snug">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-ink-500 mt-0.5 leading-snug">{n.body}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-ink-400">
                          {new Date(n.created_at).toLocaleDateString()}
                        </p>
                        {n.href && (
                          <a
                            href={n.href}
                            target={n.href.startsWith("http") ? "_blank" : undefined}
                            rel={n.href.startsWith("http") ? "noreferrer" : undefined}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-semibold text-brand-600 hover:underline"
                          >
                            Open →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {source === "founder" && (
            <div className="border-t border-surface-100 bg-surface-50 px-4 py-2 text-center">
              <a href="/workspace/notifications" className="text-[11px] font-semibold text-brand-600 hover:underline">
                All notifications
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
