// G16-C — ledger read / write (atomic, temp root), journal replay, pure helpers.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JOURNAL_FILE,
  LEDGER_FILE,
  addDays,
  capReached,
  daysLeft,
  findActiveByEmail,
  maskEmail,
  mergeJournal,
  newPilotRow,
  planExpiry,
  readLedger,
  upsertPilot,
  writeLedger,
  type PilotRow,
} from "./ledger";
import { DEFAULT_PILOT_DAYS, PILOT_CAP, PILOT_TIER } from "./offer";

const NOW = new Date("2026-09-19T04:20:00.000Z");

function row(over: Partial<PilotRow> = {}): PilotRow {
  const base = newPilotRow(
    { user_id: "u-1", email: "Ops@Example.COM", program_name: "  Demo Accelerator ", previous_plan: "free", credits_granted: 180, intake_id: "i-1", intake_slug: "demo-abc12345" },
    NOW,
    over.id ?? "p-1",
  );
  return { ...base, ...over };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "pilots-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("pure helpers", () => {
  it("newPilotRow normalises e-mail + name, sets tier / 30-day expiry / active", () => {
    const r = row();
    expect(r.email).toBe("ops@example.com");
    expect(r.program_name).toBe("Demo Accelerator");
    expect(r.tier).toBe(PILOT_TIER);
    expect(r.status).toBe("active");
    expect(r.started_at).toBe(NOW.toISOString());
    expect(r.expires_at).toBe(addDays(NOW, DEFAULT_PILOT_DAYS));
    expect(r.ended_at).toBeNull();
    expect(r.ended_reason).toBeNull();
    expect(r.previous_plan).toBe("free");
  });

  it("maskEmail keeps one char + domain; daysLeft ceils; cap + active lookup", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
    expect(maskEmail("nope")).toBe("***");
    const r = row();
    expect(daysLeft(r, NOW)).toBe(30);
    expect(daysLeft(r, new Date(Date.parse(r.expires_at) - 1000))).toBe(1);
    expect(daysLeft(r, new Date(r.expires_at))).toBe(0);
    expect(findActiveByEmail([r], "OPS@example.com")?.id).toBe("p-1");
    expect(findActiveByEmail([{ ...r, status: "ended" }], "ops@example.com")).toBeNull();
    const five = Array.from({ length: PILOT_CAP }, (_, i) => row({ id: `p-${i}` }));
    expect(capReached(five)).toBe(true);
    expect(capReached(five.slice(1))).toBe(false);
    expect(capReached([...five.slice(1), row({ id: "x", status: "expired" })])).toBe(false);
  });

  it("planExpiry: reminder inside T-3 d once, expiry at/after expires_at, ended rows ignored", () => {
    const fresh = row({ id: "fresh" });
    const soon = row({ id: "soon", expires_at: addDays(NOW, 2) });
    const soonDone = row({ id: "soon-done", expires_at: addDays(NOW, 2), reminder_sent_at: NOW.toISOString() });
    const due = row({ id: "due", expires_at: NOW.toISOString() });
    const past = row({ id: "past", expires_at: addDays(NOW, -1) });
    const ended = row({ id: "ended", status: "ended", expires_at: addDays(NOW, -1) });
    const plan = planExpiry([fresh, soon, soonDone, due, past, ended], NOW);
    expect(plan.remind.map((r) => r.id)).toEqual(["soon"]);
    expect(plan.expire.map((r) => r.id)).toEqual(["due", "past"]);
  });
});

describe("file IO", () => {
  it("missing file → empty ledger; write is atomic (no .tmp left) and round-trips", async () => {
    expect(await readLedger(root)).toEqual({ version: 1, updated_at: null, pilots: [] });
    await writeLedger(root, { version: 1, updated_at: null, pilots: [row()] });
    const dir = path.join(root, "content");
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    const back = await readLedger(root);
    expect(back.pilots).toHaveLength(1);
    expect(back.updated_at).toBeTruthy();
    expect(readFileSync(path.join(root, LEDGER_FILE), "utf8").endsWith("\n")).toBe(true);
  });

  it("upsertPilot inserts then replaces by id, bumps updated_at and journals every op", async () => {
    const t1 = new Date("2026-09-19T05:00:00.000Z");
    const t2 = new Date("2026-09-19T06:00:00.000Z");
    await upsertPilot(root, row(), "start", t1);
    await upsertPilot(root, row({ id: "p-2", email: "b@x.io" }), "start", t1);
    const ended = await upsertPilot(root, row({ status: "ended", ended_reason: "ended_early" }), "end", t2);
    expect(ended.updated_at).toBe(t2.toISOString());
    const back = await readLedger(root);
    expect(back.pilots.map((p) => [p.id, p.status])).toEqual([["p-1", "ended"], ["p-2", "active"]]);
    const journal = readFileSync(path.join(root, JOURNAL_FILE), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { op: string; pilot: PilotRow });
    expect(journal.map((j) => j.op)).toEqual(["start", "start", "end"]);
  });

  it("corrupt ledger → empty (never throws); journal rows newer than the file are recovered", async () => {
    mkdirSync(path.join(root, "content", "reports"), { recursive: true });
    writeFileSync(path.join(root, LEDGER_FILE), "{ not json", "utf8");
    expect((await readLedger(root)).pilots).toEqual([]);

    // Simulate a `git reset --hard` that restored an older copy of the file
    // after the journal recorded the end.
    const started = row();
    const endedRow = { ...started, status: "ended" as const, ended_reason: "ended_early" as const, updated_at: "2026-09-20T00:00:00.000Z" };
    writeFileSync(path.join(root, LEDGER_FILE), JSON.stringify({ version: 1, updated_at: null, pilots: [started] }), "utf8");
    writeFileSync(path.join(root, JOURNAL_FILE), [JSON.stringify({ ts: "x", op: "start", pilot: started }), JSON.stringify({ ts: "y", op: "end", pilot: endedRow }), "{broken"].join("\n") + "\n", "utf8");
    const back = await readLedger(root);
    expect(back.pilots).toHaveLength(1);
    expect(back.pilots[0].status).toBe("ended");

    // Pure merge: older journal rows never win; unknown ids are added.
    const merged = mergeJournal({ version: 1, updated_at: null, pilots: [endedRow] }, [{ pilot: started }, { pilot: row({ id: "p-9" }) }]);
    expect(merged.recovered).toBe(1);
    expect(merged.ledger.pilots.map((p) => p.id).sort()).toEqual(["p-1", "p-9"]);
    expect(merged.ledger.pilots.find((p) => p.id === "p-1")?.status).toBe("ended");
    expect(existsSync(path.join(root, LEDGER_FILE))).toBe(true);
  });
});
