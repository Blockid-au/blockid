// /admin/validation — the validation tracker (G22-D). Admin only (same
// inline guard as /admin/outcomes). Reads the ledger + auto rows + North
// Star through lib/validation/auto (fail-soft: a missing table is a warning
// on the page); the client component posts to /api/admin/validation.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { asInstitutionalClient } from "@/lib/funnel/institutional";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readValidationDashboard } from "@/lib/validation/auto";
import { resolveValidationRoot } from "@/lib/validation/ledger";
import { ValidationClient } from "./validation-client";

export const metadata: Metadata = {
  title: "Validation tracker — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminValidationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/validation");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const root = await resolveValidationRoot();
  const initial = await readValidationDashboard(asInstitutionalClient(getSupabaseAdmin()), root);

  return <ValidationClient user={{ email: user.email, displayName: user.displayName ?? null }} initial={initial} />;
}
