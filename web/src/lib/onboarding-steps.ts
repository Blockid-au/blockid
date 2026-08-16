/**
 * Onboarding step detection helpers — T_ONBOARD_0001.
 *
 * Queries the DB for quick signals that indicate which of the 12
 * investor-readiness steps a founder has already completed. Called
 * from server-side layouts/pages that then pass the result as a prop
 * to the `<OnboardingProgressBar>` client component.
 *
 * Rules are deliberately lenient — a step is "done" as soon as the
 * lightest signal is present so founders feel progress sooner.
 */

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function getCompletedOnboardingSteps(
  userId: string,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const completed: string[] = [];

  try {
    // Run all signal queries in parallel to keep latency low.
    const [
      userRow,
      sviRow,
      investorPackRow,
      capTableRow,
      teamRow,
      metricsRow,
      documentsRow,
      evidenceRow,
      marketRow,
      fundraiseRow,
      dataRoomRow,
    ] = await Promise.allSettled([
      // Profile — display_name is set
      supabase
        .from("app_users")
        .select("display_name, startup_name, startup_stage, industry")
        .eq("id", userId)
        .maybeSingle(),

      // SVI score + idea — latest svi_analyses row
      supabase
        .from("svi_analyses")
        .select("id, total_svi, raw_input")
        .eq("email", userId) // some tables key on email; fall back below
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Investor pack — investor_pack_shares row exists
      supabase
        .from("investor_pack_shares")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Cap table — cap_table_shares row or equity setup
      supabase
        .from("cap_table_shares")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Team — startup_team_members row
      supabase
        .from("startup_team_members")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Metrics — startup_metrics row
      supabase
        .from("startup_metrics")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Documents — startup_documents row
      supabase
        .from("startup_documents")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Evidence — startup_evidence row
      supabase
        .from("startup_evidence")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Market size — market_size_analyses row
      supabase
        .from("market_size_analyses")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Fundraise goal — fundraise_goals row
      supabase
        .from("fundraise_goals")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),

      // Data room — data_room_items row
      supabase
        .from("data_room_items")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

    // --- Profile ---
    if (userRow.status === "fulfilled") {
      const u = userRow.value.data;
      if (u && u.display_name) completed.push("profile");
    }

    // --- SVI / idea ---
    // svi_analyses may key on email — try with user_id too if email query fails
    let sviData: { id: string; total_svi?: number; raw_input?: string } | null =
      null;
    if (sviRow.status === "fulfilled" && sviRow.value.data) {
      sviData = sviRow.value.data;
    } else {
      // Fallback: query by user_id column if it exists
      const alt = await supabase
        .from("svi_analyses")
        .select("id, total_svi, raw_input")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alt.data) sviData = alt.data;
    }

    if (sviData) {
      if (sviData.raw_input) completed.push("idea");
      if (sviData.total_svi != null) completed.push("svi_score");
    }

    // --- Investor pack ---
    if (
      investorPackRow.status === "fulfilled" &&
      investorPackRow.value.data
    ) {
      completed.push("investor_pack");
    }

    // --- Cap table ---
    if (capTableRow.status === "fulfilled" && capTableRow.value.data) {
      completed.push("cap_table");
    }

    // --- Team ---
    if (teamRow.status === "fulfilled" && teamRow.value.data) {
      completed.push("team");
    }

    // --- Metrics ---
    if (metricsRow.status === "fulfilled" && metricsRow.value.data) {
      completed.push("metrics");
    }

    // --- Documents ---
    if (documentsRow.status === "fulfilled" && documentsRow.value.data) {
      completed.push("documents");
    }

    // --- Evidence ---
    if (evidenceRow.status === "fulfilled" && evidenceRow.value.data) {
      completed.push("evidence");
    }

    // --- Market size ---
    if (marketRow.status === "fulfilled" && marketRow.value.data) {
      completed.push("market");
    }

    // --- Fundraise goal ---
    if (fundraiseRow.status === "fulfilled" && fundraiseRow.value.data) {
      completed.push("fundraise");
    }

    // --- Data room ---
    if (dataRoomRow.status === "fulfilled" && dataRoomRow.value.data) {
      completed.push("dataroom");
    }
  } catch (err) {
    // Never crash the page — progress bar simply shows empty state.
    console.error("[blockid:onboarding-steps] detection failed", err);
  }

  return completed;
}
