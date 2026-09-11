/**
 * POST /api/funding/report — signed-in Money Finder report (T0242, §4e).
 *
 * Pipeline (accelerator-apply pattern): auth → rate-limit → entitlement /
 * credit pre-flight → generate → insert `funding_reports` as `generating`
 * → spend credits → flip the row to `ready`. Two rails:
 *   • plan-included — `can(user, "grant_finder")` (Starter+, Startup Package,
 *     evaluator rungs): `paid_via = 'plan'`, no credit spend, row inserted
 *     `ready` directly.
 *   • credits — `canAfford(user.id, "grant_match")` (3 credits, §4g) → 402
 *     `insufficient_credits` when short; `spendCredits` runs only after the
 *     generation succeeded (a failed generation never charges) but BEFORE the
 *     row becomes `ready`: a spend that loses the race (`ok:false`) leaves the
 *     row `spend_failed`, which `publicFundingReport` serves without any
 *     matches / narrative (review 2026-09-10 #2 — two concurrent POSTs on a
 *     balance of 3 used to give the second caller a full report for free).
 *
 * Body: `{ ...FundingIntake, project_id?: string }`. When a project the user
 * owns is given, the intake is persisted to `project_grant_profiles` (§4b)
 * so the next run (and T0247 Founder Radar) is prefilled.
 *
 * GET (T0247) returns `{ ok, paid_count }` for the signed-in user — see below.
 *
 *   200 { ok, reportId, url, paidVia, creditsCharged, summary }
 *   400 { ok:false, error, field }   401 unauthorized   402 insufficient_credits
 *   403 project_not_found_or_forbidden   429 rate_limited   503 service_unavailable
 */

import { NextResponse } from "next/server";
import { isUuid, PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { can } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import { parseFundingIntake, intakeToProjectGrantProfile } from "@/lib/funding/intake";
import { buildReportFromIntake, countPaidFundingReports, newAccessToken, reportColumns } from "@/lib/funding/reports";

export const dynamic = "force-dynamic";

const FEATURE_KEY = "grant_match";
const RATE_LIMIT_PER_HOUR = 10;
const INTAKE_BODY_MAX_BYTES = 16 * 1024;

/**
 * GET /api/funding/report — how many reports the signed-in user has paid for
 * (A$3 / credits; plan-included runs excluded). The /funding paywall uses it
 * to show the Founder Radar card after the third purchase (T0247).
 *
 *   200 { ok, paid_count }   401 unauthorized
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const paid_count = await countPaidFundingReports(user.id);
  return NextResponse.json({ ok: true, paid_count }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  // 1. Auth
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit (per user)
  const limited = enforceRateLimit("funding-report", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  // 3. Body — 16 KB byte cap before parsing (S8-C).
  const read = await readJsonBody<Record<string, unknown> | null>(request, INTAKE_BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body", field: "description" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const parsed = parseFundingIntake(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, field: parsed.field }, { status: 400 });
  }
  const projectIdRaw = body.project_id ?? body.projectId;
  const projectId = typeof projectIdRaw === "string" && projectIdRaw.trim() ? projectIdRaw.trim() : null;
  if (projectId && !isUuid(projectId)) {
    return NextResponse.json({ ok: false, error: "invalid_project_id", field: "project_id" }, { status: 400 });
  }

  // 4. Ownership (only when a project is attached)
  if (projectId) {
    const project = await getProjectById(projectId);
    if (!project || project.userId !== user.id) {
      return NextResponse.json({ ok: false, error: "project_not_found_or_forbidden" }, { status: 403 });
    }
  }

  // 5. Entitlement → credit pre-flight
  const included = await can({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "grant_finder");
  let cost = 0;
  if (!included) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    if (!afford.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "insufficient_credits",
          creditsRequired: FEATURE_COSTS[FEATURE_KEY] ?? afford.cost,
          balance: afford.balance,
          reason: afford.reason ?? "insufficient_credits",
        },
        { status: 402 },
      );
    }
    cost = afford.cost;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  // 6. Generate (LLM narrative on — this is the paid product)
  let report;
  try {
    report = await buildReportFromIntake(parsed.intake, { withNarrative: true });
  } catch (err) {
    console.error("[funding:report] generate failed", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "generation_failed" }, { status: 500 });
  }

  // 7. Persist the row — `generating` on the credits rail until the spend
  //    lands (step 9), `ready` straight away when the plan includes it.
  const accessToken = newAccessToken();
  const { data: inserted, error: insertErr } = await supabase
    .from("funding_reports")
    .insert({
      user_id: user.id,
      project_id: projectId,
      intake: parsed.intake,
      credits_cost: cost,
      paid_via: included ? "plan" : "credits",
      access_token: accessToken,
      ...reportColumns(report),
      ...(included ? {} : { status: "generating" }),
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    console.error("[funding:report] insert failed", insertErr?.message ?? "no row");
    return NextResponse.json({ ok: false, error: "report_insert_failed" }, { status: 500 });
  }
  const reportId = String(inserted.id);

  // 8. Remember the intake on the project (non-fatal)
  if (projectId) {
    const { error: profErr } = await supabase
      .from("project_grant_profiles")
      .upsert({ project_id: projectId, ...intakeToProjectGrantProfile(parsed.intake) }, { onConflict: "project_id" });
    if (profErr) console.warn("[funding:report] project_grant_profiles upsert failed", profErr.message);
  }

  // 9. Spend credits (atomic RPC, credits.ts) BEFORE the row is readable.
  let creditsCharged = 0;
  if (!included) {
    const spend = await spendCredits(user.id, FEATURE_KEY, { funding_report_id: reportId, project_id: projectId });
    if (!spend.ok) {
      await supabase.from("funding_reports").update({ status: "spend_failed" }).eq("id", reportId);
      const creditsNeeded = FEATURE_COSTS[FEATURE_KEY] ?? cost;
      return NextResponse.json(
        {
          ok: false,
          error: "credit_spend_failed",
          creditsRequired: creditsNeeded,
          credits_needed: creditsNeeded,
          balance: spend.balance,
          reportId,
        },
        { status: 402 },
      );
    }
    creditsCharged = cost;
    const { error: readyErr } = await supabase.from("funding_reports").update({ status: "ready" }).eq("id", reportId).eq("status", "generating");
    if (readyErr) {
      // Credits are spent and the content is stored; return the id anyway so
      // the founder is not charged for nothing — support flips the status.
      console.error("[funding:report] ready flip failed", { reportId, message: readyErr.message });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      reportId,
      url: `/funding/report/${reportId}`,
      paidVia: included ? "plan" : "credits",
      creditsCharged,
      summary: report.summary,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}
