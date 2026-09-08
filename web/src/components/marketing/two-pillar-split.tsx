/**
 * TwoPillarSplit — asymmetric 70/30 pillar card set below the hero on the
 * fintech homepage v2. Communicates blockid.au's two value pillars in the
 * exact weight ratio the founder wants prospects to internalise:
 *
 *   70% — AI-powered evaluation + valuation (the dominant primary card,
 *         `col-span-8` on desktop, stacked first on mobile).
 *   30% — Blockchain-equity issuance on subscription (smaller supporting
 *         card, `col-span-4` on desktop, stacked second on mobile).
 *
 * Pattern reference (ui-ux-pro-max): Stripe's "one dominant primary
 * use-case, one smaller ancillary" landing pattern — the reader's eye is
 * pulled to the AI pillar first; the blockchain pillar is a calm
 * secondary badge, not a competing tile.
 *
 * Server component. No client state. Tokens only (`bg-surface`,
 * `bg-surface-sunken`, `border-line-DEFAULT`, `border-line-subtle`,
 * `text-primary`, `text-secondary`, `text-muted`, `text-action`) so the
 * card retints automatically for both themes without inline colours.
 */

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pillar {
  eyebrow: string;
  title: string;
  bullets: string[];
  primaryHref: string;
  primaryLabel: string;
  deepLinks: { href: string; label: string }[];
}

const AI_PILLAR: Pillar = {
  eyebrow: "70% — AI analysis + valuation",
  title: "Từ input → SVI score + định giá",
  bullets: [
    "13 evaluation criteria across 8 SVI dimensions",
    "8-dimension Startup Value Index (no cap, Nikkei-style)",
    "Berkus + VC + DCF + comps — 4-method valuation range",
    "Investor-ready data room, cap table sim, GTM roadmap",
  ],
  primaryHref: "/analyze",
  primaryLabel: "Try free",
  deepLinks: [
    { href: "/tools/data-room", label: "Data room" },
    { href: "/tools/cap-table", label: "Cap table" },
    { href: "/guide/scn", label: "SCN guide" },
  ],
};

const BLOCKCHAIN_PILLAR: Pillar = {
  eyebrow: "30% — Blockchain equity",
  title: "Cổ phần on-chain khi đăng ký",
  bullets: [
    "Private EVM (Anvil chainId 420) — off-chain-first, on-chain mirrored",
    "MetaMask-ready wallet, no gas fees for founders",
    "ESOP + vesting cliffs enforced by smart contract",
  ],
  primaryHref: "/pricing",
  primaryLabel: "See pricing",
  deepLinks: [
    { href: "/tools/esop-checklist", label: "ESOP checklist" },
    { href: "/tools/equity-split", label: "Equity split" },
  ],
};

function PillarCard({
  pillar,
  variant,
  className,
}: {
  pillar: Pillar;
  variant: "primary" | "secondary";
  className?: string;
}) {
  const isPrimary = variant === "primary";
  return (
    <article
      data-testid={`two-pillar-${variant}`}
      className={cn(
        "flex flex-col gap-5 rounded-2xl p-6 sm:p-8",
        isPrimary
          ? "border border-line-DEFAULT bg-surface"
          : "border border-line-subtle bg-surface-sunken",
        className,
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        {pillar.eyebrow}
      </p>
      <h3
        className={cn(
          "font-display font-bold tracking-tight text-primary",
          isPrimary ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
        )}
      >
        {pillar.title}
      </h3>

      <ul className="flex flex-col gap-2.5" role="list">
        {pillar.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm leading-relaxed text-secondary">
            <Check
              size={16}
              aria-hidden
              className={cn(
                "mt-0.5 shrink-0",
                isPrimary ? "text-action" : "text-muted",
              )}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <Link
          href={pillar.primaryHref}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            isPrimary
              ? "bg-action text-on-action hover:opacity-90"
              : "border border-line-DEFAULT text-primary hover:bg-surface",
          )}
        >
          {pillar.primaryLabel}
          <ArrowRight size={14} aria-hidden />
        </Link>

        {pillar.deepLinks.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" role="list">
            {pillar.deepLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-xs text-muted transition-colors hover:text-action focus:outline-none focus-visible:underline"
                >
                  {l.label} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function TwoPillarSplit({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="two-pillar-heading"
      data-testid="two-pillar-split"
      className={cn("border-t border-line-subtle bg-surface py-16", className)}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Two pillars, one platform
          </p>
          <h2
            id="two-pillar-heading"
            className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
          >
            AI evaluation, weighted 70%. Blockchain equity on subscription, 30%.
          </h2>
          <p className="mt-3 text-sm text-secondary sm:text-base">
            Free analysis pays the way in. Tokenized equity comes on with your
            first paid plan — off-chain-first, so AU corporate law stays the
            source of truth.
          </p>
        </div>

        {/* 70/30 grid: col-span-8 + col-span-4 on lg; stacked on mobile with
            the primary AI card first so the ratio survives on small screens. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <PillarCard
            pillar={AI_PILLAR}
            variant="primary"
            className="lg:col-span-8"
          />
          <PillarCard
            pillar={BLOCKCHAIN_PILLAR}
            variant="secondary"
            className="lg:col-span-4"
          />
        </div>
      </div>
    </section>
  );
}
