/**
 * Verification-level engine — Phase 2 Batch F sub-F3.
 *
 * Master Upgrade Plan §11.1 verification ladder. Pure function — no I/O,
 * no side effects. Given a bag of boolean signals it returns the highest
 * ladder rung whose predicate the inputs currently satisfy.
 *
 * The ladder is strictly monotonic: each rung requires ALL of the previous
 * rung's predicates plus one new signal. That means a single input flipping
 * false (e.g. an Active ABN going Cancelled, or an audit expiring) demotes
 * the profile to the highest still-satisfied tier — never a partial credit
 * higher up the ladder.
 *
 *   L0 = no business id yet
 *   L1 = hasBusinessId + emailVerified                        (self-declared)
 *   L2 = L1 + abrConfirmed + abrStatus='Active' + domainVerified   (evidence-checked)
 *   L3 = L2 + financialsAttested                              (trust)
 *   L4 = L3 + independentlyAudited                            (trust-with-attestations)
 *   L5 = L4 + continuouslyMonitored                           (continuous-monitoring)
 *
 * Contract: this module never returns a level whose predicates fail. Any
 * regression (Cancelled ABN, expired attestation, revoked audit) drops the
 * level to the highest still-satisfied tier — the caller is responsible for
 * persisting the change and firing whatever downstream demotion notifications
 * the audit trail requires.
 */

export type VerificationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface VerificationInputs {
  hasBusinessId: boolean;
  abrConfirmed: boolean;
  abrStatus: "Active" | "Cancelled" | null;
  domainVerified: boolean;
  emailVerified: boolean;
  financialsAttested: boolean;
  independentlyAudited: boolean;
  continuouslyMonitored: boolean;
}

/**
 * Compute the highest ladder rung whose predicate the inputs satisfy.
 *
 * Encoded as a stepwise walk so a regression in a lower-rung signal
 * automatically caps the returned level — never returns L4 when the L2
 * predicate has since failed (e.g. abrStatus flipped to Cancelled).
 */
export function computeVerificationLevel(
  inputs: VerificationInputs,
): VerificationLevel {
  if (!inputs.hasBusinessId) return 0;

  const l1 = inputs.emailVerified;
  if (!l1) return 0;

  const l2 =
    l1 &&
    inputs.abrConfirmed &&
    inputs.abrStatus === "Active" &&
    inputs.domainVerified;
  if (!l2) return 1;

  const l3 = l2 && inputs.financialsAttested;
  if (!l3) return 2;

  const l4 = l3 && inputs.independentlyAudited;
  if (!l4) return 3;

  const l5 = l4 && inputs.continuouslyMonitored;
  if (!l5) return 4;

  return 5;
}
