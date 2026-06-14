import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Shield } from "lucide-react";
import { TeamClient } from "./team-client";

export const metadata: Metadata = {
  title: "Team & AI Agents — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/team");

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

  /* Live email count from DB */
  let emailsSent = 0;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { count } = await supabase
      .from("svi_notifications")
      .select("id", { count: "exact", head: true });
    emailsSent = count ?? 0;
  }

  return (
    <TeamClient
      user={{
        email: user.email,
        displayName: user.displayName ?? null,
      }}
      emailsSent={emailsSent}
    />
  );
}
