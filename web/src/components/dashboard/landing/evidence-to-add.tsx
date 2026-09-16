// Block 4 · Evidence to add — G13-W3-IA3 (spec §B.1 row 4, §B.4 row 4).
//
// Top 3 evidence gaps ordered by SVI impact (`lib/dashboard/evidence-gaps.ts`
// = svi-evidence completeness model + the NextUnlockCard blocker logic).
// Each row = gap · dimension · "+N pts"; a phase-blocked dimension is
// flagged. One CTA: "Add evidence" → /workspace/evidence/gaps.
//
// Empty state (nothing connected or uploaded yet): "Connect one source
// (Stripe, GA4, GitHub, Xero, LinkedIn) or upload a document — evidence
// lifts your score fastest." → Connect → /workspace/evidence/connectors.
//
// Member view: read-only (the CTA opens the gaps page read-only).

import { FileCheck2 } from "lucide-react";
import type { EvidenceGapResult } from "@/lib/dashboard/evidence-gaps";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";

export interface EvidenceToAddProps {
  ctx: LandingContext;
  result: EvidenceGapResult;
  canEdit?: boolean;
}

export const EVIDENCE_EMPTY = "Connect one source (Stripe, GA4, GitHub, Xero, LinkedIn) or upload a document — evidence lifts your score fastest.";

export function EvidenceToAdd({ ctx, result, canEdit = true }: EvidenceToAddProps) {
  const empty = result.presentCount === 0;
  const gate = result.phaseGate;
  const gateLine = gate
    ? gate.completionPct >= 100
      ? `All exit conditions for ${GROWTH_PHASE_LABELS[gate.currentPhase].en} met — ready to advance.`
      : `${Math.round(gate.completionPct)}% of ${GROWTH_PHASE_LABELS[gate.currentPhase].en} exit conditions met`
    : null;

  return (
    <LandingBlock
      name="evidence-to-add"
      order={4}
      title="Evidence to add"
      icon={FileCheck2}
      span="third"
      empty={empty}
      aside={gate ? <span data-landing-gate className="text-[11px] font-semibold tabular-nums text-secondary">{Math.round(gate.completionPct)}%</span> : null}
      cta={
        empty ? (
          <LandingCta block="evidence-to-add" href="/workspace/evidence/connectors" ctx={ctx} action="connect" testId="landing-evidence-cta">
            Connect
          </LandingCta>
        ) : (
          <LandingCta block="evidence-to-add" href="/workspace/evidence/gaps" ctx={ctx} action="add_evidence" variant={canEdit ? "primary" : "secondary"} testId="landing-evidence-cta">
            {canEdit ? "Add evidence" : "View gaps"}
          </LandingCta>
        )
      }
    >
      {empty ? <p className="text-sm leading-relaxed text-secondary">{EVIDENCE_EMPTY}</p> : null}
      {result.gaps.length > 0 ? (
        <ol className={empty ? "mt-3 space-y-2" : "space-y-2"} data-landing-gaps>
          {result.gaps.map((g) => (
            <li key={g.code} className="flex items-start justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2" data-gap-dimension={g.dimension}>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-primary">{g.label}</p>
                <p className="text-[10px] text-tertiary">
                  {g.dimensionLabel}
                  {g.blocked ? <span className="ml-1 rounded bg-bear/10 px-1 font-semibold text-bear">blocks phase exit</span> : null}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-bull">+{g.pts} pts</span>
            </li>
          ))}
        </ol>
      ) : null}
      {gateLine ? <p className="mt-3 text-[11px] text-tertiary">{gateLine}</p> : null}
    </LandingBlock>
  );
}
