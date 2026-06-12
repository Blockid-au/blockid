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
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { callAIForUpgrade } from "@/lib/ai-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for build

// process.cwd() in standalone = .next/standalone/, not the web/ source dir
const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const CRON_SECRET = process.env.CRON_SECRET;

// ── Autofix CI Agent ────────────────────────────────────────────────────
// Runs tsc + lint. If either fails, asks AI to fix the code and retries once.

async function runCIWithAutofix(
  files: { path: string; content: string; action: "write" | "delete" }[],
  results: string[],
): Promise<{ passed: boolean; error?: string }> {
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // TypeScript check
    try {
      const tsOutput = execSync("npx tsc --noEmit 2>&1 || true", {
        cwd: WEB_DIR, timeout: 60_000, encoding: "utf8",
      });
      const tsErrors = (tsOutput.match(/error TS/g) ?? []).length;
      if (tsErrors > 0) {
        if (attempt < MAX_RETRIES) {
          results.push(`Gate: TypeScript ❌ (${tsErrors} errors) → autofix attempt`);
          const fixed = await autofixErrors("typescript", tsOutput, files);
          if (!fixed) return { passed: false, error: `TypeScript: ${tsErrors} errors (autofix failed)` };
          results.push("Autofix: applied TypeScript fixes");
          continue;
        }
        return { passed: false, error: `TypeScript: ${tsErrors} errors after autofix` };
      }
      results.push("Gate: TypeScript ✅");
    } catch (err) {
      return { passed: false, error: `TypeScript check crashed: ${err instanceof Error ? err.message : String(err)}` };
    }

    // ESLint check
    try {
      execSync("npm run lint 2>&1", { cwd: WEB_DIR, timeout: 60_000 });
      results.push("Gate: ESLint ✅");
    } catch (lintErr) {
      if (attempt < MAX_RETRIES) {
        // Try eslint --fix first
        try {
          const fixPaths = files.filter(f => f.path.startsWith("src/")).map(f => f.path).join(" ");
          if (fixPaths) {
            execSync(`npx eslint --fix ${fixPaths} 2>/dev/null || true`, { cwd: WEB_DIR, timeout: 30_000 });
          }
          // Re-check
          execSync("npm run lint 2>&1", { cwd: WEB_DIR, timeout: 60_000 });
          results.push("Gate: ESLint ✅ (after --fix)");
        } catch {
          const lintOutput = lintErr instanceof Error ? lintErr.message : String(lintErr);
          results.push("Gate: ESLint ❌ → autofix attempt");
          const fixed = await autofixErrors("eslint", lintOutput.slice(0, 1500), files);
          if (!fixed) return { passed: false, error: "ESLint failed (autofix failed)" };
          results.push("Autofix: applied ESLint fixes");
          continue;
        }
      } else {
        return { passed: false, error: "ESLint failed after autofix" };
      }
    }

    return { passed: true };
  }

  return { passed: false, error: "CI failed after all retries" };
}

async function autofixErrors(
  errorType: "typescript" | "eslint",
  errorOutput: string,
  files: { path: string; content: string; action: "write" | "delete" }[],
): Promise<boolean> {
  // Read the files that were modified
  const fileContents = files
    .filter(f => f.action === "write" && f.path.startsWith("src/"))
    .map(f => {
      try {
        const content = fs.readFileSync(path.join(WEB_DIR, f.path), "utf8");
        return `--- ${f.path} ---\n${content}`;
      } catch { return ""; }
    })
    .filter(Boolean)
    .join("\n\n");

  if (!fileContents) return false;

  const result = await callAIForUpgrade({
    system: `You are an expert TypeScript developer. Fix the ${errorType} errors in the code below. Return ONLY the fixed file content, no explanations. If multiple files need fixing, separate them with "--- filepath ---" headers.`,
    user: `Errors:\n${errorOutput.slice(0, 1000)}\n\nFiles:\n${fileContents.slice(0, 4000)}`,
    maxTokens: 3000,
  });

  if (!result?.text) return false;

  // Parse fixed files and write them back
  const fixedText = result.text;
  for (const f of files) {
    if (f.action !== "write" || !f.path.startsWith("src/")) continue;
    const marker = `--- ${f.path} ---`;
    const idx = fixedText.indexOf(marker);
    if (idx >= 0) {
      const start = idx + marker.length;
      const nextMarker = fixedText.indexOf("--- ", start + 1);
      let content = nextMarker > 0 ? fixedText.slice(start, nextMarker) : fixedText.slice(start);
      // Strip markdown fences
      content = content.replace(/^```(?:typescript|ts)?\s*\n/m, "").replace(/\n```\s*$/m, "").trim();
      if (content.length > 50) {
        fs.writeFileSync(path.join(WEB_DIR, f.path), content + "\n", "utf8");
      }
    }
  }

  return true;
}

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
    via?: string;
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

  // Liveness heartbeat — record every deploy call keyed by agent + origin so
  // cron-health can detect when a cloud routine goes silent. Cloud routines
  // pass "via":"cloud"; the local self-upgrade pipeline omits it (→ "local").
  // The two layers share agent names + report files, so this marker is the
  // only reliable way to tell a dead cloud routine from a healthy local run.
  try {
    const via = body.via === "cloud" ? "cloud" : "local";
    fs.appendFileSync(
      `${WEB_DIR}/content/reports/routine-heartbeat.jsonl`,
      JSON.stringify({ ts: new Date().toISOString(), agent: String(agent).toLowerCase(), via, files: files.length }) + "\n",
    );
  } catch { /* non-blocking */ }

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
      // Step 3+4: CI Gates — TypeScript + ESLint with autofix retry
      const ciResult = await runCIWithAutofix(files, results);
      if (!ciResult.passed) {
        throw new Error(ciResult.error ?? "CI gates failed after autofix attempt");
      }
    } else {
      results.push("Skip CI gates (content-only patch)");
    }

    // Step 5: Git commit + push to GitHub
    try {
      const branch = `agent/${agent}-${new Date().toISOString().slice(0, 10)}`;
      const filePaths = files.map(f => f.path).join(" ");
      execSync(`git checkout -b ${branch} 2>/dev/null || git checkout ${branch}`, { cwd: WEB_DIR });
      execSync(`git add ${filePaths}`, { cwd: WEB_DIR });
      execSync(`git commit -m "feat(${agent}): ${description}\n\nAuto-deployed by agent-deploy API.\n\nCo-Authored-By: BlockID ${agent.toUpperCase()} Agent <${agent}@blockid.au>"`, { cwd: WEB_DIR });
      execSync("git checkout master", { cwd: WEB_DIR });
      execSync(`git merge ${branch} --no-edit`, { cwd: WEB_DIR });
      results.push(`Git: committed + merged to master`);

      // Push to GitHub (non-blocking — deploy still succeeds if push fails)
      try {
        execSync("git push origin master 2>&1", { cwd: WEB_DIR, timeout: 30_000 });
        results.push("GitHub: pushed ✅");
      } catch {
        results.push("GitHub: push failed (will sync next time)");
      }
    } catch (err) {
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

    // Notify success via Telegram
    await sendTelegram(
      `🚀 *Agent Deploy Success*\n` +
      `Agent: \`${mdEscape(agent)}\`\n` +
      `Description: ${mdEscape(description)}\n` +
      `Files: ${files.length}\n` +
      `Results: ${results.join(", ")}`,
    ).catch(() => {});

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

    const errorMsg = err instanceof Error ? err.message : "Patch failed";

    // Notify failure via Telegram
    await sendTelegram(
      `❌ *Agent Deploy Failed*\n` +
      `Agent: \`${mdEscape(agent)}\`\n` +
      `Description: ${mdEscape(description)}\n` +
      `Error: ${mdEscape(errorMsg.slice(0, 200))}\n` +
      `Reverted: true`,
    ).catch(() => {});

    return NextResponse.json({
      ok: false,
      error: errorMsg,
      results,
      reverted: true,
    }, { status: 422 });
  }
}
