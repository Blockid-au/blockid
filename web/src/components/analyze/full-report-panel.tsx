"use client";

// FullReportPanel — the first analysis, streamed in (S32-B).
//
// Polls GET /api/analyses/[id]/full-report and renders what has landed:
// the input echo first (instant), then the valuation reasoning, then one
// C-level section at a time as each agent finishes — skeleton → section —
// with an honest progress line ("The CFO is checking the valuation…",
// "AI queue is busy — queued, ~12 s"). For a guest who has not yet given
// an email the panel shows the echo, the SVI reasoning and one CEO
// paragraph, and says plainly that the other six voices and the PDF unlock
// at the email card below (the existing gate — nothing new is walled).
//
// The poll interval comes from the server (`pollAfterSec`) so the page backs
// off under load instead of hammering; `unlockNonce` forces a fresh poll
// the moment the free-summary card reports a send, so the sections appear
// without a reload.

import * as React from "react";
import dynamic from "next/dynamic";
import { AlertCircle, CheckCircle2, Download, Loader2, Lock, Mail } from "lucide-react";

import { InputEchoPanel } from "./input-echo-panel";
import { buildInputEcho, type InputEcho } from "@/lib/analyses/input-echo";
import {
  AGENT_META,
  BENCHMARK_FOOTER,
  FIRST_ANALYSIS_AGENTS,
  isFullReportReadable,
  normaliseAgentSections,
  type AgentSectionView,
  type FirstAnalysisAgent,
  type FirstAnalysisReportView,
  type FullReportView,
  type ValuationSection,
} from "@/lib/analyses/first-analysis/types";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { ReportV2Progress } from "@/lib/analyses/first-analysis/types";
import { cn } from "@/lib/utils";

// G28-C — the v3 Trusted Business Report (the same <TbrReportV2> the paid
// /workspace/reports/business and /tbr/<token> pages render). Loaded on
// demand: the S32 rows never need it, and it is the heaviest client chunk.
const TbrReportV2 = dynamic(() => import("@/components/tbr/v2/report").then((m) => m.TbrReportV2), {
  ssr: false,
  loading: () => (
    <div className="mt-4 animate-pulse space-y-3 motion-reduce:animate-none" aria-hidden>
      <div className="h-6 w-2/3 rounded bg-surface-hover" />
      <div className="h-40 rounded-xl bg-surface-hover" />
      <div className="h-6 w-1/2 rounded bg-surface-hover" />
    </div>
  ),
});

export interface FullReportPanelProps {
  analysisId: string | null;
  /** Server-resolved session state; undefined = unknown. */
  authenticated?: boolean;
  /** Bump to re-poll immediately (the guest just gave an email). */
  unlockNonce?: number;
  /** The live intake, so the echo renders before the first poll returns. */
  intake?: IntakeResult | null;
  /** G28-C: the signed link token from the report e-mail (`/analyze/<id>?t=…`) — forwarded to the poll + PDF routes. */
  token?: string | null;
  className?: string;
}

/** Phase wording for the v2 progress line. Exported for the test. */
export const V2_PHASE_LABELS: Record<string, string> = {
  starting: "Starting the report pipeline…",
  gather: "Gathering evidence — the register, benchmarks and computed facts…",
  analyze: "The C-level agents are writing the 13 criteria…",
  synthesis: "The CEO is writing the investment view…",
  audit: "The auditor is checking every claim against the evidence…",
  done: "Complete — your Trusted Business Report.",
  failed: "The pipeline could not finish this run.",
};

/** The one-line progress statement for a v2 (Trusted Business Report) run. Exported for the test. */
export function progressLineV2(view: Pick<FullReportView, "status" | "progressV2" | "error" | "heldForCap" | "reportV2"> | null): string {
  if (!view || view.status === null) return "Preparing your Trusted Business Report…";
  if (view.status === "queued" && view.heldForCap) {
    return "Queued — today's free reports are all taken, so yours is in the queue. We e-mail it the moment it is written; you can close this page.";
  }
  if (view.status === "queued") return "Queued — the report pipeline starts in a moment.";
  if (view.status === "failed") {
    return `The report could not be written in this run${view.error ? ` (${view.error})` : ""}. It is retried automatically and e-mailed when it lands.`;
  }
  if (view.status === "done" && view.reportV2) {
    // Chapters the owner agent could not write fell back to the deterministic card (`degraded`).
    const degraded = view.reportV2.dimensions.filter((d) => d.degraded).length;
    return degraded > 0
      ? `Complete — ${8 - Math.min(8, degraded)} of 8 chapters written by the agents; ${degraded} fell back to the deterministic card.`
      : "Complete — the full Trusted Business Report: investment view, valuation, 8 chapters, risk matrix and 90-day plan.";
  }
  const p: ReportV2Progress | null = view.progressV2;
  if (!p) return V2_PHASE_LABELS.starting;
  const label = V2_PHASE_LABELS[p.phase] ?? `Writing — ${p.phase}…`;
  const chapters = p.chaptersDone > 0 ? ` ${p.chaptersDone} of 8 chapters in.` : "";
  return `${label}${chapters} ${p.pct} %`;
}

/** How long we keep polling a job that never finishes before going quiet. */
export const POLL_GIVE_UP_MS = 20 * 60 * 1000;

function aud(n: number): string {
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `A$${Math.round(n / 1_000)}K`;
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

/** Voices not yet written and not given up on, from the normalised payload. */
export function stillBeingWritten(report: FirstAnalysisReportView | null): FirstAnalysisAgent[] {
  if (!report) return [];
  return FIRST_ANALYSIS_AGENTS.filter((role) => {
    const st = report.agents[role]?.status;
    return st !== "done" && st !== "unavailable";
  });
}

/** The one-line progress statement. Exported for the test. */
export function progressLine(view: Pick<FullReportView, "status" | "report" | "error" | "heldForCap"> | null): string {
  if (!view || view.status === null) return "Preparing your first analysis…";
  if (view.status === "queued" && view.heldForCap) {
    return "Queued — today's free reports are all taken, so yours is in the queue. We e-mail it the moment it is written; you can close this page.";
  }
  if (view.status === "queued") return "Queued — the seven C-level voices start in a moment.";
  if (view.status === "failed") {
    return `We could not finish every section${view.error ? ` (${view.error})` : ""}. It is retried automatically; what was written is below.`;
  }
  if (view.status === "done_partial") {
    const p = view.report?.progress;
    if (p?.current) return AGENT_META[p.current].writing;
    const pending = stillBeingWritten(view.report ?? null);
    const n = pending.length;
    return `${n} section${n === 1 ? " is" : "s are"} still being written — we will email the full report when ${n === 1 ? "it finishes" : "they finish"}. What is ready is below.`;
  }
  if (view.status === "done") {
    const unavailable = view.report ? FIRST_ANALYSIS_AGENTS.filter((r) => view.report!.agents[r]?.status === "unavailable") : [];
    return unavailable.length
      ? `Complete — ${7 - unavailable.length} of seven C-level voices, the valuation working and your first 30 days. ${unavailable.length} section${unavailable.length === 1 ? "" : "s"} could not be written after three attempts.`
      : "Complete — seven C-level voices, the valuation working and your first 30 days.";
  }
  const p = view.report?.progress;
  if (p?.queuedForSec) return `AI queue is busy — queued, ~${p.queuedForSec} s.`;
  if (p?.current) return AGENT_META[p.current].writing;
  return "Writing the deterministic sections…";
}

/**
 * Whatever shape `report.agents` arrives in — objects, bare strings, or
 * missing — the panel works on one: `{role, title, body, nextSteps,
 * provider, model, status, …}` per voice.
 */
export function normaliseReport(raw: unknown): FirstAnalysisReportView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as FirstAnalysisReportView & { progress?: FirstAnalysisReportView["progress"] };
  const progress = r.progress ?? { current: null, completed: [], failed: [] };
  return { ...r, progress, agents: normaliseAgentSections({ agents: r.agents as never, progress, sections: r.sections }) };
}

export function parseView(body: unknown): FullReportView | null {
  const b = body as (Partial<FullReportView> & { ok?: boolean }) | null;
  if (!b || b.ok !== true) return null;
  return {
    status: b.status ?? null,
    locked: Boolean(b.locked),
    // A body with no `kind` (an older server mid-deploy) is S32 iff it carries a v1 report / preview.
    kind: b.kind === "s32" || (b.kind === undefined && (b.report || b.preview)) ? "s32" : "v2",
    reportV2: b.reportV2 && typeof b.reportV2 === "object" ? b.reportV2 : null,
    progressV2: b.progressV2 && typeof b.progressV2 === "object" ? b.progressV2 : null,
    report: normaliseReport(b.report),
    preview: b.preview ?? null,
    emailedAt: b.emailedAt ?? null,
    emailTo: b.emailTo ?? null,
    attempts: typeof b.attempts === "number" ? b.attempts : 0,
    error: b.error ?? null,
    pollAfterSec: typeof b.pollAfterSec === "number" ? b.pollAfterSec : 0,
    heldForCap: Boolean(b.heldForCap),
  };
}

type ResendState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string; ok: boolean };

/** The poll / PDF path, with the signed token when the visitor came from the e-mail link. Exported for the test. */
export function reportApiPath(analysisId: string, leaf: "full-report" | "report.pdf", token?: string | null): string {
  const base = `/api/analyses/${encodeURIComponent(analysisId)}/${leaf}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function FullReportPanel({ analysisId, authenticated, unlockNonce = 0, intake, token = null, className }: FullReportPanelProps) {
  const [view, setView] = React.useState<FullReportView | null>(null);
  const [failedToLoad, setFailedToLoad] = React.useState(false);
  const [resend, setResend] = React.useState<ResendState>({ kind: "idle" });

  // Poll until the server says stop (pollAfterSec 0) or we give up.
  React.useEffect(() => {
    if (!analysisId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    async function tick() {
      try {
        const res = await fetch(reportApiPath(analysisId!, "full-report", token), { credentials: "same-origin" });
        const body = res.ok ? await res.json().catch(() => null) : null;
        if (!live) return;
        const next = parseView(body);
        if (!next) {
          setFailedToLoad(true);
          return;
        }
        setFailedToLoad(false);
        setView(next);
        if (next.pollAfterSec > 0 && Date.now() - startedAt < POLL_GIVE_UP_MS) {
          timer = setTimeout(tick, Math.max(2, next.pollAfterSec) * 1000);
        }
      } catch {
        if (!live) return;
        setFailedToLoad(true);
        if (Date.now() - startedAt < POLL_GIVE_UP_MS) timer = setTimeout(tick, 6000);
      }
    }
    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [analysisId, unlockNonce, token]);

  const clientEcho = React.useMemo<InputEcho | null>(() => {
    if (!intake) return null;
    try {
      return buildInputEcho(intake);
    } catch {
      return null;
    }
  }, [intake]);

  if (!analysisId) return null;

  const report = view?.report ?? null;
  const preview = view?.preview ?? null;
  const echo = report?.echo ?? preview?.echo ?? clientEcho;
  const valuation: ValuationSection | null = report?.valuation ?? preview?.valuation ?? null;
  const locked = Boolean(view?.locked);
  const status = view?.status ?? null;
  // G28-C: a v2 row renders the v3 document; an S32 row the seven voices.
  const v2 = (view?.kind ?? "v2") === "v2";
  const reportV2 = view?.reportV2 ?? null;
  // A partial report is readable and downloadable; its missing voices say so.
  // A v2 row is readable only once its document exists (no partial state).
  const done = v2 ? status === "done" && Boolean(reportV2) : isFullReportReadable(status);
  const partial = !v2 && status === "done_partial";
  // A visitor on the e-mail's signed link already has the e-mail; the resend
  // route is cookie-scoped, so the button is not offered there.
  const canResend = done && !locked && !token && (Boolean(view?.emailTo) || authenticated === true);

  async function handleResend() {
    if (resend.kind === "sending") return;
    setResend({ kind: "sending" });
    try {
      const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId!)}/full-report/resend`, { method: "POST", credentials: "same-origin" });
      const body = (await res.json().catch(() => null)) as { outcome?: string; retryAfterSec?: number } | null;
      const outcome = body?.outcome ?? "send_failed";
      const messages: Record<string, string> = {
        sent: `Sent again${view?.emailTo ? ` to ${view.emailTo}` : ""}.`,
        rate_limited: "Three resends a day is the limit — try again tomorrow, or download the PDF here.",
        no_email: "We do not have an address for this run yet — enter one below.",
        not_ready: "The report is still being written; the email goes out when it lands.",
        unsubscribed: "That address has unsubscribed from BlockID email, so we cannot send to it.",
        send_failed: "The send did not go through. Download the PDF here, or try again shortly.",
      };
      setResend({ kind: "done", ok: outcome === "sent", message: messages[outcome] ?? messages.send_failed });
    } catch {
      setResend({ kind: "done", ok: false, message: "The send did not go through. Download the PDF here, or try again shortly." });
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-testid="analyze-full-report" data-kind={v2 ? "v2" : "s32"}>
      {echo && <InputEchoPanel echo={echo} />}

      <section
        aria-labelledby="full-report-heading"
        className="rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="full-report-heading" className="text-sm font-semibold text-primary">
              {v2 ? "Your Trusted Business Report — the same document an investor receives" : "Your first analysis — what BlockID's agents make of it"}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-secondary" role="status" aria-live="polite" data-testid="analyze-full-report-progress">
              {status === "running" || status === "queued" || status === null || partial ? (
                <Loader2 aria-hidden strokeWidth={2} className="h-3.5 w-3.5 animate-spin text-action motion-reduce:animate-none" />
              ) : status === "failed" ? (
                <AlertCircle aria-hidden strokeWidth={2} className="h-3.5 w-3.5 text-warn" />
              ) : (
                <CheckCircle2 aria-hidden strokeWidth={2} className="h-3.5 w-3.5 text-bull" />
              )}
              <span>{failedToLoad && !view ? "Could not reach the report just now — retrying." : v2 ? progressLineV2(view) : progressLine(view)}</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Free · 0 credits — your first two business reports never cost anything.
            </p>
          </div>
          {done && !locked && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={reportApiPath(analysisId, "report.pdf", token)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:opacity-90"
                data-testid="analyze-full-report-download"
              >
                <Download aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                Download PDF
              </a>
              {canResend && (
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={resend.kind === "sending"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-action disabled:opacity-60"
                  data-testid="analyze-full-report-resend"
                >
                  <Mail aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                  {resend.kind === "sending" ? "Sending…" : "Resend report"}
                </button>
              )}
            </div>
          )}
        </div>

        {done && !locked && (
          <p className="mt-2 text-xs text-muted" data-testid="analyze-full-report-emailed">
            {view?.emailedAt
              ? `The PDF${partial ? " (part 1)" : ""} was emailed${view.emailTo ? ` to ${view.emailTo}` : ""} on ${new Date(view.emailedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}.${partial ? " The complete report follows when the remaining sections finish." : ""}`
              : view?.emailTo
                ? `The PDF${partial ? " (part 1)" : ""} is on its way to ${view.emailTo}.`
                : authenticated
                  ? `The PDF${partial ? " (part 1)" : ""} is being emailed to your account address.`
                  : "Enter your email below and the PDF follows."}
          </p>
        )}
        {resend.kind === "done" && (
          <p className={cn("mt-2 text-xs", resend.ok ? "text-bull" : "text-warn")} role="status" data-testid="analyze-full-report-resend-status">
            {resend.message}
          </p>
        )}

        {/* G28-C — the v3 document, rendered by the same component the paid
            report and /tbr/<token> use. Full standard document (spec § 6):
            no unlock rail, no trim, one evidence-confidence number. */}
        {v2 && reportV2 && !locked && (
          <div className="mt-4" data-testid="analyze-report-v2">
            <TbrReportV2 report={reportV2} upgradeHref="/pricing" />
          </div>
        )}
        {v2 && !reportV2 && !locked && status !== "failed" && (
          <div className="mt-4 rounded-xl border border-dashed border-line-subtle bg-surface-sunken p-4" data-testid="analyze-report-v2-pending" aria-busy="true">
            <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">What is being written</p>
            <ol className="mt-2 space-y-1 text-sm text-secondary">
              <li>1. Dashboard and investment view — SVI, evidence confidence, verdict band, valuation range</li>
              <li>2. Valuation — the methods, the consensus and what moves it</li>
              <li>3. Eight dimension chapters — verdict, evidence, strengths, gaps, what to improve</li>
              <li>4. Risk matrix, 90-day improvement plan, money on the table, appendix</li>
            </ol>
            <p className="mt-3 text-xs text-muted">Usually 3–8 minutes. The report is e-mailed the moment it lands — you can close this page.</p>
          </div>
        )}

        {locked && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-line-subtle bg-surface-sunken px-3 py-2.5 text-xs text-secondary" data-testid="analyze-full-report-locked">
            <Lock aria-hidden strokeWidth={2} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" />
            <span>
              The strategy summary below is yours now. The other six voices — finances &amp; valuation, market, product &amp; technology, validation, legal, team — and the full PDF (10+ pages) unlock the moment you give us an email in the card below. No account needed.
            </span>
          </div>
        )}

        {!v2 && valuation && (
          <div className="mt-4 rounded-xl border border-line-subtle bg-surface p-3" data-testid="analyze-full-report-valuation">
            <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">Indicative valuation — how it was built</p>
            <p className="mt-1 text-sm text-primary">
              {aud(valuation.lowAud)} – {aud(valuation.highAud)} <span className="text-muted">(mid {aud(valuation.midAud)})</span>
            </p>
            <p className="mt-1 text-xs text-secondary">{valuation.note}</p>
            <ul className="mt-2 space-y-1">
              {valuation.assumptions.map((a, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-muted">
                  · {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!v2 && (
          <div className="mt-4 flex flex-col gap-3">
            {FIRST_ANALYSIS_AGENTS.map((role) => (
              <AgentCard
                key={role}
                role={role}
                section={report?.agents[role] ?? null}
                ceoPreview={role === "ceo" && locked ? preview?.ceoParagraph ?? null : null}
                locked={locked && role !== "ceo"}
                status={status}
                current={report?.progress.current ?? null}
              />
            ))}
          </div>
        )}

        {!v2 && report && !locked && report.actionPlan.steps.length > 0 && (
          <div className="mt-5" data-testid="analyze-full-report-plan">
            <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">Your first 30 days</p>
            <ol className="mt-2 space-y-2">
              {report.actionPlan.steps.map((st) => (
                <li key={`${st.day}-${st.title}`} className="flex gap-3 text-sm">
                  <span className="w-14 shrink-0 font-mono text-xs text-action">Day {st.day}</span>
                  <span className="min-w-0">
                    <span className="font-medium text-primary">{st.title}</span>
                    <span className="block text-xs text-secondary">{st.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}

export function AgentCard({
  role,
  section,
  ceoPreview,
  locked,
  status,
  current,
}: {
  role: FirstAnalysisAgent;
  section: AgentSectionView | null;
  ceoPreview: string | null;
  locked: boolean;
  status: FullReportView["status"];
  current: FirstAnalysisAgent | null;
}) {
  const meta = AGENT_META[role];
  const written = section?.status === "done" && typeof section.body === "string";
  const writing = current === role || section?.status === "writing";
  const unavailable = section?.status === "unavailable";
  const failed = section?.status === "failed";
  return (
    <article
      className={cn("rounded-xl border p-3 sm:p-4", written || ceoPreview ? "border-line-subtle bg-surface" : "border-dashed border-line-subtle bg-surface-sunken")}
      data-testid={`analyze-agent-${role}`}
      data-status={section?.status ?? "pending"}
      aria-busy={writing && !written}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
          {meta.role}
        </span>
        <h3 className="text-sm font-semibold text-primary">{written && section.title ? section.title : meta.label}</h3>
        {written && <span className="ml-auto text-[10px] text-muted">{section.wordCount} words</span>}
      </header>
      {written ? (
        <>
          <div className="mt-2 space-y-2">
            {(section.body ?? "").split(/\n\s*\n/).filter((p) => p.trim()).map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-secondary">{p.trim()}</p>
            ))}
          </div>
          <ol className="mt-3 space-y-1.5" aria-label={`${meta.role} next steps`}>
            {section.nextSteps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-primary">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-action text-[11px] font-semibold text-on-action">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {section.benchmarkFigures.length > 0 && (
            <p className="mt-2 text-[11px] text-muted" data-testid={`analyze-agent-${role}-benchmarks`}>{BENCHMARK_FOOTER}</p>
          )}
        </>
      ) : ceoPreview ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{ceoPreview}</p>
          <p className="mt-2 text-[11px] text-muted">The rest of the CEO section is in the full report.</p>
        </>
      ) : locked ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Lock aria-hidden strokeWidth={2} className="h-3 w-3" /> {meta.lens} — unlocks with your email below.
        </p>
      ) : unavailable ? (
        <p className="mt-2 text-xs text-warn">
          This section could not be written after three attempts — the models available did not produce a section that met our grounding rules, so nothing is shown rather than something invented.
        </p>
      ) : writing ? (
        <div className="mt-2 space-y-2" aria-hidden>
          <div className="h-3 w-11/12 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <p className="text-xs text-secondary">{meta.writing}</p>
        </div>
      ) : status === "done_partial" ? (
        <p className="mt-2 text-xs text-secondary">Still being written — we will email the full report when it finishes.</p>
      ) : failed ? (
        <p className="mt-2 text-xs text-warn">This section could not be written in this run. It is retried automatically.</p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {status === "done" || status === "failed" ? "Not written in this run." : `${meta.lens} — waiting its turn.`}
        </p>
      )}
    </article>
  );
}

export default FullReportPanel;
