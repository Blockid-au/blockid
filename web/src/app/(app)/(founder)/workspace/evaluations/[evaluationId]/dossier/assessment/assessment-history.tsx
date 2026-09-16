"use client";

// Assessment history timeline (G13-W4-D2, S-D2; BA spec §A.3 block 4
// "History", story E4.4). Versions newest first with "what changed"
// (decision · conviction · snapshot) between consecutive versions, plus the
// share marker on the row that is currently shared. Collapsed by default;
// expanding fires `assessment_history_viewed` once (§C.5). Never carries
// notes (the timeline entries are notes-free by construction).

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { AssessmentHistoryEntry, EvaluationAssessment } from "@/lib/evaluations/assessments";
import { DECISION_LABELS, diffHistory } from "./assessment-shared";

export function AssessmentHistory({ evaluationId, history, current }: { evaluationId: string; history: AssessmentHistoryEntry[]; current: EvaluationAssessment | null }) {
  const [open, setOpen] = useState(false);
  const [fired, setFired] = useState(false);
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => b.version - a.version);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !fired) {
      setFired(true);
      trackEvent("assessment_history_viewed", { evaluation_id: evaluationId, versions: sorted.length });
    }
  };

  return (
    <section aria-labelledby="assessment-history-heading" data-testid="assessment-history">
      <button type="button" className="text-sm font-semibold text-ink-900 underline-offset-2 hover:underline" aria-expanded={open} aria-controls="assessment-history-list" onClick={toggle} id="assessment-history-heading">
        History — {sorted.length} version{sorted.length === 1 ? "" : "s"} {open ? "▾" : "▸"}
      </button>
      {open ? (
        <ol id="assessment-history-list" className="mt-2 space-y-2 border-l-2 border-surface-200 pl-4 text-sm">
          {sorted.map((h, i) => {
            const prev = sorted[i + 1] ?? null;
            const diff = diffHistory(prev, h);
            const isShared = current?.id === h.id && current?.sharedWithFounderAt;
            return (
              <li key={h.id} className="relative" data-testid={`history-v${h.version}`}>
                <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden />
                <p className="text-ink-800">
                  <strong>v{h.version}</strong> · {h.status === "submitted" ? `submitted ${fmt(h.submittedAt)}` : `draft, last edited ${fmt(h.updatedAt)}`} · {h.decision ? DECISION_LABELS[h.decision] : "no decision"} · conviction {h.conviction ?? "—"}/5
                  {isShared ? <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">shared with founder {fmt(current!.sharedWithFounderAt)} · {current!.sharedFields.length} section{current!.sharedFields.length === 1 ? "" : "s"}</span> : null}
                </p>
                {diff.length ? (
                  <ul className="mt-0.5 text-xs text-ink-600">
                    {diff.map((d) => (
                      <li key={d.key}>
                        {d.key}: {d.before} → {d.after}
                      </li>
                    ))}
                  </ul>
                ) : prev ? (
                  <p className="mt-0.5 text-xs text-ink-500">decision and conviction unchanged since v{prev.version}</p>
                ) : null}
                {!h.snapshotId ? <p className="mt-0.5 text-xs text-ink-400">snapshot no longer available</p> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
