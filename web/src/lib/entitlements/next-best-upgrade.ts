// Pure selector that picks the single most-relevant paid feature to promote
// to a user right now. Consumed by <PhaseAwareUpgradeCard /> inside the
// "Recommended next step" overview tile.
//
// Ranking:
//   phase-match     (+100)  — feature.bestAtPhase === user.currentPhase
//   phase-adjacent  (+40)   — |feature.bestAtPhase - user.currentPhase| === 1
//   next-tier-only  (+10)   — feature.minTier == immediate next tier
// Ties are broken by cheapest `monthlyDeltaAud`, then alphabetically by slug
// so the output is deterministic for snapshot tests.
//
// Isomorphic (no I/O) so an RSC can call it directly without a client fetch.
// The visibility catalogue is inlined here — extend as new gated features
// ship. A future `tier-visibility.ts` will replace this literal.

import type { PlanTier } from "@/lib/segments";
import { PLAN_TIER_RANK } from "@/lib/segments";

export interface UpgradeCandidate {
  /** Machine slug — mirrors entries in feature-gates.manifest.ts. */
  feature: string;
  /** Minimum tier that grants this feature. */
  minTier: PlanTier;
  /** Growth phase (1..12) at which this feature is most useful. */
  bestAtPhase: number;
  /** Delta on the user's current monthly bill if they upgrade to `minTier`. */
  monthlyDeltaAud: number;
  /** Short "why this now" microcopy. */
  discoveryHint: string;
  /** CTA copy shown on the primary button. */
  upgradeCTA: string;
  /** Optional add-on drawer key (e.g. "share_management"). */
  addOnKey?: string;
}

export const UPGRADE_CATALOGUE: readonly UpgradeCandidate[] = Object.freeze([
  {
    feature: "svi.run",
    minTier: "starter",
    bestAtPhase: 2,
    monthlyDeltaAud: 29,
    discoveryHint: "Unlimited 13-criteria evaluations",
    upgradeCTA: "Upgrade to Starter",
  },
  {
    feature: "report.premium",
    minTier: "growth",
    bestAtPhase: 4,
    monthlyDeltaAud: 70,
    discoveryHint: "Investor-ready premium report with DOCX + PDF",
    upgradeCTA: "Upgrade to Growth",
  },
  {
    feature: "cap_table.write",
    minTier: "growth",
    bestAtPhase: 11,
    monthlyDeltaAud: 70,
    discoveryHint: "Manage share classes and ESOP pool",
    upgradeCTA: "Upgrade to Growth",
    addOnKey: "share_management",
  },
  {
    feature: "share_management",
    minTier: "growth",
    bestAtPhase: 10,
    monthlyDeltaAud: 70,
    discoveryHint: "Cap table, data room, vesting & tokenisation bundle",
    upgradeCTA: "Add Share Management",
    addOnKey: "share_management",
  },
  {
    feature: "data_room.access",
    minTier: "growth",
    bestAtPhase: 10,
    monthlyDeltaAud: 70,
    discoveryHint: "Open your data room to investors",
    upgradeCTA: "Upgrade to Growth",
  },
  {
    feature: "term_sheet.ai",
    minTier: "growth",
    bestAtPhase: 10,
    monthlyDeltaAud: 70,
    discoveryHint: "AI-drafted term sheets tuned for AU founders",
    upgradeCTA: "Upgrade to Growth",
  },
  {
    feature: "esop.manage",
    minTier: "scale",
    bestAtPhase: 8,
    monthlyDeltaAud: 200,
    discoveryHint: "Full ESOP administration + Div83A checks",
    upgradeCTA: "Add to plan",
    addOnKey: "share_management",
  },
  {
    feature: "blockchain.sync",
    minTier: "scale",
    bestAtPhase: 11,
    monthlyDeltaAud: 200,
    discoveryHint: "Mirror your cap table on-chain",
    upgradeCTA: "Upgrade to Scale",
  },
  {
    feature: "accelerator.cohort",
    minTier: "accel_starter",
    bestAtPhase: 5,
    monthlyDeltaAud: 149,
    discoveryHint: "Quarterly LP-ready cohort reporting",
    upgradeCTA: "Upgrade to Accelerator",
  },
  {
    feature: "sso",
    minTier: "enterprise",
    bestAtPhase: 12,
    monthlyDeltaAud: 500,
    discoveryHint: "SSO, SLA and multi-entity workspaces",
    upgradeCTA: "Talk to sales",
  },
]);

export interface NextBestUpgradeInput {
  currentTier: PlanTier;
  currentPhase: number;
  ownedFeatures: readonly string[];
  /** Optional slugs to skip (dismissed, already surfaced elsewhere). */
  excludeFeatures?: readonly string[];
}

export interface NextBestUpgrade {
  feature: string;
  rule: "phase-match" | "phase-adjacent" | "next-tier";
  reason: string;
  minTier: PlanTier;
  monthlyDeltaAud: number;
  discoveryHint: string;
  upgradeCTA: string;
  addOnKey?: string;
}

/**
 * Return the single best upgrade suggestion, or null if there is nothing
 * worth promoting (user already owns everything, or no candidate scores
 * above zero).
 */
export function nextBestUpgrade(
  input: NextBestUpgradeInput,
): NextBestUpgrade | null {
  const owned = new Set(input.ownedFeatures);
  const excluded = new Set(input.excludeFeatures ?? []);
  const currentRank = PLAN_TIER_RANK[input.currentTier] ?? 0;
  const phase = Math.max(0, Math.floor(input.currentPhase));

  type Scored = {
    cand: UpgradeCandidate;
    score: number;
    rule: NextBestUpgrade["rule"];
  };

  const scored: Scored[] = [];
  for (const cand of UPGRADE_CATALOGUE) {
    if (owned.has(cand.feature) || excluded.has(cand.feature)) continue;
    const candRank = PLAN_TIER_RANK[cand.minTier] ?? 0;
    if (candRank <= currentRank) continue;

    let score = 0;
    let rule: NextBestUpgrade["rule"] = "next-tier";
    if (cand.bestAtPhase === phase) {
      score += 100;
      rule = "phase-match";
    } else if (Math.abs(cand.bestAtPhase - phase) === 1) {
      score += 40;
      rule = "phase-adjacent";
    } else {
      score += 10;
    }

    scored.push({ cand, score, rule });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.cand.monthlyDeltaAud !== b.cand.monthlyDeltaAud) {
      return a.cand.monthlyDeltaAud - b.cand.monthlyDeltaAud;
    }
    return a.cand.feature.localeCompare(b.cand.feature);
  });

  const top = scored[0];
  const reason =
    top.rule === "phase-match"
      ? `Founders at Phase ${phase} unlock this first`
      : top.rule === "phase-adjacent"
        ? `Coming up next at Phase ${top.cand.bestAtPhase}`
        : `Included on ${top.cand.minTier}`;

  return {
    feature: top.cand.feature,
    rule: top.rule,
    reason,
    minTier: top.cand.minTier,
    monthlyDeltaAud: top.cand.monthlyDeltaAud,
    discoveryHint: top.cand.discoveryHint,
    upgradeCTA: top.cand.upgradeCTA,
    addOnKey: top.cand.addOnKey,
  };
}
