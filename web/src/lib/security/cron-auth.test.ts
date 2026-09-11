// Colocated vitest for lib/security/cron-auth.ts (S8-C, 2026-09-11).

import { describe, expect, it } from "vitest";
import { bearerToken, cronSecret, isCronAuthorised, safeEqualStrings } from "./cron-auth";

function req(auth?: string): Pick<Request, "headers"> {
  return new Request("http://localhost/api/cron/x", { headers: auth ? { authorization: auth } : {} });
}

describe("safeEqualStrings", () => {
  it("is true only for identical strings and never throws on length mismatch", () => {
    expect(safeEqualStrings("abc", "abc")).toBe(true);
    expect(safeEqualStrings("abc", "abd")).toBe(false);
    expect(safeEqualStrings("abc", "abcd")).toBe(false);
    expect(safeEqualStrings("", "")).toBe(true);
    expect(safeEqualStrings("a", "")).toBe(false);
  });

  it("is false for non-strings", () => {
    expect(safeEqualStrings(null, "x")).toBe(false);
    expect(safeEqualStrings("x", undefined)).toBe(false);
  });

  it("takes the same code path regardless of where the strings differ (digest compare)", () => {
    // Behavioural pin: a prefix match is not distinguishable from a total
    // mismatch — both are simply false. (Timing itself is not asserted here;
    // the implementation compares fixed-length SHA-256 digests via
    // crypto.timingSafeEqual.)
    expect(safeEqualStrings("s3cret-token-value", "s3cret-token-valuX")).toBe(false);
    expect(safeEqualStrings("s3cret-token-value", "Xxxxxxxxxxxxxxxxxx")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extracts the token, case-sensitive scheme, trimmed", () => {
    expect(bearerToken(req("Bearer abc"))).toBe("abc");
    expect(bearerToken(req("Bearer   abc  "))).toBe("abc");
    // S8-E: legacy routes compared the literal `Bearer ` prefix; lowercase stays rejected.
    expect(bearerToken(req("bearer abc"))).toBeNull();
    expect(bearerToken(req("BEARER abc"))).toBeNull();
    expect(bearerToken(req("Basic abc"))).toBeNull();
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req("Bearer"))).toBeNull();
  });
});

describe("isCronAuthorised", () => {
  it("accepts the exact secret and rejects everything else", () => {
    expect(isCronAuthorised(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isCronAuthorised(req("Bearer s3cre"), "s3cret")).toBe(false);
    expect(isCronAuthorised(req("Bearer s3cretX"), "s3cret")).toBe(false);
    expect(isCronAuthorised(req("Bearer nope"), "s3cret")).toBe(false);
    expect(isCronAuthorised(req(), "s3cret")).toBe(false);
  });

  it("is always false when the secret is unset or blank", () => {
    expect(isCronAuthorised(req("Bearer "), undefined)).toBe(false);
    expect(isCronAuthorised(req("Bearer x"), "")).toBe(false);
    expect(isCronAuthorised(req("Bearer   "), "   ")).toBe(false);
  });

  it("accepts x-cron-secret / ?secret= only when the route opts in", () => {
    const withHeader = new Request("http://localhost/api/cron/x", { headers: { "x-cron-secret": "s3cret" } });
    expect(isCronAuthorised(withHeader, "s3cret")).toBe(false);
    expect(isCronAuthorised(withHeader, { secret: "s3cret", xCronSecretHeader: true })).toBe(true);
    expect(isCronAuthorised(withHeader, { secret: "other", xCronSecretHeader: true })).toBe(false);
    const wrongHeader = new Request("http://localhost/api/cron/x", { headers: { "x-cron-secret": "s3cre" } });
    expect(isCronAuthorised(wrongHeader, { secret: "s3cret", xCronSecretHeader: true })).toBe(false);

    const withQuery = new Request("http://localhost/api/cron/x?secret=s3cret");
    expect(isCronAuthorised(withQuery, "s3cret")).toBe(false);
    expect(isCronAuthorised(withQuery, { secret: "s3cret", xCronSecretHeader: true })).toBe(false);
    expect(isCronAuthorised(withQuery, { secret: "s3cret", querySecret: true })).toBe(true);
    const wrongQuery = new Request("http://localhost/api/cron/x?secret=s3cretX");
    expect(isCronAuthorised(wrongQuery, { secret: "s3cret", querySecret: true })).toBe(false);

    // A request object without a url (headers-only shape) never matches by query.
    expect(isCronAuthorised({ headers: new Headers() }, { secret: "s3cret", querySecret: true })).toBe(false);
    // Blank secret fails closed for every form.
    expect(isCronAuthorised(withHeader, { secret: "", xCronSecretHeader: true })).toBe(false);
    expect(isCronAuthorised(withQuery, { secret: "  ", querySecret: true })).toBe(false);
  });

  it("a wrong bearer does not mask a correct opt-in form, and vice versa", () => {
    const both = new Request("http://localhost/api/cron/x?secret=s3cret", {
      headers: { authorization: "Bearer nope", "x-cron-secret": "nope" },
    });
    expect(isCronAuthorised(both, { secret: "s3cret", xCronSecretHeader: true, querySecret: true })).toBe(true);
    const bearerOnly = new Request("http://localhost/api/cron/x?secret=nope", {
      headers: { authorization: "Bearer s3cret", "x-cron-secret": "nope" },
    });
    expect(isCronAuthorised(bearerOnly, { secret: "s3cret", xCronSecretHeader: true, querySecret: true })).toBe(true);
  });

  it("cronSecret() mirrors the environment for outbound self-calls", () => {
    const orig = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "outbound";
    try {
      expect(cronSecret()).toBe("outbound");
    } finally {
      if (orig === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = orig;
    }
  });

  it("reads CRON_SECRET from the environment by default", () => {
    const orig = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "env-secret";
    try {
      expect(isCronAuthorised(req("Bearer env-secret"))).toBe(true);
      expect(isCronAuthorised(req("Bearer other"))).toBe(false);
    } finally {
      if (orig === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = orig;
    }
  });
});
