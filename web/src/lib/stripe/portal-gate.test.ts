import { describe, it, expect } from "vitest";
import { decidePortalAccess } from "./portal-gate";

describe("decidePortalAccess (D3-CISO-06)", () => {
  it("retail founder (no attribution) → allow", () => {
    const result = decidePortalAccess({
      hasActiveWholesaleProvisionedAttribution: false,
    });
    expect(result).toEqual({ ok: true });
  });

  it("wholesale-provisioned founder → deny with wholesale_portal_blocked", () => {
    const result = decidePortalAccess({
      hasActiveWholesaleProvisionedAttribution: true,
    });
    expect(result).toEqual({ ok: false, reason: "wholesale_portal_blocked" });
  });

  it("no attribution at all → allow (matches retail path)", () => {
    // Founder never carried a ?via= cookie and was never wholesale-provisioned.
    const result = decidePortalAccess({
      hasActiveWholesaleProvisionedAttribution: false,
    });
    expect(result.ok).toBe(true);
  });

  it("terminated / opted-out attribution → allow", () => {
    // The Supabase adapter filters status='active' AND opted_out=false, so a
    // terminated attribution never surfaces as `hasActiveWholesaleProvisionedAttribution`.
    // The decision layer only sees the filtered flag — verify allow-through.
    const result = decidePortalAccess({
      hasActiveWholesaleProvisionedAttribution: false,
    });
    expect(result.ok).toBe(true);
  });

  it("retail 'code'-source attribution → allow (only 'provisioned' blocks)", () => {
    // Retail attributions have source='code'. The Supabase adapter filters
    // source='provisioned' — so a retail-attributed founder surfaces as
    // `hasActiveWholesaleProvisionedAttribution=false` and is allowed.
    const result = decidePortalAccess({
      hasActiveWholesaleProvisionedAttribution: false,
    });
    expect(result.ok).toBe(true);
  });
});
