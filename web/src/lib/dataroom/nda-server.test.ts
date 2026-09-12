// Colocated suite for the server half of the NDA gate (S21-A): the plan
// gating decision and the clause hash.
//
// Gating decision: NDA + watermark ride on `investor_links.premium`, the flag
// founder_starter already holds (plans.csv row 3, migration 0131) — no new
// flag was invented. Free lacks it; Starter, Growth, Pro, Enterprise carry it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { fakeSupabase } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  getEntitlements: vi.fn<(plan: string, userId?: string | null) => Promise<string[]>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (plan: string, userId?: string | null) => mocks.getEntitlements(plan, userId),
}));

import { ndaTextHash, ownerTrustEntitled, TRUST_FEATURE } from "./nda-server";
import { DEFAULT_NDA_TEXT } from "./nda";
import { readFileSync } from "node:fs";
import path from "node:path";

beforeEach(() => {
  mocks.getEntitlements.mockReset();
  mocks.sb = fakeSupabase({ app_users: [{ id: "owner-1", plan: "founder_starter" }] });
});

describe("ownerTrustEntitled", () => {
  it("reads the OWNER's plan from app_users and asks getEntitlements for investor_links.premium", async () => {
    mocks.getEntitlements.mockResolvedValue(["data_room.access", "investor_links.premium"]);
    expect(await ownerTrustEntitled("owner-1")).toBe(true);
    expect(mocks.getEntitlements).toHaveBeenCalledWith("founder_starter", "owner-1");
    expect(TRUST_FEATURE).toBe("investor_links.premium");
  });

  it("is false when the plan lacks the flag (Free), when there is no owner, no db, or a lookup error", async () => {
    mocks.getEntitlements.mockResolvedValue(["profile.multi"]);
    expect(await ownerTrustEntitled("owner-1")).toBe(false);
    expect(await ownerTrustEntitled(null)).toBe(false);
    expect(await ownerTrustEntitled("")).toBe(false);
    mocks.sb = null;
    expect(await ownerTrustEntitled("owner-1")).toBe(false);
    mocks.sb = fakeSupabase({ app_users: [] });
    mocks.getEntitlements.mockRejectedValue(new Error("boom"));
    expect(await ownerTrustEntitled("owner-1")).toBe(false);
  });

  it("treats a missing plan as free", async () => {
    mocks.sb = fakeSupabase({ app_users: [{ id: "owner-1", plan: null }] });
    mocks.getEntitlements.mockResolvedValue([]);
    await ownerTrustEntitled("owner-1");
    expect(mocks.getEntitlements).toHaveBeenCalledWith("free", "owner-1");
  });
});

describe("gating source of truth — plans.csv", () => {
  const csv = readFileSync(path.resolve(__dirname, "../../config/pricing/plans.csv"), "utf8");
  const row = (id: string) => csv.split("\n").find((l) => l.startsWith(`${id},`)) ?? "";

  it("founder_starter and above carry investor_links.premium; founder_free does not", () => {
    for (const id of ["founder_starter", "founder_growth", "founder_scale", "founder_enterprise"]) {
      expect(row(id), id).toContain("investor_links.premium");
    }
    expect(row("founder_free")).not.toContain("investor_links.premium");
  });
});

describe("ndaTextHash", () => {
  it("hashes the resolved clause (default when empty) so an acceptance pins what was shown", () => {
    expect(ndaTextHash(null)).toBe(createHash("sha256").update(DEFAULT_NDA_TEXT).digest("hex"));
    expect(ndaTextHash("  Custom.  ")).toBe(createHash("sha256").update("Custom.").digest("hex"));
  });
});
