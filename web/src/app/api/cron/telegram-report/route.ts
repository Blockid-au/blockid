// POST /api/cron/telegram-report — Daily C-Level summary to Telegram
//
// Reads all agent reports from today, synthesizes into a concise message,
// and sends to Telegram via Bot API.
//
// Schedule: Daily 23:30 UTC (9:30 AM AEST) — after CEO finishes at 23:00
// Auth: Bearer CRON_SECRET

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

const TELEGRAM_BOT_TOKEN = "8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const CRON_SECRET = process.env.CRON_SECRET;
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";
const DEPLOY_LOG = path.join(REPORTS_DIR, "deploy-log.jsonl");

// Escape Telegram Markdown (v1) special chars in dynamic text.
function mdEscape(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}

interface DeployEvent {
  time: string; // HH:MM
  note: string;
}

// Concrete "work shipped today" — sourced from the INTERNAL CI/CD pipeline
// (deploy-live.sh src → public), NOT git. Each successful deploy appends an
// entry to deploy-log.jsonl; here we read today's entries and show them inline.
function todaysDeploys(today: string): DeployEvent[] {
  try {
    const raw = fs.readFileSync(DEPLOY_LOG, "utf8");
    const events: DeployEvent[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t) as { ts?: string; note?: string; status?: string };
        if (!e.ts || !e.ts.startsWith(today)) continue;
        if (e.status && e.status !== "success") continue;
        events.push({ time: e.ts.slice(11, 16), note: e.note ?? "Triển khai" });
      } catch {
        /* skip malformed line */
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function sendTelegram(text: string): Promise<boolean> {
  if (!TELEGRAM_CHAT_ID) {
    console.warn("[telegram] TELEGRAM_CHAT_ID not set");
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      },
    );
    const data = await res.json();
    if (!data.ok) console.error("[telegram] send failed:", data.description);
    return data.ok === true;
  } catch (err) {
    console.error("[telegram] error:", err);
    return false;
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const agents = ["coo", "cto", "cfo", "cmo", "cro", "cdo", "ciso", "rnd"];
  const summaries: string[] = [];

  // Read each agent's report
  for (const agent of agents) {
    const dailyPath = path.join(REPORTS_DIR, `${agent}-daily-${today}.md`);
    const weeklyPath = path.join(REPORTS_DIR, `${agent}-weekly-${today}.md`);
    const filePath = fs.existsSync(dailyPath) ? dailyPath : fs.existsSync(weeklyPath) ? weeklyPath : null;

    if (filePath) {
      const content = fs.readFileSync(filePath, "utf8");
      // Extract status (GREEN/YELLOW/RED) and first meaningful line
      const statusMatch = content.match(/(GREEN|YELLOW|RED)/i);
      const status = statusMatch ? statusMatch[1].toUpperCase() : "N/A";
      const statusEmoji = status === "GREEN" ? "🟢" : status === "YELLOW" ? "🟡" : status === "RED" ? "🔴" : "⚪";

      // Get first non-header, non-empty line as summary
      const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
      const summary = lines[0]?.slice(0, 80) ?? "Report submitted";

      summaries.push(`${statusEmoji} *${agent.toUpperCase()}*: ${status}\n   ${summary}`);
    } else {
      summaries.push(`⚪ *${agent.toUpperCase()}*: No report`);
    }
  }

  // Production health check
  let prodStatus = "❓";
  try {
    const res = await fetch("https://blockid.au/api/healthz", { signal: AbortSignal.timeout(5000) });
    prodStatus = res.ok ? "🟢 HTTP 200" : `🔴 HTTP ${res.status}`;
  } catch {
    prodStatus = "🔴 Unreachable";
  }

  // Work shipped today via the internal CI/CD pipeline (src → public) — direct
  // content, not a file link, and NOT sourced from git.
  const deploys = todaysDeploys(today);
  const MAX_DEPLOYS = 15;
  let workSection: string;
  if (deploys.length === 0) {
    workSection = "_Chưa có bản triển khai nào hôm nay._";
  } else {
    const shown = deploys
      .slice(0, MAX_DEPLOYS)
      .map((d) => `• ${d.time} — ${mdEscape(d.note)}`);
    if (deploys.length > MAX_DEPLOYS) {
      shown.push(`… và ${deploys.length - MAX_DEPLOYS} bản triển khai khác`);
    }
    workSection = shown.join("\n");
  }

  // Build message — sends the actual summarized content directly (no file links)
  const message = `📊 *BlockID.au — Báo cáo hàng ngày*
📅 ${today}

🚀 *Đã triển khai hôm nay (CI/CD src→public)* (${deploys.length})
${workSection}

👥 *Trạng thái C-Level Agents:*
${summaries.join("\n")}

🌐 *Production:* ${prodStatus}`;

  const sent = await sendTelegram(message);

  return NextResponse.json({
    ok: true,
    sent,
    chatId: TELEGRAM_CHAT_ID || "NOT_SET",
    deploysToday: deploys.length,
    agentsReported: summaries.filter(s => !s.includes("No report")).length,
    total: agents.length,
  });
}
