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
import { AlertCircle, CheckCircle2, Download, Loader2, Lock, Mail } from "lucide-react";

import { InputEchoPanel } from "./input-echo-panel";
import { buildInputEcho, type InputEcho } from "@/lib/analyses/input-echo";
import {
  AGENT_META,
  FIRST_ANALYSIS_AGENTS,
  type AgentSection,
  type FirstAnalysisAgent,
  type FullReportView,
  type ValuationSection,
} from "@/lib/analyses/first-analysis/types";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import { cn } from "@/lib/utils";

export interface FullReportPanelProps {
  analysisId: string | null;
  /** Server-resolved session state; undefined = unknown. */
  authenticated?: boolean;
  /** Bump to re-poll immediately (the guest just gave an email). */
  unlockNonce?: number;
  /** The live intake, so the echo renders before the first poll returns. */
  intake?: IntakeResult | null;
  className?: string;
}

/** How long we keep polling a job that never finishes before going quiet. */
export const POLL_GIVE_UP_MS = 20 * 60 * 1000;

function aud(n: number): string {
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `A$${Math.round(n / 1_000)}K`;
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

/** The one-line progress statement. Exported for the test. */
export function progressLine(view: Pick<FullReportView, "status" | "report" | "error"> | null): string {
  if (!view || view.status === null) return "Preparing your first analysis…";
  if (view.status === "queued") return "Queued — the seven C-level voices start in a moment.";
  if (view.status === "failed") {
    return `We could not finish every section${view.error ? ` (${view.error})` : ""}. It is retried automatically; what was written is below.`;
  }
  if (view.status === "done") return "Complete — seven C-level voices, the valuation working and your first 30 days.";
  const p = view.report?.progress;
  if (p?.queuedForSec) return `AI queue is busy — queued, ~${p.queuedForSec} s.`;
  if (p?.current) return AGENT_META[p.current].writing;
  return "Writing the deterministic sections…";
}

export function parseView(body: unknown): FullReportView | null {
  const b = body as (Partial<FullReportView> & { ok?: boolean }) | null;
  if (!b || b.ok !== true) return null;
  return {
    status: b.status ?? null,
    locked: Boolean(b.locked),
    report: b.report ?? null,
    preview: b.preview ?? null,
    emailedAt: b.emailedAt ?? null,
    emailTo: b.emailTo ?? null,
    attempts: typeof b.attempts === "number" ? b.attempts : 0,
    error: b.error ?? null,
    pollAfterSec: typeof b.pollAfterSec === "number" ? b.pollAfterSec : 0,
  };
}

type ResendState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string; ok: boolean };

export function FullReportPanel({ analysisId, authenticated, unlockNonce = 0, intake, className }: FullReportPanelProps) {
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
        const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId!)}/full-report`, { credentials: "same-origin" });
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
  }, [analysisId, unlockNonce]);

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
  const done = status === "done";
  const canResend = done && !locked && (Boolean(view?.emailTo) || authenticated === true);

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
    <div className={cn("flex flex-col gap-4", className)} data-testid="analyze-full-report">
      {echo && <InputEchoPanel echo={echo} />}

      <section
        aria-labelledby="full-report-heading"
        className="rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="full-report-heading" className="text-sm font-semibold text-primary">
              Your first analysis — what BlockID&apos;s agents make of it
            </h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-secondary" role="status" aria-live="polite" data-testid="analyze-full-report-progress">
              {status === "running" || status === "queued" || status === null ? (
                <Loader2 aria-hidden strokeWidth={2} className="h-3.5 w-3.5 animate-spin text-action motion-reduce:animate-none" />
              ) : status === "failed" ? (
                <AlertCircle aria-hidden strokeWidth={2} className="h-3.5 w-3.5 text-warn" />
              ) : (
                <CheckCircle2 aria-hidden strokeWidth={2} className="h-3.5 w-3.5 text-bull" />
              )}
              <span>{failedToLoad && !view ? "Could not reach the report just now — retrying." : progressLine(view)}</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Free · 0 credits — the first analysis of an input never costs anything.
            </p>
          </div>
          {done && !locked && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/analyses/${encodeURIComponent(analysisId)}/report.pdf`}
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
              ? `The ${"PDF"} was emailed${view.emailTo ? ` to ${view.emailTo}` : ""} on ${new Date(view.emailedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}.`
              : view?.emailTo
                ? `The PDF is on its way to ${view.emailTo}.`
                : authenticated
                  ? "The PDF is being emailed to your account address."
                  : "Enter your email below and the PDF follows."}
          </p>
        )}
        {resend.kind === "done" && (
          <p className={cn("mt-2 text-xs", resend.ok ? "text-bull" : "text-warn")} role="status" data-testid="analyze-full-report-resend-status">
            {resend.message}
          </p>
        )}

        {locked && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-line-subtle bg-surface-sunken px-3 py-2.5 text-xs text-secondary" data-testid="analyze-full-report-locked">
            <Lock aria-hidden strokeWidth={2} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" />
            <span>
              The strategy summary below is yours now. The other six voices — finances &amp; valuation, market, product &amp; technology, validation, legal, team — and the full PDF (10+ pages) unlock the moment you give us an email in the card below. No account needed.
            </span>
          </div>
        )}

        {valuation && (
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

        <div className="mt-4 flex flex-col gap-3">
          {FIRST_ANALYSIS_AGENTS.map((role) => (
            <AgentCard
              key={role}
              role={role}
              section={report?.agents[role]}
              ceoPreview={role === "ceo" && locked ? preview?.ceoParagraph ?? null : null}
              locked={locked && role !== "ceo"}
              status={status}
              current={report?.progress.current ?? null}
              failed={Boolean(report?.progress.failed.includes(role))}
            />
          ))}
        </div>

        {report && !locked && report.actionPlan.steps.length > 0 && (
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

function AgentCard({
  role,
  section,
  ceoPreview,
  locked,
  status,
  current,
  failed,
}: {
  role: FirstAnalysisAgent;
  section: AgentSection | undefined;
  ceoPreview: string | null;
  locked: boolean;
  status: FullReportView["status"];
  current: FirstAnalysisAgent | null;
  failed: boolean;
}) {
  const meta = AGENT_META[role];
  const writing = current === role;
  return (
    <article
      className={cn("rounded-xl border p-3 sm:p-4", section || ceoPreview ? "border-line-subtle bg-surface" : "border-dashed border-line-subtle bg-surface-sunken")}
      data-testid={`analyze-agent-${role}`}
      aria-busy={writing}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
          {meta.role}
        </span>
        <h3 className="text-sm font-semibold text-primary">{section ? section.title : meta.label}</h3>
        {section && <span className="ml-auto text-[10px] text-muted">{section.wordCount} words</span>}
      </header>
      {section ? (
        <>
          <div className="mt-2 space-y-2">
            {section.body.split(/\n\s*\n/).filter((p) => p.trim()).map((p, i) => (
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
      ) : failed ? (
        <p className="mt-2 text-xs text-warn">This section could not be written in this run. It is retried automatically.</p>
      ) : writing ? (
        <div className="mt-2 space-y-2" aria-hidden>
          <div className="h-3 w-11/12 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />
          <p className="text-xs text-secondary">{meta.writing}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {status === "done" || status === "failed" ? "Not written in this run." : `${meta.lens} — waiting its turn.`}
        </p>
      )}
    </article>
  );
}

export default FullReportPanel;
