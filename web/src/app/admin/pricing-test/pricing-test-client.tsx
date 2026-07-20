"use client";

import * as React from "react";
import { FlaskConical, Play, Pause, Check, Plus, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";

interface Variant {
  key: string;
  label: string;
  payload: Record<string, unknown>;
}

interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: "draft" | "running" | "paused" | "concluded";
  variants: Variant[];
  trafficSplit: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

interface Summary {
  variantKey: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  totalValueAud: number;
}

interface Props {
  user: { email: string; displayName: string | null };
  initialExperiments: Experiment[];
  initialSummaries: Record<string, Summary[]>;
}

const STATUS_STYLE: Record<Experiment["status"], string> = {
  draft: "bg-surface-100 text-ink-700",
  running: "bg-green-50 text-green-700 border border-green-200",
  paused: "bg-amber-50 text-amber-700 border border-amber-200",
  concluded: "bg-slate-100 text-slate-700",
};

function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function formatAud(x: number): string {
  return x.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

export function PricingTestClient({ user, initialExperiments, initialSummaries }: Props) {
  const [experiments, setExperiments] = React.useState<Experiment[]>(initialExperiments);
  const [summaries, setSummaries] = React.useState<Record<string, Summary[]>>(initialSummaries);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    hypothesis: "",
    variantsJson:
      '[\n  { "key": "control",   "label": "Control $29",   "payload": { "price": 2900, "currency": "AUD" } },\n  { "key": "treatment", "label": "Treatment $49", "payload": { "price": 4900, "currency": "AUD" } }\n]',
    trafficJson: '{ "control": 0.5, "treatment": 0.5 }',
  });

  async function refresh() {
    const res = await fetch("/api/admin/pricing-test", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      setExperiments(data.experiments as Experiment[]);
      setSummaries(data.summaries as Record<string, Summary[]>);
    }
  }

  async function createExperiment(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    let variants: unknown;
    let trafficSplit: unknown;
    try {
      variants = JSON.parse(form.variantsJson);
      trafficSplit = form.trafficJson.trim() ? JSON.parse(form.trafficJson) : undefined;
    } catch {
      setFeedback({ type: "error", message: "Variants / traffic split must be valid JSON" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/pricing-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          hypothesis: form.hypothesis.trim(),
          variants,
          trafficSplit,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback({ type: "error", message: data.error ?? "Create failed" });
        return;
      }
      setFeedback({ type: "success", message: `Created experiment ${form.name}` });
      setForm((f) => ({ ...f, name: "", hypothesis: "" }));
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function patchStatus(id: string, status: Experiment["status"]) {
    setBusy(id);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/pricing-test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback({ type: "error", message: data.error ?? "Update failed" });
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminLayout user={user}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <FlaskConical strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-ink-800">
            Pricing A/B Tests ({experiments.length})
          </h1>
        </div>

        {feedback ? (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={
              feedback.type === "success"
                ? "rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800"
                : "rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
            }
          >
            {feedback.message}
          </div>
        ) : null}

        <form
          onSubmit={createExperiment}
          className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center gap-2">
            <Plus strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-ink-800">New experiment</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink-700">
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="founder_price_v1"
                className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Hypothesis
              <input
                value={form.hypothesis}
                onChange={(e) => setForm((f) => ({ ...f, hypothesis: e.target.value }))}
                placeholder="Anchoring at $49 lifts free→paid by 15%."
                className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-ink-700">
            Variants (JSON array, 2–4 items)
            <textarea
              required
              rows={7}
              value={form.variantsJson}
              onChange={(e) => setForm((f) => ({ ...f, variantsJson: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </label>
          <label className="block text-xs font-medium text-ink-700">
            Traffic split (JSON, keys must cover every variant)
            <textarea
              rows={2}
              value={form.trafficJson}
              onChange={(e) => setForm((f) => ({ ...f, trafficJson: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2"
          >
            {creating ? (
              <>
                <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating experiment…
              </>
            ) : (
              "Create experiment"
            )}
          </button>
        </form>

        <div className="space-y-4">
          {experiments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-surface-300 bg-white p-8 text-center text-sm text-ink-600">
              No experiments yet. Create one above to start bucketing traffic.
            </div>
          ) : (
            experiments.map((exp) => {
              const rows = summaries[exp.id] ?? [];
              const rowByKey = new Map(rows.map((r) => [r.variantKey, r]));
              return (
                <article
                  key={exp.id}
                  className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm"
                >
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-800">{exp.name}</h3>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[exp.status]}`}>
                          {exp.status}
                        </span>
                      </div>
                      {exp.hypothesis ? (
                        <p className="mt-1 text-xs text-ink-600">{exp.hypothesis}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {exp.status === "draft" ? (
                        <button
                          type="button"
                          disabled={busy === exp.id}
                          onClick={() => patchStatus(exp.id, "running")}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
                        >
                          <Play strokeWidth={1.75} className="h-3 w-3" /> Start
                        </button>
                      ) : null}
                      {exp.status === "running" ? (
                        <button
                          type="button"
                          disabled={busy === exp.id}
                          onClick={() => patchStatus(exp.id, "paused")}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          <Pause strokeWidth={1.75} className="h-3 w-3" /> Pause
                        </button>
                      ) : null}
                      {exp.status === "paused" ? (
                        <button
                          type="button"
                          disabled={busy === exp.id}
                          onClick={() => patchStatus(exp.id, "running")}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
                        >
                          <Play strokeWidth={1.75} className="h-3 w-3" /> Resume
                        </button>
                      ) : null}
                      {exp.status === "running" || exp.status === "paused" ? (
                        <button
                          type="button"
                          disabled={busy === exp.id}
                          onClick={() => patchStatus(exp.id, "concluded")}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          <Check strokeWidth={1.75} className="h-3 w-3" /> Conclude
                        </button>
                      ) : null}
                    </div>
                  </header>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-surface-200 bg-surface-50 text-ink-700">
                          <th className="px-3 py-2 text-left font-medium">Variant</th>
                          <th className="px-3 py-2 text-left font-medium">Label</th>
                          <th className="px-3 py-2 text-right font-medium">Weight</th>
                          <th className="px-3 py-2 text-right font-medium">Impressions</th>
                          <th className="px-3 py-2 text-right font-medium">Conversions</th>
                          <th className="px-3 py-2 text-right font-medium">CVR</th>
                          <th className="px-3 py-2 text-right font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exp.variants.map((v) => {
                          const s = rowByKey.get(v.key);
                          return (
                            <tr key={v.key} className="border-b border-surface-100">
                              <td className="px-3 py-2 font-mono text-ink-700">{v.key}</td>
                              <td className="px-3 py-2 text-ink-700">{v.label}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                                {formatPct(exp.trafficSplit[v.key] ?? 0)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-ink-800">
                                {s?.impressions ?? 0}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-ink-800">
                                {s?.conversions ?? 0}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-ink-800">
                                {formatPct(s?.conversionRate ?? 0)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-ink-800">
                                {formatAud(s?.totalValueAud ?? 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
