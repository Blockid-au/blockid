// GET /api/cron/reseller-monthly-reconciliation
//
// Monthly export of cleared reseller commissions, grouped by reseller.
// Per docs/plans/reseller-module-plan.md § D.5 (monthly reconciliation).
//
// Reads reseller_commissions_current (the derived-status view) filtered on
// status='cleared' inside the reporting window, joins resellers for display
// name + billing model, groups in memory, and emails admin@blockid.au with
// the CSV attached. Idempotent: does not mutate any table.
//
// Window: previous full calendar month by default; ?month=YYYY-MM overrides
// so admins can re-run historical reports.
//
// Auth: shared CRON_SECRET pattern.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import {
  computeGstDelta,
  formatGstDriftEmail,
  formatReconciliationCsv,
  formatReconciliationEmail,
  GST_TOLERANCE_CENTS,
  type GstReconciliation,
  type ReconciliationRow,
} from "@/lib/reseller/reconciliation";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

interface CommissionCurrentRow {
  reseller_id: string;
  commission_aud_cents: number;
  billing_model: string;
  status: string;
}

interface ResellerRow {
  id: string;
  code: string;
  display_name: string | null;
  billing_model: string;
}

function previousMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; want previous
  const target = new Date(Date.UTC(y, m - 1, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthKey: string): { startIso: string; endIso: string } {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get("month");
  const monthKey = requested && /^\d{4}-\d{2}$/.test(requested)
    ? requested
    : previousMonthKey();
  const skipEmail = url.searchParams.get("skip_email") === "1";
  const { startIso, endIso } = monthRange(monthKey);

  // Reseller_commissions_current derives status from the event log, so a row
  // whose event stream ended in 'cleared' this month is what we want.
  // The view exposes `created_at` on the underlying row; we filter on the
  // clearance-event window via a separate query for the 'cleared' events.
  const { data: clearedEvents, error: eventsErr } = await supabase
    .from("reseller_commission_events")
    .select("commission_id, created_at")
    .eq("event_type", "cleared")
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (eventsErr) {
    return NextResponse.json(
      { ok: false, reason: "events_query_failed", error: eventsErr.message },
      { status: 500 },
    );
  }

  const clearedIds = Array.from(new Set((clearedEvents ?? []).map((e) => (e as { commission_id: string }).commission_id)));

  let currentRows: CommissionCurrentRow[] = [];
  if (clearedIds.length > 0) {
    const { data, error } = await supabase
      .from("reseller_commissions_current")
      .select("commission_id, reseller_id, commission_aud_cents, billing_model, status")
      .in("commission_id", clearedIds)
      .eq("status", "cleared");
    if (error) {
      return NextResponse.json(
        { ok: false, reason: "current_query_failed", error: error.message },
        { status: 500 },
      );
    }
    currentRows = (data ?? []) as unknown as CommissionCurrentRow[];
  }

  const totals = new Map<string, { count: number; cents: number; billing_model: string }>();
  for (const row of currentRows) {
    const existing = totals.get(row.reseller_id) ?? {
      count: 0,
      cents: 0,
      billing_model: row.billing_model,
    };
    existing.count += 1;
    existing.cents += row.commission_aud_cents;
    totals.set(row.reseller_id, existing);
  }

  let resellers: ResellerRow[] = [];
  if (totals.size > 0) {
    const { data, error } = await supabase
      .from("resellers")
      .select("id, code, display_name, billing_model")
      .in("id", Array.from(totals.keys()));
    if (error) {
      return NextResponse.json(
        { ok: false, reason: "resellers_query_failed", error: error.message },
        { status: 500 },
      );
    }
    resellers = (data ?? []) as ResellerRow[];
  }

  const resellerById = new Map(resellers.map((r) => [r.id, r]));
  const rows: ReconciliationRow[] = Array.from(totals.entries()).map(([id, agg]) => {
    const r = resellerById.get(id);
    return {
      reseller_id: id,
      reseller_code: r?.code ?? "UNKNOWN",
      reseller_display_name: r?.display_name ?? r?.code ?? "Unknown reseller",
      billing_model: (agg.billing_model as "retail" | "wholesale") ?? "retail",
      cleared_count: agg.count,
      cleared_commission_aud_cents: agg.cents,
    };
  });

  // P7.3 — GST reconciliation gate. Sum revenue_events.gst_aud_cents inside
  // the window, then walk Stripe invoice.tax for the same window and assert
  // |delta| <= A$1. On drift, we still send the reconciliation email but
  // additionally page admin with a standalone alert body.
  const { data: gstRows, error: gstErr } = await supabase
    .from("revenue_events")
    .select("gst_aud_cents")
    .gte("ts", startIso)
    .lt("ts", endIso);
  if (gstErr) {
    return NextResponse.json(
      { ok: false, reason: "gst_query_failed", error: gstErr.message },
      { status: 500 },
    );
  }
  const ledgerGstCents = (gstRows ?? []).reduce(
    (acc, r) => acc + ((r as { gst_aud_cents: number | null }).gst_aud_cents ?? 0),
    0,
  );

  let gstReconciliation: GstReconciliation | null = null;
  let gstDriftEmailed = false;
  let gstSkipReason: string | null = null;
  const stripe = getStripe();
  if (!stripe) {
    gstSkipReason = "stripe_not_configured";
  } else {
    const gte = Math.floor(new Date(startIso).getTime() / 1000);
    const lt = Math.floor(new Date(endIso).getTime() / 1000);
    let stripeGstCents = 0;
    let invoiceCount = 0;
    try {
      // Paginate; auto_pagination.for(...) keeps the request budget bounded
      // even in months with thousands of invoices.
      for await (const inv of stripe.invoices.list({
        created: { gte, lt },
        limit: 100,
      })) {
        invoiceCount += 1;
        // Compare against gross tax collected on paid invoices only —
        // refunds/credit_notes flow through separate objects and the ledger
        // side already excludes them from gst_aud_cents on refund events.
        if (inv.status !== "paid") continue;
        for (const t of inv.total_taxes ?? []) {
          stripeGstCents += t.amount ?? 0;
        }
      }
    } catch (e) {
      gstSkipReason = e instanceof Error ? e.message : "stripe_list_failed";
    }
    if (!gstSkipReason) {
      gstReconciliation = computeGstDelta(
        monthKey,
        ledgerGstCents,
        stripeGstCents,
        invoiceCount,
      );
      if (!gstReconciliation.within_tolerance && !skipEmail) {
        const driftResult = await sendEmail({
          to: ADMIN_EMAIL,
          subject: `[BlockID] GST reconciliation drift — ${monthKey} (delta A$${(gstReconciliation.delta_cents / 100).toFixed(2)})`,
          html: formatGstDriftEmail(gstReconciliation),
        }).catch((e) => {
          console.error("[reseller-monthly-reconciliation] gst drift email failed", e);
          return { ok: false, id: "" } as const;
        });
        gstDriftEmailed = Boolean((driftResult as { ok?: boolean }).ok);
      }
    }
  }

  const csv = formatReconciliationCsv(monthKey, rows);
  const html = formatReconciliationEmail(monthKey, rows, gstReconciliation);

  let emailed = false;
  if (!skipEmail) {
    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[BlockID] Reseller reconciliation — ${monthKey} (${rows.length} reseller${rows.length === 1 ? "" : "s"})`,
      html,
      attachments: [
        {
          filename: `reseller-reconciliation-${monthKey}.csv`,
          content: Buffer.from(csv, "utf8"),
          contentType: "text/csv",
        },
      ],
    }).catch((e) => {
      console.error("[reseller-monthly-reconciliation] email failed", e);
      return { ok: false, id: "" } as const;
    });
    emailed = Boolean((result as { ok?: boolean }).ok);
  }

  return NextResponse.json({
    ok: true,
    month: monthKey,
    reseller_count: rows.length,
    total_cleared_aud_cents: rows.reduce((a, r) => a + r.cleared_commission_aud_cents, 0),
    total_cleared_rows: rows.reduce((a, r) => a + r.cleared_count, 0),
    emailed,
    gst: gstReconciliation
      ? {
          ledger_aud_cents: gstReconciliation.ledger_gst_aud_cents,
          stripe_aud_cents: gstReconciliation.stripe_gst_aud_cents,
          delta_cents: gstReconciliation.delta_cents,
          within_tolerance: gstReconciliation.within_tolerance,
          tolerance_cents: GST_TOLERANCE_CENTS,
          stripe_invoice_count: gstReconciliation.stripe_invoice_count,
          drift_emailed: gstDriftEmailed,
        }
      : { skipped_reason: gstSkipReason ?? "unknown" },
    ran_at: new Date().toISOString(),
  });
}
