/**
 * /workspace/reports/order — the thin order wrapper for a Trust Business
 * Report purchase.
 *
 * G19-S45 (D4): the paid product is the ReportV2 page. This route resolves
 * the order id and REDIRECTS to `reportOrderPath(orderId)`
 * (`/workspace/reports/business?order=<id>`), where the same document
 * renders with every chapter unlocked. The Stripe success_url and every
 * e-mail that links here keep working — they just land on the ReportV2
 * page. Only `?view=legacy` stays here (`<ReportOrderView>`: the markdown
 * + exports of an order generated before ReportV2 existed).
 *
 * Master Upgrade Plan §8.4. Accepts either identifier the two purchase
 * paths can produce:
 *
 *   ?order=<uuid>        Path B (credits). /api/reports/redeem returns
 *                        the order id synchronously, so ReportPaywallGate
 *                        can navigate straight here.
 *
 *   ?session_id=<cs_…>   Path A (Stripe). The Checkout success_url is
 *                        fixed at session-creation time, before the
 *                        report_orders row exists, so Stripe can only
 *                        hand back its own session id. We resolve it to
 *                        an order here — scoped to the signed-in user,
 *                        so a session id copied from someone else's
 *                        receipt resolves to nothing.
 *
 * Resolution happens on the server so the client component is only ever
 * handed an order id it is entitled to poll; the API re-checks ownership
 * on every request regardless.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ReportOrderView } from "@/components/paywall/ReportOrderView";
import { orderLandingRedirect } from "@/lib/paywall/report-delivery";

export const metadata: Metadata = {
  title: "Your Trusted Business Report — BlockID",
  description:
    "View, poll and export the Trusted Business Report you purchased for your business.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<{
    order?: string | string[];
    session_id?: string | string[];
    /** G19-S45: `legacy` keeps the markdown wrapper (pre-v2 orders); anything else redirects to the ReportV2 page. */
    view?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Stripe session id → owned order id. Returns "" when nothing matches. */
async function resolveOrderFromSession(
  sessionId: string,
  userId: string,
): Promise<string> {
  if (sessionId.length === 0 || sessionId.length > 200) return "";
  const supabase = getSupabaseAdmin();
  if (!supabase) return "";

  const { data } = await supabase
    .from("report_orders")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  return typeof data?.id === "string" ? data.id : "";
}

export default async function ReportOrderPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports/order");

  const params = await searchParams;
  const explicitOrder = firstParam(params.order).trim();
  const sessionId = firstParam(params.session_id).trim();

  let orderId = UUID_RE.test(explicitOrder) ? explicitOrder : "";
  if (orderId.length === 0 && sessionId.length > 0) {
    orderId = await resolveOrderFromSession(sessionId, user.id);
  }

  // G19-S45 (D4): the paid view is the ReportV2 page.
  const landing = orderLandingRedirect(orderId, firstParam(params.view).trim());
  if (landing) redirect(landing);

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/reports" className="hover:text-brand-600">
            Reports
          </Link>{" "}
          / <span className="text-ink-700">Trusted Business Report</span>
        </nav>

        {orderId.length > 0 ? (
          <ReportOrderView orderId={orderId} />
        ) : (
          <section
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6"
            role="status"
          >
            <h1 className="text-xl font-semibold text-ink-900">
              We could not find that report order
            </h1>
            <p className="text-sm leading-relaxed text-ink-600">
              {sessionId.length > 0
                ? "Your payment may still be settling — Stripe can take a moment to confirm. Refresh this page in a minute. If it still does not appear, contact support with your receipt and we will sort it out."
                : "This page needs a report order to show. Open it from your dashboard, or start a new Trusted Business Report."}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-medium hover:border-brand-400"
            >
              Back to dashboard
            </Link>
          </section>
        )}
      </div>
    </WorkspaceLayout>
  );
}
