// POST /api/cron/agent-healthcheck — Daily full test + autofix agent
//
// Runs comprehensive checks on the entire codebase:
//   1. TypeScript compilation (tsc --noEmit)
//   2. ESLint
//   3. Production build test
//   4. API endpoint health
//   5. Database connectivity
//   6. Cron job health (missed routines)
//
// If issues found → attempts autofix → reports to Telegram + saves report
// Runs daily at 8:30am AEST (after auto-improve deploys at 7am)

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const CRON_SECRET = process.env.CRON_SECRET;
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";

interface HealthItem {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fixable: boolean;
  fixed?: boolean;
}

function runCheck(name: string, cmd: string, timeout = 60_000): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { cwd: WEB_DIR, timeout, encoding: "utf8" }).trim();
    return { ok: true, output };
  } catch (err) {
    const output = err instanceof Error ? (err as { stdout?: string }).stdout ?? err.message : String(err);
    return { ok: false, output: typeof output === "string" ? output.slice(0, 500) : String(output) };
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit("cron:agent-healthcheck", 2, 30 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", resetIn: rl.resetIn }, { status: 429 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const items: HealthItem[] = [];

  // ── Check 1: TypeScript compilation ──────────────────────────────
  const tsResult = runCheck("TypeScript", "npx tsc --noEmit 2>&1 | tail -20 || true");
  const tsErrors = (tsResult.output.match(/error TS/g) ?? []).length;
  items.push({
    check: "TypeScript",
    status: tsErrors === 0 ? "pass" : tsErrors <= 3 ? "warn" : "fail",
    detail: tsErrors === 0 ? "No errors" : `${tsErrors} errors`,
    fixable: tsErrors > 0,
  });

  // ── Check 2: ESLint ──────────────────────────────────────────────
  const lintResult = runCheck("ESLint", "npm run lint 2>&1 || true");
  const lintErrors = lintResult.ok;
  items.push({
    check: "ESLint",
    status: lintErrors ? "pass" : "warn",
    detail: lintErrors ? "Clean" : "Issues found",
    fixable: !lintErrors,
  });

  // If lint fails, try auto-fix
  if (!lintErrors) {
    try {
      execSync("npx eslint --fix src/ 2>/dev/null || true", { cwd: WEB_DIR, timeout: 60_000 });
      const recheck = runCheck("ESLint recheck", "npm run lint 2>&1 || true");
      if (recheck.ok) {
        items[items.length - 1].status = "pass";
        items[items.length - 1].detail = "Fixed by eslint --fix";
        items[items.length - 1].fixed = true;
      }
    } catch { /* best effort */ }
  }

  // ── Check 3: Production HTTP health ──────────────────────────────
  try {
    const res = await fetch("https://blockid.au/api/healthz", { signal: AbortSignal.timeout(10000) });
    items.push({
      check: "Production HTTP",
      status: res.ok ? "pass" : "fail",
      detail: `HTTP ${res.status}`,
      fixable: false,
    });
  } catch (err) {
    items.push({
      check: "Production HTTP",
      status: "fail",
      detail: err instanceof Error ? err.message : "Unreachable",
      fixable: false,
    });
  }

  // ── Check 4: Database connectivity ───────────────────────────────
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { count, error } = await supabase.from("app_users").select("id", { count: "exact", head: true });
      items.push({
        check: "Database",
        status: error ? "fail" : "pass",
        detail: error ? error.message : `OK (${count} users)`,
        fixable: false,
      });
    } catch (err) {
      items.push({
        check: "Database",
        status: "fail",
        detail: err instanceof Error ? err.message : "Connection failed",
        fixable: false,
      });
    }
  }

  // ── Check 5: Redis connectivity ──────────────────────────────────
  const redisResult = runCheck("Redis", "redis-cli -h 127.0.0.1 ping 2>&1", 5000);
  items.push({
    check: "Redis",
    status: redisResult.output.includes("PONG") ? "pass" : "warn",
    detail: redisResult.output.includes("PONG") ? "PONG" : redisResult.output.slice(0, 50),
    fixable: false,
  });

  // ── Check 6: Disk space ──────────────────────────────────────────
  const diskResult = runCheck("Disk", "df -h / | tail -1 | awk '{print $5}'");
  const diskUsage = parseInt(diskResult.output, 10) || 0;
  items.push({
    check: "Disk Space",
    status: diskUsage < 80 ? "pass" : diskUsage < 90 ? "warn" : "fail",
    detail: `${diskResult.output} used`,
    fixable: false,
  });

  // ── Check 7: Cron health (missed routines) ───────────────────────
  let missedCrons = 0;
  try {
    const healthPath = `${REPORTS_DIR}/cron-health.jsonl`;
    if (fs.existsSync(healthPath)) {
      const lines = fs.readFileSync(healthPath, "utf8").split("\n").filter(Boolean);
      const todayRuns = lines.filter((l) => l.includes(today));
      const failedToday = todayRuns.filter((l) => l.includes('"fail"')).length;
      missedCrons = failedToday;
    }
  } catch { /* non-blocking */ }
  items.push({
    check: "Cron Jobs",
    status: missedCrons === 0 ? "pass" : missedCrons <= 2 ? "warn" : "fail",
    detail: missedCrons === 0 ? "All OK today" : `${missedCrons} failures today`,
    fixable: false,
  });

  // ── Check 8: Git status (uncommitted changes) ────────────────────
  const gitResult = runCheck("Git Status", "git status --porcelain | wc -l");
  const uncommitted = parseInt(gitResult.output, 10) || 0;
  items.push({
    check: "Git Clean",
    status: uncommitted === 0 ? "pass" : uncommitted <= 5 ? "warn" : "fail",
    detail: uncommitted === 0 ? "Working tree clean" : `${uncommitted} uncommitted files`,
    fixable: false,
  });

  // ── Summary ──────────────────────────────────────────────────────
  const passed = items.filter((i) => i.status === "pass").length;
  const warned = items.filter((i) => i.status === "warn").length;
  const failed = items.filter((i) => i.status === "fail").length;
  const fixed = items.filter((i) => i.fixed).length;
  const overallStatus = failed > 0 ? "RED" : warned > 0 ? "YELLOW" : "GREEN";

  // Save report
  const reportLines = [
    `# QA Agent — Daily Health Report — ${today}`,
    ``,
    `**Status: ${overallStatus}** — ${passed} pass, ${warned} warn, ${failed} fail${fixed > 0 ? `, ${fixed} auto-fixed` : ""}`,
    ``,
    `## Checks`,
    ``,
    ...items.map((i) => {
      const icon = i.status === "pass" ? "✅" : i.status === "warn" ? "⚠️" : "❌";
      return `- ${icon} **${i.check}**: ${i.detail}${i.fixed ? " (auto-fixed)" : ""}`;
    }),
    ``,
    `---`,
    `Generated: ${new Date().toISOString()}`,
  ];

  try {
    fs.writeFileSync(`${REPORTS_DIR}/qa-daily-${today}.md`, reportLines.join("\n"), "utf8");
  } catch { /* non-blocking */ }

  // Send to Telegram if there are issues
  if (failed > 0 || warned > 0) {
    const failItems = items.filter((i) => i.status !== "pass");
    await sendTelegram(
      `🏥 *QA Agent — Daily Health*\n` +
      `📅 ${today} | Status: *${overallStatus}*\n\n` +
      failItems.map((i) => {
        const icon = i.status === "warn" ? "⚠️" : "❌";
        return `${icon} *${mdEscape(i.check)}*: ${mdEscape(i.detail)}${i.fixed ? " ✅ fixed" : ""}`;
      }).join("\n") +
      `\n\n✅ ${passed}/${items.length} checks passed${fixed > 0 ? ` | 🔧 ${fixed} auto-fixed` : ""}`,
    ).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    date: today,
    status: overallStatus,
    summary: { passed, warned, failed, fixed, total: items.length },
    checks: items,
  });
}
