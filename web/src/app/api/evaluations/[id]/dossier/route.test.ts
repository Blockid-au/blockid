// Route tests for GET /api/evaluations/[id]/dossier (G13-W2-D1).
//   * 401 anonymous; 404 (never 403) for ids the caller cannot access and
//     for malformed ids (no DB call);
//   * 200 returns exactly the lib's masked view (the route filters nothing
//     — masking is pinned in lib/evaluations/dossier.test.ts) with a
//     private no-store cache header;
//   * every successful read fires the `dossier.viewed` audit with ids +
//     role only.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const loadDossierMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ loadDossier: (id: string, uid: string) => loadDossierMock(id, uid) }));

const auditMock = vi.fn();
vi.mock("@/lib/evaluations/dossier-audit", () => ({ auditDossierView: (i: unknown) => auditMock(i) }));

import { GET } from "./route";

const USER = { id: "u-1", email: "scout@fund.vc", plan: "investor_angel" };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://localhost/api/evaluations/e-1/dossier");
const VIEW = {
  viewer: { role: "assessor", userId: "u-1" },
  header: { evaluationId: "e-1", projectId: "p-1", consentTier: "reports_shared", decision: { value: "track" } },
  report: { dims: [] },
  evidence: { items: null },
  assessment: { mine: null },
};

beforeEach(() => {
  getCurrentUserMock.mockReset();
  loadDossierMock.mockReset();
  auditMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  loadDossierMock.mockResolvedValue(VIEW);
});

describe("GET /api/evaluations/[id]/dossier", () => {
  it("401s anonymous callers without touching the loader", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(loadDossierMock).not.toHaveBeenCalled();
  });

  it("404s (not 403) rows the caller cannot access and never audits them", async () => {
    loadDossierMock.mockResolvedValue(null);
    const res = await GET(req(), ctx("e-other"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
    expect(loadDossierMock).toHaveBeenCalledWith("e-other", "u-1");
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("404s a malformed id before any read", async () => {
    const res = await GET(req(), ctx("e 1;drop"));
    expect(res.status).toBe(404);
    expect(loadDossierMock).not.toHaveBeenCalled();
  });

  it("200 returns the lib's masked view verbatim, no-store, and audits dossier.viewed", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ ok: true, dossier: VIEW });
    expect(auditMock).toHaveBeenCalledWith({
      userId: "u-1",
      evaluationId: "e-1",
      projectId: "p-1",
      role: "assessor",
      consentTier: "reports_shared",
      surface: "api",
    });
  });
});
