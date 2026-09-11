/**
 * Report cards for the paid Money Finder report (T0244, plan §4f / D-4).
 *
 * Every card: rank · name · A$ range · deadline chip (RDStatus ladder) ·
 * score bar · eligibility checklist ✓ / ✗ / ? · "Why you" one-liner ·
 * official link · Add to calendar (ICS, signed-in only — T0245 ships the
 * route) · Draft application (credits) → /workspace/funding?draft=<id>.
 *
 * Server components; used by /funding/report/[id] and the workspace tabs.
 */

import Link from "next/link";
import { CalendarPlus, ExternalLink, PenLine } from "lucide-react";
import type { EligibilityCheck, ScoredGrant, ScoredProgram } from "@/lib/agents/grant-advisor";
import { formatAudCompact, formatAudRange, programTypeLabel } from "@/lib/funding/directory";
import { DeadlineChip } from "./deadline-chip";

export interface ReportCardContext {
  reportId: string;
  /** Signed-in viewers get the ICS + draft links; guests see the official link only. */
  signedIn: boolean;
  today?: Date;
}

const CHECK_GLYPH: Record<EligibilityCheck["status"], { glyph: string; cls: string; label: string }> = {
  pass: { glyph: "✓", cls: "text-bull", label: "pass" },
  fail: { glyph: "✗", cls: "text-bear", label: "fail" },
  unknown: { glyph: "?", cls: "text-warn", label: "unknown" },
};

export function EligibilityChecklist({ items }: { items: EligibilityCheck[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2" aria-label="Eligibility checklist">
      {items.map((c, i) => (
        <li key={`${c.label}-${i}`} className="flex items-start gap-2">
          <span className={`font-mono font-bold ${CHECK_GLYPH[c.status].cls}`}>
            <span aria-hidden="true">{CHECK_GLYPH[c.status].glyph}</span>
            <span className="sr-only">{CHECK_GLYPH[c.status].label}:</span>
          </span>
          <span className="text-secondary">
            {c.label}
            {c.detail ? <span className="text-tertiary"> — {c.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 0–100 fit score as a thin bar; the number sits beside it in text ink. */
export function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="mt-2 flex items-center gap-2" data-score={pct}>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Fit score">
        <div className="h-full rounded-full bg-action" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-primary">{pct}/100 fit</span>
    </div>
  );
}

function CardActions({ ctx, refId, officialUrl, kind }: { ctx: ReportCardContext; refId: string; officialUrl: string; kind: "grant" | "program" }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
      <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 text-action">
        Official page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      {ctx.signedIn ? (
        <>
          <a
            href={`/api/funding/calendar.ics?report=${encodeURIComponent(ctx.reportId)}&ref=${encodeURIComponent(refId)}`}
            className="inline-flex min-h-6 items-center gap-1 text-secondary hover:text-primary"
            data-ics={refId}
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Add to calendar
          </a>
          <Link
            href={`/workspace/funding?draft=${encodeURIComponent(refId)}&kind=${kind}`}
            className="inline-flex min-h-6 items-center gap-1 text-secondary hover:text-primary"
            data-draft={refId}
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden /> Draft application (credits)
          </Link>
        </>
      ) : null}
    </div>
  );
}

export function ReportGrantCard({ g, rank, ctx }: { g: ScoredGrant; rank: number; ctx: ReportCardContext }) {
  const why = g.why[0] ?? "Matches your stage and location.";
  return (
    <li className="rounded-2xl border border-line-subtle bg-surface p-5" data-grant={g.ref_id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            #{rank} · fit {g.score}/100
          </p>
          <h3 className="text-lg font-semibold text-primary">{g.name}</h3>
          <p className="text-sm text-secondary">
            {formatAudRange(g.grant.amount_min_aud, g.grant.amount_max_aud, g.grant.amount_note)}
            {typeof g.estimate_aud === "number" ? ` · est. ${formatAudCompact(g.estimate_aud)} for you` : ""}
          </p>
        </div>
        <DeadlineChip
          opens_at={g.next_window.opens_at ?? g.grant.opens_at}
          closes_at={g.next_window.closes_at ?? g.grant.closes_at}
          rolling={g.next_window.kind === "rolling"}
          catalogue_status={g.effective_status}
          today={ctx.today}
        />
      </div>
      <ScoreBar score={g.score} />
      {g.estimate_note ? <p className="mt-2 text-xs text-tertiary">{g.estimate_note}</p> : null}
      <EligibilityChecklist items={g.eligibility_checklist} />
      <p className="mt-3 text-sm text-secondary" data-why>
        <span className="font-semibold text-primary">Why you: </span>
        {why}
      </p>
      <CardActions ctx={ctx} refId={g.ref_id} officialUrl={g.grant.official_url} kind="grant" />
    </li>
  );
}

export function ReportProgramCard({ p, rank, ctx }: { p: ScoredProgram; rank: number; ctx: ReportCardContext }) {
  const why = p.why[0] ?? "Runs cohorts for your stage in your city.";
  return (
    <li className="rounded-2xl border border-line-subtle bg-surface p-5" data-program={p.ref_id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            #{rank} · fit {p.score}/100 · {programTypeLabel(p.program.program_type)} · {p.program.city}
          </p>
          <h3 className="text-lg font-semibold text-primary">{p.name}</h3>
          <p className="text-sm text-secondary">
            {p.program.funding_aud ? `${formatAudCompact(p.program.funding_aud)} funding` : "No cash"}
            {p.program.equity_pct ? ` · ${p.program.equity_pct} equity` : ""}
            {p.program.length_weeks ? ` · ${p.program.length_weeks} weeks` : ""}
          </p>
        </div>
        <DeadlineChip
          opens_at={p.next_window.opens_at ?? p.program.applications_open}
          closes_at={p.next_window.closes_at ?? p.program.applications_close}
          rolling={p.next_window.kind === "rolling"}
          catalogue_status={p.effective_status}
          today={ctx.today}
        />
      </div>
      <ScoreBar score={p.score} />
      <EligibilityChecklist items={p.eligibility_checklist} />
      <p className="mt-3 text-sm text-secondary" data-why>
        <span className="font-semibold text-primary">Why you: </span>
        {why}
      </p>
      <CardActions ctx={ctx} refId={p.ref_id} officialUrl={p.program.official_url} kind="program" />
    </li>
  );
}
