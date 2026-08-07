// Unit tests for GET + POST /api/cap-table/documents —
// P9-cap-table-documents-route-test.
//
// The documents route is the admin-facing ERC-1400 legal-document register on
// top of the SVT contract (chainId 420, private BlockID EVM). GET returns the
// caller's `onchain_documents` rows plus the fixed catalogue of valid
// DocumentType labels the UI dropdown depends on. POST accepts a legal
// artefact (SHA / board resolution / share certificate / constitution /
// valuation report), builds MetaMask-ready `txData` for the SVT
// `setDocument(bytes32 name, string uri, bytes32 documentHash)` call, and
// mirrors the row into `onchain_documents` for quick-access. Silent regressions
// here quietly break the Corps-Act-aligned share-register document trail the
// P1_dataroom_map + P9_ship exit criteria promise — a founder thinks
// artefacts are registered on-chain but the calldata is malformed, or the DB
// row is missing, or a non-admin managed to add a document.
//
// Assertions pin the following route contract:
//   1. `dynamic = "force-dynamic"` — per-account documents must never be
//      cached into the static shell.
//   2. GET 401 on anonymous.
//   3. GET null-supabase branch → 200 with `documents:[]` + the full
//      documentTypes catalogue (5 entries).
//   4. GET happy path: SELECT from onchain_documents, filtered by
//      user.id (NOT email), ordered by created_at DESC; response echoes
//      `documents` verbatim + the documentTypes catalogue.
//   5. GET null `data` (no error) → `documents:[]` (never null, so the UI
//      `.map()` never blows up).
//   6. GET DB error → 500 { ok:false, error:"Failed to fetch documents" }.
//   7. GET documentTypes catalogue: five entries, canonical value+label pairs,
//      order matches the source array so the UI dropdown never reorders.
//   8. POST feature-gate: `gateRequireFeature('share_management')` failure
//      returns the gate's own response verbatim (401/402/503 shape).
//   9. POST admin-only: non-admin non-admin@blockid.au caller → 403.
//  10. POST accepts admin@blockid.au email even if role !== "admin".
//  11. POST accepts role === "admin" even if email !== admin@blockid.au.
//  12. POST invalid JSON body → 400 { ok:false, error:"Invalid JSON body" }.
//  13. POST missing `name` → 400.
//  14. POST missing `uri` → 400.
//  15. POST missing `documentHash` → 400.
//  16. POST invalid `documentType` → 400 with the list of valid types echoed
//      in the error string (so the UI can render the fix hint).
//  17. POST happy path — DB row inserted on `onchain_documents` with
//      account_id + name + document_type + uri + document_hash +
//      shareholder_id + status='pending'.
//  18. POST omitted `documentType` defaults to "board_resolution" on the
//      DB row (Corps Act board-minute convention).
//  19. POST omitted `shareholderId` stores null (never the string "undefined").
//  20. POST explicit `shareholderId` is stored verbatim.
//  21. POST DB insert error is swallowed — response still 200 with
//      `document:null` and the full `txData` payload so the founder can
//      still fire the on-chain call.
//  22. POST null supabase (no service role) → 200 with `document:null` and
//      the full `txData` payload.
//  23. POST txData targets the SVT contract with gas 0x7A120.
//  24. POST txData.data begins with the ERC-1400 `setDocument` selector
//      `0xdb8c198d`.
//  25. POST calldata layout — selector + name(32) + offset(32=0x60) +
//      hash(32) + uriLen(32) + uriData(padded to 32-byte boundary).
//  26. POST name utf-8 encoded then zero-padded to 32 bytes.
//  27. POST documentHash 0x-stripped + zero-padded to 32 bytes.
//  28. POST URI padded to the next 32-byte boundary (so an 11-byte URI still
//      lands in a single 32-byte word — under-pad breaks ABI decoding).
//  29. POST txData.description includes the document name so the wallet
//      prompt shows what the founder is about to register.
//
// Silent regressions this pins against:
//  - dropping `dynamic = "force-dynamic"` (per-account documents bleed
//    across users when the shell caches);
//  - selecting `onchain_documents` by user.email (schema keys on
//    account_id → founder sees another founder's on-chain docs);
//  - flipping the DOCUMENT_TYPES tuple order (UI dropdown silently reorders;
//    Corps-Act "shareholders agreement first" convention breaks);
//  - dropping the admin gate (any share_management-entitled caller can
//    register a fake document on-chain);
//  - forgetting to accept `documentType` = undefined (route drops the
//    default and inserts a row with a null document_type that fails the
//    schema CHECK constraint);
//  - swapping the ABI offset from 96 (0x60) — Solidity decoder returns
//    garbage for the URI slot;
//  - dropping the 32-byte URI-length padding — the on-chain event emits
//    a truncated URL that a due-diligence auditor can no longer resolve;
//  - dropping the `document_hash` field on insert (audit trail loses the
//    cryptographic pin — the DB row can silently drift from the on-chain
//    event without the original hash to compare).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE the SUT import so the module picks them up.
// ---------------------------------------------------------------------------

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

// Supabase client: chainable stub. Each `.from(table)` returns a fresh
// builder. GET uses `.select().eq().order()`. POST uses
// `.insert().select().single()`. Tests inspect `dbCalls` after the fact.
type DbCall =
  | { op: "select-eq-order"; table: string; col: string; val: unknown; orderCol: string; orderOpts: unknown }
  | { op: "insert"; table: string; row: Record<string, unknown> };

let dbCalls: DbCall[] = [];
let selectRows: unknown[] | null = [];
let selectError: { message: string } | null = null;
let insertRow: Record<string, unknown> | null = { id: "doc-1", account_id: "u-admin-1" };
let insertError: { message: string } | null = null;

function makeSupabase() {
  return {
    from(table: string) {
      return {
        select(_col: string) {
          return {
            eq(col: string, val: unknown) {
              return {
                order(orderCol: string, orderOpts: unknown) {
                  dbCalls.push({ op: "select-eq-order", table, col, val, orderCol, orderOpts });
                  return Promise.resolve({ data: selectRows, error: selectError });
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          dbCalls.push({ op: "insert", table, row });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: insertRow, error: insertError });
                },
              };
            },
          };
        },
      };
    },
  };
}

let supabaseInstance: ReturnType<typeof makeSupabase> | null = null;
const getSupabaseAdminMock = vi.fn(() => supabaseInstance);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks.
// ---------------------------------------------------------------------------

import { GET, POST, dynamic } from "./route";

const SVT_CONTRACT = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
const ADMIN_ADDRESS_DEFAULT = "0x0000000000000000000000000000000000000000";
const SET_DOCUMENT_SELECTOR = "0xdb8c198d";

const USER_ADMIN = { id: "u-admin-1", email: "admin@blockid.au", role: "admin" };
const USER_NORMAL = { id: "u-2", email: "user@ex.co", role: "user" };

function gateOk(user: typeof USER_ADMIN) {
  return { ok: true, user, uwp: { id: user.id, plan: "growth", segment: "founder" } };
}
function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

function getReq(): NextRequest {
  return new Request("http://x/api/cap-table/documents") as unknown as NextRequest;
}
function postReq(body: unknown, invalid = false): Request {
  return new Request("http://x/api/cap-table/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: invalid ? "{not json" : JSON.stringify(body),
  });
}

const DEFAULT_POST_BODY = {
  name: "SHA-v3",
  uri: "ipfs://Qm123",
  documentHash: "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
};

// ---------------------------------------------------------------------------

beforeEach(() => {
  getCurrentUserMock.mockReset();
  gateMock.mockReset();
  getSupabaseAdminMock.mockClear();
  dbCalls = [];
  selectRows = [];
  selectError = null;
  insertRow = { id: "doc-1", account_id: USER_ADMIN.id };
  insertError = null;
  supabaseInstance = makeSupabase();
});

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-account documents are never cached across accounts', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/cap-table/documents — anonymous branch", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does NOT dispatch a DB query on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(getReq());
    expect(dbCalls).toHaveLength(0);
  });
});

describe("GET /api/cap-table/documents — null supabase branch", () => {
  it("returns 200 with empty documents + full documentTypes catalogue when getSupabaseAdmin() is null", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    supabaseInstance = null;
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.documents).toEqual([]);
    expect(Array.isArray(body.documentTypes)).toBe(true);
    expect(body.documentTypes).toHaveLength(5);
  });
});

describe("GET /api/cap-table/documents — happy path", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    selectRows = [
      { id: "d1", name: "SHA", document_type: "shareholders_agreement" },
      { id: "d2", name: "Board Res 1", document_type: "board_resolution" },
    ];
  });

  it("queries onchain_documents filtered by user.id (NOT email) ordered by created_at DESC", async () => {
    await GET(getReq());
    expect(dbCalls).toHaveLength(1);
    const sel = dbCalls[0];
    if (sel.op !== "select-eq-order") throw new Error("expected select-eq-order");
    expect(sel.table).toBe("onchain_documents");
    expect(sel.col).toBe("account_id");
    expect(sel.val).toBe(USER_ADMIN.id);
    expect(sel.orderCol).toBe("created_at");
    expect(sel.orderOpts).toEqual({ ascending: false });
  });

  it("echoes the SELECT rows verbatim on the response", async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.documents).toEqual(selectRows);
  });

  it("returns documents as [] (never null) when the SELECT rows are null", async () => {
    selectRows = null;
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.documents).toEqual([]);
  });

  it("includes the full documentTypes catalogue on every response", async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.documentTypes).toEqual([
      { value: "shareholders_agreement", label: "Shareholders Agreement (SHA)" },
      { value: "board_resolution", label: "Board Resolution" },
      { value: "share_certificate", label: "Share Certificate" },
      { value: "constitution", label: "Company Constitution" },
      { value: "valuation_report", label: "Valuation Report" },
    ]);
  });
});

describe("GET /api/cap-table/documents — DB error branch", () => {
  it("returns 500 { ok:false, error:'Failed to fetch documents' } when the SELECT errors", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    selectError = { message: "connection reset" };
    selectRows = null;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Failed to fetch documents" });
    errSpy.mockRestore();
  });
});

describe("POST /api/cap-table/documents — feature-gate branch", () => {
  it("returns the gate's own response verbatim when share_management is denied (402)", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "feature_locked" });
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("returns the gate's own response verbatim when caller is unauthenticated (401)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "auth_required"));
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/cap-table/documents — admin-only branch", () => {
  it("returns 403 { ok:false, error:'Admin access required' } for a non-admin caller", async () => {
    gateMock.mockResolvedValue(gateOk(USER_NORMAL));
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Admin access required" });
  });

  it("accepts a user whose email is admin@blockid.au even if role !== 'admin'", async () => {
    gateMock.mockResolvedValue(
      gateOk({ id: "u-e", email: "admin@blockid.au", role: "user" }),
    );
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(200);
  });

  it("accepts a user whose role === 'admin' even if email !== admin@blockid.au", async () => {
    gateMock.mockResolvedValue(
      gateOk({ id: "u-x", email: "other@x.co", role: "admin" }),
    );
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/cap-table/documents — body validation", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns 400 { ok:false, error:'Invalid JSON body' } when the body is not valid JSON", async () => {
    const res = await POST(postReq(null, true));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid JSON body" });
  });

  it("returns 400 when `name` is missing", async () => {
    const res = await POST(postReq({ uri: "ipfs://x", documentHash: "0x1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name, uri, and documentHash are required/i);
    expect(dbCalls).toHaveLength(0);
  });

  it("returns 400 when `uri` is missing", async () => {
    const res = await POST(postReq({ name: "SHA", documentHash: "0x1" }));
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("returns 400 when `documentHash` is missing", async () => {
    const res = await POST(postReq({ name: "SHA", uri: "ipfs://x" }));
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("returns 400 with the valid-types list echoed when `documentType` is invalid", async () => {
    const res = await POST(
      postReq({ ...DEFAULT_POST_BODY, documentType: "not-a-real-type" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid document type/i);
    expect(body.error).toMatch(/shareholders_agreement/);
    expect(body.error).toMatch(/board_resolution/);
    expect(body.error).toMatch(/share_certificate/);
    expect(body.error).toMatch(/constitution/);
    expect(body.error).toMatch(/valuation_report/);
    expect(dbCalls).toHaveLength(0);
  });
});

describe("POST /api/cap-table/documents — DB insert", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("inserts on onchain_documents with the canonical row shape (account_id + name + document_type + uri + document_hash + shareholder_id + status='pending')", async () => {
    const res = await POST(
      postReq({
        ...DEFAULT_POST_BODY,
        documentType: "shareholders_agreement",
        shareholderId: "sh-42",
      }),
    );
    expect(res.status).toBe(200);
    const ins = dbCalls.find((c) => c.op === "insert");
    if (!ins || ins.op !== "insert") throw new Error("expected insert");
    expect(ins.table).toBe("onchain_documents");
    expect(ins.row).toEqual({
      account_id: USER_ADMIN.id,
      name: "SHA-v3",
      document_type: "shareholders_agreement",
      uri: "ipfs://Qm123",
      document_hash: DEFAULT_POST_BODY.documentHash,
      shareholder_id: "sh-42",
      status: "pending",
    });
  });

  it("defaults document_type to 'board_resolution' when documentType is omitted", async () => {
    await POST(postReq(DEFAULT_POST_BODY));
    const ins = dbCalls.find((c) => c.op === "insert");
    if (!ins || ins.op !== "insert") throw new Error("expected insert");
    expect(ins.row.document_type).toBe("board_resolution");
  });

  it("stores shareholder_id = null (not the string 'undefined') when shareholderId is omitted", async () => {
    await POST(postReq(DEFAULT_POST_BODY));
    const ins = dbCalls.find((c) => c.op === "insert");
    if (!ins || ins.op !== "insert") throw new Error("expected insert");
    expect(ins.row.shareholder_id).toBeNull();
  });

  it("echoes the inserted row on the response as `document`", async () => {
    insertRow = { id: "doc-99", name: "SHA-v3" };
    const res = await POST(postReq(DEFAULT_POST_BODY));
    const body = await res.json();
    expect(body.document).toEqual(insertRow);
  });

  it("swallows a DB insert error — response is still 200 with `document:null` + full txData", async () => {
    insertError = { message: "unique constraint violation" };
    insertRow = null;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.document).toBeNull();
    expect(body.txData).toBeDefined();
    expect(body.txData.to).toBe(SVT_CONTRACT);
    errSpy.mockRestore();
  });

  it("returns 200 with `document:null` + full txData when getSupabaseAdmin() is null (no service role)", async () => {
    supabaseInstance = null;
    const res = await POST(postReq(DEFAULT_POST_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document).toBeNull();
    expect(body.txData.to).toBe(SVT_CONTRACT);
    expect(dbCalls).toHaveLength(0);
  });
});

describe("POST /api/cap-table/documents — txData shape", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("targets the SVT contract with gas 0x7A120 and default admin address", async () => {
    const res = await POST(postReq(DEFAULT_POST_BODY));
    const body = await res.json();
    expect(body.txData.to).toBe(SVT_CONTRACT);
    expect(body.txData.gas).toBe("0x7A120");
    expect(body.txData.from).toBe(ADMIN_ADDRESS_DEFAULT);
  });

  it("calldata begins with the ERC-1400 `setDocument` selector 0xdb8c198d", async () => {
    const res = await POST(postReq(DEFAULT_POST_BODY));
    const body = await res.json();
    expect(body.txData.data.startsWith(SET_DOCUMENT_SELECTOR)).toBe(true);
  });

  it("calldata layout — selector + name(32) + offset(0x60) + hash(32) + uriLen(32) + uriData(padded to 32-byte boundary)", async () => {
    const name = "SHA";
    const uri = "ipfs://Qm123"; // 12 bytes → padded to 32 bytes = 64 hex
    const hashHex = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const res = await POST(
      postReq({ name, uri, documentHash: "0x" + hashHex }),
    );
    const body = await res.json();
    const data: string = body.txData.data;

    // Selector is 10 chars (0x + 8 hex).
    expect(data.slice(0, 10)).toBe(SET_DOCUMENT_SELECTOR);
    // name(32) — "SHA" utf-8 = 0x534841, zero-padded to 32 bytes = 64 hex.
    const nameHex = "534841" + "0".repeat(64 - 6);
    expect(data.slice(10, 10 + 64)).toBe(nameHex);
    // offset(32) — 0x60 (= 96) zero-padded to 32 bytes.
    const offsetHex = (96).toString(16).padStart(64, "0");
    expect(data.slice(10 + 64, 10 + 64 + 64)).toBe(offsetHex);
    // hash(32).
    expect(data.slice(10 + 128, 10 + 128 + 64)).toBe(hashHex);
    // uriLen(32) — utf-8 byte length of the URI.
    const uriBytes = new TextEncoder().encode(uri);
    const uriLenHex = uriBytes.length.toString(16).padStart(64, "0");
    expect(data.slice(10 + 192, 10 + 192 + 64)).toBe(uriLenHex);
    // uriData — utf-8 bytes as hex, padded to next 32-byte boundary.
    const rawUriHex = Array.from(uriBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const paddedUriHex = rawUriHex.padEnd(
      Math.ceil(rawUriHex.length / 64) * 64,
      "0",
    );
    expect(data.slice(10 + 256)).toBe(paddedUriHex);
    // The whole calldata is exactly selector + 5 * 32-byte words (name + offset + hash + uriLen + uriData).
    expect(data.length).toBe(10 + 5 * 64);
  });

  it("zero-pads a documentHash that is shorter than 32 bytes (never propagates a mis-sized 0x prefix)", async () => {
    const res = await POST(
      postReq({ ...DEFAULT_POST_BODY, documentHash: "0xdead" }),
    );
    const body = await res.json();
    const data: string = body.txData.data;
    // hash slot starts at 10 + 128, ends at 10 + 192.
    const hashSlot = data.slice(10 + 128, 10 + 192);
    // 4 hex chars of "dead" followed by 60 zeros.
    expect(hashSlot).toBe("dead" + "0".repeat(60));
  });

  it("URI pads to the next 32-byte boundary — a 33-byte URI occupies two 32-byte words (64 hex + 64 hex)", async () => {
    // 33-byte URI: 32 * "a" + 1 * "b" = 33 chars, exactly one byte past the boundary.
    const uri = "a".repeat(32) + "b";
    const res = await POST(postReq({ ...DEFAULT_POST_BODY, uri }));
    const body = await res.json();
    const data: string = body.txData.data;
    // Everything past the 5th word (selector + name + offset + hash + uriLen) is uriData.
    const uriData = data.slice(10 + 256);
    // 33 bytes = 66 hex, padded to next 128 hex boundary (two 32-byte words).
    expect(uriData).toHaveLength(128);
    const rawUriHex = Array.from(new TextEncoder().encode(uri))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(uriData.startsWith(rawUriHex)).toBe(true);
    // The trailing 62 hex chars should be zero-pad.
    expect(uriData.slice(rawUriHex.length)).toBe("0".repeat(128 - rawUriHex.length));
  });

  it("txData.description includes the document name so the wallet prompt is meaningful", async () => {
    const res = await POST(postReq({ ...DEFAULT_POST_BODY, name: "SHA-v3" }));
    const body = await res.json();
    expect(body.txData.description).toMatch(/SHA-v3/);
    expect(body.txData.description).toMatch(/ERC-1400/);
  });
});
