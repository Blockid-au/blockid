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
  /**
   * G21 P1-C — when set, a "Flag a problem with this report" link renders
   * beside the notice (the founder correction workflow,
   * /workspace/evidence/corrections). Report footers pass it; marketing
   * surfaces leave it unset.
   */
  flagHref?: string;
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
  flagHref,
}: NotFinancialAdviceProps): React.ReactElement {
  const surface = React.useMemo(
    () => findSurfaceForKind(kind, jurisdiction),
    [kind, jurisdiction],
  );

  if (compact) {
    return (
      <div
        aria-label="Legal notice"
        className="mt-4 border-t border-line-subtle pt-3 text-xs leading-relaxed text-muted"
      >
        <p>
          <span className="font-semibold text-secondary">
            Not financial advice.
          </span>{" "}
          {surface?.label ?? "General information only."} Seek independent
          counsel. This is not an offer of securities.
          {flagHref ? (
            <>
              {" "}
              <Link href={flagHref} className="font-medium text-brand-700 hover:text-brand-800" data-testid="report-flag-problem">
                Flag a problem with this report
              </Link>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  const body = surface?.body_md ?? FALLBACK_COMPACT;
  return (
    <aside
      aria-label="Legal disclaimer"
      className="rounded-xl border border-line-subtle bg-surface-sunken/70 p-4"
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {body}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={learnMoreHref}
          className="rounded-sm text-xs font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          Learn more →
        </Link>
        {flagHref ? (
          <Link
            href={flagHref}
            className="rounded-sm text-xs font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            data-testid="report-flag-problem"
          >
            Flag a problem with this report
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

export default NotFinancialAdvice;
