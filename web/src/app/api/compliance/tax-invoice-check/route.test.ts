// Unit tests for POST + GET /api/compliance/tax-invoice-check —
// P9-compliance-tax-invoice-check-route-test.
//
// The route wraps `assessTaxInvoice` (web/src/lib/compliance/tax-invoice-checker.ts),
// the ATO valid-tax-invoice checker under A New Tax System (Goods and Services
// Tax) Act 1999 (Cth) s 29-70(1). POST assesses + persists a snapshot per
// (user_id, project_id); GET returns the LATEST persisted snapshot plus the
// per-project total count for the "showing latest of N" tile.
//
// Branch matrix pinned:
//   POST:
//     1. anon                          → 401 { ok:false, error:'unauthenticated', disclaimer }
//     2. invalid JSON                  → 400 { ok:false, error:'invalid_json', disclaimer }
//     3. missing gst_inclusive_total   → 400 { ok:false, error:'missing_required_fields',
//                                              required:['gst_inclusive_total_aud'], disclaimer }
//     4. no supabase                   → 200 { ok:true, result } (assessTaxInvoice still runs)
//     5. supabase happy                → 200 + INSERT into compliance_tax_invoice_checks
//   GET:
//     6. anon                          → 401 { ok:false, error:'unauthenticated', disclaimer }
//     7. no supabase                   → 200 { ok:true, result:null, disclaimer } (no `total`)
//     8. supabase, no rows             → 200 { ok:true, result:null, total:0, disclaimer }
//     9. supabase, latest row + count  → 200 { ok:true, result:<row>, total:<n>, disclaimer }
//
// Silent regressions this pins against:
//   - dropping the POST auth gate and letting anonymous callers pollute
//     compliance_tax_invoice_checks with null user_id rows (breaks RLS
//     reasoning and the founder's "my snapshots" scoping);
//   - dropping the JSON try/catch so a text/plain body 500s instead of 400;
//   - dropping the `typeof … === "number"` guard on gst_inclusive_total_aud —
//     assessTaxInvoice would then coerce undefined → 0 and silently insert a
//     zero-total audit row that pollutes the CFO dashboard;
//   - swapping the exposed `required` array shape (frontend form renders the
//     missing-fields list verbatim into the error banner);
//   - dropping TAX_INVOICE_DISCLAIMER from any of the four error envelopes
//     (this is the AFSL/ATO not-tax-advice wording that MUST accompany every
//     compliance-domain response — see legal/surfaces.ts:49);
//   - dropping the `compliance_tax_invoice_checks` table name (rename would
//     silently start writing to a stale/absent table with no typecheck
//     failure against the supabase-js client);
//   - dropping the getActiveProject → project_id linkage (the founder's
//     multi-project dashboard segments snapshots by project — merging all
//     projects into a single stream breaks the CFO dashboard);
//   - dropping any of the mirrored columns (ok, band, gst_inclusive_total_aud,
//     computed_gst_component_aud, missing_field_count, warning_count) — the
//     weekly digest reads those derived columns without re-running
//     assessTaxInvoice, so dropping any silently zeroes the digest tile;
//   - swapping the GET .order() to ascending (the UI assumes the newest
//     snapshot is the one it renders);
//   - dropping .limit(1) and streaming the full history back over the
//     "latest" endpoint;
//   - dropping the count() companion query and defaulting `total` to a hard
//     zero (the tile's "showing latest of N" copy would misrepresent audit
//     depth to the founder);
//   - dropping the `data ?? null` / `count ?? 0` coercions and shipping
//     `undefined` through JSON (JSON.stringify silently drops it);
//   - dropping `export const dynamic = "force-dynamic"` and having Next.js
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

import {
  TAX_INVOICE_DISCLAIMER,
  type TaxInvoiceResult,
} from "@/lib/compliance/tax-invoice-checker";
import { GET, POST, dynamic } from "./route";

interface InsertRow {
  user_id: string;
  project_id: string | null;
  input_json: unknown;
  result_json: TaxInvoiceResult;
  ok: boolean;
  band: string;
  gst_inclusive_total_aud: number;
  computed_gst_component_aud: number;
  missing_field_count: number;
  warning_count: number;
}

interface LatestRow {
  input_json: unknown;
  result_json: unknown;
  ok: boolean;
  band: string;
  gst_inclusive_total_aud: number;
  computed_gst_component_aud: number;
  missing_field_count: number;
  warning_count: number;
  computed_at: string;
}

interface ChainRecord {
  table: string;
  op: "insert" | "select" | null;
  insertRow: InsertRow | null;
  selectCols: string | null;
  selectOpts: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
  maybeSingleCalled: boolean;
  awaitedDirect: boolean;
}

interface FakeState {
  chains: ChainRecord[];
  latestRow: LatestRow | null;
  countValue: number | null;
}

const state: FakeState = { chains: [], latestRow: null, countValue: 0 };

function makeFakeSupabase() {
  return {
    from(table: string) {
      const chain: ChainRecord = {
        table,
        op: null,
        insertRow: null,
        selectCols: null,
        selectOpts: null,
        eqCalls: [],
        orderCol: null,
        orderOpts: null,
        limitN: null,
        maybeSingleCalled: false,
        awaitedDirect: false,
      };
      state.chains.push(chain);

      const api = {
        insert(row: InsertRow) {
          chain.op = "insert";
          chain.insertRow = row;
          return Promise.resolve({ data: null, error: null });
        },
        select(cols: string, opts?: Record<string, unknown>) {
          chain.op = "select";
          chain.selectCols = cols;
          chain.selectOpts = opts ?? null;
          return api;
        },
        eq(col: string, val: unknown) {
          chain.eqCalls.push({ col, val });
          return api;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          chain.orderCol = col;
          chain.orderOpts = opts ?? null;
          return api;
        },
        limit(n: number) {
          chain.limitN = n;
          return api;
        },
        maybeSingle() {
          chain.maybeSingleCalled = true;
          return Promise.resolve({ data: state.latestRow, error: null });
        },
        then(
          resolve: (v: {
            data: unknown;
            error: unknown;
            count?: number | null;
          }) => unknown,
        ) {
          chain.awaitedDirect = true;
          return Promise.resolve({
            data: null,
            error: null,
            count: state.countValue,
          }).then(resolve);
        },
      };
      return api;
    },
  };
}

function resetState() {
  state.chains.length = 0;
  state.latestRow = null;
  state.countValue = 0;
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
  supplier_name: "Acme Freight Pty Ltd",
  supplier_abn: "51824753556", // valid ABN checksum
  recipient_name: "Auschain Pty Ltd",
  recipient_abn: "79659615111", // valid ABN checksum
  issue_date_iso: "2026-08-01",
  description: "Freight courier services — Sydney → Melbourne",
  gst_inclusive_total_aud: 550,
  gst_amount_aud: 50,
  document_labelled_tax_invoice: true,
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

describe("POST /api/compliance/tax-invoice-check — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: TAX_INVOICE_DISCLAIMER,
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

describe("POST /api/compliance/tax-invoice-check — invalid JSON branch", () => {
  it("returns 400 { ok:false, error:'invalid_json', disclaimer } when the body is not JSON-parseable", async () => {
    const res = await POST(makePostReq(undefined, { rawText: "not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "invalid_json",
      disclaimer: TAX_INVOICE_DISCLAIMER,
    });
  });

  it("does NOT insert into compliance_tax_invoice_checks when the body was unparseable", async () => {
    await POST(makePostReq(undefined, { rawText: "garbage" }));
    expect(state.chains.filter((c) => c.op === "insert")).toEqual([]);
  });
});

describe("POST /api/compliance/tax-invoice-check — missing gst_inclusive_total_aud branch", () => {
  it("returns 400 error='missing_required_fields' + required=['gst_inclusive_total_aud'] + disclaimer when the field is absent", async () => {
    const res = await POST(makePostReq({ supplier_name: "Acme" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "missing_required_fields",
      required: ["gst_inclusive_total_aud"],
      disclaimer: TAX_INVOICE_DISCLAIMER,
    });
  });

  it("returns 400 when gst_inclusive_total_aud is a string '550' rather than a number (typeof===number guard)", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, gst_inclusive_total_aud: "550" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
  });

  it("returns 400 when gst_inclusive_total_aud is null (typeof null === 'object', so the number guard rejects it)", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, gst_inclusive_total_aud: null }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts 0 as a valid number and lets assessTaxInvoice mark the result ok=false via missing_fields (not a route-level 400)", async () => {
    const res = await POST(
      makePostReq({ ...VALID_BODY, gst_inclusive_total_aud: 0 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      result: TaxInvoiceResult;
    };
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(false);
    expect(body.result.missing_fields).toContain("gst_inclusive_total");
  });

  it("does NOT insert into compliance_tax_invoice_checks when the number guard fails", async () => {
    await POST(makePostReq({ supplier_name: "Acme" }));
    expect(state.chains.filter((c) => c.op === "insert")).toEqual([]);
  });
});

describe("POST /api/compliance/tax-invoice-check — happy path with supabase", () => {
  it("returns 200 { ok:true, result } on a valid submission", async () => {
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      result: TaxInvoiceResult;
    };
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.band).toBe("standard");
    expect(body.result.disclaimer).toBe(TAX_INVOICE_DISCLAIMER);
  });

  it("writes into the compliance_tax_invoice_checks table (rename-defence — supabase-js would not type-error on a bad table name)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChains = state.chains.filter((c) => c.op === "insert");
    expect(insertChains.length).toBe(1);
    expect(insertChains[0].table).toBe("compliance_tax_invoice_checks");
  });

  it("stamps the row with user_id from getCurrentUser (not from any body-supplied field)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    await POST(
      makePostReq({
        ...VALID_BODY,
        // even a caller-supplied user_id in the body must be ignored:
        user_id: "attacker-99",
      } as unknown as typeof VALID_BODY),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.user_id).toBe("founder-42");
  });

  it("stamps the row with project_id from getActiveProject when a project exists", async () => {
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.project_id).toBe("proj-abc");
  });

  it("stamps project_id = null when getActiveProject returns null (solo-founder pre-project state)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.project_id).toBeNull();
  });

  it("persists the raw request body verbatim in input_json (audit trail — never mutated)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.input_json).toEqual(VALID_BODY);
  });

  it("persists the computed TaxInvoiceResult in result_json (weekly digest reads derived reasoning without re-running assessTaxInvoice)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    const stored = insertChain?.insertRow?.result_json;
    expect(stored).toBeDefined();
    expect(stored?.disclaimer).toBe(TAX_INVOICE_DISCLAIMER);
    expect(stored?.band).toBe("standard");
  });

  it("mirrors ok onto its own indexable column (the dashboard filters by this without walking result_json)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(typeof insertChain?.insertRow?.ok).toBe("boolean");
  });

  it("mirrors band onto its own column ('under_threshold' | 'standard' | 'large')", async () => {
    await POST(
      makePostReq({ ...VALID_BODY, gst_inclusive_total_aud: 5000 }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.band).toBe("large");
  });

  it("mirrors gst_inclusive_total_aud onto its own column (for cohort SQL: SUM(gst_inclusive_total_aud) WHERE band='large')", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.gst_inclusive_total_aud).toBe(550);
  });

  it("mirrors computed_gst_component_aud onto its own column (total ÷ 11 rounded — SUM() for BAS reconciliation)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    expect(insertChain?.insertRow?.computed_gst_component_aud).toBe(50);
  });

  it("derives missing_field_count from result.missing_fields.length (never allowed to drift out of sync with result_json)", async () => {
    // A bare-minimum body: number is present, everything else missing.
    await POST(
      makePostReq({ gst_inclusive_total_aud: 550 }),
    );
    const insertChain = state.chains.find((c) => c.op === "insert");
    const stored = insertChain?.insertRow?.result_json;
    expect(insertChain?.insertRow?.missing_field_count).toBe(
      stored?.missing_fields.length,
    );
    expect(insertChain?.insertRow?.missing_field_count).toBeGreaterThan(0);
  });

  it("derives warning_count from result.warnings.length (kept in lock-step with result_json)", async () => {
    await POST(makePostReq(VALID_BODY));
    const insertChain = state.chains.find((c) => c.op === "insert");
    const stored = insertChain?.insertRow?.result_json;
    expect(insertChain?.insertRow?.warning_count).toBe(
      stored?.warnings.length,
    );
  });

  it("calls getActiveProject with the current user id (not the email or any body-supplied value)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-xyz",
      email: "z@x.com",
    });
    await POST(makePostReq(VALID_BODY));
    expect(getActiveProjectMock).toHaveBeenCalledWith("user-xyz");
  });
});

describe("POST /api/compliance/tax-invoice-check — supabase-unavailable branch", () => {
  it("still returns 200 { ok:true, result } when supabase is unconfigured (in-memory assessment must work without a DB)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makePostReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      result: TaxInvoiceResult;
    };
    expect(body.ok).toBe(true);
    expect(body.result.disclaimer).toBe(TAX_INVOICE_DISCLAIMER);
  });

  it("does NOT call getActiveProject when supabase is null (no point looking up a project with nowhere to write it)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(makePostReq(VALID_BODY));
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(state.chains.length).toBe(0);
  });
});

describe("GET /api/compliance/tax-invoice-check — anonymous branch", () => {
  it("returns 401 { ok:false, error:'unauthenticated', disclaimer } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: TAX_INVOICE_DISCLAIMER,
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

describe("GET /api/compliance/tax-invoice-check — supabase-unavailable branch", () => {
  it("returns 200 { ok:true, result:null, disclaimer } when getSupabaseAdmin() is null (no `total` in this branch)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: null,
      disclaimer: TAX_INVOICE_DISCLAIMER,
    });
  });

  it("does NOT call getActiveProject when supabase is null (nothing to query)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(getActiveProjectMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/compliance/tax-invoice-check — supabase happy path", () => {
  it("selects the nine audit columns needed by the founder tile from compliance_tax_invoice_checks", async () => {
    await GET();
    const selectChain = state.chains.find(
      (c) => c.op === "select" && c.maybeSingleCalled,
    );
    expect(selectChain?.table).toBe("compliance_tax_invoice_checks");
    expect(selectChain?.selectCols).toBe(
      "input_json, result_json, ok, band, gst_inclusive_total_aud, computed_gst_component_aud, missing_field_count, warning_count, computed_at",
    );
  });

  it("filters the latest-snapshot query by user_id AND project_id (multi-project isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await GET();
    const latestChain = state.chains.find(
      (c) => c.op === "select" && c.maybeSingleCalled,
    );
    expect(latestChain?.eqCalls).toEqual([
      { col: "user_id", val: "founder-42" },
      { col: "project_id", val: "proj-abc" },
    ]);
  });

  it("filters by project_id = null when the founder has no active project (pre-project solo state)", async () => {
    getActiveProjectMock.mockResolvedValue(null);
    await GET();
    const latestChain = state.chains.find(
      (c) => c.op === "select" && c.maybeSingleCalled,
    );
    expect(latestChain?.eqCalls).toEqual([
      { col: "user_id", val: "user-1" },
      { col: "project_id", val: null },
    ]);
  });

  it("orders by computed_at descending so the LATEST snapshot is what the UI renders", async () => {
    await GET();
    const latestChain = state.chains.find(
      (c) => c.op === "select" && c.maybeSingleCalled,
    );
    expect(latestChain?.orderCol).toBe("computed_at");
    expect(latestChain?.orderOpts).toEqual({ ascending: false });
  });

  it("caps the fetch at 1 row (latest-only endpoint — never streams the full history)", async () => {
    await GET();
    const latestChain = state.chains.find(
      (c) => c.op === "select" && c.maybeSingleCalled,
    );
    expect(latestChain?.limitN).toBe(1);
  });

  it("uses .maybeSingle() (not .single()) so an empty history is a 200 null, not a supabase PGRST116 error", async () => {
    await GET();
    const latestChain = state.chains.find(
      (c) => c.op === "select" && c.maybeSingleCalled,
    );
    expect(latestChain?.maybeSingleCalled).toBe(true);
  });

  it("fires a separate count query with .select('id', { count:'exact', head:true }) filtered by the same (user_id, project_id) scope", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    getActiveProjectMock.mockResolvedValue({ id: "proj-abc" });
    await GET();
    const countChain = state.chains.find(
      (c) => c.op === "select" && c.awaitedDirect,
    );
    expect(countChain?.table).toBe("compliance_tax_invoice_checks");
    expect(countChain?.selectCols).toBe("id");
    expect(countChain?.selectOpts).toEqual({
      count: "exact",
      head: true,
    });
    expect(countChain?.eqCalls).toEqual([
      { col: "user_id", val: "founder-42" },
      { col: "project_id", val: "proj-abc" },
    ]);
  });

  it("returns 200 { ok:true, result:<row>, total:<n>, disclaimer } when both queries succeed", async () => {
    const latest: LatestRow = {
      input_json: { gst_inclusive_total_aud: 550 },
      result_json: {
        ok: true,
        band: "standard",
        disclaimer: TAX_INVOICE_DISCLAIMER,
      },
      ok: true,
      band: "standard",
      gst_inclusive_total_aud: 550,
      computed_gst_component_aud: 50,
      missing_field_count: 0,
      warning_count: 0,
      computed_at: "2026-08-07T12:34:56Z",
    };
    state.latestRow = latest;
    state.countValue = 17;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      result: latest,
      total: 17,
      disclaimer: TAX_INVOICE_DISCLAIMER,
    });
  });

  it("coerces missing latest data (null) to result:null in the response (never leaks `undefined` through JSON)", async () => {
    state.latestRow = null;
    state.countValue = 0;
    const res = await GET();
    const body = await res.json();
    expect(body.result).toBeNull();
    expect(body.disclaimer).toBe(TAX_INVOICE_DISCLAIMER);
  });

  it("coerces a null count to total=0 (never ships `null` through the `total` field the tile renders literally)", async () => {
    state.latestRow = null;
    state.countValue = null;
    const res = await GET();
    const body = await res.json();
    expect(body.total).toBe(0);
  });
});
