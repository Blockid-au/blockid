// G15-R2 — error-digest parser + alert rules (scripts/lib/error-digest-core.mjs)
// and the offset/window reader of scripts/error-digest.mjs, pinned with real
// production-log fixture lines. Silent regressions this guards against:
//   - a message normaliser that stops stripping ids so every request becomes
//     its own "new" class and Telegram floods;
//   - info lines ("[blockid:email] sent via SMTP") or object-dump
//     continuations counted as errors;
//   - losing the rotation reset (offset > size → 0) so a rotated log is never
//     read again;
//   - the 30-min debounce or the 7-day memory disappearing.

import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_CAPACITY_MIN_HEALTHY,
  classifyLine,
  computeReadStart,
  digestLines,
  emptyAiCapacityState,
  emptyState,
  emptyTbrQualityState,
  evaluate,
  evaluateAiCapacity,
  evaluateTbrQuality,
  formatAlert,
  formatTbrQualityAlert,
  hourlyMedian24h,
  normaliseMessage,
  pickAiCapacity,
  pickTbrQuality,
  splitComplete,
  toReportRow,
  TBR_QUALITY_NOT_OK_HOURS,
  warningKind,
} from "./lib/error-digest-core.mjs";
import { main, originLogFor, readAiCapacity, readOriginWindows, readStatusBody, readTbrQuality, readWindow, parseArgs, resolveLogSources } from "./error-digest.mjs";

const FIXTURE = [
  "▲ Next.js 16.3.5",
  "- Local:         http://localhost:4001",
  "✓ Ready in 0ms",
  "[rate-limit] Using Redis store: redis://127.0.0.1:6379",
  "[telegram] bot token invalid (401) — disabling sendTelegram for process lifetime",
  "[blockid:email] sent via SMTP {",
  "  to: 'admin@blockid.au',",
  "  messageId: '<7241c524-f2f9-f003-c0be-7bdf30aa07b6@blockid.au>'",
  "}",
  "[ai-client] Gateway unavailable (ECONNREFUSED), falling back to local for 5 min",
  "[ai-client] Gateway unavailable (ECONNREFUSED), falling back to local for 5 min",
  '[ai-client:anthropic] API key rejected (401 401 {"type":"error"}) — provider skipped for 1 h. key len=108 prefix=sk-…',
  "[report-pipeline] fully_degraded project_hash=3f9a8c2e1b llm_calls=0 reason=all_providers_cooldown",
  "[svi] createProject failed for user 2b1f9c7e-1111-2222-3333-444455556666: PGRST204 Could not find the 'github_url' column",
  "[svi] createProject failed for user 9d8c7b6a-aaaa-bbbb-cccc-ddddeeeeffff: PGRST204 Could not find the 'github_url' column",
  " ⨯ TypeError: Cannot read properties of undefined (reading 'id')",
  "Error: AIBudgetExhaustedError: budget 60000ms exhausted after 4 models",
  "    at callAI (/home/x/web/.next/server/chunks/123.js:1:2)",
  "[cron] EACCES: permission denied, open '/data/backups/db.dump'",
];

describe("normaliseMessage", () => {
  it("strips uuids, hex ids, numbers, emails and quoted strings", () => {
    const m = normaliseMessage("user 2b1f9c7e-1111-2222-3333-444455556666 sent 'x' to a@b.co tx 0xdeadbeef01 code 4711 sha 3f9a8c2e1b");
    expect(m).toBe("user <uuid> sent <str> to <email> tx <hex> code <n> sha <hex>");
  });
  it("collapses whitespace and caps length", () => {
    expect(normaliseMessage("a   b\t c")).toBe("a b c");
    expect(normaliseMessage("z".repeat(500))).toHaveLength(160);
  });
});

describe("classifyLine", () => {
  it("ignores info lines, banners and object-dump continuations", () => {
    expect(classifyLine("▲ Next.js 16.3.5")).toBeNull();
    expect(classifyLine("[rate-limit] Using Redis store: redis://127.0.0.1:6379")).toBeNull();
    expect(classifyLine("[blockid:email] sent via SMTP {")).toBeNull();
    expect(classifyLine("  to: 'admin@blockid.au',")).toBeNull();
    expect(classifyLine("    at callAI (/home/x/web/.next/server/chunks/123.js:1:2)")).toBeNull();
    expect(classifyLine("")).toBeNull();
  });
  it("tags [module] error lines and normalises the message", () => {
    const c = classifyLine("[ai-client] Gateway unavailable (ECONNREFUSED), falling back to local for 5 min");
    expect(c).toEqual({ tag: "ai-client", msg: "Gateway unavailable (ECONNREFUSED), falling back to local for <n> min", critical: false });
  });
  it("tags Next.js ⨯ lines and bare Error: lines", () => {
    expect(classifyLine(" ⨯ TypeError: Cannot read properties of undefined (reading 'id')")?.tag).toBe("next");
    const u = classifyLine("Error: AIBudgetExhaustedError: budget 60000ms exhausted after 4 models");
    expect(u?.tag).toBe("uncaught");
    expect(u?.critical).toBe(true);
  });
  it("flags the three critical patterns even without an error-word", () => {
    expect(classifyLine("[report-pipeline] fully_degraded project_hash=abc")?.critical).toBe(true);
    expect(classifyLine("[cron] EACCES: permission denied, open '/x'")?.critical).toBe(true);
    expect(classifyLine("something something AIBudgetExhaustedError")?.tag).toBe("untagged");
  });
});

describe("digestLines", () => {
  it("groups the fixture into classes with counts, keeping the two identical createProject lines together", () => {
    const d = digestLines(FIXTURE, "2026-09-18T05:00:00.000Z");
    expect(d.lines).toBe(FIXTURE.length);
    expect(d.total).toBe(10);
    const byKey = Object.fromEntries(d.classes.map((c) => [`${c.tag}|${c.msg}`, c]));
    expect(byKey["ai-client|Gateway unavailable (ECONNREFUSED), falling back to local for <n> min"].count).toBe(2);
    expect(byKey["svi|createProject failed for user <uuid>: PGRST<n> Could not find the <str> column"].count).toBe(2);
    expect(d.classes[0].count).toBe(2); // sorted by count desc
    expect(d.classes.every((c) => c.first_seen === "2026-09-18T05:00:00.000Z")).toBe(true);
  });
  it("toReportRow drops samples and caps classes", () => {
    const d = digestLines(FIXTURE, "t");
    const row = toReportRow(d, "2026-09-18T05:00:00.000Z");
    expect(row).toMatchObject({ ts: "2026-09-18T05:00:00.000Z", window_min: 10, total: 10 });
    expect(row.classes[0]).not.toHaveProperty("sample");
    expect(row.classes.find((c) => c.tag === "report-pipeline")?.critical).toBe(true);
  });
});

describe("stale Server Action noise → counted warning (L1-13)", () => {
  const NOISE = [
    'Error: The Server Reference ID did not match the expected format. Received "x".',
    "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action",
    "    at ignore-listed frames",
    'Error: The Server Reference ID did not match the expected format. Received "r2s".',
    "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action",
    "Error: Failed to find Server Action. This request might be from an older or newer deployment.",
    ' ⨯ Error: Failed to find Server Action "7f3a". This request might be from an older or newer deployment.',
  ];
  it("classifies both messages (any prefix) as the stale_server_action warning", () => {
    expect(warningKind(NOISE[0])).toBe("stale_server_action");
    expect(warningKind(NOISE[5])).toBe("stale_server_action");
    expect(warningKind(NOISE[6])).toBe("stale_server_action");
    expect(classifyLine(NOISE[0])).toMatchObject({ warning: "stale_server_action", critical: false });
    expect(warningKind("[svi] createProject failed")).toBeNull();
  });
  it("counts one warning per occurrence and no error class / total", () => {
    const d = digestLines(NOISE, "t");
    expect(d.total).toBe(0);
    expect(d.classes).toEqual([]);
    expect(d.warnings).toEqual({ stale_server_action: 4 });
  });
  it("real errors still stand out next to the noise", () => {
    const d = digestLines([...NOISE, ...FIXTURE], "t");
    expect(d.total).toBe(digestLines(FIXTURE, "t").total);
    expect(d.classes.some((c) => /Server Reference|Server Action/.test(c.msg))).toBe(false);
    const row = toReportRow(d, "2026-10-20T00:00:00.000Z");
    expect(row.warnings).toEqual({ stale_server_action: 4 });
  });
  it("never alerts on the warning, even as a brand-new spike", () => {
    const d = digestLines(Array.from({ length: 200 }, () => NOISE[0]), "t");
    const { alerts } = evaluate(emptyState(), d, Date.parse("2026-10-20T00:00:00Z"));
    expect(alerts).toEqual([]);
  });
  it("a critical pattern on the same line still wins", () => {
    expect(classifyLine("Error: Failed to find Server Action — permission denied")?.critical).toBe(true);
  });
  it("rows without warnings keep their old shape", () => {
    expect(toReportRow(digestLines(FIXTURE, "t"), "t")).not.toHaveProperty("warnings");
  });
});

describe("offset / rotation", () => {
  it("restarts at 0 when the tracked offset is beyond the file (rotation)", () => {
    expect(computeReadStart(5000, 100)).toBe(0);
    expect(computeReadStart(50, 100)).toBe(50);
    expect(computeReadStart(NaN, 100)).toBe(0);
    expect(computeReadStart(-3, 100)).toBe(0);
  });
  it("leaves a partial trailing line for the next run", () => {
    const { lines, nextOffset } = splitComplete(Buffer.from("[a] error one\n[b] error tw"), 10);
    expect(lines).toEqual(["[a] error one"]);
    expect(nextOffset).toBe(10 + "[a] error one\n".length);
  });
  it("readWindow reads only new bytes and handles truncation", () => {
    const dir = mkdtempSync(join(tmpdir(), "ed-"));
    const file = join(dir, "log");
    writeFileSync(file, "[x] error a\n[x] error b\n");
    const first = readWindow(file, 0);
    expect(first.lines).toEqual(["[x] error a", "[x] error b"]);
    appendFileSync(file, "[y] failed c\npartial");
    const second = readWindow(file, first.nextOffset);
    expect(second.lines).toEqual(["[y] failed c"]);
    writeFileSync(file, "[z] error after rotate\n"); // copy-truncate
    const third = readWindow(file, second.nextOffset);
    expect(third.start).toBe(0);
    expect(third.lines).toEqual(["[z] error after rotate"]);
    expect(readWindow(join(dir, "missing"), 0)).toMatchObject({ lines: [], missing: true });
  });
  it("parseArgs recognises --dry-run / --log / --json", () => {
    expect(parseArgs(["--dry-run", "--log", "/x", "--json"])).toMatchObject({ dryRun: true, log: "/x", json: true });
  });
});

describe("evaluate — alert rules", () => {
  const T0 = Date.parse("2026-09-18T05:00:00.000Z");
  const d = (n, extra = {}) => ({ total: n, lines: n, classes: [{ tag: "svi", msg: "boom <n>", count: n, first_seen: "x", critical: false, sample: "s", ...extra }] });

  it("(a) alerts on a class never seen in 7 days, then remembers it", () => {
    const r1 = evaluate(emptyState(), d(1), T0);
    expect(r1.alerts.map((a) => a.rules)).toEqual([["new"]]);
    expect(r1.state.classes["svi|boom <n>"].hourly).toEqual({ "2026-09-18T05:00:00.000Z": 1 });
    const r2 = evaluate(r1.state, d(1), T0 + 40 * 60_000);
    expect(r2.alerts).toEqual([]);
  });
  it("suppressNew seeds the memory silently on the first run but still fires critical", () => {
    const r = evaluate(emptyState(), { total: 2, lines: 2, classes: [d(1).classes[0], { ...d(1).classes[0], tag: "x", critical: true }] }, T0, { suppressNew: true });
    expect(r.alerts.map((a) => [a.tag, a.rules])).toEqual([["x", ["critical"]]]);
    expect(Object.keys(r.state.classes)).toHaveLength(2);
  });
  it("(b) alerts on ≥ 5× the 24 h hourly median AND ≥ 10 lines", () => {
    const seed = emptyState();
    const hourly = {};
    for (let i = 1; i <= 24; i++) hourly[new Date(T0 - i * 3_600_000).toISOString()] = 2;
    seed.classes["svi|boom <n>"] = { first_seen: "a", last_seen: new Date(T0 - 3_600_000).toISOString(), hourly, last_alert_at: null };
    expect(hourlyMedian24h(seed.classes["svi|boom <n>"], T0)).toBe(2);
    expect(evaluate(seed, d(9), T0).alerts).toEqual([]); // < 10 lines
    const spike = evaluate(seed, d(10), T0);
    expect(spike.alerts[0].rules).toEqual(["spike"]);
    expect(evaluate(seed, d(3), T0).alerts).toEqual([]); // 3 < 5×2
  });
  it("(c) alerts on critical lines every window subject to the 30-min debounce", () => {
    const r1 = evaluate(emptyState(), d(1, { critical: true }), T0);
    expect(r1.alerts[0].rules).toEqual(["new", "critical"]);
    const r2 = evaluate(r1.state, d(1, { critical: true }), T0 + 10 * 60_000);
    expect(r2.alerts).toEqual([]); // debounced
    const r3 = evaluate(r2.state, d(1, { critical: true }), T0 + 31 * 60_000);
    expect(r3.alerts[0].rules).toEqual(["critical"]);
  });
  it("forgets classes not seen for 7 days so they alert as new again", () => {
    const r1 = evaluate(emptyState(), d(1), T0);
    const r2 = evaluate(r1.state, { total: 0, lines: 0, classes: [] }, T0 + 8 * 86_400_000);
    expect(r2.state.classes).toEqual({});
    expect(evaluate(r2.state, d(1), T0 + 8 * 86_400_000).alerts[0].rules).toEqual(["new"]);
  });
  it("does not mutate the previous state", () => {
    const prev = emptyState();
    evaluate(prev, d(1), T0);
    expect(prev).toEqual(emptyState());
  });
  it("formatAlert never includes the raw sample line", () => {
    const r = evaluate(emptyState(), d(1, { sample: "SECRET=abc" }), T0);
    const text = formatAlert(r.alerts, d(1));
    expect(text).toContain("[new] [svi] ×1 — boom <n>");
    expect(text).not.toContain("SECRET");
  });
});

// ---------- G24-B: tbr_quality ≠ ok for > 24 h → one digest line ----------

describe("tbr_quality watch (G24-B)", () => {
  const H = 3_600_000;
  const base = Date.parse("2026-09-21T00:00:00.000Z");
  const watch = { status: "watch", runs: 4, grounded_share_median: 0.41, degraded_share: 0.3, grounded_share_kpi: 0.85 };
  const ok = { status: "ok", runs: 3, grounded_share_median: 0.9, degraded_share: 0, grounded_share_kpi: 0.85 };

  it("pickTbrQuality reads the /api/status section and rejects non-status bodies", () => {
    expect(pickTbrQuality({ tbr_quality: { status: "watch", last24h: { runs: 4, groundedShareMedian: 0.41, degradedShare: 0.3 }, grounded_share_kpi: 0.85 } })).toEqual({ ...watch, no_report_runs: null });
    expect(pickTbrQuality({ tbr_quality: { status: "missing", last24h: { runs: 0, groundedShareMedian: null, degradedShare: null }, grounded_share_kpi: 0.85 } })).toEqual({ status: "missing", runs: 0, grounded_share_median: null, degraded_share: null, no_report_runs: null, grounded_share_kpi: 0.85 });
    expect(pickTbrQuality({})).toBeNull();
    expect(pickTbrQuality(null)).toBeNull();
    expect(pickTbrQuality({ tbr_quality: "watch" })).toBeNull();
  });

  it("no line while the verdict is younger than 24 h; ONE line once it is older; then at most one per day; ok clears the episode", () => {
    expect(TBR_QUALITY_NOT_OK_HOURS).toBe(24);
    const r1 = evaluateTbrQuality(emptyTbrQualityState(), watch, base);
    expect(r1.alert).toBeNull();
    expect(r1.next).toEqual({ status: "watch", not_ok_since: new Date(base).toISOString(), last_alert_at: null });
    const r2 = evaluateTbrQuality(r1.next, watch, base + 23 * H);
    expect(r2.alert).toBeNull();
    expect(r2.next.not_ok_since).toBe(r1.next.not_ok_since); // the episode start is kept
    const r3 = evaluateTbrQuality(r2.next, watch, base + 25 * H);
    expect(r3.alert).toBe("[tbr_quality] status=watch for 25 h — grounded median 0.41 vs KPI 0.85, degraded 0.30, runs 4 (24 h) — see /api/status tbr_quality");
    expect(r3.next.last_alert_at).toBe(new Date(base + 25 * H).toISOString());
    // Every 10-minute tick for the next day is silent.
    const r4 = evaluateTbrQuality(r3.next, watch, base + 25 * H + 10 * 60_000);
    expect(r4.alert).toBeNull();
    const r5 = evaluateTbrQuality(r4.next, watch, base + 48 * H);
    expect(r5.alert).toBeNull();
    const r6 = evaluateTbrQuality(r5.next, watch, base + 49 * H + 1);
    expect(r6.alert).toMatch(/^\[tbr_quality\] status=watch for 49 h/);
    // Recovery clears everything; a fresh episode restarts its own 24 h clock.
    const r7 = evaluateTbrQuality(r6.next, ok, base + 50 * H);
    expect(r7).toEqual({ next: { status: "ok", not_ok_since: null, last_alert_at: null }, alert: null });
    const r8 = evaluateTbrQuality(r7.next, { ...watch, status: "missing" }, base + 60 * H);
    expect(r8.alert).toBeNull();
    expect(r8.next.not_ok_since).toBe(new Date(base + 60 * H).toISOString());
    expect(evaluateTbrQuality(r8.next, { ...watch, status: "missing" }, base + 85 * H).alert).toMatch(/status=missing for 25 h/);
  });

  it("G33-T01: `down` (no-report outage) alerts after 1 h, then at most every 6 h", () => {
    const down = { status: "down", runs: 2, grounded_share_median: null, degraded_share: 1, no_report_runs: 2, grounded_share_kpi: 0.85 };
    expect(pickTbrQuality({ tbr_quality: { status: "down", last24h: { runs: 2, groundedShareMedian: null, degradedShare: 1, noReportRuns: 2 }, grounded_share_kpi: 0.85 } })).toEqual(down);
    const d1 = evaluateTbrQuality(emptyTbrQualityState(), down, base);
    expect(d1.alert).toBeNull();
    const d2 = evaluateTbrQuality(d1.next, down, base + H + 1);
    expect(d2.alert).toMatch(/^\[tbr_quality\] status=down for 1 h — degraded 1\.00, no-report runs 2, runs 2 \(24 h\)/);
    expect(evaluateTbrQuality(d2.next, down, base + 5 * H).alert).toBeNull();
    expect(evaluateTbrQuality(d2.next, down, base + 7 * H + 2).alert).toMatch(/status=down for 7 h/);
  });

  it("an unreadable status (app down) changes nothing and never alerts; prev is not mutated", () => {
    const prev = { status: "watch", not_ok_since: new Date(base).toISOString(), last_alert_at: null };
    const r = evaluateTbrQuality(prev, null, base + 30 * H);
    expect(r).toEqual({ next: prev, alert: null });
    expect(prev.last_alert_at).toBeNull();
    expect(evaluateTbrQuality(undefined, null, base)).toEqual({ next: emptyTbrQualityState(), alert: null });
  });

  it("formatTbrQualityAlert carries numbers only (no path / project / snapshot) and tolerates a missing median", () => {
    expect(formatTbrQualityAlert({ status: "missing", runs: 0, grounded_share_median: null, degraded_share: null, grounded_share_kpi: 0.85 }, 26 * H)).toBe("[tbr_quality] status=missing for 26 h — runs 0 (24 h) — see /api/status tbr_quality");
    expect(formatTbrQualityAlert(watch, 25 * H)).not.toMatch(/\/home|[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("readTbrQuality: 200 → the picked section; non-200 / network error / timeout → null (never throws)", async () => {
    const okFetch = async () => ({ ok: true, json: async () => ({ tbr_quality: { status: "watch", last24h: { runs: 4, groundedShareMedian: 0.41, degradedShare: 0.3 }, grounded_share_kpi: 0.85 } }) });
    expect(await readTbrQuality({ env: { STATUS_BASE_URL: "http://127.0.0.1:1/" }, fetchImpl: okFetch })).toEqual({ ...watch, no_report_runs: null });
    expect(await readTbrQuality({ env: {}, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) })).toBeNull();
    expect(await readTbrQuality({ env: {}, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } })).toBeNull();
    let url = "";
    await readTbrQuality({ env: { STATUS_BASE_URL: "http://127.0.0.1:1" }, fetchImpl: async (u) => { url = u; throw new Error("x"); } });
    expect(url).toBe("http://127.0.0.1:1/api/status");
  });

  it("main(): the episode is persisted in the state file next to the class memory; > 24 h non-ok sends ONE message through the shared Telegram → e-mail path; app down is a no-op", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-tbr-"));
    const log = join(dir, "prod.log");
    const stateFile = join(dir, "state.json");
    const reportFile = join(dir, "digest.jsonl");
    writeFileSync(log, "");
    const sent = [];
    const sendTelegram = async (text, opts) => { sent.push({ text, opts }); return { sent: true, via: "email" }; };
    const readTbrQuality = async () => watch;
    const args = ["--json", "--log", log, "--offset-file", join(dir, "off")];
    const lockFile = join(dir, "lock");
    // Run 1: episode starts — persisted, no alert.
    const s1 = await main(args, { now: base, log: () => {}, sendTelegram, readTbrQuality, stateFile, reportFile, lockFile });
    expect(s1.tbr_quality).toEqual({ status: "watch", not_ok_since: new Date(base).toISOString(), alert: null, telegram: null });
    expect(JSON.parse(readFileSync(stateFile, "utf8")).tbr_quality).toEqual({ status: "watch", not_ok_since: new Date(base).toISOString(), last_alert_at: null });
    expect(sent).toHaveLength(0);
    // Run 2 (25 h later, still watch): one message, the class memory + the episode both survive.
    const s2 = await main(args, { now: base + 25 * H, log: () => {}, sendTelegram, readTbrQuality, stateFile, reportFile, lockFile });
    expect(s2.tbr_quality.alert).toMatch(/^\[tbr_quality\] status=watch for 25 h/);
    expect(s2.tbr_quality.telegram).toEqual({ sent: true, via: "email" });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(`BlockID report quality\n${s2.tbr_quality.alert}`);
    expect(sent[0].opts).toEqual({ dryRun: false });
    const persisted = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(persisted.classes).toEqual({});
    expect(persisted.tbr_quality.last_alert_at).toBe(new Date(base + 25 * H).toISOString());
    // Run 3 (10 min later): debounced — nothing sent.
    const s3 = await main(args, { now: base + 25 * H + 600_000, log: () => {}, sendTelegram, readTbrQuality, stateFile, reportFile, lockFile });
    expect(s3.tbr_quality.alert).toBeNull();
    expect(sent).toHaveLength(1);
    // Run 4: app unreachable → verdict null, episode untouched, nothing sent.
    const s4 = await main(args, { now: base + 26 * H, log: () => {}, sendTelegram, readTbrQuality: async () => null, stateFile, reportFile, lockFile });
    expect(s4.tbr_quality).toEqual({ status: null, not_ok_since: new Date(base).toISOString(), alert: null, telegram: null });
    expect(sent).toHaveLength(1);
    // Run 5: recovered → cleared.
    const s5 = await main(args, { now: base + 27 * H, log: () => {}, sendTelegram, readTbrQuality: async () => ok, stateFile, reportFile, lockFile });
    expect(s5.tbr_quality).toEqual({ status: "ok", not_ok_since: null, alert: null, telegram: null });
    // Dry run: evaluated + reported, nothing written, nothing sent for real.
    const s6 = await main(["--dry-run", ...args], { now: base, log: () => {}, sendTelegram, readTbrQuality, stateFile, reportFile, lockFile });
    expect(s6.tbr_quality.alert).toBeNull();
    expect(JSON.parse(readFileSync(stateFile, "utf8")).tbr_quality.status).toBe("ok");
  });
});

// ---------- G29-A: < 2 healthy AI providers for > 1 h → one digest line; clears at ≥ 2 ----------

describe("ai_capacity watch (G29-A)", () => {
  const H = 3_600_000;
  const base = Date.parse("2026-09-21T10:00:00Z");
  // /api/status.ai as published on 2026-09-21 after the dead-rung pass: only DeepInfra answering.
  const low = { healthy: 1, unfunded: ["cerebras", "sambanova"] };
  const none = { healthy: 0, unfunded: ["cerebras", "sambanova"] };
  const fine = { healthy: 3, unfunded: [] };

  it("pickAiCapacity reads healthy_providers + unfunded from the public body, counts ok rows for an older body, null without an ai block", () => {
    expect(pickAiCapacity({ ai: { healthy_providers: 1, unfunded: ["cerebras", "sambanova", 4], providers: [] } })).toEqual(low);
    expect(pickAiCapacity({ ai: { providers: [{ name: "deepinfra", state: "ok" }, { name: "groq", state: "cooldown" }, { name: "sambanova", state: "blocked" }] } })).toEqual({ healthy: 1, unfunded: [] });
    expect(pickAiCapacity({ ai: null })).toBeNull();
    expect(pickAiCapacity({ tbr_quality: { status: "ok" } })).toBeNull();
    expect(pickAiCapacity(null)).toBeNull();
  });

  it("evaluateAiCapacity: low starts an episode, alerts ONCE after 1 h, debounces 24 h, clears at ≥ 2, ignores an unreadable status", () => {
    expect(AI_CAPACITY_MIN_HEALTHY).toBe(2);
    const r1 = evaluateAiCapacity(emptyAiCapacityState(), low, base);
    expect(r1).toEqual({ next: { healthy: 1, low_since: new Date(base).toISOString(), last_alert_at: null }, alert: null });
    // 59 min: still inside the hold
    expect(evaluateAiCapacity(r1.next, low, base + 59 * 60_000).alert).toBeNull();
    // 61 min: one line
    const r3 = evaluateAiCapacity(r1.next, none, base + 61 * 60_000);
    expect(r3.alert).toBe("[ai_capacity] 0 healthy AI providers for 1 h (need 2) — unfunded: cerebras, sambanova (founder item #9) — see /api/status ai.dead_rungs");
    expect(r3.next.last_alert_at).toBe(new Date(base + 61 * 60_000).toISOString());
    // 10 min later, 12 h later: debounced
    expect(evaluateAiCapacity(r3.next, low, base + 71 * 60_000).alert).toBeNull();
    expect(evaluateAiCapacity(r3.next, low, base + 13 * H).alert).toBeNull();
    // 25 h after the first line: one more while it holds
    const r6 = evaluateAiCapacity(r3.next, low, base + 26 * H + 60_000);
    expect(r6.alert).toMatch(/^\[ai_capacity\] 1 healthy AI provider for 26 h \(need 2\)/);
    // app down: unchanged
    expect(evaluateAiCapacity(r6.next, null, base + 27 * H)).toEqual({ next: r6.next, alert: null });
    // recovered → cleared; the next episode needs its own hour
    const r8 = evaluateAiCapacity(r6.next, fine, base + 28 * H);
    expect(r8).toEqual({ next: { healthy: 3, low_since: null, last_alert_at: null }, alert: null });
    expect(evaluateAiCapacity(r8.next, low, base + 29 * H).alert).toBeNull();
    expect(evaluateAiCapacity(undefined, null, base)).toEqual({ next: emptyAiCapacityState(), alert: null });
    // exactly 2 healthy is fine
    expect(evaluateAiCapacity(r1.next, { healthy: 2, unfunded: [] }, base + 2 * H).next.low_since).toBeNull();
  });

  it("readAiCapacity / readStatusBody: 200 → the picked block; non-200 / network error → null (never throws)", async () => {
    const okFetch = async () => ({ ok: true, json: async () => ({ ai: { healthy_providers: 1, unfunded: ["sambanova"] } }) });
    expect(await readAiCapacity({ env: { STATUS_BASE_URL: "http://127.0.0.1:1/" }, fetchImpl: okFetch })).toEqual({ healthy: 1, unfunded: ["sambanova"] });
    expect(await readAiCapacity({ env: {}, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) })).toBeNull();
    expect(await readAiCapacity({ env: {}, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } })).toBeNull();
    expect(await readStatusBody({ env: {}, fetchImpl: async () => { throw new Error("x"); } })).toBeNull();
  });

  it("main(): the episode is persisted next to tbr_quality; > 1 h low sends ONE message through the shared path; ≥ 2 clears it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-aicap-"));
    const log = join(dir, "prod.log");
    const stateFile = join(dir, "state.json");
    const reportFile = join(dir, "digest.jsonl");
    writeFileSync(log, "");
    const sent = [];
    const sendTelegram = async (text, opts) => { sent.push({ text, opts }); return { sent: true, via: "email" }; };
    const args = ["--json", "--log", log, "--offset-file", join(dir, "off")];
    const lockFile = join(dir, "lock");
    const s1 = await main(args, { now: base, log: () => {}, sendTelegram, readAiCapacity: async () => low, stateFile, reportFile, lockFile });
    expect(s1.ai_capacity).toEqual({ healthy: 1, unfunded: ["cerebras", "sambanova"], low_since: new Date(base).toISOString(), alert: null, telegram: null });
    expect(s1.tbr_quality.status).toBeNull(); // the other watch saw no status body (nothing fetched)
    expect(JSON.parse(readFileSync(stateFile, "utf8")).ai_capacity).toEqual({ healthy: 1, low_since: new Date(base).toISOString(), last_alert_at: null });
    expect(sent).toHaveLength(0);
    const s2 = await main(args, { now: base + 2 * H, log: () => {}, sendTelegram, readAiCapacity: async () => low, stateFile, reportFile, lockFile });
    expect(s2.ai_capacity.alert).toMatch(/^\[ai_capacity\] 1 healthy AI provider for 2 h \(need 2\) — unfunded: cerebras, sambanova/);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(`BlockID AI capacity\n${s2.ai_capacity.alert}`);
    const s3 = await main(args, { now: base + 2 * H + 600_000, log: () => {}, sendTelegram, readAiCapacity: async () => low, stateFile, reportFile, lockFile });
    expect(s3.ai_capacity.alert).toBeNull();
    expect(sent).toHaveLength(1);
    const s4 = await main(args, { now: base + 3 * H, log: () => {}, sendTelegram, readAiCapacity: async () => fine, stateFile, reportFile, lockFile });
    expect(s4.ai_capacity).toEqual({ healthy: 3, unfunded: [], low_since: null, alert: null, telegram: null });
    expect(sent).toHaveLength(1);
  });
});

// ---------- L1-2: read the live G30 origin service logs, not the dead legacy file ----------

describe("origin log resolution (L1-2)", () => {
  // Same naming as scripts/g30-supervised-launch.py:
  // g30-origin-<port>-<sha256(releasePath)[:10]>-<tag>.service.log
  const unitLog = (dir, port, release, tag) =>
    join(dir, `g30-origin-${port}-${createHash("sha256").update(release).digest("hex").slice(0, 10)}-${tag}.service.log`);
  const entry = (port, releasePath) => ({ port, pid: 100 + port, startTicks: "1", releasePath, sha: "a".repeat(40), schemaDigest: "b".repeat(64) });
  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), "digest-origin-"));
    const runtime = join(dir, "runtime");
    mkdirSync(runtime);
    const active = entry(4100, "/data/releases/A");
    const prev = entry(4167, "/data/releases/B");
    const old = entry(4163, "/data/releases/C");
    const state = { version: 1, phase: "stable", active, previous: prev, retained: [old, prev, active], verifiedGood: [4100], quarantined: [] };
    const servingState = join(dir, "g30-serving-state.json");
    writeFileSync(servingState, JSON.stringify(state));
    const logs = {
      active: unitLog(runtime, 4100, "/data/releases/A", "aaaaaaaaaaaa"),
      previous: unitLog(runtime, 4167, "/data/releases/B", "bbbbbbbbbbbb"),
      old: unitLog(runtime, 4163, "/data/releases/C", "cccccccccccc"),
    };
    writeFileSync(logs.active, "▲ Next.js\n[svi] createProject failed: boom\n");
    writeFileSync(logs.previous, "[ai-client] Gateway unavailable (ECONNREFUSED)\n");
    writeFileSync(logs.old, "[cron] EACCES: permission denied, open '/x'\n".repeat(50));
    // A different release on the same port must never be picked up.
    writeFileSync(unitLog(runtime, 4100, "/data/releases/OTHER", "dddddddddddd"), "[x] error from another release\n");
    return { dir, runtime, servingState, logs };
  }

  it("originLogFor matches the unit log of that port+release and prefers the newest relaunch", () => {
    const { runtime, logs } = fixture();
    expect(originLogFor(entry(4100, "/data/releases/A"), runtime)).toBe(logs.active);
    const relaunch = unitLog(runtime, 4100, "/data/releases/A", "eeeeeeeeeeee");
    writeFileSync(relaunch, "");
    utimesSync(logs.active, new Date(1_000_000), new Date(1_000_000));
    expect(originLogFor(entry(4100, "/data/releases/A"), runtime)).toBe(relaunch);
    expect(originLogFor(entry(4001, "/data/releases/A"), runtime)).toBeNull(); // bootstrap origin: no unit
    expect(originLogFor(entry(4100, "/data/releases/A"), join(runtime, "absent"))).toBeNull();
    expect(originLogFor(null, runtime)).toBeNull();
  });

  it("the hash matches the Python launcher's unit naming for a real release path", () => {
    // Pinned from the live host: g30-origin-4100-7e12bd0c90-….service.log
    expect(createHash("sha256").update("/data/releases/w5RTJPLdSYJaT-qXHRzMe").digest("hex").slice(0, 10)).toBe("7e12bd0c90");
  });

  it("resolveLogSources: active + previous are read, other retained logs only tracked; legacy only without a state", () => {
    const { dir, runtime, servingState, logs } = fixture();
    const r = resolveLogSources({ servingState, runtimeDir: runtime, legacyLog: "/legacy.log" });
    expect(r.mode).toBe("origin");
    expect(r.read).toEqual([
      { role: "active", port: 4100, log: logs.active },
      { role: "previous", port: 4167, log: logs.previous },
    ]);
    expect(r.track).toEqual([logs.old]);
    expect(resolveLogSources({ servingState: join(dir, "missing.json"), runtimeDir: runtime, legacyLog: "/legacy.log" })).toEqual({
      mode: "legacy",
      log: "/legacy.log",
      reason: "no_serving_state",
    });
    writeFileSync(join(dir, "bad.json"), "{not json");
    expect(resolveLogSources({ servingState: join(dir, "bad.json"), runtimeDir: runtime, legacyLog: "/legacy.log" }).reason).toBe("state_unreadable");
  });

  it("readOriginWindows: first run seeds at EOF; then only appended bytes; a new origin from 0; truncation restarts at 0", () => {
    const { runtime, servingState, logs } = fixture();
    const r = resolveLogSources({ servingState, runtimeDir: runtime });
    const first = readOriginWindows(r, null);
    expect(first.lines).toEqual([]);
    expect(first.sources.every((s) => s.seeded)).toBe(true);
    expect(first.nextOffsets.logs[logs.old]).toBeGreaterThan(0); // tracked, fast-forwarded
    appendFileSync(logs.active, "[svi] createProject failed: again\npartial");
    appendFileSync(logs.previous, "[ai-client] still failing\n");
    appendFileSync(logs.old, "[cron] EACCES: permission denied, open '/y'\n");
    const second = readOriginWindows(r, first.nextOffsets);
    // the old retained origin is not counted; the partial line waits
    expect(second.lines).toEqual(["[svi] createProject failed: again", "[ai-client] still failing"]);
    expect(second.blind).toBe(false);
    // A newly promoted origin (unknown log, offsets file present) is read from byte 0.
    const fresh = unitLog(runtime, 4101, "/data/releases/D", "ffffffffffff");
    writeFileSync(fresh, "[report-pipeline] fully_degraded reason=x\n");
    const promoted = { mode: "origin", read: [{ role: "active", port: 4101, log: fresh }, { role: "previous", port: 4100, log: logs.active }], track: [] };
    const third = readOriginWindows(promoted, second.nextOffsets);
    expect(third.lines).toEqual(["[report-pipeline] fully_degraded reason=x"]);
    expect(Object.keys(third.nextOffsets.logs).sort()).toEqual([fresh, logs.active].sort()); // unresolved logs pruned
    writeFileSync(fresh, "[x] error after truncate\n");
    const fourth = readOriginWindows(promoted, { version: 1, logs: { ...third.nextOffsets.logs, [fresh]: 10_000 } });
    expect(fourth.lines).toContain("[x] error after truncate");
    expect(fourth.sources[0].truncated).toBe(true);
  });

  it("readOriginWindows is blind (never a fake zero) when no resolved origin log exists", () => {
    const blind = readOriginWindows({ mode: "origin", read: [{ role: "active", port: 4100, log: null }], track: [] }, null);
    expect(blind.blind).toBe(true);
    expect(blind.sources[0].missing).toBe(true);
  });

  it("main(): reads the origin logs via the serving state, persists per-log offsets, writes no row when blind", async () => {
    const { dir, runtime, servingState, logs } = fixture();
    const offsets = join(dir, "offsets.json");
    writeFileSync(offsets, JSON.stringify({ version: 1, logs: {} })); // not a first run → unseen logs read from 0
    const stateFile = join(dir, "state.json");
    const reportFile = join(dir, "digest.jsonl");
    const deps = {
      now: Date.parse("2026-10-20T13:00:00Z"),
      log: () => {},
      sendTelegram: async () => ({ sent: false, reason: "test" }),
      readStatusBody: async () => null,
      stateFile,
      reportFile,
      lockFile: join(dir, "lock"),
    };
    const args = ["--json", "--serving-state", servingState, "--runtime-dir", runtime, "--offsets-file", offsets];
    const s1 = await main(args, deps);
    expect(s1.source).toBe("origin");
    expect(s1.log).toBe(logs.active);
    expect(s1.total).toBe(2); // svi + ai-client; the old retained origin's 50 lines are not counted
    expect(JSON.parse(readFileSync(offsets, "utf8")).logs[logs.active]).toBe(readFileSync(logs.active).length);
    const rows1 = readFileSync(reportFile, "utf8").trim().split("\n");
    expect(rows1).toHaveLength(1);
    expect(JSON.parse(rows1[0])).toMatchObject({ window_min: 10, total: 2 }); // output contract unchanged
    // Second run: nothing new → a real zero row.
    const s2 = await main(args, { ...deps, now: deps.now + 600_000 });
    expect(s2.total).toBe(0);
    expect(readFileSync(reportFile, "utf8").trim().split("\n")).toHaveLength(2);
    // Blind: the active/previous logs vanish → no row appended.
    rmSync(logs.active);
    rmSync(logs.previous);
    const s3 = await main(args, { ...deps, now: deps.now + 1_200_000 });
    expect(s3.blind).toBe(true);
    expect(readFileSync(reportFile, "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("parseArgs: --log selects the explicit legacy mode; origin flags are parsed", () => {
    expect(parseArgs([]).explicitLog).toBe(false);
    expect(parseArgs(["--log", "/x"]).explicitLog).toBe(true);
    expect(parseArgs(["--serving-state", "/s", "--runtime-dir", "/r", "--offsets-file", "/o"])).toMatchObject({
      servingState: "/s",
      runtimeDir: "/r",
      offsetsFile: "/o",
    });
  });
});
