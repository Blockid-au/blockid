/**
 * LogoBand — trust + compliance strip.
 * Server component (no interactivity needed).
 *
 * Qualitative trust signals — kept "empty until real" per SOURCE-OF-TRUTH.
 * No fabricated numeric claims (startups analysed / value indexed / rating).
 *
 * Redesign (2026-09-08, homepage-fintech-redesign agent): this was a third
 * dark band (`data-theme="dark"` on `#0A0F1E`) wedged between a dark
 * how-it-works section and a light final CTA, which is a large part of why
 * the page read as sections from different sites stacked together. It is
 * now LIGHT — the page keeps exactly one dark punctuation band
 * (how-it-works + growth strip) plus the dark footer strip.
 *
 * Every colour is token-bound; the previous inline `#94A3B8` labels sat at
 * 2.56:1 on white had this section ever rendered light, which is exactly
 * the class of bug that made the H1 invisible.
 *
 * ENTITY STRINGS ARE DELIBERATE: "PPL Food PTY LTD" is the entity shown on
 * marketing surfaces (Google for Startups verification). Billing, legal and
 * JSON-LD use Auschain PTY LTD. Do not "correct" either one.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STATS = [
  { value: "Sydney NSW", label: "Australian-owned HQ" },
  { value: "AU registered", label: "PPL Food PTY LTD" },
  { value: "Off-chain register", label: "Legal record stays statutory" },
  { value: "ASIC · ESIC · R&D", label: "Australian rules, not US" },
];

const COMPLIANCE = [
  "Essential Eight aligned",
  "Stripe PCI DSS Level 1",
  "Data hosted in Australia",
];

export function LogoBand({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="trust-strip-heading"
      className={cn(
        "border-t border-line-subtle bg-surface-sunken py-12 sm:py-14",
        className,
      )}
    >
      <div className="mx-auto max-w-5xl px-6">
        <h2
          id="trust-strip-heading"
          className="mb-8 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-muted"
        >
          Where this is built, and how it is run
        </h2>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 text-center lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.value} className="flex flex-col items-center gap-1.5">
              <dt className="font-display text-lg font-bold tracking-tight text-primary sm:text-xl">
                {stat.value}
              </dt>
              <dd className="text-xs uppercase tracking-[0.12em] text-muted">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>

        <ul
          role="list"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-line-subtle pt-8"
        >
          {COMPLIANCE.map((c) => (
            <li
              key={c}
              className="rounded-full border border-line-subtle bg-surface-raised px-3 py-1 text-xs font-medium text-secondary"
            >
              {c}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-sm text-muted">
          <Link
            href="/team"
            className="font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:underline"
          >
            Meet the team
          </Link>
          <span aria-hidden className="mx-2 text-line">
            ·
          </span>
          <Link
            href="/for/investor"
            className="inline-flex items-center gap-1 font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:underline"
          >
            For investors
            <ArrowRight size={13} aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
