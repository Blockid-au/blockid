// G15-R1 — tests/live-qa/lib/run-state.ts: the global setup must refuse to
// start when run-state.json belongs to a run that is < 20 min old AND whose
// recorded runner pid is still alive (process.kill(pid, 0)). Pure helpers,
// fixtures only; the playwright config import is stubbed.
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@playwright/test", () => ({
  request: { newContext: vi.fn() },
  defineConfig: (c: unknown) => c,
}));

import { STALE_RUN_MS, isPidAlive, liveRunConflict, readRunStateIfPresent } from "./run-state";

const NOW = Date.parse("2026-09-18T05:00:00Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const alive = () => true;
const dead = () => false;

describe("liveRunConflict", () => {
  it("conflict: state 5 min old, pid alive, not us → message names account, age, pid and the --wait remedy", () => {
    const msg = liveRunConflict({ startedAt: iso(5), pid: 4242, email: "qa-live-20260918-0455@blockid.au" }, { nowMs: NOW, selfPid: 1, alive });
    expect(msg).toContain("qa-live-20260918-0455@blockid.au started 5 min ago");
    expect(msg).toContain("pid 4242 is alive");
    expect(msg).toContain("scripts/qa-live.sh --wait");
  });

  it("no conflict when the state is ≥ 20 min old, even with a live pid", () => {
    expect(liveRunConflict({ startedAt: iso(20), pid: 4242 }, { nowMs: NOW, selfPid: 1, alive })).toBeNull();
    expect(liveRunConflict({ startedAt: iso(19.9), pid: 4242 }, { nowMs: NOW, selfPid: 1, alive })).not.toBeNull();
    expect(STALE_RUN_MS).toBe(20 * 60 * 1000);
  });

  it("no conflict when the pid is dead, missing (pre-G15 state), or our own", () => {
    expect(liveRunConflict({ startedAt: iso(1), pid: 4242 }, { nowMs: NOW, selfPid: 1, alive: dead })).toBeNull();
    expect(liveRunConflict({ startedAt: iso(1), email: "x" }, { nowMs: NOW, selfPid: 1, alive })).toBeNull();
    expect(liveRunConflict({ startedAt: iso(1), pid: 1 }, { nowMs: NOW, selfPid: 1, alive })).toBeNull();
  });

  it("no conflict for a null state, an unparseable startedAt, or a startedAt far in the future (clock skew)", () => {
    expect(liveRunConflict(null, { nowMs: NOW, alive })).toBeNull();
    expect(liveRunConflict({ startedAt: "yesterday-ish", pid: 4242 }, { nowMs: NOW, selfPid: 1, alive })).toBeNull();
    expect(liveRunConflict({ startedAt: iso(-25), pid: 4242 }, { nowMs: NOW, selfPid: 1, alive })).toBeNull();
  });

  it("honours a custom staleMs", () => {
    expect(liveRunConflict({ startedAt: iso(3), pid: 4242 }, { nowMs: NOW, selfPid: 1, alive, staleMs: 2 * 60_000 })).toBeNull();
  });
});

describe("isPidAlive", () => {
  it("true when kill(pid, 0) succeeds or throws EPERM; false on ESRCH or a bad pid", () => {
    expect(isPidAlive(123, () => undefined)).toBe(true);
    expect(isPidAlive(123, () => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); })).toBe(true);
    expect(isPidAlive(123, () => { throw Object.assign(new Error("ESRCH"), { code: "ESRCH" }); })).toBe(false);
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-5)).toBe(false);
    expect(isPidAlive(1.5)).toBe(false);
  });

  it("the real probe sees the current process as alive", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });
});

describe("readRunStateIfPresent", () => {
  it("null when missing or unparseable; the parsed object otherwise", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-state-"));
    expect(readRunStateIfPresent(join(dir, "missing.json"))).toBeNull();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{nope");
    expect(readRunStateIfPresent(bad)).toBeNull();
    const notObj = join(dir, "arr.json");
    writeFileSync(notObj, "[1]");
    expect(readRunStateIfPresent(notObj)).toEqual([1]); // arrays are objects; liveRunConflict tolerates them (no startedAt)
    expect(liveRunConflict(readRunStateIfPresent(notObj), { nowMs: NOW, alive })).toBeNull();
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify({ startedAt: iso(1), pid: 99, email: "e" }));
    expect(readRunStateIfPresent(good)).toEqual({ startedAt: iso(1), pid: 99, email: "e" });
  });
});
