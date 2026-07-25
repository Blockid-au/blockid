"use client";

/**
 * PhaseAwareUpgradeCard — contextual upgrade tile shown inside the
 * "Recommended next step" surface. Reads a NextBestUpgrade suggestion
 * (chosen server-side by nextBestUpgrade()) and renders a compact prompt
 * with discovery microcopy, delta pricing, and a primary CTA.
 *
 * Rate-limits:
 *   - 1 impression per feature per session (sessionStorage)
 *   - 3 impressions per user in any rolling 24h (localStorage)
 *   - "Not now" writes the shared 24h paywall cooldown so the modal and the
 *     card cannot both nag for the same slug.
 *
 * GA4 events: tier_upgrade_impression / tier_upgrade_click / tier_upgrade_dismiss.
 */

import * as React from "react";
import Link from "next/link";
import { Sparkles, ArrowUpRight } from "lucide-react";

import type { NextBestUpgrade } from "@/lib/entitlements/next-best-upgrade";

const SESSION_PREFIX = "bid_upgrade_seen_";
const DAILY_KEY = "bid_upgrade_daily";
const PAYWALL_COOLDOWN_PREFIX = "bid_paywall_cooldown_";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY = 3;

export interface PhaseAwareUpgradeCardProps {
  suggestion: NextBestUpgrade;
  /** Current pathname — forwarded to /pricing?from= for post-checkout bounce. */
  fromPath: string;
  /** Segment slug for pricing tab (default "founder"). */
  segment?: string;
  /** Current tier label (e.g. "free") — sent with GA4 events. */
  currentTier?: string;
  /** Current phase (1..12) — sent with GA4 events. */
  currentPhase?: number;
}

function fireGa(event: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...a: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  };
  try {
    w.gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
  try {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...params });
  } catch {
    /* ignore */
  }
}

function isSessionSuppressed(feature: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(SESSION_PREFIX + feature) === "1";
  } catch {
    return false;
  }
}

function markSessionSeen(feature: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + feature, "1");
  } catch {
    /* ignore */
  }
}

function isCoolingDown(feature: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PAYWALL_COOLDOWN_PREFIX + feature);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < DAY_MS;
  } catch {
    return false;
  }
}

function stampCooldown(feature: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PAYWALL_COOLDOWN_PREFIX + feature,
      String(Date.now()),
    );
  } catch {
    /* ignore */
  }
}

function isDailyCapped(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    const rec = raw ? (JSON.parse(raw) as { at: number[] }) : { at: [] };
    const cutoff = Date.now() - DAY_MS;
    const recent = rec.at.filter((t) => t > cutoff);
    return recent.length >= MAX_PER_DAY;
  } catch {
    return false;
  }
}

function bumpDaily(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    const rec = raw ? (JSON.parse(raw) as { at: number[] }) : { at: [] };
    const cutoff = Date.now() - DAY_MS;
    rec.at = rec.at.filter((t) => t > cutoff);
    rec.at.push(Date.now());
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
}

export function PhaseAwareUpgradeCard(props: PhaseAwareUpgradeCardProps): React.ReactElement | null {
  const {
    suggestion,
    fromPath,
    segment = "founder",
    currentTier = "free",
    currentPhase,
  } = props;

  const [dismissed, setDismissed] = React.useState(false);
  const [suppressed, setSuppressed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const blocked =
      isSessionSuppressed(suggestion.feature) ||
      isCoolingDown(suggestion.feature) ||
      isDailyCapped();
    setSuppressed(blocked);
    if (blocked) return;

    markSessionSeen(suggestion.feature);
    bumpDaily();
    fireGa("tier_upgrade_impression", {
      feature: suggestion.feature,
      current_tier: currentTier,
      target_tier: suggestion.minTier,
      phase: currentPhase ?? null,
      monthly_delta_aud: suggestion.monthlyDeltaAud,
      rule: suggestion.rule,
    });
    // We only fire once per mount per feature — deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion.feature]);

  if (suppressed !== false || dismissed) return null;

  const href = suggestion.addOnKey
    ? `/workspace/billing?openAddon=${encodeURIComponent(suggestion.addOnKey)}`
    : `/pricing?tier=${encodeURIComponent(segment)}&feature=${encodeURIComponent(
        suggestion.feature,
      )}&from=${encodeURIComponent(fromPath)}`;

  const handleClick = () => {
    fireGa("tier_upgrade_click", {
      feature: suggestion.feature,
      current_tier: currentTier,
      target_tier: suggestion.minTier,
      phase: currentPhase ?? null,
      monthly_delta_aud: suggestion.monthlyDeltaAud,
      rule: suggestion.rule,
    });
  };

  const handleDismiss = () => {
    stampCooldown(suggestion.feature);
    fireGa("tier_upgrade_dismiss", {
      feature: suggestion.feature,
      current_tier: currentTier,
      target_tier: suggestion.minTier,
    });
    setDismissed(true);
  };

  return (
    <div
      role="complementary"
      aria-label="Recommended upgrade"
      className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800/40 dark:bg-brand-900/20"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-200">
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
        Recommended next step
      </p>
      <p className="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
        {suggestion.discoveryHint}
      </p>
      <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">
        {suggestion.reason} · +A${suggestion.monthlyDeltaAud}/mo
      </p>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-surface-200 bg-white px-3 text-xs font-medium text-ink-700 hover:bg-surface-50 dark:border-white/10 dark:bg-transparent dark:text-ink-200 dark:hover:bg-white/5"
        >
          Not now
        </button>
        <Link
          href={href}
          onClick={handleClick}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {suggestion.upgradeCTA}
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export default PhaseAwareUpgradeCard;
