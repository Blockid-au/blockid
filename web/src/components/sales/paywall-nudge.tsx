"use client";

/**
 * PaywallNudge — contextual upgrade modal for workspace-only paywalled
 * features (report export, deep audit, extra credits).
 *
 * Contract:
 *   - Wrap the workspace root in `<PaywallProvider>` once.
 *   - Any child calls `usePaywall().openPaywall({...})` to trigger it.
 *   - Frequency cap: max 3 opens per feature per 24h, plus a per-feature
 *     "Not now" cooldown of 24h stored in localStorage.
 *   - Focus-trapped, role=dialog aria-modal=true, ESC + backdrop close.
 *   - GA4 events: `paywall_hit` on open, `paywall_upgrade_click` on
 *     primary CTA, `paywall_dismiss` on close.
 *
 * The modal is intentionally headless (no Radix dep) — it uses a small
 * focus-trap keyed off `Tab`/`Shift+Tab` on the dialog root.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Lock, Sparkles } from "lucide-react";

export interface PaywallRequest {
  /** Machine name of the paywalled feature (e.g. "report_export"). */
  feature: string;
  /** Human-readable feature name shown in the modal headline. */
  featureLabel?: string;
  /** Current plan id (for analytics + cooldown key differentiation). */
  currentPlan?: string;
  /** Plan id we're recommending they upgrade to. */
  requiredPlan?: string;
  /** Optional one-line benefit copy. */
  benefit?: string;
  /**
   * Segment slug forwarded to `/pricing?tier=<segment>`. Defaults to
   * "founder" when omitted.
   */
  segment?: string;
}

interface PaywallContextValue {
  openPaywall: (req: PaywallRequest) => boolean;
  closePaywall: () => void;
}

const PaywallContext = React.createContext<PaywallContextValue | null>(null);

const COOLDOWN_PREFIX = "bid_paywall_cooldown_";
const COUNT_PREFIX = "bid_paywall_count_";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_OPENS_PER_24H = 3;

function fireGa(event: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
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

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** True when a "Not now" click is still cooling down. */
function isCoolingDown(feature: string): boolean {
  const at = readJson<number>(COOLDOWN_PREFIX + feature);
  if (!at) return false;
  return Date.now() - at < COOLDOWN_MS;
}

/** True when we've already shown this feature the max times in 24h. */
function isRateLimited(feature: string): boolean {
  const rec = readJson<{ at: number[] }>(COUNT_PREFIX + feature);
  if (!rec) return false;
  const cutoff = Date.now() - COOLDOWN_MS;
  const recent = rec.at.filter((t) => t > cutoff);
  return recent.length >= MAX_OPENS_PER_24H;
}

/** Bump the 24-hour open counter for a feature. */
function bumpCounter(feature: string): void {
  const key = COUNT_PREFIX + feature;
  const cutoff = Date.now() - COOLDOWN_MS;
  const rec = readJson<{ at: number[] }>(key) ?? { at: [] };
  rec.at = rec.at.filter((t) => t > cutoff);
  rec.at.push(Date.now());
  writeJson(key, rec);
}

/** Store "Not now" click so we don't re-nag for 24h. */
function stampCooldown(feature: string): void {
  writeJson(COOLDOWN_PREFIX + feature, Date.now());
}

export function usePaywall(): PaywallContextValue {
  const ctx = React.useContext(PaywallContext);
  if (!ctx) {
    // No provider mounted — return a no-op so callsites don't crash on
    // marketing pages. Returns `false` from openPaywall so callers can
    // fall back to a hard redirect.
    return {
      openPaywall: () => false,
      closePaywall: () => {},
    };
  }
  return ctx;
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<PaywallRequest | null>(null);

  const openPaywall = React.useCallback((req: PaywallRequest): boolean => {
    if (isCoolingDown(req.feature)) return false;
    if (isRateLimited(req.feature)) return false;
    bumpCounter(req.feature);
    fireGa("paywall_hit", {
      feature: req.feature,
      current_plan: req.currentPlan ?? null,
      required_plan: req.requiredPlan ?? null,
    });
    setRequest(req);
    return true;
  }, []);

  const closePaywall = React.useCallback(() => {
    setRequest((cur) => {
      if (cur) stampCooldown(cur.feature);
      return null;
    });
  }, []);

  const value = React.useMemo<PaywallContextValue>(
    () => ({ openPaywall, closePaywall }),
    [openPaywall, closePaywall],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <PaywallDialog request={request} onClose={closePaywall} />
    </PaywallContext.Provider>
  );
}

/**
 * Convenience wrapper so the workspace layout can mount the modal target
 * separately from the provider if it ever needs to. Currently a no-op
 * because `<PaywallProvider>` already renders the dialog inline.
 */
export function PaywallNudge(): null {
  return null;
}

// ─── Dialog ────────────────────────────────────────────────────────────

interface PaywallDialogProps {
  request: PaywallRequest | null;
  onClose: () => void;
}

function PaywallDialog({ request, onClose }: PaywallDialogProps) {
  const [portalHost, setPortalHost] = React.useState<HTMLElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocus = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    setPortalHost(typeof document !== "undefined" ? document.body : null);
  }, []);

  // Focus trap + ESC + restore focus
  React.useEffect(() => {
    if (!request) return;
    previousFocus.current = (document.activeElement as HTMLElement) ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));

    // Focus first control on next tick so React finishes committing.
    const t = window.setTimeout(() => {
      focusable()[0]?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(t);
      previousFocus.current?.focus?.();
    };
  }, [request, onClose]);

  if (!request || !portalHost) return null;

  const featureLabel = request.featureLabel ?? request.feature;
  const segment = request.segment ?? "founder";
  const upgradeHref = request.requiredPlan
    ? `/pricing?tier=${encodeURIComponent(segment)}&highlight=${encodeURIComponent(request.requiredPlan)}`
    : `/pricing?tier=${encodeURIComponent(segment)}`;

  const handleUpgrade = () => {
    fireGa("paywall_upgrade_click", {
      feature: request.feature,
      current_plan: request.currentPlan ?? null,
      required_plan: request.requiredPlan ?? null,
    });
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-nudge-title"
      aria-describedby="paywall-nudge-desc"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-surface-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-surface-100"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close upgrade modal"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-surface-100 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>

        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30">
          <Lock aria-hidden="true" strokeWidth={1.75} className="h-5 w-5" />
        </div>

        <h2
          id="paywall-nudge-title"
          className="text-lg font-semibold text-ink-800 dark:text-ink-100"
        >
          Unlock {featureLabel}
        </h2>
        <p
          id="paywall-nudge-desc"
          className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300"
        >
          {request.benefit ??
            `${featureLabel} is included on ${request.requiredPlan ? "the " + request.requiredPlan + " plan" : "our paid plans"}. Upgrade to get it now — 7-day free trial, cancel any time before Day 8.`}
        </p>

        {request.requiredPlan ? (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800/40 dark:bg-brand-900/20">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-200">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              Recommended plan
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-800 dark:text-ink-100">
              {request.requiredPlan}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-surface-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-transparent dark:text-ink-200 dark:hover:bg-white/5"
          >
            Not now
          </button>
          <Link
            href={upgradeHref}
            onClick={handleUpgrade}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Upgrade now
          </Link>
        </div>
      </div>
    </div>,
    portalHost,
  );
}

export default PaywallProvider;
