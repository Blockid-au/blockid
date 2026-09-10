"use client";

/**
 * RadarUpsellCard — the A$3 report → Founder Radar (Starter A$29) upsell
 * (G11 §4h / §4i D-3, T0247). Approved copy:
 *
 *   "This report is a snapshot. **{next_program}** closes in {d} days and
 *    **{k} programs** on your list open new rounds this quarter. Founder
 *    Radar watches them for you: alerts, monthly re-match, weekly next step
 *    — A$29/mo, first 7 days free."
 *
 * The placeholders come from `computeRadarUpsellFacts(report.timeline)`;
 * when the timeline has no dated deadline the sentence drops the clause it
 * cannot fill and, with nothing at all, falls back to generic copy — never
 * a blank or an invented deadline.
 *
 * Mounted on /funding/report/[id] (replacing the T0242 plain card) and, after
 * the third A$3 purchase, under the /funding paywall with a `lead` line
 * ("You've spent A$9 on 3 reports."). Evaluators get a secondary Scout CTA.
 * Fires GA4 `radar_upsell_view` once and `radar_upsell_click` per CTA.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import {
  EMPTY_RADAR_FACTS,
  FOUNDER_RADAR_MONTHLY_AUD,
  FOUNDER_RADAR_TRIAL_DAYS,
  SCOUT_MONTHLY_AUD,
  SCOUT_SIGNUP_HREF,
  founderRadarSignupHref,
  type RadarUpsellFacts,
  type RadarViewer,
} from "@/lib/funding/radar-upsell";

export type RadarUpsellSurface = "funding_report" | "funding_paywall";

export interface RadarUpsellCardProps {
  surface: RadarUpsellSurface;
  viewer: RadarViewer;
  /** From `computeRadarUpsellFacts`; omit / null → generic copy. */
  facts?: RadarUpsellFacts | null;
  reportId?: string;
  /** Optional opening line, e.g. "You've spent A$9 on 3 reports." */
  lead?: string;
  /** Sent with `radar_upsell_view` on the paywall surface. */
  paidReports?: number;
  className?: string;
}

const RADAR_TAIL = `Founder Radar watches them for you: alerts, monthly re-match, weekly next step — A$${FOUNDER_RADAR_MONTHLY_AUD}/mo, first ${FOUNDER_RADAR_TRIAL_DAYS} days free.`;

function closesIn(days: number): string {
  if (days <= 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days} days`;
}

/**
 * The sentence, as React nodes (bold placeholders). Exported so the page
 * test can pin the exact copy without rendering the whole card.
 */
export function radarUpsellSentence(facts: RadarUpsellFacts | null | undefined): {
  variant: "timeline" | "generic";
  nodes: React.ReactNode;
} {
  const f = facts ?? EMPTY_RADAR_FACTS;
  const next = f.next_program;
  const k = f.quarter_count;

  if (!next && k === 0) {
    return {
      variant: "generic",
      nodes: (
        <>
          This report is a snapshot. Deadlines move and new rounds open through the year.{" "}
          {RADAR_TAIL}
        </>
      ),
    };
  }

  const programs = (
    <>
      <strong className="text-primary">
        {k} {k === 1 ? "program" : "programs"}
      </strong>{" "}
      on your list {k === 1 ? "opens" : "open"} new rounds this quarter.
    </>
  );

  if (next && k > 0) {
    return {
      variant: "timeline",
      nodes: (
        <>
          This report is a snapshot. <strong className="text-primary">{next.name}</strong> {closesIn(next.days)} and{" "}
          {programs} {RADAR_TAIL}
        </>
      ),
    };
  }
  if (next) {
    return {
      variant: "timeline",
      nodes: (
        <>
          This report is a snapshot. <strong className="text-primary">{next.name}</strong> {closesIn(next.days)}.{" "}
          {RADAR_TAIL}
        </>
      ),
    };
  }
  return {
    variant: "timeline",
    nodes: (
      <>
        This report is a snapshot. {programs} {RADAR_TAIL}
      </>
    ),
  };
}

export function RadarUpsellCard({
  surface,
  viewer,
  facts,
  reportId,
  lead,
  paidReports,
  className = "",
}: RadarUpsellCardProps) {
  const { variant, nodes } = radarUpsellSentence(facts);
  const viewed = React.useRef(false);

  React.useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackEvent("radar_upsell_view", {
      surface,
      viewer,
      variant,
      ...(reportId ? { report_id: reportId } : {}),
      ...(typeof paidReports === "number" ? { paid_reports: paidReports } : {}),
    });
  }, [surface, viewer, variant, reportId, paidReports]);

  const click = (target: "founder_starter" | "investor_angel") => () => {
    trackEvent("radar_upsell_click", {
      surface,
      viewer,
      target,
      ...(reportId ? { report_id: reportId } : {}),
    });
  };

  return (
    <section
      className={`rounded-2xl border border-action/40 bg-surface-raised p-6 ${className}`.trim()}
      aria-labelledby="radar-upsell-heading"
      data-radar-upsell
      data-surface={surface}
      data-variant={variant}
      data-viewer={viewer}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action/10 text-action">
          <Radar className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="radar-upsell-heading" className="text-lg font-semibold text-primary">
            Deadlines move — Founder Radar A${FOUNDER_RADAR_MONTHLY_AUD}/mo
          </h2>
          {lead ? <p className="mt-2 text-sm font-medium text-primary">{lead}</p> : null}
          <p className="mt-2 text-sm leading-relaxed text-secondary" data-radar-upsell-copy>
            {nodes}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={founderRadarSignupHref(surface)}
              onClick={click("founder_starter")}
              className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover"
              data-radar-cta="founder_starter"
            >
              Start Founder Radar — {FOUNDER_RADAR_TRIAL_DAYS} days free <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <span className="text-xs text-tertiary">
              Starter plan · A${FOUNDER_RADAR_MONTHLY_AUD}/mo after the trial · cancel any time · includes this report every month
            </span>
          </div>
          {viewer === "evaluator" ? (
            <p className="mt-3 text-sm text-secondary">
              Or unlock alerts for the startups you evaluate —{" "}
              <Link
                href={SCOUT_SIGNUP_HREF}
                onClick={click("investor_angel")}
                className="font-semibold text-action underline-offset-2 hover:underline"
                data-radar-cta="investor_angel"
              >
                Scout A${SCOUT_MONTHLY_AUD}
              </Link>
              .
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default RadarUpsellCard;
