// Colocated vitest for the three financial-forecast readers — release QA-4 P2-e.
//
//   GET /api/financial/forecast/[modelId]          (list models for a project)
//   GET /api/financial/forecast/[modelId]/fetch    (one model + projection)
//   GET /api/financial/forecast/[modelId]/export   (CSV)
//
// All three used to select `projects.created_by` (no such column) and so
// denied every caller, owner included. They now go through
// assertProjectAccess(viewer): owner allowed, other user 404, and nothing is
// returned when access is refused.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const assertProjectAccessMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  assertProjectAccess: (...a: unknown[]) => assertProjectAccessMock(...a),
}));

const MODEL = {
  id: "model-1",
  project_id: "proj-1",
  user_id: "owner-1",
  name: "Base case",
  is_deleted: false,
  projection_data: { months: [] },
};

const fromMock = vi.fn((table: string) => {
  if (table === "financial_models") {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: [MODEL], error: null }),
      single: async () => ({ data: MODEL, error: null }),
    };
    return chain;
  }
  throw new Error(`unexpected table ${table} — projects must NOT be read directly`);
});
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

class AccessErr extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProjectAccessError";
    this.code = code;
  }
}

import { GET as LIST } from "./route";
import { GET as FETCH } from "./fetch/route";
import { GET as EXPORT } from "./export/route";

const req = (url: string) => new NextRequest(url);
const ctx = (modelId: string) => ({ params: Promise.resolve({ modelId }) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "owner-1", email: "o@x.co" });
  assertProjectAccessMock.mockReset().mockResolvedValue({ role: "owner", isOwner: true });
  fromMock.mockClear();
});

describe("GET /api/financial/forecast/[modelId] (list)", () => {
  it("401 unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await LIST(req("http://x/api/financial/forecast/proj-1"), ctx("proj-1"))).status).toBe(401);
  });

  it("owner → 200 with models; access checked at viewer on the project id", async () => {
    const res = await LIST(req("http://x/api/financial/forecast/proj-1"), ctx("proj-1"));
    expect(res.status).toBe(200);
    expect(assertProjectAccessMock).toHaveBeenCalledWith("owner-1", "proj-1", "viewer");
    expect((await res.json()).models).toHaveLength(1);
  });

  it("other user → 404, financial_models never queried", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger", email: "s@x.co" });
    assertProjectAccessMock.mockRejectedValue(new AccessErr("not_found"));
    const res = await LIST(req("http://x/api/financial/forecast/proj-1"), ctx("proj-1"));
    expect(res.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalledWith("financial_models");
  });
});

describe("GET /api/financial/forecast/[modelId]/fetch", () => {
  it("owner → 200 with the model; access checked on the model's project", async () => {
    const res = await FETCH(req("http://x/api/financial/forecast/model-1/fetch"), ctx("model-1"));
    expect(res.status).toBe(200);
    expect(assertProjectAccessMock).toHaveBeenCalledWith("owner-1", "proj-1", "viewer");
    expect((await res.json()).model.id).toBe("model-1");
  });

  it("other user → 404 and the model is not returned", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger", email: "s@x.co" });
    assertProjectAccessMock.mockRejectedValue(new AccessErr("not_found"));
    const res = await FETCH(req("http://x/api/financial/forecast/model-1/fetch"), ctx("model-1"));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("projection_data");
  });
});

describe("GET /api/financial/forecast/[modelId]/export", () => {
  it("owner → 200 CSV attachment", async () => {
    const res = await EXPORT(req("http://x/api/financial/forecast/model-1/export?format=csv"), ctx("model-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(assertProjectAccessMock).toHaveBeenCalledWith("owner-1", "proj-1", "viewer");
  });

  it("other user → 404, no CSV", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger", email: "s@x.co" });
    assertProjectAccessMock.mockRejectedValue(new AccessErr("not_found"));
    const res = await EXPORT(req("http://x/api/financial/forecast/model-1/export"), ctx("model-1"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toMatch(/text\/csv/);
  });
});
