import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/brand/logo";
import { ArrowLeft, Shield, Bell, Mail, MailOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "Notifications — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type NotificationType = "welcome" | "weekly_report" | "milestone" | "score_dropped" | "inactive";

const NOTIFICATION_TYPES: NotificationType[] = [
  "welcome",
  "weekly_report",
  "milestone",
  "score_dropped",
  "inactive",
];

const TYPE_LABELS: Record<NotificationType, string> = {
  welcome: "Welcome",
  weekly_report: "Weekly Report",
  milestone: "Milestone",
  score_dropped: "Score Dropped",
  inactive: "Inactive",
};

const TYPE_COLORS: Record<NotificationType, string> = {
  welcome: "bg-emerald-100 text-emerald-700",
  weekly_report: "bg-blue-100 text-blue-700",
  milestone: "bg-purple-100 text-purple-700",
  score_dropped: "bg-red-100 text-red-700",
  inactive: "bg-gray-100 text-gray-700",
};

interface NotificationRow {
  id: string;
  account_email: string;
  notification_type: NotificationType;
  subject: string;
  sent_at: string;
  opened_at: string | null;
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/notifications");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();

  let totalSent = 0;
  let totalOpened = 0;
  const typeCounts: Record<NotificationType, { sent: number; opened: number }> = {
    welcome: { sent: 0, opened: 0 },
    weekly_report: { sent: 0, opened: 0 },
    milestone: { sent: 0, opened: 0 },
    score_dropped: { sent: 0, opened: 0 },
    inactive: { sent: 0, opened: 0 },
  };
  let recentNotifications: NotificationRow[] = [];

  if (supabase) {
    // Fetch counts by type
    const countPromises = NOTIFICATION_TYPES.map(async (type) => {
      const [sentRes, openedRes] = await Promise.all([
        supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true })
          .eq("notification_type", type),
        supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true })
          .eq("notification_type", type)
          .not("opened_at", "is", null),
      ]);
      return {
        type,
        sent: sentRes.count ?? 0,
        opened: openedRes.count ?? 0,
      };
    });

    const counts = await Promise.all(countPromises);
    for (const c of counts) {
      typeCounts[c.type] = { sent: c.sent, opened: c.opened };
      totalSent += c.sent;
      totalOpened += c.opened;
    }

    // Fetch recent notifications
    const recentRes = await supabase
      .from("svi_notifications")
      .select("id, account_email, notification_type, subject, sent_at, opened_at")
      .order("sent_at", { ascending: false })
      .limit(50);

    recentNotifications = (recentRes.data ?? []) as NotificationRow[];
  }

  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0.0";

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
            NOTIFICATIONS
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Overview stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-surface-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-4 w-4 text-ink-400" />
              <p className="text-xs text-ink-500">Total Sent</p>
            </div>
            <p className="text-2xl font-bold">{totalSent.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <MailOpen className="h-4 w-4 text-ink-400" />
              <p className="text-xs text-ink-500">Total Opened</p>
            </div>
            <p className="text-2xl font-bold">{totalOpened.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-4 w-4 text-ink-400" />
              <p className="text-xs text-ink-500">Open Rate</p>
            </div>
            <p className="text-2xl font-bold">{openRate}%</p>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-4 w-4 text-ink-400" />
              <p className="text-xs text-ink-500">Types Active</p>
            </div>
            <p className="text-2xl font-bold">
              {NOTIFICATION_TYPES.filter((t) => typeCounts[t].sent > 0).length}
            </p>
          </div>
        </section>

        {/* Stats by type */}
        <section>
          <h2 className="text-lg font-semibold mb-4">By Notification Type</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {NOTIFICATION_TYPES.map((type) => {
              const c = typeCounts[type];
              const rate = c.sent > 0 ? ((c.opened / c.sent) * 100).toFixed(1) : "0.0";
              return (
                <div key={type} className="bg-white border border-surface-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${TYPE_COLORS[type]}`}>
                      {TYPE_LABELS[type]}
                    </span>
                    <span className="text-xs text-ink-500">{rate}% opened</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <p className="text-xl font-bold">{c.sent.toLocaleString()}</p>
                      <p className="text-xs text-ink-500">sent</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{c.opened.toLocaleString()}</p>
                      <p className="text-xs text-ink-500">opened</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent notifications */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent Notifications (Last 50)</h2>
          {recentNotifications.length === 0 ? (
            <div className="bg-white border border-surface-200 rounded-lg p-8 text-center text-ink-500 text-sm">
              No notifications found.
            </div>
          ) : (
            <div className="bg-white border border-surface-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="text-left px-4 py-2.5 font-medium text-ink-600">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium text-ink-600">Type</th>
                    <th className="text-left px-4 py-2.5 font-medium text-ink-600">Subject</th>
                    <th className="text-left px-4 py-2.5 font-medium text-ink-600">Sent</th>
                    <th className="text-left px-4 py-2.5 font-medium text-ink-600">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {recentNotifications.map((n) => (
                    <tr key={n.id} className="border-b border-surface-100 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-600 max-w-[180px] truncate">
                        {n.account_email}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${TYPE_COLORS[n.notification_type] ?? "bg-gray-100 text-gray-700"}`}>
                          {TYPE_LABELS[n.notification_type] ?? n.notification_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-700 max-w-[250px] truncate">{n.subject}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-500 whitespace-nowrap">
                        {new Date(n.sent_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        {n.opened_at ? (
                          <span className="text-emerald-600">
                            {new Date(n.opened_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        ) : (
                          <span className="text-ink-400">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
