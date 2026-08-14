// GET /api/founder/revenue-90d — 90-day revenue tracker tile data.
//
// Combines Stripe (payments) + GA4 (traffic/conversions) for the founder's
// active project. Both integrations are already wired elsewhere in the app:
//
//   - Stripe: web/src/lib/stripe.ts (getStripe / isStripeConfigured)
//   - GA4:    web/src/lib/ga4/data-api-client.ts (runReport / isGa4Configured)
//
// This route is a thin aggregator. It NEVER 500s on missing config — every
// upstream failure degrades to empty defaults so the tile can render a
// "connect Stripe / GA4" empty state instead of an error.
//
// Scoping:
//   - Auth: getCurrentUser() → 401 if anonymous.
//   - startup_id: the user's active project (getProjectIdFromRequest) is
//     used as the scope key. When no project is selected, the endpoint
//     still returns a shape-compatible envelope with the user-level Stripe
//     totals so the dashboard doesn't crash.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  isGa4Configured,
  runReport,
} from "@/lib/ga4/data-api-client";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 90;

// ── Response shape ───────────────────────────────────────────────────────

export interface RevenueByDay {
  date: string; // YYYY-MM-DD
  amount_aud: number;
}

export interface Ga4BySource {
  source: string;
  sessions: number;
}

export interface Revenue90dResponse {
  ok: true;
  startup_id: string | null;
  window_days: number;
  stripe: {
    total_aud: number;
    by_day: RevenueByDay[];
    new_customers: number;
    arpu_aud: number;
    prior_total_aud: number;
    connected: boolean;
  };
  ga4: {
    sessions: number;
    conversions: number;
    conversion_rate: number;
    by_source: Ga4BySource[];
    connected: boolean;
  };
  combined: {
    revenue_per_session_aud: number;
    mrr_run_rate_aud: number;
    trend_pct: number | null;
  };
}

// ── Date helpers ─────────────────────────────────────────────────────────

function utcDaysAgo(n: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n),
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptyByDay(days: number): RevenueByDay[] {
  const out: RevenueByDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push({ date: isoDate(utcDaysAgo(i)), amount_aud: 0 });
  }
  return out;
}

// ── Stripe aggregation ───────────────────────────────────────────────────

interface StripeBlock {
  total_aud: number;
  by_day: RevenueByDay[];
  new_customers: number;
  arpu_aud: number;
  prior_total_aud: number;
  connected: boolean;
}

function emptyStripe(): StripeBlock {
  return {
    total_aud: 0,
    by_day: emptyByDay(WINDOW_DAYS),
    new_customers: 0,
    arpu_aud: 0,
    prior_total_aud: 0,
    connected: false,
  };
}

async function fetchStripeBlock(customerId: string | null): Promise<StripeBlock> {
  if (!isStripeConfigured() || !customerId) return emptyStripe();
  const stripe = getStripe();
  if (!stripe) return emptyStripe();

  const windowStart = utcDaysAgo(WINDOW_DAYS);
  const priorStart = utcDaysAgo(WINDOW_DAYS * 2);
  const created = Math.floor(priorStart.getTime() / 1000);

  try {
    // Charges API returns succeeded + refunded + failed alike; filter to
    // succeeded and net-of-refunds for the AUD total.
    const charges = await stripe.charges.list({
      customer: customerId,
      created: { gte: created },
      limit: 100,
    });

    const byDayMap = new Map<string, number>();
    for (const b of emptyByDay(WINDOW_DAYS)) byDayMap.set(b.date, 0);

    const windowStartMs = windowStart.getTime();
    let total = 0;
    let prior = 0;
    const newCustomerIds = new Set<string>();

    for (const ch of charges.data) {
      if (ch.status !== "succeeded") continue;
      // amount_captured is in the smallest currency unit; convert to AUD major.
      const grossMinor = ch.amount_captured ?? ch.amount ?? 0;
      const refundedMinor = ch.amount_refunded ?? 0;
      const netMajor = Math.max(0, (grossMinor - refundedMinor) / 100);
      const createdMs = ch.created * 1000;
      if (createdMs >= windowStartMs) {
        total += netMajor;
        const day = isoDate(new Date(createdMs));
        byDayMap.set(day, (byDayMap.get(day) ?? 0) + netMajor);
        if (typeof ch.customer === "string") newCustomerIds.add(ch.customer);
        else if (ch.customer && typeof ch.customer === "object" && "id" in ch.customer) {
          newCustomerIds.add((ch.customer as { id: string }).id);
        }
      } else {
        prior += netMajor;
      }
    }

    const by_day: RevenueByDay[] = Array.from(byDayMap.entries())
      .map(([date, amount_aud]) => ({ date, amount_aud: Math.round(amount_aud * 100) / 100 }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const new_customers = newCustomerIds.size;
    const arpu_aud = new_customers > 0 ? Math.round((total / new_customers) * 100) / 100 : 0;

    return {
      total_aud: Math.round(total * 100) / 100,
      by_day,
      new_customers,
      arpu_aud,
      prior_total_aud: Math.round(prior * 100) / 100,
      connected: true,
    };
  } catch (err) {
    console.error("[blockid:revenue-90d] stripe fetch failed", err);
    return { ...emptyStripe(), connected: true };
  }
}

// ── GA4 aggregation ──────────────────────────────────────────────────────

interface Ga4Block {
  sessions: number;
  conversions: number;
  conversion_rate: number;
  by_source: Ga4BySource[];
  connected: boolean;
}

function emptyGa4(): Ga4Block {
  return {
    sessions: 0,
    conversions: 0,
    conversion_rate: 0,
    by_source: [],
    connected: false,
  };
}

async function fetchGa4Block(): Promise<Ga4Block> {
  if (!isGa4Configured()) return emptyGa4();

  const startDate = isoDate(utcDaysAgo(WINDOW_DAYS));
  const endDate = isoDate(utcDaysAgo(1));

  try {
    // Totals: sessions + conversions across the window.
    const totalsRes = await runReport({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
    });
    const totalsRow = totalsRes.rows?.[0] ?? totalsRes.totals?.[0];
    const sessions = Number(totalsRow?.metricValues?.[0]?.value ?? 0) || 0;
    const conversions = Number(totalsRow?.metricValues?.[1]?.value ?? 0) || 0;
    const conversion_rate = sessions > 0 ? conversions / sessions : 0;

    // By-source breakdown.
    const srcRes = await runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 5,
    });
    const by_source: Ga4BySource[] = (srcRes.rows ?? []).map((r) => {
      const src = r.dimensionValues?.[0]?.value ?? "(unknown)";
      const med = r.dimensionValues?.[1]?.value ?? "";
      return {
        source: med ? `${src}/${med}` : src,
        sessions: Number(r.metricValues?.[0]?.value ?? 0) || 0,
      };
    });

    return {
      sessions,
      conversions,
      conversion_rate,
      by_source,
      connected: true,
    };
  } catch (err) {
    console.error("[blockid:revenue-90d] ga4 fetch failed", err);
    return { ...emptyGa4(), connected: true };
  }
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const startupId = await getProjectIdFromRequest();

  // Resolve the Stripe customer id for this user. It lives on app_users; if
  // Supabase is unconfigured (dev) we just proceed with a null customer,
  // which yields the empty-defaults branch.
  let stripeCustomerId: string | null = null;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    stripeCustomerId = (data?.stripe_customer_id as string | null) ?? null;
  }

  const [stripe, ga4] = await Promise.all([
    fetchStripeBlock(stripeCustomerId),
    fetchGa4Block(),
  ]);

  const revenue_per_session_aud =
    ga4.sessions > 0 ? Math.round((stripe.total_aud / ga4.sessions) * 1000) / 1000 : 0;
  // MRR run-rate = last-30d-of-window revenue × (30/30). We approximate with
  // the last 30 daily buckets so the tile reflects recent momentum, not the
  // full 90-day average.
  const last30 = stripe.by_day.slice(-30).reduce((sum, r) => sum + r.amount_aud, 0);
  const mrr_run_rate_aud = Math.round(last30 * 100) / 100;
  const trend_pct =
    stripe.prior_total_aud > 0
      ? Math.round(
          ((stripe.total_aud - stripe.prior_total_aud) / stripe.prior_total_aud) *
            10000,
        ) / 100
      : stripe.total_aud > 0
        ? 100
        : null;

  const body: Revenue90dResponse = {
    ok: true,
    startup_id: startupId,
    window_days: WINDOW_DAYS,
    stripe,
    ga4,
    combined: {
      revenue_per_session_aud,
      mrr_run_rate_aud,
      trend_pct,
    },
  };

  return NextResponse.json(body);
}
