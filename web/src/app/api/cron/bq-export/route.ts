// /api/cron/bq-export — nightly analytics_events → BigQuery sweep (T-1010).
//
// Fires the tsx script at web/scripts/bq-export-events.ts and returns the
// captured stdout + exit code. The script is idempotent (MERGE-on-event_id)
// so a duplicate trigger never double-counts. See
// web/content/reports/cdo-review-v2.0.0-beta.6.md section 5 for the contract.
//
// Auth: x-cron-secret or Authorization: Bearer <CRON_SECRET>. Fail-closed
// when the secret is unset — same pattern as lifecycle-mailer and
// weekly-retention. Schedule: 02:15 UTC nightly (12:15 AEST off-peak).
//
// The script bails cleanly (exit 0) when @google-cloud/bigquery is not
// installed, so the cron doesn't red-flag until T-1010 lands the dep.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: refuse when the secret env var is missing so a
  // misconfigured / staging deploy can't be triggered externally.
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface RunResult {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

function runScript(extraArgs: string[]): RunResult {
  const started = Date.now();
  // Resolve the script relative to the repo root so this works whether the
  // process was started from /web or the repo root.
  const scriptPath = path.resolve(
    process.cwd(),
    process.cwd().endsWith(`${path.sep}web`) ? "scripts/bq-export-events.ts" : "web/scripts/bq-export-events.ts",
  );

  try {
    const stdout = execFileSync(
      "npx",
      ["tsx", scriptPath, ...extraArgs],
      {
        encoding: "utf8",
        // Cron secret + BQ / Supabase env are inherited from the parent
        // process automatically. maxBuffer bumped so a large row dump does
        // not truncate the log.
        maxBuffer: 8 * 1024 * 1024,
        timeout: 4 * 60 * 1000, // 4min — under Next 16 maxDuration=300.
      },
    );
    return {
      ok: true,
      exit_code: 0,
      stdout,
      stderr: "",
      duration_ms: Date.now() - started,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      ok: false,
      exit_code: typeof e.status === "number" ? e.status : 1,
      stdout: typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "",
      stderr:
        (typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "") ||
        e.message ||
        "unknown script failure",
      duration_ms: Date.now() - started,
    };
  }
}

function parseFlags(url: URL): string[] {
  const args: string[] = [];
  if (url.searchParams.get("dry_run") === "1") args.push("--dry-run");
  if (url.searchParams.get("full_refresh") === "1") args.push("--full-refresh");
  return args;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const result = runScript(parseFlags(url));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
