import "server-only";

import { ConnectorHttpError } from "@/lib/connectors/http-error";

export interface StripeSignals {
  mrrAud: number;
  activeCustomers: number;
  recentPayments30d: number;
  averageOrderAud: number;
}

// Conservative FX rates for signal normalisation. Deliberately below spot so
// USD/EUR/GBP MRR translates to a lower AUD figure — under-promise on
// evidence rather than inflate it. Refresh via cron in a future pass.
const FX_TO_AUD: Record<string, number> = {
  aud: 1,
  usd: 0.65,
  eur: 0.6,
  gbp: 0.5,
  cad: 0.65,
  nzd: 0.9,
  sgd: 0.7,
};

function toAud(amountMinor: number, currency: string): number {
  const rate = FX_TO_AUD[currency.toLowerCase()] ?? 0.5;
  return (amountMinor / 100) * (1 / rate);
}

interface StripeSubscription {
  status: string;
  canceled_at?: number | null;
  items: {
    data: Array<{
      quantity?: number;
      price: {
        unit_amount: number | null;
        currency: string;
        recurring: { interval: "day" | "week" | "month" | "year" } | null;
      };
    }>;
  };
}

interface StripeCharge {
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  created: number;
}

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}

async function stripeGet<T>(
  path: string,
  accessToken: string,
): Promise<StripeList<T> | null> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as StripeList<T>;
}

function subscriptionMrrAud(sub: StripeSubscription): number {
  let total = 0;
  for (const item of sub.items.data) {
    const unit = item.price.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    const currency = item.price.currency;
    const interval = item.price.recurring?.interval ?? "month";
    const perMonthFactor =
      interval === "year"
        ? 1 / 12
        : interval === "week"
          ? 4.345
          : interval === "day"
            ? 30
            : 1;
    total += toAud(unit * qty, currency) * perMonthFactor;
  }
  return total;
}

export async function fetchStripeSignals(
  accessToken: string,
): Promise<StripeSignals> {
  const [subs, customers, charges] = await Promise.all([
    stripeGet<StripeSubscription>(
      "/v1/subscriptions?limit=100&status=active",
      accessToken,
    ),
    stripeGet<{ id: string }>("/v1/customers?limit=100", accessToken),
    stripeGet<StripeCharge>(
      `/v1/charges?limit=100&created[gte]=${Math.floor(
        (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000,
      )}`,
      accessToken,
    ),
  ]);

  const mrrAud =
    subs?.data.reduce((sum, s) => sum + subscriptionMrrAud(s), 0) ?? 0;

  const activeCustomers = customers?.data.length ?? 0;

  const successfulCharges =
    charges?.data.filter((c) => c.paid && !c.refunded && c.status === "succeeded") ?? [];

  const recentPayments30d = successfulCharges.length;

  const totalAud = successfulCharges.reduce(
    (sum, c) => sum + toAud(c.amount, c.currency),
    0,
  );
  const averageOrderAud =
    recentPayments30d > 0 ? totalAud / recentPayments30d : 0;

  return {
    mrrAud: Math.round(mrrAud * 100) / 100,
    activeCustomers,
    recentPayments30d,
    averageOrderAud: Math.round(averageOrderAud * 100) / 100,
  };
}

// ── S25-A — Stripe Connect resync metrics ───────────────────────────────────
//
// The weekly `api/cron/connector-resync` re-pulls what the callbacks pull
// (MRR + active subscriptions + customers) and adds the 90-day subscription
// churn the SVI contribution table (lib/svi/connected-revenue-score.ts)
// penalises. Same REST seam as `fetchStripeSignals` — the connected
// account's own OAuth access token as bearer, never the platform key.

export interface StripeConnectMetrics {
  mrrAud: number;
  arrAud: number;
  activeSubscriptions: number;
  activeCustomers: number;
  /** Subscriptions whose `canceled_at` falls in the last 90 days. */
  churnedSubscriptions90d: number;
  /** churned / (active + churned) × 100, one decimal; null when there is no base. */
  churnRate90dPct: number | null;
  /** Dominant subscription currency (lower-case ISO), "aud" when unknown. */
  currency: string;
}

export const STRIPE_CHURN_WINDOW_DAYS = 90;

/** Pure: fold subscription lists into the resync metrics (exported for tests). */
export function stripeConnectMetricsFrom(
  active: StripeSubscription[],
  canceled: StripeSubscription[],
  customerCount: number,
  now: number = Date.now(),
): StripeConnectMetrics {
  const since = Math.floor(now / 1000) - STRIPE_CHURN_WINDOW_DAYS * 24 * 60 * 60;
  const mrr = active.reduce((sum, s) => sum + subscriptionMrrAud(s), 0);
  const churned = canceled.filter((s) => typeof s.canceled_at === "number" && s.canceled_at >= since).length;
  const base = active.length + churned;
  const currencies = new Map<string, number>();
  for (const s of active) {
    for (const item of s.items.data) {
      const c = (item.price.currency ?? "aud").toLowerCase();
      currencies.set(c, (currencies.get(c) ?? 0) + 1);
    }
  }
  let currency = "aud";
  let best = 0;
  for (const [c, n] of currencies) {
    if (n > best) {
      best = n;
      currency = c;
    }
  }
  const mrrAud = Math.round(mrr * 100) / 100;
  return {
    mrrAud,
    arrAud: Math.round(mrrAud * 12 * 100) / 100,
    activeSubscriptions: active.length,
    activeCustomers: customerCount,
    churnedSubscriptions90d: churned,
    churnRate90dPct: base > 0 ? Math.round((churned / base) * 1000) / 10 : null,
    currency,
  };
}

/**
 * Strict GET for the resync: a non-2xx THROWS `ConnectorHttpError` instead
 * of degrading to an empty list. The weekly worker stores what this returns
 * as a dated snapshot and rescores on it, so "Stripe said 401/429/500" must
 * never be recorded as "MRR 0". (`fetchStripeSignals` above keeps the lenient
 * shape for the one-shot link-time pull.)
 */
async function stripeGetStrict<T>(path: string, accessToken: string, resource: string): Promise<StripeList<T>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new ConnectorHttpError("stripe", res.status, resource);
  return (await res.json()) as StripeList<T>;
}

/** Throws `ConnectorHttpError` on any non-2xx from Stripe (S25-review). */
export async function fetchStripeConnectMetrics(accessToken: string): Promise<StripeConnectMetrics> {
  const since = Math.floor(Date.now() / 1000) - STRIPE_CHURN_WINDOW_DAYS * 24 * 60 * 60;
  const [active, canceled, customers] = await Promise.all([
    stripeGetStrict<StripeSubscription>("/v1/subscriptions?limit=100&status=active", accessToken, "subscriptions"),
    // `created` bounds the canceled list to subscriptions young enough to
    // have churned inside the window (created ≤ 1 y before the window opens
    // is a generous floor); `canceled_at` is filtered client-side.
    stripeGetStrict<StripeSubscription>(
      `/v1/subscriptions?limit=100&status=canceled&created[gte]=${since - 365 * 24 * 60 * 60}`,
      accessToken,
      "subscriptions",
    ),
    stripeGetStrict<{ id: string }>("/v1/customers?limit=100", accessToken, "customers"),
  ]);
  return stripeConnectMetricsFrom(active.data ?? [], canceled.data ?? [], customers.data?.length ?? 0);
}
