// POST /api/cron/agent-guardian — Auto-guardian: monitor → detect → fix → alert
//
// Runs every 10 minutes. Lightweight — no tsc/lint, no heavy AI calls.
// When ANY metric crosses 80% danger threshold:
//   1. Diagnose root cause
//   2. Auto-remediate (cleanup, kill zombies, restart, etc.)
//   3. Re-check to confirm fix worked
//   4. Alert Telegram + Email with what happened and what was fixed
//
// Thresholds (auto-escalate):
//   ≤ 60%  → OK (green)
//   61-79% → WATCH (yellow, log only)
//   ≥ 80%  → DANGER (red, auto-fix + alert)
//   ≥ 95%  → CRITICAL (red, aggressive cleanup + urgent alert)

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = "admin@blockid.au";
const STATE_FILE = "/tmp/blockid-guardian-state.json";
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between repeat alerts for same issue

interface MetricResult {
  name: string;
  value: number;      // 0-100 percentage
  raw: string;        // human-readable detail
  level: "ok" | "watch" | "danger" | "critical";
}

interface FixResult {
  metric: string;
  action: string;
  freed: string;
  success: boolean;
}

interface GuardianState {
  lastAlerts: Record<string, number>;  // metric → timestamp of last alert
}

function run(cmd: string, timeout = 15_000): string {
  try {
    return execSync(cmd, { timeout, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function classify(pct: number): MetricResult["level"] {
  if (pct >= 95) return "critical";
  if (pct >= 80) return "danger";
  if (pct >= 61) return "watch";
  return "ok";
}

function loadState(): GuardianState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastAlerts: {} };
  }
}

function saveState(state: GuardianState) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf8"); } catch {}
}

// ═══════════════════════════════════════════════════════════════
// METRIC COLLECTORS
// ═══════════════════════════════════════════════════════════════

function checkDisk(): MetricResult {
  const out = run("df / | tail -1 | awk '{print $5, $4}'");
  const pct = parseInt(out, 10) || 0;
  const free = out.split(" ")[1] || "?";
  return { name: "disk", value: pct, raw: `${pct}% used (${free} free)`, level: classify(pct) };
}

function checkMemory(): MetricResult {
  const out = run("free | awk 'NR==2{printf \"%.1f %d %d\", $3*100/$2, $3/1024, $2/1024}'");
  const pct = parseFloat(out) || 0;
  const parts = out.split(" ");
  return { name: "memory", value: Math.round(pct), raw: `${Math.round(pct)}% (${parts[1] || "?"}/${parts[2] || "?"}MB)`, level: classify(pct) };
}

function checkCPU(): MetricResult {
  const loadStr = run("cat /proc/loadavg | awk '{print $1}'");
  const cores = parseInt(run("nproc"), 10) || 1;
  const load = parseFloat(loadStr) || 0;
  const pct = Math.round((load / cores) * 100);
  return { name: "cpu", value: pct, raw: `Load ${load}/${cores} cores (${pct}%)`, level: classify(pct) };
}

function checkInodes(): MetricResult {
  const out = run("df -i / | tail -1 | awk '{print $5}'");
  const pct = parseInt(out, 10) || 0;
  return { name: "inodes", value: pct, raw: `${pct}% inodes used`, level: classify(pct) };
}

function checkSwap(): MetricResult {
  const out = run("free | awk 'NR==3{if($2>0) printf \"%.0f\", $3*100/$2; else print 0}'");
  const pct = parseInt(out, 10) || 0;
  return { name: "swap", value: pct, raw: `${pct}% swap used`, level: classify(pct) };
}

function checkNodeMemory(): MetricResult {
  const rss = run("ps aux | grep 'next-server' | grep -v grep | awk '{sum+=$6} END {printf \"%.0f\", sum/1024}'");
  const mb = parseInt(rss, 10) || 0;
  const totalMem = parseInt(run("free -m | awk 'NR==2{print $2}'"), 10) || 1;
  const pct = Math.round((mb / totalMem) * 100);
  return { name: "node_memory", value: pct, raw: `${mb}MB RSS (${pct}% of total)`, level: classify(pct) };
}

function checkOpenFiles(): MetricResult {
  const pid = run("pgrep -f 'next-server' | head -1");
  if (!pid) return { name: "open_files", value: 0, raw: "No server process", level: "ok" };
  const count = parseInt(run(`ls /proc/${pid}/fd 2>/dev/null | wc -l`), 10) || 0;
  const limit = parseInt(run(`cat /proc/${pid}/limits 2>/dev/null | grep 'Max open files' | awk '{print $4}'`), 10) || 65536;
  const pct = Math.round((count / limit) * 100);
  return { name: "open_files", value: pct, raw: `${count}/${limit} (${pct}%)`, level: classify(pct) };
}

function checkZombies(): MetricResult {
  const count = parseInt(run("ps aux | awk '$8==\"Z\"{c++}END{print c+0}'"), 10) || 0;
  const pct = count > 10 ? 95 : count > 5 ? 85 : count > 0 ? 50 : 0;
  return { name: "zombies", value: pct, raw: `${count} zombie processes`, level: classify(pct) };
}

function checkTmpSize(): MetricResult {
  const mb = parseInt(run("du -sm /tmp 2>/dev/null | awk '{print $1}'"), 10) || 0;
  const pct = mb > 5000 ? 95 : mb > 2000 ? 85 : mb > 1000 ? 70 : mb > 500 ? 50 : 10;
  return { name: "tmp_size", value: pct, raw: `${mb}MB in /tmp`, level: classify(pct) };
}

// ═══════════════════════════════════════════════════════════════
// AUTO-REMEDIATION ACTIONS
// ═══════════════════════════════════════════════════════════════

function fixDisk(level: "danger" | "critical"): FixResult[] {
  const fixes: FixResult[] = [];

  // Clean old logs
  const logsBefore = run("du -sm /tmp/blockid-*.log 2>/dev/null | awk '{s+=$1}END{print s+0}'");
  run("find /tmp -name 'blockid-*.log' -mtime +3 -exec truncate -s 0 {} \\; 2>/dev/null");
  if (level === "critical") {
    run("find /tmp -name '*.log' -size +50M -exec truncate -s 0 {} \\; 2>/dev/null");
  }
  const logsAfter = run("du -sm /tmp/blockid-*.log 2>/dev/null | awk '{s+=$1}END{print s+0}'");
  const logFreed = Math.max(0, parseInt(logsBefore, 10) - parseInt(logsAfter, 10));
  if (logFreed > 0) fixes.push({ metric: "disk", action: "Truncated old logs", freed: `${logFreed}MB`, success: true });

  // Clean Next.js cache
  const cacheMB = parseInt(run("du -sm /home/dovanlong/blockid.au/web/.next/cache 2>/dev/null | awk '{print $1}'"), 10) || 0;
  if (cacheMB > 200) {
    run("rm -rf /home/dovanlong/blockid.au/web/.next/cache/* 2>/dev/null");
    fixes.push({ metric: "disk", action: "Cleared Next.js build cache", freed: `${cacheMB}MB`, success: true });
  }

  // Journal vacuum
  const journalMB = parseInt(run("journalctl --disk-usage 2>/dev/null | grep -oP '\\d+' | head -1"), 10) || 0;
  if (journalMB > 500) {
    run("sudo journalctl --vacuum-size=200M 2>/dev/null || true", 15_000);
    fixes.push({ metric: "disk", action: "Vacuumed systemd journal", freed: `~${journalMB - 200}MB`, success: true });
  }

  // Clean old deploy artifacts
  run("find /tmp -name 'blockid-deploy-*' -mtime +1 -delete 2>/dev/null");
  run("find /tmp -name 'next-*' -mtime +1 -delete 2>/dev/null");

  // Clean apt cache
  if (level === "critical") {
    const aptBefore = run("du -sm /var/cache/apt 2>/dev/null | awk '{print $1}'");
    run("sudo apt-get clean 2>/dev/null || true", 10_000);
    const aptFreed = Math.max(0, parseInt(aptBefore, 10) - parseInt(run("du -sm /var/cache/apt 2>/dev/null | awk '{print $1}'"), 10));
    if (aptFreed > 10) fixes.push({ metric: "disk", action: "Cleaned apt cache", freed: `${aptFreed}MB`, success: true });
  }

  // Clean old Docker images/containers (if Docker available)
  if (level === "critical") {
    const dockerBefore = run("docker system df --format '{{.Reclaimable}}' 2>/dev/null | head -1");
    if (dockerBefore) {
      run("docker system prune -f --filter 'until=48h' 2>/dev/null", 30_000);
      fixes.push({ metric: "disk", action: "Pruned old Docker images", freed: dockerBefore, success: true });
    }
  }

  return fixes;
}

function fixMemory(level: "danger" | "critical"): FixResult[] {
  const fixes: FixResult[] = [];

  // Drop page cache
  run("sync && echo 3 | sudo tee /proc/sys/vm/drop_caches 2>/dev/null || true");
  fixes.push({ metric: "memory", action: "Dropped page cache", freed: "varies", success: true });

  // Kill orphaned node processes (not our server, not IDE)
  const serverPid = run("pgrep -f 'next-server' | head -1");
  if (level === "critical" && serverPid) {
    const orphans = run(`ps aux | grep node | grep -v 'next-server' | grep -v 'tsserver' | grep -v 'antigravity' | grep -v grep | awk '{print $2}'`);
    const killed: string[] = [];
    for (const pid of orphans.split("\n").filter(Boolean)) {
      if (pid !== serverPid && parseInt(pid, 10) > 100) {
        run(`kill ${pid} 2>/dev/null`);
        killed.push(pid);
      }
    }
    if (killed.length > 0) {
      fixes.push({ metric: "memory", action: `Killed ${killed.length} orphan node processes`, freed: `PIDs: ${killed.join(",")}`, success: true });
    }
  }

  return fixes;
}

function fixCPU(): FixResult[] {
  const fixes: FixResult[] = [];

  // Find and kill CPU-hogging processes (>50% CPU, not our server)
  const hogs = run("ps aux --sort=-%cpu | awk 'NR>1 && $3>50{print $2, $11}' | head -5");
  const serverPid = run("pgrep -f 'next-server' | head -1");
  for (const line of hogs.split("\n").filter(Boolean)) {
    const [pid, cmd] = line.split(" ");
    if (pid && pid !== serverPid && !cmd?.includes("next-server") && !cmd?.includes("antigravity")) {
      run(`renice +19 -p ${pid} 2>/dev/null`);
      fixes.push({ metric: "cpu", action: `Lowered priority of PID ${pid} (${cmd?.slice(0, 30)})`, freed: "renice +19", success: true });
    }
  }

  return fixes;
}

function fixTmp(): FixResult[] {
  const before = parseInt(run("du -sm /tmp 2>/dev/null | awk '{print $1}'"), 10) || 0;
  run("find /tmp -type f -mtime +3 -not -name 'blockid-*' -delete 2>/dev/null");
  run("find /tmp -type f -name '*.tmp' -mtime +1 -delete 2>/dev/null");
  run("find /tmp -type f -name 'tmp*' -mtime +1 -size +10M -delete 2>/dev/null");
  run("find /tmp -maxdepth 1 -type d -empty -mtime +7 -delete 2>/dev/null");
  const after = parseInt(run("du -sm /tmp 2>/dev/null | awk '{print $1}'"), 10) || 0;
  const freed = Math.max(0, before - after);
  return freed > 0
    ? [{ metric: "tmp_size", action: "Cleaned old temp files", freed: `${freed}MB`, success: true }]
    : [];
}

function fixZombies(): FixResult[] {
  const zombies = run("ps aux | awk '$8==\"Z\"{print $2}'");
  const pids = zombies.split("\n").filter(Boolean);
  for (const pid of pids) {
    const ppid = run(`ps -o ppid= -p ${pid} 2>/dev/null`).trim();
    if (ppid && parseInt(ppid, 10) > 1) {
      run(`kill -SIGCHLD ${ppid} 2>/dev/null`);
    }
  }
  return pids.length > 0
    ? [{ metric: "zombies", action: `Sent SIGCHLD to parents of ${pids.length} zombies`, freed: `${pids.length} processes`, success: true }]
    : [];
}

function fixNodeMemory(): FixResult[] {
  // If Node.js server is using too much memory, we don't want to kill it.
  // Instead, trigger garbage collection hint and log for manual review.
  return [{ metric: "node_memory", action: "Flagged for manual review (server restart may be needed)", freed: "N/A", success: false }];
}

// ═══════════════════════════════════════════════════════════════
// FIND CRITICAL ERRORS
// ═══════════════════════════════════════════════════════════════

function findCriticalErrors(): string[] {
  const errors: string[] = [];

  // Check server process
  const serverPid = run("pgrep -f 'next-server' | head -1");
  if (!serverPid) errors.push("Next.js server process not running!");

  // Check production log for recent errors
  const recentErrors = run("tail -100 /tmp/blockid-production.log 2>/dev/null | grep -i 'error\\|fatal\\|ENOSPC\\|ENOMEM\\|OOM' | tail -5");
  if (recentErrors) {
    for (const line of recentErrors.split("\n").filter(Boolean).slice(0, 3)) {
      errors.push(`Server log: ${line.slice(0, 120)}`);
    }
  }

  // Check for OOM kills in dmesg (if accessible)
  const oomKills = run("dmesg 2>/dev/null | grep -i 'oom\\|out of memory' | tail -3");
  if (oomKills) {
    errors.push(`OOM detected: ${oomKills.split("\n")[0]?.slice(0, 120)}`);
  }

  // Check cron failures today
  const today = new Date().toISOString().slice(0, 10);
  try {
    const healthPath = "/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl";
    if (fs.existsSync(healthPath)) {
      const lines = fs.readFileSync(healthPath, "utf8").split("\n").filter(Boolean);
      const recentFails = lines
        .filter(l => l.includes(today) && l.includes('"fail"'))
        .slice(-3);
      for (const line of recentFails) {
        try {
          const data = JSON.parse(line);
          errors.push(`Cron fail: ${data.endpoint || "unknown"} — ${(data.error || "").slice(0, 80)}`);
        } catch {}
      }
    }
  } catch {}

  // Check SSL expiry
  const sslDays = run("echo | openssl s_client -servername blockid.au -connect blockid.au:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2");
  if (sslDays) {
    const days = Math.floor((new Date(sslDays).getTime() - Date.now()) / 86400_000);
    if (days <= 7) errors.push(`SSL certificate expires in ${days} days!`);
  }

  // Check disk SMART errors (if smartctl available)
  const smartErr = run("sudo smartctl -H /dev/sda 2>/dev/null | grep -i 'FAILED'");
  if (smartErr) errors.push(`Disk SMART: ${smartErr.slice(0, 100)}`);

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CRON_SECRET above is the access gate. If the guardian already ran very
  // recently, skip gracefully (200) rather than failing the cron with a 429.
  const rl = checkRateLimit("cron:agent-guardian", 8, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: true, skipped: true, reason: "ran recently", resetIn: rl.resetIn });
  }

  const state = loadState();
  const now = Date.now();

  // Collect all metrics
  const metrics: MetricResult[] = [
    checkDisk(),
    checkMemory(),
    checkCPU(),
    checkInodes(),
    checkSwap(),
    checkNodeMemory(),
    checkOpenFiles(),
    checkZombies(),
    checkTmpSize(),
  ];

  const dangerMetrics = metrics.filter(m => m.level === "danger" || m.level === "critical");
  const watchMetrics = metrics.filter(m => m.level === "watch");
  const allFixes: FixResult[] = [];

  // Auto-remediate danger/critical metrics
  for (const m of dangerMetrics) {
    const fixLevel = m.level as "danger" | "critical";
    switch (m.name) {
      case "disk": allFixes.push(...fixDisk(fixLevel)); break;
      case "memory": allFixes.push(...fixMemory(fixLevel)); break;
      case "cpu": allFixes.push(...fixCPU()); break;
      case "inodes": allFixes.push(...fixDisk(fixLevel)); break;
      case "tmp_size": allFixes.push(...fixTmp()); break;
      case "zombies": allFixes.push(...fixZombies()); break;
      case "node_memory": allFixes.push(...fixNodeMemory()); break;
      case "swap": allFixes.push(...fixMemory(fixLevel)); break;
    }
  }

  // Re-check metrics that were in danger
  const recheck: Record<string, MetricResult> = {};
  if (dangerMetrics.some(m => m.name === "disk" || m.name === "inodes")) recheck.disk = checkDisk();
  if (dangerMetrics.some(m => m.name === "memory" || m.name === "swap")) recheck.memory = checkMemory();
  if (dangerMetrics.some(m => m.name === "tmp_size")) recheck.tmp_size = checkTmpSize();

  // Find critical errors
  const criticalErrors = findCriticalErrors();

  // Determine if we need to alert
  const needsAlert = dangerMetrics.length > 0 || criticalErrors.length > 0;
  const overallStatus = dangerMetrics.some(m => m.level === "critical") ? "CRITICAL"
    : dangerMetrics.length > 0 ? "DANGER"
    : watchMetrics.length > 0 ? "WATCH"
    : "HEALTHY";

  // Send alerts (with cooldown to prevent spam)
  let alertSent = false;
  if (needsAlert) {
    const alertKey = dangerMetrics.map(m => m.name).sort().join(",") + "|" + criticalErrors.length;
    const lastAlert = state.lastAlerts[alertKey] || 0;

    if (now - lastAlert > ALERT_COOLDOWN_MS) {
      state.lastAlerts[alertKey] = now;
      alertSent = true;

      // Telegram alert
      const tgLines = [
        overallStatus === "CRITICAL" ? "🚨🚨🚨 *CRITICAL ALERT*" : "🔴 *DANGER ALERT*",
        `Server: blockid\\.au | ${new Date().toISOString().slice(0, 16)}`,
        "",
      ];

      for (const m of dangerMetrics) {
        const icon = m.level === "critical" ? "🚨" : "🔴";
        tgLines.push(`${icon} *${mdEscape(m.name.toUpperCase())}*: ${mdEscape(m.raw)}`);
      }

      if (allFixes.length > 0) {
        tgLines.push("", "🔧 *Auto\\-fixes applied:*");
        for (const f of allFixes.slice(0, 5)) {
          tgLines.push(`  ${f.success ? "✅" : "⚠️"} ${mdEscape(f.action)} \\(${mdEscape(f.freed)}\\)`);
        }
      }

      for (const [name, reM] of Object.entries(recheck)) {
        const icon = reM.level === "ok" || reM.level === "watch" ? "✅" : "⚠️";
        tgLines.push(`${icon} *Re\\-check ${mdEscape(name)}*: ${mdEscape(reM.raw)}`);
      }

      if (criticalErrors.length > 0) {
        tgLines.push("", "💀 *Critical errors:*");
        for (const e of criticalErrors.slice(0, 5)) {
          tgLines.push(`  • ${mdEscape(e.slice(0, 100))}`);
        }
      }

      await sendTelegram(tgLines.join("\n"), "Markdown").catch(() => {});

      // Email alert
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `[BlockID ${overallStatus}] ${dangerMetrics.map(m => m.name).join(", ")} — auto-guardian`,
        html: buildAlertEmail(overallStatus, metrics, dangerMetrics, allFixes, recheck, criticalErrors),
      }).catch(() => {});
    }
  }

  // Clean up old alert cooldowns
  for (const [key, ts] of Object.entries(state.lastAlerts)) {
    if (now - ts > 24 * 60 * 60 * 1000) delete state.lastAlerts[key];
  }
  saveState(state);

  // Log to guardian history
  try {
    const entry = {
      ts: new Date().toISOString(),
      status: overallStatus,
      metrics: Object.fromEntries(metrics.map(m => [m.name, { value: m.value, level: m.level }])),
      fixes: allFixes.length,
      errors: criticalErrors.length,
      alerted: alertSent,
    };
    fs.appendFileSync(
      "/home/dovanlong/blockid.au/web/content/reports/guardian-history.jsonl",
      JSON.stringify(entry) + "\n",
    );
  } catch {}

  return NextResponse.json({
    ok: true,
    status: overallStatus,
    metrics: Object.fromEntries(metrics.map(m => [m.name, { value: m.value, raw: m.raw, level: m.level }])),
    danger: dangerMetrics.map(m => m.name),
    fixes: allFixes,
    recheck: Object.fromEntries(Object.entries(recheck).map(([k, v]) => [k, { value: v.value, raw: v.raw, level: v.level }])),
    criticalErrors,
    alertSent,
  });
}

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATE
// ═══════════════════════════════════════════════════════════════

function buildAlertEmail(
  status: string,
  allMetrics: MetricResult[],
  dangerMetrics: MetricResult[],
  fixes: FixResult[],
  recheck: Record<string, MetricResult>,
  errors: string[],
): string {
  const statusColor = status === "CRITICAL" ? "#dc2626" : status === "DANGER" ? "#ef4444" : "#eab308";
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");

  let metricsRows = "";
  for (const m of allMetrics) {
    const bg = m.level === "critical" ? "#fef2f2" : m.level === "danger" ? "#fff7ed" : m.level === "watch" ? "#fefce8" : "#f0fdf4";
    const color = m.level === "critical" ? "#dc2626" : m.level === "danger" ? "#ea580c" : m.level === "watch" ? "#ca8a04" : "#16a34a";
    const bar = `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100px;display:inline-block"><div style="background:${color};border-radius:4px;height:8px;width:${Math.min(m.value, 100)}px"></div></div>`;
    metricsRows += `<tr style="background:${bg}">
      <td style="padding:6px 10px;font-weight:500">${m.name.replace("_", " ").toUpperCase()}</td>
      <td style="padding:6px 10px">${bar} <strong style="color:${color}">${m.value}%</strong></td>
      <td style="padding:6px 10px;color:#6b7280">${m.raw}</td>
      <td style="padding:6px 10px"><span style="background:${color};color:white;padding:2px 8px;border-radius:10px;font-size:11px">${m.level.toUpperCase()}</span></td>
    </tr>`;
  }

  let fixesHtml = "";
  if (fixes.length > 0) {
    fixesHtml = `<h3 style="color:#2563eb;margin:20px 0 8px">🔧 Auto-Remediation</h3><table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
      <tr style="background:#f9fafb"><th style="padding:6px 10px;text-align:left">Action</th><th style="padding:6px 10px;text-align:left">Freed</th><th style="padding:6px 10px">Status</th></tr>
      ${fixes.map(f => `<tr><td style="padding:6px 10px">${f.action}</td><td style="padding:6px 10px">${f.freed}</td><td style="padding:6px 10px;text-align:center">${f.success ? "✅" : "⚠️"}</td></tr>`).join("")}
    </table>`;
  }

  let recheckHtml = "";
  if (Object.keys(recheck).length > 0) {
    recheckHtml = `<h3 style="color:#2563eb;margin:20px 0 8px">🔄 Post-Fix Re-check</h3><ul style="margin:0;padding-left:20px">`;
    for (const [name, r] of Object.entries(recheck)) {
      const icon = r.level === "ok" || r.level === "watch" ? "✅" : "⚠️";
      recheckHtml += `<li>${icon} <strong>${name}</strong>: ${r.raw} (${r.level})</li>`;
    }
    recheckHtml += `</ul>`;
  }

  let errorsHtml = "";
  if (errors.length > 0) {
    errorsHtml = `<h3 style="color:#dc2626;margin:20px 0 8px">💀 Critical Errors</h3><ul style="margin:0;padding-left:20px;color:#dc2626">
      ${errors.map(e => `<li>${e}</li>`).join("")}
    </ul>`;
  }

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:700px;margin:0 auto">
    <div style="background:${statusColor};color:white;padding:16px 20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:20px">${status === "CRITICAL" ? "🚨" : "🔴"} BlockID Auto-Guardian — ${status}</h2>
      <p style="margin:4px 0 0;opacity:0.9">${ts} UTC | ${dangerMetrics.length} metrics in danger zone</p>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-top:none;padding:16px 20px;border-radius:0 0 8px 8px">
      <h3 style="color:#374151;margin:0 0 8px">📊 System Metrics</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <tr style="background:#f9fafb"><th style="padding:6px 10px;text-align:left">Metric</th><th style="padding:6px 10px;text-align:left">Level</th><th style="padding:6px 10px;text-align:left">Detail</th><th style="padding:6px 10px">Status</th></tr>
        ${metricsRows}
      </table>
      ${fixesHtml}
      ${recheckHtml}
      ${errorsHtml}
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px">
        BlockID Auto-Guardian runs every 10 minutes — <a href="https://blockid.au/admin/goals">Dashboard</a>
      </p>
    </div>
  </div>`;
}
