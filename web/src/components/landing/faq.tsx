import { Accordion, AccordionItem } from "@/components/ui/accordion";

const faqs = [
  {
    q: "Why not Carta?",
    a: "Carta is US-centric, has no ASIC, ESIC, R&D or AUSTRAC modules, charges roughly 3× the price, and ships no AI valuation, investor trust score, or AU SME comparable data. BlockID is built for the AU raise.",
  },
  {
    q: "Is this a cap table tool?",
    a: "BlockID goes beyond cap tables. It is ownership infrastructure \u2014 manage shares, track equity value, model dilution, and generate proof-backed investor-ready reports. Think of it as the trust layer between your startup and your investors.",
  },
  {
    q: "Why does BlockID use tamper-evident proof?",
    a: "We create an immutable audit trail for your score, reports and ownership records. It is optional, audit-only proof infrastructure. We never lead with blockchain, tokens or marketplaces.",
  },
  {
    q: "We use spreadsheets — we're fine.",
    a: "Five-minute import. We will bet you AUD $5,000 that the valuation that comes back is higher than the one you would have guessed. Founders systematically under-value themselves.",
  },
  {
    q: "Investors won't trust an AI valuation.",
    a: "They already trust DCF spreadsheets a 26-year-old wrote at midnight. We show five valuation methodologies, AU SME comparables, and an immutable audit log alongside the score.",
  },
  {
    q: "My data is sensitive.",
    a: "AU data residency, encrypted at rest, SOC2 Type II in progress, and blockchain-anchored access logs. You see who sees what, when, and for how long.",
  },
  {
    q: "Why now? We'll do it after we close.",
    a: "Founders who use the Investor-Ready Score in pitches lift their valuation 10–25%. Doing it after the raise is doing it after the value is already on the table.",
  },
];

export function FAQ() {
  return (
    <section
      aria-labelledby="faq-title"
      className="py-24 md:py-32 border-t border-surface-200 gradient-section"
    >
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
            FAQ
          </p>
          <h2
            id="faq-title"
            className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-brand-900"
          >
            Questions founders ask. Plain answers.
          </h2>
        </div>
        <div className="mt-12 rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 px-6 shadow-sm">
          <Accordion type="single" defaultValue="0">
            {faqs.map((item, i) => (
              <AccordionItem
                key={item.q}
                value={String(i)}
                question={item.q}
              >
                {item.a}
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
