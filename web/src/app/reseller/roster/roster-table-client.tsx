"use client";

// /reseller/roster interactive parts — status filter chips, sort dropdown,
// startup table, and row-drawer with mentor-notes textarea.
//
// v3 upgrade Track K sub-L3. Kept in one file so the drawer state can share
// the filtered rows without prop-drilling through a wrapper. WCAG AA:
//   * <table> has a <caption> + <th scope="col">
//   * Row buttons are keyboard-focusable + carry visible focus rings
//   * Filter chips are proper <button role="tab"> with aria-pressed
//   * Drawer is announced with role="dialog" + aria-modal

import { useMemo, useState } from "react";
import type { RosterStatus, StartupRosterEntry } from "@/lib/reseller/roster";

interface Props {
  rows: StartupRosterEntry[];
}

type SortBy = "trust_score" | "last_activity_at" | "first_touch_at";
type SortDir = "asc" | "desc";

const STATUS_CHIPS: Array<{ key: "all" | RosterStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "paying", label: "Paying" },
  { key: "active", label: "Active" },
  { key: "onboarding", label: "Onboarding" },
  { key: "stalled", label: "Stalled" },
  { key: "churned", label: "Churned" },
];

const STATUS_STYLES: Record<RosterStatus, string> = {
  paying: "bg-emerald-100 text-emerald-800",
  active: "bg-sky-100 text-sky-800",
  onboarding: "bg-amber-100 text-amber-900",
  stalled: "bg-orange-100 text-orange-800",
  churned: "bg-surface-200 text-ink-600",
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

function VerificationLevelChip({ level }: { level: number }) {
  const label = level === 0 ? "L0" : `L${level}`;
  const tone =
    level >= 4
      ? "bg-emerald-100 text-emerald-800"
      : level >= 2
      ? "bg-sky-100 text-sky-800"
      : "bg-surface-200 text-ink-600";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}
      aria-label={`Verification level ${level}`}
    >
      {label}
    </span>
  );
}

function StageBadge({ id }: { id: string | null }) {
  if (!id) return <span className="text-xs text-ink-400">—</span>;
  return (
    <span className="inline-flex items-center rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-900">
      {id}
    </span>
  );
}

function StatusPill({ status }: { status: RosterStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function RosterTableClient({ rows }: Props) {
  const [status, setStatus] = useState<"all" | RosterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("last_activity_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawer, setDrawer] = useState<StartupRosterEntry | null>(null);

  const filtered = useMemo(() => {
    const list = status === "all" ? rows : rows.filter((r) => r.status === status);
    const sorted = list.slice().sort((a, b) => {
      const va = a[sortBy];
      const vb = b[sortBy];
      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = (va as number | string) < (vb as number | string) ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, status, sortBy, sortDir]);

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {STATUS_CHIPS.map((c) => {
            const pressed = c.key === status;
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-pressed={pressed}
                onClick={() => setStatus(c.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  pressed
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-surface-200 bg-white text-ink-700 hover:bg-surface-50"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-600">
          <label htmlFor="rt-sort" className="font-medium">
            Sort by
          </label>
          <select
            id="rt-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded border border-surface-300 bg-white px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <option value="last_activity_at">Last activity</option>
            <option value="first_touch_at">First touch</option>
            <option value="trust_score">Trust score</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Toggle sort direction (currently ${sortDir})`}
            className="rounded border border-surface-300 bg-white px-2 py-1 font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-surface-200 bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Attributed startups roster — {filtered.length} rows, filtered by {status}, sorted by {sortBy} {sortDir}.
          </caption>
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="p-3">Business</th>
              <th scope="col" className="p-3">Verification</th>
              <th scope="col" className="p-3">Trust</th>
              <th scope="col" className="p-3">Stage</th>
              <th scope="col" className="p-3">Growth phase</th>
              <th scope="col" className="p-3 text-right">Evidence</th>
              <th scope="col" className="p-3 text-right">Reports</th>
              <th scope="col" className="p-3 text-right">Credits</th>
              <th scope="col" className="p-3">First touch</th>
              <th scope="col" className="p-3">Last activity</th>
              <th scope="col" className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {filtered.map((r) => (
              <tr
                key={r.business_id}
                tabIndex={0}
                onClick={() => setDrawer(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDrawer(r);
                  }
                }}
                className="cursor-pointer hover:bg-surface-50 focus:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
              >
                <td className="p-3 font-medium text-ink-900">
                  {r.business_name}
                  <div className="text-xs text-ink-500">{r.founder_email}</div>
                </td>
                <td className="p-3"><VerificationLevelChip level={r.verification_level ?? 0} /></td>
                <td className="p-3 tabular-nums text-ink-800">
                  {r.trust_score == null ? "—" : r.trust_score}
                </td>
                <td className="p-3"><StageBadge id={r.unicorn_stage_id} /></td>
                <td className="p-3 text-ink-700">{r.growth_phase ?? "—"}</td>
                <td className="p-3 text-right tabular-nums text-ink-700">{r.evidence_count}</td>
                <td className="p-3 text-right tabular-nums text-ink-700">{r.report_count}</td>
                <td className="p-3 text-right tabular-nums text-ink-700">{r.credit_balance}</td>
                <td className="p-3 text-xs text-ink-600">{fmtRelative(r.first_touch_at)}</td>
                <td className="p-3 text-xs text-ink-600">{fmtRelative(r.last_activity_at)}</td>
                <td className="p-3"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawer && <RowDrawer entry={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}

function RowDrawer({
  entry,
  onClose,
}: {
  entry: StartupRosterEntry;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<"reseller_only" | "shared_with_founder">(
    "reseller_only",
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveNote() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: entry.business_id,
          note,
          visibility,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setNote("");
      setSavedAt(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rt-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 id="rt-drawer-title" className="text-lg font-semibold text-ink-900">
              {entry.business_name}
            </h3>
            <p className="text-xs text-ink-500">{entry.founder_email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-600 hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Verification</dt>
            <dd className="mt-1"><VerificationLevelChip level={entry.verification_level ?? 0} /></dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Trust score</dt>
            <dd className="mt-1 tabular-nums">{entry.trust_score ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Unicorn stage</dt>
            <dd className="mt-1"><StageBadge id={entry.unicorn_stage_id} /></dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Growth phase</dt>
            <dd className="mt-1">{entry.growth_phase ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Evidence</dt>
            <dd className="mt-1 tabular-nums">{entry.evidence_count}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Reports</dt>
            <dd className="mt-1 tabular-nums">{entry.report_count}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Credits</dt>
            <dd className="mt-1 tabular-nums">{entry.credit_balance}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Status</dt>
            <dd className="mt-1"><StatusPill status={entry.status} /></dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">First touch</dt>
            <dd className="mt-1 text-xs">{fmtRelative(entry.first_touch_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Last activity</dt>
            <dd className="mt-1 text-xs">{fmtRelative(entry.last_activity_at)}</dd>
          </div>
        </dl>

        <section className="mt-6">
          <h4 className="text-sm font-semibold text-ink-900">Mentor note</h4>
          <p className="mt-1 text-xs text-ink-500">
            Notes stored in <code>reseller_notes</code>; also logs a{" "}
            <code>noted</code> activity signal for last-activity tracking.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Notes visible only to your reseller org unless marked shared."
            aria-label="Mentor note"
            className="mt-2 w-full rounded border border-surface-300 p-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            rows={4}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={visibility === "shared_with_founder"}
                onChange={(e) =>
                  setVisibility(
                    e.target.checked ? "shared_with_founder" : "reseller_only",
                  )
                }
              />
              Share with founder
            </label>
            <button
              type="button"
              onClick={saveNote}
              disabled={saving || note.trim().length === 0}
              className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {saving ? "Saving…" : "Save note"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {error}
            </p>
          )}
          {savedAt && !error && (
            <p className="mt-2 text-xs text-emerald-700">
              Saved {fmtRelative(savedAt)}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
