// /admin/evidence-review — G14-S36 reviewer queue.
//
// The only surface that can raise a svi_dimension_evidence row to
// third_party_verified (lib/evidence/confidence-cap.ts D4: founder writes cap
// at document_uploaded). Lists rows the founder queued with "Request
// verification" (review_status = 'pending'); approve / reject PATCH
// /api/admin/evidence/[id]/review (audited). Admin only — same guard as
// /admin/uptime-guardian. Reads through the service-role client.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EMPTY_REVIEW_QUEUE, loadEvidenceReviewQueue, type ReviewQueueDb } from "@/lib/evidence/review-queue";
import { EvidenceReviewClient } from "./evidence-review-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Evidence review — BlockID Admin",
  robots: { index: false, follow: false },
};

export default async function EvidenceReviewAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/evidence-review");
  if (!isAdmin(user)) redirect("/workspace/score");

  const supabase = getSupabaseAdmin();
  const queue = supabase ? await loadEvidenceReviewQueue(supabase as unknown as ReviewQueueDb) : { ...EMPTY_REVIEW_QUEUE, error: "Supabase not configured" };

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">CISO · verification integrity</p>
          <h1 className="text-2xl font-semibold text-ink-900">Evidence review queue</h1>
          <p className="mt-1 text-sm text-ink-600">
            Founders file evidence at <code className="rounded bg-surface-100 px-1">document_uploaded</code> at most. A row reaches{" "}
            <code className="rounded bg-surface-100 px-1">third_party_verified</code> only when you approve it here — the decision stamps{" "}
            <code className="rounded bg-surface-100 px-1">is_verified</code> / <code className="rounded bg-surface-100 px-1">verified_by_user_id</code> and is audit-logged.
            Rejections need a note; the founder sees it on the evidence row.
          </p>
        </header>
        {queue.error === "migration_pending" ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Migration <code>0407_evidence_review.sql</code> is not applied on this database yet — the review columns do not exist. Apply it with{" "}
            <code>scripts/db/apply-migration.sh supabase/migrations/0407_evidence_review.sql</code> and reload.
          </div>
        ) : queue.error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">Could not load the queue: {queue.error}</div>
        ) : (
          <EvidenceReviewClient initial={queue} />
        )}
      </div>
    </div>
  );
}
