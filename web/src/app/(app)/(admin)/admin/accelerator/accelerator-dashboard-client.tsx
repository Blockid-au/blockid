"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Plus,
  Users,
  TrendingUp,
  X,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import type { CohortSummary } from "./page";

interface AcceleratorDashboardClientProps {
  user: { email: string; displayName?: string | null };
  cohorts: CohortSummary[];
}

function SviDistributionBar({ dist }: { dist: CohortSummary["svi_distribution"] }) {
  const total = dist.below80 + dist.range80to100 + dist.range100to120 + dist.above120;
  if (total === 0) {
    return (
      <div className="h-3 w-full rounded-full bg-surface-200 overflow-hidden">
        <div className="h-full w-full bg-surface-200" />
      </div>
    );
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div className="space-y-1.5">
      <div className="h-3 w-full rounded-full bg-surface-200 overflow-hidden flex">
        {dist.below80 > 0 && (
          <div className="h-full bg-red-400" style={{ width: pct(dist.below80) }} title={`<80: ${dist.below80}`} />
        )}
        {dist.range80to100 > 0 && (
          <div className="h-full bg-amber-400" style={{ width: pct(dist.range80to100) }} title={`80-100: ${dist.range80to100}`} />
        )}
        {dist.range100to120 > 0 && (
          <div className="h-full bg-brand-500" style={{ width: pct(dist.range100to120) }} title={`100-120: ${dist.range100to120}`} />
        )}
        {dist.above120 > 0 && (
          <div className="h-full bg-green-400" style={{ width: pct(dist.above120) }} title={`120+: ${dist.above120}`} />
        )}
      </div>
      <div className="flex gap-3 text-[10px] text-ink-600">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" />&lt;80: {dist.below80}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />80-100: {dist.range80to100}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-brand-500" />100-120: {dist.range100to120}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-400" />120+: {dist.above120}</span>
      </div>
    </div>
  );
}

export function AcceleratorDashboardClient({
  user,
  cohorts,
}: AcceleratorDashboardClientProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    organization: "",
    managerEmail: "",
    startDate: "",
    endDate: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/accelerator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create cohort");
        return;
      }
      setShowCreate(false);
      setForm({ name: "", organization: "", managerEmail: "", startDate: "", endDate: "" });
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminLayout user={user}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            <div>
              <h1 className="text-2xl font-bold text-ink-800">
                Accelerator Cohort Dashboard
              </h1>
              <p className="text-sm text-ink-700 mt-0.5">
                Track cohort SVI progress and manage programs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer"
          >
            <Plus strokeWidth={2} className="h-4 w-4" />
            Create Cohort
          </button>
        </div>

        {/* Create Cohort Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-lg mx-4 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-ink-800">Create New Cohort</h2>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError(null); }}
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

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Cohort Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Melbourne Spring 2026"
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Organization
                  </label>
                  <input
                    type="text"
                    value={form.organization}
                    onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                    placeholder="e.g. StartupVic"
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    Manager Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.managerEmail}
                    onChange={(e) => setForm((f) => ({ ...f, managerEmail: e.target.value }))}
                    placeholder="manager@accelerator.com"
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); setError(null); }}
                    className="px-4 py-2 rounded-lg text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {creating ? "Creating..." : "Create Cohort"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Stats summary */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium">
                Total Cohorts
              </p>
              <GraduationCap strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            </div>
            <p className="text-3xl font-bold font-mono text-ink-800">{cohorts.length}</p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium">
                Total Members
              </p>
              <Users strokeWidth={1.75} className="h-4 w-4 text-teal-400" />
            </div>
            <p className="text-3xl font-bold font-mono text-ink-800">
              {cohorts.reduce((sum, c) => sum + c.member_count, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium">
                Overall Avg SVI
              </p>
              <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-green-400" />
            </div>
            <p className="text-3xl font-bold font-mono text-ink-800">
              {cohorts.length > 0
                ? Math.round(
                    cohorts.filter((c) => c.avg_svi > 0).reduce((sum, c) => sum + c.avg_svi, 0) /
                      (cohorts.filter((c) => c.avg_svi > 0).length || 1),
                  )
                : 0}
            </p>
          </div>
        </div>

        {/* Cohort Cards Grid */}
        {cohorts.length === 0 ? (
          <div className="rounded-2xl border border-surface-200 bg-white p-12 shadow-sm text-center">
            <GraduationCap strokeWidth={1.5} className="mx-auto h-10 w-10 text-ink-400 mb-4" />
            <h2 className="text-lg font-semibold text-ink-800 mb-1">No cohorts yet</h2>
            <p className="text-sm text-ink-600">
              Create your first accelerator cohort to start tracking SVI progress.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {cohorts.map((cohort) => (
              <div
                key={cohort.id}
                className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm hover:border-brand-500/40 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-ink-800">{cohort.name}</h3>
                    {cohort.organization && (
                      <p className="text-xs text-ink-600 mt-0.5">{cohort.organization}</p>
                    )}
                    {(cohort.start_date || cohort.end_date) && (
                      <p className="text-[11px] text-ink-500 mt-1">
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
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-3xl font-bold font-mono ${
                        cohort.avg_svi >= 120
                          ? "text-green-400"
                          : cohort.avg_svi >= 100
                            ? "text-brand-600"
                            : cohort.avg_svi >= 80
                              ? "text-amber-400"
                              : cohort.avg_svi > 0
                                ? "text-red-400"
                                : "text-ink-400"
                      }`}
                    >
                      {cohort.avg_svi > 0 ? cohort.avg_svi : "--"}
                    </p>
                    <p className="text-[10px] text-ink-500 uppercase tracking-wider mt-0.5">
                      Avg SVI
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4 text-sm text-ink-600">
                  <span className="flex items-center gap-1.5">
                    <Users strokeWidth={1.75} className="h-3.5 w-3.5" />
                    {cohort.member_count} member{cohort.member_count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* SVI Distribution */}
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium mb-1.5">
                    SVI Distribution
                  </p>
                  <SviDistributionBar dist={cohort.svi_distribution} />
                </div>

                <Link
                  href={`/admin/accelerator/${cohort.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  View Details
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
