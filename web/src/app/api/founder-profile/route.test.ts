// Colocated vitest for GET + POST /api/founder-profile — P9-founder-profile-route-test.
//
// The route is the founder's identity/team-signal source of truth:
//   - GET loads the existing row for the authenticated founder, falling back
//     to EMPTY_PROFILE(user.id, user.email) when no row exists so the /account
//     profile form always renders (never a null crash).
//   - POST coerces the untrusted body into the FounderProfile shape,
//     truncating free-text fields and clamping array + numeric bounds so an
//     abusive payload cannot bloat a founder's row past what the /account UI
//     can render, then upserts via saveFounderProfile().
//
// Silent regressions this suite pins against:
//   - Dropping the auth guard on GET or POST would let anon callers read
//     another founder's profile row or overwrite it (the account_id and email
//     stamped into the upsert payload come from `getCurrentUser()`, not the
//     body — a leaked auth check would let a caller set `account_id` freely).
//   - Regressing the free-text .slice() bounds (full_name 200 / role 100 /
//     linkedin_url 300 / bio 4000 / domain_insight 2000 / ambition 2000) so
//     a 5MB blob lands in the row and blows the Supabase row-size budget.
//   - Regressing the array .slice() bounds (prev_employers 20 / ship_history
//     20 / co_founders 10 / advisors 20 / notable_hires 20) so a founder can
//     submit 10k array items and the /account form can never render again.
//   - Regressing the years_in_domain clamp (Math.max(0, Math.min(60,
//     Math.round(x)))) so a `1e9` value slips through and the SVI team-signal
//     boost misfires.
//   - Flipping the `public_visible !== false` default so a founder is opted
//     out of the public /startup/[slug] page by default (breaks the guided
//     journey's dataroom-preview promise).
//   - Flipping the `contactable_by_investors === true` default so investor
//     outreach is opted IN by default (breaks Corps Act s912A consent posture
//     and OAIC's Australian Privacy Principle 5 "notification of collection"
//     expectation for the investor-outreach purpose).
//   - Regressing the JSON-parse `catch` and 500-ing the /account form on any
//     malformed body (the widget must return a structured 400 so the client
//     can retry).
//   - Regressing the array-only guard (`Array.isArray(...) ? ... : []`) so a
//     `prev_employers: "acme"` string lands as a per-character `.map(String)`
//     ("a","c","m","e"), breaking the /account chip list.
//   - Dropping the numeric-only guard on years_in_domain so a `"25"` string
//     lands as-is and the ORDER BY years_in_domain DESC query on the
//     founder-explorer page mis-sorts.
//   - Regressing the 200 vs 500 status derivation from `saveFounderProfile`'s
//     `ok` field so a DB error 200s and the /account form's "Saved" toast
//     lies to the founder.
//   - Regressing the EMPTY_PROFILE fallback so `profile: null` reaches the
//     /account form and every field crashes on `.trim()`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// --- Types --------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
  displayName?: string | null;
}

interface CoFounder {
  name: string;
  role: string;
  linkedin?: string;
  bio?: string;
}

interface Advisor {
  name: string;
  role: string;
  linkedin?: string;
}

interface FounderProfileShape {
  id?: string;
  account_id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  linkedin_url: string | null;
  bio: string | null;
  prev_employers: string[];
  ship_history: string[];
  years_in_domain: number | null;
  domain_insight: string | null;
  ambition: string | null;
  co_founders: CoFounder[];
  advisors: Advisor[];
  notable_hires: Array<{ name: string; role: string; from?: string }>;
  public_visible: boolean;
  contactable_by_investors: boolean;
}

interface SaveResult {
  ok: boolean;
  error?: string;
}

// --- Mocks (registered BEFORE route import) -------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  loadFounderProfileMock: vi.fn<(id: string) => Promise<FounderProfileShape | null>>(),
  saveFounderProfileMock: vi.fn<(p: FounderProfileShape) => Promise<SaveResult>>(),
  emptyProfileSpy: vi.fn<(id: string, email: string) => FounderProfileShape>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/founder-profile", () => ({
  loadFounderProfile: (id: string) => mocks.loadFounderProfileMock(id),
  saveFounderProfile: (p: FounderProfileShape) => mocks.saveFounderProfileMock(p),
  EMPTY_PROFILE: (id: string, email: string): FounderProfileShape => {
    mocks.emptyProfileSpy(id, email);
    return {
      account_id: id,
      email,
      full_name: null,
      role: null,
      linkedin_url: null,
      bio: null,
      prev_employers: [],
      ship_history: [],
      years_in_domain: null,
      domain_insight: null,
      ambition: null,
      co_founders: [],
      advisors: [],
      notable_hires: [],
      public_visible: true,
      contactable_by_investors: false,
    };
  },
}));

import { GET, POST, dynamic } from "./route";

// --- Helpers --------------------------------------------------------------

function jsonPost(body: unknown): NextRequest {
  return new Request("http://localhost/api/founder-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset();
  mocks.loadFounderProfileMock.mockReset();
  mocks.saveFounderProfileMock.mockReset();
  mocks.emptyProfileSpy.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — the account form must never render a stale profile", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --------------------------------------------------------------------------
describe("GET /api/founder-profile", () => {
  it("returns 401 when unauthenticated — anon calls must NEVER read a profile", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    expect(mocks.loadFounderProfileMock).not.toHaveBeenCalled();
  });

  it("returns the stored profile verbatim when one exists", async () => {
    const stored: FounderProfileShape = {
      account_id: "u-1",
      email: "founder@x.com",
      full_name: "Ada Lovelace",
      role: "CEO",
      linkedin_url: "https://linkedin.com/in/ada",
      bio: "Building the analytical engine.",
      prev_employers: ["Analytical Engine Co."],
      ship_history: ["Note G"],
      years_in_domain: 12,
      domain_insight: "Programs compose like functions.",
      ambition: "Ship the first algorithm.",
      co_founders: [{ name: "Charles B.", role: "CTO" }],
      advisors: [],
      notable_hires: [],
      public_visible: true,
      contactable_by_investors: false,
    };
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.loadFounderProfileMock.mockResolvedValue(stored);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profile).toEqual(stored);
    // EMPTY_PROFILE fallback must NOT fire when a row exists
    expect(mocks.emptyProfileSpy).not.toHaveBeenCalled();
    // loadFounderProfile is called with the auth user's id (not any header/query)
    expect(mocks.loadFounderProfileMock).toHaveBeenCalledWith("u-1");
  });

  it("falls back to EMPTY_PROFILE when no row exists — form must always render", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-2", email: "new@x.com" });
    mocks.loadFounderProfileMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profile).not.toBeNull();
    // Stamps come from getCurrentUser, not from any client input
    expect(body.profile.account_id).toBe("u-2");
    expect(body.profile.email).toBe("new@x.com");
    // Empty-profile defaults pinned
    expect(body.profile.full_name).toBeNull();
    expect(body.profile.prev_employers).toEqual([]);
    expect(body.profile.public_visible).toBe(true);
    expect(body.profile.contactable_by_investors).toBe(false);
    expect(mocks.emptyProfileSpy).toHaveBeenCalledWith("u-2", "new@x.com");
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile", () => {
  it("returns 401 when unauthenticated — anon calls must NEVER upsert", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonPost({ full_name: "Attacker" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    expect(mocks.saveFounderProfileMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON — must NOT 500 the /account form", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    const req = new Request("http://localhost/api/founder-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid JSON" });
    expect(mocks.saveFounderProfileMock).not.toHaveBeenCalled();
  });

  it("stamps account_id + email from the auth user — never trusts body values", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-real", email: "real@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({
      account_id: "u-forged",
      email: "attacker@evil.com",
      full_name: "Test",
    }));
    const payload = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(payload.account_id).toBe("u-real");
    expect(payload.email).toBe("real@x.com");
  });

  it("truncates free-text fields to their byte budgets", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({
      full_name: "a".repeat(500),
      role: "b".repeat(500),
      linkedin_url: "c".repeat(500),
      bio: "d".repeat(5000),
      domain_insight: "e".repeat(3000),
      ambition: "f".repeat(3000),
    }));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.full_name!.length).toBe(200);
    expect(p.role!.length).toBe(100);
    expect(p.linkedin_url!.length).toBe(300);
    expect(p.bio!.length).toBe(4000);
    expect(p.domain_insight!.length).toBe(2000);
    expect(p.ambition!.length).toBe(2000);
  });

  it("coerces non-string free-text values via .toString() — never crashes on numbers/booleans", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({
      full_name: 12345,
      role: true,
      linkedin_url: 42,
    }));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.full_name).toBe("12345");
    expect(p.role).toBe("true");
    expect(p.linkedin_url).toBe("42");
  });

  it("nulls missing free-text fields — never writes undefined to the row", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({}));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.full_name).toBeNull();
    expect(p.role).toBeNull();
    expect(p.linkedin_url).toBeNull();
    expect(p.bio).toBeNull();
    expect(p.domain_insight).toBeNull();
    expect(p.ambition).toBeNull();
    expect(p.years_in_domain).toBeNull();
  });

  it("clamps array fields to their max sizes and preserves order", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    const twentyFive = Array.from({ length: 25 }, (_, i) => `job-${i}`);
    const twelve = Array.from({ length: 12 }, (_, i) => ({ name: `co-${i}`, role: "CTO" }));
    const twentyFiveAdv = Array.from({ length: 25 }, (_, i) => ({ name: `adv-${i}`, role: "Advisor" }));
    const twentyFiveHires = Array.from({ length: 25 }, (_, i) => ({ name: `h-${i}`, role: "Eng" }));
    await POST(jsonPost({
      prev_employers: twentyFive,
      ship_history: twentyFive,
      co_founders: twelve,
      advisors: twentyFiveAdv,
      notable_hires: twentyFiveHires,
    }));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.prev_employers).toHaveLength(20);
    expect(p.prev_employers[0]).toBe("job-0");
    expect(p.prev_employers[19]).toBe("job-19");
    expect(p.ship_history).toHaveLength(20);
    expect(p.co_founders).toHaveLength(10);
    expect(p.co_founders[0]!.name).toBe("co-0");
    expect(p.advisors).toHaveLength(20);
    expect(p.notable_hires).toHaveLength(20);
  });

  it("coerces prev_employers + ship_history items to strings via .map(String)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({
      prev_employers: [1, "two", { name: "Acme" }],
      ship_history: [true, null],
    }));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.prev_employers).toEqual(["1", "two", "[object Object]"]);
    // null in ship_history becomes "null" via String(null) — not filtered out;
    // this pins the current shape so any future filter is a deliberate change.
    expect(p.ship_history).toEqual(["true", "null"]);
  });

  it("rejects non-array array-fields with [] — never per-character-explodes a string", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({
      prev_employers: "acme",
      ship_history: 42,
      co_founders: "solo",
      advisors: null,
      notable_hires: { name: "solo" },
    }));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.prev_employers).toEqual([]);
    expect(p.ship_history).toEqual([]);
    expect(p.co_founders).toEqual([]);
    expect(p.advisors).toEqual([]);
    expect(p.notable_hires).toEqual([]);
  });

  it("clamps years_in_domain to [0, 60] via Math.round after guard", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({ years_in_domain: 999 }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].years_in_domain).toBe(60);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ years_in_domain: -5 }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].years_in_domain).toBe(0);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ years_in_domain: 12.6 }));
    // Math.round(12.6) = 13
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].years_in_domain).toBe(13);
  });

  it("nulls years_in_domain when body sends a non-number (e.g. string)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    await POST(jsonPost({ years_in_domain: "25" }));
    // string "25" fails typeof === "number" — coerces to null, not 25
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].years_in_domain).toBeNull();
  });

  it("public_visible defaults to true (opt-in visibility) — only explicit false disables", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });

    await POST(jsonPost({}));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].public_visible).toBe(true);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ public_visible: undefined }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].public_visible).toBe(true);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ public_visible: null }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].public_visible).toBe(true);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ public_visible: false }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].public_visible).toBe(false);
  });

  it("contactable_by_investors defaults to false (opt-in outreach — APP 5 posture)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });

    await POST(jsonPost({}));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].contactable_by_investors).toBe(false);

    mocks.saveFounderProfileMock.mockClear();
    // Truthy but not === true — must NOT flip to true (guards against a "1"
    // string or 1 numeric from a legacy client accidentally opting a founder in)
    await POST(jsonPost({ contactable_by_investors: "yes" }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].contactable_by_investors).toBe(false);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ contactable_by_investors: 1 }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].contactable_by_investors).toBe(false);

    mocks.saveFounderProfileMock.mockClear();
    await POST(jsonPost({ contactable_by_investors: true }));
    expect(mocks.saveFounderProfileMock.mock.calls[0]![0].contactable_by_investors).toBe(true);
  });

  it("passes through co_founders + advisors array items verbatim (no per-item schema coerce)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    const co = [{ name: "A", role: "CTO", linkedin: "https://l/a", bio: "x" }];
    const adv = [{ name: "B", role: "Advisor" }];
    await POST(jsonPost({ co_founders: co, advisors: adv }));
    const p = mocks.saveFounderProfileMock.mock.calls[0]![0];
    expect(p.co_founders).toEqual(co);
    expect(p.advisors).toEqual(adv);
  });

  it("returns 200 with the save result on success", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: true });
    const res = await POST(jsonPost({ full_name: "Ada" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 500 with error passthrough when save fails", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
    mocks.saveFounderProfileMock.mockResolvedValue({ ok: false, error: "DB timeout" });
    const res = await POST(jsonPost({ full_name: "Ada" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "DB timeout" });
  });
});
