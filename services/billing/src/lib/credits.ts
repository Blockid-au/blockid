// Credit-based usage tracking for the billing microservice.
//
// Fractional credit model: credits are decimal values (e.g. 0.50 for a
// standard SVI analysis). This makes pricing feel affordable.
//
// All mutations (spend / grant) are atomic: we upsert the balance row and
// insert the transaction log in a sequential pair of writes guarded by the
// unique constraint on credit_balances(user_id).

import { getSupabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Feature credit costs
// ---------------------------------------------------------------------------

export const FEATURE_COSTS: Record<string, number> = {
  svi_analysis: 0.50,
  svi_report: 0.50,
  rnd_preview: 0,
  rnd_report: 1.00,
  rnd_deep_dive: 1.50,
  term_sheet: 1.00,
  research: 0.50,
  ai_score: 0.25,
  evidence_upload: 0,
  investor_score: 0,
  dilution_calc: 0,
  pitch_deck: 1.00,

  // Evidence AI analysis tiers
  evidence_scan: 0.10,
  evidence_analyze: 0.50,
  evidence_deep_dive: 1.50,

  // Dimension-specific analyses
  dim_ftv_analysis: 0.75,
  dim_mpc_analysis: 0.75,
  dim_ptd_analysis: 0.75,
  dim_tre_analysis: 1.00,
  dim_cgh_analysis: 0.75,
  dim_iri_analysis: 0.75,
  dim_lco_analysis: 0.50,
  dim_svm_analysis: 0.75,

  // Comprehensive reports
  full_report_standard: 2.00,
  full_report_premium: 5.00,

  // Valuation Engine
  valuation_detailed: 0.50,

  // AI Equity Recommendations
  ai_equity_split: 1.00,
  ai_vesting: 0.50,
  ai_share_structure: 0.75,
  ai_esop: 0.50,
  ai_vesting_review: 1.50,

  // Vesting & Share Structure (free features)
  vesting_setup: 0,
  vesting_compute: 0,
  share_structure_recompute: 0,
  vesting_accelerate: 0,

  // Blockchain Features
  token_create: 0,
  blockchain_sync: 0,
  blockchain_verify: 0,

  // Per-section modular purchasing (word-count tiers)
  section_scan: 0.10,
  section_summary: 0.25,
  section_standard: 0.50,
  section_deep: 1.00,
  section_expert: 2.00,
  section_maximum: 3.00,

  // Additional purchasable analyses
  investor_memo: 3.00,
  competitive_intel: 1.00,
  seo_audit: 0.75,
  growth_strategy: 1.50,
  cap_table_review: 1.00,

  // Phase 6: Investment & Fundraise
  data_room_generate: 3.00,
  fundraise_wizard: 2.00,

  // Phase 8: Growth Journal & Exit
  journal_reflect: 0.50,
  quarterly_revaluation: 1.00,
};

// ---------------------------------------------------------------------------
// Plan credit grants
// ---------------------------------------------------------------------------

export const PLAN_CREDITS: Record<string, { amount: number; recurring: boolean }> = {
  free:           { amount: 2,   recurring: false },
  founding50:     { amount: 100, recurring: false },
  growth:         { amount: 200, recurring: true  },
  growth_annual:  { amount: 200, recurring: true  },
};

// ---------------------------------------------------------------------------
// Credit pack definitions
// ---------------------------------------------------------------------------

export const CREDIT_PACKS = [
  { credits: 5,   priceAudCents: 500,   label: "5 Credits",   savings: null },
  { credits: 10,  priceAudCents: 900,   label: "10 Credits",  savings: "Save 10%" },
  { credits: 25,  priceAudCents: 2000,  label: "25 Credits",  savings: "Save 20%" },
  { credits: 50,  priceAudCents: 1500,  label: "50 Credits",  savings: "Save 70%" },
  { credits: 100, priceAudCents: 2500,  label: "100 Credits", savings: "Save 75%" },
] as const;

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface AffordResult {
  allowed: boolean;
  balance: number;
  cost: number;
  reason?: string;
}

export interface BalanceResult {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

export interface SpendResult {
  ok: boolean;
  balance: number;
  transactionId?: string;
}

export interface GrantResult {
  ok: boolean;
  balance: number;
}

// ---------------------------------------------------------------------------
// getBalance — read the user's current credit balance.
// ---------------------------------------------------------------------------

export async function getBalance(userId: string): Promise<BalanceResult> {
  const supabase = getSupabase();
  if (!supabase) return { balance: 0, lifetime_earned: 0, lifetime_spent: 0 };

  const { data } = await supabase
    .from("credit_balances")
    .select("balance, lifetime_earned, lifetime_spent")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    balance: data?.balance ?? 0,
    lifetime_earned: data?.lifetime_earned ?? 0,
    lifetime_spent: data?.lifetime_spent ?? 0,
  };
}

// ---------------------------------------------------------------------------
// canAfford — pre-flight check before spending. Does NOT mutate anything.
// ---------------------------------------------------------------------------

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

  const { balance } = await getBalance(userId);
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
// ---------------------------------------------------------------------------

export async function spendCredits(
  userId: string,
  feature: string,
  metadata?: Record<string, unknown>,
): Promise<SpendResult> {
  const cost = FEATURE_COSTS[feature];
  if (cost === undefined) return { ok: false, balance: 0 };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, balance: 0 };

  // Free features: log usage but don't touch credits.
  if (cost === 0) {
    await supabase.from("usage_logs").insert({
      user_id: userId,
      feature,
      credits_used: 0,
      metadata: metadata ?? {},
    });
    const { balance } = await getBalance(userId);
    return { ok: true, balance };
  }

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
    console.error("[billing:credits] balance upsert failed", balErr);
    return { ok: false, balance: currentBalance };
  }

  // Insert transaction log.
  const { data: txData, error: txErr } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: -cost,
      balance_after: newBalance,
      reason: feature,
      metadata: metadata ?? {},
    })
    .select("id")
    .single();

  if (txErr) {
    console.error("[billing:credits] transaction insert failed", txErr);
  }

  // Insert usage log.
  await supabase.from("usage_logs").insert({
    user_id: userId,
    feature,
    credits_used: cost,
    metadata: metadata ?? {},
  });

  // Low credit alert (fire-and-forget).
  if (newBalance < 1.0 && newBalance >= 0) {
    void sendCreditLowAlert(userId, newBalance);
  }

  return {
    ok: true,
    balance: newBalance,
    transactionId: txData?.id ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// grantCredits — add credits to a user (plan activation, purchase, bonus).
// ---------------------------------------------------------------------------

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<GrantResult> {
  if (amount <= 0) return { ok: false, balance: 0 };

  const supabase = getSupabase();
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
    console.error("[billing:credits] grant balance upsert failed", balErr);
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
    console.error("[billing:credits] grant transaction insert failed", txErr);
  }

  return { ok: true, balance: newBalance };
}

// ---------------------------------------------------------------------------
// initializeCredits — grant a new user their free credits.
// Idempotent: skips if the user already has a credit_balances row.
// ---------------------------------------------------------------------------

export async function initializeCredits(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: existing } = await supabase
    .from("credit_balances")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return;

  await grantCredits(userId, PLAN_CREDITS.free.amount, "plan_grant", {
    plan: "free",
    note: `Welcome — ${PLAN_CREDITS.free.amount} free credits`,
  });
}

// ---------------------------------------------------------------------------
// sendCreditLowAlert — placeholder for Phase 2 email service.
// Currently just logs. When the email microservice is ready, this will
// make an internal HTTP call instead.
// ---------------------------------------------------------------------------

async function sendCreditLowAlert(
  userId: string,
  newBalance: number,
): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    // Look up the user's email from app_users.
    const { data: user } = await supabase
      .from("app_users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (!user?.email) return;

    // Check svi_notifications for a recent credit_low_alert (within 7 days).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await supabase
      .from("svi_notifications")
      .select("id")
      .eq("notification_type", "credit_low_alert")
      .filter("payload->>email", "eq", user.email)
      .gte("sent_at", sevenDaysAgo)
      .limit(1);

    if (recentAlert && recentAlert.length > 0) return;

    // Phase 2: Replace this log with an actual email service call.
    console.log(
      `[billing:credits] CREDIT LOW ALERT: user=${userId} email=${user.email} balance=${newBalance}`,
    );

    // Log to svi_notifications to prevent re-sending within 7 days.
    const { data: sviAccount } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();

    await supabase.from("svi_notifications").insert({
      ...(sviAccount ? { account_id: sviAccount.id } : {}),
      notification_type: "credit_low_alert",
      subject: "Your BlockID Credits Are Running Low",
      payload: { email: user.email, balance: newBalance },
    });
  } catch (err) {
    // Fire-and-forget: log but never throw.
    console.error("[billing:credits] credit low alert failed", err);
  }
}
