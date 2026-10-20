// /admin/verified-reviews — G35 Pricing v5 P4 (plan §6.6).
//
// The queue of Verified report orders waiting for a human review
// (report_orders.status = IN_REVIEW), overdue first, then by SLA deadline
// (2 Sydney business days, NSW holidays excluded). A refunded order drops
// out (it is no longer IN_REVIEW). Admin only — the same guard as
// /admin/evidence-review (ADMIN_EMAIL or role admin). Reads through the
// service-role client.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadVerifiedReviewQueue, type VerifiedQueue, type VerifiedQueueRow } from "@/lib/verified-review/detail";
import { SlaPill } from "./sla-pill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Verified reviews — BlockID Admin",
  robots: { index: false, follow: false },
};

const DATE_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

function buyer(row: VerifiedQueueRow): string {
  return row.buyerName ?? row.buyerEmail ?? "—";
}

function progress(row: VerifiedQueueRow): string {
  if (!row.reviewStatus) return "Not started";
  return `${row.decisions} decision${row.decisions === 1 ? "" : "s"}`;
}

export default async function VerifiedReviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/verified-reviews");
  if (!isAdmin(user)) redirect("/workspace/score");

  const supabase = getSupabaseAdmin();
  const queue: VerifiedQueue = supabase
    ? await loadVerifiedReviewQueue(supabase)
    : { rows: [], counts: { total: 0, overdue: 0, dueSoon: 0, onTrack: 0 }, error: "Supabase not configured", generatedAt: new Date().toISOString() };

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Pricing v5 · Verified tier</p>
          <h1 className="text-2xl font-semibold text-ink-900">Verified reviews</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Verified reports wait here after generation. Check each claim and its evidence, accept or reject it, then mark the report reviewed — the buyer gets the
            &ldquo;BlockID Reviewed&rdquo; badge, the Investor Pack and an e-mail. Deadline: 2 Sydney business days from payment (NSW public holidays excluded).
          </p>
        </header>

        {queue.error === "migration_pending" ? (
          <div role="alert" className="rounded-xl border border-line-subtle border-l-4 border-l-warn bg-surface-sunken p-4 text-sm text-amber-900">
            Migration <code>0474_pricing_v5_payg.sql</code> is not applied on this database yet — the review columns and tables do not exist. Apply it (after 0473) and reload.
          </div>
        ) : queue.error ? (
          <div role="alert" className="rounded-xl border border-line-subtle border-l-4 border-l-bear bg-surface-sunken p-4 text-sm text-red-900">
            Could not load the queue: {queue.error}
          </div>
        ) : (
          <>
            <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "In review", value: queue.counts.total },
                { label: "Overdue", value: queue.counts.overdue },
                { label: "Due soon", value: queue.counts.dueSoon },
                { label: "On track", value: queue.counts.onTrack },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-surface-200 bg-white p-4">
                  <dt className="text-xs uppercase tracking-wide text-ink-500">{c.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{c.value}</dd>
                </div>
              ))}
            </dl>

            {queue.rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500">
                Nothing in review. A Verified order appears here once its report has been generated.
              </p>
            ) : (
              <>
                {/* Desktop: table */}
                <div className="hidden overflow-x-auto rounded-xl border border-surface-200 bg-white md:block">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Verified report orders in review, most urgent first</caption>
                    <thead className="border-b border-surface-200 bg-surface-50 text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">SLA</th>
                        <th scope="col" className="px-4 py-3 font-medium">Startup</th>
                        <th scope="col" className="px-4 py-3 font-medium">Buyer</th>
                        <th scope="col" className="px-4 py-3 font-medium">Tier</th>
                        <th scope="col" className="px-4 py-3 font-medium">Paid</th>
                        <th scope="col" className="px-4 py-3 font-medium">Progress</th>
                        <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {queue.rows.map((row) => (
                        <tr key={row.orderId} data-sla-state={row.sla.state} className="align-top">
                          <td className="px-4 py-3">
                            <SlaPill state={row.sla.state} />
                            <p className="mt-1 text-xs text-ink-700">{row.sla.line}</p>
                            {row.sla.dueLabel && <p className="text-xs text-ink-500">Due {row.sla.dueLabel}</p>}
                          </td>
                          <td className="px-4 py-3 font-medium text-ink-900">{row.startupName ?? <span className="text-ink-500">Unnamed startup</span>}</td>
                          <td className="px-4 py-3 text-ink-700">
                            <span className="break-all">{buyer(row)}</span>
                            {row.buyerName && row.buyerEmail && <span className="block break-all text-xs text-ink-500">{row.buyerEmail}</span>}
                          </td>
                          <td className="px-4 py-3 capitalize text-ink-700">{row.tier}</td>
                          <td className="px-4 py-3 tabular-nums text-ink-700">{when(row.paidAt)}</td>
                          <td className="px-4 py-3 text-ink-700">{progress(row)}</td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/admin/verified-reviews/${row.orderId}`}
                              className="inline-flex min-h-[40px] items-center rounded-lg border border-brand-navy/40 px-3 text-sm font-medium text-brand-navy hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                            >
                              Review
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: cards */}
                <ul className="space-y-3 md:hidden">
                  {queue.rows.map((row) => (
                    <li key={row.orderId} data-sla-state={row.sla.state} className="rounded-xl border border-surface-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-ink-900">{row.startupName ?? "Unnamed startup"}</p>
                        <SlaPill state={row.sla.state} />
                      </div>
                      <p className="mt-1 text-xs text-ink-700">{row.sla.line}</p>
                      {row.sla.dueLabel && <p className="text-xs text-ink-500">Due {row.sla.dueLabel}</p>}
                      <p className="mt-2 break-all text-xs text-ink-600">
                        {buyer(row)} · <span className="capitalize">{row.tier}</span> · paid {when(row.paidAt)} · {progress(row)}
                      </p>
                      <Link
                        href={`/admin/verified-reviews/${row.orderId}`}
                        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-brand-navy/40 text-sm font-medium text-brand-navy hover:bg-surface-100"
                      >
                        Review
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-4 text-xs text-ink-500">Times shown in Sydney time. Refunded orders leave the queue automatically.</p>
          </>
        )}
      </div>
    </div>
  );
}
