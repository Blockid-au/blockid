// /admin/external-signals — open AU register sources, licences, last run,
// row counts and the last ingest summary (G14-S40). Admin only (same inline
// guard as /admin/traction). Reads through the service-role client; the
// view is pure so the colocated test renders it with fixtures.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { loadExternalSignalsAdmin } from "@/lib/signals/external-signals-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ExternalSignalsAdminView } from "./external-signals-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "External signals — BlockID Admin",
  robots: { index: false, follow: false },
};

export default async function ExternalSignalsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/external-signals");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const data = await loadExternalSignalsAdmin(getSupabaseAdmin(), process.cwd());
  return <ExternalSignalsAdminView data={data} />;
}
