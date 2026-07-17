// withDisclaimer HOC (T-0425).
//
// Wraps a report / dashboard component with the standard NFA footer so
// no-one has to remember the compliance requirement on new surfaces.
//
// Usage:
//   export default withDisclaimer(ReportPage, { kind: "not_financial_advice" });

"use client";

import * as React from "react";

import { NotFinancialAdvice } from "./not-financial-advice";
import type { DisclaimerKind } from "@/lib/legal/versions";

export interface WithDisclaimerOptions {
  kind: DisclaimerKind | string;
  jurisdiction?: string;
  compact?: boolean;
  /** Extra className for the wrapper. */
  wrapperClassName?: string;
}

export function withDisclaimer<P extends object>(
  Wrapped: React.ComponentType<P>,
  opts: WithDisclaimerOptions,
): React.FC<P> {
  const displayName = Wrapped.displayName ?? Wrapped.name ?? "Component";
  const Component: React.FC<P> = (props) => (
    <div className={opts.wrapperClassName}>
      <Wrapped {...props} />
      <NotFinancialAdvice
        kind={opts.kind}
        jurisdiction={opts.jurisdiction ?? "AU"}
        compact={opts.compact ?? true}
      />
    </div>
  );
  Component.displayName = `withDisclaimer(${displayName})`;
  return Component;
}
