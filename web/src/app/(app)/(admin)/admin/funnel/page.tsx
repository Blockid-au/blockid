// /admin/funnel — G16-A "funnel truth" (CRO tile).
//
// Reads content/reports/funnel-latest.json + funnel-daily.jsonl (written
// 02:50 UTC by scripts/funnel-report.mjs from analytics_events) and adds one
// live "today so far" block through the same reducer. Replaces the previous
// client page that polled /api/funnel over a `funnel_events` table that does
// not exist (0 rows forever). Same gate as the sibling admin pages
// (/admin/traction): signed-in + admin, else redirect.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { asFunnelLiveClient, liveTodayFunnel, readFunnelDaily, readFunnelLatest } from "@/lib/funnel/read";
import { FunnelAdminView } from "./funnel-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Funnel — BlockID Admin",
  robots: { index: false, follow: false },
};

export default async function FunnelAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/funnel");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const [{ latest, status, error }, daily, today] = await Promise.all([
    readFunnelLatest(),
    readFunnelDaily(),
    liveTodayFunnel(asFunnelLiveClient(getSupabaseAdmin())),
  ]);

  return <FunnelAdminView data={{ latest, status, fileError: error, daily, today }} />;
}
