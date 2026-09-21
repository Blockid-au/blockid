// Section 13 — Risk matrix (G27, spec § 4.4, wireframe W5): the memo's
// "risks & mitigants" closes the argument. A 3×3 grid of counts
// (likelihood rows × impact columns) and the table sorted high-high first:
// risk · likelihood · impact · mitigation, each row chipped to its
// dimension. ≤ 8 rows on the paid view, the top 5 on free; at trim level
// ≥ 3 the free PDF keeps the grid only (the web always shows both).
// Section 14 — 90-day improvement plan (spec § 4.5): rank · action · lift ·
// window · dimension · evidence to add, ranked by lift ÷ effort; lifts are
// printed exactly as the catalogue gives them, never cumulative. Hook-free.

import { RISK_LEVELS_ASC, RISK_LEVELS_DESC, riskGrid, RISK_ROWS_FREE, PLAN_STEPS_FREE } from "@/lib/report-v2/investment-view";
import type { InvestmentView, ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { Chip, DimChip, TBR_V2_SECTION_IDS, TbrSection, zebraRow, type TbrUiLocale } from "./shared";
import { FIGURE_CLASS, LevelChip, STICKY_COL_CLASS, TABLE_MIN_CLASS, TABLE_SCROLL_CLASS, TD_CLASS, TH_CLASS, v3Strings } from "./shared-v3";

export function TbrRiskMatrix({ report, view, title, locale = "en" }: { report: ReportV2; view: InvestmentView; title: string; locale?: TbrUiLocale }) {
  const t = v3Strings(locale);
  const free = report.tier === "free";
  const rows = free ? view.riskMatrix.slice(0, RISK_ROWS_FREE) : view.riskMatrix;
  const grid = riskGrid(view.riskMatrix);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.riskMatrix} kicker="13" title={title} purpose={t.purpose.riskMatrix} pageBreak>
      {view.riskMatrix.length === 0 ? (
        <p className="text-sm text-secondary">{t.noRisks}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div data-tbr-risk-grid className="rounded-xl border border-line-subtle p-3 print:break-inside-avoid">
            <table className="w-full text-xs">
              <caption className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{t.riskGridCaption}</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {t.likelihood} ↓ / {t.impact} →
                  </th>
                  {RISK_LEVELS_ASC.map((impact) => (
                    <th key={impact} scope="col" className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {t.level[impact]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RISK_LEVELS_DESC.map((likelihood) => (
                  <tr key={likelihood} className="border-t border-line-subtle">
                    <th scope="row" className="px-2 py-1.5 text-left text-xs font-medium text-secondary">
                      {t.level[likelihood]}
                    </th>
                    {RISK_LEVELS_ASC.map((impact) => {
                      const n = grid[likelihood][impact];
                      const hot = likelihood === "high" && impact === "high";
                      return (
                        <td key={impact} data-tbr-risk-cell={`${likelihood}-${impact}`} className={cn("px-2 py-1.5 text-center text-sm text-primary", FIGURE_CLASS, n > 0 && "font-semibold", n > 0 && hot && "bg-surface-sunken")}>
                          {n}
                          {n > 0 && hot ? <span aria-hidden="true"> ■</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={TABLE_SCROLL_CLASS} data-tbr-risk-table>
            <table className={TABLE_MIN_CLASS}>
              <thead>
                <tr className="bg-surface">
                  <th scope="col" className={cn(TH_CLASS, STICKY_COL_CLASS, "min-w-[220px]")}>
                    {t.thRisk}
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    {t.likelihood}
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    {t.impact}
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    {t.thMitigation}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} data-tbr-risk-row={r.kind} className={zebraRow(i)}>
                    <td className={cn(TD_CLASS, STICKY_COL_CLASS, i % 2 === 1 && "bg-surface-sunken")}>
                      <span aria-hidden="true" className="mr-1 text-bear">
                        ▲
                      </span>
                      {r.text}
                      {r.dim && (
                        <span className="ml-1.5 inline-block align-middle">
                          <DimChip dim={r.dim} locale={locale} />
                        </span>
                      )}
                    </td>
                    <td className={TD_CLASS}>
                      <LevelChip level={r.likelihood} locale={locale} />
                    </td>
                    <td className={TD_CLASS}>
                      <LevelChip level={r.impact} locale={locale} />
                    </td>
                    <td className={cn(TD_CLASS, "text-secondary")}>{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </TbrSection>
  );
}

export function TbrImprovementPlan({ report, view, title, locale = "en" }: { report: ReportV2; view: InvestmentView; title: string; locale?: TbrUiLocale }) {
  const t = v3Strings(locale);
  const free = report.tier === "free";
  const steps = free ? view.improvementPlan.slice(0, PLAN_STEPS_FREE) : view.improvementPlan;
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.plan90d} kicker="14" title={title} purpose={t.purpose.improvementPlan} pageBreak>
      {steps.length === 0 ? (
        <p className="text-sm text-secondary">{t.planEmpty}</p>
      ) : (
        <div className={TABLE_SCROLL_CLASS} data-tbr-plan-table>
          <table className={TABLE_MIN_CLASS}>
            <thead>
              <tr className="bg-surface">
                <th scope="col" className={cn(TH_CLASS, STICKY_COL_CLASS, "w-10")}>
                  #
                </th>
                <th scope="col" className={cn(TH_CLASS, "min-w-[240px]")}>
                  {t.thAction}
                </th>
                <th scope="col" className={cn(TH_CLASS, "text-right")}>
                  {t.thLift}
                </th>
                <th scope="col" className={TH_CLASS}>
                  {t.thWindow}
                </th>
                <th scope="col" className={TH_CLASS}>
                  {t.thDim}
                </th>
                <th scope="col" className={TH_CLASS}>
                  {t.thEvidence}
                </th>
              </tr>
            </thead>
            <tbody>
              {steps.map((p, i) => (
                <tr key={p.rank} data-tbr-plan-step={p.rank} className={zebraRow(i)}>
                  <td className={cn(TD_CLASS, STICKY_COL_CLASS, FIGURE_CLASS, "font-semibold", i % 2 === 1 && "bg-surface-sunken")}>{p.rank}</td>
                  <td className={TD_CLASS}>
                    {p.href ? (
                      <a href={p.href} className="font-medium text-action underline-offset-2 hover:underline">
                        {p.title} →
                      </a>
                    ) : (
                      p.title
                    )}
                  </td>
                  <td className={cn(TD_CLASS, "text-right")}>
                    <Chip kind="lift">{t.lift(p.expectedLift)}</Chip>
                  </td>
                  <td className={cn(TD_CLASS, "whitespace-nowrap text-secondary")}>{t.window[p.window]}</td>
                  <td className={TD_CLASS}>
                    <DimChip dim={p.dim} locale={locale} />
                  </td>
                  <td className={cn(TD_CLASS, "text-secondary")}>{p.evidenceToAdd ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{t.planNote}</p>
    </TbrSection>
  );
}
