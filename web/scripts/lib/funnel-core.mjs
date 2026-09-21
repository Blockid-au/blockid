// G16-A — the funnel reducer (docs/plans/first-dollar-2026-09-19.md § 3 A.2).
//
// ONE pure reducer over `analytics_events` rows, shared by:
//   * scripts/funnel-report.mjs           (daily cron → content/reports/funnel-daily.jsonl)
//   * src/lib/traction/snapshot.ts        (funnel_7d_v2 in traction-snapshot.json)
//   * src/lib/funnel/*  + /admin/funnel   (live "today so far")
//
// Rules:
//   * a step counts DISTINCT ACTORS (user_id, else session_id, else the
//     event_id) — a founder reloading the report ten times is one
//     report_view, the client + server `checkout` twins are one checkout;
//   * QA rows (`params.qa === true`) are dropped before anything is counted
//     and reported as `qa_excluded`;
//   * `gate_hits` are raw feature_gate_hit counts per feature (events, not
//     actors — the question is "which wall do founders hit");
//   * conversions are same-window ratios (not cohorts): null when the
//     denominator is 0, otherwise rounded to 4 dp;
//   * timestamps are bucketed by UTC day (the crons run in UTC).
//
// No dependencies, no I/O. Everything here is unit-pinned in
// scripts/funnel-report.test.mjs.

/** Event names the funnel reads, in step order (the DB filter uses this list). */
export const FUNNEL_EVENT_NAMES = Object.freeze([
  "sign_up",
  "svi_analyze",
  "svi_score_computed",
  "report_view",
  "paywall_view",
  "checkout",
  "trust_report_purchased",
  "feature_gate_hit",
  // G25-D review-before-pay: the review step rendered / the Pay button pressed.
  "checkout_review_viewed",
  "checkout_started",
]);

/** Ordered funnel steps → the event that marks them. */
export const FUNNEL_STEPS = Object.freeze([
  { key: "signups", event: "sign_up" },
  { key: "analyses", event: "svi_analyze" },
  { key: "report_views", event: "report_view" },
  { key: "paywall_views", event: "paywall_view" },
  { key: "checkouts", event: "checkout" },
  { key: "paid", event: "trust_report_purchased" },
  // G25-D: a second, parallel edge (plans / packs / SKUs) — review → pay click.
  { key: "review_views", event: "checkout_review_viewed" },
  { key: "pay_clicks", event: "checkout_started" },
]);

/** Conversion edges (numerator step / denominator step). */
export const CONVERSIONS = Object.freeze([
  { key: "signup_to_analysis", from: "signups", to: "analyses" },
  { key: "analysis_to_report", from: "analyses", to: "report_views" },
  { key: "report_to_paywall", from: "report_views", to: "paywall_views" },
  { key: "paywall_to_checkout", from: "paywall_views", to: "checkouts" },
  { key: "checkout_to_paid", from: "checkouts", to: "paid" },
  { key: "review_to_pay", from: "review_views", to: "pay_clicks" },
]);

/**
 * @typedef {object} EventRow
 * @property {string} [event_id]
 * @property {string | null} event_name
 * @property {string | null} [user_id]
 * @property {string | null} [session_id]
 * @property {Record<string, unknown> | null} [params]
 * @property {string | null} [ts]
 * @property {string | null} [source]
 */

/**
 * @typedef {object} FunnelCounts
 * @property {number} signups
 * @property {number} analyses
 * @property {number} first_analyses
 * @property {number} report_views
 * @property {number} paywall_views
 * @property {number} checkouts
 * @property {number} paid
 * @property {number} review_views
 * @property {number} pay_clicks
 * @property {Record<string, number>} gate_hits
 * @property {Record<string, number | null>} conv
 * @property {number} events
 * @property {number} qa_excluded
 */

/** `true` when the row was emitted for a qa-live-* account. */
export function isQaRow(row) {
  const p = row && row.params;
  return Boolean(p && typeof p === "object" && p.qa === true);
}

/** Who did it — user, else browser session, else the event itself. */
export function actorOf(row) {
  if (row.user_id) return `u:${row.user_id}`;
  if (row.session_id) return `s:${row.session_id}`;
  return `e:${row.event_id ?? Math.random().toString(36).slice(2)}`;
}

/** UTC calendar day of an ISO timestamp, or null when unparseable. */
export function dayOf(ts) {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` for `now` minus `daysAgo` (UTC). */
export function dayString(now, daysAgo = 0) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function ratio(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 10000) / 10000;
}

/** Empty counts block (every step 0, every conversion null). */
export function emptyCounts() {
  return {
    signups: 0,
    analyses: 0,
    first_analyses: 0,
    report_views: 0,
    paywall_views: 0,
    checkouts: 0,
    paid: 0,
    review_views: 0,
    pay_clicks: 0,
    gate_hits: {},
    conv: Object.fromEntries(CONVERSIONS.map((c) => [c.key, null])),
    events: 0,
    qa_excluded: 0,
  };
}

/**
 * Reduce rows (any window) to one counts block. Distinct actors per step;
 * QA rows dropped; unknown event names ignored.
 * @param {readonly EventRow[]} rows
 * @returns {FunnelCounts}
 */
export function reduceFunnel(rows) {
  const out = emptyCounts();
  /** @type {Map<string, Set<string>>} */
  const actors = new Map(FUNNEL_STEPS.map((s) => [s.key, new Set()]));
  const firstActors = new Set();
  const stepByEvent = new Map(FUNNEL_STEPS.map((s) => [s.event, s.key]));
  for (const row of rows ?? []) {
    if (!row || !row.event_name) continue;
    if (isQaRow(row)) {
      out.qa_excluded += 1;
      continue;
    }
    const name = row.event_name;
    if (!FUNNEL_EVENT_NAMES.includes(name)) continue;
    out.events += 1;
    if (name === "feature_gate_hit") {
      const feature = typeof row.params?.feature === "string" && row.params.feature.trim() ? row.params.feature.trim() : "unknown";
      out.gate_hits[feature] = (out.gate_hits[feature] ?? 0) + 1;
      continue;
    }
    const step = stepByEvent.get(name);
    if (!step) continue; // svi_score_computed: kept in the window for lastSignups, not a step
    const actor = actorOf(row);
    actors.get(step).add(actor);
    if (name === "svi_analyze" && row.params && row.params.first === true) firstActors.add(actor);
  }
  for (const s of FUNNEL_STEPS) out[s.key] = actors.get(s.key).size;
  out.first_analyses = firstActors.size;
  for (const c of CONVERSIONS) out.conv[c.key] = ratio(out[c.to], out[c.from]);
  // Deterministic key order for the report file.
  out.gate_hits = Object.fromEntries(Object.entries(out.gate_hits).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  return out;
}

/**
 * One `{date, …counts}` row per UTC day, oldest first, for the `days` days
 * ending at `now` (inclusive of today when `includeToday`).
 * @param {readonly EventRow[]} rows
 * @param {{ days: number; now?: number | Date; includeToday?: boolean }} opts
 */
export function reduceDaily(rows, { days, now = Date.now(), includeToday = false }) {
  const byDay = new Map();
  for (const row of rows ?? []) {
    const d = dayOf(row.ts);
    if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(row);
  }
  const out = [];
  const start = includeToday ? 0 : 1;
  for (let i = days - 1 + start; i >= start; i--) {
    const date = dayString(now, i);
    out.push({ date, ...reduceFunnel(byDay.get(date) ?? []) });
  }
  return out;
}

/**
 * Rows whose UTC day is within the last `days` full days (excluding today
 * unless `includeToday`); `shift` moves the whole window back that many days
 * (shift = 7 with days = 7 → "the 7 days before the last 7").
 */
export function rowsInWindow(rows, { days, now = Date.now(), includeToday = false, shift = 0 }) {
  const end = (includeToday ? 0 : 1) + shift;
  const first = dayString(now, days - 1 + end);
  const last = dayString(now, end);
  return (rows ?? []).filter((r) => {
    const d = dayOf(r.ts);
    return d !== null && d >= first && d <= last;
  });
}

/**
 * The last `n` sign-ups with their furthest funnel step — for /admin/funnel.
 * No e-mails: user id prefix (8 chars) + persona + method. QA rows excluded.
 * @param {readonly EventRow[]} rows
 */
export function lastSignups(rows, n = 20) {
  // The A$3 ladder only — the G25-D review / pay edge is a parallel path,
  // not a "further" step than paid.
  const steps = FUNNEL_STEPS.filter((s) => s.key !== "review_views" && s.key !== "pay_clicks").map((s) => s.event);
  const furthest = new Map();
  const signups = [];
  for (const row of rows ?? []) {
    if (!row || !row.event_name || isQaRow(row)) continue;
    const actor = actorOf(row);
    const idx = steps.indexOf(row.event_name);
    if (idx >= 0) {
      const cur = furthest.get(actor) ?? -1;
      if (idx > cur) furthest.set(actor, idx);
    }
    if (row.event_name === "sign_up") signups.push({ actor, row });
  }
  return signups
    .sort((a, b) => (Date.parse(b.row.ts ?? "") || 0) - (Date.parse(a.row.ts ?? "") || 0))
    .slice(0, n)
    .map(({ actor, row }) => ({
      user_prefix: row.user_id ? String(row.user_id).slice(0, 8) : "anon",
      persona: typeof row.params?.persona === "string" ? row.params.persona : typeof row.params?.segment === "string" ? row.params.segment : null,
      method: typeof row.params?.method === "string" ? row.params.method : null,
      ts: row.ts ?? null,
      furthest_step: steps[furthest.get(actor) ?? 0] ?? "sign_up",
    }));
}

function pct(v) {
  return v === null || v === undefined ? "—" : `${Math.round(v * 1000) / 10}%`;
}

/**
 * Monday Telegram / e-mail summary: last 7 days vs the 7 before, 28-day
 * totals, conversions and the top gate features.
 * @param {{ d7: FunnelCounts; prev7: FunnelCounts; d28: FunnelCounts; generatedAt: string; days?: number }} args
 */
export function formatWeeklySummary({ d7, prev7, d28, generatedAt }) {
  const delta = (k) => {
    const a = d7[k];
    const b = prev7[k];
    const diff = a - b;
    return `${a}${diff === 0 ? "" : ` (${diff > 0 ? "+" : ""}${diff})`}`;
  };
  const gates = Object.entries(d28.gate_hits)
    .slice(0, 4)
    .map(([f, n]) => `${f} ${n}`)
    .join(" · ");
  return [
    `BlockID funnel — week to ${generatedAt.slice(0, 10)} (vs previous 7 d)`,
    `sign-ups ${delta("signups")} · analyses ${delta("analyses")} (first ${d7.first_analyses}) · report views ${delta("report_views")}`,
    `paywall views ${delta("paywall_views")} · checkouts ${delta("checkouts")} · PAID ${delta("paid")}`,
    `conv 7d: signup→analysis ${pct(d7.conv.signup_to_analysis)} · analysis→report ${pct(d7.conv.analysis_to_report)} · report→paywall ${pct(d7.conv.report_to_paywall)} · paywall→checkout ${pct(d7.conv.paywall_to_checkout)} · checkout→paid ${pct(d7.conv.checkout_to_paid)}`,
    `28 d: ${d28.signups} sign-ups · ${d28.analyses} analyses · ${d28.report_views} report views · ${d28.paywall_views} paywall · ${d28.checkouts} checkouts · ${d28.paid} paid`,
    `gates 28 d: ${gates || "none"}`,
    d28.paid === 0 ? "Still no first dollar." : `First dollar: yes — ${d28.paid} paid in 28 d.`,
  ].join("\n");
}
