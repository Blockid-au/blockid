// Unit tests for the per-role landing-hero + next-step-recommender copy fixture.
//
// This module is a bilingual EN/VI copy registry consumed by <RoleLandingIntro/>
// (renders `landing_hero`) and <RoleNextStep/> (renders `next_step_recommender`).
// Silent drift here surfaces on every role's landing page and in every role
// dashboard's empty-state slot, so the invariants pinned below are the ones
// downstream renderers depend on:
//
//   • Every ROLES key from role-taxonomy resolves to a ROLE_GUIDING_COPY entry
//     (and vice versa — no orphan copy for a retired role).
//   • Every LocalisedText has non-empty EN + VI so a bilingual toggle never
//     shows a blank string.
//   • EN and VI differ per field (a copy-paste of the EN into VI would leave
//     the localisation broken silently).
//   • next_step_recommender.cta.href is rooted (starts with '/') so the CTA
//     button is always safely navigable via next/link.
//   • Per-role CTA hrefs are pinned bit-for-bit so a rename of a workspace
//     route surfaces here before it breaks a role's recommended next step.
//   • getRoleGuidingCopy resolves every real role and returns undefined for
//     unknown / empty inputs.

import { describe, it, expect } from "vitest";
import { ROLES } from "@/lib/roles/role-taxonomy";
import {
  ROLE_GUIDING_COPY,
  getRoleGuidingCopy,
} from "@/lib/roles/role-guiding-copy";

const ALL_ROLES = Object.keys(ROLE_GUIDING_COPY) as Array<keyof typeof ROLE_GUIDING_COPY>;

describe("role-guiding-copy — coverage vs role-taxonomy", () => {
  it("has a copy entry for every role declared in ROLES", () => {
    for (const role of ROLES) {
      expect(ROLE_GUIDING_COPY[role]).toBeDefined();
    }
  });

  it("has no orphan copy entry for a role not in ROLES", () => {
    const roleSet = new Set<string>(ROLES);
    for (const key of ALL_ROLES) {
      expect(roleSet.has(key)).toBe(true);
    }
  });

  it("exposes exactly one copy entry per role (no duplicates, no gaps)", () => {
    expect(ALL_ROLES.length).toBe(ROLES.length);
    expect(new Set(ALL_ROLES).size).toBe(ALL_ROLES.length);
  });
});

describe("role-guiding-copy — landing_hero shape", () => {
  it.each(ALL_ROLES)("%s landing_hero exposes eyebrow + title + subtitle with non-empty EN + VI", (role) => {
    const hero = ROLE_GUIDING_COPY[role].landing_hero;
    for (const field of ["eyebrow", "title", "subtitle"] as const) {
      expect(typeof hero[field].en).toBe("string");
      expect(typeof hero[field].vi).toBe("string");
      expect(hero[field].en.trim().length).toBeGreaterThan(0);
      expect(hero[field].vi.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(ALL_ROLES)("%s landing_hero EN and VI strings differ per field", (role) => {
    const hero = ROLE_GUIDING_COPY[role].landing_hero;
    for (const field of ["eyebrow", "title", "subtitle"] as const) {
      expect(hero[field].en).not.toBe(hero[field].vi);
    }
  });
});

describe("role-guiding-copy — next_step_recommender shape", () => {
  it.each(ALL_ROLES)("%s next_step_recommender has non-empty phrase in EN + VI", (role) => {
    const next = ROLE_GUIDING_COPY[role].next_step_recommender;
    expect(typeof next.phrase.en).toBe("string");
    expect(typeof next.phrase.vi).toBe("string");
    expect(next.phrase.en.trim().length).toBeGreaterThan(0);
    expect(next.phrase.vi.trim().length).toBeGreaterThan(0);
    expect(next.phrase.en).not.toBe(next.phrase.vi);
  });

  it.each(ALL_ROLES)("%s next_step_recommender cta has a rooted href + non-empty label EN + VI", (role) => {
    const cta = ROLE_GUIDING_COPY[role].next_step_recommender.cta;
    expect(typeof cta.href).toBe("string");
    expect(cta.href.startsWith("/")).toBe(true);
    expect(cta.href.length).toBeGreaterThan(1);
    expect(cta.label.en.trim().length).toBeGreaterThan(0);
    expect(cta.label.vi.trim().length).toBeGreaterThan(0);
    expect(cta.label.en).not.toBe(cta.label.vi);
  });
});

describe("role-guiding-copy — per-role CTA href anchors", () => {
  it("founder CTA points at the SVI dashboard", () => {
    expect(ROLE_GUIDING_COPY.founder.next_step_recommender.cta.href).toBe("/dashboard/svi");
  });
  it("advisor CTA points at the client roster", () => {
    expect(ROLE_GUIDING_COPY.advisor.next_step_recommender.cta.href).toBe("/workspace/client-roster");
  });
  it("mentor CTA points at the reseller mentor cohort roll-up", () => {
    expect(ROLE_GUIDING_COPY.mentor.next_step_recommender.cta.href).toBe("/reseller/mentor/cohort");
  });
  it("accelerator CTA points at the accelerator workspace", () => {
    expect(ROLE_GUIDING_COPY.accelerator.next_step_recommender.cta.href).toBe("/workspace/accelerator");
  });
  it("innovator CTA points at the industry map", () => {
    expect(ROLE_GUIDING_COPY.innovator.next_step_recommender.cta.href).toBe("/innovator/industry-map");
  });
  it("reseller CTA points at the promo codes surface", () => {
    expect(ROLE_GUIDING_COPY.reseller.next_step_recommender.cta.href).toBe("/reseller/codes");
  });
});

describe("role-guiding-copy — cross-role uniqueness (guards against copy-paste drift)", () => {
  it("every role's landing hero title is unique across roles", () => {
    const titles = ALL_ROLES.map((r) => ROLE_GUIDING_COPY[r].landing_hero.title.en);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every role's next-step phrase is unique across roles", () => {
    const phrases = ALL_ROLES.map((r) => ROLE_GUIDING_COPY[r].next_step_recommender.phrase.en);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it("every role's CTA href is unique across roles", () => {
    const hrefs = ALL_ROLES.map((r) => ROLE_GUIDING_COPY[r].next_step_recommender.cta.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every role's CTA label EN is unique across roles", () => {
    const labels = ALL_ROLES.map((r) => ROLE_GUIDING_COPY[r].next_step_recommender.cta.label.en);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("role-guiding-copy — getRoleGuidingCopy()", () => {
  it.each(ALL_ROLES)("resolves %s to the ROLE_GUIDING_COPY entry by identity", (role) => {
    expect(getRoleGuidingCopy(role)).toBe(ROLE_GUIDING_COPY[role]);
  });

  it("returns undefined for an unknown role key", () => {
    expect(getRoleGuidingCopy("investor")).toBeUndefined();
    expect(getRoleGuidingCopy("lawyer")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getRoleGuidingCopy("")).toBeUndefined();
  });

  it("is case-sensitive — 'Founder' does not resolve", () => {
    expect(getRoleGuidingCopy("Founder")).toBeUndefined();
    expect(getRoleGuidingCopy("FOUNDER")).toBeUndefined();
  });
});
