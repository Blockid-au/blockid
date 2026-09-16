// Founder read-only preview of a shared assessment (G13-W4-D2, S-D2; BA
// spec §C.1, story S4). Server component, no client JS.
//
// Renders ONLY what `toFounderVisible()` produced server-side — the four
// allow-listed sections, and only the ticked ones. decision / conviction /
// private notes / valuation view / thesis fit are not in the input type, so
// nothing here can leak them (the unit test on the lib pins the field list).

import type { FounderVisibleAssessment } from "@/lib/evaluations/assessments";
import { DIM_LABELS, STANCE_LABELS } from "./assessment-shared";

export function FounderPreview({ shared }: { shared: FounderVisibleAssessment | null }) {
  if (!shared) {
    return (
      <p data-testid="assessment-private">
        Your evaluator&apos;s assessment is private. If they choose to share it, only the sections they tick (dimension ratings, risks, questions for you, shared notes) appear here — never their decision, conviction or private notes.
      </p>
    );
  }
  const dims = shared.dimensionRatings ? (Object.keys(shared.dimensionRatings) as Array<keyof typeof DIM_LABELS>) : [];
  return (
    <div className="space-y-4" data-testid="assessment-shared-preview" data-version={shared.version}>
      <p className="text-xs text-ink-500">
        Shared by your evaluator on {fmt(shared.sharedWithFounderAt)} · {shared.sharedFields.length} section{shared.sharedFields.length === 1 ? "" : "s"} (v{shared.version}). Their decision, conviction and private notes are never shared.
      </p>
      {shared.sharedFields.includes("dimension_ratings") ? (
        <section aria-labelledby="fp-dims">
          <h3 id="fp-dims" className="text-sm font-semibold text-ink-900">Their ratings per dimension</h3>
          {dims.length ? (
            <ul className="mt-1 space-y-1 text-sm" data-testid="fp-dimension-ratings">
              {dims.map((k) => {
                const r = shared.dimensionRatings![k]!;
                return (
                  <li key={k} className="flex flex-wrap gap-2">
                    <span className="font-medium text-ink-800">{DIM_LABELS[k] ?? k}</span>
                    <span className="tabular-nums text-ink-700">{r.rating}/5</span>
                    <span className="text-ink-600">{STANCE_LABELS[r.stance]}</span>
                    {r.note ? <span className="text-ink-600">— {r.note}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-ink-500">No dimension rated.</p>
          )}
        </section>
      ) : null}
      {shared.sharedFields.includes("risks") ? (
        <section aria-labelledby="fp-risks">
          <h3 id="fp-risks" className="text-sm font-semibold text-ink-900">Risks they flagged</h3>
          {shared.risks?.length ? (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm" data-testid="fp-risks">
              {shared.risks.map((r, i) => (
                <li key={i}>
                  <span className="uppercase text-xs text-ink-500">{r.severity}</span> {r.title}
                  {r.dimension ? <span className="text-ink-500"> · {r.dimension}</span> : null}
                  {r.note ? <span className="text-ink-600"> — {r.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-500">No risks listed.</p>
          )}
        </section>
      ) : null}
      {shared.sharedFields.includes("questions_for_founder") ? (
        <section aria-labelledby="fp-questions">
          <h3 id="fp-questions" className="text-sm font-semibold text-ink-900">Questions for you</h3>
          {shared.questionsForFounder?.length ? (
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm" data-testid="fp-questions">
              {shared.questionsForFounder.map((q, i) => (
                <li key={i}>
                  {q.text}
                  {q.dimension ? <span className="text-ink-500"> · {q.dimension}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-500">No questions yet.</p>
          )}
        </section>
      ) : null}
      {shared.sharedFields.includes("shared_notes") ? (
        <section aria-labelledby="fp-notes">
          <h3 id="fp-notes" className="text-sm font-semibold text-ink-900">Notes shared with you</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800" data-testid="fp-shared-notes">{shared.sharedNotes?.trim() ? shared.sharedNotes : "(empty)"}</p>
        </section>
      ) : null}
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
