// Block 4 — Seats & consensus table (G13-W5-D3, S-D3; BA spec §A.3 block 4
// "Multi-evaluator view", §A.5 F1 / F2, Appendix 2 "Consensus"). Server
// component; assessor only (the loader hands the founder the empty state).
//
//   rows     one per seat of the viewer's org — decision chip, conviction,
//            status, the 8 dimension ratings (own row editable in the form
//            above; other seats read-only, private_notes never present).
//   footer   consensus: median rating per dimension over SUBMITTED rows,
//            decision tally, mean conviction; any dimension whose seat
//            ratings span ≥ 2 carries the "Discuss" marker (F2).
//   single   a personal org (one seat) renders the invite prompt instead
//            of a one-row table.

import Link from "next/link";
import { ASSESSMENT_DIM_KEYS } from "@/lib/evaluations/assessments";
import type { DossierConsensus } from "@/lib/investor/organisations";
import { ConsensusTracker } from "./consensus-tracker";

const DECISION_CHIP: Record<string, string> = {
  pass: "bg-red-50 text-red-800 border-red-200",
  track: "bg-amber-50 text-amber-800 border-amber-200",
  proceed: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export function SeatsConsensus({ consensus, evaluationId }: { consensus: DossierConsensus; evaluationId: string }) {
  if (!consensus.available) return null;
  if (consensus.seatCount <= 1) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-surface-300 px-4 py-3 text-xs text-ink-600" data-testid="seats-single">
        <strong className="text-ink-800">Seats.</strong> You are the only seat on this dossier. Firm (3 seats) and Program (5 seats) let colleagues record their own view and show the consensus here —{" "}
        <Link href="/workspace/investor/team" className="text-brand-700 hover:underline">
          manage seats
        </Link>
        .
      </div>
    );
  }
  const discuss = new Set(consensus.disagreement);
  return (
    <div className="mt-6" data-testid="seats-consensus" data-seats={consensus.seatCount} data-submitted={consensus.submittedCount}>
      <ConsensusTracker evaluationId={evaluationId} seats={consensus.seatCount} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900">
          Seats · {consensus.orgName ?? "your organisation"}{" "}
          <span className="font-normal text-ink-500" data-testid="consensus-label">
            {consensus.label}
          </span>
        </h3>
        <p className="text-xs text-ink-500">
          Aggregate:{" "}
          <strong data-testid="consensus-aggregate" className="uppercase text-ink-800">
            {consensus.aggregate === null ? "no submitted view" : consensus.aggregate === "split" ? "split" : consensus.aggregate}
          </strong>
          {" · "}
          {consensus.tally.proceed} proceed · {consensus.tally.track} track · {consensus.tally.pass} pass
          {consensus.meanConviction != null ? ` · mean conviction ${consensus.meanConviction}/5` : ""}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-surface-200">
        <table className="min-w-full text-xs">
          <thead className="bg-surface-50 text-left uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Seat</th>
              <th className="px-3 py-2 font-semibold">Decision</th>
              <th className="px-3 py-2 font-semibold text-right">Conviction</th>
              {ASSESSMENT_DIM_KEYS.map((k) => (
                <th key={k} className={`px-2 py-2 text-center font-semibold ${discuss.has(k) ? "bg-amber-50 text-amber-900" : ""}`} data-discuss={discuss.has(k) ? "1" : "0"}>
                  {k}
                  {discuss.has(k) ? <span className="sr-only"> — seats disagree, discuss</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {consensus.seats.map((s) => {
              const a = s.assessment;
              return (
                <tr key={s.userId} data-testid="seat-row" data-me={s.isMe ? "1" : "0"} className={s.isMe ? "bg-brand-50/40" : ""}>
                  <td className="px-3 py-2 text-ink-800">
                    {s.displayName}
                    <span className="ml-1 text-ink-400">{a ? (a.status === "submitted" ? `v${a.version} submitted` : `v${a.version} draft`) : "not started"}</span>
                  </td>
                  <td className="px-3 py-2">
                    {a?.decision ? (
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${DECISION_CHIP[a.decision]}`}>{a.decision}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-800">{a?.conviction ?? "—"}</td>
                  {ASSESSMENT_DIM_KEYS.map((k) => {
                    const r = a?.dimensionRatings[k];
                    return (
                      <td key={k} className={`px-2 py-2 text-center tabular-nums ${discuss.has(k) ? "bg-amber-50/60" : ""}`} title={r?.stance}>
                        {r ? r.rating : <span className="text-ink-300">·</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="bg-surface-50 font-semibold text-ink-900" data-testid="consensus-row">
              <td className="px-3 py-2">Consensus (median)</td>
              <td className="px-3 py-2 uppercase">{consensus.aggregate ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{consensus.meanConviction ?? "—"}</td>
              {ASSESSMENT_DIM_KEYS.map((k) => (
                <td key={k} className={`px-2 py-2 text-center tabular-nums ${discuss.has(k) ? "bg-amber-100 text-amber-900" : ""}`}>
                  {consensus.medianRating[k] ?? "—"}
                  {discuss.has(k) ? <span className="ml-0.5 text-[10px] font-normal">Discuss</span> : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">
        Medians and the tally use submitted views only; drafts are listed but not counted. Other seats&apos; private notes are never shown.
      </p>
    </div>
  );
}
