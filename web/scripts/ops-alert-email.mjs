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
//   node scripts/ops-alert-email.mjs --level P1 "<subject>" "<body>"
//   node scripts/ops-alert-email.mjs --digest            (crontab 00:07 UTC)
//
// O1 / L1-12: dedup per (kind, level, UTC day) — scripts/lib/ops-alert-dedup.mjs.
// P0/P1 always go out; a P2 goes out once per kind per day and its repeats
// are held for the daily digest. Level: --level, else OPS_ALERT_LEVEL, else a
// "[Pn]" marker, else inferred (unsure ⇒ escalate, never suppress).
//
// Debounce: at most 30 mails per hour per host (state file), then drop with a
// log line — an alert storm must never become an e-mail storm. Never logs
// credentials. Exit 0 always (callers are cron paths).
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { envVal, WEB_DIR } from "./lib/ops-env.mjs";
import { buildDigests, decide, DEDUP_STATE_FILE, readDedupState, writeDedupState } from "./lib/ops-alert-dedup.mjs";

const require = createRequire(import.meta.url);
const STATE = path.join(WEB_DIR, "content", "reports", "ops-alert-email-state.json");
const MAX_PER_HOUR = 30;
const DEDUP_STATE = path.join(WEB_DIR, "content", "reports", DEDUP_STATE_FILE);

export function shouldSend(state, now = Date.now(), max = MAX_PER_HOUR) {
  const sent = Array.isArray(state?.sent_at) ? state.sent_at.filter((t) => now - t < 3_600_000) : [];
  if (sent.length >= max) return { ok: false, next: { sent_at: sent } };
  return { ok: true, next: { sent_at: [...sent, now] } };
}

export async function sendOpsEmail(subject, body, { env = process.env, dryRun = false, webDir = WEB_DIR, level = "", dedup = true, dedupStateFile = DEDUP_STATE, rateStateFile = STATE, now = Date.now(), transport = null } = {}) {
  const v = (k) => envVal(k, env, webDir);
  const to = v("ALERT_EMAIL") || v("ADMIN_EMAIL");
  const host = v("SMTP_HOST"), user = v("SMTP_USER"), pass = v("SMTP_PASS");
  if (!to || !user || !pass) return { sent: false, reason: "not_configured" };
  if (dryRun) return { sent: false, reason: "dry_run", to };
  let verdict = null;
  if (dedup) {
    // L1-12: dedup per (kind, level, UTC day); P2 repeats wait for the digest.
    verdict = decide(readDedupState(dedupStateFile), { subject, body, level: level || env.OPS_ALERT_LEVEL || "" }, now);
    writeDedupState(dedupStateFile, verdict.state);
    if (!verdict.send) return { sent: false, reason: "dedup_held_for_digest", level: verdict.level, kind: verdict.kind };
  }
  return deliver(subject, body, { v, to, host, user, pass, transport, level: verdict?.level, rateStateFile, now });
}

/** Send every finished day's digest of held P2 repeats (idempotent). */
export async function sendOpsDigest({ env = process.env, webDir = WEB_DIR, dedupStateFile = DEDUP_STATE, rateStateFile = STATE, now = Date.now(), includeToday = false, transport = null, dryRun = false } = {}) {
  const v = (k) => envVal(k, env, webDir);
  const to = v("ALERT_EMAIL") || v("ADMIN_EMAIL");
  const host = v("SMTP_HOST"), user = v("SMTP_USER"), pass = v("SMTP_PASS");
  const { days, state } = buildDigests(readDedupState(dedupStateFile), now, { includeToday });
  if (dryRun) return { sent: 0, days: days.map((d) => d.day), dry_run: true };
  if (!to || !user || !pass) return { sent: 0, days: days.map((d) => d.day), reason: "not_configured" };
  let sent = 0;
  for (const d of days) {
    try {
      const r = await deliver(d.subject, d.text, { v, to, host, user, pass, transport, digest: true, rateStateFile, now });
      if (r.sent) sent += 1;
    } catch { /* next run retries nothing — the digest is best effort */ }
  }
  writeDedupState(dedupStateFile, state);
  return { sent, days: days.map((d) => d.day) };
}

async function deliver(subject, body, { v, to, host, user, pass, transport, level, digest = false, rateStateFile = STATE, now = Date.now() }) {
  let state = {};
  try { state = JSON.parse(readFileSync(rateStateFile, "utf8")); } catch { /* first run */ }
  const gate = shouldSend(state, now);
  try { mkdirSync(path.dirname(rateStateFile), { recursive: true }); writeFileSync(rateStateFile, JSON.stringify(gate.next)); } catch { /* best effort */ }
  if (!gate.ok) return { sent: false, reason: "rate_limited" };
  const transporter = transport ?? require("nodemailer").createTransport({ host: host || "smtp.gmail.com", port: Number(v("SMTP_PORT") || 587), secure: false, auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  const from = v("SMTP_FROM_EMAIL") || user;
  const prefix = digest ? "[blockid ops]" : `[blockid ops]${level && level !== "P2" ? ` [${level}]` : ""}`;
  const footer = digest
    ? "— daily digest of held P2 repeats (scripts/lib/ops-alert-dedup.mjs)"
    : `— sent by e-mail because the Telegram bot token is invalid (docs/runbooks/secret-rotation-log.md).${level === "P2" ? " Repeats of this P2 alert today are held for the daily digest." : ""}`;
  await transporter.sendMail({ from: `BlockID ops <${from}>`, to, subject: `${prefix} ${subject}`.slice(0, 180), text: `${body}\n\n${footer}` });
  return { sent: true, to, ...(level ? { level } : {}) };
}

let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { isMain = false; }
/** argv → { subject, body?, level, digest, dryRun, includeToday }. Exported for the test. */
export function parseCli(argv) {
  const out = { positional: [], level: "", digest: false, dryRun: false, includeToday: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--digest") out.digest = true;
    else if (a === "--include-today") out.includeToday = true;
    else if (a === "--level") out.level = String(argv[++i] ?? "").toUpperCase();
    else if (a.startsWith("--level=")) out.level = a.slice(8).toUpperCase();
    else out.positional.push(a);
  }
  return { subject: out.positional[0] ?? "alert", body: out.positional[1], level: out.level, digest: out.digest, dryRun: out.dryRun, includeToday: out.includeToday };
}

if (isMain) {
  const cli = parseCli(process.argv.slice(2));
  const run = cli.digest
    ? sendOpsDigest({ dryRun: cli.dryRun, includeToday: cli.includeToday }).then((r) => { console.log(`[ops-alert-email] digest: ${r.sent} sent for [${r.days.join(", ")}]${r.reason ? ` (${r.reason})` : ""}${r.dry_run ? " (dry-run)" : ""}`); })
    : sendOpsEmail(cli.subject, cli.body ?? (process.stdin.isTTY ? "" : readFileSync(0, "utf8")), { dryRun: cli.dryRun, level: cli.level })
      .then((r) => { console.log(`[ops-alert-email] ${r.sent ? "sent" : "not sent"}${r.reason ? ` (${r.reason})` : ""}`); });
  run
    .catch((err) => { console.error("[ops-alert-email] failed:", err instanceof Error ? err.message : String(err)); })
    .finally(() => process.exit(0));
}
