// O1 / L1-12 (2026-10-20) — ops alert e-mail dedup + daily digest.
//
// 342 ops e-mails in 22 days, most of them the same alert repeating (a cron
// failing every 10 min, the same error class every window). Every ops e-mail
// path now asks this module first:
//
//   web/scripts/ops-alert-email.mjs  (scripts/lib/ops-alert.sh, cron-runner.sh,
//                                     scripts/lib/ops-env.mjs sendTelegram →
//                                     error-digest / latency / uptime crons)
//   web/src/lib/telegram.ts          (app crons + routes, e-mail fallback while
//                                     the Telegram token is dead)
//
// Rule, per (kind, level, UTC day):
//   P0 / P1  always sent immediately (the 30/h storm cap still applies).
//   P2       the FIRST one of the UTC day is sent immediately; repeats are
//            counted, not sent, and land in ONE digest e-mail for that day
//            (`node scripts/ops-alert-email.mjs --digest`, crontab 00:07 UTC;
//            idempotent — a day is digested once).
//
// kind  = the subject / first line, normalised (emoji, markdown, numbers,
//         ids, quoted strings stripped) so "Cron failed: /api/cron/x (502)"
//         and "(504)" are one kind.
// level = explicit (--level / OPS_ALERT_LEVEL / a "[P0]" marker in the text)
//         else inferred: P0 outage words, P1 money / backup / security / data
//         words, everything else P2. When unsure we escalate, never suppress.
//
// State: content/reports/ops-alert-dedup-state.json (runtime, gitignored),
// days older than 7 are dropped. Pure functions here; the callers own I/O
// through readDedupState / writeDedupState.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEDUP_STATE_FILE = "ops-alert-dedup-state.json";
export const KEEP_DAYS = 7;
export const LEVELS = ["P0", "P1", "P2"];

const P0_RE = /\[P0\]|\bP0\b|\bsite (?:is )?down\b|\bis down\b|\bDOWN\b|\boutage\b|\bdata loss\b|\bbreach\b|\bsecret leak|\bdisk (?:full|critical)\b|\ball origins?\b.*\b(?:dead|down)\b/i;
const P1_RE = /\[P1\]|\bP1\b|\bbackup\b|\brestore\b|\bpayment|\bstripe\b|\bwebhook\b|\bsecurity\b|\bfully[_ ]degraded\b|AIBudgetExhausted|\bunreachable\b|\bpermission denied\b|\bmigration\b|\brefund|\bchargeback|\bdispute\b|\bcertificate\b|\bcert\b.*\bexpir/i;
const EXPLICIT_RE = /\[(P[012])\]/i;

/** UTC day key for a timestamp (ms). */
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Subject / first line → stable kind key. */
export function alertKind(subject) {
  return String(subject ?? "")
    .split("\n")[0]
    .replace(/^\s*\[blockid ops\]\s*/i, "")
    .replace(/[*_`~]/g, "")
    .replace(/[^\p{L}\p{N}\s:/.\-()[\]#@]/gu, " ")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "<s>")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, "<hex>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 100) || "alert";
}

/** Explicit level (arg, env, "[Pn]" marker) wins; else inferred from subject + body. */
export function alertLevel(subject, body = "", explicit = "") {
  const ex = String(explicit ?? "").trim().toUpperCase();
  if (LEVELS.includes(ex)) return ex;
  const text = `${subject ?? ""}\n${body ?? ""}`;
  const marker = EXPLICIT_RE.exec(text);
  if (marker) return marker[1].toUpperCase();
  if (P0_RE.test(text)) return "P0";
  if (P1_RE.test(text)) return "P1";
  return "P2";
}

export function emptyDedupState() {
  return { version: 1, days: {}, digested: [] };
}

function prune(state, nowMs) {
  const keepFrom = utcDay(nowMs - KEEP_DAYS * 86_400_000);
  const days = {};
  for (const [d, v] of Object.entries(state?.days ?? {})) if (d >= keepFrom && v && typeof v === "object") days[d] = v;
  const digested = (Array.isArray(state?.digested) ? state.digested : []).filter((d) => typeof d === "string" && d >= keepFrom);
  return { version: 1, days, digested };
}

/**
 * Decide one alert. → { send, level, kind, day, reason, state } (input not mutated).
 * reason: "p0p1" | "first_today" | "repeat_digest".
 */
export function decide(prevState, { subject, body = "", level: explicit = "" }, nowMs = Date.now()) {
  const state = prune(prevState ?? emptyDedupState(), nowMs);
  const level = alertLevel(subject, body, explicit);
  const kind = alertKind(subject);
  const day = utcDay(nowMs);
  const key = `${level}|${kind}`;
  const dayMap = { ...(state.days[day] ?? {}) };
  const prev = dayMap[key];
  const nowIso = new Date(nowMs).toISOString();
  const entry = prev
    ? { ...prev, count: prev.count + 1, last_ts: nowIso }
    : { level, kind, subject: String(subject ?? "").split("\n")[0].slice(0, 160), count: 1, sent: 0, suppressed: 0, first_ts: nowIso, last_ts: nowIso };
  let send;
  let reason;
  if (level === "P0" || level === "P1") {
    send = true;
    reason = "p0p1";
  } else if (!prev) {
    send = true;
    reason = "first_today";
  } else {
    send = false;
    reason = "repeat_digest";
  }
  if (send) entry.sent += 1;
  else entry.suppressed += 1;
  dayMap[key] = entry;
  return { send, level, kind, day, reason, state: { ...state, days: { ...state.days, [day]: dayMap } } };
}

/**
 * Digest for every finished UTC day (< today) that has suppressed repeats and
 * was not digested yet. → { days: [{ day, subject, text }], state }.
 * Pass `{ includeToday: true }` to force today's (manual run).
 */
export function buildDigests(prevState, nowMs = Date.now(), { includeToday = false } = {}) {
  const state = prune(prevState ?? emptyDedupState(), nowMs);
  const today = utcDay(nowMs);
  const out = [];
  const digested = new Set(state.digested);
  for (const day of Object.keys(state.days).sort()) {
    if (digested.has(day)) continue;
    if (day > today || (day === today && !includeToday)) continue;
    const rows = Object.values(state.days[day]).filter((e) => e.suppressed > 0);
    if (day !== today) digested.add(day);
    if (rows.length === 0) continue;
    rows.sort((a, b) => b.suppressed - a.suppressed || a.kind.localeCompare(b.kind));
    const total = rows.reduce((n, e) => n + e.suppressed, 0);
    const lines = rows.map((e) => `• ×${e.count} (${e.suppressed} held) [${e.level}] ${e.subject} — ${e.first_ts.slice(11, 16)}–${e.last_ts.slice(11, 16)} UTC`);
    out.push({
      day,
      subject: `Ops digest ${day}: ${total} repeated P2 alert${total === 1 ? "" : "s"} held (${rows.length} kind${rows.length === 1 ? "" : "s"})`,
      text: [
        `BlockID ops digest — ${day} (UTC)`,
        `P2 alerts are e-mailed once per kind per day; these repeats were held for this digest.`,
        `P0/P1 alerts are never held.`,
        "",
        ...lines,
      ].join("\n"),
    });
  }
  return { days: out, state: { ...state, digested: [...digested].sort() } };
}

export function readDedupState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : emptyDedupState();
  } catch {
    return emptyDedupState();
  }
}

export function writeDedupState(file, state) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, file);
  } catch {
    // best effort — a lost write only means one extra e-mail
  }
}

/**
 * App-side gate: is this Telegram text an ops alert (dedup applies) or a
 * business notification (new lead, purchase, equity request — never held)?
 * Only the first line is inspected.
 */
export function isOpsAlertText(text) {
  const first = String(text ?? "").split("\n")[0];
  return /⚠|🚨|❌|🔴|🟠|\[P[012]\]|\bfail(?:ed|ure|ing)?\b|\berrors?\b|\balert\b|\bdown\b|\bdegraded\b|\bunhealthy\b|\bstale\b|\btimeout\b|\bcron\b/i.test(first);
}
