// Colocated vitest for /api/investor-link — P9-investor-link-route-test.
//
// The per-investor View Link surface (POST create / GET list / DELETE revoke).
// One row = one shareable link a founder hands to a named investor. Silent
// regressions here would either leak links across founders (dropping the
// session-user filter into the lib), let an anonymous caller mint a link
// (missing 401), or accept a body that overrides `founderUserId` /
// `createdByEmail` so a hostile POST creates rows attributed to another
// founder. The route also has an ownership defensibility contract: the
// investor URL must be `/s/{slug}` when slug is present (memorable form)
// and `/s/i/{token}` only when the slug column is null (legacy rows), and
// the base URL must never carry a trailing slash even if
// NEXT_PUBLIC_SITE_URL is misconfigured with one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  role: "user" | "admin";
  plan: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  discountPct: number | null;
  startupName: string | null;
  startupStage: string | null;
  industry: string | null;
  onboardingCompleted: boolean;
  startupGoals: string[] | null;
}

type CreateArgs = {
  scoreId: string;
  founderUserId: string;
  investorEmail: string;
  investorName: string | null;
  fundName: string | null;
  note: string | null;
  createdByEmail: string;
  expiresAt: Date | null;
};

type CreateResult =
  | {
      ok: true;
      link: {
        token: string;
        slug: string | null;
        investorEmail: string | null;
        investorName: string | null;
        fundName: string | null;
        createdAt: string;
      };
    }
  | { ok: false; reason: "not_configured" | "score_not_found" | "db_error" };

type RevokeResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "not_found" | "db_error" };

const mocks = vi.hoisted(() => ({
  isSupabaseConfiguredMock: vi.fn<() => boolean>(),
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  createInvestorLinkMock: vi.fn<(args: CreateArgs) => Promise<CreateResult>>(),
  listInvestorLinksForFounderMock: vi.fn<
    (uid: string, email: string) => Promise<unknown[]>
  >(),
  revokeInvestorLinkMock: vi.fn<
    (token: string, uid: string, email: string) => Promise<RevokeResult>
  >(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/investor-links", () => ({
  createInvestorLink: (a: CreateArgs) => mocks.createInvestorLinkMock(a),
  listInvestorLinksForFounder: (uid: string, email: string) =>
    mocks.listInvestorLinksForFounderMock(uid, email),
  revokeInvestorLink: (t: string, uid: string, email: string) =>
    mocks.revokeInvestorLinkMock(t, uid, email),
}));

import { GET, POST, DELETE, dynamic } from "./route";

const USER: AppUser = {
  id: "founder-1",
  email: "founder@example.com",
  displayName: "Founder",
  createdAt: "2026-01-01T00:00:00Z",
  lastLoginAt: null,
  role: "user",
  plan: "free",
  googleId: null,
  avatarUrl: null,
  discountPct: null,
  startupName: null,
  startupStage: null,
  industry: null,
  onboardingCompleted: true,
  startupGoals: null,
};

const OK_LINK = {
  token: "tok_abc123",
  slug: "sunny-lark-42",
  investorEmail: "vc@fund.com",
  investorName: "VC Ava",
  fundName: "Fund Co",
  createdAt: "2026-08-01T00:00:00Z",
};

function postReq(
  body: unknown,
  opts?: { badJson?: boolean },
): Request {
  return new Request("http://x/api/investor-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function deleteReq(id?: string | null): Request {
  const url =
    id === undefined
      ? "http://x/api/investor-link"
      : id === null
        ? "http://x/api/investor-link?id="
        : `http://x/api/investor-link?id=${encodeURIComponent(id)}`;
  return new Request(url, { method: "DELETE" });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  mocks.isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.createInvestorLinkMock.mockReset().mockResolvedValue({
    ok: true,
    link: { ...OK_LINK },
  });
  mocks.listInvestorLinksForFounderMock.mockReset().mockResolvedValue([]);
  mocks.revokeInvestorLinkMock.mockReset().mockResolvedValue({ ok: true });
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  }
});

describe("route module exports", () => {
  it("marks route dynamic so Next never prerenders investor-link management", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
describe("POST /api/investor-link — create", () => {
  it("503 when supabase not configured — never reaches auth", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValueOnce(false);
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(res.status).toBe(503);
    expect((await json(res)).ok).toBe(false);
    expect(mocks.getCurrentUserMock).not.toHaveBeenCalled();
    expect(mocks.createInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("401 when getCurrentUser resolves null — never invokes lib", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required.",
    });
    expect(mocks.createInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON body — createInvestorLink never runs", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Invalid JSON body");
    expect(mocks.createInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 when scoreId is missing", async () => {
    const res = await POST(postReq({ investorEmail: "v@f.co" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("scoreId is required");
    expect(mocks.createInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 when scoreId is only whitespace — the trim() guard fires", async () => {
    const res = await POST(postReq({ scoreId: "   ", investorEmail: "v@f.co" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("scoreId is required");
  });

  it("400 when scoreId is a non-string type — the typeof guard rejects numeric ids", async () => {
    const res = await POST(postReq({ scoreId: 123, investorEmail: "v@f.co" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("scoreId is required");
  });

  it("400 when investorEmail is missing", async () => {
    const res = await POST(postReq({ scoreId: "s1" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe(
      "investorEmail is required and must be a valid email",
    );
    expect(mocks.createInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 when investorEmail lacks '@' — a defensible-not-perfect check", async () => {
    const res = await POST(
      postReq({ scoreId: "s1", investorEmail: "not-an-email" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe(
      "investorEmail is required and must be a valid email",
    );
  });

  it("400 when expiresAt is a malformed date string — the isNaN guard fires", async () => {
    const res = await POST(
      postReq({ scoreId: "s1", investorEmail: "v@f.co", expiresAt: "not-a-date" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe(
      "expiresAt must be a valid ISO date string",
    );
    expect(mocks.createInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("valid expiresAt is forwarded as a Date instance — the lib expects Date | null not a string", async () => {
    const iso = "2026-12-31T23:59:59Z";
    await POST(
      postReq({ scoreId: "s1", investorEmail: "v@f.co", expiresAt: iso }),
    );
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.expiresAt).toBeInstanceOf(Date);
    expect(arg.expiresAt!.toISOString()).toBe(new Date(iso).toISOString());
  });

  it("expiresAt is null when the caller omits it", async () => {
    await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(mocks.createInvestorLinkMock.mock.calls[0]![0].expiresAt).toBeNull();
  });

  it("expiresAt is null when the caller sends whitespace-only string — trim() → '' falsy branch", async () => {
    await POST(
      postReq({ scoreId: "s1", investorEmail: "v@f.co", expiresAt: "   " }),
    );
    expect(mocks.createInvestorLinkMock.mock.calls[0]![0].expiresAt).toBeNull();
  });

  it("trims scoreId and investorEmail before forwarding", async () => {
    await POST(
      postReq({ scoreId: "  s1  ", investorEmail: "  vc@fund.com  " }),
    );
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.scoreId).toBe("s1");
    expect(arg.investorEmail).toBe("vc@fund.com");
  });

  it("forwards the SIGNED-IN user's id + email as founderUserId/createdByEmail — never trusts a body override", async () => {
    await POST(
      postReq({
        scoreId: "s1",
        investorEmail: "v@f.co",
        founderUserId: "another-founder",
        createdByEmail: "attacker@evil.com",
      }),
    );
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.founderUserId).toBe(USER.id);
    expect(arg.createdByEmail).toBe(USER.email);
  });

  it("passes investorName/fundName/note through unchanged when present", async () => {
    await POST(
      postReq({
        scoreId: "s1",
        investorEmail: "v@f.co",
        investorName: "Ava Chen",
        fundName: "Fund Co",
        note: "Warm intro from XYZ",
      }),
    );
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.investorName).toBe("Ava Chen");
    expect(arg.fundName).toBe("Fund Co");
    expect(arg.note).toBe("Warm intro from XYZ");
  });

  it("optional string fields default to null when omitted", async () => {
    await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.investorName).toBeNull();
    expect(arg.fundName).toBeNull();
    expect(arg.note).toBeNull();
  });

  it("optional string fields collapse to null when whitespace-only", async () => {
    await POST(
      postReq({
        scoreId: "s1",
        investorEmail: "v@f.co",
        investorName: "   ",
        fundName: "\t\n",
        note: "  ",
      }),
    );
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.investorName).toBeNull();
    expect(arg.fundName).toBeNull();
    expect(arg.note).toBeNull();
  });

  it("investorName + fundName are sliced to 200 chars max", async () => {
    const long = "A".repeat(500);
    await POST(
      postReq({
        scoreId: "s1",
        investorEmail: "v@f.co",
        investorName: long,
        fundName: long,
      }),
    );
    const arg = mocks.createInvestorLinkMock.mock.calls[0]![0];
    expect(arg.investorName).toHaveLength(200);
    expect(arg.fundName).toHaveLength(200);
  });

  it("note is sliced to 1000 chars max — a hostile long note cannot bloat the row", async () => {
    const long = "B".repeat(5000);
    await POST(
      postReq({ scoreId: "s1", investorEmail: "v@f.co", note: long }),
    );
    expect(mocks.createInvestorLinkMock.mock.calls[0]![0].note).toHaveLength(1000);
  });

  it("404 when lib reports score_not_found — a founder cannot mint a link for someone else's score", async () => {
    mocks.createInvestorLinkMock.mockResolvedValueOnce({
      ok: false,
      reason: "score_not_found",
    });
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Score not found or you do not own it.",
    });
  });

  it("503 when lib reports not_configured — the storage layer is misconfigured mid-request", async () => {
    mocks.createInvestorLinkMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_configured",
    });
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("Storage not configured.");
  });

  it("500 fallback when lib reports db_error — surfaces a generic message (never leaks the raw error)", async () => {
    mocks.createInvestorLinkMock.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
    });
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("Could not create investor link.");
  });

  it("happy path returns /s/{slug} when slug is present — the memorable-form URL", async () => {
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.token).toBe("tok_abc123");
    expect(body.slug).toBe("sunny-lark-42");
    expect(body.url).toBe("https://blockid.au/s/sunny-lark-42");
    expect(body.investorEmail).toBe("vc@fund.com");
    expect(body.investorName).toBe("VC Ava");
    expect(body.fundName).toBe("Fund Co");
    expect(body.createdAt).toBe("2026-08-01T00:00:00Z");
  });

  it("URL falls back to /s/i/{token} when slug is null — the legacy-row branch", async () => {
    mocks.createInvestorLinkMock.mockResolvedValueOnce({
      ok: true,
      link: { ...OK_LINK, slug: null },
    });
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    const body = await json(res);
    expect(body.slug).toBeNull();
    expect(body.url).toBe("https://blockid.au/s/i/tok_abc123");
  });

  it("siteUrl strips a trailing slash from NEXT_PUBLIC_SITE_URL — the URL cannot double up on '/'", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    const body = await json(res);
    expect(body.url).toBe("https://blockid.au/s/sunny-lark-42");
  });

  it("siteUrl defaults to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const res = await POST(postReq({ scoreId: "s1", investorEmail: "v@f.co" }));
    const body = await json(res);
    expect(body.url).toBe("http://localhost:3000/s/sunny-lark-42");
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
describe("GET /api/investor-link — list", () => {
  it("503 when supabase not configured — never reaches auth", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(mocks.getCurrentUserMock).not.toHaveBeenCalled();
    expect(mocks.listInvestorLinksForFounderMock).not.toHaveBeenCalled();
  });

  it("401 when getCurrentUser resolves null and never queries the link store", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required.",
    });
    expect(mocks.listInvestorLinksForFounderMock).not.toHaveBeenCalled();
  });

  it("returns 200 { ok: true, links: [] } for a founder with no links", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, links: [] });
  });

  it("forwards the signed-in user's id + email — the OR filter for legacy rows lives in the lib", async () => {
    await GET();
    expect(mocks.listInvestorLinksForFounderMock).toHaveBeenCalledTimes(1);
    expect(mocks.listInvestorLinksForFounderMock).toHaveBeenCalledWith(
      USER.id,
      USER.email,
    );
  });

  it("echoes the lib's row list verbatim so the /workspace/investor-links table sees the same shape the lib returns", async () => {
    const rows = [
      { token: "t1", slug: "a-b-1", viewCount: 3 },
      { token: "t2", slug: null, viewCount: 0 },
    ];
    mocks.listInvestorLinksForFounderMock.mockResolvedValueOnce(rows);
    const res = await GET();
    expect((await json(res)).links).toEqual(rows);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
describe("DELETE /api/investor-link — revoke", () => {
  it("503 when supabase not configured — never reaches auth", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValueOnce(false);
    const res = await DELETE(deleteReq("tok_abc"));
    expect(res.status).toBe(503);
    expect(mocks.getCurrentUserMock).not.toHaveBeenCalled();
    expect(mocks.revokeInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("401 when getCurrentUser resolves null — never touches the link store", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq("tok_abc"));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("Authentication required.");
    expect(mocks.revokeInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 when ?id= param is missing — no revoke attempted", async () => {
    const res = await DELETE(deleteReq(undefined));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "?id=<token> is required",
    });
    expect(mocks.revokeInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 when ?id= is present but empty (?id=) — the URL parser yields '' which is falsy after trim", async () => {
    const res = await DELETE(deleteReq(null));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("?id=<token> is required");
    expect(mocks.revokeInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("400 when ?id= is whitespace only — the trim() guard fires", async () => {
    const res = await DELETE(deleteReq("   "));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("?id=<token> is required");
    expect(mocks.revokeInvestorLinkMock).not.toHaveBeenCalled();
  });

  it("forwards { token, userId, email } into the lib — ownership guard lives in the lib layer", async () => {
    await DELETE(deleteReq("tok_xyz"));
    expect(mocks.revokeInvestorLinkMock).toHaveBeenCalledTimes(1);
    expect(mocks.revokeInvestorLinkMock).toHaveBeenCalledWith(
      "tok_xyz",
      USER.id,
      USER.email,
    );
  });

  it("cannot revoke another founder's link — userId + email come from the SESSION not from the URL", async () => {
    await DELETE(deleteReq("someone-elses-token"));
    const [, uid, email] = mocks.revokeInvestorLinkMock.mock.calls[0]!;
    expect(uid).toBe(USER.id);
    expect(email).toBe(USER.email);
  });

  it("404 when lib reports not_found — a founder cannot probe for another founder's tokens", async () => {
    mocks.revokeInvestorLinkMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    });
    const res = await DELETE(deleteReq("tok_unknown"));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe(
      "Link not found or you do not own it.",
    );
  });

  it("500 fallback when lib reports db_error — surfaces a generic message (never leaks the raw error)", async () => {
    mocks.revokeInvestorLinkMock.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
    });
    const res = await DELETE(deleteReq("tok_abc"));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("Could not revoke link.");
  });

  it("500 fallback when lib reports not_configured mid-request — a mid-tick env flip does not 200-with-false-success", async () => {
    mocks.revokeInvestorLinkMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_configured",
    });
    const res = await DELETE(deleteReq("tok_abc"));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("Could not revoke link.");
  });

  it("returns 200 { ok: true } when the lib confirms the revoke", async () => {
    const res = await DELETE(deleteReq("tok_abc"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("trims ?id= whitespace before forwarding", async () => {
    await DELETE(deleteReq("  tok_abc  "));
    expect(mocks.revokeInvestorLinkMock.mock.calls[0]![0]).toBe("tok_abc");
  });
});
