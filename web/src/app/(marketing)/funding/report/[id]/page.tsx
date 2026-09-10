/**
 * /funding/report/[id] — paid Money Finder report (T0242 minimal view →
 * T0244 full view: SVG Gantt, PDF, save-to-data-room, RDStatus deadline chips).
 *
 * Access mirrors GET /api/funding/report/[id]: signed-in owner, emailed
 * `?t=<access_token>`, or the Stripe `?s=<session>` success redirect. Any
 * other visitor gets a 404. Dynamic (reads cookies + query) and never cached.
 *
 * Layout (plan §4f / §4i D-4):
 *   header — startup summary from the intake, state / stage chips, generated
 *            date and "verified as of" date (AEST/AWST per state)
 *   owner bar — Download PDF · Save to data room (signed-in owner only)
 *   "Your next 3 actions" · ranked grant cards · programs · 12-month SVG
 *   Gantt (+ table twin) · narrative markdown · FUNDING_DISCLAIMER +
 *   FundingDisclaimer · Founder Radar upsell → /pricing.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { ArrowRight, CalendarClock, MapPin, Sprout } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingReportTracker } from "@/components/funding/funding-report-tracker";
import { ReportGrantCard, ReportProgramCard, type ReportCardContext } from "@/components/funding/report-cards";
import { ReportOwnerActions } from "@/components/funding/report-owner-actions";
import { TimelineGantt, TimelineTable } from "@/components/funding/timeline-gantt";
import { getCurrentUser } from "@/lib/auth";
import { canViewFundingReport, getFundingReport, publicFundingReport } from "@/lib/funding/reports";
import { describeIntake, INTAKE_STAGES, NOT_INCORPORATED, STATE_OPTIONS } from "@/lib/funding/intake";
import { formatAudCompact, latestVerifiedAt } from "@/lib/funding/directory";
import { formatDateAu, formatDateTimeAu } from "@/lib/funding/deadline-status";
import { FUNDING_DISCLAIMER } from "@/lib/agents/grant-advisor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Money Finder report · BlockID.au",
  robots: { index: false, follow: false },
};

type Params = { id: string };
type Search = { t?: string; s?: string };

export default async function FundingReportPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const user = await getCurrentUser();
  const row = await getFundingReport(id);
  if (!row) notFound();
  const viewer = { userId: user?.id ?? null, token: sp.t ?? null, sessionId: sp.s ?? null };
  if (!canViewFundingReport(row, viewer)) notFound();
  const report = publicFundingReport(row, viewer);

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
  const ctx: ReportCardContext = { reportId: report.id, signedIn: Boolean(user), today };
  const actions = (report.meta?.actions ?? []).slice(0, 3);

  return (
    <MarketingShell>
      <FundingReportTracker reportId={report.id} paidVia={(report.paid_via as "one_off" | "credits" | "plan" | null) ?? "one_off"} />
      <article className="mx-auto max-w-5xl px-6 py-12" data-funding-report data-status={report.status}>
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
          {report.is_owner && ready ? <ReportOwnerActions reportId={report.id} projectId={report.project_id} className="mt-5" /> : null}
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
                  <Markdown>{report.narrative_md}</Markdown>
                </div>
              </section>
            ) : null}
          </>
        )}

        {/* ── Upsell ─────────────────────────────────────────────────── */}
        <section className="mt-10 rounded-2xl border border-action/40 bg-surface-raised p-6" aria-labelledby="fr-radar">
          <h2 id="fr-radar" className="text-lg font-semibold text-primary">Deadlines move — Founder Radar A$29/mo</h2>
          <p className="mt-2 text-sm text-secondary">
            Windows in this report open and close through the year. Founder Radar re-runs this match weekly, alerts you
            before each deadline you fit, and includes 20 AI credits a month. 7-day trial.
          </p>
          <Link href="/pricing" className="mt-3 inline-flex items-center gap-2 font-semibold text-action">
            See Founder Radar <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        <p className="mt-10 text-xs leading-relaxed text-tertiary" data-funding-disclaimer>
          {FUNDING_DISCLAIMER}
        </p>
        <FundingDisclaimer lastVerifiedAt={verified} className="mt-4" />
      </article>
    </MarketingShell>
  );
}
