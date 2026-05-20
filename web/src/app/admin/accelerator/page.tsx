import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AcceleratorDashboardClient } from "./accelerator-dashboard-client";

export const metadata: Metadata = {
  title: "Accelerator Cohorts — BlockID Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface CohortSummary {
  id: string;
  name: string;
  slug: string;
  organization: string | null;
  manager_email: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  member_count: number;
  avg_svi: number;
  svi_distribution: {
    below80: number;
    range80to100: number;
    range100to120: number;
    above120: number;
  };
}

export default async function AcceleratorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/accelerator");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const supabase = getSupabaseAdmin();
  let cohorts: CohortSummary[] = [];

  if (supabase) {
    // Fetch all cohorts
    const { data: rawCohorts } = await supabase
      .from("accelerator_cohorts")
      .select("*")
      .order("created_at", { ascending: false });

    // Fetch all members
    const { data: members } = await supabase
      .from("cohort_members")
      .select("cohort_id, email, svi_account_id");

    // Fetch SVI accounts for score data
    const sviAccountIds = (members ?? [])
      .map((m) => m.svi_account_id)
      .filter(Boolean) as string[];

    const sviMap: Record<string, number> = {};
    if (sviAccountIds.length > 0) {
      const { data: sviAccounts } = await supabase
        .from("svi_accounts")
        .select("id, current_svi")
        .in("id", sviAccountIds);
      for (const acc of sviAccounts ?? []) {
        sviMap[acc.id] = acc.current_svi ?? 0;
      }
    }

    cohorts = (rawCohorts ?? []).map((cohort) => {
      const cohortMembers = (members ?? []).filter((m) => m.cohort_id === cohort.id);
      const scores = cohortMembers
        .map((m) => (m.svi_account_id ? sviMap[m.svi_account_id] ?? 0 : 0))
        .filter((s) => s > 0);
      const avgSvi = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      return {
        id: cohort.id,
        name: cohort.name,
        slug: cohort.slug,
        organization: cohort.organization,
        manager_email: cohort.manager_email,
        start_date: cohort.start_date,
        end_date: cohort.end_date,
        created_at: cohort.created_at,
        member_count: cohortMembers.length,
        avg_svi: avgSvi,
        svi_distribution: {
          below80: scores.filter((s) => s < 80).length,
          range80to100: scores.filter((s) => s >= 80 && s < 100).length,
          range100to120: scores.filter((s) => s >= 100 && s < 120).length,
          above120: scores.filter((s) => s >= 120).length,
        },
      };
    });
  }

  return (
    <AcceleratorDashboardClient
      user={{ email: user.email, displayName: user.displayName ?? null }}
      cohorts={cohorts}
    />
  );
}
