"use client";

// FeatureGate — wraps any UI that should only render when the current user's
// plan grants the given feature flag. Falls back to a compact upgrade CTA
// (or a caller-supplied fallback) and emits `entitlement:denied` on the
// window so global listeners (paywalls, analytics) can react.

import * as React from "react";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

import { useEntitlement } from "@/hooks/useEntitlement";
import type { Feature } from "@/lib/entitlements";

export interface FeatureGateProps {
  feature: Feature;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  onGateHit?: () => void;
  /** Optional label used in the default upgrade CTA copy. */
  label?: string;
}

// ---------------------------------------------------------------------------
// FeatureGate — renders `children` iff `can(feature)`. While the initial
// entitlement snapshot is loading we render nothing (avoids a flicker
// showing the fallback then swapping to the real UI).
// ---------------------------------------------------------------------------

export function FeatureGate({
  feature,
  fallback,
  children,
  onGateHit,
  label,
}: FeatureGateProps): React.ReactElement | null {
  const { can, isLoading } = useEntitlement();
  const allowed = can(feature);
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || allowed) return;
    if (firedRef.current) return;
    firedRef.current = true;

    // Fire client-side callback + global event. Server-side gate-hit logging
    // lives inside `recordGateHit()` and is called from route handlers when
    // the same feature is attempted via API.
    try {
      onGateHit?.();
    } catch {
      // consumer callback threw — do not break render
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("entitlement:denied", { detail: { feature } }),
      );

      // Best-effort beacon to record the gate hit on the server. Uses
      // sendBeacon so it survives navigation. Endpoint is optional — a
      // 404 is harmless.
      try {
        const payload = JSON.stringify({ feature, source: "menu" });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/entitlement/gate-hit",
            new Blob([payload], { type: "application/json" }),
          );
        }
      } catch {
        // ignore — analytics only
      }
    }
  }, [allowed, isLoading, feature, onGateHit]);

  if (isLoading) return null;
  if (allowed) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;
  return <DefaultUpgradeCta feature={feature} label={label} />;
}

// ---------------------------------------------------------------------------
// DefaultUpgradeCta — inline fallback when the caller doesn't supply one.
// Design is intentionally neutral so it can drop into any surface (menu,
// card, inline row) without a full modal. CPO/UI-UX may replace this later
// via the `fallback` prop.
// ---------------------------------------------------------------------------

function DefaultUpgradeCta({
  feature,
  label,
}: {
  feature: string;
  label?: string;
}): React.ReactElement {
  const title = label ?? humanise(feature);
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-slate-200/70 dark:bg-slate-800 p-2">
          <Lock className="h-4 w-4 text-slate-600 dark:text-slate-300" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title} is a premium feature
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Upgrade your plan to unlock this.
          </p>
        </div>
        <Link
          href={`/pricing?feature=${encodeURIComponent(feature)}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors"
        >
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          Upgrade
        </Link>
      </div>
    </div>
  );
}

// Turn "cap_table.write" → "Cap table write"; "esop.manage" → "Esop manage".
function humanise(feature: string): string {
  const words = feature.replace(/[._]/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return feature;
  return words
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
