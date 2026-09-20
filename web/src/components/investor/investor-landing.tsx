// Evaluator landing — G13-W4-IA4 (spec §C.1): ONE server component for
// /workspace/investor (angel + VC), /workspace/advisor and
// /workspace/accelerator, four blocks in a 12-col grid:
//
//   1 Startups I'm evaluating · Clients · Cohort
//   2 Deal flow matching my mandate · Client movers · Applications to review
//   3 Reports quota / trial (+ LP report status for accelerators)
//   4 Set your mandate · Coverage · Program criteria — only while < 3
//     sections are set; on the investor variant an EMPTY mandate takes
//     block 2's slot instead (never a blank card, R11).
//
// Every block renders something useful with zero data (its §C.1 empty
// state) and has ONE CTA that fires `landing_block_click` with the persona.
// `landing_viewed` fires once per mount with the blocks rendered and the
// ones that are empty (the founder tracker, reused — it is persona-aware).

import { LandingViewedTracker, type LandingContext } from "@/components/dashboard/landing/landing-tracker";
import { PERSONAS } from "@/lib/nav/persona";
import { blockOrderFor, type InvestorLandingBlock, type InvestorLandingData } from "@/lib/investors/landing-data";
import type { InvestorLandingContext } from "./landing-cta";
import { EvaluatingBlock } from "./landing/evaluating-block";
import { DealflowBlock } from "./landing/dealflow-block";
import { QuotaBlock, quotaLine } from "./landing/quota-block";
import { MandateBlock } from "./landing/mandate-block";

export interface InvestorLandingProps {
  data: InvestorLandingData;
  user: { displayName?: string | null; email: string; plan?: string | null };
  /** Fixed clock for tests (trial days left). */
  now?: Date;
  /** G21 P2-C: "h2" when the page above already owns the h1 (the BlockID Cohort journey on /workspace/accelerator). */
  headingLevel?: "h1" | "h2";
}

const HERO: Record<InvestorLandingData["variant"], string> = {
  investor: "Your deal desk",
  advisor: "Your client desk",
  accelerator: "Your program desk",
};

/** Pure: which blocks render empty this render (pinned by the test). */
export function emptyBlocksFor(data: InvestorLandingData, now: Date = new Date()): InvestorLandingBlock[] {
  const out: InvestorLandingBlock[] = [];
  if (data.evaluating.count === 0) out.push("evaluating");
  if (data.variant === "investor" ? data.dealflow.rows.length === 0 : data.variant === "advisor" ? data.evaluating.movers.length === 0 : data.evaluating.unscored.length === 0) out.push("dealflow");
  if (quotaLine(data.quota.quota, now).empty) out.push("quota");
  if (data.mandate.empty) out.push("mandate");
  const order = blockOrderFor(data.variant, data.mandate);
  return out.filter((b) => order.includes(b));
}

export function InvestorLanding({ data, user, now, headingLevel = "h1" }: InvestorLandingProps) {
  const Heading = headingLevel;
  const persona = PERSONAS[data.persona];
  const order = blockOrderFor(data.variant, data.mandate);
  const ctx: InvestorLandingContext = { persona: data.persona, plan: user.plan ?? "free" };
  const viewedCtx: LandingContext = { phase: "evaluator", plan: ctx.plan, persona: data.persona };
  const emptyBlocks = emptyBlocksFor(data, now);
  const name = user.displayName?.trim() || user.email.split("@")[0];
  const slotOf = (b: InvestorLandingBlock) => (order.indexOf(b) + 1) as 1 | 2 | 3 | 4;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 pb-24 pt-6" data-investor-landing data-landing-persona={data.persona} data-landing-variant={data.variant}>
      <LandingViewedTracker ctx={viewedCtx} blocks={order} emptyBlocks={emptyBlocks} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-tertiary">{persona.label}</p>
          <Heading className="text-2xl font-semibold text-primary">
            {HERO[data.variant]}, {name}
          </Heading>
        </div>
      </header>

      <section data-landing-grid className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-label="Your desk at a glance">
        {order.map((block) => {
          switch (block) {
            case "evaluating":
              return <EvaluatingBlock key={block} ctx={ctx} variant={data.variant} data={data.evaluating} slot={slotOf(block)} />;
            case "dealflow":
              return <DealflowBlock key={block} ctx={ctx} variant={data.variant} dealflow={data.dealflow} evaluating={data.evaluating} slot={slotOf(block)} />;
            case "quota":
              return <QuotaBlock key={block} ctx={ctx} variant={data.variant} data={data.quota} now={now} slot={slotOf(block)} />;
            case "mandate":
              return <MandateBlock key={block} ctx={ctx} variant={data.variant} data={data.mandate} slot={slotOf(block)} />;
            default:
              return null;
          }
        })}
      </section>
    </div>
  );
}
