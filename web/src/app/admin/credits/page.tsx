import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CreditsClient } from "./credits-client";

export const metadata: Metadata = {
  title: "Credit Management — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface UserWithCredits {
  id: string;
  email: string;
  display_name: string | null;
  plan: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
  credits: {
    balance: number;
    lifetime_earned: number;
    lifetime_spent: number;
  };
}

export default async function AdminCreditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/credits");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const supabase = getSupabaseAdmin();
  let usersWithCredits: UserWithCredits[] = [];

  if (supabase) {
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

    usersWithCredits = users.map((u) => ({
      ...u,
      credits: balanceMap.get(u.id) ?? {
        balance: 0,
        lifetime_earned: 0,
        lifetime_spent: 0,
      },
    }));
  }

  return (
    <CreditsClient
      user={{ email: user.email, displayName: user.displayName ?? null }}
      initialUsers={usersWithCredits}
    />
  );
}
