/**
 * EquityBand — the on-chain equity story, deliberately sized as the smaller
 * half of the page (roughly 30% of the weight the evaluation half carries).
 *
 * Replaces the old TwoPillarSplit "30% — Blockchain equity" card, which led
 * with implementation trivia ("Private EVM (Anvil chainId 420)") that means
 * nothing to a founder deciding whether to issue shares. What a founder
 * actually wants to know is: can I run my register, my ESOP and my
 * distributions here, and is it legal. So that is what this says.
 *
 * The legal framing is load-bearing and must not be softened: the off-chain
 * register remains the source of truth under Australian corporate law. The
 * chain mirrors it.
 *
 * Server component. Tokens only.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  {
    title: "Cap table",
    body:
      "Every holder, class and round in one register, with dilution modelled before you sign anything.",
    href: "/tools/cap-table",
    linkLabel: "Cap table tool",
  },
  {
    title: "ESOP and vesting",
    body:
      "Grants, cliffs and vesting schedules that tick over on their own — no spreadsheet to remember to update.",
    href: "/tools/esop-checklist",
    linkLabel: "ESOP checklist",
  },
  {
    title: "Dividends",
    body:
      "Declare a distribution once and it is apportioned across holders by their actual position on the day.",
    href: "/tokenize",
    linkLabel: "How issuance works",
  },
  {
    title: "Shareholder portal",
    body:
      "Your holders check their own position instead of emailing you for a copy of the register.",
    href: "/tools/equity-split",
    linkLabel: "Model a founder split",
  },
];

export function EquityBand({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="equity-heading"
      data-testid="equity-band"
      className={cn(
        "border-t border-line-subtle bg-surface-sunken py-14 sm:py-16",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
              When you are ready to issue
            </p>
            <h2
              id="equity-heading"
              className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
            >
              Equity you can actually issue, not just model.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-secondary sm:text-base">
              On a paid plan the same company you just scored becomes a
              register you can run: shares issued, options granted, vesting
              tracked, distributions paid, holders self-serve.
            </p>
            <p className="mt-4 rounded-xl border border-line-subtle bg-surface-raised p-4 text-sm leading-relaxed text-secondary">
              Your off-chain register stays the legal source of truth under
              Australian corporate law. The on-chain copy is the mirror
              everyone can verify — it never replaces the statutory record.
            </p>
            <Link
              href="/tokenize"
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken"
            >
              See how equity is issued
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>

          <ul
            role="list"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7"
          >
            {CAPABILITIES.map((c) => (
              <li
                key={c.title}
                className="flex flex-col gap-2 rounded-2xl border border-line-subtle bg-surface-raised p-5 shadow-sm"
              >
                <h3 className="font-display text-base font-semibold text-primary">
                  {c.title}
                </h3>
                <p className="text-sm leading-relaxed text-secondary">
                  {c.body}
                </p>
                <Link
                  href={c.href}
                  className="mt-auto inline-flex items-center gap-1.5 rounded-md pt-2 text-xs font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
                >
                  {c.linkLabel}
                  <ArrowRight size={12} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default EquityBand;
