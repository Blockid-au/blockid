// GET|POST /api/cron/audit-chain-verify
//
// S20-A (2026-09-12) — nightly (03:40 UTC) integrity check of the
// hash-chained `audit_events` log. Pages through the
// `audit_events_verify_chain` RPC (migration 0335), which recomputes every
// row's curr_hash and checks prev_hash linkage inside Postgres, then writes
// content/reports/audit-chain-verify.json — the file /api/status reads to
// surface `audit_chain: ok | broken | unknown`.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: privacy-retention).
// `?dry=1` runs the verification but does not persist the state file.
// `?from=<id>` starts from that row id (default AUDIT_CHAIN_VERIFY_FROM or
// 0 = full scan); `?max=<rows>` caps rows checked (default 2,000,000).
//
// Windowed runs (from > 0) trust the rows before `from` as stored, so the
// route first cross-checks the previous run's persisted checkpoint
// (last_id / last_hash in audit-chain-verify.json) against the live row
// and reports `broken` (reason checkpoint_mismatch / checkpoint_missing /
// checkpoint_rpc_error) when it no longer matches — see the header of
// lib/audit/chain-verify.ts. Full scans skip the cross-check.
//
// audit-exempt: system actor; result is the audit evidence itself.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  applyCheckpoint,
  crossCheckCheckpoint,
  persistChainState,
  readChainState,
  verifyAuditChain,
} from "@/lib/audit/chain-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function params(request: Request): { dry: boolean; from: number; max: number | undefined } {
  const envFrom = Number.parseInt(process.env.AUDIT_CHAIN_VERIFY_FROM ?? "", 10);
  const defaults = { dry: false, from: Number.isFinite(envFrom) ? envFrom : 0, max: undefined };
  try {
    const sp = new URL(request.url).searchParams;
    const dry = sp.get("dry");
    const from = Number.parseInt(sp.get("from") ?? "", 10);
    const max = Number.parseInt(sp.get("max") ?? "", 10);
    return {
      dry: dry === "1" || dry === "true",
      from: Number.isFinite(from) && from >= 0 ? from : defaults.from,
      max: Number.isFinite(max) && max > 0 ? max : undefined,
    };
  } catch {
    return defaults;
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { dry, from, max } = params(request);
  const startedAt = Date.now();
  const db = getSupabaseAdmin();
  // Read the previous checkpoint BEFORE this run overwrites the state file.
  const previous = from > 0 ? await readChainState() : null;
  const checkpoint = await crossCheckCheckpoint({ db, fromId: from, previous });
  const result = applyCheckpoint(await verifyAuditChain({ db, fromId: from, maxRows: max }), checkpoint);
  const state = {
    ...result,
    ts: new Date().toISOString(),
    dry,
    duration_ms: Date.now() - startedAt,
    ...(from > 0 ? { checkpoint } : {}),
  };

  if (result.error === "supabase_unavailable") {
    return NextResponse.json({ ...state, ok: false }, { status: 503 });
  }

  const persisted = dry ? false : await persistChainState(state);

  // A broken chain is a real finding, not a route failure: 200 so
  // cron-runner records the body; `status: "broken"` is the alarm signal.
  return NextResponse.json({ ...state, persisted }, { status: result.error ? 500 : 200 });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
