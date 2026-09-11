"use client";

// EvaluationsClient — table + "Add a startup" dialog + founder claim handler
// for /workspace/evaluations (T0270). All writes go through /api/evaluations.
// T0273 adds the Progress column (Δ since last week + sparkline), the
// per-startup deadline badge and the Progress Radar panel / Scout teaser.
// T0272 (Program) adds row multi-select → "Batch score" (BatchDialog →
// POST /api/evaluations/batch) and the Cohorts section listing batches with
// progress + links to the cohort table / CSV / sponsor-LP report.
// S13-A adds the 4-step activation checklist directly under the trial strip
// (EvaluatorActivationChecklist — its CTAs open the same add / report
// dialogs) and `autoOpenReport` (`?from=trial_reminder` from the T-3d
// email) which opens the report dialog on the first evaluation on load.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, Plus, Trash2, X, Pencil, Check, Mail, FileText, RefreshCw, FileDown, Radar, CalendarClock, Layers } from "lucide-react";
import type { EvaluationListRow, EvaluationConsentTier } from "@/lib/evaluations";
import type { LastEvaluationReport, ReportQuota } from "@/lib/evaluations/report-quota";
import { TrialReportBanner, trialDaysLeft } from "./trial-report-banner";
import { EvaluatorActivationChecklist } from "./evaluator-activation-checklist";
import type { ActivationInputs } from "@/lib/evaluations/activation-checklist";
import { formatDelta, type EvaluatorProgress, type EvaluatorProgressItem, type ProgressDeadline } from "@/lib/evaluations/progress-shared";
import { ReportDialog, type ReportKind, type ReportRunResult } from "./report-dialog";
import { BatchDialog, type BatchQueuedResult } from "./batch-dialog";
import { batchProgressPct, type EvaluationBatch } from "@/lib/evaluations/batch-shared";
import { useModalDialog } from "@/hooks/useModalDialog";

// ---------------------------------------------------------------------------
// Props + local constants
// ---------------------------------------------------------------------------

export interface EvaluationsClientProps {
  initialEvaluations: EvaluationListRow[];
  used: number;
  limit: number;
  plan: string;
  isEvaluator: boolean;
  /** `?claim=<token>` from the founder invite email. */
  claimToken?: string | null;
  /**
   * S13-A activation checklist inputs (null → not rendered; the page only
   * passes it for evaluator personas). Evaluation / report counts are
   * re-derived from live client state so a step ticks straight after an add
   * or a run without a refresh.
   */
  activation?: ActivationInputs | null;
  /** `?from=trial_reminder` — open the Trust BizReport dialog on the first evaluation on load (S13-A). */
  autoOpenReport?: boolean;
  /** Latest evaluation_reports row per evaluation id (T0271). */
  lastReports?: Record<string, LastEvaluationReport>;
  /** Included Trust BizReports this month from usage_limits.reports_per_month. */
  reportQuota?: ReportQuota | null;
  /** T0273 — Δ / sparkline / deadlines per evaluation + movers for the panel. */
  progress?: EvaluatorProgress | null;
  /** Plan has `money_radar` (Scout / Firm / Program) → Progress Radar panel; else the trial teaser. */
  hasMoneyRadar?: boolean;
  /** T0272 — plan has lp_export / accelerator.cohort (Program) → multi-select + Batch score. */
  canBatch?: boolean;
  /** T0272 — batches this user queued, newest first (Cohorts section). */
  batches?: EvaluationBatch[];
}

const AU_STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Select a state" },
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
  { value: "national", label: "National / not Australia" },
];

const STAGE_LABELS: Record<number, string> = {
  0: "Pre-idea",
  1: "Idea",
  2: "Validation",
  3: "MVP",
  4: "Early traction",
  5: "Growth",
  6: "Scale",
  7: "Mature",
};

const CONSENT_CHIP: Record<EvaluationConsentTier, { label: string; className: string }> = {
  attributed_only: {
    label: "Attributed only",
    className: "border-surface-300 bg-surface-100 text-ink-600",
  },
  reports_shared: {
    label: "Reports shared",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  full_mentor: {
    label: "Full mentor",
    className: "border-brand-300 bg-brand-50 text-brand-700",
  },
};

export const EMPTY_STATE_COPY =
  "Add the first startup you're evaluating — every one gets the same 8-dimension rubric.";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function isUnlimited(limit: number): boolean {
  return limit >= Number.MAX_SAFE_INTEGER || limit >= 1_000_000;
}

function daysPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// ---------------------------------------------------------------------------
// Progress Radar (T0273) — sparkline, Δ cell, deadline badge, panel
// ---------------------------------------------------------------------------

/** Tiny inline SVG sparkline over the last ≤ 8 snapshot totals (oldest first). */
export function Sparkline({ values, width = 64, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      data-testid="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`SVI trend ${values[0]} to ${values[values.length - 1]}`}
      role="img"
      className="inline-block align-middle"
    >
      <title>{`SVI trend ${values[0]} to ${values[values.length - 1]}`}</title>
      <polyline fill="none" stroke={up ? "#047857" : "#B91C1C"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts.join(" ")} />
    </svg>
  );
}

function DeltaCell({ item }: { item: EvaluatorProgressItem | null }) {
  if (!item) return <span className="text-xs text-ink-500">—</span>;
  const d = item.delta;
  const tone = d == null || d === 0 ? "text-ink-500" : d > 0 ? "text-emerald-700" : "text-red-700";
  return (
    <div data-testid="progress-cell" className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${tone}`}>{d == null ? "New" : formatDelta(d)}</span>
        <Sparkline values={item.scoreHistory} />
      </div>
      {item.stageChanged ? (
        <div className="text-[11px] text-brand-700">Stage {item.stagePrev} → {item.stageNow}</div>
      ) : null}
      {item.newEvidence > 0 ? (
        <div className="text-[11px] text-ink-500">{item.newEvidence} new evidence item{item.newEvidence === 1 ? "" : "s"}</div>
      ) : null}
      {item.money.deadlinesAhead > 0 && item.money.nextDeadline ? (
        <span
          data-testid="deadline-badge"
          title={`${item.money.nextDeadline.name} · ${item.money.nextDeadline.closesAt}`}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
        >
          <CalendarClock className="h-3 w-3" aria-hidden="true" />
          {item.money.deadlinesAhead} deadline{item.money.deadlinesAhead === 1 ? "" : "s"} · next {daysPhrase(item.money.nextDeadline.daysLeft)}
          <span className="sr-only">
            : {item.money.nextDeadline.name}, closes {item.money.nextDeadline.closesAt}
          </span>
        </span>
      ) : null}
      {item.money.newMatches > 0 ? (
        <div className="text-[11px] text-ink-500">{item.money.newMatches} new match{item.money.newMatches === 1 ? "" : "es"} this week</div>
      ) : null}
    </div>
  );
}

export function ProgressRadarPanel({ progress, hasMoneyRadar }: { progress: EvaluatorProgress | null; hasMoneyRadar: boolean }) {
  if (!hasMoneyRadar) {
    return (
      <div
        data-testid="progress-radar-teaser"
        className="rounded-2xl border border-dashed border-brand-300 bg-brand-50/40 px-5 py-4 text-sm text-ink-700 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <Radar strokeWidth={1.75} className="mt-0.5 h-5 w-5 text-brand-600" />
          <div>
            <p className="font-semibold text-ink-900">Progress Radar is included in Scout — 7-day trial</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Every Monday: which of your startups moved (SVI Δ, stage), grant and program deadlines across all of them, and new matches — in your inbox and here.
            </p>
          </div>
        </div>
        <Link
          href="/pricing?segment=evaluator"
          className="inline-flex min-h-10 items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Start Scout trial
        </Link>
      </div>
    );
  }
  const movers = progress?.movers ?? [];
  const deadlines: ProgressDeadline[] = progress?.deadlines ?? [];
  const total = progress?.items.length ?? 0;
  return (
    <section data-testid="progress-radar-panel" aria-label="Progress Radar" className="rounded-2xl border border-surface-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Radar strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          Progress Radar
          <span className="text-xs font-normal text-ink-500">
            — {movers.length} of {total} startup{total === 1 ? "" : "s"} moved this week
            {progress && progress.newMatches > 0 ? ` · ${progress.newMatches} new match${progress.newMatches === 1 ? "" : "es"}` : ""}
          </span>
        </h2>
        <span className="text-[11px] text-ink-500">Emailed every Monday</span>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movers</p>
          {movers.length === 0 ? (
            <p className="mt-1 text-xs text-ink-500">No SVI movement this week. Run a re-score (A$1) after new evidence lands.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {movers.map((m) => (
                <li key={m.evaluationId} data-testid="mover" className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink-800">{m.name}</span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-xs text-ink-500">SVI {m.sviNow == null ? "—" : Math.round(m.sviNow)}</span>
                    <span className={`text-xs font-semibold ${(m.delta ?? 0) > 0 ? "text-emerald-700" : "text-red-700"}`}>{formatDelta(m.delta)}</span>
                    <Sparkline values={m.scoreHistory} width={48} height={14} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Next deadlines</p>
          {deadlines.length === 0 ? (
            <p className="mt-1 text-xs text-ink-500">No dated grant or program deadlines ahead for the startups you track.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {deadlines.map((d) => (
                <li key={`${d.evaluationId}:${d.refKind}:${d.refId}`} data-testid="panel-deadline" className="text-sm text-ink-800">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{d.name}</a>
                  ) : (
                    <span className="font-medium">{d.name}</span>
                  )}
                  <span className="text-xs text-ink-500"> — {d.startup} · {daysPhrase(d.daysLeft)} ({d.closesAt})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cohorts (T0272) — batches with progress + cohort / CSV / LP links
// ---------------------------------------------------------------------------

const BATCH_STATUS_CHIP: Record<EvaluationBatch["status"], { label: string; className: string }> = {
  queued: { label: "Queued · off-peak", className: "border-surface-300 bg-surface-100 text-ink-600" },
  running: { label: "Scoring…", className: "border-brand-300 bg-brand-50 text-brand-700" },
  done: { label: "Scored", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "border-red-300 bg-red-50 text-red-700" },
};

export function CohortsSection({ batches, canBatch }: { batches: EvaluationBatch[]; canBatch: boolean }) {
  if (!canBatch && batches.length === 0) return null;
  return (
    <section data-testid="cohorts-section" aria-label="Cohorts" className="rounded-2xl border border-surface-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <Layers strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          Cohorts
          <span className="text-xs font-normal text-ink-500">— batch scores on one rubric, scored off-peak</span>
        </h2>
        {canBatch ? <span className="text-[11px] text-ink-500">Select startups below → Batch score</span> : null}
      </div>
      {batches.length === 0 ? (
        <p className="mt-2 text-xs text-ink-500">No batches yet. Tick the startups to score together and choose Batch score.</p>
      ) : (
        <ul className="mt-3 divide-y divide-surface-100">
          {batches.map((b) => {
            const chip = BATCH_STATUS_CHIP[b.status];
            const pct = batchProgressPct(b);
            return (
              <li key={b.id} data-testid="cohort-batch" className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/workspace/evaluations/cohort/${encodeURIComponent(b.id)}`} className="truncate font-medium text-ink-900 hover:underline">{b.name}</Link>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                    <span
                      className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-100"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-label={`${b.name} scoring progress`}
                    >
                      <span className="block h-full bg-brand-600" style={{ width: `${pct}%` }} />
                    </span>
                    <span>{b.doneCount} of {b.total} scored{b.failedCount > 0 ? ` · ${b.failedCount} failed` : ""} · {formatDate(b.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-xs">
                  <Link href={`/workspace/evaluations/cohort/${encodeURIComponent(b.id)}`} className="rounded-lg px-2.5 py-1.5 font-medium text-brand-700 hover:bg-brand-50">Cohort table</Link>
                  <a href={`/api/evaluations/batch/${encodeURIComponent(b.id)}/export.csv`} className="rounded-lg px-2.5 py-1.5 font-medium text-brand-700 hover:bg-brand-50">CSV</a>
                  <a href={`/api/reports/quarterly?batch=${encodeURIComponent(b.id)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2.5 py-1.5 font-medium text-brand-700 hover:bg-brand-50">
                    LP report<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EvaluationsClient({
  initialEvaluations,
  used: initialUsed,
  limit,
  plan,
  isEvaluator,
  claimToken = null,
  lastReports: initialLastReports = {},
  reportQuota = null,
  progress = null,
  hasMoneyRadar = false,
  canBatch = false,
  batches: initialBatches = [],
  activation = null,
  autoOpenReport = false,
}: EvaluationsClientProps) {
  const progressByEval = React.useMemo(() => {
    const m = new Map<string, EvaluatorProgressItem>();
    for (const it of progress?.items ?? []) m.set(it.evaluationId, it);
    return m;
  }, [progress]);
  const router = useRouter();
  const [rows, setRows] = React.useState<EvaluationListRow[]>(initialEvaluations);
  const [used, setUsed] = React.useState(initialUsed);

  // --- Trust BizReport / re-score (T0271) ---
  const [lastReports, setLastReports] = React.useState<Record<string, LastEvaluationReport>>(initialLastReports);
  const [reportDialog, setReportDialog] = React.useState<{ row: EvaluationListRow; kind: ReportKind } | null>(() =>
    // S13-A: the trial-end reminder deep link lands with the dialog already open on the first startup.
    autoOpenReport && isEvaluator && initialEvaluations[0] ? { row: initialEvaluations[0], kind: "full" } : null,
  );
  const [quotaRemaining, setQuotaRemaining] = React.useState<number | null>(reportQuota ? reportQuota.remaining : null);
  // S7-C: while trialing the quota IS the 1 included trial report.
  const trial = reportQuota?.trial?.active ? reportQuota.trial : null;
  const trialUsed = trial ? Math.max(0, trial.allowance - (quotaRemaining ?? reportQuota?.remaining ?? 0)) : null;

  function handleReportSuccess(row: EvaluationListRow, result: ReportRunResult) {
    setLastReports((prev) => ({
      ...prev,
      [row.id]: {
        evaluationId: row.id,
        kind: result.kind,
        createdAt: new Date().toISOString(),
        sviTotal: result.svi,
        shareToken: result.share_token,
        reportUrl: result.report_url,
        pdfUrl: result.pdf_url,
      },
    }));
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, latestSvi: result.svi, latestSviAt: new Date().toISOString() } : r)));
    if (result.via === "quota") setQuotaRemaining(result.remaining_quota);
    router.refresh();
  }

  // --- Batch score (T0272) ---
  const [batches, setBatches] = React.useState<EvaluationBatch[]>(initialBatches);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [showBatch, setShowBatch] = React.useState(false);
  const selectedRows = React.useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function handleBatchQueued(result: BatchQueuedResult) {
    setBatches((prev) => [result.batch, ...prev]);
    setSelectedIds(new Set());
    setShowBatch(false);
    if (Number.isFinite(result.quota_left) && result.quota_left < Number.MAX_SAFE_INTEGER) setQuotaRemaining(result.quota_left);
    setNotice(`Queued ${result.queued} startup${result.queued === 1 ? "" : "s"} in "${result.batch.name}" — scored off-peak tonight; you'll be notified when the cohort table is ready.`);
    router.refresh();
  }

  // --- Add dialog state ---
  const [showAdd, setShowAdd] = React.useState(false);
  const [name, setName] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [founderEmail, setFounderEmail] = React.useState("");
  const [state, setState] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  // S8-B: focus trap + Escape + focus return for the inline "Add a startup" dialog.
  const addDialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeAdd = () => {
    setShowAdd(false);
    setCreateError(null);
  };
  useModalDialog(addDialogRef, { active: showAdd, onClose: closeAdd, initialFocus: "#eval-name" });

  // --- Inline label edit ---
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  // --- Founder claim (?claim=<token>) ---
  const [claimState, setClaimState] = React.useState<
    | { status: "idle" }
    | { status: "claiming" }
    | { status: "claimed"; projectName: string; already: boolean }
    | { status: "error"; message: string }
  >(claimToken ? { status: "claiming" } : { status: "idle" });

  const atLimit = !isUnlimited(limit) && used >= limit;
  const canAdd = isEvaluator && !atLimit;

  // --- Activation checklist (S13-A) — live counts over the server's thesis inputs ---
  const activationInput = React.useMemo<ActivationInputs | null>(
    () => (activation ? { ...activation, evaluations: rows.length, reports: Object.keys(lastReports).length } : null),
    [activation, rows.length, lastReports],
  );
  const checklistDaysLeft = trial ? trialDaysLeft(trial.ends_at) : null;
  function openFirstReport() {
    if (rows[0]) setReportDialog({ row: rows[0], kind: "full" });
  }

  React.useEffect(() => {
    if (!claimToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/evaluations/claim/${encodeURIComponent(claimToken)}`, {
          method: "POST",
        });
        const json = (await res.json()) as {
          ok: boolean;
          project_name?: string;
          already_claimed?: boolean;
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        if (json.ok) {
          setClaimState({
            status: "claimed",
            projectName: json.project_name ?? "this startup",
            already: Boolean(json.already_claimed),
          });
        } else {
          setClaimState({
            status: "error",
            message: json.message ?? (json.error === "not_found" ? "This invite link is no longer valid." : "Could not claim this startup."),
          });
        }
      } catch {
        if (!cancelled) setClaimState({ status: "error", message: "Network error. Please try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimToken]);

  function resetAddForm() {
    setName("");
    setWebsite("");
    setDescription("");
    setFounderEmail("");
    setState("");
    setCreateError(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website: website.trim() || undefined,
          description: description.trim() || undefined,
          founder_email: founderEmail.trim() || undefined,
          state: state || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        evaluation?: EvaluationListRow;
        invite_sent?: boolean;
        used?: number;
        error?: string;
        message?: string;
        limit?: number;
      };
      if (json.ok && json.evaluation) {
        setRows((prev) => [json.evaluation as EvaluationListRow, ...prev]);
        setUsed(typeof json.used === "number" ? json.used : used + 1);
        setShowAdd(false);
        resetAddForm();
        if (founderEmail.trim()) {
          setNotice(
            json.invite_sent
              ? `Invite sent to ${founderEmail.trim()} — they can claim ${json.evaluation.projectName} to share their evidence.`
              : `Added ${json.evaluation.projectName}. The founder invite could not be emailed right now — you can re-send it later.`,
          );
        } else {
          setNotice(`Added ${json.evaluation.projectName}.`);
        }
        router.refresh();
      } else if (json.error === "evaluation_limit_reached") {
        setCreateError(
          json.message ?? `Your plan tracks up to ${json.limit ?? limit} startups. Upgrade to add more.`,
        );
      } else {
        setCreateError(json.message ?? json.error ?? "Failed to add the startup");
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveLabel(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/evaluations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim() || null }),
      });
      const json = (await res.json()) as { ok: boolean; evaluation?: { label: string | null } };
      if (json.ok && json.evaluation) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label: json.evaluation?.label ?? null } : r)));
        setEditingId(null);
      }
    } catch {
      /* keep the editor open so the user can retry */
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemove(row: EvaluationListRow) {
    if (!confirm(`Stop evaluating ${row.projectName}? The startup profile and any reports are kept.`)) return;
    setRemovingId(row.id);
    const snapshot = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      const res = await fetch(`/api/evaluations/${row.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean };
      if (!json.ok) {
        setRows(snapshot);
      } else {
        setUsed((u) => Math.max(0, u - 1));
        router.refresh();
      }
    } catch {
      setRows(snapshot);
    } finally {
      setRemovingId(null);
    }
  }

  const limitLabel = isUnlimited(limit) ? "unlimited" : String(limit);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-from={autoOpenReport ? "trial_reminder" : undefined}>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink-900">Startups I&apos;m evaluating</h1>
            <span className="inline-flex items-center rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
              Beta
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            One rubric across every startup you track — 8 dimensions, the same evidence standard, AUD valuation range on demand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {canBatch && isEvaluator && rows.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowBatch(true)}
            disabled={selectedRows.length === 0}
            data-testid="batch-score-button"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Layers strokeWidth={1.75} className="h-4 w-4" />
            Batch score{selectedRows.length > 0 ? ` (${selectedRows.length})` : ""}
          </button>
        ) : null}
        {canAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Add a startup
          </button>
        ) : isEvaluator ? (
          <Link
            href="/pricing?segment=evaluator"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
          >
            Upgrade to track more
          </Link>
        ) : null}
        </div>
      </header>

      {/* Founder claim outcome */}
      {claimState.status === "claiming" && (
        <div role="status" className="rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-ink-600 flex items-center gap-2">
          <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" /> Claiming your startup…
        </div>
      )}
      {claimState.status === "claimed" && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {claimState.already ? "You already claimed" : "You claimed"} <strong>{claimState.projectName}</strong>. Reports the evaluator runs on it are now shared with you.{" "}
          <Link href="/dashboard" className="underline font-medium">Go to your dashboard</Link>
        </div>
      )}
      {claimState.status === "error" && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {claimState.message}
        </div>
      )}

      {/* Trial strip (S7-C) — 1 included Trust BizReport, then credits */}
      {isEvaluator && trial ? <TrialReportBanner trial={trial} used={trialUsed} /> : null}

      {/* Activation checklist (S13-A) — directly under the trial strip; hides itself when complete / dismissed */}
      {isEvaluator && activationInput ? (
        <EvaluatorActivationChecklist
          input={activationInput}
          trialDaysLeft={checklistDaysLeft}
          canAdd={canAdd}
          onAddStartup={() => setShowAdd(true)}
          onRunReport={openFirstReport}
        />
      ) : null}

      {/* Plan-limit banner */}
      {isEvaluator && (
        <div
          data-testid="plan-limit-banner"
          className={
            atLimit
              ? "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-wrap items-center justify-between gap-2"
              : "rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-ink-600 flex flex-wrap items-center justify-between gap-2"
          }
        >
          <span>
            <strong>{used} of {limitLabel}</strong> tracked startup{limit === 1 ? "" : "s"} used
            <span className="mx-1.5 text-surface-300">|</span>
            <span className="capitalize">{plan.replace(/_/g, " ")}</span> plan
            {reportQuota && reportQuota.limit > 0 ? (
              <>
                <span className="mx-1.5 text-surface-300">|</span>
                <span data-testid="report-quota">
                  {reportQuota.unlimited || isUnlimited(reportQuota.limit)
                    ? "Unlimited Trust BizReports"
                    : trial
                      ? `${quotaRemaining ?? reportQuota.remaining} of ${reportQuota.limit} included Trust BizReport${reportQuota.limit === 1 ? "" : "s"} left in your trial, then 3 credits each`
                      : `${quotaRemaining ?? reportQuota.remaining} of ${reportQuota.limit} included Trust BizReports left this month`}
                </span>
              </>
            ) : reportQuota ? (
              <>
                <span className="mx-1.5 text-surface-300">|</span>
                <span data-testid="report-quota">Trust BizReport A$3 · re-score A$1</span>
              </>
            ) : null}
          </span>
          {atLimit && (
            <Link href="/pricing?segment=evaluator" className="font-semibold underline">
              Upgrade to track more
            </Link>
          )}
        </div>
      )}

      {/* Progress Radar (T0273) — panel for money_radar plans, Scout teaser otherwise */}
      {isEvaluator && rows.length > 0 ? <ProgressRadarPanel progress={progress} hasMoneyRadar={hasMoneyRadar} /> : null}

      {/* Cohorts (T0272) — Program batch scoring */}
      {isEvaluator ? <CohortsSection batches={batches} canBatch={canBatch} /> : null}

      {!isEvaluator && claimState.status === "idle" && (
        <div className="rounded-xl border border-surface-200 bg-white px-5 py-6 text-sm text-ink-600">
          <p className="font-medium text-ink-900">This workspace is for evaluators.</p>
          <p className="mt-1">
            Investors, accelerators, incubators, advisors and service providers add the startups they assess here and score each on the same rubric.{" "}
            <Link href="/pricing?segment=evaluator" className="text-brand-700 underline">See evaluator plans</Link>
          </p>
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="-m-1 shrink-0 rounded-md p-1 text-brand-700 hover:text-brand-900">
            <X strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Table / empty state */}
      {isEvaluator && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center">
          <ClipboardList strokeWidth={1.5} className="mx-auto h-10 w-10 text-brand-500" />
          <p className="mt-4 text-base font-medium text-ink-900">{EMPTY_STATE_COPY}</p>
          <p className="mt-1 text-sm text-ink-500">
            Name, website and a one-line description are enough to start. Invite the founder and they can share their evidence.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Plus strokeWidth={1.75} className="h-4 w-4" />
              Add a startup
            </button>
          )}
        </div>
      ) : isEvaluator ? (
        <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Startups you evaluate — stage, SVI, progress, consent and actions</caption>
            <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                {canBatch ? (
                  <th scope="col" className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all startups"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-surface-300 accent-brand-600"
                    />
                  </th>
                ) : null}
                <th scope="col" className="px-4 py-3 font-semibold">Startup</th>
                <th scope="col" className="px-4 py-3 font-semibold">Stage / SVI</th>
                <th scope="col" className="px-4 py-3 font-semibold">Progress</th>
                <th scope="col" className="px-4 py-3 font-semibold">Consent</th>
                <th scope="col" className="px-4 py-3 font-semibold">Added</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {rows.map((row) => {
                const chip = CONSENT_CHIP[row.consentTier] ?? CONSENT_CHIP.attributed_only;
                const editing = editingId === row.id;
                return (
                  <tr key={row.id} data-testid="evaluation-row" className="align-top">
                    {canBatch ? (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.projectName} for batch scoring`}
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          className="h-4 w-4 rounded border-surface-300 accent-brand-600"
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{row.projectName}</div>
                      {editing ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            aria-label="Label"
                            value={editLabel}
                            maxLength={120}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-44 rounded-md border border-surface-200 px-2 py-1 text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            placeholder="e.g. Cohort 4 shortlist"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveLabel(row.id)}
                            disabled={savingId === row.id}
                            aria-label="Save label"
                            className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {savingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel label edit" className="rounded-md p-1.5 text-ink-500 hover:bg-surface-100">
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-ink-500">
                          {row.label ? <span className="rounded bg-surface-100 px-1.5 py-0.5 text-ink-700">{row.label}</span> : null}
                          {row.website ? (
                            <a href={row.website} target="_blank" rel="noopener noreferrer" className={row.label ? "ml-2 hover:underline" : "hover:underline"}>
                              {row.website.replace(/^https?:\/\//, "")}
                            </a>
                          ) : null}
                          {row.projectIndustry ? <span className="ml-2">{row.projectIndustry}</span> : null}
                          {row.state ? <span className="ml-2 uppercase">{row.state}</span> : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      <div>{STAGE_LABELS[row.projectStage] ?? `Stage ${row.projectStage}`}</div>
                      <div className="text-xs text-ink-500">
                        {row.latestSvi != null ? (
                          <>SVI <strong className="text-ink-800">{Math.round(row.latestSvi)}</strong></>
                        ) : (
                          "Not scored yet"
                        )}
                      </div>
                      {lastReports[row.id] ? (
                        <div className="mt-1 text-[11px] text-ink-500" data-testid="last-report">
                          Last report: {formatDate(lastReports[row.id].createdAt)}
                          {lastReports[row.id].sviTotal != null ? <> · SVI {Math.round(lastReports[row.id].sviTotal as number)}</> : null}
                          {lastReports[row.id].reportUrl ? (
                            <>
                              {" "}
                              <a href={lastReports[row.id].reportUrl as string} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                                Open
                              </a>
                              {lastReports[row.id].pdfUrl ? (
                                <>
                                  {" · "}
                                  <a href={lastReports[row.id].pdfUrl as string} className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                                    <FileDown className="h-3 w-3" /> PDF
                                  </a>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <DeltaCell item={progressByEval.get(row.id) ?? null} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>
                        {chip.label}
                      </span>
                      {row.ownerKind === "founder_invited" && row.founderEmail ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-500">
                          <Mail className="h-3 w-3" /> Invite sent to {row.founderEmail}
                        </div>
                      ) : null}
                      {row.ownerKind === "founder_claimed" ? (
                        <div className="mt-1 text-[11px] text-emerald-700">Founder claimed</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setReportDialog({ row, kind: "full" })}
                          aria-label={`Run Trust BizReport for ${row.projectName}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 cursor-pointer"
                        >
                          <FileText strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden="true" />
                          Run Trust BizReport
                        </button>
                        {lastReports[row.id] ? (
                          <button
                            type="button"
                            onClick={() => setReportDialog({ row, kind: "rescore" })}
                            aria-label={`Re-score ${row.projectName}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 cursor-pointer"
                          >
                            <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden="true" />
                            Re-score
                          </button>
                        ) : null}
                        <Link
                          href={`/workspace/projects/${encodeURIComponent(row.projectSlug)}/analyze`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                        >
                          {row.latestSvi != null ? "Open" : "Score"}
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(row.id);
                            setEditLabel(row.label ?? "");
                          }}
                          aria-label={`Edit label for ${row.projectName}`}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-surface-100 hover:text-ink-800"
                        >
                          <Pencil strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(row)}
                          disabled={removingId === row.id}
                          aria-label={`Stop evaluating ${row.projectName}`}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                        >
                          {removingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Trust BizReport / re-score confirm dialog (T0271) */}
      {reportDialog && (
        <ReportDialog
          key={`${reportDialog.row.id}:${reportDialog.kind}`}
          evaluationId={reportDialog.row.id}
          startupName={reportDialog.row.projectName}
          kind={reportDialog.kind}
          onClose={() => setReportDialog(null)}
          onSuccess={(result) => handleReportSuccess(reportDialog.row, result)}
        />
      )}

      {/* Batch score dialog (T0272) */}
      {showBatch && selectedRows.length > 0 && (
        <BatchDialog
          selected={selectedRows}
          quotaRemaining={reportQuota && !reportQuota.unlimited ? (quotaRemaining ?? reportQuota.remaining) : null}
          quotaLimit={reportQuota && !reportQuota.unlimited ? reportQuota.limit : null}
          trialActive={Boolean(trial)}
          onClose={() => setShowBatch(false)}
          onQueued={handleBatchQueued}
        />
      )}

      {/* Add dialog */}
      {showAdd && (
        <div ref={addDialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="add-startup-title">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h2 id="add-startup-title" className="text-lg font-bold text-ink-900">Add a startup</h2>
              <button
                type="button"
                onClick={closeAdd}
                aria-label="Close"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <X strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="eval-name" className="block text-sm font-medium text-ink-700 mb-1">Startup name *</label>
                <input
                  id="eval-name"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SprocketBay"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-website" className="block text-sm font-medium text-ink-700 mb-1">
                  Website <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="eval-website"
                  type="text"
                  inputMode="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="sprocketbay.com.au"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-desc" className="block text-sm font-medium text-ink-700 mb-1">One-line description</label>
                <input
                  id="eval-desc"
                  type="text"
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Marketplace for industrial spare parts"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-founder" className="block text-sm font-medium text-ink-700 mb-1">
                  Founder email <span className="text-muted font-normal">(optional — we invite them to claim it)</span>
                </label>
                <input
                  id="eval-founder"
                  type="email"
                  value={founderEmail}
                  onChange={(e) => setFounderEmail(e.target.value)}
                  placeholder="founder@startup.com"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-state" className="block text-sm font-medium text-ink-700 mb-1">State</label>
                <select
                  id="eval-state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {AU_STATE_OPTIONS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {createError && <p className="text-sm text-red-600 font-medium" role="alert">{createError}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdd}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {creating && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Add startup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
