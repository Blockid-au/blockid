"use client";

// FeatureGate — wraps any UI that should only render when the current user's
// plan grants the given feature flag. Falls back to a compact upgrade CTA
// (or a caller-supplied fallback) and emits `entitlement:denied` on the
// window so global listeners (paywalls, analytics) can react.

import * as React from "react";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

import { useEntitlement } from "@/hooks/useEntitlement";
import { useUpgradePrompt } from "@/hooks/useUpgradePrompt";
import type { Feature } from "@/lib/entitlements";
import { resolveFeatureRequirement, type FeatureRequirement } from "@/lib/entitlements/feature-requirement";

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
  const promptCtx = useUpgradePrompt();

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

    // Ask the client-side CRO stack to render its CTA (UpgradeModal /
    // UpgradeBanner) for this feature_gate_hit. The hook returns a
    // per-instance state object (not a shared context) — call safely and
    // let the hook's own cool-down + session-cap logic decide whether to
    // fire. If the hook is unavailable we silently skip.
    try {
      promptCtx?.request?.("feature_gate_hit", {
        feature,
        requiredPlan: label ?? undefined,
      });
    } catch {
      // never let a CTA request break the gated render path
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("entitlement:denied", { detail: { feature } }),
      );

      // Best-effort beacon to record the gate hit on the server
      // (POST /api/entitlement/gate-hit → recordGateHit with the page path
      // as `surface`, G16-B). Uses sendBeacon so it survives navigation.
      try {
        const payload = JSON.stringify({ feature, source: "menu", surface: window.location.pathname });
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
// G16-B: the card sells the RIGHT thing — plan name, A$ price and trial
// terms from the pricing source of truth (plans-v2 via
// resolveFeatureRequirement), and one CTA that lands on that plan's card
// (`/pricing?feature=<f>#tier-<id>`); evaluator-only features (e.g.
// `investor.dealflow`) resolve to the evaluator ladder (Scout), contact-
// sales features to /contact. Exported for the colocated test.
// ---------------------------------------------------------------------------

export interface GateCardCopy {
  title: string;
  body: string;
  cta: string;
  href: string;
  planId: string | null;
}

/** Pure: the card's copy + CTA for a feature (no hooks, testable). */
export function gateCardCopy(feature: string, label?: string): GateCardCopy {
  const req: FeatureRequirement | null = resolveFeatureRequirement(feature);
  const title = label ?? (req ? capitalise(req.label) : humanise(feature));
  if (!req || req.contactSales || !req.plan) {
    return {
      title,
      body: "This is on an Enterprise or program plan — talk to us and we will set it up.",
      cta: "Contact sales",
      href: `/contact?plan=enterprise&feature=${encodeURIComponent(feature)}`,
      planId: null,
    };
  }
  const plan = req.plan;
  const trial = plan.trial_days > 0 ? `${plan.trial_days}-day free trial, cancel any time` : "no lock-in, cancel any time";
  const carrier = req.viaAddon ? `the Equity add-on (${req.priceLine}) on the ${plan.name} plan` : `the ${plan.name} plan${req.priceLine ? ` — ${req.priceLine}` : ""}`;
  return {
    title,
    body: `Included in ${carrier} · ${trial}.`,
    cta: `See ${plan.name}`,
    // Evaluator plans live on the Evaluator tab of /pricing (G16 review).
    href: `/pricing?feature=${encodeURIComponent(feature)}${plan.segment && plan.segment !== "founder" ? `&segment=${encodeURIComponent(plan.segment)}` : ""}${req.anchor ?? ""}`,
    planId: plan.id,
  };
}

function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function DefaultUpgradeCta({
  feature,
  label,
}: {
  feature: string;
  label?: string;
}): React.ReactElement {
  const copy = gateCardCopy(feature, label);
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-sunken p-4" data-testid="feature-gate-card" data-feature={feature} data-plan={copy.planId ?? undefined}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-surface-hover p-2">
          <Lock className="h-4 w-4 text-muted" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">
            {copy.title} is locked on your plan
          </p>
          <p className="mt-0.5 text-xs text-secondary">
            {copy.body}
          </p>
        </div>
        <Link
          href={copy.href}
          className="shrink-0 inline-flex items-center gap-1 min-h-9 rounded-lg bg-action hover:bg-action-hover text-on-action px-3 py-1.5 text-xs font-semibold transition-colors"
        >
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          {copy.cta}
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
