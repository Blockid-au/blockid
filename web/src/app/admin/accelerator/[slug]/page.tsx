import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CohortDetailClient } from "./cohort-detail-client";

export const metadata: Metadata = {
  title: "Cohort Details — BlockID Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface CohortDetail {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  manager_email: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface CohortMemberDetail {
  id: string;
  cohort_id: string;
  email: string;
  startup_name: string | null;
  svi_account_id: string | null;
  joined_at: string;
  svi_score: number;
  stage: number;
  trend: "up" | "down" | "flat";
  last_active: string;
}

export default async function CohortDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/accelerator/" + slug);

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/accelerator");

  // Fetch cohort by slug
  const { data: cohort } = await supabase
    .from("accelerator_cohorts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!cohort) redirect("/admin/accelerator");

  // Fetch members
  const { data: rawMembers } = await supabase
    .from("cohort_members")
    .select("*")
    .eq("cohort_id", cohort.id)
    .order("joined_at", { ascending: false });

  const members = rawMembers ?? [];

  // Fetch SVI data for linked accounts
  const sviAccountIds = members
    .map((m) => m.svi_account_id)
    .filter(Boolean) as string[];

  const sviMap: Record<string, { current_svi: number; current_stage: number; enrolled_at: string }> = {};
  if (sviAccountIds.length > 0) {
    const { data: sviAccounts } = await supabase
      .from("svi_accounts")
      .select("id, current_svi, current_stage, enrolled_at")
      .in("id", sviAccountIds);
    for (const acc of sviAccounts ?? []) {
      sviMap[acc.id] = {
        current_svi: acc.current_svi ?? 0,
        current_stage: acc.current_stage ?? 0,
        enrolled_at: acc.enrolled_at,
      };
    }
  }

  // Fetch analyses for trend detection
  const memberEmails = members.map((m) => m.email);
  const trendMap: Record<string, "up" | "down" | "flat"> = {};
  if (memberEmails.length > 0) {
    const { data: analyses } = await supabase
      .from("svi_analyses")
      .select("email, total_svi, created_at")
      .in("email", memberEmails)
      .order("created_at", { ascending: false })
      .limit(memberEmails.length * 3);

    const byEmail: Record<string, number[]> = {};
    for (const a of analyses ?? []) {
      if (!byEmail[a.email]) byEmail[a.email] = [];
      if (byEmail[a.email].length < 2) byEmail[a.email].push(a.total_svi ?? 0);
    }
    for (const [email, scores] of Object.entries(byEmail)) {
      if (scores.length >= 2) {
        const diff = scores[0] - scores[1];
        trendMap[email] = diff > 2 ? "up" : diff < -2 ? "down" : "flat";
      } else {
        trendMap[email] = "flat";
      }
    }
  }

  const enrichedMembers: CohortMemberDetail[] = members.map((m) => {
    const svi = m.svi_account_id ? sviMap[m.svi_account_id] : null;
    return {
      id: m.id,
      cohort_id: m.cohort_id,
      email: m.email,
      startup_name: m.startup_name,
      svi_account_id: m.svi_account_id,
      joined_at: m.joined_at,
      svi_score: svi?.current_svi ?? 0,
      stage: svi?.current_stage ?? 0,
      trend: trendMap[m.email] ?? "flat",
      last_active: svi?.enrolled_at ?? m.joined_at,
    };
  });

  return (
    <CohortDetailClient
      user={{ email: user.email, displayName: user.displayName ?? null }}
      cohort={cohort as CohortDetail}
      members={enrichedMembers}
    />
  );
}
