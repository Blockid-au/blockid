// GET /api/cron/reseller-monthly-report
//
// Monthly KPI report per reseller. Runs 1st of each month (crontab.production).
// Per docs/plans/reseller-module-plan.md § C.6 (R9) and § P7_kpi_reports.
//
// Reads revenue_events (attribution + commission surface, per migration 0092)
// + reseller_credit_grants (per migration 0096), groups by reseller for the
// previous calendar month, and emails admin@blockid.au a CSV attachment
// following the § C.6 column contract.
//
// Signed-URL storage delivery via /reseller/reports is a follow-up sub-phase;
// this route ships the cron + email side of the exit criteria so downstream
// storage integration has a stable data source.
//
// Window: previous full calendar month by default; ?month=YYYY-MM overrides
// so admins can re-run historical reports. ?skip_email=1 for dry-run.
//
// Auth: shared CRON_SECRET pattern.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  buildMonthlyReport,
  formatMonthlyReportCsv,
  formatMonthlyReportEmail,
  monthWindow,
  previousMonthKey,
  type CreditGrantRow,
  type MonthlyReportRow,
  type ResellerMeta,
  type RevenueEventRow,
} from "@/lib/reseller/monthly-report";
import {
  buildStoragePath,
  REPORT_BUCKET,
  selectExpiredReports,
} from "@/lib/reseller/report-storage";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

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
  const monthKey =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : previousMonthKey();
  const skipEmail = url.searchParams.get("skip_email") === "1";
  const { startIso, endIso } = monthWindow(monthKey);

  const { data: eventsData, error: eventsErr } = await supabase
    .from("revenue_events")
    .select(
      "reseller_id, user_id, ts, kind, gross_aud_cents, net_aud_cents, reseller_commission_aud_cents",
    )
    .not("reseller_id", "is", null)
    .gte("ts", startIso)
    .lt("ts", endIso);
  if (eventsErr) {
    return NextResponse.json(
      { ok: false, reason: "events_query_failed", error: eventsErr.message },
      { status: 500 },
    );
  }

  const { data: grantsData, error: grantsErr } = await supabase
    .from("reseller_credit_grants")
    .select("reseller_id, kind, amount, over_budget, month_key")
    .eq("month_key", monthKey);
  if (grantsErr) {
    return NextResponse.json(
      { ok: false, reason: "grants_query_failed", error: grantsErr.message },
      { status: 500 },
    );
  }

  const events = (eventsData ?? []) as unknown as RevenueEventRow[];
  const grants = (grantsData ?? []) as unknown as CreditGrantRow[];

  const involvedIds = new Set<string>();
  for (const e of events) if (e.reseller_id) involvedIds.add(e.reseller_id);
  for (const g of grants) involvedIds.add(g.reseller_id);

  let resellers: ResellerMeta[] = [];
  if (involvedIds.size > 0) {
    const { data, error } = await supabase
      .from("resellers")
      .select("id, code, display_name")
      .in("id", Array.from(involvedIds));
    if (error) {
      return NextResponse.json(
        { ok: false, reason: "resellers_query_failed", error: error.message },
        { status: 500 },
      );
    }
    resellers = (data ?? []) as ResellerMeta[];
  }

  const rows: MonthlyReportRow[] = buildMonthlyReport(monthKey, events, grants, resellers);
  const csv = formatMonthlyReportCsv(monthKey, rows);
  const html = formatMonthlyReportEmail(monthKey, rows);

  // Upload per-reseller CSV artifacts to Supabase Storage and upsert metadata.
  // Signed-URL delivery is served on-demand by /api/reseller/reports/[month]/signed-url.
  const uploads: {
    reseller_id: string;
    storage_path: string;
    size_bytes: number;
    row_count: number;
  }[] = [];
  const uploadErrors: { reseller_id: string; error: string }[] = [];
  for (const row of rows) {
    const perResellerCsv = formatMonthlyReportCsv(
      monthKey,
      rows.filter((r) => r.reseller_id === row.reseller_id),
    );
    const buf = Buffer.from(perResellerCsv, "utf8");
    const path = buildStoragePath(row.reseller_id, monthKey);
    const { error: uploadErr } = await supabase.storage
      .from(REPORT_BUCKET)
      .upload(path, buf, {
        contentType: "text/csv",
        upsert: true,
      });
    if (uploadErr) {
      uploadErrors.push({ reseller_id: row.reseller_id, error: uploadErr.message });
      continue;
    }
    uploads.push({
      reseller_id: row.reseller_id,
      storage_path: path,
      size_bytes: buf.byteLength,
      row_count: 1,
    });
  }

  if (uploads.length > 0) {
    const { error: upsertErr } = await supabase
      .from("reseller_report_files")
      .upsert(
        uploads.map((u) => ({
          reseller_id: u.reseller_id,
          month_key: monthKey,
          storage_bucket: REPORT_BUCKET,
          storage_path: u.storage_path,
          size_bytes: u.size_bytes,
          row_count: u.row_count,
          generated_at: new Date().toISOString(),
        })),
        { onConflict: "reseller_id,month_key" },
      );
    if (upsertErr) {
      uploadErrors.push({ reseller_id: "*", error: `metadata_upsert: ${upsertErr.message}` });
    }
  }

  // Purge rows + Storage objects older than the 24-month hard retention.
  let purged = 0;
  const { data: allFiles } = await supabase
    .from("reseller_report_files")
    .select("id, reseller_id, month_key, storage_bucket, storage_path");
  const expiredRows = selectExpiredReports((allFiles ?? []) as { id: string; reseller_id: string; month_key: string; storage_bucket: string; storage_path: string }[]);
  if (expiredRows.length > 0) {
    const byBucket = new Map<string, string[]>();
    for (const r of expiredRows) {
      const list = byBucket.get(r.storage_bucket) ?? [];
      list.push(r.storage_path);
      byBucket.set(r.storage_bucket, list);
    }
    for (const [bucket, paths] of byBucket) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) {
        uploadErrors.push({ reseller_id: "*", error: `retention_purge: ${error.message}` });
      }
    }
    const { error: delErr } = await supabase
      .from("reseller_report_files")
      .delete()
      .in(
        "id",
        expiredRows.map((r) => r.id),
      );
    if (delErr) {
      uploadErrors.push({ reseller_id: "*", error: `retention_delete: ${delErr.message}` });
    } else {
      purged = expiredRows.length;
    }
  }

  let emailed = false;
  if (!skipEmail) {
    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[BlockID] Reseller monthly KPI report — ${monthKey} (${rows.length} reseller${rows.length === 1 ? "" : "s"})`,
      html,
      attachments: [
        {
          filename: `reseller-monthly-report-${monthKey}.csv`,
          content: Buffer.from(csv, "utf8"),
          contentType: "text/csv",
        },
      ],
    }).catch((e) => {
      console.error("[reseller-monthly-report] email failed", e);
      return { ok: false, id: "" } as const;
    });
    emailed = Boolean((result as { ok?: boolean }).ok);
  }

  return NextResponse.json({
    ok: true,
    month: monthKey,
    reseller_count: rows.length,
    total_gross_aud_cents: rows.reduce(
      (acc, r) => acc + r.blockid_gross_revenue_aud_cents,
      0,
    ),
    total_commission_aud_cents: rows.reduce(
      (acc, r) => acc + r.commission_owed_aud_cents,
      0,
    ),
    total_credits_granted: rows.reduce((acc, r) => acc + r.ai_credits_granted, 0),
    emailed,
    uploaded: uploads.length,
    upload_errors: uploadErrors,
    purged,
    ran_at: new Date().toISOString(),
  });
}

export { GET as POST };
