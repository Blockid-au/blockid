/**
 * FundingFaq — the visible "Questions founders ask" list at the foot of the
 * free directories (S12-A) plus its `FAQPage` JSON-LD.
 *
 * Native `<details>` / `<summary>` (keyboard-focusable, no client JS, no
 * hydration) under an H2 so the questions are real page content; the schema
 * is emitted from the same items through `FundingJsonLd` and only when at
 * least two Q&As render, so it can never describe something the page does
 * not show (S8-A finding 6). Server component.
 */

import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { faqPageJsonLd, type FaqItem } from "@/lib/funding/faq";

export function FundingFaq({
  items,
  heading = "Questions founders ask",
  id = "funding-faq",
}: {
  items: ReadonlyArray<FaqItem>;
  heading?: string;
  id?: string;
}) {
  const usable = items.filter((i) => i.question.trim() && i.answer.trim());
  if (usable.length === 0) return null;
  const jsonLd = faqPageJsonLd(usable);
  return (
    <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby={`${id}-heading`} data-funding-faq={String(usable.length)}>
      <h2 id={`${id}-heading`} className="font-display text-xl font-semibold text-primary">
        {heading}
      </h2>
      <div className="mt-4 divide-y divide-line-subtle rounded-2xl border border-line-subtle bg-surface-raised">
        {usable.map((item, i) => (
          <details key={i} className="group px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-primary marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="mr-2 inline-block w-3 text-secondary group-open:rotate-90" aria-hidden="true">
                ›
              </span>
              {item.question}
            </summary>
            <p className="mt-2 pl-5 text-sm text-secondary">{item.answer}</p>
          </details>
        ))}
      </div>
      {jsonLd ? <FundingJsonLd data={jsonLd} /> : null}
    </section>
  );
}

export default FundingFaq;
