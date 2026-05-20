"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareClass {
  id: string;
  account_id: string;
  name: string;
  class_type: string;
  total_authorized: number;
  price_per_share: number;
  voting_rights: boolean;
  dividend_preference: number | null;
  liquidation_preference: number | null;
  created_at: string;
}

interface Shareholder {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  role: string;
  share_class_id: string | null;
  shares_held: number;
  ownership_pct: number;
  fully_diluted_pct: number;
  vesting_start: string | null;
  vesting_months: number | null;
  cliff_months: number | null;
  vested_pct: number;
  notes: string | null;
  created_at: string;
}

interface EsopPool {
  id: string;
  account_id: string;
  total_pool_shares: number;
  allocated_shares: number;
  pool_pct: number;
  created_at: string;
}

interface CapTableSummary {
  totalAuthorized: number;
  totalIssued: number;
  fullyDilutedTotal: number;
  esopShares: number;
  esopAvailable: number;
}

interface CapTableData {
  shareClasses: ShareClass[];
  shareholders: Shareholder[];
  esopPool: EsopPool | null;
  summary: CapTableSummary;
}

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

const ROLES = [
  { value: "founder", label: "Founder" },
  { value: "co-founder", label: "Co-Founder" },
  { value: "investor", label: "Investor" },
  { value: "advisor", label: "Advisor" },
  { value: "esop", label: "ESOP" },
];

const ROLE_COLORS: Record<string, string> = {
  founder: "bg-brand-100 text-brand-700",
  "co-founder": "bg-violet-100 text-violet-700",
  investor: "bg-sky-100 text-sky-700",
  advisor: "bg-amber-100 text-amber-700",
  esop: "bg-surface-200 text-ink-600",
};

const CLASS_TYPES = [
  { value: "ordinary", label: "Ordinary" },
  { value: "preference", label: "Preference" },
  { value: "convertible", label: "Convertible" },
];

// ---------------------------------------------------------------------------
// SVG Pie chart
// ---------------------------------------------------------------------------

const PIE_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
  "#ec4899", "#f97316", "#14b8a6", "#a855f7", "#3b82f6",
];

function PieChart({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center w-48 h-48">
        <p className="text-ink-500 text-sm">No shares issued</p>
      </div>
    );
  }

  let cumulativeAngle = 0;
  const paths = slices
    .filter((sl) => sl.value > 0)
    .map((sl) => {
      const fraction = sl.value / total;
      const startAngle = cumulativeAngle;
      const angle = fraction * 360;
      cumulativeAngle += angle;

      // If this slice is the entire pie, draw a full circle
      if (fraction >= 0.9999) {
        return (
          <circle
            key={sl.label}
            cx="100"
            cy="100"
            r="80"
            fill={sl.color}
          />
        );
      }

      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((startAngle + angle - 90) * Math.PI) / 180;
      const x1 = 100 + 80 * Math.cos(startRad);
      const y1 = 100 + 80 * Math.sin(startRad);
      const x2 = 100 + 80 * Math.cos(endRad);
      const y2 = 100 + 80 * Math.sin(endRad);
      const largeArc = angle > 180 ? 1 : 0;

      return (
        <path
          key={sl.label}
          d={`M100,100 L${x1},${y1} A80,80 0 ${largeArc},1 ${x2},${y2} Z`}
          fill={sl.color}
        />
      );
    });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 200" className="w-48 h-48">
        {paths}
        <circle cx="100" cy="100" r="35" fill="white" />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {slices
          .filter((sl) => sl.value > 0)
          .map((sl) => (
            <div key={sl.label} className="flex items-center gap-1.5 text-xs text-ink-600">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: sl.color }}
              />
              <span className="truncate max-w-[120px]">{sl.label}</span>
              <span className="font-medium text-ink-800">
                {total > 0 ? ((sl.value / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  return n.toLocaleString("en-AU");
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CapTableManager() {
  const [data, setData] = React.useState<CapTableData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Form visibility toggles
  const [showAddShareholder, setShowAddShareholder] = React.useState(false);
  const [showAddClass, setShowAddClass] = React.useState(false);
  const [showSetupEsop, setShowSetupEsop] = React.useState(false);
  const [editingShareholder, setEditingShareholder] = React.useState<Shareholder | null>(null);

  // Section collapse
  const [classesOpen, setClassesOpen] = React.useState(true);
  const [esopOpen, setEsopOpen] = React.useState(true);

  // ---- Fetch ----
  const fetchCapTable = React.useCallback(async () => {
    try {
      const res = await fetch("/api/cap-table");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load cap table");
      setData({
        shareClasses: json.shareClasses,
        shareholders: json.shareholders,
        esopPool: json.esopPool,
        summary: json.summary,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCapTable();
  }, [fetchCapTable]);

  // ---- Actions ----
  async function apiPost(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/cap-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: payload }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Request failed");
      await fetchCapTable();
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function deleteShareholder(id: string) {
    if (!confirm("Remove this shareholder?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cap-table", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareholderId: id }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
      await fetchCapTable();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  // ---- Loading / Error ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const shareClasses = data?.shareClasses ?? [];
  const shareholders = data?.shareholders ?? [];
  const esopPool = data?.esopPool ?? null;
  const summary = data?.summary ?? {
    totalAuthorized: 0,
    totalIssued: 0,
    fullyDilutedTotal: 0,
    esopShares: 0,
    esopAvailable: 0,
  };

  // Build pie slices
  const pieSlices = shareholders.map((s, i) => ({
    label: s.name,
    value: Number(s.shares_held),
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
  if (summary.esopAvailable > 0) {
    pieSlices.push({
      label: "ESOP (unallocated)",
      value: summary.esopAvailable,
      color: "#d1d5db",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Cap Table</h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Manage share classes, shareholders, and ESOP pool
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 font-medium underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* Section 1: Summary */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats cards */}
        <div className="lg:col-span-1 space-y-3">
          <SummaryCard label="Total Authorized" value={fmtNum(summary.totalAuthorized)} sub="shares" />
          <SummaryCard label="Total Issued" value={fmtNum(summary.totalIssued)} sub="shares" />
          <SummaryCard label="Fully Diluted" value={fmtNum(summary.fullyDilutedTotal)} sub="incl. ESOP" />
          <SummaryCard
            label="ESOP Pool"
            value={
              esopPool
                ? `${fmtNum(Number(esopPool.allocated_shares))} / ${fmtNum(Number(esopPool.total_pool_shares))}`
                : "Not configured"
            }
            sub={esopPool ? `${esopPool.pool_pct}% of cap table` : ""}
          />
        </div>

        {/* Pie chart */}
        <div className="lg:col-span-2 rounded-2xl border border-surface-200 bg-white p-6 flex items-center justify-center">
          <PieChart slices={pieSlices} />
        </div>
      </div>

      {/* ================================================================ */}
      {/* Section 2: Shareholder Table */}
      {/* ================================================================ */}
      <div className="rounded-2xl border border-surface-200 bg-white">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <Users strokeWidth={1.75} className="h-5 w-5 text-ink-500" />
            <h2 className="text-lg font-semibold text-ink-800">Shareholders</h2>
            <span className="text-xs text-ink-500 bg-surface-100 rounded-full px-2 py-0.5">
              {shareholders.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAddShareholder(true);
              setEditingShareholder(null);
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Shareholder
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50 text-left">
                <th className="px-5 py-3 font-medium text-ink-500">Name</th>
                <th className="px-5 py-3 font-medium text-ink-500">Role</th>
                <th className="px-5 py-3 font-medium text-ink-500">Class</th>
                <th className="px-5 py-3 font-medium text-ink-500 text-right">Shares</th>
                <th className="px-5 py-3 font-medium text-ink-500 text-right">Ownership %</th>
                <th className="px-5 py-3 font-medium text-ink-500 text-right">Vested %</th>
                <th className="px-5 py-3 font-medium text-ink-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shareholders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-ink-500">
                    No shareholders yet. Add your first shareholder to get started.
                  </td>
                </tr>
              )}
              {shareholders.map((s) => {
                const className = shareClasses.find((c) => c.id === s.share_class_id)?.name ?? "-";
                return (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink-800">{s.name}</div>
                      {s.email && (
                        <div className="text-xs text-ink-500">{s.email}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          ROLE_COLORS[s.role] || "bg-surface-100 text-ink-600",
                        )}
                      >
                        {ROLES.find((r) => r.value === s.role)?.label ?? s.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-600">{className}</td>
                    <td className="px-5 py-3 text-right font-mono text-ink-800">
                      {fmtNum(Number(s.shares_held))}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-ink-800">
                      {s.fully_diluted_pct?.toFixed(2) ?? "0.00"}%
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-ink-800">
                      {Number(s.vested_pct)?.toFixed(0) ?? "0"}%
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingShareholder(s);
                            setShowAddShareholder(true);
                          }}
                          disabled={busy}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer disabled:opacity-50"
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteShareholder(s.id)}
                          disabled={busy}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Shareholder form */}
      {showAddShareholder && (
        <ShareholderForm
          shareClasses={shareClasses}
          editing={editingShareholder}
          busy={busy}
          onSubmit={async (values) => {
            if (editingShareholder) {
              await apiPost("update_shareholder", {
                shareholderId: editingShareholder.id,
                ...values,
              });
            } else {
              await apiPost("add_shareholder", values);
            }
            setShowAddShareholder(false);
            setEditingShareholder(null);
          }}
          onCancel={() => {
            setShowAddShareholder(false);
            setEditingShareholder(null);
          }}
        />
      )}

      {/* ================================================================ */}
      {/* Section 3: Share Classes */}
      {/* ================================================================ */}
      <div className="rounded-2xl border border-surface-200 bg-white">
        <button
          type="button"
          onClick={() => setClassesOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 border-b border-surface-200 cursor-pointer"
        >
          <h2 className="text-lg font-semibold text-ink-800">Share Classes</h2>
          {classesOpen ? (
            <ChevronUp className="h-4 w-4 text-ink-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-500" />
          )}
        </button>

        {classesOpen && (
          <div className="p-5 space-y-4">
            {shareClasses.length === 0 && (
              <p className="text-sm text-ink-500">
                No share classes defined. Add your first share class (e.g. Ordinary shares).
              </p>
            )}
            {shareClasses.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-semibold text-ink-800">{c.name}</span>
                  <span className="ml-2 text-ink-500 text-xs capitalize">
                    ({c.class_type})
                  </span>
                </div>
                <div className="text-ink-600">
                  Authorized: <span className="font-mono font-medium">{fmtNum(Number(c.total_authorized))}</span>
                </div>
                <div className="text-ink-600">
                  Price: <span className="font-mono font-medium">${Number(c.price_per_share).toFixed(4)}</span>
                </div>
                <div className="text-ink-600">
                  Voting: {c.voting_rights ? "Yes" : "No"}
                </div>
                {c.dividend_preference != null && (
                  <div className="text-ink-600">
                    Dividend Pref: {c.dividend_preference}%
                  </div>
                )}
                {c.liquidation_preference != null && (
                  <div className="text-ink-600">
                    Liq. Pref: {c.liquidation_preference}x
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setShowAddClass(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Class
            </button>
          </div>
        )}
      </div>

      {/* Add Class form */}
      {showAddClass && (
        <ClassForm
          busy={busy}
          onSubmit={async (values) => {
            await apiPost("add_class", values);
            setShowAddClass(false);
          }}
          onCancel={() => setShowAddClass(false)}
        />
      )}

      {/* ================================================================ */}
      {/* Section 4: ESOP Pool */}
      {/* ================================================================ */}
      <div className="rounded-2xl border border-surface-200 bg-white">
        <button
          type="button"
          onClick={() => setEsopOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 border-b border-surface-200 cursor-pointer"
        >
          <h2 className="text-lg font-semibold text-ink-800">ESOP Pool</h2>
          {esopOpen ? (
            <ChevronUp className="h-4 w-4 text-ink-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-500" />
          )}
        </button>

        {esopOpen && (
          <div className="p-5">
            {esopPool ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-ink-500">Total Pool</p>
                  <p className="font-mono font-semibold text-ink-800">
                    {fmtNum(Number(esopPool.total_pool_shares))}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Allocated</p>
                  <p className="font-mono font-semibold text-ink-800">
                    {fmtNum(Number(esopPool.allocated_shares))}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Available</p>
                  <p className="font-mono font-semibold text-emerald-700">
                    {fmtNum(summary.esopAvailable)}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Pool %</p>
                  <p className="font-mono font-semibold text-ink-800">
                    {esopPool.pool_pct}%
                  </p>
                </div>
                {/* Utilization bar */}
                <div className="col-span-full">
                  <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{
                        width: `${
                          Number(esopPool.total_pool_shares) > 0
                            ? (Number(esopPool.allocated_shares) /
                                Number(esopPool.total_pool_shares)) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-ink-500 mt-1">
                    {Number(esopPool.total_pool_shares) > 0
                      ? (
                          (Number(esopPool.allocated_shares) /
                            Number(esopPool.total_pool_shares)) *
                          100
                        ).toFixed(1)
                      : "0.0"}
                    % utilized
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-ink-500 mb-3">
                  ESOP pool has not been configured yet.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSetupEsop(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Setup ESOP
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup ESOP form */}
      {showSetupEsop && (
        <EsopForm
          busy={busy}
          totalIssued={summary.totalIssued}
          onSubmit={async (values) => {
            await apiPost("setup_esop", values);
            setShowSetupEsop(false);
          }}
          onCancel={() => setShowSetupEsop(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-lg font-bold text-ink-800 font-mono">{value}</p>
      {sub && <p className="text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shareholder form
// ---------------------------------------------------------------------------

function ShareholderForm({
  shareClasses,
  editing,
  busy,
  onSubmit,
  onCancel,
}: {
  shareClasses: ShareClass[];
  editing: Shareholder | null;
  busy: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(editing?.name ?? "");
  const [email, setEmail] = React.useState(editing?.email ?? "");
  const [role, setRole] = React.useState(editing?.role ?? "founder");
  const [shareClassId, setShareClassId] = React.useState(
    editing?.share_class_id ?? (shareClasses[0]?.id ?? ""),
  );
  const [sharesHeld, setSharesHeld] = React.useState(
    editing ? String(Number(editing.shares_held)) : "0",
  );
  const [vestingMonths, setVestingMonths] = React.useState(
    String(editing?.vesting_months ?? 48),
  );
  const [cliffMonths, setCliffMonths] = React.useState(
    String(editing?.cliff_months ?? 12),
  );
  const [vestingStart, setVestingStart] = React.useState(
    editing?.vesting_start ?? "",
  );
  const [notes, setNotes] = React.useState(editing?.notes ?? "");

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-800">
          {editing ? "Edit Shareholder" : "Add Shareholder"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Name *">
          <input
            className={INPUT_CLS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
          />
        </Field>
        <Field label="Email">
          <input
            className={INPUT_CLS}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </Field>
        <Field label="Role">
          <select
            className={INPUT_CLS}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Share Class">
          <select
            className={INPUT_CLS}
            value={shareClassId}
            onChange={(e) => setShareClassId(e.target.value)}
          >
            <option value="">- None -</option>
            {shareClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Shares">
          <input
            className={`${INPUT_CLS} font-mono`}
            type="number"
            min={0}
            value={sharesHeld}
            onChange={(e) => setSharesHeld(e.target.value)}
          />
        </Field>
        <Field label="Vesting Start">
          <input
            className={INPUT_CLS}
            type="date"
            value={vestingStart}
            onChange={(e) => setVestingStart(e.target.value)}
          />
        </Field>
        <Field label="Vesting Months">
          <input
            className={`${INPUT_CLS} font-mono`}
            type="number"
            min={0}
            value={vestingMonths}
            onChange={(e) => setVestingMonths(e.target.value)}
          />
        </Field>
        <Field label="Cliff Months">
          <input
            className={`${INPUT_CLS} font-mono`}
            type="number"
            min={0}
            value={cliffMonths}
            onChange={(e) => setCliffMonths(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <input
            className={INPUT_CLS}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </Field>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              email: email.trim() || null,
              role,
              shareClassId: shareClassId || null,
              sharesHeld: Number(sharesHeld) || 0,
              vestingStart: vestingStart || null,
              vestingMonths: Number(vestingMonths) || 48,
              cliffMonths: Number(cliffMonths) || 12,
              notes: notes.trim() || null,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Save Changes" : "Add Shareholder"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[10px] border border-surface-300 bg-white px-5 py-2 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share class form
// ---------------------------------------------------------------------------

function ClassForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("Ordinary");
  const [classType, setClassType] = React.useState("ordinary");
  const [totalAuthorized, setTotalAuthorized] = React.useState("10000000");
  const [pricePerShare, setPricePerShare] = React.useState("0.001");
  const [votingRights, setVotingRights] = React.useState(true);
  const [dividendPreference, setDividendPreference] = React.useState("");
  const [liquidationPreference, setLiquidationPreference] = React.useState("");

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-800">Add Share Class</h3>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Class Name *">
          <input
            className={INPUT_CLS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ordinary"
          />
        </Field>
        <Field label="Type">
          <select
            className={INPUT_CLS}
            value={classType}
            onChange={(e) => setClassType(e.target.value)}
          >
            {CLASS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Total Authorized">
          <input
            className={`${INPUT_CLS} font-mono`}
            type="number"
            min={1}
            value={totalAuthorized}
            onChange={(e) => setTotalAuthorized(e.target.value)}
          />
        </Field>
        <Field label="Price per Share ($)">
          <input
            className={`${INPUT_CLS} font-mono`}
            type="number"
            min={0}
            step={0.0001}
            value={pricePerShare}
            onChange={(e) => setPricePerShare(e.target.value)}
          />
        </Field>
        <Field label="Voting Rights">
          <select
            className={INPUT_CLS}
            value={votingRights ? "yes" : "no"}
            onChange={(e) => setVotingRights(e.target.value === "yes")}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {classType === "preference" && (
          <>
            <Field label="Dividend Preference (%)">
              <input
                className={`${INPUT_CLS} font-mono`}
                type="number"
                min={0}
                step={0.01}
                value={dividendPreference}
                onChange={(e) => setDividendPreference(e.target.value)}
                placeholder="e.g. 8.00"
              />
            </Field>
            <Field label="Liquidation Preference (x)">
              <input
                className={`${INPUT_CLS} font-mono`}
                type="number"
                min={0}
                step={0.01}
                value={liquidationPreference}
                onChange={(e) => setLiquidationPreference(e.target.value)}
                placeholder="e.g. 1.00"
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              classType,
              totalAuthorized: Number(totalAuthorized) || 10000000,
              pricePerShare: Number(pricePerShare) || 0.001,
              votingRights,
              dividendPreference: dividendPreference ? Number(dividendPreference) : null,
              liquidationPreference: liquidationPreference ? Number(liquidationPreference) : null,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Class
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[10px] border border-surface-300 bg-white px-5 py-2 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ESOP form
// ---------------------------------------------------------------------------

function EsopForm({
  busy,
  totalIssued,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  totalIssued: number;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [poolPct, setPoolPct] = React.useState("10");
  const computedShares = Math.round(
    (totalIssued * Number(poolPct || 0)) / (100 - Number(poolPct || 0)) || 0,
  );

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-800">Setup ESOP Pool</h3>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pool % of Cap Table">
          <input
            className={`${INPUT_CLS} font-mono`}
            type="number"
            min={1}
            max={50}
            value={poolPct}
            onChange={(e) => setPoolPct(e.target.value)}
          />
        </Field>
        <Field label="Total Pool Shares (computed)">
          <input
            className={`${INPUT_CLS} font-mono bg-surface-50`}
            type="number"
            readOnly
            value={computedShares || 0}
          />
          <p className="text-xs text-ink-500 mt-1">
            Based on {fmtNum(totalIssued)} issued shares and {poolPct}% pool
          </p>
        </Field>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={busy || computedShares <= 0}
          onClick={() =>
            onSubmit({
              totalPoolShares: computedShares,
              poolPct: Number(poolPct) || 10,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Setup ESOP
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[10px] border border-surface-300 bg-white px-5 py-2 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

const INPUT_CLS =
  "w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-600 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
