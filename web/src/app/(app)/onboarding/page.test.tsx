import { beforeEach, describe, expect, it, vi } from "vitest";

// G13-W4-IA4 — /onboarding server page: auth, persona → flow, the
// onboarded-visitor redirect (plan → Billing with interval; else the persona
// landing; `?step=` lets an onboarded founder back in), `ONBOARDING_V4=off`
// mounts the legacy 6-step page.

const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));
const userState = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => userState.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/components/landing/nav-v2", () => ({ NavV2: () => null }));
vi.mock("@/components/marketing/footer", () => ({ Footer: () => null }));
vi.mock("./onboarding-wizard", () => ({
  OnboardingWizard: (p: { initialParams: Record<string, string | undefined>; defaultPersona: string | null; personaOptions?: readonly string[] }) => (
    <div data-wizard data-default-persona={p.defaultPersona ?? ""} data-persona-options={(p.personaOptions ?? []).join(",")} data-plan={p.initialParams.plan ?? ""} data-interval={p.initialParams.interval ?? ""} data-step={p.initialParams.step ?? ""} data-via={p.initialParams.via ?? ""} />
  ),
}));
vi.mock("./page.legacy", () => ({ LegacyOnboardingPage: () => <div data-legacy-wizard /> }));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage, dataAttr } from "@/test/founder-page-harness";
import Page, { onboardedRedirect } from "./page";

let sb: FakeSupabase;
const USER = { id: "u-1", email: "f@x.test", role: "user", plan: "founder_free", onboardingCompleted: false };

const html = (sp: Record<string, string> = {}) => renderPage(Page({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  delete process.env.ONBOARDING_V4;
  delete process.env.PERSONA_LANDING;
  userState.user = { ...USER };
  sb = fakeSupabase({ app_users: [{ account_type: "founder", segment: "founder", onboarding_completed: false }] });
  sbState.sb = sb;
});

describe("/onboarding page", () => {
  it("anonymous → login with the full query preserved in next=", async () => {
    userState.user = null;
    await expect(html({ plan: "investor_angel", interval: "annual" })).rejects.toThrow(`REDIRECT:/auth/login?next=${encodeURIComponent("/onboarding?plan=investor_angel&interval=annual")}`);
  });

  it("fresh founder → wizard with the account persona preselected; plan / interval / step / via passed through", async () => {
    const out = await html({ plan: "founder_growth", interval: "annual", step: "2", via: "ab-1" });
    expect(dataAttr(out, "default-persona")).toBe("founder");
    expect(dataAttr(out, "plan")).toBe("founder_growth");
    expect(dataAttr(out, "interval")).toBe("annual");
    expect(dataAttr(out, "step")).toBe("2");
    expect(dataAttr(out, "via")).toBe("ab-1");
  });

  it("fresh evaluator (legacy `investor` account_type) → wizard preselects the angel rung", async () => {
    sb.rows.app_users = [{ account_type: "investor", segment: null, onboarding_completed: false }];
    expect(dataAttr(await html(), "default-persona")).toBe("investor_angel");
  });

  it("onboarded founder without a plan → /dashboard; with a plan → Billing checkout carrying the interval (S31-B + annual)", async () => {
    sb.rows.app_users = [{ account_type: "founder", segment: "founder", onboarding_completed: true }];
    await expect(html()).rejects.toThrow("REDIRECT:/dashboard");
    await expect(html({ plan: "investor_angel", interval: "annual", trial: "1" })).rejects.toThrow("REDIRECT:/checkout/review?plan=investor_angel&trial=1&entry=signup&interval=annual");
  });

  it("onboarded evaluator without a plan → the persona landing", async () => {
    sb.rows.app_users = [{ account_type: "accelerator", segment: null, onboarding_completed: true }];
    await expect(html()).rejects.toThrow("REDIRECT:/workspace/accelerator");
  });

  it("onboarded founder with ?step=2 is let back in (the landing's 'Complete profile' CTA)", async () => {
    sb.rows.app_users = [{ account_type: "founder", segment: "founder", onboarding_completed: true }];
    const out = await html({ step: "2" });
    expect(dataAttr(out, "step")).toBe("2");
  });

  it("flow=none personas never see the wizard (reseller → /reseller, admin → /admin)", async () => {
    sb.rows.app_users = [{ account_type: "reseller", segment: null, onboarding_completed: false }];
    await expect(html()).rejects.toThrow("REDIRECT:/reseller");
    userState.user = { ...USER, role: "admin" };
    await expect(html()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("no Supabase → wizard renders (never a redirect on a guess)", async () => {
    sbState.sb = null;
    const out = await html();
    expect(out).toContain("data-wizard");
  });

  it("ONBOARDING_V4=off mounts the legacy 6-step page (rollback)", async () => {
    process.env.ONBOARDING_V4 = "off";
    userState.user = null; // the legacy page does its own auth — must not be reached here
    const out = await html();
    expect(out).toContain("data-legacy-wizard");
  });

  // G13-W5-IA5 (W4 review P3-a) — persona lock: the evaluator cards vanish
  // once a founder owns a project or has completed onboarding.
  it("S-IA5 persona lock: fresh founder sees all five cards", async () => {
    expect(dataAttr(await html(), "persona-options")).toBe("founder,investor_angel,investor_vc,advisor,accelerator");
  });

  it("S-IA5 persona lock: a founder who owns a project sees only the founder card", async () => {
    sb.rows.projects = [{ id: "p-1", user_id: "u-1" }];
    expect(dataAttr(await html(), "persona-options")).toBe("founder");
  });

  it("S-IA5 persona lock: an onboarded founder let back in via ?step=2 sees only the founder card; an onboarded advisor keeps theirs", async () => {
    sb.rows.app_users = [{ account_type: "founder", segment: "founder", onboarding_completed: true }];
    expect(dataAttr(await html({ step: "2" }), "persona-options")).toBe("founder");
    sb.rows.app_users = [{ account_type: "advisor", segment: "advisor", onboarding_completed: true }];
    expect(dataAttr(await html({ step: "2" }), "persona-options")).toBe("advisor");
  });

  it("onboardedRedirect — pure", () => {
    expect(onboardedRedirect({}, "/workspace/investor")).toBe("/workspace/investor");
    expect(onboardedRedirect({ step: "2" }, "/dashboard")).toBeNull();
    expect(onboardedRedirect({ plan: "investor_advisor", interval: "annual" }, "/dashboard")).toBe("/checkout/review?plan=investor_advisor&trial=1&entry=signup&interval=annual");
    expect(onboardedRedirect({ plan: "founder_free" }, "/dashboard")).toBe("/workspace/billing");
  });
});
