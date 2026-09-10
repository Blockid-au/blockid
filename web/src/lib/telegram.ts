// Reusable Telegram Bot API helper
// Used by telegram-report, agent-deploy, and cron-runner for notifications

// No fallback. The `?? "<literal>"` that used to sit here is how the real bot
// token ended up in a public repo — a default that "just works" in dev is a
// credential in source. Unset means Telegram is not configured, and every
// sendTelegram() below returns false without calling the API.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "539796782";

// Once the bot token is confirmed invalid (401 Unauthorized), don't keep
// hitting the API for the rest of the process — it's a permanent error
// until the token is rotated, and every retry just spams the log.
let telegramDisabled = false;

export async function sendTelegram(text: string, parseMode: "Markdown" | "HTML" = "Markdown"): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || telegramDisabled) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
      },
    );
    const data = await res.json();
    if (!data.ok) {
      if (res.status === 401 || /unauthorized/i.test(String(data.description ?? ""))) {
        telegramDisabled = true;
        console.warn("[telegram] bot token invalid (401) — disabling sendTelegram for process lifetime");
      } else {
        console.error("[telegram] send failed:", data.description);
      }
    }
    return data.ok === true;
  } catch (err) {
    console.error("[telegram] error:", err);
    return false;
  }
}

export function mdEscape(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}
