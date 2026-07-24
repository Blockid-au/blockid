import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
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
  // Non-admins: redirect (307) instead of soft-200 render — matches the pattern
  // used by every other admin subroute. Previous soft-200 exposed the /admin/team
  // route as a valid page to scanners and non-admin users.
  if (!isAdmin) redirect("/dashboard/svi");

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
