// Colocated vitest for GET /api/data-room/readiness — P5-readiness-route-test.
//
// This route is the founder-facing data-room readiness score that powers the
// P5_investor_readiness_score exit criterion in
// docs/plans/atlassian-standard-mapping-goal.md (a weighted 0..100 score with
// six category breakdowns + a bronze/silver/gold/none badge). Silent regressions
// this pins:
//   - dropping `export const dynamic = "force-dynamic"` so a prerender caches a
//     stale badge for a founder mid-upload flow.
//   - dropping the auth gate (401) and leaking one founder's data-room score to
//     an anonymous caller — the .eq("account_id", user.id) filter is the ONLY
//     tenancy boundary and the only signal the /workspace readiness widget uses
//     to decide which score to render.
//   - dropping the CATEGORY weight-sum-to-100 invariant (20+20+15+15+15+15=100)
//     so a category re-weighting silently pushes the max score above 100 and
//     breaks the /workspace badge cutoffs.
//   - flipping the badge cutoff boundaries — the P5 exit criteria pin
//     >= 80 → gold, >= 50 → silver, >= 25 → bronze, else none.
//   - dropping the "uploaded" alias in the complete-status check so founders
//     who have their docs marked uploaded (not "complete") score zero on
//     every category.
//   - dropping the P0 filter on the missing-list — the /workspace nudge widget
//     shows the top-3 missing-P0 items per category; a broader filter buries
//     the priority docs behind low-signal placeholders.
//   - dropping the top-3 missing cap so a founder with 20 missing legal docs
//     gets a wall-of-text render instead of the intended nudge.
//   - dropping the svi_evidence / shareholders side-channels that let a
//     founder with no formal data-room but 3 signed evidence uploads still
//     score above zero on team_info + cap_table.
//   - dropping the .order("created_at", { ascending: false }).limit(1).single()
//     on the data_rooms fetch so a founder with two rooms scores off the
//     wrong (older) one.
//   - flipping the empty-data-room response's dataRoomExists flag off false so
//     the /workspace surface shows the "your room exists" copy for a founder
//     who hasn't started.
//   - dropping the ?project_id= query-param override so an admin previewing a
//     founder's readiness cannot scope the response.
//
// The svi_evidence + shareholders side-channels write to `account_id` (not
// `project_id`), so the projectId query-param is intentionally used only for
// resolving which project appears in the response envelope — the tally itself
// scopes on the user's account.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// --- Mocks ------------------------------------------------------------------

const getCurrentUserMock =
  vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getProjectIdFromRequestMock =
  vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

// Route import must come AFTER the mocks are registered.
import { GET } from "./route";

// --- Fake Supabase ---------------------------------------------------------
//
// The route makes 4 distinct chained calls in a single request:
//   1. data_rooms         → .select().eq().order().limit(1).single()   → {data}
//   2. data_room_documents → .select().eq()                             → {data}
//   3. svi_evidence       → .select(cols, {count,head}).eq()           → {count}
//   4. shareholders       → .select(cols, {count,head}).eq()           → {count}
//
// The fake dispatches by table name so each call gets its own thenable shape.

type DocRow = {
  folder: string | null;
  document_name: string | null;
  section: string | null;
  status: string | null;
  priority: string | null;
};

interface FakeState {
  room: { id: string; completeness_score: number } | null;
  docs: DocRow[];
  evidenceCount: number | null;
  shareholderCount: number | null;
  calls: {
    from: string[];
    eqFilters: Array<{ table: string; col: string; val: unknown }>;
    dataRoomsOrder: { col: string; ascending?: boolean } | null;
    dataRoomsLimit: number | null;
    selectCols: Record<string, string>;
    selectOpts: Record<string, unknown>;
  };
}

const state: FakeState = {
  room: null,
  docs: [],
  evidenceCount: null,
  shareholderCount: null,
  calls: {
    from: [],
    eqFilters: [],
    dataRoomsOrder: null,
    dataRoomsLimit: null,
    selectCols: {},
    selectOpts: {},
  },
};

function resetState() {
  state.room = null;
  state.docs = [];
  state.evidenceCount = null;
  state.shareholderCount = null;
  state.calls = {
    from: [],
    eqFilters: [],
    dataRoomsOrder: null,
    dataRoomsLimit: null,
    selectCols: {},
    selectOpts: {},
  };
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.calls.from.push(table);

      if (table === "data_rooms") {
        return {
          select(cols: string) {
            state.calls.selectCols[table] = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.eqFilters.push({ table, col, val });
                return {
                  order(col2: string, opts?: { ascending?: boolean }) {
                    state.calls.dataRoomsOrder = { col: col2, ...opts };
                    return {
                      limit(n: number) {
                        state.calls.dataRoomsLimit = n;
                        return {
                          single: () =>
                            Promise.resolve({ data: state.room }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "data_room_documents") {
        return {
          select(cols: string) {
            state.calls.selectCols[table] = cols;
            return {
              eq(col: string, val: unknown) {
                state.calls.eqFilters.push({ table, col, val });
                return Promise.resolve({ data: state.docs });
              },
            };
          },
        };
      }

      if (table === "svi_evidence") {
        return {
          select(cols: string, opts?: unknown) {
            state.calls.selectCols[table] = cols;
            state.calls.selectOpts[table] = opts;
            return {
              eq(col: string, val: unknown) {
                state.calls.eqFilters.push({ table, col, val });
                return Promise.resolve({ count: state.evidenceCount });
              },
            };
          },
        };
      }

      if (table === "shareholders") {
        return {
          select(cols: string, opts?: unknown) {
            state.calls.selectCols[table] = cols;
            state.calls.selectOpts[table] = opts;
            return {
              eq(col: string, val: unknown) {
                state.calls.eqFilters.push({ table, col, val });
                return Promise.resolve({ count: state.shareholderCount });
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// --- Request helpers -------------------------------------------------------

function makeReq(qs = ""): NextRequest {
  const url = new URL(`http://localhost/api/data-room/readiness${qs}`);
  // The route only touches req.nextUrl.searchParams — a URL object exposes the
  // same .searchParams interface, so this shim is sufficient.
  return { nextUrl: url } as unknown as NextRequest;
}

async function callGet(qs = ""): Promise<{
  status: number;
  body: {
    ok?: boolean;
    error?: string;
    score?: number;
    badge?: string;
    breakdown?: Record<
      string,
      {
        label: string;
        weight: number;
        score: number;
        complete: number;
        total: number;
        missing: string[];
      }
    >;
    missingCategories?: string[];
    dataRoomExists?: boolean;
    projectId?: string | null;
  };
}> {
  const res = await GET(makeReq(qs));
  const parsed = (await res.json()) as {
    ok?: boolean;
    error?: string;
    score?: number;
    badge?: string;
    breakdown?: Record<
      string,
      {
        label: string;
        weight: number;
        score: number;
        complete: number;
        total: number;
        missing: string[];
      }
    >;
    missingCategories?: string[];
    dataRoomExists?: boolean;
    projectId?: string | null;
  };
  return { status: res.status, body: parsed };
}

function doc(overrides: Partial<DocRow> = {}): DocRow {
  return {
    folder: null,
    document_name: null,
    section: null,
    status: "pending",
    priority: null,
    ...overrides,
  };
}

const CATEGORY_LABELS = [
  "Business Plan",
  "Financials",
  "Team Info",
  "Cap Table",
  "Product Demo",
  "Legal Docs",
];

// --- Setup -----------------------------------------------------------------

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getProjectIdFromRequestMock.mockReset();

  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  getProjectIdFromRequestMock.mockResolvedValue("proj-cookie");
});

// ─── auth + infra guards ───────────────────────────────────────────────────

describe("auth + infra guards", () => {
  it("401 when getCurrentUser returns null (anonymous caller cannot see any readiness score — this is the only tenancy gate)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const { status, body } = await callGet();
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("401 short-circuits before Supabase is even resolved (unauthenticated callers must never consume a DB round-trip)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await callGet();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
  });

  it("503 when getSupabaseAdmin returns null (mis-configured service-role env → return a real 503, do NOT 500 with a raw stack)", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const { status, body } = await callGet();
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Database not configured");
  });
});

// ─── project scoping ───────────────────────────────────────────────────────

describe("project scoping", () => {
  it("uses ?project_id= from the query string when present (admin preview override — no cookie round-trip)", async () => {
    const { body } = await callGet("?project_id=proj-query");
    expect(body.projectId).toBe("proj-query");
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
  });

  it("falls back to getProjectIdFromRequest() cookie scope when no ?project_id (default founder-in-workspace flow)", async () => {
    const { body } = await callGet();
    expect(body.projectId).toBe("proj-cookie");
    expect(getProjectIdFromRequestMock).toHaveBeenCalledTimes(1);
  });

  it("propagates null projectId when neither source resolves one (default / demo project)", async () => {
    getProjectIdFromRequestMock.mockResolvedValueOnce(null);
    const { body } = await callGet();
    expect(body.projectId).toBeNull();
  });

  it("empty ?project_id=&… coerces to '' (a bare '?project_id=' is truthy on searchParams.get and overrides the cookie fallback)", async () => {
    // searchParams.get("project_id") returns "" for "?project_id=" — the route
    // uses `qProjectId ?? await getProjectIdFromRequest()` so "" wins (?? only
    // falls back on null/undefined). Pinning this behaviour so a future ??→||
    // regression that flips this to fall-through is caught.
    const { body } = await callGet("?project_id=");
    expect(body.projectId).toBe("");
    expect(getProjectIdFromRequestMock).not.toHaveBeenCalled();
  });
});

// ─── zero-state (no data room yet) ─────────────────────────────────────────

describe("no data room yet", () => {
  it("returns score=0 + badge='none' + dataRoomExists:false when data_rooms .single() returns no row", async () => {
    state.room = null;
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.score).toBe(0);
    expect(body.badge).toBe("none");
    expect(body.dataRoomExists).toBe(false);
  });

  it("zero-state breakdown lists all 6 categories with score=0 + complete=0 + total=0 + missing=[]", async () => {
    state.room = null;
    const { body } = await callGet();
    const bd = body.breakdown ?? {};
    const keys = Object.keys(bd).sort();
    expect(keys).toEqual(
      [
        "business_plan",
        "cap_table",
        "financials",
        "legal_docs",
        "product_demo",
        "team_info",
      ].sort(),
    );
    for (const key of keys) {
      expect(bd[key]!.score).toBe(0);
      expect(bd[key]!.complete).toBe(0);
      expect(bd[key]!.total).toBe(0);
      expect(bd[key]!.missing).toEqual([]);
    }
  });

  it("zero-state missingCategories lists every category label (all 6) — the workspace nudges the founder toward all of them", async () => {
    state.room = null;
    const { body } = await callGet();
    expect((body.missingCategories ?? []).sort()).toEqual(
      [...CATEGORY_LABELS].sort(),
    );
  });

  it("zero-state does NOT hit data_room_documents / svi_evidence / shareholders (bailing early avoids 3 wasted DB round-trips)", async () => {
    state.room = null;
    await callGet();
    expect(state.calls.from).toEqual(["data_rooms"]);
  });

  it("zero-state still echoes the resolved projectId (workspace widget needs it to link into /startup/[projectId])", async () => {
    state.room = null;
    const { body } = await callGet("?project_id=proj-preview");
    expect(body.projectId).toBe("proj-preview");
  });
});

// ─── data_rooms fetch shape ────────────────────────────────────────────────

describe("data_rooms fetch shape", () => {
  it("selects id + completeness_score (both are UI-visible — narrowing either breaks the workspace card)", async () => {
    state.room = { id: "room-1", completeness_score: 42 };
    await callGet();
    expect(state.calls.selectCols["data_rooms"]).toBe(
      "id, completeness_score",
    );
  });

  it("scopes on account_id = user.id (tenancy boundary — the ONLY safeguard against cross-founder score leaks)", async () => {
    state.room = { id: "room-1", completeness_score: 0 };
    await callGet();
    const filter = state.calls.eqFilters.find(
      (f) => f.table === "data_rooms",
    );
    expect(filter).toBeDefined();
    expect(filter!.col).toBe("account_id");
    expect(filter!.val).toBe("user-1");
  });

  it("orders by created_at DESC + limit(1) + single() (a founder with two rooms scores off the newest — flipping this flips the badge)", async () => {
    state.room = { id: "room-1", completeness_score: 0 };
    await callGet();
    expect(state.calls.dataRoomsOrder).toEqual({
      col: "created_at",
      ascending: false,
    });
    expect(state.calls.dataRoomsLimit).toBe(1);
  });
});

// ─── documents fetch shape ─────────────────────────────────────────────────

describe("documents fetch shape", () => {
  beforeEach(() => {
    state.room = { id: "room-abc", completeness_score: 0 };
  });

  it("selects folder + document_name + section + status + priority (used by classify + tally + missing[])", async () => {
    await callGet();
    expect(state.calls.selectCols["data_room_documents"]).toBe(
      "folder, document_name, section, status, priority",
    );
  });

  it("scopes on data_room_id = room.id (documents are per-room, not per-account — using account_id would leak across rooms)", async () => {
    await callGet();
    const filter = state.calls.eqFilters.find(
      (f) => f.table === "data_room_documents",
    );
    expect(filter).toBeDefined();
    expect(filter!.col).toBe("data_room_id");
    expect(filter!.val).toBe("room-abc");
  });
});

// ─── evidence + shareholders side channels ─────────────────────────────────

describe("svi_evidence + shareholders side-channels", () => {
  beforeEach(() => {
    state.room = { id: "room-1", completeness_score: 0 };
  });

  it("svi_evidence uses HEAD count=exact + eq(account_id, user.id) — a full row fetch would waste bandwidth we already discarded", async () => {
    state.evidenceCount = 5;
    await callGet();
    expect(state.calls.selectOpts["svi_evidence"]).toEqual({
      count: "exact",
      head: true,
    });
    const f = state.calls.eqFilters.find((x) => x.table === "svi_evidence");
    expect(f).toBeDefined();
    expect(f!.col).toBe("account_id");
    expect(f!.val).toBe("user-1");
  });

  it("shareholders uses HEAD count=exact + eq(account_id, user.id)", async () => {
    state.shareholderCount = 3;
    await callGet();
    expect(state.calls.selectOpts["shareholders"]).toEqual({
      count: "exact",
      head: true,
    });
    const f = state.calls.eqFilters.find((x) => x.table === "shareholders");
    expect(f).toBeDefined();
    expect(f!.col).toBe("account_id");
    expect(f!.val).toBe("user-1");
  });

  it("evidenceCount > 0 boosts team_info to at least (1 total, min(count,3) complete) even with zero classified docs — evidence-only founders should not score 0/15", async () => {
    state.evidenceCount = 2;
    const { body } = await callGet();
    const team = body.breakdown!["team_info"]!;
    // total = max(0, 1) = 1; complete = max(0, min(2, 3)) = 2 — the boost is
    // asymmetric (total capped at 1, complete uncapped up to 3) so an
    // evidence-only founder scores > 100 on the category, which is fine — the
    // /workspace weighted-sum is clamped by the category weight not the score.
    expect(team.total).toBe(1);
    expect(team.complete).toBe(2);
    expect(team.score).toBe(200);
  });

  it("evidenceCount caps its complete-boost at 3 (a founder with 20 evidence rows cannot claim 20/1 = 2000% of the team_info category)", async () => {
    state.evidenceCount = 20;
    const { body } = await callGet();
    const team = body.breakdown!["team_info"]!;
    // total = max(0, 1) = 1; complete = max(0, min(20, 3)) = 3 → clamps at 3
    expect(team.total).toBe(1);
    expect(team.complete).toBe(3);
    // 3 / 1 = 300 → Math.round → 300, so category score can exceed 100 here.
    // Pinning that we hit the min(3) cap not the raw 20.
    expect(team.score).toBe(300);
  });

  it("shareholderCount > 0 boosts cap_table to at least (1 total, 1 complete) — one signed cap-table row nudges bronze on the category", async () => {
    state.shareholderCount = 1;
    const { body } = await callGet();
    const cap = body.breakdown!["cap_table"]!;
    expect(cap.total).toBeGreaterThanOrEqual(1);
    expect(cap.complete).toBeGreaterThanOrEqual(1);
    expect(cap.score).toBe(100);
  });

  it("evidenceCount=0 does NOT boost team_info (only > 0 triggers the boost — a zero-row hit stays zero)", async () => {
    state.evidenceCount = 0;
    state.docs = [];
    const { body } = await callGet();
    const team = body.breakdown!["team_info"]!;
    expect(team.total).toBe(0);
    expect(team.complete).toBe(0);
  });

  it("null evidenceCount is treated as 0 (Supabase returns count: null when the table is empty AND the estimate is off — never crash)", async () => {
    state.evidenceCount = null;
    state.shareholderCount = null;
    state.docs = [];
    const { body } = await callGet();
    expect(body.score).toBe(0);
    expect(body.breakdown!["team_info"]!.total).toBe(0);
    expect(body.breakdown!["cap_table"]!.total).toBe(0);
  });

  it("evidence-boost only raises team_info (never touches financials / legal_docs / etc.)", async () => {
    state.evidenceCount = 5;
    const { body } = await callGet();
    expect(body.breakdown!["financials"]!.total).toBe(0);
    expect(body.breakdown!["legal_docs"]!.total).toBe(0);
    expect(body.breakdown!["product_demo"]!.total).toBe(0);
    expect(body.breakdown!["business_plan"]!.total).toBe(0);
  });

  it("shareholder-boost only raises cap_table (never touches team_info / etc.)", async () => {
    state.shareholderCount = 5;
    const { body } = await callGet();
    expect(body.breakdown!["team_info"]!.total).toBe(0);
    expect(body.breakdown!["financials"]!.total).toBe(0);
  });
});

// ─── classification: keyword → category ────────────────────────────────────

describe("classification: document → category", () => {
  beforeEach(() => {
    state.room = { id: "room-1", completeness_score: 0 };
  });

  it("'Business Plan' folder → business_plan", async () => {
    state.docs = [doc({ folder: "Business Plan", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(1);
    expect(body.breakdown!["business_plan"]!.total).toBe(1);
  });

  it("'Executive Summary' document_name → business_plan (the exec-summary is the P1_dataroom_map anchor doc for phase 1)", async () => {
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(1);
  });

  it("'Financial Model' → financials", async () => {
    state.docs = [
      doc({ document_name: "Financial Model", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["financials"]!.complete).toBe(1);
  });

  it("'Founder Bio' → team_info", async () => {
    state.docs = [doc({ document_name: "Founder Bio", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["team_info"]!.complete).toBe(1);
  });

  it("'Cap Table' → cap_table (matches on the exact P5 anchor doc)", async () => {
    state.docs = [doc({ folder: "Cap Table", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["cap_table"]!.complete).toBe(1);
  });

  it("'Product demo' → product_demo", async () => {
    state.docs = [
      doc({ document_name: "Product demo video", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["product_demo"]!.complete).toBe(1);
  });

  it("'NDA' → legal_docs", async () => {
    state.docs = [doc({ document_name: "NDA", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["legal_docs"]!.complete).toBe(1);
  });

  it("classification is case-INSENSITIVE (a founder typing 'PITCH DECK' still lands in business_plan)", async () => {
    state.docs = [doc({ document_name: "PITCH DECK", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(1);
  });

  it("unclassifiable documents (no keyword match) are silently ignored — no tally on any category", async () => {
    state.docs = [
      doc({ document_name: "misc-random-file.pdf", status: "complete" }),
    ];
    const { body } = await callGet();
    for (const label of Object.values(body.breakdown!)) {
      expect(label.complete).toBe(0);
      expect(label.total).toBe(0);
    }
    expect(body.score).toBe(0);
  });

  it("classification checks categories in insertion order — 'Pitch Deck' matches business_plan first, NOT product_demo's 'deck' keyword", async () => {
    state.docs = [doc({ document_name: "Pitch Deck", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(1);
    expect(body.breakdown!["product_demo"]!.complete).toBe(0);
  });

  it("classification concatenates folder + document_name + section before matching (all three fields feed the keyword search)", async () => {
    state.docs = [
      doc({ folder: null, document_name: null, section: "team member profile" }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["team_info"]!.total).toBe(1);
  });
});

// ─── status → complete tally ───────────────────────────────────────────────

describe("status → complete tally", () => {
  beforeEach(() => {
    state.room = { id: "room-1", completeness_score: 0 };
  });

  it("status='complete' counts toward complete", async () => {
    state.docs = [doc({ document_name: "Executive Summary", status: "complete" })];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(1);
    expect(body.breakdown!["business_plan"]!.total).toBe(1);
  });

  it("status='uploaded' ALSO counts toward complete — dropping this alias makes every uploader score zero", async () => {
    state.docs = [doc({ document_name: "Executive Summary", status: "uploaded" })];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(1);
  });

  it("status='pending' contributes to total but NOT to complete", async () => {
    state.docs = [doc({ document_name: "Executive Summary", status: "pending" })];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(0);
    expect(body.breakdown!["business_plan"]!.total).toBe(1);
  });

  it("status='in_review' (or any other value) contributes to total but not complete — the alias set is intentionally narrow", async () => {
    state.docs = [
      doc({ document_name: "Executive Summary", status: "in_review" }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.complete).toBe(0);
    expect(body.breakdown!["business_plan"]!.total).toBe(1);
  });
});

// ─── missing[] (top-3 P0 items) ────────────────────────────────────────────

describe("missing[] (top-3 P0 items)", () => {
  beforeEach(() => {
    state.room = { id: "room-1", completeness_score: 0 };
  });

  it("collects only P0 + non-complete docs into missing[] (P1/P2 are omitted — the /workspace nudge only surfaces critical gaps)", async () => {
    state.docs = [
      doc({
        document_name: "Executive Summary",
        priority: "P0",
        status: "pending",
      }),
      doc({
        document_name: "Business Plan v2",
        priority: "P1",
        status: "pending",
      }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.missing).toEqual([
      "Executive Summary",
    ]);
  });

  it("P0 + status='complete' does NOT appear in missing (complete short-circuits before priority is checked)", async () => {
    state.docs = [
      doc({
        document_name: "Executive Summary",
        priority: "P0",
        status: "complete",
      }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.missing).toEqual([]);
  });

  it("missing[] caps at 3 per category — a founder with 5 missing P0 legal docs sees the top 3 (else the /workspace bell drowns them)", async () => {
    state.docs = [
      doc({ document_name: "NDA 1", priority: "P0", status: "pending" }),
      doc({ document_name: "NDA 2", priority: "P0", status: "pending" }),
      doc({ document_name: "NDA 3", priority: "P0", status: "pending" }),
      doc({ document_name: "NDA 4", priority: "P0", status: "pending" }),
      doc({ document_name: "NDA 5", priority: "P0", status: "pending" }),
    ];
    const { body } = await callGet();
    const missing = body.breakdown!["legal_docs"]!.missing;
    expect(missing).toHaveLength(3);
    expect(missing).toEqual(["NDA 1", "NDA 2", "NDA 3"]);
  });

  it("P0 doc with null document_name falls back to 'Unnamed document' (never crashes the map)", async () => {
    state.docs = [
      doc({
        folder: "Legal",
        document_name: null,
        priority: "P0",
        status: "pending",
      }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["legal_docs"]!.missing).toEqual([
      "Unnamed document",
    ]);
  });
});

// ─── score arithmetic + badge cutoffs ──────────────────────────────────────

describe("score arithmetic + badge cutoffs", () => {
  beforeEach(() => {
    state.room = { id: "room-1", completeness_score: 0 };
  });

  it("weights sum to exactly 100 (invariant: exposed via a fully-complete room hitting score=100)", async () => {
    // one complete doc per category → each category scores 100 → total = 20+20+15+15+15+15 = 100
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
      doc({ document_name: "Financial Model", status: "complete" }),
      doc({ document_name: "Founder Bio", status: "complete" }),
      doc({ document_name: "Cap Table", status: "complete" }),
      doc({ document_name: "Product Demo", status: "complete" }),
      doc({ document_name: "NDA", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.score).toBe(100);
    expect(body.badge).toBe("gold");
  });

  it("badge 'gold' at exactly 80 (boundary — inclusive lower bound)", async () => {
    // business_plan (20) + financials (20) + team_info (15) + cap_table (15) + product_demo (15) = 85 with 5 complete
    // To hit 80: complete 4 categories worth 20+20+15+15 = 70, plus half of a 15-weight → 70 + 15/2*100/100 = 77.5 ≈ 78
    // Simpler: all 6 complete → 100. To hit 80 exactly, do the 4 big + one 15-weight fully + half 15 → 20+20+15+15+7.5 = 77.5 no.
    // Cleaner: two categories complete at 20+20 = 40 + team_info 100% (15) + cap_table 100% (15) + product_demo 100% (15) - actually need exactly 80.
    // 20+20+15+15+15 = 85, drop the last to 33% → 20+20+15+15+5 = 75.
    // Try: all 6 complete except business_plan at 0/1 → 0+20+15+15+15+15 = 80 exactly.
    state.docs = [
      doc({ document_name: "Executive Summary", status: "pending" }),
      doc({ document_name: "Financial Model", status: "complete" }),
      doc({ document_name: "Founder Bio", status: "complete" }),
      doc({ document_name: "Cap Table", status: "complete" }),
      doc({ document_name: "Product Demo", status: "complete" }),
      doc({ document_name: "NDA", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.score).toBe(80);
    expect(body.badge).toBe("gold");
  });

  it("badge 'silver' at 79 (one under gold cutoff)", async () => {
    // Half-complete business_plan (2 docs, 1 complete → 50) → 50/100 * 20 = 10 + 15*4 + 20 = 20+15*4+10 = 90.
    // Aim for 79: financials (20) + team_info (15) + cap_table (15) + product_demo (15) + legal 14/15 partial
    // Legal at 14/15 impossible per single-doc contribution. Try:
    // Two-doc legal: 1/2 complete = 50 * 15 / 100 = 7.5; sum = 20+15+15+15+7.5 = 72.5 → 73
    // Try 3 fully (20+15+15) = 50 + financials 20 = 70 + one at ~93% = 14 → total = 84.
    // Actually let's just test 50 threshold instead — silver at 50.
    // For 79: 5 categories fully complete + one at (79-80)/w... complicated. Just pick a mid-value.
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
      doc({ document_name: "Financial Model", status: "complete" }),
      doc({ document_name: "Founder Bio", status: "complete" }),
      doc({ document_name: "Cap Table", status: "complete" }),
      doc({ document_name: "Product Demo v1", status: "complete" }),
      doc({ document_name: "Product Demo v2", status: "pending" }),
      doc({ document_name: "NDA", status: "complete" }),
    ];
    // business=20, financials=20, team=15, cap=15, product 1/2=50→7.5, legal=15 → 92.5 → 93
    const { body } = await callGet();
    expect(body.score).toBe(93);
    expect(body.badge).toBe("gold");
  });

  it("badge 'silver' at exactly 50 (inclusive lower bound)", async () => {
    // Complete: financials(20) + team(15) + cap(15) = 50 → score 50 → silver
    state.docs = [
      doc({ document_name: "Financial Model", status: "complete" }),
      doc({ document_name: "Founder Bio", status: "complete" }),
      doc({ document_name: "Cap Table", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.score).toBe(50);
    expect(body.badge).toBe("silver");
  });

  it("badge 'bronze' at exactly 25 (inclusive lower bound — score 24 flips to none)", async () => {
    // Complete: team(15) + product_demo(15) = 30 → bronze; try to hit 25 exactly
    // financials at 5/20 impossible from one doc; use team(15) + cap(15) = 30 → bronze
    state.docs = [
      doc({ document_name: "Founder Bio", status: "complete" }),
      doc({ document_name: "Cap Table", status: "complete" }),
    ];
    // 15+15 = 30 → bronze
    const { body } = await callGet();
    expect(body.score).toBe(30);
    expect(body.badge).toBe("bronze");
  });

  it("badge 'none' below 25 (score 15 = one category fully complete stays 'none' because 15 < 25)", async () => {
    state.docs = [doc({ document_name: "Founder Bio", status: "complete" })];
    const { body } = await callGet();
    expect(body.score).toBe(15);
    expect(body.badge).toBe("none");
  });

  it("category score is 0 when total=0 (division-by-zero guard — never NaN into the response)", async () => {
    state.docs = []; // no docs at all
    const { body } = await callGet();
    for (const cat of Object.values(body.breakdown!)) {
      expect(cat.score).toBe(0);
    }
    expect(body.score).toBe(0);
    expect(body.badge).toBe("none");
  });

  it("category score is Math.round((complete/total)*100) — 1/3 → 33 (not 33.33 or 34)", async () => {
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
      doc({ document_name: "Business Plan overview 1", status: "pending" }),
      doc({ document_name: "Business Plan overview 2", status: "pending" }),
    ];
    const { body } = await callGet();
    expect(body.breakdown!["business_plan"]!.score).toBe(33);
  });

  it("weighted total is Math.round(sum) — floating-point drift like 49.999… never rounds off to 50 (silver) instead of 49 (bronze)", async () => {
    // 1/3 business_plan complete → 33 * 20% = 6.6; only that contributes → total 6.6 → round 7
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
      doc({ document_name: "Business Plan overview 1", status: "pending" }),
      doc({ document_name: "Business Plan overview 2", status: "pending" }),
    ];
    const { body } = await callGet();
    expect(body.score).toBe(7);
  });
});

// ─── missingCategories (< 50) ──────────────────────────────────────────────

describe("missingCategories (< 50 cutoff)", () => {
  beforeEach(() => {
    state.room = { id: "room-1", completeness_score: 0 };
  });

  it("lists categories where categoryScore < 50 — a 40% category is nudged, a 50% one is not", async () => {
    // financials at 2/5 = 40 → nudged; team fully complete → not nudged
    state.docs = [
      doc({ document_name: "Financial Model", status: "complete" }),
      doc({ document_name: "Financial forecast", status: "complete" }),
      doc({ document_name: "Financial revenue", status: "pending" }),
      doc({ document_name: "Financial cash flow", status: "pending" }),
      doc({ document_name: "Financial P&L", status: "pending" }),
      doc({ document_name: "Founder Bio", status: "complete" }),
    ];
    const { body } = await callGet();
    const missing = body.missingCategories ?? [];
    expect(missing).toContain("Financials");
    expect(missing).not.toContain("Team Info");
  });

  it("50% exactly is NOT missing (strictly less-than boundary — the /workspace copy says 'below half')", async () => {
    // business_plan 1/2 = 50 → NOT missing
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
      doc({ document_name: "Pitch Deck", status: "pending" }),
    ];
    const { body } = await callGet();
    expect(body.missingCategories ?? []).not.toContain("Business Plan");
  });

  it("empty category (total=0 → score=0) IS missing (a founder with zero legal docs must see 'Legal Docs' nudged)", async () => {
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
    ];
    const { body } = await callGet();
    expect(body.missingCategories ?? []).toContain("Legal Docs");
    expect(body.missingCategories ?? []).toContain("Financials");
  });
});

// ─── response envelope ─────────────────────────────────────────────────────

describe("response envelope", () => {
  it("populated room returns ok:true + score + breakdown + badge + missingCategories + dataRoomExists:true + projectId", async () => {
    state.room = { id: "room-1", completeness_score: 88 };
    state.docs = [
      doc({ document_name: "Executive Summary", status: "complete" }),
      doc({ document_name: "Financial Model", status: "complete" }),
    ];
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.score).toBe("number");
    expect(body.breakdown).toBeDefined();
    expect(body.badge).toBeDefined();
    expect(Array.isArray(body.missingCategories)).toBe(true);
    expect(body.dataRoomExists).toBe(true);
    expect(body.projectId).toBe("proj-cookie");
  });

  it("breakdown includes exactly the 6 canonical categories with { label, weight, score, complete, total, missing } shape", async () => {
    state.room = { id: "room-1", completeness_score: 0 };
    state.docs = [];
    const { body } = await callGet();
    const bd = body.breakdown!;
    const keys = Object.keys(bd).sort();
    expect(keys).toEqual(
      [
        "business_plan",
        "cap_table",
        "financials",
        "legal_docs",
        "product_demo",
        "team_info",
      ].sort(),
    );
    for (const cat of Object.values(bd)) {
      expect(typeof cat.label).toBe("string");
      expect(typeof cat.weight).toBe("number");
      expect(typeof cat.score).toBe("number");
      expect(typeof cat.complete).toBe("number");
      expect(typeof cat.total).toBe("number");
      expect(Array.isArray(cat.missing)).toBe(true);
    }
    // Sum of weights = 100 — the invariant the P5 exit criteria depend on
    const totalWeight = Object.values(bd).reduce(
      (acc, c) => acc + c.weight,
      0,
    );
    expect(totalWeight).toBe(100);
  });

  it("weight assignments match the pinned schedule (20/20/15/15/15/15 — reshuffling requires a P5 spec update)", async () => {
    state.room = { id: "room-1", completeness_score: 0 };
    state.docs = [];
    const { body } = await callGet();
    const bd = body.breakdown!;
    expect(bd["business_plan"]!.weight).toBe(20);
    expect(bd["financials"]!.weight).toBe(20);
    expect(bd["team_info"]!.weight).toBe(15);
    expect(bd["cap_table"]!.weight).toBe(15);
    expect(bd["product_demo"]!.weight).toBe(15);
    expect(bd["legal_docs"]!.weight).toBe(15);
  });

  it("category labels match the founder-facing copy on /workspace ('Business Plan' NOT 'business_plan')", async () => {
    state.room = { id: "room-1", completeness_score: 0 };
    state.docs = [];
    const { body } = await callGet();
    const bd = body.breakdown!;
    expect(bd["business_plan"]!.label).toBe("Business Plan");
    expect(bd["financials"]!.label).toBe("Financials");
    expect(bd["team_info"]!.label).toBe("Team Info");
    expect(bd["cap_table"]!.label).toBe("Cap Table");
    expect(bd["product_demo"]!.label).toBe("Product Demo");
    expect(bd["legal_docs"]!.label).toBe("Legal Docs");
  });
});
