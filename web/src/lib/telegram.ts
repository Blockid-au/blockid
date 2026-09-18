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

// G15 review 2026-09-18: the bot token answers 401 (revoked, replacement never
// installed) — that silently killed every alert. When Telegram is unset,
// disabled or fails, mail ADMIN_EMAIL / ALERT_EMAIL instead (SMTP is the same
// transport the product uses), at most ~30/h via lib/email; never throws.
let emailFallbackWindow: number[] = [];
async function emailFallback(text: string): Promise<boolean> {
  const to = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL;
  if (!to || ((process.env.NODE_ENV === "test" || process.env.VITEST) && !process.env.TELEGRAM_EMAIL_FALLBACK_TEST)) return false;
  const now = Date.now();
  emailFallbackWindow = emailFallbackWindow.filter((t) => now - t < 3_600_000);
  if (emailFallbackWindow.length >= 30) return false;
  emailFallbackWindow.push(now);
  try {
    const { sendEmail } = await import("@/lib/email");
    const subject = `[blockid ops] ${text.split("\n")[0].replace(/[*_`]/g, "").slice(0, 120)}`;
    const r = await sendEmail({ to, subject, text: `${text}\n\n— sent by e-mail because Telegram is unavailable (token 401 — see docs/runbooks/secret-rotation-log.md)`, html: `<pre>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre>` });
    return r.ok;
  } catch (err) {
    console.error("[telegram] e-mail fallback failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function sendTelegram(text: string, parseMode: "Markdown" | "HTML" = "Markdown"): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || telegramDisabled) return emailFallback(text);
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
        console.warn("[telegram] bot token invalid (401) — disabling sendTelegram for process lifetime; alerts fall back to e-mail");
      } else {
        console.error("[telegram] send failed:", data.description);
      }
      return emailFallback(text);
    }
    return data.ok === true;
  } catch (err) {
    console.error("[telegram] error:", err);
    return emailFallback(text);
  }
}

export function mdEscape(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}
