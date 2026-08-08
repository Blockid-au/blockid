// Colocated vitest for POST + GET /api/compliance/s708 —
// P9-compliance-s708-route-test.
//
// The route captures a Corporations Act 2001 s708(8) sophisticated / wholesale
// investor certificate against the founder's active project and mirrors it
// into dataroom_files under SVI dimension "Compliance". Silent regressions
// this pins against:
//   - dropping the POST/GET auth gate (anon could pollute the compliance table
//     with null user_id rows and read other founders' investor lists);
//   - dropping the JSON try/catch so a text/plain body 500s instead of 400;
//   - dropping the normaliseCert try/catch so a bad payload 500s instead of
//     400 validation_failed + the Error.message the founder form renders;
//   - dropping the no-DB early return that lets the mapping still work when
//     supabase is unconfigured (developer laptops, first-boot);
//   - swapping the mirror-first ordering so the cert row lacks a
//     dataroom_file_id FK (breaks the "open cert PDF from the data room"
//     surface);
//   - swapping the two hard-coded strings dataroom mirror depends on —
//     DATAROOM_MIME ("application/vnd.blockid.compliance-cert") and
//     DATAROOM_DIMENSION ("Compliance") — dropping either silently reroutes
//     the mirror out of the compliance filter in the data-room UI and out of
//     the Atlassian populate engine's mime-marker classifier;
//   - dropping the file_name template `s708(8) - <email>` (the UI renders that
//     literal prefix as the badge on the compliance dataroom card);
//   - dropping the certErr → 500 insert_failed branch (would silently return
//     ok:true with a phantom record the DB never accepted);
//   - dropping S708_DISCLAIMER from any of the six response envelopes (this
//     is the AFSL not-legal-advice wording that MUST accompany every s708
//     response — see the module comment on s708-wholesale.ts);
//   - swapping the GET .order() to ascending (the UI assumes newest first);
//   - dropping the getActiveProject → project_id linkage on GET (a founder
//     with two projects would see the other project's investor list — GDPR-
//     adjacent leak across the multi-project split);
//   - dropping the `export const dynamic = "force-dynamic"` and having Next
//     prerender a per-user compliance response into the static shell.

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

import { S708_DISCLAIMER } from "@/lib/compliance/s708-wholesale";
import { GET, POST, dynamic } from "./route";

interface ChainRecord {
  table: string;
  op: "insert" | "select" | null;
  insertRow: Record<string, unknown> | null;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  maybeSingleCalled: boolean;
}

interface FakeState {
  chains: ChainRecord[];
  dataroomInsertResult: { data: { id: string } | null; error: unknown };
  certInsertResult: {
    data: { id: string; cert_date: string; expiry_date: string } | null;
    error: { message: string } | null;
  };
  listRows: Array<Record<string, unknown>>;
  listError: unknown;
}

const state: FakeState = {
  chains: [],
  dataroomInsertResult: { data: { id: "dr-1" }, error: null },
  certInsertResult: {
    data: { id: "cert-1", cert_date: "2026-08-01", expiry_date: "2028-08-01" },
    error: null,
  },
  listRows: [],
  listError: null,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      const chain: ChainRecord = {
        table,
        op: null,
        insertRow: null,
        selectCols: null,
        eqCalls: [],
        orderCol: null,
        orderOpts: null,
        maybeSingleCalled: false,
      };
      state.chains.push(chain);

      const api = {
        insert(row: Record<string, unknown>) {
          chain.op = "insert";
          chain.insertRow = row;
          return api;
        },
        select(cols: string) {
          chain.op = chain.op ?? "select";
          chain.selectCols = cols;
          return api;
        },
        eq(col: string, val: unknown) {
          chain.eqCalls.push({ col, val });
          return api;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          chain.orderCol = col;
          chain.orderOpts = opts ?? null;
          return Promise.resolve({
            data: state.listRows,
            error: state.listError,
          });
        },
        maybeSingle() {
          chain.maybeSingleCalled = true;
          if (chain.table === "dataroom_files") {
            return Promise.resolve(state.dataroomInsertResult);
          }
          return Promise.resolve(state.certInsertResult);
        },
      };
      return api;
    },
  };
}

function resetState() {
  state.chains.length = 0;
  state.dataroomInsertResult = { data: { id: "dr-1" }, error: null };
  state.certInsertResult = {
    data: { id: "cert-1", cert_date: "2026-08-01", expiry_date: "2028-08-01" },
    error: null,
  };
  state.listRows = [];
  state.listError = null;
}

function makePostReq(body: unknown, opts: { rawText?: string } = {}): Request {
  return {
    json: async () => {
      if (opts.rawText !== undefined) throw new Error("invalid JSON");
      return body;
    },
  } as unknown as Request;
}

const VALID_BODY = {
  investor_email: "investor@example.com",
  certifying_accountant_name: "Jane Doe",
  certifying_accountant_firm: "Doe & Partners CA",
  cert_type: "net_assets" as const,
  cert_date: "2026-08-01",
  evidence_url: "https://drive.example.com/cert.pdf",
};

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
  it('exports dynamic = "force-dynamic" so per-user compliance never prerenders into the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/compliance/s708 — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: S708_DISCLAIMER,
    });
  });

  it("does NOT parse the request body on the anonymous branch (auth short-circuits before .json())", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const jsonSpy = vi.fn().mockResolvedValue(VALID_BODY);
    const req = { json: jsonSpy } as unknown as Request;
    await POST(req);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("does NOT touch supabase or getActiveProject on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.chains.length).toBe(0);
  });
});

describe("POST /api/compliance/s708 — invalid JSON branch", () => {
  it("returns 400 { ok:false, error:'invalid_json', disclaimer } when the body is not JSON-parseable", async () => {
    const res = await POST(makePostReq(undefined, { rawText: "not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "invalid_json",
      disclaimer: S708_DISCLAIMER,
    });
  });

  it("does NOT insert into any table when the body was unparseable", async () => {
    await POST(makePostReq(undefined, { rawText: "garbage" }));
    expect(state.chains.filter((c) => c.op === "insert")).toEqual([]);
  });
});

describe("POST /api/compliance/s708 — validation branch (normaliseCert throws)", () => {
  it("returns 400 error='validation_failed' + the Error.message + disclaimer when investor_email is not an email", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, investor_email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("investor_email");
    expect(body.disclaimer).toBe(S708_DISCLAIMER);
  });

  it("returns 400 validation_failed when cert_type is neither 'net_assets' nor 'gross_income'", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, cert_type: "vibes_only" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("cert_type");
  });

  it("returns 400 validation_failed when cert_date is not an ISO YYYY-MM-DD", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, cert_date: "01/08/2026" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("YYYY-MM-DD");
  });

  it("returns 400 validation_failed when caller-supplied expiry_date exceeds the s708 2-year cap", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, expiry_date: "2030-01-01" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("2-year cap");
  });

  it("does NOT touch supabase when normaliseCert threw (validation is pure — DB is never asked)", async () => {
    await POST(makePostReq({ ...VALID_BODY, investor_email: "bad" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.chains.length).toBe(0);
  });
});

describe("POST /api/compliance/s708 — supabase-unavailable branch", () => {
  it("returns 200 { ok:true, record, meta:{source:'no_db'}, disclaimer } when supabase is unconfigured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.meta).toEqual({ source: "no_db" });
    expect(body.record.investor_email).toBe("investor@example.com");
    expect(body.disclaimer).toBe(S708_DISCLAIMER);
  });

  it("does NOT call getActiveProject when supabase is null (no point looking up a project with nowhere to write it)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.chains.length).toBe(0);
  });
});

describe("POST /api/compliance/s708 — supabase happy path", () => {
  it("mirrors into dataroom_files BEFORE inserting the cert (so cert row can persist the dataroom FK)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChains = state.chains.filter((c) => c.op === "insert");
    expect(insertChains.length).toBe(2);
    expect(insertChains[0].table).toBe("dataroom_files");
    expect(insertChains[1].table).toBe("compliance_s708_certs");
  });

  it("stamps the dataroom mirror row with the fixed compliance dimension + custom mime marker", async () => {
    await POST(makePostReq(VALID_BODY));
    const drChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "dataroom_files",
    );
    expect(drChain?.insertRow?.svi_dimension).toBe("Compliance");
    expect(drChain?.insertRow?.mime_type).toBe(
      "application/vnd.blockid.compliance-cert",
    );
    expect(drChain?.insertRow?.status).toBe("indexed");
  });

  it("names the dataroom mirror row `s708(8) - <investor_email>` (the badge template the UI renders verbatim)", async () => {
    await POST(makePostReq(VALID_BODY));
    const drChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "dataroom_files",
    );
    expect(drChain?.insertRow?.file_name).toBe(
      "s708(8) - investor@example.com",
    );
  });

  it("passes the founder's user_id + email into the dataroom mirror row (RLS scoping for the data room view)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "founder@x.com",
    });
    await POST(makePostReq(VALID_BODY));
    const drChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "dataroom_files",
    );
    expect(drChain?.insertRow?.user_id).toBe("founder-42");
    expect(drChain?.insertRow?.email).toBe("founder@x.com");
  });

  it("copies evidence_url through to dataroom_files.drive_file_url so the data-room card links straight to the PDF", async () => {
    await POST(makePostReq(VALID_BODY));
    const drChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "dataroom_files",
    );
    expect(drChain?.insertRow?.drive_file_url).toBe(
      "https://drive.example.com/cert.pdf",
    );
  });

  it("stamps the cert row with dataroom_file_id from the returned mirror id (FK back to the compliance data-room card)", async () => {
    state.dataroomInsertResult = { data: { id: "dr-xyz" }, error: null };
    await POST(makePostReq(VALID_BODY));
    const certChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "compliance_s708_certs",
    );
    expect(certChain?.insertRow?.dataroom_file_id).toBe("dr-xyz");
  });

  it("stamps dataroom_file_id = null when the mirror insert returned no row (partial failure — cert still lands)", async () => {
    state.dataroomInsertResult = { data: null, error: null };
    await POST(makePostReq(VALID_BODY));
    const certChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "compliance_s708_certs",
    );
    expect(certChain?.insertRow?.dataroom_file_id).toBeNull();
  });

  it("stamps the cert row with user_id from getCurrentUser and project_id from getActiveProject", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await POST(makePostReq(VALID_BODY));
    const certChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "compliance_s708_certs",
    );
    expect(certChain?.insertRow?.user_id).toBe("founder-42");
    expect(certChain?.insertRow?.project_id).toBe("proj-abc");
  });

  it("stamps project_id = null when the founder has no active project (pre-project solo state)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await POST(makePostReq(VALID_BODY));
    const certChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "compliance_s708_certs",
    );
    expect(certChain?.insertRow?.project_id).toBeNull();
  });

  it("copies the normalised cert fields into the compliance_s708_certs row (audit trail — never mutated)", async () => {
    await POST(makePostReq(VALID_BODY));
    const certChain = state.chains.find(
      (c) => c.op === "insert" && c.table === "compliance_s708_certs",
    );
    expect(certChain?.insertRow?.investor_email).toBe(
      "investor@example.com",
    );
    expect(certChain?.insertRow?.certifying_accountant_name).toBe("Jane Doe");
    expect(certChain?.insertRow?.certifying_accountant_firm).toBe(
      "Doe & Partners CA",
    );
    expect(certChain?.insertRow?.cert_type).toBe("net_assets");
    expect(certChain?.insertRow?.cert_date).toBe("2026-08-01");
    expect(certChain?.insertRow?.expiry_date).toBe("2028-08-01");
    expect(certChain?.insertRow?.evidence_url).toBe(
      "https://drive.example.com/cert.pdf",
    );
  });

  it("returns 200 { ok:true, record: {..., id}, dataroom_file_id, disclaimer } on the happy path", async () => {
    state.dataroomInsertResult = { data: { id: "dr-9" }, error: null };
    state.certInsertResult = {
      data: {
        id: "cert-9",
        cert_date: "2026-08-01",
        expiry_date: "2028-08-01",
      },
      error: null,
    };
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.record.id).toBe("cert-9");
    expect(body.record.investor_email).toBe("investor@example.com");
    expect(body.dataroom_file_id).toBe("dr-9");
    expect(body.disclaimer).toBe(S708_DISCLAIMER);
  });
});

describe("POST /api/compliance/s708 — cert insert failure branch", () => {
  it("returns 500 { ok:false, error:'insert_failed', message, disclaimer } when the cert insert errors", async () => {
    state.certInsertResult = {
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    };
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "insert_failed",
      message: "duplicate key value violates unique constraint",
      disclaimer: S708_DISCLAIMER,
    });
  });
});

describe("GET /api/compliance/s708 — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: S708_DISCLAIMER,
    });
  });

  it("does NOT touch supabase or getActiveProject on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.chains.length).toBe(0);
  });
});

describe("GET /api/compliance/s708 — supabase-unavailable branch", () => {
  it("returns 200 { ok:true, certs:[], summary, disclaimer } when supabase is unconfigured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.certs).toEqual([]);
    expect(body.summary.total).toBe(0);
    expect(body.summary.has_valid_or_expiring).toBe(false);
    expect(body.disclaimer).toBe(S708_DISCLAIMER);
  });
});

describe("GET /api/compliance/s708 — supabase happy path", () => {
  it("scopes the list query to compliance_s708_certs by user_id AND project_id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await GET();
    const listChain = state.chains.find(
      (c) => c.op === "select" && c.table === "compliance_s708_certs",
    );
    expect(listChain?.eqCalls).toEqual([
      { col: "user_id", val: "founder-42" },
      { col: "project_id", val: "proj-abc" },
    ]);
  });

  it("filters by project_id = null when the founder has no active project (pre-project solo state)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await GET();
    const listChain = state.chains.find(
      (c) => c.op === "select" && c.table === "compliance_s708_certs",
    );
    expect(listChain?.eqCalls).toEqual([
      { col: "user_id", val: "user-1" },
      { col: "project_id", val: null },
    ]);
  });

  it("orders by cert_date descending so the newest cert renders first", async () => {
    await GET();
    const listChain = state.chains.find(
      (c) => c.op === "select" && c.table === "compliance_s708_certs",
    );
    expect(listChain?.orderCol).toBe("cert_date");
    expect(listChain?.orderOpts).toEqual({ ascending: false });
  });

  it("classifies each row's status (expired | expiring_soon | valid) and summarises them for the panel", async () => {
    // Freeze wall-clock so classifyCert is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T00:00:00Z"));
    try {
      state.listRows = [
        {
          id: "cert-valid",
          investor_email: "a@x.com",
          certifying_accountant_name: "A",
          certifying_accountant_firm: "A CA",
          cert_type: "net_assets",
          cert_date: "2026-08-01",
          expiry_date: "2028-08-01",
          evidence_url: null,
        },
        {
          id: "cert-soon",
          investor_email: "b@x.com",
          certifying_accountant_name: "B",
          certifying_accountant_firm: "B CA",
          cert_type: "gross_income",
          cert_date: "2024-09-01",
          expiry_date: "2026-09-15",
          evidence_url: null,
        },
        {
          id: "cert-old",
          investor_email: "c@x.com",
          certifying_accountant_name: "C",
          certifying_accountant_firm: "C CA",
          cert_type: "net_assets",
          cert_date: "2023-01-01",
          expiry_date: "2025-01-01",
          evidence_url: null,
        },
      ];
      const res = await GET();
      const body = await res.json();
      expect(body.certs.map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([
        ["cert-valid", "valid"],
        ["cert-soon", "expiring_soon"],
        ["cert-old", "expired"],
      ]);
      expect(body.summary).toEqual({
        total: 3,
        valid: 1,
        expiring_soon: 1,
        expired: 1,
        has_valid_or_expiring: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("coerces missing evidence_url to null (never leaks `undefined` through JSON)", async () => {
    state.listRows = [
      {
        id: "cert-1",
        investor_email: "a@x.com",
        certifying_accountant_name: "A",
        certifying_accountant_firm: "A CA",
        cert_type: "net_assets",
        cert_date: "2026-08-01",
        expiry_date: "2028-08-01",
        evidence_url: undefined,
      },
    ];
    const res = await GET();
    const body = await res.json();
    expect(body.certs[0].evidence_url).toBeNull();
  });

  it("selects only the eight audit columns needed by the panel from compliance_s708_certs", async () => {
    await GET();
    const listChain = state.chains.find(
      (c) => c.op === "select" && c.table === "compliance_s708_certs",
    );
    expect(listChain?.selectCols).toBe(
      "id, investor_email, certifying_accountant_name, certifying_accountant_firm, cert_type, cert_date, expiry_date, evidence_url",
    );
  });
});
