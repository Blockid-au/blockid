"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TeamMember } from "@/lib/founder-features";

interface Props {
  initial: TeamMember[];
  disabled: boolean;
  suggestedAdvisors: number;
}

interface Draft {
  role_title: string;
  role_category: string;
  full_name: string;
  equity_pct: string;
  salary_aud: string;
  start_date: string;
  status: "filled" | "open" | "planned";
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  role_title: "",
  role_category: "founder",
  full_name: "",
  equity_pct: "",
  salary_aud: "",
  start_date: "",
  status: "filled",
  notes: "",
};

const CATEGORY_STYLE: Record<string, string> = {
  founder: "bg-brand-100 text-brand-700",
  hire: "bg-emerald-100 text-emerald-700",
  advisor: "bg-purple-100 text-purple-700",
  contractor: "bg-slate-100 text-slate-700",
};

const STATUS_STYLE: Record<string, string> = {
  filled: "bg-emerald-100 text-emerald-700",
  open: "bg-amber-100 text-amber-700",
  planned: "bg-slate-100 text-slate-700",
};

export function TeamPlannerClient({ initial, disabled, suggestedAdvisors }: Props) {
  const [items, setItems] = useState<TeamMember[]>(initial);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const founders = items.filter((i) => i.role_category === "founder").length;
    const hires = items.filter((i) => i.role_category === "hire").length;
    const advisors = items.filter((i) => i.role_category === "advisor").length;
    const openRoles = items.filter((i) => i.status !== "filled").length;
    const totalEquity = items.reduce((s, i) => s + Number(i.equity_pct ?? 0), 0);
    const monthlyBurn =
      items
        .filter((i) => i.status === "filled" && i.salary_aud)
        .reduce((s, i) => s + Number(i.salary_aud ?? 0), 0) / 12;
    return { founders, hires, advisors, openRoles, totalEquity, monthlyBurn };
  }, [items]);

  const input =
    "w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50";
  const label = "text-xs font-semibold text-ink-700 uppercase tracking-wider";

  async function add() {
    if (!draft.role_title.trim()) {
      setError("Role title required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        equity_pct: draft.equity_pct === "" ? null : Number(draft.equity_pct),
        salary_aud: draft.salary_aud === "" ? null : Number(draft.salary_aud),
        start_date: draft.start_date === "" ? null : draft.start_date,
      };
      const res = await fetch("/api/founder/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Add failed");
      setItems((xs) => [...xs, json.item as TeamMember]);
      setDraft({ ...EMPTY_DRAFT });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this role?")) return;
    const res = await fetch(`/api/founder/team/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setItems((xs) => xs.filter((x) => x.id !== id));
  }

  async function updateStatus(id: string, status: "filled" | "open" | "planned") {
    const res = await fetch(`/api/founder/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.ok) setItems((xs) => xs.map((x) => (x.id === id ? (json.item as TeamMember) : x)));
  }

  return (
    <div className="space-y-6">
      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Founders" value={String(stats.founders)} />
        <StatCard label="Hires" value={String(stats.hires)} />
        <StatCard
          label="Advisors"
          value={String(stats.advisors)}
          hint={stats.advisors < suggestedAdvisors ? `Aim for ${suggestedAdvisors}+` : "Good"}
        />
        <StatCard label="Open roles" value={String(stats.openRoles)} />
        <StatCard
          label="Monthly burn"
          value={`A$${Math.round(stats.monthlyBurn).toLocaleString()}`}
          hint={`Equity: ${stats.totalEquity.toFixed(1)}%`}
        />
      </div>

      {/* ── Add ────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-ink-800">Add role</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Role title *</label>
            <input
              className={input}
              value={draft.role_title}
              placeholder="e.g. CEO, Head of Growth"
              onChange={(e) => setDraft({ ...draft, role_title: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Category</label>
            <select
              className={input}
              value={draft.role_category}
              onChange={(e) => setDraft({ ...draft, role_category: e.target.value })}
              disabled={disabled}
            >
              <option value="founder">Founder</option>
              <option value="hire">Hire</option>
              <option value="advisor">Advisor</option>
              <option value="contractor">Contractor</option>
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
              <option value="filled">Filled</option>
              <option value="open">Open (hiring)</option>
              <option value="planned">Planned</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Full name</label>
            <input
              className={input}
              value={draft.full_name}
              placeholder="Leave blank if role is open"
              onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Equity %</label>
            <input
              type="number"
              step="0.1"
              className={input}
              value={draft.equity_pct}
              placeholder="e.g. 20"
              onChange={(e) => setDraft({ ...draft, equity_pct: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Salary (AUD, annual)</label>
            <input
              type="number"
              className={input}
              value={draft.salary_aud}
              placeholder="e.g. 120000"
              onChange={(e) => setDraft({ ...draft, salary_aud: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Start date</label>
            <input
              type="date"
              className={input}
              value={draft.start_date}
              onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className={label}>Notes</label>
            <input
              className={input}
              value={draft.notes}
              placeholder="Optional context — background, target start, etc."
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <Button onClick={add} disabled={busy || disabled} className="ml-auto">
            {busy ? "Adding…" : "Add role"}
          </Button>
        </div>
      </section>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-ink-500">
            No roles yet. Start with founders and add the next 3–5 hires you'd make with fresh capital.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Role</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Name</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-ink-600">Equity</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-ink-600">Salary</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {items.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-50">
                    <td className="px-3 py-2.5 font-semibold text-ink-800">{m.role_title}</td>
                    <td className="px-3 py-2.5">
                      {m.role_category && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_STYLE[m.role_category] ?? ""}`}>
                          {m.role_category}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-700">
                      {m.full_name ?? <span className="text-ink-400 italic">— open —</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">
                      {m.equity_pct != null ? `${Number(m.equity_pct).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">
                      {m.salary_aud != null ? `A$${Number(m.salary_aud).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border-0 ${STATUS_STYLE[m.status]}`}
                        value={m.status}
                        onChange={(e) => updateStatus(m.id, e.target.value as "filled" | "open" | "planned")}
                        disabled={disabled}
                      >
                        <option value="filled">Filled</option>
                        <option value="open">Open</option>
                        <option value="planned">Planned</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button size="xs" variant="ghost" onClick={() => remove(m.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-3">
      <p className="text-[10px] uppercase font-semibold text-ink-500 tracking-wider">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink-800 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-ink-400 mt-0.5">{hint}</p>}
    </div>
  );
}
