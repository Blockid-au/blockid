"use client";

import Link from "next/link";
import {
  BarChart3,
  Bell,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";

interface SviAccount {
  email: string;
  startup_name: string | null;
  current_svi: number;
  current_stage: number;
  plan: string;
  enrolled_at: string;
}

interface RecentAnalysis {
  email: string;
  total_svi: number;
  created_at: string;
}

interface AdminDashboardClientProps {
  user: { email: string; displayName?: string | null };
  stats: { users: number; analyses: number; accounts: number; notifications: number };
  sviAccounts: SviAccount[];
  recentAnalyses: RecentAnalysis[];
}

export function AdminDashboardClient({
  user,
  stats,
  sviAccounts,
  recentAnalyses,
}: AdminDashboardClientProps) {
  return (
    <AdminLayout user={user}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">BlockID Admin</h1>
          <p className="text-sm text-ink-700 mt-1">
            Manage users, SVI accounts, and system configuration.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "App Users",
              value: stats.users,
              icon: Users,
              color: "text-brand-600",
            },
            {
              label: "SVI Analyses",
              value: stats.analyses,
              icon: FileText,
              color: "text-teal-400",
            },
            {
              label: "SVI Accounts",
              value: stats.accounts,
              icon: TrendingUp,
              color: "text-green-400",
            },
            {
              label: "Notifications Sent",
              value: stats.notifications,
              icon: Bell,
              color: "text-amber-400",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium">
                  {label}
                </p>
                <Icon strokeWidth={1.75} className={`h-4 w-4 ${color}`} />
              </div>
              <p className="text-3xl font-bold font-mono text-ink-800">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* SVI Accounts Table */}
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">
              SVI Accounts
            </h2>
            <span className="text-xs text-ink-700">
              {sviAccounts.length} accounts
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-100">
                  <th className="text-left px-6 py-3 text-xs text-ink-700 font-medium">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">
                    Startup
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">
                    SVI
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">
                    Stage
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">
                    Enrolled
                  </th>
                </tr>
              </thead>
              <tbody>
                {sviAccounts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-ink-600 text-sm"
                    >
                      No SVI accounts yet
                    </td>
                  </tr>
                ) : (
                  sviAccounts.map((acc) => (
                    <tr
                      key={acc.email}
                      className="border-b border-surface-200/50 hover:bg-surface-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-ink-600 font-mono text-xs">
                        {acc.email}
                      </td>
                      <td className="px-4 py-3 text-ink-600 text-xs">
                        {acc.startup_name ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono font-bold text-sm ${acc.current_svi >= 140 ? "text-green-400" : acc.current_svi >= 120 ? "text-brand-600" : acc.current_svi >= 100 ? "text-amber-400" : "text-red-400"}`}
                        >
                          {acc.current_svi}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-600 text-xs">
                        {acc.current_stage}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${acc.plan === "founding50" ? "bg-brand-100 text-brand-700" : acc.plan === "pro" ? "bg-green-100 text-green-700" : "bg-surface-100 text-ink-700"}`}
                        >
                          {acc.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-700 text-xs">
                        {new Date(acc.enrolled_at).toLocaleDateString("en-AU")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent SVI Analyses */}
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-sm font-semibold text-ink-800">
              Recent Analyses
            </h2>
          </div>
          <div className="divide-y divide-surface-200/50">
            {recentAnalyses.length === 0 ? (
              <p className="px-6 py-6 text-center text-ink-600 text-sm">
                No analyses yet
              </p>
            ) : (
              recentAnalyses.map((a, i) => (
                <div
                  key={i}
                  className="px-6 py-3 flex items-center justify-between"
                >
                  <span className="text-ink-600 font-mono text-xs">
                    {a.email}
                  </span>
                  <div className="flex items-center gap-4">
                    <span
                      className={`font-mono font-bold text-sm ${(a.total_svi ?? 0) >= 120 ? "text-green-400" : (a.total_svi ?? 0) >= 100 ? "text-amber-400" : "text-red-400"}`}
                    >
                      {a.total_svi} SVI
                    </span>
                    <span className="text-ink-600 text-xs">
                      {new Date(a.created_at).toLocaleString("en-AU")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Config Links */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              href: "/admin/growth",
              label: "Growth Intelligence",
              desc: "AI-powered funnel analysis & revenue recommendations",
              highlight: true,
            },
            {
              href: "/admin/rnd",
              label: "AI R&D Agent",
              desc: "AI-powered market research, feature proposals & CTA optimization",
              highlight: true,
            },
            {
              href: "/admin/roadmap",
              label: "Product Roadmap",
              desc: "Track phases, milestones and KPIs",
            },
            {
              href: "/admin/team",
              label: "Team & AI Agents",
              desc: "View team members and AI agent ecosystem",
            },
            {
              href: "/admin/users",
              label: "Manage Users",
              desc: "View all users, update plans, reset access",
            },
            {
              href: "/admin/ai-keys",
              label: "AI Provider Keys",
              desc: "Monitor & manage AI fallback chain, test connections",
            },
            {
              href: "/admin/config",
              label: "System Config",
              desc: "SVI weights, risk penalties, benchmarks",
            },
            {
              href: "/admin/notifications",
              label: "Notifications",
              desc: "Send manual reports, view delivery logs",
            },
            {
              href: "/admin/documents",
              label: "Project Documents",
              desc: "Upload and sync files to Google Drive",
            },
          ].map(
            ({
              href,
              label,
              desc,
              highlight,
            }: {
              href: string;
              label: string;
              desc: string;
              highlight?: boolean;
            }) => (
              <Link
                key={href}
                href={href}
                className={`block rounded-xl border px-5 py-4 transition-colors shadow-sm ${highlight ? "border-brand-500/40 bg-brand-50 hover:border-brand-500" : "border-surface-200 bg-white hover:border-brand-600/40"}`}
              >
                {highlight && (
                  <BarChart3
                    strokeWidth={1.75}
                    className="h-4 w-4 text-brand-600 mb-1.5"
                  />
                )}
                <p className="text-sm font-semibold text-ink-800">{label}</p>
                <p className="text-xs text-ink-700 mt-1">{desc}</p>
              </Link>
            ),
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
