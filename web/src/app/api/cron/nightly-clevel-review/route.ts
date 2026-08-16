import { NextResponse } from "next/server";
import { appendFileSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Route returns immediately; script runs in background.

const HEALTH_LOG = "/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl";

/**
 * Nightly C-Level review orchestrator — T-1101 production gate.
 *
 * Spawns web/scripts/nightly-clevel-review.mjs in a detached background
 * process (non-blocking). The script takes 2-5 min to complete (6 × LLM
 * calls + digest) so we cannot block the HTTP connection.
 *
 * Auth: Bearer $CRON_SECRET (same pattern as bq-export, svi-index-populate).
 *
 * Returns immediately with { ok: true, triggered: true }. The script writes
 * its own history to web/content/reports/clevel-review-history.jsonl. Cron
 * health is logged here on trigger; the script itself does not call this route.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured on server" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") ?? "";
  const provided = bearer || querySecret;
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cwd = process.cwd();
  // Resolve script path — handle both standalone (cwd = web/) and repo-root layouts.
  let scriptPath = join(cwd, "web", "scripts", "nightly-clevel-review.mjs");
  if (!existsSync(scriptPath)) {
    scriptPath = join(cwd, "scripts", "nightly-clevel-review.mjs");
  }

  const ts = new Date().toISOString();

  if (!existsSync(scriptPath)) {
    const detail = `script not found at ${scriptPath}`;
    logHealth({ ts, status: "fail", detail, duration_ms: 0 });
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }

  // Spawn in background — detached so it outlives the HTTP request.
  try {
    const child = spawn("node", [scriptPath], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        // Ensure the script can find the API key even when Next.js masks it.
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? "",
      },
    });
    child.unref();
  } catch (err) {
    const e = err as Error;
    const detail = `spawn failed: ${e.message}`;
    logHealth({ ts, status: "fail", detail, duration_ms: 0 });
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }

  logHealth({ ts, status: "ok", detail: `triggered background nightly review (script=${scriptPath})`, duration_ms: 0 });

  return NextResponse.json({
    ok: true,
    triggered: true,
    script: scriptPath,
    ts,
  });
}

function logHealth({
  ts,
  status,
  detail,
  duration_ms,
}: {
  ts: string;
  status: string;
  detail: string;
  duration_ms: number;
}) {
  try {
    const line = JSON.stringify({
      ts,
      endpoint: "nightly-clevel-review",
      status,
      duration_ms,
      detail,
    });
    appendFileSync(HEALTH_LOG, line + "\n", "utf8");
  } catch {
    // Non-fatal — if the health log is unavailable the review still runs.
  }
}
