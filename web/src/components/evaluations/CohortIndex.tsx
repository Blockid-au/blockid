"use client";

// CohortIndex — the BlockID Cohort list + "New cohort" form on
// /workspace/evaluations/cohort (G21 P2-A). A new cohort starts empty
// (POST /api/evaluations/batch with allow_empty) and is filled by CSV import
// on its page, by the intake link, or by selecting startups on
// /workspace/evaluations → Batch score.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Loader2, Plus, Upload } from "lucide-react";
import { BATCH_ROLE_LABELS, batchProgressPct, type BatchRole, type EvaluationBatch } from "@/lib/evaluations/batch-shared";
import { DEMO_COHORT_LABELS_EN, type DemoCohortLabels } from "@/lib/evaluations/demo-cohort-shared";
import { DemoCohortChip } from "./DemoCohortChip";
import { LoadDemoCohortButton } from "./DemoCohortActions";

export interface CohortIndexTemplate {
  id: string;
  name: string;
}

export interface CohortIndexProps {
  /** G22-A: created + member cohorts; `role` = the caller's seat (a role chip renders when present). */
  batches: Array<EvaluationBatch & { role?: BatchRole }>;
  templates: CohortIndexTemplate[];
  canCreate: boolean;
  /** Live paid pilot cap, shown on the form. */
  pilotCap: number | null;
  /** G24-C: catalogue copy for the demo chip / CTA (EN default). */
  demoLabels?: DemoCohortLabels;
  /** G24-C: `?demo=removed` after the owner removed the demo cohort — a one-line status. */
  demoRemoved?: boolean;
}

const STATUS_CHIP: Record<EvaluationBatch["status"], { label: string; className: string }> = {
  queued: { label: "Queued · off-peak", className: "border-surface-300 bg-surface-100 text-ink-600" },
  running: { label: "Scoring…", className: "border-brand-300 bg-brand-50 text-brand-700" },
  done: { label: "Scored", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "border-red-300 bg-red-50 text-red-700" },
};

/** G22-A: the caller's seat on the cohort (owner = created it; reviewer / viewer = invited). */
export const ROLE_CHIP: Record<BatchRole, string> = {
  owner: "border-brand-300 bg-brand-50 text-brand-700",
  reviewer: "border-surface-300 bg-surface-100 text-ink-700",
  viewer: "border-surface-300 bg-surface-50 text-ink-500",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function CohortIndex({ batches, templates, canCreate, pilotCap, demoLabels = DEMO_COHORT_LABELS_EN, demoRemoved = false }: CohortIndexProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(batches.length === 0 && canCreate);
  const hasDemo = batches.some((b) => b.isDemo);
  const [name, setName] = React.useState("");
  const [program, setProgram] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/evaluations/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluation_ids: [], allow_empty: true, name: name.trim() || undefined, program_name: program.trim() || undefined, template_id: templateId || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; batch_id?: string; message?: string; error?: string };
      if (!res.ok || !json.ok || !json.batch_id) {
        setError(json.message ?? json.error ?? "Could not create the cohort");
        return;
      }
      router.push(`/workspace/evaluations/cohort/${encodeURIComponent(json.batch_id)}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="cohort-index">
      {demoRemoved ? (
        <p role="status" className="rounded-xl border border-line-subtle bg-surface px-4 py-2 text-sm text-secondary" data-testid="demo-removed-status">
          {demoLabels.removed}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">One rubric across every startup in a round: import a CSV or share an intake link, score off-peak, compare, decide, track the deltas.</p>
        {canCreate ? (
          <span className="flex flex-wrap items-center gap-2">
            {!hasDemo && batches.length > 0 ? <LoadDemoCohortButton labels={demoLabels} /> : null}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-elev-1" data-testid="cohort-new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New cohort
            </button>
          </span>
        ) : (
          <Link href="/pricing?segment=evaluator" className="inline-flex min-h-11 items-center rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-50">
            Cohorts — Program plan
          </Link>
        )}
      </div>

      {open && canCreate ? (
        <form onSubmit={create} className="grid gap-4 rounded-2xl border border-surface-200 bg-white p-5 sm:grid-cols-2" data-testid="cohort-new-form">
          <div>
            <label htmlFor="cohort-name" className="mb-1 block text-sm font-medium text-ink-700">Cohort name</label>
            <input id="cohort-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Round 1 intake" className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
          <div>
            <label htmlFor="cohort-program" className="mb-1 block text-sm font-medium text-ink-700">Program</label>
            <input id="cohort-program" value={program} onChange={(e) => setProgram(e.target.value)} maxLength={160} placeholder="e.g. AI Fellowship 2026" className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cohort-template" className="mb-1 block text-sm font-medium text-ink-700">Intake template</label>
            <select id="cohort-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-navy">
              <option value="">Default form (no extra questions)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-500">
              Templates set the questions founders answer, the rubric weights and the consent text.{" "}
              <Link href="/workspace/accelerator/templates" className="font-medium text-brand-700 hover:underline">
                Manage templates
              </Link>
            </p>
          </div>
          {pilotCap != null ? <p className="text-xs text-ink-500 sm:col-span-2">Your pilot covers up to {pilotCap} startups per cohort.</p> : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-red-600 sm:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-elev-1 disabled:opacity-50" data-testid="cohort-create">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Create cohort
            </button>
          </div>
        </form>
      ) : null}

      {batches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center text-sm text-ink-500" data-testid="cohort-empty">
          <Layers className="mx-auto mb-3 h-6 w-6 text-brand-600" aria-hidden="true" />
          No cohorts yet. Create one and import a CSV, or tick startups on{" "}
          <Link href="/workspace/evaluations" className="font-medium text-brand-700 hover:underline">
            Startups I&apos;m evaluating
          </Link>{" "}
          and choose Batch score.
          {canCreate ? (
            <div className="mt-5 flex flex-wrap items-start justify-center gap-2" data-testid="cohort-empty-actions">
              <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-brand-navy-elev-1" data-testid="cohort-empty-import">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {demoLabels.importCsv}
              </button>
              <LoadDemoCohortButton labels={demoLabels} />
            </div>
          ) : null}
          {canCreate ? <p className="mt-3 text-xs text-ink-500">{demoLabels.emptyHint}</p> : null}
        </div>
      ) : (
        <ul className="divide-y divide-surface-100 rounded-2xl border border-surface-200 bg-white" data-testid="cohort-list">
          {batches.map((b) => {
            const chip = STATUS_CHIP[b.status];
            const pct = batchProgressPct(b);
            return (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm" data-testid="cohort-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/workspace/evaluations/cohort/${encodeURIComponent(b.id)}`} className="truncate font-medium text-ink-900 hover:underline">
                      {b.name}
                    </Link>
                    {b.programName ? <span className="text-xs text-ink-500">{b.programName}</span> : null}
                    {b.isDemo ? <DemoCohortChip label={demoLabels.chip} title={demoLabels.chipTitle} /> : null}
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
                    {b.role ? (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_CHIP[b.role]}`} data-testid="cohort-role-chip" data-role={b.role}>
                        {BATCH_ROLE_LABELS[b.role]}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                    <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${b.name} scoring progress`}>
                      <span className="block h-full bg-brand-600" style={{ width: `${pct}%` }} />
                    </span>
                    <span>
                      {b.total} startup{b.total === 1 ? "" : "s"} · {b.doneCount} scored{b.failedCount > 0 ? ` · ${b.failedCount} failed` : ""}
                      {b.applicantsCap != null ? ` · cap ${b.applicantsCap}` : ""} · {fmt(b.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-xs">
                  <Link href={`/workspace/evaluations/cohort/${encodeURIComponent(b.id)}`} className="rounded-lg px-2.5 py-1.5 font-medium text-brand-700 hover:bg-brand-50">
                    Open
                  </Link>
                  <a href={`/api/evaluations/batch/${encodeURIComponent(b.id)}/export.csv`} className="rounded-lg px-2.5 py-1.5 font-medium text-brand-700 hover:bg-brand-50">
                    CSV
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
