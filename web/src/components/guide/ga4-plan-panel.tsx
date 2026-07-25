"use client";

// P7-ga4-plan-panel — founder-facing GA4 measurement plan checklist mounted
// on the Chapter 7 (Growth / Analytics) guide surface. Surfaces the 9
// canonical events sourced from the au-ga4-measurement-plan template
// (web/content/templates/legal/au-ga4-measurement-plan.md §3.1–3.5) as a
// tick-through checklist and hands the founder a direct CTA to the template
// at /legal-templates/au-ga4-measurement-plan.
//
// No auth, no persistence, no fetch — a pure local-state React component
// that mirrors the AbsLookupPanel / LandingPagePreviewPanel posture on the
// same page.

import * as React from "react";
import type { Locale } from "@/lib/i18n";
import {
  GA4_CANONICAL_EVENTS,
  GA4_PLAN_DISCLAIMER,
  GA4_STAGE_LABEL,
  GA4_TEMPLATE_ROUTE,
  computeGa4PlanProgress,
  makeEmptyGa4CheckedState,
  type Ga4CheckedState,
  type Ga4EventStage,
} from "./ga4-plan.helpers";

type PanelVariant = "marketing" | "workspace";

interface Ga4PlanPanelProps {
  locale: Locale;
  variant?: PanelVariant;
}

const COPY = {
  en: {
    heading: "Wire your Chapter 7 GA4 measurement plan",
    subheading:
      "Tick the events you've already shipped. The 9 canonical events are pulled from BlockID's AU-flavoured measurement-plan template — GST-hygienic on the revenue side and Privacy Act 1988 (Cth) APP1/APP3/APP5 on the consent side.",
    progressHeading: "Wired events",
    stageHeading: "By funnel stage",
    ctaHeading: "Open the full measurement plan",
    ctaBody:
      "The template includes Consent Mode v2 wiring, GA4 vs Stripe reconciliation with tolerance, cohort + Wilson-CI guardrails, and a quarterly data-quality audit cadence a Chapter 9 investor pack expects.",
    ctaButton: "Use BlockID template",
    checklistHeading: "Canonical event checklist",
    bandLabel: {
      "not-started": "Not started",
      "in-progress": "In progress",
      "investor-ready": "Investor-ready",
    },
  },
  vi: {
    heading: "Nối kế hoạch đo GA4 cho Chương 7",
    subheading:
      "Tick các event bạn đã triển khai. 9 event chuẩn được lấy từ template kế hoạch đo GA4 phong cách AU của BlockID — GST-đúng ở phần doanh thu và Privacy Act 1988 (Cth) APP1/APP3/APP5 ở phần đồng ý.",
    progressHeading: "Event đã nối",
    stageHeading: "Theo giai đoạn funnel",
    ctaHeading: "Mở toàn bộ kế hoạch đo",
    ctaBody:
      "Template gồm cấu hình Consent Mode v2, đối chiếu GA4 vs Stripe với dung sai, guardrail cohort + Wilson-CI, và lịch kiểm chất lượng dữ liệu quý mà pack nhà đầu tư ở Chương 9 mong đợi.",
    ctaButton: "Dùng template BlockID",
    checklistHeading: "Checklist event chuẩn",
    bandLabel: {
      "not-started": "Chưa bắt đầu",
      "in-progress": "Đang triển khai",
      "investor-ready": "Sẵn sàng cho nhà đầu tư",
    },
  },
} as const;

const STAGE_ORDER: readonly Ga4EventStage[] = [
  "acquisition",
  "activation",
  "retention",
  "revenue",
  "referral",
] as const;

function panelClasses(variant: PanelVariant): string {
  if (variant === "workspace") {
    return "rounded-lg border border-surface-200 bg-white p-4";
  }
  return "mt-10 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";
}

function headingClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "text-lg font-semibold text-ink-800"
    : "text-xl font-semibold text-slate-900 dark:text-slate-100";
}

function subheadingClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "mt-1 text-xs text-ink-500"
    : "mt-2 text-sm text-slate-600 dark:text-slate-400";
}

function ctaButtonClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "mt-3 inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
    : "mt-3 inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700";
}

const BAND_CLASS: Record<
  "not-started" | "in-progress" | "investor-ready",
  string
> = {
  "not-started": "bg-slate-100 text-slate-700",
  "in-progress": "bg-amber-100 text-amber-800",
  "investor-ready": "bg-emerald-100 text-emerald-800",
};

const BAND_BAR_CLASS: Record<
  "not-started" | "in-progress" | "investor-ready",
  string
> = {
  "not-started": "bg-slate-400",
  "in-progress": "bg-amber-500",
  "investor-ready": "bg-emerald-500",
};

export function Ga4PlanPanel({
  locale,
  variant = "marketing",
}: Ga4PlanPanelProps) {
  const copy = locale === "vi" ? COPY.vi : COPY.en;
  const [checked, setChecked] = React.useState<Ga4CheckedState>(() =>
    makeEmptyGa4CheckedState(),
  );
  const progress = React.useMemo(
    () => computeGa4PlanProgress(checked),
    [checked],
  );
  const disclaimer =
    locale === "vi" ? GA4_PLAN_DISCLAIMER.vi : GA4_PLAN_DISCLAIMER.en;

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section
      className={panelClasses(variant)}
      data-testid="ga4-plan-panel"
      data-band={progress.band}
      data-pct={progress.pct}
    >
      <h2 className={headingClasses(variant)}>{copy.heading}</h2>
      <p className={subheadingClasses(variant)}>{copy.subheading}</p>

      {/* Progress bar + band chip */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-baseline justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>{copy.progressHeading}</span>
            <span data-testid="ga4-plan-progress-count">
              {progress.wired} / {progress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-2 rounded-full ${BAND_BAR_CLASS[progress.band]}`}
              style={{ width: `${progress.pct}%` }}
              data-testid="ga4-plan-progress-bar"
            />
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${BAND_CLASS[progress.band]}`}
          data-testid="ga4-plan-band-chip"
        >
          {copy.bandLabel[progress.band]} · {progress.pct}%
        </span>
      </div>

      {/* Per-stage summary */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {copy.stageHeading}
        </h3>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STAGE_ORDER.map((stage) => {
            const bucket = progress.by_stage[stage];
            const label =
              locale === "vi"
                ? GA4_STAGE_LABEL[stage].vi
                : GA4_STAGE_LABEL[stage].en;
            const complete = bucket.total > 0 && bucket.wired === bucket.total;
            return (
              <li
                key={stage}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"
                data-testid={`ga4-plan-stage-${stage}`}
                data-complete={complete ? "true" : "false"}
              >
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {label}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  {bucket.wired} / {bucket.total}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Event checklist */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {copy.checklistHeading}
        </h3>
        <ul className="mt-2 space-y-2">
          {GA4_CANONICAL_EVENTS.map((ev) => {
            const isChecked = checked[ev.id] === true;
            const stageLabel =
              locale === "vi"
                ? GA4_STAGE_LABEL[ev.stage].vi
                : GA4_STAGE_LABEL[ev.stage].en;
            const decision =
              locale === "vi" ? ev.decision.vi : ev.decision.en;
            return (
              <li
                key={ev.id}
                className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                data-testid={`ga4-plan-event-${ev.id}`}
                data-checked={isChecked ? "true" : "false"}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(ev.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label={ev.name}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <code className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {ev.name}
                      </code>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {stageLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {decision}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Template CTA */}
      <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          {copy.ctaHeading}
        </h3>
        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
          {copy.ctaBody}
        </p>
        <a
          href={GA4_TEMPLATE_ROUTE}
          className={ctaButtonClasses(variant)}
          data-testid="ga4-plan-template-cta"
        >
          {copy.ctaButton}
        </a>
      </div>

      <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-500">
        {disclaimer}
      </p>
    </section>
  );
}
