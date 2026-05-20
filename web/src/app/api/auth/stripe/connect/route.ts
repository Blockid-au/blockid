import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Authenticate via session cookie → returns { userId, email } or null
async function authenticateRequest(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value;
  if (!sessionToken) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", session.user_id)
    .single();
  if (!user) return null;

  return { userId: user.id as string, email: user.email as string };
}

// Find or create svi_account by email, return account id
async function findOrCreateAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({ email, last_active_at: new Date().toISOString() })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:stripe] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

export async function POST(request: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { ok: false, error: "Stripe not configured" },
        { status: 503 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    const auth = await authenticateRequest(supabase);
    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const stripe = new Stripe(secretKey);

    // Search for customer by email
    const customers = await stripe.customers.list({
      email: auth.email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No Stripe customer found for this email" },
        { status: 404 },
      );
    }

    const customer = customers.data[0];
    const customerId = customer.id;

    // Fetch subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 100,
    });

    // Calculate MRR from active subscriptions
    let mrrCents = 0;
    for (const sub of subscriptions.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        const qty = item.quantity ?? 1;
        if (price.recurring) {
          const unitAmount = price.unit_amount ?? 0;
          switch (price.recurring.interval) {
            case "month":
              mrrCents += unitAmount * qty;
              break;
            case "year":
              mrrCents += Math.round((unitAmount * qty) / 12);
              break;
            case "week":
              mrrCents += Math.round((unitAmount * qty * 52) / 12);
              break;
            case "day":
              mrrCents += Math.round((unitAmount * qty * 365) / 12);
              break;
          }
        }
      }
    }

    // Fetch total revenue from charges (last 12 months)
    const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
    let totalRevenueCents = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const charges: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list({
        customer: customerId,
        created: { gte: twelveMonthsAgo },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const charge of charges.data) {
        if (charge.status === "succeeded" && !charge.refunded) {
          totalRevenueCents += charge.amount;
        }
      }

      hasMore = charges.has_more;
      if (charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    // Count unique customers (search all customers, limited scope)
    const allCustomers = await stripe.customers.list({ limit: 100 });
    const customerCount = allCustomers.data.length;

    const subscriptionCount = subscriptions.data.length;
    const mrr = mrrCents / 100;
    const totalRevenue = totalRevenueCents / 100;

    // Format for display
    const mrrDisplay = mrr >= 1000
      ? `$${(mrr / 1000).toFixed(1)}k`
      : `$${mrr.toFixed(0)}`;

    const label = `Stripe: MRR ${mrrDisplay}, ${customerCount} customers`;

    // Find or create account
    const accountId = await findOrCreateAccount(supabase, auth.email);
    if (!accountId) {
      return NextResponse.json(
        { ok: false, error: "Failed to resolve account" },
        { status: 500 },
      );
    }

    // Check if Stripe evidence already exists for this account
    const { data: existingEvidence } = await supabase
      .from("svi_evidence")
      .select("id")
      .eq("account_id", accountId)
      .eq("evidence_type", "stripe")
      .maybeSingle();

    if (existingEvidence) {
      // Update existing evidence
      const { error: updateError } = await supabase
        .from("svi_evidence")
        .update({
          label,
          value_or_url: JSON.stringify({
            mrr,
            totalRevenue,
            customerCount,
            subscriptionCount,
            currency: customer.currency ?? "usd",
            connectedAt: new Date().toISOString(),
          }),
          confidence_level: "connected_source",
          dimension: "tre",
          svi_impact: 20,
        })
        .eq("id", existingEvidence.id);

      if (updateError) {
        console.error("[blockid:stripe] evidence update failed", updateError);
        return NextResponse.json(
          { ok: false, error: "Failed to update evidence" },
          { status: 500 },
        );
      }
    } else {
      // Insert new evidence
      const { error: insertError } = await supabase
        .from("svi_evidence")
        .insert({
          account_id: accountId,
          evidence_type: "stripe",
          label,
          value_or_url: JSON.stringify({
            mrr,
            totalRevenue,
            customerCount,
            subscriptionCount,
            currency: customer.currency ?? "usd",
            connectedAt: new Date().toISOString(),
          }),
          confidence_level: "connected_source",
          dimension: "tre",
          svi_impact: 20,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("[blockid:stripe] evidence insert failed", insertError);
        return NextResponse.json(
          { ok: false, error: "Failed to save evidence" },
          { status: 500 },
        );
      }
    }

    // Fire-and-forget: trigger SVI rescore
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    const cookieHeader = request.headers.get("cookie") ?? "";
    void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      revenue: { mrr, totalRevenue },
      customers: customerCount,
      subscriptions: subscriptionCount,
      evidenceCreated: !existingEvidence,
    });
  } catch (err) {
    console.error("[blockid:stripe] connect error", err);
    return NextResponse.json(
      { ok: false, error: "Failed to connect Stripe" },
      { status: 500 },
    );
  }
}
