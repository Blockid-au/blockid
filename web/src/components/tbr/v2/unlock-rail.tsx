"use client";

// G16-B — the ONE unlock rail on a free Trusted Business Report. Rendered by
// <TbrReportV2> exactly once (after the first locked chapter), it states the
// one-off price from the pricing source of truth and hands off to the
// existing quote-then-pay flow (<ReportPaywallGate>: credits + A$ shown, an
// explicit confirm, then Stripe). It never charges anything itself.
//
// Three modes:
//   buy        free founder → "Unlock … — A$3 (one-off)" button → onUnlock()
//   included   plan carries the report → "Included in your plan — generate"
//   purchased  a paid report_orders row exists:
//                orderStatus "pending" → "being written" (no link; the page polls)
//                orderStatus "legacy"  → "Open the text version" (pre-v2 order)
//                orderStatus "ready"   → "Open your full report" → reportOrderPath
//              G19-S45 (D4): when the paid ReportV2 is ready the page renders
//              it in place and no rail is shown at all.
//
// G19-S45: every label comes from lib/i18n/tbr-strings.ts (§v2.rail).
//
// G35 Pricing v5 (P3): with `payg` set (payg_enabled), buy mode reads
// "Get the report — Snapshot, Full or Verified, from A$19 (one-off)" and the
// CTA opens the tier picker; the owner of a Snapshot sees "Move up to Full —
// A$30" plus a link to the Snapshot they own. Without `payg` → unchanged.

import { Lock, Check, ArrowRight, Loader2 } from "lucide-react";
import { legacyReportOrderPath, reportOrderPath } from "@/lib/paywall/report-delivery";
import type { PaygOffer } from "@/lib/pricing/payg-offer";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { v2Strings, type TbrUiLocale } from "./shared";

export type TbrUnlockMode = "buy" | "included" | "purchased";

/** G35: what the rail needs from the Pricing v5 offer. */
export interface TbrUnlockPayg {
  /** Cheapest tier on sale ("A$19"). */
  fromPriceLabel: string;
  /** D28 upgrade the owner can buy (Snapshot → Full), if any. */
  upgrade: { fromName: string; toName: string; priceLabel: string } | null;
  /** The Snapshot order the founder owns (served on its own order page). */
  snapshotOrderId: string | null;
}

/** Pure: rail info from the access route's offer (null when PAYG is off or nothing is on sale). */
export function tbrUnlockPaygFromOffer(offer: PaygOffer | null | undefined, snapshotOrderId: string | null = null): TbrUnlockPayg | null {
  if (!offer || !offer.enabled) return null;
  const available = offer.tiers.filter((t) => t.available);
  if (available.length === 0 && offer.upgrades.length === 0) return null;
  const cheapest = [...available].sort((a, b) => a.amountCents - b.amountCents)[0];
  const up = offer.upgrades.find((u) => u.available && u.from === "snapshot") ?? null;
  return {
    fromPriceLabel: cheapest?.priceLabel ?? "",
    upgrade: up ? { fromName: "Snapshot", toName: "Full", priceLabel: up.priceLabel } : null,
    snapshotOrderId,
  };
}
export type TbrUnlockOrderStatus = "pending" | "ready" | "legacy";

export interface TbrUnlockRailProps {
  mode: TbrUnlockMode;
  /** Dimension chapters in the full report (the "what you get" count). */
  chapterCount: number;
  /** buy: opens the confirm-before-charge modal. */
  onUnlock?: () => void;
  /** purchased: the paid order to open. */
  orderId?: string | null;
  /** purchased: where the order stands (default "ready"). */
  orderStatus?: TbrUnlockOrderStatus;
  /** included: where the plan-included report is generated (defaults to the deck analyser). */
  generateHref?: string;
  locale?: TbrUiLocale;
  /** G35 Pricing v5 rail (payg_enabled). */
  payg?: TbrUnlockPayg | null;
}

export const TBR_UNLOCK_RAIL_TESTID = "tbr-unlock-rail";

export function tbrUnlockHeadline(mode: TbrUnlockMode, locale: TbrUiLocale = "en", orderStatus: TbrUnlockOrderStatus = "ready", payg: TbrUnlockPayg | null = null): string {
  const t = v2Strings(locale).rail;
  const price = trustReportPriceLabel();
  if (mode === "included") return t.headlineIncluded;
  if (mode === "purchased") return orderStatus === "pending" ? t.headlinePending : t.headlinePurchased;
  if (payg?.upgrade) return t.headlineMoveUp(payg.upgrade.fromName, payg.upgrade.toName);
  if (payg) return t.headlineBuyPayg(payg.fromPriceLabel);
  return t.headlineBuy(price);
}

/** purchased: where the CTA goes — the ReportV2 page for a ready order, the thin markdown wrapper for a pre-v2 one. */
export function tbrUnlockOrderHref(orderId: string | null | undefined, orderStatus: TbrUnlockOrderStatus = "ready"): string {
  if (!orderId) return "/workspace/reports/order";
  return orderStatus === "legacy" ? legacyReportOrderPath(orderId) : reportOrderPath(orderId);
}

export function TbrUnlockRail({ mode, chapterCount, onUnlock, orderId, orderStatus = "ready", generateHref = "/workspace/raise/deck", locale = "en", payg = null }: TbrUnlockRailProps) {
  const t = v2Strings(locale).rail;
  const price = trustReportPriceLabel();
  const perks = t.perks(chapterCount);
  return (
    <aside
      data-testid={TBR_UNLOCK_RAIL_TESTID}
      data-tbr-unlock={mode}
      data-tbr-order-status={mode === "purchased" ? orderStatus : undefined}
      data-tbr-payg={payg ? "on" : undefined}
      aria-label={t.ariaLabel}
      className="sticky top-16 z-10 rounded-2xl border border-brand-300 dark:border-brand-800 bg-surface-sunken p-5 shadow-lg backdrop-blur print:hidden"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-2 text-base font-bold text-primary">
            {mode === "purchased" && orderStatus === "pending" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-action" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4 shrink-0 text-action" strokeWidth={2} aria-hidden="true" />
            )}
            {tbrUnlockHeadline(mode, locale, orderStatus, payg)}
          </p>
          <ul className="grid gap-1 text-xs text-secondary sm:grid-cols-2">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" strokeWidth={2.5} aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 md:w-64">
          {mode === "buy" ? (
            <>
              <button
                type="button"
                onClick={onUnlock}
                data-testid="tbr-unlock-cta"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {payg?.upgrade ? t.moveUpFor(payg.upgrade.toName, payg.upgrade.priceLabel) : payg ? t.chooseReport : t.unlockFor(price)}
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
              <p className="text-center text-xs text-secondary">{payg ? t.paygNote : t.confirmNote}</p>
              {payg?.snapshotOrderId ? (
                <a
                  href={reportOrderPath(payg.snapshotOrderId)}
                  data-testid="tbr-open-snapshot"
                  className="text-center text-xs font-semibold text-action underline underline-offset-2"
                >
                  {t.openSnapshot}
                </a>
              ) : null}
            </>
          ) : mode === "included" ? (
            <>
              <a
                href={generateHref}
                data-testid="tbr-unlock-cta"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
              >
                {t.includedGenerate}
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </a>
              <p className="text-center text-xs text-secondary">{t.includedNote}</p>
            </>
          ) : orderStatus === "pending" ? (
            <p data-testid="tbr-unlock-pending" role="status" aria-live="polite" className="rounded-xl border border-brand-300 dark:border-brand-800 bg-surface/70 px-3 py-2 text-center text-xs text-secondary">
              {t.pendingNote}
            </p>
          ) : (
            <a
              href={tbrUnlockOrderHref(orderId, orderStatus)}
              data-testid="tbr-unlock-cta"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
            >
              {orderStatus === "legacy" ? t.openLegacy : t.openFull}
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
