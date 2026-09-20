/**
 * PilotActiveBanner — the accelerator desk's one-line notice while a paid
 * Cohort Validation Pilot is live (G21 P0-C). Reads `pilot_orders` through
 * `findActivePilotOrder()` (owner-only RLS, service-role on the server);
 * renders nothing without a live `paid` row. `?pilot=paid` (the Stripe
 * success return) shows the same banner with a "payment received" lead so
 * the buyer sees confirmation even before the webhook has landed.
 *
 * Server component. Never throws — a DB miss renders nothing.
 */

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { findActivePilotOrder } from "@/lib/pilots/paid-orders";
import { PILOT_SKUS, isPilotSkuId } from "@/lib/pricing/pilot-skus";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

export async function PilotActiveBanner({ userId, justPaid = false }: { userId: string; justPaid?: boolean }) {
  const order = await findActivePilotOrder(userId);
  if (!order && !justPaid) return null;
  const cap = order?.applicants_cap ?? (isPilotSkuId(order?.sku) ? PILOT_SKUS[order.sku].applicantsCap : null);
  return (
    <div className="mx-auto max-w-6xl px-6 pt-6">
      <div
        data-testid="pilot-active-banner"
        data-pilot-status={order ? "active" : "pending"}
        className="flex flex-col gap-3 rounded-xl border border-action/25 bg-action/5 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-action" aria-hidden="true" />
          <div>
            <p className="font-semibold text-primary">
              {order
                ? `Cohort Validation Pilot active — up to ${cap} applicants · until ${fmtDate(order.entitlement_until)}`
                : "Payment received — your Cohort Validation Pilot is being set up"}
            </p>
            <p className="mt-1 text-sm text-secondary">
              {order
                ? "Applicants arrive through your intake link and land scored in your inbox; the cohort table fills as they do. We set up the intake with you within two business days of purchase."
                : "We e-mail you within two business days to set up the intake. Your Cohort-tier workspace switches on as soon as the payment confirmation lands (usually within a minute)."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/workspace/accelerator/applications" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover">
            Intake inbox
          </Link>
          <Link href="/workspace/accelerator/cohort" className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
            Cohort table
          </Link>
        </div>
      </div>
    </div>
  );
}
