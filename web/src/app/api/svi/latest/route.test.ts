// Colocated vitest for GET /api/svi/latest.
//
// Route returns the caller's most-recent svi_analyses row for a given email,
// with a public / authenticated split:
//   - anonymous callers: only { totalSvi, tier } (delta display on marketing surfaces)
//   - authenticated callers whose session.user_id maps to an app_users row with
//     the same email: full { slug, totalSvi, inputType, createdAt, tier, analysisJson }
//
// Suite pins the silent-regression surface that broke before P5 route-test
// coverage started:
//   - 400 on missing / whitespace-only email query param
//   - email is lowercased + trimmed before the svi_analyses lookup
//   - 200 { analysis: null } when supabase is not configured (no getSupabaseAdmin call)
//   - anon path: no session cookie → only totalSvi + tier surfaced
//   - anon path: session token present but no row → still anonymous shape
//   - anon path: session row present but user's email does NOT match the query param
//     (case/whitespace normalised on both sides) → anonymous shape (no analysisJson leak)
//   - auth path: matching email surfaces full analysisJson (case-insensitive match)
//   - auth path with active project → svi_analyses scoped by project_id
//   - auth path without active project → svi_analyses scoped by project_id IS NULL
//   - anon path: project scoping helpers are NEVER invoked
//   - tier defaults to "standard" when rnd_report_json is null / missing tier
//   - inputType defaults to "idea" when input_type column is null
//   - analysisJson defaults to null when analysis_json column is null
//   - 200 { analysis: null } when the query yields no rows (auth + anon)

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  getProjectIdFromRequest: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
  isSupabaseConfigured: () => mocks.isSupabaseConfigured(),
}));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
}));

import { GET } from "./route";

type AnalysisRow = {
  id: string;
  email: string;
  total_svi: number | null;
  input_type: string | null;
  created_at: string;
  rnd_report_json: Record<string, unknown> | null;
  analysis_json: Record<string, unknown> | null;
};

type SessionRow = { user_id: string } | null;
type UserRow = { email: string | null } | null;

function makeCookieStore(sessionToken?: string) {
  return {
    get: vi.fn((name: string) =>
      name === "blockid_session" && sessionToken
        ? { value: sessionToken }
        : undefined,
    ),
  };
}

/**
 * Chainable query-builder mock. Records every eq/is call so tests can assert
 * that project_id scoping was applied correctly.
 */
function makeAnalysisBuilder(row: AnalysisRow | null) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const chain = (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  builder.select = chain("select");
  builder.eq = chain("eq");
  builder.is = chain("is");
  builder.order = chain("order");
  builder.limit = chain("limit");
  builder.maybeSingle = vi.fn(async () => ({ data: row }));
  return { builder, calls };
}

function makeSessionBuilder(row: SessionRow) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn(async () => ({ data: row })),
      }),
    }),
  };
}

function makeUserBuilder(row: UserRow) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn(async () => ({ data: row })),
      }),
    }),
  };
}

function makeSb(opts: {
  analysis?: AnalysisRow | null;
  session?: SessionRow;
  user?: UserRow;
}) {
  const analysis = makeAnalysisBuilder(opts.analysis ?? null);
  const from = vi.fn((table: string) => {
    if (table === "sessions") return makeSessionBuilder(opts.session ?? null);
    if (table === "app_users") return makeUserBuilder(opts.user ?? null);
    if (table === "svi_analyses") return analysis.builder;
    throw new Error(`unexpected supabase.from(${table})`);
  });
  return { sb: { from }, analysis };
}

function req(email: string | null) {
  const suffix = email === null ? "" : `?email=${encodeURIComponent(email)}`;
  return new Request(`http://x/api/svi/latest${suffix}`);
}

const FULL_ROW: AnalysisRow = {
  id: "svi-abc",
  email: "founder@example.com",
  total_svi: 74,
  input_type: "url",
  created_at: "2026-08-08T00:00:00.000Z",
  rnd_report_json: { tier: "enhanced" },
  analysis_json: { criteria: {}, overall: 74 },
};

beforeEach(() => {
  mocks.cookies.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.isSupabaseConfigured.mockReset();
  mocks.getProjectIdFromRequest.mockReset();

  mocks.cookies.mockResolvedValue(makeCookieStore());
  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.getProjectIdFromRequest.mockResolvedValue(null);
});

describe("GET /api/svi/latest", () => {
  it("returns 400 when the email query param is missing", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 when the email query param is whitespace only", async () => {
    // ?email=%20%20 → after .trim() becomes "", which is falsy → 400.
    const res = await GET(req("   "));
    expect(res.status).toBe(400);
  });

  it("returns 200 { analysis: null } when supabase is not configured (no getSupabaseAdmin call)", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    const res = await GET(req("founder@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, analysis: null });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.getProjectIdFromRequest).not.toHaveBeenCalled();
  });

  it("returns 200 { analysis: null } when supabase query yields no rows (anon path)", async () => {
    const { sb } = makeSb({ analysis: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await GET(req("nobody@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, analysis: null });
  });

  it("lowercases + trims the email before the svi_analyses lookup", async () => {
    const { sb, analysis } = makeSb({ analysis: FULL_ROW });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    await GET(req("  Founder@Example.COM  "));
    const emailEq = analysis.calls.find(
      (c) => c.op === "eq" && c.args[0] === "email",
    );
    expect(emailEq).toBeDefined();
    expect(emailEq!.args[1]).toBe("founder@example.com");
  });

  it("returns only totalSvi + tier for anonymous callers (no session cookie)", async () => {
    const { sb } = makeSb({ analysis: FULL_ROW });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore()); // no cookie
    const res = await GET(req("founder@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toEqual({ totalSvi: 74, tier: "enhanced" });
    expect(body.analysis.analysisJson).toBeUndefined();
    expect(body.analysis.slug).toBeUndefined();
    expect(mocks.getProjectIdFromRequest).not.toHaveBeenCalled();
  });

  it("stays anonymous when a session cookie exists but the session row is missing", async () => {
    const { sb } = makeSb({ analysis: FULL_ROW, session: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("stale-token"));
    const res = await GET(req("founder@example.com"));
    const body = await res.json();
    expect(body.analysis).toEqual({ totalSvi: 74, tier: "enhanced" });
    expect(mocks.getProjectIdFromRequest).not.toHaveBeenCalled();
  });

  it("stays anonymous when the session user's email does not match the query param", async () => {
    const { sb } = makeSb({
      analysis: FULL_ROW,
      session: { user_id: "u-1" },
      user: { email: "someone-else@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));
    const res = await GET(req("founder@example.com"));
    const body = await res.json();
    expect(body.analysis).toEqual({ totalSvi: 74, tier: "enhanced" });
    expect(body.analysis.analysisJson).toBeUndefined();
    expect(mocks.getProjectIdFromRequest).not.toHaveBeenCalled();
  });

  it("returns full analysisJson when the session user's email matches (case-insensitive)", async () => {
    const { sb } = makeSb({
      analysis: FULL_ROW,
      session: { user_id: "u-1" },
      user: { email: "FOUNDER@example.com" }, // stored casing differs
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));

    const res = await GET(req("founder@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      analysis: {
        slug: FULL_ROW.id,
        totalSvi: 74,
        inputType: "url",
        createdAt: FULL_ROW.created_at,
        tier: "enhanced",
        analysisJson: FULL_ROW.analysis_json,
      },
    });
  });

  it("scopes svi_analyses by project_id when the caller has an active project", async () => {
    const { sb, analysis } = makeSb({
      analysis: FULL_ROW,
      session: { user_id: "u-1" },
      user: { email: "founder@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-42");

    await GET(req("founder@example.com"));

    const projectEq = analysis.calls.find(
      (c) => c.op === "eq" && c.args[0] === "project_id",
    );
    expect(projectEq).toBeDefined();
    expect(projectEq!.args[1]).toBe("proj-42");

    // Must NOT also apply the IS NULL fallback in the same call.
    const projectIsNull = analysis.calls.find(
      (c) => c.op === "is" && c.args[0] === "project_id",
    );
    expect(projectIsNull).toBeUndefined();
  });

  it("scopes svi_analyses by project_id IS NULL when authed caller has no active project", async () => {
    const { sb, analysis } = makeSb({
      analysis: FULL_ROW,
      session: { user_id: "u-1" },
      user: { email: "founder@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));
    mocks.getProjectIdFromRequest.mockResolvedValue(null);

    await GET(req("founder@example.com"));

    const projectIsNull = analysis.calls.find(
      (c) => c.op === "is" && c.args[0] === "project_id",
    );
    expect(projectIsNull).toBeDefined();
    expect(projectIsNull!.args[1]).toBeNull();

    // And no project_id equality applied.
    const projectEq = analysis.calls.find(
      (c) => c.op === "eq" && c.args[0] === "project_id",
    );
    expect(projectEq).toBeUndefined();
  });

  it("defaults tier to 'standard' when rnd_report_json is null", async () => {
    const { sb } = makeSb({
      analysis: { ...FULL_ROW, rnd_report_json: null },
      session: { user_id: "u-1" },
      user: { email: "founder@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));

    const res = await GET(req("founder@example.com"));
    const body = await res.json();
    expect(body.analysis.tier).toBe("standard");
  });

  it("defaults tier to 'standard' when rnd_report_json is present but missing tier", async () => {
    const { sb } = makeSb({
      analysis: { ...FULL_ROW, rnd_report_json: { other: "meta" } },
      session: { user_id: "u-1" },
      user: { email: "founder@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));

    const res = await GET(req("founder@example.com"));
    const body = await res.json();
    expect(body.analysis.tier).toBe("standard");
  });

  it("defaults inputType to 'idea' when input_type column is null (auth path)", async () => {
    const { sb } = makeSb({
      analysis: { ...FULL_ROW, input_type: null },
      session: { user_id: "u-1" },
      user: { email: "founder@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));

    const res = await GET(req("founder@example.com"));
    const body = await res.json();
    expect(body.analysis.inputType).toBe("idea");
  });

  it("defaults analysisJson to null when analysis_json column is null (auth path)", async () => {
    const { sb } = makeSb({
      analysis: { ...FULL_ROW, analysis_json: null },
      session: { user_id: "u-1" },
      user: { email: "founder@example.com" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockResolvedValue(makeCookieStore("tok"));

    const res = await GET(req("founder@example.com"));
    const body = await res.json();
    expect(body.analysis.analysisJson).toBeNull();
  });

  it("still resolves anonymous when cookies() throws (defensive catch)", async () => {
    const { sb } = makeSb({ analysis: FULL_ROW });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    mocks.cookies.mockRejectedValue(new Error("cookie store unavailable"));

    const res = await GET(req("founder@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toEqual({ totalSvi: 74, tier: "enhanced" });
    expect(mocks.getProjectIdFromRequest).not.toHaveBeenCalled();
  });
});
