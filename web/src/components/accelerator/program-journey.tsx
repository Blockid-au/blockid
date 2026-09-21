// ProgramJourney — the BlockID Cohort journey on /workspace/accelerator (G21
// P2-C, 2026-09-20): six stage tabs (URL `?stage=`), a completeness chip per
// stage derived from the data, and one server-rendered panel per stage.
//
// Server component: every number comes from `buildProgramJourney()`; the two
// interactive bits (re-score CTA, feedback-letter preview → confirm) are
// small client islands. Links, not buttons, for navigation; every target is
// ≥ 44 px; status is never colour-only (icon + text on every chip).

import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, CircleDot, Download, ExternalLink, FileText, Upload } from "lucide-react";
import { COHORT_DECISION_LABELS, stageName } from "@/lib/evaluations/batch-shared";
import {
  PROGRAM_STAGES,
  PROGRAM_STAGE_META,
  STAGE_STATE_LABEL,
  type ProgramJourneyView,
  type ProgramStage,
  type StageChip,
  type StageState,
} from "@/lib/evaluations/program-journey";
import { Sparkline } from "./sparkline";
import { RescoreButton } from "./rescore-button";
import { FeedbackLettersPanel } from "./feedback-letters-panel";
import { DEMO_COHORT_LABELS_EN, type DemoCohortLabels } from "@/lib/evaluations/demo-cohort-shared";
import { DemoCohortChip } from "@/components/evaluations/DemoCohortChip";
import { LoadDemoCohortButton, RemoveDemoCohortButton } from "@/components/evaluations/DemoCohortActions";

export const COHORT_TABLE_PATH = (batchId: string) => `/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`;
export const COHORT_IMPORT_PATH = (batchId: string | null) => (batchId ? `${COHORT_TABLE_PATH(batchId)}?import=csv` : "/workspace/evaluations?import=csv");
export const COHORT_SNAPSHOT_ENDPOINT = (batchId: string) => `/api/evaluations/batch/${encodeURIComponent(batchId)}/snapshot`;
export const COHORT_REPORT_HREF = (batchId: string, format: "html" | "pdf" | "csv") => `/api/reports/cohort?batch=${encodeURIComponent(batchId)}&format=${format}`;
export const DEMO_DAY_PACK_HREF = (batchId: string) => `/api/reports/demo-day-pack?batch=${encodeURIComponent(batchId)}`;

function stageHref(stage: ProgramStage, batchId: string | null): string {
  const q = new URLSearchParams({ stage });
  if (batchId) q.set("batch", batchId);
  return `/workspace/accelerator?${q.toString()}`;
}

const STATE_ICON: Record<StageState, ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 text-bull" aria-hidden="true" />,
  in_progress: <CircleDot className="h-4 w-4 text-action" aria-hidden="true" />,
  not_started: <Circle className="h-4 w-4 text-tertiary" aria-hidden="true" />,
};

function StateChip({ state }: { state: StageState }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-xs font-medium text-secondary" data-stage-state={state}>
      {STATE_ICON[state]}
      {STAGE_STATE_LABEL[state]}
    </span>
  );
}

function Tabs({ chips, active, batchId }: { chips: StageChip[]; active: ProgramStage; batchId: string | null }) {
  return (
    <nav aria-label="Program stages" className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex min-w-max gap-1 px-1" data-testid="journey-tabs">
        {chips.map((c, i) => {
          const current = c.key === active;
          return (
            <li key={c.key}>
              <Link
                href={stageHref(c.key, batchId)}
                aria-current={current ? "page" : undefined}
                data-stage-tab={c.key}
                data-stage-state={c.state}
                className={`flex min-h-11 min-w-[9.5rem] flex-col justify-center rounded-xl border px-3 py-2 transition-colors ${current ? "border-action bg-action/5" : "border-line-subtle bg-surface hover:bg-surface-hover"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <span className="text-tertiary">{i + 1}.</span>
                  {c.label}
                  {STATE_ICON[c.state]}
                </span>
                <span className="mt-0.5 text-xs text-tertiary">{c.summary}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-tertiary">{hint}</p> : null}
    </div>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-subtle bg-surface px-6 py-10 text-center" data-testid="journey-empty">
      <p className="text-base font-semibold text-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-secondary">{body}</p>
      {cta ? (
        <Link href={cta.href} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

const btn = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover";
const btnPrimary = "inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover";

export interface ProgramJourneyProps {
  view: ProgramJourneyView;
  stage: ProgramStage;
  /** Owner / reviewer may send letters and re-score; viewers read. */
  canAct: boolean;
  /** G24-C: the creator of the selected cohort (may remove a demo cohort). */
  isOwner?: boolean;
  /** G24-C: catalogue copy for the demo chip / CTAs (EN default). */
  demoLabels?: DemoCohortLabels;
}

export function ProgramJourney({ view, stage, canAct, isOwner = false, demoLabels = DEMO_COHORT_LABELS_EN }: ProgramJourneyProps) {
  const batchId = view.batch?.id ?? null;
  const meta = PROGRAM_STAGE_META[stage];
  const isDemo = view.batch?.isDemo === true;
  return (
    <section className="space-y-6" data-testid="program-journey" data-stage={stage} data-demo={isDemo ? "1" : undefined}>
      {isDemo ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line-subtle border-l-4 border-l-warn bg-surface-sunken px-4 py-4 md:flex-row md:items-start md:justify-between" data-testid="journey-demo-banner">
          <div className="min-w-0">
            <DemoCohortChip label={demoLabels.chip} title={demoLabels.chipTitle} size="md" />
            <p className="mt-2 max-w-3xl text-sm text-secondary">{demoLabels.bannerBody}</p>
          </div>
          {isOwner ? <RemoveDemoCohortButton labels={demoLabels} afterHref="/workspace/accelerator" /> : null}
        </div>
      ) : null}
      <Tabs chips={view.stages} active={stage} batchId={batchId} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary">{meta.label}</h2>
          <p className="mt-1 text-sm text-secondary">{meta.blurb}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {view.stages.find((c) => c.key === stage) ? <StateChip state={(view.stages.find((c) => c.key === stage) as StageChip).state} /> : null}
          {view.batches.length > 1 ? <BatchPicker view={view} stage={stage} /> : null}
          <Link href="/workspace/accelerator/pilot" className="inline-flex min-h-11 items-center text-sm font-semibold text-action hover:underline" data-testid="pilot-kit-link">
            Pilot delivery kit
          </Link>
        </div>
      </header>
      {stage === "intake" ? <IntakePanel view={view} batchId={batchId} demoLabels={demoLabels} /> : null}
      {stage === "assessment" ? <AssessmentPanel view={view} batchId={batchId} demoLabels={demoLabels} /> : null}
      {stage === "selection" ? <SelectionPanel view={view} batchId={batchId} canAct={canAct} /> : null}
      {stage === "program" ? <ProgramPanel view={view} batchId={batchId} canAct={canAct} /> : null}
      {stage === "demo-day" ? <DemoDayPanel view={view} batchId={batchId} /> : null}
      {stage === "sponsor" ? <SponsorPanel view={view} batchId={batchId} /> : null}
    </section>
  );
}

function BatchPicker({ view, stage }: { view: ProgramJourneyView; stage: ProgramStage }) {
  return (
    <nav aria-label="Cohorts" className="text-sm">
      <span className="text-tertiary">Cohort: </span>
      {view.batches.slice(0, 5).map((b, i) => (
        <span key={b.id}>
          {i > 0 ? <span className="text-tertiary"> · </span> : null}
          <Link href={stageHref(stage, b.id)} className={`inline-flex min-h-11 items-center rounded-sm ${b.id === view.batch?.id ? "font-semibold text-primary underline" : "text-action hover:underline"}`}>
            {b.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}

function IntakePanel({ view, batchId, demoLabels }: { view: ProgramJourneyView; batchId: string | null; demoLabels: DemoCohortLabels }) {
  const it = view.intake;
  const noCohort = !batchId || view.assessment.total === 0;
  return (
    <div className="space-y-4" data-testid="panel-intake">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Intake links" value={String(it.links)} hint={`${it.openLinks} open`} />
        <Tile label="Applications" value={String(it.submissions)} />
        <Tile label="In this cohort" value={String(view.assessment.total)} hint={view.batch ? view.batch.name : "No cohort yet"} />
        <Tile label="Scored" value={String(view.assessment.scored)} />
      </div>
      {it.publicUrl ? (
        <div className="rounded-xl border border-line-subtle bg-surface p-4" data-testid="intake-link">
          <p className="text-xs uppercase tracking-wide text-tertiary">Your intake link</p>
          <p className="mt-1 break-all font-mono text-sm text-primary">{it.publicUrl}</p>
          <p className="mt-1 text-xs text-secondary">Founders apply with a deck and the startup URL; consent is captured on submission and every founder can claim their own score.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href="/workspace/accelerator/applications" className={btnPrimary}>
          <FileText className="h-4 w-4" aria-hidden="true" />
          Intake inbox
        </Link>
        <Link href={COHORT_IMPORT_PATH(batchId)} className={btn} data-testid="intake-import-link">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import applicants from CSV
        </Link>
        {noCohort && !view.batch?.isDemo ? <LoadDemoCohortButton labels={demoLabels} hrefTemplate="/workspace/accelerator?stage=assessment&batch={batchId}" /> : null}
      </div>
      {it.links === 0 && view.assessment.total === 0 ? (
        <Empty title="No applications yet" body="Publish an intake link from the inbox, or import an existing cohort as CSV — company, URL, contact e-mail, stage, sector, deck link." cta={{ href: "/workspace/accelerator/applications", label: "Create an intake link" }} />
      ) : null}
    </div>
  );
}

function AssessmentPanel({ view, batchId, demoLabels }: { view: ProgramJourneyView; batchId: string | null; demoLabels: DemoCohortLabels }) {
  const a = view.assessment;
  return (
    <div className="space-y-4" data-testid="panel-assessment">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Batch status" value={a.batchStatus ? a.batchStatus : "—"} hint={a.failed > 0 ? `${a.failed} failed — re-run from the cohort table` : undefined} />
        <Tile label="Scored / pending" value={`${a.scored} / ${a.pending}`} hint={`${a.total} in cohort`} />
        <Tile label="Median SVI" value={a.medianSvi == null ? "—" : String(a.medianSvi)} hint={a.scored > 0 ? `n = ${a.scored}` : undefined} />
        <Tile label="Median confidence" value={a.medianConfidence == null ? "—" : `${a.medianConfidence} %`} hint="Evidence confidence beside every score" />
      </div>
      {batchId ? (
        <div className="flex flex-wrap gap-2">
          <Link href={COHORT_TABLE_PATH(batchId)} className={btnPrimary}>
            Open the cohort table
          </Link>
          <Link href="/workspace/evaluations" className={btn}>
            Batch score more startups
          </Link>
        </div>
      ) : (
        <>
          <Empty title="No cohort scored yet" body="Tick the startups in your evaluations workspace and choose Batch score — every applicant lands on the same rubric with an evidence confidence level." cta={{ href: "/workspace/evaluations", label: "Startups I'm evaluating" }} />
          <div className="flex flex-wrap items-start justify-center gap-2" data-testid="assessment-empty-actions">
            <Link href="/workspace/evaluations/cohort" className={btn}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {demoLabels.importCsv}
            </Link>
            <LoadDemoCohortButton labels={demoLabels} hrefTemplate="/workspace/accelerator?stage=assessment&batch={batchId}" />
          </div>
        </>
      )}
    </div>
  );
}

function SelectionPanel({ view, batchId, canAct }: { view: ProgramJourneyView; batchId: string | null; canAct: boolean }) {
  const s = view.selection;
  return (
    <div className="space-y-4" data-testid="panel-selection">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Shortlisted" value={String(s.shortlisted)} />
        <Tile label="Proceed" value={String(s.decisions.proceed)} />
        <Tile label="Track" value={String(s.decisions.track)} />
        <Tile label="Pass" value={String(s.decisions.pass)} />
        <Tile label="Undecided" value={String(s.decisions.undecided)} hint="No submitted decision" />
      </div>
      <p className="text-sm text-secondary">Decisions are your committee&apos;s submitted assessments; the SVI is scored independently of them. Humans make the decision.</p>
      {batchId ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`${COHORT_TABLE_PATH(batchId)}?shortlist=1`} className={btnPrimary} data-testid="selection-shortlist-link">
            Shortlist on the cohort table
          </Link>
          <Link href={COHORT_TABLE_PATH(batchId)} className={btn}>
            All applicants
          </Link>
        </div>
      ) : (
        <Empty title="Nothing to decide yet" body="Score a cohort first; decisions, conviction and the shortlist live on the cohort table." />
      )}
      {batchId ? <FeedbackLettersPanel batchId={batchId} candidates={s.nonSelected.map((x) => ({ projectId: x.projectId, name: x.name }))} canSend={canAct} /> : null}
    </div>
  );
}

function ProgramPanel({ view, batchId, canAct }: { view: ProgramJourneyView; batchId: string | null; canAct: boolean }) {
  const p = view.program;
  const rows = p.startups.filter((s) => s.svi != null);
  return (
    <div className="space-y-4" data-testid="panel-program">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">
          {p.snapshots.length === 0 ? "No cohort snapshot yet — take one to track movement between sessions." : `${p.snapshots.length} snapshot${p.snapshots.length === 1 ? "" : "s"} · latest ${new Date(p.snapshots[p.snapshots.length - 1].takenAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}`}
        </p>
        {batchId && canAct ? <RescoreButton endpoint={COHORT_SNAPSHOT_ENDPOINT(batchId)} /> : null}
      </div>
      {rows.length === 0 ? (
        <Empty title="No scored startup in the program yet" body="Once applicants are scored, each one gets a progress sparkline, its evidence completion and the mentor-gap list — the weakest dimension and the evidence that would lift it." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="program-rows">
          {rows.map((s) => (
            <li key={s.itemId} className="rounded-2xl border border-line-subtle bg-surface p-4" data-testid="program-row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={s.dossierUrl} className="truncate text-base font-semibold text-primary hover:underline">
                    {s.name}
                  </Link>
                  {s.isDemo ? (
                    <div className="mt-1">
                      <DemoCohortChip />
                    </div>
                  ) : null}
                  <p className="mt-0.5 text-xs text-tertiary">
                    SVI {s.svi == null ? "—" : Math.round(s.svi)} · confidence {s.confidence == null ? "—" : `${s.confidence} %`} · {stageName(s.stage)}
                    {s.decision ? ` · ${COHORT_DECISION_LABELS[s.decision]}` : ""}
                  </p>
                </div>
                <Sparkline values={s.scoreHistory} label={`SVI history for ${s.name}`} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-tertiary">Evidence completion</p>
                  <p className="font-semibold tabular-nums text-primary">{s.evidence.completionPct} %</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={s.evidence.completionPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Evidence completion ${s.evidence.completionPct} %`}>
                    <div className="h-full rounded-full bg-action" style={{ width: `${s.evidence.completionPct}%` }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-tertiary">Mentor gap</p>
                  {s.mentorGap ? (
                    <p className="font-semibold text-primary">
                      {s.mentorGap.title} <span className="font-normal text-tertiary">({s.mentorGap.score == null ? "—" : Math.round(s.mentorGap.score)})</span>
                    </p>
                  ) : (
                    <p className="text-tertiary">—</p>
                  )}
                </div>
              </div>
              {s.mentorGap && s.mentorGap.missing.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-secondary" data-testid="mentor-gap-list">
                  {s.mentorGap.missing.map((m) => (
                    <li key={m.code} className="flex items-start gap-2">
                      <Circle className="mt-1 h-3 w-3 shrink-0 text-tertiary" aria-hidden="true" />
                      <span>
                        {m.label} <span className="text-tertiary">· up to +{m.estimatedSviImpact} SVI</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : s.mentorGap ? (
                <p className="mt-2 text-sm text-secondary">Every catalogue item for this dimension is on file — the next step is verification.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DemoDayPanel({ view, batchId }: { view: ProgramJourneyView; batchId: string | null }) {
  const rows = view.demoDay.rows;
  return (
    <div className="space-y-4" data-testid="panel-demo-day">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">{rows.length === 0 ? "Selected startups appear here — shortlist them or record a “proceed” decision on the cohort table." : `${rows.length} selected startup${rows.length === 1 ? "" : "s"} — a BlockID Dossier and a live profile each.`}</p>
        {batchId ? (
          <a href={DEMO_DAY_PACK_HREF(batchId)} className={btnPrimary} data-testid="demo-day-pack-link">
            <Download className="h-4 w-4" aria-hidden="true" />
            Demo-day pack (PDF)
          </a>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Empty title="No selected startup yet" body="The demo-day view compares the selected startups on SVI, evidence confidence, verification and their top gap, and links each BlockID Dossier and live profile." cta={batchId ? { href: `${COHORT_TABLE_PATH(batchId)}?shortlist=1`, label: "Shortlist on the cohort table" } : undefined} />
      ) : (
        <div className="overflow-auto max-h-[75vh] rounded-2xl border border-line-subtle bg-surface">
          <table className="min-w-full text-sm" data-testid="demo-day-table">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
              <tr className="border-b border-line-subtle text-left text-xs uppercase tracking-wide text-tertiary">
                <th className="px-4 py-3">Startup</th>
                <th className="px-4 py-3 text-right">SVI</th>
                <th className="px-4 py-3 text-right">Confidence</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Top gap</th>
                <th className="px-4 py-3">Readiness</th>
                <th className="px-4 py-3">Links</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
              {rows.map(({ startup: s, verificationLabel, readiness }) => (
                <tr key={s.itemId} className="border-b border-line-subtle last:border-0" data-testid="demo-day-row">
                  <td className="px-4 py-3 font-medium text-primary">
                    {s.name}
                    {s.isDemo ? (
                      <div className="mt-1">
                        <DemoCohortChip />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-primary">{s.svi == null ? "—" : Math.round(s.svi)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-primary">{s.confidence == null ? "—" : `${s.confidence} %`}</td>
                  <td className="px-4 py-3 text-secondary">{verificationLabel}</td>
                  <td className="px-4 py-3 text-secondary">{s.topGap ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-secondary" data-readiness={readiness}>
                      {readiness === "ready" ? <CheckCircle2 className="h-4 w-4 text-bull" aria-hidden="true" /> : readiness === "gaps" ? <CircleDot className="h-4 w-4 text-warn" aria-hidden="true" /> : <Circle className="h-4 w-4 text-tertiary" aria-hidden="true" />}
                      {readiness === "ready" ? "Ready" : readiness === "gaps" ? "Gaps to close" : "Unscored"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-2">
                      <Link href={s.dossierUrl} className="inline-flex min-h-11 items-center gap-1 text-action hover:underline">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        Dossier
                      </Link>
                      {s.profileUrl ? (
                        <Link href={s.profileUrl} className="inline-flex min-h-11 items-center gap-1 text-action hover:underline">
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          Live profile
                        </Link>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SponsorPanel({ view, batchId }: { view: ProgramJourneyView; batchId: string | null }) {
  const sp = view.sponsor;
  return (
    <div className="space-y-4" data-testid="panel-sponsor">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Startups" value={`${sp.scored} / ${sp.n}`} hint="scored / in cohort" />
        <Tile label="Snapshots" value={String(sp.snapshots)} hint="movement needs two" />
        <Tile label="Reviewer overrides" value={String(sp.overrides)} hint="shown beside the model score" />
        <Tile label="Outputs" value={`${sp.dossiers} · ${sp.lettersSent}`} hint="dossiers · feedback letters" />
      </div>
      <p className="text-sm text-secondary">
        The Cohort Report covers cohort movement, median improvement per dimension, the benchmark line (only from n = 10, always with n), evidence completion, outputs, the top strengths and gaps, the human-review note and a reviewer signature block. Humans made every decision.
      </p>
      {batchId ? (
        <div className="flex flex-wrap gap-2" data-testid="cohort-report-links">
          <a href={COHORT_REPORT_HREF(batchId, "html")} className={btnPrimary} target="_blank" rel="noopener">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Open the Cohort Report
          </a>
          <a href={COHORT_REPORT_HREF(batchId, "pdf")} className={btn}>
            <Download className="h-4 w-4" aria-hidden="true" />
            PDF
          </a>
          <a href={COHORT_REPORT_HREF(batchId, "csv")} className={btn}>
            <Download className="h-4 w-4" aria-hidden="true" />
            CSV
          </a>
          <Link href="/workspace/accelerator/quarterly-report" className={btn}>
            Cohort Report page
          </Link>
        </div>
      ) : (
        <Empty title="Nothing to report yet" body="Score a cohort and the report assembles itself from the record — nothing is typed in from memory." cta={{ href: "/workspace/evaluations", label: "Batch score a cohort" }} />
      )}
    </div>
  );
}

export { PROGRAM_STAGES };
