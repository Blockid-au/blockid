// Colocated tests for POST /api/evidence/upload.
//
// The route was rewritten to (a) run every incoming buffer through
// clamd BEFORE Google Drive sees the bytes and (b) mirror the write
// into the Phase 3 evidence pipeline (0210 evidence + 0211
// evidence_versions) alongside the legacy svi_evidence row. These
// tests pin the new contract so the loop's test-gate reverts anyone
// who accidentally loosens the malware gate or drops the evidence
// pipeline write.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ---- Mocks --------------------------------------------------------------

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const uploadAndShareWithAdminMock = vi.fn();
vi.mock("@/lib/google-drive", () => ({
  uploadAndShareWithAdmin: (
    buf: Buffer,
    name: string,
    type: string,
    email: string,
  ) => uploadAndShareWithAdminMock(buf, name, type, email),
}));

const scanBufferMock = vi.fn();
const getScannerVersionMock = vi.fn();
vi.mock("@/lib/security/clamav", () => ({
  scanBuffer: (buf: Buffer) => scanBufferMock(buf),
  getScannerVersion: () => getScannerVersionMock(),
}));

const getProjectIdFromRequestMock = vi.fn();
const findOrCreateSVIAccountMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
  findOrCreateSVIAccount: (email: string, projectId: string | null) =>
    findOrCreateSVIAccountMock(email, projectId),
}));

// Supabase client mock — a fluent builder that records every insert so
// tests can assert both "the row was written" and "the row was NOT
// written" precisely.
interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}
interface DedupeState {
  match: { id: string } | null;
  uniqueViolationOnEvidenceInsert?: boolean;
}
let inserts: InsertCall[] = [];
let dedupeState: DedupeState = { match: null };

function makeSelectChain(match: { id: string } | null) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.neq = () => chain;
  chain.is = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: match, error: null });
  chain.single = () => Promise.resolve({ data: match, error: null });
  return chain;
}

function fakeSupabase() {
  return {
    from(table: string) {
      return {
        select() {
          return makeSelectChain(dedupeState.match);
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          if (
            table === "evidence" &&
            dedupeState.uniqueViolationOnEvidenceInsert
          ) {
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { code: "23505", message: "unique_violation" },
                  }),
              }),
            };
          }
          // svi_evidence + evidence_versions callers use .insert(...).select().single()
          // (svi_evidence) or bare .insert(...) (evidence_versions). Support both.
          const chain = {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: `${table}-inserted-id` },
                  error: null,
                }),
            }),
            // If the caller awaits the insert without .select(), resolve empty.
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: null, error: null }),
          };
          return chain;
        },
      };
    },
  };
}

const getSupabaseAdminMock = vi.fn(() => fakeSupabase());
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ---- Import after mocks ------------------------------------------------

import { POST } from "./route";

// ---- Helpers -----------------------------------------------------------

function buildRequest(bytes = "hello world", filename = "doc.pdf"): NextRequest {
  const fd = new FormData();
  const blob = new Blob([bytes], { type: "application/pdf" });
  fd.set("file", new File([blob], filename, { type: "application/pdf" }));
  fd.set("dimension", "financial");
  fd.set("category", "financial");
  return new NextRequest("http://x/api/evidence/upload", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  uploadAndShareWithAdminMock.mockReset();
  scanBufferMock.mockReset();
  getScannerVersionMock.mockReset();
  getProjectIdFromRequestMock.mockReset();
  findOrCreateSVIAccountMock.mockReset();
  getSupabaseAdminMock.mockClear();
  inserts = [];
  dedupeState = { match: null };

  getCurrentUserMock.mockResolvedValue({
    id: "user-1",
    email: "founder@x.test",
  });
  getProjectIdFromRequestMock.mockResolvedValue("project-1");
  findOrCreateSVIAccountMock.mockResolvedValue("account-1");
  getScannerVersionMock.mockResolvedValue("ClamAV 1.4.3/test");
  uploadAndShareWithAdminMock.mockResolvedValue({
    id: "drive-file-1",
    webViewLink: "https://drive.example/view/1",
  });
});

// ---- Tests -------------------------------------------------------------

describe("POST /api/evidence/upload", () => {
  it("clean bytes: writes svi_evidence + evidence + evidence_versions, audit clean, returns evidenceId + deduped:false", async () => {
    scanBufferMock.mockResolvedValue({ ok: true });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(false);
    expect(body.evidenceId).toBeTruthy();

    // Google Drive was called exactly once.
    expect(uploadAndShareWithAdminMock).toHaveBeenCalledTimes(1);

    const tables = inserts.map((i) => i.table);
    expect(tables).toContain("svi_evidence");
    expect(tables).toContain("evidence");
    expect(tables).toContain("evidence_versions");
    expect(tables).toContain("upload_scans");

    const audit = inserts.find((i) => i.table === "upload_scans")!;
    expect(audit.row.verdict).toBe("clean");

    const ev = inserts.find((i) => i.table === "evidence")!;
    expect(ev.row.business_id).toBe("project-1");
    expect(ev.row.owner_user_id).toBe("user-1");
    expect(ev.row.verification_state).toBe("uploaded");
    expect(ev.row.scan_verdict).toBe("clean");
    expect(typeof ev.row.sha256).toBe("string");
    expect((ev.row.sha256 as string).length).toBe(64);
    expect(ev.row.storage_path).toBe("https://drive.example/view/1");
    expect(ev.row.category).toBe("financial");

    const ver = inserts.find((i) => i.table === "evidence_versions")!;
    // version_number left NULL so the 0211 trigger auto-fills.
    expect(ver.row.version_number).toBeNull();
    expect(ver.row.sha256).toBe(ev.row.sha256);
    expect(ver.row.size_bytes).toBe(ev.row.size_bytes);
  });

  it("infected: 422 with signature, no Google Drive call, no evidence row, infected audit row", async () => {
    scanBufferMock.mockResolvedValue({
      ok: false,
      verdict: "infected",
      signature: "Eicar-Test-Signature",
    });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.signature).toBe("Eicar-Test-Signature");
    expect(uploadAndShareWithAdminMock).not.toHaveBeenCalled();

    const tables = inserts.map((i) => i.table);
    expect(tables).not.toContain("evidence");
    expect(tables).not.toContain("evidence_versions");
    expect(tables).not.toContain("svi_evidence");
    expect(tables).toContain("upload_scans");
    const audit = inserts.find((i) => i.table === "upload_scans")!;
    expect(audit.row.verdict).toBe("infected");
    expect(audit.row.signature).toBe("Eicar-Test-Signature");
  });

  it("scanner_error: 503 (fail-CLOSED), no Google Drive call, no evidence row, scanner_error audit row", async () => {
    scanBufferMock.mockResolvedValue({
      ok: false,
      verdict: "scanner_error",
      message: "clamd timed out",
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(503);
    expect(uploadAndShareWithAdminMock).not.toHaveBeenCalled();

    const tables = inserts.map((i) => i.table);
    expect(tables).not.toContain("evidence");
    expect(tables).not.toContain("evidence_versions");
    expect(tables).not.toContain("svi_evidence");
    expect(tables).toContain("upload_scans");
    const audit = inserts.find((i) => i.table === "upload_scans")!;
    expect(audit.row.verdict).toBe("scanner_error");
  });

  it("duplicate sha256 on same business: 200 with deduped:true, no scan, no Drive, no second evidence row", async () => {
    dedupeState = { match: { id: "existing-evidence-1" } };
    scanBufferMock.mockResolvedValue({ ok: true });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(body.evidenceId).toBe("existing-evidence-1");

    expect(scanBufferMock).not.toHaveBeenCalled();
    expect(uploadAndShareWithAdminMock).not.toHaveBeenCalled();
    const tables = inserts.map((i) => i.table);
    expect(tables).not.toContain("evidence");
    expect(tables).not.toContain("evidence_versions");
    expect(tables).not.toContain("upload_scans");
  });

  it("Drive fails after clean scan: 502, no evidence row, clean audit row still written (leaves the sha256 slot free for retry)", async () => {
    scanBufferMock.mockResolvedValue({ ok: true });
    uploadAndShareWithAdminMock.mockRejectedValue(
      new Error("drive: 500 backend"),
    );

    const res = await POST(buildRequest());
    expect(res.status).toBe(502);

    const tables = inserts.map((i) => i.table);
    // Chose "no row at all" over "verification_state=rejected" so the
    // partial UNIQUE (business_id, sha256) index does NOT hold a slot
    // the founder needs when they retry the transient Drive failure.
    expect(tables).not.toContain("evidence");
    expect(tables).not.toContain("evidence_versions");
    expect(tables).not.toContain("svi_evidence");
    // Audit trail still records the clean verdict — audit and
    // persistence are decoupled.
    expect(tables).toContain("upload_scans");
    const audit = inserts.find((i) => i.table === "upload_scans")!;
    expect(audit.row.verdict).toBe("clean");
  });

  it("unauthenticated: 401 before scan or Drive", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(scanBufferMock).not.toHaveBeenCalled();
    expect(uploadAndShareWithAdminMock).not.toHaveBeenCalled();
  });

  it("race: concurrent duplicate that beats us to the evidence insert returns 200 deduped, no crash", async () => {
    dedupeState = {
      match: null,
      uniqueViolationOnEvidenceInsert: true,
    };
    scanBufferMock.mockResolvedValue({ ok: true });

    // After the failing insert, the fallback lookup must find the
    // winner — swap the select match in mid-flight by mutating state
    // right after the evidence insert is attempted.
    let winnerInstalled = false;
    const origFrom = getSupabaseAdminMock.getMockImplementation();
    getSupabaseAdminMock.mockImplementation(() => {
      const base = fakeSupabase();
      return {
        from(table: string) {
          const t = base.from(table);
          if (table === "evidence") {
            const origInsert = t.insert.bind(t);
            t.insert = (row: Record<string, unknown>) => {
              const r = origInsert(row);
              winnerInstalled = true;
              dedupeState = { match: { id: "winner-evidence-1" } };
              return r;
            };
          }
          return t;
        },
      };
    });

    const res = await POST(buildRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(body.evidenceId).toBe("winner-evidence-1");
    expect(winnerInstalled).toBe(true);

    // Restore for later tests in the same file (each `it` also resets
    // via beforeEach, but be tidy).
    if (origFrom) getSupabaseAdminMock.mockImplementation(origFrom);
  });
});
