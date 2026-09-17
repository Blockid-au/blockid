// G14-S38 — GET /api/v1/evaluations/{id}/dossier. The dossier is read
// through `loadDossier(id, keyOwner)` — the same loader + consent masking
// the workspace page uses — so this test pins the SEAMS, not the masking
// (dossier.test.ts owns that): key owner as viewer, 404 for a stranger /
// founder-role / lapsed persona (never 403), audit surface "api", and
// the auth ladder in front of everything.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const validateMock = vi.fn();
const rateLimitMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({ validateApiKey: (k: string) => validateMock(k), checkRateLimit: (...a: unknown[]) => rateLimitMock(...(a as [])) }));
const canMock = vi.fn(async () => true);
vi.mock("@/lib/entitlements", () => ({ can: (...a: unknown[]) => canMock(...(a as [])) }));
const loadMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ loadDossier: (...a: unknown[]) => loadMock(...(a as [])) }));
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: (...a: unknown[]) => isEvaluatorMock(...(a as [])) }));
const auditMock = vi.fn();
vi.mock("@/lib/evaluations/dossier-audit", () => ({ auditDossierView: (...a: unknown[]) => auditMock(...(a as [])) }));

import { GET } from "./route";

const KEY = `bk_live_${"e".repeat(48)}`;
const DOSSIER = {
  viewer: { role: "assessor", userId: "u-eval" },
  header: { evaluationId: "e-1", projectId: "p-1", consentTier: "attributed_only", svi: 61, snapshotId: "s-1" },
  evidence: { tier: "attributed_only", items: null },
};
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
type Req = Parameters<typeof GET>[0];
function req(auth: string | null = `Bearer ${KEY}`, id = "e-1"): Req {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request(`http://localhost/api/v1/evaluations/${id}/dossier`, { headers }) as unknown as Req;
}

beforeEach(() => {
  validateMock.mockReset().mockResolvedValue({ valid: true, userId: "u-eval", keyHash: "hash-1", rateLimitPerMin: 100, scopes: ["analyze", "evaluations:read"] });
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 7, resetAt: new Date(Date.now() + 30_000) });
  canMock.mockReset().mockResolvedValue(true);
  loadMock.mockReset().mockResolvedValue(DOSSIER);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  auditMock.mockReset();
});

describe("auth ladder", () => {
  it("401 · 429 · 402 · 403 before any loader call", async () => {
    expect((await GET(req(null), ctx())).status).toBe(401);
    rateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(Date.now() + 5_000) });
    expect((await GET(req(), ctx())).status).toBe(429);
    canMock.mockResolvedValueOnce(false);
    expect((await GET(req(), ctx())).status).toBe(402);
    validateMock.mockResolvedValueOnce({ valid: true, userId: "u-eval", keyHash: "hash-1", rateLimitPerMin: 100, scopes: ["analyze"] });
    expect((await GET(req(), ctx())).status).toBe(403);
    expect(loadMock).not.toHaveBeenCalled();
  });
});

describe("read", () => {
  it("loads the dossier with the KEY OWNER as viewer and returns it verbatim (masking happens in the loader); audit surface api; headers", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dossier: DOSSIER });
    expect(loadMock).toHaveBeenCalledWith("e-1", "u-eval");
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-eval", evaluationId: "e-1", projectId: "p-1", role: "assessor", consentTier: "attributed_only", surface: "api", sviTotal: 61, snapshotId: "s-1" }));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("7");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("404 for a malformed id (no loader call), a stranger (loader null), a founder-role viewer and a lapsed evaluator persona — never 403", async () => {
    expect((await GET(req(undefined, "e 1"), ctx("e 1"))).status).toBe(404);
    expect(loadMock).not.toHaveBeenCalled();
    loadMock.mockResolvedValueOnce(null);
    expect((await GET(req(), ctx())).status).toBe(404);
    loadMock.mockResolvedValueOnce({ ...DOSSIER, viewer: { role: "founder", userId: "u-eval" } });
    const founder = await GET(req(), ctx());
    expect(founder.status).toBe(404);
    expect(JSON.stringify(await founder.json())).not.toContain("p-1");
    isEvaluatorMock.mockResolvedValueOnce(false);
    expect((await GET(req(), ctx())).status).toBe(404);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
