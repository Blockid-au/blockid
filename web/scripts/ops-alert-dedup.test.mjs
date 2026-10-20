// O1 / L1-12 — ops alert dedup per (kind, level, UTC day) + daily digest.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alertKind, alertLevel, buildDigests, decide, emptyDedupState, isOpsAlertText, KEEP_DAYS, readDedupState, utcDay, writeDedupState } from "./lib/ops-alert-dedup.mjs";

const T0 = Date.parse("2026-10-20T03:00:00Z");
const H = 3_600_000;

describe("alertKind", () => {
  it("folds numbers, ids, emoji, markdown and the [blockid ops] prefix into one kind", () => {
    const a = alertKind("[blockid ops] ⚠️ *Cron Failed*: `/api/cron/x` (502) 2026-10-20T03:00:00Z");
    const b = alertKind("⚠️ *Cron Failed*: `/api/cron/x` (504) 2026-10-20T03:10:00Z");
    expect(a).toBe(b);
    expect(a).toContain("cron failed");
  });
  it("keeps different crons apart", () => {
    expect(alertKind("Cron failed: /api/cron/a")).not.toBe(alertKind("Cron failed: /api/cron/b"));
  });
  it("only the first line counts and empty input still yields a key", () => {
    expect(alertKind("Title\nbody 1")).toBe(alertKind("Title\nbody 2"));
    expect(alertKind("")).toBe("alert");
  });
});

describe("alertLevel", () => {
  it("explicit level wins, then a [Pn] marker", () => {
    expect(alertLevel("site down", "", "P2")).toBe("P2");
    expect(alertLevel("[P1] something odd")).toBe("P1");
    expect(alertLevel("x", "detail [P0]")).toBe("P0");
  });
  it("infers P0 outages and P1 money / backup / security; the rest is P2", () => {
    expect(alertLevel("Uptime: blockid.au is DOWN")).toBe("P0");
    expect(alertLevel("DB backup failed")).toBe("P1");
    expect(alertLevel("Stripe webhook 500")).toBe("P1");
  });
  it("plain cron failure / error digest is P2", () => {
    expect(alertLevel("Cron failed: /api/cron/traffic-report", "timeout")).toBe("P2");
    expect(alertLevel("BlockID error digest — 2 alerts")).toBe("P2");
  });
});

describe("decide", () => {
  it("P2: first of the UTC day is sent, repeats are held", () => {
    let s = emptyDedupState();
    const r1 = decide(s, { subject: "Cron failed: /api/cron/x" }, T0);
    expect(r1).toMatchObject({ send: true, level: "P2", reason: "first_today" });
    s = r1.state;
    const r2 = decide(s, { subject: "Cron failed: /api/cron/x" }, T0 + H);
    expect(r2).toMatchObject({ send: false, reason: "repeat_digest" });
    const e = r2.state.days[utcDay(T0)][`P2|${r2.kind}`];
    expect(e).toMatchObject({ count: 2, sent: 1, suppressed: 1 });
  });
  it("P2: a new UTC day sends again", () => {
    const s = decide(emptyDedupState(), { subject: "Cron failed: /api/cron/x" }, T0).state;
    expect(decide(s, { subject: "Cron failed: /api/cron/x" }, T0 + 24 * H).send).toBe(true);
  });
  it("P0/P1 are never held", () => {
    let s = emptyDedupState();
    for (let i = 0; i < 5; i++) {
      const r = decide(s, { subject: "DB backup failed" }, T0 + i * 60_000);
      expect(r.send).toBe(true);
      expect(r.reason).toBe("p0p1");
      s = r.state;
    }
    expect(decide(s, { subject: "x", level: "P0" }, T0).send).toBe(true);
  });
  it("the same kind at a different level is a different key", () => {
    const s = decide(emptyDedupState(), { subject: "check", level: "P2" }, T0).state;
    expect(decide(s, { subject: "check", level: "P1" }, T0).send).toBe(true);
  });
  it("does not mutate its input and drops days older than KEEP_DAYS", () => {
    const old = { version: 1, days: { "2026-01-01": { "P2|x": { count: 1 } } }, digested: ["2026-01-01"] };
    const frozen = JSON.stringify(old);
    const r = decide(old, { subject: "y" }, T0);
    expect(JSON.stringify(old)).toBe(frozen);
    expect(r.state.days["2026-01-01"]).toBeUndefined();
    expect(r.state.digested).toEqual([]);
    expect(KEEP_DAYS).toBe(7);
  });
});

describe("buildDigests", () => {
  function heldDay() {
    let s = emptyDedupState();
    for (let i = 0; i < 4; i++) s = decide(s, { subject: "Cron failed: /api/cron/x" }, T0 + i * 600_000).state;
    for (let i = 0; i < 2; i++) s = decide(s, { subject: "Cron failed: /api/cron/y" }, T0 + i * 600_000).state;
    s = decide(s, { subject: "Cron failed: /api/cron/z" }, T0).state; // single — nothing held
    return s;
  }
  it("summarises finished days with held repeats, once", () => {
    const s = heldDay();
    const next = T0 + 22 * H; // 2026-10-21 01:00Z
    const d = buildDigests(s, next);
    expect(d.days).toHaveLength(1);
    expect(d.days[0].day).toBe("2026-10-20");
    expect(d.days[0].subject).toBe("Ops digest 2026-10-20: 4 repeated P2 alerts held (2 kinds)");
    expect(d.days[0].text).toContain("×4 (3 held)");
    expect(d.days[0].text).not.toContain("/api/cron/z");
    expect(buildDigests(d.state, next + H).days).toEqual([]); // idempotent
  });
  it("does not digest today unless forced", () => {
    const s = heldDay();
    expect(buildDigests(s, T0 + H).days).toEqual([]);
    const forced = buildDigests(s, T0 + H, { includeToday: true });
    expect(forced.days).toHaveLength(1);
    expect(forced.state.digested).not.toContain("2026-10-20"); // still digestible after midnight
  });
});

describe("isOpsAlertText", () => {
  it("ops alerts yes, business notifications no", () => {
    expect(isOpsAlertText("⚠️ *Cron Failed*: x")).toBe(true);
    expect(isOpsAlertText("BlockID error digest — 2 alerts")).toBe(true);
    expect(isOpsAlertText("🎯 New lead: Jane")).toBe(false);
    expect(isOpsAlertText("💰 New purchase: Scout A$79")).toBe(false);
    expect(isOpsAlertText("Equity request received\nfailed later in body")).toBe(false);
  });
});

describe("state file round-trip", () => {
  it("reads back what it wrote; unreadable ⇒ empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "ops-dedup-"));
    try {
      const f = join(dir, "sub", "s.json");
      expect(readDedupState(f)).toEqual(emptyDedupState());
      const s = decide(emptyDedupState(), { subject: "a" }, T0).state;
      writeDedupState(f, s);
      expect(readDedupState(f)).toEqual(s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
