// Agent plan — data-only mapping from canonical journey stage
// to the C-Level agents that should run for that context, with their
// model tier badge for the /analyze UI.
//
// This is the FRONTEND surface (`<AgentLineup />`, `<AnalyzeCostModal />`).
// The server-side authority is `web/src/lib/report-pipeline/agent-selector.ts`;
// keep this mirror aligned when the selection rules change.
//
// The mapping follows the plan (Block 2) — earlier stages skip the
// deep valuation / security / data-governance agents:
//   - idea            → CPO + CMO + CFO-lite (light valuation)
//   - validation      → +CTO (product feasibility) [same as MVP entry]
//   - mvp_early_rev.  → +CTO + CRO (conversion / activation)
//   - seed            → +CFO full valuation + CLO (fundraise readiness)
//   - series_a        → full CFO + CDO (data-governance)
//   - series_b_c      → +CISO + CHRO (org scale, security posture)
//   - late_stage      → +COO (release management)
//   - public_exit     → full lineup

import type { AgentRole } from "@/lib/report-pipeline/types";
import {
  MODEL_HAIKU_45,
  MODEL_OPUS_5,
  MODEL_SONNET_5,
} from "@/lib/report-pipeline/agent-model-tiers";
import { CANONICAL_STAGES, type StageKey } from "@/lib/journey-vocabulary";

/** Model tier badge shown on the agent pill. */
export type ModelTier = "opus" | "sonnet" | "haiku";

export interface PlannedAgent {
  agent: AgentRole;
  tier: ModelTier;
}

/** Human-readable label for a model tier badge. */
// Customer-facing label for the tier. This renders in the agent lineup and in
// the cost modal a founder sees before being charged, so it describes the
// DEPTH they are paying for — not which vendor model runs underneath. Naming
// "Opus 5" there leaked our implementation into a purchase screen and told the
// customer nothing they could act on. The internal id stays in MODEL_TIER_ID
// for tooltips, logs, and debugging.
export const MODEL_TIER_LABEL: Record<ModelTier, string> = {
  opus: "In depth",
  sonnet: "Standard",
  haiku: "Quick",
};

/** Underlying canonical model id for the tier — useful for tooltips. */
export const MODEL_TIER_ID: Record<ModelTier, string> = {
  opus: MODEL_OPUS_5,
  sonnet: MODEL_SONNET_5,
  haiku: MODEL_HAIKU_45,
};

/**
 * Stage → planned agent list. First entry runs first (usually the lead
 * agent for that phase). Order is meaningful only for display; the server
 * picks its own dispatch order.
 *
 * INVARIANTS enforced by `agent-plan.test.ts`:
 *   - Every StageKey has at least 3 planned agents.
 *   - `ceo` is present in every stage (synthesis is always needed).
 *   - Idea-stage EXCLUDES `ciso` and `cdo` (nothing to secure yet).
 *   - Scale-and-later stages (`series_b_c`, `late_stage`, `public_exit`)
 *     INCLUDE `ciso` (security posture is now table-stakes).
 */
export const AGENT_PLAN: Record<StageKey, PlannedAgent[]> = {
  idea: [
    { agent: "cpo", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cfo", tier: "haiku" }, // lite — no deep valuation yet
    { agent: "ceo", tier: "opus" },
  ],
  validation: [
    { agent: "cpo", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "cfo", tier: "haiku" },
    { agent: "ceo", tier: "opus" },
  ],
  mvp_early_revenue: [
    { agent: "cpo", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "cro", tier: "sonnet" },
    { agent: "cfo", tier: "sonnet" },
    { agent: "ceo", tier: "opus" },
  ],
  seed: [
    { agent: "cfo", tier: "opus" }, // full valuation
    { agent: "cro", tier: "sonnet" },
    { agent: "cpo", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "clo", tier: "sonnet" },
    { agent: "cdo", tier: "haiku" },
    { agent: "ceo", tier: "opus" },
  ],
  series_a: [
    { agent: "cfo", tier: "opus" },
    { agent: "cro", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "cpo", tier: "sonnet" },
    { agent: "clo", tier: "sonnet" },
    { agent: "cdo", tier: "haiku" },
    { agent: "chro", tier: "haiku" },
    { agent: "ceo", tier: "opus" },
  ],
  series_b_c: [
    { agent: "cfo", tier: "opus" },
    { agent: "cro", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "cpo", tier: "sonnet" },
    { agent: "clo", tier: "sonnet" },
    { agent: "ciso", tier: "haiku" },
    { agent: "cdo", tier: "haiku" },
    { agent: "chro", tier: "haiku" },
    { agent: "ceo", tier: "opus" },
  ],
  late_stage: [
    { agent: "cfo", tier: "opus" },
    { agent: "cro", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "cpo", tier: "sonnet" },
    { agent: "clo", tier: "sonnet" },
    { agent: "ciso", tier: "haiku" },
    { agent: "cdo", tier: "haiku" },
    { agent: "chro", tier: "haiku" },
    { agent: "coo", tier: "haiku" },
    { agent: "ceo", tier: "opus" },
  ],
  public_exit: [
    { agent: "cfo", tier: "opus" },
    { agent: "cro", tier: "sonnet" },
    { agent: "cmo", tier: "sonnet" },
    { agent: "cto", tier: "sonnet" },
    { agent: "cpo", tier: "sonnet" },
    { agent: "clo", tier: "sonnet" },
    { agent: "ciso", tier: "haiku" },
    { agent: "cdo", tier: "haiku" },
    { agent: "chro", tier: "haiku" },
    { agent: "coo", tier: "haiku" },
    { agent: "ceo", tier: "opus" },
  ],
};

/** Read the planned agents for one stage. Returns a defensive copy. */
export function plannedAgentsFor(stage: StageKey): PlannedAgent[] {
  const entry = AGENT_PLAN[stage] ?? AGENT_PLAN.idea;
  return entry.map((p) => ({ ...p }));
}

/**
 * Every distinct agent role that appears anywhere in the plan.
 * Useful for admin dashboards / smoke tests.
 */
export function allPlannedAgentRoles(): AgentRole[] {
  const set = new Set<AgentRole>();
  for (const stage of CANONICAL_STAGES) {
    for (const p of AGENT_PLAN[stage]) set.add(p.agent);
  }
  return Array.from(set).sort();
}
