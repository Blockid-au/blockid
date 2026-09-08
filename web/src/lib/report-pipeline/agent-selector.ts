// Context-aware agent selector — decides which agents run at each wave,
// based on the intake `IntakeContext`. Preserves the 3-wave dispatcher
// contract but tunes membership per phase so an idea-stage founder does
// not pay for the CFO valuation deep-dive, and a scale-stage company
// gets CISO + CDO coverage.

import "server-only";

import type { IntakeContext } from "@/lib/intake/detect-context";
import type { AgentRole } from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";

export interface WaveTask {
  agentRole: AgentRole;
  criterion: CriterionKey;
}

export type Wave = WaveTask[];

/** Coarse phase bucket used for per-stage criterion selection. */
export type PhaseBucket = "idea" | "mvp" | "revenue" | "scale";

export function bucketForContext(ctx: IntakeContext): PhaseBucket {
  // Prefer the SVI stage — it's the deterministic view of evidence.
  if (ctx.maturity === "established" || ctx.maturity === "scale") return "scale";
  if (ctx.stage >= 6) return "scale";
  if (ctx.stage >= 4 || ctx.maturity === "growth") return "revenue";
  if (ctx.stage >= 2 || ctx.maturity === "early") return "mvp";
  return "idea";
}

/**
 * Per-phase criteria table. Every entry is a `{agentRole, criterion}` pair
 * the dispatcher can hand to `dispatchWave` unchanged.
 *
 * Idea phase intentionally SKIPS CFO valuation deep-dive (`revenue` criterion)
 * and adds a CPO-led idea clarification pass. Scale phase adds CISO/CDO/COO
 * so security posture, data governance and ops coverage are audited.
 */
export const PHASE_CRITERIA: Record<PhaseBucket, {
  wave1: WaveTask[];
  wave2: WaveTask[];
  wave3: WaveTask[];
}> = {
  idea: {
    wave1: [
      { agentRole: "cpo", criterion: "idea" },
      { agentRole: "cmo", criterion: "market" },
      { agentRole: "chro", criterion: "founder_profile" },
    ],
    wave2: [
      { agentRole: "cmo", criterion: "gtm_strategy" },
    ],
    wave3: [
      // Deferred until evidenceCompleteness >= 0.5
      { agentRole: "cpo", criterion: "roadmap" },
    ],
  },
  mvp: {
    wave1: [
      { agentRole: "cpo", criterion: "idea" },
      { agentRole: "cmo", criterion: "market" },
      { agentRole: "chro", criterion: "founder_profile" },
      { agentRole: "cto", criterion: "code_git" },
    ],
    wave2: [
      { agentRole: "cmo", criterion: "website" },
      { agentRole: "cmo", criterion: "gtm_strategy" },
      { agentRole: "cro", criterion: "customer_size" },
    ],
    wave3: [
      { agentRole: "cpo", criterion: "roadmap" },
    ],
  },
  revenue: {
    wave1: [
      { agentRole: "cto", criterion: "code_git" },
      { agentRole: "cmo", criterion: "market" },
      { agentRole: "chro", criterion: "founder_profile" },
      { agentRole: "cfo", criterion: "revenue" },
      { agentRole: "cro", criterion: "customer_size" },
      { agentRole: "clo", criterion: "documents" },
    ],
    wave2: [
      { agentRole: "cpo", criterion: "idea" },
      { agentRole: "cmo", criterion: "website" },
      { agentRole: "cmo", criterion: "gtm_strategy" },
      { agentRole: "chro", criterion: "team" },
      { agentRole: "clo", criterion: "dataroom" },
      { agentRole: "chro", criterion: "team_structure" },
    ],
    wave3: [
      { agentRole: "cpo", criterion: "roadmap" },
    ],
  },
  scale: {
    wave1: [
      { agentRole: "cto", criterion: "code_git" },
      { agentRole: "cmo", criterion: "market" },
      { agentRole: "chro", criterion: "founder_profile" },
      { agentRole: "cfo", criterion: "revenue" },
      { agentRole: "cro", criterion: "customer_size" },
      { agentRole: "clo", criterion: "documents" },
      { agentRole: "ciso", criterion: "code_git" },
      { agentRole: "cdo", criterion: "documents" },
    ],
    wave2: [
      { agentRole: "cpo", criterion: "idea" },
      { agentRole: "cmo", criterion: "website" },
      { agentRole: "cmo", criterion: "gtm_strategy" },
      { agentRole: "chro", criterion: "team" },
      { agentRole: "clo", criterion: "dataroom" },
      { agentRole: "chro", criterion: "team_structure" },
      { agentRole: "coo", criterion: "team_structure" },
    ],
    wave3: [
      { agentRole: "cpo", criterion: "roadmap" },
    ],
  },
};

export interface SelectAgentsOptions {
  /** Force include the leadAgent + supportAgents from `GROWTH_PHASES`. */
  includePhaseAgents?: boolean;
}

/**
 * Compose the three waves for a given context.
 *
 * Wave 3 is only returned when `evidenceCompleteness >= 0.5` — otherwise the
 * founder pays for a roadmap section built on air. The caller can still opt
 * to run wave 3 by inspecting the result and appending it themselves; the
 * default here is conservative.
 */
export function selectAgentsForContext(
  ctx: IntakeContext,
  options: SelectAgentsOptions = {},
): Wave[] {
  const bucket = bucketForContext(ctx);
  const table = PHASE_CRITERIA[bucket];

  // Deep-copy so callers can push into the arrays without mutating the table.
  const wave1: WaveTask[] = [...table.wave1];
  const wave2: WaveTask[] = [...table.wave2];
  const wave3: WaveTask[] = ctx.evidenceCompleteness >= 0.5 ? [...table.wave3] : [];

  // Optionally seed with the growth-phase lead/support agents so a founder
  // in an unusual phase mix still gets the phase-appropriate coverage.
  if (options.includePhaseAgents) {
    const phase = GROWTH_PHASES.find(p => p.order === ctx.growthPhase);
    if (phase) {
      const already = new Set(
        [...wave1, ...wave2, ...wave3].map(t => `${t.agentRole}:${t.criterion}`),
      );
      const maybeAdd = (role: string, criterion: CriterionKey) => {
        const asRole = role as AgentRole;
        const key = `${asRole}:${criterion}`;
        if (!already.has(key)) {
          wave2.push({ agentRole: asRole, criterion });
          already.add(key);
        }
      };
      const inferCriterion = (role: string): CriterionKey => {
        switch (role) {
          case "cto": return "code_git";
          case "cmo": return "market";
          case "cfo": return "revenue";
          case "chro": return "team";
          case "cpo": return "idea";
          case "cro": return "customer_size";
          case "clo": return "documents";
          case "ciso": return "code_git";
          case "cdo": return "documents";
          case "coo": return "team_structure";
          default: return "idea";
        }
      };
      maybeAdd(phase.leadAgent, inferCriterion(phase.leadAgent));
      for (const support of phase.supportAgents) {
        maybeAdd(support, inferCriterion(support));
      }
    }
  }

  return [wave1, wave2, wave3];
}

/**
 * Return the flat list of agents the selector will run. Convenience helper
 * for cost estimation (map each to a FEATURE_COSTS entry).
 */
export function agentsPlannedFor(ctx: IntakeContext): AgentRole[] {
  const waves = selectAgentsForContext(ctx);
  const roles: AgentRole[] = [];
  for (const wave of waves) {
    for (const task of wave) roles.push(task.agentRole);
  }
  return roles;
}
