// G22-B — the org_id backfill over a fake Supabase client: the acting-org
// rule mirrors resolveActingOrg (own firm → first invited → personal →
// ownership fallback), stamped rows are never touched, dry-run writes
// nothing, --write updates only rows still null (a row stamped meanwhile is
// skipped), a missing 0433 column exits 3, bad flags exit 2.
import { describe, expect, it } from "vitest";

import { EXIT_FAILED, EXIT_MISSING, EXIT_OK, EXIT_USAGE, applyUpdates, main, parseArgs, pickActingOrg, planUpdates } from "./backfill-org-ids.mjs";

/** select / is / in / eq / range / update; `missing` = "table.column" → 42703. */
function fakeDb(tables, missing = []) {
  const db = { tables, updates: [] };
  db.from = (table) => {
    const filters = [];
    let err = null;
    let patch = null;
    const touch = (col) => {
      if (missing.includes(`${table}.${col}`)) err = { code: "42703", message: `column ${table}.${col} does not exist` };
    };
    const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      is: (col, v) => (touch(col), filters.push((r) => (v === null ? r[col] == null : r[col] === v)), q),
      in: (col, vals) => (filters.push((r) => vals.includes(String(r[col]))), q),
      eq: (col, v) => (filters.push((r) => String(r[col]) === String(v)), q),
      range: async (from, to) => (err ? { data: null, error: err } : { data: rows().slice(from, to + 1), error: null }),
      update: (p) => ((patch = p), q),
      then: (resolve) => {
        if (err) return resolve({ data: null, error: err });
        const hit = rows();
        if (patch) {
          for (const r of hit) Object.assign(r, patch);
          db.updates.push({ table, ids: hit.map((r) => r.id), patch });
        }
        resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      },
    };
    return q;
  };
  return db;
}

const ORGS = new Map([
  ["firm-1", { owner_user_id: "alice", is_personal: false }],
  ["personal-alice", { owner_user_id: "alice", is_personal: true }],
  ["firm-2", { owner_user_id: "bob", is_personal: false }],
  ["personal-carol", { owner_user_id: "carol", is_personal: true }],
]);

describe("pickActingOrg (mirror of resolveActingOrg)", () => {
  it("own non-personal org wins over an invited seat and the personal org, whatever the seat order", () => {
    const seats = [
      { org_id: "personal-alice", created_at: "2026-01-01" },
      { org_id: "firm-2", created_at: "2026-02-01" },
      { org_id: "firm-1", created_at: "2026-03-01" },
    ];
    expect(pickActingOrg("alice", seats, ORGS)).toBe("firm-1");
  });
  it("an invited seat acts for the firm (oldest seat first); else the personal org; else ownership without a seat row; else null", () => {
    expect(pickActingOrg("carol", [{ org_id: "firm-2", created_at: "2026-02-01" }, { org_id: "personal-carol", created_at: "2026-01-01" }], ORGS)).toBe("firm-2");
    expect(pickActingOrg("carol", [{ org_id: "personal-carol", created_at: "2026-01-01" }], ORGS)).toBe("personal-carol");
    expect(pickActingOrg("carol", [], ORGS)).toBe("personal-carol"); // personal org predates its seat row
    expect(pickActingOrg("dave", [], ORGS)).toBeNull();
    expect(pickActingOrg("dave", [{ org_id: "gone", created_at: "2026-01-01" }], ORGS)).toBeNull();
  });
});

describe("planUpdates", () => {
  it("never touches a stamped row; skips creators with no org", () => {
    const plan = planUpdates(
      [
        { id: "b-1", creator: "alice", org_id: null },
        { id: "b-2", creator: "alice", org_id: "already" },
        { id: "b-3", creator: "dave", org_id: null },
      ],
      (u) => (u === "alice" ? "firm-1" : null),
    );
    expect(plan.updates).toEqual([{ id: "b-1", org_id: "firm-1" }]);
    expect(plan.skipped).toEqual([{ id: "b-3", creator: "dave" }]);
  });
});

describe("parseArgs", () => {
  it("defaults to dry-run; --write / --json / --verbose; --dry-run + --write and unknown flags throw", () => {
    expect(parseArgs([])).toEqual({ help: false, write: false, json: false, verbose: false });
    expect(parseArgs(["--write", "--json", "--verbose"])).toEqual({ help: false, write: true, json: true, verbose: true });
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(() => parseArgs(["--dry-run", "--write"])).toThrow(/mutually exclusive/);
    expect(() => parseArgs(["--all"])).toThrow(/unknown argument/);
  });
});

function seed() {
  return {
    evaluation_batches: [
      { id: "b-alice", user_id: "alice", org_id: null },
      { id: "b-alice-stamped", user_id: "alice", org_id: "personal-alice" },
      { id: "b-carol", user_id: "carol", org_id: null },
      { id: "b-dave", user_id: "dave", org_id: null },
    ],
    program_intakes: [
      { id: "i-alice", owner_user_id: "alice", org_id: null },
      { id: "i-bob", owner_user_id: "bob", org_id: null },
    ],
    investor_organisation_members: [
      { org_id: "personal-alice", user_id: "alice", created_at: "2026-01-01" },
      { org_id: "firm-1", user_id: "alice", created_at: "2026-03-01" },
      { org_id: "firm-2", user_id: "carol", created_at: "2026-02-01" },
      { org_id: "firm-2", user_id: "bob", created_at: "2026-01-01" },
    ],
    investor_organisations: [
      { id: "firm-1", owner_user_id: "alice", is_personal: false },
      { id: "personal-alice", owner_user_id: "alice", is_personal: true },
      { id: "firm-2", owner_user_id: "bob", is_personal: false },
    ],
  };
}

describe("main", () => {
  it("dry-run: counts + per-row plan, nothing written", async () => {
    const db = fakeDb(seed());
    const lines = [];
    const code = await main(["--verbose"], { db, log: (s) => lines.push(s) });
    expect(code).toBe(EXIT_OK);
    expect(db.updates).toEqual([]);
    expect(lines.join("\n")).toContain("[dry] batches b-alice → org firm-1");
    expect(lines.join("\n")).toContain("[dry] batches b-carol → org firm-2");
    expect(lines.join("\n")).toContain("[dry] intakes i-bob → org firm-2");
    expect(lines.join("\n")).toContain("evaluation_batches: 3 without org_id → 2 resolvable, 1 skipped");
    expect(lines.join("\n")).toContain("program_intakes:    2 without org_id → 2 resolvable, 0 skipped");
    expect(lines.join("\n")).toContain("DRY-RUN");
    expect(db.tables.evaluation_batches.find((r) => r.id === "b-alice").org_id).toBeNull();
  });

  it("--write --json: stamps only the resolvable, still-null rows; the stamped row keeps its org; dave stays null", async () => {
    const db = fakeDb(seed());
    const lines = [];
    const code = await main(["--write", "--json"], { db, log: (s) => lines.push(s) });
    expect(code).toBe(EXIT_OK);
    const summary = JSON.parse(lines.join("\n"));
    expect(summary).toMatchObject({ dry_run: false, batches: { unstamped: 3, planned: 2, skipped: 1, written: 2, failed: 0 }, intakes: { unstamped: 2, planned: 2, skipped: 0, written: 2, failed: 0 }, creators_without_org: ["dave"] });
    const by = (t, id) => db.tables[t].find((r) => r.id === id).org_id;
    expect(by("evaluation_batches", "b-alice")).toBe("firm-1");
    expect(by("evaluation_batches", "b-alice-stamped")).toBe("personal-alice");
    expect(by("evaluation_batches", "b-carol")).toBe("firm-2");
    expect(by("evaluation_batches", "b-dave")).toBeNull();
    expect(by("program_intakes", "i-alice")).toBe("firm-1");
    expect(by("program_intakes", "i-bob")).toBe("firm-2");
    // every UPDATE is guarded by org_id IS NULL
    expect(db.updates.every((u) => u.ids.length === 1)).toBe(true);
  });

  it("applyUpdates skips a row stamped meanwhile (org_id no longer null) and counts a failed update", async () => {
    const db = fakeDb({ evaluation_batches: [{ id: "b-1", org_id: "someone-else-stamped" }, { id: "b-2", org_id: null }] });
    const res = await applyUpdates(db, "evaluation_batches", [{ id: "b-1", org_id: "firm-1" }, { id: "b-2", org_id: "firm-1" }]);
    expect(res).toEqual({ written: 1, failed: 0 });
    expect(db.tables.evaluation_batches[0].org_id).toBe("someone-else-stamped");
    const errors = [];
    const orig = console.error;
    console.error = (m) => errors.push(String(m));
    try {
      const broken = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) };
      expect(await applyUpdates(broken, "evaluation_batches", [{ id: "x", org_id: "y" }])).toEqual({ written: 0, failed: 1 });
    } finally {
      console.error = orig;
    }
    expect(errors.join("\n")).toContain("boom");
  });

  it("0433 not applied (42703 on evaluation_batches.org_id) → exit 3 with the apply hint; bad flags → exit 2", async () => {
    const db = fakeDb(seed(), ["evaluation_batches.org_id"]);
    const errors = [];
    const orig = console.error;
    console.error = (m) => errors.push(String(m));
    try {
      expect(await main([], { db, log: () => {} })).toBe(EXIT_MISSING);
      expect(errors.join("\n")).toMatch(/0433_org_id_on_batches_intakes\.sql/);
      expect(await main(["--nope"], { db, log: () => {} })).toBe(EXIT_USAGE);
    } finally {
      console.error = orig;
    }
    expect(db.updates).toEqual([]);
    expect(EXIT_FAILED).toBe(1);
  });
});
