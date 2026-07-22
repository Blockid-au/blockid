// GET /reseller/requests — reseller's own admin-approval queue with
// per-request status + admin decision_reason on denials (Customer-Success
// advisory §24b — surface decision reasons on a page render, not just API).
//
// Reads reseller_requests scoped to the caller's reseller_id via
// scopedReseller(). Presentation is delegated to a small client component
// so the EN+VI copy switching matches the Grant modal precedent (tick 62)
// and the customer-drawer pattern (tick 61).

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { ResellerRequestRow } from "@/lib/reseller/request-summary";
import { RequestsView } from "./requests-view";

export const dynamic = "force-dynamic";

export default async function ResellerRequestsPage() {
  const user = await getCurrentUser();
  if (!user) return <p className="text-sm text-red-600">Not signed in.</p>;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return <p className="text-sm text-yellow-800">No reseller membership.</p>;
    }
    throw err;
  }

  const supabase = getSupabaseAdmin();
  let rows: ResellerRequestRow[] = [];
  let queryError: string | null = null;
  if (!supabase) {
    queryError = "not_configured";
  } else {
    const { data, error } = await supabase
      .from("reseller_requests")
      .select(
        "id, request_type, status, payload, decision_at, decision_reason, created_at",
      )
      .eq("reseller_id", scope.reseller_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      queryError = error.message;
    } else {
      rows = (data ?? []) as ResellerRequestRow[];
    }
  }

  return <RequestsView rows={rows} queryError={queryError} />;
}
