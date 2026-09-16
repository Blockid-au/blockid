// Investor Dossier — block 5 · Progress radar (BA spec §A.3 block 5, S-R4).
//
// Server component over `DossierProgressBlock`: the evaluator progress
// radar scoped to this one evaluation (weekly Δ, stage change, new
// evidence, last report), the startup's dated deadlines, the last weekly
// progress email, the score-history sparkline (same renderer as the TBR)
// and the "since my last assessment" callout (assessor only).

import Link from "next/link";
import { formatDelta } from "@/lib/evaluations/progress-shared";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { DossierProgressBlock } from "@/lib/evaluations/dossier";
import { DossierBlock } from "./block";
import { fmtDate } from "./dossier-header";

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-400">—</span>;
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-red-700" : "text-ink-500";
  return <span className={tone}>{formatDelta(value)}</span>;
}

export function ProgressBlock({ block, role }: { block: DossierProgressBlock; role: "assessor" | "founder" }) {
  if (!block.available || !block.item) {
    return (
      <DossierBlock n={5} title="Progress radar" testId="dossier-block-5">
        <p data-testid="progress-empty">
          No snapshot history yet for this startup — the weekly Δ, movers and deadlines appear after the first re-score. The multi-startup view lives on{" "}
          <Link href="/workspace/evaluations" className="text-brand-700 hover:underline">
            Startups I&apos;m evaluating
          </Link>
          .
        </p>
      </DossierBlock>
    );
  }
  const it = block.item;
  return (
    <DossierBlock n={5} title="Progress radar" testId="dossier-block-5">
      <p className="text-xs text-ink-500">
        Period {fmtDate(block.periodStart)} → {fmtDate(block.periodEnd)}
        {block.lastSendAt ? ` · last progress email ${fmtDate(block.lastSendAt)}` : " · no progress email sent yet"}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">SVI now</dt>
            <dd className="mt-0.5 text-ink-900" data-testid="progress-svi">
              <strong>{it.sviNow ?? "—"}</strong>
              {it.sviPrev != null ? <span className="ml-1 text-xs text-ink-500">was {it.sviPrev}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Δ this period</dt>
            <dd className="mt-0.5 font-semibold" data-testid="progress-delta">
              <Delta value={it.delta} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Stage</dt>
            <dd className="mt-0.5 text-ink-800">{it.stageNow ?? "—"}{it.stageChanged ? <span className="ml-1 text-xs text-emerald-700">changed</span> : null}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">New evidence</dt>
            <dd className="mt-0.5 text-ink-800">{it.newEvidence}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Last report</dt>
            <dd className="mt-0.5 text-ink-800">{it.lastReport ? `${fmtDate(it.lastReport.at)} · ${it.lastReport.kind}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Money signals</dt>
            <dd className="mt-0.5 text-ink-800">
              {it.money.deadlinesAhead} deadline{it.money.deadlinesAhead === 1 ? "" : "s"} ahead · {it.money.newMatches} new match{it.money.newMatches === 1 ? "" : "es"}
            </dd>
          </div>
        </dl>
        {block.sparkline ? (
          <div data-testid="progress-sparkline">
            <VisualFigure spec={block.sparkline} caption={block.sparkline.subtitle ?? null} />
          </div>
        ) : null}
      </div>
      {block.deadlines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs" data-testid="progress-deadlines">
          {block.deadlines.map((d) => (
            <li key={`${d.refKind}-${d.refId}`} className="flex justify-between rounded-lg bg-surface-50 px-2.5 py-1.5">
              <span className="text-ink-800">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {d.name}
                  </a>
                ) : (
                  d.name
                )}{" "}
                <span className="text-ink-500">({d.refKind})</span>
              </span>
              <span className="tabular-nums text-ink-600">
                {fmtDate(d.closesAt)} · {d.daysLeft} d
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {role === "assessor" && block.sinceAssessment ? (
        <p className="mt-3 rounded-lg border border-brand-200/70 bg-brand-50/50 px-3 py-2 text-xs text-ink-800" data-testid="progress-since-assessment">
          Since my last assessment (v{block.sinceAssessment.version}, {fmtDate(block.sinceAssessment.assessedAt)}): SVI {block.sinceAssessment.sviThen ?? "—"} → {block.sinceAssessment.sviNow ?? "—"}{" "}
          <Delta value={block.sinceAssessment.delta} />
          {block.sinceAssessment.delta === 0 ? " — the startup has not moved; any change of view is yours." : ""}
        </p>
      ) : null}
    </DossierBlock>
  );
}
