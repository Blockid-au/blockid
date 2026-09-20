/**
 * /methodology/calibration — SVI backtest v0 (G14-S39).
 *
 * Reads `content/reports/svi-backtest-latest.json` (written by
 * `npm run backtest`, weekly cron + on every `svi-analysis.ts` change) at
 * request time and renders: N, Spearman ρ + 95 % bootstrap CI per target and
 * per stage, the SVI-quartile → round bucket table with a range-bar SVG from
 * `report-visuals/`, the caveats VERBATIM, and `SVI_VERSION` + git sha of
 * the engine that produced the numbers. No file → an honest "not yet
 * published" empty state; never a placeholder number.
 *
 * Shared by the EN route (`./page.tsx`) and the VI mirror
 * (`app/vi/methodology/calibration/page.tsx`); every visible string resolves
 * through `t()` against the `calibration.*` catalogue keys (parity test in
 * `lib/i18n/messages-parity.test.ts`).
 *
 * Copy rules (G13 F5 / G14 deck): state the live N, never "500+", never
 * "PhD". Claim scope is rank calibration only — the caveats say why.
 */

import Link from "next/link";
import { CtaBand, PageHero, Section } from "@/components/marketing/template";
import { readSviBacktestLatest } from "@/lib/backtest/latest";
import { BOOTSTRAP_RESAMPLES, MIN_STAGE_N, type BacktestReport, type CiCell, type RhoCell } from "@/lib/backtest/run-backtest";
import { BACKTEST_STAGES } from "@/lib/data/au-comparables-backtest";
import type { Locale } from "@/lib/i18n/locales";
import { getMessages, t, type Messages } from "@/lib/i18n/t";
import { notEnoughLine } from "@/lib/benchmarks/publication-rules";
import { renderRangeBars } from "@/lib/report-visuals/range-bars";
import { aud } from "@/lib/report-visuals/svg";

export const METHODOLOGY_PATH = "/methodology";
export const CALIBRATION_PATH = "/methodology/calibration";
export const CALIBRATION_VI_PATH = "/vi/methodology/calibration";

const STAGE_LABEL: Record<string, { en: string; vi: string }> = {
  "pre-seed": { en: "Pre-seed", vi: "Pre-seed" },
  seed: { en: "Seed", vi: "Seed" },
  "series-a": { en: "Series A", vi: "Series A" },
  "series-b": { en: "Series B+", vi: "Series B+" },
  "series-c": { en: "Series C", vi: "Series C" },
  growth: { en: "Growth", vi: "Growth" },
  unicorn: { en: "Unicorn / secondary", vi: "Unicorn / thứ cấp" },
};

function stageLabel(stage: string, locale: Locale): string {
  return STAGE_LABEL[stage]?.[locale] ?? stage;
}

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function fmtRho(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

function fmtCi(ci: CiCell | null | undefined): string {
  return ci ? `[${ci.low.toFixed(2)}, ${ci.high.toFixed(2)}]` : "—";
}

function fmtAud(v: number | null, locale: Locale, notDisclosed: string): string {
  if (v === null) return notDisclosed;
  return `A$${v.toLocaleString(locale === "vi" ? "vi-VN" : "en-AU")}`;
}

function fmtDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The range-bar SVG for the bucket table — p25–p75 per SVI quartile, median marked. Pure string. */
export function bucketRangeBarsSvg(report: BacktestReport, m: Messages): string {
  return renderRangeBars(
    {
      // G21 P1-C: only buckets above the publication floor draw a bar.
      rows: report.buckets.filter((b) => b.median_round_aud !== null).map((b) => ({
        label: b.label,
        low: b.p25_round_aud ?? 0,
        mid: b.median_round_aud ?? 0,
        high: b.p75_round_aud ?? 0,
      })),
      currency: "AUD",
    },
    {
      id: "svi-backtest-buckets",
      title: t(m, "calibration.buckets.chartTitle"),
      description: t(m, "calibration.buckets.chartDescription"),
      dataState: "real",
      width: 560,
      hideBadge: true,
    },
  );
}

function rhoRows(report: BacktestReport, target: "round" | "valuation") {
  const byStage = target === "round" ? report.rho.round_by_stage : report.rho.valuation_by_stage;
  const ciByStage = target === "round" ? report.ci.round_by_stage : report.ci.valuation_by_stage;
  const pooled: { stage: "pooled"; cell: RhoCell; ci: CiCell | null } = {
    stage: "pooled",
    cell: { n: target === "round" ? report.n_with_round : report.n_with_valuation, rho: target === "round" ? report.rho.round_pooled : report.rho.valuation_pooled },
    ci: target === "round" ? report.ci.round_pooled : report.ci.valuation_pooled,
  };
  const stages = BACKTEST_STAGES.filter((s) => s in byStage).map((s) => ({ stage: s as string, cell: byStage[s], ci: ciByStage[s] ?? null }));
  return [pooled, ...stages];
}

export interface CalibrationBodyProps {
  locale: Locale;
  /** Injected by the page test; the route reads the published JSON. */
  report?: BacktestReport | null;
  /** Injected by the page test. */
  messages?: Messages;
}

export async function CalibrationBody({ locale, report: injected, messages }: CalibrationBodyProps) {
  const m = messages ?? (await getMessages(locale));
  const report = injected === undefined ? await readSviBacktestLatest() : injected;
  // /methodology and /analyze have no /vi twin (S36 owns /methodology) — link the EN routes from both.
  const back = METHODOLOGY_PATH;
  const analyze = "/analyze";
  const notDisclosed = t(m, "calibration.notDisclosed");

  return (
    <>
      <PageHero eyebrow={t(m, "calibration.eyebrow")} title={t(m, "calibration.title")} sub={t(m, "calibration.subtitle")}
        align="start"
      />

      <div className="mx-auto w-full max-w-6xl px-6">
        <Link href={back} className="inline-flex min-h-11 items-center text-sm text-action underline decoration-dotted underline-offset-4" data-testid="calibration-back">
          {`← ${t(m, "calibration.backLink")}`}
        </Link>
      </div>

      {!report ? (
        <Section id="empty" title={t(m, "calibration.empty.title")} tone="sunken">
          <p className="max-w-2xl text-sm leading-relaxed text-secondary" data-testid="calibration-empty">
            {t(m, "calibration.empty.body")}
          </p>
        </Section>
      ) : (
        <>
          {/* Headline numbers */}
          <Section id="stats" ariaLabel={t(m, "calibration.stats.n")} spacing="sm" divider={false}>
            <dl className="grid gap-4 sm:grid-cols-4" data-testid="calibration-stats">
              <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
                <dt className="text-xs uppercase tracking-[0.18em] text-tertiary">{t(m, "calibration.stats.n")}</dt>
                <dd className="mt-2 font-display text-3xl font-semibold text-primary" data-testid="calibration-n">{report.n}</dd>
                <dd className="mt-1 text-xs text-tertiary">
                  {`${report.n_with_round} ${t(m, "calibration.stats.nRound")} · ${report.n_with_valuation} ${t(m, "calibration.stats.nValuation")}`}
                </dd>
              </div>
              <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
                <dt className="text-xs uppercase tracking-[0.18em] text-tertiary">{t(m, "calibration.rho.target.round")}</dt>
                <dd className="mt-2 font-display text-3xl font-semibold text-primary" data-testid="calibration-rho-round">{`ρ ${fmtRho(report.rho.round_pooled)}`}</dd>
                <dd className="mt-1 text-xs text-tertiary">{`${t(m, "calibration.rho.col.ci")} ${fmtCi(report.ci.round_pooled)}`}</dd>
              </div>
              <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
                <dt className="text-xs uppercase tracking-[0.18em] text-tertiary">{t(m, "calibration.rho.target.valuation")}</dt>
                <dd className="mt-2 font-display text-3xl font-semibold text-primary" data-testid="calibration-rho-valuation">{`ρ ${fmtRho(report.rho.valuation_pooled)}`}</dd>
                <dd className="mt-1 text-xs text-tertiary">{`${t(m, "calibration.rho.col.ci")} ${fmtCi(report.ci.valuation_pooled)}`}</dd>
              </div>
              <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
                <dt className="text-xs uppercase tracking-[0.18em] text-tertiary">{t(m, "calibration.stats.engine")}</dt>
                <dd className="mt-2 font-mono text-sm text-primary" data-testid="calibration-engine">
                  {`SVI ${report.svi_version} · ${report.git_sha}`}
                </dd>
                <dd className="mt-1 text-xs text-tertiary">
                  {`${t(m, "calibration.stats.generated")} ${fmtDate(report.generated_at, locale)}`}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-tertiary">{fill(t(m, "calibration.stats.excluded"), { n: report.n_excluded_source_rows })}</p>
          </Section>

          {/* Caveats first — the claim scope is the point of the page */}
          <Section id="caveats" eyebrow={t(m, "calibration.caveats.kicker")} title={t(m, "calibration.caveats.title")} tone="sunken">
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-secondary" data-testid="calibration-caveats">
              {report.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </Section>

          {/* ρ tables */}
          <Section id="rho" eyebrow={t(m, "calibration.rho.kicker")} title={t(m, "calibration.rho.title")}>
            <p className="max-w-3xl text-sm leading-relaxed text-secondary">
              {fill(t(m, "calibration.rho.intro"), { resamples: BOOTSTRAP_RESAMPLES.toLocaleString(locale === "vi" ? "vi-VN" : "en-AU"), minN: MIN_STAGE_N })}
            </p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {(["round", "valuation"] as const).map((target) => (
                <div key={target} className="overflow-x-auto rounded-2xl border border-line-subtle bg-surface">
                  <table className="w-full text-sm" data-testid={`calibration-rho-table-${target}`}>
                    <caption className="px-4 py-3 text-left font-semibold text-primary">{t(m, `calibration.rho.target.${target}`)}</caption>
                    <thead>
                      <tr className="border-t border-line-subtle text-left text-xs uppercase tracking-wide text-tertiary">
                        <th scope="col" className="px-4 py-2">{t(m, "calibration.rho.col.stage")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.rho.col.n")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.rho.col.rho")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.rho.col.ci")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rhoRows(report, target).map((r) => (
                        <tr key={r.stage} className={`border-t border-line-subtle ${r.stage === "pooled" ? "font-semibold" : ""}`}>
                          <td className="px-4 py-2">{r.stage === "pooled" ? t(m, "calibration.rho.pooled") : stageLabel(r.stage, locale)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.cell.n}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.cell.rho === null
                              ? <span className="text-tertiary">{r.cell.reason === "degenerate" ? t(m, "calibration.rho.degenerate") : t(m, "calibration.rho.tooFew")}</span>
                              : fmtRho(r.cell.rho)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtCi(r.ci)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </Section>

          {/* Bucket table + range bars */}
          <Section id="buckets" eyebrow={t(m, "calibration.buckets.kicker")} title={t(m, "calibration.buckets.title")}>
            <p className="max-w-3xl text-sm leading-relaxed text-secondary">{t(m, "calibration.buckets.intro")}</p>
            {report.buckets.length > 0 ? (
              <>
                {report.buckets.some((b) => b.median_round_aud !== null) ? (
                  <figure className="mt-6 rounded-2xl border border-line-subtle bg-surface p-4" data-testid="calibration-range-bars">
                    <div className="w-full [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: bucketRangeBarsSvg(report, m) }} />
                    <figcaption className="mt-1 text-[11px] text-tertiary">{t(m, "calibration.buckets.chartDescription")}</figcaption>
                  </figure>
                ) : (
                  <p className="mt-6 rounded-2xl border border-dashed border-line-subtle bg-surface p-4 text-sm text-secondary" data-testid="calibration-range-bars" data-publication-band="none">
                    {notEnoughLine(Math.max(0, ...report.buckets.map((b) => b.n)), "any SVI quartile")}
                  </p>
                )}
                <div className="mt-6 overflow-x-auto rounded-2xl border border-line-subtle bg-surface">
                  <table className="w-full text-sm" data-testid="calibration-bucket-table">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-tertiary">
                        <th scope="col" className="px-4 py-2">{t(m, "calibration.buckets.col.quartile")}</th>
                        <th scope="col" className="px-4 py-2">{t(m, "calibration.buckets.col.sviRange")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.buckets.col.n")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.buckets.col.p25")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.buckets.col.median")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.buckets.col.p75")}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.buckets.col.medianValuation")}</th>
                        <th scope="col" className="px-4 py-2">Publication</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.buckets.map((b) => (
                        <tr key={b.quartile} className="border-t border-line-subtle">
                          <td className="px-4 py-2 font-medium text-primary">{b.label}</td>
                          <td className="px-4 py-2 tabular-nums">{`${b.svi_min}–${b.svi_max}`}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{b.n}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{aud(b.p25_round_aud)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">{aud(b.median_round_aud)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{aud(b.p75_round_aud)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{b.median_valuation_aud === null ? `— (n = ${b.n_valuation})` : `${aud(b.median_valuation_aud)} (n = ${b.n_valuation})`}</td>
                          <td className="px-4 py-2 text-xs text-tertiary" data-publication-band={b.publication?.band ?? "none"}>{b.publication?.label ?? `n = ${b.n}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </Section>

          {/* Coverage by stage */}
          <Section id="stages" eyebrow={t(m, "calibration.stages.kicker")} title={t(m, "calibration.stages.title")}>
            <ul className="flex flex-wrap gap-3" data-testid="calibration-stages">
              {BACKTEST_STAGES.filter((s) => s in report.n_by_stage).map((s) => (
                <li key={s} className="rounded-full border border-line-subtle bg-surface px-4 py-2 text-sm">
                  <span className="font-medium text-primary">{stageLabel(s, locale)}</span>{" "}
                  <span className="tabular-nums text-tertiary" data-publication-band={report.publication_by_stage?.[s]?.band ?? "none"}>
                    {report.publication_by_stage?.[s]?.label ?? `n = ${report.n_by_stage[s]}`}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Rows used */}
          <Section id="rows" eyebrow={t(m, "calibration.rows.kicker")} title={t(m, "calibration.rows.title")}>
            <p className="max-w-3xl text-sm leading-relaxed text-secondary">{t(m, "calibration.rows.intro")}</p>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-line-subtle bg-surface">
              <table className="w-full text-sm" data-testid="calibration-rows">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-tertiary">
                    <th scope="col" className="px-4 py-2">{t(m, "calibration.rows.col.company")}</th>
                    <th scope="col" className="px-4 py-2">{t(m, "calibration.rows.col.stage")}</th>
                    <th scope="col" className="px-4 py-2">{t(m, "calibration.rows.col.asOf")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.rows.col.svi")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.rows.col.round")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t(m, "calibration.rows.col.valuation")}</th>
                    <th scope="col" className="px-4 py-2">{t(m, "calibration.rows.col.confidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.rows_used].sort((a, b) => b.svi - a.svi || a.company.localeCompare(b.company)).map((r) => (
                    <tr key={`${r.company}-${r.asOf}`} className="border-t border-line-subtle">
                      <td className="px-4 py-2 font-medium text-primary">{r.company}</td>
                      <td className="px-4 py-2">{stageLabel(r.stage, locale)}</td>
                      <td className="px-4 py-2 tabular-nums">{r.asOf}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.svi}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtAud(r.roundAud, locale, notDisclosed)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtAud(r.valuationAud, locale, notDisclosed)}</td>
                      <td className="px-4 py-2">{r.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-mono text-xs text-tertiary" data-testid="calibration-provenance">
              {fill(t(m, "calibration.provenance"), { version: report.svi_version, sha: report.git_sha })}
            </p>
          </Section>
        </>
      )}

      <CtaBand
        title={t(m, "calibration.cta.title")}
        primary={{ href: analyze, label: t(m, "calibration.cta.primary") }}
        secondary={{ href: back, label: t(m, "calibration.cta.secondary") }}
      />
    </>
  );
}
