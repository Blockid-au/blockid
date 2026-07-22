// GET /api/cron/reseller-weekly-digest
//
// Weekly leading-signal digest per reseller. Runs Mondays (crontab.production)
// per docs/plans/reseller-module-plan.md § U.5 P11 (weekly KPI digest to
// admin@blockid.au) and Customer-Success advisory §24 rec #3 which asked for
// last-login recency + time-to-first-report leading indicators so CS can act
// BEFORE attributed_churn_30d fires.
//
// For each active reseller, iterate attributed customers, join svi_analyses
// (via app_users.email — the joining shape used elsewhere in the codebase),
// compute buildLeadingSignalSummary, and email admin@blockid.au a CSV+HTML
// digest with one row per reseller.
//
// ?skip_email=1 → dry-run (no email send). Response body still includes the
// per-reseller summary counts so operators can eyeball the numbers.
//
// Auth: shared CRON_SECRET pattern (matches sibling reseller-* cron routes).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  buildAnomalySummary,
  DEFAULT_ANOMALY_WINDOW_DAYS,
  type AuditLogRow,
} from "@/lib/reseller/audit-anomaly";
import { HUMAN_BLOCKED_ITEMS } from "@/lib/reseller/human-blocked-registry";
import {
  buildLeadingSignalSummary,
  type AttributedCustomerRow,
  type AttributedReportRow,
} from "@/lib/reseller/leading-signals";
import {
  formatWeeklyDigestAnomaliesSection,
  formatWeeklyDigestCsv,
  formatWeeklyDigestEmail,
  formatWeeklyDigestHumanBlockedSection,
  isoWeekKey,
  type WeeklyDigestRow,
} from "@/lib/reseller/weekly-digest";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

interface ResellerMetaRow {
  id: string;
  code: string;
  display_name: string | null;
}

interface AppUserRow {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
}

interface SviAnalysisRow {
  email: string;
  created_at: string;
}

interface AttributionRow {
  reseller_id: string;
  subject_type: "user" | "project";
  subject_user_id: string | null;
  subject_project_id: string | null;
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
  const skipEmail = url.searchParams.get("skip_email") === "1";
  const now = new Date();
  const week = isoWeekKey(now);

  const { data: resellersData, error: resellersErr } = await supabase
    .from("resellers")
    .select("id, code, display_name")
    .eq("status", "active");
  if (resellersErr) {
    return NextResponse.json(
      { ok: false, reason: "resellers_query_failed", error: resellersErr.message },
      { status: 500 },
    );
  }
  const resellers = (resellersData ?? []) as ResellerMetaRow[];
  if (resellers.length === 0) {
    return NextResponse.json({ ok: true, week, reseller_count: 0, emailed: false });
  }

  const resellerIds = resellers.map((r) => r.id);
  const { data: attribData, error: attribErr } = await supabase
    .from("reseller_attributions")
    .select("reseller_id, subject_type, subject_user_id, subject_project_id")
    .in("reseller_id", resellerIds)
    .eq("status", "active")
    .eq("opted_out", false);
  if (attribErr) {
    return NextResponse.json(
      { ok: false, reason: "attributions_query_failed", error: attribErr.message },
      { status: 500 },
    );
  }
  const attributions = (attribData ?? []) as AttributionRow[];

  // Resolve project attributions to user_ids so the per-reseller customer
  // list mirrors scope.allowedCustomerIds() semantics.
  const projectIds = new Set<string>();
  for (const a of attributions) {
    if (a.subject_type === "project" && a.subject_project_id) {
      projectIds.add(a.subject_project_id);
    }
  }
  const projectToUser = new Map<string, string>();
  if (projectIds.size > 0) {
    const { data: projRows, error: projErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .in("id", Array.from(projectIds));
    if (projErr) {
      return NextResponse.json(
        { ok: false, reason: "projects_query_failed", error: projErr.message },
        { status: 500 },
      );
    }
    for (const p of (projRows ?? []) as { id: string; user_id: string }[]) {
      projectToUser.set(p.id, p.user_id);
    }
  }

  const customersByReseller = new Map<string, Set<string>>();
  for (const a of attributions) {
    let uid: string | null = null;
    if (a.subject_type === "user") uid = a.subject_user_id;
    else if (a.subject_type === "project" && a.subject_project_id) {
      uid = projectToUser.get(a.subject_project_id) ?? null;
    }
    if (!uid) continue;
    const set = customersByReseller.get(a.reseller_id) ?? new Set<string>();
    set.add(uid);
    customersByReseller.set(a.reseller_id, set);
  }

  const allUserIds = Array.from(
    new Set(Array.from(customersByReseller.values()).flatMap((s) => Array.from(s))),
  );

  let usersById = new Map<string, AppUserRow>();
  let userIdByEmail = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: userRows, error: userErr } = await supabase
      .from("app_users")
      .select("id, email, created_at, last_login_at")
      .in("id", allUserIds);
    if (userErr) {
      return NextResponse.json(
        { ok: false, reason: "app_users_query_failed", error: userErr.message },
        { status: 500 },
      );
    }
    for (const u of (userRows ?? []) as AppUserRow[]) {
      usersById.set(u.id, u);
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id);
    }
  }

  // Bridge svi_analyses (email-keyed, no user_id column) → user_id via the
  // app_users.email map built above. Missing/unknown emails are silently
  // dropped by leading-signals so a stray report cannot poison the rollup.
  let reportsByUser = new Map<string, AttributedReportRow[]>();
  if (userIdByEmail.size > 0) {
    const emails = Array.from(userIdByEmail.keys());
    const { data: sviRows, error: sviErr } = await supabase
      .from("svi_analyses")
      .select("email, created_at")
      .in("email", emails);
    if (sviErr) {
      return NextResponse.json(
        { ok: false, reason: "svi_query_failed", error: sviErr.message },
        { status: 500 },
      );
    }
    for (const s of (sviRows ?? []) as SviAnalysisRow[]) {
      if (!s.email) continue;
      const uid = userIdByEmail.get(s.email.toLowerCase());
      if (!uid) continue;
      const list = reportsByUser.get(uid) ?? [];
      list.push({ user_id: uid, generated_at: s.created_at });
      reportsByUser.set(uid, list);
    }
  }

  const digestRows: WeeklyDigestRow[] = [];
  for (const r of resellers) {
    const uids = Array.from(customersByReseller.get(r.id) ?? []);
    const customers: AttributedCustomerRow[] = uids
      .map((uid) => usersById.get(uid))
      .filter((u): u is AppUserRow => Boolean(u))
      .map((u) => ({
        id: u.id,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
      }));
    const reports: AttributedReportRow[] = uids.flatMap(
      (uid) => reportsByUser.get(uid) ?? [],
    );
    const summary = buildLeadingSignalSummary({ customers, reports, now });
    digestRows.push({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      summary,
    });
  }

  const csv = formatWeeklyDigestCsv(week, digestRows);
  let html = formatWeeklyDigestEmail(week, digestRows);

  // Fold in audit-log anomaly hotspots (P10 dry-run per plan Verification #5).
  // Scope the query to the active reseller set so a stale terminated reseller
  // can't inflate the counts. Failures are logged and skipped — the leading-
  // signal digest is the primary content and must ship even when audit
  // telemetry is unavailable.
  const anomalyWindowStart = new Date(
    now.getTime() - DEFAULT_ANOMALY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const { data: auditRows, error: auditErr } = await supabase
    .from("reseller_audit_log")
    .select("reseller_id, actor_user_id, subject_user_id, action, created_at")
    .in("reseller_id", resellerIds)
    .gte("created_at", anomalyWindowStart.toISOString());
  let anomalySummary: ReturnType<typeof buildAnomalySummary> | null = null;
  if (auditErr) {
    console.error("[reseller-weekly-digest] audit_log query failed", auditErr.message);
  } else {
    anomalySummary = buildAnomalySummary((auditRows ?? []) as AuditLogRow[], { now });
    const resellerDisplayNames: Record<string, string> = {};
    for (const r of resellers) {
      resellerDisplayNames[r.id] = r.display_name ?? r.code;
    }
    const section = formatWeeklyDigestAnomaliesSection(anomalySummary, resellerDisplayNames);
    if (section) html += section;
  }

  // COO advisory rec #1: surface the two open human_blocked escalations
  // (P1.5 InfoVision H.20 ABN + GST; P8.5 Stripe add-on price env vars) so
  // admin@blockid.au sees them in the Monday email without grepping the goal
  // file. Static registry — see human-blocked-registry.ts for the source list.
  const humanBlockedSection = formatWeeklyDigestHumanBlockedSection(HUMAN_BLOCKED_ITEMS);
  if (humanBlockedSection) html += humanBlockedSection;

  let emailed = false;
  if (!skipEmail && digestRows.length > 0) {
    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[BlockID] Reseller weekly leading-signal digest — ${week} (${digestRows.length} reseller${digestRows.length === 1 ? "" : "s"})`,
      html,
      attachments: [
        {
          filename: `reseller-weekly-digest-${week}.csv`,
          content: Buffer.from(csv, "utf8"),
          contentType: "text/csv",
        },
      ],
    }).catch((e) => {
      console.error("[reseller-weekly-digest] email failed", e);
      return { ok: false, id: "" } as const;
    });
    emailed = Boolean((result as { ok?: boolean }).ok);
  }

  return NextResponse.json({
    ok: true,
    week,
    reseller_count: digestRows.length,
    rows: digestRows.map((r) => ({
      reseller_id: r.reseller_id,
      reseller_code: r.reseller_code,
      attributed_total: r.summary.attributed_total,
      inactive_7d: r.summary.inactive_7d,
      inactive_30d: r.summary.inactive_30d,
      activated_first_report: r.summary.activated_first_report,
      activated_first_report_pct: r.summary.activated_first_report_pct,
      median_days_to_first_report: r.summary.median_days_to_first_report,
    })),
    emailed,
    anomalies: anomalySummary
      ? {
          actor_hotspot_count: anomalySummary.actor_hotspots.length,
          subject_hotspot_count: anomalySummary.subject_hotspots.length,
          total_rows_in_window: anomalySummary.total_rows_in_window,
          threshold: anomalySummary.threshold,
          window_start: anomalySummary.window_start,
          window_end: anomalySummary.window_end,
        }
      : { skipped_reason: "audit_log_query_failed" },
    human_blocked: {
      count: HUMAN_BLOCKED_ITEMS.length,
      ids: HUMAN_BLOCKED_ITEMS.map((i) => i.id),
    },
    ran_at: now.toISOString(),
  });
}

export { GET as POST };
