// /admin/affiliate — reseller "cross-view" for admins.
//
// Split-panel view: LEFT lists every reseller organisation (mirrors
// /admin/resellers styling); RIGHT opens on selection into a tabbed drawer
// showing which users the reseller CREATED (source='provisioned'), which
// users USED THEIR PROMO CODE (source='code'), and which admin-manual
// attributions exist (source='admin_manual').
//
// The server component only loads the reseller list + a k>=5 anonymised
// per-source count summary. Attribution row details are streamed by
// GET /api/admin/affiliate/[resellerId]/attributions on click.
//
// Admin-gated via requireAdmin (web/src/lib/reseller/require-admin.ts).

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  applyComplementarySuppression,
  applyK,
  K_ANONYMITY_THRESHOLD,
} from "@/lib/reseller/portfolio-aggregates";
import { AffiliateViewClient } from "./affiliate-view-client";
import type { ResellerListEntry, ResellerRow } from "./types";

export const dynamic = "force-dynamic";

async function loadResellers(): Promise<ResellerListEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data: resellers } = await supabase
      .from("resellers")
      .select("id, code, display_name, billing_model, status, created_at")
      .order("created_at", { ascending: false });

    const rows = (resellers ?? []) as ResellerRow[];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { data: attrs } = await supabase
      .from("reseller_attributions")
      .select("reseller_id, source, status")
      .in("reseller_id", ids)
      .eq("status", "active");

    const bySource = new Map<
      string,
      { provisioned: number; code: number; admin_manual: number }
    >();
    for (const r of rows) {
      bySource.set(r.id, { provisioned: 0, code: 0, admin_manual: 0 });
    }
    for (const a of (attrs ?? []) as {
      reseller_id: string;
      source: string;
    }[]) {
      const bucket = bySource.get(a.reseller_id);
      if (!bucket) continue;
      if (a.source === "provisioned") bucket.provisioned += 1;
      else if (a.source === "code") bucket.code += 1;
      else if (a.source === "admin_manual") bucket.admin_manual += 1;
    }

    return rows.map((r) => {
      const b = bySource.get(r.id) ?? { provisioned: 0, code: 0, admin_manual: 0 };
      // Apply per-source k>=5 anonymity, then complementary suppression so
      // the total does not leak the smallest visible bucket.
      const raw = [
        applyK(b.provisioned, K_ANONYMITY_THRESHOLD),
        applyK(b.code, K_ANONYMITY_THRESHOLD),
        applyK(b.admin_manual, K_ANONYMITY_THRESHOLD),
      ];
      const suppressed = applyComplementarySuppression(raw);
      const totalRaw = b.provisioned + b.code + b.admin_manual;
      return {
        ...r,
        summary: {
          provisioned: suppressed[0],
          code: suppressed[1],
          admin_manual: suppressed[2],
          total: applyK(totalRaw, K_ANONYMITY_THRESHOLD),
        },
      };
    });
  } catch {
    return [];
  }
}

export default async function AdminAffiliatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/affiliate");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const resellers = await loadResellers();

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink-900">Affiliate view</h1>
          <p className="mt-1 text-sm text-ink-600">
            Cross-view of every reseller — see who they created vs who typed
            their promo code, and act on individual attributions. Counts below
            5 render as {"<5"} (k-anonymity, per docs/plans/reseller-module-plan.md § U.15.3).
          </p>
        </header>

        {resellers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">
              No resellers yet. Once migrations 0091 + 0092 are applied to prod
              DB, the InfoVision seed row will appear here.
            </p>
          </div>
        ) : (
          <AffiliateViewClient resellers={resellers} />
        )}
      </div>
    </div>
  );
}
