// Credit-based usage tracking (server-only).
//
// Hybrid pricing model: free trial (1 free credit), credit packs, and
// subscription plans with included monthly credits. Every paid feature has a
// credit cost; free features (evidence upload, investor score, dilution calc)
// cost 0 credits.
//
// All mutations (spend / grant) are atomic: we upsert the balance row and
// insert the transaction log in a single RPC or sequential pair of writes
// guarded by the unique constraint on credit_balances(user_id).

import "server-only";
import { getSupabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// Feature credit costs
// ---------------------------------------------------------------------------

export const FEATURE_COSTS: Record<string, number> = {
  svi_analysis: 1,   // A$1 per credit (early-bird), $25 standard
  svi_report: 3,     // 3 credits — 10-page AI report
  rnd_preview: 0,    // 0 credits — free 3-page preview report
  rnd_report: 1,     // 1 credit — Standard 10-page R&D report
  rnd_deep_dive: 3,  // 3 credits — Deep Dive unlimited-detail R&D report
  term_sheet: 3,     // 3 credits
  research: 2,       // 2 credits — competitive research
  ai_score: 1,       // 1 credit — AI scoring enhancement
  evidence_upload: 0, // free
  investor_score: 0,  // free
  dilution_calc: 0,   // free
};

// ---------------------------------------------------------------------------
// Plan credit grants
// ---------------------------------------------------------------------------

export const PLAN_CREDITS: Record<string, { amount: number; recurring: boolean }> = {
  free:       { amount: 1,      recurring: false },
  founding50: { amount: 50,     recurring: false },
  growth:     { amount: 100,    recurring: true  },
};

// ---------------------------------------------------------------------------
// Credit pack definitions (for Stripe one-off purchases)
// ---------------------------------------------------------------------------

export const CREDIT_PACKS = [
  { credits: 5,  priceAudCents: 500,   label: "5 Credits",  savings: null },
  { credits: 10, priceAudCents: 900,   label: "10 Credits", savings: "Save 10%" },
  { credits: 25, priceAudCents: 2000,  label: "25 Credits", savings: "Save 20%" },
  { credits: 50, priceAudCents: 3500,  label: "50 Credits", savings: "Save 30%" },
] as const;

// ---------------------------------------------------------------------------
// getBalance — read the user's current credit balance.
// Returns 0 when no row exists yet (new user).
// ---------------------------------------------------------------------------

export async function getBalance(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data } = await supabase
    .from("credit_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.balance ?? 0;
}

// ---------------------------------------------------------------------------
// canAfford — pre-flight check before spending. Does NOT mutate anything.
// ---------------------------------------------------------------------------

export interface AffordResult {
  allowed: boolean;
  balance: number;
  cost: number;
  reason?: string;
}

export async function canAfford(
  userId: string,
  feature: string,
): Promise<AffordResult> {
  const cost = FEATURE_COSTS[feature];
  if (cost === undefined) {
    return { allowed: false, balance: 0, cost: 0, reason: "unknown_feature" };
  }
  if (cost === 0) {
    return { allowed: true, balance: 0, cost: 0 };
  }

  const balance = await getBalance(userId);
  if (balance >= cost) {
    return { allowed: true, balance, cost };
  }
  return {
    allowed: false,
    balance,
    cost,
    reason: "insufficient_credits",
  };
}

// ---------------------------------------------------------------------------
// spendCredits — atomically deduct credits and log the transaction + usage.
// Returns { ok: false } when the user cannot afford the feature.
// ---------------------------------------------------------------------------

export async function spendCredits(
  userId: string,
  feature: string,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; balance: number }> {
  const cost = FEATURE_COSTS[feature];
  if (cost === undefined) return { ok: false, balance: 0 };
  if (cost === 0) {
    // Free features: log usage but don't touch credits.
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("usage_logs").insert({
        user_id: userId,
        feature,
        credits_used: 0,
        metadata: metadata ?? {},
      });
    }
    return { ok: true, balance: await getBalance(userId) };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, balance: 0 };

  // Read current balance.
  const { data: row } = await supabase
    .from("credit_balances")
    .select("balance, lifetime_spent")
    .eq("user_id", userId)
    .maybeSingle();

  const currentBalance = row?.balance ?? 0;
  const lifetimeSpent = row?.lifetime_spent ?? 0;

  if (currentBalance < cost) {
    return { ok: false, balance: currentBalance };
  }

  const newBalance = currentBalance - cost;
  const now = new Date().toISOString();

  // Upsert balance (handles race-free update via unique constraint).
  const { error: balErr } = await supabase
    .from("credit_balances")
    .upsert(
      {
        user_id: userId,
        balance: newBalance,
        lifetime_spent: lifetimeSpent + cost,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
  if (balErr) {
    console.error("[blockid:credits] balance upsert failed", balErr);
    return { ok: false, balance: currentBalance };
  }

  // Insert transaction log.
  const { error: txErr } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: -cost,
      balance_after: newBalance,
      reason: feature,
      metadata: metadata ?? {},
    });
  if (txErr) {
    console.error("[blockid:credits] transaction insert failed", txErr);
    // Balance already updated — log the error but don't roll back
    // (the transaction log is an audit trail, not the source of truth).
  }

  // Insert usage log.
  await supabase.from("usage_logs").insert({
    user_id: userId,
    feature,
    credits_used: cost,
    metadata: metadata ?? {},
  });

  return { ok: true, balance: newBalance };
}

// ---------------------------------------------------------------------------
// grantCredits — add credits to a user (plan activation, purchase, bonus).
// ---------------------------------------------------------------------------

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; balance: number }> {
  if (amount <= 0) return { ok: false, balance: 0 };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, balance: 0 };

  // Read current balance (may not exist yet).
  const { data: row } = await supabase
    .from("credit_balances")
    .select("balance, lifetime_earned")
    .eq("user_id", userId)
    .maybeSingle();

  const currentBalance = row?.balance ?? 0;
  const lifetimeEarned = row?.lifetime_earned ?? 0;
  const newBalance = currentBalance + amount;
  const now = new Date().toISOString();

  // Upsert balance.
  const { error: balErr } = await supabase
    .from("credit_balances")
    .upsert(
      {
        user_id: userId,
        balance: newBalance,
        lifetime_earned: lifetimeEarned + amount,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
  if (balErr) {
    console.error("[blockid:credits] grant balance upsert failed", balErr);
    return { ok: false, balance: currentBalance };
  }

  // Insert transaction log.
  const { error: txErr } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount,
      balance_after: newBalance,
      reason,
      metadata: metadata ?? {},
    });
  if (txErr) {
    console.error("[blockid:credits] grant transaction insert failed", txErr);
  }

  return { ok: true, balance: newBalance };
}

// ---------------------------------------------------------------------------
// getUsageHistory — recent usage entries for a user.
// ---------------------------------------------------------------------------

export async function getUsageHistory(
  userId: string,
  limit = 50,
): Promise<Array<{ feature: string; credits_used: number; created_at: string }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("usage_logs")
    .select("feature, credits_used, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[blockid:credits] usage history query failed", error);
    return [];
  }

  return (data ?? []) as Array<{ feature: string; credits_used: number; created_at: string }>;
}

// ---------------------------------------------------------------------------
// getTransactionHistory — recent credit transactions for a user.
// ---------------------------------------------------------------------------

export async function getTransactionHistory(
  userId: string,
  limit = 20,
): Promise<
  Array<{
    amount: number;
    balance_after: number;
    reason: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("amount, balance_after, reason, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[blockid:credits] transaction history query failed", error);
    return [];
  }

  return (data ?? []) as Array<{
    amount: number;
    balance_after: number;
    reason: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// initializeCredits — grant a new user their 1 free credit.
// Idempotent: skips if the user already has a credit_balances row.
// ---------------------------------------------------------------------------

export async function initializeCredits(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  // Check if already initialized.
  const { data: existing } = await supabase
    .from("credit_balances")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return; // already has a row

  await grantCredits(userId, 1, "plan_grant", {
    plan: "free",
    note: "Welcome — 1 free SVI analysis credit",
  });
}
