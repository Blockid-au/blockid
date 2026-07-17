import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nightly C-Level review orchestrator (Goal 5A — T-1100).
 *
 * Spawns web/scripts/nightly-clevel-review.mjs. Fail-closed on CRON_SECRET —
 * we mirror the bq-export / audit-verify routes deliberately (NOT the
 * lifecycle-mailer fail-open regression flagged in today's audit).
 *
 * The script is a stub until T-1102 wires the real Anthropic Messages call;
 * this route intentionally does no LLM work itself.
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
  const scriptPath = join(cwd, "web", "scripts", "nightly-clevel-review.mjs");
  const scriptExists = existsSync(scriptPath);
  const command = scriptExists
    ? `node web/scripts/nightly-clevel-review.mjs`
    : `node scripts/nightly-clevel-review.mjs`;

  const startedAt = Date.now();
  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 290_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    exitCode = typeof e.status === "number" ? e.status : 1;
    const so = typeof e.stdout === "string" ? e.stdout : e.stdout?.toString("utf8") ?? "";
    const se = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString("utf8") ?? "";
    stdout = [so, se, e.message ?? ""].filter(Boolean).join("\n");
  }

  return NextResponse.json({
    ok: exitCode === 0,
    exit_code: exitCode,
    duration_ms: Date.now() - startedAt,
    script: command,
    stdout: stdout.slice(-16_000),
  });
}
