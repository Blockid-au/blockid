/**
 * /api/dividends/[recordId]/statements — issue + list distribution statements (S25-B).
 *
 * POST `{ confirm?: boolean }`
 *   Issues one AU distribution statement per payout of the dividend record
 *   for the caller's active project. Same rails as the valuation
 *   certificate (S22-A): auth → rate-limit → scope (editor+) → record →
 *   (preview | issue) → spend.
 *   Gate / cost:
 *     • owner OR an accepted editor/admin member (`getProjectScope("editor")`);
 *     • equity add-on (`esop.manage`) or Growth+ / Startup Package →
 *       included, cost 0 (`statementsIncluded`);
 *     • otherwise `FEATURE_COSTS.dividend_statements` (2 credits) per record,
 *       charged to the CALLER. `confirm !== true` returns 200
 *       `{ preview: true, cost, balance, included, toIssue, alreadyIssued }`
 *       and spends nothing — the panel shows that on the button first.
 *   Idempotent per (record, shareholder): a live statement is returned as
 *   `existing`, never re-inserted, and nothing is charged when there is
 *   nothing left to issue. Spend runs BEFORE the insert; a total failure
 *   after a spend refunds.
 *
 *   200 { ok, preview: true, cost, listedCost, included, balance, creditNote, toIssue, alreadyIssued, company }
 *   200 { ok, issued[], existing[], failed[], cost, creditsCharged, balance, creditNote, register }
 *   401 unauthorized  402 insufficient_credits | credit_spend_failed
 *   403/404 scope / record  409 no_payouts  429 rate_limited  503 service_unavailable
 *
 * GET — statements issued for the record (viewer+), with the register.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUuid, readJsonBody } from "@/lib/security/request-guards";
import { canAfford, grantCredits, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { statementsIncluded } from "@/lib/dividends/gate";
import {
  getDividendRecordForScope,
  issueStatementsForRecord,
  listStatementsForRecord,
  loadCompanyForScope,
  loadShareholdersForScope,
  matchPayouts,
  recordSummary,
  registerForRecord,
  statementSummary,
} from "@/lib/dividends/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const FEATURE_KEY = "dividend_statements";
const RATE_LIMIT_PER_HOUR = 30;
const BODY_MAX_BYTES = 4 * 1024;

async function POST_handler(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(recordId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const limited = enforceRateLimit("dividend-statements", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const confirmed = body.confirm === true;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const creditNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const record = await getDividendRecordForScope(supabase, recordId, recordScope);
  if (!record) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const [company, shareholders, live] = await Promise.all([
    loadCompanyForScope(supabase, recordScope),
    loadShareholdersForScope(supabase, recordScope),
    listStatementsForRecord(supabase, record.id, scope.projectId),
  ]);
  const matches = matchPayouts(record.payouts ?? [], shareholders);
  if (matches.length === 0) {
    return NextResponse.json({ ok: false, error: "no_payouts", message: "This dividend has no paying shareholders — record a dividend against your cap table first." }, { status: 409 });
  }
  const liveKeys = new Set(live.filter((s) => !s.voided_at).map((s) => s.shareholder_key));
  const toIssue = matches.filter((m) => !liveKeys.has(m.key)).map((m) => m.shareholder.name);
  const alreadyIssued = matches.length - toIssue.length;

  // Gate → cost. Nothing to issue → nothing to charge.
  const gate = await statementsIncluded({ id: user.id, plan: user.plan });
  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 2;
  let cost = 0;
  let balance: number | null = null;
  if (!gate.included && toIssue.length > 0) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    cost = listedCost;
    balance = afford.balance;
    if (!afford.allowed) {
      return NextResponse.json(
        { ok: false, error: "insufficient_credits", creditsRequired: cost, balance: afford.balance, reason: afford.reason ?? "insufficient_credits", creditNote },
        { status: 402 },
      );
    }
  }
  if (!confirmed) {
    return NextResponse.json({
      ok: true,
      preview: true,
      cost,
      listedCost,
      included: gate.included,
      includedVia: gate.via,
      balance,
      creditNote,
      toIssue,
      alreadyIssued,
      company,
      record: recordSummary(record),
    });
  }

  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: scope.projectId, dividend_record_id: record.id });
    if (!spent.ok) {
      return NextResponse.json({ ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote }, { status: 402 });
    }
    creditsCharged = cost;
    balance = spent.balance;
  }

  const result = await issueStatementsForRecord({
    db: supabase,
    projectId: scope.projectId,
    userId: user.id,
    company,
    record,
    shareholders,
    creditsCharged,
  });
  if (result.issued.length === 0 && result.failed.length > 0) {
    if (creditsCharged > 0) {
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, project_id: scope.projectId, reason: "statement_insert_failed" });
      if (refund.ok) balance = refund.balance;
      else console.error("[dividends:statements] refund after insert failure did not land", { user: user.id, project: scope.projectId });
    }
    return NextResponse.json({ ok: false, error: "statement_insert_failed", failed: result.failed }, { status: 500 });
  }

  const all = await listStatementsForRecord(supabase, record.id, scope.projectId);
  return NextResponse.json({
    ok: true,
    issued: result.issued.map(statementSummary),
    existing: result.existing.map(statementSummary),
    failed: result.failed,
    cost,
    included: gate.included,
    creditsCharged,
    balance,
    creditNote,
    record: recordSummary(record),
    register: registerForRecord(company, record, all),
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(recordId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const record = await getDividendRecordForScope(supabase, recordId, recordScope);
  if (!record) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const [company, statements] = await Promise.all([loadCompanyForScope(supabase, recordScope), listStatementsForRecord(supabase, record.id, scope.projectId)]);
  return NextResponse.json({
    ok: true,
    role: scope.role,
    record: recordSummary(record),
    statements: statements.map(statementSummary),
    register: registerForRecord(company, record, statements),
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/dividends/[recordId]/statements/route.ts", method: "POST" }, POST_handler);
