"use client";

// P5-cohort-svi — client tile mounted on /dashboard/svi beneath the
// InvestorReadinessTile. Runs the pure `computeWeeklyCohortRetention` +
// `renderCohortRetentionSvg` helpers from web/src/lib/traction/cohort-chart.ts
// on founder-pasted CSV input via useMemo — no API, no persistence, no
// schema churn (mirrors the P11-acquisition-wizard-ui client-side-only
// pattern).
//
// Closes the Chapter 5 CTA half of the P5-cohort-svi follow-up: the pure
// module (P5-cohort) has shipped since 2026-07-24; the investor-pack section
// (P5-cohort-wire) followed the same day. The dashboard-facing surface has
// been the outstanding leg — this tile completes it.

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeWeeklyCohortRetention,
  MIN_COHORT_BUCKETS,
  renderCohortRetentionSvg,
} from "@/lib/traction/cohort-chart";
import {
  COHORT_HEADLINE,
  makeEmptyCohortRetentionFormState,
  parseActivitiesCsv,
  parseReferenceDate,
  parseSignupsCsv,
  pickCohortBand,
  type CohortRetentionFormState,
  type CohortSignalBand,
} from "./cohort-retention-tile.helpers";

const BAND_STYLES: Record<
  CohortSignalBand,
  { border: string; bg: string; text: string; Icon: typeof CheckCircle2 }
> = {
  green: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/60",
    text: "text-emerald-800",
    Icon: CheckCircle2,
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50/60",
    text: "text-amber-800",
    Icon: AlertTriangle,
  },
  grey: {
    border: "border-surface-200",
    bg: "bg-surface-50",
    text: "text-ink-600",
    Icon: Info,
  },
};

const SAMPLE_SIGNUPS = [
  "u1,2026-01-05",
  "u2,2026-01-05",
  "u3,2026-01-06",
  "u4,2026-01-12",
  "u5,2026-01-12",
  "u6,2026-01-19",
  "u7,2026-01-26",
  "u8,2026-01-26",
].join("\n");

const SAMPLE_ACTIVITIES = [
  "u1,2026-01-05",
  "u2,2026-01-05",
  "u3,2026-01-06",
  "u1,2026-01-12",
  "u2,2026-01-12",
  "u4,2026-01-12",
  "u5,2026-01-12",
  "u1,2026-01-19",
  "u4,2026-01-19",
  "u6,2026-01-19",
  "u1,2026-01-26",
  "u4,2026-01-26",
  "u7,2026-01-26",
  "u8,2026-01-26",
].join("\n");

export function CohortRetentionTile() {
  const [state, setState] = React.useState<CohortRetentionFormState>(() =>
    makeEmptyCohortRetentionFormState(),
  );

  const patch = React.useCallback(
    <K extends keyof CohortRetentionFormState>(
      key: K,
      value: CohortRetentionFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const matrix = React.useMemo(
    () =>
      computeWeeklyCohortRetention(
        parseSignupsCsv(state.signups_csv),
        parseActivitiesCsv(state.activities_csv),
        { reference_date: parseReferenceDate(state.reference_date_iso) },
      ),
    [state.signups_csv, state.activities_csv, state.reference_date_iso],
  );

  const svg = React.useMemo(
    () =>
      renderCohortRetentionSvg(matrix, {
        title: "Weekly cohort retention",
      }),
    [matrix],
  );

  const band = pickCohortBand(matrix);
  const BandStyle = BAND_STYLES[band];

  return (
    <section
      data-testid="cohort-retention-tile"
      data-band={band}
      data-cohort-count={matrix.cohort_count}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-ink-800">
          Weekly cohort retention (Chapter 5 · PMF signal)
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Paste weekly signups + activity events — the chart draws live. Runs
          on your browser only; nothing is saved server-side. Investors read
          this as the truth-check on your growth story.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <div className="text-sm font-semibold text-ink-800">
            Signups CSV
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            <code>user_id, signup_iso</code> — one row per user. Header row
            optional; malformed rows are silently skipped.
          </div>
          <textarea
            data-testid="cohort-signups-input"
            rows={8}
            value={state.signups_csv}
            onChange={(e) => patch("signups_csv", e.target.value)}
            placeholder={"user_id,signup_iso\n" + SAMPLE_SIGNUPS}
            className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <label className="block">
          <div className="text-sm font-semibold text-ink-800">
            Activities CSV
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            <code>user_id, activity_iso</code> — one row per weekly-active
            hit. First-signup wins for the cohort; activity is bucketed by
            Monday UTC.
          </div>
          <textarea
            data-testid="cohort-activities-input"
            rows={8}
            value={state.activities_csv}
            onChange={(e) => patch("activities_csv", e.target.value)}
            placeholder={"user_id,activity_iso\n" + SAMPLE_ACTIVITIES}
            className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <div className="text-sm font-semibold text-ink-800">
            Reference date (optional)
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            Anchors the newest cohort week. Blank = today.
          </div>
          <input
            type="date"
            data-testid="cohort-reference-date"
            value={state.reference_date_iso}
            onChange={(e) => patch("reference_date_iso", e.target.value)}
            className="mt-2 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setState({
              signups_csv: SAMPLE_SIGNUPS,
              activities_csv: SAMPLE_ACTIVITIES,
              reference_date_iso: "2026-01-26",
            });
          }}
          className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-100"
        >
          Load sample data
        </button>
        <button
          type="button"
          onClick={() => setState(makeEmptyCohortRetentionFormState())}
          className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-100"
        >
          Clear
        </button>
      </div>

      <div
        data-testid="cohort-retention-result"
        className={cn(
          "mt-6 rounded-2xl border-2 p-6",
          BandStyle.border,
          BandStyle.bg,
        )}
      >
        <div className="flex items-start gap-3">
          <BandStyle.Icon
            strokeWidth={1.75}
            className={cn("mt-0.5 h-6 w-6 shrink-0", BandStyle.text)}
          />
          <div className="flex-1">
            <h3 className={cn("text-sm font-bold", BandStyle.text)}>
              {COHORT_HEADLINE[band]}
            </h3>
            <p className="mt-1 text-xs text-ink-600">
              {matrix.cohort_count} cohort
              {matrix.cohort_count === 1 ? "" : "s"} · reference week{" "}
              <strong>{matrix.reference_week_iso}</strong> · MIN{" "}
              {MIN_COHORT_BUCKETS} cohorts for an investor-defensible signal
            </p>
          </div>
        </div>

        <div
          data-testid="cohort-retention-svg"
          className="mt-4 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <p className="mt-3 text-xs text-ink-400 leading-relaxed">
        Cohort convention: Monday 00:00 UTC anchoring, first-signup wins per
        user, weeks not yet elapsed render as blank (not 0). Investor-grade
        threshold: {MIN_COHORT_BUCKETS}+ consecutive cohorts with best W1 ≥
        40% (Sean Ellis / Rahul Vohra PMF convention). This tile is a live
        preview — the durable Stripe + product-analytics ingest lives on the
        R&amp;D roadmap (P5-cohort-ingest).
      </p>
    </section>
  );
}
