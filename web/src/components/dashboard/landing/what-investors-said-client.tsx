"use client";

// Client pieces of block 6 "What investors said" (G14-S34):
//
//   <FeedbackLetterTracker/>  fires `feedback_letter_viewed` once per mount
//                             and calls GET /api/founder/feedback-letter so
//                             the FIRST view stamps `opened_at` (the route
//                             emits `feedback_letter_opened` once). Members
//                             (read-only) never call the route — the letter
//                             is the owner's.
//   <FeedbackActionLink/>     one of the three next-action CTAs — fires
//                             `feedback_action_clicked` with the action id,
//                             dimension and href.

import * as React from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export interface FeedbackTrackerProps {
  letterId: string;
  k: number;
  weakestDim: string;
  phase: string;
  /** Only the owner marks the letter opened. */
  markOpened: boolean;
}

export function FeedbackLetterTracker({ letterId, k, weakestDim, phase, markOpened }: FeedbackTrackerProps) {
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("feedback_letter_viewed", { letter_id: letterId, k, weakest_dim: weakestDim, phase });
    if (markOpened) {
      fetch("/api/founder/feedback-letter", { method: "GET", credentials: "same-origin", headers: { Accept: "application/json" } }).catch(() => undefined);
    }
  }, [letterId, k, weakestDim, phase, markOpened]);
  return null;
}

export interface FeedbackActionLinkProps {
  letterId: string;
  actionId: string;
  dimension: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function FeedbackActionLink({ letterId, actionId, dimension, href, className, children }: FeedbackActionLinkProps) {
  const onClick = React.useCallback(() => {
    trackEvent("feedback_action_clicked", { letter_id: letterId, action_id: actionId, dimension, href });
  }, [letterId, actionId, dimension, href]);
  return (
    <Link href={href} onClick={onClick} data-feedback-action={actionId} className={cn("inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-action underline-offset-2 hover:underline", className)}>
      {children}
    </Link>
  );
}
