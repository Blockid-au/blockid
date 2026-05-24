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
import { sendCreditLowAlert } from "./email";

// ── Billing Service (microservice) proxy ──────────────────────────────
// Phase 1 Strangler Fig: try the Billing service first, fallback to local.
const BILLING_URL = process.env.BILLING_URL; // e.g. "http://billing:4011" or "http://127.0.0.1:4011"
const BILLING_SECRET = process.env.BILLING_SECRET;
let billingBackoffUntil = 0;

async function billingFetch<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  if (!BILLING_URL || !BILLING_SECRET) return null;
  if (Date.now() < billingBackoffUntil) return null;
  try {
    const res = await fetch(`${BILLING_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": BILLING_SECRET },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      billingBackoffUntil = Date.now() + 300_000; // 5 min
      console.warn("[credits] Billing service unavailable, falling back to local for 5 min");
    }
    return null;
  }
}

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

  // ── Per-section report generation (progressive unlock) ──────────────
  report_section_executive: 0,             // Free — always available
  report_section_founder_team: 0.50,       // Included summary, 0.50 cr full
  report_section_market: 0.75,             // Included summary, 0.75 cr full
  report_section_product: 0.50,            // Included summary, 0.50 cr full
  report_section_traction: 0.75,           // Included summary, 0.75 cr full
  report_section_gtm: 0.50,               // Included summary, 0.50 cr full
  report_section_cap_table: 0.50,          // Included summary, 0.50 cr full
  report_section_investor_ready: 0.50,     // Included summary, 0.50 cr full
  report_section_legal: 0.50,              // Included summary, 0.50 cr full
  report_section_vision_moat: 0.50,        // Included summary, 0.50 cr full
  report_section_financial: 0.75,          // Included summary, 0.75 cr full
  report_section_risk: 0.50,               // Included summary, 0.50 cr full
  report_section_competitive: 0.75,        // Paid — locked, 0.75 cr
  report_section_roadmap: 0.75,            // Paid — locked, 0.75 cr
  report_section_board_summary: 1.00,      // Premium — locked, 1.00 cr
  report_section_au_market: 1.00,          // Premium — locked, 1.00 cr

  // ── Valuation Engine ──────────────────────────────────────────────────
  valuation_detailed: 0.50, // A$0.50 — detailed multi-method valuation (POST scenario)

  // ── AI Equity Recommendations (Phase 4) ──────────────────────────────
  ai_equity_split: 1.00,      // Slicing Pie + AU benchmarks
  ai_vesting: 0.50,           // Vesting schedule recommendation
  ai_share_structure: 0.75,   // Fixed vs dynamic share structure
  ai_esop: 0.50,              // ESOP pool sizing recommendation
  ai_vesting_review: 1.50,    // Comprehensive vesting audit

  // ── Vesting & Share Structure (free features) ───────────────────────
  vesting_setup: 0,            // Free — manual vesting schedule creation
  vesting_compute: 0,          // Free — vesting timeline preview
  share_structure_recompute: 0, // Free — recompute share prices from SVI
  vesting_accelerate: 0,       // Free — process acceleration trigger

  // ── Blockchain Features ─────────────────────────────────────────────
  token_create: 0,             // Free — deploy equity token (MetaMask pays gas=0)
  blockchain_sync: 0,          // Free — toggle sync on/off
  blockchain_verify: 0,        // Free — verify off-chain vs on-chain balances

  // ── Per-section modular purchasing (word-count tiers) ────────────────
  // Users choose individual sections at their desired depth.
  // Formula: base_rate × (target_words / 500). Min 0.10, max 3.00.
  section_scan: 0.10,         // ~100 words — quick signal check
  section_summary: 0.25,      // ~300 words — key findings
  section_standard: 0.50,     // ~500 words — detailed + gaps + recs
  section_deep: 1.00,         // ~1000 words — benchmarks + competitors
  section_expert: 2.00,       // ~2000 words — consultant-grade
  section_maximum: 3.00,      // ~3000+ words — no word limit

  // ── Additional purchasable analyses ──────────────────────────────────
  investor_memo: 3.00,        // ~3000 words — investor-ready memo
  competitive_intel: 1.00,    // ~1000 words — named competitors + features
  seo_audit: 0.75,            // ~600 words — technical SEO + keywords
  growth_strategy: 1.50,      // ~1500 words — 90-day growth plan
  cap_table_review: 1.00,     // ~800 words — equity split analysis (AU benchmarks)

  // ── Phase 6: Investment & Fundraise ──────────────────────────────────
  data_room_generate: 3.00,    // A$3.00 — one-click data room compilation
  fundraise_wizard: 2.00,      // A$2.00 — fundraise round configuration + dilution

  // ── Phase 8: Growth Journal & Exit ─────────────────────────────────
  journal_reflect: 0.50,         // A$0.50 — AI monthly reflection narrative
  quarterly_revaluation: 1.00,   // A$1.00 — quarterly revaluation report
};

// ---------------------------------------------------------------------------
// Plan credit grants
// ---------------------------------------------------------------------------

export const PLAN_CREDITS: Record<string, { amount: number; recurring: boolean }> = {
  free:           { amount: 2,      recurring: false },  // 2 credits = ~4 standard analyses
  founding50:     { amount: 100,    recurring: false },  // 100 credits lifetime
  growth:         { amount: 200,    recurring: true  },  // 200 credits/month
  growth_annual:  { amount: 200,    recurring: true  },  // 200 credits/month (annual billing)
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

// ---------------------------------------------------------------------------
// Section depth tiers — word count and credit pricing per section.
// Used by the modular section picker UI to show transparent pricing.
// ---------------------------------------------------------------------------

export type SectionDepth = "scan" | "summary" | "standard" | "deep" | "expert" | "maximum";

export const SECTION_DEPTH_CONFIG: Record<SectionDepth, {
  label: string;
  words: number;        // approximate target words
  credits: number;
  description: string;
}> = {
  scan:     { label: "Scan",     words: 100,   credits: 0.10, description: "Quick signal check" },
  summary:  { label: "Summary",  words: 300,   credits: 0.25, description: "Key findings, top 3 takeaways" },
  standard: { label: "Standard", words: 500,   credits: 0.50, description: "Detailed analysis with gaps + recommendations" },
  deep:     { label: "Deep",     words: 1000,  credits: 1.00, description: "Benchmarks, competitor context, action plan" },
  expert:   { label: "Expert",   words: 2000,  credits: 2.00, description: "Consultant-grade with financials and strategy" },
  maximum:  { label: "Maximum",  words: 3000,  credits: 3.00, description: "Exhaustive analysis, no word limit" },
};

// Bundle discounts for full report (all 10 sections at same depth)
export const REPORT_BUNDLES: Record<string, {
  label: string;
  depth: SectionDepth;
  credits: number;
  estWords: number;
  savingsPercent: number;
}> = {
  quick_report:    { label: "Quick Report",    depth: "scan",     credits: 0.50,  estWords: 1000,   savingsPercent: 50 },
  standard_report: { label: "Standard Report", depth: "standard", credits: 1.00,  estWords: 5000,   savingsPercent: 80 },
  deep_report:     { label: "Deep Dive",       depth: "deep",     credits: 1.50,  estWords: 10000,  savingsPercent: 85 },
  expert_report:   { label: "Expert Report",   depth: "expert",   credits: 3.00,  estWords: 20000,  savingsPercent: 85 },
  premium_report:  { label: "Full Premium",    depth: "maximum",  credits: 5.00,  estWords: 30000,  savingsPercent: 83 },
};

/**
 * Calculate credit cost for a custom word count.
 * Formula: base_rate × (target_words / 500), clamped to [0.10, 3.00].
 * All prices are AUD and GST-inclusive (Australian Consumer Law).
 */
export function calculateWordCredit(targetWords: number): number {
  const baseRate = 0.50; // credits per 500 words
  const raw = baseRate * (targetWords / 500);
  return Math.max(0.10, Math.min(3.00, Math.round(raw * 100) / 100));
}

/**
 * Calculate the actual credit cost of a generated report based on real word counts.
 * Used after generation to determine if additional credits should be charged
 * beyond the pre-charged tier amount.
 */
export function calculateReportCost(pages: Array<{content: string}>): {
  totalWords: number;
  totalCredits: number;
  perPage: Array<{pageNum: number; words: number; credits: number}>;
} {
  const perPage = pages.map((p, i) => {
    const words = p.content.split(/\s+/).filter(Boolean).length;
    const credits = calculateWordCredit(words);
    return { pageNum: i + 1, words, credits };
  });
  const totalWords = perPage.reduce((s, p) => s + p.words, 0);
  const totalCredits = perPage.reduce((s, p) => s + p.credits, 0);
  return { totalWords, totalCredits, perPage };
}

/**
 * Calculate total cost for selected sections at chosen depths.
 * Returns individual + total with bundle comparison.
 */
export function calculateSectionCost(
  sections: Array<{ sectionId: string; depth: SectionDepth }>,
): {
  items: Array<{ sectionId: string; depth: SectionDepth; credits: number; words: number }>;
  totalCredits: number;
  totalWords: number;
  bestBundle: { key: string; credits: number; savingsPercent: number } | null;
} {
  const items = sections.map(s => ({
    sectionId: s.sectionId,
    depth: s.depth,
    credits: SECTION_DEPTH_CONFIG[s.depth].credits,
    words: SECTION_DEPTH_CONFIG[s.depth].words,
  }));

  const totalCredits = items.reduce((sum, i) => sum + i.credits, 0);
  const totalWords = items.reduce((sum, i) => sum + i.words, 0);

  // Find best bundle if all 10 sections selected
  let bestBundle: { key: string; credits: number; savingsPercent: number } | null = null;
  if (sections.length >= 10) {
    for (const [key, bundle] of Object.entries(REPORT_BUNDLES)) {
      if (bundle.credits < totalCredits) {
        if (!bestBundle || bundle.credits < bestBundle.credits) {
          bestBundle = { key, credits: bundle.credits, savingsPercent: bundle.savingsPercent };
        }
      }
    }
  }

  return { items, totalCredits, totalWords, bestBundle };
}

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
  // Try Billing service first
  const remote = await billingFetch<AffordResult>("/credits/check", { userId, feature });
  if (remote) return remote;

  // Fallback: local logic
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
  // Try Billing service first
  const remote = await billingFetch<{ ok: boolean; balance: number }>("/credits/spend", { userId, feature, metadata });
  if (remote) return remote;

  // Fallback: local logic
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

  // Low credit alert (fire-and-forget)
  if (newBalance < 1.0 && newBalance >= 0) {
    void sendCreditLowAlertIfNeeded(supabase, userId, newBalance);
  }

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

// ---------------------------------------------------------------------------
// sendCreditLowAlertIfNeeded — fire-and-forget email when balance < 1.0.
// De-duplicated via svi_notifications: at most once per 7 days.
// ---------------------------------------------------------------------------

async function sendCreditLowAlertIfNeeded(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  newBalance: number,
): Promise<void> {
  try {
    // Look up the user's email from app_users
    const { data: user } = await supabase
      .from("app_users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (!user?.email) return;

    // Check svi_notifications for a recent credit_low_alert (within 7 days).
    // We use payload->>email to match since not all users have an svi_accounts row.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await supabase
      .from("svi_notifications")
      .select("id")
      .eq("notification_type", "credit_low_alert")
      .filter("payload->>email", "eq", user.email)
      .gte("sent_at", sevenDaysAgo)
      .limit(1);

    if (recentAlert && recentAlert.length > 0) return; // Already sent recently

    // Send the email
    await sendCreditLowAlert({ to: user.email, currentBalance: newBalance });

    // Log to svi_notifications to prevent re-sending within 7 days.
    // Try to find an svi_accounts row for the account_id FK.
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
    // Fire-and-forget: log but never throw
    console.error("[blockid:credits] credit low alert failed", err);
  }
}
