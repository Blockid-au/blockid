// /admin/resellers/new — Provision a new reseller/affiliate account.
//
// Wraps POST /api/admin/affiliate/provision. Loads the existing resellers
// list on the server (so the "attach mode" dropdown can render without a
// client-side fetch) and hands the row to a client form.
//
// Admin-gated via the same redirect pattern used by /admin/resellers/page.tsx —
// isAdmin(user) is a pure derivation over the session user; requireAdmin()
// (the throwing variant) is only for API routes.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NewAffiliateForm } from "./new-affiliate-form";

export const dynamic = "force-dynamic";

interface ResellerRow {
  code: string;
  display_name: string;
}

async function loadResellers(): Promise<ResellerRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("resellers")
      .select("code, display_name")
      .eq("status", "active")
      .order("code");
    return (data ?? []) as ResellerRow[];
  } catch {
    return [];
  }
}

export default async function NewAffiliatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/resellers/new");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const resellers = await loadResellers();

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-wide text-ink-500">
            <a href="/admin/resellers" className="hover:underline">
              Resellers
            </a>{" "}
            /
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">
            Provision reseller / affiliate
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            End-to-end account creation: creates the app user, links the reseller
            admin membership, flips their plan to <code>reseller_admin</code>,
            stamps attribution, and mints an invite artifact.
          </p>
        </header>

        <NewAffiliateForm resellers={resellers} />
      </div>
    </div>
  );
}
