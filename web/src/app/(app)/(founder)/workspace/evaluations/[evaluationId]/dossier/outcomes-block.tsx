// Investor Dossier — block 7 · Outcomes & trajectory (G21 P3-A).
//
// Server component: the longitudinal trajectory (Day 0 / 60 / 180 — SVI,
// Evidence Confidence, evidence level, confirmed outcomes) for this
// startup, and the outcome ledger projected by the evaluation's consent
// tier (lib/outcomes/service projectOutcomesByTier — the same tiers as the
// claims route). The assessor may RECORD an outcome (source "evaluator",
// lands as proposed; the founder or BlockID confirms); nobody resolves from
// here. The founder preview sees the read-only ledger. Reads are fail-soft:
// a missing 0427 table renders as "ledger unavailable" under a trajectory
// that still reflects every snapshot.

import { TrajectoryTimeline } from "@/components/svi/TrajectoryTimeline";
import { TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import { listProjectOutcomes, projectOutcomesByTier } from "@/lib/outcomes/service";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadTrajectory } from "@/lib/svi/trajectory-load";
import { OutcomesClient, type OutcomeItem } from "@/app/(app)/(founder)/workspace/evidence/outcomes/outcomes-client";
import { DossierBlock } from "./block";

export interface OutcomesBlockProps {
  projectId: string;
  role: "assessor" | "founder";
  consentTier: MentorAccessTier;
  verificationLevel: number | null;
}

export async function OutcomesBlock({ projectId, role, consentTier, verificationLevel }: OutcomesBlockProps) {
  const sb = getSupabaseAdmin();
  // Review P1: the chart honours the same consent tier as the ledger list.
  const withholdOutcomeValues = role === "assessor" && TIER_RANK[consentTier] < TIER_RANK.reports_shared;
  const trajectory = await loadTrajectory(sb, projectId, { verificationLevel: verificationLevel === null ? null : `L${verificationLevel}`, withholdOutcomeValues });
  let outcomes: OutcomeItem[] = [];
  let unavailable = false;
  if (sb) {
    try {
      outcomes = projectOutcomesByTier(await listProjectOutcomes(sb, projectId), role === "assessor" ? consentTier : null);
    } catch {
      unavailable = true;
    }
  } else {
    unavailable = true;
  }
  return (
    <DossierBlock n={7} title="Outcomes & trajectory" testId="dossier-block-7">
      <p className="text-xs text-ink-500">
        What happened after assessment, dated and sourced, confirmed by a person. Every snapshot is scored on the same methodology, so the trajectory shows movement in the evidence — not a rule change.
        {role === "assessor" ? ` Shown at the ${consentTier.replace(/_/g, " ")} consent tier.` : ""}
      </p>
      <div className="mt-3 space-y-6">
        <TrajectoryTimeline data={trajectory} variant="compact" headingLevel={3} title="Trajectory for this startup" />
        {unavailable ? (
          <p className="rounded-xl border border-dashed border-line-subtle bg-surface-sunken p-4 text-sm text-secondary" data-testid="dossier-outcomes-unavailable">
            The outcome ledger is briefly unavailable — the trajectory above still reflects every snapshot.
          </p>
        ) : (
          <OutcomesClient projectId={projectId} initial={outcomes} canRecord={role === "assessor"} canResolve={false} recordAs="evaluator" headingLevel={3} />
        )}
      </div>
    </DossierBlock>
  );
}
