// POST /api/cron/ceo-daily-summary — CEO Agent aggregates all C-Level reports
//
// Reads all agent daily reports, QA healthcheck, deploy log, and platform metrics.
// Generates a comprehensive CEO summary with AI analysis and recommendations.
// Sends: detailed email to admin + condensed Telegram summary.
//
// Schedule: 10:00am AEST daily (after all agents have reported)

import { NextResponse } from "next/server";
import * as fs from "fs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAIForUpgrade, getAIBudgetStatus } from "@/lib/ai-client";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { GROWTH_PHASES, getPhaseProgress } from "@/lib/startup-growth-phases";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";
const ADMIN_EMAIL = "admin@blockid.au";

const AGENTS = ["coo", "cto", "cfo", "cmo", "cro", "cdo", "ciso", "chro"] as const;

interface AgentReport {
  agent: string;
  status: "GREEN" | "YELLOW" | "RED" | "MISSING";
  summary: string;
  fullContent: string;
}

function readAgentReport(agent: string, date: string): AgentReport {
  const patterns = [
    `${REPORTS_DIR}/${agent}-daily-${date}.md`,
    `${REPORTS_DIR}/${agent}-weekly-${date}.md`,
  ];

  for (const path of patterns) {
    try {
      if (fs.existsSync(path)) {
        const content = fs.readFileSync(path, "utf8");
        const statusMatch = content.match(/Status:\s*(GREEN|YELLOW|RED)/i);
        const status = (statusMatch?.[1]?.toUpperCase() ?? "YELLOW") as AgentReport["status"];
        const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
        const summary = lines.slice(0, 3).join(" ").slice(0, 200);
        return { agent, status, summary, fullContent: content.slice(0, 2000) };
      }
    } catch { /* skip */ }
  }

  return { agent, status: "MISSING", summary: "No report available", fullContent: "" };
}

function readQAReport(date: string): string {
  try {
    const path = `${REPORTS_DIR}/qa-daily-${date}.md`;
    if (fs.existsSync(path)) return fs.readFileSync(path, "utf8").slice(0, 2000);
  } catch { /* skip */ }
  return "";
}

function readDeployLog(date: string): string[] {
  try {
    const path = `${REPORTS_DIR}/deploy-log.jsonl`;
    if (!fs.existsSync(path)) return [];
    const lines = fs.readFileSync(path, "utf8").split("\n").filter(Boolean);
    return lines.filter(l => l.includes(date)).map(l => {
      try {
        const entry = JSON.parse(l);
        return `${entry.time ?? ""} — ${entry.note ?? entry.buildId ?? "deploy"}`;
      } catch { return l.slice(0, 100); }
    });
  } catch { return []; }
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit("cron:ceo-daily-summary", 2, 30 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", resetIn: rl.resetIn }, { status: 429 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── Gather all data ──────────────────────────────────────────────
  const agentReports = AGENTS.map(a => readAgentReport(a, today));
  const qaReport = readQAReport(today);
  const deploys = readDeployLog(today);
  const budget = getAIBudgetStatus();

  // Platform metrics from Supabase
  let platformMetrics = { users: 0, analyses: 0, credits: 0 };
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { count: users } = await supabase.from("app_users").select("id", { count: "exact", head: true });
      const { count: analyses } = await supabase.from("svi_analyses").select("id", { count: "exact", head: true });
      platformMetrics = { users: users ?? 0, analyses: analyses ?? 0, credits: 0 };
    } catch { /* non-blocking */ }
  }

  // ── AI CEO Summary ───────────────────────────────────────────────
  const agentSummaries = agentReports.map(r =>
    `${r.agent.toUpperCase()} [${r.status}]: ${r.summary}`
  ).join("\n");

  let ceoAnalysis = "";
  let recommendations: string[] = [];

  try {
    const result = await callAIForUpgrade({
      system: `You are the CEO of BlockID.au, an AI-powered startup valuation platform in Australia. You are reviewing today's daily reports from your C-Level executive team. Provide a concise CEO summary with strategic recommendations.

Format your response as:
OVERALL_STATUS: GREEN|YELLOW|RED
SUMMARY: 2-3 sentence executive summary
WINS: bullet list of today's wins
RISKS: bullet list of current risks
RECOMMENDATIONS: numbered list of 3-5 strategic actions for tomorrow
PRIORITY: the single most important action item`,
      user: `Date: ${today}

AGENT REPORTS:
${agentSummaries}

QA HEALTHCHECK:
${qaReport.slice(0, 500) || "No QA report yet"}

DEPLOYS TODAY: ${deploys.length}
${deploys.slice(0, 5).join("\n") || "None"}

PLATFORM: ${platformMetrics.users} users, ${platformMetrics.analyses} analyses
AI BUDGET: $${budget.spent}/$${budget.limit} (${budget.percent}%)

Growth Phases Framework: ${GROWTH_PHASES.length} phases defined
Current focus: Auto-upgrade + self-healing + daily deploy pipeline`,
      maxTokens: 1500,
    });

    if (result?.text) {
      ceoAnalysis = result.text;
      const recMatch = ceoAnalysis.match(/RECOMMENDATIONS:?\s*([\s\S]*?)(?=PRIORITY:|$)/i);
      if (recMatch) {
        recommendations = recMatch[1].split("\n").filter(l => l.trim()).slice(0, 5);
      }
    }
  } catch {
    ceoAnalysis = "AI analysis unavailable — budget or provider issue.";
  }

  // ── Status summary ───────────────────────────────────────────────
  const greenCount = agentReports.filter(r => r.status === "GREEN").length;
  const yellowCount = agentReports.filter(r => r.status === "YELLOW").length;
  const redCount = agentReports.filter(r => r.status === "RED").length;
  const missingCount = agentReports.filter(r => r.status === "MISSING").length;
  const overallStatus = redCount > 0 ? "RED" : yellowCount > 2 ? "YELLOW" : "GREEN";

  // ── Save CEO report ──────────────────────────────────────────────
  const reportLines = [
    `# CEO Daily Summary — ${today}`,
    ``,
    `**Overall Status: ${overallStatus}** | 🟢${greenCount} 🟡${yellowCount} 🔴${redCount} ❓${missingCount}`,
    ``,
    `## Agent Status`,
    ...agentReports.map(r => {
      const icon = r.status === "GREEN" ? "🟢" : r.status === "YELLOW" ? "🟡" : r.status === "RED" ? "🔴" : "❓";
      return `- ${icon} **${r.agent.toUpperCase()}**: ${r.summary}`;
    }),
    ``,
    `## Platform`,
    `- Users: ${platformMetrics.users}`,
    `- Analyses: ${platformMetrics.analyses}`,
    `- Deploys today: ${deploys.length}`,
    `- AI Budget: $${budget.spent}/$${budget.limit} (${budget.percent}%)`,
    ``,
    `## CEO Analysis`,
    ceoAnalysis,
    ``,
    `---`,
    `Generated: ${new Date().toISOString()}`,
  ];

  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(`${REPORTS_DIR}/ceo-daily-${today}.md`, reportLines.join("\n"), "utf8");
  } catch { /* non-blocking */ }

  // ── Telegram summary ─────────────────────────────────────────────
  const statusEmoji = overallStatus === "GREEN" ? "🟢" : overallStatus === "YELLOW" ? "🟡" : "🔴";
  await sendTelegram(
    `${statusEmoji} *CEO Daily Summary — ${today}*\n\n` +
    `*Agents:* 🟢${greenCount} 🟡${yellowCount} 🔴${redCount} ❓${missingCount}\n` +
    `*Deploys:* ${deploys.length} | *Users:* ${platformMetrics.users}\n` +
    `*AI Budget:* $${budget.spent}/$${budget.limit} (${budget.percent}%)\n\n` +
    agentReports.map(r => {
      const icon = r.status === "GREEN" ? "🟢" : r.status === "YELLOW" ? "🟡" : r.status === "RED" ? "🔴" : "❓";
      return `${icon} *${mdEscape(r.agent.toUpperCase())}*: ${mdEscape(r.summary.slice(0, 60))}`;
    }).join("\n") +
    (recommendations.length > 0 ? `\n\n📋 *CEO Recommendations:*\n${recommendations.map(r => mdEscape(r)).join("\n")}` : ""),
  ).catch(() => {});

  // ── Email full CEO report ────────────────────────────────────────
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `${statusEmoji} [BlockID CEO] ${overallStatus} — ${today} | ${deploys.length} deploys, ${greenCount}/${AGENTS.length} agents green`,
    html: buildCEOEmail(today, overallStatus, agentReports, qaReport, deploys, platformMetrics, budget, ceoAnalysis, recommendations),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    date: today,
    status: overallStatus,
    agents: { green: greenCount, yellow: yellowCount, red: redCount, missing: missingCount },
    deploys: deploys.length,
    budget,
    hasAIAnalysis: ceoAnalysis.length > 50,
  });
}

function buildCEOEmail(
  date: string,
  status: string,
  agents: AgentReport[],
  qaReport: string,
  deploys: string[],
  metrics: { users: number; analyses: number },
  budget: { spent: number; limit: number; percent: number },
  analysis: string,
  recommendations: string[],
): string {
  const statusColor = status === "GREEN" ? "#10b981" : status === "YELLOW" ? "#eab308" : "#ef4444";
  const statusEmoji = status === "GREEN" ? "🟢" : status === "YELLOW" ? "🟡" : "🔴";

  const agentRows = agents.map(r => {
    const icon = r.status === "GREEN" ? "🟢" : r.status === "YELLOW" ? "🟡" : r.status === "RED" ? "🔴" : "❓";
    const bg = r.status === "GREEN" ? "#f0fdf4" : r.status === "YELLOW" ? "#fefce8" : r.status === "RED" ? "#fef2f2" : "#f9fafb";
    return `<tr style="background:${bg}">
      <td style="padding:8px 12px;font-weight:600">${icon} ${r.agent.toUpperCase()}</td>
      <td style="padding:8px 12px;color:#4b5563;font-size:13px">${escHtml(r.summary.slice(0, 150))}</td>
    </tr>`;
  }).join("");

  const deployList = deploys.length > 0
    ? deploys.slice(0, 8).map(d => `<li style="color:#4b5563;font-size:13px">${escHtml(d)}</li>`).join("")
    : '<li style="color:#9ca3af">No deploys today</li>';

  const recList = recommendations.length > 0
    ? recommendations.map(r => `<li style="margin:4px 0;color:#1f2937">${escHtml(r)}</li>`).join("")
    : '<li style="color:#9ca3af">AI analysis unavailable</li>';

  const budgetPercent = Math.min(budget.percent, 100);
  const budgetColor = budgetPercent >= 90 ? "#ef4444" : budgetPercent >= 70 ? "#eab308" : "#10b981";

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:700px;margin:0 auto;background:#f9fafb">
    <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);color:white;padding:24px 28px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:22px">${statusEmoji} CEO Daily Summary</h1>
      <p style="margin:6px 0 0;opacity:0.85;font-size:14px">${date} | BlockID.au Platform Report</p>
    </div>

    <div style="background:white;padding:24px 28px;border:1px solid #e5e7eb;border-top:none">
      <!-- KPI Cards -->
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#059669">${metrics.users}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Total Users</div>
        </div>
        <div style="flex:1;min-width:120px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#2563eb">${metrics.analyses}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Analyses</div>
        </div>
        <div style="flex:1;min-width:120px;background:#faf5ff;border:1px solid #d8b4fe;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#7c3aed">${deploys.length}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Deploys Today</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:${budgetColor}">$${budget.spent}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">AI Budget ($${budget.limit})</div>
        </div>
      </div>

      <!-- Budget Bar -->
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:4px">
          <span>AI Budget</span><span>${budgetPercent}%</span>
        </div>
        <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden">
          <div style="background:${budgetColor};width:${budgetPercent}%;height:100%;border-radius:4px;transition:width 0.3s"></div>
        </div>
      </div>

      <!-- Agent Status Table -->
      <h2 style="font-size:16px;color:#111827;margin:20px 0 12px;border-bottom:2px solid #6366f1;padding-bottom:6px">C-Level Agent Status</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f3f4f6"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Agent</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Status & Summary</th></tr></thead>
        <tbody>${agentRows}</tbody>
      </table>

      <!-- Deploys -->
      <h2 style="font-size:16px;color:#111827;margin:20px 0 12px;border-bottom:2px solid #10b981;padding-bottom:6px">Deploys Today (${deploys.length})</h2>
      <ul style="margin:0;padding-left:20px">${deployList}</ul>

      <!-- CEO AI Analysis -->
      <h2 style="font-size:16px;color:#111827;margin:20px 0 12px;border-bottom:2px solid #8b5cf6;padding-bottom:6px">CEO Analysis & Recommendations</h2>
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin-bottom:16px">
        <ol style="margin:0;padding-left:20px">${recList}</ol>
      </div>

      <!-- QA Summary -->
      ${qaReport ? `<h2 style="font-size:16px;color:#111827;margin:20px 0 12px;border-bottom:2px solid #f59e0b;padding-bottom:6px">QA Healthcheck</h2>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:13px;color:#4b5563;white-space:pre-line">${escHtml(qaReport.slice(0, 500))}</div>` : ""}
    </div>

    <div style="padding:16px 28px;text-align:center;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;background:#f9fafb">
      <p style="color:#9ca3af;font-size:11px;margin:0">
        Generated by BlockID CEO Agent | <a href="https://blockid.au/admin/goals" style="color:#6366f1">View Dashboard</a> | <a href="https://blockid.au/admin" style="color:#6366f1">Admin Panel</a>
      </p>
    </div>
  </div>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
