"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComplianceEvent } from "@/lib/compliance/calendar";
import {
  EVENT_KIND_HELP_ROUTE,
  EVENT_KIND_LABEL,
  daysUntil,
  formatDueDate,
  groupByMonth,
  pickCalendarBand,
  pickNextEvent,
  type CalendarBand,
} from "./calendar-view.helpers";

interface Props {
  events: ComplianceEvent[];
  subscribeWebcal: string;
  subscribeHttps: string;
  disclaimer: string;
}

const BAND_STYLES: Record<
  CalendarBand,
  { border: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  green: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/60",
    text: "text-emerald-800",
    Icon: CheckCircle2,
    label: "On track",
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50/60",
    text: "text-amber-800",
    Icon: AlertTriangle,
    label: "Due soon",
  },
  red: {
    border: "border-red-200",
    bg: "bg-red-50/40",
    text: "text-red-800",
    Icon: XCircle,
    label: "Overdue",
  },
};

function daysLabel(d: number): string {
  if (!Number.isFinite(d)) return "";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  if (d === -1) return "1 day overdue";
  return `${Math.abs(d)} days overdue`;
}

export function CalendarViewClient(props: Props) {
  const { events, subscribeWebcal, subscribeHttps, disclaimer } = props;

  // "now" is frozen at first render to keep bands + days-until stable
  // across re-renders. A page refresh recomputes.
  const now = React.useMemo(() => new Date(), []);
  const grouped = React.useMemo(() => groupByMonth(events), [events]);
  const nextEvent = React.useMemo(() => pickNextEvent(events, now), [events, now]);

  const [copied, setCopied] = React.useState<"https" | "webcal" | null>(null);

  const copyToClipboard = React.useCallback(
    async (which: "https" | "webcal", url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(which);
        window.setTimeout(() => setCopied((prev) => (prev === which ? null : prev)), 2000);
      } catch {
        // Older browsers / non-secure contexts: prompt the user with the URL.
        window.prompt("Copy this subscribe URL", url);
      }
    },
    [],
  );

  return (
    <section data-testid="compliance-calendar-view" className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          AU compliance
        </p>
        <h1 className="text-2xl font-semibold text-foreground">
          Compliance calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          BAS, ASIC annual review, R&amp;D Tax Incentive, WGEA and Modern
          Slavery deadlines in one feed. Download the <code>.ics</code> or
          subscribe from Google Calendar / iCal / Outlook — reminders fire
          14 days before each date.
        </p>
      </header>

      <div
        data-testid="calendar-subscribe-controls"
        className="rounded-2xl border border-surface-200 bg-white p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/compliance/calendar?download=1"
            data-testid="calendar-download-link"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download .ics
          </a>
          <a
            href={subscribeWebcal}
            data-testid="calendar-webcal-link"
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-100"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            One-click subscribe (webcal://)
          </a>
        </div>
        <div className="text-xs text-muted-foreground">
          Or paste this URL into any calendar app that accepts an https feed:
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code
            data-testid="calendar-https-url"
            className="flex-1 min-w-0 truncate rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-800"
          >
            {subscribeHttps}
          </code>
          <button
            type="button"
            data-testid="calendar-copy-https"
            onClick={() => copyToClipboard("https", subscribeHttps)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-100"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copied === "https" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {nextEvent ? (
        <NextUpTile event={nextEvent} now={now} />
      ) : (
        <EmptyState />
      )}

      {grouped.length > 0 ? (
        <div data-testid="calendar-event-list" className="space-y-6">
          {grouped.map((group) => (
            <section key={group.monthKey} aria-labelledby={`month-${group.monthKey}`}>
              <h2
                id={`month-${group.monthKey}`}
                className="text-sm font-semibold text-ink-700 mb-2"
              >
                {group.monthLabel}
              </h2>
              <ul className="space-y-2">
                {group.events.map((ev) => (
                  <EventRow key={ev.uid} event={ev} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{disclaimer}</p>
    </section>
  );
}

function NextUpTile(props: { event: ComplianceEvent; now: Date }) {
  const band = pickCalendarBand(props.event, props.now);
  const style = BAND_STYLES[band];
  const d = daysUntil(props.event.date_start, props.now);
  const helpRoute = EVENT_KIND_HELP_ROUTE[props.event.kind];
  return (
    <div
      data-testid="calendar-next-up"
      data-band={band}
      className={cn(
        "rounded-2xl border p-4 flex items-start gap-3",
        style.border,
        style.bg,
      )}
    >
      <style.Icon className={cn("h-5 w-5 mt-0.5", style.text)} aria-hidden />
      <div className="flex-1 space-y-1">
        <div className={cn("text-xs font-semibold uppercase tracking-wide", style.text)}>
          Next up · {style.label} · {daysLabel(d)}
        </div>
        <div className="text-sm font-semibold text-ink-900">
          {props.event.summary}
        </div>
        <div className="text-xs text-ink-600">
          {formatDueDate(props.event.date_start)} ·{" "}
          {EVENT_KIND_LABEL[props.event.kind]}
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={helpRoute}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            Open BlockID guide
          </Link>
          <a
            href={props.event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            Authoritative source
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="calendar-empty-state"
      className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground"
    >
      No compliance events in the next 12 months. Register for GST, enter
      your ACN incorporation date, or log an R&amp;D activity year to
      populate this calendar.
    </div>
  );
}

function EventRow(props: { event: ComplianceEvent; now: Date }) {
  const band = pickCalendarBand(props.event, props.now);
  const style = BAND_STYLES[band];
  const d = daysUntil(props.event.date_start, props.now);
  const helpRoute = EVENT_KIND_HELP_ROUTE[props.event.kind];
  return (
    <li
      data-testid="calendar-event-row"
      data-kind={props.event.kind}
      data-band={band}
      className={cn(
        "rounded-xl border p-3 flex items-start gap-3",
        style.border,
        style.bg,
      )}
    >
      <style.Icon className={cn("h-4 w-4 mt-0.5", style.text)} aria-hidden />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <div className="text-sm font-semibold text-ink-900">
            {props.event.summary}
          </div>
          <div className={cn("text-xs font-medium", style.text)}>
            {daysLabel(d)}
          </div>
        </div>
        <div className="text-xs text-ink-600">
          {formatDueDate(props.event.date_start)} ·{" "}
          {EVENT_KIND_LABEL[props.event.kind]}
        </div>
      </div>
      <Link
        href={helpRoute}
        className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap self-center"
      >
        Guide →
      </Link>
    </li>
  );
}
