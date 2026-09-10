import type { FC } from "react";

type FAQItem = {
  q: string;
  a: string;
};

const FAQS: FAQItem[] = [
  {
    q: "What happens after the 7-day free trial?",
    a: "Your plan auto-charges on Day 8 unless you cancel at least 24 hours before the trial ends. We send email reminders at T-3, T-1, and T-0 so you always know what's coming.",
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
    a: "We offer a 7-day money-back guarantee on your first paid month, no questions asked. Contact support and we'll process the refund within 3 business days.",
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
    a: "Use the Founder / Evaluator switch above the plans. Founder shows Free, Starter A$29 and Growth A$69. Evaluator shows Scout A$79, Firm A$149 and Program A$349 for investors, advisors, accelerators and programs — each with a 7-day free trial, card required, cancel anytime. Without a subscription, every full Trust BizReport is A$3 per startup. Need more than Program (5+ seats, multi-cohort, SSO)? Contact sales.",
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
