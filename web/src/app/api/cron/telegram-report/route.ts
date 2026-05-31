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
import { execFileSync } from "child_process";

export const dynamic = "force-dynamic";

const TELEGRAM_BOT_TOKEN = "8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const CRON_SECRET = process.env.CRON_SECRET;
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";
const REPO_DIR = "/home/dovanlong/blockid.au";

// Escape Telegram Markdown (v1) special chars in dynamic text.
function mdEscape(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}

// Concrete "work done today" — derived from git commits since midnight so the
// report shows ACTUAL changes inline (not a file link).
function todaysWork(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["-C", REPO_DIR, "log", "--since=midnight", "--no-merges", "--pretty=format:%s"],
      { encoding: "utf8", timeout: 5000 },
    );
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
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

  // Concrete work done today (direct content, not a file link)
  const commits = todaysWork();
  const MAX_COMMITS = 15;
  let workSection: string;
  if (commits.length === 0) {
    workSection = "_Không có thay đổi code hôm nay._";
  } else {
    const shown = commits.slice(0, MAX_COMMITS).map((c) => `• ${mdEscape(c)}`);
    if (commits.length > MAX_COMMITS) {
      shown.push(`… và ${commits.length - MAX_COMMITS} thay đổi khác`);
    }
    workSection = shown.join("\n");
  }

  // Build message — sends the actual summarized content directly (no file links)
  const message = `📊 *BlockID.au — Báo cáo hàng ngày*
📅 ${today}

🛠 *Công việc đã làm hôm nay* (${commits.length})
${workSection}

👥 *Trạng thái C-Level Agents:*
${summaries.join("\n")}

🌐 *Production:* ${prodStatus}`;

  const sent = await sendTelegram(message);

  return NextResponse.json({
    ok: true,
    sent,
    chatId: TELEGRAM_CHAT_ID || "NOT_SET",
    commitsToday: commits.length,
    agentsReported: summaries.filter(s => !s.includes("No report")).length,
    total: agents.length,
  });
}
