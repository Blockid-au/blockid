import "server-only";

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
