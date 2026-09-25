// G34-BT4 — queueing lifecycle rows: EM12 score_updated (insert, fold into
// the pending row, net-zero cancel, no-change skip), the de-duped insert the
// scan uses, and the pure score diff.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enqueueScoreUpdated, insertLifecycleDrips, normaliseRecipient } from "./enqueue";
import { dimensionChanges, mergeScoreUpdate } from "./score-diff";
import { createFakeDb } from "./testing/fake-db";

const NOW = new Date("2026-09-24T00:30:00Z");

describe("dimensionChanges (pure)", () => {
  const before = { subs: [{ key: "tre", label: "Traction", value: 40 }, { key: "ftv", label: "Team", value: 60 }, { key: "mpc", label: "Market", value: 50 }] };
  const after = { subs: [{ key: "tre", label: "Traction", value: 55 }, { key: "ftv", label: "Team", value: 60.2 }, { key: "mpc", label: "Market", value: 47 }, { key: "svm", value: 10 }] };

  it("lists only moved dimensions, biggest move first, with that dimension's evidence (newest first, ≤ 3)", () => {
    const out = dimensionChanges(before, after, [
      { dimension: "tre", label: "Old invoice", created_at: "2026-09-01" },
      { dimension: "tre", label: "Stripe MRR", created_at: "2026-09-20" },
      { dimension: "mpc", label: "  " },
      { dimension: "ftv", label: "LinkedIn" },
    ]);
    expect(out).toEqual([
      { key: "tre", label: "Traction", before: 40, after: 55, evidence: ["Stripe MRR", "Old invoice"] },
      { key: "mpc", label: "Market", before: 50, after: 47, evidence: [] },
    ]);
  });

  it("tolerates missing / malformed analyses", () => {
    expect(dimensionChanges(null, after)).toEqual([]);
    expect(dimensionChanges({ subs: "x" }, { subs: null })).toEqual([]);
  });

  it("mergeScoreUpdate keeps the first before and the latest after", () => {
    const first = { previous_svi: 100, new_svi: 104, source: "evidence" as const, scored_at: "a", changes: [{ key: "tre", label: "T", before: 40, after: 48, evidence: [] }] };
    const second = { previous_svi: 104, new_svi: 110, source: "evidence" as const, scored_at: "b", changes: [{ key: "tre", label: "T", before: 48, after: 55, evidence: ["x"] }, { key: "ftv", label: "F", before: 60, after: 62, evidence: [] }] };
    const m = mergeScoreUpdate(first, second);
    expect(m.previous_svi).toBe(100);
    expect(m.new_svi).toBe(110);
    expect(m.changes).toEqual([
      { key: "tre", label: "T", before: 40, after: 55, evidence: ["x"] },
      { key: "ftv", label: "F", before: 60, after: 62, evidence: [] },
    ]);
  });
});

describe("normaliseRecipient", () => {
  it("lower-cases, trims and refuses QA / erased / malformed addresses", () => {
    expect(normaliseRecipient("  Sam@Example.COM ")).toBe("sam@example.com");
    expect(normaliseRecipient("deleted+abc@erased.blockid.au")).toBeNull();
    expect(normaliseRecipient("nope")).toBeNull();
    expect(normaliseRecipient(null)).toBeNull();
  });
});

describe("enqueueScoreUpdated (EM12)", () => {
  const input = {
    email: "Sam@Example.com",
    userId: "u1",
    projectId: "p1",
    startup: "Acme",
    previousSvi: 100,
    newSvi: 104,
    changes: [{ key: "tre", label: "T", before: 40, after: 48, evidence: [] }],
    source: "evidence" as const,
    now: NOW,
    mode: "live" as const,
  };

  it("rollout switch: dry logs and writes nothing, off does nothing", async () => {
    const db = createFakeDb({ email_drips: [] });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await enqueueScoreUpdated(db, { ...input, mode: "dry" })).toBe("dry");
    expect(await enqueueScoreUpdated(db, { ...input, mode: "off" })).toBe("skipped");
    expect(db.inserts).toHaveLength(0);
    expect(info.mock.calls.join(" ")).not.toContain("sam@");
    info.mockRestore();
  });

  it("queues one T row due now", async () => {
    const db = createFakeDb({ email_drips: [] });
    expect(await enqueueScoreUpdated(db, input)).toBe("queued");
    expect(db.inserts).toHaveLength(1);
    const row = db.inserts[0].rows[0] as Record<string, unknown>;
    expect(row).toMatchObject({ email: "sam@example.com", user_id: "u1", campaign: "score_updated", scheduled_for: NOW.toISOString() });
    expect(row.payload).toMatchObject({ project_id: "p1", startup: "Acme", lifecycle: { score: { previous_svi: 100, new_svi: 104 } } });
  });

  it("folds a second re-score into the pending row instead of queueing another", async () => {
    const db = createFakeDb({ email_drips: [] });
    await enqueueScoreUpdated(db, input);
    const res = await enqueueScoreUpdated(db, { ...input, previousSvi: 104, newSvi: 111, changes: [{ key: "tre", label: "T", before: 48, after: 56, evidence: [] }] });
    expect(res).toBe("merged");
    expect(db.tables.email_drips).toHaveLength(1);
    const score = (db.tables.email_drips[0].payload as { lifecycle: { score: { previous_svi: number; new_svi: number; changes: Array<{ before: number; after: number }> } } }).lifecycle.score;
    expect(score.previous_svi).toBe(100);
    expect(score.new_svi).toBe(111);
    expect(score.changes[0]).toMatchObject({ before: 40, after: 56 });
  });

  it("a merge that nets to zero cancels the pending row", async () => {
    const db = createFakeDb({ email_drips: [] });
    await enqueueScoreUpdated(db, input);
    await enqueueScoreUpdated(db, { ...input, previousSvi: 104, newSvi: 100, changes: [{ key: "tre", label: "T", before: 48, after: 40, evidence: [] }] });
    expect(db.tables.email_drips[0].status).toBe("cancelled");
  });

  it("nothing moved → nothing queued; QA address or no db → skipped; a rejected insert is an error, not a throw", async () => {
    const db = createFakeDb({ email_drips: [] });
    expect(await enqueueScoreUpdated(db, { ...input, newSvi: 100, changes: [] })).toBe("unchanged");
    expect(await enqueueScoreUpdated(null, input)).toBe("skipped");
    expect(await enqueueScoreUpdated(db, { ...input, email: "qa-live-123@blockid.au" })).toBe("skipped");
    db.failing.add("email_drips");
    expect(await enqueueScoreUpdated(db, input)).toBe("error");
  });
});

describe("insertLifecycleDrips", () => {
  const row = (campaign: "evidence_gap_1" | "evidence_gap_2") => ({
    email: "a@b.co",
    user_id: "u1",
    campaign,
    scheduled_for: NOW.toISOString(),
    payload: { lifecycle: {} },
  });

  it("inserts the flow's rows once; a second run inside the window is a duplicate", async () => {
    const db = createFakeDb({ email_drips: [] });
    const withCreated = async () => {
      const r = await insertLifecycleDrips(db, [row("evidence_gap_1"), row("evidence_gap_2")], { dedupeDays: 60, now: NOW });
      for (const d of db.tables.email_drips) d.created_at ??= NOW.toISOString();
      return r;
    };
    expect(await withCreated()).toBe("queued");
    expect(db.tables.email_drips).toHaveLength(2);
    expect(await withCreated()).toBe("duplicate");
    expect(db.tables.email_drips).toHaveLength(2);
  });

  it("a cancelled earlier touch still blocks a repeat (stop after 2 holds)", async () => {
    const db = createFakeDb({ email_drips: [{ email: "a@b.co", campaign: "evidence_gap_1", status: "cancelled", created_at: "2026-09-01T00:00:00Z" }] });
    expect(await insertLifecycleDrips(db, [row("evidence_gap_1")], { dedupeDays: 60, now: NOW })).toBe("duplicate");
  });

  it("a dedupe key scopes the window (one digest per period)", async () => {
    const db = createFakeDb({
      email_drips: [{ email: "a@b.co", campaign: "evidence_gap_1", created_at: "2026-09-20T00:00:00Z", payload: { lifecycle: { k: "2026-08" } } }],
    });
    expect(await insertLifecycleDrips(db, [row("evidence_gap_1")], { dedupeDays: 40, now: NOW, dedupeKey: { path: "payload->lifecycle->>k", value: "2026-09" } })).toBe("queued");
    expect(await insertLifecycleDrips(db, [row("evidence_gap_1")], { dedupeDays: 40, now: NOW, dedupeKey: { path: "payload->lifecycle->>k", value: "2026-08" } })).toBe("duplicate");
  });
});
