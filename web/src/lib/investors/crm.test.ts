// Colocated vitest for lib/investors/crm (S28-B) — the pure half of the
// investor CRM. Pins the contact / touchpoint validation, the CSV import
// (formula guard, aliases, in-file dedupe, row cap), the guarded export,
// the keyset cursor, the overdue rule and the pipeline roll-up.

import { describe, expect, it } from "vitest";
import {
  contactsToCsv,
  csvCell,
  cursorOrFilter,
  decodeCursor,
  encodeCursor,
  IMPORT_MAX_ROWS,
  isOverdue,
  isStageAdvance,
  mergeImportRow,
  normaliseEmail,
  parseContactInput,
  parseContactsCsv,
  parseCsv,
  parseListFilters,
  parseTouchpointInput,
  stripFormulaPrefix,
  summarisePipeline,
  type ContactRow,
} from "./crm";

const NOW = new Date("2026-09-13T10:00:00Z");
const UUID = "9f1c2e6a-1b2c-4d3e-8f90-123456789abc";

function row(over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: over.id ?? UUID,
    project_id: "proj-1",
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

describe("parseContactInput", () => {
  it("POST: name required, email lower-cased, defaults filled", () => {
    expect(parseContactInput(null)).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(parseContactInput({})).toEqual({ ok: false, error: "name is required" });
    const r = parseContactInput({ name: "  Jane   Chen ", email: "Jane@Blackbird.VC", tags: ["Lead", "lead", " Sydney "] });
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Jane Chen",
        email: "jane@blackbird.vc",
        org: null,
        role: null,
        type: "other",
        stage: "researching",
        source: null,
        tags: ["lead", "sydney"],
        nextStep: null,
        nextStepDue: null,
        ownerUserId: null,
      },
    });
  });

  it("rejects a bad email / type / stage / due date / owner id", () => {
    expect(parseContactInput({ name: "A", email: "nope" })).toMatchObject({ ok: false, error: expect.stringContaining("email") });
    expect(parseContactInput({ name: "A", type: "bank" })).toMatchObject({ ok: false, error: expect.stringContaining("type") });
    expect(parseContactInput({ name: "A", stage: "won" })).toMatchObject({ ok: false, error: expect.stringContaining("stage") });
    expect(parseContactInput({ name: "A", nextStepDue: "13/09/2026" })).toMatchObject({ ok: false, error: expect.stringContaining("nextStepDue") });
    expect(parseContactInput({ name: "A", nextStepDue: "2026-02-30" })).toMatchObject({ ok: false });
    expect(parseContactInput({ name: "A", ownerUserId: "me" })).toMatchObject({ ok: false, error: expect.stringContaining("ownerUserId") });
    expect(parseContactInput({ name: "A", nextStepDue: "2026-09-20", ownerUserId: UUID })).toMatchObject({
      ok: true,
      value: { nextStepDue: "2026-09-20", ownerUserId: UUID },
    });
  });

  it("PATCH: only the keys sent; empty patch refused; archived must be boolean", () => {
    expect(parseContactInput({}, { partial: true })).toEqual({ ok: false, error: "Nothing to update" });
    expect(parseContactInput({ stage: "diligence" }, { partial: true })).toEqual({ ok: true, value: { stage: "diligence" } });
    expect(parseContactInput({ archived: "yes" }, { partial: true })).toMatchObject({ ok: false });
    expect(parseContactInput({ archived: true, email: "" }, { partial: true })).toEqual({ ok: true, value: { archived: true, email: null } });
  });
});

describe("parseTouchpointInput", () => {
  it("accepts manual kinds only, needs a body, defaults occurredAt to now, refuses the future", () => {
    expect(parseTouchpointInput({ body: "Called re: SAFE terms" }, NOW)).toEqual({
      ok: true,
      value: { kind: "note", body: "Called re: SAFE terms", occurredAt: NOW.toISOString() },
    });
    expect(parseTouchpointInput({ kind: "call", body: "x", occurredAt: "2026-09-10T09:00:00Z" }, NOW)).toMatchObject({
      ok: true,
      value: { kind: "call", occurredAt: "2026-09-10T09:00:00.000Z" },
    });
    expect(parseTouchpointInput({ kind: "data_room_view", body: "x" }, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("kind") });
    expect(parseTouchpointInput({ kind: "note", body: "   " }, NOW)).toEqual({ ok: false, error: "body is required" });
    expect(parseTouchpointInput({ body: "x", occurredAt: "2027-01-01T00:00:00Z" }, NOW)).toMatchObject({ ok: false });
  });
});

describe("normaliseEmail / stripFormulaPrefix / csvCell", () => {
  it("normalises, guards on the way in and on the way out", () => {
    expect(normaliseEmail(" A@B.CO ")).toBe("a@b.co");
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail("a b@c.d")).toBe(false);
    expect(stripFormulaPrefix("=HYPERLINK(x)")).toBe("HYPERLINK(x)");
    expect(stripFormulaPrefix("+-@=cmd")).toBe("cmd");
    expect(stripFormulaPrefix("Blackbird")).toBe("Blackbird");
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(csvCell(["a", "b"])).toBe("a;b");
    expect(csvCell(null)).toBe("");
  });
});

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF and a BOM", () => {
    const t = '﻿name,email\r\n"Chen, Jane",jane@x.co\n"Say ""hi""",\n\n';
    expect(parseCsv(t)).toEqual([
      ["name", "email"],
      ["Chen, Jane", "jane@x.co"],
      ['Say "hi"', ""],
    ]);
  });
});

describe("parseContactsCsv", () => {
  it("maps aliases, guards formulas, dedupes by email inside the file, keeps name-only rows", () => {
    const csv = [
      "Full Name,Email Address,Firm,Investor Type,Status,Labels",
      "Jane Chen,Jane@Blackbird.VC,Blackbird,Venture Capital,Due Diligence,lead;sydney",
      "=cmd|' /C calc'!A0,sam@x.co,@Evil,angel,new,",
      "Dup,JANE@blackbird.vc,,,,",
      "No Email,,Family Trust,family office,term sheet,",
      ",missing@x.co,,,,",
      "Bad,not-an-email,,,,",
    ].join("\n");
    const r = parseContactsCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(false);
    expect(r.value.rows.map((x) => [x.line, x.name, x.email, x.org, x.type, x.stage, x.tags])).toEqual([
      [2, "Jane Chen", "jane@blackbird.vc", "Blackbird", "vc", "diligence", ["lead", "sydney"]],
      [3, "cmd|' /C calc'!A0", "sam@x.co", "Evil", "angel", "researching", []],
      [5, "No Email", null, "Family Trust", "family_office", "committed", []],
    ]);
    expect(r.value.rows[0].source).toBe("csv_import");
    expect(r.value.skipped).toEqual([
      { line: 4, reason: "duplicate email in file" },
      { line: 6, reason: "no name" },
      { line: 7, reason: "invalid email" },
    ]);
  });

  it("needs a name column and caps the row count", () => {
    expect(parseContactsCsv("")).toMatchObject({ ok: false, error: "The file is empty" });
    expect(parseContactsCsv("email\na@b.co")).toMatchObject({ ok: false, error: expect.stringContaining("'name' column") });
    const many = ["name,email", ...Array.from({ length: IMPORT_MAX_ROWS + 5 }, (_, i) => `P${i},p${i}@x.co`)].join("\n");
    const r = parseContactsCsv(many);
    expect(r.ok && r.value.rows.length).toBe(IMPORT_MAX_ROWS);
    expect(r.ok && r.value.truncated).toBe(true);
  });
});

describe("mergeImportRow", () => {
  it("file wins on name/org/type, stage only forwards, tags unioned, archived revived; no-op → updated_at only", () => {
    const existing = row({ name: "Jane", org: null, type: "other", stage: "diligence", tags: ["a"], archived_at: "2026-09-01T00:00:00Z" });
    const imp = { line: 2, name: "Jane Chen", email: "j@x.co", org: "Blackbird", role: null, type: "vc" as const, stage: "contacted" as const, source: "csv_import", tags: ["b", "a"], nextStep: null, nextStepDue: null, ownerUserId: null };
    expect(mergeImportRow(existing, imp, "NOW")).toEqual({ updated_at: "NOW", name: "Jane Chen", org: "Blackbird", type: "vc", tags: ["a", "b"], archived_at: null });
    expect(mergeImportRow(row({ stage: "meeting" }), { ...imp, stage: "committed", name: "Jane", org: null, type: "other", tags: [] }, "NOW")).toEqual({ updated_at: "NOW", stage: "committed" });
    expect(mergeImportRow(row(), { ...imp, name: "Jane", org: null, type: "other", stage: "meeting", tags: [] }, "NOW")).toEqual({ updated_at: "NOW" });
  });
});

describe("contactsToCsv", () => {
  it("emits the header plus guarded rows, tags joined by ;", () => {
    const csv = contactsToCsv([row({ name: "=Jane", email: "j@x.co", tags: ["a", "b"], next_step: "Send deck, then call" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,email,org,role,type,stage,source,tags,next_step,next_step_due,last_touch_at,created_at,archived_at");
    expect(lines[1].startsWith("'=Jane,j@x.co,,,vc,meeting,,a;b,\"Send deck, then call\",")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("list filters + cursor", () => {
  it("round-trips the cursor and builds the keyset filter", () => {
    const c = encodeCursor({ created_at: "2026-09-01T00:00:00.000Z", id: UUID });
    expect(decodeCursor(c)).toEqual({ createdAt: "2026-09-01T00:00:00.000Z", id: UUID });
    expect(decodeCursor("garbage")).toBeNull();
    expect(decodeCursor(encodeCursor({ created_at: "2026-09-01T00:00:00.000Z", id: "not-a-uuid" }))).toBeNull();
    expect(cursorOrFilter({ createdAt: "T", id: "I" })).toBe("created_at.lt.T,and(created_at.eq.T,id.lt.I)");
  });

  it("validates stage / type / limit / cursor from the query string", () => {
    const ok = parseListFilters(new URLSearchParams({ stage: "meeting", type: "vc", tag: " Lead ", q: "Black", limit: "999", archived: "1" }));
    expect(ok).toEqual({
      ok: true,
      value: { stage: "meeting", type: "vc", tag: "lead", search: "black", includeArchived: true, limit: 200, cursor: null },
    });
    expect(parseListFilters(new URLSearchParams({ stage: "won" }))).toMatchObject({ ok: false });
    expect(parseListFilters(new URLSearchParams({ cursor: "x" }))).toMatchObject({ ok: false, error: "cursor is invalid" });
    expect(parseListFilters(new URLSearchParams({ limit: "abc" }))).toMatchObject({ ok: true, value: { limit: 50 } });
  });
});

describe("isOverdue / isStageAdvance", () => {
  it("overdue = due date before today, live contact, not passed / invested", () => {
    expect(isOverdue(row({ next_step_due: "2026-09-12" }), NOW)).toBe(true);
    expect(isOverdue(row({ next_step_due: "2026-09-13" }), NOW)).toBe(false);
    expect(isOverdue(row({ next_step_due: "2026-09-12", archived_at: "2026-09-12T00:00:00Z" }), NOW)).toBe(false);
    expect(isOverdue(row({ next_step_due: "2026-09-12", stage: "passed" }), NOW)).toBe(false);
    expect(isOverdue(row({ next_step_due: null }), NOW)).toBe(false);
  });

  it("an auto-advance only ever moves forward; passed never advances to committed by mistake", () => {
    expect(isStageAdvance("meeting", "committed")).toBe(true);
    expect(isStageAdvance("committed", "invested")).toBe(true);
    expect(isStageAdvance("invested", "committed")).toBe(false);
    expect(isStageAdvance("passed", "committed")).toBe(true);
    expect(isStageAdvance("committed", "committed")).toBe(false);
  });
});

describe("summarisePipeline", () => {
  it("counts live contacts by stage, overdue / due-this-week, and matches cheques by lower-cased email", () => {
    const contacts = [
      row({ id: "c1", email: "jane@bb.vc", stage: "committed", next_step_due: "2026-09-10" }),
      row({ id: "c2", email: "sam@x.co", stage: "meeting", next_step_due: "2026-09-18" }),
      row({ id: "c3", stage: "researching", archived_at: "2026-09-01T00:00:00Z" }),
      row({ id: "c4", email: "old@x.co", stage: "passed", next_step_due: "2026-01-01" }),
    ];
    const s = summarisePipeline(
      contacts,
      [
        { investor_email: "Jane@BB.vc", amount_aud: "250000", status: "signed" },
        { investor_email: "jane@bb.vc", amount_aud: 50000, status: "funded" },
        { investor_email: "jane@bb.vc", amount_aud: 1, status: "soft" },
        { investor_email: "stranger@x.co", amount_aud: 999, status: "committed" },
        { investor_email: null, amount_aud: 5, status: "committed" },
      ],
      NOW,
    );
    expect(s.total).toBe(3);
    expect(s.byStage).toMatchObject({ committed: 1, meeting: 1, passed: 1, researching: 0 });
    expect(s.overdue).toBe(1);
    expect(s.dueThisWeek).toBe(1);
    expect(s.committedAud).toBe(250000);
    expect(s.fundedAud).toBe(50000);
    expect(s.contactsWithCommitments).toBe(1);
    expect(s.byContact).toEqual({ c1: { committedAud: 250000, fundedAud: 50000 } });
  });
});
