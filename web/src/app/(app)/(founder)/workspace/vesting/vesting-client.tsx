"use client";

import * as React from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Plus,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeVestingTimeline,
  getCurrentVested,
  type VestingSchedule,
  type VestingSnapshot,
} from "@/lib/vesting";
import { VestingChart } from "@/components/workspace/vesting-chart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DBSchedule {
  id: string;
  cap_table_id: string;
  shareholder_name: string;
  shareholder_email: string | null;
  grant_date: string;
  total_shares: number;
  vested_shares: number;
  vesting_type: "linear" | "back_weighted" | "front_weighted" | "milestone";
  cliff_months: number;
  total_months: number;
  single_trigger: boolean;
  double_trigger: boolean;
  status: "active" | "completed" | "terminated" | "accelerated";
  notes: string | null;
  created_at: string;
}

interface GrantForm {
  shareholderName: string;
  shareholderEmail: string;
  totalShares: string;
  vestingType: VestingSchedule["vestingType"];
  cliffMonths: string;
  totalMonths: string;
  grantDate: string;
  singleTrigger: boolean;
  doubleTrigger: boolean;
  notes: string;
}

const EMPTY_FORM: GrantForm = {
  shareholderName: "",
  shareholderEmail: "",
  totalShares: "",
  vestingType: "linear",
  cliffMonths: "12",
  totalMonths: "48",
  grantDate: new Date().toISOString().split("T")[0],
  singleTrigger: false,
  doubleTrigger: false,
  notes: "",
};

const VESTING_TYPE_LABELS: Record<VestingSchedule["vestingType"], string> = {
  linear: "Linear",
  front_weighted: "Front-weighted",
  back_weighted: "Back-weighted",
  milestone: "Milestone",
};

const STATUS_STYLES: Record<
  DBSchedule["status"],
  { bg: string; text: string; label: string }
> = {
  active: { bg: "bg-brand-100", text: "text-brand-700", label: "Active" },
  completed: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    label: "Completed",
  },
  terminated: { bg: "bg-rose-100", text: "text-rose-700", label: "Terminated" },
  accelerated: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    label: "Accelerated",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toVestingSchedule(db: DBSchedule): VestingSchedule {
  return {
    id: db.id,
    shareholderName: db.shareholder_name,
    grantDate: db.grant_date,
    totalShares: Number(db.total_shares),
    vestedShares: Number(db.vested_shares),
    vestingType: db.vesting_type as VestingSchedule["vestingType"],
    cliffMonths: db.cliff_months,
    totalMonths: db.total_months,
    singleTrigger: db.single_trigger,
    doubleTrigger: db.double_trigger,
    status: db.status as VestingSchedule["status"],
  };
}

// ---------------------------------------------------------------------------
// Schedule Row (expandable)
// ---------------------------------------------------------------------------

function ScheduleRow({ db }: { db: DBSchedule }) {
  const [expanded, setExpanded] = React.useState(false);
  const schedule = toVestingSchedule(db);
  const current = getCurrentVested(schedule);
  const timeline = computeVestingTimeline(schedule);
  const style = STATUS_STYLES[db.status];

  // Find next cliff date
  const cliffSnap = timeline.find((s) => s.isCliff);
  const now = new Date();
  const cliffDate = cliffSnap ? new Date(cliffSnap.date) : null;
  const cliffPassed = cliffDate ? cliffDate <= now : true;

  // Monthly vest amount (post-cliff)
  const postCliffSnaps = timeline.filter(
    (s) => s.month > schedule.cliffMonths && s.sharesVested > 0,
  );
  const avgMonthlyVest =
    postCliffSnaps.length > 0
      ? postCliffSnaps.reduce((sum, s) => sum + s.sharesVested, 0) /
        postCliffSnaps.length
      : 0;

  return (
    <div className="border-b border-surface-100 last:border-b-0">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-50/50 transition-colors cursor-pointer text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-ink-800 truncate">
              {db.shareholder_name}
            </p>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0",
                style.bg,
                style.text,
              )}
            >
              {style.label}
            </span>
          </div>
          <p className="text-xs text-ink-500">
            {VESTING_TYPE_LABELS[schedule.vestingType]} &middot;{" "}
            {schedule.totalMonths}mo &middot; {schedule.cliffMonths}mo cliff
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-40 shrink-0 hidden sm:block">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-ink-600 tabular-nums font-medium">
              {current.percent.toFixed(1)}%
            </span>
            <span className="text-[10px] text-ink-400">
              {Math.round(current.vested).toLocaleString()} /{" "}
              {schedule.totalShares.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                db.status === "completed"
                  ? "bg-emerald-500"
                  : db.status === "terminated"
                    ? "bg-rose-400"
                    : "bg-brand-500",
              )}
              style={{ width: `${Math.min(current.percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Next cliff / monthly vest */}
        <div className="w-28 shrink-0 text-right hidden md:block">
          {!cliffPassed ? (
            <div>
              <p className="text-[10px] text-ink-400 uppercase tracking-wider">
                Cliff
              </p>
              <p className="text-xs font-medium text-amber-600">
                {cliffDate?.toLocaleDateString("en-AU", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] text-ink-400 uppercase tracking-wider">
                Monthly
              </p>
              <p className="text-xs font-medium text-ink-700 tabular-nums">
                {Math.round(avgMonthlyVest).toLocaleString()} shares
              </p>
            </div>
          )}
        </div>

        {expanded ? (
          <ChevronUp strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
        ) : (
          <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-6 pb-6 pt-2 space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3">
              <p className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">
                Grant Date
              </p>
              <p className="text-sm font-semibold text-ink-800">
                {new Date(db.grant_date).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3">
              <p className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">
                Months Elapsed
              </p>
              <p className="text-sm font-semibold text-ink-800">
                {current.monthsElapsed} / {schedule.totalMonths}
              </p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3">
              <p className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">
                Vested Shares
              </p>
              <p className="text-sm font-semibold text-emerald-700">
                {Math.round(current.vested).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3">
              <p className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">
                Triggers
              </p>
              <p className="text-sm font-semibold text-ink-800">
                {schedule.singleTrigger
                  ? "Single"
                  : schedule.doubleTrigger
                    ? "Double"
                    : "None"}
              </p>
            </div>
          </div>

          {/* Chart */}
          <VestingChart
            timeline={timeline}
            currentMonth={current.monthsElapsed}
            cliffMonth={schedule.cliffMonths}
          />

          {/* Notes */}
          {db.notes && (
            <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
              <p className="text-xs text-ink-500 mb-1">Notes</p>
              <p className="text-sm text-ink-700">{db.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Grant Form
// ---------------------------------------------------------------------------

function AddGrantForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = React.useState<GrantForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function update<K extends keyof GrantForm>(key: K, value: GrantForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const totalShares = parseInt(form.totalShares);
    if (!totalShares || totalShares <= 0) {
      setError("Total shares must be greater than 0.");
      setSubmitting(false);
      return;
    }
    if (!form.shareholderName.trim()) {
      setError("Shareholder name is required.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/vesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareholderName: form.shareholderName.trim(),
          shareholderEmail: form.shareholderEmail.trim() || null,
          totalShares,
          vestingType: form.vestingType,
          cliffMonths: parseInt(form.cliffMonths) || 12,
          totalMonths: parseInt(form.totalMonths) || 48,
          grantDate: form.grantDate,
          singleTrigger: form.singleTrigger,
          doubleTrigger: form.doubleTrigger,
          notes: form.notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to create vesting schedule.");
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-surface-200 bg-white overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink-800">
          Add New Vesting Grant
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
        >
          <X strokeWidth={1.75} className="h-4 w-4" />
        </button>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            <AlertCircle strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Shareholder info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Shareholder Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.shareholderName}
              onChange={(e) => update("shareholderName", e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={form.shareholderEmail}
              onChange={(e) => update("shareholderEmail", e.target.value)}
              placeholder="jane@company.com"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
        </div>

        {/* Grant parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Total Shares <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              required
              value={form.totalShares}
              onChange={(e) => update("totalShares", e.target.value)}
              placeholder="e.g. 100000"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Grant Date
            </label>
            <input
              type="date"
              value={form.grantDate}
              onChange={(e) => update("grantDate", e.target.value)}
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Vesting Type
            </label>
            <select
              value={form.vestingType}
              onChange={(e) =>
                update(
                  "vestingType",
                  e.target.value as VestingSchedule["vestingType"],
                )
              }
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            >
              {Object.entries(VESTING_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Cliff Period (months)
            </label>
            <input
              type="number"
              min="0"
              max="48"
              value={form.cliffMonths}
              onChange={(e) => update("cliffMonths", e.target.value)}
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Total Vesting Period (months)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={form.totalMonths}
              onChange={(e) => update("totalMonths", e.target.value)}
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>
        </div>

        {/* Triggers */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.singleTrigger}
              onChange={(e) => update("singleTrigger", e.target.checked)}
              className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-ink-700">Single Trigger</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.doubleTrigger}
              onChange={(e) => update("doubleTrigger", e.target.checked)}
              className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-ink-700">Double Trigger</span>
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">
            Notes
          </label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Optional notes about this grant..."
            className="w-full rounded-xl border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {submitting ? (
              <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
            ) : (
              <Check strokeWidth={1.75} className="h-4 w-4" />
            )}
            {submitting ? "Creating..." : "Create Grant"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 px-5 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function VestingDashboard() {
  const [schedules, setSchedules] = React.useState<DBSchedule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  const fetchSchedules = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vesting");
      if (!res.ok) throw new Error("Failed to fetch vesting schedules");
      const json = await res.json();
      if (json.ok) {
        setSchedules(json.schedules ?? []);
      } else {
        setError(json.error ?? "Failed to load schedules.");
      }
    } catch {
      setError("Failed to load vesting schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Summary stats
  const activeCount = schedules.filter((s) => s.status === "active").length;
  const completedCount = schedules.filter(
    (s) => s.status === "completed",
  ).length;
  const totalSharesGranted = schedules.reduce(
    (sum, s) => sum + Number(s.total_shares),
    0,
  );
  const totalVested = schedules.reduce(
    (sum, s) => sum + Number(s.vested_shares),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Vesting Schedules</h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Track and manage equity vesting for all stakeholders.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Add Grant
          </button>
        )}
      </div>

      {/* Summary cards */}
      {schedules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-surface-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock strokeWidth={1.75} className="h-4 w-4 text-brand-500" />
              <span className="text-[10px] text-ink-400 uppercase tracking-wider">
                Active
              </span>
            </div>
            <p className="text-xl font-bold text-ink-800 tabular-nums">
              {activeCount}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-surface-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Check strokeWidth={1.75} className="h-4 w-4 text-emerald-500" />
              <span className="text-[10px] text-ink-400 uppercase tracking-wider">
                Completed
              </span>
            </div>
            <p className="text-xl font-bold text-ink-800 tabular-nums">
              {completedCount}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-surface-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-ink-400" />
              <span className="text-[10px] text-ink-400 uppercase tracking-wider">
                Granted
              </span>
            </div>
            <p className="text-xl font-bold text-ink-800 tabular-nums">
              {totalSharesGranted.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-surface-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
              <span className="text-[10px] text-ink-400 uppercase tracking-wider">
                Vested
              </span>
            </div>
            <p className="text-xl font-bold text-emerald-700 tabular-nums">
              {totalVested.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          <AlertCircle strokeWidth={1.75} className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Add Grant Form */}
      {showForm && (
        <AddGrantForm
          onSuccess={() => {
            setShowForm(false);
            fetchSchedules();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Schedules list */}
      {loading ? (
        <div className="rounded-2xl border border-surface-200 bg-white px-6 py-12 text-center">
          <Loader2 className="h-6 w-6 text-ink-400 animate-spin mx-auto" />
          <p className="text-sm text-ink-500 mt-3">Loading schedules...</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-2xl border border-surface-200 bg-white px-6 py-12 text-center">
          <Calendar
            strokeWidth={1.25}
            className="mx-auto h-10 w-10 text-ink-300 mb-3"
          />
          <p className="text-sm text-ink-500">
            No vesting schedules yet. Click &quot;Add Grant&quot; to create your
            first schedule.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <Calendar strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              All Schedules
            </h2>
          </div>
          {schedules.map((s) => (
            <ScheduleRow key={s.id} db={s} />
          ))}
        </div>
      )}
    </div>
  );
}
