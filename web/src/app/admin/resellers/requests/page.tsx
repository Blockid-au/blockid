// /admin/resellers/requests — admin inbox for reseller approval requests.
//
// Track A P9.3. requireAdmin gate; server-fetches pending + recent-decided
// rows and hands them to the client component for approve/deny actions.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { RequestsInboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export interface InboxRow {
  id: string;
  reseller_id: string;
  requested_by: string;
  request_type: "code_request" | "over_budget_approval" | "collateral_approval";
  status: "pending" | "approved" | "denied" | "cancelled";
  payload: Record<string, unknown>;
  decision_by: string | null;
  decision_at: string | null;
  decision_reason: string | null;
  linked_credit_transaction_id: string | null;
  linked_promotion_code_id: string | null;
  created_at: string;
  resellers:
    | { code: string; display_name: string }
    | { code: string; display_name: string }[]
    | null;
}

async function loadRows(status: "pending" | "approved" | "denied"): Promise<InboxRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("reseller_requests")
      .select(
        "id, reseller_id, requested_by, request_type, status, payload, decision_by, decision_at, decision_reason, linked_credit_transaction_id, linked_promotion_code_id, created_at, resellers(code, display_name)",
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(status === "pending" ? 200 : 25);
    return (data ?? []) as InboxRow[];
  } catch {
    return [];
  }
}

export default async function AdminResellerRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/resellers/requests");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const [pending, approved, denied] = await Promise.all([
    loadRows("pending"),
    loadRows("approved"),
    loadRows("denied"),
  ]);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink-900">Reseller requests</h1>
          <p className="mt-1 text-sm text-ink-600">
            Approvals inbox for code minting, over-budget credit grants, and
            marketing collateral. Approving an over-budget grant automatically
            bumps the customer&apos;s credit balance and mirrors into{" "}
            <code className="rounded bg-surface-200 px-1 text-[0.7rem]">
              reseller_credit_grants
            </code>
            . Approving a code request marks it ready — mint the Stripe coupon
            + promotion code on the{" "}
            <a
              href="/admin/resellers"
              className="text-brand-700 underline"
            >
              reseller detail page
            </a>
            .
          </p>
        </header>

        <RequestsInboxClient
          pending={pending}
          approved={approved}
          denied={denied}
        />
      </div>
    </div>
  );
}
