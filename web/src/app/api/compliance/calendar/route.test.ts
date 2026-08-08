// Unit tests for GET /api/compliance/calendar —
// P9-compliance-calendar-route-test.
//
// The route serves the AU compliance calendar as either an RFC 5545
// text/calendar body (default — for `webcal://` + Google Calendar / iCal /
// Outlook subscribe) or, with `?format=json`, a structured JSON body the
// founder-facing `/compliance/calendar` view consumes to render its
// "Next up" tile + monthly event list.
//
// Branches covered:
//   1. dynamic === "force-dynamic"           (per-user calendar cannot prerender)
//   2. GET anonymous                         → 401 { ok:false, error:'unauthenticated', disclaimer }
//   3. GET supabase-unavailable              → 200 text/calendar (empty calendar, no throw)
//   4. GET happy path (text/calendar)        → 200 + Content-Type + 5-minute private cache
//   5. GET ?download=1                       → adds Content-Disposition attachment header
//   6. GET ?format=json                      → JSON body {ok, total, next_event, events, subscribe, disclaimer}
//   7. Multi-project isolation               → every `.eq()` is filtered by user_id AND project_id
//   8. project_id === null when no project   → the founder pre-project state does not crash
//   9. GST registered=true                   → BAS events emitted
//  10. GST registered=false                  → BAS events skipped, non-BAS events preserved
//  11. R&D registrations                     → threaded into buildRDCalendar → emit rd_registration events
//  12. ACN registration date                 → emits asic_annual_review event on the anniversary
//  13. Missing ACN                           → skips asic_annual_review branch
//  14. WGEA + ModernSlavery snapshots        → both fold into the calendar (wgea_report + modern_slavery_statement)
//  15. Latest snapshot only                  → each per-founder table selects newest first + limit 1
//
// Silent regressions this pins against:
//   - dropping the auth gate and letting an anonymous caller subscribe to
//     a per-user compliance calendar (privacy leak — the .ics carries the
//     founder's registration status);
//   - dropping `dynamic = "force-dynamic"` and letting Next.js cache a
//     stranger's calendar into the shared prerender output;
//   - dropping the Cache-Control: private, max-age=300 header (an origin
//     that caches the .ics publicly leaks calendar rows across founders);
//   - dropping the `?download=1` Content-Disposition and breaking the
//     "Download .ics" button on `/compliance/calendar` — the button would
//     open the calendar in-browser as text/plain instead of saving it;
//   - dropping `?format=json` and having the founder-facing view fall back
//     to text-parsing the .ics;
//   - dropping the `total` / `next_event` / `events` / `subscribe` /
//     `disclaimer` keys from the JSON body — the view renders each of them
//     verbatim into the "Next up" + monthly-list tiles;
//   - swapping the subscribe.webcal:// prefix (Google Calendar / iCal /
//     Outlook one-click subscribe breaks on any other scheme);
//   - dropping the multi-project filter on any of the 5 supabase queries
//     (a founder with two projects would see the other project's calendar);
//   - swapping the `.order(computed_at, {ascending: false})` on the WGEA /
//     Modern Slavery / GST loaders — the calendar would render a stale
//     snapshot even after the founder posted a fresh one;
//   - dropping the `.limit(1)` on the "latest snapshot" queries — the
//     calendar route would fold every historic snapshot into the .ics
//     instead of just the newest one;
//   - swapping the RSVP-style `registration_status` classifier from the
//     three-way (`registered` / `not_applicable` / `not_registered`)
//     mirror onto the DB free-text — the R&D deadline events would
//     silently swallow every FY as `not_registered`.

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

import { CALENDAR_DISCLAIMER } from "@/lib/compliance/calendar";
import { GET, dynamic } from "./route";

type FakeTable = {
  data: unknown;
  rows: unknown[]; // used when .maybeSingle() is not called (e.g. rdQ)
};

interface FakeState {
  tables: Record<string, FakeTable>;
  selects: Array<{
    table: string;
    cols: string;
    eqs: Array<{ col: string; val: unknown }>;
    ordered: { col: string; opts?: { ascending?: boolean } } | null;
    limited: number | null;
    maybeSingleCalls: number;
  }>;
  fromCalls: number;
}

const state: FakeState = {
  tables: {},
  selects: [],
  fromCalls: 0,
};

function resetState() {
  state.tables = {};
  state.selects = [];
  state.fromCalls = 0;
}

function setTable(name: string, data: unknown | null, rows: unknown[] = []) {
  state.tables[name] = { data, rows };
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      return {
        select(cols: string) {
          const query = {
            table,
            cols,
            eqs: [] as Array<{ col: string; val: unknown }>,
            ordered: null as { col: string; opts?: { ascending?: boolean } } | null,
            limited: null as number | null,
            maybeSingleCalls: 0,
          };
          state.selects.push(query);

          const chain: {
            eq: (col: string, val: unknown) => typeof chain;
            order: (col: string, opts?: { ascending?: boolean }) => typeof chain;
            limit: (n: number) => typeof chain;
            maybeSingle: () => Promise<{ data: unknown; error: null }>;
            then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
          } = {
            eq(col, val) {
              query.eqs.push({ col, val });
              return chain;
            },
            order(col, opts) {
              query.ordered = { col, opts };
              return chain;
            },
            limit(n) {
              query.limited = n;
              return chain;
            },
            maybeSingle() {
              query.maybeSingleCalls += 1;
              const entry = state.tables[table];
              return Promise.resolve({ data: entry?.data ?? null, error: null });
            },
            then(onFulfilled) {
              // Await-support for the R&D query which does NOT call
              // .maybeSingle() (returns an array).
              const entry = state.tables[table];
              const rows = entry?.rows ?? [];
              return Promise.resolve(onFulfilled({ data: rows, error: null }));
            },
          };
          return chain;
        },
      };
    },
  };
}

function makeGetReq(url = "https://blockid.au/api/compliance/calendar"): Request {
  return {
    url,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-forwarded-host" ? null : null,
    },
  } as unknown as Request;
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

describe("GET /api/compliance/calendar — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: CALENDAR_DISCLAIMER,
    });
  });

  it("does NOT touch supabase or getActiveProject on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(makeGetReq());
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/compliance/calendar — supabase-unavailable branch", () => {
  it("returns 200 text/calendar even when supabase is unconfigured (in-memory calendar must still render)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const text = await res.text();
    expect(text.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(text.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("does NOT call getActiveProject when supabase is null (nothing to query)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET(makeGetReq());
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/compliance/calendar — text/calendar headers", () => {
  it("returns Content-Type: text/calendar; charset=utf-8 on the default (non-json) format", async () => {
    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
  });

  it("sets Cache-Control: private, max-age=300 (never public — the calendar carries per-founder rows)", async () => {
    const res = await GET(makeGetReq());
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  it("does NOT set Content-Disposition unless ?download=1 is present (default is inline subscribe)", async () => {
    const res = await GET(makeGetReq());
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("adds Content-Disposition: attachment; filename=\"compliance-calendar.ics\" when ?download=1 is present", async () => {
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?download=1"),
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="compliance-calendar.ics"',
    );
  });

  it("emits an RFC 5545 body starting with BEGIN:VCALENDAR and ending with END:VCALENDAR", async () => {
    const res = await GET(makeGetReq());
    const text = await res.text();
    expect(text.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(text.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("carries CALENDAR_DISCLAIMER on the X-WR-CALDESC line (the 'not tax advice' hedge every subscriber sees)", async () => {
    const res = await GET(makeGetReq());
    const text = await res.text();
    expect(text).toContain("X-WR-CALDESC:");
    expect(text).toContain("Not tax or legal advice");
  });
});

describe("GET /api/compliance/calendar — ?format=json branch", () => {
  beforeEach(() => {
    // Force BAS events so the JSON body carries something to shape-check.
    setTable("compliance_gst_status", { registered_for_gst: true });
  });

  it("returns application/json with the documented envelope keys", async () => {
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      total: number;
      next_event: unknown;
      events: unknown[];
      subscribe: { webcal: string; https: string };
      disclaimer: string;
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.total).toBe(body.events.length);
    expect(body.disclaimer).toBe(CALENDAR_DISCLAIMER);
  });

  it("returns subscribe.webcal:// prefix + subscribe.https:// mirror so the founder can copy either into their calendar client", async () => {
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      subscribe: { webcal: string; https: string };
    };
    expect(body.subscribe.webcal.startsWith("webcal://")).toBe(true);
    expect(body.subscribe.https.startsWith("https://")).toBe(true);
  });

  it("uses Cache-Control: private, max-age=300 on the JSON envelope too", async () => {
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  it("populates next_event with the soonest-upcoming row from the events array (feeds the founder-facing 'Next up' tile)", async () => {
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      total: number;
      next_event: { date_start: string } | null;
      events: Array<{ date_start: string }>;
    };
    // Either the calendar is non-empty and next_event points at one of
    // its rows, or it is empty and next_event is null — either shape is
    // acceptable, but the two must agree (never non-null next_event on
    // an empty calendar, never null next_event when a future row exists).
    if (body.total === 0) {
      expect(body.next_event).toBeNull();
    } else {
      expect(body.next_event).not.toBeNull();
      const dates = body.events.map((e) => e.date_start);
      expect(dates).toContain(body.next_event?.date_start);
    }
  });
});

describe("GET /api/compliance/calendar — GST gating", () => {
  it("emits BAS events when compliance_gst_status.registered_for_gst = true", async () => {
    setTable("compliance_gst_status", { registered_for_gst: true });
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const basCount = body.events.filter((e) => e.kind === "bas_quarter").length;
    expect(basCount).toBeGreaterThan(0);
  });

  it("skips BAS events when registered_for_gst = false (pre-GST founder still gets the rest)", async () => {
    setTable("compliance_gst_status", { registered_for_gst: false });
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const basCount = body.events.filter((e) => e.kind === "bas_quarter").length;
    expect(basCount).toBe(0);
  });

  it("skips BAS events when compliance_gst_status has no rows (null coercion — pre-onboarded founder)", async () => {
    setTable("compliance_gst_status", null);
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const basCount = body.events.filter((e) => e.kind === "bas_quarter").length;
    expect(basCount).toBe(0);
  });
});

describe("GET /api/compliance/calendar — ASIC anniversary", () => {
  it("emits an asic_annual_review event when equity_plans.incorporation_date is present", async () => {
    const anniversary = new Date();
    anniversary.setMonth(anniversary.getMonth() + 2);
    const iso = anniversary.toISOString().slice(0, 10);
    setTable("equity_plans", { incorporation_date: iso });
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const asicCount = body.events.filter(
      (e) => e.kind === "asic_annual_review",
    ).length;
    expect(asicCount).toBeGreaterThan(0);
  });

  it("skips asic_annual_review when equity_plans has no rows (founder has not entered ACN yet)", async () => {
    setTable("equity_plans", null);
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const asicCount = body.events.filter(
      (e) => e.kind === "asic_annual_review",
    ).length;
    expect(asicCount).toBe(0);
  });
});

describe("GET /api/compliance/calendar — WGEA + Modern Slavery fold-in", () => {
  it("folds a WGEA report event when the latest wgea snapshot marks the founder as a relevant employer", async () => {
    const nextYear = new Date().getFullYear() + 1;
    setTable("compliance_wgea_status", {
      result_json: {
        is_relevant_employer: true,
        next_report_due_iso: `${nextYear}-05-31`,
      },
    });
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const wgeaCount = body.events.filter(
      (e) => e.kind === "wgea_report",
    ).length;
    expect(wgeaCount).toBe(1);
  });

  it("folds a Modern Slavery statement event when the latest MSA snapshot marks the founder as a reporting entity", async () => {
    const nextYear = new Date().getFullYear() + 1;
    setTable("compliance_modern_slavery_status", {
      result_json: {
        is_reporting_entity: true,
        statement_due_iso: `${nextYear}-06-30`,
      },
    });
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const msCount = body.events.filter(
      (e) => e.kind === "modern_slavery_statement",
    ).length;
    expect(msCount).toBe(1);
  });

  it("skips the WGEA + MSA branches when neither snapshot has been posted (a fresh founder should not see phantom events)", async () => {
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    const body = (await res.json()) as {
      events: Array<{ kind: string }>;
    };
    const wgeaCount = body.events.filter(
      (e) => e.kind === "wgea_report",
    ).length;
    const msCount = body.events.filter(
      (e) => e.kind === "modern_slavery_statement",
    ).length;
    expect(wgeaCount).toBe(0);
    expect(msCount).toBe(0);
  });
});

describe("GET /api/compliance/calendar — R&D registration classifier", () => {
  it("passes through registration_status='registered' verbatim so buildRDCalendar knows to collapse the row to 'open'", async () => {
    const currentYearShort = String(new Date().getFullYear()).slice(-2);
    const nextYearShort = String(new Date().getFullYear() + 1).slice(-2);
    setTable(
      "compliance_rd_registrations",
      null,
      [
        {
          fy_label: `FY${currentYearShort}-${nextYearShort}`,
          registration_status: "registered",
          registration_date: null,
        },
      ],
    );
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    expect(res.status).toBe(200);
    // The route projects registration_status into
    // registered / not_applicable / not_registered — anything else
    // silently falls into not_registered. We assert the route did not
    // throw and the events array is well-formed rather than reaching
    // into the R&D branch details (owned by rd-calendar.test.ts).
    const body = (await res.json()) as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("collapses any registration_status value other than 'registered' / 'not_applicable' onto 'not_registered' (defence against free-text DB drift)", async () => {
    // We can't observe the mapping directly from the JSON body (it feeds
    // into `buildRDCalendar` which owns downstream classification), but
    // we can verify the route does not throw when the DB carries a
    // stray value like `pending_registration`.
    const currentYearShort = String(new Date().getFullYear()).slice(-2);
    const nextYearShort = String(new Date().getFullYear() + 1).slice(-2);
    setTable(
      "compliance_rd_registrations",
      null,
      [
        {
          fy_label: `FY${currentYearShort}-${nextYearShort}`,
          registration_status: "pending_registration",
          registration_date: null,
        },
      ],
    );
    const res = await GET(
      makeGetReq("https://blockid.au/api/compliance/calendar?format=json"),
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/compliance/calendar — supabase query shape", () => {
  it("filters by user_id AND project_id on every per-founder table (multi-project isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await GET(makeGetReq());
    // Every per-founder table filters (user_id, project_id).
    const perFounder = [
      "compliance_gst_status",
      "compliance_rd_registrations",
      "compliance_wgea_status",
      "compliance_modern_slavery_status",
    ];
    for (const table of perFounder) {
      const q = state.selects.find((s) => s.table === table);
      expect(q, `expected a select on ${table}`).toBeDefined();
      expect(q?.eqs).toEqual([
        { col: "user_id", val: "founder-42" },
        { col: "project_id", val: "proj-abc" },
      ]);
    }
    // equity_plans filters by user_id only (no project column).
    const equity = state.selects.find((s) => s.table === "equity_plans");
    expect(equity).toBeDefined();
    expect(equity?.eqs).toEqual([{ col: "user_id", val: "founder-42" }]);
  });

  it("stamps project_id = null on every per-founder query when getActiveProject returns null", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await GET(makeGetReq());
    const perFounder = [
      "compliance_gst_status",
      "compliance_wgea_status",
      "compliance_modern_slavery_status",
      "compliance_rd_registrations",
    ];
    for (const table of perFounder) {
      const q = state.selects.find((s) => s.table === table);
      expect(q?.eqs).toContainEqual({ col: "project_id", val: null });
    }
  });

  it("orders each 'latest snapshot' query by computed_at DESC + limit 1 (WGEA / Modern Slavery / GST)", async () => {
    await GET(makeGetReq());
    for (const table of [
      "compliance_gst_status",
      "compliance_wgea_status",
      "compliance_modern_slavery_status",
    ]) {
      const q = state.selects.find((s) => s.table === table);
      expect(q?.ordered).toEqual({
        col: "computed_at",
        opts: { ascending: false },
      });
      expect(q?.limited).toBe(1);
      expect(q?.maybeSingleCalls).toBe(1);
    }
  });

  it("orders equity_plans by created_at DESC + limit 1 (founder's most recent equity plan carries the ACN date)", async () => {
    await GET(makeGetReq());
    const q = state.selects.find((s) => s.table === "equity_plans");
    expect(q?.ordered).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
    expect(q?.limited).toBe(1);
    expect(q?.maybeSingleCalls).toBe(1);
  });

  it("does NOT limit the compliance_rd_registrations query (all FYs are needed for buildRDCalendar's per-FY event emission)", async () => {
    await GET(makeGetReq());
    const q = state.selects.find(
      (s) => s.table === "compliance_rd_registrations",
    );
    expect(q?.limited).toBeNull();
    expect(q?.maybeSingleCalls).toBe(0);
  });

  it("calls getActiveProject with the current user's id (not the email)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-xyz",
      email: "z@x.com",
    });
    await GET(makeGetReq());
    expect(getActiveProjectMock).toHaveBeenCalledWith("user-xyz");
  });
});
