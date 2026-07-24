// AccessTierBadge — small stateless chip showing a mentor's current tier.
//
// Used in:
//   • reseller /customers drawer header (next to the founder name)
//   • /mentor/roster cards (mentor-side)
//   • /dashboard/settings/mentor-access (founder-side list)
//
// Pure presentation — no data access. Colour comes from tierBadgeColor(),
// label from tierLabel(). Both are single-source-of-truth in
// lib/mentor/access-tiers.ts.

import * as React from "react";
import { Eye, FileText, Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type MentorAccessTier,
  tierBadgeColor,
  tierDisclosure,
  tierLabel,
} from "@/lib/mentor/access-tiers";

export interface AccessTierBadgeProps {
  tier: MentorAccessTier;
  /**
   * When true, wraps the badge in a `title` tooltip explaining what the
   * mentor sees at this tier. Uses the native `title` attribute rather
   * than a Radix popover so this stays a Server Component-safe primitive.
   */
  showTooltip?: boolean;
  className?: string;
}

function iconFor(t: MentorAccessTier) {
  switch (t) {
    case "attributed_only":
      return Eye;
    case "reports_shared":
      return FileText;
    case "full_mentor":
      return Handshake;
  }
}

export function AccessTierBadge({
  tier,
  showTooltip = false,
  className,
}: AccessTierBadgeProps) {
  const Icon = iconFor(tier);
  const variant = tierBadgeColor(tier);
  const label = tierLabel(tier);

  const badge = (
    <Badge
      variant={variant}
      className={cn(
        "gap-1.5",
        tier === "full_mentor" && "ring-1 ring-emerald-300/60",
        className,
      )}
      title={showTooltip ? tierDisclosure(tier) : undefined}
      aria-label={`Mentor access tier: ${label}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </Badge>
  );

  return badge;
}

export default AccessTierBadge;
