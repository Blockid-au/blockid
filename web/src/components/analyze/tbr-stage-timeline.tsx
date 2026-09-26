"use client";

// TbrStageTimeline — the live status card at the top of /analyze and
// /analyze/[id] while a Trusted Business Report is written (26/09/2026).
//
// Founder complaint (26/09): after a deck upload the page looked hung. This
// card shows every pipeline stage — done ✓ / running (spinner) / waiting /
// stopped or skipped with the reason — with the elapsed time, the usual
// time ("usually ~45s", medians of recent real runs) and the one-line
// result that came back (slides read, sources checked, n of 8 chapters,
// the valuation range, grounded share). Above the stages: an overall
// progress bar, the time left, and a heartbeat ("Server working · last
// update 4s ago") so the founder can tell a long AI step from a stall.
//
// Everything shown comes from the poll payload (`FullReportView.timeline`,
// built by lib/analyses/first-analysis/stage-timeline.ts from the
// orchestrator's real events). The only thing this component does on its
// own clock is count seconds between polls — it never advances a stage.
//
// Accessibility: a polite live region announces the stage + percent (not
// the ticking counters); spinners stop under prefers-reduced-motion; the
// stage list is an ordered list with aria-current on the running stage.

import * as React from "react";
import { AlertCircle, Check, Loader2, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/use-locale";
import type { TbrStageView, TbrTimelineView } from "@/lib/analyses/first-analysis/stage-timeline";
import { STAGE_COPY, TIMELINE_TEXT, fmtDuration, stageChips, type TimelineLocale } from "./tbr-stage-copy";

export interface TbrStageTimelineProps {
  timeline: TbrTimelineView | null;
  /** Client ms when this payload arrived — the counters tick from here. */
  receivedAt: number;
  /** Company name for the header, when known. */
  company?: string | null;
  /** The poll failed just now (the card keeps the last payload and says so). */
  connectionTrouble?: boolean;
  /** The run has a permalink (`/analyze/<id>`) the founder can come back to. */
  hasLink?: boolean;
  /** Masked destination of the report-delivery e-mail, when one is known. */
  emailTo?: string | null;
  /** Signed in: the report-delivery e-mail goes to the account address. */
  emailsAccount?: boolean;
  /** Force a locale (tests); defaults to the visitor's cookie. */
  locale?: TimelineLocale;
  className?: string;
}

/** Liveness band from the seconds since the worker last wrote. Exported for the suite. */
export function livenessBand(agoSec: number | null): "alive" | "slow" | "stale" | "unknown" {
  if (agoSec === null) return "unknown";
  if (agoSec <= 30) return "alive";
  if (agoSec <= 180) return "slow";
  return "stale";
}

function secondsAgo(timeline: TbrTimelineView, tickSec: number): number | null {
  if (!timeline.lastUpdateAt) return null;
  const last = Date.parse(timeline.lastUpdateAt);
  const server = Date.parse(timeline.serverNow);
  if (!Number.isFinite(last) || !Number.isFinite(server)) return null;
  return Math.max(0, Math.round((server - last) / 1000 + tickSec));
}

const ACTIVE_STATES = new Set(["queued", "held", "running", "retrying"]);

export function TbrStageTimeline({
  timeline,
  receivedAt,
  company,
  connectionTrouble = false,
  hasLink = false,
  emailTo = null,
  emailsAccount = false,
  locale: forcedLocale,
  className,
}: TbrStageTimelineProps) {
  const [cookieLocale] = useLocale();
  const locale: TimelineLocale = forcedLocale ?? cookieLocale;
  const t = TIMELINE_TEXT[locale];
  const active = timeline ? ACTIVE_STATES.has(timeline.state) : true;

  // A one-second tick between polls — counters only, never stage status.
  const [now, setNow] = React.useState(() => receivedAt);
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  const tickSec = active ? Math.max(0, Math.round((now - receivedAt) / 1000)) : 0;

  if (!timeline) {
    return (
      <section
        className={cn("rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5", className)}
        data-testid="tbr-stage-timeline"
        data-state="connecting"
        aria-busy="true"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-primary" role="status" aria-live="polite">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-action motion-reduce:animate-none" />
          {t.heading}…
        </p>
      </section>
    );
  }

  const done = timeline.state === "done";
  const stopped = timeline.state === "failed";
  const running = timeline.stages.find((s) => s.status === "running") ?? null;
  const elapsed = timeline.elapsedSec + tickSec;
  const remaining = timeline.remainingSec === null ? null : Math.max(0, timeline.remainingSec - tickSec);
  const ago = secondsAgo(timeline, tickSec);
  const band = livenessBand(ago);
  const title =
    timeline.state === "running" && company ? t.titleRunningCompany(company) : t.title[timeline.state];
  const liveLabel = done ? t.srDone : running ? t.srRunning(STAGE_COPY[locale][running.key].label, timeline.percent) : t.title[timeline.state];
  const stageList = (
    <ol className="space-y-3 px-4 py-4 sm:px-5" data-testid="tbr-timeline-stages">
      {timeline.stages.map((stage, i) => (
        <StageRow key={stage.key} stage={stage} index={i + 1} locale={locale} tickSec={tickSec} />
      ))}
    </ol>
  );

  return (
    <section
      aria-labelledby="tbr-stage-timeline-title"
      className={cn("overflow-hidden rounded-2xl border border-line-subtle bg-surface-raised", className)}
      data-testid="tbr-stage-timeline"
      data-state={timeline.state}
    >
      <div className="border-b border-line-subtle px-4 py-4 sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary">{t.heading}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <h2 id="tbr-stage-timeline-title" className="flex min-w-0 items-center gap-2 text-base font-semibold text-primary">
            {done ? (
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-bull" />
            ) : stopped ? (
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-warn" />
            ) : (
              <span aria-hidden className="relative inline-flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-action opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-action" />
              </span>
            )}
            <span className="min-w-0 break-words">{title}</span>
          </h2>
          <div className="text-right">
            <p className="font-mono text-sm tabular-nums text-primary" data-testid="tbr-timeline-elapsed">
              {t.elapsed(fmtDuration(elapsed))}
            </p>
            {remaining !== null && !done && (
              <p className="font-mono text-xs tabular-nums text-action" data-testid="tbr-timeline-remaining">
                {remaining > 0 ? t.remaining(fmtDuration(remaining)) : t.finishing}
              </p>
            )}
          </div>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-hover"
          role="progressbar"
          aria-label={t.heading}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={timeline.percent}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", stopped ? "bg-warn" : done ? "bg-bull" : "bg-action")}
            style={{ width: `${Math.max(2, timeline.percent)}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <p className="text-muted">
            {timeline.percent}% · {t.typical(fmtDuration(timeline.typicalTotalSec), timeline.samples)}
          </p>
          {active && (
            <p
              className={cn("flex items-center gap-1.5", band === "stale" ? "text-warn" : "text-secondary")}
              data-testid="tbr-timeline-heartbeat"
              data-band={band}
            >
              <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", band === "alive" ? "bg-bull" : band === "stale" ? "bg-warn" : "bg-action")} />
              {ago === null ? t.status.running : band === "alive" ? t.alive(fmtDuration(ago)) : band === "slow" ? t.slow(fmtDuration(ago)) : t.stale(fmtDuration(ago))}
              {typeof timeline.calls === "number" && timeline.calls > 0 && <span className="text-muted">· {t.calls(timeline.calls)}</span>}
            </p>
          )}
        </div>
        {timeline.overrun && !done && <p className="mt-1 text-xs text-secondary">{t.overrun}</p>}
        {connectionTrouble && (
          <p className="mt-1 text-xs text-warn" role="status" data-testid="tbr-timeline-offline">
            {t.offline}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite" data-testid="tbr-timeline-live">
          {liveLabel}
        </p>
      </div>

      {done ? (
        // Finished: the stage list folds away (the report is below); one click shows how it was built.
        <details>
          <summary className="cursor-pointer select-none px-4 py-2 text-xs font-semibold text-action sm:px-5">{t.detailsToggle}</summary>
          {stageList}
        </details>
      ) : (
        stageList
      )}

      {active && (
        <p className="border-t border-line-subtle px-4 py-3 text-xs text-secondary sm:px-5" data-testid="tbr-timeline-leave">
          {t.leave(hasLink)}
          {emailTo ? t.emailed(emailTo) : emailsAccount ? t.emailedAccount : ""}
        </p>
      )}
    </section>
  );
}

function StageRow({ stage, index, locale, tickSec }: { stage: TbrStageView; index: number; locale: TimelineLocale; tickSec: number }) {
  const t = TIMELINE_TEXT[locale];
  const copy = STAGE_COPY[locale][stage.key];
  const isRunning = stage.status === "running";
  const doneish = stage.status === "done";
  const chips = stageChips(stage, locale);
  const elapsed = stage.elapsedSec === null ? null : isRunning ? stage.elapsedSec + tickSec : stage.elapsedSec;
  const timing = [
    elapsed !== null && (isRunning || elapsed >= 1) ? fmtDuration(elapsed) : null,
    (stage.status === "waiting" || isRunning) && stage.etaSec > 0 ? t.usually(fmtDuration(stage.etaSec)) : null,
  ].filter(Boolean).join(" · ");
  return (
    <li
      className="flex items-start gap-3"
      aria-current={isRunning ? "step" : undefined}
      data-testid={`tbr-stage-${stage.key}`}
      data-status={stage.status}
    >
      <span className="mt-0.5 shrink-0">
        {doneish ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bull/10 text-bull">
            <Check aria-hidden strokeWidth={3} className="h-3 w-3" />
          </span>
        ) : stage.status === "failed" ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warn/10 text-warn">
            <AlertCircle aria-hidden strokeWidth={2.5} className="h-3.5 w-3.5" />
          </span>
        ) : stage.status === "skipped" ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line-subtle text-tertiary">
            <Minus aria-hidden strokeWidth={2.5} className="h-3 w-3" />
          </span>
        ) : isRunning ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-action text-action">
            <Loader2 aria-hidden className="h-3 w-3 animate-spin motion-reduce:animate-none" />
          </span>
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line-subtle font-mono text-[10px] text-muted">{index}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className={cn("text-sm font-semibold", isRunning ? "text-primary" : doneish ? "text-secondary" : stage.status === "failed" ? "text-warn" : "text-muted")}>
            {copy.label}
            <span className="sr-only"> — {t.status[stage.status]}</span>
          </p>
          {timing && <span className={cn("whitespace-nowrap font-mono text-[11px] tabular-nums", isRunning ? "text-action" : "text-muted")}>{timing}</span>}
        </div>
        {isRunning && <p className="mt-0.5 text-xs leading-relaxed text-muted">{copy.hint}</p>}
        {chips.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <li
                key={`${i}-${c}`}
                className={cn(
                  "max-w-full break-words rounded-md border px-2 py-0.5 text-xs",
                  doneish ? "border-bull/30 bg-bull/5 text-secondary" : stage.status === "failed" ? "border-warn/40 bg-warn/10 text-primary" : "border-line-subtle bg-surface text-secondary",
                )}
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default TbrStageTimeline;
