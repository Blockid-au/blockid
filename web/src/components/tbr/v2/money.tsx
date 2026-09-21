// Section 15 — Money on the table (after the plan: it funds the plan): matched grants + programs (CFO + CMO).
// Free tier shows the top 3.

import { aud } from "@/lib/report-visuals";
import { VisualFigure } from "@/lib/report-visuals/react";
import { moneyEmptyState } from "@/lib/report-v2/evidence-view";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { AgentBadge, Chip, TABLE_CLASS, TBR_V2_SECTION_IDS, TbrSection, v2Strings, zebraRow, type TbrUiLocale } from "./shared";

export function TbrMoney({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const m = report.moneyOnTable;
  const t = v2Strings(locale).money;
  const limit = report.tier === "free" ? 3 : 50;
  const rows = [...m.grants.map((g) => ({ ...g, kind: "grant" })), ...m.programs.map((p) => ({ ...p, kind: "program" }))].sort((a, b) => b.fit - a.fit).slice(0, limit);
  // G19-S43: the empty state points at the grant profile — never "re-run the analysis".
  const empty = moneyEmptyState(report, locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.money} kicker="15" title={title} purpose={v2Strings(locale).s47.purpose.money}>
      <div className="flex items-center gap-2 text-xs text-secondary">
        <AgentBadge role="cfo" />
        <AgentBadge role="cmo" kind="support" />
        <span>{t.matched(m.grants.length + m.programs.length, aud(m.totalAud))}</span>
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.kind}-${r.id}`} className={zebraRow(i)}>
                <td className="py-1 pr-2">
                  <Chip kind="neutral">{r.kind === "grant" ? t.grant : t.program}</Chip>
                </td>
                <td className="py-1 pr-2 font-medium text-secondary">
                  {r.url ? (
                    <a href={r.url} className="hover:text-action" rel="noopener noreferrer">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.amountAud !== null ? aud(r.amountAud) : "—"}</td>
                <td className="py-1 pr-2 text-muted">{r.deadline ?? ""}</td>
                <td className="py-1 text-right tabular-nums text-muted">{t.fit(Math.round(r.fit))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : empty ? (
        <p data-tbr-money-empty className="text-xs text-secondary">
          {empty.text}{" "}
          <a href={empty.href} className="font-semibold text-action hover:underline">
            {empty.ctaLabel}
          </a>
        </p>
      ) : null}
      {m.visuals.map((v) => (
        <VisualFigure key={v.id} spec={v} caption={v.subtitle ?? v.title} className="rounded-xl border border-line-subtle p-3" />
      ))}
    </TbrSection>
  );
}
