/**
 * /pilot — the paid BlockID Cohort Validation Pilot landing (G21 P0-C,
 * F-3: public + indexable). The commercial wedge: one real intake or an
 * existing cohort, assessed end to end, priced before you pay.
 *
 * Same offer block as /solutions/accelerator#pilot (<PilotOffer />: two
 * cards from PILOT_SKUS, the inclusions, the success metrics measured
 * together, Cohort 25 / 100 after), plus "what happens next" and the data
 * sentence verbatim. No price literal — every amount is `formatPilotPrice()`
 * or a `fillPrices()` token. The comped evaluator pilot (G16-C) lives at
 * /pilot/investor (noindex, invitation-only).
 *
 * Test contract: one H1, `pilot-offer` + two `pilot-offer-card`,
 * `pilot-next-steps` (4 rows), `pilot-data-principle`, the buy buttons
 * `pilot-buy-<sku>` (contact links until the founder mints the prices).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ClipboardCheck, FileText, Users } from "lucide-react";
import { pageMetadata } from "@/lib/seo/page-meta";
import { getMessages } from "@/lib/i18n/t";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section, TrustBand } from "@/components/marketing/template";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { PilotOffer } from "@/components/marketing/PilotOffer";
import { PILOT_ENTITLEMENT_DAYS, PILOT_SKUS, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/offer";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { acceleratorPilotCopy } from "../solutions/evaluator-page-props";
import { pilotSkusConfigured } from "../solutions/pilot-configured";
import { fillPrices } from "../solutions/solutions-pricing";

const PILOT_PATH = "/pilot";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Cohort Validation Pilot for startup programs",
    description: `Run one real intake or an existing cohort through the Startup Value Index: evidence confidence, cohort comparison, evaluator table, final report. From ${formatPilotPrice("cohort_pilot_25")}.`,
    path: PILOT_PATH,
  });
}

const NEXT_STEPS = [
  {
    icon: CalendarCheck,
    title: "Day 0–2 · setup call",
    body: "Within two business days we set up your intake with you: the application link, deck upload, startup URL and founder consent on the form — or we import your existing cohort with you.",
  },
  {
    icon: ClipboardCheck,
    title: "Assessment as applicants arrive",
    body: "Every startup is assessed on the Startup Value Index with an evidence confidence level; your evaluator table fills with decision and conviction per startup.",
  },
  {
    icon: Users,
    title: "Cohort comparison + top gaps",
    body: "The sortable cohort table, the top gaps across the cohort and the private reviewer notes your committee works from.",
  },
  {
    icon: FileText,
    title: "Final report + feedback workshop",
    body: `The final cohort report for the program and its sponsors, then a feedback workshop with your review team. Your Cohort-tier workspace stays open for ${PILOT_ENTITLEMENT_DAYS} days.`,
  },
] as const;

// Re-rendered every 5 min so minting the pilot prices flips the buy buttons
// without a rebuild (review P1).
export const revalidate = 300;

export default async function PilotPage() {
  const m = await getMessages("en");
  const copy = acceleratorPilotCopy(m);
  const configured = pilotSkusConfigured();
  return (
    <MarketingShell>
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Cohort Validation Pilot", href: PILOT_PATH },
        ]}
      />
      <PageHero
        eyebrow="Paid pilot · programs"
        title="Validate BlockID on one real cohort before you commit to a year."
        sub={`One intake or your existing cohort — up to ${PILOT_SKUS.cohort_pilot_25.applicantsCap} or ${PILOT_SKUS.cohort_pilot_50.applicantsCap} applicants — assessed end to end on the Startup Value Index. Priced before you pay, inc. GST, ATO tax invoice.`}
        ctas={[
          { href: "#pilot", label: "See the two pilot sizes", ctaId: "pilot_hero_offer" },
          { href: "/solutions/accelerator", label: "How programs use BlockID" },
        ]}
        align="start"
        footnote={
          <>
            <span className="text-primary">BlockID structures the evidence and standardises the first-pass analysis.</span>{" "}
            <span>Humans make the decision.</span>
          </>
        }
      />

      <PilotOffer
        id="pilot"
        ctaPrefix="pilot_page"
        configured={configured}
        returnPath={`${PILOT_PATH}#pilot`}
        copy={{
          ...copy,
          afterLede: copy.afterLede ? fillPrices(copy.afterLede) : undefined,
          afterTiers: copy.afterTiers?.map((t) => ({ ...t, price: fillPrices(t.price), sub: fillPrices(t.sub) })),
        }}
      />

      <Section id="next" eyebrow="What happens next" title="From checkout to final report" lede="Four steps, agreed on the setup call. Nothing here is a roadmap — every step ships today.">
        <div data-testid="pilot-next-steps">
          <FeatureGrid columns={4} numbered ariaLabel="What happens next" items={NEXT_STEPS.map((s) => ({ icon: s.icon, title: s.title, body: s.body }))} />
        </div>
      </Section>

      <Section id="data" eyebrow="Data" title="Whose data is it?" tone="sunken">
        <p className="max-w-3xl text-base leading-relaxed text-primary" data-testid="pilot-data-principle">{DATA_PRINCIPLE_SENTENCE}</p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-tertiary">
          Your program tells applicants that BlockID is used in screening. Nothing about one startup is shown to another. Founders receive a claim link for their own score and nothing else. Method and evidence ladder: <Link href="/methodology" className="underline">/methodology</Link>. Policy: <Link href="/legal/privacy" className="underline">/legal/privacy</Link>. Questions: <a href={`mailto:${LEGAL_ENTITY.supportEmail}`} className="underline">{LEGAL_ENTITY.supportEmail}</a>.
        </p>
        <div className="mt-8">
          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
      </Section>

      {/* Who stands behind the pilot — entity, methodology version, controls (G21 P0-A). */}
      <TrustBand />

      <CtaBand
        title="Not running an intake this quarter?"
        sub="Score one startup on the same rubric, or read how programs use the cohort table."
        primary={{ href: "/analyze", label: "Score a startup", ctaId: "pilot_final_score" }}
        secondary={{ href: "/solutions/accelerator", label: "For programs" }}
      />
    </MarketingShell>
  );
}
