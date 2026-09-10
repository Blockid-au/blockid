/**
 * /funding/report/[id] — paid Money Finder report (T0242 minimal view;
 * T0244 restyles it with the SVG Gantt, DOCX/PDF and save-to-data-room).
 *
 * Access mirrors GET /api/funding/report/[id]: signed-in owner, emailed
 * `?t=<access_token>`, or the Stripe `?s=<session>` success redirect. Any
 * other visitor gets a 404. Dynamic (reads cookies + query) and never cached.
 *
 * Renders: ranked grants (name, A$, status/deadline chip, checklist ✓ / ✗ / ?,
 * official link), programs, the timeline as a month list, the narrative
 * markdown, the §5f disclaimer via `FUNDING_DISCLAIMER` + `FundingDisclaimer`,
 * and the Founder Radar upsell.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { ArrowRight, ExternalLink } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { StatusChip } from "@/components/funding/status-chip";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingReportTracker } from "@/components/funding/funding-report-tracker";
import { getCurrentUser } from "@/lib/auth";
import { canViewFundingReport, getFundingReport, publicFundingReport } from "@/lib/funding/reports";
import { describeIntake } from "@/lib/funding/intake";
import { formatAudCompact, formatAudRange, latestVerifiedAt } from "@/lib/funding/directory";
import { FUNDING_DISCLAIMER, type EligibilityCheck, type TimelineItem } from "@/lib/agents/grant-advisor";

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

  return (
    <MarketingShell>
      <FundingReportTracker reportId={report.id} paidVia={(report.paid_via as "one_off" | "credits" | "plan" | null) ?? "one_off"} />
      <article className="mx-auto max-w-5xl px-6 py-12" data-funding-report data-status={report.status}>
        <p className="text-xs font-semibold uppercase tracking-wide text-action">Money Finder report</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary">
          {ready && summary
            ? `${summary.grant_count} grants and ${summary.program_count} programs, ranked for you`
            : "Your report is being prepared"}
        </h1>
        {report.intake ? <p className="mt-2 text-sm text-secondary">{describeIntake(report.intake)}</p> : null}

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
              <p className="mt-4 text-lg text-primary">
                Up to <strong>{formatAudCompact(summary.top_grants_amount_max_aud)}</strong> across your top five grants
                {summary.timeline_count ? ` · ${summary.timeline_count} dated actions over the next 12 months` : ""}.
              </p>
            ) : null}

            {report.meta?.actions?.length ? (
              <section className="mt-8 rounded-2xl border border-action/40 bg-surface-raised p-6" aria-labelledby="fr-actions">
                <h2 id="fr-actions" className="text-lg font-semibold text-primary">Next 3 actions</h2>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-secondary">
                  {report.meta.actions.slice(0, 3).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section className="mt-10" aria-labelledby="fr-grants">
              <h2 id="fr-grants" className="text-2xl font-semibold text-primary">Grants, ranked</h2>
              {report.grants.length === 0 ? (
                <p className="mt-2 text-sm text-secondary">No grant passed every hard gate for this profile. The free directory still lists every open scheme.</p>
              ) : null}
              <ol className="mt-4 space-y-4">
                {report.grants.map((g, i) => (
                  <li key={g.ref_id} className="rounded-2xl border border-line-subtle bg-surface p-5" data-grant={g.ref_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                          #{i + 1} · fit {g.score}/100
                        </p>
                        <h3 className="text-lg font-semibold text-primary">{g.name}</h3>
                        <p className="text-sm text-secondary">
                          {formatAudRange(g.grant.amount_min_aud, g.grant.amount_max_aud, g.grant.amount_note)}
                          {typeof g.estimate_aud === "number" ? ` · est. ${formatAudCompact(g.estimate_aud)} for you` : ""}
                        </p>
                      </div>
                      <StatusChip
                        status={g.effective_status}
                        closes_at={g.next_window.closes_at ?? g.grant.closes_at}
                        next_round_note={g.next_window.label}
                      />
                    </div>
                    {g.estimate_note ? <p className="mt-2 text-xs text-tertiary">{g.estimate_note}</p> : null}
                    <Checklist items={g.eligibility_checklist} />
                    {g.why.length ? <p className="mt-3 text-sm text-secondary">{g.why.join(" ")}</p> : null}
                    <a
                      href={g.grant.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-action"
                    >
                      Official page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-10" aria-labelledby="fr-programs">
              <h2 id="fr-programs" className="text-2xl font-semibold text-primary">Programs</h2>
              {report.programs.length === 0 ? (
                <p className="mt-2 text-sm text-secondary">No program matched this stage and location.</p>
              ) : null}
              <ol className="mt-4 space-y-4">
                {report.programs.map((p, i) => (
                  <li key={p.ref_id} className="rounded-2xl border border-line-subtle bg-surface p-5" data-program={p.ref_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                          #{i + 1} · fit {p.score}/100 · {p.program.city}
                        </p>
                        <h3 className="text-lg font-semibold text-primary">{p.name}</h3>
                        <p className="text-sm text-secondary">
                          {p.program.funding_aud ? `${formatAudCompact(p.program.funding_aud)} funding` : "No cash"}
                          {p.program.equity_pct ? ` · ${p.program.equity_pct} equity` : ""}
                          {p.program.length_weeks ? ` · ${p.program.length_weeks} weeks` : ""}
                        </p>
                      </div>
                      <StatusChip
                        status={p.effective_status}
                        applications_close={p.next_window.closes_at ?? p.program.applications_close}
                        next_round_note={p.next_window.label}
                      />
                    </div>
                    <Checklist items={p.eligibility_checklist} />
                    {p.why.length ? <p className="mt-3 text-sm text-secondary">{p.why.join(" ")}</p> : null}
                    <a
                      href={p.program.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-action"
                    >
                      Official page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-10" aria-labelledby="fr-timeline">
              <h2 id="fr-timeline" className="text-2xl font-semibold text-primary">12-month timeline</h2>
              <Timeline items={report.timeline} />
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

const CHECK_GLYPH: Record<EligibilityCheck["status"], { glyph: string; cls: string }> = {
  pass: { glyph: "✓", cls: "text-bull" },
  fail: { glyph: "✗", cls: "text-bear" },
  unknown: { glyph: "?", cls: "text-warn" },
};

function Checklist({ items }: { items: EligibilityCheck[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2" aria-label="Eligibility checklist">
      {items.map((c, i) => (
        <li key={`${c.label}-${i}`} className="flex items-start gap-2">
          <span className={`font-mono font-bold ${CHECK_GLYPH[c.status].cls}`} aria-label={c.status}>
            {CHECK_GLYPH[c.status].glyph}
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

function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="mt-2 text-sm text-secondary">Nothing dated yet — rolling schemes can be lodged any time.</p>;
  const byMonth = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const list = byMonth.get(it.month) ?? [];
    list.push(it);
    byMonth.set(it.month, list);
  }
  return (
    <ol className="mt-4 space-y-4">
      {Array.from(byMonth.entries()).map(([month, list]) => (
        <li key={month} className="rounded-2xl border border-line-subtle bg-surface p-4">
          <p className="text-sm font-semibold text-primary">{monthLabel(month)}</p>
          <ul className="mt-2 space-y-1 text-sm text-secondary">
            {list.map((it, i) => (
              <li key={`${it.ref_id}-${i}`}>
                <span className="font-medium text-primary">{it.name}</span> — {it.action}
                {it.deadline ? <span className="text-tertiary"> (deadline {it.deadline})</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}
