#!/usr/bin/env node
// G15 review 2026-09-18 — e-mail fallback for ops alerts.
//
// The Telegram bot token answers 401 (revoked per docs/runbooks/secret-
// rotation-log.md, new token never installed), which silently killed every
// cron / backup / uptime / error-digest alert. Until the founder installs a
// new token, every alert path (lib/telegram.ts, scripts/lib/ops-alert.sh,
// cron-runner.sh, scripts/lib/ops-env.mjs) falls back to this script, which
// mails ADMIN_EMAIL (or ALERT_EMAIL) over the same SMTP the product uses.
//
//   node scripts/ops-alert-email.mjs "<subject>" "<body>"   (body may be stdin)
//
// Debounce: at most 30 mails per hour per host (state file), then drop with a
// log line — an alert storm must never become an e-mail storm. Never logs
// credentials. Exit 0 always (callers are cron paths).
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { envVal, WEB_DIR } from "./lib/ops-env.mjs";

const require = createRequire(import.meta.url);
const STATE = path.join(WEB_DIR, "content", "reports", "ops-alert-email-state.json");
const MAX_PER_HOUR = 30;

export function shouldSend(state, now = Date.now(), max = MAX_PER_HOUR) {
  const sent = Array.isArray(state?.sent_at) ? state.sent_at.filter((t) => now - t < 3_600_000) : [];
  if (sent.length >= max) return { ok: false, next: { sent_at: sent } };
  return { ok: true, next: { sent_at: [...sent, now] } };
}

export async function sendOpsEmail(subject, body, { env = process.env, dryRun = false, webDir = WEB_DIR } = {}) {
  const v = (k) => envVal(k, env, webDir);
  const to = v("ALERT_EMAIL") || v("ADMIN_EMAIL");
  const host = v("SMTP_HOST"), user = v("SMTP_USER"), pass = v("SMTP_PASS");
  if (!to || !user || !pass) return { sent: false, reason: "not_configured" };
  if (dryRun) return { sent: false, reason: "dry_run", to };
  let state = {};
  try { state = JSON.parse(readFileSync(STATE, "utf8")); } catch { /* first run */ }
  const gate = shouldSend(state);
  try { mkdirSync(path.dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(gate.next)); } catch { /* best effort */ }
  if (!gate.ok) return { sent: false, reason: "rate_limited" };
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({ host: host || "smtp.gmail.com", port: Number(v("SMTP_PORT") || 587), secure: false, auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  const from = v("SMTP_FROM_EMAIL") || user;
  await transporter.sendMail({ from: `BlockID ops <${from}>`, to, subject: `[blockid ops] ${subject}`.slice(0, 180), text: `${body}\n\n— sent by e-mail because the Telegram bot token is invalid (docs/runbooks/secret-rotation-log.md)` });
  return { sent: true, to };
}

let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { isMain = false; }
if (isMain) {
  const [subject = "alert", bodyArg] = process.argv.slice(2);
  const body = bodyArg ?? (process.stdin.isTTY ? "" : readFileSync(0, "utf8"));
  sendOpsEmail(subject, body, { dryRun: process.argv.includes("--dry-run") })
    .then((r) => { console.log(`[ops-alert-email] ${r.sent ? "sent" : "not sent"}${r.reason ? ` (${r.reason})` : ""}`); })
    .catch((err) => { console.error("[ops-alert-email] failed:", err instanceof Error ? err.message : String(err)); })
    .finally(() => process.exit(0));
}
