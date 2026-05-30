// POST /api/cron/agent-deploy — Receive code patches from Claude Cloud agents
//
// Flow:
//   1. Agent runs on Anthropic Cloud, generates improvements
//   2. Agent POSTs patch (file changes) to this endpoint
//   3. Server applies patch to working tree
//   4. Runs CI gates (tsc, lint, build)
//   5. If all pass → deploys via deploy-live.sh
//   6. If any fail → reverts, reports error
//
// Auth: Bearer {CRON_SECRET} (same as other cron endpoints)
// Body: { agent: string, description: string, files: { path: string, content: string, action: "write" | "delete" }[] }

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for build

// process.cwd() in standalone = .next/standalone/, not the web/ source dir
const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  // Auth check
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    agent: string;
    description: string;
    files: { path: string; content: string; action: "write" | "delete" }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { agent, description, files } = body;
  if (!agent || !description || !files?.length) {
    return NextResponse.json({ ok: false, error: "Missing agent, description, or files" }, { status: 400 });
  }

  // Safety: max 5 files, max 50KB each, only allow src/ content/ .claude/ paths
  if (files.length > 5) {
    return NextResponse.json({ ok: false, error: "Max 5 files per patch" }, { status: 400 });
  }

  const ALLOWED_PREFIXES = ["src/", "content/", ".claude/goals/", "public/"];
  const BLOCKED_PATTERNS = [".env", "node_modules", ".next", "scripts/", "package.json", "next.config"];

  for (const f of files) {
    if (!ALLOWED_PREFIXES.some(p => f.path.startsWith(p))) {
      return NextResponse.json({ ok: false, error: `Path not allowed: ${f.path}` }, { status: 400 });
    }
    if (BLOCKED_PATTERNS.some(p => f.path.includes(p))) {
      return NextResponse.json({ ok: false, error: `Blocked pattern in path: ${f.path}` }, { status: 400 });
    }
    if (f.content && f.content.length > 51200) {
      return NextResponse.json({ ok: false, error: `File too large: ${f.path} (max 50KB)` }, { status: 400 });
    }
  }

  const results: string[] = [];
  const backups: { path: string; content: string | null }[] = [];

  try {
    // Step 1: Backup existing files
    for (const f of files) {
      const fullPath = path.join(WEB_DIR, f.path);
      try {
        const existing = fs.readFileSync(fullPath, "utf8");
        backups.push({ path: f.path, content: existing });
      } catch {
        backups.push({ path: f.path, content: null });
      }
    }

    // Step 2: Apply changes
    for (const f of files) {
      const fullPath = path.join(WEB_DIR, f.path);
      if (f.action === "delete") {
        fs.unlinkSync(fullPath);
        results.push(`Deleted: ${f.path}`);
      } else {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, f.content, "utf8");
        results.push(`Written: ${f.path}`);
      }
    }

    // Determine if this patch touches source code (needs CI gates) or just content/reports
    const hasSourceChanges = files.some(f => f.path.startsWith("src/"));

    if (hasSourceChanges) {
      // Step 3: TypeScript check (only for source changes)
      try {
        const tsOutput = execSync("npx tsc --noEmit 2>&1 | grep -c 'error TS' || echo 0", {
          cwd: WEB_DIR, timeout: 60_000, encoding: "utf8",
        }).trim();
        const tsErrors = parseInt(tsOutput, 10);
        if (tsErrors > 0) {
          throw new Error(`TypeScript: ${tsErrors} errors`);
        }
        results.push("Gate: TypeScript ✅");
      } catch (err) {
        throw new Error(`TypeScript check failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Step 4: Lint check
      try {
        execSync("npm run lint 2>&1", { cwd: WEB_DIR, timeout: 60_000 });
        results.push("Gate: ESLint ✅");
      } catch {
        throw new Error("ESLint check failed");
      }
    } else {
      results.push("Skip CI gates (content-only patch)");
    }

    // Step 5: Git commit on branch
    try {
      const branch = `agent/${agent}-${new Date().toISOString().slice(0, 10)}`;
      const filePaths = files.map(f => f.path).join(" ");
      execSync(`git checkout -b ${branch} 2>/dev/null || git checkout ${branch}`, { cwd: WEB_DIR });
      execSync(`git add ${filePaths}`, { cwd: WEB_DIR });
      execSync(`git commit -m "feat(${agent}): ${description}\n\nAuto-deployed by agent-deploy API.\n\nCo-Authored-By: BlockID ${agent.toUpperCase()} Agent <${agent}@blockid.au>"`, { cwd: WEB_DIR });
      execSync("git checkout master", { cwd: WEB_DIR });
      execSync(`git merge ${branch} --no-edit`, { cwd: WEB_DIR });
      results.push(`Git: committed + merged to master`);
    } catch (err) {
      // Git commit optional — don't fail the deploy
      results.push(`Git: skipped (${err instanceof Error ? err.message.slice(0, 50) : "error"})`);
      try { execSync("git checkout master 2>/dev/null", { cwd: WEB_DIR }); } catch { /* ignore */ }
    }

    // Step 6: Rebuild + deploy (only for source changes)
    if (hasSourceChanges) {
      try {
        execSync("bash scripts/deploy-live.sh --quick 2>&1 | tail -5", {
          cwd: WEB_DIR, timeout: 300_000, encoding: "utf8",
        });
        results.push("Deploy: ✅ Live");
      } catch {
        results.push("Deploy: ⚠️ Build/deploy failed — changes saved, manual deploy needed");
      }
    } else {
      results.push("Deploy: skipped (content-only, no rebuild needed)");
    }

    return NextResponse.json({
      ok: true,
      agent,
      description,
      results,
      filesChanged: files.length,
    });

  } catch (err) {
    // Revert all changes
    for (const b of backups) {
      const fullPath = path.join(WEB_DIR, b.path);
      try {
        if (b.content === null) {
          fs.unlinkSync(fullPath);
        } else {
          fs.writeFileSync(fullPath, b.content, "utf8");
        }
      } catch { /* best effort revert */ }
    }
    try { execSync("git checkout master 2>/dev/null && git checkout -- . 2>/dev/null", { cwd: WEB_DIR }); } catch { /* ignore */ }

    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Patch failed",
      results,
      reverted: true,
    }, { status: 422 });
  }
}
