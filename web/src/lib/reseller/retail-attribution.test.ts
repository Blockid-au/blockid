import { describe, it, expect } from "vitest";
import { decideRetailAttribution } from "./retail-attribution";

describe("decideRetailAttribution", () => {
  const activeReseller = "11111111-1111-1111-1111-111111111111";

  it("returns no_attribution_cache when the user has no cached reseller", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: null,
        resellerStatus: "active",
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "no_attribution_cache" });
  });

  it("returns no_attribution_cache when the cache is undefined", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: undefined,
        resellerStatus: "active",
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "no_attribution_cache" });
  });

  it("returns no_attribution_cache when the cache is an empty string", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: "",
        resellerStatus: "active",
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "no_attribution_cache" });
  });

  it("returns reseller_inactive when the cached reseller is terminated", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: activeReseller,
        resellerStatus: "terminated",
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "reseller_inactive" });
  });

  it("returns reseller_inactive when the reseller row was deleted (status null)", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: activeReseller,
        resellerStatus: null,
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "reseller_inactive" });
  });

  it("returns reseller_inactive for suspended state (not the string 'active')", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: activeReseller,
        resellerStatus: "suspended",
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "reseller_inactive" });
  });

  it("returns already_attributed when a live row exists for this project", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: activeReseller,
        resellerStatus: "active",
        hasActiveProjectAttribution: true,
      }),
    ).toEqual({ ok: false, reason: "already_attributed" });
  });

  it("returns an insert plan with source='code' + retail_project_create metadata", () => {
    const decision = decideRetailAttribution({
      userAttributionResellerId: activeReseller,
      resellerStatus: "active",
      hasActiveProjectAttribution: false,
    });
    expect(decision).toEqual({
      ok: true,
      plan: {
        reseller_id: activeReseller,
        source: "code",
        metadata: { origin: "retail_project_create" },
      },
    });
  });

  it("does not coerce non-string cache values (defensive guard)", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: 42 as unknown as string,
        resellerStatus: "active",
        hasActiveProjectAttribution: false,
      }),
    ).toEqual({ ok: false, reason: "no_attribution_cache" });
  });

  it("prefers no_attribution_cache over reseller_inactive when both hold", () => {
    // Cache-absence is the earlier gate so callers get the most
    // actionable reason (a founder without a ?via= cookie is a strictly
    // different signal than a terminated reseller).
    expect(
      decideRetailAttribution({
        userAttributionResellerId: null,
        resellerStatus: "terminated",
        hasActiveProjectAttribution: true,
      }),
    ).toEqual({ ok: false, reason: "no_attribution_cache" });
  });

  it("prefers reseller_inactive over already_attributed when both hold", () => {
    expect(
      decideRetailAttribution({
        userAttributionResellerId: activeReseller,
        resellerStatus: "terminated",
        hasActiveProjectAttribution: true,
      }),
    ).toEqual({ ok: false, reason: "reseller_inactive" });
  });
});
