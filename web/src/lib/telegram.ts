// Reusable Telegram Bot API helper
// Used by telegram-report, agent-deploy, and cron-runner for notifications

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "539796782";

export async function sendTelegram(text: string, parseMode: "Markdown" | "HTML" = "Markdown"): Promise<boolean> {
  if (!TELEGRAM_CHAT_ID) return false;
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
    if (!data.ok) console.error("[telegram] send failed:", data.description);
    return data.ok === true;
  } catch (err) {
    console.error("[telegram] error:", err);
    return false;
  }
}

export function mdEscape(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}
