// Block 4 · "Set your mandate" — G13-W4-IA4 (spec §C.1 row 4).
//
// Mandate completeness (`sectionsFilled` / 7). Rendered only while the
// mandate is empty or fewer than 3 sections are set; on the investor
// variant an EMPTY mandate moves this block into block 2's slot. Advisor
// reads "Coverage", accelerator "Program criteria" — the same form at
// /workspace/investor/mandate scores deal flow / applications for all three.

import { SlidersHorizontal } from "lucide-react";
import { MANDATE_SECTIONS } from "@/lib/investors/mandates-shared";
import type { LandingVariant, MandateSummary } from "@/lib/investors/landing-data";
import { InvestorLandingCta, type InvestorLandingContext } from "../landing-cta";
import { InvestorBlock } from "./landing-block";

export const MANDATE_HREF = "/workspace/investor/mandate";
export const MANDATE_EMPTY: Record<LandingVariant, string> = {
  investor: "Tell us your sectors, stages, states and cheque size — every consenting startup is scored against your mandate nightly, and the best fits land on this page.",
  advisor: "Set your coverage — sectors, stages and states you advise on — so new founders who match are surfaced to you.",
  accelerator: "Set your program criteria — sectors, stages, states and a minimum SVI — so applications are ranked against them.",
};

const COPY: Record<LandingVariant, { title: string; cta: string; partial: string }> = {
  investor: { title: "Set your mandate", cta: "Set mandate", partial: "Add stages, a cheque band and a geography to sharpen deal flow." },
  advisor: { title: "Coverage", cta: "Set coverage", partial: "Add the stages and states you cover to complete your profile." },
  accelerator: { title: "Program criteria", cta: "Set criteria", partial: "Add stage, geography and a minimum SVI to rank applications." },
};

export function MandateBlock({ ctx, variant, data, slot = 4 }: { ctx: InvestorLandingContext; variant: LandingVariant; data: MandateSummary; slot?: 1 | 2 | 3 | 4 }) {
  const copy = COPY[variant];
  const total = MANDATE_SECTIONS.length;
  const pct = Math.round((data.sectionsFilled / total) * 100);
  return (
    <InvestorBlock
      name="mandate"
      slot={slot}
      title={copy.title}
      icon={SlidersHorizontal}
      span={slot === 2 ? "wide" : "third"}
      empty={data.empty}
      aside={!data.empty ? <span className="text-[11px] font-semibold text-secondary" data-landing-mandate-sections={data.sectionsFilled}>{data.sectionsFilled}/{total} sections</span> : undefined}
      cta={
        <InvestorLandingCta block="mandate" href={MANDATE_HREF} ctx={ctx} action={data.empty ? "set_mandate" : "complete_mandate"} testId="landing-mandate-cta">
          {data.empty ? copy.cta : "Complete it"}
        </InvestorLandingCta>
      }
    >
      {data.empty ? (
        <p className="text-sm leading-relaxed text-secondary">{data.migrated ? MANDATE_EMPTY[variant] : "Mandates are not enabled on this environment yet."}</p>
      ) : (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={data.sectionsFilled} aria-label="Mandate completeness">
            <div className="h-full rounded-full bg-action" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-secondary">{copy.partial}</p>
        </div>
      )}
    </InvestorBlock>
  );
}
