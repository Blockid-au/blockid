// Unicorn Playbook Panel — Subgoal 13 UI surface
// -----------------------------------------------------------------------------
// Server component (RSC). Uses the native <details>/<summary> collapsible so
// there is zero client JS — the panel opens/closes purely through the browser.
// Intended to be rendered *inside* the phase-card component owned by subgoal
// 6; that owner imports this component and passes the phase id.
//
// Data sources:
//   - `tasksForPhase()` from `unicorn-playbook.ts` — the 14 optional-but-
//     recommended tasks unicorn founders actually did, filtered to the phase.
//   - `caseStudiesForPhase()` from `case-study-milestones.ts` — up to 2 real
//     milestone rows (Atlassian / Canva / Xero / SafetyCulture) for the phase.
//
// The "Do this" button is a <form> POST to
// `/api/startup-package/deliverable/[slug]` — the same endpoint subgoal 7's
// auto-fill uses. Because it is a native form submit with no client JS the
// endpoint must return an appropriate redirect or the browser will render its
// response verbatim; subgoal 7 owns that contract.

import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import type { GrowthPhaseId } from "@/lib/journey-map";
import {
  caseStudiesForPhase,
  type Milestone,
} from "@/lib/startup-package/case-study-milestones";
import {
  tasksForPhase,
  type OptionalityLabel,
  type UnicornPlaybookTask,
} from "@/lib/startup-package/unicorn-playbook";

export interface UnicornPlaybookPanelProps {
  /** Which of the 12 growth phases to surface tasks + case studies for. */
  phaseId: GrowthPhaseId;
}

/**
 * Truncate a string to `max` chars, appending an ellipsis when trimming.
 * Guards against cutting mid-word by trimming trailing whitespace first.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

/** Tailwind classes for each optionality-label badge. */
function optionalityClasses(label: OptionalityLabel): string {
  switch (label) {
    case "table-stakes":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "differentiator":
      return "bg-violet-50 text-violet-900 border-violet-200";
    case "recommended":
    default:
      return "bg-sky-50 text-sky-900 border-sky-200";
  }
}

/** Short display name for each case-study company badge. */
function companyLabel(company: Milestone["company"]): string {
  switch (company) {
    case "atlassian":
      return "Atlassian";
    case "canva":
      return "Canva";
    case "xero":
      return "Xero";
    case "safetyculture":
      return "SafetyCulture";
  }
}

export function UnicornPlaybookPanel({ phaseId }: UnicornPlaybookPanelProps) {
  const phase = GROWTH_PHASES.find((p) => p.id === phaseId);
  const phaseTitle = phase?.title ?? phaseId;
  const tasks = tasksForPhase(phaseId);
  const milestones = caseStudiesForPhase(phaseId);

  // If neither tasks nor milestones exist for this phase, render nothing so
  // the phase-card doesn't get a dangling empty collapsible.
  if (tasks.length === 0 && milestones.length === 0) return null;

  return (
    <details className="mt-4 rounded-lg border border-surface-200 bg-white">
      <summary className="cursor-pointer select-none rounded-lg px-4 py-3 text-sm font-semibold text-ink-900 hover:bg-surface-50">
        Unicorn playbook — {phaseTitle}
      </summary>

      <div className="border-t border-surface-200 px-4 py-4">
        {tasks.length > 0 && (
          <section aria-labelledby={`playbook-tasks-${phaseId}`}>
            <h4
              id={`playbook-tasks-${phaseId}`}
              className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500"
            >
              Tasks unicorn founders did
            </h4>
            <ul className="space-y-3">
              {tasks.map((task) => (
                <PlaybookTaskRow key={task.id} task={task} />
              ))}
            </ul>
          </section>
        )}

        {milestones.length > 0 && (
          <section
            aria-labelledby={`playbook-examples-${phaseId}`}
            className={tasks.length > 0 ? "mt-5" : ""}
          >
            <h4
              id={`playbook-examples-${phaseId}`}
              className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500"
            >
              Real examples
            </h4>
            <ul className="space-y-3">
              {milestones.map((m, idx) => (
                <MilestoneRow
                  key={`${phaseId}-milestone-${idx}`}
                  milestone={m}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}

function PlaybookTaskRow({ task }: { task: UnicornPlaybookTask }) {
  return (
    <li className="rounded border border-surface-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-ink-900">
              {task.title}
            </span>
            <span
              className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${optionalityClasses(task.optionalityLabel)}`}
            >
              {task.optionalityLabel.replace("-", " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-700">{task.why}</p>
          <p className="mt-1 text-[11px] text-ink-500">
            Evidence: {task.evidence.company} · {task.evidence.year}
            {task.evidence.sourceUrl ? (
              <>
                {" · "}
                <a
                  href={task.evidence.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  source
                </a>
              </>
            ) : null}
          </p>
        </div>

        <form
          method="post"
          action={`/api/startup-package/deliverable/${task.deliverableSlug}`}
          className="shrink-0"
        >
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            aria-label={`Do this: ${task.title} — costs ${task.creditCost} credits`}
          >
            Do this · {task.creditCost}c
          </button>
        </form>
      </div>
    </li>
  );
}

function MilestoneRow({ milestone: m }: { milestone: Milestone }) {
  return (
    <li className="border-l-2 border-brand-300 pl-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
          {companyLabel(m.company)}
        </span>
        {m.year !== undefined && (
          <span className="font-mono text-xs text-ink-500">{m.year}</span>
        )}
        <span className="font-semibold text-ink-900">{m.headline}</span>
      </div>
      <p className="mt-1 text-xs text-ink-700">{truncate(m.detail, 100)}</p>
      {m.source ? (
        <a
          href={m.source}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-[11px] text-brand-700 hover:underline"
        >
          source →
        </a>
      ) : null}
    </li>
  );
}
