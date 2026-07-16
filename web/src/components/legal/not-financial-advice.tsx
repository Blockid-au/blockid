"use client";

// NotFinancialAdvice — standardised legal disclaimer renderer.
//
// Reads the canonical body_md from `@/lib/legal/surfaces` by mapping the
// `kind` prop to a matching surface. Renders either a full paragraph
// block or a compact 2-line footer.
//
// This component intentionally does NOT record consent — that's a
// separate action gated by <AdviceWarningModal> or an explicit form
// checkbox. This is a display-only component.

import * as React from "react";
import Link from "next/link";
import {
  DISCLAIMER_SURFACES,
  type DisclaimerSurface,
  surfaceAppliesTo,
} from "@/lib/legal/surfaces";
import type { DisclaimerKind } from "@/lib/legal/versions";

export interface NotFinancialAdviceProps {
  /** Canonical disclaimer kind — used to pick the matching surface. */
  kind: DisclaimerKind | string;
  /** ISO 3166-1 alpha-2 (defaults to 'AU'). */
  jurisdiction?: string;
  /** Compact footer form (2 lines) instead of full paragraph. */
  compact?: boolean;
  /** Override the label shown on the "Learn more" link (full mode only). */
  learnMoreHref?: string;
}

const FALLBACK_COMPACT =
  "Not financial advice. Seek independent counsel. This is not an offer of securities.";

function findSurfaceForKind(
  kind: string,
  jurisdiction: string,
): DisclaimerSurface | null {
  for (const surface of Object.values(DISCLAIMER_SURFACES)) {
    if (surface.kind !== kind) continue;
    if (!surfaceAppliesTo(surface, jurisdiction)) continue;
    return surface;
  }
  // Fall back: first surface with matching kind regardless of jurisdiction.
  for (const surface of Object.values(DISCLAIMER_SURFACES)) {
    if (surface.kind === kind) return surface;
  }
  return null;
}

export function NotFinancialAdvice({
  kind,
  jurisdiction = "AU",
  compact = false,
  learnMoreHref = "/legal/disclaimers",
}: NotFinancialAdviceProps): React.ReactElement {
  const surface = React.useMemo(
    () => findSurfaceForKind(kind, jurisdiction),
    [kind, jurisdiction],
  );

  if (compact) {
    return (
      <div
        aria-label="Legal notice"
        className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
      >
        <p>
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            Not financial advice.
          </span>{" "}
          {surface?.label ?? "General information only."} Seek independent
          counsel. This is not an offer of securities.
        </p>
      </div>
    );
  }

  const body = surface?.body_md ?? FALLBACK_COMPACT;
  return (
    <aside
      aria-label="Legal disclaimer"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4"
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {body}
      </p>
      <div className="mt-2">
        <Link
          href={learnMoreHref}
          className="rounded-sm text-xs font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-brand-300 dark:hover:text-brand-200"
        >
          Learn more →
        </Link>
      </div>
    </aside>
  );
}

export default NotFinancialAdvice;
