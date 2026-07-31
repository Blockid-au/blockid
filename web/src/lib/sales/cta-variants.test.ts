import { describe, expect, it } from "vitest";

import {
  CTA_SURFACES,
  SVI_PHASES,
  allCtaKeys,
  getCtaVariant,
  type CtaSurface,
  type CtaTone,
  type CtaVariant,
  type SviPhase,
} from "./cta-variants";

// The CTA table is the single source of truth stitching the sticky CTA,
// marketing hero, and paywall modal together. Silent drift — a renamed
// phase, a missing surface row, a stray external href — breaks A/B copy
// swaps and leaks paid campaigns to unlisted routes. Pin the invariants.

// ─── enum shapes ────────────────────────────────────────────────────────

describe("SVI_PHASES", () => {
  it("carries the 6 SVI marketing phases in canonical order", () => {
    expect(SVI_PHASES).toEqual([
      "vision",
      "validation",
      "traction",
      "growth",
      "fundraising",
      "scale",
    ]);
  });

  it("has no duplicate phase keys", () => {
    expect(new Set(SVI_PHASES).size).toBe(SVI_PHASES.length);
  });

  it("carries six distinct string phase keys", () => {
    expect(SVI_PHASES.length).toBe(6);
    for (const p of SVI_PHASES) expect(typeof p).toBe("string");
  });
});

describe("CTA_SURFACES", () => {
  it("exposes the three shipped marketing surfaces", () => {
    expect(CTA_SURFACES).toEqual(["pricing", "founding50", "landing"]);
  });

  it("has no duplicate surface keys", () => {
    expect(new Set(CTA_SURFACES).size).toBe(CTA_SURFACES.length);
  });

  it("carries three distinct string surface keys", () => {
    expect(CTA_SURFACES.length).toBe(3);
    for (const s of CTA_SURFACES) expect(typeof s).toBe("string");
  });
});

// ─── allCtaKeys ─────────────────────────────────────────────────────────

describe("allCtaKeys", () => {
  it("emits phases × surfaces == 18 combinations", () => {
    expect(allCtaKeys()).toHaveLength(
      SVI_PHASES.length * CTA_SURFACES.length,
    );
  });

  it("returns every (phase, surface) pair exactly once", () => {
    const keys = allCtaKeys().map((k) => `${k.phase}:${k.surface}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("emits phases in outer-loop order (vision first, scale last)", () => {
    const keys = allCtaKeys();
    expect(keys[0]).toEqual({ phase: "vision", surface: "pricing" });
    expect(keys[keys.length - 1]).toEqual({
      phase: "scale",
      surface: "landing",
    });
  });

  it("returns a fresh array each call (no shared mutable state)", () => {
    const a = allCtaKeys();
    const b = allCtaKeys();
    expect(a).not.toBe(b);
    a.length = 0;
    expect(allCtaKeys()).toHaveLength(
      SVI_PHASES.length * CTA_SURFACES.length,
    );
  });
});

// ─── getCtaVariant — table completeness ─────────────────────────────────

describe("getCtaVariant — table completeness", () => {
  it("resolves a variant for every (phase, surface) pair", () => {
    for (const { phase, surface } of allCtaKeys()) {
      const v = getCtaVariant(phase, surface);
      expect(v, `${phase}:${surface}`).toBeTruthy();
      expect(typeof v.label).toBe("string");
      expect(v.label.length).toBeGreaterThan(0);
    }
  });

  it("returns an href starting with '/' on every row (no external links leak)", () => {
    for (const { phase, surface } of allCtaKeys()) {
      const v = getCtaVariant(phase, surface);
      expect(v.href.startsWith("/"), `${phase}:${surface} → ${v.href}`).toBe(
        true,
      );
    }
  });

  it("uses only the three allowed tone tokens", () => {
    const allowed: readonly CtaTone[] = ["accent", "amber", "emerald"];
    for (const { phase, surface } of allCtaKeys()) {
      expect(allowed).toContain(getCtaVariant(phase, surface).tone);
    }
  });

  it("keeps every subtext (when present) under 80 chars — sticky CTA desktop budget", () => {
    for (const { phase, surface } of allCtaKeys()) {
      const v = getCtaVariant(phase, surface);
      if (v.subtext !== undefined) {
        expect(typeof v.subtext).toBe("string");
        expect(
          v.subtext.length,
          `${phase}:${surface} subtext too long: "${v.subtext}"`,
        ).toBeLessThanOrEqual(80);
      }
    }
  });

  it("returns the same object reference on repeated lookups (table is not cloned per call)", () => {
    const a = getCtaVariant("vision", "pricing");
    const b = getCtaVariant("vision", "pricing");
    expect(a).toBe(b);
  });
});

// ─── getCtaVariant — anchor rows (guard against silent copy drift) ──────

describe("getCtaVariant — anchor rows", () => {
  it("vision:pricing sends a first-timer to /signup?plan=free", () => {
    const v = getCtaVariant("vision", "pricing");
    expect(v.href).toContain("plan=free");
    expect(v.href).toContain("from=pricing");
    expect(v.tone).toBe("accent");
    expect(v.subtext).toMatch(/no card/i);
  });

  it("founding50 rows across every phase point at /founding-50 or /pricing (never external)", () => {
    for (const phase of SVI_PHASES) {
      const v = getCtaVariant(phase, "founding50");
      expect(v.href).toMatch(/^\/(founding-50|pricing)/);
    }
  });

  it("growth + scale funnel through the /contact intent router (not self-serve signup)", () => {
    expect(getCtaVariant("growth", "pricing").href).toContain(
      "/contact?intent=",
    );
    expect(getCtaVariant("growth", "landing").href).toContain(
      "/contact?intent=",
    );
    expect(getCtaVariant("scale", "pricing").href).toContain(
      "/contact?intent=",
    );
    expect(getCtaVariant("scale", "landing").href).toContain(
      "/contact?intent=",
    );
  });

  it("fundraising trial URLs all opt into plan=investor-pro with trial=1", () => {
    for (const surface of ["pricing", "landing"] as const) {
      const v = getCtaVariant("fundraising", surface);
      expect(v.href).toContain("plan=investor-pro");
      expect(v.href).toContain("trial=1");
    }
  });

  it("validation surfaces gate on a 7-day trial (card-required copy)", () => {
    for (const surface of ["pricing", "landing"] as const) {
      const v = getCtaVariant("validation", surface);
      expect(v.label).toMatch(/7-day/i);
      expect(v.href).toContain("trial=1");
    }
  });
});

// ─── getCtaVariant — defensive fallback ─────────────────────────────────

describe("getCtaVariant — defensive fallback", () => {
  it("falls back to validation:<surface> when the phase is not in the table", () => {
    const fallback = getCtaVariant(
      "unknown" as SviPhase,
      "pricing",
    );
    // Anchor: the validation:pricing row is the fallback safety net.
    expect(fallback).toEqual<CtaVariant>(getCtaVariant("validation", "pricing"));
  });

  it("routes the fallback per requested surface (fallback is per-surface, not global)", () => {
    const a = getCtaVariant("unknown" as SviPhase, "landing");
    const b = getCtaVariant("unknown" as SviPhase, "founding50");
    expect(a).toBe(getCtaVariant("validation", "landing"));
    expect(b).toBe(getCtaVariant("validation", "founding50"));
    expect(a).not.toBe(b);
  });
});

// ─── type-level guardrails ──────────────────────────────────────────────

describe("type guardrails", () => {
  it("SviPhase values are all present in the SVI_PHASES tuple", () => {
    const asPhaseArray: readonly SviPhase[] = SVI_PHASES;
    expect(asPhaseArray).toContain<SviPhase>("vision");
    expect(asPhaseArray).toContain<SviPhase>("scale");
  });

  it("CtaSurface values are all present in the CTA_SURFACES tuple", () => {
    const asSurfaceArray: readonly CtaSurface[] = CTA_SURFACES;
    expect(asSurfaceArray).toContain<CtaSurface>("pricing");
    expect(asSurfaceArray).toContain<CtaSurface>("founding50");
    expect(asSurfaceArray).toContain<CtaSurface>("landing");
  });
});
