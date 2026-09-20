// Colocated vitest for `persona.ts` — the one persona table (G13-W1-IA1, D5).
//
// Pins:
//   • every persona has a rooted landingHref, ≥ 1 nav group, a tour slug that
//     exists in the FEATURE_TOURS registry (or null) and an onboarding flow
//   • evaluator personas share the 3-group evaluator sidebar and never a
//     founder group; the founder never sees an evaluator group
//   • resolvePersona precedence: role=admin → account_type → segment → founder,
//     with the legacy `investor` type deferring to the segment
//   • every `app_users.account_type` enum value maps somewhere

import { describe, expect, it } from "vitest";
import {
  EVALUATOR_PERSONAS,
  PERSONAS,
  PERSONA_KEYS,
  getPersona,
  isEvaluatorPersona,
  isPersonaKey,
  listPersonas,
  resolvePersona,
} from "./persona";
import { ACCOUNT_TYPE_VALUES } from "@/lib/segments";
import { FEATURE_TOURS } from "@/lib/product-tour/feature-tours";

const TOUR_SLUGS = new Set(FEATURE_TOURS.map((t) => t.slug));

describe("PERSONAS — table shape", () => {
  it("declares the 10 personas once each, in listPersonas() order", () => {
    expect(PERSONA_KEYS).toEqual([
      "founder", "investor_angel", "investor_vc", "advisor", "accelerator",
      "reseller", "mentor", "innovator", "journalist", "admin",
    ]);
    expect(listPersonas().map((p) => p.key)).toEqual(PERSONA_KEYS);
    for (const key of PERSONA_KEYS) expect(PERSONAS[key].key).toBe(key);
  });

  it("every persona lands on a rooted href, owns ≥ 1 nav group and a real tour slug (or none)", () => {
    for (const p of listPersonas()) {
      expect(p.landingHref.startsWith("/"), p.key).toBe(true);
      expect(p.navGroups.length, p.key).toBeGreaterThan(0);
      expect(new Set(p.navGroups).size, p.key).toBe(p.navGroups.length);
      expect(["founder", "evaluator", "none"]).toContain(p.onboardingFlow);
      if (p.tourSlug !== null) expect(TOUR_SLUGS.has(p.tourSlug), `${p.key}: ${p.tourSlug}`).toBe(true);
      if (p.console) expect(p.console.href.startsWith("/"), p.key).toBe(true);
    }
  });

  it("founder → /dashboard with Home · Prove · Money · Company; evaluators → their hub with Home · Deal flow · Reports", () => {
    expect(PERSONAS.founder.landingHref).toBe("/dashboard");
    expect(PERSONAS.founder.navGroups).toEqual(["home", "prove", "money", "company"]);
    expect(PERSONAS.investor_angel.landingHref).toBe("/workspace/investor");
    expect(PERSONAS.investor_vc.landingHref).toBe("/workspace/investor");
    expect(PERSONAS.advisor.landingHref).toBe("/workspace/advisor");
    expect(PERSONAS.accelerator.landingHref).toBe("/workspace/accelerator");
    for (const key of EVALUATOR_PERSONAS) {
      expect(PERSONAS[key].navGroups, key).toEqual(["evaluator-home", "dealflow", "reports"]);
      expect(PERSONAS[key].onboardingFlow, key).toBe("evaluator");
      for (const founderGroup of ["home", "prove", "money", "company"]) {
        expect(PERSONAS[key].navGroups, `${key} leaks ${founderGroup}`).not.toContain(founderGroup);
      }
    }
    for (const g of PERSONAS.founder.navGroups) expect(["evaluator-home", "dealflow", "reports"]).not.toContain(g);
  });

  it("console personas carry a topbar bridge back to their console", () => {
    expect(PERSONAS.reseller.console?.href).toBe("/reseller");
    expect(PERSONAS.mentor.console?.href).toBe("/reseller/mentor");
    // G20-F1: the Innovator console is hidden — no bridge, founder landing.
    expect(PERSONAS.innovator.console).toBeUndefined();
    expect(PERSONAS.innovator.landingHref).toBe("/dashboard");
    expect(PERSONAS.admin.console?.href).toBe("/admin");
    expect(PERSONAS.founder.console).toBeUndefined();
    expect(PERSONAS.admin.navGroups).toEqual(["home", "prove", "money", "company", "admin"]);
  });
});

describe("resolvePersona()", () => {
  it("role=admin wins over everything", () => {
    expect(resolvePersona({ role: "admin", accountType: "investor_vc", segment: "founder" })).toBe("admin");
  });

  it("account_type maps every enum value (plus the virtual mentor / innovator)", () => {
    for (const at of ACCOUNT_TYPE_VALUES) {
      expect(isPersonaKey(resolvePersona({ accountType: at })), at).toBe(true);
    }
    expect(resolvePersona({ accountType: "founder" })).toBe("founder");
    expect(resolvePersona({ accountType: "investor_angel" })).toBe("investor_angel");
    expect(resolvePersona({ accountType: "investor_vc" })).toBe("investor_vc");
    expect(resolvePersona({ accountType: "advisor" })).toBe("advisor");
    expect(resolvePersona({ accountType: "service_provider" })).toBe("advisor");
    expect(resolvePersona({ accountType: "accelerator" })).toBe("accelerator");
    expect(resolvePersona({ accountType: "incubator" })).toBe("accelerator");
    expect(resolvePersona({ accountType: "reseller" })).toBe("reseller");
    expect(resolvePersona({ accountType: "affiliate" })).toBe("reseller");
    expect(resolvePersona({ accountType: "journalist" })).toBe("journalist");
    expect(resolvePersona({ accountType: "mentor" })).toBe("mentor");
    expect(resolvePersona({ accountType: "innovator" })).toBe("innovator");
  });

  it("legacy `investor` defers to the segment rung, else angel", () => {
    expect(resolvePersona({ accountType: "investor", segment: "investor_vc" })).toBe("investor_vc");
    expect(resolvePersona({ accountType: "investor", segment: "investor_angel" })).toBe("investor_angel");
    expect(resolvePersona({ accountType: "investor" })).toBe("investor_angel");
  });

  it("falls back to the segment, then founder", () => {
    expect(resolvePersona({ segment: "advisor" })).toBe("advisor");
    expect(resolvePersona({ segment: "lp" })).toBe("investor_vc");
    expect(resolvePersona({ segment: "admin" })).toBe("admin");
    expect(resolvePersona({ accountType: "not-a-type", segment: "accelerator" })).toBe("accelerator");
    expect(resolvePersona({})).toBe("founder");
    expect(resolvePersona(null)).toBe("founder");
    expect(resolvePersona(undefined)).toBe("founder");
    expect(getPersona({ segment: "founder" }).landingHref).toBe("/dashboard");
  });

  it("isEvaluatorPersona / isPersonaKey", () => {
    expect(EVALUATOR_PERSONAS).toEqual(["investor_angel", "investor_vc", "advisor", "accelerator"]);
    for (const k of EVALUATOR_PERSONAS) expect(isEvaluatorPersona(k)).toBe(true);
    expect(isEvaluatorPersona("founder")).toBe(false);
    expect(isEvaluatorPersona(null)).toBe(false);
    expect(isPersonaKey("founder")).toBe(true);
    expect(isPersonaKey("lawyer")).toBe(false);
    expect(isPersonaKey(42)).toBe(false);
  });
});
