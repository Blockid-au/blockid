// Unit tests for the consolidated role taxonomy.
//
// Asserts the structural invariants every downstream consumer relies on:
//   • Every declared ROLE has a matching ROLE_SPECS entry with the same key.
//   • Every landingHref is a rooted path (starts with '/').
//   • Every menuGroupIds list is non-empty and starts with "home" so the
//     sidebar always has at least one always-open pillar.
//   • Every tourSlug is a non-empty string (registered slugs are validated
//     separately in the feature-tours test — the taxonomy layer only asserts
//     the field is populated).
//   • getRoleSpec / listRoleSpecs behave.

import { describe, it, expect } from "vitest";
import {
  ROLES,
  ROLE_SPECS,
  listRoleSpecs,
  getRoleSpec,
} from "@/lib/roles/role-taxonomy";

describe("role-taxonomy", () => {
  it("has a spec for every declared role", () => {
    for (const role of ROLES) {
      expect(ROLE_SPECS[role]).toBeDefined();
      expect(ROLE_SPECS[role].key).toBe(role);
    }
  });

  it("declares a non-empty menuGroupIds list starting with 'home' for every role", () => {
    for (const spec of listRoleSpecs()) {
      expect(Array.isArray(spec.menuGroupIds)).toBe(true);
      expect(spec.menuGroupIds.length).toBeGreaterThan(0);
      expect(spec.menuGroupIds[0]).toBe("home");
    }
  });

  it("uses a rooted landingHref for every role", () => {
    for (const spec of listRoleSpecs()) {
      expect(typeof spec.landingHref).toBe("string");
      expect(spec.landingHref.startsWith("/")).toBe(true);
    }
  });

  it("declares a tourSlug for every role", () => {
    for (const spec of listRoleSpecs()) {
      expect(typeof spec.tourSlug).toBe("string");
      expect(spec.tourSlug.length).toBeGreaterThan(0);
    }
  });

  it("declares a human-readable label for every role", () => {
    for (const spec of listRoleSpecs()) {
      expect(typeof spec.label).toBe("string");
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the innovator role (new in phase role-based-2026-07-25)", () => {
    expect(ROLE_SPECS.innovator).toBeDefined();
    expect(ROLE_SPECS.innovator.landingHref).toBe("/innovator");
  });

  it("listRoleSpecs returns specs in declared ROLES order", () => {
    const specs = listRoleSpecs();
    expect(specs.map((s) => s.key)).toEqual([...ROLES]);
  });

  it("getRoleSpec resolves known keys and rejects unknown ones", () => {
    expect(getRoleSpec("founder")?.key).toBe("founder");
    expect(getRoleSpec("innovator")?.key).toBe("innovator");
    expect(getRoleSpec("not-a-role")).toBeUndefined();
    expect(getRoleSpec("")).toBeUndefined();
  });
});
