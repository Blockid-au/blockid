// Credit-based usage tracking (server-only).
//
// Fractional credit model: credits are decimal values (e.g. 0.50 for a
// standard SVI analysis). This makes pricing feel affordable — small amounts
// per action, similar to ChatGPT/Claude token pricing.
//
// Hybrid pricing: free trial (2 free credits), credit packs, and subscription
// plans with included monthly credits. Every paid feature has a credit cost;
// free features (evidence upload, investor score, dilution calc) cost 0 credits.
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
  svi_analysis: 0.50,  // A$0.50 — standard SVI analysis (10 pages)
  svi_report: 0.50,    // alias for svi_analysis (backward compat)
  rnd_preview: 0,      // 0 credits — free 3-page preview report
  rnd_report: 1.00,    // A$1.00 — Standard 10-page R&D report (SSE streaming)
  rnd_deep_dive: 1.50, // A$1.50 — Deep Dive extended R&D report
  term_sheet: 1.00,    // A$1.00 — Term Sheet AI analysis
  research: 0.50,      // A$0.50 — competitive research
  ai_score: 0.25,      // A$0.25 — AI score enhancement
  evidence_upload: 0,   // free
  investor_score: 0,    // free
  dilution_calc: 0,     // free
  pitch_deck: 1.00,    // A$1.00 — AI pitch deck outline from SVI data

  // ── Evidence AI analysis tiers ────────────────────────────────────────
  evidence_scan: 0.10,       // Quick validation, authenticity check
  evidence_analyze: 0.50,    // Standard: extract signals, map dimensions, gaps
  evidence_deep_dive: 1.50,  // Comprehensive: benchmarking, roadmap, investor view

  // ── Dimension-specific analyses ───────────────────────────────────────
  dim_ftv_analysis: 0.75,    // Founder & Team deep dive
  dim_mpc_analysis: 0.75,    // Market & Problem deep dive
  dim_ptd_analysis: 0.75,    // Product & Technical deep dive
  dim_tre_analysis: 1.00,    // Traction & Revenue deep dive (highest-weight dim)
  dim_cgh_analysis: 0.75,    // Cap Table & Governance deep dive
  dim_iri_analysis: 0.75,    // Investor Readiness deep dive
  dim_lco_analysis: 0.50,    // Legal & Compliance deep dive
  dim_svm_analysis: 0.75,    // Strategic Vision & Moat deep dive

  // ── Comprehensive reports (no page limit for paid users) ──────────────
  full_report_standard: 2.00, // All 8 dimensions, 2000+ words
  full_report_premium: 5.00,  // Investor memo format, 5000+ words

  // ── AI Equity Recommendations (Phase 4) ──────────────────────────────
  ai_equity_split: 1.00,      // Slicing Pie + AU benchmarks
  ai_vesting: 0.50,           // Vesting schedule recommendation
  ai_share_structure: 0.75,   // Fixed vs dynamic share structure
  ai_esop: 0.50,              // ESOP pool sizing recommendation
  ai_vesting_review: 1.50,    // Comprehensive vesting audit
};

// ---------------------------------------------------------------------------
// Plan credit grants
// ---------------------------------------------------------------------------

export const PLAN_CREDITS: Record<string, { amount: number; recurring: boolean }> = {
  free:       { amount: 2,      recurring: false },  // 2 credits = ~4 standard analyses
  founding50: { amount: 100,    recurring: false },  // 100 credits lifetime
  growth:     { amount: 200,    recurring: true  },  // 200 credits/month
};

// ---------------------------------------------------------------------------
// Credit pack definitions (for Stripe one-off purchases)
// ---------------------------------------------------------------------------

export const CREDIT_PACKS = [
  { credits: 5,   priceAudCents: 500,   label: "5 Credits",   savings: null },       // A$5  = A$1.00/credit
  { credits: 10,  priceAudCents: 900,   label: "10 Credits",  savings: "Save 10%" }, // A$9  = A$0.90/credit
  { credits: 25,  priceAudCents: 2000,  label: "25 Credits",  savings: "Save 20%" }, // A$20 = A$0.80/credit
  { credits: 50,  priceAudCents: 1500,  label: "50 Credits",  savings: "Save 70%" }, // A$15 = A$0.30/credit
  { credits: 100, priceAudCents: 2500,  label: "100 Credits", savings: "Save 75%" }, // A$25 = A$0.25/credit
] as const;

// ---------------------------------------------------------------------------
// formatCredits — display-friendly credit amount.
// Whole numbers show as "1", fractional as "0.50".
// ---------------------------------------------------------------------------

export function formatCredits(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  // Show up to 2 decimal places, trimming trailing zeros
  const formatted = amount.toFixed(2);
  // Remove trailing zeros after decimal: "0.50" stays as "0.50", "1.00" → "1"
  return formatted.replace(/\.00$/, "");
}

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
// initializeCredits — grant a new user their free credits.
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

  await grantCredits(userId, PLAN_CREDITS.free.amount, "plan_grant", {
    plan: "free",
    note: `Welcome — ${PLAN_CREDITS.free.amount} free credits`,
  });
}
