// Context-aware agent selector — decides which agents run at each wave,
// based on the intake `IntakeContext`. Preserves the 3-wave dispatcher
// contract but tunes membership per phase so an idea-stage founder does
// not pay for the CFO valuation deep-dive, and a scale-stage company
// gets CISO + CDO coverage.
//
// G13-W2-R2 (spec §C.6 phase-aware selection):
//   (a) W4 always runs the 8 dimension owners (`selectDimensionOwners`);
//   (b) the current growth phase lead + support agents join W2 for their
//       inferred criterion — `includePhaseAgents` now defaults to true;
//   (c) criteria required by `PHASE_EXIT_RULES[phase]` and by the next phase
//       get the larger token budget (`budget: "large"`) and are never skipped
//       in W3 even when evidenceCompleteness < 0.5;
//   (d) `phaseId` is resolved from `growthPhaseId` / `growthPhase` through the
//       canonical taxonomy so the selector and the prompt lens agree.

import "server-only";

import type { IntakeContext } from "@/lib/intake/detect-context";
import type { AgentRole } from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { PHASE_EXIT_RULES } from "@/lib/growth/phase-gate";
import { isGrowthPhaseId, nextGrowthPhase, orderToGrowthPhase, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import { DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "./dimension-owners";

export interface WaveTask {
  agentRole: AgentRole;
  criterion: CriterionKey;
  /** `large` = phase-required criterion: full token budget, never skipped. */
  budget?: "standard" | "large";
}

export type Wave = WaveTask[];

/** Coarse phase bucket used for per-stage criterion selection. */
export type PhaseBucket = "idea" | "mvp" | "revenue" | "scale";

/** Bucket from the SVI stage alone (prompt builder, no IntakeContext at hand). */
export function bucketForStage(stage: number): PhaseBucket {
  if (stage >= 6) return "scale";
  if (stage >= 4) return "revenue";
  if (stage >= 2) return "mvp";
  return "idea";
}

export function bucketForContext(ctx: IntakeContext): PhaseBucket {
  // Prefer the SVI stage — it is the deterministic view of evidence.
  if (ctx.maturity === "established" || ctx.maturity === "scale") return "scale";
  if (ctx.stage >= 6) return "scale";
  if (ctx.stage >= 4 || ctx.maturity === "growth") return "revenue";
  if (ctx.stage >= 2 || ctx.maturity === "early") return "mvp";
  return "idea";
}

/** Canonical growth phase for a context: explicit id → order → stage-derived. */
export function phaseIdForContext(ctx: Pick<IntakeContext, "growthPhaseId" | "growthPhase" | "stage">): GrowthPhaseId {
  if (isGrowthPhaseId(ctx.growthPhaseId)) return ctx.growthPhaseId;
  if (typeof ctx.growthPhase === "number" && ctx.growthPhase >= 1) return orderToGrowthPhase(ctx.growthPhase);
  const byStage = GROWTH_PHASES.filter((p) => ctx.stage >= p.sviStageRange[0] && ctx.stage <= p.sviStageRange[1]);
  const last = byStage[byStage.length - 1] ?? GROWTH_PHASES[0];
  return isGrowthPhaseId(last.id) ? last.id : "vision";
}

/** Criteria the current phase AND the next phase require (§C.6 c). */
export function requiredCriteriaFor(phaseId: GrowthPhaseId): Set<CriterionKey> {
  const out = new Set<CriterionKey>(PHASE_EXIT_RULES[phaseId].requiredCriteria);
  const next = nextGrowthPhase(phaseId);
  if (next) PHASE_EXIT_RULES[next].requiredCriteria.forEach((c) => out.add(c));
  return out;
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
      // Deferred until evidenceCompleteness >= 0.5 (unless phase-required)
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
  /** Include the leadAgent + supportAgents from `GROWTH_PHASES`. Default true (§C.6 b). */
  includePhaseAgents?: boolean;
  /** Override the resolved phase (tests / explicit project phase). */
  phaseId?: GrowthPhaseId;
}

const ROLE_CRITERION: Record<string, CriterionKey> = {
  cto: "code_git",
  cmo: "market",
  cfo: "revenue",
  chro: "team",
  cpo: "idea",
  cro: "customer_size",
  clo: "documents",
  ciso: "code_git",
  cdo: "documents",
  coo: "team_structure",
};

/** Criterion a growth-phase agent is asked to cover when it joins W2. */
export function inferCriterionForRole(role: string): CriterionKey {
  return ROLE_CRITERION[role] ?? "idea";
}

/**
 * Compose the three waves for a given context.
 *
 * Wave 3 is only returned when `evidenceCompleteness >= 0.5` — otherwise the
 * founder pays for a roadmap section built on air — EXCEPT for criteria the
 * current / next phase gate requires, which always run (§C.6 c). Every task
 * whose criterion is phase-required carries `budget: "large"`.
 */
export function selectAgentsForContext(
  ctx: IntakeContext,
  options: SelectAgentsOptions = {},
): Wave[] {
  const bucket = bucketForContext(ctx);
  const table = PHASE_CRITERIA[bucket];
  const phaseId = options.phaseId ?? phaseIdForContext(ctx);
  const required = requiredCriteriaFor(phaseId);
  const tag = (t: WaveTask): WaveTask => ({ ...t, budget: required.has(t.criterion) ? "large" : "standard" });

  // Deep-copy so callers can push into the arrays without mutating the table.
  const wave1: WaveTask[] = table.wave1.map(tag);
  const wave2: WaveTask[] = table.wave2.map(tag);
  const wave3: WaveTask[] = table.wave3.map(tag).filter((t) => ctx.evidenceCompleteness >= 0.5 || t.budget === "large");

  // Seed with the growth-phase lead/support agents so a founder in an
  // unusual phase mix still gets the phase-appropriate coverage.
  const includePhaseAgents = options.includePhaseAgents ?? true;
  if (includePhaseAgents) {
    const phase = GROWTH_PHASES.find((p) => p.id === phaseId) ?? GROWTH_PHASES.find((p) => p.order === ctx.growthPhase);
    if (phase) {
      const already = new Set(
        [...wave1, ...wave2, ...wave3].map((t) => `${t.agentRole}:${t.criterion}`),
      );
      const maybeAdd = (role: string) => {
        const asRole = role as AgentRole;
        const criterion = inferCriterionForRole(role);
        const key = `${asRole}:${criterion}`;
        if (already.has(key)) return;
        // W2 only carries analysis agents; CEO synthesises in SYNTH.
        if (asRole === "ceo") return;
        wave2.push(tag({ agentRole: asRole, criterion }));
        already.add(key);
      };
      maybeAdd(phase.leadAgent);
      phase.supportAgents.forEach(maybeAdd);
    }
  }

  return [wave1, wave2, wave3];
}

/** W4 always runs the 8 dimension owners, in chapter (weight) order (§C.6 a). */
export function selectDimensionOwners(): Array<{ dim: DimKey; agentRole: AgentRole; supporting: AgentRole[] }> {
  return DIM_ORDER.map((dim) => ({ dim, agentRole: DIMENSION_OWNERS[dim].primary, supporting: DIMENSION_OWNERS[dim].supporting }));
}

/**
 * Return the flat list of agents the selector will run. Convenience helper
 * for cost estimation (map each to a FEATURE_COSTS entry).
 */
export function agentsPlannedFor(ctx: IntakeContext, options: SelectAgentsOptions = {}): AgentRole[] {
  const waves = selectAgentsForContext(ctx, options);
  const roles: AgentRole[] = [];
  waves.forEach((wave) => wave.forEach((task) => roles.push(task.agentRole)));
  return roles;
}
