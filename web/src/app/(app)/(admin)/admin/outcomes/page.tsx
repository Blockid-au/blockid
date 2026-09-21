// /admin/outcomes — outcome queue (G21 P3-A). Admin only (same inline
// guard as /admin/corrections). Reads the queue through
// lib/outcomes/service; the client component filters by status and posts
// confirm / reject to PATCH /api/outcomes/[id]. Confirmation records who and
// when; it never rewrites the reporter's confidence or a score.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listOutcomesQueue, type QueueOutcomeRow } from "@/lib/outcomes/service";
import { OutcomesQueueClient } from "./outcomes-client";

export const metadata: Metadata = {
  title: "Outcomes — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminOutcomesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/outcomes");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  let rows: QueueOutcomeRow[] = [];
  const db = getSupabaseAdmin();
  if (db) {
    try {
      rows = await listOutcomesQueue(db, { status: "all", limit: 300 });
    } catch {
      rows = [];
    }
  }

  return <OutcomesQueueClient user={{ email: user.email, displayName: user.displayName ?? null }} initial={rows} />;
}
