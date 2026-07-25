// Startup Package — Unicorn Playbook (STUB).
//
// Subgoal 13 (spawn-agent-v-d-ng-cosmic-aho plan) owns this module. Ship 1
// subgoal 6 ships a UI collapsible that loads playbook tasks dynamically;
// this file is the minimum contract that keeps the collapsible compiling
// while subgoal 13 lands its full 14-task registry + case-study harvester.
//
// When subgoal 13 merges, this file is overwritten with the real data.

export type PlaybookOptionality =
  | "recommended"
  | "table-stakes"
  | "differentiator";

export interface UnicornPlaybookTask {
  id: string;
  phase: string;
  title: string;
  why: string;
  evidence: { company: string; year: number; sourceUrl?: string };
  deliverableSlug: string;
  creditCost: number;
  optionalityLabel: PlaybookOptionality;
}

export interface CaseStudyMilestone {
  company: string;
  headline: string;
  detail: string;
  source?: string;
}

/** Stub — subgoal 13 populates the 14 tasks in the plan. */
export const UNICORN_PLAYBOOK_TASKS: readonly UnicornPlaybookTask[] = [];

/** Stub — subgoal 13's harvester lifts inline TIMELINE arrays into this. */
export function caseStudiesForPhase(_phaseId: string): CaseStudyMilestone[] {
  return [];
}
