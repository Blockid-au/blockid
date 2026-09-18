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

import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyLine,
  computeReadStart,
  digestLines,
  emptyState,
  evaluate,
  formatAlert,
  hourlyMedian24h,
  normaliseMessage,
  splitComplete,
  toReportRow,
} from "./lib/error-digest-core.mjs";
import { readWindow, parseArgs } from "./error-digest.mjs";

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
