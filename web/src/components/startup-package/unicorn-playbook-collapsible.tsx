"use client";

// Startup Package — "Unicorn Playbook" collapsible (per phase).
//
// Subgoal 13 (`web/src/lib/startup-package/unicorn-playbook.ts`) owns the
// task registry + case-study harvester. This component is the UI shell that
// subgoal 13 fills in — Ship 1 stubs it with a friendly empty state so the
// page renders while the two subgoals merge in parallel.
//
// When subgoal 13's module lands the release agent can swap the placeholder
// import for `UNICORN_PLAYBOOK_TASKS` + `caseStudiesForPhase()` without
// touching the phase-card wiring.
//
// SUBGOAL 6 (spawn-agent-v-d-ng-cosmic-aho plan — with a hook for subgoal 13).

import * as React from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  phaseId: string;
}

interface PlaybookTaskShape {
  id: string;
  title: string;
  why: string;
  optionalityLabel: "recommended" | "table-stakes" | "differentiator";
}

interface CaseStudyShape {
  company: string;
  headline: string;
  detail: string;
}

// Placeholder loader — subgoal 13's module exports the real functions.
// The dynamic try/catch means Ship 1 still renders when the module is
// absent (fresh worktree merge), and the empty state is friendly.
function usePlaybookForPhase(phaseId: string): {
  tasks: PlaybookTaskShape[];
  studies: CaseStudyShape[];
  loading: boolean;
} {
  const [state, setState] = React.useState<{
    tasks: PlaybookTaskShape[];
    studies: CaseStudyShape[];
    loading: boolean;
  }>({ tasks: [], studies: [], loading: true });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const mod = (await import("@/lib/startup-package/unicorn-playbook").catch(
          () => null,
        )) as
          | {
              UNICORN_PLAYBOOK_TASKS?: Array<PlaybookTaskShape & { phase: string }>;
              caseStudiesForPhase?: (id: string) => CaseStudyShape[];
            }
          | null;
        if (cancelled || !mod) {
          if (!cancelled) setState({ tasks: [], studies: [], loading: false });
          return;
        }
        const tasks = (mod.UNICORN_PLAYBOOK_TASKS ?? [])
          .filter((t) => t.phase === phaseId)
          .slice(0, 3)
          .map((t) => ({
            id: t.id,
            title: t.title,
            why: t.why,
            optionalityLabel: t.optionalityLabel,
          }));
        const studies = (mod.caseStudiesForPhase?.(phaseId) ?? []).slice(0, 2);
        if (!cancelled) setState({ tasks, studies, loading: false });
      } catch {
        if (!cancelled) setState({ tasks: [], studies: [], loading: false });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [phaseId]);

  return state;
}

export function UnicornPlaybookCollapsible({ phaseId }: Props) {
  const [open, setOpen] = React.useState(false);
  const { tasks, studies, loading } = usePlaybookForPhase(phaseId);

  return (
    <section className="mt-5 rounded-2xl border border-surface-200 bg-surface-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <BookOpen aria-hidden="true" className="h-4 w-4 text-brand-600" />
          Unicorn playbook
          {!loading && tasks.length + studies.length > 0 && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
              {tasks.length + studies.length}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp aria-hidden="true" className="h-4 w-4 text-ink-500" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-500" />
        )}
      </button>

      {open && (
        <div className="border-t border-surface-200 px-4 py-3">
          {loading ? (
            <p className="text-xs text-ink-500">Loading playbook…</p>
          ) : tasks.length === 0 && studies.length === 0 ? (
            <p className="text-xs text-ink-500">
              Unicorn Playbook tasks land in Ship 1 alongside subgoal 13 — this phase
              currently has none. Check back after the next release.
            </p>
          ) : (
            <div className="space-y-4">
              {tasks.length > 0 && (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-surface-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-800">
                          {t.title}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            t.optionalityLabel === "table-stakes"
                              ? "bg-emerald-50 text-emerald-700"
                              : t.optionalityLabel === "differentiator"
                              ? "bg-purple-50 text-purple-700"
                              : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {t.optionalityLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">{t.why}</p>
                    </li>
                  ))}
                </ul>
              )}
              {studies.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    How the unicorns did it
                  </p>
                  <ul className="space-y-2">
                    {studies.map((s, i) => (
                      <li
                        key={`${s.company}-${i}`}
                        className="rounded-xl border border-surface-200 bg-white p-3 text-xs text-ink-600"
                      >
                        <p className="font-semibold text-ink-800">
                          {s.company} · {s.headline}
                        </p>
                        <p className="mt-1">{s.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
