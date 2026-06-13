"use client";

import * as React from "react";
import { Bell, X, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? []);
        setUnreadCount(d.unreadCount ?? 0);
      })
      .catch(() => {});
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

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
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
                  key={n.id}
                  className={cn(
                    "px-4 py-3 cursor-pointer hover:bg-surface-50 transition-colors",
                    !n.read && "bg-brand-50 hover:bg-brand-50/80",
                  )}
                  onClick={() => !n.read && markRead(n.id)}
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
                      <p className="text-[10px] text-ink-400 mt-1">
                        {new Date(n.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
