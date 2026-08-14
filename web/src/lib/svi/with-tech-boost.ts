// src/lib/svi/with-tech-boost.ts
//
// Applies the Tech Intelligence score as an additive SVI supplement.
// The TechScore is ADDITIVE to SVI, not replacing any dimension.
//
// Boost schedule (mirrors getValuationMultiplierBoost in tech-intelligence.ts):
//   • tech > 90  → 25% of techContribution
//   • tech > 75  → 20%
//   • tech > 60  → 12%
//   • tech > 40  →  5%
//   • tech ≤ 40  →  0% (below baseline — no boost, no penalty)

export function applyTechBoostToSvi(
  baseSviScore: number,
  techScore: number,
): number {
  const boost =
    techScore > 90 ? 0.25
    : techScore > 75 ? 0.20
    : techScore > 60 ? 0.12
    : techScore > 40 ? 0.05
    : 0;

  // Tech contributes up to 15% of total SVI (supplementary, not core)
  const techContribution = Math.round(techScore * 0.15);
  return Math.min(100, Math.round(baseSviScore + techContribution * boost));
}
