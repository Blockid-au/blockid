import type { FC } from "react";

type FAQItem = {
  q: string;
  a: string;
};

const FAQS: FAQItem[] = [
  {
    q: "What happens after the 7-day free trial?",
    // QA-3 (2026-09-12): trial + refund copy mirror Terms v2.1 clauses 3 /
    // 3A (/legal/terms#refunds) and FAQ_JSONLD in app/(marketing)/pricing.
    a: "Your plan auto-charges when the 7-day trial ends unless you cancel before the trial ends (Cohort plans for accelerators and programs have a 14-day trial). We send email reminders at T-3, T-1, and T-0 so you always know what's coming.",
  },
  {
    q: "Is a credit card required to start the trial?",
    a: "Yes — your card is saved securely via a Stripe Setup Intent (PCI-DSS Level 1). No charge is placed until Day 8, and you can cancel any time from Billing settings.",
  },
  {
    q: "Can I switch plans mid-trial?",
    a: "Yes. Upgrades and downgrades are available anytime from Billing settings. Any charges are prorated based on remaining days in the cycle.",
  },
  {
    q: "What's the refund policy?",
    a: "7-day money-back guarantee on your first monthly subscription payment, no questions asked — email support and we refund within 3 business days. Annual plans are refunded pro-rata if you cancel within 14 days. One-off A$3 reports and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund. Your Australian Consumer Law guarantees are never excluded. Full policy: /legal/terms#refunds.",
  },
  {
    q: 'What does "equity in lieu of cash" mean?',
    a: "Enterprise-tier customers may negotiate paying part of their subscription (typically 5–10%) via equity through a separate off-platform legal agreement. All equity arrangements are subject to counsel review — Request a Call to discuss terms.",
  },
  {
    q: "Do digital shares issued via BlockID count as real securities?",
    a: "No. Digital shares on BlockID are cap-table records mirrored to a blockchain for tamper-evidence and audit trail. Your ASIC register remains the source of truth. Any securities-adjacent workflow is flagged for legal review before execution.",
  },
  {
    q: "How do you handle GST?",
    a: "Every price on this page is GST-inclusive — the amount you see is the amount you pay, with the 10% GST component already inside it. Auschain PTY LTD (ABN 79 659 615 111) is GST-registered, so Stripe splits the GST line automatically and emails you an ATO-compliant tax invoice for every charge.",
  },
  {
    // G12 (2026-09-10, T0268): describes the Founder / Evaluator switch that
    // sits above the plans on /pricing — not the retired four persona tabs.
    q: "Founder or Evaluator — which plans do I see?",
    a: "Use the Founder / Evaluator switch above the plans. Founder shows Free, Starter A$29 and Growth A$69. Evaluator shows Scout A$79, Firm A$149 and Program A$349 for investors, advisors, accelerators and programs — each with a 7-day free trial, card required, cancel anytime (Cohort plans: 14-day trial). Without a subscription, every full Trust BizReport is A$3 per startup. Need more than Program (5+ seats, multi-cohort, SSO)? Contact sales.",
  },
  {
    // G11 (2026-09-10, T0249): Money Finder ladder. Keep in sync with
    // FAQ_JSONLD in app/(marketing)/pricing/page.tsx.
    q: "What is the Grant & Program Finder (Money Finder)?",
    a: "A ranked scan of Australian grants, programs and events your startup qualifies for. Free = the preview (how many you match, top 3 named) and the open-grants directory · A$3 = the full Money Finder report per startup — ranked matches, eligibility checklist, 12-month timeline, PDF · Starter A$29 = Founder Radar deadline alerts and monthly re-match, with full reports included · Growth A$69 = the same, with 45 credits a month for application drafts. A grants consultant charges A$500–2,000 for this scan.",
  },
];

export const FAQV2: FC = () => {
  return (
    <section id="faq" className="w-full py-24 px-6 md:px-10 bg-surface-sunken">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-action mb-3">
            Frequently Asked
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-primary">
            Questions we hear from founders and investors
          </h2>
          <p className="mt-4 text-secondary max-w-2xl mx-auto">
            Everything you need to know about trials, billing, equity, and compliance.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {FAQS.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-line-subtle bg-surface-raised p-6 shadow-sm transition-colors open:border-action/40"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-action">
                <h3 className="text-base md:text-lg font-medium text-primary pr-2">
                  {item.q}
                </h3>
                <span
                  aria-hidden
                  className="mt-1 flex-shrink-0 h-6 w-6 rounded-full border border-action/40 text-action flex items-center justify-center text-sm transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-4 text-sm md:text-base text-secondary leading-relaxed">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-tertiary max-w-2xl mx-auto">
          Information provided on this page is general in nature and does not
          constitute financial, legal, or tax advice. Consult a licensed
          professional before making decisions about securities, equity, or tax
          treatment. BlockID.au is operated by Auschain PTY LTD (ACN 659 615 111).
        </p>
      </div>
    </section>
  );
};

export default FAQV2;
