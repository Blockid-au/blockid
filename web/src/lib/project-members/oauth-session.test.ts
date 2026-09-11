// S18-A review P1-2 — `oauthSessionOrRedirect` binds an OAuth callback to
// the SESSION user: no session → `<provider>_unauthenticated`; state email
// ≠ session email (case/whitespace-insensitive) → `<provider>_email_mismatch`;
// otherwise the session user is returned so the route's data-email fallback
// is `user.email`, never the caller-supplied state value.

import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

import { oauthSessionOrRedirect } from "./oauth-session";

const REDIRECT = "https://blockid.test/workspace/evidence";

function location(res: Response) {
  return new URL(res.headers.get("location")!);
}

beforeEach(() => {
  auth.user = { id: "u-1", email: "caller@x.test" };
});

describe("oauthSessionOrRedirect", () => {
  it("no session → redirect ?error=<provider>_unauthenticated, user null", async () => {
    auth.user = null;
    const r = await oauthSessionOrRedirect("caller@x.test", REDIRECT, "github");
    expect(r.user).toBeNull();
    const loc = location(r.denied!);
    expect(loc.origin + loc.pathname).toBe(REDIRECT);
    expect(loc.searchParams.get("error")).toBe("github_unauthenticated");
  });

  it("state email belongs to someone else → ?error=<provider>_email_mismatch", async () => {
    const r = await oauthSessionOrRedirect("victim@x.test", REDIRECT, "xero");
    expect(r.user).toBeNull();
    expect(location(r.denied!).searchParams.get("error")).toBe("xero_email_mismatch");
  });

  it("empty state email never matches", async () => {
    const r = await oauthSessionOrRedirect("", REDIRECT, "stripe");
    expect(r.user).toBeNull();
    expect(location(r.denied!).searchParams.get("error")).toBe("stripe_email_mismatch");
  });

  it("matching email (case + surrounding whitespace insensitive) → the SESSION user", async () => {
    const r = await oauthSessionOrRedirect("  Caller@X.TEST ", REDIRECT, "linkedin");
    expect(r.denied).toBeNull();
    expect(r.user).toEqual({ id: "u-1", email: "caller@x.test" });
  });

  it("keeps existing query params on the redirect target", async () => {
    auth.user = null;
    const r = await oauthSessionOrRedirect("x@y.z", `${REDIRECT}?tab=sources`, "analytics");
    const loc = location(r.denied!);
    expect(loc.searchParams.get("tab")).toBe("sources");
    expect(loc.searchParams.get("error")).toBe("analytics_unauthenticated");
  });
});
