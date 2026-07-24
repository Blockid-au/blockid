import { describe, expect, it } from "vitest";
import {
  CTA_SURFACES,
  SVI_PHASES,
  allCtaKeys,
  getCtaVariant,
  type CtaSurface,
  type SviPhase,
} from "@/lib/sales/cta-variants";

// Table-driven coverage — one assertion block per (phase, surface) pair.
// Ensures every branch of getCtaVariant() produces a usable CTA.
describe("getCtaVariant", () => {
  const cases = allCtaKeys();

  it("enumerates every phase × surface pair exactly once", () => {
    expect(cases.length).toBe(SVI_PHASES.length * CTA_SURFACES.length);
    const seen = new Set(cases.map((c) => `${c.phase}:${c.surface}`));
    expect(seen.size).toBe(cases.length);
  });

  it.each(cases)(
    "returns a non-empty label and internal href for %s",
    ({ phase, surface }: { phase: SviPhase; surface: CtaSurface }) => {
      const variant = getCtaVariant(phase, surface);
      expect(variant).toBeDefined();
      expect(typeof variant.label).toBe("string");
      expect(variant.label.trim().length).toBeGreaterThan(0);
      expect(variant.href.startsWith("/")).toBe(true);
      expect(["accent", "amber", "emerald"]).toContain(variant.tone);
      if (variant.subtext !== undefined) {
        expect(variant.subtext.length).toBeGreaterThan(0);
      }
    },
  );

  it("falls back to validation:<surface> for an unknown phase", () => {
    // Bypass the type system to prove the runtime guard.
    const bad = getCtaVariant("nope" as unknown as SviPhase, "pricing");
    expect(bad.label.length).toBeGreaterThan(0);
    expect(bad.href.startsWith("/")).toBe(true);
  });
});
