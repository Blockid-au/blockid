// GET /api/reseller/reports/[month]/signed-url
//
// Mint a 24-hour signed URL for the reseller's monthly KPI CSV in Supabase
// Storage. Per docs/plans/reseller-module-plan.md § C.6 (retention) +
// § P7_kpi_reports (P7.2_signed_url_storage) + § U.15.13 (D3-CISO-01).
//
// Chokepoint pattern: scopedReseller(user) first, then look up the metadata
// row on (reseller_id, month_key), gate on the 12-month exposed window,
// mint the signed URL, and write reseller_audit_log(action='download_report')
// BEFORE returning the URL.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ResellerScopeError, scopedReseller } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  buildDownloadFilename,
  isMonthExposed,
  REPORT_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/reseller/report-storage";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/reports/[month]/signed-url";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 });
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  const { month } = await params;
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ ok: false, reason: "invalid_month" }, { status: 400 });
  }
  if (!isMonthExposed(month)) {
    return NextResponse.json({ ok: false, reason: "not_exposed" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const { data: fileRow, error: metaErr } = await supabase
    .from("reseller_report_files")
    .select("id, storage_bucket, storage_path, size_bytes, generated_at")
    .eq("reseller_id", scope.reseller_id)
    .eq("month_key", month)
    .maybeSingle();

  if (metaErr) {
    return NextResponse.json(
      { ok: false, reason: "lookup_failed", error: metaErr.message },
      { status: 500 },
    );
  }
  if (!fileRow) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const db = resellerSupabase(scope);
  const self = await db.selfReseller();
  const downloadName = buildDownloadFilename(
    (self?.display_name as string | null) || (self?.code as string | null) || "reseller",
    month,
  );

  const { data: signed, error: signErr } = await supabase.storage
    .from(fileRow.storage_bucket as string)
    .createSignedUrl(fileRow.storage_path as string, SIGNED_URL_TTL_SECONDS, {
      download: downloadName,
    });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, reason: "sign_failed", error: signErr?.message ?? "unknown" },
      { status: 500 },
    );
  }

  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      action: "download_report",
      fields: [month],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        month_key: month,
        storage_path: fileRow.storage_path,
        size_bytes: fileRow.size_bytes,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

  return NextResponse.json({
    ok: true,
    signed_url: signed.signedUrl,
    filename: downloadName,
    month,
    expires_at: expiresAt,
    ttl_seconds: SIGNED_URL_TTL_SECONDS,
    bucket: REPORT_BUCKET,
  });
}
