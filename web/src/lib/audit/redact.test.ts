import { describe, expect, it } from "vitest";
import {
  REDACTED,
  clientIp,
  defaultAction,
  defaultEntity,
  hashIp,
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
  it("clientIp prefers first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBeNull();
  });
  it("hashIp is salted, stable, 32 hex, never the raw ip", () => {
    const a = hashIp("1.2.3.4", "salt-a");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp("1.2.3.4", "salt-a")).toBe(a);
    expect(hashIp("1.2.3.4", "salt-b")).not.toBe(a);
    expect(hashIp(null)).toBeNull();
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
