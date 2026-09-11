// Colocated tests for POST /api/auth/stripe/connect — S18-A member access.
//
// Linking Stripe revenue evidence onto the project's (OWNER's) svi_accounts
// row is admin+; a lower role gets a JSON 403 BEFORE any Stripe API call.
// The Stripe customer is still looked up by the CALLER's email (their own
// Stripe identity); the evidence lands on the owner's account.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState, keyCalls } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const cookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

const stripe = vi.hoisted(() => ({
  customersList: vi.fn(),
  subscriptionsList: vi.fn(),
  chargesList: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class StripeMock {
    customers = { list: (...a: unknown[]) => stripe.customersList(...a) };
    subscriptions = { list: (...a: unknown[]) => stripe.subscriptionsList(...a) };
    charges = { list: (...a: unknown[]) => stripe.chargesList(...a) };
  },
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST } from "./route";

function run() {
  return POST(new Request("http://x/api/auth/stripe/connect", { method: "POST" }));
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  cookieStore.clear();
  cookieStore.set("blockid_session", "sess-1");
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  db.sb = fakeSupabase({
    sessions: [{ user_id: "user-caller" }],
    app_users: [{ id: "user-caller", email: "caller@x.test" }],
    svi_evidence: [],
  });
  stripe.customersList.mockReset().mockResolvedValue({ data: [{ id: "cus_1", currency: "aud" }] });
  stripe.subscriptionsList.mockReset().mockResolvedValue({
    data: [{ items: { data: [{ quantity: 1, price: { recurring: { interval: "month" }, unit_amount: 10_000 } }] } }],
  });
  stripe.chargesList.mockReset().mockResolvedValue({ data: [{ status: "succeeded", refunded: false, amount: 10_000 }], has_more: false });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
}

beforeEach(reset);

describeMemberAccess("POST /api/auth/stripe/connect", {
  state: scopeState,
  kind: "admin",
  reset,
  run,
  expectKeyFns: ["findOrCreateSVIAccount"],
  onMemberOk: (_res, body) => {
    expect((body as { ok: boolean; evidenceCreated: boolean }).ok).toBe(true);
  },
});

describe("POST /api/auth/stripe/connect", () => {
  it("editor: JSON 403 before any Stripe API call or evidence write", async () => {
    scopeState.role = "editor";
    const res = await run();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(stripe.customersList).not.toHaveBeenCalled();
    expect(db.sb!.find("svi_evidence", "insert")).toEqual([]);
    expect(keyCalls(scopeState, "findOrCreateSVIAccount")).toEqual([]);
  });

  it("admin on a shared project: Stripe customer by the CALLER's email; evidence on the OWNER's account", async () => {
    scopeState.role = "admin";
    const res = await run();
    expect(res.status).toBe(200);
    expect(stripe.customersList).toHaveBeenCalledWith(expect.objectContaining({ email: "caller@x.test" }));
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("owner@x.test");
    expect(acct.projectId).toBe("proj-1");
    const inserts = db.sb!.find("svi_evidence", "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].args[0] as { account_id: string }).account_id).toBe("acct-1");
  });

  it("401 without a session cookie; no scope resolution", async () => {
    cookieStore.clear();
    const res = await run();
    expect(res.status).toBe(401);
    expect(scopeState.lastMinRole).toBeUndefined();
    expect(stripe.customersList).not.toHaveBeenCalled();
  });
});
