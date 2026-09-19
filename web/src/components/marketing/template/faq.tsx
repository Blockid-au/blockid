/**
 * Faq — native `<details>` disclosures, no JS (G17 D5). Each summary is a
 * ≥ 44 px row with a chevron that rotates via the `open` state in CSS
 * (`.tpl-faq` in globals.css). Pass `jsonLd` to also emit the FAQPage
 * structured data — Google requires the questions to be visible on the
 * page, which they are here, and allows one FAQPage per page, so only the
 * page that owns the FAQ should set it.
 *
 * Server component.
 */

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { cn } from "@/lib/utils";
import { FOCUS_RING, MOTION } from "./primitives";

export interface FaqItem {
  question: string;
  /** Plain string for JSON-LD; rich answers can be a node (JSON-LD then uses `answerText`). */
  answer: ReactNode;
  answerText?: string;
}

export interface FaqProps {
  items: readonly FaqItem[];
  /** Emit `FAQPage` JSON-LD for these items (one per page). */
  jsonLd?: boolean;
  className?: string;
}

export function Faq({ items, jsonLd = false, className }: FaqProps) {
  return (
    <div className={cn("tpl-faq divide-y divide-line-subtle rounded-xl border border-line-subtle bg-surface", className)}>
      {jsonLd ? (
        <FAQJsonLd
          items={items.map((i) => ({
            question: i.question,
            answer: i.answerText ?? (typeof i.answer === "string" ? i.answer : i.question),
          }))}
        />
      ) : null}
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-primary marker:hidden hover:bg-surface-hover",
              MOTION,
              FOCUS_RING,
            )}
          >
            {item.question}
            <ChevronDown
              size={18}
              aria-hidden
              className="shrink-0 text-muted transition-transform duration-(--dur-base) group-open:rotate-180"
            />
          </summary>
          <div className="px-5 pb-5 text-sm leading-relaxed text-secondary">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
