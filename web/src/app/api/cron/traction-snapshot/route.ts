// GET|POST /api/cron/traction-snapshot
//
// G14-S33 — daily (03:20 UTC) traction snapshot. Counts users (QA / seeded /
// erased accounts excluded), analyses, Trust Business Reports, evaluators by
// plan, assessments, share links, API keys, webhooks, MRR two ways (+ Stripe
// head-count reconcile) and the 7-day server-event funnel via
// buildTractionSnapshot(), then writes
//   content/reports/traction-snapshot.json   (latest — what /api/status,
//                                             /api/platform-stats, the admin
//                                             tile and investor-update.mjs read)
//   content/reports/traction-history.jsonl   (one line per run, appended)
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` via isCronAuthorised.
// `?dry=1` builds the snapshot but persists nothing.
//
// A missing table / failed query is a `warnings[]` entry on the snapshot,
// never a route failure: the file is the evidence and cron-runner logs a
// clean run. Only a transport-level throw is a 500.
//
// audit-exempt: system actor; the report file is the evidence.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { asTractionClient, buildTractionSnapshot, type TractionStripe } from "@/lib/traction/snapshot";
import { persistTractionSnapshot } from "@/lib/traction/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isDry(request: Request): boolean {
  try {
    const dry = new URL(request.url).searchParams.get("dry");
    return dry === "1" || dry === "true";
  } catch {
    return false;
  }
}

async function readGitSha(root: string): Promise<string | null> {
  for (const rel of [".deploy-manifest.json", path.join("..", ".deploy-manifest.json")]) {
    try {
      const raw = await fs.readFile(path.join(root, rel), "utf8");
      const j = JSON.parse(raw) as { git_sha?: string };
      if (j?.git_sha) return String(j.git_sha);
    } catch {
      // next candidate
    }
  }
  return process.env.GIT_SHA ?? null;
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const dry = isDry(request);
  const root = process.cwd();
  try {
    const stripe = getStripe();
    const snapshot = await buildTractionSnapshot({
      supabase: asTractionClient(getSupabaseAdmin()),
      stripe: stripe ? (stripe as unknown as TractionStripe) : null,
      gitSha: await readGitSha(root),
    });
    const persisted = dry ? false : await persistTractionSnapshot(snapshot, root);
    return NextResponse.json({ ok: true, dry, persisted, duration_ms: Date.now() - started, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blockid:traction] snapshot run failed", message);
    return NextResponse.json({ ok: false, dry, error: message, duration_ms: Date.now() - started }, { status: 500 });
  }
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
