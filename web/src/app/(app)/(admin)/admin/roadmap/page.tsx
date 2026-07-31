import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Shield } from "lucide-react";
import { RoadmapClient } from "./roadmap-client";

export const metadata: Metadata = {
  title: "Product Roadmap — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/roadmap");

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">
            Access Denied
          </h1>
          <Link
            href="/"
            className="text-brand-600 hover:text-brand-700 text-sm"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    );
  }

  /* ── Live stats from DB ──────────────────────────────────────── */
  let liveStats = {
    totalUsers: 0,
    totalAnalyses: 0,
    totalLeads: 0,
    payingUsers: 0,
    totalNotifications: 0,
    totalAccounts: 0,
  };
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const [usersRes, analysesRes, leadsRes, paidRes, notifRes, accountsRes] =
      await Promise.all([
        supabase.from("app_users").select("id", { count: "exact", head: true }),
        supabase
          .from("svi_analyses")
          .select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase
          .from("svi_accounts")
          .select("id", { count: "exact", head: true })
          .neq("plan", "free"),
        supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("svi_accounts")
          .select("id", { count: "exact", head: true }),
      ]);

    liveStats = {
      totalUsers: usersRes.count ?? 0,
      totalAnalyses: analysesRes.count ?? 0,
      totalLeads: leadsRes.count ?? 0,
      payingUsers: paidRes.count ?? 0,
      totalNotifications: notifRes.count ?? 0,
      totalAccounts: accountsRes.count ?? 0,
    };
  }

  return (
    <RoadmapClient
      user={{
        email: user.email,
        displayName: user.displayName ?? null,
      }}
      liveStats={liveStats}
    />
  );
}
