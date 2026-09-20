// Chapter 12 — Money on the table: matched grants + programs (CFO + CMO).
// Free tier shows the top 3.

import { aud } from "@/lib/report-visuals";
import { VisualFigure } from "@/lib/report-visuals/react";
import { moneyEmptyState } from "@/lib/report-v2/evidence-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { AgentBadge, TBR_V2_SECTION_IDS, TbrSection, v2Strings, type TbrUiLocale } from "./shared";

export function TbrMoney({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const m = report.moneyOnTable;
  const t = v2Strings(locale).money;
  const limit = report.tier === "free" ? 3 : 50;
  const rows = [...m.grants.map((g) => ({ ...g, kind: "grant" })), ...m.programs.map((p) => ({ ...p, kind: "program" }))].sort((a, b) => b.fit - a.fit).slice(0, limit);
  // G19-S43: the empty state points at the grant profile — never "re-run the analysis".
  const empty = moneyEmptyState(report, locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.money} kicker="12" title={title}>
      <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
        <AgentBadge role="cfo" />
        <AgentBadge role="cmo" kind="support" />
        <span>{t.matched(m.grants.length + m.programs.length, aud(m.totalAud))}</span>
      </div>
      {rows.length > 0 ? (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-t border-ink-100 dark:border-ink-800/60">
                <td className="py-1 pr-2 text-ink-500">{r.kind === "grant" ? t.grant : t.program}</td>
                <td className="py-1 pr-2 font-medium text-ink-700 dark:text-ink-200">
                  {r.url ? (
                    <a href={r.url} className="hover:text-brand-600" rel="noopener noreferrer">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.amountAud !== null ? aud(r.amountAud) : "—"}</td>
                <td className="py-1 pr-2 text-ink-500">{r.deadline ?? ""}</td>
                <td className="py-1 text-right tabular-nums text-ink-500">{t.fit(Math.round(r.fit))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : empty ? (
        <p data-tbr-money-empty className="text-xs text-ink-600 dark:text-ink-400">
          {empty.text}{" "}
          <a href={empty.href} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            {empty.ctaLabel}
          </a>
        </p>
      ) : null}
      {m.visuals.map((v) => (
        <VisualFigure key={v.id} spec={v} caption={v.subtitle ?? v.title} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800" />
      ))}
    </TbrSection>
  );
}
