// OAuth evidence connector: Stripe Connect callback
//
// Exchanges the OAuth code for an access token, fetches the connected
// Stripe account's balance/customers/subscriptions, then:
//   1. Saves the connection in oauth_connections
//   2. Creates evidence items in svi_evidence (connected_source, 75% confidence)
//   3. Triggers an SVI rescore
//
// Evidence items created:
//   - Stripe revenue (MRR, total) → TRE (traction)
//   - Customer count → MPC (market penetration)

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";

  if (errorParam) {
    return NextResponse.redirect(
      `${siteUrl}/workspace/evidence?error=stripe_${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_missing_code`);
  }

  let stateData: { email?: string; csrf?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_invalid_state`);
  }

  const email = stateData.email;
  if (!email) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_no_email`);
  }

  // Verify CSRF
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  if (!stateData.csrf || stateData.csrf !== sessionToken.slice(0, 16)) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_csrf_mismatch`);
  }

  const platformSecretKey = process.env.STRIPE_SECRET_KEY;
  const clientSecret = process.env.STRIPE_CLIENT_SECRET ?? process.env.STRIPE_SECRET_KEY;
  if (!platformSecretKey || !clientSecret) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_not_configured`);
  }

  try {
    // 1. Exchange code for access token via Stripe Connect
    const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: clientSecret,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token || !tokenData.stripe_user_id) {
      console.error("[blockid:oauth:stripe] token exchange failed", tokenData);
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_token_failed`);
    }

    const accessToken: string = tokenData.access_token;
    const stripeUserId: string = tokenData.stripe_user_id;

    // 2. Fetch account data using the connected account's access token
    const stripe = new Stripe(accessToken);

    // Get account info
    const account = await stripe.accounts.retrieve(stripeUserId);

    // Fetch balance using the connected account header
    const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeUserId });
    const availableAud = balance.available.find((b) => b.currency === "aud");
    const availableUsd = balance.available.find((b) => b.currency === "usd");
    const availableBalance = availableAud ?? availableUsd ?? balance.available[0];

    // Fetch recent charges (last 90 days) for revenue signal
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
    const charges = await stripe.charges.list(
      { created: { gte: ninetyDaysAgo }, limit: 100 },
      { stripeAccount: stripeUserId },
    );

    let revenueNinetyDayCents = 0;
    for (const charge of charges.data) {
      if (charge.status === "succeeded" && !charge.refunded) {
        revenueNinetyDayCents += charge.amount;
      }
    }

    // Fetch active subscriptions
    const subscriptions = await stripe.subscriptions.list(
      { status: "active", limit: 100 },
      { stripeAccount: stripeUserId },
    );
    let mrrCents = 0;
    for (const sub of subscriptions.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        const qty = item.quantity ?? 1;
        if (price.recurring) {
          const unitAmount = price.unit_amount ?? 0;
          switch (price.recurring.interval) {
            case "month": mrrCents += unitAmount * qty; break;
            case "year": mrrCents += Math.round((unitAmount * qty) / 12); break;
            case "week": mrrCents += Math.round((unitAmount * qty * 52) / 12); break;
            case "day": mrrCents += Math.round((unitAmount * qty * 365) / 12); break;
          }
        }
      }
    }

    // Estimate customer count
    const customers = await stripe.customers.list(
      { limit: 100 },
      { stripeAccount: stripeUserId },
    );
    const customerCount = customers.data.length;

    const mrr = mrrCents / 100;
    const revenue90d = revenueNinetyDayCents / 100;
    const currency = availableBalance?.currency ?? "usd";

    const mrrDisplay = mrr >= 1000 ? `$${(mrr / 1000).toFixed(1)}k` : `$${mrr.toFixed(0)}`;
    const revenueDisplay = revenue90d >= 1000 ? `$${(revenue90d / 1000).toFixed(1)}k` : `$${revenue90d.toFixed(0)}`;

    // 3. Calculate SVI impact based on revenue signals
    let sviImpact = 12; // base: connected
    if (mrr > 10000) sviImpact = 25;
    else if (mrr > 1000) sviImpact = 20;
    else if (mrr > 0) sviImpact = 16;
    else if (revenue90d > 0) sviImpact = 14;

    const label = mrr > 0
      ? `Stripe: MRR ${mrrDisplay}, ${customerCount} customers`
      : `Stripe: ${revenueDisplay} revenue (90d), ${customerCount} customers`;

    // 4. Save to database
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_db_unavailable`);
    }

    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(email, projectId);
    if (!accountId) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_account_failed`);
    }

    // Save OAuth connection
    await supabase.from("oauth_connections").upsert(
      {
        account_id: accountId,
        provider: "stripe",
        provider_user_id: stripeUserId,
        access_token: accessToken,
        raw_profile: JSON.stringify({
          stripe_user_id: stripeUserId,
          business_name: account.business_profile?.name,
          country: account.country,
          currency,
        }),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "account_id,provider" },
    );

    // Upsert traction evidence (TRE)
    const { data: existingTre } = await supabase
      .from("svi_evidence")
      .select("id")
      .eq("account_id", accountId)
      .eq("evidence_type", "stripe")
      .eq("dimension", "tre")
      .maybeSingle();

    const trePayload = {
      account_id: accountId,
      evidence_type: "stripe" as const,
      label,
      value_or_url: JSON.stringify({
        mrr,
        revenue90d,
        customerCount,
        subscriptionCount: subscriptions.data.length,
        currency,
        connectedAt: new Date().toISOString(),
      }),
      confidence_level: "connected_source" as const,
      dimension: "tre",
      svi_impact: sviImpact,
      verified_at: new Date().toISOString(),
    };

    if (existingTre) {
      await supabase.from("svi_evidence").update(trePayload).eq("id", existingTre.id);
    } else {
      await supabase.from("svi_evidence").insert({ ...trePayload, created_at: new Date().toISOString() });
    }

    // Upsert market penetration evidence (MPC) if has customers
    if (customerCount > 0) {
      const { data: existingMpc } = await supabase
        .from("svi_evidence")
        .select("id")
        .eq("account_id", accountId)
        .eq("evidence_type", "stripe")
        .eq("dimension", "mpc")
        .maybeSingle();

      const mpcImpact = Math.min(12, Math.max(5, Math.floor(Math.log10(customerCount + 1) * 5)));
      const mpcPayload = {
        account_id: accountId,
        evidence_type: "stripe" as const,
        label: `Stripe Customers: ${customerCount} paying customer${customerCount === 1 ? "" : "s"}`,
        value_or_url: String(customerCount),
        confidence_level: "connected_source" as const,
        dimension: "mpc",
        svi_impact: mpcImpact,
        verified_at: new Date().toISOString(),
      };

      if (existingMpc) {
        await supabase.from("svi_evidence").update(mpcPayload).eq("id", existingMpc.id);
      } else {
        await supabase.from("svi_evidence").insert({ ...mpcPayload, created_at: new Date().toISOString() });
      }
    }

    // 5. Trigger SVI rescore
    const cookieHeader = request.headers.get("cookie") ?? "";
    void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});

    return NextResponse.redirect(`${siteUrl}/workspace/evidence?connected=stripe`);
  } catch (err) {
    console.error("[blockid:oauth:stripe] callback error", err);
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=stripe_failed`);
  }
}
