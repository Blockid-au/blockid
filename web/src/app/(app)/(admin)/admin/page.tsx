import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
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
  // Non-admins: redirect to /dashboard/svi (matches pattern used by every other
  // admin subroute — see resellers/page.tsx, affiliate/page.tsx, etc.). Previous
  // soft-200 "Access Denied" render leaked the admin surface (200 status) to
  // scanners and to unauth users; now returns a proper 307 redirect.
  if (!isAdmin) redirect("/dashboard/svi");

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
