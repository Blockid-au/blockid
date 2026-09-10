// Dashboard layout persistence — app_users.dashboard_layout (migration 0326).
//
// app_users has RLS enabled and no self-service policies (custom magic-link
// auth), so both reads and writes go through the service role here and the
// route scopes every call to the signed-in user's own id. The column may not
// exist yet on an install that has not applied 0326 — reads degrade to null
// and writes report reason:"column_missing" so the grid silently keeps its
// localStorage copy instead of surfacing an error.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseLayout, type DashboardLayout } from "./widget-layout";

const COLUMN_MISSING = /column.*dashboard_layout/i;

export type LayoutWriteReason = "not_configured" | "column_missing" | "db_error";

export async function getDashboardLayout(userId: string): Promise<DashboardLayout | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("dashboard_layout")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      if (!COLUMN_MISSING.test(error.message ?? "")) {
        console.error("[blockid:dashboard-layout] read failed", error);
      }
      return null;
    }
    const raw = (data as { dashboard_layout?: unknown } | null)?.dashboard_layout;
    // Re-validate on the way out: a widget retired since the row was written
    // is dropped here rather than shipped to the client.
    return parseLayout(raw);
  } catch (err) {
    console.error("[blockid:dashboard-layout] read threw", err);
    return null;
  }
}

export async function setDashboardLayout(
  userId: string,
  layout: DashboardLayout,
): Promise<{ ok: true } | { ok: false; reason: LayoutWriteReason }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };
  try {
    const { error } = await supabase
      .from("app_users")
      .update({ dashboard_layout: layout })
      .eq("id", userId);
    if (error) {
      if (COLUMN_MISSING.test(error.message ?? "")) return { ok: false, reason: "column_missing" };
      console.error("[blockid:dashboard-layout] write failed", error);
      return { ok: false, reason: "db_error" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[blockid:dashboard-layout] write threw", err);
    return { ok: false, reason: "db_error" };
  }
}
