// POST /api/admin/ai-health/routing-policy — G35 A2 (pricing v5 §7.4).
//
// Admin-only decisions on the PAID (DeepInfra) report ladder the model
// coordinator can only propose:
//   { action: "approve",  proposal_id }  proposal → paid.active (previous kept)
//   { action: "rollback" }               paid.active → previous (or defaults)
//   { action: "dismiss",  proposal_id }  drop the proposal, routing unchanged
//
// Audited twice: apiRoute() writes the hash-chained audit_events row
// (action `admin.ai-routing-policy.<verb>`, actor = the admin's user id) and
// the change is appended to content/reports/ai-routing-policy-history.jsonl
// with before / after ladders. The dispatcher re-reads the policy within 60 s
// (this process: immediately).

import { NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { apiRoute, auditAction, auditNote } from "@/lib/audit/api-route";
import { approveProposal, appendJsonl, dismissProposal, rollbackPaidPolicy, writeJsonAtomic } from "@/lib/ai/model-coordinator";
import { _resetRoutingPolicyCache, readRoutingPolicyFileState, routingPolicyFile, routingPolicyHistoryFile, routingPolicyWriteError } from "@/lib/ai/routing-policy";
import { DEEPINFRA_MODELS_BY_CLASS } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

async function POST_handler(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; proposal_id?: unknown };
  const action = body.action;
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.slice(0, 120) : "";
  if (action !== "approve" && action !== "rollback" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be approve, rollback or dismiss" }, { status: 400 });
  }
  if ((action === "approve" || action === "dismiss") && !proposalId) {
    return NextResponse.json({ error: "proposal_id required" }, { status: 400 });
  }
  auditAction(`admin.ai-routing-policy.${action}`);

  // P2-1: never overwrite a policy file that exists but cannot be validated —
  // it may hold the approved ladder, its rollback target and the proposal.
  const file = routingPolicyFile();
  const state = readRoutingPolicyFileState(file);
  if (state.state === "invalid") {
    return NextResponse.json({ error: `ai-routing-policy.json is invalid (${state.error}) — nothing changed; restore the file first` }, { status: 409 });
  }
  const current = state.state === "ok" ? state.policy : null;
  const actor = user.id;
  const dialable = { report: DEEPINFRA_MODELS_BY_CLASS.report, synthesis: DEEPINFRA_MODELS_BY_CLASS.synthesis, classify: DEEPINFRA_MODELS_BY_CLASS.classify };
  const result =
    action === "approve" ? approveProposal(current, proposalId, actor, new Date(), dialable) : action === "dismiss" ? dismissProposal(current, proposalId, actor) : rollbackPaidPolicy(current, actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const invalid = routingPolicyWriteError(result.policy);
  if (invalid) return NextResponse.json({ error: `refusing to write an invalid policy (${invalid})` }, { status: 500 });

  writeJsonAtomic(routingPolicyFile(), result.policy);
  appendJsonl(routingPolicyHistoryFile(), [result.history]);
  _resetRoutingPolicyCache();
  auditNote(null, { proposal_id: proposalId || null, active_classes: Object.keys(result.policy.paid.active ?? {}) });
  return NextResponse.json({ ok: true, action, paid: result.policy.paid });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/ai-health/routing-policy/route.ts", method: "POST" }, POST_handler);
