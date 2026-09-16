// Route tests for POST /api/evaluations/[id]/actions (G13-W5-D3 block 6 +
// block 3 CTA). 401 / 404-not-403; Zod discriminated union (unknown action,
// out-of-range ownership, extra keys → 400); each action delegates to the
// lib with the evaluation + project from the access lookup and maps the lib
// errors to 409 / 422 / 503; apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ resolveDossierAccess: (id: string, uid: string) => resolveAccessMock(id, uid) }));
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock(), claimUrlForToken: (t: string) => `https://blockid.au/claim/${t}` }));
const libs = vi.hoisted(() => ({ watchlist: vi.fn(), portfolio: vi.fn(), intro: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/investor/actions", () => ({
  addProjectToWatchlist: (i: unknown) => libs.watchlist(i),
  markInvested: (i: unknown) => libs.portfolio(i),
  requestIntro: (i: unknown) => libs.intro(i),
  requestAccess: (i: unknown) => libs.access(i),
}));
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: async () => ({ id: "org-1", name: "Blue Fund", is_personal: false }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { POST, dossierActionSchema } from "./route";

const USER = { id: "u-eval", email: "mia@fund.vc", displayName: "Mia", plan: "investor_advisor" };
const EVAL = { id: "e-1", projectId: "p-1", founderUserId: "u-f", founderEmail: "jo@acme.io", ownerKind: "founder_claimed", claimedAt: "x", consentTier: "reports_shared", inviteToken: "tok-1" };
const ACCESS = { evaluation: EVAL, project: { id: "p-1", name: "Acme", slug: "acme" }, role: "assessor" as const, viaOrgId: null };
const ctx = () => ({ params: Promise.resolve({ id: "e-1" }) });
const post = (body: unknown) => new Request("http://localhost/api/evaluations/e-1/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  resolveAccessMock.mockReset().mockResolvedValue(ACCESS);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  libs.watchlist.mockReset().mockResolvedValue({ ok: true, added: true, ticker: "PRJ-P1" });
  libs.portfolio.mockReset().mockResolvedValue({ ok: true, id: "pf-1", created: true });
  libs.intro.mockReset().mockResolvedValue({ ok: true, channel: "crm", contactId: "c-1", created: true, notified: true });
  libs.access.mockReset().mockResolvedValue({ ok: true, mode: "notified", requested: "full_mentor", notified: true });
});

describe("access + validation", () => {
  it("401 / 404 (stranger, founder, lapsed seat); wrapped; schema rejects unknown actions, bad numbers, extra keys", async () => {
    expect(isAuditedHandler(POST)).toBe(true);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({ action: "watchlist" }), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    resolveAccessMock.mockResolvedValue(null);
    expect((await POST(post({ action: "watchlist" }), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue({ ...ACCESS, role: "founder" });
    expect((await POST(post({ action: "watchlist" }), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue(ACCESS);
    isEvaluatorMock.mockResolvedValue(false);
    expect((await POST(post({ action: "watchlist" }), ctx())).status).toBe(404);
    isEvaluatorMock.mockResolvedValue(true);
    expect((await POST(post({ action: "delete" }), ctx())).status).toBe(400);
    expect((await POST(post({ action: "portfolio", ownership_pct: 101 }), ctx())).status).toBe(400);
    expect((await POST(post({ action: "watchlist", extra: 1 }), ctx())).status).toBe(400);
    expect(dossierActionSchema.safeParse({ action: "portfolio", valuation_aud: 1e13 }).success).toBe(false);
    expect(libs.watchlist).not.toHaveBeenCalled();
  });
});

describe("actions", () => {
  it("watchlist → lib with project + slug + evaluation id; 503 when unavailable", async () => {
    const res = await POST(post({ action: "watchlist" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, added: true, ticker: "PRJ-P1" });
    expect(libs.watchlist).toHaveBeenCalledWith({ userId: "u-eval", projectId: "p-1", projectSlug: "acme", evaluationId: "e-1" });
    libs.watchlist.mockResolvedValue({ ok: false, error: "unavailable", message: "x" });
    expect((await POST(post({ action: "watchlist" }), ctx())).status).toBe(503);
  });

  it("portfolio → markInvested with the optional numbers; invalid_input → 400", async () => {
    const res = await POST(post({ action: "portfolio", valuation_aud: 4000000, ownership_pct: 7.5, notes: "led" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "pf-1", created: true });
    expect(libs.portfolio).toHaveBeenCalledWith({ userId: "u-eval", projectId: "p-1", projectName: "Acme", evaluationId: "e-1", valuationAud: 4000000, ownershipPct: 7.5, investedAt: null, notes: "led" });
    libs.portfolio.mockResolvedValue({ ok: false, error: "invalid_input", message: "x" });
    expect((await POST(post({ action: "portfolio" }), ctx())).status).toBe(400);
  });

  it("intro → requestIntro with the investor + org name; crm and mailto shapes; consent_too_low 422; no_founder 409", async () => {
    const res = await POST(post({ action: "intro" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, channel: "crm", contact_id: "c-1", created: true, notified: true });
    expect(libs.intro.mock.calls[0][0]).toMatchObject({ investor: { id: "u-eval", email: "mia@fund.vc", displayName: "Mia", plan: "investor_advisor", orgName: "Blue Fund" }, evaluation: EVAL, startupName: "Acme" });
    libs.intro.mockResolvedValue({ ok: true, channel: "mailto", href: "mailto:jo@acme.io" });
    expect(await (await POST(post({ action: "intro" }), ctx())).json()).toEqual({ ok: true, channel: "mailto", href: "mailto:jo@acme.io" });
    libs.intro.mockResolvedValue({ ok: false, error: "consent_too_low", message: "x", href: "mailto:jo@acme.io" });
    const low = await POST(post({ action: "intro" }), ctx());
    expect(low.status).toBe(422);
    expect((await low.json()).href).toBe("mailto:jo@acme.io");
    libs.intro.mockResolvedValue({ ok: false, error: "no_founder", message: "x" });
    expect((await POST(post({ action: "intro" }), ctx())).status).toBe(409);
  });

  it("request_access → requestAccess with the claim url built from the invite token; already_full → 409", async () => {
    const res = await POST(post({ action: "request_access" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "notified", requested: "full_mentor", notified: true });
    expect(libs.access.mock.calls[0][0]).toMatchObject({ evaluation: EVAL, startupName: "Acme", claimUrl: "https://blockid.au/claim/tok-1" });
    libs.access.mockResolvedValue({ ok: true, mode: "invite", claimUrl: "https://blockid.au/claim/tok-1" });
    expect(await (await POST(post({ action: "request_access" }), ctx())).json()).toEqual({ ok: true, mode: "invite", claim_url: "https://blockid.au/claim/tok-1" });
    libs.access.mockResolvedValue({ ok: false, error: "already_full", message: "x" });
    expect((await POST(post({ action: "request_access" }), ctx())).status).toBe(409);
  });
});
