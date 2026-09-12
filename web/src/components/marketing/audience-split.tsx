/**
 * AudienceSplit — the two people who use this, side by side.
 *
 * The previous homepage only ever spoke to founders. An investor landing on
 * it had nothing to read and no route in, even though /for/investor and the
 * sample reports both exist. This band gives each side one question, one
 * answer, and one link — no more.
 *
 * Server component. Tokens only.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const AUDIENCES = [
  {
    who: "For founders",
    question: "What is my company worth, and what do I do next to be worth more?",
    body:
      "Run the analysis before the meeting, not after it. You walk in knowing your number, the range around it, and the two or three things a sharp investor is going to press on.",
    links: [
      { href: "/analyze", label: "Analyse my startup", primary: true },
      { href: "/guide/scn", label: "Read the scoring guide", primary: false },
    ],
  },
  {
    who: "For investors",
    question: "Show me a company that has already been assessed.",
    body:
      "Founders arrive with a score across the same eight dimensions every time, a valuation range with its workings attached, and a data room already assembled. Compare like with like.",
    links: [
      { href: "/for/investor", label: "For investors", primary: true },
      { href: "/reports/samples", label: "See sample reports", primary: false },
    ],
  },
];

export function AudienceSplit({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="audience-heading"
      data-testid="audience-split"
      className={cn(
        "border-t border-line-subtle bg-surface py-14 sm:py-16",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <h2
          id="audience-heading"
          className="mb-10 text-center font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
        >
          Both sides of the table, looking at the same numbers.
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {AUDIENCES.map((a) => (
            <article
              key={a.who}
              className="flex flex-col gap-4 rounded-2xl border border-line-subtle bg-surface-raised p-6 shadow-sm sm:p-8"
            >
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted">
                {a.who}
              </p>
              <h3 className="font-display text-lg font-semibold leading-snug text-primary sm:text-xl">
                “{a.question}”
              </h3>
              <p className="text-sm leading-relaxed text-secondary">{a.body}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
                {a.links.map((l) =>
                  l.primary ? (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
                    >
                      {l.label}
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  ) : (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
                    >
                      {l.label}
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  ),
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AudienceSplit;
