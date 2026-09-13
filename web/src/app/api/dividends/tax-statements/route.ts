/**
 * /api/dividends/tax-statements — shareholder annual (FY) tax statements (S28-A).
 *
 * GET ?fy=2025-26 (viewer+)
 *   The FY picker options, the FY's summary (per-shareholder totals from the
 *   live distribution statements paid inside 1 Jul – 30 Jun), the statements
 *   already generated for the FY (current + superseded versions), the listed
 *   cost and whether the run is included for the caller. `fy` absent →
 *   the last completed FY; malformed → 400.
 *
 * POST `{ fy, confirm?: boolean, regenerate?: boolean }` (editor+)
 *   Generates one statement per shareholder of the FY. Same rails as the
 *   distribution statements (S25-B): auth → rate-limit → scope → summary →
 *   (preview | generate) → spend.
 *   Gate / cost:
 *     • equity add-on (`esop.manage`) or Growth+ / Startup Package →
 *       included, cost 0 (`statementsIncluded`);
 *     • otherwise `FEATURE_COSTS.shareholder_tax_statements` (2 credits) per
 *       FY RUN, charged to the CALLER. `confirm !== true` returns 200
 *       `{ preview: true, cost, balance, included, toGenerate, alreadyGenerated }`
 *       and spends nothing — the panel shows that first.
 *   Idempotent per (project, FY, shareholder): a shareholder with a CURRENT
 *   row is returned as `existing`, never re-inserted, and nothing is charged
 *   when nothing is left to generate. `regenerate: true` is a NEW run:
 *   every shareholder gets version n+1, the previous current row is
 *   superseded (never deleted), and the run is charged again unless
 *   included. Charged ONCE per run: the charge is stamped as
 *   `credits_charged` on every row the charged call inserts, so a retry
 *   after a partial insert failure is free (`retryCost: 0`); only a TOTAL
 *   failure refunds. S29-hardening: `regenerate: true` after a PARTIAL
 *   regenerate failure is the retry of that run (`pendingRegenerateRetry`,
 *   `retryOfRun` = the run's `issued_at` stamp) — only the shareholders the
 *   run did not reach are regenerated, stamped with the same `issued_at`,
 *   and nothing is charged again.
 *
 *   200 { ok, preview: true, fy, cost, listedCost, included, alreadyCharged, balance, creditNote, toGenerate, alreadyGenerated, regenerate, company }
 *   200 { ok, partial, fy, generated[], existing[], superseded[], failed[], cost, creditsCharged, retryCost, balance, creditNote }
 *   400 bad_fy  401  402 insufficient_credits | credit_spend_failed  403/404 scope
 *   409 no_statements (nothing paid in the FY)  429  503
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/security/request-guards";
import { canAfford, getBalance, grantCredits, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { creditNoteFor } from "@/lib/credits-preview";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { statementsIncluded } from "@/lib/dividends/gate";
import { listStatementsForProject, loadCompanyForScope } from "@/lib/dividends/server";
import { fyOptions, lastCompletedFy, parseFy } from "@/lib/dividends/fy-summary";
import { currentOnly, fyAlreadyCharged, generateTaxStatementsForFy, listTaxStatementsForFy, pendingRegenerateRetry, summariseFyFromStatements, taxStatementSummary } from "@/lib/dividends/tax-statements";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const FEATURE_KEY = "shareholder_tax_statements";
const RATE_LIMIT_PER_HOUR = 30;
const BODY_MAX_BYTES = 4 * 1024;

function fyFromQuery(request: Request): { fy: string; ok: boolean } {
  const raw = new URL(request.url).searchParams.get("fy");
  if (!raw) return { fy: lastCompletedFy(), ok: true };
  const parsed = parseFy(raw);
  return parsed ? { fy: parsed.label, ok: true } : { fy: raw, ok: false };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  const cost = FEATURE_COSTS[FEATURE_KEY] ?? 2;
  const { fy, ok } = fyFromQuery(request);
  if (!ok) return NextResponse.json({ ok: false, error: "bad_fy" }, { status: 400 });
  if (!scope) return NextResponse.json({ ok: true, fy, options: fyOptions([]), shareholders: [], statements: [], role: null, cost, included: false });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const [statements, rows, gate] = await Promise.all([listStatementsForProject(supabase, scope.projectId), listTaxStatementsForFy(supabase, scope.projectId, fy), statementsIncluded({ id: user.id, plan: user.plan })]);
  const summary = summariseFyFromStatements(fy, statements);
  return NextResponse.json({
    ok: true,
    role: scope.role,
    fy,
    options: fyOptions(statements),
    cost,
    included: gate.included,
    includedVia: gate.via,
    excluded: summary?.excluded ?? { voided: 0, outsideFy: 0, undated: 0 },
    shareholders: (summary?.shareholders ?? []).map((s) => ({ key: s.shareholderKey, name: s.name, role: s.role, totals: s.totals })),
    statements: rows.map(taxStatementSummary).sort((a, b) => Number(b.current) - Number(a.current) || a.statementNo.localeCompare(b.statementNo, "en", { numeric: true })),
  });
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("dividend-tax-statements", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const confirmed = body.confirm === true;
  const regenerate = body.regenerate === true;
  const parsed = parseFy(typeof body.fy === "string" ? body.fy : lastCompletedFy());
  if (!parsed) return NextResponse.json({ ok: false, error: "bad_fy" }, { status: 400 });
  const fy = parsed.label;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const chargeNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const [company, statements, rows] = await Promise.all([loadCompanyForScope(supabase, recordScope), listStatementsForProject(supabase, scope.projectId), listTaxStatementsForFy(supabase, scope.projectId, fy)]);
  const summary = summariseFyFromStatements(fy, statements);
  const shareholders = summary?.shareholders ?? [];
  if (shareholders.length === 0) {
    return NextResponse.json({ ok: false, error: "no_statements", fy, message: `No distribution statement was paid in FY ${fy} — issue the dividend statements first.` }, { status: 409 });
  }
  const current = currentOnly(rows);
  const currentKeys = new Set(current.map((r) => r.shareholder_key));
  // S29-hardening (S28 review #5): a `regenerate` after a PARTIAL regenerate
  // failure is a retry of that run — only the shareholders it did not reach,
  // stamped with the same run `issued_at`, no second charge.
  const retry = regenerate ? pendingRegenerateRetry(current, shareholders.map((s) => s.shareholderKey)) : null;
  const retryKeys = retry ? new Set(retry.pendingKeys) : null;
  const toGenerate = retryKeys
    ? shareholders.filter((s) => retryKeys.has(s.shareholderKey)).map((s) => s.name)
    : regenerate
      ? shareholders.map((s) => s.name)
      : shareholders.filter((s) => !currentKeys.has(s.shareholderKey)).map((s) => s.name);
  /** Shareholders who already hold a current statement (skipped without `regenerate`; superseded with it). */
  const alreadyGenerated = shareholders.filter((s) => currentKeys.has(s.shareholderKey)).length;

  // Gate → cost. Nothing to generate → nothing to charge. A run that already
  // stamped a charge on a CURRENT row is paid (a retry after a partial
  // failure is free); a regenerate is a new run and looks at no marker —
  // unless it is the retry of a partial regenerate (`retry`), which is free.
  const gate = await statementsIncluded({ id: user.id, plan: user.plan });
  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 2;
  const alreadyCharged = regenerate ? retry !== null : fyAlreadyCharged(current);
  let cost = 0;
  let balance: number | null = null;
  if (!gate.included && !alreadyCharged && toGenerate.length > 0) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    cost = listedCost;
    balance = afford.balance;
    if (!afford.allowed) {
      return NextResponse.json({ ok: false, error: "insufficient_credits", creditsRequired: cost, balance: afford.balance, reason: afford.reason ?? "insufficient_credits", creditNote: chargeNote }, { status: 402 });
    }
  } else {
    // Lane-2 P3-d: included / already paid / nothing to generate → nothing to
    // afford, but the balance is still one read and the panel shows it.
    balance = await getBalance(user.id).catch(() => null);
  }
  // "Charged to your credits." only when something IS charged (lane-2 P3-d).
  const creditNote = creditNoteFor({ cost, included: gate.included, chargeNote });
  if (!confirmed) {
    return NextResponse.json({
      ok: true,
      preview: true,
      fy,
      cost,
      listedCost,
      included: gate.included,
      includedVia: gate.via,
      alreadyCharged,
      balance,
      creditNote,
      toGenerate,
      alreadyGenerated,
      regenerate,
      retryOfRun: retry?.runStamp ?? null,
      company,
    });
  }

  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: scope.projectId, fy, regenerate });
    if (!spent.ok) return NextResponse.json({ ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote: chargeNote }, { status: 402 });
    creditsCharged = cost;
    balance = spent.balance;
  }

  const result = await generateTaxStatementsForFy({
    db: supabase, projectId: scope.projectId, userId: user.id, company, fy, statements, existingRows: rows, regenerate, creditsCharged,
    // A retry completes the partial run: same stamp, only the missing shareholders.
    onlyKeys: retryKeys,
    now: retry ? new Date(retry.runStamp) : undefined,
  });
  if (result.generated.length === 0 && result.failed.length > 0) {
    if (creditsCharged > 0) {
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, project_id: scope.projectId, fy, reason: "tax_statement_insert_failed" });
      if (refund.ok) balance = refund.balance;
      else console.error("[dividends:tax-statements] refund after insert failure did not land", { user: user.id, project: scope.projectId });
    }
    return NextResponse.json({ ok: false, error: "tax_statement_insert_failed", fy, failed: result.failed, generatedCount: 0, failedCount: result.failed.length, retryCost: cost }, { status: 500 });
  }
  const partial = result.failed.length > 0;
  if (partial) console.warn("[dividends:tax-statements] partial generate", { project: scope.projectId, fy, generated: result.generated.length, failed: result.failed.length });

  return NextResponse.json({
    ok: true,
    partial,
    fy,
    generated: result.generated.map(taxStatementSummary),
    existing: result.existing.map(taxStatementSummary),
    superseded: result.superseded.map(taxStatementSummary),
    failed: result.failed,
    generatedCount: result.generated.length,
    failedCount: result.failed.length,
    cost,
    included: gate.included,
    creditsCharged,
    alreadyCharged,
    retryOfRun: retry?.runStamp ?? null,
    retryCost: 0,
    balance,
    creditNote: creditNoteFor({ cost: creditsCharged, included: gate.included, chargeNote }),
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/dividends/tax-statements/route.ts", method: "POST" }, POST_handler);
