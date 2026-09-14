import { describe, expect, it } from "vitest";
import { PLANS_V2, EQUITY_ADDON_MONTHLY_AUD } from "@/lib/plans-v2";
import { VISIBILITY } from "./tier-visibility";
import { FEATURE_GATES } from "@/lib/feature-gates.manifest";
import {
  fromPathLabel,
  requiresPaidTier,
  resolveFeatureRequirement,
} from "./feature-requirement";

const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;
const growth = PLANS_V2.find((p) => p.id === "founder_growth")!;

describe("resolveFeatureRequirement (S31-B — /pricing?feature= landing)", () => {
  it("data_room.access → Starter, with the live price and the Starter card anchor", () => {
    const req = resolveFeatureRequirement("data_room.access", "/workspace/data-room")!;
    expect(req.plan?.id).toBe("founder_starter");
    expect(req.priceLine).toBe(`A$${starter.monthly_aud}/mo`);
    expect(req.anchor).toBe("#tier-starter");
    expect(req.label).toBe("the investor data room");
    expect(req.fromLabel).toBe("Data Room");
    expect(req.viaAddon).toBe(false);
    expect(req.contactSales).toBe(false);
  });

  it("cap_table.write → Growth", () => {
    const req = resolveFeatureRequirement("cap_table.write", "/workspace/cap-table")!;
    expect(req.plan?.id).toBe("founder_growth");
    expect(req.priceLine).toBe(`A$${growth.monthly_aud}/mo`);
    expect(req.anchor).toBe("#tier-growth");
  });

  it("esop.manage → Equity add-on on Growth, priced from EQUITY_ADDON_MONTHLY_AUD", () => {
    const req = resolveFeatureRequirement("esop.manage")!;
    expect(req.viaAddon).toBe(true);
    expect(req.plan?.id).toBe("founder_growth");
    expect(req.priceLine).toBe(`A$${EQUITY_ADDON_MONTHLY_AUD}/mo add-on`);
  });

  it("sso → contact sales, no card anchor, no price", () => {
    const req = resolveFeatureRequirement("sso", "/workspace/sso")!;
    expect(req.contactSales).toBe(true);
    expect(req.plan).toBeNull();
    expect(req.anchor).toBeNull();
    expect(req.priceLine).toBe("");
  });

  it("a ladder-only slug (no VISIBILITY / catalogue row) still resolves via the tier ladder", () => {
    const req = resolveFeatureRequirement("report.premium")!;
    expect(req.plan?.id).toBe("founder_growth");
  });

  it("free-tier features are not worth a notice", () => {
    const req = resolveFeatureRequirement("svi.run.limited")!;
    expect(requiresPaidTier(req)).toBe(false);
    expect(requiresPaidTier(resolveFeatureRequirement("svi.run")!)).toBe(true);
  });

  it("rejects garbage so the notice renders nothing", () => {
    expect(resolveFeatureRequirement("")).toBeNull();
    expect(resolveFeatureRequirement("<script>alert(1)</script>")).toBeNull();
    expect(resolveFeatureRequirement("a".repeat(80))).toBeNull();
    expect(resolveFeatureRequirement(undefined)).toBeNull();
  });

  it("never quotes a price the ladder does not charge", () => {
    for (const slug of Object.keys(VISIBILITY)) {
      const req = resolveFeatureRequirement(slug);
      if (!req || !req.priceLine) continue;
      expect(req.priceLine).not.toContain("A$99");
      expect(req.priceLine).not.toContain("A$299");
    }
  });

  it("every gated mutation route's feature resolves to something sayable", () => {
    for (const gate of FEATURE_GATES) {
      const req = resolveFeatureRequirement(gate.required_feature);
      expect(req, gate.required_feature).not.toBeNull();
      expect(req!.label.length).toBeGreaterThan(2);
    }
  });
});

describe("fromPathLabel", () => {
  it("names known workspace pages and title-cases unknown ones", () => {
    expect(fromPathLabel("/workspace/cap-table")).toBe("Cap Table");
    expect(fromPathLabel("/workspace/some-new-thing?x=1")).toBe("Some New Thing");
  });
  it("drops ids, protocol-relative and absent paths", () => {
    expect(fromPathLabel("/workspace/projects/8f1c2d3e-aaaa-bbbb-cccc-1234567890ab")).toBeNull();
    expect(fromPathLabel("//evil.example")).toBeNull();
    expect(fromPathLabel("https://evil.example/x")).toBeNull();
    expect(fromPathLabel(undefined)).toBeNull();
  });
});
