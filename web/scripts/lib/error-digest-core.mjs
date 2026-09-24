// G15-R2 — error-digest core: pure parser + alert rules for the production
// log (/data/logs/blockid-production.log). No I/O here; scripts/error-digest.mjs
// owns the byte offset, the state file and Telegram. Tested by
// scripts/error-digest.test.mjs with fixture lines.
//
// The log is unstructured console output from `next start`: no timestamps,
// no levels, `[tag] message` lines from our own modules, ` ⨯ ` lines from
// Next.js, bare `Error:` / `TypeError:` lines from uncaught throws, and
// multi-line object dumps whose continuation lines carry no tag.

export const WINDOW_MIN = 10;
export const CLASS_MEMORY_DAYS = 7;
export const ALERT_DEBOUNCE_MIN = 30;
export const SPIKE_FACTOR = 5;
export const SPIKE_MIN_LINES = 10;
export const MAX_CLASSES_PER_WINDOW = 50;

/** Rule (c): one line with any of these is an alert on its own. */
export const CRITICAL_PATTERNS = [/fully_degraded/i, /fullyDegraded/, /AIBudgetExhaustedError/, /permission denied/i];

/** A tagged line counts as an error class only when it smells like one. */
export const ERROR_HINT =
  /\b(error|errors|err|fail|failed|failure|failing|reject|rejected|refused|timeout|timed out|degraded|exhausted|denied|unavailable|invalid|cooldown|exception|unhandled|uncaught|fatal|crash|crashed|missing|cannot|could not|not found|E[A-Z]{4,}|5\d\d)\b/i;

const TAGGED = /^\s*(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+)?\[([^\]\s]{1,60})\]\s*(.*)$/;
const NEXT_ERR = /^\s*[⨯✗×]\s+(.*)$/;
const UNCAUGHT = /^\s*((?:[A-Z][A-Za-z]*)?(?:Error|Exception)|Unhandled(?:PromiseRejection)?|node:internal[^\s]*)\b[:\s](.*)$/;

/**
 * Strip the variable parts of a message so two occurrences of the same
 * failure land in one class: quoted strings, emails, uuids, hex ≥ 8, numbers.
 */
export function normaliseMessage(msg) {
  return String(msg ?? "")
    .replace(/"(?:[^"\\]|\\.)*"/g, "<str>")
    .replace(/'(?:[^'\\]|\\.)*'/g, "<str>")
    .replace(/`[^`]*`/g, "<str>")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, "<hex>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function isCritical(line) {
  return CRITICAL_PATTERNS.some((re) => re.test(line));
}

/**
 * One raw log line → { tag, msg, critical } or null when the line is not an
 * error-class candidate (info lines, object-dump continuations, stack frames).
 */
export function classifyLine(line) {
  if (typeof line !== "string" || !line.trim()) return null;
  const critical = isCritical(line);
  let tag = null;
  let rest = "";
  let m = TAGGED.exec(line);
  if (m) {
    tag = m[1].toLowerCase();
    rest = m[2];
  } else if ((m = NEXT_ERR.exec(line))) {
    tag = "next";
    rest = m[1];
  } else if ((m = UNCAUGHT.exec(line))) {
    tag = "uncaught";
    rest = `${m[1]}: ${m[2]}`.trim();
  }
  if (!tag) {
    if (!critical) return null;
    tag = "untagged";
    rest = line.trim();
  }
  if (!critical && !ERROR_HINT.test(rest)) return null;
  return { tag, msg: normaliseMessage(rest), critical };
}

export const classKey = (tag, msg) => `${tag}|${msg}`;

/**
 * Group a window of raw lines into classes.
 * → { total, lines, classes: [{ tag, msg, count, first_seen, critical, sample }] }
 */
export function digestLines(lines, nowIso = new Date().toISOString()) {
  const map = new Map();
  let total = 0;
  for (const line of lines) {
    const c = classifyLine(line);
    if (!c) continue;
    total += 1;
    const key = classKey(c.tag, c.msg);
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.critical = cur.critical || c.critical;
    } else {
      map.set(key, { tag: c.tag, msg: c.msg, count: 1, first_seen: nowIso, critical: c.critical, sample: line.trim().slice(0, 200) });
    }
  }
  const classes = [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { total, lines: lines.length, classes };
}

/**
 * Where to start reading given the tracked offset. Rotation (copy-truncate or
 * a fresh file) shows up as offset > size → restart at 0.
 */
export function computeReadStart(offset, size) {
  const o = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return o > size ? 0 : o;
}

/**
 * Split a chunk read from `start` into complete lines. A trailing partial line
 * (no newline yet) is left for the next run: the returned `nextOffset` stops
 * before it.
 */
export function splitComplete(chunk, start) {
  const text = chunk.toString("utf8");
  const lastNl = text.lastIndexOf("\n");
  if (lastNl < 0) return { lines: [], nextOffset: start };
  const complete = text.slice(0, lastNl);
  const consumed = Buffer.byteLength(complete, "utf8") + 1;
  return { lines: complete.split(/\r?\n/), nextOffset: start + consumed };
}

// ---------- 7-day class memory + alert rules ----------

export function emptyState() {
  return { version: 1, classes: {} };
}

const hourKey = (ms) => new Date(Math.floor(ms / 3_600_000) * 3_600_000).toISOString();

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Hourly median over the last 24 h (missing hours count as 0). */
export function hourlyMedian24h(entry, nowMs) {
  const buckets = new Map();
  for (let i = 1; i <= 24; i++) buckets.set(hourKey(nowMs - i * 3_600_000), 0);
  for (const [h, n] of Object.entries(entry?.hourly ?? {})) {
    if (buckets.has(h)) buckets.set(h, n);
  }
  return median([...buckets.values()]);
}

/**
 * Apply one window's digest to the 7-day memory and decide alerts.
 *
 *   new       class not seen in the last 7 days
 *   spike     count ≥ 5 × its 24 h hourly median AND ≥ 10 lines
 *   critical  any line matched CRITICAL_PATTERNS
 *
 * One alert per class per 30 min (debounce), whatever the rule. Returns the
 * next state (input is not mutated) and the alert rows. `opts.suppressNew`
 * (first run, no state file yet) seeds the memory without firing rule (a) for
 * every class already in the log — critical lines still alert.
 */
export function evaluate(prevState, digest, nowMs = Date.now(), opts = {}) {
  const debounceMs = (opts.debounceMin ?? ALERT_DEBOUNCE_MIN) * 60_000;
  const memoryMs = (opts.memoryDays ?? CLASS_MEMORY_DAYS) * 86_400_000;
  const nowIso = new Date(nowMs).toISOString();
  const hk = hourKey(nowMs);
  const prev = prevState?.classes && typeof prevState.classes === "object" ? prevState.classes : {};
  const next = { version: 1, classes: {} };
  const alerts = [];

  // Carry forward everything still inside the memory window.
  for (const [key, e] of Object.entries(prev)) {
    const lastSeen = Date.parse(e?.last_seen ?? "");
    if (!Number.isFinite(lastSeen) || nowMs - lastSeen > memoryMs) continue;
    const hourly = {};
    for (const [h, n] of Object.entries(e.hourly ?? {})) {
      const t = Date.parse(h);
      if (Number.isFinite(t) && nowMs - t <= memoryMs) hourly[h] = n;
    }
    next.classes[key] = { ...e, hourly };
  }

  for (const c of digest.classes) {
    const key = classKey(c.tag, c.msg);
    const known = next.classes[key];
    const rules = [];
    if (!known && !opts.suppressNew) rules.push("new");
    else if (known && c.count >= SPIKE_MIN_LINES && c.count >= SPIKE_FACTOR * hourlyMedian24h(known, nowMs)) rules.push("spike");
    if (c.critical) rules.push("critical");

    const entry = known ?? { first_seen: nowIso, last_seen: nowIso, hourly: {}, last_alert_at: null };
    entry.last_seen = nowIso;
    entry.hourly = { ...entry.hourly, [hk]: (entry.hourly[hk] ?? 0) + c.count };

    if (rules.length > 0) {
      const lastAlert = Date.parse(entry.last_alert_at ?? "");
      const debounced = Number.isFinite(lastAlert) && nowMs - lastAlert < debounceMs;
      if (!debounced) {
        alerts.push({ key, rule: rules[0], rules, tag: c.tag, msg: c.msg, count: c.count, sample: c.sample });
        entry.last_alert_at = nowIso;
      }
    }
    next.classes[key] = entry;
  }
  return { state: next, alerts };
}

/** Telegram text — never includes the raw sample when it could carry a secret. */
export function formatAlert(alerts, digest, windowMin = WINDOW_MIN) {
  const head = `BlockID error digest — ${alerts.length} alert${alerts.length === 1 ? "" : "s"} (${digest.total} error lines / ${windowMin} min)`;
  const rows = alerts.slice(0, 8).map((a) => `• [${a.rules.join("+")}] [${a.tag}] ×${a.count} — ${a.msg.slice(0, 120)}`);
  const more = alerts.length > 8 ? `… +${alerts.length - 8} more` : null;
  return [head, ...rows, more].filter(Boolean).join("\n");
}

/** The JSONL row written per window (classes capped, samples dropped). */
export function toReportRow(digest, tsIso, windowMin = WINDOW_MIN) {
  return {
    ts: tsIso,
    window_min: windowMin,
    total: digest.total,
    classes: digest.classes.slice(0, MAX_CLASSES_PER_WINDOW).map(({ tag, msg, count, first_seen, critical }) => ({ tag, msg, count, first_seen, ...(critical ? { critical: true } : {}) })),
  };
}

// ---------- G24-B: report-quality watch (tbr_quality ≠ ok for > 24 h) ----------
//
// /api/status.tbr_quality.status is `ok` | `watch` (24 h grounded median below
// the KPI or too many degraded chapters) | `missing` (no run in 24 h). A
// transient `watch` is normal after a provider outage; the same verdict held
// for more than a day is a report-quality incident nobody would otherwise see
// (the status page is not watched). The digest raises ONE line for it, once
// per day while it persists, through the same Telegram → e-mail fallback path
// as every other alert. The state lives next to the class memory in
// error-digest-state.json; an unreadable status (app down) changes nothing.

export const TBR_QUALITY_NOT_OK_HOURS = 24;
export const TBR_QUALITY_ALERT_DEBOUNCE_HOURS = 24;
// G33-T01: `down` (most runs produced no report) is an outage, not a quality
// drift — it alerts after one hour and repeats at most every six.
export const TBR_QUALITY_DOWN_HOURS = 1;
export const TBR_QUALITY_DOWN_DEBOUNCE_HOURS = 6;

export function emptyTbrQualityState() {
  return { status: null, not_ok_since: null, last_alert_at: null };
}

/** The bit of /api/status the rule needs, or null when the body is not a status document. */
export function pickTbrQuality(statusBody) {
  const q = statusBody && typeof statusBody === "object" ? statusBody.tbr_quality : null;
  if (!q || typeof q !== "object" || typeof q.status !== "string") return null;
  const w = q.last24h && typeof q.last24h === "object" ? q.last24h : {};
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    status: q.status,
    runs: num(w.runs) ?? 0,
    grounded_share_median: num(w.groundedShareMedian),
    degraded_share: num(w.degradedShare),
    no_report_runs: num(w.noReportRuns),
    grounded_share_kpi: num(q.grounded_share_kpi),
  };
}

/**
 * Apply one verdict to the tbr_quality state and decide the alert.
 *   verdict null      → app unreachable / not a status body: state unchanged, no alert
 *   status "ok"       → episode over: cleared (the next episode alerts after its own 24 h)
 *   status ≠ "ok"     → not_ok_since starts at the first non-ok sighting; once it is
 *                       older than TBR_QUALITY_NOT_OK_HOURS one line fires, then at
 *                       most one per TBR_QUALITY_ALERT_DEBOUNCE_HOURS while it holds.
 * Pure: returns { next, alert } and never mutates `prev`.
 */
export function evaluateTbrQuality(prev, verdict, nowMs = Date.now(), opts = {}) {
  const isDown = verdict?.status === "down";
  const notOkMs = (opts.notOkHours ?? (isDown ? TBR_QUALITY_DOWN_HOURS : TBR_QUALITY_NOT_OK_HOURS)) * 3_600_000;
  const debounceMs = (opts.debounceHours ?? (isDown ? TBR_QUALITY_DOWN_DEBOUNCE_HOURS : TBR_QUALITY_ALERT_DEBOUNCE_HOURS)) * 3_600_000;
  const base = { ...emptyTbrQualityState(), ...(prev && typeof prev === "object" ? prev : {}) };
  if (!verdict) return { next: base, alert: null };
  const nowIso = new Date(nowMs).toISOString();
  if (verdict.status === "ok") return { next: { status: "ok", not_ok_since: null, last_alert_at: null }, alert: null };

  const sinceMs = Date.parse(base.not_ok_since ?? "");
  const since = Number.isFinite(sinceMs) && sinceMs <= nowMs ? sinceMs : nowMs;
  const next = { status: verdict.status, not_ok_since: new Date(since).toISOString(), last_alert_at: base.last_alert_at ?? null };
  if (nowMs - since <= notOkMs) return { next, alert: null };
  const lastAlert = Date.parse(base.last_alert_at ?? "");
  if (Number.isFinite(lastAlert) && nowMs - lastAlert < debounceMs) return { next, alert: null };
  next.last_alert_at = nowIso;
  return { next, alert: formatTbrQualityAlert(verdict, nowMs - since) };
}

/** One line — numbers only, no path / project / snapshot id. */
export function formatTbrQualityAlert(verdict, heldMs) {
  const hours = Math.floor(heldMs / 3_600_000);
  const parts = [];
  if (verdict.grounded_share_median !== null && verdict.grounded_share_median !== undefined) {
    parts.push(`grounded median ${verdict.grounded_share_median.toFixed(2)}${verdict.grounded_share_kpi != null ? ` vs KPI ${verdict.grounded_share_kpi.toFixed(2)}` : ""}`);
  }
  if (verdict.degraded_share !== null && verdict.degraded_share !== undefined) parts.push(`degraded ${verdict.degraded_share.toFixed(2)}`);
  if (typeof verdict.no_report_runs === "number" && verdict.no_report_runs > 0) parts.push(`no-report runs ${verdict.no_report_runs}`);
  parts.push(`runs ${verdict.runs ?? 0} (24 h)`);
  return `[tbr_quality] status=${verdict.status} for ${hours} h — ${parts.join(", ")} — see /api/status tbr_quality`;
}

// ---------- G29-A: fewer than 2 healthy AI providers for > 1 h → one digest line ----------
//
// /api/status.ai.healthy_providers counts the configured providers the
// dispatcher would dial right now (state `ok` — not cooling, not unfunded,
// not latched on a bad key). One healthy provider is a single point of
// failure for every report; zero means the free-report funnel is failing
// after 3 attempts (2026-09-21). A transient dip is normal during a storm;
// the same verdict held for more than AI_CAPACITY_LOW_HOURS is an incident
// nobody would otherwise see. The digest raises ONE line for it, then at most
// one per AI_CAPACITY_ALERT_DEBOUNCE_HOURS while it persists, and clears the
// episode as soon as ≥ AI_CAPACITY_MIN_HEALTHY providers are healthy again.
// An unreadable status (app down) changes nothing.

export const AI_CAPACITY_MIN_HEALTHY = 2;
export const AI_CAPACITY_LOW_HOURS = 1;
export const AI_CAPACITY_ALERT_DEBOUNCE_HOURS = 24;

export function emptyAiCapacityState() {
  return { healthy: null, low_since: null, last_alert_at: null };
}

/** `{ healthy, unfunded }` from a status body, or null when the body carries no `ai` block. */
export function pickAiCapacity(statusBody) {
  const ai = statusBody && typeof statusBody === "object" ? statusBody.ai : null;
  if (!ai || typeof ai !== "object") return null;
  let healthy = typeof ai.healthy_providers === "number" && Number.isFinite(ai.healthy_providers) ? ai.healthy_providers : null;
  if (healthy === null && Array.isArray(ai.providers)) healthy = ai.providers.filter((p) => p && p.state === "ok").length;
  if (healthy === null) return null;
  const unfunded = Array.isArray(ai.unfunded) ? ai.unfunded.filter((x) => typeof x === "string").slice(0, 12) : [];
  return { healthy, unfunded };
}

/**
 * Apply one verdict to the ai_capacity state and decide the alert.
 *   verdict null              → app unreachable / no ai block: state unchanged, no alert
 *   healthy ≥ MIN_HEALTHY     → episode over: cleared (the next one alerts after its own hour)
 *   healthy < MIN_HEALTHY     → low_since starts at the first low sighting; once it is older
 *                               than AI_CAPACITY_LOW_HOURS one line fires, then at most one
 *                               per AI_CAPACITY_ALERT_DEBOUNCE_HOURS while it holds.
 * Pure: returns { next, alert } and never mutates `prev`.
 */
export function evaluateAiCapacity(prev, verdict, nowMs = Date.now(), opts = {}) {
  const lowMs = (opts.lowHours ?? AI_CAPACITY_LOW_HOURS) * 3_600_000;
  const debounceMs = (opts.debounceHours ?? AI_CAPACITY_ALERT_DEBOUNCE_HOURS) * 3_600_000;
  const minHealthy = opts.minHealthy ?? AI_CAPACITY_MIN_HEALTHY;
  const base = { ...emptyAiCapacityState(), ...(prev && typeof prev === "object" ? prev : {}) };
  if (!verdict) return { next: base, alert: null };
  const nowIso = new Date(nowMs).toISOString();
  if (verdict.healthy >= minHealthy) return { next: { healthy: verdict.healthy, low_since: null, last_alert_at: null }, alert: null };

  const sinceMs = Date.parse(base.low_since ?? "");
  const since = Number.isFinite(sinceMs) && sinceMs <= nowMs ? sinceMs : nowMs;
  const next = { healthy: verdict.healthy, low_since: new Date(since).toISOString(), last_alert_at: base.last_alert_at ?? null };
  if (nowMs - since <= lowMs) return { next, alert: null };
  const lastAlert = Date.parse(base.last_alert_at ?? "");
  if (Number.isFinite(lastAlert) && nowMs - lastAlert < debounceMs) return { next, alert: null };
  next.last_alert_at = nowIso;
  return { next, alert: formatAiCapacityAlert(verdict, nowMs - since) };
}

/** One line — counts + provider names only, never a key or a URL. */
export function formatAiCapacityAlert(verdict, heldMs) {
  const hours = Math.floor(heldMs / 3_600_000);
  const unfunded = verdict.unfunded && verdict.unfunded.length > 0 ? ` — unfunded: ${verdict.unfunded.join(", ")} (founder item #9)` : "";
  return `[ai_capacity] ${verdict.healthy} healthy AI provider${verdict.healthy === 1 ? "" : "s"} for ${hours} h (need ${AI_CAPACITY_MIN_HEALTHY})${unfunded} — see /api/status ai.dead_rungs`;
}
