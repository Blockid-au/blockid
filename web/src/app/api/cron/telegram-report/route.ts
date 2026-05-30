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
  const agents = ["coo", "cto", "cfo", "rnd", "ceo", "ir", "cmo"];
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

  // Build message
  const message = `📊 *BlockID.au Daily Report*
📅 ${today}

*C-Level Agent Status:*
${summaries.join("\n")}

*Production:* ${prodStatus}

_Reports: content/reports/*-${today}.md_
_Dashboard: https://blockid.au/admin_`;

  const sent = await sendTelegram(message);

  return NextResponse.json({
    ok: true,
    sent,
    chatId: TELEGRAM_CHAT_ID || "NOT_SET",
    agentsReported: summaries.filter(s => !s.includes("No report")).length,
    total: agents.length,
  });
}
