import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  clientIp,
  defaultAction,
  defaultEntity,
  hashIp,
  resetIpSaltWarning,
  resolveIpSalt,
  isIdLike,
  pickIdParams,
  primaryEntityId,
  redactDetail,
  routeFamily,
  routePattern,
  uaFamily,
} from "./redact";

// S20-A — pure helpers: naming, redaction, IP hashing, UA family.

describe("route naming", () => {
  it("family drops dynamic segments + route groups", () => {
    expect(routeFamily("api/projects/[id]/members/route.ts")).toBe("projects.members");
    expect(routeFamily("api/data-room/[slug]/[...rest]/route.ts")).toBe("data-room");
    expect(routeFamily("api/(v1)/svi/route.ts")).toBe("svi");
    expect(routeFamily("api/route.ts")).toBe("root");
  });
  it("pattern keeps :params", () => {
    expect(routePattern("api/projects/[id]/members/route.ts")).toBe("/api/projects/:id/members");
    expect(routePattern("api/x/[...slug]/route.ts")).toBe("/api/x/:slug");
  });
  it("default action + entity", () => {
    expect(defaultAction("api/projects/[id]/members/route.ts", "POST")).toBe("projects.members.create");
    expect(defaultAction("api/svi/answers/route.ts", "PATCH")).toBe("svi.answers.update");
    expect(defaultAction("api/keys/[id]/route.ts", "DELETE")).toBe("keys.delete");
    expect(defaultEntity("api/projects/[id]/members/route.ts")).toBe("member");
    expect(defaultEntity("api/analyses/route.ts")).toBe("analysis");
    expect(defaultEntity("api/data-room/access/route.ts")).toBe("access");
  });
});

describe("redaction", () => {
  it("drops sensitive keys and non-id strings, keeps ids/numbers/booleans", () => {
    const out = redactDetail({
      id: "11111111-2222-4333-8444-555555555555",
      count: 3,
      ok: true,
      token: "abc",
      password: "hunter2",
      email: "a@b.co",
      api_key: "bk_live_x",
      stripe_session_id: "cs_test_a1b2c3",
      description: "free text here",
      note: "hello world, this is prose",
      nested: { secret_thing: 1, keep: "slug-1", deeper: { deepest: { too: "deep" } } },
      list: ["ok-id", "bad value with spaces"],
    }) as Record<string, unknown>;
    expect(out.id).toBe("11111111-2222-4333-8444-555555555555");
    expect(out.count).toBe(3);
    expect(out.ok).toBe(true);
    expect(out).not.toHaveProperty("token");
    expect(out).not.toHaveProperty("password");
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("api_key");
    expect(out).not.toHaveProperty("description");
    expect(out.stripe_session_id).toBe("cs_test_a1b2c3");
    expect(out.note).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).keep).toBe("slug-1");
    expect(out.nested as Record<string, unknown>).not.toHaveProperty("secret_thing");
    expect(((out.nested as Record<string, unknown>).deeper as Record<string, unknown>).deepest).toBe(REDACTED);
    expect(out.list).toEqual(["ok-id", REDACTED]);
  });

  it("id-like: uuids/slugs yes; emails, secrets, jwts, long hex no", () => {
    expect(isIdLike("11111111-2222-4333-8444-555555555555")).toBe(true);
    expect(isIdLike("proj_42")).toBe(true);
    expect(isIdLike("a@b.co")).toBe(false);
    expect(isIdLike("bk_live_abcdef")).toBe(false);
    expect(isIdLike("sk_test_abc")).toBe(false);
    expect(isIdLike("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig")).toBe(false);
    expect(isIdLike("a".repeat(129))).toBe(false);
    expect(isIdLike("f".repeat(64))).toBe(false);
  });

  it("caps width", () => {
    const wide = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(redactDetail(wide) as object)).toHaveLength(24);
  });

  it("pickIdParams keeps id-like values only; primaryEntityId prefers `id`", () => {
    expect(pickIdParams({ id: "abc-1", token: "t", slug: "my slug!" })).toEqual({ id: "abc-1" });
    expect(pickIdParams({ rest: ["a", "b"] })).toEqual({ rest: "a/b" });
    expect(pickIdParams(undefined)).toBeNull();
    expect(pickIdParams({ token: "x" })).toBeNull();
    expect(primaryEntityId({ kind: "grant", id: "42" })).toBe("42");
    expect(primaryEntityId({ kind: "grant" })).toBe("grant");
    expect(primaryEntityId(null)).toBeNull();
  });
});

describe("ip + ua", () => {
  // S20-A review P2-3: the first x-forwarded-for hop is client-controlled
  // (nginx appends its peer with $proxy_add_x_forwarded_for). Trust order:
  // cf-connecting-ip → LAST xff hop → x-real-ip.
  it("clientIp prefers cf-connecting-ip over everything", () => {
    expect(
      clientIp(new Headers({ "cf-connecting-ip": " 203.0.113.50 ", "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" })),
    ).toBe("203.0.113.50");
  });
  it("clientIp takes the LAST x-forwarded-for hop, never the client-sent first one", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers({ "x-forwarded-for": "<victim>, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, ,  " }))).toBe("5.6.7.8");
  });
  it("clientIp falls back to x-real-ip, then null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": " , ", "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "cf-connecting-ip": "" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
  it("hashIp is salted, stable, 32 hex, never the raw ip", () => {
    const a = hashIp("1.2.3.4", "salt-a");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp("1.2.3.4", "salt-a")).toBe(a);
    expect(hashIp("1.2.3.4", "salt-b")).not.toBe(a);
    expect(hashIp(null)).toBeNull();
  });
  describe("resolveIpSalt", () => {
    const env = { salt: process.env.AUDIT_IP_SALT, cron: process.env.CRON_SECRET };
    afterEach(() => {
      if (env.salt === undefined) delete process.env.AUDIT_IP_SALT;
      else process.env.AUDIT_IP_SALT = env.salt;
      if (env.cron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = env.cron;
      resetIpSaltWarning();
      vi.restoreAllMocks();
    });
    it("AUDIT_IP_SALT wins, CRON_SECRET is the fallback, empty strings fall through", () => {
      process.env.AUDIT_IP_SALT = "audit-salt";
      process.env.CRON_SECRET = "cron";
      expect(resolveIpSalt()).toBe("audit-salt");
      process.env.AUDIT_IP_SALT = "";
      expect(resolveIpSalt()).toBe("cron");
      expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4", "cron"));
    });
    it("logs ONCE per process when the salt resolves to empty", () => {
      delete process.env.AUDIT_IP_SALT;
      delete process.env.CRON_SECRET;
      const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
      resetIpSaltWarning();
      expect(resolveIpSalt()).toBe("");
      expect(hashIp("1.2.3.4")).toMatch(/^[0-9a-f]{32}$/);
      resolveIpSalt();
      expect(err).toHaveBeenCalledTimes(1);
      expect(String(err.mock.calls[0][0])).toContain("AUDIT_IP_SALT");
      // A salted call never logs.
      process.env.AUDIT_IP_SALT = "s";
      resetIpSaltWarning();
      resolveIpSalt();
      expect(err).toHaveBeenCalledTimes(1);
    });
  });
  it("uaFamily is coarse", () => {
    expect(uaFamily("Mozilla/5.0 Chrome/128.0 Safari/537.36")).toBe("chrome");
    expect(uaFamily("Mozilla/5.0 Version/17 Safari/605.1")).toBe("safari");
    expect(uaFamily("Mozilla/5.0 Firefox/130.0")).toBe("firefox");
    expect(uaFamily("Mozilla/5.0 Chrome/128 Edg/128")).toBe("edge");
    expect(uaFamily("curl/8.4.0")).toBe("curl");
    expect(uaFamily("node-fetch/1.0")).toBe("node");
    expect(uaFamily("Better Uptime Bot")).toBe("bot");
    expect(uaFamily(null)).toBe("none");
  });
});
