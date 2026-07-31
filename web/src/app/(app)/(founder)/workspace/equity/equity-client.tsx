"use client";

import * as React from "react";
import {
  Clock,
  Edit3,
  Loader2,
  PieChart,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (mirrors server types)
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  email: string | null;
  role: string;
  equityPct: number;
  vestingMonths: number | null;
  cliffMonths: number | null;
  vestingStartDate: string | null;
  isActive: boolean;
  vestedPct: number;
  unvestedPct: number;
}

interface EquityEvent {
  id: string;
  projectId: string;
  memberId: string | null;
  type: string;
  equityPct: number;
  description: string | null;
  date: string;
  createdAt: string;
}

interface EquitySummary {
  totalAllocated: number;
  unallocated: number;
  members: TeamMember[];
  events: EquityEvent[];
}

interface EquityClientProps {
  projectId: string;
  projectName: string;
  initialSummary: EquitySummary;
}

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

const ROLES = [
  { value: "founder", label: "Founder" },
  { value: "cofounder", label: "Co-Founder" },
  { value: "advisor", label: "Advisor" },
  { value: "employee", label: "Employee" },
  { value: "investor", label: "Investor" },
  { value: "pool", label: "ESOP Pool" },
];

const ROLE_COLORS: Record<string, string> = {
  founder: "bg-brand-100 text-brand-700",
  cofounder: "bg-violet-100 text-violet-700",
  advisor: "bg-amber-100 text-amber-700",
  employee: "bg-emerald-100 text-emerald-700",
  investor: "bg-sky-100 text-sky-700",
  pool: "bg-surface-200 text-ink-600",
};

// Donut chart colors
const CHART_COLORS = [
  "#4f46e5", // brand/indigo
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#059669", // emerald
  "#d97706", // amber
  "#e11d48", // rose
  "#6366f1", // indigo lighter
  "#8b5cf6", // violet lighter
];

const UNALLOCATED_COLOR = "#e2e8f0"; // slate-200

// ---------------------------------------------------------------------------
// Event type labels
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<string, string> = {
  grant: "Grant",
  vest: "Vest",
  transfer: "Transfer",
  dilution: "Dilution",
  exercise: "Exercise",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  grant: "bg-emerald-100 text-emerald-700",
  vest: "bg-brand-100 text-brand-700",
  transfer: "bg-amber-100 text-amber-700",
  dilution: "bg-rose-100 text-rose-700",
  exercise: "bg-sky-100 text-sky-700",
};

// ---------------------------------------------------------------------------
// Donut chart (SVG)
// ---------------------------------------------------------------------------

function DonutChart({
  members,
  unallocated,
}: {
  members: TeamMember[];
  unallocated: number;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 75;
  const strokeWidth = 32;

  // Build segments
  const segments: Array<{ label: string; pct: number; color: string }> = [];
  members.forEach((m, i) => {
    if (m.equityPct > 0) {
      segments.push({
        label: m.name,
        pct: m.equityPct,
        color: CHART_COLORS[i % CHART_COLORS.length],
      });
    }
  });
  if (unallocated > 0) {
    segments.push({
      label: "Unallocated",
      pct: unallocated,
      color: UNALLOCATED_COLOR,
    });
  }

  // If nothing to show
  if (segments.length === 0) {
    segments.push({ label: "Unallocated", pct: 100, color: UNALLOCATED_COLOR });
  }

  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {segments.map((seg, i) => {
          const dashLength = (seg.pct / 100) * circumference;
          const dashGap = circumference - dashLength;
          const offset = cumulativeOffset;
          cumulativeOffset += dashLength;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${dashGap}`}
              strokeDashoffset={-offset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-ink-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="truncate max-w-[120px]">{seg.label}</span>
            <span className="font-medium text-ink-800">{seg.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vesting Progress Bar
// ---------------------------------------------------------------------------

function VestingBar({ member }: { member: TeamMember }) {
  if (!member.vestingMonths || !member.vestingStartDate) return null;

  const start = new Date(member.vestingStartDate);
  const now = new Date();
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth()),
  );
  const totalMonths = member.vestingMonths;
  const cliffMonths = member.cliffMonths ?? 0;
  const progressPct = Math.min(100, (monthsElapsed / totalMonths) * 100);
  const cliffPct = (cliffMonths / totalMonths) * 100;
  const cliffPassed = monthsElapsed >= cliffMonths;

  // Next milestone
  let milestone = "";
  if (!cliffPassed) {
    const remaining = cliffMonths - monthsElapsed;
    milestone = `Cliff in ${remaining} month${remaining !== 1 ? "s" : ""}`;
  } else if (monthsElapsed < totalMonths) {
    const remaining = totalMonths - monthsElapsed;
    milestone = `${remaining} month${remaining !== 1 ? "s" : ""} remaining`;
  } else {
    milestone = "Fully vested";
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="relative h-2.5 bg-surface-100 rounded-full overflow-hidden">
        {/* Cliff marker */}
        {cliffMonths > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-ink-300 z-10"
            style={{ left: `${cliffPct}%` }}
          />
        )}
        {/* Progress */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500",
            cliffPassed ? "bg-brand-500" : "bg-surface-300",
          )}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-ink-500">
        <span>
          {monthsElapsed} of {totalMonths} months vested
        </span>
        <span className={cn(cliffPassed ? "text-brand-600" : "text-amber-600", "font-medium")}>
          {milestone}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Member Modal
// ---------------------------------------------------------------------------

interface MemberFormData {
  name: string;
  email: string;
  role: string;
  equityPct: string;
  hasVesting: boolean;
  vestingMonths: string;
  cliffMonths: string;
  vestingStartDate: string;
}

const EMPTY_FORM: MemberFormData = {
  name: "",
  email: "",
  role: "founder",
  equityPct: "",
  hasVesting: false,
  vestingMonths: "48",
  cliffMonths: "12",
  vestingStartDate: new Date().toISOString().split("T")[0],
};

function MemberModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
  editMember,
  maxEquity,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MemberFormData) => void;
  loading: boolean;
  error: string | null;
  editMember: TeamMember | null;
  maxEquity: number;
}) {
  const [form, setForm] = React.useState<MemberFormData>(EMPTY_FORM);

  React.useEffect(() => {
    if (editMember) {
      setForm({
        name: editMember.name,
        email: editMember.email ?? "",
        role: editMember.role,
        equityPct: editMember.equityPct.toString(),
        hasVesting: !!editMember.vestingMonths,
        vestingMonths: editMember.vestingMonths?.toString() ?? "48",
        cliffMonths: editMember.cliffMonths?.toString() ?? "12",
        vestingStartDate:
          editMember.vestingStartDate ?? new Date().toISOString().split("T")[0],
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editMember, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const equityNum = parseFloat(form.equityPct) || 0;
  const maxAllowed = editMember
    ? maxEquity + editMember.equityPct
    : maxEquity;
  const overLimit = equityNum > maxAllowed;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 className="text-lg font-bold text-ink-800">
            {editMember ? "Edit Member" : "Add Team Member"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Alice Chen"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Email <span className="text-ink-400 text-xs">(optional)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="alice@example.com"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Role <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors cursor-pointer"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Equity % */}
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Equity % <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                required
                step="0.01"
                min="0"
                max="100"
                value={form.equityPct}
                onChange={(e) => setForm({ ...form, equityPct: e.target.value })}
                placeholder="e.g. 25"
                className={cn(
                  "w-full h-10 rounded-xl border px-3 pr-8 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 transition-colors",
                  overLimit
                    ? "border-rose-300 focus:ring-rose-200 focus:border-rose-400"
                    : "border-surface-200 focus:ring-brand-200 focus:border-brand-400",
                )}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                %
              </span>
            </div>
            {overLimit && (
              <p className="text-xs text-rose-600 mt-1">
                Maximum available: {maxAllowed.toFixed(2)}%
              </p>
            )}
            <p className="text-xs text-ink-500 mt-1">
              Available: {maxAllowed.toFixed(2)}% unallocated
            </p>
          </div>

          {/* Vesting toggle */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasVesting}
                onChange={(e) =>
                  setForm({ ...form, hasVesting: e.target.checked })
                }
                className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-200 cursor-pointer"
              />
              <span className="text-sm font-medium text-ink-700">
                Enable vesting schedule
              </span>
            </label>
          </div>

          {/* Vesting details */}
          {form.hasVesting && (
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Vesting months */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">
                    Total Months
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={form.vestingMonths}
                    onChange={(e) =>
                      setForm({ ...form, vestingMonths: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                  />
                </div>

                {/* Cliff months */}
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">
                    Cliff (Months)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="48"
                    value={form.cliffMonths}
                    onChange={(e) =>
                      setForm({ ...form, cliffMonths: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                  />
                </div>
              </div>

              {/* Start date */}
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1">
                  Vesting Start Date
                </label>
                <input
                  type="date"
                  value={form.vestingStartDate}
                  onChange={(e) =>
                    setForm({ ...form, vestingStartDate: e.target.value })
                  }
                  className="w-full h-9 rounded-lg border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || overLimit || !form.name.trim() || !form.equityPct}
              className="flex-1 h-10 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
              ) : editMember ? (
                "Save Changes"
              ) : (
                <>
                  <UserPlus strokeWidth={1.75} className="h-4 w-4" />
                  Add Member
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EquityClient({
  projectId,
  projectName,
  initialSummary,
}: EquityClientProps) {
  const [summary, setSummary] = React.useState<EquitySummary>(initialSummary);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editMember, setEditMember] = React.useState<TeamMember | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);

  // Refresh data from server
  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/equity?projectId=${projectId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok) {
          setSummary({
            totalAllocated: json.totalAllocated,
            unallocated: json.unallocated,
            members: json.members,
            events: json.events,
          });
        }
      }
    } catch {
      // Silently ignore
    }
  }, [projectId]);

  // Add or update member
  const handleSubmit = async (data: MemberFormData) => {
    setLoading(true);
    setFormError(null);

    try {
      const equityPct = parseFloat(data.equityPct);
      if (isNaN(equityPct) || equityPct <= 0) {
        setFormError("Equity percentage must be greater than 0");
        return;
      }

      if (editMember) {
        // PATCH
        const res = await fetch(`/api/equity/${editMember.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name.trim(),
            email: data.email.trim() || undefined,
            role: data.role,
            equityPct,
            vestingMonths: data.hasVesting
              ? parseInt(data.vestingMonths) || null
              : null,
            cliffMonths: data.hasVesting
              ? parseInt(data.cliffMonths) || null
              : null,
            vestingStartDate: data.hasVesting
              ? data.vestingStartDate || null
              : null,
          }),
        });
        const json = await res.json();
        if (!json.ok) {
          setFormError(json.error ?? "Failed to update member");
          return;
        }
      } else {
        // POST
        const res = await fetch("/api/equity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            name: data.name.trim(),
            email: data.email.trim() || undefined,
            role: data.role,
            equityPct,
            vestingMonths: data.hasVesting
              ? parseInt(data.vestingMonths) || undefined
              : undefined,
            cliffMonths: data.hasVesting
              ? parseInt(data.cliffMonths) || undefined
              : undefined,
            vestingStartDate: data.hasVesting
              ? data.vestingStartDate || undefined
              : undefined,
          }),
        });
        const json = await res.json();
        if (!json.ok) {
          setFormError(json.error ?? "Failed to add member");
          return;
        }
      }

      setModalOpen(false);
      setEditMember(null);
      await refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Remove member
  const handleRemove = async (memberId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/equity/${memberId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setDeleteConfirm(null);
        await refresh();
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const { members, unallocated, totalAllocated, events } = summary;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Cap Table</h1>
          <p className="text-sm text-ink-500 mt-0.5">{projectName}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditMember(null);
            setFormError(null);
            setModalOpen(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
        >
          <Plus strokeWidth={1.75} className="h-4 w-4" />
          Add Member
        </button>
      </div>

      {/* Overview cards + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Donut chart */}
        <div className="lg:col-span-1 rounded-2xl border border-surface-200 bg-white p-6 flex flex-col items-center justify-center">
          <DonutChart members={members} unallocated={unallocated} />
        </div>

        {/* Stats cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <PieChart strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Allocated
              </span>
            </div>
            <p className="text-2xl font-bold text-ink-800">
              {totalAllocated.toFixed(1)}%
            </p>
            <p className="text-xs text-ink-500 mt-1">
              of total equity assigned
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <PieChart strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Available
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {unallocated.toFixed(1)}%
            </p>
            <p className="text-xs text-ink-500 mt-1">
              unallocated equity remaining
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <Users strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Members
              </span>
            </div>
            <p className="text-2xl font-bold text-ink-800">{members.length}</p>
            <p className="text-xs text-ink-500 mt-1">
              active team members
            </p>
          </div>

          {/* Allocation bar */}
          <div className="sm:col-span-3 rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-500 mb-3">
              Equity Distribution
            </p>
            <div className="h-4 bg-surface-100 rounded-full overflow-hidden flex">
              {members.map((m, i) =>
                m.equityPct > 0 ? (
                  <div
                    key={m.id}
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${m.equityPct}%`,
                      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                    }}
                    title={`${m.name}: ${m.equityPct}%`}
                  />
                ) : null,
              )}
              {unallocated > 0 && (
                <div
                  className="h-full bg-surface-200"
                  style={{ width: `${unallocated}%` }}
                  title={`Unallocated: ${unallocated.toFixed(1)}%`}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Team members table */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-800">Team Members</h2>
          <span className="text-xs text-ink-500">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
        </div>

        {members.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users
              strokeWidth={1.25}
              className="mx-auto h-10 w-10 text-ink-300 mb-3"
            />
            <p className="text-sm text-ink-500">
              No team members yet. Add your first member to start building your
              cap table.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Equity&nbsp;%
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Vested
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Unvested
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Cliff
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const cliffStatus = !m.vestingMonths
                    ? "\u2014"
                    : !m.vestingStartDate
                      ? "\u2014"
                      : (() => {
                          const start = new Date(m.vestingStartDate);
                          const now = new Date();
                          const elapsed =
                            (now.getFullYear() - start.getFullYear()) * 12 +
                            (now.getMonth() - start.getMonth());
                          return elapsed >= (m.cliffMonths ?? 0)
                            ? "Passed"
                            : `${(m.cliffMonths ?? 0) - elapsed}m left`;
                        })();

                  return (
                    <tr
                      key={m.id}
                      className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <div>
                          <p className="font-medium text-ink-800">{m.name}</p>
                          {m.email && (
                            <p className="text-xs text-ink-400 mt-0.5">
                              {m.email}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                            ROLE_COLORS[m.role] ?? "bg-surface-100 text-ink-600",
                          )}
                        >
                          {ROLES.find((r) => r.value === m.role)?.label ?? m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-ink-800 tabular-nums">
                        {m.equityPct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-brand-600 font-medium">
                        {m.vestingMonths ? `${m.vestedPct.toFixed(2)}%` : "\u2014"}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-ink-500">
                        {m.vestingMonths ? `${m.unvestedPct.toFixed(2)}%` : "\u2014"}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            cliffStatus === "Passed"
                              ? "text-emerald-600"
                              : cliffStatus === "\u2014"
                                ? "text-ink-400"
                                : "text-amber-600",
                          )}
                        >
                          {cliffStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditMember(m);
                              setFormError(null);
                              setModalOpen(true);
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
                            title="Edit member"
                          >
                            <Edit3 strokeWidth={1.75} className="h-3.5 w-3.5" />
                          </button>
                          {deleteConfirm === m.id ? (
                            <button
                              type="button"
                              onClick={() => handleRemove(m.id)}
                              disabled={loading}
                              className="h-7 px-2 flex items-center justify-center rounded-lg text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(m.id)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remove member"
                            >
                              <Trash2
                                strokeWidth={1.75}
                                className="h-3.5 w-3.5"
                              />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vesting Timeline */}
      {members.some((m) => m.vestingMonths) && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <Clock strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Vesting Timeline
            </h2>
          </div>
          <div className="divide-y divide-surface-100">
            {members
              .filter((m) => m.vestingMonths)
              .map((m) => (
                <div key={m.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-ink-800">
                        {m.name}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                          ROLE_COLORS[m.role] ?? "bg-surface-100 text-ink-600",
                        )}
                      >
                        {ROLES.find((r) => r.value === m.role)?.label ?? m.role}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-ink-800 tabular-nums">
                      {m.equityPct.toFixed(2)}%
                    </span>
                  </div>
                  <VestingBar member={m} />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Equity Events Log */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-base font-bold text-ink-800">Equity Events</h2>
        </div>

        {events.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-ink-500">
              No equity events recorded yet. Add team members to see the event
              log.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="px-6 py-3.5 flex items-center gap-4"
              >
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium shrink-0",
                    EVENT_TYPE_COLORS[ev.type] ?? "bg-surface-100 text-ink-600",
                  )}
                >
                  {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                </span>
                <span className="flex-1 text-sm text-ink-700 truncate">
                  {ev.description ?? `${ev.type} of ${ev.equityPct}%`}
                </span>
                <span className="text-xs text-ink-400 shrink-0 tabular-nums">
                  {ev.date}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <MemberModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditMember(null);
          setFormError(null);
        }}
        onSubmit={handleSubmit}
        loading={loading}
        error={formError}
        editMember={editMember}
        maxEquity={unallocated}
      />
    </>
  );
}
