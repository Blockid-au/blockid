// /api/cron/server-cleanup — G-05: proxy for scripts/server-cleanup.sh.
//
// W7b: executes the existing cleanup script (which prunes Docker cache,
// stale next builds, tmp dirs) and reports how much disk was freed.
//
// Auth: x-cron-secret or Authorization Bearer. Schedule: nightly 03:00 UTC.

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const SCRIPT_PATH = "/home/dovanlong/blockid.au/web/scripts/server-cleanup.sh";
const LOG_PATH = "/tmp/blockid-cleanup.log";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface RunResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

function runScript(): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("bash", [SCRIPT_PATH], {
      cwd: path.dirname(SCRIPT_PATH),
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        exit_code: code ?? -1,
        stdout,
        stderr,
        duration_ms: Date.now() - started,
      });
    });
    child.on("error", (err) => {
      resolve({
        exit_code: -1,
        stdout,
        stderr: (stderr + "\n" + String(err)).trim(),
        duration_ms: Date.now() - started,
      });
    });
  });
}

// Best-effort: parse "freed" MB from the script's stdout. Recognised
// patterns:
//   "Freed 1234 MB"      · "1234 MB freed"
//   "Reclaimed 2.1 GB"   · "1.2G reclaimed"
function parseFreedMb(output: string): number | null {
  const patterns: RegExp[] = [
    /freed\s+([\d.]+)\s*(mb|gb|g|m)/i,
    /reclaimed\s+([\d.]+)\s*(mb|gb|g|m)/i,
    /([\d.]+)\s*(mb|gb|g|m)\s+(?:freed|reclaimed)/i,
  ];
  for (const rx of patterns) {
    const m = output.match(rx);
    if (m) {
      const n = parseFloat(m[1]);
      const unit = m[2].toLowerCase();
      if (Number.isFinite(n)) {
        return unit === "gb" || unit === "g" ? n * 1024 : n;
      }
    }
  }
  return null;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verify script exists — fail early with a clear message instead of a
  // spawn error the caller has to guess at.
  try {
    await fs.access(SCRIPT_PATH);
  } catch {
    return NextResponse.json(
      { ok: false, error: "cleanup_script_missing", path: SCRIPT_PATH },
      { status: 500 },
    );
  }

  const result = await runScript();
  const combined = `[stdout]\n${result.stdout}\n[stderr]\n${result.stderr}\n[exit] ${result.exit_code} in ${result.duration_ms}ms\n`;
  try {
    await fs.writeFile(LOG_PATH, combined, "utf8");
  } catch (err) {
    console.error("[cron:server-cleanup] log write failed", err);
  }

  const freedMb = parseFreedMb(result.stdout);
  const summary =
    result.exit_code === 0
      ? `🧹 Server cleanup ok — ${freedMb != null ? `${freedMb.toFixed(0)} MB freed` : "no free size parsed"} in ${result.duration_ms}ms`
      : `⚠️ Server cleanup exit ${result.exit_code} — ${result.stderr.split("\n")[0]}`;

  sendTelegram(summary).catch(() => {});

  return NextResponse.json({
    ok: result.exit_code === 0,
    exit_code: result.exit_code,
    duration_ms: result.duration_ms,
    freed_mb: freedMb,
    log_path: LOG_PATH,
    stdout_tail: result.stdout.slice(-2000),
    stderr_tail: result.stderr.slice(-1000),
  });
}
