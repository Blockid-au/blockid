"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoadmapMilestone } from "@/lib/founder-features";

interface Props {
  initial: RoadmapMilestone[];
  quarters: string[];
  disabled: boolean;
}

interface Draft {
  quarter: string;
  title: string;
  description: string;
  category: string;
  status: RoadmapMilestone["status"];
  target_date: string;
  owner: string;
}

function emptyDraft(defaultQuarter: string): Draft {
  return {
    quarter: defaultQuarter,
    title: "",
    description: "",
    category: "product",
    status: "planned",
    target_date: "",
    owner: "",
  };
}

const CATEGORY_STYLE: Record<string, string> = {
  product: "bg-brand-100 text-brand-700",
  growth: "bg-emerald-100 text-emerald-700",
  fundraise: "bg-purple-100 text-purple-700",
  team: "bg-amber-100 text-amber-700",
  compliance: "bg-slate-100 text-slate-700",
};

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  shipped: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

export function RoadmapBuilderClient({ initial, quarters, disabled }: Props) {
  const [items, setItems] = useState<RoadmapMilestone[]>(initial);
  const [draft, setDraft] = useState<Draft>(emptyDraft(quarters[0] ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Merge the current-and-next quarters from config with any existing rows.
  const allQuarters = useMemo(() => {
    const set = new Set<string>(quarters);
    for (const m of items) set.add(m.quarter);
    return Array.from(set).sort();
  }, [items, quarters]);

  const byQuarter = useMemo(() => {
    const map = new Map<string, RoadmapMilestone[]>();
    for (const q of allQuarters) map.set(q, []);
    for (const m of items) {
      if (!map.has(m.quarter)) map.set(m.quarter, []);
      map.get(m.quarter)!.push(m);
    }
    return map;
  }, [items, allQuarters]);

  const input =
    "w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50";
  const label = "text-xs font-semibold text-ink-700 uppercase tracking-wider";

  async function add() {
    if (!draft.title.trim() || !draft.quarter) {
      setError("Title and quarter required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        target_date: draft.target_date === "" ? null : draft.target_date,
      };
      const res = await fetch("/api/founder/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Add failed");
      setItems((xs) => [...xs, json.item as RoadmapMilestone]);
      setDraft(emptyDraft(draft.quarter));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this milestone?")) return;
    const res = await fetch(`/api/founder/roadmap/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setItems((xs) => xs.filter((x) => x.id !== id));
  }

  async function updateStatus(id: string, status: RoadmapMilestone["status"]) {
    const res = await fetch(`/api/founder/roadmap/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.ok) setItems((xs) => xs.map((x) => (x.id === id ? (json.item as RoadmapMilestone) : x)));
  }

  return (
    <div className="space-y-6">
      {/* ── Add form ────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-ink-800">Add milestone</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Quarter *</label>
            <select
              className={input}
              value={draft.quarter}
              onChange={(e) => setDraft({ ...draft, quarter: e.target.value })}
              disabled={disabled}
            >
              {allQuarters.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Category</label>
            <select
              className={input}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              disabled={disabled}
            >
              <option value="product">Product</option>
              <option value="growth">Growth</option>
              <option value="fundraise">Fundraise</option>
              <option value="team">Team</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Status</label>
            <select
              className={input}
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as Draft["status"] })
              }
              disabled={disabled}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="shipped">Shipped</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className={label}>Title *</label>
            <input
              className={input}
              value={draft.title}
              placeholder="e.g. Ship self-serve onboarding"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Owner</label>
            <input
              className={input}
              value={draft.owner}
              placeholder="e.g. CTO, Head of Growth"
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className={label}>Description</label>
            <textarea
              className={input}
              rows={2}
              value={draft.description}
              placeholder="What you'll ship, learn or measure this quarter."
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Target date</label>
            <input
              type="date"
              className={input}
              value={draft.target_date}
              onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <Button onClick={add} disabled={busy || disabled} className="ml-auto">
            {busy ? "Adding…" : "Add milestone"}
          </Button>
        </div>
      </section>

      {/* ── Board ─────────────────────────────────────────────────────────── */}
      <section>
        <div className={`grid gap-4 ${allQuarters.length >= 4 ? "md:grid-cols-4" : `md:grid-cols-${Math.max(1, allQuarters.length)}`}`}>
          {allQuarters.map((q) => {
            const list = byQuarter.get(q) ?? [];
            return (
              <div key={q} className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
                <h3 className="text-sm font-bold text-ink-800 mb-3">{q}</h3>
                {list.length === 0 && (
                  <p className="text-xs text-ink-400 italic">No milestones yet.</p>
                )}
                <ul className="space-y-3">
                  {list.map((m) => (
                    <li key={m.id} className="rounded-xl bg-white border border-surface-200 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-800">{m.title}</p>
                          {m.owner && <p className="text-[11px] text-ink-500">{m.owner}</p>}
                        </div>
                        {m.category && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_STYLE[m.category] ?? ""}`}>
                            {m.category}
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p className="text-xs text-ink-600">{m.description}</p>
                      )}
                      {m.target_date && (
                        <p className="text-[11px] text-ink-500">Target: {m.target_date}</p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <select
                          className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border-0 ${STATUS_STYLE[m.status]}`}
                          value={m.status}
                          onChange={(e) => updateStatus(m.id, e.target.value as RoadmapMilestone["status"])}
                          disabled={disabled}
                        >
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <Button size="xs" variant="ghost" onClick={() => remove(m.id)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
