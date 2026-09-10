"use client";

/**
 * FundingWorkspace — the tabbed Money Radar page body for paid founders
 * (T0244, plan §4i D-2): Grants · Programs · Events · Timeline · Capital map
 * · Alerts. Everything is passed in serialised from the server page; this
 * component only owns the active tab (also readable from `?tab=`).
 */

import * as React from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import { ArrowRight, Bell, CalendarDays, ExternalLink, Landmark, Layers3, Lock, Mail, RefreshCw, Sparkles, Users } from "lucide-react";
import type { ScoredGrant, ScoredProgram, TimelineItem } from "@/lib/agents/grant-advisor";
import type { AuProgramRow } from "@/lib/funding/seed-map";
import type { InvestorMatch } from "@/lib/funding/investor-match";
import { FUNDING_COPY } from "@/lib/funding/copy";
import { ReportGrantCard, ReportProgramCard, type ReportCardContext } from "@/components/funding/report-cards";
import { TimelineGantt, TimelineTable } from "@/components/funding/timeline-gantt";
import { DeadlineChip } from "@/components/funding/deadline-chip";
import { formatDateAu } from "@/lib/funding/deadline-status";
import { capitalSlug, programTypeLabel } from "@/lib/funding/directory";

export type FundingTab = "grants" | "programs" | "events" | "timeline" | "capital" | "investors" | "refresh" | "alerts";

export const FUNDING_TABS: ReadonlyArray<{ id: FundingTab; label: string }> = [
  { id: "grants", label: "Grants" },
  { id: "programs", label: "Programs" },
  { id: "events", label: "Events" },
  { id: "timeline", label: "Timeline" },
  { id: "capital", label: "Capital map" },
  { id: "investors", label: "Investors" },
  { id: "refresh", label: "Expert update" },
  { id: "alerts", label: "Alerts" },
];

/** Growth extras (T0251, §4h Growth row). `unlocked` false → locked cards with the D-3 copy. */
export interface GrowthExtras {
  unlocked: boolean;
  investors: InvestorMatch[];
  refresh: { quarter: string; body_md: string; changes: number; created_at: string } | null;
  /** ISO day the next quarterly note lands. */
  nextRefreshDate: string | null;
  startup: string | null;
}

export interface CapitalMapSection {
  type: string;
  label: string;
  blurb: string;
  article: { href: string; label: string };
  rows: AuProgramRow[];
}

export interface FundingWorkspaceProps {
  report: {
    id: string;
    created_at: string;
    today: string | null;
    state: string | null;
    grants: ScoredGrant[];
    programs: ScoredProgram[];
    timeline: TimelineItem[];
    actions: string[];
    project_id: string | null;
  } | null;
  events: AuProgramRow[];
  capitalMap: CapitalMapSection[];
  alertKinds: ReadonlyArray<{ kind: string; label: string; detail: string }>;
  initialTab?: FundingTab;
  /** `?draft=<ref>&kind=program` — programs still get the acknowledgement stub (grant drafts render `draftEditor`). */
  draftRef?: string | null;
  /** Grant draft editor built by the server page for `?draft=<grantId>&kind=grant` (T0251). */
  draftEditor?: React.ReactNode;
  growth?: GrowthExtras | null;
}

export function isFundingTab(v: string | null | undefined): v is FundingTab {
  return FUNDING_TABS.some((t) => t.id === v);
}

export function FundingWorkspace({ report, events, capitalMap, alertKinds, initialTab = "grants", draftRef, draftEditor, growth }: FundingWorkspaceProps) {
  const [tab, setTab] = React.useState<FundingTab>(initialTab);
  const ctx: ReportCardContext | null = report
    ? { reportId: report.id, signedIn: true, today: report.today ? new Date(`${report.today}T00:00:00Z`) : new Date(report.created_at) }
    : null;

  return (
    <div data-funding-workspace data-tab={tab} data-growth={growth?.unlocked ? "1" : "0"}>
      {draftEditor ?? null}
      {draftRef && !draftEditor ? (
        <p className="mb-4 rounded-xl border border-action/40 bg-surface-raised px-4 py-3 text-sm text-secondary" data-draft-stub>
          <span className="font-semibold text-primary">Draft application for {draftRef}</span> — the CFO / CLO drafter for grant applications lands with
          the credits release. Your report is saved; we will prefill the application from it.
        </p>
      ) : null}

      <div role="tablist" aria-label="Money Radar" className="flex flex-wrap gap-1 border-b border-line-subtle">
        {FUNDING_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`funding-tab-${t.id}`}
            id={`funding-tab-btn-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? "border-action text-action" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={`funding-tab-${tab}`} role="tabpanel" aria-labelledby={`funding-tab-btn-${tab}`} className="mt-6">
        {tab === "grants" ? <GrantsTab report={report} ctx={ctx} /> : null}
        {tab === "programs" ? <ProgramsTab report={report} ctx={ctx} /> : null}
        {tab === "events" ? <EventsTab events={events} state={report?.state ?? null} /> : null}
        {tab === "timeline" ? <TimelineTab report={report} /> : null}
        {tab === "capital" ? <CapitalMapTab sections={capitalMap} /> : null}
        {tab === "investors" ? <InvestorsTab growth={growth ?? null} /> : null}
        {tab === "refresh" ? <RefreshTab growth={growth ?? null} /> : null}
        {tab === "alerts" ? <AlertsTab kinds={alertKinds} /> : null}
      </div>
    </div>
  );
}

function NoReport() {
  return (
    <div className="rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-6 text-sm text-secondary" data-no-report>
      <p className="font-semibold text-primary">No report for this startup yet.</p>
      <p className="mt-1">Answer the three questions below and run the match — it is included in your plan.</p>
      <a href="#intake" className="mt-3 inline-flex items-center gap-1 font-semibold text-action">
        Run my match <ArrowRight className="h-4 w-4" aria-hidden />
      </a>
    </div>
  );
}

function ReportMeta({ report }: { report: NonNullable<FundingWorkspaceProps["report"]> }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary">
      <span>Report from {formatDateAu(report.today ?? report.created_at.slice(0, 10), report.state, { withZone: false })}</span>
      <Link href={`/funding/report/${report.id}`} className="inline-flex items-center gap-1 font-semibold text-action">
        Open full report <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
      <a href="#intake" className="inline-flex items-center gap-1 font-semibold text-secondary hover:text-primary">
        <RefreshCw className="h-3 w-3" aria-hidden /> Re-run
      </a>
    </p>
  );
}

function GrantsTab({ report, ctx }: { report: FundingWorkspaceProps["report"]; ctx: ReportCardContext | null }) {
  if (!report || !ctx) return <NoReport />;
  return (
    <section aria-label="Grants">
      <ReportMeta report={report} />
      {report.grants.length === 0 ? <p className="text-sm text-secondary">No grant passed every hard gate for this profile.</p> : null}
      <ol className="space-y-4">
        {report.grants.map((g, i) => (
          <ReportGrantCard key={g.ref_id} g={g} rank={i + 1} ctx={ctx} />
        ))}
      </ol>
    </section>
  );
}

function ProgramsTab({ report, ctx }: { report: FundingWorkspaceProps["report"]; ctx: ReportCardContext | null }) {
  if (!report || !ctx) return <NoReport />;
  return (
    <section aria-label="Programs">
      <ReportMeta report={report} />
      {report.programs.length === 0 ? <p className="text-sm text-secondary">No program matched this stage and location.</p> : null}
      <ol className="space-y-4">
        {report.programs.map((p, i) => (
          <ReportProgramCard key={p.ref_id} p={p} rank={i + 1} ctx={ctx} />
        ))}
      </ol>
    </section>
  );
}

function EventsTab({ events, state }: { events: AuProgramRow[]; state: string | null }) {
  if (!events.length) {
    return (
      <p className="text-sm text-secondary" data-events-empty>
        No dated founder events in the catalogue for your capital right now. The{" "}
        <Link href="/funding/programs" className="font-semibold text-action">programs directory</Link> lists every city.
      </p>
    );
  }
  return (
    <section aria-label="Events">
      <p className="mb-4 text-sm text-secondary">
        Pitch nights, demo days and founder meetups near you — the fastest way to meet the angel groups and programs on your list.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2" data-events>
        {events.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line-subtle bg-surface p-4" data-event={e.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
              <CalendarDays className="mr-1 inline h-3 w-3" aria-hidden /> {e.city} · {e.operator ?? "Community"}
            </p>
            <h3 className="mt-1 font-semibold text-primary">{e.name}</h3>
            {e.summary ? <p className="mt-1 text-sm text-secondary">{e.summary}</p> : null}
            <DeadlineChip
              className="mt-2"
              opens_at={e.applications_open}
              closes_at={e.applications_close ?? e.next_cohort_start}
              catalogue_status={e.status}
            />
            <div className="mt-3 flex flex-wrap gap-x-4 text-sm font-semibold">
              <a href={e.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-action">
                Official page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <Link href={`/funding/programs/${capitalSlug(e.capital)}`} className="text-secondary hover:text-primary">
                More in {e.capital}
              </Link>
            </div>
            <span className="sr-only">{formatDateAu(e.applications_close ?? e.next_cohort_start, state)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimelineTab({ report }: { report: FundingWorkspaceProps["report"] }) {
  if (!report) return <NoReport />;
  return (
    <section aria-label="Timeline">
      <ReportMeta report={report} />
      {report.actions.length ? (
        <ol className="mb-6 grid gap-2 sm:grid-cols-3" data-actions>
          {report.actions.slice(0, 3).map((a, i) => (
            <li key={a} className="rounded-xl border border-action/40 bg-surface-raised p-3 text-sm text-secondary">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action" aria-hidden>
                {i + 1}
              </span>
              {a}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="rounded-2xl border border-line-subtle bg-surface p-4">
        <TimelineGantt items={report.timeline} today={report.today ?? report.created_at} state={report.state} />
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-secondary">Show as a table</summary>
        <TimelineTable items={report.timeline} state={report.state} className="mt-3" />
      </details>
    </section>
  );
}

function CapitalMapTab({ sections }: { sections: CapitalMapSection[] }) {
  return (
    <section aria-label="Capital map" className="space-y-6" data-capital-map>
      <p className="text-sm text-secondary">
        Where the money sits once grants are exhausted — from angels to export finance. Listed for information; nothing here is an offer or a
        recommendation.
      </p>
      {sections.map((s) => (
        <div key={s.type} className="rounded-2xl border border-line-subtle bg-surface p-5" data-capital-section={s.type}>
          <h3 className="inline-flex items-center gap-2 font-semibold text-primary">
            <Landmark className="h-4 w-4 text-action" aria-hidden /> {s.label}
            {s.rows.length ? <span className="text-xs font-normal text-tertiary">· {s.rows.length} in the catalogue</span> : null}
          </h3>
          <p className="mt-1 text-sm text-secondary">{s.blurb}</p>
          {s.rows.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {s.rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-line-subtle/70 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-primary">{r.name}</span>
                    <span className="block text-xs text-tertiary">
                      {programTypeLabel(r.program_type)} · {r.city}
                      {r.funding_aud ? ` · up to A$${r.funding_aud.toLocaleString("en-AU")}` : ""}
                    </span>
                  </span>
                  <a href={r.official_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-action" aria-label={`${r.name} official page`}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href={s.article.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-action">
            {s.article.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ))}
    </section>
  );
}

function LockedCard({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-6" data-growth-locked>
      <p className="inline-flex items-center gap-2 font-semibold text-primary">
        {icon} {title} <Lock className="h-3.5 w-3.5 text-tertiary" aria-hidden />
      </p>
      <p className="mt-1 text-sm text-secondary">{body}</p>
      <Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-action">
        See Growth <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function InvestorsTab({ growth }: { growth: GrowthExtras | null }) {
  if (!growth?.unlocked) {
    return (
      <section aria-label="Investors who match" data-investors>
        <LockedCard
          title={FUNDING_COPY.growth.investorsTitle}
          body={FUNDING_COPY.growth.investorsLocked}
          icon={<Users className="h-4 w-4 text-action" aria-hidden />}
        />
      </section>
    );
  }
  return (
    <section aria-label="Investors who match" data-investors data-count={growth.investors.length}>
      <p className="text-sm text-secondary">{FUNDING_COPY.growth.investorsIntro}</p>
      {growth.investors.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-5 text-sm text-secondary" data-no-investors>
          {FUNDING_COPY.growth.noInvestors}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {growth.investors.map((inv) => (
            <li key={inv.investor_id} className="rounded-2xl border border-line-subtle bg-surface p-4" data-investor={inv.investor_id} data-score={inv.score}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-primary">{inv.name}</p>
                <span className="rounded-full bg-action/10 px-2 py-0.5 text-xs font-semibold text-action">Fit {inv.score}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-secondary">
                {inv.reasons.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
                {inv.gaps.map((g) => (
                  <li key={`gap-${g}`} className="text-tertiary">· Outside their {g} preference</li>
                ))}
              </ul>
              {inv.cheque_band && inv.cheque_band !== "any" ? (
                <p className="mt-2 text-xs text-tertiary">Cheque: {inv.cheque_band.replace(/_/g, " ")}</p>
              ) : null}
              <a
                href={inv.intro_href}
                className="mt-3 inline-flex items-center gap-1 rounded-lg border border-line-subtle px-3 py-1.5 text-xs font-semibold text-primary"
                data-request-intro
              >
                <Mail className="h-3.5 w-3.5" aria-hidden /> {FUNDING_COPY.growth.requestIntro}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RefreshTab({ growth }: { growth: GrowthExtras | null }) {
  if (!growth?.unlocked) {
    return (
      <section aria-label="Quarterly expert update" data-refresh>
        <LockedCard
          title={FUNDING_COPY.growth.refreshTitle}
          body={FUNDING_COPY.growth.refreshLocked}
          icon={<Sparkles className="h-4 w-4 text-action" aria-hidden />}
        />
      </section>
    );
  }
  const r = growth.refresh;
  return (
    <section aria-label="Quarterly expert update" data-refresh data-quarter={r?.quarter ?? ""}>
      {!r ? (
        <div className="rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-5 text-sm text-secondary" data-no-refresh>
          <p className="inline-flex items-center gap-2 font-semibold text-primary">
            <Sparkles className="h-4 w-4 text-action" aria-hidden /> {FUNDING_COPY.growth.refreshTitle}
          </p>
          <p className="mt-1">{FUNDING_COPY.growth.noRefresh}</p>
          {growth.nextRefreshDate ? <p className="mt-1 text-xs text-tertiary">Next update: {growth.nextRefreshDate}</p> : null}
        </div>
      ) : (
        <article className="rounded-2xl border border-line-subtle bg-surface p-6">
          <p className="text-xs text-tertiary">
            {r.quarter} · {r.changes} change{r.changes === 1 ? "" : "s"} · prepared {r.created_at.slice(0, 10)}
            {growth.nextRefreshDate ? ` · next ${growth.nextRefreshDate}` : ""}
          </p>
          <div className="prose prose-sm mt-3 max-w-none text-secondary" data-refresh-body>
            <Markdown>{r.body_md}</Markdown>
          </div>
        </article>
      )}
    </section>
  );
}

function AlertsTab({ kinds }: { kinds: FundingWorkspaceProps["alertKinds"] }) {
  return (
    <section aria-label="Alerts" data-alerts>
      <div className="rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-5">
        <p className="inline-flex items-center gap-2 font-semibold text-primary">
          <Bell className="h-4 w-4 text-action" aria-hidden /> Coming with Money Radar
        </p>
        <p className="mt-1 text-sm text-secondary">
          The weekly refresh will re-run your match and alert you before every deadline you fit — at most one email a day, a digest once a
          week, in-app alerts deduplicated. You will see them here and under{" "}
          <Link href="/workspace/notifications" className="font-semibold text-action">Notifications › Money</Link>.
        </p>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => (
          <li key={k.kind} className="rounded-xl border border-line-subtle bg-surface p-4" data-alert-kind={k.kind}>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <Layers3 className="h-3.5 w-3.5 text-tertiary" aria-hidden /> {k.label}
            </p>
            <p className="mt-1 text-xs text-secondary">{k.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default FundingWorkspace;
