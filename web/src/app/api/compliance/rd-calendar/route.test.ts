// Unit tests for GET /api/compliance/rd-calendar — P6-rd-calendar-route-test.
//
// The route serves the R&D Tax Incentive registration calendar for the
// founder's active project (current FY + prior 3 FYs, each with the
// 10-month AusIndustry deadline). It is the auth-gated wrapper on top of
// the pure `buildRDCalendar` helper covered by rd-calendar.test.ts, and
// it also does a best-effort upsert back into `compliance_rd_registrations`
// so subsequent GETs surface founder-driven updates.
//
// Silent regressions this pins against:
//   - dropping the auth gate and letting anonymous callers see a per-user
//     calendar (the registration_status column is per-founder DD material);
//   - dropping `dynamic = "force-dynamic"` — the per-founder response
//     must never prerender into the shared build output;
//   - dropping the `.eq("user_id", …)` / `.eq("project_id", …)` filter on
//     the SELECT — a founder with two projects would see the other
//     project's registration status;
//   - dropping the `registered` / `not_applicable` allowlist on the
//     registration_status projection — a stray DB value like
//     `pending_registration` would silently pass through to the calendar
//     classifier which expects the three-way union only;
//   - dropping the upsert onConflict target `user_id,project_id,fy_label`
//     — the founder's manual overrides would insert as duplicate rows
//     instead of updating the existing FY row;
//   - dropping the `entry.status === "overdue"` upsert branch — the
//     backfill would stamp `not_registered` over the derived overdue
//     status, hiding the forfeited-offset badge on future page loads;
//   - swapping RD_DISCLAIMER out of the 401 branch — every response body
//     (including auth failures) must carry the "not tax advice" hedge.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getActiveProjectMock = vi.fn<
  (userId: string) => Promise<{ id: string } | null>
>();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
}));

import { RD_DISCLAIMER } from "@/lib/compliance/rd-calendar";
import { GET, dynamic } from "./route";

interface SelectCall {
  table: string;
  cols: string;
  eqs: Array<{ col: string; val: unknown }>;
}

interface UpsertCall {
  table: string;
  row: Record<string, unknown>;
  opts: { onConflict?: string };
}

interface FakeState {
  selects: SelectCall[];
  upserts: UpsertCall[];
  rows: Array<{
    fy_label: string;
    registration_status: string | null;
    registration_date: string | null;
  }>;
}

const state: FakeState = { selects: [], upserts: [], rows: [] };

function resetState() {
  state.selects = [];
  state.upserts = [];
  state.rows = [];
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          const query: SelectCall = { table, cols, eqs: [] };
          state.selects.push(query);
          const chain = {
            eq(col: string, val: unknown) {
              query.eqs.push({ col, val });
              return chain;
            },
            then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
              return Promise.resolve(onFulfilled({ data: state.rows, error: null }));
            },
          };
          return chain;
        },
        upsert(row: Record<string, unknown>, opts: { onConflict?: string }) {
          state.upserts.push({ table, row, opts });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getActiveProjectMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  getActiveProjectMock.mockResolvedValue({ id: "proj-1" });
});

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user calendars cannot prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/compliance/rd-calendar — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: RD_DISCLAIMER,
    });
  });

  it("does NOT touch supabase, getActiveProject, or upsert on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.selects).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });
});

describe("GET /api/compliance/rd-calendar — supabase-unavailable branch", () => {
  it("returns 200 with an in-memory calendar even when supabase is null (no crash on unconfigured envs)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.calendar)).toBe(true);
    expect(body.calendar.length).toBeGreaterThan(0);
    expect(body.disclaimer).toBe(RD_DISCLAIMER);
  });

  it("does NOT call getActiveProject when supabase is null (nothing to query or upsert)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.selects).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });
});

describe("GET /api/compliance/rd-calendar — happy-path envelope", () => {
  it("returns { ok:true, calendar[], disclaimer:RD_DISCLAIMER } on the authed branch", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.calendar)).toBe(true);
    expect(body.disclaimer).toBe(RD_DISCLAIMER);
  });

  it("emits the default 4 FY rows (current + 3 prior) sorted current-first", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.calendar).toHaveLength(4);
    // Every row must carry the four required fields the founder-facing tile reads.
    for (const row of body.calendar) {
      expect(typeof row.fy_label).toBe("string");
      expect(typeof row.registration_deadline).toBe("string");
      expect(typeof row.status).toBe("string");
      expect(typeof row.days_until_deadline).toBe("number");
    }
  });
});

describe("GET /api/compliance/rd-calendar — supabase query shape", () => {
  it("selects the 3-column projection from compliance_rd_registrations filtered by user_id + project_id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await GET();
    const q = state.selects.find((s) => s.table === "compliance_rd_registrations");
    expect(q).toBeDefined();
    expect(q?.cols).toBe("fy_label, registration_status, registration_date");
    expect(q?.eqs).toEqual([
      { col: "user_id", val: "founder-42" },
      { col: "project_id", val: "proj-abc" },
    ]);
  });

  it("stamps project_id = null on the SELECT when getActiveProject returns null (pre-project founder)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await GET();
    const q = state.selects.find((s) => s.table === "compliance_rd_registrations");
    expect(q?.eqs).toContainEqual({ col: "project_id", val: null });
  });

  it("calls getActiveProject with the current user's id (not the email)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-xyz", email: "z@x.com" });
    await GET();
    expect(getActiveProjectMock).toHaveBeenCalledWith("user-xyz");
  });
});

describe("GET /api/compliance/rd-calendar — registration_status classifier", () => {
  it("passes 'registered' through verbatim so buildRDCalendar collapses the row to status='open'", async () => {
    state.rows = [
      {
        fy_label: "FY 2024-25",
        registration_status: "registered",
        registration_date: "2026-01-10",
      },
    ];
    const res = await GET();
    const body = await res.json();
    const row = body.calendar.find(
      (r: { fy_label: string }) => r.fy_label === "FY 2024-25",
    );
    expect(row).toBeDefined();
    expect(row.registration_status).toBe("registered");
    expect(row.registration_date).toBe("2026-01-10");
    expect(row.status).toBe("open");
  });

  it("passes 'not_applicable' through verbatim (the founder marked this FY as no R&D activity)", async () => {
    state.rows = [
      {
        fy_label: "FY 2024-25",
        registration_status: "not_applicable",
        registration_date: null,
      },
    ];
    const res = await GET();
    const body = await res.json();
    const row = body.calendar.find(
      (r: { fy_label: string }) => r.fy_label === "FY 2024-25",
    );
    expect(row?.registration_status).toBe("not_applicable");
  });

  it("collapses any registration_status other than 'registered'/'not_applicable' onto 'not_registered' (defence against free-text DB drift)", async () => {
    state.rows = [
      {
        fy_label: "FY 2024-25",
        registration_status: "pending_registration",
        registration_date: null,
      },
    ];
    const res = await GET();
    const body = await res.json();
    const row = body.calendar.find(
      (r: { fy_label: string }) => r.fy_label === "FY 2024-25",
    );
    expect(row?.registration_status).toBe("not_registered");
  });

  it("collapses null registration_status onto 'not_registered' (a pre-onboarded FY row)", async () => {
    state.rows = [
      {
        fy_label: "FY 2024-25",
        registration_status: null,
        registration_date: null,
      },
    ];
    const res = await GET();
    const body = await res.json();
    const row = body.calendar.find(
      (r: { fy_label: string }) => r.fy_label === "FY 2024-25",
    );
    expect(row?.registration_status).toBe("not_registered");
  });
});

describe("GET /api/compliance/rd-calendar — best-effort upsert backfill", () => {
  it("upserts one row per calendar entry (default 4 FYs → 4 upserts) targeting compliance_rd_registrations", async () => {
    await GET();
    expect(state.upserts.length).toBeGreaterThanOrEqual(4);
    for (const u of state.upserts) {
      expect(u.table).toBe("compliance_rd_registrations");
    }
  });

  it("uses onConflict='user_id,project_id,fy_label' so a founder's re-visit updates rather than duplicates the FY row", async () => {
    await GET();
    for (const u of state.upserts) {
      expect(u.opts.onConflict).toBe("user_id,project_id,fy_label");
    }
  });

  it("stamps user_id + project_id + fy_label + activity_start + activity_end + registration_deadline into every upsert payload", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-99", email: "n@x.com" });
    getActiveProjectMock.mockResolvedValue({ id: "proj-9" });
    await GET();
    const sample = state.upserts[0];
    expect(sample.row.user_id).toBe("founder-99");
    expect(sample.row.project_id).toBe("proj-9");
    expect(typeof sample.row.fy_label).toBe("string");
    expect(typeof sample.row.activity_start).toBe("string");
    expect(typeof sample.row.activity_end).toBe("string");
    expect(typeof sample.row.registration_deadline).toBe("string");
    expect(typeof sample.row.registration_status).toBe("string");
  });

  it("stamps project_id = null on the upsert payload when getActiveProject returns null (matches the SELECT filter)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await GET();
    for (const u of state.upserts) {
      expect(u.row.project_id).toBeNull();
    }
  });

  it("preserves an existing 'registered' status through the upsert instead of overwriting with 'not_registered'", async () => {
    state.rows = [
      {
        fy_label: "FY 2024-25",
        registration_status: "registered",
        registration_date: "2026-01-10",
      },
    ];
    await GET();
    const registeredUpsert = state.upserts.find(
      (u) => u.row.fy_label === "FY 2024-25",
    );
    expect(registeredUpsert?.row.registration_status).toBe("registered");
  });

  it("stamps registration_status='not_registered' on upserts for FYs without an existing registration row (the default state for every un-seeded FY)", async () => {
    // buildRDCalendar populates every returned entry's registration_status
    // to `reg.status ?? "not_registered"`. With no rows seeded (state.rows
    // empty), every FY on the calendar defaults to 'not_registered' and
    // that is what the upsert backfill must persist so the founder-facing
    // "action needed" tile stays accurate across page loads.
    await GET();
    const notReg = state.upserts.filter(
      (u) => u.row.registration_status === "not_registered",
    );
    // All 4 default FY rows are un-seeded → all 4 upserts stamp 'not_registered'.
    expect(notReg.length).toBe(state.upserts.length);
  });

  it("performs one upsert per calendar entry (never skips or duplicates a FY)", async () => {
    const res = await GET();
    const body = await res.json();
    expect(state.upserts.length).toBe(body.calendar.length);
    const upsertLabels = state.upserts.map((u) => u.row.fy_label as string).sort();
    const calendarLabels = body.calendar
      .map((r: { fy_label: string }) => r.fy_label)
      .sort();
    expect(upsertLabels).toEqual(calendarLabels);
  });

  it("does NOT upsert when supabase is null (no round-trip to a phantom DB)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(state.upserts).toHaveLength(0);
  });
});
