// Colocated spec for the investor CRM client (S28-B).
//
// Pins the pure helpers the board relies on — the kanban grouping, the
// move-button neighbours (passed sits off the ladder, invested is
// terminal), the due-date badge (overdue only when the date is past), the
// import summary line — and that the server pass is a polite loading
// state (no fetch fires under renderToStaticMarkup).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { groupByStage, importSummaryCopy, InvestorsClient, neighbourStages, nextStepDueLabel } from "./investors-client";
import type { ContactRow } from "@/lib/investors/crm";

const NOW = new Date("2026-09-13T10:00:00Z");

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

describe("groupByStage", () => {
  it("one column per stage, archived rows dropped", () => {
    const g = groupByStage([row({ id: "a", stage: "meeting" }), row({ id: "b", stage: "passed" }), row({ id: "c", stage: "meeting", archived_at: "x" })]);
    expect(Object.keys(g)).toEqual(["researching", "contacted", "meeting", "diligence", "committed", "passed", "invested"]);
    expect(g.meeting.map((c) => c.id)).toEqual(["a"]);
    expect(g.passed.map((c) => c.id)).toEqual(["b"]);
    expect(g.researching).toEqual([]);
  });
});

describe("neighbourStages", () => {
  it("walks the ladder; passed can only come back; invested has no next", () => {
    expect(neighbourStages("researching")).toEqual({ prev: null, next: "contacted" });
    expect(neighbourStages("diligence")).toEqual({ prev: "meeting", next: "committed" });
    expect(neighbourStages("invested")).toEqual({ prev: "committed", next: null });
    expect(neighbourStages("passed")).toEqual({ prev: "researching", next: null });
  });
});

describe("nextStepDueLabel", () => {
  it("today / overdue with the day count / upcoming with the date", () => {
    expect(nextStepDueLabel(null, NOW)).toBeNull();
    expect(nextStepDueLabel("2026-09-13", NOW)).toEqual({ text: "Due today", overdue: false });
    expect(nextStepDueLabel("2026-09-10", NOW)).toEqual({ text: "Overdue · 3 days", overdue: true });
    expect(nextStepDueLabel("2026-09-12", NOW)).toEqual({ text: "Overdue · 1 day", overdue: true });
    expect(nextStepDueLabel("2026-09-20", NOW)).toMatchObject({ overdue: false });
    expect(nextStepDueLabel("2026-09-20", NOW)?.text.startsWith("Due ")).toBe(true);
  });
});

describe("importSummaryCopy", () => {
  it("counts, skipped only when non-zero, the truncation hint", () => {
    expect(importSummaryCopy({ created: 3, updated: 1, skipped: 0, truncated: false })).toBe("3 added, 1 updated.");
    expect(importSummaryCopy({ created: 0, updated: 0, skipped: 2, truncated: true })).toBe(
      "0 added, 0 updated, 2 skipped — only the first 500 rows were read; split the file and import the rest.",
    );
  });
});

describe("InvestorsClient", () => {
  it("renders a polite loading state on the server pass", () => {
    const html = renderToStaticMarkup(<InvestorsClient />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading your investor pipeline");
  });
});
