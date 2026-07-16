// /api/admin/rollback — G-10: one-click deploy rollback.
//
// W7b: admin-gated POST. Invokes `bash scripts/deploy-live.sh --rollback`
// which restores the previous .next build (see the header of that script
// for how the symlink flip works). Result is captured, a deploy_incidents
// row is written, and a summary + log tail returned to the caller.

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const DEPLOY_SCRIPT = "/home/dovanlong/blockid.au/web/scripts/deploy-live.sh";
const MANIFEST_PATH = "/home/dovanlong/blockid.au/web/.deploy-manifest.json";

interface RollbackBody {
  target_sha?: string;
  reason?: string;
}

interface RunResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

function runRollback(extraArgs: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("bash", [DEPLOY_SCRIPT, "--rollback", ...extraArgs], {
      cwd: path.dirname(DEPLOY_SCRIPT),
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

async function readManifestSha(): Promise<string | null> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as { git_sha?: string; sha?: string };
    return parsed.git_sha ?? parsed.sha ?? null;
  } catch {
    return null;
  }
}

// Very loose smoke-check parser — the deploy script prints lines like
// "✓ smoke: /  200" and "✗ smoke: /pricing timeout". Any "✗" or the word
// "FAIL" flips smoke_passed to false.
function inferSmokePassed(stdout: string): boolean {
  if (/(?:^|\n)\s*[✗x]\s*smoke/i.test(stdout)) return false;
  if (/smoke.*fail/i.test(stdout)) return false;
  return /smoke.*(?:ok|pass|✓)/i.test(stdout);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: RollbackBody = {};
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      body = (await request.json()) as RollbackBody;
    } else if (contentType.includes("form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const targetSha = form.get("target_sha");
      const reason = form.get("reason");
      body = {
        target_sha: typeof targetSha === "string" ? targetSha : undefined,
        reason: typeof reason === "string" ? reason : undefined,
      };
    }
  } catch {
    // empty body is fine
  }

  const preSha = await readManifestSha();
  const extraArgs = body.target_sha ? ["--target", body.target_sha] : [];

  const result = await runRollback(extraArgs);
  const postSha = await readManifestSha();
  const smokePassed = inferSmokePassed(result.stdout);
  const rolledBackTo = postSha ?? body.target_sha ?? null;

  const detail = {
    reason: body.reason ?? "manual",
    initiated_by: user.email,
    pre_sha: preSha,
    post_sha: postSha,
    target_sha: body.target_sha ?? null,
    smoke_passed: smokePassed,
    stdout_tail: result.stdout.slice(-4000),
    stderr_tail: result.stderr.slice(-2000),
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase
        .from("deploy_incidents")
        .insert({
          kind: "rollback",
          severity: "critical",
          task_id: "manual",
          git_sha: rolledBackTo,
          duration_ms: result.duration_ms,
          detail,
          resolved_at:
            result.exit_code === 0 && smokePassed ? new Date().toISOString() : null,
          resolved_by: result.exit_code === 0 && smokePassed ? user.email : null,
        })
        .then(({ error }) => {
          if (error) console.error("[api:admin/rollback] insert failed", error);
        });
    }
  }

  sendTelegram(
    `🔁 Manual rollback by ${user.email} → ${rolledBackTo ?? "unknown"} · exit ${result.exit_code} · smoke ${smokePassed ? "ok" : "FAIL"}`,
  ).catch(() => {});

  return NextResponse.json(
    {
      ok: result.exit_code === 0,
      rolled_back_to: rolledBackTo,
      smoke_passed: smokePassed,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
      log_tail: result.stdout.slice(-4000),
      stderr_tail: result.stderr.slice(-2000),
    },
    { status: result.exit_code === 0 ? 200 : 500 },
  );
}
