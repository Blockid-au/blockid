// GET|POST /api/cap-table/chain-reconcile (S27-B)
//
// GET  (viewer+)  the last reconciliation row for the project + the token
//                 the project has on chain (null when not tokenised).
// POST (editor+)  { action?: "run" | "push" }
//                 run  — read the share-token contract back now, reconcile
//                        against the register, persist a row, return it.
//                 push — queue the register → chain corrections the LAST
//                        (or a fresh) reconciliation calls for on the
//                        existing blockchain_sync_queue (mint / burn), so
//                        the 15-minute blockchain-sync cron executes them.
//
// The register belongs to the project OWNER (`shareholders.account_id` =
// owner user id), so both handlers key on `scope.ownerUserId` — a
// co-founder sees / runs the same rows. Chain unreachable → 200 with
// status "unreachable" (the run is recorded), never a 5xx: the page shows
// the state instead of an error toast.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findSVIAccountWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import {
  latestReconciliation,
  pushRegisterToChain,
  resolveTokenConfig,
  runProjectReconciliation,
} from "@/lib/onchain/reconcile-project";
import type { ReconcileResult } from "@/lib/onchain/read-back";

export const dynamic = "force-dynamic";

async function sviAccountIdFor(dataEmail: string, projectId: string, callerEmail: string): Promise<string | null> {
  const account = await findSVIAccountWithFallback(dataEmail, projectId, undefined, { callerEmail });
  return account && typeof account.id === "string" ? account.id : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const sviAccountId = await sviAccountIdFor(scope.dataEmail, scope.projectId, user.email);
  const [token, last] = await Promise.all([
    resolveTokenConfig(supabase, scope.projectId, sviAccountId),
    latestReconciliation(supabase, scope.projectId),
  ]);
  return NextResponse.json({
    ok: true,
    role: scope.role,
    token: token ? { address: token.tokenAddress, symbol: token.tokenSymbol, syncEnabled: token.syncEnabled } : null,
    last,
  });
}

async function POST_handler(request: Request) {
  const gate = await gateRequireFeature("share_management");
  if (!gate.ok) return gate.response;
  const user = gate.user;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action === "push" ? "push" : "run";

  const sviAccountId = await sviAccountIdFor(scope.dataEmail, scope.projectId, user.email);
  const config = await resolveTokenConfig(supabase, scope.projectId, sviAccountId);
  if (!config) {
    return NextResponse.json({ ok: false, error: "no_token", message: "This project has no share token on chain yet." }, { status: 409 });
  }

  const outcome = await runProjectReconciliation(supabase, {
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    sviAccountId,
    source: "route",
  });

  if (action === "push") {
    // The 5-minute blockchain-sync cron only drains accounts with sync_enabled —
    // queueing while it is off would leave the corrections pending forever while
    // the panel says "applied within 15 minutes" (S27 post-ship review).
    if (!config.syncEnabled) {
      return NextResponse.json(
        { ok: false, error: "sync_disabled", message: "Blockchain sync is paused for this project — resume it before pushing corrections.", last: outcome.row },
        { status: 409 },
      );
    }
    if (outcome.status === "unreachable" || !outcome.result) {
      return NextResponse.json(
        { ok: false, error: "chain_unreachable", message: "The chain could not be read — nothing was queued.", last: outcome.row },
        { status: 502 },
      );
    }
    const push = await pushRegisterToChain(config, outcome.result as ReconcileResult);
    // Honest status (S27 review, open item 1): the sync runner records the
    // queued mint/burn events but `blockchain-sync.ts#executeOnChainTx` has no
    // server-side signer — there is no admin key on the box (wallet.ts is the
    // founder's MetaMask path). Until a signer is configured the corrections
    // sit on the queue and on-chain balances do not change.
    return NextResponse.json({
      ok: true,
      action,
      status: outcome.status,
      driftCount: outcome.driftCount,
      push: { ...push, executes: false, executeReason: "admin_signer_not_configured" as const },
      last: outcome.row,
    });
  }

  return NextResponse.json({
    ok: true,
    action,
    status: outcome.status,
    driftCount: outcome.driftCount,
    error: outcome.error,
    last: outcome.row,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/cap-table/chain-reconcile/route.ts", method: "POST" }, POST_handler);
