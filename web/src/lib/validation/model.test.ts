// G22-D — the validation tracker model: levels + targets as the advisor plan
// wrote them, the strict entry schema, merge / patch / remove, the ladder
// counts (manual done + counted auto rows), open-objection grouping, the
// auto-row derivation (L4 first paid program invoice, L5 renewal / second organisation — G25: from revenue_events,
// signals never counted, QA rows dropped) and the 14-question script.

import { describe, expect, it } from "vitest";
import {
  PROGRAM_PLAN_IDS,
  PROGRAM_PLAN_LABELS,
  VALIDATION_LEVELS,
  VALIDATION_SCRIPT,
  applyPatch,
  buildDashboard,
  computeLadder,
  deriveAutoRows,
  isValidationEntry,
  newEntry,
  normaliseObjection,
  openObjections,
  parseEntryInput,
  parseEntryPatch,
  parseLedger,
  removeEntry,
  sortEntries,
  upsertEntry,
  type AutoInputs,
  type ValidationEntry,
  type ValidationLedger,
} from "./model";

const NOW = new Date("2026-09-21T10:00:00.000Z");
const EMPTY: ValidationLedger = { version: 1, updated_at: null, entries: [] };

function entry(over: Partial<ValidationEntry> = {}): ValidationEntry {
  const base = newEntry(
    { organisation: "Demo Accelerator", contact_role: "Program manager", date: "2026-09-20", level: 1, outcome: "done", objection: "", objection_answered: false, next_step: "", note: "" },
    over.id ?? "e-1",
    NOW,
  );
  return { ...base, ...over };
}

describe("levels + script", () => {
  it("five levels with the advisor-plan targets 5 · 3 · 2 · 1 · 1, in order", () => {
    expect(VALIDATION_LEVELS.map((l) => [l.level, l.target])).toEqual([
      [1, 5],
      [2, 3],
      [3, 2],
      [4, 1],
      [5, 1],
    ]);
    expect(VALIDATION_LEVELS[3]!.label).toContain("Cohort 25");
  });

  it("14 questions (the advisor plan's 13 + the one that matters), numbered 1..14, opening on intake and closing on the payment ask", () => {
    expect(VALIDATION_SCRIPT).toHaveLength(14);
    expect(VALIDATION_SCRIPT.map((q) => q.n)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(VALIDATION_SCRIPT[0]!.text).toMatch(/^Walk me through your current intake/);
    expect(VALIDATION_SCRIPT[11]!.text).toBe("Would you pay A$5,000 a year to use it on the next cohort?");
    expect(VALIDATION_SCRIPT[13]!.text).toBe("Will you pay for the next cohort now?");
    for (const q of VALIDATION_SCRIPT) expect(q.listen_for.length).toBeGreaterThan(5);
  });
});

describe("entry schema", () => {
  it("accepts a full input, trims, defaults the optional strings", () => {
    const r = parseEntryInput({ organisation: "  Acme Programs ", date: "2026-09-21", level: 2, outcome: "booked" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.organisation).toBe("Acme Programs");
      expect(r.value.contact_role).toBe("");
      expect(r.value.objection_answered).toBe(false);
    }
  });

  it("rejects an unknown key, a bad date, a level outside 1..5, an unknown outcome, an over-long note", () => {
    const base = { organisation: "Acme", date: "2026-09-21", level: 1, outcome: "done" };
    expect(parseEntryInput({ ...base, extra: 1 }).ok).toBe(false);
    expect(parseEntryInput({ ...base, date: "21/09/2026" }).ok).toBe(false);
    expect(parseEntryInput({ ...base, level: 6 }).ok).toBe(false);
    expect(parseEntryInput({ ...base, outcome: "maybe" }).ok).toBe(false);
    expect(parseEntryInput({ ...base, note: "x".repeat(2_001) }).ok).toBe(false);
    const bad = parseEntryInput({ ...base, organisation: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/^organisation:/);
  });

  it("patch: any subset, never empty, still strict", () => {
    expect(parseEntryPatch({ outcome: "declined", objection: "No budget until July" }).ok).toBe(true);
    expect(parseEntryPatch({}).ok).toBe(false);
    expect(parseEntryPatch({ id: "x" }).ok).toBe(false);
  });

  it("isValidationEntry + parseLedger drop corrupt rows and survive bad JSON", () => {
    expect(isValidationEntry(entry())).toBe(true);
    expect(isValidationEntry({ ...entry(), level: 9 })).toBe(false);
    expect(isValidationEntry({ ...entry(), id: 1 })).toBe(false);
    const parsed = parseLedger(JSON.stringify({ version: 1, updated_at: "2026-09-21T00:00:00.000Z", entries: [entry(), { junk: true }, { ...entry({ id: "e-2" }), outcome: "won" }] }));
    expect(parsed.entries.map((e) => e.id)).toEqual(["e-1"]);
    expect(parsed.updated_at).toBe("2026-09-21T00:00:00.000Z");
    expect(parseLedger("{not json").entries).toEqual([]);
    expect(parseLedger("[]").entries).toEqual([]);
  });
});

describe("merge helpers", () => {
  it("upsert inserts then replaces by id; entries sort newest date first", () => {
    const a = entry({ id: "a", date: "2026-09-01" });
    const b = entry({ id: "b", date: "2026-09-15" });
    let l = upsertEntry(upsertEntry(EMPTY, a), b);
    expect(l.entries.map((e) => e.id)).toEqual(["b", "a"]);
    l = upsertEntry(l, { ...a, organisation: "Renamed" });
    expect(l.entries).toHaveLength(2);
    expect(l.entries.find((e) => e.id === "a")?.organisation).toBe("Renamed");
    expect(sortEntries([a, b]).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("applyPatch keeps id + created_at, bumps updated_at; removeEntry reports not-found", () => {
    const e = entry();
    const later = new Date("2026-09-22T00:00:00.000Z");
    const p = applyPatch(e, { outcome: "declined", objection: "Too early" }, later);
    expect(p.id).toBe("e-1");
    expect(p.created_at).toBe(e.created_at);
    expect(p.updated_at).toBe(later.toISOString());
    expect(p.outcome).toBe("declined");
    const l = upsertEntry(EMPTY, e);
    expect(removeEntry(l, "nope").removed).toBeNull();
    const r = removeEntry(l, "e-1");
    expect(r.removed?.id).toBe("e-1");
    expect(r.ledger.entries).toEqual([]);
  });
});

const INVOICE: AutoInputs["revenueEvents"][number] = { id: 1, user_id: "u-1", plan_id: "accelerator_starter", kind: "subscribe", gross_aud_cents: 500_000, currency: "AUD", ts: "2026-09-10T00:00:00.000Z", payer_email: "ops@program.org" };

describe("deriveAutoRows", () => {
  it("first paid program invoice → L4 counted; a later invoice by the same organisation → L5 renewal; a second organisation → L5 second organisation", () => {
    const rows = deriveAutoRows({
      revenueEvents: [
        INVOICE,
        { ...INVOICE, id: 2, kind: "renewal", ts: "2026-09-12T00:00:00.000Z" },
        { ...INVOICE, id: 3, user_id: "u-2", plan_id: "investor_vc_small", gross_aud_cents: 34_900, ts: "2026-09-14T00:00:00.000Z", payer_email: "desk@fund.vc" },
      ],
      applications: [],
      feedbackLetters: [],
      batches: [],
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("revenue_events:1")).toMatchObject({ level: 4, counts: true, organisation: "program.org", source: "revenue_events" });
    expect(byId.get("revenue_events:1")!.detail).toContain("Cohort 25");
    expect(byId.get("revenue_events:1")!.detail).toContain("A$5,000");
    expect(byId.get("revenue_events:2:l5")).toMatchObject({ level: 5, counts: true });
    expect(byId.get("revenue_events:2:l5")!.detail).toMatch(/Renewal/);
    expect(byId.get("revenue_events:3:l5")).toMatchObject({ level: 5, counts: true, organisation: "fund.vc" });
    expect(byId.get("revenue_events:3:l5")!.detail).toMatch(/Second organisation/);
    expect(byId.get("revenue_events:3:l5")!.detail).toContain("Program");
    for (const r of rows) expect(r.organisation).not.toContain("@");
  });

  it("a zero-amount trial row, a non-program plan, a refund and a qa-live payer never produce a row; nothing reads pilot_orders", () => {
    const rows = deriveAutoRows({
      revenueEvents: [
        { ...INVOICE, id: 10, kind: "trial_start", gross_aud_cents: 0 },
        { ...INVOICE, id: 11, plan_id: "founder_growth" },
        { ...INVOICE, id: 12, kind: "refund" },
        { ...INVOICE, id: 13, payer_email: "qa-live-20260921-0900@blockid.au" },
        { ...INVOICE, id: 14, plan_id: null },
      ],
      applications: [],
      feedbackLetters: [],
      batches: [],
    });
    expect(rows).toEqual([]);
    expect(PROGRAM_PLAN_IDS).toEqual(["accelerator_starter", "accelerator_growth", "investor_vc_small"]);
    expect(PROGRAM_PLAN_LABELS).toBe("Cohort 25 / Cohort 100 annual, or Program A$349/mo");
    expect(VALIDATION_LEVELS[3]!.label).toContain("First paying program");
    expect(VALIDATION_LEVELS[2]!.label).toBe("Written proposals");
    expect(VALIDATION_LEVELS[4]!.label).toBe("Renewal or second paying organisation");
    expect(JSON.stringify(VALIDATION_LEVELS)).not.toMatch(/pilot/i);
  });

  it("applications → L1 signal; sent / opened letters → L2 signal (drafts skipped); cohorts with done items → L2 signal (QA owners skipped)", () => {
    const rows = deriveAutoRows({
      revenueEvents: [],
      applications: [{ id: "a-1", program_name: "Uni Program", cohort_size: 40, intake_month: "2026-11", received_at: "2026-09-18T00:00:00.000Z" }],
      feedbackLetters: [
        { id: "l-1", project_id: "11111111-2222-4333-8444-555555555555", status: "sent", sent_at: "2026-09-17T00:00:00.000Z", org_count: 2, k: 3 },
        { id: "l-2", project_id: "11111111-2222-4333-8444-555555555555", status: "draft", sent_at: null, org_count: 1, k: 1 },
      ],
      batches: [
        { id: "b-1", name: "Spring", program_name: "Spring 2026", status: "done", total: 12, done_count: 12, finished_at: "2026-09-16T00:00:00.000Z", created_at: "2026-09-15T00:00:00.000Z", owner_email: "pm@program.org" },
        { id: "b-2", name: "Queued", status: "queued", total: 3, done_count: 0, finished_at: null, created_at: "2026-09-19T00:00:00.000Z", owner_email: "pm@program.org" },
        { id: "b-3", name: "QA", status: "done", total: 1, done_count: 1, finished_at: "2026-09-19T00:00:00.000Z", created_at: "2026-09-19T00:00:00.000Z", owner_email: "qa-live-20260921-0900@blockid.au" },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["pilot-applications.jsonl:a-1", "founder_feedback_letters:l-1", "evaluation_batches:b-1"]);
    expect(rows[0]).toMatchObject({ level: 1, counts: false, organisation: "Uni Program" });
    expect(rows[1]).toMatchObject({ level: 2, counts: false, organisation: "project 11111111" });
    expect(rows[2]).toMatchObject({ level: 2, counts: false, organisation: "Spring 2026", date: "2026-09-16" });
    expect(rows.every((r) => !r.counts)).toBe(true);
  });
});

describe("deriveAutoRows — G24-C demo cohorts", () => {
  it("a demo cohort is never 'Cohort scored'; loaded by an external seat it is a Level-2 'workflow demo run' signal; loaded by an admin it is nothing", () => {
    const rows = deriveAutoRows({
      revenueEvents: [],
      applications: [],
      feedbackLetters: [],
      batches: [
        { id: "b-demo-ext", name: "Demo cohort", program_name: "Workflow demo (fictional data)", status: "done", total: 5, done_count: 5, finished_at: "2026-09-21T00:00:00.000Z", created_at: "2026-09-21T00:00:00.000Z", owner_email: "pm@program.org", is_demo: true, owner_is_admin: false },
        { id: "b-demo-admin", name: "Demo cohort", status: "done", total: 5, done_count: 5, finished_at: "2026-09-21T00:00:00.000Z", created_at: "2026-09-21T00:00:00.000Z", owner_email: "admin@blockid.au", is_demo: true, owner_is_admin: true },
        { id: "b-demo-qa", name: "Demo cohort", status: "done", total: 5, done_count: 5, finished_at: "2026-09-21T00:00:00.000Z", created_at: "2026-09-21T00:00:00.000Z", owner_email: "qa-live-20260921-0900@blockid.au", is_demo: true, owner_is_admin: false },
        { id: "b-real", name: "Spring", status: "done", total: 12, done_count: 12, finished_at: "2026-09-16T00:00:00.000Z", created_at: "2026-09-15T00:00:00.000Z", owner_email: "pm@program.org" },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["evaluation_batches:b-demo-ext:demo", "evaluation_batches:b-real"]);
    expect(rows[0]).toMatchObject({ level: 2, counts: false, organisation: "program.org", date: "2026-09-21" });
    expect(rows[0].detail).toMatch(/^Workflow demo run/);
    expect(rows[0].detail).not.toMatch(/Cohort scored/);
    expect(rows.some((r) => r.id === "evaluation_batches:b-demo-ext")).toBe(false);
  });
});

describe("ladder + objections + dashboard", () => {
  it("actual = manual done + counted auto rows; booked / declined counted separately; progress capped at 1", () => {
    const entries = [
      entry({ id: "1", level: 1, outcome: "done" }),
      entry({ id: "2", level: 1, outcome: "done" }),
      entry({ id: "3", level: 1, outcome: "booked" }),
      entry({ id: "4", level: 1, outcome: "declined" }),
      entry({ id: "5", level: 4, outcome: "done" }),
    ];
    const auto = deriveAutoRows({ revenueEvents: [INVOICE], applications: [], feedbackLetters: [], batches: [] });
    const ladder = computeLadder(entries, auto);
    expect(ladder[0]).toMatchObject({ level: 1, target: 5, actual: 2, manual_done: 2, auto_counted: 0, booked: 1, declined: 1, progress: 0.4 });
    expect(ladder[3]).toMatchObject({ level: 4, target: 1, actual: 2, manual_done: 1, auto_counted: 1, progress: 1 });
    expect(ladder[4]).toMatchObject({ level: 5, actual: 0, progress: 0 });
  });

  it("open objections group by normalised wording, most frequent first, answered ones excluded", () => {
    const entries = [
      entry({ id: "1", organisation: "A", objection: "No budget until July.", date: "2026-09-01" }),
      entry({ id: "2", organisation: "B", objection: "no budget  until July", date: "2026-09-10", level: 2 }),
      entry({ id: "3", organisation: "C", objection: "Committee will not trust an AI score", date: "2026-09-12" }),
      entry({ id: "4", organisation: "D", objection: "Already answered", objection_answered: true }),
      entry({ id: "5", organisation: "E", objection: "" }),
    ];
    expect(normaliseObjection("  No budget   until July! ")).toBe("no budget until july");
    const groups = openObjections(entries);
    expect(groups.map((g) => [g.count, g.organisations, g.levels])).toEqual([
      [2, ["B", "A"], [2, 1]],
      [1, ["C"], [1]],
    ]);
    expect(groups[0]!.text).toBe("no budget  until July");
    expect(groups[0]!.last_date).toBe("2026-09-10");
  });

  it("buildDashboard assembles ladder, objections, auto rows and the extras verbatim", () => {
    const ledger = upsertEntry(EMPTY, entry({ objection: "Too early" }));
    const d = buildDashboard(ledger, [], { north_star: null, window: null, warnings: ["x"] });
    expect(d.ladder).toHaveLength(5);
    expect(d.objections[0]?.text).toBe("Too early");
    expect(d.warnings).toEqual(["x"]);
    expect(d.ledger).toBe(ledger);
  });
});
