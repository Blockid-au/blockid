"use client";

// usePaygPricing — client read of GET /api/pricing/payg (G35 P3).
//
// `status: "loading"` until the answer lands; "error" when it could not be
// read. Surfaces that show a price MUST NOT show the legacy A$3 on "error"
// (the server may be charging v5) — they disable the pay button instead.

import { useEffect, useState } from "react";
import type { PaygTierOffer } from "./payg-offer";

export interface PublicPaygPricing {
  enabled: boolean;
  billingNote?: string;
  slaBusinessDays?: number;
  tiers?: PaygTierOffer[];
  funding?: { sku: string; amountCents: number; priceLabel: string; credits: number | null };
}

export type PaygPricingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; pricing: PublicPaygPricing };

export const PAYG_PRICING_PATH = "/api/pricing/payg";

export async function fetchPaygPricing(f: typeof fetch = fetch): Promise<PublicPaygPricing | null> {
  try {
    const res = await f(PAYG_PRICING_PATH, { credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as (PublicPaygPricing & { ok?: boolean }) | null;
    if (!body || body.ok !== true || typeof body.enabled !== "boolean") return null;
    return body;
  } catch {
    return null;
  }
}

export function usePaygPricing(): PaygPricingState {
  const [state, setState] = useState<PaygPricingState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    void fetchPaygPricing().then((pricing) => {
      if (cancelled) return;
      setState(pricing ? { status: "ready", pricing } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
