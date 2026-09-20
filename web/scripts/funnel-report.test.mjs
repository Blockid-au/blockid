// G16-A — the funnel reducer (scripts/lib/funnel-core.mjs) and the daily
// report wrapper (scripts/funnel-report.mjs), pinned with fixture rows.
// Silent regressions this guards against:
//   - counting events instead of distinct actors (a reload = a report view);
//   - a QA row leaking into a count (qa: true must be dropped everywhere);
//   - the day bucket drifting off UTC or including today in "yesterday";
//   - a conversion becoming 0 instead of null when the denominator is 0;
//   - the daily file gaining duplicate lines for the same date on re-run;
//   - the REST reader forgetting the event-name filter or pagination.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERSIONS,
  FUNNEL_EVENT_NAMES,
  FUNNEL_STEPS,
  actorOf,
  dayOf,
  dayString,
  emptyCounts,
  formatWeeklySummary,
  isQaRow,
  lastSignups,
  reduceDaily,
  reduceFunnel,
  rowsInWindow,
} from "./lib/funnel-core.mjs";
import { buildReport, countByEvent, fetchFunnelRows, FI_EVENT_NAMES, parseArgs, readDaily, writeDaily, main } from "./funnel-report.mjs";

// "now" = 2026-09-19 04:00 UTC; yesterday = 2026-09-18.
const NOW = Date.UTC(2026, 8, 19, 4, 0, 0);
const Y = "2026-09-18";
const D2 = "2026-09-17";

let seq = 0;
function ev(event_name, over = {}) {
  seq += 1;
  return {
    event_id: `e${seq}`,
    event_name,
    user_id: null,
    session_id: null,
    params: {},
    ts: `${Y}T10:00:00.000Z`,
    source: "server",
    ...over,
  };
}

const FIXTURE = [
  // u1: full journey yesterday (reloaded the report 3×, client + server checkout twins)
  ev("sign_up", { user_id: "u1", params: { method: "google", segment: "founder", persona: "founder" }, ts: `${Y}T09:00:00.000Z` }),
  ev("svi_analyze", { user_id: "u1", params: { first: true, project_id: "p1" } }),
  ev("svi_score_computed", { user_id: "u1", params: { project_id: "p1", score: 61 } }),
  ev("report_view", { user_id: "u1", params: { tier: "free", project_id: "p1" } }),
  ev("report_view", { user_id: "u1", params: { tier: "free", project_id: "p1" } }),
  ev("report_view", { user_id: "u1", params: { tier: "free", project_id: "p1" } }),
  ev("paywall_view", { user_id: "u1", params: { surface: "tbr_unlock_rail", sku: "trust_report_5aud", amount_cents: 300 }, source: "client" }),
  ev("checkout", { user_id: "u1", params: { sku: "trust_report_5aud", amount_cents: 300 }, source: "client" }),
  ev("checkout", { user_id: "u1", params: { sku: "trust_report_5aud", amount_cents: 300 } }),
  ev("trust_report_purchased", { user_id: "u1", params: { sku: "trust_report_5aud", gross_aud_cents: 300 }, source: "webhook:stripe" }),
  // u2: signed up yesterday, analysed twice (first + repeat), hit two gates
  ev("sign_up", { user_id: "u2", params: { method: "email", segment: "unknown" }, ts: `${Y}T11:00:00.000Z` }),
  ev("svi_analyze", { user_id: "u2", params: { first: true, project_id: "p2" } }),
  ev("svi_analyze", { user_id: "u2", params: { first: false, project_id: "p2" } }),
  ev("feature_gate_hit", { user_id: "u2", params: { feature: "cap_table.write", source: "menu" } }),
  ev("feature_gate_hit", { user_id: "u2", params: { feature: "cap_table.write", source: "api" } }),
  ev("feature_gate_hit", { user_id: "u2", params: { feature: "investor.dealflow", source: "api" } }),
  // anonymous browser: one analysis + a public paywall view (same session)
  ev("svi_analyze", { session_id: "anon-1", params: { first: true, project_id: "a1" } }),
  ev("paywall_view", { session_id: "anon-1", params: { surface: "tbr_locked_chapter", sku: "trust_report_5aud", amount_cents: 300 }, source: "client" }),
  // QA account: every step, must vanish from every count
  ev("sign_up", { user_id: "qa1", params: { method: "email", segment: "founder", qa: true } }),
  ev("svi_analyze", { user_id: "qa1", params: { first: true, project_id: "pq", qa: true } }),
  ev("report_view", { user_id: "qa1", params: { tier: "free", project_id: "pq", qa: true } }),
  ev("trust_report_purchased", { user_id: "qa1", params: { sku: "trust_report_5aud", gross_aud_cents: 300, qa: true } }),
  ev("feature_gate_hit", { user_id: "qa1", params: { feature: "cap_table.write", qa: true } }),
  // the day before: two sign-ups, one analysis
  ev("sign_up", { user_id: "u3", params: { method: "magic_link", segment: "unknown" }, ts: `${D2}T08:00:00.000Z` }),
  ev("sign_up", { user_id: "u4", params: { method: "card", segment: "investor", persona: "accelerator" }, ts: `${D2}T09:00:00.000Z` }),
  ev("svi_analyze", { user_id: "u3", params: { first: true, project_id: "p3" }, ts: `${D2}T08:30:00.000Z` }),
  // today (must not appear in daily rows / yesterday)
  ev("sign_up", { user_id: "u5", params: { method: "email", segment: "unknown" }, ts: "2026-09-19T01:00:00.000Z" }),
  // noise the DB filter would not return, but the reducer must ignore anyway
  ev("showcase_report_downloaded", { user_id: "u1" }),
  // unparseable timestamp → dropped from day buckets
  ev("sign_up", { user_id: "u6", ts: "not-a-date" }),
];

describe("helpers", () => {
  it("isQaRow / actorOf / dayOf / dayString", () => {
    expect(isQaRow({ params: { qa: true } })).toBe(true);
    expect(isQaRow({ params: { qa: "true" } })).toBe(false);
    expect(isQaRow({ params: null })).toBe(false);
    expect(actorOf({ user_id: "u", session_id: "s", event_id: "e" })).toBe("u:u");
    expect(actorOf({ user_id: null, session_id: "s", event_id: "e" })).toBe("s:s");
    expect(actorOf({ user_id: null, session_id: null, event_id: "e" })).toBe("e:e");
    expect(dayOf("2026-09-18T23:59:59.000Z")).toBe("2026-09-18");
    expect(dayOf("2026-09-18T23:59:59+10:00")).toBe("2026-09-18");
    expect(dayOf("2026-09-19T05:00:00+10:00")).toBe("2026-09-18"); // 19:00 UTC the day before
    expect(dayOf("garbage")).toBeNull();
    expect(dayOf(null)).toBeNull();
    expect(dayString(NOW, 0)).toBe("2026-09-19");
    expect(dayString(NOW, 1)).toBe(Y);
    expect(dayString(NOW, 28)).toBe("2026-08-22");
  });

  it("step / conversion tables are in funnel order and the DB filter carries every step event", () => {
    expect(FUNNEL_STEPS.map((s) => s.key)).toEqual(["signups", "analyses", "report_views", "paywall_views", "checkouts", "paid"]);
    expect(CONVERSIONS.map((c) => c.key)).toEqual(["signup_to_analysis", "analysis_to_report", "report_to_paywall", "paywall_to_checkout", "checkout_to_paid"]);
    for (const s of FUNNEL_STEPS) expect(FUNNEL_EVENT_NAMES).toContain(s.event);
    expect(FUNNEL_EVENT_NAMES).toContain("feature_gate_hit");
    expect(emptyCounts().conv).toEqual({ signup_to_analysis: null, analysis_to_report: null, report_to_paywall: null, paywall_to_checkout: null, checkout_to_paid: null });
  });
});

describe("reduceFunnel", () => {
  it("counts distinct actors per step, drops QA rows, tallies gate hits per feature, same-window conversions", () => {
    const c = reduceFunnel(FIXTURE);
    expect(c.signups).toBe(6); // u1 u2 u3 u4 u5 u6 (qa1 dropped)
    expect(c.analyses).toBe(4); // u1 u2 anon-1 u3
    expect(c.first_analyses).toBe(4);
    expect(c.report_views).toBe(1); // u1 ×3 → 1
    expect(c.paywall_views).toBe(2); // u1 + anon-1
    expect(c.checkouts).toBe(1); // client + server twins → 1
    expect(c.paid).toBe(1);
    expect(c.gate_hits).toEqual({ "cap_table.write": 2, "investor.dealflow": 1 });
    expect(c.qa_excluded).toBe(5);
    expect(c.events).toBe(FIXTURE.length - 5 - 1); // minus QA rows, minus the showcase noise
    expect(c.conv).toEqual({
      signup_to_analysis: 0.6667,
      analysis_to_report: 0.25,
      report_to_paywall: 2,
      paywall_to_checkout: 0.5,
      checkout_to_paid: 1,
    });
  });

  it("empty input → zeros and null conversions; a feature-less gate hit lands in 'unknown'", () => {
    expect(reduceFunnel([])).toEqual(emptyCounts());
    expect(reduceFunnel(undefined)).toEqual(emptyCounts());
    expect(reduceFunnel([ev("feature_gate_hit", { params: {} })]).gate_hits).toEqual({ unknown: 1 });
  });
});

describe("reduceDaily / rowsInWindow", () => {
  it("one row per UTC day ending yesterday, oldest first, today excluded, unparseable ts dropped", () => {
    const rows = reduceDaily(FIXTURE, { days: 3, now: NOW });
    expect(rows.map((r) => r.date)).toEqual(["2026-09-16", D2, Y]);
    expect(rows[0]).toMatchObject({ signups: 0, analyses: 0, paid: 0 });
    expect(rows[1]).toMatchObject({ signups: 2, analyses: 1, first_analyses: 1, paid: 0, conv: { signup_to_analysis: 0.5 } });
    expect(rows[2]).toMatchObject({ signups: 2, analyses: 3, first_analyses: 3, report_views: 1, paywall_views: 2, checkouts: 1, paid: 1, qa_excluded: 5 });
    expect(rows[2].gate_hits).toEqual({ "cap_table.write": 2, "investor.dealflow": 1 });
    expect(reduceDaily(FIXTURE, { days: 1, now: NOW, includeToday: true })[0]).toMatchObject({ date: "2026-09-19", signups: 1 });
  });

  it("rowsInWindow selects full UTC days and shifts back for the previous period", () => {
    expect(rowsInWindow(FIXTURE, { days: 1, now: NOW }).every((r) => dayOf(r.ts) === Y)).toBe(true);
    expect(reduceFunnel(rowsInWindow(FIXTURE, { days: 1, now: NOW })).signups).toBe(2);
    expect(reduceFunnel(rowsInWindow(FIXTURE, { days: 1, now: NOW, shift: 1 })).signups).toBe(2); // D2
    expect(reduceFunnel(rowsInWindow(FIXTURE, { days: 7, now: NOW, shift: 7 })).signups).toBe(0);
    expect(reduceFunnel(rowsInWindow(FIXTURE, { days: 2, now: NOW })).signups).toBe(4);
  });
});

describe("lastSignups", () => {
  it("newest first, id prefix + persona/method, furthest step, no QA, no e-mails", () => {
    const list = lastSignups(FIXTURE, 20);
    // u6 has an unparseable ts → sorts last (NaN → 0)
    expect(list.map((s) => s.user_prefix)).toEqual(["u5", "u2", "u1", "u4", "u3", "u6"]);
    expect(list[2]).toEqual({ user_prefix: "u1", persona: "founder", method: "google", ts: `${Y}T09:00:00.000Z`, furthest_step: "trust_report_purchased" });
    expect(list[1]).toMatchObject({ user_prefix: "u2", persona: "unknown", method: "email", furthest_step: "svi_analyze" });
    expect(list[3]).toMatchObject({ user_prefix: "u4", persona: "accelerator", method: "card", furthest_step: "sign_up" });
    expect(list.some((s) => s.user_prefix.startsWith("qa"))).toBe(false);
    expect(JSON.stringify(list)).not.toMatch(/@/);
    expect(lastSignups(FIXTURE, 2)).toHaveLength(2);
  });
});

describe("formatWeeklySummary", () => {
  it("quotes 7 d with deltas, 28 d totals, conversions, gates and the first-dollar line", () => {
    const d7 = reduceFunnel(rowsInWindow(FIXTURE, { days: 7, now: NOW }));
    const prev7 = reduceFunnel([]);
    const d28 = reduceFunnel(rowsInWindow(FIXTURE, { days: 28, now: NOW }));
    const text = formatWeeklySummary({ d7, prev7, d28, generatedAt: new Date(NOW).toISOString() });
    expect(text).toContain("week to 2026-09-19");
    expect(text).toContain("sign-ups 4 (+4)");
    expect(text).toContain("PAID 1 (+1)");
    expect(text).toContain("signup→analysis 100%");
    expect(text).toContain("cap_table.write 2 · investor.dealflow 1");
    expect(text).toContain("First dollar: yes — 1 paid in 28 d.");
    const none = formatWeeklySummary({ d7: prev7, prev7, d28: prev7, generatedAt: new Date(NOW).toISOString() });
    expect(none).toContain("Still no first dollar.");
    expect(none).toContain("sign-ups 0 ·");
    expect(none).toContain("gates 28 d: none");
  });
});

describe("funnel-report.mjs wrapper", () => {
  it("parseArgs: defaults, clamps, weekly forces ≥ 28 days", () => {
    expect(parseArgs([])).toMatchObject({ dryRun: false, json: false, weekly: false, days: 28 });
    expect(parseArgs(["--env-dir", "/srv/x"]).envDir).toBe("/srv/x");
    expect(parseArgs(["--dry-run", "--days", "14", "--json"])).toMatchObject({ dryRun: true, json: true, weekly: false, days: 14 });
    expect(parseArgs(["--days", "0"]).days).toBe(28);
    expect(parseArgs(["--days", "9999"]).days).toBe(365);
    expect(parseArgs(["--weekly", "--days", "7"])).toMatchObject({ weekly: true, days: 28 });
  });

  it("fetchFunnelRows: event-name filter + ts bound + pagination until a short page", async () => {
    const urls = [];
    const pages = [Array.from({ length: 2 }, (_, i) => ev("sign_up", { user_id: `p${i}` })), [ev("checkout", { user_id: "p9" })]];
    const fetchImpl = async (url, init) => {
      urls.push({ url: String(url), headers: init.headers });
      return { ok: true, json: async () => pages.shift() ?? [] };
    };
    const rows = await fetchFunnelRows({ sinceIso: "2026-08-22T00:00:00.000Z", config: { url: "http://db", headers: { apikey: "k" } }, fetchImpl, pageSize: 2 });
    expect(rows).toHaveLength(3);
    expect(urls).toHaveLength(2);
    const u0 = new URL(urls[0].url);
    expect(u0.pathname).toBe("/rest/v1/analytics_events");
    expect(u0.searchParams.get("event_name")).toBe(`in.(${FUNNEL_EVENT_NAMES.join(",")})`);
    expect(u0.searchParams.get("ts")).toBe("gte.2026-08-22T00:00:00.000Z");
    expect(u0.searchParams.get("limit")).toBe("2");
    expect(new URL(urls[1].url).searchParams.get("offset")).toBe("2");
    expect(urls[0].headers.apikey).toBe("k");
    await expect(fetchFunnelRows({ sinceIso: "x", config: { url: "http://db", headers: {} }, fetchImpl: async () => ({ ok: false, status: 401 }) })).rejects.toThrow("HTTP 401");
  });

  it("readDaily / writeDaily: same date replaces, sorted, malformed lines dropped", () => {
    const dir = mkdtempSync(join(tmpdir(), "funnel-"));
    const file = join(dir, "funnel-daily.jsonl");
    writeFileSync(file, `${JSON.stringify({ date: Y, signups: 99 })}\nnot json\n${JSON.stringify({ date: "2026-09-01", signups: 1 })}\n`);
    const existing = readDaily(file);
    expect([...existing.keys()].sort()).toEqual(["2026-09-01", Y]);
    const total = writeDaily(existing, reduceDaily(FIXTURE, { days: 2, now: NOW }), file);
    expect(total).toBe(3);
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.date)).toEqual(["2026-09-01", D2, Y]);
    expect(lines[2].signups).toBe(2); // replaced, not duplicated
  });

  it("buildReport: daily rows + latest {yesterday, d7, prev7, d28, last_signups, window}", () => {
    const { daily, latest } = buildReport(FIXTURE, { days: 14, now: NOW, generatedAt: new Date(NOW).toISOString() });
    expect(daily).toHaveLength(14);
    expect(latest.yesterday.date).toBe(Y);
    expect(latest.window).toEqual({ from: "2026-09-05", to: Y });
    expect(latest.d7.signups).toBe(4);
    expect(latest.prev7.signups).toBe(0);
    expect(latest.d28.paid).toBe(1);
    expect(latest.last_signups[0].user_prefix).toBe("u5");
    expect(latest.schema_version).toBe(1);
  });

  it("G21: buildReport tallies the institutional events per name (QA excluded) and fetchFunnelRows accepts the FI name list", async () => {
    const fi = [
      ev("pilot_started", { user_id: "o1", params: { pilot_source: "paid" } }),
      ev("pilot_started", { user_id: "o2", params: { pilot_source: "paid", qa: true } }),
      ev("website_imported", { user_id: "u1" }),
      ev("website_imported", { user_id: "u2" }),
    ];
    const { latest } = buildReport(FIXTURE, { days: 14, now: NOW, generatedAt: new Date(NOW).toISOString(), fiRows: fi });
    expect(latest.fi_events_28d).toEqual({ pilot_started: 1, website_imported: 2 });
    expect(countByEvent([])).toEqual({});
    const urls = [];
    await fetchFunnelRows({ sinceIso: "x", config: { url: "http://db", headers: {} }, fetchImpl: async (u) => (urls.push(String(u)), { ok: true, json: async () => [] }), eventNames: FI_EVENT_NAMES });
    expect(new URL(urls[0]).searchParams.get("event_name")).toBe(`in.(${FI_EVENT_NAMES.join(",")})`);
  });

  it("main --dry-run reads, prints and neither writes nor sends; --weekly sends through the injected helper", async () => {
    const logs = [];
    const sent = [];
    const fetchImpl = async () => ({ ok: true, json: async () => FIXTURE });
    const config = { url: "http://db", headers: {} };
    const dry = await main(["--dry-run", "--days", "14", "--json"], { now: NOW, log: (m) => logs.push(m), fetchImpl, config, sendTelegram: async (t) => (sent.push(t), { sent: true }) });
    expect(dry.dry_run).toBe(true);
    expect(dry.wrote).toBeNull();
    expect(dry.telegram).toBeNull();
    expect(dry.totals).toEqual({ signups: 4, analyses: 4, first_analyses: 4, report_views: 1, paywall_views: 2, checkouts: 1, paid: 1 });
    expect(dry.qa_excluded).toBe(5);
    expect(JSON.parse(logs[0]).rows).toBe(FIXTURE.length);
    const weekly = await main(["--dry-run", "--weekly"], { now: NOW, log: (m) => logs.push(m), fetchImpl, config, sendTelegram: async (t, o) => (sent.push({ t, o }), { sent: false, reason: "dry_run" }) });
    expect(weekly.days).toBe(28);
    expect(sent).toHaveLength(1);
    expect(sent[0].o).toEqual({ dryRun: true });
    expect(sent[0].t).toContain("First dollar: yes");
    expect(logs.some((l) => l.includes("weekly summary (not sent)"))).toBe(true);
  });

  it("main without Supabase config throws (exit 1 path), never writes", async () => {
    await expect(main(["--dry-run"], { now: NOW, log: () => {}, config: null })).rejects.toThrow("SUPABASE_URL");
  });
});
