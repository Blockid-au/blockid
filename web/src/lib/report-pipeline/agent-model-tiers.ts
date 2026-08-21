/**
 * Per-agent model tiering for the multi-agent report pipeline.
 *
 * Rationale (from the SVI investor-portal audit):
 *   - Deep valuation, thesis/anti-thesis synthesis, C-level cross-agent
 *     reconciliation are decision-critical → opus-5. Underspending here is
 *     the largest single quality lever in the platform.
 *   - CFO / CMO / competitive analysis need real reasoning but not the top
 *     tier → sonnet-5.
 *   - Data-quality classification, cohort percentile scoring, maturity
 *     detection are mechanical → haiku-4.5 (cheaper + faster at ~parity).
 *
 * The dispatcher calls `modelForAgent(role)` in place of the previous
 * `"free-chain"` default. Env override `MODEL_AGENT_<ROLE>` lets ops A/B
 * without a redeploy (e.g. `MODEL_AGENT_CFO=claude-opus-5`).
 */

import type { AgentRole } from "@/lib/report-pipeline/types";

// The 5-family default IDs. Callers should never hardcode these strings —
// go through modelForAgent() so a future model bump only touches this file.
export const MODEL_OPUS_5 = "claude-opus-5";
export const MODEL_SONNET_5 = "claude-sonnet-5";
export const MODEL_HAIKU_45 = "claude-haiku-4-5-20251001";
export const MODEL_FABLE_5 = "claude-fable-5";

const DEFAULT_TIER: Record<AgentRole, string> = {
  ceo: MODEL_OPUS_5,      // synthesis + IC-grade narrative
  cto: MODEL_SONNET_5,    // tech assessment + architecture
  cfo: MODEL_OPUS_5,      // valuation triangulation, unit economics — decision-critical
  cpo: MODEL_SONNET_5,    // product roadmap + prioritisation
  cmo: MODEL_SONNET_5,    // market research + competitor analysis
  cro: MODEL_SONNET_5,    // funding readiness + conversion analysis
  clo: MODEL_SONNET_5,    // legal / compliance risk (regulatory reasoning)
  chro: MODEL_HAIKU_45,   // team scoring + org checklist (mechanical)
  ciso: MODEL_HAIKU_45,   // security posture checklist (mechanical)
  cdo: MODEL_HAIKU_45,    // data quality gates + cohort percentile (mechanical)
  coo: MODEL_HAIKU_45,    // ops metrics + release management (mechanical)
};

/**
 * Resolve the model for a given agent role. Env override wins so an
 * operator can pin any role to any model without redeploying.
 */
export function modelForAgent(role: AgentRole): string {
  const envKey = `MODEL_AGENT_${role.toUpperCase()}`;
  const override = process.env[envKey];
  if (override && override.length > 0) return override;
  return DEFAULT_TIER[role];
}

/**
 * Report the currently-effective assignment for /status pages and admin
 * dashboards.
 */
export function currentAgentModelAssignment(): Record<AgentRole, string> {
  return {
    ceo: modelForAgent("ceo"),
    cto: modelForAgent("cto"),
    cfo: modelForAgent("cfo"),
    cpo: modelForAgent("cpo"),
    cmo: modelForAgent("cmo"),
    cro: modelForAgent("cro"),
    clo: modelForAgent("clo"),
    chro: modelForAgent("chro"),
    ciso: modelForAgent("ciso"),
    cdo: modelForAgent("cdo"),
    coo: modelForAgent("coo"),
  };
}
