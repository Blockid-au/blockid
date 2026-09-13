// Colocated tests for POST /api/board-resolutions/[kind]/[recordId]/data-room (S26-B):
// editor+ (viewer 403), not generated → 409 not_issued, files the resolution
// under the project OWNER's user id with a stable slug (re-save replaces),
// clean page (no watermark), governance folder, save-deliverable error codes
// pass through.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

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

const render = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/pdf/board-resolution-pdf", () => ({
  renderBoardResolutionPdf: async (props: Record<string, unknown>) => {
    render.calls.push(props);
    return Buffer.from("%PDF-1.4 resolution");
  },
}));

const save = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock("@/lib/dataroom/save-deliverable", () => ({
  saveDeliverable: async (input: Record<string, unknown>) => {
    save.calls.push(input);
    if (save.fail) return { ok: false, error: "storage_upload_failed", status: 502 };
    return { ok: true, dataroomFileId: "df-1", storagePath: `startup-proj-1/governance/${input.template_slug}-br-v1.pdf`, downloadUrl: null };
  },
}));

import { POST, resolutionTemplateSlug } from "./route";

const DIV = "11111111-1111-4111-8111-111111111111";
const ROW = { id: "br-1", project_id: "proj-1", user_id: "user-caller", kind: "dividend", record_id: DIV, content_hash: "blockid:v1:" + "b".repeat(64), payload: { version: "br-v1", title: "Circulating resolution of the directors — declaration of dividend" }, credits_charged: 1, issued_at: "2026-09-13T00:00:00Z" };

function seed(rows: Array<Record<string, unknown>> = [ROW]) {
  db.sb = fakeSupabase({ board_resolutions: rows });
}
function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  render.calls = [];
  save.calls = [];
  save.fail = false;
  seed();
}
const post = (kind = "dividend", recordId = DIV) => POST(new Request(`http://localhost/api/board-resolutions/${kind}/${recordId}/data-room`, { method: "POST" }), { params: Promise.resolve({ kind, recordId }) });

beforeEach(reset);

describe("POST /api/board-resolutions/[kind]/[recordId]/data-room", () => {
  it("401 / 400 / 404 / viewer 403", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
    reset();
    expect((await post("minutes")).status).toBe(400);
    expect((await post("dividend", "nope")).status).toBe(404);
    scopeState.role = "viewer";
    expect((await post()).status).toBe(403);
    expect(save.calls).toHaveLength(0);
  });

  it("not generated → 409 not_issued", async () => {
    seed([]);
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not_issued");
  });

  it("editor member files the clean PDF under the OWNER's id in the governance folder with a stable slug", async () => {
    scopeState.role = "editor";
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dataroomFileId: "df-1" });
    expect(render.calls[0]).toMatchObject({ data: ROW.payload, contentHash: ROW.content_hash, watermark: null });
    expect(save.calls).toHaveLength(1);
    expect(save.calls[0]).toMatchObject({
      userId: "user-owner",
      email: "owner@x.test",
      projectId: "proj-1",
      mime: "application/pdf",
      template_version: "br-v1",
      svi_dimension: "cgh",
      folder: "governance",
      filename: "Circulating resolution of the directors — declaration of dividend.pdf",
      template_slug: resolutionTemplateSlug("dividend", DIV),
    });
    expect(resolutionTemplateSlug("dividend", DIV.toUpperCase())).toBe(`board-resolution-dividend-${DIV}`);
  });

  it("save-deliverable error codes pass through", async () => {
    save.fail = true;
    const res = await post();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_upload_failed");
  });
});
