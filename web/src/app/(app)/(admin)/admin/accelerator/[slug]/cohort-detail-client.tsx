"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Minus,
  Crown,
  Download,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import type { CohortDetail, CohortMemberDetail } from "./page";

interface CohortDetailClientProps {
  user: { email: string; displayName?: string | null };
  cohort: CohortDetail;
  members: CohortMemberDetail[];
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <ArrowUp strokeWidth={2} className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "down") return <ArrowDown strokeWidth={2} className="h-3.5 w-3.5 text-red-500" />;
  return <Minus strokeWidth={2} className="h-3.5 w-3.5 text-ink-400" />;
}

function sviColor(svi: number) {
  if (svi >= 120) return "text-green-400";
  if (svi >= 100) return "text-brand-600";
  if (svi >= 80) return "text-amber-400";
  if (svi > 0) return "text-red-400";
  return "text-ink-400";
}

export function CohortDetailClient({
  user,
  cohort,
  members,
}: CohortDetailClientProps) {
  const router = useRouter();
  const [showAddMember, setShowAddMember] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [memberForm, setMemberForm] = React.useState({ email: "", startupName: "" });

  const scores = members.map((m) => m.svi_score).filter((s) => s > 0);
  const avgSvi = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const leaderboard = [...members]
    .filter((m) => m.svi_score > 0)
    .sort((a, b) => b.svi_score - a.svi_score)
    .slice(0, 5);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/accelerator/${cohort.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add member");
        return;
      }
      setShowAddMember(false);
      setMemberForm({ email: "", startupName: "" });
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteCohort() {
    if (!confirm(`Delete cohort "${cohort.name}"? This will also remove all members.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/accelerator/${cohort.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/accelerator");
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  function handleExport() {
    const exportData = {
      cohort: {
        name: cohort.name,
        organization: cohort.organization,
        slug: cohort.slug,
        start_date: cohort.start_date,
        end_date: cohort.end_date,
      },
      summary: {
        member_count: members.length,
        avg_svi: avgSvi,
        exported_at: new Date().toISOString(),
      },
      members: members.map((m) => ({
        email: m.email,
        startup_name: m.startup_name,
        svi_score: m.svi_score,
        stage: m.stage,
        trend: m.trend,
        joined_at: m.joined_at,
        last_active: m.last_active,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cohort-${cohort.slug}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout user={user}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Breadcrumb + Header */}
        <div>
          <Link
            href="/admin/accelerator"
            className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-800 transition-colors mb-4"
          >
            <ArrowLeft strokeWidth={1.75} className="h-3.5 w-3.5" />
            Back to Cohorts
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-ink-800">{cohort.name}</h1>
              {cohort.organization && (
                <p className="text-sm text-ink-600 mt-0.5">{cohort.organization}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-ink-500">
                {(cohort.start_date || cohort.end_date) && (
                  <span>
                    {cohort.start_date
                      ? new Date(cohort.start_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "TBD"}{" "}
                    &mdash;{" "}
                    {cohort.end_date
                      ? new Date(cohort.end_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Ongoing"}
                  </span>
                )}
                <span>Manager: {cohort.manager_email}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                <Download strokeWidth={1.75} className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={handleDeleteCohort}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Trash2 strokeWidth={1.75} className="h-3.5 w-3.5" />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium mb-2">
              Members
            </p>
            <p className="text-3xl font-bold font-mono text-ink-800">{members.length}</p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium mb-2">
              Average SVI
            </p>
            <p className={`text-3xl font-bold font-mono ${sviColor(avgSvi)}`}>
              {avgSvi > 0 ? avgSvi : "--"}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium mb-2">
              With SVI Score
            </p>
            <p className="text-3xl font-bold font-mono text-ink-800">
              {scores.length}
              <span className="text-base text-ink-500 font-normal">/{members.length}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium mb-2">
              Trending Up
            </p>
            <p className="text-3xl font-bold font-mono text-green-400">
              {members.filter((m) => m.trend === "up").length}
            </p>
          </div>
        </div>

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200 flex items-center gap-2">
              <Crown strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-ink-800">Top 5 Leaderboard</h2>
            </div>
            <div className="divide-y divide-surface-200/50">
              {leaderboard.map((m, i) => (
                <div key={m.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0
                          ? "bg-amber-100 text-amber-700"
                          : i === 1
                            ? "bg-surface-200 text-ink-600"
                            : i === 2
                              ? "bg-orange-100 text-orange-700"
                              : "bg-surface-100 text-ink-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink-800">
                        {m.startup_name ?? m.email}
                      </p>
                      {m.startup_name && (
                        <p className="text-xs text-ink-500">{m.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendIcon trend={m.trend} />
                    <span className={`font-mono font-bold text-sm ${sviColor(m.svi_score)}`}>
                      {m.svi_score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-ink-800">
                Members ({members.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Plus strokeWidth={2} className="h-3 w-3" />
              Add Member
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-100">
                  <th className="text-left px-6 py-3 text-xs text-ink-700 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Startup</th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">SVI</th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">Stage</th>
                  <th className="text-center px-4 py-3 text-xs text-ink-700 font-medium">Trend</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-ink-600 text-sm">
                      No members yet. Add members to start tracking their SVI progress.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-surface-200/50 hover:bg-surface-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-ink-600 font-mono text-xs">{m.email}</td>
                      <td className="px-4 py-3 text-ink-600 text-xs">
                        {m.startup_name ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono font-bold text-sm ${sviColor(m.svi_score)}`}>
                          {m.svi_score > 0 ? m.svi_score : "--"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-600 text-xs">
                        {m.stage > 0 ? m.stage : "--"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <TrendIcon trend={m.trend} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-700 text-xs">
                        {new Date(m.last_active).toLocaleDateString("en-AU")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Member Modal */}
        {showAddMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-md mx-4 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-ink-800">Add Member</h2>
                <button
                  type="button"
                  onClick={() => { setShowAddMember(false); setError(null); }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
                >
                  <X strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={memberForm.email}
                    onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="founder@startup.com"
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Startup Name
                  </label>
                  <input
                    type="text"
                    value={memberForm.startupName}
                    onChange={(e) => setMemberForm((f) => ({ ...f, startupName: e.target.value }))}
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddMember(false); setError(null); }}
                    className="px-4 py-2 rounded-lg text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {adding ? "Adding..." : "Add Member"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
