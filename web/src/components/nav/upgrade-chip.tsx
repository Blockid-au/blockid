/**
 * UpgradeChip — small contextual "Upgrade to X to unlock" chip for pages
 * a user deep-linked to but cannot fully view under their current tier.
 *
 * v3 nav §16.4 — the sidebar hides locked rows by default, so the
 * primary escape hatch for locked pages is a chip on the page itself
 * that anchors to /pricing?highlight={tier}. This keeps the
 * hide-not-teaser rule intact on the sidebar without stranding users
 * who followed an inbound link.
 *
 * No tests — trivial anchor + label; visual regression covered by the
 * pricing page e2e when it lands.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { planLabel, type PlanTier } from "@/lib/segments";

export interface UpgradeChipProps {
  /** The tier the user needs to unlock the surface they are on. */
  tier: PlanTier;
  /** Optional custom copy — defaults to "Upgrade to {label} to unlock". */
  label?: string;
  /** Additional Tailwind classes for parent-controlled positioning. */
  className?: string;
}

export function UpgradeChip({
  tier,
  label,
  className,
}: UpgradeChipProps): React.JSX.Element {
  const text = label ?? `Upgrade to ${planLabel(tier)} to unlock`;
  return (
    <Link
      href={`/pricing?highlight=${encodeURIComponent(tier)}`}
      data-testid="upgrade-chip"
      data-tier={tier}
      className={[
        "inline-flex items-center gap-1 rounded-full bg-amber-100",
        "px-3 py-1 text-xs font-medium text-amber-900",
        "hover:bg-amber-200 focus:outline-none focus-visible:ring-2",
        "focus-visible:ring-amber-600 focus-visible:ring-offset-2",
        "dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60",
        className ?? "",
      ].join(" ")}
    >
      <span>{text}</span>
      <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  );
}
