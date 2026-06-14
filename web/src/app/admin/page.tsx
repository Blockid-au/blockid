import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Shield } from "lucide-react";
import Link from "next/link";
import { AdminDashboardClient } from "./admin-dashboard-client";

export const metadata: Metadata = {
  title: "Admin — BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin");

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <p className="text-ink-600 text-sm mb-6">You don&apos;t have admin access to BlockID.</p>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  let stats = { users: 0, analyses: 0, accounts: 0, notifications: 0 };
  let recentAnalyses: Array<{ email: string; total_svi: number; created_at: string }> = [];
  let sviAccounts: Array<{ email: string; startup_name: string | null; current_svi: number; current_stage: number; plan: string; enrolled_at: string }> = [];

  if (supabase) {
    const [usersRes, analysesRes, accountsRes, notifRes, recentRes, accountListRes] = await Promise.all([
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("svi_analyses").select("id", { count: "exact", head: true }),
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }),
      supabase.from("svi_notifications").select("id", { count: "exact", head: true }),
      supabase.from("svi_analyses").select("email, total_svi, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("svi_accounts").select("email, startup_name, current_svi, current_stage, plan, enrolled_at").order("enrolled_at", { ascending: false }).limit(50),
    ]);

    stats = {
      users: usersRes.count ?? 0,
      analyses: analysesRes.count ?? 0,
      accounts: accountsRes.count ?? 0,
      notifications: notifRes.count ?? 0,
    };
    recentAnalyses = (recentRes.data ?? []) as typeof recentAnalyses;
    sviAccounts = (accountListRes.data ?? []) as typeof sviAccounts;
  }

  return (
    <AdminDashboardClient
      user={{
        email: user.email,
        displayName: user.displayName ?? null,
      }}
      stats={stats}
      sviAccounts={sviAccounts}
      recentAnalyses={recentAnalyses}
    />
  );
}
