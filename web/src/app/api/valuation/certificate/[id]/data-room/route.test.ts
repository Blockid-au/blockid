// Colocated tests for POST /api/valuation/certificate/[id]/data-room (S22-A).
//
//   editor+ files the certificate through saveDeliverable under the OWNER's
//   user id (the room is the owner's), one slug per certificate number;
//   viewer → 403; another project's certificate → 404; revoked → 409.

import { beforeEach, describe, expect, it, vi } from "vitest";
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
const save = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/dataroom/save-deliverable", () => ({ saveDeliverable: (...a: unknown[]) => save.fn(...a) }));

import { POST, certificateTemplateSlug } from "./route";

const ID = "11111111-2222-4333-8444-555555555555";
const HASH = certificateContentHash(SAMPLE);

function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    project_id: "proj-1",
    user_id: "user-owner",
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

function call(id = ID) {
  return POST(new Request(`http://localhost/api/valuation/certificate/${id}/data-room`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ valuation_certificates: [row()] });
  save.fn.mockReset().mockResolvedValue({ ok: true, dataroomFileId: "df-1", storagePath: "startup-proj-1/valuation/x.pdf", downloadUrl: "https://signed" });
});

describe("POST /api/valuation/certificate/[id]/data-room", () => {
  it("editor files the rendered PDF under the owner's data room with a per-certificate slug", async () => {
    scopeState.role = "editor";
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, certificateNo: SAMPLE.certificateNo, dataroomFileId: "df-1", downloadUrl: "https://signed" });
    expect(save.fn).toHaveBeenCalledTimes(1);
    const input = save.fn.mock.calls[0][0] as Record<string, unknown>;
    expect(input.userId).toBe("user-owner");
    expect(input.email).toBe("owner@x.test");
    expect(input.projectId).toBe("proj-1");
    expect(input.mime).toBe("application/pdf");
    expect(input.template_slug).toBe(certificateTemplateSlug(SAMPLE.certificateNo));
    expect(input.template_slug).toBe("valuation-certificate-vc-7k3mp-q9x2a");
    expect(input.folder).toBe("valuation");
    expect(Buffer.from(input.buffer as Uint8Array).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("viewer → 403 and nothing is saved", async () => {
    scopeState.role = "viewer";
    expect((await call()).status).toBe(403);
    expect(save.fn).not.toHaveBeenCalled();
  });

  it("another project's certificate → 404; revoked → 409", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ project_id: "proj-other" })] });
    expect((await call()).status).toBe(404);
    db.sb = fakeSupabase({ valuation_certificates: [row({ revoked_at: "2026-10-01T00:00:00Z", revoked_reason: "x" })] });
    expect((await call()).status).toBe(409);
    expect(save.fn).not.toHaveBeenCalled();
  });

  it("maps a storage failure to the helper's status", async () => {
    save.fn.mockResolvedValue({ ok: false, error: "storage_upload_failed", status: 502 });
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_upload_failed");
  });
});
