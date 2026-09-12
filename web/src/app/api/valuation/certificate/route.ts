/**
 * /api/valuation/certificate — issue + list valuation certificates (S22-A).
 *
 * POST `{ confirm?: boolean }`
 *   Issues a hash-sealed valuation certificate for the caller's active
 *   project (cookie scope, member-aware). Same rails as the Money Finder
 *   drafts (`api/funding/draft`):
 *     auth → rate-limit → scope (editor+) → subject → (preview | issue) → spend.
 *   Gate / cost:
 *     • owner OR an accepted editor/admin member (`getProjectScope("editor")`)
 *       — a viewer / stranger gets 403 / 404 from the scope helper;
 *     • Growth extras (`hasGrowthExtras`: founder tier ≥ Growth via
 *       planIdToTier, or an active Startup Package) → included, cost 0;
 *     • otherwise `FEATURE_COSTS.valuation_certificate` (5 credits) charged to
 *       the CALLER (`creditChargeNote`). Transparent pricing: `confirm !== true`
 *       returns 200 `{ preview: true, cost, balance, included, subject }` and
 *       spends nothing; the panel shows that cost on the button first.
 *   Spend runs BEFORE the insert; an insert failure after a spend refunds.
 *   The certificate is frozen from the same numbers `/dashboard/valuation`
 *   shows (lib/valuation-certificate/server.ts).
 *
 *   200 { ok, preview: true, cost, balance, included, creditNote, subject }
 *   200 { ok, certificate, cost, creditsCharged, balance, creditNote }
 *   401 unauthorized  402 insufficient_credits | credit_spend_failed
 *   403/404 scope     409 no_svi_analysis   429 rate_limited   503 service_unavailable
 *
 * GET — list issued certificates for the active project (viewer+).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/security/request-guards";
import { canAfford, grantCredits, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote, findSVIAccountWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";
import {
  certificateSummary,
  issueCertificate,
  listCertificates,
  loadCertificateSubject,
} from "@/lib/valuation-certificate/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const FEATURE_KEY = "valuation_certificate";
const RATE_LIMIT_PER_HOUR = 20;
const BODY_MAX_BYTES = 4 * 1024;

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("valuation-certificate", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const confirmed = body.confirm === true;

  // Editor+ on the active project. A member's credits are their own.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const creditNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const account = await findSVIAccountWithFallback(scope.dataEmail, scope.projectId, "id", { callerEmail: user.email });
  const subjectRes = await loadCertificateSubject({
    db: supabase,
    projectId: scope.projectId,
    projectName: scope.project.name,
    dataEmail: scope.dataEmail,
    ownerUserId: scope.ownerUserId,
    accountId: (account?.id as string | undefined) ?? null,
  });
  if (!subjectRes.ok) {
    return NextResponse.json({ ok: false, error: "no_svi_analysis", message: "Complete an SVI analysis first." }, { status: 409 });
  }

  // Gate → cost.
  const included = await hasGrowthExtras({ id: user.id, plan: user.plan });
  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 5;
  let cost = 0;
  let balance: number | null = null;
  if (!included) {
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
    // Transparent pricing: show the price (or "included"), spend nothing.
    return NextResponse.json({
      ok: true,
      preview: true,
      cost,
      listedCost,
      included,
      balance,
      creditNote,
      subject: {
        startupName: subjectRes.subject.startupName,
        sviScore: subjectRes.subject.sviScore,
        valuation: subjectRes.subject.valuation,
        evidence: { total: subjectRes.subject.evidence.total, verified: subjectRes.subject.evidence.verified },
      },
    });
  }

  // Spend FIRST (atomic RPC) — the certificate only exists once paid for.
  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: scope.projectId });
    if (!spent.ok) {
      return NextResponse.json(
        { ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote },
        { status: 402 },
      );
    }
    creditsCharged = cost;
    balance = spent.balance;
  }

  const issued = await issueCertificate({
    db: supabase,
    projectId: scope.projectId,
    userId: user.id,
    subject: subjectRes.subject,
    creditsCharged,
  });
  if (!issued.ok) {
    if (creditsCharged > 0) {
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, project_id: scope.projectId, reason: "certificate_insert_failed" });
      if (refund.ok) balance = refund.balance;
      else console.error("[valuation:certificate] refund after insert failure did not land", { user: user.id, project: scope.projectId });
    }
    return NextResponse.json({ ok: false, error: "certificate_insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    certificate: certificateSummary(issued.row),
    cost,
    included,
    creditsCharged,
    balance,
    creditNote,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: true, certificates: [], role: null });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const rows = await listCertificates(supabase, scope.projectId);
  const included = await hasGrowthExtras({ id: user.id, plan: user.plan });
  return NextResponse.json({
    ok: true,
    certificates: rows.map((r) => certificateSummary(r)),
    role: scope.role,
    cost: FEATURE_COSTS[FEATURE_KEY] ?? 5,
    included,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/valuation/certificate/route.ts", method: "POST" }, POST_handler);
