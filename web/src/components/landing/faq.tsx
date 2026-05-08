import { Accordion, AccordionItem } from "@/components/ui/accordion";

const faqs = [
  {
    q: "Why not Carta?",
    a: "Carta is US-centric, has no ASIC, ESIC, R&D or AUSTRAC modules, charges roughly 3× the price, and ships no AI valuation, investor trust score, or AU SME comparable data. BlockID is built for the AU raise.",
  },
  {
    q: "Why blockchain? Isn't this a crypto product?",
    a: "It is optional and audit-only. The chain anchor never touches your operational stack — it is the immutable audit trail your future Series B investor will ask for. We never lead with chain, tokens or marketplaces.",
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
      className="py-24 md:py-32 border-t border-ink-700"
    >
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
            Objection handling
          </p>
          <h2
            id="faq-title"
            className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-slate-50"
          >
            Questions every founder asks. Plain answers.
          </h2>
        </div>
        <div className="mt-12 rounded-2xl border border-ink-700 bg-ink-900 px-6">
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
