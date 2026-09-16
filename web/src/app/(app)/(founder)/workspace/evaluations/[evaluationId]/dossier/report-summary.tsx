// Investor Dossier — BLOCK 1 "Trusted Business Report summary" (BA spec
// §A.3 block 1, user story S2). Server component, no client JS.
//
//   * 8-dimension radar: the SAME VisualSpecV2 the report cover carries
//     (`cover-radar`, kind "radar", startup vs stage p50), rendered through
//     <VisualFigure> → renderVisual → one inline `svg[role=img]`;
//   * weighted table: Dim · Weight · Score · Δ30d · Cohort p50 · Band ·
//     Owning agent — the weight column is shown because this page is only
//     ever served to an authenticated evaluator or the claimed founder (goal
//     doc F3); the public /tbr/[token] keeps hiding weights;
//   * 13-criteria strip: score · verdict sentence · evidence count with the
//     honest "0 evidence — self-declared" state · owning agent. The
//     "AI says / I say" toggle lands with the assessment form (S-D2).

import Link from "next/link";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { DossierReportBlock } from "@/lib/evaluations/dossier";

const BAND_TONE: Record<string, string> = {
  strong: "bg-emerald-50 text-emerald-800",
  developing: "bg-amber-50 text-amber-800",
  early: "bg-red-50 text-red-800",
  pending: "bg-surface-100 text-ink-500",
};

const SOURCE_LABEL: Record<string, string> = {
  self_declared: "self-declared",
  public_url: "public URL",
  document_uploaded: "document uploaded",
  connected_source: "connected source",
  transaction_data: "transaction data",
  third_party_verified: "third-party verified",
};

function DeltaCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-400">—</span>;
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-red-700" : "text-ink-500";
  return (
    <span className={tone}>
      {value > 0 ? "▲ +" : value < 0 ? "▼ " : "• "}
      {value}
    </span>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const tone = score == null ? "#94a3b8" : score >= 70 ? "#059669" : score >= 45 ? "#d97706" : "#dc2626";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={tone} strokeWidth="4" strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform="rotate(-90 18 18)" />
      <text x="18" y="21" textAnchor="middle" fontSize="10" fontWeight="600" fill="#0f172a">
        {score == null ? "–" : score}
      </text>
    </svg>
  );
}

export function ReportSummary({ report }: { report: DossierReportBlock }) {
  return (
    <section aria-labelledby="dossier-block-1" className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid="dossier-block-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dossier-block-1" className="text-lg font-semibold text-ink-900">
            1 · Trusted Business Report summary
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            8 dimensions × 13 criteria from the last persisted snapshot
            {report.source === "adapter" ? " (read-time projection; the pipeline writes the full v2 document on the next run)" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {report.links.fullReport ? (
            <a href={report.links.fullReport} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50">
              Open full Trusted Business Report
            </a>
          ) : (
            <Link href={report.links.analyze} className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50">
              {report.available ? "Open analysis" : "Score this startup"}
            </Link>
          )}
          {report.links.pdf ? (
            <a href={report.links.pdf} className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 font-medium text-ink-700 hover:bg-surface-50">
              PDF
            </a>
          ) : null}
        </div>
      </div>

      {!report.available ? (
        <div className="mt-4 rounded-xl border border-dashed border-surface-300 bg-surface-50 px-4 py-8 text-center text-sm text-ink-500" data-testid="report-empty">
          No snapshot yet — run the Trusted Business Report to fill the radar, the weighted table and the 13 criteria.
        </div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div>
            {report.radar ? (
              <VisualFigure spec={report.radar} className="mx-auto max-w-[18rem]" caption="This startup (solid) vs stage-cohort median (dashed)" />
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="weighted-table">
              <caption className="sr-only">Weighted 8-dimension table</caption>
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="py-2 pr-3">
                    Dimension
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right" title="House weight — shown to authenticated evaluators only">
                    Weight
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Score
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Δ30d
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    Cohort p50
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Band
                  </th>
                  <th scope="col" className="py-2">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {report.dims.map((d) => (
                  <tr key={d.dim} data-testid="dim-row">
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-ink-900">{d.code}</span>
                      <span className="ml-2 text-xs text-ink-500">{d.title}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-700" data-testid="weight-cell">
                      {d.weight}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-ink-900">{d.score == null ? "—" : d.score}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-xs">
                      <DeltaCell value={d.delta30d} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-500">{d.p50}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BAND_TONE[d.band] ?? BAND_TONE.pending}`}>{d.band}</span>
                    </td>
                    <td className="py-2 text-xs text-ink-600">{d.ownerAgent}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-xs text-ink-500">
                  <td className="pt-2 pr-3">Total</td>
                  <td className="pt-2 pr-3 text-right tabular-nums">{report.dims.reduce((s, d) => s + d.weight, 0)}</td>
                  <td colSpan={5} className="pt-2">
                    Weights are house constants; they are visible here because the Dossier is only served to authenticated evaluators.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold text-ink-900">13 criteria</h3>
      <ol className="mt-2 divide-y divide-surface-100 rounded-xl border border-surface-200" data-testid="criteria-strip">
        {report.criteria.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-3 py-2.5" data-testid="criterion-row">
            <ScoreRing score={c.score} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink-900">{c.title}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-400">
                  {c.primaryDimension} · {c.ownerAgent}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink-600">{c.verdict}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-ink-500" data-testid="criterion-evidence">
              {c.evidenceCount === 0 ? (
                <span>0 evidence — self-declared</span>
              ) : (
                <span>
                  {c.evidenceCount} evidence · {SOURCE_LABEL[c.strongestSource] ?? c.strongestSource}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
