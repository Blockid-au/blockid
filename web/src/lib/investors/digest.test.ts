// Colocated vitest for lib/investors/digest (S28-B) — the "Pipeline this
// week" block. Pins the period window on new contacts + stage moves, the
// overdue list (worst first, capped, archived / passed excluded), the
// signal rule and the header / move copy.

import { describe, expect, it } from "vitest";
import { buildDigestPipeline, describeMove, hasPipelineSignal, pipelineDigestHeader } from "./digest";
import type { ContactRow } from "./crm";

const START = new Date("2026-09-07T00:00:00Z");
const END = new Date("2026-09-14T00:00:00Z");

function row(over: Partial<ContactRow>): ContactRow {
  return {
    id: "c",
    project_id: "p",
    name: "Jane",
    email: null,
    org: null,
    role: null,
    type: "vc",
    stage: "meeting",
    source: null,
    tags: [],
    last_touch_at: null,
    next_step: null,
    next_step_due: null,
    owner_user_id: null,
    created_by: null,
    archived_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("buildDigestPipeline", () => {
  it("counts new contacts in the window, lists the week's moves with names, overdue worst-first", () => {
    const contacts = [
      row({ id: "a", name: "Jane", created_at: "2026-09-10T00:00:00.000Z", stage: "committed" }),
      row({ id: "b", name: "Sam", org: "Angel Co", next_step: "Send SAFE", next_step_due: "2026-09-10" }),
      row({ id: "c", name: "Old", next_step_due: "2026-08-01", stage: "passed" }),
      row({ id: "d", name: "Gone", created_at: "2026-09-12T00:00:00.000Z", archived_at: "2026-09-13T00:00:00Z" }),
      row({ id: "e", name: "Kim", next_step_due: "2026-09-01" }),
      row({ id: "f", name: "Future", next_step_due: "2026-09-20", created_at: "2026-09-06T23:59:59.000Z" }),
    ];
    const moves = [
      { contact_id: "a", occurred_at: "2026-09-11T00:00:00.000Z", meta: { from: "diligence", to: "committed", auto: "cheque signed" } },
      { contact_id: "b", occurred_at: "2026-09-12T00:00:00.000Z", meta: { from: "contacted", to: "meeting" } },
      { contact_id: "b", occurred_at: "2026-09-01T00:00:00.000Z", meta: { from: "researching", to: "contacted" } }, // before the window
      { contact_id: "zzz", occurred_at: "2026-09-12T00:00:00.000Z", meta: { to: "meeting" } }, // unknown contact
      { contact_id: "a", occurred_at: "2026-09-12T00:00:00.000Z", meta: { to: "nonsense" } }, // bad stage
    ];
    const p = buildDigestPipeline(contacts, moves, { periodStart: START, periodEnd: END, siteBase: "https://blockid.au/" });
    expect(p.total).toBe(5);
    expect(p.new_contacts).toBe(1);
    expect(p.stage_moves).toEqual([
      { name: "Jane", from: "diligence", to: "committed", auto: "cheque signed" },
      { name: "Sam", from: "contacted", to: "meeting", auto: null },
    ]);
    expect(p.overdue).toEqual([
      { name: "Kim", org: null, next_step: null, due: "2026-09-01", days: 13 },
      { name: "Sam", org: "Angel Co", next_step: "Send SAFE", due: "2026-09-10", days: 4 },
    ]);
    expect(p.committed).toBe(1);
    expect(p.href).toBe("https://blockid.au/workspace/investors");
  });

  it("caps the lists", () => {
    const contacts = Array.from({ length: 12 }, (_, i) => row({ id: `c${i}`, name: `P${i}`, next_step_due: "2026-09-01" }));
    const moves = contacts.map((c) => ({ contact_id: c.id, occurred_at: "2026-09-10T00:00:00.000Z", meta: { to: "meeting" } }));
    const p = buildDigestPipeline(contacts, moves, { periodStart: START, periodEnd: END, siteBase: "https://blockid.au" });
    expect(p.stage_moves.length).toBe(8);
    expect(p.overdue.length).toBe(5);
  });
});

describe("hasPipelineSignal / pipelineDigestHeader / describeMove", () => {
  it("signal only with something new, moved or overdue; header + move copy", () => {
    const quiet = buildDigestPipeline([row({ id: "a" })], [], { periodStart: START, periodEnd: END, siteBase: "x" });
    expect(hasPipelineSignal(undefined)).toBe(false);
    expect(hasPipelineSignal(quiet)).toBe(false);
    expect(pipelineDigestHeader(quiet)).toBe("1 investor in your pipeline — 0 new · 0 moved");
    const busy = { ...quiet, total: 3, new_contacts: 2, overdue: [{ name: "K", org: null, next_step: null, due: "2026-09-01", days: 3 }] };
    expect(hasPipelineSignal(busy)).toBe(true);
    expect(pipelineDigestHeader(busy)).toBe("3 investors in your pipeline — 2 new · 0 moved · 1 overdue");
    expect(describeMove({ name: "Jane", from: "diligence", to: "committed", auto: "cheque signed" })).toBe("Jane: Diligence → Committed (cheque signed)");
    expect(describeMove({ name: "Sam", from: null, to: "meeting", auto: null })).toBe("Sam → Meeting");
  });
});
