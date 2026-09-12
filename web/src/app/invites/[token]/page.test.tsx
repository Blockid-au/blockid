// Render test for /invites/[token] — hydration safety (release QA-2 F9).
//
// The page renders the invited email verbatim; in production Cloudflare's
// Email Obfuscation rewrote it into a data-cfemail <span> and React threw
// #418. The root layout now switches the rewriter off (see
// components/site/cloudflare-email-off.tsx); this test pins that the page's
// own markup is hydratable (no relocated nesting) and deterministic, for
// the anonymous, matching-user and mismatched-user branches.

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/founder-page-harness";
import { assertDeterministicRender, assertHydratableNesting } from "@/test/hydration-guard";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

const TOKEN = "t".repeat(64);

function seed(status = "invited") {
  db.sb = fakeSupabase({
    project_members: [
      { user_email: "qa-member@blockid.au", role: "viewer", status, project_id: "proj-1", projects: { name: "Acme" } },
    ],
  });
}

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ params: Promise.resolve({ token: TOKEN }) }));
}

describe("/invites/[token] — hydration safety", () => {
  it("anonymous: renders the invite + sign-in link, hydratable and deterministic", async () => {
    seed();
    auth.user = null;
    const out = await assertDeterministicRender(html);
    expect(out).toContain("qa-member@blockid.au");
    expect(out).toContain(`href="/auth/login?next=${encodeURIComponent(`/invites/${TOKEN}`).replace(/%2F/g, "%2F")}"`);
    assertHydratableNesting(out, "/invites/[token] anonymous");
  });

  it("signed in as the invitee: Accept button, hydratable", async () => {
    seed();
    auth.user = { id: "u1", email: "QA-Member@blockid.au" };
    const out = await html();
    expect(out).toContain("Accept invitation");
    assertHydratableNesting(out, "/invites/[token] invitee");
  });

  it("signed in as someone else: mismatch notice, hydratable", async () => {
    seed();
    auth.user = { id: "u2", email: "other@blockid.au" };
    const out = await html();
    expect(out).toContain("this invite was");
    expect(out).toContain("Sign in as qa-member@blockid.au");
    assertHydratableNesting(out, "/invites/[token] mismatch");
  });

  it("unknown token → notFound()", async () => {
    db.sb = fakeSupabase({ project_members: [] });
    await expect(html()).rejects.toThrow("NOT_FOUND");
  });
});
