/**
 * /pilot — "Free cohort scoring for one intake" (G16-C, F-3: public +
 * indexable).
 *
 * Offer v2 terms, the four things we ask in return, what is not included,
 * the 7 success criteria (t2-accelerator-pilots.md § 3), the data sentence
 * verbatim and the application form (→ POST /api/pilot/apply). Every figure
 * comes from lib/pilots/offer.ts, which reads plans-v2 / credits — no price
 * literals on this page.
 *
 * G17 P2-A: rendered on the unicorn template (PageHero → Section × 4 →
 * CtaBand). Test contract kept verbatim: `pilot-terms`, `pilot-in-return`,
 * `pilot-not-included`, `pilot-criteria` (7 rows, `data-criterion`),
 * `pilot-data-principle`, `pilot-apply-form`, `#apply` (tests/live-qa/30-pilot,
 * ./page.test.tsx).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/page-meta";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero, Section } from "@/components/marketing/template";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import {
  DATA_PRINCIPLE_SENTENCE,
  DEFAULT_PILOT_DAYS,
  PILOT_CAP,
  PILOT_IN_RETURN,
  PILOT_LOI_PASS_MARK,
  PILOT_MAX_APPLICANTS,
  PILOT_NOT_INCLUDED,
  PILOT_SUCCESS_CRITERIA,
  pilotOfferTerms,
} from "@/lib/pilots/offer";
import { PilotApplyForm } from "./pilot-apply-form";

const PILOT_PATH = "/pilot";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Evaluator pilot — free cohort scoring for one intake",
    description: `Accelerators and programs: score one intake (up to ${PILOT_MAX_APPLICANTS} applicants) on the Startup Value Index for ${DEFAULT_PILOT_DAYS} days, free. Cohort table, LP sample, dossiers. ${PILOT_CAP} pilots only.`,
    path: PILOT_PATH,
  });
}

export default function PilotPage() {
  const terms = pilotOfferTerms();
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Evaluator pilot · offer v2"
        title="Free cohort scoring for one intake"
        sub={`Run one live intake — up to ${PILOT_MAX_APPLICANTS} applicants — through the 8-dimension SVI rubric for ${DEFAULT_PILOT_DAYS} days. Your committee ranks first; then you see ours. ${PILOT_CAP} pilots, then list price.`}
        ctas={[
          { href: "#apply", label: "Apply for a pilot", ctaId: "pilot_hero_apply" },
          { href: "/solutions/accelerator", label: "How programs use BlockID" },
        ]}
        align="start"
      />

      <Section id="offer" eyebrow="The offer" title="What you get, for how long, at what price" tone="sunken">
        <dl className="grid gap-4 sm:grid-cols-2" data-testid="pilot-terms">
          {terms.map((t) => (
            <div key={t.term} className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t.term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-primary">{t.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1">
            <h3 className="font-display text-lg font-semibold text-primary">In return — all four</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-primary" data-testid="pilot-in-return">
              {PILOT_IN_RETURN.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
          <div className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1">
            <h3 className="font-display text-lg font-semibold text-primary">Not included</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-primary" data-testid="pilot-not-included">
              {PILOT_NOT_INCLUDED.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        id="criteria"
        eyebrow="Day 0 → day 14"
        title={`Seven success criteria — the LOI triggers at ${PILOT_LOI_PASS_MARK} of 7`}
        lede="Agreed on the first call, scored on day 14. A failing signal is a product finding we log, not a reason to discount."
      >
        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface shadow-1">
          <table className="w-full text-left text-sm" data-testid="pilot-criteria">
            <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-tertiary">
              <tr>
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Criterion</th>
                <th scope="col" className="px-4 py-3">Pass mark</th>
                <th scope="col" className="px-4 py-3">Measured by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {PILOT_SUCCESS_CRITERIA.map((c) => (
                <tr key={c.n} data-criterion={c.n}>
                  <td className="px-4 py-3 font-mono text-xs text-tertiary">{c.n}</td>
                  <td className="px-4 py-3 font-medium text-primary">{c.criterion}</td>
                  <td className="px-4 py-3 text-primary">{c.passMark}</td>
                  <td className="px-4 py-3 text-tertiary">{c.measuredBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="data" eyebrow="Data" title="Whose data is it?" tone="sunken">
        <p className="max-w-3xl text-base leading-relaxed text-primary" data-testid="pilot-data-principle">{DATA_PRINCIPLE_SENTENCE}</p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-tertiary">
          Your program tells applicants that BlockID is used in screening. Nothing about one startup is shown to another. Founders receive a claim link for their own score and nothing else. Method and evidence ladder: <Link href="/methodology" className="underline">/methodology</Link>. Policy: <Link href="/legal/privacy" className="underline">/legal/privacy</Link>.
        </p>
      </Section>

      <Section
        id="apply"
        eyebrow="Apply"
        title="Tell us about the intake"
        lede="Six fields. We reply within two business days with a day-0 call proposal; the intake link and the Program-tier workspace are switched on by an admin grant when the pilot starts."
      >
        <div className="relative rounded-xl border border-line-subtle bg-surface p-6 shadow-1 sm:p-8">
          <PilotApplyForm />
        </div>
        <div className="mt-8">
          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
      </Section>

      <CtaBand
        title="Not running an intake this quarter?"
        sub="Score one deal on the same rubric, or read how programs use the cohort table."
        primary={{ href: "/analyze", label: "Score a startup", ctaId: "pilot_final_score" }}
        secondary={{ href: "/solutions/accelerator", label: "For accelerators" }}
      />
    </MarketingShell>
  );
}
