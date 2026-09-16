import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));

import { isSafeNext, landingHrefFor, postLoginHref, resolvePostLoginHref } from "./post-login";

describe("resolvePostLoginHref — auth `next` through PERSONAS (S-IA4)", () => {
  beforeEach(() => {
    delete process.env.PERSONA_LANDING;
  });

  it("an explicit relative `next` always wins", () => {
    expect(resolvePostLoginHref({ persona: "investor_angel", onboardingCompleted: false, next: "/workspace/evaluations?claim=t" })).toBe("/workspace/evaluations?claim=t");
  });

  it("protocol-relative / absolute `next` is ignored", () => {
    expect(isSafeNext("//evil.test/x")).toBe(false);
    expect(isSafeNext("https://evil.test")).toBe(false);
    expect(isSafeNext("/ok")).toBe(true);
    expect(resolvePostLoginHref({ persona: "founder", onboardingCompleted: true, next: "//evil.test" })).toBe("/dashboard");
  });

  it("not onboarded → /onboarding for every wizard persona", () => {
    for (const persona of ["founder", "investor_angel", "investor_vc", "advisor", "accelerator"] as const) {
      expect(resolvePostLoginHref({ persona, onboardingCompleted: false }), persona).toBe("/onboarding");
    }
  });

  it("onboarded → the persona landing", () => {
    expect(resolvePostLoginHref({ persona: "founder", onboardingCompleted: true })).toBe("/dashboard");
    expect(resolvePostLoginHref({ persona: "investor_angel", onboardingCompleted: true })).toBe("/workspace/investor");
    expect(resolvePostLoginHref({ persona: "investor_vc", onboardingCompleted: true })).toBe("/workspace/investor");
    expect(resolvePostLoginHref({ persona: "advisor", onboardingCompleted: true })).toBe("/workspace/advisor");
    expect(resolvePostLoginHref({ persona: "accelerator", onboardingCompleted: true })).toBe("/workspace/accelerator");
  });

  it("flow=none personas skip the wizard even when not onboarded (their consoles)", () => {
    expect(resolvePostLoginHref({ persona: "reseller", onboardingCompleted: false })).toBe("/reseller");
    expect(resolvePostLoginHref({ persona: "admin", onboardingCompleted: false })).toBe("/admin");
    expect(resolvePostLoginHref({ persona: "journalist", onboardingCompleted: false })).toBe("/dashboard");
  });

  it("PERSONA_LANDING=off sends evaluators to /dashboard (rollback), founders unchanged", () => {
    process.env.PERSONA_LANDING = "off";
    expect(landingHrefFor("investor_vc")).toBe("/dashboard");
    expect(landingHrefFor("advisor")).toBe("/dashboard");
    expect(landingHrefFor("founder")).toBe("/dashboard");
    expect(landingHrefFor("reseller")).toBe("/reseller");
    expect(resolvePostLoginHref({ persona: "accelerator", onboardingCompleted: true })).toBe("/dashboard");
  });
});

describe("postLoginHref — DB-backed", () => {
  let sb: FakeSupabase;
  beforeEach(() => {
    delete process.env.PERSONA_LANDING;
    sb = fakeSupabase({ app_users: [{ account_type: "advisor", segment: "advisor", onboarding_completed: true }] });
    sbState.sb = sb;
  });
  afterEach(() => {
    sbState.sb = null;
  });

  it("reads app_users by id and lands the advisor on /workspace/advisor", async () => {
    expect(await postLoginHref({ id: "u-1", role: "user" })).toBe("/workspace/advisor");
    expect(sb.hasEq("app_users", "id", "u-1")).toBe(true);
  });

  it("not onboarded → /onboarding", async () => {
    sb.rows.app_users = [{ account_type: "investor_angel", segment: null, onboarding_completed: false }];
    expect(await postLoginHref({ id: "u-1", role: "user" })).toBe("/onboarding");
  });

  it("role=admin short-circuits to /admin without needing the row", async () => {
    sb.rows.app_users = [];
    expect(await postLoginHref({ id: "u-1", role: "admin" })).toBe("/admin");
  });

  it("no Supabase → founder landing (never the wizard on a guess); `next` still wins", async () => {
    sbState.sb = null;
    expect(await postLoginHref({ id: "u-1", role: "user" })).toBe("/dashboard");
    expect(await postLoginHref({ id: "u-1", role: "user" }, { next: "/workspace/score" })).toBe("/workspace/score");
  });
});
