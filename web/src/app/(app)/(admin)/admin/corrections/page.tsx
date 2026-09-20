// /admin/corrections — founder correction queue (G21 P1-C). Admin only
// (same inline guard as /admin/pilots). Reads the queue through
// lib/corrections/service; the client component filters by status and
// posts accept / reject to PATCH /api/admin/corrections/[id]. An accept
// never overwrites data — the resolution records what changed.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listCorrections, type AdminCorrectionRow } from "@/lib/corrections/service";
import { CorrectionsQueueClient } from "./corrections-client";

export const metadata: Metadata = {
  title: "Corrections — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminCorrectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/corrections");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  let rows: AdminCorrectionRow[] = [];
  const db = getSupabaseAdmin();
  if (db) {
    try {
      rows = await listCorrections(db, { status: "all", limit: 300 });
    } catch {
      rows = [];
    }
  }

  return <CorrectionsQueueClient user={{ email: user.email, displayName: user.displayName ?? null }} initial={rows} />;
}
