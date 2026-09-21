/**
 * /methodology/calibration — "Score → outcome calibration" section (G21
 * P3-A). Reads `content/reports/calibration-latest.json` (written by
 * `npm run calibration`, weekly cron Sun 04:10 UTC) and renders, per
 * published cohort (stage × quarter of T0): n, the observed outcome rate,
 * its Wilson 95 % interval when n ≥ 30, and the rate per SVI band and per
 * Evidence Confidence band at T0 — every figure with its n and its
 * publication label from lib/benchmarks/publication-rules. The limitations
 * block is printed verbatim. No file, or no cohort above the floor → the
 * honest empty state ("Fewer than 10 companies with a confirmed outcome —
 * nothing published yet") with the counts so far.
 *
 * Copy rule: association / observed rate / interval — never a forecast for
 * one company (lib/marketing/messaging.test.ts guards "predicts").
 */

import Link from "next/link";
import { Section } from "@/components/marketing/template";
import type { BandCell, CalibrationReport, CohortResult } from "@/lib/calibration/compute";
import type { Locale } from "@/lib/i18n/locales";
import { t, type Messages } from "@/lib/i18n/t";

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function interval(c: { low: number; high: number } | null): string {
  return c ? `${Math.round(c.low * 100)}–${Math.round(c.high * 100)}%` : "—";
}

function fmtDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function BandList({ cells, m, prefix }: { cells: BandCell[]; m: Messages; prefix: "svi" | "confidence" }) {
  return (
    <ul className="space-y-1">
      {cells.map((b) => (
        <li key={b.band} className="flex items-baseline justify-between gap-2 text-xs" data-publication-band={b.publication} data-calibration-band={`${prefix}-${b.band}`}>
          <span className="text-secondary">{t(m, `calibration.outcomes.band.${b.band}`)}</span>
          <span className={`tabular-nums ${b.publication === "none" ? "text-tertiary" : "font-semibold text-primary"}`}>
            {b.label}
            {b.ci95 ? <span className="ml-1 font-normal text-tertiary">[{interval(b.ci95)}]</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface OutcomeCalibrationProps {
  locale: Locale;
  report: CalibrationReport | null;
  messages: Messages;
}

export function OutcomeCalibration({ locale, report, messages: m }: OutcomeCalibrationProps) {
  const horizon = report?.horizon_days ?? 90;
  const published: CohortResult[] = report ? report.cohorts.filter((c) => c.published) : [];
  const empty = published.length === 0;

  return (
    <Section id="outcomes" eyebrow={t(m, "calibration.outcomes.kicker")} title={t(m, "calibration.outcomes.title")} tone="sunken">
      <p className="max-w-3xl text-sm leading-relaxed text-secondary">{fill(t(m, "calibration.outcomes.intro"), { horizon })}</p>

      {empty ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-subtle bg-surface p-5" data-testid="outcome-calibration-empty">
          <p className="font-semibold text-primary">{t(m, "calibration.outcomes.empty.title")}</p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-secondary">{fill(t(m, "calibration.outcomes.empty.body"), { horizon })}</p>
          {report ? (
            <p className="mt-3 text-xs tabular-nums text-tertiary" data-testid="outcome-calibration-progress">
              {fill(t(m, "calibration.outcomes.empty.progress"), { companies: report.totals.companies_with_snapshot, eligible: report.totals.companies_eligible, outcomes: report.totals.confirmed_outcomes, horizon })}
            </p>
          ) : null}
          <p className="mt-3 text-sm">
            <Link href="/workspace/evidence/outcomes" className="inline-flex min-h-11 items-center text-action underline decoration-dotted underline-offset-4">
              {t(m, "calibration.outcomes.record")} →
            </Link>
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-6 grid gap-4 sm:grid-cols-4" data-testid="outcome-calibration-stats">
            {(
              [
                ["eligible", report!.totals.companies_eligible],
                ["outcomes", report!.totals.confirmed_outcomes],
                ["published", report!.totals.cohorts_published],
                ["suppressed", report!.totals.cohorts_suppressed],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
                <dt className="text-xs uppercase tracking-[0.18em] text-tertiary">{t(m, `calibration.outcomes.totals.${k}`)}</dt>
                <dd className="mt-2 font-display text-3xl font-semibold tabular-nums text-primary" data-testid={`outcome-calibration-${k}`}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-line-subtle bg-surface">
            <table className="w-full text-sm" data-testid="outcome-calibration-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-tertiary">
                  <th scope="col" className="px-4 py-2">{t(m, "calibration.outcomes.col.cohort")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.outcomes.col.companies")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.outcomes.col.rate")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.outcomes.col.interval")}</th>
                  <th scope="col" className="px-4 py-2">{t(m, "calibration.outcomes.col.bySvi")}</th>
                  <th scope="col" className="px-4 py-2">{t(m, "calibration.outcomes.col.byConfidence")}</th>
                </tr>
              </thead>
              <tbody>
                {published.map((c) => (
                  <tr key={c.key} className="border-t border-line-subtle align-top" data-calibration-cohort={c.key}>
                    <td className="px-4 py-3 font-medium text-primary">
                      {fill(t(m, "calibration.outcomes.stage"), { stage: c.stage })} · {c.period}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.companies}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {pct(c.outcome_rate)}
                      {c.companies < 30 ? <span className="ml-1 text-xs font-normal text-tertiary">indicative</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{interval(c.ci95)}</td>
                    <td className="px-4 py-3">
                      <BandList cells={c.by_svi_band} m={m} prefix="svi" />
                    </td>
                    <td className="px-4 py-3">
                      <BandList cells={c.by_confidence_band} m={m} prefix="confidence" />
                      {c.companies_with_confidence < c.companies ? <p className="mt-1 text-[11px] text-tertiary">n = {c.companies_with_confidence}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {report ? (
        <>
          <h3 className="mt-8 text-base font-semibold text-primary">{t(m, "calibration.outcomes.limitations.title")}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-secondary" data-testid="outcome-calibration-limitations">
            {report.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
          <p className="mt-4 font-mono text-xs text-tertiary" data-testid="outcome-calibration-provenance">
            {fill(t(m, "calibration.outcomes.provenance"), { method: report.method_version, version: report.svi_version, sha: report.git_sha, horizon, date: fmtDate(report.generated_at, locale) })}
          </p>
        </>
      ) : null}
    </Section>
  );
}
