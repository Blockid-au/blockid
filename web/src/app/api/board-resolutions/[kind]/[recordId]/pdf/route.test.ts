// Colocated tests for GET /api/board-resolutions/[kind]/[recordId]/pdf (S26-B):
// editor+ (viewer 403), not generated → 404 not_issued, another project's
// row → 404, renders the FROZEN payload with its stored hash (never a
// recompute), `?for=` watermark header, bad kind 400. S27-A: `?version=n`
// renders that version; a superseded version carries the banner props +
// `X-BlockID-Superseded`; unknown / malformed version → 404 not_issued.

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

import { GET, resolutionFilename } from "./route";

const TX = "44444444-4444-4444-8444-444444444444";
const HASH = "blockid:v1:" + "a".repeat(64);
const ROW = { id: "br-1", project_id: "proj-1", user_id: "user-caller", kind: "share-issue", record_id: TX, content_hash: HASH, payload: { version: "br-v1", title: "Circulating resolution of the directors — issue of shares" }, credits_charged: 1, issued_at: "2026-09-13T00:00:00Z" };

function seed(rows: Array<Record<string, unknown>> = [ROW]) {
  db.sb = fakeSupabase({ board_resolutions: rows });
}
function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  render.calls = [];
  seed();
}
const get = (kind = "share-issue", recordId = TX, qs = "") => GET(new Request(`http://localhost/api/board-resolutions/${kind}/${recordId}/pdf${qs}`) as never, { params: Promise.resolve({ kind, recordId }) });

beforeEach(reset);

describe("GET /api/board-resolutions/[kind]/[recordId]/pdf", () => {
  it("401 / 400 bad kind / 404 non-uuid / viewer 403 / non-member 404", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    reset();
    expect((await get("minutes")).status).toBe(400);
    expect((await get("share-issue", "nope")).status).toBe(404);
    scopeState.role = "viewer";
    expect((await get()).status).toBe(403);
    reset();
    scopeState.nonMember = true;
    expect((await get()).status).toBe(404);
  });

  it("not generated → 404 not_issued; another project's row → 404", async () => {
    seed([]);
    const res = await get();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_issued");
    seed([{ ...ROW, project_id: "proj-9" }]);
    expect((await get()).status).toBe(404);
    expect(render.calls).toHaveLength(0);
  });

  it("renders the frozen payload with the stored hash; editor allowed; clean page without ?for", async () => {
    scopeState.role = "editor";
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(resolutionFilename("share-issue", TX));
    expect(res.headers.get("x-blockid-content-hash")).toBe(HASH);
    expect(res.headers.get("x-blockid-watermark")).toBeNull();
    expect(render.calls).toHaveLength(1);
    expect(render.calls[0]).toMatchObject({ data: ROW.payload, contentHash: HASH, watermark: null });
    expect(db.sb!.hasEq("board_resolutions", "project_id", "proj-1")).toBe(true);
    expect(db.sb!.hasEq("board_resolutions", "kind", "share-issue")).toBe(true);
  });

  it("S27-A: the current version renders by default; ?version=1 renders the superseded row with the banner and headers", async () => {
    const v1 = { ...ROW, id: "br-1", content_hash: "blockid:v1:" + "1".repeat(64), version: 1, superseded_at: "2026-09-14T00:00:00Z", superseded_by: "br-2" };
    const v2 = { ...ROW, id: "br-2", content_hash: "blockid:v1:" + "2".repeat(64), version: 2, superseded_at: null, superseded_by: null };
    seed([v1, v2]);
    const cur = await get();
    expect(cur.status).toBe(200);
    expect(cur.headers.get("X-BlockID-Content-Hash")).toBe(v2.content_hash);
    expect(cur.headers.get("X-BlockID-Version")).toBe("2");
    expect(cur.headers.get("X-BlockID-Superseded")).toBeNull();
    expect(cur.headers.get("Content-Disposition")).toContain("-v2.pdf");
    expect(render.calls[0]).toMatchObject({ contentHash: v2.content_hash, version: 2, superseded: null });

    const old = await get("share-issue", TX, "?version=1");
    expect(old.status).toBe(200);
    expect(old.headers.get("X-BlockID-Content-Hash")).toBe(v1.content_hash);
    expect(old.headers.get("X-BlockID-Version")).toBe("1");
    expect(old.headers.get("X-BlockID-Superseded")).toBe("2");
    expect(render.calls[1]).toMatchObject({ contentHash: v1.content_hash, version: 1, superseded: { byVersion: 2, at: "2026-09-14T00:00:00Z" } });

    expect((await get("share-issue", TX, "?version=3")).status).toBe(404);
    expect((await get("share-issue", TX, "?version=abc")).status).toBe(404);
    expect((await get("share-issue", TX, "?version=0")).status).toBe(404);
    expect(resolutionFilename("esop", TX, 3)).toBe(`board-resolution-esop-${TX.slice(0, 8)}-v3.pdf`);
  });

  it("?for= burns the watermark", async () => {
    const res = await get("share-issue", TX, "?for=Jane%20Founder");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-blockid-watermark")).toBe("1");
    expect(String(render.calls[0].watermark)).toMatch(/^Prepared for Jane Founder · /);
  });
});
