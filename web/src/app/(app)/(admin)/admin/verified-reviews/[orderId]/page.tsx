// /admin/verified-reviews/[orderId] — G35 Pricing v5 P4 (plan §6.6).
//
// One Verified order under review: SLA (Sydney business days), startup,
// buyer, the report's headline numbers, and every claim / evidence item the
// report rests on with per-item Accept / Reject + note, internal review notes
// and the "Mark reviewed" action. Admin only (ADMIN_EMAIL or role admin).
// A refunded or delivered order renders read-only.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadVerifiedReviewDetail } from "@/lib/verified-review/detail";
import { VerifiedReviewClient } from "./verified-review-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Verified review — BlockID Admin",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ orderId: string }> };

export default async function VerifiedReviewDetailPage({ params }: Props) {
  const { orderId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/admin/verified-reviews/${orderId}`)}`);
  if (!isAdmin(user)) redirect("/workspace/score");

  const supabase = getSupabaseAdmin();
  const loaded = supabase ? await loadVerifiedReviewDetail(supabase, orderId) : ({ ok: false, error: "db_error" } as const);
  if (!loaded.ok && loaded.error === "not_found") notFound();

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
          <Link href="/admin/verified-reviews" className="hover:text-brand-navy hover:underline">
            Verified reviews
          </Link>{" "}
          / <span className="text-ink-700">Order {orderId.slice(0, 8)}</span>
        </nav>
        {!loaded.ok ? (
          <div role="alert" className="rounded-xl border border-line-subtle border-l-4 border-l-warn bg-surface-sunken p-4 text-sm text-amber-900">
            {loaded.error === "migration_pending"
              ? "Migration 0474_pricing_v5_payg.sql is not applied on this database yet — apply it (after 0473) and reload."
              : "Could not load this review. Reload the page; if it persists, check the server log."}
          </div>
        ) : (
          <VerifiedReviewClient initial={loaded.detail} />
        )}
      </div>
    </div>
  );
}
