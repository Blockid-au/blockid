// G15-R2 — latency-sample core: nginx access-log parser, route classes,
// percentiles, SLO targets and the "3 consecutive windows" breach rule. Pure
// (no I/O); scripts/latency-sample.mjs owns files + Telegram. Tested in
// scripts/latency-sample.test.mjs with fixture log lines.
//
// Two line shapes are accepted:
//   combined (today):  … "GET /x HTTP/1.1" 200 1234 "ref" "ua"
//   blockid_timing:    … "GET /x HTTP/1.1" 200 1234 "ref" "ua" 0.123 0.120
// The trailing pair is $request_time $upstream_response_time (see
// docs/ops/nginx/blockid-live.conf). Without it a window carries only n and
// err_rate_5xx — p50/p95 stay null until the log_format is switched.

export const WINDOW_MIN = 10;
export const MIN_SAMPLES = 20; // below this a window cannot breach
export const CONSECUTIVE_WINDOWS = 3;
export const REALERT_EVERY = 6; // windows (= 1 h) while still breached

/** SLO targets — keep in sync with docs/ops/slo.md. */
export const SLO = {
  marketing: { p95_ms: 800 },
  workspace: { p95_ms: 1500 },
  api_ai: { p95_ms: 60_000 },
  api_other: { p95_ms: 2000 },
  tbr: { p95_ms: 1500 },
  err_rate_5xx: 0.005,
};

export const CLASS_NAMES = ["marketing", "api_ai", "api_other", "tbr", "workspace"];

const AI_ROUTES = [/^\/api\/svi(\/|$|\?)/, /^\/api\/funding\/report(\/|$|\?)/, /^\/api\/analyses(\/|$|\?)/, /^\/api\/cfo-advisor(\/|$|\?)/];
const STATIC = /^\/(_next\/|favicon|robots\.txt|sitemap|manifest\.|apple-touch|icons?\/|images?\/|fonts?\/)|\.(js|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|txt|xml|json)(\?|$)/i;

/** Route → class name; null for static assets that must not skew a class. */
export function classifyPath(rawPath) {
  const p = (rawPath ?? "").split("?")[0] || "/";
  if (STATIC.test(p)) return null;
  if (AI_ROUTES.some((re) => re.test(p))) return "api_ai";
  if (p.startsWith("/api/")) return "api_other";
  if (p.startsWith("/tbr/") || p.startsWith("/s/")) return "tbr";
  if (p.startsWith("/workspace/") || p === "/workspace" || p.startsWith("/dashboard")) return "workspace";
  return "marketing";
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** nginx $time_local ("18/Sep/2026:05:23:55 +0000") → epoch ms, NaN if odd. */
export function parseTimeLocal(s) {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s ?? "");
  if (!m || !(m[2] in MONTHS)) return NaN;
  const utc = Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  const off = (Number(m[8]) * 60 + Number(m[9])) * 60_000 * (m[7] === "-" ? -1 : 1);
  return utc - off;
}

const LINE = /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) ([^" ]+)(?: HTTP\/[\d.]+)?" (\d{3}) (\d+|-) "(?:[^"\\]|\\.)*" "(?:[^"\\]|\\.)*"(?: ([\d.]+|-) ([\d.,: -]+?))?\s*$/;

/** One access-log line → { ts, method, path, status, class, ms } or null. */
export function parseLine(line) {
  const m = LINE.exec(line ?? "");
  if (!m) return null;
  const ts = parseTimeLocal(m[2]);
  if (!Number.isFinite(ts)) return null;
  const cls = classifyPath(m[4]);
  const rt = m[7] !== undefined && m[7] !== "-" ? Number(m[7]) : NaN;
  return { ts, method: m[3], path: m[4], status: Number(m[5]), class: cls, ms: Number.isFinite(rt) ? Math.round(rt * 1000) : null };
}

/** Nearest-rank percentile on an unsorted array (p in 0..100). */
export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

/**
 * Aggregate the lines that fall inside [nowMs - windowMin, nowMs].
 * → { ts, window_min, timing: boolean, classes: { name: { n, p50_ms, p95_ms, err_rate_5xx } } }
 */
export function sampleWindow(lines, nowMs = Date.now(), windowMin = WINDOW_MIN) {
  const from = nowMs - windowMin * 60_000;
  const buckets = Object.fromEntries(CLASS_NAMES.map((n) => [n, { n: 0, e5: 0, ms: [] }]));
  let timing = false;
  let parsed = 0;
  for (const raw of lines) {
    const r = parseLine(raw);
    if (!r || r.ts < from || r.ts > nowMs + 60_000 || !r.class) continue;
    parsed += 1;
    const b = buckets[r.class];
    b.n += 1;
    if (r.status >= 500) b.e5 += 1;
    if (r.ms !== null) {
      timing = true;
      b.ms.push(r.ms);
    }
  }
  const classes = {};
  for (const name of CLASS_NAMES) {
    const b = buckets[name];
    classes[name] = {
      n: b.n,
      p50_ms: b.ms.length ? percentile(b.ms, 50) : null,
      p95_ms: b.ms.length ? percentile(b.ms, 95) : null,
      err_rate_5xx: b.n ? Math.round((b.e5 / b.n) * 10_000) / 10_000 : null,
    };
  }
  return { ts: new Date(nowMs).toISOString(), window_min: windowMin, timing, requests: parsed, classes };
}

/** Which (class, metric) pairs are over target in this window. */
export function breaches(sample) {
  const out = [];
  for (const name of CLASS_NAMES) {
    const c = sample.classes[name];
    if (!c || c.n < MIN_SAMPLES) continue;
    const target = SLO[name]?.p95_ms;
    if (target && c.p95_ms !== null && c.p95_ms > target) out.push({ key: `${name}.p95`, class: name, metric: "p95_ms", value: c.p95_ms, target });
    if (c.err_rate_5xx !== null && c.err_rate_5xx > SLO.err_rate_5xx) out.push({ key: `${name}.5xx`, class: name, metric: "err_rate_5xx", value: c.err_rate_5xx, target: SLO.err_rate_5xx });
  }
  return out;
}

export function emptyState() {
  return { version: 1, streaks: {} };
}

/**
 * Update consecutive-breach streaks. Alerts fire on the 3rd consecutive
 * window over target, again every 6th window while it persists, and once
 * (`recovered`) when a streak ≥ 3 ends. Input state is not mutated.
 */
export function evaluate(prevState, sample) {
  const prev = prevState?.streaks && typeof prevState.streaks === "object" ? prevState.streaks : {};
  const now = breaches(sample);
  const nowKeys = new Set(now.map((b) => b.key));
  const streaks = {};
  const alerts = [];
  for (const b of now) {
    const n = (prev[b.key]?.count ?? 0) + 1;
    streaks[b.key] = { count: n, last: sample.ts, value: b.value, target: b.target };
    if (n === CONSECUTIVE_WINDOWS || (n > CONSECUTIVE_WINDOWS && (n - CONSECUTIVE_WINDOWS) % REALERT_EVERY === 0)) {
      alerts.push({ kind: "breach", ...b, windows: n });
    }
  }
  for (const [key, s] of Object.entries(prev)) {
    if (nowKeys.has(key)) continue;
    if ((s?.count ?? 0) >= CONSECUTIVE_WINDOWS) {
      const [cls, metric] = key.split(".");
      alerts.push({ kind: "recovered", key, class: cls, metric: metric === "p95" ? "p95_ms" : "err_rate_5xx", windows: s.count });
    }
    // streak ends → dropped from state
  }
  return { state: { version: 1, streaks }, alerts };
}

function fmtValue(metric, v) {
  return metric === "p95_ms" ? `${Math.round(v)} ms` : `${(v * 100).toFixed(2)} %`;
}

export function formatAlert(alerts, sample) {
  const rows = alerts.map((a) =>
    a.kind === "recovered"
      ? `• recovered: ${a.class} ${a.metric} back under target after ${a.windows} windows`
      : `• ${a.class} ${a.metric} ${fmtValue(a.metric, a.value)} > target ${fmtValue(a.metric, a.target)} for ${a.windows} consecutive ${WINDOW_MIN}-min windows`,
  );
  return [`BlockID latency SLO — ${alerts.length} change${alerts.length === 1 ? "" : "s"} (${sample.requests} requests / ${sample.window_min} min${sample.timing ? "" : ", no timing fields yet"})`, ...rows].join("\n");
}

/** JSONL row: {ts, window_min, classes:{name:{n,p50_ms,p95_ms,err_rate_5xx}}}. */
export function toReportRow(sample) {
  return { ts: sample.ts, window_min: sample.window_min, timing: sample.timing, classes: sample.classes };
}
