// Colocated tests for GET /api/valuation/certificate/[id]/pdf (S22-A).
//
//   - viewer+ on the certificate's project downloads it; another project's
//     certificate → 404 (never 403); bad id → 404 before any lookup;
//   - the bytes are rendered from the STORED payload (the certificate
//     number, hash and figures in the PDF are the row's, not a recompute);
//   - `?for=` burns the investor watermark on every page + X-BlockID-Watermark;
//   - a revoked row still renders, with the REVOKED banner + header.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { PDFParse } from "pdf-parse";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import { SAMPLE_CERTIFICATE as SAMPLE } from "@/lib/valuation-certificate/fixtures";
import { certificateContentHash } from "@/lib/valuation-certificate/hash";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { GET } from "./route";

const ID = "11111111-2222-4333-8444-555555555555";
const HASH = certificateContentHash(SAMPLE);

function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    project_id: "proj-1",
    user_id: "user-owner",
    score_history_id: null,
    certificate_no: SAMPLE.certificateNo,
    content_hash: HASH,
    payload: SAMPLE,
    startup_name: SAMPLE.startupName,
    svi_score: SAMPLE.sviScore,
    credits_charged: 5,
    issued_at: SAMPLE.issuedAt,
    revoked_at: null,
    revoked_reason: null,
    ...over,
  };
}

function call(id = ID, query = "") {
  const req = new Request(`http://localhost/api/valuation/certificate/${id}/pdf${query}`) as unknown as NextRequest;
  return GET(req, { params: Promise.resolve({ id }) });
}

async function pages(res: Response): Promise<string[]> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(Buffer.from(bytes.subarray(0, 4)).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).pages.map((p) => p.text.replace(/\s+/g, " "));
  } finally {
    await parser.destroy();
  }
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ valuation_certificates: [row()] });
});

describe("GET /api/valuation/certificate/[id]/pdf", () => {
  it("401 without a session; 404 for a non-uuid id before any lookup", async () => {
    auth.user = null;
    expect((await call()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test" };
    expect((await call("nope")).status).toBe(404);
    expect(db.sb!.calls.length).toBe(0);
  });

  it("a viewer downloads the stored certificate as a clean 3-page PDF", async () => {
    scopeState.role = "viewer";
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(`blockid-valuation-certificate-${SAMPLE.certificateNo}.pdf`);
    expect(res.headers.get("x-blockid-watermark")).toBeNull();
    expect(res.headers.get("x-blockid-certificate-revoked")).toBeNull();
    const p = await pages(res);
    expect(p.length).toBe(3);
    const all = p.join(" ");
    expect(all).toContain(SAMPLE.certificateNo);
    expect(all).toContain(HASH);
    expect(all).toContain("A$2.40M");
    expect(all).not.toContain("Prepared for");
    expect(db.sb!.hasEq("valuation_certificates", "id", ID)).toBe(true);
    expect(db.sb!.hasEq("valuation_certificates", "project_id", "proj-1")).toBe(true);
  });

  it("another project's certificate → 404, not 403", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ project_id: "proj-other" })] });
    expect((await call()).status).toBe(404);
  });

  it("?for=<investor> burns the watermark on every page", async () => {
    const res = await call(ID, "?for=jane%40blackbird.vc");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-blockid-watermark")).toBe("1");
    const p = await pages(res);
    expect(p.length).toBe(3);
    for (const page of p) expect(page).toContain("Prepared for jane@blackbird.vc");
  });

  it("a revoked certificate still renders, banner on every page + header", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ revoked_at: "2026-10-01T00:00:00Z", revoked_reason: "re-scored" })] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-blockid-certificate-revoked")).toBe("1");
    for (const page of await pages(res)) expect(page).toContain("REVOKED");
  });

  it("503 without a database", async () => {
    db.sb = null;
    expect((await call()).status).toBe(503);
  });
});
