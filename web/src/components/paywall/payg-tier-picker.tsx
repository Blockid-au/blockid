"use client";

/**
 * PaygTierPicker — the Pricing v5 review-before-pay step (G35 P3, plan §6.4.1).
 *
 * Renders the server-built offer (GET /api/reports/access → `payg`): the
 * three tiers (name, what is included, price, "One-off, inc. GST.",
 * delivery time — Verified "within 2 business days") and, for the owner of
 * a lower tier, the D28 upgrade. Nothing is charged on selection: only the
 * explicit "Confirm & Pay A$X" button posts to /api/reports/checkout (which
 * re-derives the SKU, Stripe Price, ownership and Verified capacity), and
 * "Use N credits" posts to /api/reports/redeem for Snapshot / Full.
 *
 * Analytics (existing wrapper, consent handled by the ingest route):
 *   payg_tier_viewed       once per offer render, per tier shown
 *   payg_checkout_started  the Pay click (never on selection)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { emitClientEvent } from "@/lib/analytics/client-emit";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";
import type { PaygOfferEnabled, PaygTierOffer, PaygUpgradeOffer } from "@/lib/pricing/payg-offer";

export type PaygChoice =
  | { kind: "tier"; offer: PaygTierOffer }
  | { kind: "upgrade"; offer: PaygUpgradeOffer };

export interface PaygTierPickerProps {
  offer: PaygOfferEnabled;
  /** Project the report is booked against. */
  businessId: string;
  /** Analytics surface ("report_paywall_gate", "tbr_unlock_rail", "evaluator_dealflow", …). */
  surface: string;
  /** Current credit balance — enables "Use N credits" for Snapshot / Full. */
  creditBalance?: number;
  /** Hide tiers (e.g. the evaluator dialog offers Full only). */
  onlyTiers?: ReadonlyArray<PaygTierOffer["tier"]>;
  firstTouch?: string;
  /** Called after a credits redeem; default navigates to the order. */
  onRedeemed?(orderId: string): void;
  /**
   * G35 evaluator deal flow: the `evaluations` row the evaluator buys through
   * — sent with the checkout so the server authorises the buyer by it.
   */
  evaluationId?: string;
  /** False hides "Use N credits" (the evaluator's credits run from its own dialog). Default true. */
  allowCredits?: boolean;
}

/** Pure: the choices in display order — upgrades first (cheapest way up), then the available tiers. */
export function paygChoices(offer: PaygOfferEnabled, onlyTiers?: ReadonlyArray<PaygTierOffer["tier"]>): PaygChoice[] {
  const ups: PaygChoice[] = offer.upgrades.map((u) => ({ kind: "upgrade", offer: u }));
  const tiers: PaygChoice[] = offer.tiers
    .filter((t) => !onlyTiers || onlyTiers.includes(t.tier))
    .map((t) => ({ kind: "tier", offer: t }));
  return [...ups, ...tiers];
}

/** Pure: the default selection — the first available upgrade, else Full, else the first available tier. */
export function defaultChoiceIndex(choices: readonly PaygChoice[]): number {
  const up = choices.findIndex((c) => c.kind === "upgrade" && c.offer.available);
  if (up >= 0) return up;
  const full = choices.findIndex((c) => c.kind === "tier" && c.offer.tier === "full" && c.offer.available);
  if (full >= 0) return full;
  return Math.max(0, choices.findIndex((c) => c.offer.available));
}

/** Pure: the checkout request body for a choice (server re-validates everything). */
export function checkoutBodyFor(choice: PaygChoice, businessId: string, firstTouch?: string, evaluationId?: string): Record<string, string> {
  const base: Record<string, string> = { businessId };
  if (firstTouch) base.firstTouch = firstTouch;
  if (evaluationId) base.evaluationId = evaluationId;
  return choice.kind === "upgrade" ? { ...base, upgradeFrom: choice.offer.from } : { ...base, tier: choice.offer.tier };
}

function choiceKey(c: PaygChoice): string {
  return c.kind === "upgrade" ? `up:${c.offer.sku}` : `tier:${c.offer.tier}`;
}

function choiceTitle(c: PaygChoice): string {
  return c.kind === "upgrade" ? `Move up: ${c.offer.name}` : `${c.offer.name} report`;
}

export function PaygTierPicker({ offer, businessId, surface, creditBalance = 0, onlyTiers, firstTouch, onRedeemed, evaluationId, allowCredits = true }: PaygTierPickerProps) {
  const choices = useMemo(() => paygChoices(offer, onlyTiers), [offer, onlyTiers]);
  const [selected, setSelected] = useState(() => defaultChoiceIndex(choices));
  const [pending, setPending] = useState<"checkout" | "redeem" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    for (const c of choices) {
      if (!c.offer.available) continue;
      void emitClientEvent("payg_tier_viewed", {
        tier: c.kind === "upgrade" ? c.offer.to : c.offer.tier,
        sku: c.offer.sku,
        surface,
        amount_cents: c.offer.amountCents,
        is_upgrade: c.kind === "upgrade",
        project_id: businessId,
      });
    }
  }, [choices, surface, businessId]);

  const choice = choices[selected] ?? null;
  const creditCost = allowCredits && choice?.kind === "tier" ? choice.offer.creditCost : null;
  const canUseCredits = creditCost !== null && creditBalance >= creditCost;

  const pay = useCallback(async () => {
    if (!choice || !choice.offer.available) return;
    setPending("checkout");
    setError(null);
    void emitClientEvent("payg_checkout_started", {
      tier: choice.kind === "upgrade" ? choice.offer.to : choice.offer.tier,
      sku: choice.offer.sku,
      surface,
      amount_cents: choice.offer.amountCents,
      is_upgrade: choice.kind === "upgrade",
      project_id: businessId,
    });
    try {
      const res = await fetch("/api/reports/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkoutBodyFor(choice, businessId, firstTouch, evaluationId)),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; reason?: string };
      if (!res.ok || !data.ok || !data.url) {
        setError(userErrorMessage(ApiError.fromBody(res.status, { ...data, error: data.reason }), "Checkout could not start. Please try again."));
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(userErrorMessage(err, "Checkout could not start. Please try again."));
      setPending(null);
    }
  }, [choice, businessId, firstTouch, surface, evaluationId]);

  const redeem = useCallback(async () => {
    if (!choice || choice.kind !== "tier" || creditCost === null) return;
    setPending("redeem");
    setError(null);
    try {
      const res = await fetch("/api/reports/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, tier: choice.offer.tier, ...(firstTouch ? { firstTouch } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; orderId?: string; reason?: string };
      if (!res.ok || !data.ok || !data.orderId) {
        setError(userErrorMessage(ApiError.fromBody(res.status, { ...data, error: data.reason }), "Could not use your credits. Please try again."));
        setPending(null);
        return;
      }
      if (onRedeemed) onRedeemed(data.orderId);
      else window.location.href = reportOrderPath(data.orderId);
    } catch (err) {
      setError(userErrorMessage(err, "Could not use your credits. Please try again."));
      setPending(null);
    }
  }, [choice, creditCost, businessId, firstTouch, onRedeemed]);

  if (choices.length === 0) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="payg-tier-picker">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Choose a report</legend>
        {choices.map((c, i) => {
          const id = `payg-choice-${choiceKey(c)}`;
          const checked = i === selected;
          return (
            <label
              key={choiceKey(c)}
              htmlFor={id}
              data-payg-choice={choiceKey(c)}
              className={`flex cursor-pointer flex-col gap-2 rounded-xl border px-4 py-3 text-sm transition-colors ${
                checked ? "border-action bg-surface-sunken" : "border-line-subtle bg-surface hover:bg-surface-sunken"
              } ${c.offer.available ? "" : "cursor-not-allowed opacity-60"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2">
                  <input
                    id={id}
                    type="radio"
                    name="payg-choice"
                    className="h-4 w-4"
                    checked={checked}
                    disabled={!c.offer.available || pending !== null}
                    onChange={() => setSelected(i)}
                  />
                  <span className="font-semibold text-primary">{choiceTitle(c)}</span>
                </span>
                <span className="text-right">
                  <span className="font-mono text-base font-semibold tabular-nums text-primary">{c.offer.priceLabel}</span>
                  <span className="block text-xs text-secondary">{offer.billingNote}</span>
                </span>
              </span>
              <span className="text-xs text-secondary">Delivery: {c.offer.delivery}</span>
              <ul className="grid gap-1 text-xs text-secondary sm:grid-cols-2">
                {c.offer.included.map((line) => (
                  <li key={line} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" strokeWidth={2.5} aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {!c.offer.available && c.offer.unavailableReason ? <span className="text-xs text-warn">{c.offer.unavailableReason}</span> : null}
            </label>
          );
        })}
      </fieldset>

      {choice ? (
        <p className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-sm text-primary" data-testid="payg-summary">
          {choiceTitle(choice)} · <strong className="font-mono tabular-nums">{choice.offer.priceLabel}</strong> · {offer.billingNote} · {choice.offer.delivery}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-bear">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          onClick={pay}
          disabled={pending !== null || !choice || !choice.offer.available}
          aria-label={choice ? `Confirm and pay ${choice.offer.priceLabel} inc. GST via Stripe for the ${choiceTitle(choice)}` : "Confirm and pay"}
          data-testid="payg-pay"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-action px-4 py-2 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "checkout" ? "Redirecting to Stripe…" : `Confirm & Pay ${choice?.offer.priceLabel ?? ""}`}
        </button>
        {creditCost !== null ? (
          <button
            type="button"
            onClick={redeem}
            disabled={pending !== null || !canUseCredits}
            aria-label={`Confirm and use ${creditCost} credits`}
            data-testid="payg-redeem"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line-subtle bg-surface px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "redeem" ? "Using credits…" : `Use ${creditCost} credits`}
          </button>
        ) : null}
      </div>
      {creditCost !== null && !canUseCredits ? (
        <p className="text-xs text-secondary">
          Your balance is {creditBalance.toLocaleString("en-AU")} credits — {creditCost} needed to use credits instead of a card.
        </p>
      ) : null}
    </div>
  );
}

export default PaygTierPicker;
