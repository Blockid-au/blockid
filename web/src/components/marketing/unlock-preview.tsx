/**
 * UnlockPreview — "what you unlock after login" strip (G11 §3c, T0238).
 *
 * The public nav now carries five entries, so the workspace surfaces that
 * used to sit under "Product" need one honest preview on the homepage and
 * on /features: eight locked cards, a lock glyph, one line on the outcome,
 * and a link into login that lands on the right workspace route afterwards.
 *
 * Labels are read from the workspace sidebar catalogue (`NAV_GROUPS`) where
 * the route exists there, so the strip cannot drift from what a signed-in
 * founder actually sees. Routes not yet in the catalogue (investor pack,
 * the Money Finder workspace page shipping under T0244) fall back to the
 * label given here.
 *
 * Server component — no client JS. Semantic tokens only, so it renders
 * correctly on the light homepage and inside MarketingShell.
 */

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/components/workspace/nav-groups";

export interface UnlockCard {
  /** Workspace route the login should land on. */
  href: string;
  /** Label — from NAV_GROUPS when the route exists there. */
  label: string;
  /** One line on what the founder gets. */
  outcome: string;
}

interface UnlockSeed {
  href: string;
  fallbackLabel: string;
  outcome: string;
}

const SEEDS: UnlockSeed[] = [
  {
    href: "/workspace/cap-table",
    fallbackLabel: "Cap table + ESOP",
    outcome: "Every share, option and SAFE in one register, with dilution modelled before you sign.",
  },
  {
    href: "/workspace/data-room",
    fallbackLabel: "Data room",
    outcome: "The folder investors expect, filled in the order they will open it.",
  },
  {
    href: "/dashboard/valuation",
    fallbackLabel: "Valuation",
    outcome: "A defensible range from five methods, refreshed as your numbers change.",
  },
  {
    href: "/workspace/investor-pack",
    fallbackLabel: "Investor pack",
    outcome: "Deck, one-pager and tracked share links, generated from the same source of truth.",
  },
  {
    href: "/workspace/funding",
    fallbackLabel: "Grant & Program Finder",
    outcome: "The grants and programs you actually qualify for, with the next closing date.",
  },
  {
    href: "/compliance/calendar",
    fallbackLabel: "Compliance calendar",
    outcome: "ASIC, ATO, R&D Tax and ESIC dates on one calendar, with reminders before each.",
  },
  {
    href: "/workspace/metrics",
    fallbackLabel: "Metrics",
    outcome: "MRR, burn and runway tracked monthly and benchmarked against your cohort.",
  },
  {
    href: "/workspace/exit",
    fallbackLabel: "Exit modelling",
    outcome: "Waterfall and returns by scenario, so every holder knows what a sale means.",
  },
];

/** Flat lookup of every sidebar leaf by href (groups + subgroups). */
function catalogueByHref(): Map<string, NavItem> {
  const map = new Map<string, NavItem>();
  for (const group of NAV_GROUPS) {
    for (const item of group.items ?? []) {
      if (!map.has(item.href)) map.set(item.href, item);
    }
    for (const sub of group.subgroups ?? []) {
      for (const item of sub.items) {
        if (!map.has(item.href)) map.set(item.href, item);
      }
    }
  }
  return map;
}

/** Where a locked card sends the visitor: login, then the workspace route. */
export function unlockHref(route: string): string {
  return `/auth/login?next=${encodeURIComponent(route)}`;
}

/** The eight cards, labels resolved against NAV_GROUPS. */
export function buildUnlockCards(): UnlockCard[] {
  const catalogue = catalogueByHref();
  return SEEDS.map((seed) => ({
    href: seed.href,
    label: catalogue.get(seed.href)?.label ?? seed.fallbackLabel,
    outcome: seed.outcome,
  }));
}

export const UNLOCK_CARDS: UnlockCard[] = buildUnlockCards();

interface UnlockPreviewProps {
  /** Page ground. Defaults to the sunken band used between homepage sections. */
  tone?: "sunken" | "base";
  className?: string;
}

export function UnlockPreview({ tone = "sunken", className = "" }: UnlockPreviewProps) {
  return (
    <section
      id="unlock"
      aria-labelledby="unlock-heading"
      data-testid="unlock-preview"
      className={[
        "scroll-mt-20 border-t border-line-subtle py-12 sm:py-14",
        tone === "sunken" ? "bg-surface-sunken" : "bg-surface",
        className,
      ].join(" ")}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            What you unlock after login
          </p>
          <h2
            id="unlock-heading"
            className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
          >
            The workspace behind the score.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-secondary sm:text-base">
            The free score is the front door. Sign in and the same company
            record drives eight working tools — each one picks up where the
            report left off.
          </p>
        </div>

        <ul
          role="list"
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {UNLOCK_CARDS.map((card) => (
            <li key={card.href}>
              <Link
                href={unlockHref(card.href)}
                data-unlock-route={card.href}
                className="group flex h-full flex-col rounded-2xl border border-line-subtle bg-surface p-5 transition-colors duration-200 hover:border-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-primary">{card.label}</span>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-subtle text-muted transition-colors duration-200 group-hover:border-action group-hover:text-action"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                </span>
                <span className="mt-2 flex-1 text-sm leading-relaxed text-secondary">
                  {card.outcome}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-action">
                  Sign in to unlock
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          Cap table, data room and valuation are in the A$29 a month workspace.
          Sign in is free; nothing is charged until you choose a plan.
        </p>
      </div>
    </section>
  );
}

export default UnlockPreview;
