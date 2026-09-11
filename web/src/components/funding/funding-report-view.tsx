/**
 * FundingReportView — the body of a Money Finder report, shared by the paid
 * page (/funding/report/[id]) and the public sample (/funding/report/demo).
 *
 * Renders exactly what `/funding/report/[id]` rendered before the extraction
 * (T0244 full view): header (startup summary, state / stage chips, generated
 * + verified dates), "Your next 3 actions", ranked grant cards, programs,
 * 12-month SVG Gantt + table twin, narrative markdown, FUNDING_DISCLAIMER +
 * FundingDisclaimer. Everything that depends on WHO is looking comes in as
 * a slot so the sample never has to fake a viewer:
 *
 *   banner        — above the header (the sample's "Sample report" strip)
 *   ownerActions  — Download PDF / Save to data room (paid page, owner only)
 *   afterBody     — the Founder Radar upsell (paid page) or the sample's CTA
 *
 * Server component — no client state.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import { CalendarClock, MapPin, Sprout } from "lucide-react";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { ReportGrantCard, ReportProgramCard, type ReportCardContext } from "@/components/funding/report-cards";
import { TimelineGantt, TimelineTable } from "@/components/funding/timeline-gantt";
import type { PublicFundingReport } from "@/lib/funding/reports";
import { describeIntake, INTAKE_STAGES, NOT_INCORPORATED, STATE_OPTIONS } from "@/lib/funding/intake";
import { formatAudCompact, latestVerifiedAt } from "@/lib/funding/directory";
import { formatDateAu, formatDateTimeAu } from "@/lib/funding/deadline-status";
import { FUNDING_DISCLAIMER } from "@/lib/agents/grant-advisor";

/**
 * S8-C (2026-09-11): the narrative is LLM-generated text. react-markdown
 * already escapes raw HTML (no rehype-raw here — do not add it) and its
 * default urlTransform drops `javascript:` / `data:` hrefs; this override
 * additionally opens every link in a new tab with `rel="noopener
 * noreferrer nofollow"` so a model-written link can neither reach
 * `window.opener` nor pass PageRank.
 */
export const NARRATIVE_MD_COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
};

export interface FundingReportViewProps {
  report: PublicFundingReport;
  /** Signed-in viewers get the ICS + draft links on every card; guests see the official link only. */
  signedIn: boolean;
  banner?: ReactNode;
  ownerActions?: ReactNode;
  afterBody?: ReactNode;
}

export function FundingReportView({ report, signedIn, banner, ownerActions, afterBody }: FundingReportViewProps) {
  const ready = report.status === "ready";
  const verified = latestVerifiedAt([
    ...report.grants.map((g) => g.grant),
    ...report.programs.map((p) => p.program),
  ]);
  const summary = report.meta?.summary;
  const intake = report.intake;
  const stateForTz = intake ? (intake.state === NOT_INCORPORATED ? intake.based_state ?? null : intake.state) : null;
  const stateLabel = intake
    ? intake.state === NOT_INCORPORATED
      ? intake.based_state
        ? `Based in ${STATE_OPTIONS.find((o) => o.value === intake.based_state)?.label ?? intake.based_state} · not incorporated`
        : "Not incorporated yet"
      : STATE_OPTIONS.find((o) => o.value === intake.state)?.label ?? intake.state
    : null;
  const stageLabel = intake ? INTAKE_STAGES.find((s) => s.value === intake.stage)?.label ?? intake.stage : null;
  const today = report.meta?.today ? new Date(`${report.meta.today}T00:00:00Z`) : new Date(report.created_at);
  const ctx: ReportCardContext = { reportId: report.id, signedIn, today };
  const actions = (report.meta?.actions ?? []).slice(0, 3);

  return (
    <article className="mx-auto max-w-5xl px-6 py-12" data-funding-report data-status={report.status}>
      {banner}
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-action">Money Finder report</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary">
          {ready && summary
            ? `${summary.grant_count} grants and ${summary.program_count} programs, ranked for you`
            : "Your report is being prepared"}
        </h1>
        {intake ? (
          <p className="mt-3 max-w-3xl text-base text-secondary" data-startup-summary>
            {intake.description}
          </p>
        ) : null}
        {intake ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" data-intake-chips>
            <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface-raised px-2.5 py-1 font-semibold text-primary">
              <MapPin className="h-3 w-3 text-action" aria-hidden /> {stateLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface-raised px-2.5 py-1 font-semibold text-primary">
              <Sprout className="h-3 w-3 text-bull" aria-hidden /> {stageLabel}
            </span>
            <span className="sr-only">{describeIntake(intake)}</span>
          </div>
        ) : null}
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary" data-report-dates>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Generated {formatDateTimeAu(report.meta?.generated_at ?? report.created_at, stateForTz)}
          </span>
          <span>Catalogue verified as of {formatDateAu(verified, stateForTz, { withZone: false })}</span>
        </p>
        {ownerActions}
      </header>

      {!ready ? (
        <section className="mt-8 rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-sm text-secondary">
          {report.status === "failed" ? (
            <p>
              We could not generate this report. Reply to your receipt email or contact support and we will fix it
              and resend the link — you will not be charged twice.
            </p>
          ) : (
            <p>
              Payment received. We are matching your profile against the catalogue and writing your plan — this
              takes about a minute. Refresh this page, or open the link in your email when it arrives.
            </p>
          )}
        </section>
      ) : (
        <>
          {summary && summary.top_grants_amount_max_aud > 0 ? (
            <p className="mt-6 text-lg text-primary">
              Up to <strong>{formatAudCompact(summary.top_grants_amount_max_aud)}</strong> across your top five grants
              {summary.timeline_count ? ` · ${summary.timeline_count} dated actions over the next 12 months` : ""}.
            </p>
          ) : null}

          {/* ── Next 3 actions ─────────────────────────────────────── */}
          {actions.length ? (
            <section className="mt-8 rounded-2xl border border-action/40 bg-surface-raised p-6" aria-labelledby="fr-actions">
              <h2 id="fr-actions" className="text-lg font-semibold text-primary">Your next 3 actions</h2>
              <ol className="mt-3 space-y-2 text-sm text-secondary">
                {actions.map((a, i) => (
                  <li key={a} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action" aria-hidden>
                      {i + 1}
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* ── Grants ─────────────────────────────────────────────── */}
          <section className="mt-10" aria-labelledby="fr-grants">
            <h2 id="fr-grants" className="text-2xl font-semibold text-primary">Grants, ranked</h2>
            {report.grants.length === 0 ? (
              <p className="mt-2 text-sm text-secondary">
                No grant passed every hard gate for this profile. The{" "}
                <Link href="/funding/grants" className="font-semibold text-action">free directory</Link> still lists every open scheme.
              </p>
            ) : null}
            <ol className="mt-4 space-y-4">
              {report.grants.map((g, i) => (
                <ReportGrantCard key={g.ref_id} g={g} rank={i + 1} ctx={ctx} />
              ))}
            </ol>
          </section>

          {/* ── Programs ───────────────────────────────────────────── */}
          <section className="mt-10" aria-labelledby="fr-programs">
            <h2 id="fr-programs" className="text-2xl font-semibold text-primary">Programs</h2>
            {report.programs.length === 0 ? (
              <p className="mt-2 text-sm text-secondary">No program matched this stage and location.</p>
            ) : null}
            <ol className="mt-4 space-y-4">
              {report.programs.map((p, i) => (
                <ReportProgramCard key={p.ref_id} p={p} rank={i + 1} ctx={ctx} />
              ))}
            </ol>
          </section>

          {/* ── Timeline ───────────────────────────────────────────── */}
          <section className="mt-10" aria-labelledby="fr-timeline">
            <h2 id="fr-timeline" className="text-2xl font-semibold text-primary">12-month timeline</h2>
            <p className="mt-1 text-sm text-secondary">
              Each bar runs from the month to start work to the deadline. Hover a bar for the lead time.
            </p>
            <div className="mt-4 rounded-2xl border border-line-subtle bg-surface p-4">
              <TimelineGantt items={report.timeline} today={report.meta?.today ?? report.created_at} state={stateForTz} />
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-secondary">Show as a table</summary>
              <TimelineTable items={report.timeline} state={stateForTz} className="mt-3" />
            </details>
          </section>

          {report.narrative_md ? (
            <section className="mt-10 rounded-2xl border border-line-subtle bg-surface p-6" aria-labelledby="fr-narrative">
              <h2 id="fr-narrative" className="text-2xl font-semibold text-primary">Your plan, in plain English</h2>
              <div className="prose prose-sm mt-4 max-w-none text-secondary">
                <Markdown components={NARRATIVE_MD_COMPONENTS}>{report.narrative_md}</Markdown>
              </div>
            </section>
          ) : null}
        </>
      )}

      {afterBody}

      <p className="mt-10 text-xs leading-relaxed text-tertiary" data-funding-disclaimer>
        {FUNDING_DISCLAIMER}
      </p>
      <FundingDisclaimer lastVerifiedAt={verified} className="mt-4" />
    </article>
  );
}

export default FundingReportView;
