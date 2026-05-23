// POST /api/admin/credits — Grant or revoke credits
// Body: { email, amount, reason, action: "grant" | "revoke" }
// Admin only
//
// GET /api/admin/credits — List all user balances

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return null;
  }
  return user;
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const { email, amount, reason, action } = body as {
    email?: string;
    amount?: number;
    reason?: string;
    action?: string;
  };

  if (!email || !amount || !reason || !action) {
    return NextResponse.json(
      { ok: false, error: "email, amount, reason, action required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  }

  // Find user by email
  const { data: targetUser } = await supabase
    .from("app_users")
    .select("id, email, display_name, plan, role")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  if (action === "grant") {
    const result = await grantCredits(targetUser.id, amount, reason, {
      granted_by: user.email,
      admin_action: true,
    });
    return NextResponse.json({ ok: result.ok, balance: result.balance, user: targetUser });
  }

  if (action === "revoke") {
    // For revoke: deduct credits (direct update on balance row)
    const { data: balanceRow } = await supabase
      .from("credit_balances")
      .select("balance")
      .eq("user_id", targetUser.id)
      .maybeSingle();

    const currentBalance = (balanceRow?.balance as number | null) ?? 0;
    const newBalance = Math.max(0, currentBalance - amount);

    await supabase.from("credit_balances").upsert(
      {
        user_id: targetUser.id,
        balance: newBalance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    await supabase.from("credit_transactions").insert({
      user_id: targetUser.id,
      amount: -amount,
      balance_after: newBalance,
      reason: `admin_revoke: ${reason}`,
      metadata: { revoked_by: user.email },
    });

    return NextResponse.json({ ok: true, balance: newBalance, user: targetUser });
  }

  return NextResponse.json(
    { ok: false, error: "action must be 'grant' or 'revoke'" },
    { status: 400 },
  );
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  }

  const { data } = await supabase
    .from("app_users")
    .select("id, email, display_name, plan, role, created_at, last_login_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const users = (data ?? []) as Array<{
    id: string;
    email: string;
    display_name: string | null;
    plan: string | null;
    role: string;
    created_at: string;
    last_login_at: string | null;
  }>;
  const userIds = users.map((u) => u.id);

  // Get credit balances for all users (skip if empty)
  let balanceMap = new Map<
    string,
    { balance: number; lifetime_earned: number; lifetime_spent: number }
  >();

  if (userIds.length > 0) {
    const { data: balances } = await supabase
      .from("credit_balances")
      .select("user_id, balance, lifetime_earned, lifetime_spent")
      .in("user_id", userIds);

    balanceMap = new Map(
      ((balances ?? []) as Array<{
        user_id: string;
        balance: number;
        lifetime_earned: number;
        lifetime_spent: number;
      }>).map((b) => [b.user_id, b]),
    );
  }

  const result = users.map((u) => ({
    ...u,
    credits: balanceMap.get(u.id) ?? {
      balance: 0,
      lifetime_earned: 0,
      lifetime_spent: 0,
    },
  }));

  return NextResponse.json({ ok: true, users: result });
}
